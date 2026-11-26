// Every material of the temple, the village and the road as a seamless tile, baked once.
// Each layer says what its tile measures in metres and, per texel: linear colour, height in
// metres (which becomes the normal map and the cavity shading), roughness, and a mask that
// means "metal" for metal layers and "takes the material's colour" for the others.
// Image rows run down: down a wall, down a roof's slope, along the grain of wood.

import { blocks, clamp, fbm, fract, hash, hex, lerp3, mix, noise, smooth, worley, W, type C } from './noise.ts';

export interface Px {
  c: C;
  h: number;
  rough: number;
  mask: number;
}

export interface Layer {
  name: string;
  /** Metres across the square tile. */
  metres: number;
  /** Metal layers read the mask as metalness; the others as where the material's colour applies. */
  metal: boolean;
  /** How strongly the cavities between raised parts darken the colour. */
  cavity: number;
  /** Radius in metres of the cavity estimate. */
  reach: number;
  fn: (u: number, v: number, o: Px) => void;
}

const TAU = Math.PI * 2;

const set = (o: Px, c: C, h: number, rough: number, mask: number) => {
  o.c = c;
  o.h = h;
  o.rough = rough;
  o.mask = mask;
};

// ------------------------------------------------------------------ masonry
const laterite: Layer = {
  name: 'laterite',
  metres: 2,
  metal: false,
  cavity: 0.75,
  reach: 0.02,
  fn(u, v, o) {
    // Cut blocks 40 × 20 cm in half-offset courses, a little uneven
    const b = blocks(u, v, 5, 10, (r) => (r % 2) * 0.5 + (hash(r, 3) - 0.5) * 0.16);
    const bw = 0.4;
    const bh = 0.2;
    const chip = fbm(u, v, 48, 48, 4, 5) * 0.006 + Math.max(0, noise(u, v, 160, 160, 9)) * 0.006;
    const edge = Math.min(Math.min(b.fu, 1 - b.fu) * bw, Math.min(b.fv, 1 - b.fv) * bh) + chip;
    const mortarW = 0.006 + noise(u, v, 24, 24, 2) * 0.003;
    const face = smooth(mortarW, mortarW + 0.006, edge);
    const id = b.id;
    // Vesicular laterite: worm-like hollows where clay washed out, ochre and purple tubes,
    // the face weathered dark with black algae from the monsoons
    const holes = fbm(u + id, v, 36, 36, 5, 31) + fbm(u, v, 110, 110, 3, 33) * 0.35;
    const pit1 = smooth(0.42, 0.62, holes);
    const w2 = worley(u, v, 300, 300, 47);
    const pit2 = smooth(0.28, 0.1, w2.f1) * (w2.id > 0.72 ? 1 : 0);
    const veins = smooth(0.15, 0.45, fbm(u, v, 14, 14, 5, 11) + (id - 0.5) * 0.5);
    const purple = smooth(0.25, 0.55, fbm(u, v, 8, 8, 4, 17));
    const grain = fbm(u, v, 90, 90, 3, 23);
    const algae = smooth(-0.15, 0.55, fbm(u, v, 3, 3, 5, 61) + (hash(b.col, b.row, 63) - 0.5) * 0.5);
    let c: C = lerp3(hex(0x8a3a20), hex(0x5e2414), id);
    c = lerp3(c, hex(0xa06428), veins * 0.45);
    c = lerp3(c, hex(0x48201e), purple * 0.45);
    c = lerp3(c, hex(0x201008), clamp(pit1 * 0.9 + pit2 * 0.7));
    c = lerp3(c, hex(0x1c1a14), algae * 0.6);
    c = [c[0] * (0.9 + grain * 0.12), c[1] * (0.9 + grain * 0.12), c[2] * (0.9 + grain * 0.12)];
    const mortar = lerp3(hex(0x6a5e4c), hex(0x3a342a), clamp(fbm(u, v, 40, 40, 3, 41) * 0.5 + 0.5 + algae * 0.3));
    c = lerp3(mortar, c, face);
    const bulge = Math.sin(b.fu * Math.PI) * Math.sin(b.fv * Math.PI) * 0.003;
    const h = face * (0.01 + bulge + grain * 0.0015 - pit1 * 0.007 - pit2 * 0.003 + (id - 0.5) * 0.002) + (1 - face) * fbm(u, v, 200, 200, 2, 3) * 0.0006;
    set(o, c, h, 0.88 + pit1 * 0.08, 0);
  },
};

const plaster: Layer = {
  name: 'plaster',
  metres: 2,
  metal: false,
  cavity: 0.5,
  reach: 0.01,
  fn(u, v, o) {
    // Limewash on lime render: trowel waves, layered wash streaks, grit, hairline cracks, mould
    const trowel = fbm(u, v, 6, 6, 4, 3);
    const wash = fbm(u, v, 30, 4, 4, 9);
    const grit = noise(u, v, 600, 600, 5) + noise(u, v, 300, 300, 6) * 0.5;
    const cw = worley(u + fbm(u, v, 8, 8, 3, 4) * 0.01, v, 7, 7, 15);
    const crackLine = smooth(0.035, 0.0, cw.f2 - cw.f1) * smooth(0.1, 0.4, fbm(u, v, 3, 3, 3, 21));
    const mould = smooth(0.25, 0.65, fbm(u, v, 8, 8, 5, 27)) * smooth(0.45, 0.6, noise(u, v, 90, 90, 28) + 0.5);
    const spots = smooth(0.3, 0.1, worley(u, v, 60, 60, 33).f1) * (W.id > 0.86 ? 1 : 0);
    let c: C = lerp3(hex(0xe6e0d2), hex(0xd2c9b6), clamp(wash * 0.5 + 0.5));
    c = lerp3(c, hex(0xbfb4a0), clamp(trowel * 0.4));
    c = [c[0] * (1 + grit * 0.04), c[1] * (1 + grit * 0.04), c[2] * (1 + grit * 0.04)];
    c = lerp3(c, hex(0x4a463a), crackLine * 0.7);
    c = lerp3(c, hex(0x3a3e30), mould * 0.45 + spots * 0.5);
    const h = trowel * 0.0015 + grit * 0.00012 - crackLine * 0.0008 + wash * 0.0002;
    set(o, c, h, 0.92, 1 - mould * 0.6 - spots * 0.5);
  },
};

