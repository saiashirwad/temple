// The mosque on the west side of town, an old Kerala mosque grown the way so many have: the
// prayer hall still under its two tiers of clay tiles with a wooden upper storey and a brass
// finial, but a new white front of pointed arches with green trim, a small green dome over the
// door and two slender minarets, their balconies ringed with green tube lights and loudspeakers.
// Beside it, the ablution tank; in front, a gate arch on the road.

import { Builder, hex, P, type Mat, type V3 } from '../../render/geo.ts';
import type { Lamp } from '../../render/flicker.ts';
import { M } from '../../content/world.ts';
import { heightAt } from '../terrain.ts';
import { MOSQUE } from './town.ts';

const WHITE: Mat = { color: hex(0xeceae2), roughness: 0.8, pattern: P.PLASTER };
const GREEN: Mat = { color: hex(0x1f7a4a), roughness: 0.6, pattern: P.PAINT };
const DOME: Mat = { color: hex(0x2a8a5a), roughness: 0.4, pattern: P.PAINT };
const GLOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [0.6, 5.5, 2.0], pattern: P.TUBE };
const TUBE: Mat = { color: [0, 0, 0], roughness: 1, emission: [5, 7, 7.5], pattern: P.TUBE };
const WATER: Mat = { color: hex(0x060a0c), roughness: 0.05, pattern: P.PLAIN };
const LANTERN: Mat = { color: [0, 0, 0], roughness: 1, emission: [2.2, 1.25, 0.5], pattern: P.BULB };
const BULB: Mat = { color: [0, 0, 0], roughness: 1, emission: [9, 5, 2], pattern: P.BULB };
const GLASS: Mat = { color: hex(0x0a0c10), roughness: 0.1, pattern: P.GLASS };
const GOLD = M.gold;

/** The points of a pointed (equilateral) arch from springing to springing, `w` wide. */
const arch = (x: number, y: number, z: number, w: number, n = 6): V3[] => {
  const pts: V3[] = [];

  for (let i = 0; i <= n; i++) {
    const t = Math.PI - (i / n) * (Math.PI / 3);
    pts.push([x + w / 2 + Math.cos(t) * w, y + Math.sin(t) * w, z]);
  }

  for (let i = n - 1; i >= 0; i--) {
    const t = (i / n) * (Math.PI / 3);
    pts.push([x - w / 2 + Math.cos(t) * w, y + Math.sin(t) * w, z]);
  }

  return pts;
};

/** A minaret: a square base, an octagonal shaft with two balconies, a dome and crescent. */
function minaret(b: Builder, x: number, z: number, h: number, seed: number) {
  b.box(WHITE, [x, 2.2, z], [0.85, 2.2, 0.85]);
  b.box(GREEN, [x, 4.45, z], [0.92, 0.06, 0.92]);
  b.lathe(WHITE, [x, 4.5, z], [[0.75, 0], [0.62, 0.3], [0.58, h * 0.45], [0.52, h * 0.5]], 8);

  const balcony = (y: number, r: number) => {
    b.lathe(WHITE, [x, y - 0.35, z], [[0.5, 0], [0.8, 0.3], [r, 0.35], [r, 0.42], [0.5, 0.42]], 8);

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.bar(WHITE, [x + Math.cos(a) * (r - 0.04), y + 0.05, z + Math.sin(a) * (r - 0.04)], [x + Math.cos(a) * (r - 0.04), y + 0.55, z + Math.sin(a) * (r - 0.04)], 0.03 * Math.SQRT2);
    }

    b.lathe(GREEN, [x, y + 0.55, z], [[r - 0.06, 0], [r, 0], [r, 0.06], [r - 0.06, 0.06]], 16);
    b.seeded(seed, () => b.lathe(GLOW, [x, y - 0.42, z], [[r + 0.01, 0], [r + 0.01, 0.05], [0, 0.05]], 16));
  };

  const y1 = 4.5 + h * 0.5;
  balcony(y1, 1.05);
  b.lathe(WHITE, [x, y1 + 0.42, z], [[0.52, 0], [0.46, h * 0.3]], 8);
  const y2 = y1 + 0.42 + h * 0.3;
  balcony(y2, 0.85);

  // Loudspeakers on the upper balcony, facing the town
  for (const a of [0.4, 2.0, 3.6, 5.2]) {
    b.with({ at: [x + Math.cos(a) * 0.55, y2 + 0.9, z + Math.sin(a) * 0.55], yaw: Math.PI / 2 - a }, () => {
      b.sweep(M.steel, [[0, 0, 0], [0, -0.05, 0.3]], [0.04, 0.16], 8);
    });
  }

  // The lantern, the dome and the crescent
  b.lathe(WHITE, [x, y2 + 0.42, z], [[0.42, 0], [0.42, 1.2], [0.5, 1.3]], 8);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.with({ at: [x + Math.cos(a) * 0.4, 0, z + Math.sin(a) * 0.4], yaw: Math.PI / 2 - a }, () => archPaneZ(b, GLASS, 0, y2 + 0.6, 0.01, 0.22, 0.55));
  }

  b.lathe(DOME, [x, y2 + 1.72, z], [[0.55, 0], [0.62, 0.15], [0.6, 0.35], [0.45, 0.6], [0.22, 0.82], [0.06, 1.0], [0.03, 1.2], [0, 1.25]], 14);
  b.lathe(GOLD, [x, y2 + 2.95, z], [[0.05, 0], [0.07, 0.1], [0.03, 0.2], [0, 0.25]], 8);
  const cy = y2 + 3.45;
  const pts: V3[] = [];

  for (let i = 0; i <= 10; i++) {
    const a = -0.6 * Math.PI + (i / 10) * 1.2 * Math.PI;
    pts.push([x + Math.sin(a) * 0.25, cy + Math.cos(a) * 0.25, z]);
  }

  b.sweep(GOLD, pts, pts.map((_, i) => 0.02 + 0.03 * Math.sin((Math.PI * i) / 10)), 5);

  return { top: [x, y1, z] as V3, upper: [x, y2, z] as V3 };
}

