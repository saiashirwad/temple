// The trees: coconut palms leaning over the road and the pond, slim areca palms, the great banyan
// on its stone platform by the road, and dark mango and jackfruit trees. Every leaf is geometry,
// in clumps that shade as soft masses. Every tree is its own instance, swayed from the base up.

import { instances, shading, type meshPool } from '@typegpu/kit';
import { perlin3d } from '@typegpu/noise';
import { d, std } from 'typegpu';
import type { Tex } from '../../render/tex.ts';
import { TEX } from '../../generated/textures.gen.ts';
import { Builder, hex, P, type Mat, type V3 } from '../../render/geo.ts';
import { now } from '../../render/surfaces.ts';
import { add, crown, frond, lerp, nrm, sc, uneven, unit, type Clump } from './foliage.ts';
import { M } from '../../content/world.ts';

const g = (h: number, rough = 0.9): Mat => ({ color: hex(h), roughness: rough, pattern: P.LEAVES, doubleSided: true });

export const T = {
  palmBark: { color: hex(0x6a5a4a), roughness: 0.9, pattern: P.PALM_BARK },
  frond: { color: hex(0x4a6a22), roughness: 0.65, pattern: P.FROND, doubleSided: true },
  frondDark: { color: hex(0x35501a), roughness: 0.65, pattern: P.FROND, doubleSided: true },
  frondDry: { color: hex(0x8a7238), roughness: 0.8, pattern: P.FROND, doubleSided: true },
  rib: { color: hex(0x6a7a32), roughness: 0.7, pattern: P.PLAIN },
  coconut: { color: hex(0x6a7a28), roughness: 0.5, pattern: P.PLAIN },
  husk: { color: hex(0x5a3e24), roughness: 0.9, pattern: P.BARK },
  bark: { color: hex(0x4a3e34), roughness: 0.9, pattern: P.BARK },
  barkPale: { color: hex(0x7a6e60), roughness: 0.9, pattern: P.BARK },
  mango: [g(0x1f3a12), g(0x284616), g(0x1a3010)],
  jack: [g(0x22421a), g(0x2a4c1c), g(0x1c3814)],
  banyan: [g(0x2a4818), g(0x34541c), g(0x223e14), g(0x3e5a22)],
  core: { color: hex(0x0c1608), roughness: 0.9, pattern: P.PLAIN },
  arecaBark: { color: hex(0x9a9484), roughness: 0.85, pattern: P.PALM_BARK },
  crownshaft: { color: hex(0x5a7a2a), roughness: 0.5, pattern: P.PLAIN },
  jackfruit: { color: hex(0x6a7a2a), roughness: 0.8, pattern: P.GRANITE },
  areca: { color: hex(0xc07a20), roughness: 0.5, pattern: P.PLAIN },
  rubberBark: { color: hex(0x8a8478), roughness: 0.8, pattern: P.BARK },
  tapped: { color: hex(0x4a3a2c), roughness: 0.7, pattern: P.BARK },
  latex: { color: hex(0xe8e4d8), roughness: 0.3, pattern: P.PLAIN },
  cup: { color: hex(0x1a1a1a), roughness: 0.4, pattern: P.PLAIN },
  rubber: [g(0x2c4a18), g(0x36561e), g(0x405e22)],
  teak: [g(0x3a4a1c, 0.8), g(0x46561f, 0.8)],
} satisfies Record<string, Mat | Mat[]>;

