// Unease: nothing ever happens, but the forest isn't empty. Now and then the insects stop all
// at once; a stick breaks somewhere behind; something moves off through the undergrowth; a
// sambar barks its alarm far off; a pair of eyes is there in the torch beam, and then not.
// Whatever it is never comes closer.
import { BUNGALOW } from '../world/trail/bungalow.ts';
import { CROSSING } from '../world/trail/jungle.ts';
import { inRiver } from '../world/trail/river.ts';
import { heightAt } from '../world/terrain.ts';
import type { Tick } from './journey.ts';

type V3 = [number, number, number];

/** How bright the torch has to be to find a pair of eyes. */
const TORCH_ON = 0.3;
/** Eyes are at full brightness this near, dimmer beyond. */
const EYE_SEEN_AT = 26;
const EYE_H = 1.62;

export interface UneaseHooks {
  sound: {
    hush(seconds: number): void;
    snap(at: V3): void;
    rustle(a: V3, b: V3, seconds: number): void;
    bark(at: V3): void;
  };
  eyes: { readonly chance: number; set(i: number, x: number, y: number, z: number, glow: number): void };
  /** Runs `run` after `seconds` on the night's clock. */
  later(seconds: number, run: () => void): void;
}

/** The walk, as far as the forest's moments care. */
export interface UneaseWalk {
  deep: number;
  arrived: boolean;
  torch: number;
}