const paint: Layer = {
  name: 'paint',
  metres: 2,
  metal: false,
  cavity: 0.5,
  reach: 0.01,
  fn(u, v, o) {
    // House paint over cement render: brush strokes, faded patches, flakes peeled off near
    // the bottom and edges of the tile's damp areas, showing grey render
    const brush = fbm(u, v, 40, 6, 3, 3);
    const fade = fbm(u, v, 4, 4, 4, 5);
    const render = noise(u, v, 400, 400, 7) + fbm(u, v, 60, 60, 3, 8) * 0.5;
    const flakeField = fbm(u, v, 6, 6, 5, 11) + fbm(u, v, 40, 40, 3, 12) * 0.25;
    const peeled = smooth(0.42, 0.46, flakeField);
    const rim = smooth(0.38, 0.42, flakeField) * (1 - peeled);
    const dirt = smooth(0.0, 0.7, fbm(u, v, 5, 3, 4, 19)) * 0.35;
    let c: C = lerp3(hex(0xe8e6e0), hex(0xc8c4bb), clamp(fade * 0.5 + 0.5) * 0.6);
    c = [c[0] * (1 + brush * 0.03), c[1] * (1 + brush * 0.03), c[2] * (1 + brush * 0.03)];
    c = lerp3(c, hex(0x5e5a52), dirt);
    const bare = lerp3(hex(0x8a8478), hex(0x6a645a), clamp(render * 0.5 + 0.5));
    c = lerp3(c, bare, peeled);
    c = lerp3(c, hex(0xf4f2ea), rim * 0.5);
    const h = (1 - peeled) * 0.0004 + rim * 0.0003 + render * 0.0004 + brush * 0.0001 + fbm(u, v, 5, 5, 3, 31) * 0.0012;
    set(o, c, h, mix(0.6, 0.95, peeled) + dirt * 0.2, 1 - peeled);
  },
};

const concrete: Layer = {
  name: 'concrete',
  metres: 2,
  metal: false,
  cavity: 0.7,
  reach: 0.01,
  fn(u, v, o) {
    const mottle = fbm(u, v, 5, 5, 5, 3);
    const fine = fbm(u, v, 120, 120, 3, 4);
    const holes = worley(u, v, 90, 90, 9);
    const bug = smooth(0.22, 0.08, holes.f1) * (holes.id > 0.7 ? 1 : 0);
    const agg = worley(u, v, 260, 260, 13);
    const stone = smooth(0.35, 0.2, agg.f1) * (agg.id > 0.6 ? 1 : 0);
    const streak = smooth(0.2, 0.7, fbm(u, v, 12, 2, 4, 17)) * 0.4;
    const efflo = smooth(0.4, 0.7, fbm(u, v, 4, 8, 4, 21)) * 0.3;
    let c: C = lerp3(hex(0x8e8a82), hex(0x6c6862), clamp(mottle * 0.5 + 0.5));
    c = lerp3(c, lerp3(hex(0xa8a296), hex(0x4a4640), agg.id), stone * 0.5);
    c = lerp3(c, hex(0x3a3834), streak);
    c = lerp3(c, hex(0xc8c6be), efflo);
    c = lerp3(c, hex(0x1e1c1a), bug);
    const h = mottle * 0.0012 + fine * 0.0003 - bug * 0.003 + stone * 0.0004;
    set(o, c, h, 0.88 - efflo * 0.05, 0);
  },
};

const granite: Layer = {
  name: 'granite',
  metres: 2,
  metal: false,
  cavity: 0.55,
  reach: 0.006,
  fn(u, v, o) {
    // Dark Kerala granite: crystals of feldspar, quartz and black biotite at two sizes, dressed
    // with a point chisel and worn smooth by feet, oil and water
    const big = worley(u, v, 220, 220, 3);
    const idA = big.id;
    const fA = big.f2 - big.f1;
    const small = worley(u, v, 560, 560, 5);
    const idB = small.id;

    const pal = (k: number): C =>
      k < 0.28 ? hex(0x1a1a1c) : k < 0.55 ? hex(0x4a4a4c) : k < 0.78 ? hex(0x6e6a66) : k < 0.92 ? hex(0x8a7a72) : hex(0xb0aca4);

    let c = lerp3(pal(idA), pal(idB), 0.35);
    c = lerp3(c, hex(0x101012), smooth(0.08, 0.0, fA) * 0.3);
    const tone = fbm(u, v, 4, 4, 4, 9);
    c = [c[0] * (0.8 + tone * 0.25), c[1] * (0.8 + tone * 0.25), c[2] * (0.8 + tone * 0.25)];
    const chisel = Math.sin((u * 2 + v) * TAU * 110 + fbm(u, v, 10, 10, 3, 13) * 4) * 0.5 + 0.5;
    const dressed = smooth(-0.1, 0.4, fbm(u, v, 3, 3, 3, 17));
    const oil = smooth(0.1, 0.7, fbm(u, v, 6, 6, 5, 19)) * 0.5;
    c = lerp3(c, hex(0x141210), oil * 0.6);
    const pits = smooth(0.25, 0.05, worley(u, v, 300, 300, 23).f1) * (W.id > 0.8 ? 1 : 0);
    const h = chisel * 0.0004 * dressed + fbm(u, v, 30, 30, 3, 29) * 0.0008 - pits * 0.0012 + (idA - 0.5) * 0.00015;
    const mica = idB > 0.93 ? 1 : 0;
    set(o, c, h, clamp(0.62 - oil * 0.3 - mica * 0.3 + dressed * 0.08), 0);
  },
};

