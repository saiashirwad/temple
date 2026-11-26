// The church on the east side of town, as the old Syrian Christian churches of central Kerala
// stand: a tall white baroque facade with pilasters, cornices and scrolls, a pediment carrying
// the bell and a cross lit in cold neon; a long tiled nave behind it with lower aisles; in front,
// the bronze-ringed flagstaff and the granite open-air cross (kalkurishu) with candles burning at
// its foot; a cemetery of white crosses at the back; and down at the road, the little glass
// wayside shrine (kurishady) with a tube light and candles.

import { Builder, hex, P, type Mat, type V3 } from '../../render/geo.ts';
import type { Lamp } from '../../render/flicker.ts';
import { M, ROAD } from '../../content/world.ts';
import { heightAt, roadZ } from '../terrain.ts';
import { CHURCH } from './town.ts';

const LIME: Mat = { color: hex(0xe9e4d6), roughness: 0.85, pattern: P.PLASTER };
const CREAM: Mat = { color: hex(0xd9cfb6), roughness: 0.85, pattern: P.PLASTER };
const GLASS: Mat = { color: hex(0x0a0c10), roughness: 0.1, pattern: P.GLASS };
const RED_GLOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [0.9, 0.12, 0.05], pattern: P.BULB };
const NEON: Mat = { color: [0, 0, 0], roughness: 1, emission: [3.2, 4.6, 6.5], pattern: P.TUBE };
const TUBE: Mat = { color: [0, 0, 0], roughness: 1, emission: [5, 7, 7.5], pattern: P.TUBE };
const CANDLE: Mat = { color: hex(0xe8e0c8), roughness: 0.5, pattern: P.PLAIN };
const GRAVE: Mat = { color: hex(0xd4d0c4), roughness: 0.8, pattern: P.CONCRETE };
const DOOR: Mat = { color: hex(0x3a1c10), roughness: 0.5, pattern: P.LACQUER };

/** A flat pane facing +z: a rectangle with a round arch on top, `w` wide, `h` to the springing. */
export function archPane(b: Builder, mat: Mat, x: number, y: number, z: number, w: number, h: number) {
  b.box(mat, [x, y + h / 2, z], [w / 2, h / 2, 0.01]);
  const n = 8;

  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i / n);
    const a1 = Math.PI * ((i + 1) / n);
    b.tri(mat, [x, y + h, z + 0.01], [x + Math.cos(a0) * w / 2, y + h + Math.sin(a0) * w / 2, z + 0.01], [x + Math.cos(a1) * w / 2, y + h + Math.sin(a1) * w / 2, z + 0.01], [0, 0, 1]);
  }
}

/** A round window facing +z. */
function rose(b: Builder, mat: Mat, frame: Mat, x: number, y: number, z: number, r: number) {
  const n = 16;

  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    b.tri(mat, [x, y, z], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], [0, 0, 1]);
    b.bar(frame, [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z + 0.03], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z + 0.03], 0.05);
  }

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    b.bar(frame, [x - Math.cos(a) * r, y - Math.sin(a) * r, z + 0.02], [x + Math.cos(a) * r, y + Math.sin(a) * r, z + 0.02], 0.025);
  }
}

