// The undergrowth that makes it Kerala: tufts of grass, ferns, chethi (ixora) and hibiscus in
// flower, crotons, banana plants with torn leaves, and tulsi.

import { Builder, hex, P, type Mat, type V3 } from './geo.ts';
import { add, bananaLeaf, crown, frond, lerp, nrm, sc, uneven, unit, type Clump } from './foliage.ts';

const leafy = (h: number): Mat => ({ color: hex(h), roughness: 0.7, pattern: P.LEAVES, doubleSided: true });
const flower = (h: number): Mat => ({ color: hex(h), roughness: 0.6, pattern: P.FLOWER, doubleSided: true });
export const PL = {
  grass: [0x3a5a1c, 0x4a6224, 0x56602a].map((h) => ({ color: hex(h), roughness: 0.8, pattern: P.GRASS, doubleSided: true }) as Mat),
  fern: { color: hex(0x2e5a1a), roughness: 0.7, pattern: P.FROND, doubleSided: true } as Mat,
  stem: { color: hex(0x3a4a1c), roughness: 0.8, pattern: P.PLAIN } as Mat,
  shrub: [leafy(0x1c3a12), leafy(0x24461a), leafy(0x2a4a18)],
  core: { color: hex(0x0a1407), roughness: 0.9, pattern: P.PLAIN } as Mat,
  ixora: flower(0xd8281a),
  hibiscus: flower(0xc8102a),
  jasmine: flower(0xf0ece0),
  croton: [0x2a4a18, 0x3a4a10, 0x4a3a10].map((h) => ({ color: hex(h), roughness: 0.6, pattern: P.CROTON, doubleSided: true }) as Mat),
  banana: { color: hex(0x4a7a24), roughness: 0.55, pattern: P.BANANA, doubleSided: true } as Mat,
  bananaDry: { color: hex(0x4a3c2a), roughness: 0.85, pattern: P.BANANA, doubleSided: true } as Mat,
  bananaStem: { color: hex(0x6a7a34), roughness: 0.55, pattern: P.PALM_BARK } as Mat,
  bananaBloom: { color: hex(0x4a1428), roughness: 0.45, pattern: P.PLAIN, doubleSided: true } as Mat,
  bananaFruit: { color: hex(0x5a8a26), roughness: 0.45, pattern: P.PLAIN } as Mat,
  tulsi: [leafy(0x2a3a1a), leafy(0x3a2a2a)],
  lantana: [leafy(0x2a4416), leafy(0x324c1a), leafy(0x263c14)],
  lantanaFlower: [flower(0xd8508a), flower(0xe88a1a), flower(0xe8c83a), flower(0xc83a6a)],
  chromolaena: [leafy(0x3a5a1c), leafy(0x42621e), leafy(0x34521a)],
  chromolaenaFlower: [flower(0xd8d0e0), flower(0xc8b8d8)],
  ginger: [leafy(0x2e5a1a), leafy(0x386420), leafy(0x2a5018)],
  turmeric: [leafy(0x3e6a20), leafy(0x467424)],
  rattan: { color: hex(0x5a5a2a), roughness: 0.6, pattern: P.PALM_BARK } as Mat,
  rattanLeaf: { color: hex(0x3a5a1c), roughness: 0.6, pattern: P.FROND, doubleSided: true } as Mat,
};

export function grassTuft(b: Builder, r: () => number, height = 0.4) {
  const blades = 14 + Math.floor(r() * 10);
  for (let i = 0; i < blades; i++) {
    const a = r() * Math.PI * 2;
    const o = r() * 0.12;
    const p0: V3 = [Math.sin(a) * o, -0.02, Math.cos(a) * o];
    const lean = 0.25 + r() * 0.5;
    const dir = nrm([Math.sin(a) * lean, 1, Math.cos(a) * lean]);
    const l = height * (0.5 + r() * 0.7);
    const p1 = add(p0, sc(dir, l * 0.55));
    const p2 = add(p1, sc(nrm(add(dir, [Math.sin(a) * 0.8, -0.3, Math.cos(a) * 0.8])), l * 0.45));
    const w: V3 = [Math.cos(a) * 0.011, 0, -Math.sin(a) * 0.011];
    const n = nrm([Math.sin(a) * 0.4, 1, Math.cos(a) * 0.4]);
    const mat = PL.grass[Math.floor(r() * PL.grass.length)]!;
    b.card(mat, add(p0, sc(w, -1)), add(p0, w), add(p1, sc(w, 0.6)), add(p1, sc(w, -0.6)), n, [0, 0, 1, 0.5]);
    b.card(mat, add(p1, sc(w, -0.6)), add(p1, sc(w, 0.6)), p2, p2, n, [0, 0.5, 1, 1]);
  }
}

