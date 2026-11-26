// The houses of the town, five kinds as a Kerala village has them side by side:
//  - old: limewashed walls on a laterite plinth, a hipped clay-tile roof run out over a veranda
//    of wooden posts with a sloping wooden seat (charupady) between them;
//  - tharavad: the old family house, a high laterite plinth, a pillared porch with its own gable,
//    a wooden upper floor under a second, steeper roof with lattice gables, and a gatehouse
//    (padippura) in its wall;
//  - concrete: a newer flat-roofed house in a bright paint, sunshades over grilled windows, a
//    little tiled roof over the sit-out and a black water tank on the terrace;
//  - storey: two floors, a balcony, a sloped roof of Mangalore tiles with a gable to the front;
//  - hut: bare laterite blocks under a rusting tin roof.
// Each stands in its own swept yard behind a laterite wall, with a well, a clothesline, a tulsi
// pedestal or a cross by the door, firewood and coconut husks round the back. Up on the far
// hills, houses are only roofs and a lit window or two through the trees.

import { Builder, hex, P, rng, type Mat, type V3 } from '../../render/geo.ts';
import type { Lamp } from './temple.ts';
import { M } from '../../content/world.ts';
import { heightAt, onRoad, pondQ } from '../terrain.ts';
import { PLOTS, plotPoint, type Plot } from './town.ts';
import { buildChurch } from './church.ts';
import { buildMosque } from './mosque.ts';
import { buildBungalow } from '../trail/bungalow.ts';
import { buildRiver } from '../trail/bridge.ts';
import { buildFootpath } from '../trail/footpath.ts';
import { buildJungle } from '../trail/jungle.ts';
import { buildMachans } from '../trail/machan.ts';
import { trailDistance } from '../trail/trail.ts';

const WINDOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [2.6, 1.5, 0.55], pattern: P.BULB };
const TUBE_WINDOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [1.6, 2.1, 2.2], pattern: P.TUBE };
const TV_WINDOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [1.1, 1.3, 1.7], pattern: P.TV };
const BULB: Mat = { color: [0, 0, 0], roughness: 1, emission: [12, 7, 2.6], pattern: P.BULB };
const CFL: Mat = { color: [0, 0, 0], roughness: 1, emission: [7, 8, 8.5], pattern: P.TUBE };
const GLOBE: Mat = { color: [0, 0, 0], roughness: 1, emission: [4.5, 3.6, 2.4], pattern: P.BULB };
const ROOM: Mat = { color: hex(0x0a0806), roughness: 1, pattern: P.PLAIN };
const scaled = (m: Mat, k: number): Mat => ({ ...m, emission: [m.emission![0] * k, m.emission![1] * k, m.emission![2] * k] });
const paint = (h: number): Mat => ({ color: hex(h), roughness: 0.8, pattern: P.PAINT });

export const H = {
  oxide: { color: hex(0x6a2216), roughness: 0.3, pattern: P.PLAIN },
  ceramic: { color: hex(0xb8ae9c), roughness: 0.2, pattern: P.PLAIN },
  glass: { color: hex(0x0b0d10), roughness: 0.08, pattern: P.GLASS },
  grill: { color: hex(0x1c1e20), roughness: 0.5, metallic: 0.6, pattern: P.STEEL },
  tank: { color: hex(0x121212), roughness: 0.45, pattern: P.PLAIN },
  rust: { color: hex(0x6a4a36), roughness: 0.6, metallic: 0.45, pattern: P.TIN },
  asbestos: { color: hex(0x7c7a74), roughness: 0.85, pattern: P.TIN },
  shutterBlue: { color: hex(0x2a5068), roughness: 0.6, pattern: P.WOOD },
  shutterGreen: { color: hex(0x2e5a3a), roughness: 0.6, pattern: P.WOOD },
  husk: { color: hex(0x4a3020), roughness: 0.95, pattern: P.CLOTH },
  firewood: { color: hex(0x4a3828), roughness: 0.9, pattern: P.WOOD },
  rope: { color: hex(0x5a4a34), roughness: 0.9, pattern: P.CLOTH },
  sheet: { color: hex(0xa88a5a), roughness: 0.55, pattern: P.CLOTH, doubleSided: true },
  tulsiThara: { color: hex(0xd8cfc0), roughness: 0.85, pattern: P.PLASTER },
} satisfies Record<string, Mat>;

const CLOTHS: Mat[] = [0xb8261b, 0x2a5a9a, 0xd8d2c4, 0xc89a2a, 0x3a7a4a, 0x8a2a6a, 0xd87a3a].map((h) => ({ color: hex(h), roughness: 0.9, pattern: P.CLOTH, doubleSided: true }));
const OLD_WALLS: Mat[] = [M.plaster, M.plaster, M.ochre, paint(0xd8c8a0), paint(0xb8c8b0)];
const BRIGHT: Mat[] = [paint(0xe8b48a), paint(0xa8d0b0), paint(0x9cc4d8), paint(0xe0a8b8), paint(0xe8d870), paint(0xb8a8d0), paint(0xe8e4da), paint(0xf0c890)];
const GREENS: Mat[] = [paint(0x7ab08a), paint(0x9ad0a0), paint(0xe8e4da)];
const TRIM = paint(0xece8de);

interface Ctx {
  b: Builder;
  r: () => number;
  p: Plot;
  /** Floor level of the house in world space. */
  F: number;
  lamps: Lamp[];
  tulsi: V3[];
  chimneys: V3[];
  seats: Seat[];
}

/** A veranda chair someone could sit out in: where it stands and which way it faces. */
export interface Seat {
  at: V3;
  yaw: number;
}

/** The ground in the plot's frame, relative to the floor. */
const gy = (c: Ctx, lx: number, lz: number) => {
  const [x, z] = plotPoint(c.p, lx, lz);

  return heightAt(x, z) - c.F;
};

const world = (c: Ctx, lx: number, ly: number, lz: number): V3 => {
  const [x, z] = plotPoint(c.p, lx, lz);

  return [x, c.F + ly, z];
};