// ------------------------------------------------------------------ roofs
const countryTile: Layer = {
  name: 'ctile',
  metres: 2,
  metal: false,
  cavity: 0.85,
  reach: 0.03,
  fn(u, v, o) {
    // Naadan oodu: half-round clay tiles, channels laid concave and covers laid over their
    // edges, each course lapping the one below; black with age, ridges worn back to clay
    const cols = 10;
    const rows = 8;
    const x = u * cols;
    const col = Math.floor(x) % cols;
    const fu = x - Math.floor(x);
    const jitter = (hash(col, 5) - 0.5) * 0.12;
    const y = v * rows + jitter;
    const row = ((Math.floor(y) % rows) + rows) % rows;
    const fv = y - Math.floor(y);
    const id = hash(col, row, 3);
    const cover = col % 2 === 1;
    const sway = (hash(col, row, 9) - 0.5) * 0.08 + (fv - 0.5) * (hash(col, row, 11) - 0.5) * 0.06;
    const q = clamp(fu + sway, 0, 1) * 2 - 1;
    // Covers taper, wider at the bottom; channels are wider than they look
    const halfW = cover ? 0.62 + fv * 0.1 : 1.0;
    const across = q / halfW;
    const prof = cover ? Math.sqrt(clamp(1 - across * across)) * 0.032 + 0.014 : across * across * 0.012;
    const lap = fv * 0.012;
    const lip = smooth(0.97, 1.0, fv);
    const chipped = cover && hash(col, row, 17) > 0.9 ? smooth(0.82, 0.86, fv + noise(u, v, 80, 80, 3) * 0.1) : 0;
    let h = prof + lap - lip * 0.012 - chipped * 0.01 + fbm(u, v, 120, 120, 3, 5) * 0.0006;

    if (cover && Math.abs(across) > 1) h = 0.012 * Math.min(1, across * across) + lap;
    // Colour: clay where rain and sun wear the crown, black mould in the channels and laps
    const crown = cover ? clamp(1 - Math.abs(across)) : 0;
    const mould = clamp(smooth(-0.3, 0.4, fbm(u, v, 12, 12, 5, 21)) * 0.7 + (1 - crown) * 0.4 + (1 - fv) * 0.2);
    const fresh = hash(col, row, 31) > 0.94 ? 1 : 0;
    let c: C = lerp3(hex(0x7a3a22), hex(0x5e2c1a), id);
    c = lerp3(c, hex(0xa4522c), fresh * 0.8);
    c = lerp3(c, hex(0x1e1a16), mould * (1 - fresh * 0.7) * 0.9);
    const lichen = smooth(0.32, 0.12, worley(u, v, 70, 70, 41).f1) * (W.id > 0.72 ? 1 : 0) * smooth(0.0, 0.4, fbm(u, v, 6, 6, 3, 43));
    c = lerp3(c, hex(0x8a8a74), lichen * 0.75);
    const shadowLip = smooth(0.0, 0.08, fv);
    c = [c[0] * mix(0.55, 1, shadowLip), c[1] * mix(0.55, 1, shadowLip), c[2] * mix(0.55, 1, shadowLip)];
    set(o, c, h, 0.78 + mould * 0.15 - fresh * 0.08, 0);
  },
};

const mangaloreTile: Layer = {
  name: 'mtile',
  metres: 2,
  metal: false,
  cavity: 0.8,
  reach: 0.02,
  fn(u, v, o) {
    // Flat interlocking clay tiles, 25 by 33 cm showing, two channels pressed down each, a
    // locking rib on one side and a thick lip over the course below; orange going brown
    const b = blocks(u, v, 8, 6, () => 0);
    const fu = b.fu;
    const fv = b.fv;
    const ch = (c0: number) => smooth(0.07, 0.03, Math.abs(fu - c0));
    const channels = ch(0.36) + ch(0.68);
    const rib = smooth(0.06, 0.0, Math.abs(fu - 0.94)) * 0.6 + smooth(0.04, 0.0, Math.abs(fu - 0.08)) * 0.4;
    const lap = fv * 0.016;
    const lip = smooth(0.95, 1.0, fv);
    const side = smooth(0.0, 0.03, Math.min(fu, 1 - fu));
    const h = (lap - channels * 0.007 + rib * 0.004 - lip * 0.016) * side + fbm(u, v, 140, 140, 3, 3) * 0.0004;
    const id = b.id;
    const streak = smooth(0.0, 0.6, fbm(u, v, 30, 3, 4, 7) + (1 - fv) * 0.3) * 0.6;
    const moss = clamp(channels * 0.6 + (1 - smooth(0.0, 0.12, fv)) * 0.7) * smooth(-0.2, 0.5, fbm(u, v, 9, 9, 4, 11));
    let c: C = lerp3(hex(0xa8502a), hex(0x8a3e20), id);
    c = lerp3(c, hex(0xb86438), hash(b.col, b.row, 23) > 0.85 ? 0.5 : 0);
    c = lerp3(c, hex(0x3a2418), streak * 0.7);
    c = lerp3(c, hex(0x1a1c12), moss * 0.85);
    const efflo = smooth(0.5, 0.75, fbm(u, v, 20, 20, 3, 29)) * 0.3;
    c = lerp3(c, hex(0xb0a090), efflo);
    set(o, c, h, 0.72 + moss * 0.15, 0);
  },
};

