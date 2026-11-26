// The wild trees of the Western Ghats' moist forest and the town's yard trees beyond mango and
// jack: teak, maruthu (Terminalia), irul, wild fig and peepal, silk cotton, ezhilampala
// (Alstonia), cashew, tamarind, gulmohar, drumstick, papaya and screwpine. Each is grown from a
// few rules (a bole, tiers of limbs, sub-branches, leaf clumps at their ends) set per species, so
// each has its own silhouette; every one leans its crown toward an open side, leaves gaps, and
// lets bare twigs show. All are built for merged builders: a bark, a leaf and at most one plain
// mesh each.

import { Builder, hex, P, type Mat, type V3 } from '../../render/geo.ts';
import { add, crown, lerp, nrm, sc, uneven, unit, type Clump, type Ragged } from './foliage.ts';
import { limb } from './trees.ts';

const leaves = (rough: number, ...hs: number[]): Mat[] => hs.map((h) => ({ color: hex(h), roughness: rough, pattern: P.LEAVES, doubleSided: true }));
const bark = (h: number): Mat => ({ color: hex(h), roughness: 0.9, pattern: P.BARK });
const plain = (h: number, rough = 0.9): Mat => ({ color: hex(h), roughness: rough, pattern: P.PLAIN });

export const W = {
  teakBark: bark(0x6a5e50),
  teak: leaves(0.8, 0x44521e, 0x4e5a22, 0x3a4a1a, 0x5e5426),
  laurelBark: bark(0x3a332c),
  laurel: leaves(0.9, 0x1c3412, 0x223c14, 0x1a2e10),
  irulBark: bark(0x6a5248),
  irul: leaves(0.9, 0x2a4616, 0x32501a, 0x263e14),
  figBark: bark(0x7e786a),
  fig: leaves(0.9, 0x1a3410, 0x203a12, 0x173010),
  peepalBark: bark(0x8a8478),
  peepal: leaves(0.8, 0x2c4c18, 0x36561c, 0x2a4416),
  silkBark: bark(0x76726a),
  silk: leaves(0.9, 0x34501a, 0x3c581e, 0x2e4816),
  alstoniaBark: bark(0x6e6a62),
  alstonia: leaves(0.9, 0x1c3812, 0x183210, 0x224016),
  cashewBark: bark(0x4a3e32),
  cashew: leaves(0.8, 0x3e5e1e, 0x48661f, 0x365418),
  tamarindBark: bark(0x3e342c),
  tamarind: leaves(0.9, 0x2a4214, 0x304a16, 0x243a12),
  gulmoharBark: bark(0x6a6458),
  gulmohar: leaves(0.8, 0x3e6a1c, 0x467220, 0x36601a),
  drumstickBark: bark(0x8a8274),
  drumstick: leaves(0.8, 0x4a6a24, 0x52722a, 0x42601e),
  core: plain(0x0c1608),
  pod: plain(0x3a2a18),
  greenPod: plain(0x4a5a22),
  papayaStem: { color: hex(0x8a8a72), roughness: 0.9, pattern: P.PALM_BARK } as Mat,
  papaya: leaves(0.8, 0x3e6a1e, 0x467424, 0x365e1a),
  papayaStalk: plain(0x7a8a3a, 0.6),
  papayaFruit: plain(0x4e7a22, 0.6),
  papayaRipe: plain(0xc88a20, 0.6),
  pandanBark: bark(0x6a5e4a),
  pandan: { color: hex(0x3e5a1e), roughness: 0.65, pattern: P.FROND, doubleSided: true } as Mat,
  pandanDry: { color: hex(0x6a5a32), roughness: 0.65, pattern: P.FROND, doubleSided: true } as Mat,
  pandanFruit: plain(0xb0701c, 0.6),
} satisfies Record<string, Mat | Mat[]>;

/** One tier of limbs: where on the bole, how many round it, how they rise, how long and thick. */
interface Tier {
  at: number;
  n: number;
  up: number;
  len: number;
  r: number;
}