export function fern(b: Builder, r: () => number) {
  const n = 9 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    frond(b, PL.fern, PL.stem, [0, 0.02, 0], (i / n) * Math.PI * 2 + r() * 0.4, 0.9 + r() * 0.4, 0.7 + r() * 0.4, 0.9, { leaflets: 16, reach: 0.18, width: 0.03 });
  }
}

/**
 * A bush of small dark leaves, starred with flower heads: a few stems rising bare from the root
 * and branching, the leaves in uneven masses at their ends, lopsided toward the open side, gaps
 * between them and twigs sticking out, the way a hedge plant grows between clippings.
 */
export function floweringShrub(b: Builder, r: () => number, size: number, bloom: Mat, heads: number, headSize: number) {
  const clumps: Clump[] = [];
  const k = 3 + Math.floor(r() * 3);
  for (let i = 0; i < k; i++) {
    const a = r() * 6.3;
    const o = (0.1 + r() * 0.4) * size;
    clumps.push({ c: [Math.sin(a) * o, (0.5 + r() * 0.45) * size, Math.cos(a) * o], r: (0.26 + r() * 0.2) * size });
  }
  for (const c of clumps) {
    // A stem that kinks once on its way up, and forks under its leaves
    const kink: V3 = [c.c[0] * 0.35 + (r() - 0.5) * 0.12 * size, c.c[1] * 0.45, c.c[2] * 0.35 + (r() - 0.5) * 0.12 * size];
    b.sweep(PL.stem, [[0, 0, 0], kink, c.c], [0.03, 0.02, 0.01], 4);
  }
  const shaped = uneven(clumps, r, { base: [0, 0, 0], yaw: r() * Math.PI * 2, lean: 0.4, drop: 0.12, jitter: 0.25, s: [1.15, 0.72, 1.15], sj: 0.4 });
  crown(b, r, PL.shrub, PL.core, [0, 0.55 * size, 0], shaped, 0.3, [0.2, 0.09], 0.2, true, { lump: 0.35, holes: 1, twigs: 2, twig: PL.stem });
  // Flower heads on the skin of the bush, each a dome of tiny florets
  for (let i = 0; i < heads; i++) {
    const c = shaped[Math.floor(r() * shaped.length)]!;
    const s = c.s ?? [1, 0.82, 1];
    const dir = unit(r);
    if (dir[1] < -0.2) dir[1] = -dir[1];
    const at = add(c.c, [dir[0] * s[0] * c.r * 0.95, dir[1] * s[1] * c.r * 0.95, dir[2] * s[2] * c.r * 0.95]);
    b.blob(bloom, at, [headSize, headSize * 0.7, headSize], 6, 4, 0.25);
  }
}

/**
 * Lantana: a sprawling thicket of thin stems arching up and out from the root and over, the
 * leaves in flat untidy masses along them, small domed flower heads of pink, orange and yellow.
 */
export function lantana(b: Builder, r: () => number, size: number) {
  const clumps: Clump[] = [];
  const stems = 6 + Math.floor(r() * 4);
  for (let i = 0; i < stems; i++) {
    const a = r() * Math.PI * 2;
    const reach = (0.5 + r() * 0.9) * size;
    const h = (0.6 + r() * 0.7) * size;
    const pts: V3[] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const w = (r() - 0.5) * 0.12 * size * t;
      pts.push([Math.sin(a) * reach * t + w, h * (2 * t - 1.25 * t * t), Math.cos(a) * reach * t - w]);
    }
    b.sweep(PL.stem, pts, [0.018, 0.015, 0.012, 0.009, 0.006].map((v) => v * size), 3);
    clumps.push({ c: pts[4]!, r: (0.2 + r() * 0.14) * size });
    if (r() < 0.6) clumps.push({ c: lerp(pts[2]!, pts[3]!, r()), r: (0.18 + r() * 0.12) * size });
  }
  const shaped = uneven(clumps, r, { base: [0, 0, 0], yaw: r() * Math.PI * 2, lean: 0.3, drop: 0.15, s: [1.35, 0.6, 1.35], sj: 0.4 });
  crown(b, r, PL.lantana, PL.core, [0, 0.55 * size, 0], shaped, 0.42, [0.12, 0.075], 0.25, false, { lump: 0.35, holes: 1, twigs: 1, twig: PL.stem });
  for (const c of shaped) {
    for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
      const s = c.s ?? [1, 0.82, 1];
      const u = unit(r);
      const at = add(c.c, [u[0] * s[0] * c.r * 0.8, Math.abs(u[1]) * s[1] * c.r * 0.95 + 0.02, u[2] * s[2] * c.r * 0.8]);
      b.blob(PL.lantanaFlower[Math.floor(r() * PL.lantanaFlower.length)]!, at, [0.035, 0.022, 0.035], 5, 3, 0.3);
    }
  }
}