/** A window in the wall facing +z at `at`: frame, glass or a glowing pane, bars, shutters. */
function windowAt(c: Ctx, at: V3, yaw: number, w: number, h: number, style: 'wood' | 'modern', glow: boolean) {
  const { b, r } = c;
  b.with({ at, yaw }, () => {
    const kind = r();
    const pane: Mat = !glow ? H.glass : kind < 0.2 ? TV_WINDOW : kind < 0.5 ? TUBE_WINDOW : WINDOW;
    const seed = r() * 0.45;
    // Its own fixed dice, from where it stands, so the rest of the village stays as it was
    let hs = Math.abs(Math.sin(at[0] * 12.9898 + at[2] * 78.233 + at[1] * 37.719 + yaw) * 43758.5453) % 1;
    const roll = () => (hs = (hs * 9301 + 0.49297) % 1);

    if (!glow) b.seeded(seed, () => b.box(pane, [0, 0, 0.01], [w, h, 0.02]));
    else {
      // The room seen through the bars: the wall and ceiling near the lamp brightest, falling
      // off below, and the dark shape of whatever stands against the far wall
      const dim = scaled(pane, 0.42);
      b.seeded(seed, () => {
        b.box(pane, [0, h * 0.35, 0.01], [w, h * 0.65, 0.02]);
        b.box(dim, [0, -h * 0.65, 0.01], [w, h * 0.35, 0.02]);
      });
      const what = roll();
      const sx = (roll() - 0.5) * w;

      if (what < 0.3) b.box(ROOM, [sx, -h * 0.25, 0.024], [w * 0.32, h * 0.75, 0.004]); // an almirah
      else if (what < 0.5) b.box(ROOM, [sx, h * 0.15, 0.024], [w * 0.16, h * 0.4, 0.004]); // a shirt on a hook
      else if (what < 0.65) b.box(ROOM, [sx, -h * 0.75, 0.024], [w * 0.45, h * 0.25, 0.004]); // a cot's end
    }

    if (glow && r() < 0.6) {
      // A thin cotton curtain drawn half across, glowing in its own colour with the light behind it
      const cl = CLOTHS[Math.floor(r() * CLOTHS.length)]!;
      const s = r() < 0.5 ? -1 : 1;
      // (one glow per kind of light, so the curtains share a handful of parts)
      const lit: Mat = { ...cl, emission: [pane.emission![0] * 0.16, pane.emission![1] * 0.16, pane.emission![2] * 0.16] };
      b.box(lit, [s * w * 0.5, 0, 0.035], [w * 0.5, h * 0.98, 0.008]);
    }

    if (style === 'wood') {
      b.box(M.teak, [0, h + 0.04, 0.03], [w + 0.08, 0.04, 0.05]);
      b.box(M.teak, [0, -h - 0.04, 0.05], [w + 0.1, 0.04, 0.08]);

      for (let k = -2; k <= 2; k++) b.bar(M.dark, [(k * w) / 2.6, -h, 0.05], [(k * w) / 2.6, h, 0.05], 0.012 * Math.SQRT2);
      // Shutters folded back against the wall
      const sh = r() < 0.5 ? H.shutterBlue : M.teak;

      for (const s of [-1, 1]) b.box(sh, [s * (w * 1.5 + 0.05), 0, 0.03], [w * 0.5, h, 0.02]);
    } else {
      b.box(TRIM, [0, h + 0.03, 0.02], [w + 0.05, 0.03, 0.03]);
      b.box(TRIM, [0, -h - 0.03, 0.04], [w + 0.08, 0.03, 0.06]);

      // Grill of bars and a sunshade slab above
      for (let k = -3; k <= 3; k++) b.bar(H.grill, [(k * w) / 3.5, -h, 0.06], [(k * w) / 3.5, h, 0.06], 0.008 * Math.SQRT2);
      b.box(H.grill, [0, 0, 0.06], [w, 0.008, 0.008]);
      b.box(TRIM, [0, h + 0.18, 0.28], [w + 0.25, 0.04, 0.3]);
    }
  });
}

/** A panelled door facing +z at `at`. */
function doorAt(c: Ctx, at: V3, w: number, h: number, mat: Mat, open = false) {
  const { b } = c;
  b.with({ at, yaw: 0 }, () => {
    b.box(M.teak, [0, h / 2 + 0.04, 0.03], [w / 2 + 0.08, h / 2 + 0.06, 0.03]);

    if (open) b.box(M.dark, [0, h / 2, 0.045], [w / 2, h / 2, 0.01]);
    else {
      for (const s of [-1, 1]) {
        b.box(mat, [(s * w) / 4, h / 2, 0.06], [w / 4 - 0.01, h / 2, 0.02]);
        b.box(mat, [(s * w) / 4, h * 0.72, 0.08], [w / 6, h * 0.14, 0.01]);
        b.box(mat, [(s * w) / 4, h * 0.3, 0.08], [w / 6, h * 0.18, 0.01]);
      }
    }
  });
}

/** A plinth under a footprint, deep enough to reach the ground everywhere under it. */
function plinth(c: Ctx, mat: Mat, x0: number, x1: number, z0: number, z1: number, top = 0) {
  let low = Infinity;

  for (const lx of [x0, (x0 + x1) / 2, x1]) for (const lz of [z0, (z0 + z1) / 2, z1]) low = Math.min(low, gy(c, lx, lz));
  const y0 = Math.min(low - 0.3, top - 0.3);
  c.b.box(mat, [(x0 + x1) / 2, (y0 + top) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, (top - y0) / 2, (z1 - z0) / 2], 'y-');
}

/** Steps down from the floor at `top` to the yard in front of `z`. */
function steps(c: Ctx, x: number, z: number, w: number, mat: Mat, top = 0) {
  // The ground where the flight ends, which on a slope is lower than at its top: settle it twice
  let g = gy(c, x, z + 0.6);

  for (let k = 0; k < 2; k++) {
    const out = z + 0.3 + Math.max(1, Math.round((top - g) / 0.18)) * 0.3;
    g = Math.min(gy(c, x - w, out), gy(c, x, out), gy(c, x + w, out), gy(c, x, z + 0.6));
  }

  const drop = top - g;

  if (drop < 0.08) return;
  const n = Math.max(1, Math.round(drop / 0.18));

  for (let i = 0; i < n; i++) {
    const y = top - ((i + 1) * drop) / (n + 1);
    c.b.box(mat, [x, (g - 0.15 + y) / 2, z + 0.15 + i * 0.3], [w, (y - g + 0.15) / 2, 0.15]);
  }
}

/** A laterite wall round the yard, stepping with the ground, its gate on the front. */
function yardWall(c: Ctx, hw: number, front: number, back: number, gate: number, plastered: Mat | null) {
  const { b, r } = c;
  const mat = plastered ?? M.laterite;

  const run = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.2));

    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const mx = ax + (bx - ax) * (t0 + t1) / 2;
      const mz = az + (bz - az) * (t0 + t1) / 2;

      if (Math.abs(mz - front) < 0.01 && Math.abs(mx) < gate / 2 + 0.2) continue;
      const g = gy(c, mx, mz);
      const along = Math.abs(bx - ax) > Math.abs(bz - az);
      const half = (len / n) / 2 + 0.02;
      const hx = along ? half : 0.14;
      const hz = along ? 0.14 : half;
      b.box(mat, [mx, g + 0.4, mz], [hx, 0.8, hz]);
      b.box(plastered ? TRIM : M.plaster, [mx, g + 1.24, mz], [hx + 0.03, 0.04, hz + 0.03]);

      // A gap broken in an old wall now and then, moss on the coping
      if (!plastered && r() < 0.05) b.box(M.lateriteDark, [mx, g + 1.3, mz], [hx * 0.6, 0.06, hz + 0.02]);
    }
  };

  run(-hw, front, hw, front);
  run(hw, front, hw, -back);
  run(hw, -back, -hw, -back);
  run(-hw, -back, -hw, front);
}