export function buildChurch(b: Builder) {
  const lamps: Lamp[] = [];
  const { x: X, z: Z, hx, hz } = CHURCH;
  const g = (x: number, z: number) => heightAt(X + x, Z + z);
  // The church floor, a little above the highest ground under it
  let top = -Infinity;

  for (const x of [-8, 0, 8]) for (const z of [-15, -4, 9]) top = Math.max(top, g(x, z));
  const F = top + 0.6;
  const gy = (x: number, z: number) => g(x, z) - F;

  const light = (p: V3, color: V3, intensity: number, range: number, kind: Lamp['kind'], seed = 0.3) =>
    lamps.push({ position: [X + p[0], F + p[1], Z + p[2]], color, intensity, range, kind, seed });

  b.with({ at: [X, F, Z], yaw: 0 }, () => {
    const NW = 4.8;
    const AW = 7.6;
    const z0 = -14;
    const fz = 8;
    // The platform and its steps
    // The laterite mass and its granite skin are felt as one block, up to the skin's top
    b.open(() => {
      b.box(M.laterite, [0, -2.5, (z0 + fz) / 2 + 1], [AW + 0.6, 2.5, (fz - z0) / 2 + 2], 'y-');
      b.box(M.granite, [0, 0.02, (z0 + fz) / 2 + 1], [AW + 0.6, 0.03, (fz - z0) / 2 + 2]);
    });
    b.block([0, -2.475, (z0 + fz) / 2 + 1], [AW + 0.6, 2.525, (fz - z0) / 2 + 2]);

    for (let i = 0; i < 4; i++) b.box(M.granite, [0, (-i * 0.15 - 1.6) / 2, fz + 3.15 + i * 0.32], [4, (1.6 - i * 0.15) / 2, 0.16], 'y-');
    // The nave, its clerestory and the tiled gable roof
    b.box(LIME, [0, 3.75, (z0 + fz) / 2], [NW, 3.75, (fz - z0) / 2], 'y-');
    b.roof(M.tile, [0, 0, (z0 + fz) / 2 - 0.3], [NW + 0.8, (fz - z0) / 2 + 0.3], [0.1, (fz - z0) / 2 + 0.3], 7.4, 11.0, { sag: 0.05, rows: 6, sides: [1, 3] });
    b.tri(LIME, [-NW, 7.5, z0], [NW, 7.5, z0], [0, 10.8, z0], [0, 0, -1]);

    // The aisles either side under lean-to roofs, tall arched windows between buttresses
    for (const s of [-1, 1]) {
      b.box(LIME, [s * (NW + AW) / 2, 2.3, (z0 + fz) / 2 + 0.2], [(AW - NW) / 2, 2.3, (fz - z0) / 2 - 0.2], 'y-');
      b.plane(M.tile, [s * (NW - 0.05), 6.6, z0 - 0.3], [s * (NW - 0.05), 6.6, fz - 0.2], [s * (AW + 0.6), 4.3, fz - 0.2], [s * (AW + 0.6), 4.3, z0 - 0.3], [s * 0.4, 1, 0]);

      for (let z = z0 + 2; z < fz - 1; z += 3.2) {
        b.with({ at: [s * AW, 0, z], yaw: (s * Math.PI) / 2 }, () => {
          const glow = Math.abs(z - (z0 + 2)) < 0.1;
          archPane(b, glow ? RED_GLOW : GLASS, 0, 1.2, 0.01, 1.0, 1.9);
          b.box(CREAM, [0, 1.15, 0.06], [0.65, 0.05, 0.08]);
        });
        b.box(CREAM, [s * (AW + 0.15), 2.0, z + 1.6], [0.2, 2.0, 0.3]);
        // Clerestory windows above the aisle roof
        b.with({ at: [s * NW, 0, z], yaw: (s * Math.PI) / 2 }, () => archPane(b, GLASS, 0, 6.65, 0.01, 0.6, 0.35));
      }
    }

    // The apse behind the altar, a half-round end under a cone of tiles
    b.tube(LIME, [0, 0, z0], NW - 0.6, NW - 0.6, 6.4, 16, { rings: 1 });
    b.cone(M.tile, [0, 0, z0], NW + 0.1, 0.3, 6.4, 8.6, { sides: 16 });

    // ---- the facade: wider and far taller than the nave, in three bays
    const FD = 0.7;
    const front = fz + FD;
    b.box(LIME, [0, 4.5, fz + FD / 2], [AW + 0.3, 4.5, FD / 2]);
    b.box(LIME, [0, 11.2, fz + FD / 2], [NW + 0.3, 2.2, FD / 2]);

    // The scrolls that step the sides in to the centre
    for (const s of [-1, 1]) {
      b.with({ at: [s * (NW + 1.4), 9.8, fz + FD / 2], yaw: 0 }, () => {
        b.sweep(CREAM, [[s * 1.6, -0.6, 0], [s * 1.1, 0.2, 0], [s * 0.3, 0.9, 0], [-s * 0.6, 1.3, 0], [-s * 1.2, 2.5, 0]], [0.32, 0.3, 0.28, 0.26, 0.2], 6);
        b.blob(CREAM, [s * 1.55, -0.55, 0], [0.35, 0.35, 0.36], 8, 6);
      });
      b.lathe(CREAM, [s * (AW + 0.05), 9.0, fz + FD / 2], [[0.3, 0], [0.22, 0.2], [0.28, 0.5], [0.1, 0.9], [0.12, 1.1], [0, 1.4]], 10);
    }

    // Pilasters and cornices, drawn proud of the wall
    for (const x of [-AW, -NW, -1.8, 1.8, NW, AW]) {
      const tall = Math.abs(x) < NW + 0.1;
      b.box(CREAM, [x, (tall ? 13.2 : 8.8) / 2, front + 0.08], [0.32, (tall ? 13.2 : 8.8) / 2, 0.1]);
      b.box(CREAM, [x, 0.35, front + 0.14], [0.4, 0.35, 0.16]);
    }

    for (const [y, w2] of [[4.6, AW + 0.4], [8.9, AW + 0.45], [13.3, NW + 0.45]] as const) {
      b.box(CREAM, [0, y, front + 0.18], [w2, 0.1, 0.22]);
      b.box(CREAM, [0, y + 0.18, front + 0.12], [w2 - 0.05, 0.08, 0.15]);
    }

    // The pediment with the bell hung in an open arch under it, the cross over all
    b.tri(LIME, [-NW - 0.3, 13.4, front], [NW + 0.3, 13.4, front], [0, 15.9, front], [0, 0, 1]);
    b.bar(CREAM, [-NW - 0.5, 13.35, front + 0.2], [0, 16.05, front + 0.2], 0.12);
    b.bar(CREAM, [NW + 0.5, 13.35, front + 0.2], [0, 16.05, front + 0.2], 0.12);
    archPane(b, M.dark, 0, 10.6, front + 0.02, 1.4, 1.2);
    b.lathe(M.bronze, [0, 11.0, front - 0.25], [[0, 0.75], [0.12, 0.72], [0.2, 0.5], [0.26, 0.15], [0.34, 0], [0, 0.05]], 12);
    b.box(M.wood, [0, 11.85, front - 0.25], [0.7, 0.05, 0.05]);
    b.box(CREAM, [0, 16.2, front - 0.3], [0.4, 0.3, 0.4]);
    b.seeded(0.12, () => {
      b.box(NEON, [0, 17.4, front - 0.3], [0.07, 0.95, 0.07]);
      b.box(NEON, [0, 17.75, front - 0.3], [0.5, 0.07, 0.07]);
    });
    light([0, 17.6, front + 0.6], [0.6, 0.8, 1], 2.0, 9, 'tube', 0.12);
    // Doors: the great arched door in the centre, smaller ones in the side bays
    archPane(b, DOOR, 0, 0.05, front + 0.01, 2.4, 3.4);
    b.box(CREAM, [0, 3.0, front + 0.06], [1.35, 0.08, 0.06]);

    for (const s of [-1, 1]) {
      archPane(b, DOOR, s * 4.6, 0.05, front + 0.01, 1.4, 2.4);
      // Niches with the saints, and windows above them
      archPane(b, M.dark, s * 3.2, 5.4, front + 0.01, 0.9, 1.6);
      b.lathe(LIME, [s * 3.2, 5.45, front - 0.05], [[0.2, 0], [0.18, 0.6], [0.15, 1.1], [0.1, 1.3], [0.11, 1.45], [0, 1.6]], 8);
      archPane(b, GLASS, s * 6.0, 5.4, front + 0.01, 0.9, 1.8);
    }

    rose(b, GLASS, CREAM, 0, 7.0, front + 0.02, 1.1);
    // The facade's floodlight from the yard, and the warm light over the door
    light([0, 3.2, front + 1.6], [1, 0.82, 0.6], 3.5, 11, 'bulb', 0.2);
    b.blob({ color: [0, 0, 0], roughness: 1, emission: [12, 8, 4], pattern: P.BULB }, [0, 3.6, front + 0.35], [0.08, 0.08, 0.08], 6, 4);

    // ---- in the yard: the flagstaff and the open-air granite cross with its candles
    const yz = fz + 4.2;
    const FX = -5.5;
    b.box(M.granite, [FX, gy(FX, yz) + 0.35, yz], [0.7, 0.4, 0.7]);
    b.lathe(M.granite, [FX, gy(FX, yz) + 0.75, yz], [[0.55, 0], [0.4, 0.2], [0.3, 0.45], [0.2, 0.5], [0, 0.5]], 12);
    b.tube(M.bronze, [FX, gy(FX, yz) + 1.2, yz], 0.16, 0.08, 11, 10, { rings: 1 });

    for (let y = 1.6; y < 11.5; y += 0.55) b.lathe(M.bronze, [FX, gy(FX, yz) + y, yz], [[0, 0], [0.2 - y * 0.009, 0.02], [0.2 - y * 0.009, 0.08], [0, 0.1]], 10);
    b.box(M.bronze, [FX, gy(FX, yz) + 12.5, yz], [0.04, 0.35, 0.04]);
    b.box(M.bronze, [FX, gy(FX, yz) + 12.6, yz], [0.2, 0.04, 0.04]);
    const kz = yz + 4;
    const kg = gy(0, kz);

    for (let i = 0; i < 3; i++) b.box(M.granite, [0, kg + 0.2 + i * 0.4, kz], [1.5 - i * 0.4, 0.2 + (i === 0 ? 0.3 : 0), 1.5 - i * 0.4]);
    b.lathe(M.granite, [0, kg + 1.2, kz], [[0.4, 0], [0.5, 0.15], [0.3, 0.35], [0.2, 0.6], [0, 0.6]], 12);
    b.box(M.granite, [0, kg + 3.0, kz], [0.14, 1.3, 0.14]);
    b.box(M.granite, [0, kg + 3.6, kz], [0.7, 0.14, 0.14]);

    for (const [x, y] of [[0, 4.35], [0.75, 3.6], [-0.75, 3.6]] as const) b.blob(M.granite, [x, kg + y, kz], [0.12, 0.12, 0.12], 6, 4);
    // The candle stand at its foot: rows of thin white candles, most still burning
    b.box(M.steel, [0, kg + 0.75, kz + 1.35], [0.9, 0.02, 0.18]);

    for (const s of [-1, 1]) b.box(M.steel, [s * 0.85, kg + 0.38, kz + 1.35], [0.02, 0.38, 0.02]);
    b.seeded(0.27, () => {
      for (let i = 0; i < 11; i++) {
        const x = -0.8 + i * 0.16;
        const h = 0.08 + ((i * 7) % 5) * 0.03;
        const zz = kz + 1.3 + (i % 2) * 0.08;
        b.tube(CANDLE, [x, kg + 0.77, zz], 0.012, 0.012, h, 6, { rings: 1, cap: true });

        if (i % 4 !== 3) b.flame(M.flame, [x, kg + 0.77 + h, zz], 0.04);
      }
    });
    light([0, kg + 1.0, kz + 1.5], [1, 0.62, 0.28], 1.2, 5, 'oil', 0.27);

    // ---- the cemetery at the back, white crosses in rows
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 6; j++) {
        const x = -hx + 2.5 + j * 1.6;
        const z = -hz + 2 + i * 2.2;
        const gg = gy(x, z);
        b.box(GRAVE, [x, gg + 0.1, z + 0.6], [0.35, 0.12, 0.85]);

        if ((i + j) % 3 === 0) b.box(M.granite, [x, gg + 0.22, z + 0.7], [0.3, 0.02, 0.6]);
        b.box(GRAVE, [x, gg + 0.55, z - 0.2], [0.04, 0.45, 0.04]);
        b.box(GRAVE, [x, gg + 0.75, z - 0.2], [0.22, 0.04, 0.04]);
      }
    }

    // ---- the compound wall, white, an arched gate in front
    const wall = (ax: number, az: number, bx: number, bz: number, gap = 0) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2.4));

      for (let i = 0; i < n; i++) {
        const mx = ax + ((bx - ax) * (i + 0.5)) / n;
        const mz = az + ((bz - az) * (i + 0.5)) / n;

        if (gap && Math.abs(mx) < gap) continue;
        const gg = gy(mx, mz);
        const along = Math.abs(bx - ax) > Math.abs(bz - az);
        const half = len / n / 2 + 0.02;
        b.box(LIME, [mx, gg + 0.45, mz], [along ? half : 0.15, 0.9, along ? 0.15 : half]);
        b.box(CREAM, [mx, gg + 1.38, mz], [along ? half + 0.03 : 0.2, 0.05, along ? 0.2 : half + 0.03]);
      }
    };

    wall(-hx, hz, hx, hz, 2.2);
    wall(hx, hz, hx, -hz);
    wall(hx, -hz, -hx, -hz);
    wall(-hx, -hz, -hx, hz);
    const gg = gy(0, hz);

    for (const s of [-1, 1]) {
      b.box(LIME, [s * 2.0, gg + 1.4, hz], [0.35, 1.9, 0.35]);
      b.lathe(CREAM, [s * 2.0, gg + 3.3, hz], [[0.4, 0], [0.3, 0.15], [0.35, 0.3], [0.1, 0.5], [0, 0.7]], 8);
      b.box(CREAM, [s * 2.0, gg + 4.15, hz], [0.03, 0.2, 0.03]);
      b.box(CREAM, [s * 2.0, gg + 4.2, hz], [0.1, 0.03, 0.03]);
    }

    b.sweep(LIME, Array.from({ length: 9 }, (_, i) => [-1.75 + (3.5 * i) / 8, gg + 3.0 + Math.sin((Math.PI * i) / 8) * 0.9, hz] as V3), Array(9).fill(0.22), 6);
  });

  // ---- the wayside shrine down at the road, by the lane
  const sx = 102;
  const sz = roadZ(sx) - ROAD.half - 1.4;
  const sg = heightAt(sx, sz);
  b.with({ at: [sx, sg, sz], yaw: 0 }, () => {
    b.box(M.laterite, [0, 0.3, 0], [0.9, 0.35, 0.7]);
    b.box(LIME, [0, 0.75, 0], [0.8, 0.1, 0.6]);
    b.box(LIME, [0, 1.5, -0.45], [0.75, 0.65, 0.08]);

    for (const s of [-1, 1]) b.box(LIME, [s * 0.72, 1.5, 0], [0.06, 0.65, 0.55]);
    b.box(GLASS, [0, 1.5, 0.52], [0.68, 0.62, 0.008]);
    b.box(M.white, [0, 1.6, -0.3], [0.03, 0.45, 0.03]);
    b.box(M.white, [0, 1.8, -0.3], [0.2, 0.03, 0.03]);
    b.seeded(0.4, () => b.box(TUBE, [0, 2.08, 0.1], [0.45, 0.015, 0.015]));
    b.roof(M.tile, [0, 0, 0], [1.05, 0.9], [0.1, 0.85], 2.15, 2.75, { rows: 1, sides: [1, 3] });
    b.tri(LIME, [-0.95, 2.15, 0.6], [0.95, 2.15, 0.6], [0, 2.75, 0.6], [0, 0, 1]);
    b.box(LIME, [0, 2.95, 0.6], [0.03, 0.2, 0.03]);
    b.box(LIME, [0, 3.0, 0.6], [0.12, 0.03, 0.03]);
    b.box(M.steel, [0, 0.9, 0.85], [0.6, 0.015, 0.15]);
    b.seeded(0.21, () => {
      for (let i = 0; i < 6; i++) {
        const x = -0.5 + i * 0.2;
        b.tube(CANDLE, [x, 0.91, 0.85], 0.012, 0.012, 0.1 + (i % 3) * 0.04, 6, { rings: 1, cap: true });

        if (i !== 2) b.flame(M.flame, [x, 1.01 + (i % 3) * 0.04, 0.85], 0.04);
      }
    });
  });
  lamps.push({ position: [sx, sg + 2.0, sz + 0.2], color: [0.85, 0.95, 1], intensity: 1.6, range: 7, kind: 'tube', seed: 0.4 });
  lamps.push({ position: [sx, sg + 1.1, sz + 1.0], color: [1, 0.62, 0.28], intensity: 0.6, range: 3.5, kind: 'oil', seed: 0.21 });

  return { lamps };
}