export function coconutPalm(b: Builder, r: () => number, height: number, leanAngle: number, bend = 0.12 + r() * 0.18) {
  const lx = Math.sin(leanAngle) * bend * height;
  const lz = Math.cos(leanAngle) * bend * height;
  b.tube(T.palmBark, [0, -0.3, 0], 0.22, 0.13, height + 0.3, 10, {
    rings: 14,
    lean: (v) => [lx * v * v, lz * v * v],
    radius: (v) => 0.2 - v * 0.07 + (v < 0.06 ? (0.06 - v) * 3 : 0) + Math.sin(v * 40) * 0.004,
  });
  const top: V3 = [lx, height, lz];
  b.blob(T.husk, top, [0.24, 0.42, 0.24], 9, 5, 0.2);
  const n = 18 + Math.floor(r() * 6);
  const wear = r;

  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 * 2.618 + r() * 0.3;
    const age = (i / n) + r() * 0.2;
    // Young fronds stand up out of the crown, the rest arch out wide and level before their tips
    // fall; only the oldest few hang
    const rise = 1.0 - age * 1.05;
    const mat = age > 1.05 ? T.frondDry : r() < 0.5 ? T.frond : T.frondDark;
    frond(b, mat, T.rib, [top[0], top[1] + 0.25 - age * 0.3, top[2]], yaw, rise, 3.8 + r() * 1.2, 0.35 + age * 0.55, { wear, leaflets: 62, width: 0.075, reach: 0.95 });
  }

  // A dead frond hanging down the trunk
  if (r() < 0.6) frond(b, T.frondDry, T.husk, [top[0], top[1] - 0.2, top[2]], r() * 6.3, -1.6, 3.2, 0.2, { leaflets: 36, reach: 0.6, width: 0.07 });

  // Bunches of coconuts tucked under the crown
  for (let k = 0; k < 3; k++) {
    const a = r() * Math.PI * 2;

    for (let i = 0; i < 4 + Math.floor(r() * 4); i++) {
      const o = unit(r);
      b.blob(T.coconut, [top[0] + Math.sin(a) * 0.3 + o[0] * 0.15, top[1] - 0.25 + o[1] * 0.12, top[2] + Math.cos(a) * 0.3 + o[2] * 0.15], [0.12, 0.14, 0.12], 7, 5);
    }
  }
}

export function arecaPalm(b: Builder, r: () => number, height: number) {
  const la = r() * Math.PI * 2;
  const lean = r() * 0.5;
  const lx = Math.sin(la) * lean;
  const lz = Math.cos(la) * lean;
  b.tube(T.arecaBark, [0, -0.2, 0], 0.1, 0.075, height + 0.2, 8, { rings: 8, lean: (v) => [lx * v, lz * v], radius: (v) => 0.1 - v * 0.025 + Math.sin(v * 90) * 0.003 });
  b.tube(T.crownshaft, [lx, height, lz], 0.085, 0.07, 1.1, 8, { rings: 2 });
  const top: V3 = [lx, height + 1.1, lz];

  for (let i = 0; i < 8; i++) frond(b, r() < 0.5 ? T.frond : T.frondDark, T.rib, top, (i / 8) * Math.PI * 2 + r(), 1.0 - (i % 3) * 0.35, 2.3 + r() * 0.5, 1.0 + (i % 3) * 0.3, { leaflets: 34, reach: 0.62, width: 0.065 });

  for (let i = 0; i < 2; i++) {
    const a = r() * 6.3;
    b.blob(T.areca, [lx + Math.sin(a) * 0.15, height - 0.1, lz + Math.cos(a) * 0.15], [0.12, 0.2, 0.12], 7, 5, 0.3);
  }
}

/** A crooked branch from a point, as a swept tube, returning its tip. */
export function limb(b: Builder, mat: Mat, from: V3, dir: V3, length: number, r0: number, r1: number, r: () => number, curl = 0.25): V3 {
  const pts: V3[] = [from];
  const radii = [r0];
  let p = from;
  let dd = nrm(dir);
  const steps = 6;

  for (let i = 1; i <= steps; i++) {
    dd = nrm(add(dd, sc(unit(r), curl)));
    p = add(p, sc(dd, length / steps));
    pts.push(p);
    radii.push(r0 + (r1 - r0) * (i / steps));
  }

  b.sweep(mat, pts, radii, 7);

  return p;
}