/** Gate pillars on the front wall, with globe lamps on the newer houses, and a steel gate. */
function gatePosts(c: Ctx, front: number, gate: number, globes: boolean, mat: Mat) {
  const { b, r } = c;

  for (const s of [-1, 1]) {
    const x = (s * gate) / 2 + s * 0.2;
    const g = gy(c, x, front);
    b.box(mat, [x, g + 0.7, front], [0.22, 1.0, 0.22]);
    b.box(TRIM, [x, g + 1.74, front], [0.27, 0.05, 0.27]);

    if (globes) b.seeded(r() * 0.45, () => b.blob(GLOBE, [x, g + 1.95, front], [0.13, 0.15, 0.13], 8, 6));
  }

  // The gate standing open for the evening, one leaf pushed back further than the other
  const g = gy(c, 0, front);

  for (const s of [-1, 1]) {
    const open = s > 0 ? 1.4 : 1.05 + (c.p.seed % 0.1) * 1.5;
    b.with({ at: [(s * gate) / 2, g, front], yaw: s * open }, () => {
      const w = gate / 2 - 0.05;
      b.box(H.grill, [-s * w / 2, 0.08, 0], [w / 2, 0.02, 0.02]);
      b.box(H.grill, [-s * w / 2, 1.2, 0], [w / 2, 0.02, 0.02]);

      for (let k = 0; k <= 8; k++) b.bar(H.grill, [-s * (k / 8) * w, 0.08, 0], [-s * (k / 8) * w, 1.2, 0], 0.01 * Math.SQRT2);
    });
  }
}

/** The yard's life: a well, a clothesline, firewood and husks, a tulsi pedestal or a cross. */
function yard(c: Ctx, hw: number, front: number, back: number) {
  const { b, r, p } = c;
  // The well, in a back corner, its pulley on a frame
  const wx = (r() < 0.5 ? -1 : 1) * (hw - 1.6);
  const wz = -back + 1.6;
  const g = gy(c, wx, wz);
  b.with({ at: [wx, g, wz], yaw: 0 }, () => {
    b.lathe(r() < 0.5 ? M.laterite : M.concrete, [0, 0, 0], [[0.82, -0.1], [0.82, 0.85], [0.9, 0.85], [0.9, 0.92], [0.68, 0.92], [0.68, -0.1]], 16);
    b.disc(M.dark, [0, 0.4, 0], 0.68, 16, 1);

    for (const s of [-1, 1]) b.box(M.wood, [s * 0.86, 1.4, 0], [0.05, 0.55, 0.05]);
    b.box(M.wood, [0, 1.95, 0], [0.95, 0.04, 0.04]);
    b.box(H.grill, [0.1, 1.82, 0], [0.03, 0.1, 0.1]);
    b.bar(H.rope, [0.1, 1.72, 0], [0.1, 0.95, 0], 0.006);

    if (r() < 0.5) b.roof(M.tile, [0, 0, 0], [1.15, 0.8], [1.1, 0.05], 2.0, 2.5, { rows: 1 });
  });

  if (r() < 0.8) b.prop('bucket', [wx + 1.1, gy(c, wx + 1.1, wz), wz], r() * 6, 0.8);
  // The clothesline across the side yard, a few clothes left out
  const cx = -Math.sign(wx) * (hw - 0.8);
  const cz0 = -back + 1;
  const cz1 = front - 3.5;
  const h = 1.85;

  for (const z of [cz0, cz1]) b.box(M.wood, [cx, gy(c, cx, z) + h / 2, z], [0.035, h / 2, 0.035]);
  const gl = (gy(c, cx, cz0) + gy(c, cx, cz1)) / 2;
  b.bar(H.rope, [cx, gy(c, cx, cz0) + h, cz0], [cx, gy(c, cx, cz1) + h, cz1], 0.006);
  const rubber = p.x > 60 && r() < 0.6;

  for (let z = cz0 + 0.6; z < cz1 - 0.4; z += 0.5 + r() * 0.9) {
    if (r() < 0.35) continue;
    const t = (z - cz0) / (cz1 - cz0);
    const y = gy(c, cx, cz0) * (1 - t) + gy(c, cx, cz1) * t + h - 0.03;

    if (rubber) b.box(H.sheet, [cx, y - 0.4, z], [0.006, 0.4, 0.28]);
    else {
      const len = 0.4 + r() * 0.6;
      b.box(CLOTHS[Math.floor(r() * CLOTHS.length)]!, [cx, y - len / 2, z], [0.006, len / 2, 0.22 + r() * 0.15]);
    }
  }

  void gl;
  // Firewood under the back eave, coconut husks heaped beside it
  const fx = Math.sign(wx) * -1 * (hw * 0.3);
  const fz = -c.p.d - 0.7;
  const fg = gy(c, fx, fz);

  for (let i = 0; i < 6; i++) b.box(H.firewood, [fx + (r() - 0.5) * 0.15, fg + 0.06 + (i % 3) * 0.11, fz + (r() - 0.5) * 0.1], [0.5 + r() * 0.15, 0.05, 0.05]);

  for (let i = 0; i < 9; i++) b.blob(H.husk, [fx + 1.3 + (r() - 0.5) * 0.7, fg + 0.08 + r() * 0.12, fz + (r() - 0.5) * 0.6], [0.12, 0.09, 0.16], 6, 4, 0.2);

  // Faith at the front: a tulsi pedestal in the front yard, or a cross over the door
  if (p.faith === 'hindu') {
    const tz = front - 2.6 - (c.p.kind === 'tharavad' ? 1 : 0);
    // In a shallow yard it would stand on the front steps: off to one side of the path instead
    const tx = tz < c.p.d + 4.4 ? 2.0 * (c.p.seed > 0.5 ? 1 : -1) : 0;
    const tg = gy(c, tx, tz);
    b.with({ at: [tx, tg, tz], yaw: 0 }, () => {
      b.box(M.laterite, [0, 0.08, 0], [0.42, 0.1, 0.42]);
      b.frustum(H.tulsiThara, [0, 0, 0], [0.3, 0.3], [0.24, 0.24], 0.16, 0.75, 'top');
      b.box(H.tulsiThara, [0, 0.8, 0], [0.32, 0.05, 0.32]);

      // A little lamp left on its ledge at dusk, still burning
      if (r() < 0.5) {
        b.lathe(M.brass, [0, 0.38, 0.33], [[0, 0], [0.03, 0.01], [0.035, 0.03], [0, 0.025]], 8);
        b.seeded(r() * 0.45, () => b.flame(M.flame, [0, 0.42, 0.33], 0.045));
        const at = world(c, tx, tg + 0.5, tz + 0.4);
        c.lamps.push({ position: at, color: [1, 0.62, 0.28], intensity: 0.35, range: 3, kind: 'oil', seed: 0.2 });
      }
    });
    c.tulsi.push(world(c, tx, tg + 0.85, tz));
  }
}