export function createUnease({ sound, eyes, later }: UneaseHooks) {
  type Pair = { x: number; y: number; z: number; px: number; pz: number; glow: number; lit: number; life: number; wait: number; blink: number };
  const pairs: Pair[] = [];
  let uneaseIn = 35 + Math.random() * 25;
  let flicker = 0;
  let quietAtCrossing = false;
  /** The frame's tick: the scene fills the same object in place each frame, so callbacks run later read the current eye. */
  let tk: Tick | null = null;
  const around = (from: number, to: number, near: number, far: number): V3 => {
    const eye = tk!.eye;
    // A spot at a bearing from the way you face (0 ahead, 180 behind), between two distances
    const a = tk!.yaw + Math.PI + ((from + Math.random() * (to - from)) * Math.PI) / 180 * (Math.random() < 0.5 ? -1 : 1);
    const dist = near + Math.random() * (far - near);
    const px = eye[0] - Math.sin(a + Math.PI) * dist;
    const pz = eye[2] - Math.cos(a + Math.PI) * dist;
    return [px, heightAt(px, pz), pz];
  };
  const spawnEyes = (count: number, from: number, to: number) => {
    const eye = tk!.eye;
    // Somewhere about level with you, not down a ravine or in the water
    let c = around(from, to, 10, 18);
    for (let k = 0; k < 12 && (Math.abs(c[1] - (eye[1] - EYE_H)) > 2.2 || inRiver(c[0], c[2], 3)); k++) c = around(from, to, 10, 18);
    if (Math.abs(c[1] - (eye[1] - EYE_H)) > 2.2) return;
    for (let k = 0; k < count && pairs.length < eyes.chance / 2; k++) {
      const x = c[0] + (Math.random() - 0.5) * 3;
      const z = c[2] + (Math.random() - 0.5) * 3;
      const dx = x - eye[0];
      const dz = z - eye[2];
      const len = Math.hypot(dx, dz) || 1;
      const half = 0.07 + Math.random() * 0.03;
      pairs.push({ x, y: heightAt(x, z) + 1.0 + Math.random() * 0.6, z, px: (-dz / len) * half, pz: (dx / len) * half, glow: 0, lit: 0, life: 1.2 + Math.random() * 2.5, wait: 30, blink: 0.5 + Math.random() * 1.5 });
    }
  };
  return {
    /** Runs the forest's moments; returns how bright the torch is just now (it falters, rarely). */
    step(t: Tick, walk: UneaseWalk) {
      tk = t;
      const { dt, x, z, eye } = t;
      const [fx, fy, fz] = t.fwd;
      const inTrees = walk.deep > 0.45 && !walk.arrived && Math.hypot(x - BUNGALOW.x, z - BUNGALOW.z) > 45;
      // At the elephant crossing the forest has gone quiet, always
      if (!quietAtCrossing && Math.hypot(x - CROSSING.at[0], z - CROSSING.at[1]) < 22) {
        quietAtCrossing = true;
        sound.hush(16);
      }
      if (inTrees) {
        uneaseIn -= dt;
        if (uneaseIn < 0) {
          uneaseIn = 30 + Math.random() * 45;
          const k = Math.random();
          if (k < 0.3) {
            // The insects stop; a few seconds on, eyes, somewhere off to the side or behind
            sound.hush(11 + Math.random() * 5);
            later(2.5 + Math.random() * 2.5, () => spawnEyes(Math.random() < 0.3 ? 2 + Math.floor(Math.random() * 2) : 1, 70, 180));
          } else if (k < 0.55) {
            // A stick breaks behind you; then quiet; sometimes another, further off
            sound.snap(around(110, 180, 9, 16));
            later(0.4, () => sound.hush(7));
            if (Math.random() < 0.5) later(3.5 + Math.random() * 3, () => sound.snap(around(120, 180, 18, 26)));
          } else if (k < 0.75) {
            // Something heavy moving off through the undergrowth, parallel to the path
            const a = around(40, 120, 10, 15);
            const b = around(100, 170, 16, 22);
            sound.rustle(a, [b[0], b[1] + 0.3, b[2]], 2 + Math.random() * 1.5);
          } else if (k < 0.92) {
            // A sambar's alarm far off: something has frightened it
            const a = around(0, 180, 160, 320);
            sound.bark([a[0], a[1] + 4, a[2]]);
            later(1.2, () => sound.hush(9));
          } else {
            // The torch falters, a second or so
            flicker = 1.2;
          }
        }
      }
      // The eyes: dark until the torch finds them, then a few seconds of steady green-gold, a blink,
      // and gone, the way an animal turns its head away
      for (let i = pairs.length - 1; i >= 0; i--) {
        const p = pairs[i]!;
        const dx = p.x - eye[0];
        const dy = p.y - eye[1];
        const dz = p.z - eye[2];
        const dist = Math.hypot(dx, dy, dz) || 1;
        const inBeam = (dx * fx + dy * fy + dz * fz) / dist > 0.9 && walk.torch > TORCH_ON;
        p.wait -= dt;
        if (p.lit > 0 || inBeam) p.lit += dt;
        const showing = p.lit > 0 && p.lit < p.life;
        const blinking = Math.abs(p.lit - p.blink) < 0.12;
        const want = showing && !blinking ? (inBeam ? 1 : 0.35) * Math.min(1, EYE_SEEN_AT / dist) : 0;
        p.glow += (want - p.glow) * Math.min(1, dt * (want > p.glow ? 14 : 5));
        // Left behind out of sight: forget it
        if (dist > 45) p.wait = -1;
        if ((p.lit > p.life + 0.6 || p.wait < 0) && p.glow < 0.01) {
          // When it goes, sometimes you hear it go
          if (p.lit > 0 && Math.random() < 0.5) sound.rustle([p.x, p.y - 0.5, p.z], [p.x + p.px * 60, p.y - 0.5, p.z + p.pz * 60], 1.4);
          pairs.splice(i, 1);
        }
      }
      for (let i = 0; i < eyes.chance / 2; i++) {
        const p = pairs[i];
        if (!p) {
          eyes.set(i * 2, 0, -99, 0, 0);
          eyes.set(i * 2 + 1, 0, -99, 0, 0);
          continue;
        }
        eyes.set(i * 2, p.x - p.px, p.y, p.z - p.pz, p.glow);
        eyes.set(i * 2 + 1, p.x + p.px, p.y, p.z + p.pz, p.glow);
      }
      if (flicker > 0) {
        flicker -= dt;
        return Math.random() < 0.35 ? 0.15 : 0.55 + Math.random() * 0.4;
      }
      return 1;
    },
  };
}