interface Spec {
  bark: Mat;
  /** Bole height, base radius, how much it wanders, how far its top leans out. */
  height: number;
  girth: number;
  crook: number;
  lean: number;
  /** Buttress fins at the foot. */
  buttress?: number;
  tiers: Tier[];
  /** Sub-branches per limb, and how far out each reaches as a share of its limb. */
  branch: number;
  reach?: number;
  curl?: number;
  /** Clump radius range, and a clump at the middle of each limb too. */
  clump: [number, number];
  mid?: boolean;
  /** How the crown reaches toward the light, and how many clumps go on the shaded side. */
  light: number;
  drop: number;
  shape: V3;
  leaves: Mat[];
  core: Mat | null;
  cover: number;
  leaf: [number, number];
  droop: number;
  rag: Ragged;
}

/** Grows a tree to `spec`, returning where its leaf clumps hang and where its limbs end. */
function grow(b: Builder, r: () => number, spec: Spec, size: number) {
  const yaw = r() * Math.PI * 2;
  const L: V3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const H = spec.height * size;
  const R0 = spec.girth * size;
  // The bole: wandering a little, leaning its top toward the open side, flared at the foot
  const bole: V3[] = [];
  const radii: number[] = [];
  let wx = 0;
  let wz = 0;

  for (let k = 0; k <= 7; k++) {
    const t = k / 7;

    if (k > 1) {
      wx += (r() - 0.5) * spec.crook * size;
      wz += (r() - 0.5) * spec.crook * size;
    }

    bole.push([L[0] * spec.lean * H * t * t + wx * t, -0.3 + (H + 0.3) * t, L[2] * spec.lean * H * t * t + wz * t]);
    radii.push(R0 * (1 - 0.5 * t) + (t < 0.15 ? (0.15 - t) * R0 * 2.2 : 0));
  }

  b.sweep(spec.bark, bole, radii, 9);

  const on = (t: number): V3 => {
    const f = Math.min(t, 1) * 7;
    const i = Math.min(Math.floor(f), 6);

    return lerp(bole[i]!, bole[i + 1]!, f - i);
  };

  // Buttresses: fins of root running down from the bole and out across the ground
  for (let i = 0; i < (spec.buttress ?? 0); i++) {
    const a = (i / spec.buttress!) * Math.PI * 2 + r() * 0.5;
    const top = R0 * (2.2 + r() * 2.2);
    const out = R0 * (2.2 + r() * 1.8);
    const pts: V3[] = [];
    const rr: number[] = [];

    for (let k = 0; k <= 4; k++) {
      const v = k / 4;
      const d = R0 * 0.6 + out * v;
      pts.push([Math.sin(a + v * 0.2) * d, top * Math.pow(1 - v, 1.7) - 0.12, Math.cos(a + v * 0.2) * d]);
      rr.push(R0 * (0.32 - v * 0.24));
    }

    b.sweep(spec.bark, pts, rr, 5);
  }

  const clumps: Clump[] = [];
  const tips: V3[] = [];
  const [c0, c1] = spec.clump;
  const clumpR = () => (c0 + r() * (c1 - c0)) * size;
  spec.tiers.forEach((tier, ti) => {
    const phase = ti * 2.4 + r();

    for (let i = 0; i < tier.n; i++) {
      const a = phase + (i / tier.n) * Math.PI * 2 + (r() - 0.5) * 0.7;
      const d: V3 = [Math.sin(a), 0, Math.cos(a)];
      const lit = d[0] * L[0] + d[2] * L[2];

      // Limbs on the shaded side are shorter, a few never grew at all
      if (lit < -0.3 && r() < spec.light * 0.5) continue;
      const from = on(tier.at + (r() - 0.5) * 0.06);
      const len = tier.len * size * (0.8 + r() * 0.4) * (1 + spec.light * 0.4 * lit);
      const dir = nrm([d[0], tier.up + (r() - 0.5) * 0.25, d[2]]);
      const tip = limb(b, spec.bark, from, dir, len, tier.r * size, tier.r * size * 0.28, r, spec.curl ?? 0.25);
      tips.push(tip);
      clumps.push({ c: tip, r: clumpR() });

      if (spec.mid) clumps.push({ c: add(lerp(from, tip, 0.6), [d[2] * len * 0.25 * (r() - 0.5), len * 0.08, -d[0] * len * 0.25 * (r() - 0.5)]), r: clumpR() * 0.85 });

      for (let j = 0; j < spec.branch; j++) {
        const at = lerp(from, tip, 0.4 + r() * 0.45);
        const turn = (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6);
        const d2: V3 = nrm([Math.sin(a + turn), tier.up + 0.2 + r() * 0.4, Math.cos(a + turn)]);
        const t2 = limb(b, spec.bark, at, d2, len * (spec.reach ?? 0.45) * (0.7 + r() * 0.5), tier.r * size * 0.45, tier.r * size * 0.12, r, 0.3);
        tips.push(t2);
        clumps.push({ c: t2, r: clumpR() * 0.85 });
      }
    }
  });
  const base = on(spec.tiers[0]?.at ?? 0.7);
  const shaped = uneven(clumps, r, { base, yaw, lean: spec.light, drop: spec.drop, jitter: 0.3, s: spec.shape });
  let cx = 0, cy = 0, cz = 0;

  for (const k of shaped) {
    cx += k.c[0];
    cy += k.c[1];
    cz += k.c[2];
  }

  const n = Math.max(shaped.length, 1);
  crown(b, r, spec.leaves, spec.core, [cx / n, cy / n - 0.5 * size, cz / n], shaped, spec.cover, spec.leaf, spec.droop, false, { twig: spec.bark, ...spec.rag });

  return { clumps: shaped, tips, top: on(1), on, yaw };
}