const copper: Layer = {
  name: 'copper',
  metres: 2,
  metal: true,
  cavity: 0.6,
  reach: 0.01,
  fn(u, v, o) {
    // Hand-cut copper plates, 50 by 25 cm, in courses each lapping the one below, nailed at
    // the top corners; burnt brown and orange, verdigris run down from the seams
    const b = blocks(u, v, 4, 8, (r) => (r % 2) * 0.5);
    const fu = b.fu;
    const fv = b.fv;
    const seamX = Math.min(fu, 1 - fu) * 0.5;
    const seam = smooth(0.004, 0.0, seamX);
    const lap = fv * 0.0025;
    const lip = smooth(0.96, 1.0, fv);
    const dents = fbm(u + b.id, v, 24, 24, 4, 3) * 0.0012;
    const nails = (smooth(0.012, 0.004, Math.hypot((fu - 0.08) * 0.5, (fv - 0.12) * 0.25)) + smooth(0.012, 0.004, Math.hypot((fu - 0.92) * 0.5, (fv - 0.12) * 0.25))) * 0.0015;
    const h = lap - lip * 0.0025 + seam * 0.002 + dents + nails;
    const age = clamp(b.id * 0.7 + fbm(u, v, 6, 6, 4, 9) * 0.4);
    let c: C = lerp3(hex(0xc07a4c), hex(0x6a3a26), age);
    c = lerp3(c, hex(0x3a2016), smooth(0.2, 0.7, fbm(u, v, 18, 4, 4, 13)) * 0.6);
    // Verdigris where water runs: down from seams and the lips, patchy
    const run = clamp(seam * 2 + smooth(0.75, 1.0, fv) * 0.8 + smooth(0.35, 0.75, fbm(u, v, 20, 3, 4, 17)) * 0.7);
    const green = smooth(0.35, 0.75, run * smooth(-0.3, 0.5, fbm(u, v, 8, 8, 4, 19) + 0.2));
    c = lerp3(c, lerp3(hex(0x4e8a70), hex(0x2e5a48), fbm(u, v, 40, 40, 3, 23) * 0.5 + 0.5), green);
    const black = smooth(0.35, 0.7, fbm(u, v, 10, 10, 4, 29)) * 0.5;
    c = lerp3(c, hex(0x1a120e), black * (1 - green));
    const metal = (1 - green) * mix(0.9, 0.55, age);
    set(o, c, h, mix(0.35, 0.6, age) + green * 0.35 + black * 0.1, metal);
  },
};

const tin: Layer = {
  name: 'tin',
  metres: 2,
  metal: true,
  cavity: 0.5,
  reach: 0.01,
  fn(u, v, o) {
    // Corrugated galvanised iron: 26 ribs across, zinc spangle, white rust, red rust bleeding
    // from the nail rows and running down
    const ribs = 26;
    const wave = 0.5 + 0.5 * Math.cos(u * ribs * TAU);
    const sp = worley(u, v, 50, 50, 3);
    let c: C = lerp3(hex(0x8e9294), hex(0x6a6e70), sp.id);
    const nail = (row: number) => smooth(0.006, 0.002, Math.hypot((fract(u * ribs) - 0.0) * (2 / ribs), (v - row) * 2));
    const nails = nail(0.06) + nail(0.56);
    const bleed = clamp(smooth(0.08, 0.0, Math.abs(v - 0.06)) + smooth(0.08, 0.0, Math.abs(v - 0.56)) + smooth(0.85, 1.0, v));
    const runs = smooth(0.1, 0.6, fbm(u, v, 30, 3, 4, 7)) * smooth(-0.2, 0.4, fbm(u, v, 4, 4, 3, 9));
    const rust = clamp(bleed * smooth(-0.3, 0.3, fbm(u, v, 40, 20, 4, 11)) + runs * 0.8 + smooth(0.45, 0.65, fbm(u, v, 10, 10, 5, 13)) * 0.6);
    const white = smooth(0.5, 0.7, fbm(u, v, 25, 25, 3, 17)) * 0.5 * (1 - rust);
    c = lerp3(c, hex(0xb8b8b0), white);
    c = lerp3(c, lerp3(hex(0x8a3c14), hex(0x3e1a0a), fbm(u, v, 60, 60, 3, 19) * 0.5 + 0.5), rust);
    c = lerp3(c, hex(0x2a2a2a), nails);
    const h = wave * 0.009 + rust * 0.0003 + fbm(u, v, 100, 100, 2, 23) * rust * 0.0004 + nails * 0.002;
    set(o, c, h, mix(0.4, 0.9, rust) + white * 0.3, (1 - rust) * (1 - white * 0.5));
  },
};

// ------------------------------------------------------------------ wood and metal
/** Teak grain along v: rings cut through by the saw, pores, weathering and checks. */
const grain = (u: number, v: number) => {
  const warp = fbm(u, v, 3, 1, 4, 3) * 1.6 + fbm(u, v, 12, 2, 3, 4) * 0.3;
  const ring = fract(u * 34 + warp * 4 + noise(u, v, 2, 1, 5) * 3);
  const late = smooth(0.62, 0.9, ring) * (1 - smooth(0.92, 1.0, ring));
  const pores = smooth(0.25, 0.6, noise(u, v, 420, 6, 7) + noise(u, v, 840, 12, 8) * 0.5);
  const check = smooth(0.02, 0.0, Math.abs(noise(u, v, 40, 2, 9))) * smooth(0.2, 0.5, fbm(u, v, 6, 1, 3, 10));
  const fiber = noise(u, v, 300, 4, 11);

  return { late, pores, check, fiber, warp };
};

const teak: Layer = {
  name: 'teak',
  metres: 1,
  metal: false,
  cavity: 0.6,
  reach: 0.004,
  fn(u, v, o) {
    const g = grain(u, v);
    const board = fbm(u, v, 2, 1, 3, 21);
    let c: C = lerp3(hex(0x8a5a36), hex(0x5a3620), g.late * 0.8);
    c = lerp3(c, hex(0x6e4a32), clamp(board * 0.5 + 0.5) * 0.4);
    c = lerp3(c, hex(0x3a2214), g.pores * 0.35);
    // Weathered: grey where the sun and rain have dried the surface
    const grey = smooth(0.1, 0.6, fbm(u, v, 4, 2, 4, 23)) * 0.3;
    c = lerp3(c, hex(0x6a645a), grey);
    c = lerp3(c, hex(0x140c08), g.check * 0.85);
    const h = -g.late * 0.0004 - g.pores * 0.00012 - g.check * 0.0015 + g.fiber * 0.00008 + board * 0.0003;
    set(o, c, h, 0.62 + g.late * 0.1 + grey * 0.15, 1);
  },
};