/** Mango or jackfruit: a short trunk forking into limbs, a dome of dense leaf clumps. */
export function broadleaf(b: Builder, r: () => number, size: number, kind: 'mango' | 'jack') {
  const leaves = kind === 'mango' ? T.mango : T.jack;
  const trunkTop: V3 = [0, 2.4 * size, 0];
  b.sweep(T.bark, [[0, -0.3, 0], [0.05, 1.2 * size, 0.03], trunkTop], [0.36 * size, 0.3 * size, 0.24 * size], 10);
  const clumps: Clump[] = [];
  const centre: V3 = [0, 5.2 * size, 0];
  const limbs = 4 + Math.floor(r() * 2);

  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r() * 0.5;
    const tip = limb(b, T.bark, trunkTop, [Math.sin(a) * 0.8, 1, Math.cos(a) * 0.8], 3.2 * size, 0.18 * size, 0.06 * size, r);
    clumps.push({ c: tip, r: (1.5 + r() * 0.6) * size });
    const mid = lerp(trunkTop, tip, 0.55);
    clumps.push({ c: add(mid, [Math.sin(a + 0.8) * 1.6 * size, 0.2 * size, Math.cos(a + 0.8) * 1.6 * size]), r: (1.3 + r() * 0.5) * size });
  }

  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    clumps.push({ c: [Math.sin(a) * 1.2 * size, (5.6 + r() * 1.4) * size, Math.cos(a) * 1.2 * size], r: (1.6 + r() * 0.5) * size });
  }

  // Lobed and holed, reaching toward the open side, a few twigs sticking out of the skin: a
  // mango's crown spreads low and broad, a jack's stands taller and looser
  const mango = kind === 'mango';
  const shaped = uneven(clumps, r, { base: trunkTop, yaw: r() * Math.PI * 2, lean: 0.35, drop: 0.18, jitter: 0.3, s: mango ? [1.15, 0.7, 1.15] : [0.95, 0.88, 0.95] });
  crown(b, r, leaves, T.core, centre, shaped, 0.36, mango ? [0.42, 0.15] : [0.32, 0.18], 0.4, false, { lump: 0.3, holes: mango ? 1 : 2, twigs: 2, twig: T.bark });

  if (kind === 'jack') {
    // Jackfruit hang right off the trunk and the big limbs
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.3;
      const y = (0.9 + r() * 1.4) * size;
      b.blob(T.jackfruit, [Math.sin(a) * 0.34 * size, y, Math.cos(a) * 0.34 * size], [0.2, 0.3, 0.2], 8, 6, 0.08);
    }
  }
}

/**
 * A rubber tree as they stand in an estate: a straight slender trunk leaning a little, smooth
 * grey bark, the tapping panel cut in a slant down one side with a cup wired under its spout,
 * and high up, a light, open crown of trifoliate leaves in small clusters.
 */
export function rubberTree(b: Builder, r: () => number, size: number) {
  const la = r() * Math.PI * 2;
  const lean = 0.2 + r() * 0.4;
  const lx = Math.sin(la) * lean;
  const lz = Math.cos(la) * lean;
  const H = 7.5 * size;
  b.tube(T.rubberBark, [0, -0.2, 0], 0.16 * size, 0.1 * size, H, 9, { rings: 6, lean: (v) => [lx * v, lz * v] });
  // The tapping panel: a band of dark cut bark slanting round half the trunk
  const panel = 0.9 + r() * 0.3;

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI;
    const y = panel + 0.35 - (i / 10) * 0.35;
    b.box(T.tapped, [Math.sin(a) * 0.15 * size, y, Math.cos(a) * 0.15 * size], [0.035, 0.12, 0.035]);
  }

  b.box(T.latex, [0, panel - 0.05, 0.16 * size], [0.008, 0.06, 0.008]);
  b.lathe(T.cup, [0, panel - 0.35, 0.22 * size], [[0, 0], [0.05, 0.005], [0.075, 0.08], [0.065, 0.085], [0, 0.07]], 8);
  b.disc(T.latex, [0, panel - 0.29, 0.22 * size], 0.062, 8, 1);
  // Limbs from high on the trunk, and a light crown
  const top: V3 = [lx, H, lz];
  const clumps: Clump[] = [];

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.6;
    const from: V3 = [lx * (0.75 + i * 0.05), H * (0.75 + i * 0.06), lz * (0.75 + i * 0.05)];
    const tip = limb(b, T.rubberBark, from, [Math.sin(a) * 0.6, 1, Math.cos(a) * 0.6], 3.0 * size, 0.07 * size, 0.025 * size, r, 0.18);
    clumps.push({ c: tip, r: (0.9 + r() * 0.4) * size });
    clumps.push({ c: lerp(from, tip, 0.6), r: (0.7 + r() * 0.3) * size });
  }

  clumps.push({ c: add(top, [0, 2.2 * size, 0]), r: 1.1 * size });
  const shaped = uneven(clumps, r, { base: top, yaw: r() * Math.PI * 2, lean: 0.3, drop: 0.2, s: [1.1, 0.75, 1.1] });
  crown(b, r, T.rubber, null, add(top, [0, 2 * size, 0]), shaped, 0.32, [0.26, 0.1], 0.5, false, { lump: 0.25, holes: 2, twigs: 2, twig: T.rubberBark });
}

