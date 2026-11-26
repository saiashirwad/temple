// Leaf-by-leaf building blocks shared by every tree and plant: clumps of leaf cards whose normals
// lean out of the crown so it shades as one soft mass, palm fronds with real leaflets, and
// tattered banana leaves.

import { Builder, type Mat, type V3 } from '../../render/geo.ts';

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const sc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const nrm = (a: V3): V3 => sc(a, 1 / (len(a) || 1));
export const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dt = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A random unit vector. */
export const unit = (r: () => number): V3 => {
  const y = r() * 2 - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(1 - y * y);
  return [Math.cos(a) * s, y, Math.sin(a) * s];
};

/** One leaf: a pointed oval from `base` along `along`, its face turned to `normal`. */
export function leaf(b: Builder, mat: Mat, base: V3, along: V3, normal: V3, length: number, width: number) {
  const side = nrm(crs(along, normal));
  const mid = add(base, sc(along, length * 0.42));
  const tip = add(base, sc(along, length));
  // Folded a little along the midrib, the two halves dipping, so it catches light like a leaf
  // and not a flat chip of card
  const dip = sc(normal, -width * 0.22);
  b.card(mat, base, add(add(mid, sc(side, width / 2)), dip), tip, add(add(mid, sc(side, -width / 2)), dip), normal, [0.5, 0, 0.5, 1]);
}

export interface Clump {
  c: V3;
  r: number;
  /** Radius scale per axis, default [1, 0.82, 1]: flat pads, tall plumes, long sprays. */
  s?: V3;
}

/** How ragged a crown is; all of it off by default, so a plain crown stays as it was. */
export interface Ragged {
  /** How far each clump's skin wanders in and out, as a share of its radius. */
  lump?: number;
  /** Gaps per clump where no leaves grow, and how wide each is (the cosine of its half-angle). */
  holes?: number;
  hole?: number;
  /** Bare twigs per clump poking out through the skin, a few leaves at their ends, in `twig`. */
  twigs?: number;
  twig?: Mat;
}

/**
 * A crown of leaf clumps. Each leaf sits near its clump's skin, faces outward, and takes a normal
 * between the clump's and the whole crown's, so light rolls smoothly over the masses. A dark
 * core inside each clump keeps the gaps between leaves from showing sky. `rag` makes the skin
 * lumpy, leaves gaps in it and pokes twigs out of it, so the clumps don't read as balls.
 */
export function crown(
  b: Builder,
  r: () => number,
  mats: Mat[],
  core: Mat | null,
  centre: V3,
  clumps: Clump[],
  cover: number,
  size: [number, number],
  droop = 0.35,
  /** Proper oval blades instead of folded cards: for shrubs seen at arm's length. */
  oval = false,
  rag: Ragged = {},
) {
  const lump = rag.lump ?? 0;
  const holeCos = rag.hole ?? 0.84;
  const put = (mat: Mat, pos: V3, dir: V3) => {
    const out = nrm(add(sc(nrm(sub(pos, centre)), 0.55), sc(dir, 0.45)));
    const rough = unit(r);
    let along = nrm(sub(rough, sc(out, dt(rough, out))));
    along = nrm(add(along, [0, -droop, 0]));
    const faced = nrm(add(out, sc(unit(r), 0.35)));
    const l = size[0] * (0.75 + r() * 0.5);
    const w = size[1] * (0.8 + r() * 0.4);
    if (oval) b.blade(mat, sub(pos, sc(along, l * 0.3)), along, faced, l, w, 0.3, 0.1 + r() * 0.12);
    else leaf(b, mat, sub(pos, sc(along, l * 0.3)), along, faced, l, w);
  };
  for (const k of clumps) {
    const s = k.s ?? [1, 0.82, 1];
    // The lump field: a few broad lobes in and out, seeded per clump
    const ph = lump > 0 ? [r() * 6.3, r() * 6.3, r() * 6.3] : [0, 0, 0];
    const lobe = (d: V3) => 1 + lump * (Math.sin(d[0] * 2.3 + ph[0]!) * Math.sin(d[1] * 2.9 + ph[1]!) * 0.6 + Math.sin(d[2] * 3.7 + d[0] * 1.9 + ph[2]!) * 0.4);
    const holes: V3[] = [];
    for (let i = 0; i < (rag.holes ?? 0); i++) {
      const u = unit(r);
      holes.push(nrm([u[0], u[1] * 0.6, u[2]]));
    }
    const cs = 0.72 * (1 - lump * 0.55);
    if (core) b.blob(core, k.c, [k.r * s[0] * cs, k.r * s[1] * cs * 0.9, k.r * s[2] * cs], 8, 5, 0.15 + lump * 0.5);
    // Enough leaves to cover `cover` of the clump's skin
    const area = (s[0] * s[1] + s[1] * s[2] + s[0] * s[2]) / (0.82 + 0.82 + 1);
    const n = Math.round((cover * 4 * Math.PI * k.r * k.r * area) / (size[0] * size[1] * 0.5));
    for (let i = 0; i < n; i++) {
      const dir = unit(r);
      if (dir[1] < -0.5 && r() < 0.6) dir[1] *= -0.5;
      const sk = 0.72 + 0.3 * Math.sqrt(r());
      const mat = mats[Math.floor(r() * mats.length)]!;
      let gap = false;
      for (const h of holes) if (dt(dir, h) > holeCos) gap = true;
      if (gap) continue;
      const f = sk * (lump > 0 ? lobe(dir) : 1);
      put(mat, add(k.c, [dir[0] * k.r * s[0] * f, dir[1] * k.r * s[1] * f, dir[2] * k.r * s[2] * f]), dir);
    }
    // Twigs through the skin, bare but for a few leaves at the end
    const twigs = rag.twig ? (rag.twigs ?? 0) : 0;
    for (let i = 0; i < twigs; i++) {
      const u = unit(r);
      const dir = nrm([u[0], u[1] * 0.5 + 0.15, u[2]]);
      const reach = 1.12 + r() * 0.3;
      const from = add(k.c, [dir[0] * k.r * s[0] * 0.45, dir[1] * k.r * s[1] * 0.45, dir[2] * k.r * s[2] * 0.45]);
      const tip = add(k.c, [dir[0] * k.r * s[0] * reach, dir[1] * k.r * s[1] * reach - k.r * 0.08, dir[2] * k.r * s[2] * reach]);
      b.sweep(rag.twig!, [from, lerp(from, tip, 0.55), tip], [0.022 * k.r, 0.012 * k.r, 0.005 * k.r], 3);
      const m = 2 + Math.floor(r() * 3);
      for (let j = 0; j < m; j++) put(mats[Math.floor(r() * mats.length)]!, add(tip, sc(unit(r), size[0] * 0.35)), dir);
    }
  }
}