// ---------------------------------------------------------------- the house kinds

function oldHouse(c: Ctx) {
  const { b, r, p } = c;
  const { w, d } = p;
  const wall = OLD_WALLS[Math.floor(r() * OLD_WALLS.length)]!;
  const V = 1.9;
  plinth(c, M.laterite, -w - 0.3, w + 0.3, -d - 0.3, d + V + 0.1);
  b.box(H.oxide, [0, 0.01, d + V / 2], [w + 0.2, 0.012, V / 2]);
  steps(c, 0, d + V + 0.1, 0.7, M.granite);
  b.box(wall, [0, 1.5, 0], [w, 1.5, d], 'y-');
  b.box(M.lateriteDark, [0, 0.12, 0], [w + 0.02, 0.12, d + 0.02], 'y-y+');
  // Veranda posts, and the sloping wooden seat between them at either end
  const posts = [-w + 0.15, -w / 3, w / 3, w - 0.15];

  for (const x of posts) {
    b.tube(M.teak, [x, 0, d + V - 0.1], 0.08, 0.07, 2.75, 8, { rings: 1 });
    b.box(M.granite, [x, 0.06, d + V - 0.1], [0.12, 0.06, 0.12]);
  }

  for (const s of [-1, 1]) {
    const x0 = s > 0 ? w / 3 + 0.1 : -w + 0.25;
    const x1 = s > 0 ? w - 0.25 : -w / 3 - 0.1;
    const mx = (x0 + x1) / 2;
    const hx = (x1 - x0) / 2;
    b.box(wall, [mx, 0.25, d + V - 0.1], [hx, 0.25, 0.12]);
    b.box(M.teak, [mx, 0.52, d + V - 0.25], [hx, 0.025, 0.2]);
    // The charupady's backrest leaning out
    b.with({ at: [mx, 0.85, d + V - 0.02], yaw: 0 }, () => {
      b.box(M.teak, [0, 0.3, 0.06], [hx, 0.03, 0.03]);

      for (let x = -hx + 0.1; x <= hx - 0.05; x += 0.22) b.bar(M.teak, [x, -0.3, -0.02], [x, 0.3, 0.08], 0.018);
    });
  }

  doorAt(c, [0, 0, d], 1.0, 2.05, M.teak, r() < 0.3);

  for (const s of [-1, 1]) windowAt(c, [s * w * 0.62, 1.45, d], 0, 0.42, 0.5, 'wood', p.lit && r() < 0.7);

  for (const s of [-1, 1]) windowAt(c, [s * w, 1.45, -d * 0.3], (s * Math.PI) / 2, 0.38, 0.45, 'wood', p.lit && r() < 0.4);
  // The hipped roof running out over the veranda, ridge tiles and finials
  const tile = r() < 0.55 ? M.tile : M.mtile;
  const zc = V / 2;
  b.roof(tile, [0, 0, zc], [w + 0.75, d + V / 2 + 0.75], [w * 0.42, 0.12], 2.78, 4.85, { sag: 0.1, rows: 5 });
  b.frustum(M.wood, [0, 0, zc], [w + 0.75, d + V / 2 + 0.75], [w + 0.68, d + V / 2 + 0.68], 2.7, 2.78, 'bottom');
  b.box(tile, [0, 4.9, zc], [w * 0.42 + 0.06, 0.06, 0.1]);

  for (const s of [-1, 1]) b.lathe(M.tile, [s * (w * 0.42 + 0.05), 4.9, zc], [[0.06, 0], [0.04, 0.12], [0.07, 0.2], [0, 0.3]], 6);

  // A kitchen wing behind with its own lean-to roof and a smoke-blackened chimney
  if (r() < 0.7) {
    const kw = w * 0.55;
    const kx = (r() < 0.5 ? -1 : 1) * (w - kw);
    plinth(c, M.laterite, kx - kw, kx + kw, -d - 2.2, -d, -0.1);
    b.box(wall, [kx, 1.15, -d - 1.1], [kw, 1.25, 1.1], 'y-');
    b.with({ at: [kx, 0, -d - 1.1], yaw: 0 }, () => {
      b.plane(tile, [-kw - 0.4, 2.5, 0.3], [kw + 0.4, 2.5, 0.3], [kw + 0.4, 2.0, -1.6], [-kw - 0.4, 2.0, -1.6], [0, 1, -0.3]);
      b.box(M.lateriteDark, [kw * 0.5, 2.7, -0.5], [0.18, 0.5, 0.18]);
    });
    // Supper cooked late on a wood fire in some kitchens: chosen by the plot, not the dice, so
    // the rest of the village stays as it was
    const pick = Math.abs(Math.sin(c.p.x * 12.9898 + c.p.z * 78.233) * 43758.5453) % 1;

    if (p.lit && pick < 0.45) c.chimneys.push(world(c, kx + kw * 0.5, 3.22, -d - 1.6));
  }

  bulb(c, [0, 2.55, d + V * 0.6], 'bulb');
  props(c, d + V * 0.5, wall);
}