const lacquer: Layer = {
  name: 'lacquer',
  metres: 1,
  metal: false,
  cavity: 0.6,
  reach: 0.004,
  fn(u, v, o) {
    // Red lacquer (chayilyam) over teak, crazed with age and worn through on the edges of the
    // grain, the wood showing dark beneath
    const g = grain(u, v);
    const wear = smooth(0.35, 0.55, fbm(u, v, 6, 3, 5, 31) + g.late * 0.25 + fbm(u, v, 60, 8, 3, 33) * 0.15);
    const craze = worley(u + fbm(u, v, 12, 12, 2, 35) * 0.004, v, 40, 26, 37);
    const crack = smooth(0.05, 0.0, craze.f2 - craze.f1) * (1 - wear);
    let lac: C = lerp3(hex(0x8a2414), hex(0x5e140c), clamp(fbm(u, v, 5, 5, 4, 39) * 0.5 + 0.5 + (craze.id - 0.5) * 0.15));
    lac = lerp3(lac, hex(0x2a0a06), crack * 0.8);
    let wood: C = lerp3(hex(0x5a3a22), hex(0x2e1a10), g.late);
    wood = lerp3(wood, hex(0x1a0e08), g.pores * 0.3);
    const c = lerp3(lac, wood, wear);
    const h = (1 - wear) * 0.0003 - crack * 0.0002 - g.late * 0.0003 * wear - g.check * 0.001 + g.fiber * 0.00005;
    set(o, c, h, mix(0.28, 0.7, wear) + crack * 0.2, 1 - wear);
  },
};

const brass: Layer = {
  name: 'brass',
  metres: 0.5,
  metal: true,
  cavity: 0.45,
  reach: 0.004,
  fn(u, v, o) {
    // Cast bell metal, turned smooth and rubbed with tamarind: an even warm gold with faint
    // casting mottle, fine cleaning scratches, a soft oily tarnish only in broad low patches
    const mottle = fbm(u, v, 6, 6, 4, 13);
    const fine = fbm(u, v, 40, 40, 3, 14);
    const sA = smooth(0.012, 0.0, Math.abs(noise(u, v, 3, 260, 9))) * smooth(0.2, 0.6, fbm(u, v, 8, 8, 3, 11));
    const sB = smooth(0.01, 0.0, Math.abs(noise(u, v, 300, 4, 10))) * smooth(0.3, 0.7, fbm(u, v, 8, 8, 3, 12));
    const scratch = clamp(sA + sB * 0.6);
    const tarnish = smooth(0.15, 0.6, mottle) * 0.5;
    const pit = smooth(0.62, 0.7, fbm(u, v, 70, 70, 2, 21)) * 0.6;
    let c: C = lerp3(hex(0xe0b060), hex(0xc89848), 0.5 + fine * 0.5);
    c = lerp3(c, hex(0x8a6a30), tarnish);
    c = lerp3(c, hex(0x3a2a14), pit);
    c = lerp3(c, hex(0xffe4a8), scratch * 0.35);
    const h = -pit * 0.00008 - scratch * 0.00002 + fine * 0.00001;
    set(o, c, h, clamp(0.2 + tarnish * 0.25 + fine * 0.05 + pit * 0.3 - scratch * 0.06), 1);
  },
};

const steel: Layer = {
  name: 'steel',
  metres: 1,
  metal: true,
  cavity: 0.4,
  reach: 0.004,
  fn(u, v, o) {
    // Galvanised and painted steel: brushed, scuffed, rust coming through at scratches and pits
    const brushed = noise(u, v, 4, 600, 3) * 0.5 + noise(u, v, 8, 1200, 4) * 0.25;
    const scuff = smooth(0.2, 0.6, fbm(u, v, 20, 20, 4, 7));
    const pits = worley(u, v, 120, 120, 9);
    const rustSpot = smooth(0.4, 0.1, pits.f1) * (pits.id > 0.82 ? 1 : 0);
    const rust = clamp(rustSpot + smooth(0.5, 0.75, fbm(u, v, 6, 6, 5, 11)) * 0.8);
    let c: C = lerp3(hex(0x9a9c9e), hex(0x7a7c7e), clamp(brushed + 0.5));
    c = lerp3(c, hex(0x5a5c5e), scuff * 0.3);
    c = lerp3(c, lerp3(hex(0x7a3410), hex(0x3a1808), pits.id), rust);
    const h = brushed * 0.00002 - rustSpot * 0.0003 + rust * fbm(u, v, 200, 200, 2, 13) * 0.0002;
    set(o, c, h, mix(0.3, 0.9, rust) + scuff * 0.12, 1 - rust);
  },
};

const cloth: Layer = {
  name: 'cloth',
  metres: 0.25,
  metal: false,
  cavity: 0.5,
  reach: 0.001,
  fn(u, v, o) {
    // Plain-woven cotton, uneven slubs in the threads
    const n = 140;
    const x = u * n;
    const y = v * n;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const over = (ix + iy) % 2 === 0;
    const warp = Math.sin(fx * Math.PI) * (over ? 1 : 0.4);
    const weft = Math.sin(fy * Math.PI) * (over ? 0.4 : 1);
    const thread = Math.max(warp, weft);
    const slub = noise(u, v, 4, 280, 3) * 0.5 + noise(u, v, 280, 4, 4) * 0.5;
    const c0 = 0.82 + slub * 0.12 + thread * 0.08;
    const dirt = smooth(0.1, 0.7, fbm(u, v, 3, 3, 4, 7)) * 0.25;
    const c: C = lerp3([c0, c0 * 0.98, c0 * 0.95], [0.3, 0.27, 0.22], dirt);
    set(o, c, thread * 0.0003 + slub * 0.00005, 0.95, 1);
  },
};