/** Things hanging under a crown: pods, drumsticks, fruit on stalks. */
function hang(b: Builder, r: () => number, mat: Mat, clumps: Clump[], n: number, length: number, thick: number) {
  for (let i = 0; i < n && clumps.length; i++) {
    const k = clumps[Math.floor(r() * clumps.length)]!;
    const u = unit(r);
    const p: V3 = [k.c[0] + u[0] * k.r * 0.6, k.c[1] - k.r * (0.25 + r() * 0.3), k.c[2] + u[2] * k.r * 0.6];
    const L = length * (0.7 + r() * 0.6);
    const bend: V3 = [(r() - 0.5) * L * 0.3, 0, (r() - 0.5) * L * 0.3];
    b.sweep(mat, [p, add(p, add(sc(bend, 0.5), [0, -L * 0.5, 0])), add(p, add(bend, [0, -L, 0]))], [thick, thick * 0.9, thick * 0.4], 3);
  }
}

/** Teak: a tall, clean, grey-brown bole and an open, uneven crown of huge papery leaves, a few going brown. */
export function teak(b: Builder, r: () => number, size: number) {
  grow(b, r, {
    bark: W.teakBark, height: 8.5, girth: 0.3, crook: 0.12, lean: 0.05, buttress: 4,
    tiers: [{ at: 0.62, n: 3, up: 0.7, len: 3.2, r: 0.12 }, { at: 0.85, n: 3, up: 1.1, len: 2.6, r: 0.09 }],
    branch: 2, clump: [1.0, 1.5], light: 0.35, drop: 0.25, shape: [1.2, 0.55, 1.2],
    leaves: W.teak, core: null, cover: 0.32, leaf: [0.58, 0.36], droop: 0.7, rag: { lump: 0.35, holes: 2, twigs: 2 },
  }, size);
}

/** Maruthu (Terminalia): a straight, dark, fissured bole buttressed at its foot, clear to a high, layered, flat-topped crown. */
export function laurel(b: Builder, r: () => number, size: number) {
  grow(b, r, {
    bark: W.laurelBark, height: 12, girth: 0.38, crook: 0.08, lean: 0.03, buttress: 6,
    tiers: [{ at: 0.72, n: 3, up: 0.45, len: 4.2, r: 0.15 }, { at: 0.9, n: 3, up: 0.7, len: 3.2, r: 0.11 }],
    branch: 2, reach: 0.5, curl: 0.18, clump: [1.0, 1.45], light: 0.25, drop: 0.15, shape: [1.4, 0.48, 1.4],
    leaves: W.laurel, core: W.core, cover: 0.36, leaf: [0.28, 0.13], droop: 0.35, rag: { lump: 0.3, holes: 1, twigs: 2 },
  }, size);
}

