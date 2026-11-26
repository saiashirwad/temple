// Machans: the forest department's raised platforms beside the path, a few metres up on rough
// posts, with a steep wooden stair, a bamboo rail and a thatch over it. Built for watching game
// and for sitting out the night, so for you a refuge: nothing on four legs follows you up.

import { Builder, hex, P, type Mat, type V3 } from '../../render/geo.ts';
import type { Lamp } from '../../render/flicker.ts';
import { M } from '../../content/world.ts';
import { heightAt } from '../terrain.ts';
import { trailAt, trailNear } from './trail.ts';

const POST: Mat = { color: hex(0x4a3a2a), roughness: 0.85, pattern: P.BARK };
const PLANK: Mat = { color: hex(0x5a4632), roughness: 0.8, pattern: P.WOOD };
const BAMBOO: Mat = { color: hex(0x55502f), roughness: 0.6, pattern: P.PALM_BARK };
const THATCH: Mat = { color: hex(0x6a5a3a), roughness: 0.95, pattern: P.BARK };
const ROPE: Mat = { color: hex(0x8a7a5a), roughness: 0.9, pattern: P.PLAIN };
const GLASS: Mat = { color: [0.02, 0.025, 0.03], roughness: 0.05, pattern: P.GLASS };

/** How high the floor is above the ground under it. */
export const MACHAN_HEIGHT = 3.0;
const HALF = 1.3;
const RISE = 0.2;
const TREAD = 0.4;

export interface Machan {
  x: number;
  z: number;
  /** Turned so its stair comes down toward the path. */
  yaw: number;
  along: number;
  floor: number;
}

/** Where they stand: beside the path, on the flatter side, a little way back from it. */
export const MACHANS: Machan[] = [330, 560, 870].map((target) => {
  let best: Machan | null = null;
  let bestScore = Infinity;

  for (let along = target - 16; along <= target + 16; along += 4) {
    const p = trailAt(along);

    for (const side of [-1, 1]) {
      for (const off of [9.5, 11, 12.5]) {
        const rx = Math.cos(p.heading) * side;
        const rz = -Math.sin(p.heading) * side;
        const x = p.x + rx * off;
        const z = p.z + rz * off;

        if (trailNear(x, z, 10).distance < 8.6) continue;
        let lo = Infinity;
        let hi = -Infinity;

        for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) {
          const h = heightAt(x + dx, z + dz);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }

        // The stair runs toward the path: where it lands should be near the floor's own level
        const fx = x - rx * 6;
        const fz = z - rz * 6;
        const drop = Math.abs(heightAt(x, z) - heightAt(fx, fz));
        const score = hi - lo + drop * 2 + Math.abs(along - target) * 0.02;

        if (score < bestScore) {
          bestScore = score;
          best = { x, z, yaw: Math.atan2(p.x - x, p.z - z), along, floor: heightAt(x, z) + MACHAN_HEIGHT };
        }
      }
    }
  }

  return best!;
});

/** Local x, z on machan `m` to world x, z. */
const world = (m: Machan, lx: number, lz: number): [number, number] => {
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);

  return [m.x + lx * c + lz * s, m.z - lx * s + lz * c];
};

/** World x, z to machan `m`'s local x, z. */
const local = (m: Machan, x: number, z: number): [number, number] => {
  const dx = x - m.x;
  const dz = z - m.z;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);

  return [dx * c - dz * s, dx * s + dz * c];
};

/** The machan whose floor you're standing on, at x, z with your feet at `foot`, or null. */
export function onMachan(x: number, z: number, foot: number) {
  for (const m of MACHANS) {
    const [lx, lz] = local(m, x, z);

    if (Math.abs(lx) < HALF + 0.2 && Math.abs(lz) < HALF + 0.2 && foot > m.floor - 0.6) return m;
  }

  return null;
}

/** Keeps trees and bushes off the machans and their stairs. */
export function machanFree(x: number, z: number, margin = 0) {
  for (const m of MACHANS) {
    if (Math.hypot(x - m.x, z - m.z) < 5.5 + margin) return false;
    // ...and the stair, and room at its foot
    const [lx, lz] = local(m, x, z);

    if (Math.abs(lx) < 1.6 + margin && lz > 0 && lz < 9.5 + margin) return false;
  }

  return true;
}