// ------------------------------------------------------------------ paintings
const mural: Layer = {
  name: 'mural',
  metres: 2,
  metal: false,
  cavity: 0.3,
  reach: 0.004,
  fn(u, v, o) {
    // A Kerala mural frieze in the five colours: ochre ground, red ochre, verdigris green,
    // lamp-black lines and lime white. Bands top and bottom, a scrolling vine between, lotus
    // rosettes in its loops; the plaster crazed and the paint faded and flaking.
    const OCHRE = hex(0xc8902e);
    const RED = hex(0x9a2414);
    const GREEN = hex(0x2e6a46);
    const BLACK = hex(0x16120e);
    const WHITE = hex(0xe8dcc0);
    const BLUE = hex(0x2a4a6a);
    let c: C = lerp3(OCHRE, hex(0xb27a24), clamp(fbm(u, v, 6, 6, 4, 3) * 0.5 + 0.5) * 0.5);
    let line = 0;
    // Border bands
    const band = (y0: number, y1: number) => smooth(0.0, 0.002, v - y0) * smooth(0.0, 0.002, y1 - v);
    const top = band(0.03, 0.11);
    const bot = band(0.89, 0.97);
    const inBand = Math.max(top, bot);
    line = Math.max(line, smooth(0.004, 0.0, Math.min(Math.abs(v - 0.03), Math.abs(v - 0.11), Math.abs(v - 0.89), Math.abs(v - 0.97))));

    if (inBand > 0.5) {
      // Running pattern of red lozenges with white dots
      const cx = fract(u * 16);
      const yy = v < 0.5 ? (v - 0.07) / 0.04 : (v - 0.93) / 0.04;
      const diamond = Math.abs(cx - 0.5) * 2 + Math.abs(yy);
      c = diamond < 0.85 ? RED : GREEN;
      line = Math.max(line, smooth(0.08, 0.0, Math.abs(diamond - 0.85)));

      if (Math.hypot((cx - 0.5) * 0.25, yy * 0.04) < 0.008) c = WHITE;
    } else if (v > 0.11 && v < 0.89) {
      // The vine: two sine stems crossing, leaves along them, lotuses where they loop
      const k = 3;
      const y = (v - 0.5) / 0.39;
      const s1 = Math.sin(u * k * TAU) * 0.55;
      const s2 = -s1;
      const d1 = Math.abs(y - s1) * 0.39;
      const d2 = Math.abs(y - s2) * 0.39;
      const stem = Math.min(d1, d2);

      if (stem < 0.012) c = GREEN;
      line = Math.max(line, smooth(0.0035, 0.0, Math.abs(stem - 0.012)));

      // Leaves: almond shapes hung off the stems
      for (let i = 0; i < 12; i++) {
        const lu = (i + 0.25) / 12;
        const side = i % 2 ? 1 : -1;
        const sy = Math.sin(lu * k * TAU) * 0.55 * (i % 4 < 2 ? 1 : -1);
        const ly = 0.5 + sy * 0.39 + side * 0.05;
        const du = (((u - lu + 0.5) % 1) + 1) % 1 - 0.5;
        const dv = v - ly;
        const a = side * 0.8;
        const ru = du * Math.cos(a) - dv * Math.sin(a);
        const rv = du * Math.sin(a) + dv * Math.cos(a);
        const leaf = Math.hypot(ru / 0.05, rv / 0.02);

        if (leaf < 1) c = lerp3(GREEN, hex(0x5a8a4a), clamp(1 - Math.abs(rv) / 0.02) * 0.6);
        line = Math.max(line, smooth(0.12, 0.0, Math.abs(leaf - 1)) * 0.9);

        if (leaf < 1) line = Math.max(line, smooth(0.0015, 0.0, Math.abs(rv)) * 0.6);
      }

      // Lotus rosettes in the loops
      for (let i = 0; i < 6; i++) {
        const lu = (i + 0.5) / 6;
        const du = (((u - lu + 0.5) % 1) + 1) % 1 - 0.5;
        const dv = v - 0.5;
        const r = Math.hypot(du, dv);
        const a = Math.atan2(dv, du);
        const petals = 0.06 * (0.62 + 0.38 * Math.abs(Math.cos(a * 4)));
        const inner = 0.06 * (0.38 + 0.22 * Math.abs(Math.cos(a * 4 + Math.PI / 4)));

        if (r < petals) c = RED;

        if (r < inner) c = lerp3(RED, WHITE, 0.6);

        if (r < 0.014) c = hex(0xd8a83a);
        line = Math.max(line, smooth(0.0035, 0.0, Math.abs(r - petals)), smooth(0.003, 0.0, Math.abs(r - inner)), smooth(0.003, 0.0, Math.abs(r - 0.014)));
        // Blue dots in the ground between
        const bu = (((u - lu) % 1) + 1) % 1 - 0.5;

        if (Math.hypot(bu * 0.4, (v - 0.22) * 1) < 0.012 || Math.hypot(bu * 0.4, (v - 0.78) * 1) < 0.012) c = BLUE;
      }
    }

    // Hand-drawn lines wobble in weight
    line *= 0.75 + 0.25 * noise(u, v, 60, 60, 41);
    c = lerp3(c, BLACK, clamp(line));
    // Age: soot from the lamps, fading, craquelure, flakes off to lime
    const fade = smooth(-0.2, 0.6, fbm(u, v, 5, 5, 4, 43)) * 0.35;
    c = lerp3(c, hex(0xc8b490), fade);
    const soot = smooth(0.1, 0.8, fbm(u, v, 4, 4, 4, 47)) * 0.35;
    c = lerp3(c, hex(0x2a2018), soot);
    const cr = worley(u, v, 50, 50, 49);
    const craze = smooth(0.04, 0.0, cr.f2 - cr.f1) * 0.6;
    c = lerp3(c, hex(0x3a2c1c), craze);
    const flake = smooth(0.5, 0.53, fbm(u, v, 14, 14, 4, 53));
    c = lerp3(c, WHITE, flake * 0.9);
    const h = -craze * 0.0002 - flake * 0.0003 + fbm(u, v, 30, 30, 3, 59) * 0.0004;
    set(o, c, h, 0.9, 0);
  },
};