/** The banyan: a trunk of fused stems, buttress roots over its platform, great level limbs hung with aerial roots, and a vast low dome of leaves. */
export function banyan(b: Builder, r: () => number) {
  // The stone platform (aalthara): laterite base, a granite rim and a seat ledge
  b.tube(M.laterite, [0, -0.3, 0], 3.6, 3.5, 0.75, 28, { cap: true, smooth: false });
  b.tube(M.granite, [0, 0.45, 0], 3.7, 3.7, 0.14, 28, { cap: true, smooth: false });
  b.tube(M.granite, [0, -0.2, 0], 4.2, 4.2, 0.35, 28, { cap: true, smooth: false });

  const base = 0.59;

  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + r() * 0.2;
    const o = 0.5 + r() * 0.7;
    const twist = (r() - 0.5) * 1.2;
    const pts: V3[] = [];
    const radii: number[] = [];

    for (let k = 0; k <= 6; k++) {
      const v = k / 6;
      const aa = a + twist * v;
      const rr = o * (1 - v * 0.55) + Math.sin(v * 5 + i) * 0.08;
      pts.push([Math.sin(aa) * rr, base + v * 5.2, Math.cos(aa) * rr]);
      radii.push((0.36 + r() * 0.1) * (1 - v * 0.3));
    }

    b.sweep(T.bark, pts, radii, 7);
  }

  // Buttress roots spilling over the platform
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.3;
    const pts: V3[] = [];
    const radii: number[] = [];

    for (let k = 0; k <= 7; k++) {
      const v = k / 7;
      const rr = 0.9 + v * 3.0;
      const y = v < 0.75 ? base + 0.9 * (1 - v / 0.75) * 0.6 + 0.05 : base - (v - 0.75) * 3.6;
      pts.push([Math.sin(a + v * 0.3) * rr, y, Math.cos(a + v * 0.3) * rr]);
      radii.push(0.28 * (1 - v * 0.8));
    }

    b.sweep(T.bark, pts, radii, 6);
  }

  const top: V3 = [0, base + 5, 0];
  const centre: V3 = [0, 9, 0];
  const clumps: Clump[] = [];
  const limbs = 9;

  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r() * 0.3;
    const reach = 7 + r() * 4;
    const pts: V3[] = [];
    const radii: number[] = [];

    for (let k = 0; k <= 8; k++) {
      const v = k / 8;
      const lift = Math.sin(v * Math.PI * 0.7) * (1.6 + r() * 0.3) + v * 0.6;
      pts.push([Math.sin(a + v * 0.25) * reach * v, top[1] + lift + (k ? (r() - 0.5) * 0.3 : 0), Math.cos(a + v * 0.25) * reach * v]);
      radii.push(0.45 * (1 - v * 0.75));
    }

    b.sweep(T.bark, pts, radii, 8);

    // Branches up into the crown, each ending in a clump
    for (const t of [0.35, 0.6, 0.85, 1]) {
      const at = pts[Math.round(t * 8)]!;
      const up = limb(b, T.bark, at, [Math.sin(a) * 0.4 + (r() - 0.5), 1, Math.cos(a) * 0.4 + (r() - 0.5)], 1.6 + r() * 1.8, 0.14, 0.04, r, 0.35);
      clumps.push({ c: up, r: 1.9 + r() * 0.9 });
    }

    // Aerial roots: a curtain of thin ones, and a few grown down into pillars
    for (let k = 0; k < 22; k++) {
      const t = 0.2 + r() * 0.78;
      const j = Math.min(Math.floor(t * 8), 7);
      const p = lerp(pts[j]!, pts[j + 1]!, t * 8 - j);
      const pillar = r() < 0.12;
      const end = pillar ? -0.2 : p[1] - (0.8 + r() * 3.5);
      const rp: V3[] = [];
      const rr: number[] = [];

      for (let s = 0; s <= 5; s++) {
        const v = s / 5;
        rp.push([p[0] + Math.sin(v * 3 + k) * 0.08, p[1] + (end - p[1]) * v, p[2] + Math.cos(v * 2 + k) * 0.08]);
        rr.push(pillar ? 0.09 + v * 0.05 : 0.02 * (1 - v * 0.6));
      }

      b.sweep(pillar ? T.bark : T.barkPale, rp, rr, pillar ? 6 : 3);
    }
  }

  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2;
    const o = r() * 5;
    clumps.push({ c: [Math.sin(a) * o, 10.5 + r() * 2.5 - o * 0.3, Math.cos(a) * o], r: 2.4 + r() * 0.8 });
  }

  const shaped = uneven(clumps, r, { base: top, yaw: r() * Math.PI * 2, lean: 0.15, drop: 0.06, jitter: 0.25, s: [1.15, 0.7, 1.15] });
  crown(b, r, T.banyan, T.core, centre, shaped, 0.5, [0.36, 0.21], 0.3, false, { lump: 0.3, holes: 1 });
}