export function buildMachans(b: Builder) {
  const lamps: Lamp[] = [];

  for (const m of MACHANS) {
    const g = heightAt(m.x, m.z);
    const top = m.floor;
    // The stair comes down the front (local +z, toward the path) to the ground there
    const footZ = HALF + 0.2;

    const groundAt = (lz: number) => {
      const [wx, wz] = world(m, 0, lz);

      return heightAt(wx, wz);
    };

    let n = Math.max(6, Math.round((top - groundAt(footZ + 6)) / RISE));
    n = Math.max(6, Math.round((top - groundAt(footZ + n * TREAD)) / RISE));
    const base = groundAt(footZ + n * TREAD);
    const step = (top - base) / n;
    b.with({ at: [m.x, 0, m.z], yaw: m.yaw }, () => {
      // Four rough posts, sunk in, running up past the floor to carry the thatch
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const [wx, wz] = world(m, px * (HALF - 0.1), pz * (HALF - 0.1));
        const gy = heightAt(wx, wz) - 0.2;
        b.tube(POST, [px * (HALF - 0.1), gy, pz * (HALF - 0.1)], 0.11, 0.09, top + 2.1 - gy, 7);
      }

      // Cross braces between the posts on each side
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]] as const) {
        const k = HALF - 0.1;
        b.sweep(BAMBOO, [[ax * k, g + 0.4, az * k], [bx * k, top - 0.3, bz * k]], [0.045, 0.045], 5);
        b.sweep(BAMBOO, [[bx * k, g + 0.4, bz * k], [ax * k, top - 0.3, az * k]], [0.045, 0.045], 5);
      }

      // The floor: planks laid across two beams. Seen only: the solid floor block below stands in
      b.open(() => {
        for (const sx of [-1, 1]) b.box(PLANK, [sx * (HALF - 0.1), top - 0.16, 0], [0.07, 0.07, HALF]);

        for (let i = 0; i < 9; i++) {
          const z = -HALF + 0.15 + i * ((HALF * 2 - 0.3) / 8);
          b.box(PLANK, [0, top - 0.04, z], [HALF + 0.05, 0.035, 0.13]);
        }
      });
      // A bamboo rail round three sides and the front, open where the stair comes up
      const rail = top + 0.9;
      const k = HALF - 0.05;

      const bars: [number, number, number, number][] = [
        [-k, -k, k, -k],
        [-k, -k, -k, k],
        [k, -k, k, k],
        [-k, k, -0.5, k],
        [0.5, k, k, k],
      ];

      for (const [ax, az, bx, bz] of bars) {
        for (const y of [top + 0.45, rail]) b.sweep(BAMBOO, [[ax, y, az], [bx, y, bz]], [0.035, 0.035], 5);
      }

      for (const [x, z] of [[-k, 0], [k, 0], [0, -k], [-0.5, k], [0.5, k]] as const) b.sweep(BAMBOO, [[x, top, z], [x, rail + 0.03, z]], [0.03, 0.03], 5);
      // The thatch: a low hip of dried grass over four poles
      b.roof(THATCH, [0, 0, 0], [HALF + 0.55, HALF + 0.55], [0.15, 0.15], top + 2.05, top + 2.75, { sag: 0.05, rows: 2 });
      // The stair: two stringers and treads, steep as a ship's ladder
      const len = n * TREAD;

      for (const sx of [-1, 1]) b.sweep(PLANK, [[sx * 0.48, base - 0.05, footZ + len], [sx * 0.48, top + 0.05, footZ - 0.05]], [0.05, 0.05], 4);
      // Treads seen only: the stair's solid steps below stand in
      b.open(() => {
        for (let i = 1; i <= n; i++) {
          const z = footZ + (n - i) * TREAD + TREAD / 2;
          b.box(PLANK, [0, base + i * step - 0.03, z], [0.45, 0.03, TREAD / 2 + 0.02]);
        }
      });

      for (const sx of [-1, 1]) b.sweep(BAMBOO, [[sx * 0.55, base + 0.9, footZ + len], [sx * 0.55, top + 0.9, footZ]], [0.03, 0.03], 5);
      // A hurricane lantern hung from the thatch, turned low
      b.sweep(ROPE, [[0.9, top + 2.0, -0.9], [0.9, top + 1.55, -0.9]], [0.008, 0.008], 3);
      b.blob(GLASS, [0.9, top + 1.45, -0.9], [0.07, 0.1, 0.07], 6, 4);
      b.flame(M.flame, [0.9, top + 1.4, -0.9], 0.04);
    });
    const [lx, lz] = world(m, 0.9, -0.9);
    lamps.push({ position: [lx, top + 1.45, lz], color: [1, 0.62, 0.3], intensity: 1.6, range: 9, kind: 'oil', seed: m.along / 1000 });

    // ---- what you stand on and bump into: floor, rail walls, the stair as solid blocks
    const at = (lx2: number, y: number, lz2: number): V3 => {
      const [wx, wz] = world(m, lx2, lz2);

      return [wx, y, wz];
    };

    b.solids.push({ kind: 'box', c: at(0, top - 0.08, 0), h: [HALF + 0.05, 0.08, HALF + 0.05], yaw: m.yaw, high: true });

    for (const [cx, cz, hx, hz] of [[0, -HALF, HALF, 0.05], [-HALF, 0, 0.05, HALF], [HALF, 0, 0.05, HALF], [-0.9, HALF, 0.4, 0.05], [0.9, HALF, 0.4, 0.05]] as const)
      b.solids.push({ kind: 'box', c: at(cx, top + 0.55, cz), h: [hx, 0.55, hz], yaw: m.yaw, high: true });

    for (let i = 1; i <= n; i++) {
      const z = footZ + (n - i) * TREAD + TREAD / 2;
      const y1 = base + i * step;
      b.solids.push({ kind: 'box', c: at(0, (y1 + base - 0.4) / 2, z), h: [0.45, (y1 - base + 0.4) / 2, TREAD / 2], yaw: m.yaw, high: true });
    }

    // Stair sides, so you can't step off it half way up
    for (const sx of [-1, 1]) {
      const z = footZ + (n * TREAD) / 2;
      b.solids.push({ kind: 'box', c: at(sx * 0.55, (base + top) / 2 + 0.9, z), h: [0.04, (top - base) / 2 + 0.5, (n * TREAD) / 2], yaw: m.yaw, high: true });
    }
  }

  return { lamps };
}