/** Irul: a crooked reddish bole, limbs going every way, a loose crown of many small feathery masses. */
export function irul(b: Builder, r: () => number, size: number) {
  grow(b, r, {
    bark: W.irulBark, height: 5.5, girth: 0.26, crook: 0.4, lean: 0.12,
    tiers: [{ at: 0.6, n: 3, up: 0.55, len: 3.4, r: 0.11 }, { at: 0.92, n: 3, up: 0.9, len: 2.6, r: 0.08 }],
    branch: 2, curl: 0.38, clump: [0.8, 1.15], light: 0.45, drop: 0.2, shape: [1.15, 0.68, 1.15],
    leaves: W.irul, core: W.core, cover: 0.3, leaf: [0.22, 0.12], droop: 0.3, rag: { lump: 0.4, holes: 1, twigs: 3 },
  }, size);
}

/**
 * A wild fig, or a peepal: a short bole of stems grown together, buttresses, great low limbs
 * spreading wide, and the fig's aerial roots hanging from them; the peepal's bark paler, its
 * crown lighter and more open, leaves on long stalks.
 */
export function fig(b: Builder, r: () => number, size: number, peepal = false) {
  const bk = peepal ? W.peepalBark : W.figBark;

  // Two or three stems twisted together in the bole
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2 + r();
    const pts: V3[] = [];
    const rr: number[] = [];

    for (let k = 0; k <= 5; k++) {
      const v = k / 5;
      const aa = a + v * 1.1;
      const o = 0.28 * size * (1 - v * 0.6);
      pts.push([Math.sin(aa) * o, -0.2 + v * 4.6 * size, Math.cos(aa) * o]);
      rr.push(0.22 * size * (1 - v * 0.35));
    }

    b.sweep(bk, pts, rr, 7);
  }

  const g = grow(b, r, {
    bark: bk, height: 4.4, girth: 0.3, crook: 0.1, lean: 0.06, buttress: peepal ? 4 : 6,
    tiers: [{ at: 0.78, n: 4, up: peepal ? 0.6 : 0.3, len: peepal ? 4.2 : 5.4, r: 0.17 }, { at: 1, n: 2, up: 1.0, len: 3, r: 0.12 }],
    branch: 2, reach: 0.5, clump: [1.3, 1.8], light: 0.3, drop: 0.15, shape: peepal ? [1.1, 0.75, 1.1] : [1.3, 0.6, 1.3],
    leaves: peepal ? W.peepal : W.fig, core: peepal ? null : W.core, cover: peepal ? 0.3 : 0.38, leaf: peepal ? [0.3, 0.17] : [0.3, 0.15], droop: peepal ? 0.6 : 0.35,
    rag: { lump: 0.3, holes: peepal ? 2 : 1, twigs: 2 },
  }, size);

  if (peepal) return;

  // Aerial roots in thin curtains out of the undersides of the low leaf masses, a few grown down
  // to the ground into pillars
  for (const k of g.clumps) {
    if (k.c[1] > 7.5 * size || r() < 0.35) continue;

    for (let i = 0; i < 4; i++) {
      const u = unit(r);
      const p: V3 = [k.c[0] + u[0] * k.r * 0.5, k.c[1] - k.r * 0.2, k.c[2] + u[2] * k.r * 0.5];
      const ground = r() < 0.12;
      const end = ground ? -0.2 : p[1] - (1 + r() * 2.5);
      b.sweep(bk, [p, [p[0] + (r() - 0.5) * 0.2, (p[1] + end) / 2, p[2] + (r() - 0.5) * 0.2], [p[0], end, p[2]]], ground ? [0.05, 0.06, 0.08] : [0.025, 0.018, 0.008], ground ? 5 : 3);
    }
  }
}