const v3 = (h: number) => {
  const c = hex(h);

  return d.vec3f(c[0], c[1], c[2]);
};

const LEAF_LIT = v3(0x5a7a26);
const CROTON_A = v3(0xd8a020);
const CROTON_B = v3(0xa02818);

/** Foliage pattern ids, whose vertices swing and whose leaves pass light. */
const FOLIAGE = new Set<number>([P.FROND, P.LEAVES, P.BANANA, P.GRASS, P.CROTON, P.FLOWER]);

/**
 * Where a model's leaves hang and how far they reach: the motion is weighted by distance from
 * this point, worked out once per model so every vertex gets a smooth, continuous flex without
 * any per-vertex noise. Trunks stay put; frond and leaf tips swing most.
 */
export function crownOf(model: { meshes: readonly { positions: ArrayLike<number>; extra?: { pat?: ArrayLike<number> } }[] }) {
  let sx = 0, sy = 0, sz = 0, n = 0, top = 0;

  for (const m of model.meshes) {
    const pat = m.extra?.pat;

    for (let i = 0; i < m.positions.length / 3; i++) {
      top = Math.max(top, m.positions[i * 3 + 1]!);

      if (!pat || !FOLIAGE.has(Math.floor(pat[i]! + 0.5))) continue;
      sx += m.positions[i * 3]!; sy += m.positions[i * 3 + 1]!; sz += m.positions[i * 3 + 2]!; n++;
    }
  }

  if (n === 0) return { crown: [0, top, 0] as V3, reach: Math.max(top, 0.3) };
  const c: V3 = [sx / n, sy / n, sz / n];
  let far = 0;

  for (const m of model.meshes) {
    const pat = m.extra?.pat;

    for (let i = 0; i < m.positions.length / 3; i++) {
      if (!pat || !FOLIAGE.has(Math.floor(pat[i]! + 0.5))) continue;
      far = Math.max(far, Math.hypot(m.positions[i * 3]! - c[0], m.positions[i * 3 + 1]! - c[1], m.positions[i * 3 + 2]! - c[2]));
    }
  }

  return { crown: c, reach: Math.max(far, 0.25) };
}