function tharavad(c: Ctx) {
  const { b, r, p } = c;
  const { w, d } = p;
  const pl = 0.9;
  // The high plinth with its moulded granite edge
  plinth(c, M.laterite, -w - 0.4, w + 0.4, -d - 0.4, d + 2.4, pl);
  b.box(M.granite, [0, pl + 0.04, d / 2 + 1], [w + 0.5, 0.05, d + 1.5]);
  b.box(H.oxide, [0, pl + 0.1, d + 1.2], [w + 0.2, 0.02, 1.15]);
  // Ground floor: thick white walls
  b.box(M.plaster, [0, pl + 1.65, 0], [w, 1.6, d], 'y-');
  doorAt(c, [0, pl + 0.1, d], 1.3, 2.3, M.teak);

  for (const x of [-w * 0.7, -w * 0.35, w * 0.35, w * 0.7]) windowAt(c, [x, pl + 1.6, d], 0, 0.42, 0.55, 'wood', p.lit && r() < 0.45);

  for (const s of [-1, 1]) for (const z of [-d * 0.5, d * 0.3]) windowAt(c, [s * w, pl + 1.6, z], (s * Math.PI) / 2, 0.42, 0.55, 'wood', p.lit && r() < 0.3);

  // The long veranda of round posts, the lower roof skirting the whole house
  for (let i = 0; i <= 8; i++) {
    const x = -w + 0.1 + (i / 8) * (w * 2 - 0.2);
    b.tube(M.teak, [x, pl + 0.1, d + 2.2], 0.09, 0.08, 2.75, 10, { rings: 1 });
    b.lathe(M.granite, [x, pl + 0.1, d + 2.2], [[0.15, 0], [0.15, 0.12], [0.1, 0.16], [0, 0.16]], 8);
  }

  b.roof(M.tile, [0, 0, 1.1], [w + 0.9, d + 2.0], [w - 0.2, d - 0.9], pl + 2.9, pl + 4.3, { sag: 0.08, rows: 4 });
  b.frustum(M.wood, [0, 0, 1.1], [w + 0.9, d + 2.0], [w + 0.82, d + 1.92], pl + 2.82, pl + 2.9, 'bottom');
  // The upper floor: teak walls with lattice windows, set in from the lower walls
  const uw = w - 0.4;
  const ud = d - 1.0;
  b.box(M.teak, [0, pl + 4.4, -0.2], [uw, 1.15, ud], 'y-');

  for (let x = -uw + 0.8; x < uw - 0.5; x += 1.25) {
    const glow = p.lit && r() < 0.3;
    b.seeded(r() * 0.45, () => b.box(glow ? WINDOW : M.dark, [x, pl + 4.45, ud - 0.18], [0.35, 0.45, 0.01]));

    for (let k = -3; k <= 3; k++) b.box(M.wood, [x + k * 0.1, pl + 4.45, ud - 0.16], [0.012, 0.45, 0.012]);

    for (let k = -2; k <= 2; k++) b.box(M.wood, [x, pl + 4.45 + k * 0.18, ud - 0.16], [0.35, 0.012, 0.012]);
  }

  // The upper roof, steep, its gables at either end in carved lattice with brass finials
  const y0 = pl + 5.5;
  const y1 = pl + 8.2;
  b.roof(M.tile, [0, 0, -0.2], [uw + 1.0, ud + 1.0], [uw * 0.55, 0.12], y0, y1, { sag: 0.14, rows: 6 });
  b.frustum(M.wood, [0, 0, -0.2], [uw + 1.0, ud + 1.0], [uw + 0.92, ud + 0.92], y0 - 0.08, y0, 'bottom');

  for (const s of [-1, 1]) {
    const gx = s * uw * 0.55;
    b.with({ at: [gx, 0, -0.2], yaw: (s * Math.PI) / 2 }, () => {
      const gh = (y1 - y0) * 0.55;
      b.tri(M.woodRed, [-0.9, y1 - gh, 0.02], [0.9, y1 - gh, 0.02], [0, y1, 0.02], [0, 0, 1]);

      for (let k = -3; k <= 3; k++) b.box(M.gold, [k * 0.2, y1 - gh * 0.55, 0.04], [0.01, gh * 0.35 * (1 - Math.abs(k) / 4.5), 0.01]);
      b.bar(M.wood, [-1.0, y1 - gh - 0.05, 0.05], [0, y1 + 0.05, 0.05], 0.04);
      b.bar(M.wood, [1.0, y1 - gh - 0.05, 0.05], [0, y1 + 0.05, 0.05], 0.04);
    });
    b.lathe(M.brass, [gx, y1, -0.2], [[0.08, 0], [0.05, 0.12], [0.09, 0.24], [0.03, 0.38], [0, 0.5]], 8);
  }

  b.box(M.tile, [0, y1 + 0.04, -0.2], [uw * 0.55, 0.06, 0.1]);
  // The front porch (poomukham) out in front, with its own gable to the yard
  const pz = d + 2.2;
  b.box(H.oxide, [0, pl + 0.12, pz + 1.2], [2.0, 0.02, 1.2]);
  plinth(c, M.laterite, -2.1, 2.1, pz, pz + 2.6, pl + 0.1);

  for (const s of [-1, 1]) for (const z of [pz + 0.2, pz + 2.35]) {
    b.tube(M.teak, [s * 1.85, pl + 0.12, z], 0.1, 0.09, 2.6, 10, { rings: 1 });
  }

  b.with({ at: [0, 0, pz + 1.3], yaw: 0 }, () => {
    b.roof(M.tile, [0, 0, 0], [2.4, 1.7], [0.1, 1.6], pl + 2.75, pl + 4.4, { rows: 3, sides: [1, 3] });
    b.tri(M.woodRed, [-2.3, pl + 2.75, 1.62], [2.3, pl + 2.75, 1.62], [0, pl + 4.4, 1.62], [0, 0, 1]);

    for (let k = -5; k <= 5; k++) b.box(M.gold, [k * 0.36, pl + 3.05 + (1 - Math.abs(k) / 6) * 0.5, 1.66], [0.012, (1 - Math.abs(k) / 6) * 0.45, 0.012]);
    b.lathe(M.brass, [0, pl + 4.4, 1.62], [[0.07, 0], [0.04, 0.1], [0.07, 0.2], [0, 0.4]], 8);
  });
  steps(c, 0, pz + 2.6, 0.9, M.granite, pl + 0.1);
  // A brass lamp hanging in the porch, lit
  b.bar(M.brass, [0, pl + 2.75, pz + 1.3], [0, pl + 2.2, pz + 1.3], 0.006);
  b.lathe(M.brass, [0, pl + 2.0, pz + 1.3], [[0, 0], [0.1, 0.02], [0.14, 0.08], [0.1, 0.1], [0.03, 0.12], [0.03, 0.2], [0, 0.22]], 10);
  b.seeded(0.33, () => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.flame(M.flame, [Math.sin(a) * 0.12, pl + 2.1, pz + 1.3 + Math.cos(a) * 0.12], 0.05);
    }
  });
  c.lamps.push({ position: world(c, 0, pl + 2.2, pz + 1.3), color: [1, 0.6, 0.26], intensity: 1.6, range: 7, kind: 'oil', seed: 0.33 });
  props(c, d + 1.2, M.plaster, pl + 0.1);
}

