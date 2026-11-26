import { createBungalowStory } from './bungalow-story.ts';
// The walk up to the forest bungalow: how far you've come, the wolves and the herd, your torch,
// the sounds of the forest, the guard, the cook's note, arriving, and the story told as you go.
import { BUNGALOW, NOTE_AT } from './bungalow.ts';
import { onBridge } from './bridge.ts';
import type { Cover } from './cover.ts';
import { createDanger } from './danger.ts';
import { GLADE, INTEREST, SHRINES, type Interest } from './jungle.ts';
import { RIVER, riverLevel, riverLocal, riverPoint } from './river.ts';
import type { createSound } from './sound.ts';
import { COOK_NOTE, createStory, DOWN_TEXT, GUARD_LINES, REST_TEXT, type StoryEvent } from './story.ts';
import { heightAt } from './terrain.ts';
import { TRAIL_LENGTH, trailAt, trailNear } from './trail.ts';
import { createUnease, type UneaseHooks } from './unease.ts';
import type { createWalker } from './walk.ts';

type V3 = [number, number, number];

/**
 * One frame, as every subsystem sees it. The scene fills the same object in place each frame,
 * after the view has moved, so anything holding on to it reads the current frame.
 */
export interface Tick {
  /** The night's clock (runs at `timeScale`), and this frame's step of it. */
  seconds: number;
  dt: number;
  /** The eye, and the unit direction it looks. */
  eye: V3;
  fwd: V3;
  /** The view's yaw. */
  yaw: number;
  /** Where the walker stands. */
  x: number;
  z: number;
}

