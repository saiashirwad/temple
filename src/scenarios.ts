// Test scenarios, run by a key chord so a test browser that can only open the bare address,
// press keys and take screenshots can still set up any situation: press ` (backquote), then a
// key. Keys pressed while the scene is still loading are kept and run once it's ready.
//
// A scenario puts you somewhere, starts something, and may judge itself: the readout in the
// top-left corner (`#state`) shows its name, PASS / FAIL / waiting, and the game's state as
// text, so one screenshot says what happened.
//
//   1-9  stand at a named spot (SPOTS), held still: a view to look at
//   w    the red dogs come at you now, from ahead (at the bridge path if you're in town)
//   W    the same, and stand your ground facing them with the torch on: they should give up
//   D    the pack held still in view at the path (no physics): standing, stalking, trotting, galloping
//   h    at the herd, downwind; the herd is startled into a charge
//   f    the ending: in his chair with the note read, at 16x speed, through to the last card
//   n    on the veranda by the note, the note not yet read
//   d    you go down (health to nothing), to see the fall and waking again
//   g    walk forward 3 s from where you are (hold W), for checking collisions
//   t    the night's clock at 1x / 4x / 10x
//   j    the readout on or off
//   p    reload with stage timings (probe);  m  reload with GPU timings (profile)
//   c    reload with the phone layout;  0  reload clean

import { boot } from './boot.ts';
import type { createScene } from './scene.ts';

type Scene = Awaited<ReturnType<typeof createScene>>;
type State = Scene['test']['state'];
/** x, z, yaw, pitch, eye height above the ground. Yaw π faces +z, 0 faces -z. */
type Spot = readonly [number, number, number, number, number];

export const SPOTS: Record<string, { name: string; at: Spot }> = {
  '1': { name: 'town view', at: [122.8, -128.1, 2.41, 0.06, 1.62] },
  '2': { name: 'path before the bridge', at: [-160.5, -113.5, 1.55, 0.18, 1.62] },
  '3': { name: 'bridge', at: [-169.73, -108.86, 0.981, 0.22, 1.62] },
  '4': { name: 'dung by the path', at: [-69.66, -139.88, 2.458, 0.45, 1.62] },
  '5': { name: 'machan stair', at: [-17.44, -159.78, 0.421, 0.1, 3.8] },
  '6': { name: 'herd glade', at: [-114.55, -258.42, -2.05, 0.08, 1.62] },
  '7': { name: 'herd glade, close', at: [-110.2, -256.1, -2.05, 0.12, 1.62] },
  '8': { name: 'veranda, the note', at: [20.81, -395.27, 0.186, 0.75, 3.5] },
  '9': { name: 'his chair, looking out', at: [20.61, -396.33, 2.792, 0.07, 2.63] },
};

type Run = {
  name: string;
  /** Starts it; may return a promise that waits for the world. */
  start(s: Scene): void | Promise<void>;
  /** PASS / FAIL: reason, or null while still waiting; `t` is wall seconds since it started. */
  judge?(st: State, t: number, s: Scene): string | null;
};

const solid = (s: Scene) =>
  new Promise<void>((done) => {
    const wait = () => (s.walker.solid ? done() : setTimeout(wait, 150));
    wait();
  });
/** Held at a spot, then on your feet there (danger only runs while you walk). */
const standAt = async (s: Scene, spot: Spot) => {
  s.walker.hold(...spot);
  await solid(s);
  s.walker.touched();
};
const pass = (ok: boolean, why: string) => (ok ? 'PASS' : `FAIL: ${why}`);

