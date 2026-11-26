import type { createScene } from './scene.ts';
import { SPOTS, type Spot } from '../content/viewpoints.ts';

export type Scene = Awaited<ReturnType<typeof createScene>>;

type State = ReturnType<Scene['inspect']>;

export type Run = {
  name: string;
  /** Starts it; may return a promise that waits for the world. */
  start(s: Scene): void | Promise<void>;
  /** PASS / FAIL: reason, or null while still waiting; `t` is wall seconds since it started. */
  judge?(st: State, t: number, s: Scene): string | null;
};

/** Held at a spot, then on your feet there (danger only runs while you walk). */
const standAt = async (s: Scene, spot: Spot) => {
  await s.test.requirePhysics();
  s.walker.moveTo(spot[0], spot[1], spot[2], true);
  s.view.goal.pitch = spot[3];
  s.view.jump();
  s.walker.touched();
};

const pass = (ok: boolean, why: string) => (ok ? 'PASS' : `FAIL: ${why}`);

export const RUNS: Record<string, Run & { id: string; spot?: string; physics?: boolean; wildlife?: 'herd' | 'dholes' }> = {
  // The pack in view, held still, without physics: one standing, one stalking, one trotting, one at a gallop
  D: {
    id: 'dholes-up-close', spot: '2', wildlife: 'dholes',
    name: 'dholes up close',
    async start(s) {
      await s.test.requireWildlife('dholes');
      const [x, z, yaw] = SPOTS['2']!.at;
      s.walker.hold(x, z, yaw, 0.12, 1.62);
      s.view.jump();
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const at = (ahead: number, side: number, speed: number, turn: number) => ({ x: x + fx * ahead + fz * side, z: z + fz * ahead - fx * side, yaw: Math.atan2(fx, fz) + Math.PI + turn, speed });
      s.journey.danger.show([at(3.2, -0.9, 0, 0.3), at(4.2, 0.9, 1.2, 1.4), at(5.5, -1.8, 2.4, -1.5), at(7, 1.6, 6.5, 1.6)], 'searching');
    },
  },
  w: {
    id: 'dhole-pack', spot: '2', physics: true, wildlife: 'dholes',
    name: 'red dogs',
    async start(s) {
      await s.test.requireWildlife('dholes');

      if (s.walker.mode === 'held' || Math.hypot(...s.walker.at) < 150) await standAt(s, SPOTS['2']!.at);
      else await s.test.requirePhysics();
      s.journey.danger.summon();
    },
    judge: (st, t) => (['coming', 'searching', 'attack'].includes(st.danger.pack) ? 'PASS' : t > 6 ? 'FAIL: no pack' : null),
  },
  W: {
    id: 'stand-your-ground', spot: '2', physics: true, wildlife: 'dholes',
    name: 'stand your ground',
    async start(s) {
      await s.test.requireWildlife('dholes');
      await standAt(s, SPOTS['2']!.at);
      s.journey.state.torchOff = false;
      s.test.timeScale = 2;
      s.journey.danger.summon();
    },
    judge: (st, t) => (st.danger.pack === 'leaving' || st.danger.pack === 'away' && t > 4 ? 'PASS' : t > 14 ? `FAIL: still ${st.danger.pack}, nerve ${st.danger.nerve}` : null),
  },
  h: {
    id: 'herd-charge', spot: '6', physics: true, wildlife: 'herd',
    name: 'herd charge',
    async start(s) {
      await s.test.requireWildlife('herd');
      await standAt(s, SPOTS['6']!.at);
      s.journey.danger.startle(1);
    },
    judge: (st, t) => (st.danger.charge ? 'PASS' : t > 5 ? 'FAIL: no charge' : null),
  },
  f: {
    id: 'bungalow-finale', spot: '8', physics: true,
    name: 'the ending at 16x',
    async start(s) {
      await standAt(s, SPOTS['8']!.at);
      s.test.timeScale = 16;

      // Exercise the same interactions as the player: read, put down, then sit.
      const until = async (id: string) => {
        const deadline = performance.now() + 5000;

        while (s.journey.state.near?.id !== id) {
          if (performance.now() > deadline) throw new Error(`interaction ${id} unavailable`);
          await new Promise((done) => setTimeout(done, 50));
        }

        s.journey.examine(s.journey.state.near!);
      };

      await until('bungalow.note');
      await until('bungalow.chair');
    },
    judge: (st, t) => (st.ended && st.guardGone ? 'PASS' : t > 12 ? pass(false, `finale line ${st.story.finale}, guard gone ${st.guardGone}`) : null),
  },
  n: {
    id: 'bungalow-note', spot: '8', physics: true,
    name: 'the note',
    async start(s) {
      await standAt(s, SPOTS['8']!.at);
    },
    judge: (st, t) => (st.interactionId === 'bungalow.note' ? 'PASS' : t > 4 ? `FAIL: near ${st.near}` : null),
  },
  d: {
    id: 'knockdown', physics: true,
    name: 'going down',
    async start(s) {
      await s.test.requirePhysics();

      if (s.walker.mode !== 'walk') s.walker.touched();
      const [x, z] = s.walker.at;
      const yaw = s.view.pose.yaw;
      s.journey.danger.hurt(2, { x, z, fx: -Math.sin(yaw), fz: -Math.cos(yaw) });
    },
    judge: (st, t) => (st.downs > 0 && st.danger.health > 0.5 ? 'PASS' : t > 3 ? 'FAIL: not down' : null),
  },
  g: {
    id: 'walk-forward', physics: true,
    name: 'walk forward 3 s',
    async start(s) {
      await s.test.requirePhysics();
      s.walker.touched();
      s.walker.keys.add('w');
      setTimeout(() => s.walker.keys.delete('w'), 3000);
    },
  },
};