export function defineTree(pool: meshPool.MeshPool<{ pat: d.F32; col: d.Vec4f }>, tex: Tex) {
  return instances.define('Tree', {
    host: { stiff: d.f32, crown: d.vec3f, reach: d.f32 },
    carry: (vertexIndex) => {
      'use gpu';

      return d.vec4f(pool.extra.pat(vertexIndex), pool.extra.col(vertexIndex).xyz);
    },
    // Three layers of motion, all smooth waves: the whole tree leaning in slow gusts that roll
    // across the land, the crown swinging with it, and each frond and leaf bobbing on its own
    // beat, weighted by how far it hangs from the crown
    deform: (vertex, tree) => {
      'use gpu';
      const t = now.$;
      const p = vertex.position;
      const at = tree.position.xz;
      const h = std.max(p.y, 0);
      const foot = std.max(tree.crown.y, 0.3);
      const gust = std.sin(t * 0.37 + at.x * 0.045 + at.y * 0.02) * std.sin(t * 0.21 + at.y * 0.035) * 0.8 + 0.25;
      const sway = std.sin(t * 0.9 + at.x * 0.3) * 0.35 + gust;
      const bend = (h * h * 0.0018 * (1 + sway)) / tree.stiff * std.smoothstep(foot * 0.05, foot * 0.3, h);
      // Rooted: the trunk's foot, a platform and buttress roots stay still, motion growing above
      // (in proportion to the plant: a bush's stems flex from low down, a banyan's from well up)
      const anchor = std.smoothstep(foot * 0.12, foot * 0.45, h);
      const flex = std.saturate(std.length(p - tree.crown) / tree.reach) * anchor;
      const f2 = flex * flex;
      const ph = std.dot(p, d.vec3f(1.7, 0.6, 1.3)) + at.x * 0.7 + at.y * 1.1;
      const bob = (std.sin(t * 1.9 + ph) + 0.55 * std.sin(t * 3.3 + ph * 1.6)) * f2 * tree.reach * 0.035;
      const swing = (gust + 0.4 * std.sin(t * 1.3 + ph * 0.5)) * f2 * tree.reach * 0.05 / tree.stiff;
      const shiver = std.sin(t * 7.5 + ph * 3.1) * f2 * flex * 0.012;

      return p + d.vec3f(bend + swing + shiver, bob, bend * 0.5 + swing * 0.4 - shiver);
    },
    deformShadow: true,
    bounds: (_tree, base) => {
      'use gpu';

      return instances.Sphere({ center: base.center, radius: base.radius + 1.2 });
    },
    surface: (pixel, base) => {
      'use gpu';
      const pat = d.i32(pixel.carried.x + 0.5);
      const p = pixel.point.position;
      const m = shading.Material(base);
      const tint = base.color * pixel.carried.yzw;
      m.color = d.vec3f(tint);
      const fine = perlin3d.sample(p * 5.0);
      // Bark from the baked tiles, projected from the world so its fissures run up the trunk
      const barky = pat === P.PALM_BARK || pat === P.BARK;
      const layer = std.select(d.f32(TEX.bark), d.f32(TEX.palmbark), pat === P.PALM_BARK);
      // Derivatives here, in uniform control flow, so only bark pixels pay for the six fetches
      const dpx = std.dpdx(p);
      const dpy = std.dpdy(p);
      let normal = d.vec3f(pixel.point.normal);
      const uv = pixel.point.uv;

      if (barky) {
        const tx = tex.sampleGrad(layer, pixel.point.normal, p, dpx, dpy);
        m.color = tx.color.xyz * std.mix(d.vec3f(1), tex.ratio(layer, tint), tx.color.w) * (0.85 + perlin3d.sample(p * 0.4) * 0.3);
        m.roughness = tx.rough;
        normal = d.vec3f(tx.normal);
      } else if (pat === P.FROND) {
        // A coconut leaflet: a pale midrib down its length, glossy upper face, tips browning
        const across = std.abs(uv.x - 0.5) * 2;
        const rib = 1 - std.smoothstep(0.0, 0.18, std.abs(uv.x - 0.5));
        const tipDry = std.smoothstep(0.78, 1.0, uv.y) * std.saturate(perlin3d.sample(p * 3.1) + 0.6);
        const c = tint * (0.78 + perlin3d.sample(p * 2.0) * 0.25) * (0.9 + uv.y * 0.2) + d.vec3f(0.05, 0.06, 0.015) * rib;
        m.color = std.mix(c, d.vec3f(0.24, 0.16, 0.06), tipDry * 0.7);
        m.roughness = 0.42 + across * 0.15 + tipDry * 0.3;
        m.metallic = -0.55 * (1 - tipDry);
      } else if (pat === P.LEAVES) {
        // Clumps of leaves catching light at their tops; each leaf a shade of its own
        const clump = perlin3d.sample(p * 0.9) * 0.6 + fine * 0.4;
        const top = std.saturate(pixel.point.normal.y);
        m.color = std.mix(tint * (0.65 + clump * 0.45), LEAF_LIT, top * 0.3 * std.saturate(clump + 0.5));
        m.roughness = 0.5;
        m.metallic = -0.35;
      } else if (pat === P.GRASS) {
        m.color = tint * (0.45 + uv.y * 0.7) * (0.8 + perlin3d.sample(p * 0.7) * 0.4);
        m.metallic = -0.3;
      } else if (pat === P.BANANA) {
        // A banana blade: a thick pale-yellow midrib, fine parallel veins running out from it,
        // a waxy bloom on the face, and torn edges dried brown
        const off = std.abs(uv.x - 0.5) * 2;
        const rib = 1 - std.smoothstep(0.0, 0.045, off);
        const veins = std.pow(std.abs(std.sin(uv.y * 340 + off * 6)), 6) * 0.08;
        const edge = std.smoothstep(0.82, 1.0, off) * std.saturate(perlin3d.sample(p * 4.0) * 1.5 + 0.7);
        const blotch = std.smoothstep(0.35, 0.6, perlin3d.sample(p * 1.7)) * 0.35;
        let c = tint * (0.85 + fine * 0.15 - veins + off * 0.12);
        c = std.mix(c, d.vec3f(0.36, 0.42, 0.12), rib * 0.8);
        c = std.mix(c, d.vec3f(0.22, 0.15, 0.06), std.max(edge, blotch) * 0.85);
        m.color = d.vec3f(c);
        m.roughness = 0.38 + edge * 0.4;
        m.metallic = -0.7 * (1 - edge);
      } else if (pat === P.CROTON) {
        // A croton leaf: green, veined in yellow from a gold midrib, some leaves going wholly
        // to orange and red with age, the colour belonging to the leaf and not the bush
        const off = std.abs(uv.x - 0.5) * 2;
        const rib = 1 - std.smoothstep(0.0, 0.09, off);
        const veins = std.pow(std.saturate(std.sin((uv.y * 1.6 - off * 0.9) * 26)), 10) * (1 - off) * 0.8;
        const age = std.saturate(perlin3d.sample(p * 1.3) * 1.8 + 0.4);
        // Gold splashes over the green, the older leaves flushed through orange to red
        const splash = std.smoothstep(0.0, 0.3, perlin3d.sample(p * 13.0) + 0.1) * 0.75;
        const young = std.mix(tint * 1.3, CROTON_A * 0.75, splash);
        const old = std.mix(CROTON_A * 0.9, CROTON_B, std.smoothstep(0.7, 1.0, age));
        const body = std.mix(young, old, std.smoothstep(0.35, 0.75, age));
        const vein = std.mix(CROTON_A, CROTON_B * 1.3, std.smoothstep(0.75, 1.0, age));
        m.color = std.mix(body * (0.85 + fine * 0.2), vein, std.max(rib, veins) * 0.8);
        m.roughness = 0.32;
        m.metallic = -0.45;
      } else if (pat === P.FLOWER) {
        m.color = tint * (0.85 + fine * 0.3);
        m.metallic = -0.4;
      }

      const moved = shading.Point(pixel.point);
      moved.normal = d.vec3f(normal);

      return instances.Shaded({ point: moved, material: m });
    },
  });
}