const RUNS: Record<string, Run> = {
  // The pack in view, held still, without physics: one standing, one stalking, one trotting, one at a gallop
  D: {
    name: 'dholes up close',
    start(s) {
      const [x, z, yaw] = SPOTS['2']!.at;
      s.walker.hold(x, z, yaw, 0.12, 1.62);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const at = (ahead: number, side: number, speed: number, turn: number) => ({ x: x + fx * ahead + fz * side, z: z + fz * ahead - fx * side, yaw: Math.atan2(fx, fz) + Math.PI + turn, speed });
      s.test.danger.show([at(3.2, -0.9, 0, 0.3), at(4.2, 0.9, 1.2, 1.4), at(5.5, -1.8, 2.4, -1.5), at(7, 1.6, 6.5, 1.6)], 'searching');
    },
  },
  w: {
    name: 'red dogs',
    async start(s) {
      if (Math.hypot(...s.walker.at) < 150) await standAt(s, SPOTS['2']!.at);
      else await solid(s);
      s.test.danger.summon();
    },
    judge: (st, t) => (['coming', 'searching', 'attack'].includes(st.danger.pack) ? 'PASS' : t > 6 ? 'FAIL: no pack' : null),
  },
  W: {
    name: 'stand your ground',
    async start(s) {
      await standAt(s, SPOTS['2']!.at);
      if (!s.journey.torchOn) s.journey.toggleTorch();
      s.test.timeScale = 2;
      s.test.danger.summon();
    },
    judge: (st, t) => (st.danger.pack === 'leaving' || st.danger.pack === 'away' && t > 4 ? 'PASS' : t > 14 ? `FAIL: still ${st.danger.pack}, nerve ${st.danger.nerve}` : null),
  },
  h: {
    name: 'herd charge',
    async start(s) {
      await standAt(s, SPOTS['6']!.at);
      s.test.danger.startle(1);
    },
    judge: (st, t) => (st.danger.charge ? 'PASS' : t > 5 ? 'FAIL: no charge' : null),
  },
  f: {
    name: 'the ending at 16x',
    async start(s) {
      // Held in the chair, no need to wait for the solid world: the story runs in any mode
      s.walker.hold(...SPOTS['9']!.at);
      s.test.readNote();
      s.test.story.sit();
      s.test.timeScale = 16;
    },
    judge: (st, t) => (st.ended && st.guardGone ? 'PASS' : t > 12 ? pass(false, `finale line ${st.story.finale}, guard gone ${st.guardGone}`) : null),
  },
  n: {
    name: 'the note',
    async start(s) {
      await standAt(s, SPOTS['8']!.at);
    },
    judge: (st, t) => (st.near === 'Read the note' ? 'PASS' : t > 4 ? `FAIL: near ${st.near}` : null),
  },
  d: {
    name: 'going down',
    async start(s) {
      await solid(s);
      if (s.walker.mode !== 'walk') s.walker.touched();
      const [x, z] = s.walker.at;
      const yaw = s.view.pose.yaw;
      s.test.danger.hurt(2, { x, z, fx: -Math.sin(yaw), fz: -Math.cos(yaw) } as never);
    },
    judge: (st, t) => (st.downs > 0 && st.danger.health > 0.5 ? 'PASS' : t > 3 ? 'FAIL: not down' : null),
  },
  g: {
    name: 'walk forward 3 s',
    async start(s) {
      await solid(s);
      s.walker.touched();
      s.walker.keys.add('w');
      setTimeout(() => s.walker.keys.delete('w'), 3000);
    },
  },
};

export function scenarios(stateBox: HTMLPreElement) {
  const queued: string[] = [];
  let chord = false;
  let scene: Scene | null = null;
  let current: { run: Run; t0: number; from: readonly [number, number]; verdict: string | null; ready: boolean } | null = null;
  let shown = boot.has('state');
  addEventListener(
    'keydown',
    (e) => {
      if (e.key === '`') {
        chord = true;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!chord) return;
      chord = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      queued.push(e.key);
    },
    { capture: true },
  );

  const reloads: Record<string, string[]> = { p: ['probe', 'state'], m: ['profile'], c: ['phone', 'state'], '0': [] };
  const run = (key: string, s: Scene) => {
    if (key in reloads) return boot.reloadWith(...reloads[key]!);
    if (key === 'j') return void (shown = !shown);
    // x: hide the next drawing group in turn (for finding what the scene pass spends its time on)
    if (key === 'b') return void (s.test.bench(), (shown = true));
    if (key === 'x' || key === 'X') return void ((s.test.skip = s.test.skip + (key === 'X' ? 5 : 1)), (shown = true));
    if (key === 't') {
      s.test.timeScale = s.test.timeScale === 1 ? 4 : s.test.timeScale === 4 ? 10 : 1;
      return void (shown = true);
    }
    shown = true;
    const spot = SPOTS[key];
    const r: Run | undefined = spot ? { name: spot.name, start: (sc) => sc.walker.hold(...spot.at) } : RUNS[key];
    if (!r) return;
    current = { run: r, t0: performance.now(), from: [...s.walker.at] as [number, number], verdict: null, ready: false };
    void Promise.resolve(r.start(s)).then(() => current && current.run === r && ((current.t0 = performance.now()), (current.ready = true), (current.from = [...s.walker.at] as [number, number])));
  };

  let lastText = '';
  setInterval(() => {
    if (scene) while (queued.length) run(queued.shift()!, scene);
    stateBox.hidden = !shown;
    if (!shown || !scene) return;
    const st = scene.test.state;
    let head = 'no scenario';
    if (current) {
      const t = (performance.now() - current.t0) / 1000;
      if (current.ready && !current.verdict && current.run.judge) current.verdict = current.run.judge(st, t, scene);
      const moved = Math.hypot(st.at[0]! - current.from[0], st.at[1]! - current.from[1]);
      head = `${current.run.name} · ${current.verdict ?? (!current.ready ? 'setting up' : current.run.judge ? 'waiting' : 'running')} · ${t.toFixed(0)}s · moved ${moved.toFixed(1)}m`;
    }
    const text = `${head}\nx${scene.test.timeScale}  ` + JSON.stringify(st).replace(/[{}"]/g, '').replace(/,(?=[a-z])/g, '  ');
    if (text !== lastText) stateBox.textContent = lastText = text;
  }, 250);

  return {
    attach(s: Scene) {
      scene = s;
    },
  };
}