// ------------------------------------------------------------------ the ground
const sand: Layer = {
  name: 'sand',
  metres: 2,
  metal: false,
  cavity: 0.7,
  reach: 0.01,
  fn(u, v, o) {
    // The compound's swept river sand: fine grains, pebbles, broom strokes, a few fallen leaves
    const grains = noise(u, v, 700, 700, 3) * 0.6 + noise(u, v, 350, 350, 4) * 0.4;
    const curl = fbm(u, v, 3, 3, 3, 5) * 1.5;
    const stroke = Math.sin((u * 0.8 + v * 0.3 + curl * 0.08) * TAU * 30 + noise(u, v, 6, 6, 7) * 4);
    const strokes = smooth(0.2, 0.9, stroke) * smooth(-0.2, 0.4, fbm(u, v, 4, 4, 3, 9));
    const pw = worley(u, v, 70, 70, 11);
    const pebble = smooth(0.3 * pw.id + 0.05, 0.02, pw.f1) * (pw.id > 0.55 ? 1 : 0);
    const lw = worley(u, v, 7, 7, 13);
    const a = lw.id * TAU;
    const lx = lw.dx * Math.cos(a) - lw.dy * Math.sin(a);
    const ly = lw.dx * Math.sin(a) + lw.dy * Math.cos(a);
    const leafD = Math.hypot(lx / 0.22, ly / 0.09);
    const leaf = lw.id > 0.7 ? smooth(1.0, 0.9, leafD) : 0;
    let c: C = lerp3(hex(0x9a8c74), hex(0x7e705c), clamp(fbm(u, v, 5, 5, 4, 15) * 0.5 + 0.5));
    c = [c[0] * (1 + grains * 0.12), c[1] * (1 + grains * 0.12), c[2] * (1 + grains * 0.12)];
    c = lerp3(c, lerp3(hex(0xc8c0b0), hex(0x4a4038), hash(pw.cx, pw.cy, 17)), pebble);
    c = lerp3(c, lerp3(hex(0x8a5a26), hex(0x4a3018), hash(lw.cx, lw.cy, 19)), leaf);
    const h = grains * 0.0004 + strokes * 0.0012 + pebble * 0.003 * (0.5 + pw.id) + leaf * 0.0008;
    set(o, c, h, 0.95 - leaf * 0.2, 0);
  },
};

const earth: Layer = {
  name: 'earth',
  metres: 2,
  metal: false,
  cavity: 0.75,
  reach: 0.015,
  fn(u, v, o) {
    // Red laterite soil: crumbly clods, gravel, dry cracks, twigs and leaf litter
    const clod = worley(u, v, 40, 40, 3);
    const clodH = (1 - clamp(clod.f1 / 0.8)) * 0.004;
    const crack = smooth(0.05, 0.0, clod.f2 - clod.f1) * smooth(0.0, 0.4, fbm(u, v, 3, 3, 3, 5));
    const gw = worley(u, v, 160, 160, 7);
    const gravel = smooth(0.35, 0.1, gw.f1) * (gw.id > 0.6 ? 1 : 0);
    const dust = noise(u, v, 500, 500, 9);
    const litter = worley(u, v, 18, 18, 11);
    const a = litter.id * TAU;
    const lx = litter.dx * Math.cos(a) - litter.dy * Math.sin(a);
    const ly = litter.dx * Math.sin(a) + litter.dy * Math.cos(a);
    const leaf = litter.id > 0.6 ? smooth(1.0, 0.85, Math.hypot(lx / 0.3, ly / 0.11)) : 0;
    const twig = litter.id < 0.12 ? smooth(0.03, 0.0, Math.abs(ly)) * smooth(0.5, 0.4, Math.abs(lx)) : 0;
    let c: C = lerp3(hex(0x8a4226), hex(0x5e2a16), clamp(fbm(u, v, 6, 6, 5, 13) * 0.5 + 0.5));
    c = [c[0] * (1 + dust * 0.15), c[1] * (1 + dust * 0.15), c[2] * (1 + dust * 0.15)];
    c = lerp3(c, lerp3(hex(0xa0603a), hex(0x3a1a10), hash(gw.cx, gw.cy, 3)), gravel);
    c = lerp3(c, hex(0x1e0e08), crack * 0.8);
    c = lerp3(c, lerp3(hex(0x7a5020), hex(0x3a2412), hash(litter.cx, litter.cy, 5)), leaf);
    c = lerp3(c, hex(0x3a2818), twig);
    const h = clodH + gravel * 0.003 - crack * 0.004 + dust * 0.0003 + leaf * 0.0008 + twig * 0.003;
    set(o, c, h, 0.95, 0);
  },
};

const grass: Layer = {
  name: 'grass',
  metres: 2,
  metal: false,
  cavity: 0.8,
  reach: 0.01,
  fn(u, v, o) {
    // Short tropical grass seen from above: blades in every direction, some dry, soil between
    let blade = 0;
    let shade = 0;
    let dry = 0;

    for (let k = 0; k < 3; k++) {
      const w = worley(u, v, 110 + k * 40, 110 + k * 40, 3 + k * 10);
      const a = w.id * TAU;
      const along = w.dx * Math.cos(a) + w.dy * Math.sin(a);
      const across = -w.dx * Math.sin(a) + w.dy * Math.cos(a);
      const len = 0.9 + hash(w.cx, w.cy, k) * 0.5;
      const t = clamp(0.5 - along / len);
      const b = smooth(0.09 * (1 - t * 0.7), 0.0, Math.abs(across)) * smooth(0.5 * len, 0.4 * len, Math.abs(along));

      if (b > blade) {
        blade = b;
        shade = t;
        dry = hash(w.cx, w.cy, k + 50);
      }
    }

    const patchy = smooth(-0.3, 0.5, fbm(u, v, 5, 5, 4, 41));
    const soil: C = lerp3(hex(0x4a2a18), hex(0x2a1a10), clamp(noise(u, v, 300, 300, 43) + 0.5));
    let g: C = lerp3(hex(0x3a5a1a), hex(0x5a7a22), shade);
    g = lerp3(g, hex(0x8a7a3a), dry > 0.82 ? 0.75 : dry > 0.7 ? 0.3 : 0);
    g = lerp3(g, hex(0x6a6a2a), (1 - patchy) * 0.4);
    const cover = clamp(blade * (0.5 + patchy * 0.7));
    const c = lerp3(lerp3(soil, hex(0x1e2a10), 0.5), g, cover);
    set(o, c, cover * 0.004 * (0.4 + shade), 0.85, 0);
  },
};

