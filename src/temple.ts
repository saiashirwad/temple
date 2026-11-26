// The temple compound after Vadakkunnathan in Thrissur, built once on the CPU: the high laterite
// wall and the gopuram over the way in, with its granite base, open doors, carved brackets and
// copper-sheeted roofs with ornate gables; the theatre hall (koothambalam) to the left; the
// pavilion of the great offering stone; the cloister (chuttambalam) with its lattice of lamps;
// the round shrine with its conical copper roofs, mural walls and false doors; the prayer
// pavilion with Nandi; a small Ganapathi shrine; and the brass lamp tower. Returns the model and
// every lit flame's light.

import { Builder, P, rng, type V3 } from './geo.ts';
import { BALIKKAL, CLOISTER, COMPOUND, GANAPATHI, GATE, GROUND, KOOTH, LAMP_TOWER, M, MANDAPAM, SHRINE } from './world.ts';
import type { Lamp } from './flicker.ts';

export type { Lamp } from './flicker.ts';

const OIL: V3 = [1, 0.5, 0.16];
const TAU = Math.PI * 2;

export function buildTemple() {
  const b = new Builder(true);
  const lamps: Lamp[] = [];
  const rand = rng(11);
  const G = GROUND;

  /** A brass lamp cup (a little chiraath with a pinched spout) and, when lit, its flame. */
  const cup = (p: V3, lit: boolean, size = 1, seed = rand() * 0.45) => {
    const s = size;
    b.lathe(M.brass, [p[0], p[1] - 0.035 * s, p[2]], [[0, 0], [0.012 * s, 0], [0.014 * s, 0.008 * s], [0.03 * s, 0.02 * s], [0.036 * s, 0.034 * s], [0.03 * s, 0.036 * s], [0.0, 0.03 * s]], 8);
    if (lit) b.seeded(seed, () => b.flame(M.flame, [p[0], p[1] - 0.004 * s, p[2]], 0.05 * s));
  };
  /** An oil light in the table, keeping time with the flames built under the same seed. */
  const oil = (p: V3, intensity: number, range: number, seed: number, shadow = false) =>
    lamps.push({ position: p, color: OIL, intensity, range, seed, kind: 'oil', shadow });

  /** A standing brass lamp (nilavilakku): a lotus foot, a ringed stem and a dish of wicks. */
  const nilavilakku = (at: V3, height: number, wicks: number, seed: number) => {
    const k = height / 1.6;
    const prof: [number, number][] = [
      [0, 0], [0.26, 0], [0.28, 0.03], [0.24, 0.06], [0.16, 0.09], [0.1, 0.13], [0.12, 0.17], [0.06, 0.22],
      [0.045, 0.3], [0.06, 0.34], [0.04, 0.38], [0.042, 0.7], [0.07, 0.74], [0.04, 0.78], [0.042, 1.1], [0.075, 1.14],
      [0.045, 1.18], [0.06, 1.24], [0.2, 1.3], [0.24, 1.33], [0.23, 1.36], [0.05, 1.37], [0.05, 1.42], [0.09, 1.46],
      [0.04, 1.5], [0.06, 1.56], [0.0, 1.62],
    ];
    b.lathe(M.brass, at, prof.map(([r, y]) => [r * k, y * k]), 18);
    b.seeded(seed, () => {
      for (let i = 0; i < wicks; i++) {
        const a = (i / wicks) * TAU + 0.3;
        b.flame(M.flame, [at[0] + Math.sin(a) * 0.205 * k, at[1] + 1.355 * k, at[2] + Math.cos(a) * 0.205 * k], 0.06 * k);
      }
    });
  };

  /**
   * An ornate gable (mukhappu) facing +z in the current frame, its eaves at `y`, `w` wide,
   * `h` tall, reaching from z0 back into the roof out to z1: copper slopes, a red lacquered
   * face with a sunburst of carved slats round an arch, upturned barge boards and a finial.
   */
  const gable = (y: number, w: number, h: number, z0: number, z1: number, roofMat = M.copper) => {
    const hw = w / 2 + 0.25;
    for (const s of [-1, 1]) {
      b.plane(roofMat, [s * hw, y - 0.12, z1], [s * hw, y - 0.12, z0], [0, y + h, z0], [0, y + h, z1], [s, 1, 0]);
      b.plane(M.teak, [s * hw, y - 0.16, z1], [s * hw, y - 0.16, z0], [0, y + h - 0.06, z0], [0, y + h - 0.06, z1], [-s, -1, 0]);
      // Barge boards curling up at the eaves
      const fz = z1 + 0.04;
      b.sweep(M.woodRed, [[0, y + h + 0.05, fz], [s * hw * 0.5, y + h / 2 + 0.02, fz], [s * hw * 0.95, y - 0.05, fz], [s * (hw + 0.12), y + 0.08, fz], [s * (hw + 0.14), y + 0.22, fz]], [0.05, 0.05, 0.05, 0.04, 0.02], 4);
    }
    const fz = z1 - 0.22;
    b.tri(M.woodRed, [-w / 2, y, fz], [w / 2, y, fz], [0, y + h - 0.1, fz], [0, 0, 1]);
    // The sunburst: slats fanning out from the arch to the slopes
    const cy = y + 0.05;
    const n = 11;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const ex = (t * 2 - 1) * (w / 2) * (1 - Math.abs(t * 2 - 1) * 0.05);
      const ey = y + (h - 0.12) * (1 - Math.abs(t * 2 - 1));
      b.bar(M.teak, [ex * 0.32, cy + (ey - y) * 0.3, fz + 0.03], [ex * 0.96, y + (ey - y) * 0.96, fz + 0.03], 0.018);
    }
    // The arch (kudu): a ring of gold round a dark niche with a little lamp glow
    const r = Math.min(w * 0.16, h * 0.32);
    const arc: V3[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (i / 14);
      arc.push([Math.cos(a) * r, cy + Math.sin(a) * r, fz + 0.05]);
    }
    b.sweep(M.gold, arc, arc.map(() => 0.025), 5);
    b.disc(M.dark, [0, cy, fz + 0.02], r * 0.95, 12, 1);
    b.with({ at: [0, cy, fz + 0.03], yaw: 0 }, () => b.tri(M.dark, [-r, 0, 0], [r, 0, 0], [0, r, 0], [0, 0, 1]));
    // A beam across the foot and a gold finial at the apex, pointing out
    b.box(M.woodRed, [0, y + 0.02, fz + 0.04], [w / 2 + 0.1, 0.05, 0.05]);
    b.lathe(M.gold, [0, y + h - 0.02, z1 - 0.05], [[0, 0], [0.07, 0.03], [0.05, 0.1], [0.07, 0.16], [0.02, 0.26], [0, 0.32]], 10);
  };

  /** Kalasam finials on a ridge: stacked pots ending in a spike. */
  const finial = (p: V3, k = 1) =>
    b.lathe(M.gold, p, ([[0, 0], [0.16, 0.03], [0.17, 0.08], [0.06, 0.13], [0.15, 0.22], [0.17, 0.3], [0.07, 0.4], [0.11, 0.46], [0.12, 0.52], [0.04, 0.6], [0.05, 0.7], [0.015, 0.95], [0, 1.0]] as [number, number][]).map(([r, y]) => [r * k, y * k]), 14);

  /** Rafter ends along an eave from a to b, under the roof edge. */
  const rafters = (a: V3, c: V3, out: [number, number], spacing = 0.42) => {
    const L = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const n = Math.floor(L / spacing);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a[0] + (c[0] - a[0]) * t;
      const z = a[2] + (c[2] - a[2]) * t;
      b.bar(M.teak, [x - out[0] * 0.9, a[1] + 0.35, z - out[1] * 0.9], [x + out[0] * 0.05, a[1] - 0.03, z + out[1] * 0.05], 0.035);
    }
    b.bar(M.woodRed, [a[0], a[1] - 0.05, a[2]], [c[0], c[1] - 0.05, c[2]], 0.05);
  };
  /** Eave rafters, fascia and soffit all round a rectangular roof edge (half sizes `e`) at `y`. */
  const eaves = (c: V3, e: [number, number], y: number, wall: [number, number]) => {
    const [x, , z] = c;
    rafters([x - e[0], y, z + e[1]], [x + e[0], y, z + e[1]], [0, 1]);
    rafters([x + e[0], y, z - e[1]], [x - e[0], y, z - e[1]], [0, -1]);
    rafters([x + e[0], y, z + e[1]], [x + e[0], y, z - e[1]], [1, 0]);
    rafters([x - e[0], y, z - e[1]], [x - e[0], y, z + e[1]], [-1, 0]);
    b.frustum(M.teak, [x, 0, z], e, wall, y - 0.04, y + 0.3, '', [-0.3, -1]);
  };
  /** Diagonal carved brackets (struts) from a wall up to the eave, at points along a side. */
  const struts = (pts: [number, number][], out: [number, number], y0: number, y1: number, reach: number) => {
    for (const [x, z] of pts) {
      b.sweep(M.teak, [[x, y0, z], [x + out[0] * reach * 0.4, (y0 + y1) / 2 + 0.05, z + out[1] * reach * 0.4], [x + out[0] * reach, y1, z + out[1] * reach]], [0.05, 0.07, 0.04], 5);
      // A carved figure on the strut: a swelling with a head
      b.blob(M.teak, [x + out[0] * reach * 0.42, (y0 + y1) / 2 + 0.08, z + out[1] * reach * 0.42], [0.07, 0.16, 0.07], 6, 4, 0.3);
    }
  };

  // ================================================================ outer compound wall
  const H = COMPOUND.height;
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const half: V3 = [Math.abs(x1 - x0) / 2 + COMPOUND.thick / 2, H / 2, Math.abs(z1 - z0) / 2 + COMPOUND.thick / 2];
    const c: V3 = [(x0 + x1) / 2, G + H / 2, (z0 + z1) / 2];
    b.box(M.laterite, [c[0], G + 0.25, c[2]], [half[0] + 0.08, 0.35, half[2] + 0.08], 'y-');
    b.box(M.laterite, c, half, 'y-');
    // Buttress pilasters every few metres, on both faces
    const L = along ? half[0] * 2 : half[2] * 2;
    for (let s = 1.7; s < L - 0.5; s += 3.4) {
      const px = along ? c[0] - half[0] + s : c[0];
      const pz = along ? c[2] : c[2] - half[2] + s;
      b.box(M.laterite, [px, G + H / 2 - 0.1, pz], along ? [0.25, H / 2 - 0.1, half[2] + 0.12] : [half[0] + 0.12, H / 2 - 0.1, 0.25], 'y-');
    }
    // Tiled coping with a little hip at each end, and a dark drip line under it
    const top = G + H;
    b.roof(M.tile, [c[0], 0, c[2]], along ? [half[0] + 0.05, half[2] + 0.28] : [half[0] + 0.28, half[2] + 0.05], along ? [half[0] - 0.1, 0.03] : [0.03, half[2] - 0.1], top - 0.04, top + 0.42, { sag: 0.05, rows: 2 });
    b.box(M.teak, [c[0], top - 0.06, c[2]], along ? [half[0] + 0.05, 0.04, half[2] + 0.26] : [half[0] + 0.26, 0.04, half[2] + 0.05], 'y+');
  };
  const { x: cx0, z0: cz0, z1: cz1 } = COMPOUND;
  const gateHalf = 4.1;
  wall(-cx0, cz0, cx0, cz0);
  wall(-cx0, cz0, -cx0, cz1);
  wall(cx0, cz0, cx0, cz1);
  wall(-cx0, cz1, -gateHalf, cz1);
  wall(gateHalf, cz1, cx0, cz1);

  // ================================================================ the gopuram over the way in
  b.with({ at: GATE, yaw: 0 }, () => {
    const W = 4.3;
    const D = 3.0;
    // Granite base in mouldings, steps up from the road and down into the yard
    b.box(M.granite, [0, 0.12, 0], [W + 0.25, 0.12, D + 0.25], 'y-');
    b.frustum(M.granite, [0, 0, 0], [W + 0.2, D + 0.2], [W + 0.05, D + 0.05], 0.24, 0.36, '');
    b.box(M.granite, [0, 0.43, 0], [W + 0.08, 0.07, D + 0.08], 'y-');
    b.box(M.granite, [0, 0.62, 0], [W, 0.12, D], 'y-');
    b.box(M.granite, [0, 0.76, 0], [W + 0.1, 0.03, D + 0.1], 'y-');
    for (const s of [1, -1]) {
      for (let i = 0; i < 4; i++) b.box(M.granite, [0, 0.1 + i * 0.2, s * (D + 1.1 - i * 0.3)], [1.9 - i * 0.03, 0.1 + i * 0.1, 0.16], 'y-');
    }
    // The side halls: plastered walls on laterite, murals between pillars facing the passage
    for (const s of [-1, 1]) {
      b.box(M.lateriteDark, [s * (W - 0.85), 0.79 + 0.3, 0], [0.85, 0.3, D - 0.4], 'y-');
      b.box(M.plaster, [s * (W - 0.85), 0.79 + 0.6 + 1.0, 0], [0.85, 1.0, D - 0.4], 'y-');
      b.box(M.mural, [s * (W - 1.72), 0.79 + 1.5, 0], [0.02, 0.7, D - 0.9], 'y-');
    }
    // Pillars round the passage and along the front, lathe-turned bands
    const pillar = (x: number, z: number) => {
      b.tube(M.woodRed, [x, 0.79, z], 0.15, 0.13, 3.0, 10, { rings: 1 });
      for (const y of [0.95, 1.9, 3.0]) b.tube(M.teak, [x, 0.79 + y - 0.05, z], 0.17, 0.17, 0.1, 10, { cap: true });
      b.box(M.teak, [x, 0.79 + 0.08, z], [0.19, 0.08, 0.19]);
      b.box(M.teak, [x, 0.79 + 3.06, z], [0.24, 0.06, 0.24]);
    };
    for (const px of [-1.75, 1.75, -W + 0.2, W - 0.2]) for (const pz of [-D + 0.2, D - 0.2]) pillar(px, pz);
    // The great doors, open inward, studded with brass
    for (const s of [-1, 1]) {
      b.with({ at: [s * 1.6, 0.79, -0.4], yaw: s * 1.25 }, () => {
        b.box(M.teak, [-s * 0.78, 1.4, 0], [0.78, 1.4, 0.06]);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 9; j++) b.blob(M.brass, [-s * (0.14 + i * 0.25), 0.25 + j * 0.31, 0.07], [0.03, 0.03, 0.025], 5, 3);
        b.box(M.woodRed, [-s * 0.78, 1.4, 0.07], [0.7, 0.02, 0.01]);
      });
    }
    b.box(M.woodRed, [0, 0.79 + 2.95, -0.4], [1.75, 0.16, 0.12]);
    // Beams of the first floor
    b.box(M.teak, [0, 3.95, 0], [W + 0.05, 0.12, D + 0.05]);
    // Lower roof: tiles running out over the base, with rafters and soffit
    b.roof(M.tile, [0, 0, 0], [W + 1.25, D + 1.15], [W - 0.35, D - 0.45], 3.65, 4.75, { sag: 0.14 });
    eaves([0, 0, 0], [W + 1.25, D + 1.15], 3.65, [W, D]);
    struts([[-W + 0.2, D - 0.2], [-1.75, D - 0.2], [1.75, D - 0.2], [W - 0.2, D - 0.2]], [0, 1], 2.7, 3.55, 1.0);
    struts([[-W + 0.2, -D + 0.2], [-1.75, -D + 0.2], [1.75, -D + 0.2], [W - 0.2, -D + 0.2]], [0, -1], 2.7, 3.55, 1.0);
    // The upper storey: wooden lattice screens of close slats between posts
    const UW = W - 0.5;
    const UD = D - 0.6;
    b.box(M.dark, [0, 5.35, 0], [UW - 0.08, 0.7, UD - 0.08], 'y-');
    for (const [ax, az, bx, bz] of [[-UW, UD, UW, UD], [UW, -UD, -UW, -UD], [UW, UD, UW, -UD], [-UW, -UD, -UW, UD]] as const) {
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(L / 0.11);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        b.box(i % 9 === 0 ? M.woodRed : M.teak, [x, 5.35, z], [i % 9 === 0 ? 0.06 : 0.018, 0.7, i % 9 === 0 ? 0.06 : 0.018]);
      }
      b.bar(M.woodRed, [ax, 4.62, az], [bx, 4.62, bz], 0.06);
      b.bar(M.woodRed, [ax, 6.08, az], [bx, 6.08, bz], 0.06);
    }
    // Middle roof in copper, a gable front and back
    b.roof(M.copper, [0, 0, 0], [UW + 1.05, UD + 1.0], [UW - 1.0, UD - 0.9], 6.05, 7.25, { sag: 0.16 });
    eaves([0, 0, 0], [UW + 1.05, UD + 1.0], 6.05, [UW, UD]);
    // The top storey and its roof, with the great gables and five finials
    b.box(M.dark, [0, 7.55, 0], [UW - 1.05, 0.35, UD - 0.95], 'y-');
    for (let i = -8; i <= 8; i++) for (const s of [-1, 1]) b.box(M.teak, [i * ((UW - 1.05) / 8), 7.55, s * (UD - 0.93)], [0.02, 0.35, 0.02]);
    b.roof(M.copper, [0, 0, 0], [UW + 0.35, UD + 0.45], [UW - 1.7, 0.08], 7.85, 9.9, { sag: 0.18 });
    eaves([0, 0, 0], [UW + 0.35, UD + 0.45], 7.85, [UW - 1.05, UD - 0.95]);
    for (const s of [1, -1]) {
      b.with({ at: [0, 0, 0], yaw: s > 0 ? 0 : Math.PI }, () => {
        gable(8.15, 2.6, 1.55, UD - 0.9, UD + 0.75);
        gable(6.3, 2.2, 0.95, UD - 0.4, UD + 1.25);
      });
    }
    b.box(M.copper, [0, 9.95, 0], [UW - 1.65, 0.07, 0.13]);
    for (const fx of [-(UW - 1.7), -(UW - 1.7) / 2, 0, (UW - 1.7) / 2, UW - 1.7]) finial([fx, 9.98, 0], fx === 0 ? 1.15 : 0.8);
    // A hanging brass lamp (thookku vilakku) in the passage, chains and a tiered body
    b.tube(M.brass, [0, 2.05, 0], 0.006, 0.006, 1.9, 4);
    b.lathe(M.brass, [0, 1.72, 0], [[0, -0.15], [0.03, -0.1], [0.05, -0.02], [0.2, 0.03], [0.24, 0.08], [0.22, 0.11], [0.06, 0.13], [0.04, 0.2], [0.1, 0.26], [0.03, 0.33], [0, 0.36]], 18);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      cup([Math.sin(a) * 0.21, 1.86, Math.cos(a) * 0.21], true, 1.2, 0.11);
    }
    oil([GATE[0], G + 2.0, GATE[2]], 3.0, 9, 0.11, true);
    // Two tall standing lamps outside the gate
    for (const s of [-1, 1]) {
      const at: V3 = [s * 2.4, 0.0, D + 1.9];
      const seed = 0.2 + s * 0.1;
      nilavilakku(at, 1.7, 5, seed);
      oil([GATE[0] + at[0], G + 1.65, GATE[2] + at[2]], 1.8, 6, seed);
    }
  });

  // ================================================================ cloister (chuttambalam)
  {
    const { x: cx, z0: kz0, z1: kz1, height: h, depth } = CLOISTER;
    const top = G + h;
    const door = 1.6;
    const mz = (kz0 + kz1) / 2;
    const hz = (kz1 - kz0) / 2;
    const seg = (ax: number, az: number, bx: number, bz: number) => {
      const c: V3 = [(ax + bx) / 2, 0, (az + bz) / 2];
      const hs: V3 = [Math.abs(bx - ax) / 2 + 0.2, 0, Math.abs(bz - az) / 2 + 0.2];
      b.box(M.plaster, [c[0], G + 0.6 + (h - 0.6) / 2, c[2]], [hs[0], (h - 0.6) / 2, hs[2]], 'y-');
      b.box(M.lateriteDark, [c[0], G + 0.3, c[2]], [hs[0] + 0.04, 0.3, hs[2] + 0.04], 'y-');
      b.box(M.granite, [c[0], G + 0.62, c[2]], [hs[0] + 0.06, 0.03, hs[2] + 0.06]);
      b.box(M.teak, [c[0], top - 0.08, c[2]], [hs[0] + 0.03, 0.08, hs[2] + 0.03]);
    };
    seg(-cx, kz0, cx, kz0);
    seg(-cx, kz0, -cx, kz1);
    seg(cx, kz0, cx, kz1);
    seg(-cx, kz1, -door, kz1);
    seg(door, kz1, cx, kz1);
    // The entrance: a heavy lintel, a dark passage and a gabled porch over it
    // (high enough to walk under from the porch without ducking)
    b.box(M.woodRed, [0, top - 0.17, kz1], [door + 0.1, 0.17, 0.24]);
    for (const s of [-1, 1]) {
      b.tube(M.woodRed, [s * 1.35, G + 0.4, kz1 + 0.85], 0.12, 0.1, h - 0.3, 10);
      b.box(M.teak, [s * 1.35, top + 0.05, kz1 + 0.85], [0.18, 0.06, 0.18]);
    }
    b.box(M.granite, [0, G + 0.2, kz1 + 0.6], [1.7, 0.2, 0.75], 'y-');
    // Inner colonnade facing the courtyard
    const ix = cx - depth;
    const iz0 = kz0 + depth;
    const iz1 = kz1 - depth;
    const cols: [number, number][] = [];
    for (let i = 0; i <= 6; i++) for (const pz of [iz0, iz1]) cols.push([-ix + (2 * ix * i) / 6, pz]);
    for (let i = 1; i < 5; i++) for (const px of [-ix, ix]) cols.push([px, iz0 + ((iz1 - iz0) * i) / 5]);
    for (const [px, pz] of cols) {
      if (Math.abs(px) < 0.5 && pz === iz1) continue;
      b.tube(M.woodRed, [px, G + 0.4, pz], 0.1, 0.09, h - 0.4, 8);
      b.box(M.granite, [px, G + 0.47, pz], [0.13, 0.07, 0.13]);
      b.box(M.teak, [px, top - 0.05, pz], [0.15, 0.05, 0.15]);
    }
    b.bar(M.teak, [-ix, top - 0.1, iz0], [ix, top - 0.1, iz0], 0.07);
    b.bar(M.teak, [-ix, top - 0.1, iz1], [ix, top - 0.1, iz1], 0.07);
    b.bar(M.teak, [-ix, top - 0.1, iz0], [-ix, top - 0.1, iz1], 0.07);
    b.bar(M.teak, [ix, top - 0.1, iz0], [ix, top - 0.1, iz1], 0.07);
    // The raised cloister floor
    for (const [ax, az, bx, bz] of [[-cx, kz0, cx, iz0], [-cx, iz1, cx, kz1], [-cx, iz0, -ix, iz1], [ix, iz0, cx, iz1]] as const) {
      b.box(M.granite, [(ax + bx) / 2, G + 0.2, (az + bz) / 2], [(bx - ax) / 2, 0.2, (bz - az) / 2], 'y-');
    }
    // The double-pitched ring roof: out to the eaves outside, in to the courtyard
    const ridge: [number, number] = [cx - depth / 2, hz - depth / 2];
    const ry = top + 1.55;
    b.roof(M.tile, [0, 0, mz], [cx + 1.0, hz + 1.0], ridge, top - 0.15, ry, { sag: 0.12 });
    b.roof(M.tile, [0, 0, mz], [ix - 0.55, (iz1 - iz0) / 2 - 0.55], ridge, top - 0.1, ry, { inward: true, sag: 0.08 });
    b.bar(M.tile, [-ridge[0], ry + 0.03, mz - ridge[1]], [ridge[0], ry + 0.03, mz - ridge[1]], 0.07);
    b.bar(M.tile, [-ridge[0], ry + 0.03, mz + ridge[1]], [ridge[0], ry + 0.03, mz + ridge[1]], 0.07);
    b.bar(M.tile, [-ridge[0], ry + 0.03, mz - ridge[1]], [-ridge[0], ry + 0.03, mz + ridge[1]], 0.07);
    b.bar(M.tile, [ridge[0], ry + 0.03, mz - ridge[1]], [ridge[0], ry + 0.03, mz + ridge[1]], 0.07);
    eaves([0, 0, mz], [cx + 1.0, hz + 1.0], top - 0.15, [cx + 0.2, hz + 0.2]);
    b.frustum(M.teak, [0, 0, mz], [ix - 0.55, (iz1 - iz0) / 2 - 0.55], [ix, (iz1 - iz0) / 2], top - 0.12, top - 0.05, '', [0.3, -1]);
    // The porch gable over the entrance, in copper
    b.with({ at: [0, 0, kz1], yaw: 0 }, () => {
      gable(top + 0.15, 3.2, 1.2, -0.1, 1.95);
      finial([0, top + 1.36, 0.6], 0.6);
    });

    // ------------------------------------------------------------ lamp lattice (vilakkumadam)
    const rows = [0.62, 0.92, 1.22, 1.52, 1.82, 2.12];
    const out = 0.5;
    const spacing = 0.3;
    const sides: { a: [number, number]; b: [number, number]; n: [number, number]; gap?: boolean }[] = [
      { a: [-cx, kz1], b: [cx, kz1], n: [0, 1], gap: true },
      { a: [cx, kz1], b: [cx, kz0], n: [1, 0] },
      { a: [cx, kz0], b: [-cx, kz0], n: [0, -1] },
      { a: [-cx, kz0], b: [-cx, kz1], n: [-1, 0] },
    ];
    for (const side of sides) {
      const dx = side.b[0] - side.a[0];
      const dz = side.b[1] - side.a[1];
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      const ox = side.n[0] * (0.2 + out);
      const oz = side.n[1] * (0.2 + out);
      const count = Math.floor(len / spacing);
      const skip = (px: number) => side.gap && Math.abs(px) < door + 0.6;
      for (let s = 0; s <= len + 0.01; s += 1.6) {
        const px = side.a[0] + ux * s + ox;
        const pz = side.a[1] + uz * s + oz;
        if (skip(px)) continue;
        b.box(M.teak, [px, G + 1.2, pz], [0.05, 1.2, 0.05]);
        b.box(M.teak, [px - side.n[0] * out * 0.5, G + 2.35, pz - side.n[1] * out * 0.5], [0.04 + Math.abs(side.n[0]) * out * 0.5, 0.04, 0.04 + Math.abs(side.n[1]) * out * 0.5]);
      }
      // Seeds run along each side, so the breeze moves down the rows together
      for (let r = 0; r < rows.length; r++) {
        const y = G + rows[r]!;
        const runs: [number, number][] = side.gap ? [[0, len / 2 - door - 0.6], [len / 2 + door + 0.6, len]] : [[0, len]];
        for (const [s0, s1] of runs) {
          const mx = side.a[0] + (ux * (s0 + s1)) / 2 + ox;
          const mz2 = side.a[1] + (uz * (s0 + s1)) / 2 + oz;
          const half = (s1 - s0) / 2;
          b.box(M.teak, [mx, y - 0.05, mz2], [Math.abs(ux) * half + 0.03, 0.018, Math.abs(uz) * half + 0.03]);
          b.box(M.brass, [mx + side.n[0] * 0.03, y - 0.03, mz2 + side.n[1] * 0.03], [Math.abs(ux) * half + 0.02, 0.006, Math.abs(uz) * half + 0.02]);
        }
        let litRun = 0;
        for (let i = 0; i <= count; i++) {
          const s = (i + 0.5) * (len / (count + 1));
          const px = side.a[0] + ux * s + ox;
          const pz = side.a[1] + uz * s + oz;
          if (skip(px)) continue;
          const lit = r === 0 || (r === 1 && rand() < 0.5) || (r === 2 && rand() < 0.2) || rand() < 0.06;
          const seed = ((s / len) * 0.4 + rand() * 0.05) % 0.45;
          cup([px, y, pz], lit, 1, seed);
          if (r === 0 && lit && litRun++ % 5 === 2) {
            oil([px + side.n[0] * 0.3, y + 0.25, pz + side.n[1] * 0.3], 0.6, 2.8, seed);
          }
        }
      }
    }
  }

  // ================================================================ the round shrine (sreekovil)
  b.with({ at: SHRINE, yaw: 0 }, () => {
    // Moulded granite base (adhishthana): plinth, the rounded kumuda, the band and the cornice
    b.lathe(M.granite, [0, 0, 0], [[0, 0.0], [2.45, 0.0], [2.45, 0.14], [2.36, 0.16], [2.36, 0.26], [2.46, 0.32], [2.5, 0.4], [2.44, 0.48], [2.3, 0.52], [2.26, 0.6], [2.26, 0.64], [2.38, 0.66], [2.38, 0.76], [2.2, 0.8], [0, 0.8]], 56);
    // The wall: limewash with mural panels between teak pilasters
    b.tube(M.plaster, [0, 0.8, 0], 2.0, 2.0, 2.15, 48, { rings: 1 });
    b.tube(M.lateriteDark, [0, 0.8, 0], 2.03, 2.03, 0.22, 48);
    const pil = 16;
    for (let i = 0; i < pil; i++) {
      const a = (i / pil) * TAU + TAU / 32;
      b.with({ at: [Math.sin(a) * 2.0, 0, Math.cos(a) * 2.0], yaw: a }, () => {
        b.box(M.woodRed, [0, 0.8 + 1.07, 0.02], [0.08, 1.07, 0.05]);
        b.box(M.teak, [0, 0.8 + 0.12, 0.03], [0.11, 0.1, 0.07]);
        b.box(M.teak, [0, 2.9, 0.03], [0.12, 0.08, 0.08]);
      });
      const am = a + TAU / 32;
      const front = Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < 0.45;
      const sideDoor = [Math.PI / 2, Math.PI, -Math.PI / 2].some((d) => Math.abs(Math.atan2(Math.sin(am - d), Math.cos(am - d))) < 0.3);
      if (!front && !sideDoor) {
        b.with({ at: [Math.sin(am) * 2.015, 0, Math.cos(am) * 2.015], yaw: am }, () => b.box(M.mural, [0, 0.8 + 1.15, 0], [0.32, 0.6, 0.012]));
      }
    }
    b.tube(M.teak, [0, 2.92, 0], 2.08, 2.08, 0.14, 48, { cap: false });
    b.tube(M.woodRed, [0, 3.06, 0], 2.12, 2.12, 0.08, 48);
    // False doors (ghanadwara) on the other three sides
    for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
      b.with({ at: [Math.sin(a) * 2.0, 0, Math.cos(a) * 2.0], yaw: a }, () => {
        b.box(M.woodRed, [0, 0.8 + 0.95, 0.04], [0.55, 0.95, 0.04]);
        b.box(M.teak, [0, 0.8 + 0.95, 0.07], [0.45, 0.85, 0.03]);
        b.box(M.woodRed, [0, 0.8 + 0.95, 0.1], [0.015, 0.82, 0.015]);
        for (const s of [-1, 1]) for (let j = 0; j < 6; j++) for (let k = 0; k < 3; k++) b.blob(M.brass, [s * (0.1 + k * 0.12), 1.0 + j * 0.28, 0.11], [0.022, 0.022, 0.018], 5, 3);
      });
    }
    // The drain spout (pranala) on the north side
    b.with({ at: [-2.4, 0.58, 0.6], yaw: -Math.PI / 2 }, () => {
      b.box(M.granite, [0, 0, 0.5], [0.12, 0.08, 0.6]);
      b.blob(M.granite, [0, 0.02, 1.1], [0.14, 0.12, 0.2], 6, 4, 0.25);
    });
    // The door: steps (sopanam) with curling rails up to it, open doors and a dark sanctum
    for (let i = 0; i < 4; i++) b.box(M.granite, [0, 0.1 + i * 0.2, 2.95 - i * 0.2], [0.65, 0.1 + i * 0.1, 0.22]);
    for (const s of [-1, 1]) {
      b.sweep(M.granite, [[s * 0.75, 0.25, 3.3], [s * 0.78, 0.55, 3.05], [s * 0.75, 0.85, 2.7], [s * 0.72, 0.95, 2.35]], [0.11, 0.09, 0.08, 0.08], 6);
      b.blob(M.granite, [s * 0.75, 0.22, 3.36], [0.13, 0.13, 0.13], 6, 4);
    }
    b.box(M.dark, [0, 0.8 + 0.95, 1.94], [0.52, 0.95, 0.12]);
    b.box(M.woodRed, [0, 0.8 + 1.98, 2.02], [0.72, 0.1, 0.07]);
    for (const s of [-1, 1]) {
      b.box(M.woodRed, [s * 0.62, 0.8 + 0.95, 2.02], [0.09, 0.95, 0.07]);
      b.with({ at: [s * 0.55, 0.8, 2.08], yaw: s * 1.2 }, () => {
        b.box(M.teak, [s * 0.25, 0.92, 0], [0.25, 0.9, 0.035]);
        for (let j = 0; j < 7; j++) b.blob(M.brass, [s * 0.25, 0.2 + j * 0.24, 0.04], [0.02, 0.02, 0.016], 5, 3);
      });
    }
    // A brass bell by the door
    b.tube(M.brass, [0.85, 2.55, 2.35], 0.005, 0.005, 0.45, 3);
    b.lathe(M.brass, [0.85, 2.35, 2.35], [[0.0, 0], [0.09, 0.0], [0.08, 0.04], [0.06, 0.14], [0.04, 0.2], [0, 0.22]], 12);
    // The sanctum lamps seen through the door
    nilavilakku([0, 0.8, 2.2], 0.55, 5, 0.31);
    oil([SHRINE[0], G + 1.5, SHRINE[2] + 2.3], 1.4, 4.5, 0.31);
    // The ring of lamps on a brass ledge round the wall (chuttuvilakku)
    b.tube(M.brass, [0, 1.54, 0], 2.12, 2.12, 0.02, 48, { cap: false });
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.36) continue;
      cup([Math.sin(a) * 2.11, 1.6, Math.cos(a) * 2.11], true, 0.9, (i / 64) * 0.45);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.5;
      oil([SHRINE[0] + Math.sin(a) * 2.7, G + 1.8, SHRINE[2] + Math.cos(a) * 2.7], 0.75, 3.3, (((a / TAU) % 1) + 1) % 1 * 0.45);
    }
    // Carved brackets from the wall top out to the eave
    for (let i = 0; i < pil; i++) {
      const a = (i / pil) * TAU + TAU / 32;
      b.with({ at: [0, 0, 0], yaw: a }, () => {
        b.sweep(M.teak, [[0, 2.2, 2.05], [0, 2.75, 2.5], [0, 3.05, 3.0]], [0.04, 0.06, 0.035], 5);
        b.blob(M.teak, [0, 2.65, 2.42], [0.06, 0.15, 0.06], 6, 4, 0.3);
      });
    }
    // The two conical copper roofs, the drum between them, and the great finial
    b.cone(M.copper, [0, 0, 0], 3.35, 1.4, 3.0, 4.5, { sag: 0.14, rows: 6, sides: 56 });
    b.lathe(M.teak, [0, 0, 0], [[2.12, 3.02], [3.35, 2.96]], 56);
    b.tube(M.woodRed, [0, 2.88, 0], 3.36, 3.36, 0.12, 56);
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU;
      b.bar(M.teak, [Math.sin(a) * 2.2, 3.12, Math.cos(a) * 2.2], [Math.sin(a) * 3.33, 2.93, Math.cos(a) * 3.33], 0.028);
    }
    b.tube(M.teak, [0, 4.45, 0], 1.38, 1.32, 0.55, 40);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      b.box(M.woodRed, [Math.sin(a) * 1.355, 4.72, Math.cos(a) * 1.355], [0.025, 0.25, 0.025]);
    }
    b.cone(M.copper, [0, 0, 0], 2.25, 0.16, 4.9, 6.7, { sag: 0.16, rows: 8, sides: 56 });
    b.tube(M.woodRed, [0, 4.82, 0], 2.26, 2.26, 0.1, 56);
    b.lathe(M.teak, [0, 0, 0], [[1.36, 4.98], [2.25, 4.9]], 56);
    finial([0, 6.62, 0], 1.6);
  });

  // ================================================================ prayer pavilion (namaskara mandapam) with Nandi
  b.with({ at: MANDAPAM, yaw: 0 }, () => {
    b.box(M.granite, [0, 0.1, 0], [1.25, 0.1, 1.25], 'y-');
    b.frustum(M.granite, [0, 0, 0], [1.22, 1.22], [1.15, 1.15], 0.2, 0.32, '');
    b.box(M.granite, [0, 0.42, 0], [1.12, 0.1, 1.12], 'y-');
    b.box(M.granite, [0, 0.55, 0], [1.2, 0.04, 1.2], 'y-');
    const at = [-0.98, -0.33, 0.33, 0.98];
    for (const px of at) {
      for (const pz of at) {
        const edge = Math.abs(px) > 0.9 || Math.abs(pz) > 0.9;
        if (!edge) continue;
        b.box(M.granite, [px, 0.68, pz], [0.09, 0.09, 0.09]);
        b.tube(M.granite, [px, 0.77, pz], 0.075, 0.07, 1.75, 8, { smooth: false });
        for (const y of [1.2, 1.8]) b.tube(M.granite, [px, y, pz], 0.09, 0.09, 0.06, 8, { smooth: false, cap: true });
        b.box(M.granite, [px, 2.56, pz], [0.11, 0.05, 0.11]);
      }
    }
    b.box(M.teak, [0, 2.68, 0], [1.15, 0.07, 1.15]);
    // Coffered ceiling: lacquered beams in a grid under the roof
    for (const v of at) {
      b.box(M.woodRed, [v, 2.6, 0], [0.04, 0.04, 1.1]);
      b.box(M.woodRed, [0, 2.6, v], [1.1, 0.04, 0.04]);
    }
    b.roof(M.copper, [0, 0, 0], [1.75, 1.75], [0.07, 0.07], 2.72, 4.05, { sag: 0.2, rows: 8 });
    eaves([0, 0, 0], [1.75, 1.75], 2.72, [1.15, 1.15]);
    finial([0, 4.02, 0], 0.7);
    // Nandi, lying down, facing the shrine
    b.with({ at: [0, 0.59, 0.1], yaw: Math.PI }, () => {
      const N = M.white;
      b.box(M.granite, [0, 0.06, 0], [0.32, 0.06, 0.55]);
      b.blob(N, [0, 0.32, -0.05], [0.28, 0.24, 0.48], 10, 7);
      b.blob(N, [0, 0.52, 0.2], [0.18, 0.16, 0.18], 8, 5);
      b.blob(N, [0, 0.47, 0.5], [0.12, 0.12, 0.16], 8, 6);
      b.blob(N, [0, 0.4, 0.63], [0.08, 0.07, 0.07], 6, 4);
      for (const s of [-1, 1]) {
        b.sweep(N, [[s * 0.06, 0.58, 0.46], [s * 0.13, 0.66, 0.44], [s * 0.15, 0.74, 0.47]], [0.025, 0.018, 0.008], 5);
        b.blob(N, [s * 0.13, 0.53, 0.44], [0.05, 0.025, 0.03], 5, 3);
        b.blob(N, [s * 0.2, 0.12, 0.25], [0.08, 0.07, 0.2], 6, 4);
        b.blob(N, [s * 0.22, 0.12, -0.35], [0.1, 0.08, 0.2], 6, 4);
      }
      // A garland of marigolds and a brass bell on his neck
      const garland: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * (i / 12);
        garland.push([Math.cos(a) * 0.16, 0.38 + Math.sin(a) * 0.08, 0.4 - Math.sin(a) * 0.02]);
      }
      b.sweep({ color: [0.9, 0.4, 0.03], roughness: 0.8, pattern: P.FLOWER }, garland, garland.map(() => 0.03), 5);
      b.blob(M.brass, [0, 0.33, 0.43], [0.035, 0.04, 0.035], 6, 4);
    });
  });

  // ================================================================ the great offering stone (valiya balikkallu) in its pavilion
  b.with({ at: BALIKKAL, yaw: 0 }, () => {
    b.box(M.granite, [0, 0.15, 0], [1.45, 0.15, 1.45], 'y-');
    b.box(M.granite, [0, 0.33, 0], [1.38, 0.03, 1.38], 'y-');
    for (const sx of [-1.2, 1.2]) {
      for (const sz of [-1.2, 1.2]) {
        b.tube(M.granite, [sx, 0.36, sz], 0.1, 0.09, 2.0, 8, { smooth: false });
        b.box(M.teak, [sx, 2.38, sz], [0.14, 0.04, 0.14]);
      }
    }
    b.box(M.teak, [0, 2.45, 0], [1.3, 0.06, 1.3]);
    b.roof(M.tile, [0, 0, 0], [2.0, 2.0], [0.5, 0.5], 2.45, 3.4, { sag: 0.14 });
    eaves([0, 0, 0], [2.0, 2.0], 2.45, [1.3, 1.3]);
    b.roof(M.copper, [0, 0, 0], [0.75, 0.75], [0.05, 0.05], 3.3, 4.0, { sag: 0.15 });
    finial([0, 3.98, 0], 0.55);
    // The stone: a stepped base, a lotus of petals and the rounded top
    b.box(M.granite, [0, 0.5, 0], [0.75, 0.14, 0.75], 'y-');
    b.lathe(M.granite, [0, 0.64, 0], [[0.62, 0], [0.64, 0.12], [0.42, 0.24], [0.4, 0.34], [0.52, 0.42], [0.55, 0.5], [0.36, 0.62], [0.2, 0.72], [0, 0.76]], 24);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      b.blob(M.granite, [Math.sin(a) * 0.5, 1.12, Math.cos(a) * 0.5], [0.09, 0.07, 0.09], 5, 3);
    }
    // Rice and flowers left on it
    for (let k = 0; k < 8; k++) b.blob({ color: k % 2 ? [0.85, 0.82, 0.75] : [0.8, 0.25, 0.03], roughness: 0.8, pattern: P.FLOWER }, [(rand() - 0.5) * 0.3, 1.41, (rand() - 0.5) * 0.3], [0.03, 0.012, 0.03], 5, 3);
  });

  // ================================================================ the temple theatre (koothambalam)
  b.with({ at: KOOTH, yaw: 0 }, () => {
    const W = 2.3;
    const L = 2.8;
    // A tall moulded granite plinth with steps on the east
    b.box(M.granite, [0, 0.15, 0], [W + 0.2, 0.15, L + 0.2], 'y-');
    b.frustum(M.granite, [0, 0, 0], [W + 0.15, L + 0.15], [W + 0.02, L + 0.02], 0.3, 0.45, '');
    b.box(M.granite, [0, 0.6, 0], [W, 0.15, L], 'y-');
    b.box(M.granite, [0, 0.77, 0], [W + 0.08, 0.03, L + 0.08], 'y-');
    for (let i = 0; i < 4; i++) b.box(M.granite, [W + 0.55 - i * 0.12, 0.1 + i * 0.2, 0], [0.14, 0.1 + i * 0.1, 0.8]);
    // Half walls, then lattice screens between posts, the hall dark within, the stage lamp seen through them
    b.box(M.plaster, [0, 0.8 + 0.4, 0], [W, 0.4, L], 'y-');
    b.box(M.dark, [0, 0.8 + 1.6, 0], [W - 0.08, 1.2, L - 0.08], 'y-');
    for (const [ax, az, bx, bz] of [[-W, L, W, L], [W, -L, -W, -L], [W, L, W, 0.7], [W, -0.7, W, -L], [-W, -L, -W, L]] as const) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(len / 0.12);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const post = i % 8 === 0;
        b.box(post ? M.woodRed : M.teak, [ax + (bx - ax) * t, 0.8 + 1.6, az + (bz - az) * t], [post ? 0.07 : 0.018, 1.2, post ? 0.07 : 0.018]);
      }
      b.bar(M.woodRed, [ax, 1.6, az], [bx, 1.6, bz], 0.06);
      b.bar(M.woodRed, [ax, 3.62, az], [bx, 3.62, bz], 0.08);
    }
    // The doorway on the east, with posts
    for (const s of [-1, 1]) b.tube(M.woodRed, [W, 0.8, s * 0.7], 0.11, 0.1, 2.8, 10);
    nilavilakku([-W + 0.8, 0.8, 0], 1.1, 5, 0.37);
    oil([KOOTH[0] - W + 0.8, G + 2.0, KOOTH[2]], 1.1, 5, 0.37);
    // Lower roof of tiles, a lattice clerestory, then the steep copper upper roof with gables
    b.roof(M.tile, [0, 0, 0], [W + 0.95, L + 0.95], [W - 0.65, L - 0.6], 3.55, 5.1, { sag: 0.14 });
    eaves([0, 0, 0], [W + 0.95, L + 0.95], 3.55, [W, L]);
    struts([[-W, L], [0, L], [W, L], [-W, -L], [0, -L], [W, -L]].map(([x, z]) => [x!, z!] as [number, number]).filter(([, z]) => z > 0), [0, 1], 2.9, 3.5, 0.85);
    struts([[-W, -L], [0, -L], [W, -L]], [0, -1], 2.9, 3.5, 0.85);
    struts([[W, -L + 0.6], [W, L - 0.6]], [1, 0], 2.9, 3.5, 0.85);
    struts([[-W, -L + 0.6], [-W, 0], [-W, L - 0.6]], [-1, 0], 2.9, 3.5, 0.85);
    b.box(M.dark, [0, 5.4, 0], [W - 0.75, 0.42, L - 0.7], 'y-');
    for (let i = -10; i <= 10; i++) {
      for (const s of [-1, 1]) b.box(M.teak, [s * (W - 0.73), 5.4, (i / 10) * (L - 0.7)], [0.018, 0.42, 0.018]);
    }
    for (let i = -6; i <= 6; i++) for (const s of [-1, 1]) b.box(M.teak, [(i / 6) * (W - 0.75), 5.4, s * (L - 0.68)], [0.018, 0.42, 0.018]);
    b.roof(M.copper, [0, 0, 0], [W + 0.25, L + 0.45], [0.08, L - 1.0], 5.75, 8.0, { sag: 0.2, rows: 8 });
    eaves([0, 0, 0], [W + 0.25, L + 0.45], 5.75, [W - 0.75, L - 0.7]);
    b.box(M.copper, [0, 8.04, 0], [0.1, 0.06, L - 0.95]);
    for (const s of [1, -1]) {
      b.with({ at: [0, 0, 0], yaw: s > 0 ? 0 : Math.PI }, () => gable(6.4, 2.4, 1.5, L - 1.2, L + 0.5));
    }
    for (const fz of [-(L - 1.0), 0, L - 1.0]) finial([0, 8.06, fz], fz === 0 ? 0.9 : 0.7);
  });

  // ================================================================ a small Ganapathi shrine behind the cloister
  b.with({ at: GANAPATHI, yaw: 0 }, () => {
    b.box(M.granite, [0, 0.2, 0], [0.85, 0.2, 0.85], 'y-');
    b.box(M.granite, [0, 0.43, 0], [0.9, 0.03, 0.9], 'y-');
    b.box(M.plaster, [0, 0.46 + 0.6, 0], [0.62, 0.6, 0.62], 'y-');
    b.box(M.dark, [0, 0.46 + 0.45, 0.6], [0.24, 0.42, 0.04]);
    b.box(M.woodRed, [0, 0.46 + 0.9, 0.64], [0.32, 0.05, 0.04]);
    for (const s of [-1, 1]) b.box(M.woodRed, [s * 0.28, 0.46 + 0.45, 0.64], [0.04, 0.45, 0.04]);
    b.roof(M.copper, [0, 0, 0], [1.15, 1.15], [0.05, 0.05], 1.62, 2.55, { sag: 0.18 });
    eaves([0, 0, 0], [1.15, 1.15], 1.62, [0.62, 0.62]);
    finial([0, 2.53, 0], 0.5);
    b.box(M.granite, [0, 0.47, 1.05], [0.25, 0.05, 0.18]);
    cup([-0.12, 0.56, 1.05], true, 1.3, 0.41);
    cup([0.12, 0.56, 1.05], true, 1.3, 0.41);
  });
  oil([GANAPATHI[0], G + 0.8, GANAPATHI[2] + 1.25], 0.8, 4, 0.41);

  // ================================================================ brass lamp tower (deepastambham)
  // As at Vadakkunnathan and Ettumanoor: a bell-metal pillar on a tortoise, ringed with a dozen
  // shallow trays that narrow upward, each rimmed with pointed spouts that hold a wick apiece,
  // crowned by a little swan (annapakshi). Dark old bronze, rubbed bright where hands reach.
  b.with({ at: LAMP_TOWER, yaw: 0 }, () => {
    b.box(M.granite, [0, 0.15, 0], [0.95, 0.15, 0.95], 'y-');
    b.frustum(M.granite, [0, 0, 0], [0.9, 0.9], [0.78, 0.78], 0.3, 0.42, 'top');
    const Y = 0.42;
    // The tortoise (kurma): a domed, ridged shell with head, tail and four flippers
    b.lathe(M.bronze, [0, Y, 0], [[0, 0], [0.62, 0], [0.66, 0.04], [0.6, 0.1], [0.5, 0.2], [0.34, 0.28], [0.15, 0.32], [0, 0.33]], 24);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      b.with({ at: [Math.sin(a) * 0.43, Y + 0.18, Math.cos(a) * 0.43], yaw: a }, () => b.box(M.bronze, [0, 0, 0], [0.06, 0.012, 0.11]));
    }
    b.blob(M.bronze, [0, Y + 0.08, 0.72], [0.09, 0.07, 0.14], 8, 5);
    b.blob(M.bronze, [0, Y + 0.05, -0.68], [0.04, 0.03, 0.08], 6, 3);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) b.blob(M.bronze, [sx * 0.5, Y + 0.03, sz * 0.42], [0.14, 0.03, 0.08], 6, 3);
    // The square foot (peedom) and the moulded base of the pillar
    b.box(M.bronze, [0, Y + 0.38, 0], [0.32, 0.05, 0.32]);
    b.lathe(M.bronze, [0, Y + 0.43, 0], [[0, 0], [0.3, 0], [0.31, 0.04], [0.24, 0.08], [0.26, 0.12], [0.18, 0.2], [0.13, 0.3], [0.15, 0.34], [0.11, 0.38], [0, 0.38]], 20);
    const foot = Y + 0.81;
    const tiers = 12;
    const gap = 0.33;
    const top = foot + 0.3 + tiers * gap;
    // The pillar, tapering, a bead ring under every tray
    b.lathe(M.bronze, [0, foot, 0], [[0, 0], [0.11, 0], [0.105, 0.3], [0.075, top - foot - 0.1], [0.0, top - foot - 0.1]], 16);
    let wick = 0;
    for (let t = 0; t < tiers; t++) {
      const y = foot + 0.3 + t * gap;
      const k = t / (tiers - 1);
      const r = 0.62 - 0.38 * k;
      const col = 0.105 - 0.03 * k;
      // Collar and bracing cone below, then the shallow dish with an upturned, beaded lip
      b.lathe(M.bronze, [0, y - 0.12, 0], [[col + 0.004, 0], [col + 0.03, 0.02], [col + 0.012, 0.04], [col + 0.004, 0.05], [0, 0.05]], 14);
      b.lathe(M.bronze, [0, y, 0], [[col, -0.1], [r * 0.45, -0.035], [r * 0.92, -0.012], [r, 0.0], [r + 0.012, 0.022], [r + 0.004, 0.036], [r - 0.01, 0.03], [r * 0.9, 0.01], [col, 0.012]], 30);
      // Spouts all round the rim: a flat pointed tongue reaching out, its wick lit at the tip
      const n = Math.round(10 + r * 30);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 0.37;
        const ca = Math.sin(a);
        const sa = Math.cos(a);
        b.with({ at: [ca * r, y + 0.018, sa * r], yaw: a }, () => {
          b.tri(M.bronze, [-0.026, 0, -0.01], [0.026, 0, -0.01], [0, 0.004, 0.07], [0, 1, 0]);
          b.tri(M.bronze, [0.026, -0.006, -0.01], [-0.026, -0.006, -0.01], [0, -0.002, 0.07], [0, -1, 0]);
          b.box(M.bronze, [0, 0.008, 0.0], [0.026, 0.008, 0.012], 'y-');
        });
        b.seeded((t * 0.051 + (i / n) * 0.13) % 0.45, () => b.flame(M.flame, [ca * (r + 0.055), y + 0.026, sa * (r + 0.055)], 0.055));
        wick++;
      }
      // Its light comes from the ring of wicks, so two lights stand out at the rim, not in the pillar
      if (t % 3 === 1 || t === tiers - 1) {
        for (const side of [1]) {
          const a = t * 2.1 + (side > 0 ? 0 : Math.PI);
          oil([LAMP_TOWER[0] + Math.sin(a) * (r + 0.2), G + y + 0.12, LAMP_TOWER[2] + Math.cos(a) * (r + 0.2)], 1.5 + r * 1.3, 7.5, t * 0.05);
        }
      }
    }
    // The crown: a bud, a ring of petals and the swan
    b.lathe(M.bronze, [0, top - 0.1, 0], [[0, 0], [0.09, 0], [0.12, 0.05], [0.08, 0.1], [0.05, 0.16], [0.07, 0.2], [0.03, 0.26], [0, 0.26]], 14);
    b.blob(M.bronze, [0, top + 0.24, 0], [0.06, 0.05, 0.11], 8, 5);
    b.bar(M.bronze, [0, top + 0.26, 0.07], [0, top + 0.38, 0.1], 0.018);
    b.blob(M.bronze, [0, top + 0.39, 0.12], [0.025, 0.025, 0.04], 6, 4);
    b.tri(M.bronze, [0, top + 0.24, -0.1], [0, top + 0.36, -0.16], [0, top + 0.26, -0.04], [1, 0, 0]);
    b.tri(M.bronze, [0, top + 0.24, -0.1], [0, top + 0.26, -0.04], [0, top + 0.36, -0.16], [-1, 0, 0]);
    void wick;
  });

  return { model: b.model(), lamps, vertices: b.vertexCount, solids: b.solids };
}