export interface JourneyDeps {
  walker: ReturnType<typeof createWalker>;
  people: { guard: { gone: boolean; at: V3 } };
  sound: ReturnType<typeof createSound>;
  eyes: UneaseHooks['eyes'];
  cover: Cover;
  view: { goal: { yaw: number; pitch: number } };
  /** Runs `run` after `seconds` on the night's clock (the scene runs what's due just before `step`). */
  later(seconds: number, run: () => void): void;
  /** The moon's fog density, and setting it. */
  fog: { base: number; set(density: number): void };
  /** Places and lights your own torch. */
  torchLamp(px: number, py: number, pz: number, ax: number, ay: number, az: number, intensity: number): void;
  /** Poses the beasts once danger has moved them. */
  beasts(t: Tick): void;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Inside this radius you're in town: the wolves don't come. */
const TOWN_R = 130;
const BUNGALOW_SAFE = 30;
const ARRIVE_R = 8;
const NOTE_R = 2.2;
const GUARD_TALK_R = 3.2;
const GUARD_LINE_PERIOD = 40;
const TORCH_ON = 0.3;
const BUNGALOW_FRONT = [BUNGALOW.x + Math.sin(BUNGALOW.yaw) * 8, BUNGALOW.z + Math.cos(BUNGALOW.yaw) * 8] as const;

/** The stretch of path seen from his chair where the light walks at the end: going down toward the river. */
const FAR_FROM = 905;
const FAR_TO = 870;
/** The lantern far down the hill at the end, `sat` seconds after sitting: xyz and brightness. */
export const farLanternAt = (sat: number): [number, number, number, number] => {
  // Coming into view, walking down toward the river, stopping; then gone
  if (sat < 2) return [0, -999, 0, 0];
  const k = Math.min(1, (sat - 2) / 13);
  const p = trailAt(FAR_FROM + (FAR_TO - FAR_FROM) * k);
  const swing = sat < 15 ? Math.sin(sat * 3.4) * 0.15 : 0;
  let w = 16 * Math.min(1, (sat - 2) / 2) * (0.9 + Math.sin(sat * 11) * 0.06);
  if (sat > 22) w *= Math.max(0, 1 - (sat - 22) / 1.2);
  return [p.x, heightAt(p.x, p.z) + 0.7 + swing * 0.2, p.z, w];
};

type Say = ((text: string, seconds: number) => void) | null;

export function createJourney({ walker, people, sound, eyes, cover, view, later, fog, torchLamp, beasts }: JourneyDeps) {
  const state = { furthest: 0, deep: 0, torch: 0, torchOff: false, hidden: false, arrived: false, near: null as Interest | null, wind: [0, 1] as [number, number], noteRead: false, reading: false, arrivedAt: -99, metHerd: false, darkFor: 0, ended: false, downs: 0, alertUntil: 0 };
  /** What the page shows: index.ts sets these. */
  const hud = { onArrive: null as (() => void) | null, onSay: null as Say, onDown: null as (() => void) | null, onTell: null as Say, onEnd: null as (() => void) | null };
  /** The last frame's tick; before the first, a still one at the origin. */
  let tk: Tick = { seconds: 0, dt: 0, eye: [0, 0, 0], fwd: [0, 0, -1], yaw: 0, x: 0, z: 0 };
  /** Seconds to the next howl, once you're in among the trees. */
  let howlIn = 30 + Math.random() * 40;
  let replyIn = -1;
  let fogNow = fog.base;
  const farOff = (): V3 => {
    const a = Math.random() * Math.PI * 2;
    const d = 380 + Math.random() * 300;
    const hx = tk.eye[0] + Math.sin(a) * d;
    const hz = tk.eye[2] + Math.cos(a) * d;
    return [hx, heightAt(hx, hz) + 25, hz];
  };
  const unease = createUnease({ sound, eyes, later });
  const aloft = (x: number, z: number) => cover.aloft(x, z, tk.eye[1] - 0.8);

  // ---- the story of the walk, told as you go
  const story = createStory({
    tell: (text, secs) => hud.onTell?.(text, secs),
    guardGone: () => {
      people.guard.gone = true;
    },
    end: () => {
      state.ended = true;
      hud.onEnd?.();
    },
  });
  const storyMark = (e: StoryEvent) => story.mark(e);
  /** Seconds left lying in the dark after going down: nothing hunts you meanwhile. */
  let downFor = 0;
  const danger = createDanger(GLADE, {
    cover: cover.inCover,
    mark: storyMark,
    safe: (x, z) => cover.atShrine(x, z) || aloft(x, z) || (!people.guard.gone && Math.hypot(x - people.guard.at[0], z - people.guard.at[2]) < 9) || Math.hypot(x, z) < TOWN_R || Math.hypot(x - BUNGALOW.x, z - BUNGALOW.z) < BUNGALOW_SAFE,
    wild: (x, z) => {
      // The cheap tests first: most of the time this is town, or the bungalow
      if (!(state.deep > 0.5 && !state.arrived)) return false;
      const n = trailNear(x, z, 30);
      return n.along > 230 && n.along < TRAIL_LENGTH - 50 && Math.hypot(x - GLADE.x, z - GLADE.z) > 70;
    },
    say: (text, showFor = 6) => {
      // The story waits while this is up
      state.alertUntil = tk.seconds + showFor;
      hud.onSay?.(text, showFor);
    },
    sound,
    shove: (vx, vz) => walker.shove(vx, vz),
    down: () => {
      // You come to by the last shrine you passed, or back at the start of the path
      const along = trailNear(walker.at[0], walker.at[1], 40).along;
      const back = [...SHRINES].reverse().find((sh) => sh.along <= along);
      const p = trailAt(back ? back.along : 8);
      state.downs++;
      hud.onDown?.();
      // Dark for a moment, then awake by the shrine; the story says what happened, in its own turn
      downFor = 1.4;
      later(1.4, () => walker.moveTo(p.x, p.z, p.heading + Math.PI, true));
      later(3.4, () => story.tellNow(DOWN_TEXT, 8));
    },
  });

  let guardTalks = 0;
  let guardLine: { at: number; text: string } | null = null;
  let creakIn = 1;
  const bungalow = createBungalowStory(() => story.sit());

  /** How far into the trees, the story's own pace, the wind. */
  const progress = (t: Tick) => {
    const { dt, x, z, seconds } = t;
    const near = trailNear(x, z, 30);
    if (near.distance < 25) state.furthest = Math.max(state.furthest, near.along);
    // How far into the trees: along the path, or just how far out of town
    const along = near.distance < 30 ? near.along : 0;
    const goal = Math.max(smooth(90, 240, along) * (1 - smooth(TRAIL_LENGTH - 40, TRAIL_LENGTH - 5, along) * 0.6), smooth(TOWN_R, 200, Math.hypot(x, z)) * 0.5);
    state.deep += (goal - state.deep) * Math.min(1, dt * 0.5);
    sound.forest = state.deep;
    // The crickets fall silent round a big animal: the forest's own warning that the herd is near
    if (danger.herd.some((e) => e.on && Math.hypot(e.x - x, e.z - z) < 26)) {
      sound.hush(1.5);
      storyMark('hush');
      state.metHerd = true;
    }
    // Past the herd, unhurt: something learned
    if (state.metHerd && near.distance < 20 && near.along > GLADE.along + 45 && Math.hypot(x - GLADE.x, z - GLADE.z) > 45) storyMark('herdPassed');
    // Walking in the dark with your torch off, deep in the trees
    state.darkFor = state.torchOff && state.deep > 0.5 && walker.pace > 0.4 ? state.darkFor + dt : 0;
    if (state.darkFor > 14) storyMark('dark');
    // The wind, turning slowly through the night
    const wa = 0.8 + Math.sin(seconds * 0.011) * 1.6 + Math.sin(seconds * 0.037 + 2) * 0.5;
    state.wind = [Math.sin(wa), Math.cos(wa)];
    story.update(dt, { along: state.furthest, moving: walker.moving || walker.pace > 0.3, busy: danger.hunting || danger.alarm > 0.45 || state.reading || seconds < state.alertUntil || seconds - state.arrivedAt < 9 });
  };

  /** The bridge, the river, the far wolves, the air. */
  const ambience = (t: Tick) => {
    const { dt, x, z } = t;
    // The bridge creaking under you as you cross
    if (onBridge(x, z) && walker.pace > 0.4) {
      if ((creakIn -= dt * walker.pace) < 0) {
        sound.creak([x, t.eye[1] - 1.5, z], 0.12 + Math.random() * 0.12);
        creakIn = 1.2 + Math.random() * 2.4;
      }
    }
    // The river, heard from its nearest stretch
    const rl = riverLocal(x, z);
    if (Math.abs(rl.s) < RIVER.length && Math.abs(rl.v) < 90) {
      const s = Math.max(-RIVER.length, Math.min(RIVER.length, rl.s));
      const [rx, rz] = riverPoint(s);
      sound.river = [rx, riverLevel(s) + 0.3, rz];
    } else sound.river = null;
    // A wolf, now and then, somewhere far off in the hills; sometimes another answers
    if (state.deep > 0.35 && !state.arrived) {
      howlIn -= dt;
      if (howlIn < 0) {
        sound.howl(farOff(), 0.55 + Math.random() * 0.25);
        storyMark('howl');
        howlIn = 55 + Math.random() * 95;
        if (Math.random() < 0.35) replyIn = 4 + Math.random() * 5;
      }
      if (replyIn > 0) {
        replyIn -= dt;
        if (replyIn <= 0) sound.howl(farOff(), 0.4 + Math.random() * 0.2);
      }
    }
    // The air clears a little up in the forest, so the views carry
    const fogWant = fog.base * (1 - state.deep * 0.6);
    if (Math.abs(fogWant - fogNow) > 0.0002) {
      fogNow = fogWant;
      fog.set(fogNow);
    }
  };

  /** Something here worth a closer look? */
  const pickInterest = (t: Tick, up: boolean) => {
    const { x, z, seconds } = t;
    let spot: Interest | null = null;
    let best = Infinity;
    for (const it of INTEREST) {
      const dd = Math.hypot(x - it.x, z - it.z);
      if (dd < it.r && dd < best) {
        best = dd;
        spot = it;
      }
    }
    // The guard, if you've caught him up
    const gd = people.guard;
    if (!gd.gone && Math.hypot(x - gd.at[0], z - gd.at[2]) < GUARD_TALK_R) {
      const at = Math.floor(seconds / GUARD_LINE_PERIOD);
      if (!guardLine || guardLine.at !== at) guardLine = { at, text: GUARD_LINES[guardTalks++ % GUARD_LINES.length]! };
      spot = { x: gd.at[0], z: gd.at[2], r: GUARD_TALK_R, low: false, label: 'Talk', text: guardLine.text };
    }
    if (up) spot = { x, z, r: 3, low: false, sit: true, label: 'Sit and rest', text: REST_TEXT };
    // Once you've read the note, and put it down or stepped back: his chair
    bungalow.update(seconds, state.reading);
    state.noteRead = bungalow.noteRead;
    if (Math.hypot(x - NOTE_AT.x, z - NOTE_AT.z) < NOTE_R) {
      if (!state.noteRead) spot = { id: 'bungalow.note', x: NOTE_AT.x, z: NOTE_AT.z, r: NOTE_R, low: false, label: 'Read the note', text: COOK_NOTE };
      else if (!story.ended) spot = { id: 'bungalow.chair', x: NOTE_AT.x, z: NOTE_AT.z, r: NOTE_R, low: false, sit: true, label: 'Sit in his chair', text: ' ' };
    }
    state.near = spot;
  };

  /** The torch in your hand, at the hip, pointing where you look. */
  const torch = (t: Tick) => {
    const { dt, seconds, eye, yaw } = t;
    const [fx, fy, fz] = t.fwd;
    const want = walker.mode !== 'above' && !state.torchOff ? smooth(0.25, 0.6, state.deep) : 0;
    state.torch += (want - state.torch) * Math.min(1, dt * 2);
    const sway = Math.sin(seconds * 1.7) * 0.015;
    const falter = unease.step(t, state);
    torchLamp(eye[0] + fx * 0.3 + Math.cos(yaw) * 0.22, eye[1] - 0.45, eye[2] + fz * 0.3 - Math.sin(yaw) * 0.22, fx + sway, fy - 0.12, fz - sway, state.torch * 4.5 * falter);
  };

  const step = (t: Tick) => {
    tk = t;
    const { dt, x, z, seconds } = t;
    downFor = Math.max(0, downFor - dt);
    progress(t);
    ambience(t);
    const up = aloft(x, z);
    pickInterest(t, up);
    torch(t);
    const [fx, , fz] = t.fwd;
    const fl = Math.hypot(fx, fz) || 1;
    const seen = danger.update(walker.mode === 'walk' && downFor === 0 ? dt : 0, { x, z, crouching: walker.sneaking || walker.crouching, running: walker.running && walker.pace > 2.6, pace: walker.pace, torch: state.torch > TORCH_ON, aloft: up, fx: fx / fl, fz: fz / fl, wx: state.wind[0], wz: state.wind[1] });
    state.hidden = seen.hidden;
    beasts(t);
    // Your own breath after a run, and your heart when you're hurt
    sound.body(dt, walker.winded ? 1 : Math.max(0, Math.min(1, (0.7 - walker.stamina) * 1.6)), danger.health < 0.4 ? (0.4 - danger.health) / 0.4 : danger.threat && danger.hunting ? 0.25 : 0);
    // Arriving: the bungalow's steps
    if (!state.arrived && Math.hypot(x - BUNGALOW_FRONT[0], z - BUNGALOW_FRONT[1]) < ARRIVE_R) {
      state.arrived = true;
      state.arrivedAt = seconds;
      hud.onArrive?.();
    }
  };

  /** What the page reads and sets (index.ts). */
  const api = {
    get furthest() {
      return state.furthest;
    },
    length: TRAIL_LENGTH,
    set onArrive(fn: (() => void) | null) {
      hud.onArrive = fn;
    },
    /** Something close by worth bending down or stopping to look at, or null. */
    get near() {
      return state.near;
    },
    get health() {
      return danger.health;
    },
    get sinceHurt() {
      return danger.sinceHurt;
    },
    get threat() {
      return danger.threat;
    },
    get hidden() {
      return state.hidden;
    },
    get torchOn() {
      return !state.torchOff;
    },
    toggleTorch() {
      state.torchOff = !state.torchOff;
    },
    set onSay(fn: Say) {
      hud.onSay = fn;
    },
    set onDown(fn: (() => void) | null) {
      hud.onDown = fn;
    },
    /** Whether you're reading something close up: the story waits. */
    set reading(v: boolean) {
      state.reading = v;
    },
    /** A line of the story to show. */
    set onTell(fn: Say) {
      hud.onTell = fn;
    },
    /** The walk is over. */
    set onEnd(fn: (() => void) | null) {
      hud.onEnd = fn;
    },
    /** Which way the wind blows, flat. */
    get wind(): readonly [number, number] {
      return state.wind;
    },
    /** How near you are to facing the red dogs down, 0 to 1. */
    get holding() {
      return danger.holding;
    },
    /** You've looked at, read or sat at `it`. */
    examined(it: Interest) {
      if (it.id && bungalow.examine(it.id, tk.seconds) && it.id === 'bungalow.chair') {
        // Sitting where he sat, looking out the way he looked: off the veranda, down the hill
        const far = trailAt(FAR_FROM);
        view.goal.yaw = Math.atan2(-(far.x - tk.eye[0]), -(far.z - tk.eye[2])) + 0.1;
        view.goal.pitch = 0.07;
      } else if (it.text === REST_TEXT) storyMark('rested');
    },
  };

  return { state, step, story, danger, api };
}