/**
 * Makes a crown's clumps uneven the way a real tree's are: sizes and shapes varied, a few left
 * out so bare limbs show, and the whole crown reaching toward the open side (`yaw`), fuller
 * there and thinner on the shaded side.
 */
export function uneven(clumps: Clump[], r: () => number, o: { base: V3; yaw: number; lean?: number; drop?: number; jitter?: number; s?: V3; sj?: number }): Clump[] {
  const L: V3 = [Math.sin(o.yaw), 0, Math.cos(o.yaw)];
  const lean = o.lean ?? 0.2;
  const s0 = o.s ?? [1, 0.82, 1];
  const sj = o.sj ?? 0.3;
  const out: Clump[] = [];
  for (const k of clumps) {
    const rel = sub(k.c, o.base);
    const lit = dt(nrm([rel[0], 0, rel[2]]), L);
    // Thinner on the shaded side, never down to nothing
    if (out.length > 1 && r() < (o.drop ?? 0.12) * (1 - lit)) continue;
    const up = Math.max(rel[1], 0);
    const c = add(k.c, sc(L, lean * up * 0.25));
    const rr = k.r * (1 + ((r() - 0.5) * 2 * (o.jitter ?? 0.25))) * (1 + lit * lean * 0.5);
    const s: V3 = [s0[0] * (1 + (r() - 0.5) * sj), s0[1] * (1 + (r() - 0.5) * sj), s0[2] * (1 + (r() - 0.5) * sj)];
    out.push({ c, r: rr, s });
  }
  return out;
}

/**
 * A palm frond in the frond's own frame: the rachis arches out along +x, leaflets in a V either
 * side along z, each bending down at its outer half.
 */