/** Silk cotton: a tall straight grey bole, buttressed and studded with thorns, its limbs in level whorls one above another. */
export function silkCotton(b: Builder, r: () => number, size: number) {
  const g = grow(b, r, {
    bark: W.silkBark, height: 14, girth: 0.34, crook: 0.06, lean: 0.02, buttress: 5,
    tiers: [
      { at: 0.5, n: 4, up: 0.08, len: 4.0, r: 0.12 },
      { at: 0.64, n: 4, up: 0.1, len: 3.4, r: 0.1 },
      { at: 0.78, n: 3, up: 0.14, len: 2.7, r: 0.09 },
      { at: 0.92, n: 3, up: 0.25, len: 1.9, r: 0.07 },
    ],
    branch: 1, reach: 0.4, curl: 0.12, clump: [0.75, 1.05], light: 0.2, drop: 0.12, shape: [1.5, 0.42, 1.5],
    leaves: W.silk, core: null, cover: 0.3, leaf: [0.32, 0.15], droop: 0.45, rag: { lump: 0.3, holes: 1, twigs: 2 },
  }, size);

  // Conical thorns on the lower bole
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const t = (0.6 + r() * 5 * size) / (14 * size + 0.3);
    const c = g.on(t);
    const rr = 0.34 * size * (1 - t * 0.5) * 0.96;
    const n: V3 = [Math.sin(a), 0, Math.cos(a)];
    const p: V3 = [c[0] + n[0] * rr, c[1], c[2] + n[2] * rr];
    const side: V3 = [n[2] * 0.03, 0, -n[0] * 0.03];
    b.tri(W.silkBark, add(p, side), add(p, sc(n, 0.07)), add(add(p, sc(side, -1)), [0, 0.03, 0]), n);
  }
}

/** Ezhilampala (Alstonia): a straight bole carrying whorls of level limbs, each ending in a flat rosette of leaves, tier upon tier like a pagoda. */
export function alstonia(b: Builder, r: () => number, size: number) {
  grow(b, r, {
    bark: W.alstoniaBark, height: 11, girth: 0.3, crook: 0.08, lean: 0.03,
    tiers: [
      { at: 0.42, n: 5, up: 0.12, len: 3.3, r: 0.1 },
      { at: 0.6, n: 5, up: 0.14, len: 2.7, r: 0.09 },
      { at: 0.78, n: 4, up: 0.18, len: 2.1, r: 0.075 },
      { at: 0.94, n: 4, up: 0.35, len: 1.4, r: 0.06 },
    ],
    branch: 0, curl: 0.1, clump: [0.95, 1.3], light: 0.15, drop: 0.08, shape: [1.55, 0.36, 1.55],
    leaves: W.alstonia, core: W.core, cover: 0.34, leaf: [0.3, 0.1], droop: 0.25, rag: { lump: 0.2, holes: 1, twigs: 1 },
  }, size);
}

/** Cashew: a short crooked trunk forking low, limbs sprawling out near level, the outer ones bowing to the ground, light leathery leaves. */
export function cashew(b: Builder, r: () => number, size: number) {
  grow(b, r, {
    bark: W.cashewBark, height: 1.6, girth: 0.22, crook: 0.3, lean: 0.25,
    tiers: [{ at: 0.85, n: 5, up: 0.22, len: 4.2, r: 0.12 }],
    branch: 2, reach: 0.5, curl: 0.4, clump: [1.0, 1.4], light: 0.45, drop: 0.2, shape: [1.3, 0.62, 1.3],
    leaves: W.cashew, core: W.core, cover: 0.36, leaf: [0.26, 0.15], droop: 0.35, rag: { lump: 0.35, holes: 1, twigs: 2 },
  }, size);
}

/** Tamarind: a thick dark trunk and a vast dense crown of fine leaves, domed but ragged, brown pods hanging under it. */
export function tamarind(b: Builder, r: () => number, size: number) {
  const g = grow(b, r, {
    bark: W.tamarindBark, height: 3.4, girth: 0.42, crook: 0.18, lean: 0.08, buttress: 3,
    tiers: [{ at: 0.85, n: 5, up: 0.75, len: 4.2, r: 0.17 }, { at: 1, n: 2, up: 1.4, len: 3.4, r: 0.12 }],
    branch: 2, clump: [1.3, 1.75], light: 0.25, drop: 0.1, shape: [1.05, 0.72, 1.05],
    leaves: W.tamarind, core: W.core, cover: 0.32, leaf: [0.28, 0.14], droop: 0.45, rag: { lump: 0.4, holes: 1, twigs: 3 },
  }, size);

  hang(b, r, W.pod, g.clumps, 40, 0.14 * size, 0.012 * size);
}