/**
 * Communist pacha (Chromolaena): a stand of tall thin stems leaning every way out of one root,
 * soft triangular leaves in pairs up them, each pair turned from the last, and at the tops the
 * pale lilac flower heads it carries at the end of the rains.
 */
export function chromolaena(b: Builder, r: () => number, size: number) {
  const stems = 8 + Math.floor(r() * 6);
  for (let i = 0; i < stems; i++) {
    const a = r() * Math.PI * 2;
    const tilt = 0.1 + r() * 0.35;
    const h = (1.0 + r() * 1.1) * size;
    const o: V3 = [Math.sin(a) * r() * 0.15, 0, Math.cos(a) * r() * 0.15];
    const top: V3 = add(o, [Math.sin(a) * tilt * h, h, Math.cos(a) * tilt * h]);
    const mid = add(lerp(o, top, 0.5), [-Math.sin(a) * tilt * h * 0.12, 0, -Math.cos(a) * tilt * h * 0.12]);
    b.sweep(PL.stem, [o, mid, top], [0.012, 0.009, 0.005], 3);
    let phi = r() * Math.PI;
    for (let t = 0.3; t < 0.92; t += 0.13 + r() * 0.05) {
      const p = t < 0.5 ? lerp(o, mid, t * 2) : lerp(mid, top, t * 2 - 1);
      phi += Math.PI / 2;
      for (const s of [-1, 1]) {
        const along = nrm([Math.cos(phi) * s, -0.2 - r() * 0.3, Math.sin(phi) * s]);
        const n = nrm([-along[0] * 0.3, 1, -along[2] * 0.3]);
        const l = (0.09 + (1 - t) * 0.07) * size;
        b.blade(PL.chromolaena[Math.floor(r() * 3)]!, p, along, n, l, l * 0.7, 0.2, 0.15);
      }
    }
    // The flower heads, clustered at the top
    for (let k = 0; k < 4 + Math.floor(r() * 5); k++) {
      const u = unit(r);
      b.blob(PL.chromolaenaFlower[k & 1]!, add(top, [u[0] * 0.09, Math.abs(u[1]) * 0.05, u[2] * 0.09]), [0.025, 0.018, 0.025], 5, 3, 0.3);
    }
  }
}

/**
 * Wild ginger: a clump of leafy shoots, long narrow leaves set two ranks up each one; or, with
 * `broad`, wild turmeric: broad pale leaves rising straight from the ground on their stalks.
 */
export function ginger(b: Builder, r: () => number, size: number, broad = false) {
  const shoots = broad ? 5 + Math.floor(r() * 4) : 6 + Math.floor(r() * 6);
  for (let i = 0; i < shoots; i++) {
    const a = r() * Math.PI * 2;
    const o: V3 = [Math.sin(a) * r() * 0.25 * size, 0, Math.cos(a) * r() * 0.25 * size];
    const out: V3 = [Math.sin(a), 0, Math.cos(a)];
    if (broad) {
      const h = (0.3 + r() * 0.25) * size;
      const end = add(o, [out[0] * h * 0.3, h, out[2] * h * 0.3]);
      b.sweep(PL.stem, [o, end], [0.012, 0.009], 3);
      const along = nrm([out[0], 0.9 - r() * 0.6, out[2]]);
      b.blade(PL.turmeric[i & 1]!, end, along, nrm([-along[0] * 0.5, 1, -along[2] * 0.5]), (0.4 + r() * 0.18) * size, (0.14 + r() * 0.05) * size, 0.25, 0.25);
      continue;
    }
    const h = (0.7 + r() * 0.6) * size;
    const lean = 0.1 + r() * 0.2;
    const top = add(o, [out[0] * lean * h, h, out[2] * lean * h]);
    b.sweep(PL.stem, [o, lerp(o, top, 0.5), top], [0.012, 0.01, 0.006], 3);
    // Two ranks of leaves, across the lean
    const side: V3 = [out[2], 0, -out[0]];
    let s = 1;
    for (let t = 0.35; t <= 1.001; t += 0.1 + r() * 0.04) {
      s = -s;
      const p = lerp(o, top, t);
      const along = nrm([side[0] * s + out[0] * 0.3, 0.45 - t * 0.35, side[2] * s + out[2] * 0.3]);
      b.blade(PL.ginger[Math.floor(r() * 3)]!, p, along, nrm([-along[0] * 0.4, 1, -along[2] * 0.4]), (0.22 + r() * 0.1) * size, (0.05 + r() * 0.02) * size, 0.3, 0.3);
    }
  }
}