export function frond(b: Builder, mat: Mat, rib: Mat, base: V3, yaw: number, rise: number, length: number, droop: number, opts: { leaflets?: number; reach?: number; width?: number; wear?: () => number } = {}) {
  const K = opts.leaflets ?? 28;
  const reach = opts.reach ?? 0.95;
  const width = opts.width ?? 0.05;
  const at = (u: number): V3 => [u * length, u * length * rise - droop * u * u * length, 0];
  b.with({ at: base, yaw }, () => {
    const spine: V3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= 10; i++) {
      spine.push(at(i / 10));
      radii.push(0.035 * (1 - i / 11));
    }
    b.sweep(rib, spine, radii, 3);
    for (let k = 0; k < K; k++) {
      const u = 0.07 + (0.93 * k) / K;
      const p = at(u);
      const T = nrm(sub(at(Math.min(u + 0.01, 1)), at(u - 0.01)));
      const L = (reach * Math.pow(Math.sin(Math.PI * Math.min(u * 1.2, 1)), 0.5) * (1 - 0.45 * u) + 0.12) * (opts.wear ? 0.7 + 0.3 * opts.wear() : 1);
      for (const s of [-1, 1]) {
        if (opts.wear && opts.wear() < 0.06) continue;
        // Each leaflet leaves the rachis angled toward the tip, then hangs in a soft curve, more
        // limply toward the frond's end, no two quite alike, narrowing to a point
        const h = Math.abs(Math.sin(k * 12.9898 + s * 78.233 + length * 3.1) * 43758.5453) % 1;
        const sag = 0.12 + 0.4 * u * u + (h - 0.5) * 0.15;
        // Leaflets stand out from the rachis nearly square to it, in a shallow V
        const side = nrm(crs(T, [0, 1, 0]));
        const lift = nrm(crs(side, T));
        const d1 = nrm(add(add(sc(T, 0.28 + (h - 0.5) * 0.2), sc(side, s)), sc(lift[1] < 0 ? sc(lift, -1) : lift, 0.38 - 0.2 * u)));
        const d2 = nrm(add(d1, [0, -0.55 * sag, 0]));
        const d3 = nrm(add(d2, [0, -1.4 * sag, 0]));
        const p1 = add(p, sc(d1, L * 0.36));
        const p2 = add(p1, sc(d2, L * 0.34));
        const p3 = add(p2, sc(d3, L * 0.3));
        const up = (dir: V3) => {
          const m = nrm(crs(dir, T));
          return m[1] < 0 ? sc(m, -1) : m;
        };
        const w = sc(T, width);
        b.card(mat, p, add(p, sc(w, 0.8)), add(p1, w), p1, up(d1), [0, 0, 1, 0.36]);
        b.card(mat, p1, add(p1, w), add(p2, sc(w, 0.85)), p2, up(d2), [0, 0.36, 1, 0.7]);
        b.card(mat, p2, add(p2, sc(w, 0.85)), add(p3, sc(w, 0.15)), p3, up(d3), [0, 0.7, 1, 1]);
      }
    }
  });
}

/**
 * A banana leaf. The midrib rises from the stalk and arches over, the blade's halves hang a
 * little down from it, and the wind has torn it into slits from the edge toward the rib, some
 * slits wide open, some strips folded down. Each strip is two cards so its outer edge curls.
 */
export function bananaLeaf(b: Builder, mat: Mat, base: V3, yaw: number, lift: number, length: number, r: () => number, opts: { tatter?: number; width?: number; hang?: number } = {}) {
  const tatter = opts.tatter ?? 0.5;
  const W = opts.width ?? 0.3;
  const hang = opts.hang ?? 0.75;
  const at = (u: number): V3 => [u * length * 0.92, lift * u * length - u * u * length * hang, 0];
  const width = (u: number) => W * Math.pow(Math.sin(Math.PI * Math.min(0.06 + u * 0.98, 1)), 0.55) * (1 - 0.25 * u);
  b.with({ at: base, yaw }, () => {
    // The midrib, thick at the base
    const spine: V3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= 8; i++) {
      spine.push(at(i / 8));
      radii.push(0.022 * (1 - i / 9));
    }
    b.sweep(mat, spine, radii, 3);
    const strips = 22;
    for (const s of [-1, 1]) {
      let u0 = 0.04;
      for (let i = 0; i < strips; i++) {
        const step = (0.96 / strips) * (0.7 + r() * 0.6);
        const u1 = Math.min(u0 + step, 1);
        const torn = r() < tatter;
        const shrink = torn ? 0.003 + r() * 0.01 : 0;
        const ua = u0;
        const ub = u1 - shrink;
        u0 = u1;
        if (ub <= ua) continue;
        const missing = torn && r() < 0.12;
        const reach = missing ? 0.25 + r() * 0.3 : 1;
        const fold = torn ? 0.15 + r() * 0.5 : 0.08;
        const pts = (u: number, k: number): V3 => {
          const a = at(u);
          const w = width(u) * reach * k;
          const T = nrm(sub(at(Math.min(u + 0.01, 1)), at(Math.max(u - 0.01, 0))));
          // across the blade, sloping down from the rib, more steeply further out
          const drop = w * (0.18 + fold * k) + (k > 0.6 ? (k - 0.6) * w * fold : 0);
          return add(add(a, [0, -drop, s * w]), sc(T, -k * w * 0.12));
        };
        // Four bands across: each strip arches gently, its outer edge curling under
        const K = [0, 0.3, 0.6, 0.82, 1];
        const up = (n: V3) => (n[1] * s < 0 ? sc(n, -1) : n);
        for (let j = 0; j < K.length - 1; j++) {
          const a0 = pts(ua, K[j]!), b0 = pts(ub, K[j]!);
          const a1 = pts(ua, K[j + 1]!), b1 = pts(ub, K[j + 1]!);
          // Lean each band's normal toward the rib so the light rolls across rather than steps
          const n = nrm(crs(sub(b0, a0), sub(a1, a0)));
          const roll = nrm(add(up(n), [0, 0.35, 0]));
          b.card(mat, a0, b0, b1, a1, roll, [0.5 + s * 0.5 * K[j]!, ua, 0.5 + s * 0.5 * K[j + 1]!, ub]);
        }
      }
    }
  });
}