/** Gulmohar: a short trunk forking into long arching limbs, an umbrella of feathery bright leaves, long dark pods hanging. */
export function gulmohar(b: Builder, r: () => number, size: number) {
  const g = grow(b, r, {
    bark: W.gulmoharBark, height: 2.6, girth: 0.26, crook: 0.15, lean: 0.12,
    tiers: [{ at: 0.92, n: 5, up: 0.5, len: 4.6, r: 0.13 }],
    branch: 3, reach: 0.4, curl: 0.22, clump: [1.0, 1.35], light: 0.35, drop: 0.12, shape: [1.55, 0.42, 1.55],
    leaves: W.gulmohar, core: null, cover: 0.3, leaf: [0.26, 0.13], droop: 0.55, rag: { lump: 0.3, holes: 2, twigs: 2 },
  }, size);

  hang(b, r, W.pod, g.clumps, 26, 0.45 * size, 0.018 * size);
}

/** Drumstick (moringa): a slim pale crooked trunk, a few brittle limbs, wisps of pale feathery leaf, drumsticks hanging. */
export function drumstick(b: Builder, r: () => number, size: number) {
  const g = grow(b, r, {
    bark: W.drumstickBark, height: 3.2, girth: 0.12, crook: 0.3, lean: 0.15,
    tiers: [{ at: 0.6, n: 2, up: 0.9, len: 2.8, r: 0.06 }, { at: 0.95, n: 3, up: 1.2, len: 2.2, r: 0.05 }],
    branch: 2, curl: 0.35, clump: [0.55, 0.85], light: 0.4, drop: 0.25, shape: [1.25, 0.6, 1.25],
    leaves: W.drumstick, core: null, cover: 0.24, leaf: [0.16, 0.1], droop: 0.65, rag: { lump: 0.4, holes: 2, twigs: 2 },
  }, size);

  hang(b, r, W.greenPod, g.clumps, 22, 0.5 * size, 0.01 * size);
}

/** Papaya: one soft stem scarred where old leaves fell, a crown of long-stalked lobed leaves, fruit clustered under it. */
export function papaya(b: Builder, r: () => number, size: number) {
  const h = (2.6 + r() * 1.4) * size;
  const lx = (r() - 0.5) * 0.4;
  const lz = (r() - 0.5) * 0.4;
  b.tube(W.papayaStem, [0, -0.1, 0], 0.11 * size, 0.07 * size, h, 9, { rings: 6, lean: (v) => [lx * v * v, lz * v * v], radius: (v) => (0.11 - v * 0.04) * size + Math.sin(v * 70) * 0.004 });
  const top: V3 = [lx, h, lz];
  const n = 14 + Math.floor(r() * 6);

  for (let i = 0; i < n; i++) {
    const age = i / n;
    const yaw = i * 2.4 + r() * 0.3;
    const d: V3 = [Math.sin(yaw), 0, Math.cos(yaw)];
    const L = (0.75 + r() * 0.35) * size;
    // The stalk rises from the top, the old ones level and drooping
    const rise = 0.9 - age * 1.3;
    const end: V3 = add(top, [d[0] * L, rise * L * 0.6 - age * 0.1, d[2] * L]);
    b.sweep(W.papayaStalk, [top, add(lerp(top, end, 0.5), [0, 0.06, 0]), end], [0.018, 0.014, 0.01], 3);

    if (age > 0.9 && r() < 0.6) continue;
    // A leaf of seven lobes fanned out from the stalk's end, cupped a little
    const R = (0.32 + r() * 0.12) * size;
    const normal = nrm([d[0] * (0.2 + age), 1, d[2] * (0.2 + age)]);

    for (let k = 0; k < 7; k++) {
      const a = yaw + (k / 6 - 0.5) * 2.6;
      const out: V3 = nrm([Math.sin(a), -0.15 - age * 0.4 - Math.abs(k / 6 - 0.5) * 0.3, Math.cos(a)]);
      const side = nrm([Math.cos(a), 0, -Math.sin(a)]);
      const mid = add(end, sc(out, R * 0.55));
      b.card(W.papaya[k % 3]!, end, add(mid, sc(side, R * 0.2)), add(end, sc(out, R)), add(mid, sc(side, -R * 0.2)), normal, [0.5, 0, 0.5, 1]);
    }
  }

  // Fruit clustered round the stem under the leaves, a ripe one or two
  for (let i = 0; i < 6 + Math.floor(r() * 8); i++) {
    const a = r() * Math.PI * 2;
    const y = h - 0.15 - r() * 0.55;
    const s = (0.07 + r() * 0.04) * size;
    b.blob(r() < 0.15 ? W.papayaRipe : W.papayaFruit, [lx * (y / h) ** 2 + Math.sin(a) * 0.12, y, lz * (y / h) ** 2 + Math.cos(a) * 0.12], [s, s * 1.5, s], 6, 4);
  }
}