function gatehouse(c: Ctx, front: number) {
  // The padippura: a gate passage in the wall under its own tiled roof, a lamp burning in it
  const { b } = c;
  const g = gy(c, 0, front);
  b.with({ at: [0, g, front], yaw: 0 }, () => {
    for (const s of [-1, 1]) {
      b.box(M.laterite, [s * 1.45, 0.9, 0], [0.75, 0.9, 0.9]);
      b.box(M.plaster, [s * 1.45, 1.84, 0], [0.78, 0.04, 0.93]);
    }

    b.box(M.granite, [0, 0.05, 0], [0.7, 0.05, 0.9]);

    for (const s of [-1, 1]) for (const z of [-0.8, 0.8]) b.box(M.teak, [s * 0.72, 2.2, z], [0.06, 0.4, 0.06]);
    b.roof(M.tile, [0, 0, 0], [2.6, 1.6], [1.0, 0.1], 2.55, 3.9, { rows: 3 });
    b.frustum(M.wood, [0, 0, 0], [2.6, 1.6], [2.52, 1.52], 2.48, 2.55, 'bottom');
    b.box(M.teak, [0, 2.5, 0], [1.4, 0.06, 1.0]);
    // A wick lamp in a niche of the gate wall
    b.box(M.dark, [-0.72, 1.3, 0.4], [0.03, 0.18, 0.12]);
    b.lathe(M.brass, [-0.69, 1.14, 0.4], [[0, 0], [0.04, 0.01], [0.04, 0.03], [0, 0.03]], 8);
    b.seeded(0.18, () => b.flame(M.flame, [-0.67, 1.18, 0.4], 0.05));
  });
  c.lamps.push({ position: world(c, -0.5, g + 1.3, front + 0.4), color: [1, 0.6, 0.26], intensity: 0.7, range: 4.5, kind: 'oil', seed: 0.18 });
}

function concrete(c: Ctx) {
  const { b, r, p } = c;
  const { w, d } = p;
  const wall = p.faith === 'muslim' && r() < 0.5 ? GREENS[Math.floor(r() * GREENS.length)]! : BRIGHT[Math.floor(r() * BRIGHT.length)]!;
  const S = 2.2;
  plinth(c, M.concrete, -w - 0.15, w + 0.15, -d - 0.15, d + S + 0.1, 0.05);
  b.box(H.ceramic, [0, 0.06, d + S / 2], [w * 0.55, 0.012, S / 2]);
  steps(c, -w * 0.15, d + S + 0.1, 0.8, H.ceramic);
  b.box(wall, [0, 1.6, 0], [w, 1.55, d], 'y-');
  b.box(TRIM, [0, 0.2, 0], [w + 0.01, 0.15, d + 0.01], 'y-y+');
  // The roof slab, its overhang, the parapet round the terrace
  b.box(TRIM, [0, 3.22, 0.1], [w + 0.4, 0.08, d + 0.5]);

  for (const [x, z, hx, hz] of [[0, d + 0.55, w + 0.4, 0.06], [0, -d - 0.35, w + 0.4, 0.06], [w + 0.35, 0.1, 0.06, d + 0.45], [-w - 0.35, 0.1, 0.06, d + 0.45]] as const) {
    b.box(wall, [x, 3.62, z], [hx, 0.32, hz]);
    b.box(TRIM, [x, 3.96, z], [hx + 0.02, 0.03, hz + 0.02]);
  }

  // The sit-out: a slab on two square pillars under a little tiled roof
  b.box(TRIM, [-w * 0.15, 3.0, d + S / 2 + 0.1], [w * 0.62, 0.08, S / 2 + 0.2]);

  for (const s of [-1, 1]) b.box(wall, [-w * 0.15 + s * w * 0.55, 1.5, d + S - 0.05], [0.14, 1.45, 0.14]);
  b.box(wall, [-w * 0.15 - w * 0.55 + 0.6, 0.45, d + S - 0.05], [0.5, 0.4, 0.08]);
  b.with({ at: [-w * 0.15, 0, d + S / 2 + 0.2], yaw: 0 }, () => {
    b.roof(M.mtile, [0, 0, 0], [w * 0.72, S / 2 + 0.5], [0.15, S / 2 + 0.35], 3.1, 4.15, { rows: 2, sides: [1, 3] });
    b.tri(wall, [-w * 0.7, 3.1, S / 2 + 0.36], [w * 0.7, 3.1, S / 2 + 0.36], [0, 4.15, S / 2 + 0.36], [0, 0, 1]);
    b.box(H.glass, [0, 3.5, S / 2 + 0.38], [0.2, 0.2, 0.01]);
  });
  doorAt(c, [-w * 0.15, 0.05, d], 1.0, 2.1, M.teak);
  windowAt(c, [w * 0.62, 1.55, d], 0, 0.6, 0.6, 'modern', p.lit && r() < 0.7);
  windowAt(c, [-w * 0.8, 1.55, d], 0, 0.35, 0.6, 'modern', p.lit && r() < 0.4);

  for (const s of [-1, 1]) windowAt(c, [s * w, 1.55, -d * 0.35], (s * Math.PI) / 2, 0.55, 0.6, 'modern', p.lit && r() < 0.45);
  // On the terrace: the stair room and the black water tank on its stand
  const tx = w * 0.45;
  const tz = -d * 0.45;

  if (r() < 0.6) {
    b.box(wall, [-w * 0.5, 4.4, -d * 0.5], [1.0, 1.15, 1.2], 'y-');
    b.box(TRIM, [-w * 0.5, 5.6, -d * 0.5], [1.15, 0.06, 1.35]);
  }

  b.box(M.concrete, [tx, 3.45, tz], [0.5, 0.15, 0.5]);
  b.lathe(H.tank, [tx, 3.6, tz], [[0, 0], [0.55, 0], [0.58, 0.1], [0.58, 1.0], [0.5, 1.12], [0.2, 1.18], [0.2, 1.25], [0, 1.25]], 14);
  bulb(c, [-w * 0.15, 2.92, d + S * 0.5], 'tube');
  props(c, d + S * 0.5, wall, 0.06);
}