const asphalt: Layer = {
  name: 'asphalt',
  metres: 2,
  metal: false,
  cavity: 0.7,
  reach: 0.006,
  fn(u, v, o) {
    // Chip-sealed tar on a village road: stone chips in black binder, worn grey on top,
    // patched, cracked in a net, an oil stain or two
    const w = worley(u, v, 180, 180, 3, 0.9);
    const stone = smooth(0.42, 0.3, w.f1);
    const w2 = worley(u, v, 420, 420, 5, 0.9);
    const fineStone = smooth(0.4, 0.28, w2.f1);
    const worn = smooth(-0.3, 0.5, fbm(u, v, 4, 4, 4, 7));
    const patch = smooth(0.3, 0.34, fbm(u, v, 3, 3, 3, 9));
    const cw = worley(u + fbm(u, v, 6, 6, 3, 11) * 0.01, v, 5, 5, 13);
    const crack = smooth(0.03, 0.0, cw.f2 - cw.f1) * smooth(0.1, 0.5, fbm(u, v, 3, 3, 3, 15)) * (1 - patch);
    const oil = smooth(0.25, 0.1, worley(u, v, 3, 3, 17).f1) * (W.id > 0.6 ? 0.6 : 0);
    const binder: C = lerp3(hex(0x141414), hex(0x242322), worn);
    const chip: C = lerp3(hex(0x5a5856), hex(0x2a2a2a), w.id * 0.7 + (1 - worn) * 0.3);
    let c = lerp3(binder, chip, stone * mix(0.4, 1, worn));
    c = lerp3(c, lerp3(hex(0x4a4846), hex(0x1a1a1a), w2.id), fineStone * 0.35);
    c = lerp3(c, hex(0x0e0e0e), patch * 0.85);
    c = lerp3(c, hex(0x050505), crack);
    c = lerp3(c, hex(0x0a0908), oil);
    const h = stone * 0.002 * (1 - patch) + fineStone * 0.0006 - crack * 0.003 + patch * 0.001;
    set(o, c, h, mix(0.75, 0.55, oil) + stone * 0.1 - patch * 0.15, 0);
  },
};

const gravel: Layer = {
  name: 'gravel',
  metres: 2,
  metal: false,
  cavity: 0.8,
  reach: 0.01,
  fn(u, v, o) {
    // Murram: laterite gravel packed in red dust, for the path and the shoulders
    const w = worley(u, v, 120, 120, 3, 0.95);
    const stone = smooth(0.45, 0.25, w.f1);
    const w2 = worley(u, v, 300, 300, 5, 0.95);
    const small = smooth(0.4, 0.2, w2.f1) * (w2.id > 0.4 ? 1 : 0);
    const dust: C = lerp3(hex(0x9a5a36), hex(0x7a4226), clamp(fbm(u, v, 8, 8, 4, 7) * 0.5 + 0.5));
    let c = lerp3(dust, lerp3(hex(0x8a3e1e), hex(0x4a2012), w.id), stone);
    c = lerp3(c, lerp3(hex(0xb07040), hex(0x5a2a14), w2.id), small * 0.7);
    const h = stone * 0.005 * (0.6 + w.id * 0.5) + small * 0.002 + noise(u, v, 500, 500, 9) * 0.0003;
    set(o, c, h, 0.92, 0);
  },
};

// ------------------------------------------------------------------ trees
const bark: Layer = {
  name: 'bark',
  metres: 1,
  metal: false,
  cavity: 0.85,
  reach: 0.012,
  fn(u, v, o) {
    // Rough bark: plates between long vertical fissures, fibres, grey-green lichen
    const warp = fbm(u, v, 4, 2, 3, 3) * 0.05;
    const w = worley(u + warp, v, 14, 4, 5, 0.9);
    const fiss = smooth(0.12, 0.0, w.f2 - w.f1);
    const plate = clamp((w.f2 - w.f1) * 3);
    const fibre = noise(u, v, 120, 8, 7);
    const lichen = smooth(0.15, 0.45, fbm(u, v, 6, 6, 5, 9)) * (1 - fiss);
    let c: C = lerp3(hex(0x5e5246), hex(0x3a3028), w.id);
    c = lerp3(c, hex(0x1a1410), fiss);
    c = lerp3(c, lerp3(hex(0x8a907a), hex(0x6a7a5a), fbm(u, v, 30, 30, 2, 11) * 0.5 + 0.5), lichen * 0.6);
    const h = plate * 0.008 + fibre * 0.0008 - fiss * 0.004 + lichen * 0.0004;
    set(o, c, h, 0.92, 1);
  },
};

const palmBark: Layer = {
  name: 'palmbark',
  metres: 1,
  metal: false,
  cavity: 0.8,
  reach: 0.01,
  fn(u, v, o) {
    // Coconut trunk: ring scars of fallen fronds every 10 cm, fibrous between, grey
    const y = v * 10 + fbm(u, v, 3, 1, 3, 3) * 0.25;
    const ring = fract(y);
    const scar = smooth(0.0, 0.08, ring) * smooth(0.3, 0.12, ring);
    const fibre = noise(u, v, 160, 6, 5) + noise(u, v, 320, 12, 6) * 0.5;
    const cracks = smooth(0.03, 0.0, Math.abs(noise(u, v, 30, 2, 7))) * 0.8;
    let c: C = lerp3(hex(0x7a7266), hex(0x58504a), clamp(fbm(u, v, 4, 4, 4, 9) * 0.5 + 0.5));
    c = lerp3(c, hex(0x3a3430), scar * 0.6);
    c = lerp3(c, hex(0x2a2420), cracks * 0.6);
    c = [c[0] * (1 + fibre * 0.08), c[1] * (1 + fibre * 0.08), c[2] * (1 + fibre * 0.08)];
    const h = scar * 0.006 + fibre * 0.0005 - cracks * 0.002;
    set(o, c, h, 0.9, 1);
  },
};

/** In the order of the texture array's layers; `textures.gen.ts` names them for the shaders. */
export const LAYERS: Layer[] = [
  laterite, plaster, paint, concrete, granite, countryTile, mangaloreTile, copper, tin,
  teak, lacquer, brass, steel, cloth, mural, sand, earth, grass, asphalt, gravel, bark, palmBark,
];
