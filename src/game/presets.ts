import type { createScene } from './scene.ts';
import { SPOTS, type Spot } from './launch.ts';

export type Scene = Awaited<ReturnType<typeof createScene>>;
type State = Scene['test']['state'];
export type Run = {
  name: string;
  /** Starts it; may return a promise that waits for the world. */
  start(s: Scene): void | Promise<void>;
  /** PASS / FAIL: reason, or null while still waiting; `t` is wall seconds since it started. */
  judge?(st: State, t: number, s: Scene): string | null;
};

export const solid = (s: Scene) =>
  new Promise<void>((done, reject) => {
    const deadline = performance.now() + 30000;
    const wait = () => {
      if (s.walker.solid) done();
      else if (performance.now() > deadline) reject(new Error('solid world did not load'));
      else setTimeout(wait, 150);
    };
    wait();
  });
/** Wait for both wildlife models and pipelines, but report stalled loading. */
export const wildlifeReady = (s: Scene) => Promise.race([
  s.test.wildlifeReady,
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('wildlife did not load')), 30000)),
]);
/** Held at a spot, then on your feet there (danger only runs while you walk). */
const standAt = async (s: Scene, spot: Spot) => {
  await solid(s);
  s.walker.moveTo(spot[0], spot[1], spot[2], true);
  s.view.goal.pitch = spot[3];
  s.view.jump();
  s.walker.touched();
};
const pass = (ok: boolean, why: string) => (ok ? 'PASS' : `FAIL: ${why}`);

export const RUNS: Record<string, Run> = {
  // The pack in view, held still, without physics: one standing, one stalking, one trotting, one at a gallop
  D: {
    name: 'dholes up close',
    async start(s) {
      await wildlifeReady(s);
      const [x, z, yaw] = SPOTS['2']!.at;
      s.walker.hold(x, z, yaw, 0.12, 1.62);
      s.view.jump();
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const at = (ahead: number, side: number, speed: number, turn: number) => ({ x: x + fx * ahead + fz * side, z: z + fz * ahead - fx * side, yaw: Math.atan2(fx, fz) + Math.PI + turn, speed });
      s.test.danger.show([at(3.2, -0.9, 0, 0.3), at(4.2, 0.9, 1.2, 1.4), at(5.5, -1.8, 2.4, -1.5), at(7, 1.6, 6.5, 1.6)], 'searching');
    },
  },
  w: {
    name: 'red dogs',
    async start(s) {
      await wildlifeReady(s);
      if (s.walker.mode === 'held' || Math.hypot(...s.walker.at) < 150) await standAt(s, SPOTS['2']!.at);
      else await solid(s);
      s.test.danger.summon();
    },
    judge: (st, t) => (['coming', 'searching', 'attack'].includes(st.danger.pack) ? 'PASS' : t > 6 ? 'FAIL: no pack' : null),
  },
  W: {
    name: 'stand your ground',
    async start(s) {
      await wildlifeReady(s);
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
      await wildlifeReady(s);
      await standAt(s, SPOTS['6']!.at);
      s.test.danger.startle(1);
    },
    judge: (st, t) => (st.danger.charge ? 'PASS' : t > 5 ? 'FAIL: no charge' : null),
  },
  f: {
    name: 'the ending at 16x',
    async start(s) {
      await standAt(s, SPOTS['8']!.at);
      s.test.timeScale = 16;
      // Exercise the same interactions as the player: read, put down, then sit.
      const until = async (id: string) => {
        const deadline = performance.now() + 5000;
        while (s.journey.near?.id !== id) {
          if (performance.now() > deadline) throw new Error(`interaction ${id} unavailable`);
          await new Promise((done) => setTimeout(done, 50));
        }
        s.journey.examined(s.journey.near!);
      };
      await until('bungalow.note');
      await until('bungalow.chair');
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