function storey(c: Ctx) {
  const { b, r, p } = c;
  const { w, d } = p;
  const wall = BRIGHT[Math.floor(r() * BRIGHT.length)]!;
  const accent = BRIGHT[Math.floor(r() * BRIGHT.length)]!;
  const S = 1.9;
  plinth(c, M.concrete, -w - 0.15, w + 0.15, -d - 0.15, d + S + 0.1, 0.05);
  b.box(H.ceramic, [0, 0.06, d + S / 2], [w, 0.012, S / 2]);
  steps(c, 0, d + S + 0.1, 0.9, H.ceramic);
  b.box(wall, [0, 1.55, 0], [w, 1.5, d], 'y-');
  b.box(accent, [0, 3.12, 0.05], [w + 0.08, 0.12, d + 0.1]);
  b.box(wall, [0, 4.6, 0], [w, 1.45, d]);
  // The balcony on the first floor, over the sit-out, on round pillars, a baluster rail
  b.box(TRIM, [0, 3.05, d + S / 2], [w, 0.1, S / 2]);

  for (const s of [-1, 1]) b.tube(TRIM, [s * (w - 0.25), 0, d + S - 0.2], 0.14, 0.14, 2.95, 12, { rings: 1 });

  for (let x = -w + 0.1; x <= w - 0.1; x += 0.18) b.lathe(TRIM, [x, 3.15, d + S - 0.08], [[0.04, 0], [0.025, 0.2], [0.045, 0.45], [0.025, 0.7], [0.04, 0.8], [0, 0.8]], 6);
  b.box(TRIM, [0, 3.98, d + S - 0.08], [w, 0.04, 0.09]);
  doorAt(c, [0, 0.05, d], 1.1, 2.1, M.teak);
  doorAt(c, [0, 3.15, d], 0.9, 2.0, M.teak, p.lit && r() < 0.3);

  for (const s of [-1, 1]) {
    windowAt(c, [s * w * 0.62, 1.5, d], 0, 0.5, 0.6, 'modern', p.lit && r() < 0.6);
    windowAt(c, [s * w * 0.62, 4.6, d], 0, 0.5, 0.6, 'modern', p.lit && r() < 0.5);
    windowAt(c, [s * w, 1.5, 0], (s * Math.PI) / 2, 0.5, 0.6, 'modern', p.lit && r() < 0.3);
    windowAt(c, [s * w, 4.6, 0], (s * Math.PI) / 2, 0.5, 0.6, 'modern', p.lit && r() < 0.3);
  }

  // The sloped concrete roof under Mangalore tiles, a gable to the front
  b.roof(M.mtile, [0, 0, 0], [w + 0.7, d + 0.7], [w * 0.4, 0.1], 6.05, 7.9, { sag: 0.05, rows: 4 });
  b.frustum(TRIM, [0, 0, 0], [w + 0.7, d + 0.7], [w + 0.66, d + 0.66], 5.98, 6.05, 'bottom');
  b.with({ at: [0, 0, d * 0.4], yaw: 0 }, () => {
    b.roof(M.mtile, [0, 0, 0.3], [2.2, d * 0.6 + 1.0], [0.1, d * 0.6 + 0.9], 6.05, 7.7, { rows: 3, sides: [1, 3] });
    b.tri(accent, [-2.1, 6.05, d * 0.6 + 1.2], [2.1, 6.05, d * 0.6 + 1.2], [0, 7.7, d * 0.6 + 1.2], [0, 0, 1]);

    for (let k = -2; k <= 2; k++) b.box(H.grill, [k * 0.14, 6.6, d * 0.6 + 1.23], [0.04, 0.22, 0.01]);
  });
  bulb(c, [0, 2.9, d + S * 0.5], 'tube');

  if (r() < 0.5) bulb(c, [w * 0.6, 5.8, d + S * 0.5], 'bulb', false);
  props(c, d + S * 0.5, wall, 0.06);
}

function hut(c: Ctx) {
  const { b, r, p } = c;
  const { w, d } = p;
  plinth(c, M.lateriteDark, -w - 0.1, w + 0.1, -d - 0.1, d + 1.2, 0);
  b.box(M.laterite, [0, 1.2, 0], [w, 1.2, d], 'y-');
  // Door with a cloth hung over it, a single window
  b.box(M.teak, [-w * 0.3, 1.0, d + 0.02], [0.45, 1.0, 0.02]);
  b.box(CLOTHS[Math.floor(r() * CLOTHS.length)]!, [-w * 0.3, 1.05, d + 0.05], [0.4, 0.9, 0.006]);
  windowAt(c, [w * 0.5, 1.4, d], 0, 0.3, 0.35, 'wood', p.lit && r() < 0.6);
  // The tin roof, one slope, rusting, held down with stones
  const roof = r() < 0.6 ? H.rust : H.asbestos;
  b.plane(roof, [-w - 0.5, 2.7, d + 1.3], [w + 0.5, 2.7, d + 1.3], [w + 0.5, 2.35, -d - 0.5], [-w - 0.5, 2.35, -d - 0.5], [0, 1, 0.2]);
  b.plane(roof, [-w - 0.5, 2.69, d + 1.3], [w + 0.5, 2.69, d + 1.3], [w + 0.5, 2.34, -d - 0.5], [-w - 0.5, 2.34, -d - 0.5], [0, -1, -0.2]);
  b.box(M.laterite, [0, 2.55, d], [w, 0.15, 0.1]);

  for (const s of [-1, 1]) b.box(M.wood, [s * w, 1.25, d + 1.2], [0.05, 1.3, 0.05]);

  for (let i = 0; i < 4; i++) b.blob(M.granite, [(r() - 0.5) * w * 1.6, 2.6 - r() * 0.2, (r() - 0.5) * d * 1.4], [0.14, 0.08, 0.12], 6, 3, 0.3);

  if (p.lit) bulb(c, [0, 2.3, d + 0.6], 'bulb');

  // A short clay pipe at the back of the roof, over the hearth, its smoke rising into the night
  if (p.lit) {
    b.lathe(M.lateriteDark, [w * 0.55, 2.3, -d * 0.6], [[0.1, 0], [0.09, 0.45], [0.11, 0.5], [0, 0.5]], 8);
    c.chimneys.push(world(c, w * 0.55, 2.85, -d * 0.6));
  }
}

/** A veranda light: a warm bulb in older houses, a white CFL tube in newer ones. */
function bulb(c: Ctx, at: V3, kind: 'bulb' | 'tube', lit = true) {
  const { b, p } = c;

  if (!p.lit) return;

  if (kind === 'tube') b.box(CFL, at, [0.3, 0.02, 0.02]);
  else b.blob(BULB, at, [0.05, 0.07, 0.05], 6, 4);

  if (lit) {
    c.lamps.push({ position: world(c, at[0], at[1] - 0.1, at[2]), color: kind === 'tube' ? [0.85, 0.95, 1] : [1, 0.68, 0.32], intensity: kind === 'tube' ? 2.2 : 2.4, range: 9, kind: kind === 'tube' ? 'tube' : 'bulb', seed: p.seed * 0.45 });
  }
}