/** A pointed-arch pane facing +z, for windows. */
function archPaneZ(b: Builder, mat: Mat, x: number, y: number, z: number, w: number, h: number) {
  b.box(mat, [x, y + h / 2, z], [w / 2, h / 2, 0.01]);
  const pts = arch(x, y + h, z + 0.01, w, 4);

  for (let i = 0; i + 1 < pts.length; i++) b.tri(mat, [x, y + h, z + 0.01], pts[i]!, pts[i + 1]!, [0, 0, 1]);
}

export function buildMosque(b: Builder) {
  const lamps: Lamp[] = [];
  const { x: X, z: Z, yaw, hx, hz } = MOSQUE;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const toWorld = (lx: number, lz: number): [number, number] => [X + lx * c + lz * s, Z - lx * s + lz * c];

  const g = (lx: number, lz: number) => {
    const [x, z] = toWorld(lx, lz);

    return heightAt(x, z);
  };

  let top = -Infinity;

  for (const lx of [-8, 0, 8]) for (const lz of [-8, 0, 8]) top = Math.max(top, g(lx, lz));
  const F = top + 0.6;
  const gy = (lx: number, lz: number) => g(lx, lz) - F;

  const light = (p: V3, color: V3, intensity: number, range: number, kind: Lamp['kind'], seed: number) => {
    const [x, z] = toWorld(p[0], p[2]);
    lamps.push({ position: [x, F + p[1], z], color, intensity, range, kind, seed });
  };

  b.with({ at: [X, F, Z], yaw }, () => {
    const HW = 7;
    const HD = 6;
    const hzc = -1.5;
    // The plinth under hall and veranda
    b.box(M.laterite, [0, -2.2, 0.5], [HW + 1.2, 2.2, HD + 3.8], 'y-');
    b.box(M.granite, [0, 0.02, 0.5], [HW + 1.2, 0.03, HD + 3.8]);

    for (let i = 0; i < 3; i++) b.box(M.granite, [0, (-i * 0.2 - 1.4) / 2, HD + 4.5 + i * 0.32 + 0.0], [3, (1.4 - i * 0.2) / 2, 0.16], 'y-');

    // ---- the old prayer hall, two tiers of tiles, a wooden upper storey
    b.box(WHITE, [0, 2.4, hzc], [HW, 2.4, HD], 'y-');

    for (const sx of [-1, 1]) {
      for (const lz of [-4.5, -1.5, 1.5]) {
        b.with({ at: [sx * HW, 0, hzc + lz], yaw: (sx * Math.PI) / 2 }, () => {
          archPaneZ(b, GLASS, 0, 1.0, 0.01, 0.9, 1.4);
          b.box(GREEN, [0, 0.95, 0.04], [0.55, 0.04, 0.05]);
        });
      }
    }

    b.roof(M.tile, [0, 0, hzc], [HW + 1.2, HD + 1.2], [HW - 1.6, HD - 1.6], 4.6, 6.0, { sag: 0.08, rows: 4 });
    b.frustum(M.wood, [0, 0, hzc], [HW + 1.2, HD + 1.2], [HW + 1.12, HD + 1.12], 4.52, 4.6, 'bottom');
    b.box(M.teak, [0, 6.6, hzc], [HW - 1.8, 0.9, HD - 1.8], 'y-');

    for (let x = -HW + 2.6; x <= HW - 2.6; x += 0.25) for (const sz of [-1, 1]) b.box(M.wood, [x, 6.6, hzc + sz * (HD - 1.78)], [0.025, 0.7, 0.02]);
    b.roof(M.tile, [0, 0, hzc], [HW - 0.6, HD - 0.6], [HW * 0.35, 0.12], 7.3, 10.2, { sag: 0.12, rows: 5 });
    b.frustum(M.wood, [0, 0, hzc], [HW - 0.6, HD - 0.6], [HW - 0.68, HD - 0.68], 7.22, 7.3, 'bottom');

    for (const sx of [-1, 1]) b.lathe(M.brass, [sx * HW * 0.35, 10.2, hzc], [[0.1, 0], [0.06, 0.2], [0.11, 0.4], [0.04, 0.65], [0.06, 0.8], [0, 1.0]], 8);

    // ---- the new front: a veranda of pointed arches, a parapet, a dome over the door
    const fz = HD + hzc;
    const vz = fz + 3.2;
    const n = 5;
    const span = (HW * 2) / n;
    const spring = 2.5;
    const apex = spring + span * 0.866 * 0.85;
    b.box(WHITE, [0, 2.4, fz + 0.05], [HW - 0.02, 2.4, 0.05]);

    for (let i = 0; i <= n; i++) {
      const x = -HW + i * span;
      b.box(WHITE, [x, spring / 2, vz], [0.28, spring / 2, 0.28]);
      b.box(GREEN, [x, spring - 0.05, vz], [0.32, 0.06, 0.32]);
      b.box(GREEN, [x, 0.08, vz], [0.34, 0.08, 0.34]);
      // The wall over the pillar, between the feet of its two arches
      b.box(WHITE, [x, (spring + apex + 0.3) / 2, vz + 0.27], [0.3, (apex + 0.3 - spring) / 2, 0.02]);
    }

    for (let i = 0; i < n; i++) {
      const x = -HW + (i + 0.5) * span;
      const pts = arch(x, spring, vz + 0.29, span - 0.56).map(([px, py, pz]): V3 => [px, spring + (py - spring) * 0.85, pz]);
      b.sweep(GREEN, pts, pts.map(() => 0.06), 4);

      // The spandrels, filled up to the band above
      for (let k = 0; k + 1 < pts.length; k++) {
        const cx = pts[k]![0] < x ? x - span / 2 : x + span / 2;
        b.tri(WHITE, [cx, apex + 0.3, vz + 0.28], pts[k]!, pts[k + 1]!, [0, 0, 1]);
      }

      b.tri(WHITE, [x - span / 2, apex + 0.3, vz + 0.28], [x, apex + 0.3, vz + 0.28], pts[Math.floor(pts.length / 2)]!, [0, 0, 1]);
      b.tri(WHITE, [x, apex + 0.3, vz + 0.28], [x + span / 2, apex + 0.3, vz + 0.28], pts[Math.floor(pts.length / 2)]!, [0, 0, 1]);
    }

    b.box(WHITE, [0, apex + 0.65, vz], [HW + 0.3, 0.35, 0.3]);
    b.box(GREEN, [0, apex + 1.03, vz], [HW + 0.35, 0.04, 0.34]);
    b.box(WHITE, [0, apex + 0.5, (fz + vz) / 2], [HW, 0.1, (vz - fz) / 2]);

    // Crenellated parapet
    for (let x = -HW; x <= HW + 0.01; x += 0.7) {
      b.box(WHITE, [x, apex + 1.3, vz], [0.18, 0.25, 0.2]);
      b.lathe(GREEN, [x, apex + 1.55, vz], [[0.12, 0], [0, 0.18]], 4);
    }

    // The doors to the hall
    for (const x of [-3.4, 0, 3.4]) {
      archPaneZ(b, M.teak, x, 0.05, fz + 0.11, 1.4, 2.0);
      b.box(GREEN, [x, 2.05, fz + 0.14], [0.8, 0.05, 0.04]);
    }

    // The dome over the central bay
    b.box(WHITE, [0, apex + 1.6, vz - 1.5], [1.6, 0.5, 1.6]);
    b.lathe(DOME, [0, apex + 2.1, vz - 1.5], [[1.55, 0], [1.6, 0.25], [1.5, 0.7], [1.15, 1.25], [0.6, 1.7], [0.15, 1.95], [0, 2.0]], 18);
    b.lathe(GOLD, [0, apex + 4.1, vz - 1.5], [[0.06, 0], [0.09, 0.15], [0.04, 0.3], [0, 0.35]], 8);
    // White tube in the veranda, and green ones on the minarets
    b.seeded(0.36, () => b.box(TUBE, [0, apex - 0.1, vz - 0.6], [0.5, 0.015, 0.015]));
    light([0, apex - 0.4, vz - 0.8], [0.85, 0.95, 1], 2.6, 10, 'tube', 0.36);
    const mz2 = vz + 0.2;

    for (const sx of [-1, 1]) {
      const m = minaret(b, sx * (HW + 0.6), mz2, 15, 0.08 + (sx > 0 ? 0.1 : 0));
      light([m.top[0], m.top[1] - 0.6, m.top[2]], [0.2, 1, 0.45], 1.2, 7, 'tube', 0.08 + (sx > 0 ? 0.1 : 0));
      light([m.upper[0], m.upper[1] - 0.6, m.upper[2]], [0.2, 1, 0.45], 0.9, 6, 'tube', 0.08 + (sx > 0 ? 0.1 : 0));
    }

    // ---- the ablution tank beside the hall, under a little tiled roof
    const tx = HW + 4.5;
    const tz = hzc;
    const tg = gy(tx, tz);
    b.box(M.laterite, [tx, tg + 0.35, tz], [2.2, 0.45, 1.6]);
    b.box(WATER, [tx, tg + 0.75, tz], [1.95, 0.02, 1.35]);
    b.box(M.granite, [tx, tg + 0.82, tz], [2.25, 0.04, 1.65], 'y-');

    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(WHITE, [tx + sx * 2.1, tg + 1.8, tz + sz * 1.5], [0.12, 1.0, 0.12]);
    b.roof(M.tile, [tx, 0, tz], [2.7, 2.1], [1.2, 0.1], tg + 2.8, tg + 3.9, { rows: 2 });

    for (let i = -3; i <= 3; i++) b.box(M.steel, [tx + i * 0.5, tg + 0.95, tz + 1.62], [0.02, 0.12, 0.02]);

    // ---- the compound wall and the gate arch on the road
    const wall = (ax: number, az: number, bx: number, bz: number, gap = 0) => {
      const len = Math.hypot(bx - ax, bz - az);
      const k = Math.max(1, Math.round(len / 2.4));

      for (let i = 0; i < k; i++) {
        const mx = ax + ((bx - ax) * (i + 0.5)) / k;
        const mzz = az + ((bz - az) * (i + 0.5)) / k;

        if (gap && Math.abs(mx) < gap) continue;
        const gg = gy(mx, mzz);
        const along = Math.abs(bx - ax) > Math.abs(bz - az);
        const half = len / k / 2 + 0.02;
        b.box(WHITE, [mx, gg + 0.4, mzz], [along ? half : 0.14, 0.8, along ? 0.14 : half]);
        b.box(GREEN, [mx, gg + 1.24, mzz], [along ? half + 0.03 : 0.18, 0.04, along ? 0.18 : half + 0.03]);
      }
    };

    wall(-hx, hz, hx, hz, 2.3);
    wall(hx, hz, hx, -hz);
    wall(hx, -hz, -hx, -hz);
    wall(-hx, -hz, -hx, hz);
    const gg = gy(0, hz);

    for (const sx of [-1, 1]) {
      b.box(WHITE, [sx * 2.1, gg + 2.6, hz], [0.32, 2.6, 0.32]);
      b.lathe(DOME, [sx * 2.1, gg + 5.2, hz], [[0.32, 0], [0.34, 0.15], [0.22, 0.4], [0.05, 0.6], [0, 0.65]], 10);
    }

    const gate = arch(0, gg + 3.0, hz, 3.6 * 0.6);
    b.sweep(GREEN, gate.map(([x, y, z]): V3 => [x * (1.8 / 1.08), y, z]), gate.map(() => 0.16), 6);
    b.box(WHITE, [0, gg + 4.98, hz], [1.8, 0.2, 0.24]);
    b.seeded(0.2, () => b.box(GLOW, [0, gg + 4.98, hz + 0.26], [1.6, 0.03, 0.02]));
    // A brass lantern hung on a chain under the gate arch, its bulb warm through frosted glass:
    // the light the men at the gate stand and talk in
    const ly = gg + 3.55;
    b.bar(M.steel, [0, gg + 4.78, hz], [0, ly + 0.36, hz], 0.008);
    b.lathe(GOLD, [0, ly + 0.26, hz], [[0.13, 0], [0.1, 0.07], [0.03, 0.1], [0, 0.12]], 8);

    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) b.bar(GOLD, [px * 0.1, ly - 0.2, hz + pz * 0.1], [px * 0.11, ly + 0.26, hz + pz * 0.11], 0.008);
    b.box(LANTERN, [0, ly + 0.03, hz], [0.095, 0.22, 0.095]);
    b.lathe(GOLD, [0, ly - 0.22, hz], [[0.12, 0], [0.12, 0.03], [0, 0.03]], 8);
    b.blob(BULB, [0, ly + 0.03, hz], [0.04, 0.05, 0.04], 6, 4);
    light([0, ly, hz], [1, 0.6, 0.28], 3.4, 11, 'bulb', 0.52);
  });

  return { lamps };
}