/** Cane (rattan): a few thin spiny stems arching up out of the undergrowth, feathery fronds along them, whip tips trailing. */
export function rattan(b: Builder, r: () => number, size: number) {
  const stems = 3 + Math.floor(r() * 3);
  for (let i = 0; i < stems; i++) {
    const a = r() * Math.PI * 2;
    const L = (2.6 + r() * 2) * size;
    const pts: V3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const out = L * 0.55 * t * t;
      pts.push([Math.sin(a) * out, L * (0.85 * t - 0.35 * t * t * t), Math.cos(a) * out]);
    }
    b.sweep(PL.rattan, pts, [0.03, 0.028, 0.025, 0.022, 0.016, 0.01, 0.004], 4);
    for (let k = 2; k <= 5; k++) {
      frond(b, PL.rattanLeaf, PL.stem, pts[k]!, a + (k & 1 ? 1 : -1) * (0.6 + r() * 0.8), 0.25 + r() * 0.3, (0.8 + r() * 0.5) * size, 0.5, { leaflets: 14, reach: 0.32, width: 0.035 });
    }
  }
}

export function croton(b: Builder, r: () => number) {
  const clumps: Clump[] = [{ c: [0, 0.55, 0], r: 0.42 }, { c: [0.15, 0.85, 0.05], r: 0.3 }];
  b.sweep(PL.stem, [[0, 0, 0], [0, 0.5, 0], [0.12, 0.85, 0.05]], [0.025, 0.02, 0.01], 4);
  // Long glossy leaves, narrower than a mango's, drooping from short stalks
  crown(b, r, PL.croton, PL.core, [0, 0.6, 0], clumps, 0.55, [0.26, 0.085], 0.5, true, { lump: 0.25 });
}

