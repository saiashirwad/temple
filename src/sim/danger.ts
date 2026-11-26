// What can hurt you out there: a pack of dholes (red dogs, chennaya; the town calls them wolves)
// that comes hunting now and then, and the herd feeding in the glade beside the path. You can't
// fight either. Before the pack has found you, you can hide: crouch in cover. Once it has, hiding
// is no use; they hunt as dholes do, testing from the front and biting from behind, and what
// works is what works with real ones: don't run, turn to face them, light in their eyes, stand
// tall, put your back to a tree or a rock. Hold them like that and they lose heart and go. Or
// reach a shrine lamp, a machan, or the watcher. Past the elephants you creep: slow, low, torch
// off, and with the wind in your face, because they smell far better than they see.

import { heightAt } from '../world/terrain.ts';
import type { V3 } from '../render/geo.ts';
import { approach, between, clamp, facingCos, hypot2, stepFixed, toward, wrap } from '../math/math.ts';
import { TUNING } from '../content/tuning.ts';

const M = TUNING.move;
const D = TUNING.dholes;
const DC = D.coming;
const DS = D.searching;
const DA = D.attack;
const DL = D.leaving;
const H = TUNING.herd;
const HS = H.sense;
const HA = H.alarm;
const HC = H.charge;
const P = TUNING.player;

export interface Player {
  x: number;
  z: number;
  crouching: boolean;
  running: boolean;
  /** Metres a second over the ground. */
  pace: number;
  torch: boolean;
  /** Up on a machan, out of reach. */
  aloft: boolean;
  /** Which way the torch points, flat. */
  fx: number;
  fz: number;
  /** Which way the wind is blowing, flat and unit length. */
  wx: number;
  wz: number;
}

export interface Hooks {
  /** Whether x, z is in cover a crouching person could hide in. */
  cover(x: number, z: number): boolean;
  /** Whether x, z is safe: by a shrine's lamp, or out of the forest. */
  safe(x: number, z: number): boolean;
  /** Whether the wolves may come hunting at x, z: deep in the forest, away from the herd. */
  wild(x: number, z: number): boolean;
  say(text: string, seconds?: number): void;
  /** Something happened worth remembering: for the story. */
  mark(event: 'pack' | 'stood' | 'hid' | 'bitten' | 'scented' | 'charge' | 'trampled'): void;
  sound: {
    whistle(at: V3, gain?: number): void;
    yap(at: V3, gain?: number): void;
    howl(at: V3, gain: number): void;
    growl(at: V3, gain?: number): void;
    bite(at: V3): void;
    trumpet(at: V3, long?: boolean): void;
    rumble(at: V3): void;
    thud(at: V3, gain?: number): void;
    /** The jungle's alarm (a barking deer, the monkeys) from near something big. */
    alarm?(at: V3): void;
  };
  /** Knocks the walker back along vx, vz. */
  shove(vx: number, vz: number): void;
  /** You've gone down: put the walker back somewhere safe. */
  down(): void;
}

export interface Beast {
  x: number;
  z: number;
  yaw: number;
  /** How fast it's moving, for the gait. */
  speed: number;
  /** How far through its stride. */
  phase: number;
  /** Shown in the world. */
  on: boolean;
  /** For an elephant: how high its head is up, 0 feeding to 1 alert. */
  alert: number;
}

type Glade = { x: number; z: number; r: number; facing: number };

/** Moves a beast toward x, z at up to `speed`, turning as it goes; returns the distance left. */
function steer(b: Beast, x: number, z: number, speed: number, dt: number, turn: number = M.turn) {
  const dx = x - b.x;
  const dz = z - b.z;
  const d = hypot2(dx, dz);
  const want = d > M.arrive ? Math.min(speed, d * M.brake) : 0;
  b.speed = approach(b.speed, want, M.accel, dt);

  if (d > M.arrive) b.yaw += wrap(Math.atan2(dx, dz) - b.yaw) * Math.min(1, dt * turn);
  b.x += Math.sin(b.yaw) * b.speed * dt;
  b.z += Math.cos(b.yaw) * b.speed * dt;

  return d;
}