/** Chairs on the veranda, pots on its edge, anthuriums in the yard, a cross over the door. */
function props(c: Ctx, vz: number, wall: Mat, floor = 0) {
  const { b, r, p } = c;
  const j = (r() - 0.5) * 0.8;

  if (p.lit) c.seats.push({ at: world(c, p.w * 0.45, floor, vz), yaw: p.yaw + j });
  b.prop('monobloc', [p.w * 0.45, floor, vz], j, 1, r() < 0.5 ? [0.85, 0.83, 0.78] : r() < 0.5 ? [0.08, 0.2, 0.12] : [0.5, 0.08, 0.06]);

  if (r() < 0.5) b.prop('monobloc', [p.w * 0.1, floor, vz + 0.2], (r() - 0.5) * 0.8, 1, [0.85, 0.83, 0.78]);

  for (const s of [-1, 1]) if (r() < 0.7) b.prop('planter', [s * (p.w - 0.1), floor, vz + 0.8], r() * 6);
  const g1 = gy(c, -p.w - 0.9, p.d + 2.9);
  const g2 = gy(c, p.w + 1.0, p.d + 2.4);
  b.prop('anthurium', [-p.w - 0.9, g1, p.d + 2.9], r() * 6, 0.55);
  b.prop('anthurium', [p.w + 1.0, g2, p.d + 2.4], r() * 6, 0.45);

  if (p.faith === 'christian') {
    // A wooden cross over the door
    b.box(M.wood, [0, 2.55 + floor, p.d + 0.04], [0.025, 0.2, 0.02]);
    b.box(M.wood, [0, 2.62 + floor, p.d + 0.04], [0.11, 0.025, 0.02]);
  }

  void wall;
}

function plotHouse(b: Builder, r: () => number, p: Plot, lamps: Lamp[], tulsi: V3[], chimneys: V3[], seats: Seat[]) {
  // The floor sits just above the highest ground under the house
  let top = -Infinity;

  for (const lx of [-p.w, 0, p.w]) for (const lz of [-p.d, 0, p.d]) {
    const [x, z] = plotPoint(p, lx, lz);
    top = Math.max(top, heightAt(x, z));
  }

  const F = top + (p.kind === 'hut' ? 0.2 : 0.45);
  const c: Ctx = { b, r, p, F, lamps, tulsi, chimneys, seats };
  const hw = p.w + 2.6;
  const front = p.d + 5.5;
  const back = p.d + 2;
  b.with({ at: [p.x, F, p.z], yaw: p.yaw }, () => {
    if (p.kind === 'old') oldHouse(c);
    else if (p.kind === 'tharavad') tharavad(c);
    else if (p.kind === 'concrete') concrete(c);
    else if (p.kind === 'storey') storey(c);
    else hut(c);
    const modern = p.kind === 'concrete' || p.kind === 'storey';

    if (p.kind !== 'hut' || r() < 0.4) {
      const gate = p.kind === 'tharavad' ? 3.2 : 2.6;
      yardWall(c, hw, front, back, gate, modern && r() < 0.7 ? BRIGHT[Math.floor(r() * BRIGHT.length)]! : null);

      if (p.kind === 'tharavad') gatehouse(c, front);
      else gatePosts(c, front, gate, modern, modern ? TRIM : M.laterite);
    }

    yard(c, hw, front, back);
  });
}

/** A far house up on the hills: walls, a roof and a lit window, seen through the trees. */
function farHouse(b: Builder, r: () => number, at: V3, yaw: number, lit: boolean) {
  const W = 3.2 + r() * 1.2;
  const D = 2.6 + r() * 0.8;
  const modern = r() < 0.4;
  const wall = modern ? BRIGHT[Math.floor(r() * BRIGHT.length)]! : OLD_WALLS[Math.floor(r() * OLD_WALLS.length)]!;
  b.with({ at, yaw }, () => {
    b.box(M.laterite, [0, -0.6, 0.6], [W + 0.4, 1.1, D + 1.6], 'y-');
    b.box(wall, [0, 0.5 + 1.4, 0], [W, 1.4, D], 'y-');

    for (const s of [-1, 1]) b.seeded(r() * 0.45, () => b.box(lit && r() < 0.7 ? (r() < 0.4 ? TUBE_WINDOW : WINDOW) : M.dark, [s * W * 0.6, 0.5 + 1.45, D + 0.02], [0.45, 0.45, 0.03]));

    if (modern) {
      b.box(TRIM, [0, 3.35, 0], [W + 0.3, 0.08, D + 0.3]);
      b.box(wall, [0, 3.7, 0], [W + 0.25, 0.3, D + 0.25]);
      b.lathe(H.tank, [W * 0.5, 3.45, -D * 0.4], [[0, 0], [0.55, 0], [0.55, 1.0], [0, 1.1]], 8);
    } else {
      b.roof(r() < 0.5 ? M.tile : M.mtile, [0, 0, 0.8], [W + 0.7, D + 1.6 + 0.7], [W * 0.45, 0.12], 0.5 + 2.75, 0.5 + 4.9, { sag: 0.1, rows: 2 });
    }

    if (lit) b.blob(modern ? CFL : BULB, [0, 0.5 + 2.55, D + 1.1], [0.05, 0.07, 0.05], 6, 4);
  });
}

export function buildVillage() {
  const b = new Builder(true);
  const lamps: Lamp[] = [];
  const tulsi: V3[] = [];
  const chimneys: V3[] = [];
  const seats: Seat[] = [];
  const r = rng(41);
  const homes: V3[] = [];

  for (const p of PLOTS) {
    plotHouse(b, r, p, lamps, tulsi, chimneys, seats);
    homes.push([p.x, heightAt(p.x, p.z), p.z]);
  }

  const church = buildChurch(b);
  const mosque = buildMosque(b);
  const bungalow = buildBungalow(b);
  buildRiver(b);
  buildFootpath(b);
  const jungle = buildJungle(b);
  lamps.push(...jungle.lamps, ...buildMachans(b).lamps);
  lamps.push(...church.lamps, ...mosque.lamps, ...bungalow.lamps);

  // Far houses up on the hills, seen through the trees as a roof and a lit window
  for (let i = 0; i < 500 && homes.length < PLOTS.length + 40; i++) {
    const a = r() * Math.PI * 2;
    const d = 150 + r() * 200;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;

    if (onRoad(x, z, 10) || pondQ(x, z) < 1.4) continue;

    if (homes.some((h) => Math.hypot(h[0] - x, h[2] - z) < 25)) continue;

    // Not on the forest path, and none in the forest: only the bungalow is up there
    if (trailDistance(x, z, 60) < 60) continue;
    const at: V3 = [x, heightAt(x, z), z];
    farHouse(b, r, at, r() * Math.PI * 2, r() < 0.8);
    homes.push(at);
  }

  return { model: b.model(), lamps, homes, tulsi, chimneys, seats, props: b.props, solids: b.solids };
}