export function banana(b: Builder, r: () => number, bunch: boolean) {
  const h = 2.4 + r() * 1.0;
  // The pseudostem: layered leaf sheaths, green blotched with brown, slightly leaning
  const lean = 0.08 + r() * 0.12;
  b.tube(PL.bananaStem, [0, -0.1, 0], 0.17, 0.11, h + 0.1, 12, { rings: 4, lean: (v) => [v * lean, 0], radius: (v) => 0.17 - v * 0.06 + Math.sin(v * 31) * 0.004 });
  // Old sheaths drying brown and peeling away from the stem in flat flaps
  for (let k = 0; k < 4; k++) {
    const a = r() * Math.PI * 2;
    const y0 = 0.1 + r() * (h * 0.5);
    const rr = 0.175 - (y0 / h) * 0.06;
    const L = 0.4 + r() * 0.5;
    const tx = Math.sin(a), tz = Math.cos(a);
    const side: V3 = [tz * 0.07, 0, -tx * 0.07];
    const top0: V3 = [tx * rr + (y0 / h) * lean, y0 + L, tz * rr];
    const bot: V3 = [tx * (rr + 0.06), y0, tz * (rr + 0.06)];
    b.card(PL.bananaDry, add(top0, side), add(top0, sc(side, -1)), add(bot, sc(side, -1.3)), add(bot, sc(side, 1.3)), [tx, 0.1, tz], [0.85, 0, 1, 1]);
  }
  const top: V3 = [lean, h, 0];
  const leaves = 8 + Math.floor(r() * 3);
  for (let i = 0; i < leaves; i++) {
    const yaw = i * 2.4 + r() * 0.3;
    const age = i / leaves;
    const dead = i < 2;
    const rise = 0.35 + (1 - age) * 0.5;
    const stalk = 0.35 + (1 - age) * 0.35;
    // The stalk climbs out of the stem top to where the blade begins
    const sx = Math.cos(yaw) * stalk * 0.55;
    const sz = -Math.sin(yaw) * stalk * 0.55;
    const end: V3 = [top[0] + sx, top[1] + stalk * rise * 0.9, top[2] + sz];
    b.sweep(dead ? PL.bananaDry : PL.bananaStem, [top, [top[0] + sx * 0.5, top[1] + stalk * rise * 0.55, top[2] + sz * 0.5], end], [0.04, 0.032, 0.022], 4);
    if (dead) {
      // A dead leaf, snapped at its stalk, hanging down the stem like a brown skirt
      // A dead leaf snapped at its stalk: its blade hangs folded down against the stem in a
      // ragged skirt of dry shreds, each curling out a little at the bottom
      const shreds = 7;
      for (let k = 0; k < shreds; k++) {
        const a = yaw + (k / shreds - 0.5) * 1.3;
        const rr = 0.13 + r() * 0.03;
        const L = 0.7 + r() * 0.6;
        const w = 0.05 + r() * 0.04;
        const seg = 5;
        const tx = Math.cos(a), tz = -Math.sin(a);
        const at = (u: number): V3 => [top[0] + Math.sin(a + Math.PI / 2) * 0 + tx * (rr + u * u * 0.25 + u * 0.05), top[1] - 0.05 - u * L, top[2] + tz * (rr + u * u * 0.25 + u * 0.05)];
        const side: V3 = [-tz * w * 0.5, 0, tx * w * 0.5];
        for (let j = 0; j < seg; j++) {
          const p0 = at(j / seg), p1 = at((j + 1) / seg);
          const n: V3 = [tx, 0.2, tz];
          b.card(PL.bananaDry, add(p0, side), add(p0, sc(side, -1)), add(p1, sc(side, -0.8)), add(p1, sc(side, 0.8)), nrm(n), [0.85, j / seg, 1, (j + 1) / seg]);
        }
      }
      continue;
    }
    const young = i === leaves - 1;
    bananaLeaf(b, PL.banana, end, yaw, young ? 1.4 : 0.55 + (1 - age) * 0.7, 1.7 + r() * 0.6 - (young ? 0.5 : 0), r, { tatter: 0.25 + age * 0.55, width: 0.28 + r() * 0.06, hang: young ? 0.6 : 0.8 + age * 0.4 });
  }
  if (bunch) {
    // The bunch: a stalk arching out and down, hands of fingers curving up toward it, the
    // dark purple bud hanging at the end on its bare stalk
    const s0: V3 = top;
    const s1: V3 = [top[0] + 0.45, top[1] + 0.15, 0];
    const s2: V3 = [top[0] + 0.7, top[1] - 0.45, 0];
    const s3: V3 = [top[0] + 0.74, top[1] - 1.35, 0];
    b.sweep(PL.stem, [s0, s1, s2, s3, [top[0] + 0.75, top[1] - 1.75, 0]], [0.045, 0.04, 0.035, 0.025, 0.02], 6);
    const hands = 7;
    for (let t = 0; t < hands; t++) {
      const y = top[1] - 0.3 - t * 0.12;
      const fingers = 12 - Math.floor(t / 2);
      for (let k = 0; k < fingers; k++) {
        const a = (k / fingers) * Math.PI * 1.6 - 0.8 + (t % 2) * 0.2;
        const ox = Math.sin(a) * 0.07;
        const oz = Math.cos(a) * 0.07;
        const cx = s2[0] + 0.02 + ox;
        const cz = oz;
        const L = 0.17 - t * 0.008;
        b.sweep(PL.bananaFruit, [[cx, y, cz], [cx + ox * 0.9, y + L * 0.35, cz + oz * 0.9], [cx + ox * 1.25, y + L * 0.8, cz + oz * 1.25]], [0.016, 0.019, 0.01], 5);
      }
    }
    b.blob(PL.bananaBloom, [top[0] + 0.75, top[1] - 1.95, 0], [0.08, 0.2, 0.08], 8, 6, 0.2);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1;
      b.tri(PL.bananaBloom, [top[0] + 0.75 + Math.sin(a) * 0.07, top[1] - 1.85, Math.cos(a) * 0.07], [top[0] + 0.75 + Math.sin(a + 0.5) * 0.12, top[1] - 1.75, Math.cos(a + 0.5) * 0.12], [top[0] + 0.75 + Math.sin(a + 1) * 0.07, top[1] - 1.85, Math.cos(a + 1) * 0.07], [Math.sin(a), 0, Math.cos(a)]);
    }
  }
}

export function tulsi(b: Builder, r: () => number) {
  const clumps: Clump[] = [];
  for (let i = 0; i < 5; i++) {
    const a = r() * 6.3;
    clumps.push({ c: [Math.sin(a) * 0.15, 0.3 + r() * 0.4, Math.cos(a) * 0.15], r: 0.16 + r() * 0.08 });
  }
  for (const c of clumps) b.sweep(PL.stem, [[0, 0, 0], c.c], [0.015, 0.006], 3);
  crown(b, r, PL.tulsi, null, [0, 0.45, 0], clumps, 0.6, [0.07, 0.04], 0.1);
}