/** `random` is swappable so tests can replay a night exactly. */
export function createDanger(glade: Glade, hooks: Hooks, random: () => number = Math.random) {
  const rand = (a: number, b: number) => between(random, a, b);
  const randIn = (r: readonly [number, number]) => between(random, r[0], r[1]);
  /** Set by summon(): the pack comes at once, from straight ahead, close. */
  let summoned = false;
  let health = 1;
  let hurtAt = -99;
  let clock = 0;
  const said = new Set<string>();

  const once = (key: string, text: string, seconds = 7) => {
    if (said.has(key)) return;
    said.add(key);
    hooks.say(text, seconds);
  };

  // ---- the pack
  type Wolf = Beast & { slot: number; lunge: number; back: number; feint: boolean };

  const wolves: Wolf[] = Array.from({ length: D.size[1] }, (_, i) => ({ x: 0, z: 0, yaw: 0, speed: 0, phase: random() * 6, on: false, alert: 0, slot: i, lunge: 0, back: 0, feint: false }));
  /** How long you've held them off, facing them; they give up at HOLD. */
  let nerve = 0;
  const HOLD = DA.hold;
  let whistleIn = 0;
  let pack: 'away' | 'coming' | 'searching' | 'attack' | 'leaving' = 'away';
  let packIn = randIn(D.firstIn);
  let packTime = 0;
  let nextLunge = 0;
  let growlIn = 0;
  let pass: [number, number] = [0, 0];
  let size: number = D.size[0];
  /** The second whistle, answering the first. On the sim clock, not a timer, so it can't outlive a respawn. */
  let answer: { in: number; at: V3 } | null = null;
  const live = () => wolves.slice(0, size);

  // ---- the herd: a cow, her sister and a calf, wandering about the glade
  type Elephant = Beast & { size: number; goal: [number, number]; wait: number };

  const herd: Elephant[] = H.sizes.map((s, i): Elephant => {
    const a = glade.facing + Math.PI + (i - 1) * H.spreadAngle;
    const x = glade.x + Math.sin(a) * H.spacing * i;
    const z = glade.z + Math.cos(a) * H.spacing * i;

    return { x, z, yaw: glade.facing + rand(-H.startYaw, H.startYaw), speed: 0, phase: 0, on: true, alert: 0, size: s, goal: [x, z], wait: randIn(H.firstWait) };
  });

  let alarm = 0;
  let warned = 0;
  let charge: { from: [number, number]; mock: boolean; t: number } | null = null;
  let thudIn = 0;

  const hurt = (amount: number, from: [number, number], p: Pick<Player, 'x' | 'z'>, push: number) => {
    health = Math.max(0, health - amount);
    hurtAt = clock;
    const [ux, uz] = toward(from[0], from[1], p.x, p.z);
    hooks.shove(ux * push, uz * push);

    if (health <= 0) knockOut();
  };

  /** Set when you go down this step: the rest of the step is skipped, nothing hits you again. */
  let downed = false;
  /** Set by startle(): the herd's alarm jumps to this on the next step. */
  let startled = 0;

  /** Everything after you've gone down: you wake somewhere safe, the night calm again. */
  const knockOut = () => {
    hooks.down();
    downed = true;
    health = P.afterDown;
    pack = 'away';
    packIn = randIn(D.afterDown);
    nerve = 0;
    nextLunge = 0;
    answer = null;
    alarm = 0;
    warned = 0;
    charge = null;

    for (const w of wolves) Object.assign(w, { on: false, lunge: 0, back: 0, speed: 0 });

    for (const e of herd) e.alert = 0;
  };

  /** One substep, no longer than TUNING.maxStep. */
  const step = (dt: number, p: Player) => {
    clock += dt;
    downed = false;
    const hidden = (p.crouching && !p.running && hooks.cover(p.x, p.z)) || hooks.safe(p.x, p.z);
    const at = (b: Beast, up = 0.6): V3 => [b.x, heightAt(b.x, b.z) + up, b.z];

    // ---- wolves
    packTime += dt;

    if (answer && (answer.in -= dt) <= 0) {
      hooks.sound.whistle(answer.at, 0.7);
      answer = null;
    }

    if (pack === 'away') {
      if (summoned || hooks.wild(p.x, p.z)) packIn -= dt;

      if (packIn < 0 && (summoned || !hooks.safe(p.x, p.z))) {
        // A howl close by, then another answering: they've got your scent
        size = random() < D.smallChance ? D.size[0] : D.size[1];
        const a = summoned ? Math.atan2(p.fx, p.fz) : Math.atan2(-p.fx, -p.fz) + rand(-D.fromBehind, D.fromBehind);
        const cx = p.x + Math.sin(a) * (summoned ? D.summonDist : D.spawnDist);
        const cz = p.z + Math.cos(a) * (summoned ? D.summonDist : D.spawnDist);
        summoned = false;
        live().forEach((w, i) => {
          w.x = cx + rand(-D.scatter, D.scatter) + i;
          w.z = cz + rand(-D.scatter, D.scatter);
          w.yaw = Math.atan2(p.x - w.x, p.z - w.z);
          w.speed = 0;
          w.on = true;
          w.lunge = 0;
        });
        // Not a howl: whistles, the pack calling itself together, then another answering
        hooks.sound.whistle([cx, heightAt(cx, cz) + 1, cz], 0.9);
        answer = { in: D.answerIn, at: [cx + D.answerOffset[0], heightAt(cx, cz) + 1, cz + D.answerOffset[1]] };
        hooks.say(
          said.has('wolves')
            ? 'Whistles. The red dogs. Hide now, before they find you.'
            : 'Whistling in the dark, close: red dogs, a pack, and they have your scent. Hide now: crouch (C) in cover, by a rock, a big tree or a thicket. If they find you, do not run.',
          said.has('wolves') ? 4 : 10,
        );
        said.add('wolves');
        hooks.mark('pack');
        nerve = 0;
        pack = 'coming';
        packTime = 0;
      }
    } else {
      const c = live().reduce((s, w) => [s[0] + w.x / size, s[1] + w.z / size], [0, 0]);
      const dist = hypot2(c[0] - p.x, c[1] - p.z);
      growlIn -= dt;

      if (pack === 'coming') {
        // At a trot, nose down, in a loose line
        // Trotting in on the scent, then slowing to a stalk and fanning out as they get close
        const stalk = dist < DC.stalkDist;
        live().forEach((w, i) => {
          const side = (i - (size - 1) / 2) * (stalk ? DC.spacingStalk : DC.spacingTrot);
          const [ux, uz] = toward(w.x, w.z, p.x, p.z);
          steer(w, p.x + -uz * side, p.z + ux * side, stalk ? DC.stalk : DC.trot, dt);
        });
        whistleIn -= dt;

        if (whistleIn < 0) {
          whistleIn = randIn(DC.whistleEvery);
          hooks.sound.whistle(at(live()[Math.floor(random() * size)]!, 0.6), 0.45);
        }

        if (dist < DC.noticeDist) {
          if (hidden) {
            // They haven't seen you: they'll pass by, a little off to one side, and sniff about
            const [ux, uz] = toward(c[0], c[1], p.x, p.z);
            const s = random() < 0.5 ? 1 : -1;
            pass = [p.x + ux * DC.passBeyond + -uz * s * DC.passSide, p.z + uz * DC.passBeyond + ux * s * DC.passSide];
            pack = 'searching';
            packTime = 0;
          } else {
            pack = 'attack';
            packTime = 0;
            nextLunge = DA.firstLunge;
            nerve = 0;
            hooks.sound.yap(at(live()[0]!), 0.7);
            hooks.sound.growl(at(live()[0]!), 0.6);
          }
        }

        if (packTime > DC.giveUp) pack = 'leaving';
      } else if (pack === 'searching') {
        live().forEach((w, i) => {
          const sniff = Math.sin(clock * DS.sniffRate + i * DS.sniffPhase) * DS.sniffAmp;
          steer(w, pass[0] + sniff + i * DS.spacing, pass[1] - sniff, DS.speed, dt, DS.turn);
        });

        if (growlIn < 0 && dist < DS.growlDist) {
          growlIn = randIn(DS.growlEvery);
          hooks.sound.growl(at(live()[Math.floor(random() * size)]!), 0.35);
        }

        // Up and about while they're close: they see you
        const nearest = Math.min(...live().map((w) => hypot2(w.x - p.x, w.z - p.z)));

        if (!hidden && nearest < DS.seeDist) {
          pack = 'attack';
          packTime = 0;
          nextLunge = DA.firstLungeSeen;
          nerve = 0;
          hooks.sound.yap(at(live()[0]!), 0.7);
        } else if (packTime > DS.giveUp) {
          pack = 'leaving';
          hooks.mark('hid');
        }
      } else if (pack === 'attack') {
        // They have you. Dholes hunt by wearing you down: they ring you, one tests you from the
        // front while another comes in from behind. Face one, the others work round.
        const inView = (w: Wolf) => facingCos(w.x - p.x, w.z - p.z, p.fx, p.fz) > DA.viewCos;
        const tall = !p.crouching && !p.running && p.pace < DA.tallPace;
        const facing = live().some(inView);

        // Held off: standing tall, facing them, the light in their eyes; braver with your back to
        // a tree or a rock. Running undoes it at once: you're prey again.
        if (p.running) nerve = Math.max(0, nerve - dt * DA.nerveRun);
        else if (tall && facing && p.torch) nerve += dt * (hooks.cover(p.x, p.z) ? DA.nerveTorchCover : DA.nerveTorch);
        else if (tall && facing) nerve += dt * DA.nerveDark;
        else nerve = Math.max(0, nerve - dt * DA.nerveDecay);
        nextLunge -= dt * (p.running ? DA.runHaste : 1);

        if (nextLunge < 0) {
          // The one coming in is one you're not looking at, if there is one
          const behind = live().filter((w) => !inView(w) && w.lunge === 0);
          const pick = behind.length ? behind : live().filter((w) => w.lunge === 0);
          const w = pick[Math.floor(random() * pick.length)];

          if (w) {
            w.lunge = 0.01;
            // From in front and you standing your ground with a light on it: it only tests you
            w.feint = inView(w) && tall;
            hooks.sound.yap(at(w), 0.6);
          }

          nextLunge = randIn(DA.lungeEvery);
        }

        live().forEach((w, i) => {
          const a = clock * DA.ringSpin * (i % 2 ? 1 : -1) + (i / size) * Math.PI * 2;

          if (w.lunge > 0) {
            w.lunge += dt;
            const d = steer(w, p.x, p.z, DA.lungeSpeed, dt, DA.lungeTurn);

            if (w.feint && d < DA.feintAt) {
              // Stops short, snarls, wheels away
              hooks.sound.growl(at(w), 0.7);
              w.lunge = 0;
              w.back = DA.backFeint;
            } else if (d < DA.reach) {
              // Seen coming, it's only a nip; from behind, it's a proper bite
              const seen = inView(w);
              hooks.sound.bite([p.x, heightAt(p.x, p.z) + 0.8, p.z]);
              hooks.sound.growl(at(w), 0.7);
              hurt(randIn(DA.bite) * (seen ? DA.seen : DA.behind), [w.x, w.z], p, DA.push);

              if (downed) return;
              hooks.mark('bitten');
              nerve = Math.max(0, nerve - DA.nervePerBite);
              w.lunge = 0;
              w.back = DA.backBite;
            } else if (w.lunge > DA.lungeFor) w.lunge = 0;
          } else {
            w.back -= dt;
            // Ringing you; wider when you're holding them off
            const r = w.back > 0 ? DA.backRing : DA.ring + Math.min(nerve, HOLD) * DA.ringPerNerve;
            steer(w, p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, w.back > 0 ? DA.backSpeed : DA.ringSpeed, dt, DA.ringTurn);
          }
        });

        if (growlIn < 0) {
          growlIn = randIn(DA.growlEvery);
          const w = live()[Math.floor(random() * size)]!;

          if (random() < 0.5) hooks.sound.growl(at(w), 0.6);
          else hooks.sound.whistle(at(w, 0.6), 0.5);
        }

        if (downed) return { hidden };
        once('attacked', "They've found you. Don't run, and don't crouch. Turn and face them, torch in their eyes, stand tall. Back to a tree if you can. They bite what turns away.", 9);

        if (nerve > HOLD) {
          pack = 'leaving';
          hooks.say('They break off, one by one, and melt into the dark.', 5);
          hooks.mark('stood');
        } else if (hooks.safe(p.x, p.z) || packTime > DA.giveUp) pack = 'leaving';
      } else if (pack === 'leaving') {
        live().forEach((w) => {
          const [ux, uz] = toward(p.x, p.z, w.x, w.z);
          steer(w, w.x + ux * DL.ahead, w.z + uz * DL.ahead, DL.speed, dt, DL.turn);
        });

        if (dist > DL.goneDist) {
          for (const w of wolves) w.on = false;
          pack = 'away';
          packIn = randIn(D.afterLeave);
        }
      }
    }

    for (const w of wolves) w.phase += (w.speed / D.stride) * Math.PI * 2 * dt;

    // ---- the herd
    const near = hypot2(p.x - glade.x, p.z - glade.z);

    if (near < H.range) {
      if (near < H.warnDist) once('herd', 'Elephants, feeding right by the path. Crouch (C), torch out (F), keep the wind in your face, and creep past.', 9);
      const cow = herd[0]!;
      const closest = Math.min(...herd.map((e) => hypot2(e.x - p.x, e.z - p.z)));
      // How much of you they notice: how close, how loud, how bright
      const noise = p.pace < HS.stillPace ? HS.still : p.running ? HS.run : p.crouching ? HS.crouch : HS.walk;
      // Toward the cow, from you
      const ex = cow.x - p.x;
      const ez = cow.z - p.z;
      const ed = hypot2(ex, ez) || 1;
      let lit = 0;

      if (p.torch) {
        if (facingCos(ex, ez, p.fx, p.fz) > HS.beamCos && ed < HS.beamDist) lit = HS.lit;
        else lit = HS.glow;
      }

      const reach = p.aloft ? 0 : clamp((HS.near - closest) / HS.span, 0, HS.reachMax);
      // The wind: carrying your scent to her if you're upwind, however quiet you are; carrying
      // your sounds away if you're downwind
      const along = facingCos(ex, ez, p.wx, p.wz);
      const scent = p.aloft ? 0 : Math.max(0, along - HS.scentCos) * Math.max(0, 1 - ed / HS.scentDist) * HS.scentGain;
      const carried = along < HS.downCos ? HS.downMuffle : 1;
      const rise = (noise * carried + lit) * reach * HS.gain + scent * HS.scentRate;

      if (scent > HS.scentTell && alarm > HS.scentAlarm) {
        if (!said.has('scent')) hooks.mark('scented');
        once('scent', 'Her trunk is up, tasting the air. The wind is at your back: she can smell you. Get round so the wind is in your face.', 9);
      }

      alarm = clamp(alarm + (rise > HS.riseMin ? rise : -HS.decay) * dt, 0, 1);

      if (startled) {
        alarm = Math.max(alarm, startled);
        startled = 0;
      }

      if (!charge) {
        if (alarm > HA.rumble && warned < 1) {
          warned = 1;
          hooks.sound.rumble(at(cow, 2));
          // Something in the trees beyond her has seen you too
          hooks.sound.alarm?.([cow.x + rand(-40, 40), heightAt(cow.x, cow.z) + 6, cow.z + rand(-40, 40)]);
          hooks.say('The big one has stopped feeding. She is facing you.', 5);
        }

        if (alarm > HA.trumpet && warned < 2) {
          warned = 2;
          hooks.sound.trumpet(at(cow, 3), false);
          hooks.say('Back off. Slowly.', 4);
        }

        if (alarm < HA.calm) warned = 0;

        if (alarm >= HA.charge) {
          charge = { from: [cow.x, cow.z], mock: random() < HC.mockChance, t: 0 };
          hooks.mark('charge');
          hooks.sound.trumpet(at(cow, 3), true);
          hooks.say('She is charging. Run!', 3);
        }
      }

      herd.forEach((e, i) => {
        e.alert = approach(e.alert, alarm > HA.alert || (charge && i === 0) ? 1 : 0, HA.alertRate, dt);

        if (i === 0 && charge) {
          charge.t += dt;
          const d = steer(e, p.x, p.z, charge.mock ? HC.mockSpeed : HC.speed, dt, HC.turn);

          if (p.aloft) charge.mock = true;
          thudIn -= dt;

          if (thudIn < 0) {
            thudIn = HC.thudEvery;
            hooks.sound.thud(at(e, 0.1), 1);
          }

          const far = hypot2(e.x - charge.from[0], e.z - charge.from[1]);

          if (d < HC.hitDist && !charge.mock) {
            hurt(HC.dmg, [e.x, e.z], p, HC.push);
            hooks.mark('trampled');
            charge = null;

            if (!downed) alarm = HC.afterHit;
          } else if ((charge.mock && (far > HC.mockRun || d < HC.mockStop)) || far > HC.maxRun || charge.t > HC.maxT) {
            // She stops short, shakes her head, and goes back to the others
            charge = null;
            alarm = HC.afterStop;
            hooks.sound.trumpet(at(e, 3), false);
          }

          return;
        }

        if (e.alert > 0.5) {
          // Alert: turn to face you, and keep still; the calf goes to its mother
          const tx = i === 2 ? cow.x - Math.sin(cow.yaw) * H.alert.calfBehind : e.x;
          const tz = i === 2 ? cow.z - Math.cos(cow.yaw) * H.alert.calfBehind : e.z;
          steer(e, tx, tz, H.alert.speed, dt, H.alert.turn);
          e.yaw += wrap(Math.atan2(p.x - e.x, p.z - e.z) - e.yaw) * Math.min(1, dt * H.alert.face);
        } else {
          // Feeding: a few steps, a long pause, a few steps; back toward the glade's middle
          e.wait -= dt;

          if (e.wait < 0) {
            e.wait = randIn(H.feed.wait);
            const a = random() * Math.PI * 2;
            const r = random() * glade.r * H.feed.roam;
            e.goal = [glade.x + Math.sin(a) * r, glade.z + Math.cos(a) * r];

            if (i === 2) e.goal = [herd[0]!.x + rand(-H.feed.calfNear, H.feed.calfNear), herd[0]!.z + rand(-H.feed.calfNear, H.feed.calfNear)];
          }

          steer(e, e.goal[0], e.goal[1], i === 2 ? H.feed.calfSpeed : H.feed.speed, dt, H.feed.turn);
        }
      });

      for (const e of herd) e.phase += (e.speed / (H.stride * e.size)) * Math.PI * 2 * dt;
    } else {
      // Far away (you went on, or woke at a shrine): they settle, and forget you
      alarm = Math.max(0, alarm - dt * HS.decay);
      charge = null;
      warned = 0;
    }

    // ---- getting better, slowly; quicker by a lamp
    const calm = pack === 'away' || pack === 'leaving';

    // Sitting down up on a machan: out of reach, so you get your strength back whatever's below
    if (p.aloft && p.crouching && clock - hurtAt > P.aloftWait) health = Math.min(1, health + dt * P.healAloft);
    else if (calm && !charge && clock - hurtAt > P.wait) health = Math.min(1, health + dt * (hooks.safe(p.x, p.z) ? P.healSafe : P.healWild));

    return { hidden };
  };

  /**
   * Each frame. A big dt (the scene fast-forwarding) is split into substeps of at most
   * TUNING.maxStep, run in order, so lunges and charges play the same at any time scale. Going
   * down ends the frame: nothing more happens to you until the next.
   */
  const update = (dt: number, p: Player) => {
    let out = { hidden: false };
    stepFixed(
      dt,
      (h) => {
        out = step(h, p);

        return !downed;
      },
      TUNING.maxStep,
    );

    return out;
  };

  return {
    update,
    get wolves(): readonly Beast[] { return wolves; },
    get herd(): readonly (Beast & { size: number })[] { return herd; },
    get health() {
      return health;
    },
    /** Seconds since you were last hurt. */
    get sinceHurt() {
      return clock - hurtAt;
    },
    /** Whether something is after you just now: the pack about, or the herd uneasy. */
    get threat() {
      return pack !== 'away' || alarm > HA.threat || charge !== null;
    },
    /** What the pack is about: away, coming, searching, attack (has you), leaving. */
    get pack() {
      return pack;
    },
    get hunting() {
      return pack === 'coming' || pack === 'searching' || pack === 'attack';
    },
    get alarm() {
      return alarm;
    },
    /** How near you are to facing the pack down, 0 to 1, while they have you. */
    get holding() {
      return pack === 'attack' ? Math.min(1, nerve / HOLD) : 0;
    },
    // ---- for tests and the debug readout
    /** The pack comes now, from ahead, wherever you are. */
    summon() {
      summoned = true;
      pack = 'away';
      packIn = 0;
    },
    /** For tests: the dogs placed where asked, standing or moving at a speed, for a look. */
    show(at: readonly { x: number; z: number; yaw: number; speed: number }[], mood: typeof pack = 'away') {
      wolves.forEach((w, i) => {
        const a = at[i];
        w.on = !!a;

        if (a) Object.assign(w, a);
      });
      pack = mood;
    },
    /** The herd is alarmed now (1 starts a charge on the next step). */
    startle(level = 1) {
      startled = level;
    },
    /** Hurts you as a bite would, from just ahead. */
    hurt(amount: number, p: Pick<Player, 'x' | 'z' | 'fx' | 'fz'>) {
      hurt(amount, [p.x + p.fx, p.z + p.fz], p, 0);
    },
    get debug() {
      return { pack, size, nerve: +nerve.toFixed(1), packIn: +packIn.toFixed(1), alarm: +alarm.toFixed(2), charge: charge ? (charge.mock ? 'mock' : 'real') : null, health: +health.toFixed(2) };
    },
  };
}