/** Screwpine: a leaning, forking trunk propped on stilt roots, each branch ending in a spiral tuft of long arching keeled leaves. */
export function screwpine(b: Builder, r: () => number, size: number) {
  const a0 = r() * Math.PI * 2;
  const lean = 0.35 + r() * 0.3;
  const H = (2.4 + r() * 1.2) * size;
  const tip: V3 = [Math.sin(a0) * lean * H, H, Math.cos(a0) * lean * H];
  b.sweep(W.pandanBark, [[0, 0.3, 0], lerp([0, 0.3, 0], tip, 0.5), tip], [0.09 * size, 0.08 * size, 0.07 * size], 7);

  // Stilt roots from the lower trunk, splaying into the mud
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const from = lerp([0, 0.3, 0], tip, r() * 0.25);
    const foot: V3 = [from[0] + Math.sin(a) * (0.5 + r() * 0.5) * size, -0.2, from[2] + Math.cos(a) * (0.5 + r() * 0.5) * size];
    b.sweep(W.pandanBark, [from, add(lerp(from, foot, 0.5), [0, 0.1, 0]), foot], [0.035 * size, 0.032 * size, 0.03 * size], 5);
  }

  // Two or three branches, each with its tuft
  const heads: V3[] = [tip];

  for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
    const a = a0 + (r() - 0.5) * 3;
    const from = lerp([0, 0.3, 0], tip, 0.55 + r() * 0.3);
    heads.push(limb(b, W.pandanBark, from, [Math.sin(a), 0.9, Math.cos(a)], (1 + r() * 0.8) * size, 0.06 * size, 0.045 * size, r, 0.15));
  }

  for (const head of heads) {
    const n = 18 + Math.floor(r() * 8);

    for (let k = 0; k < n; k++) {
      const yaw = k * 2.4 + r() * 0.3;
      const age = k / n;
      const L = (1.1 + r() * 0.6) * size;
      // Young leaves stand up, old ones arch over, the oldest hang dead
      const rise = 1.6 - age * 2.2;
      strap(b, age > 0.9 ? W.pandanDry : W.pandan, head, yaw, rise, L, 0.6 + age * 0.6, 0.05 * size);
    }

    if (r() < 0.5) b.blob(W.pandanFruit, add(head, [0, -0.25, 0]), [0.13 * size, 0.17 * size, 0.13 * size], 7, 5, 0.15);
  }
}

/** A long strap leaf along an arc, as cards, keeled with a midrib (u across, 0.5 at the rib). */
function strap(b: Builder, mat: Mat, base: V3, yaw: number, rise: number, length: number, droop: number, width: number) {
  const at = (u: number): V3 => {
    const x = u * length;
    const y = u * length * rise * 0.5 - droop * u * u * length;

    return [base[0] + Math.sin(yaw) * x, base[1] + y, base[2] + Math.cos(yaw) * x];
  };

  const side: V3 = [Math.cos(yaw) * width, 0, -Math.sin(yaw) * width];
  const K = 4;

  for (let k = 0; k < K; k++) {
    const u0 = k / K;
    const u1 = (k + 1) / K;
    const w0 = 1 - u0 * 0.85;
    const w1 = 1 - u1 * 0.85;
    const p0 = at(u0);
    const p1 = at(u1);
    const t = nrm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    const n = nrm([-t[0] * t[1], 1 - t[1] * t[1], -t[2] * t[1]]);
    b.card(mat, add(p0, sc(side, -w0)), add(p0, sc(side, w0)), add(p1, sc(side, w1)), add(p1, sc(side, -w1)), n, [0, u0, 1, u1]);
  }
}
