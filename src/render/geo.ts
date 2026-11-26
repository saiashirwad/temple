// CPU mesh building: flat-shaded quads, boxes, prisms and tubes gathered per material into
// glTF-like model data the mesh pool takes. Each vertex carries a surface pattern id for the
// shaders, so one model can mix laterite, tile, wood and brass.

import type { meshPool } from '@typegpu/kit';

export type V3 = [number, number, number];

export interface Mat {
  color: V3;
  roughness: number;
  metallic?: number;
  emission?: V3;
  pattern: number;
  doubleSided?: boolean;
}

/** Surface patterns, read by the kinds' material functions. */
export const P = {
  PLAIN: 0,
  LATERITE: 1,
  TILE: 2,
  COPPER: 3,
  WOOD: 4,
  PLASTER: 5,
  GRANITE: 6,
  BRASS: 7,
  FLAME: 8,
  GOLD: 9,
  CONCRETE: 11,
  PALM_BARK: 12,
  FROND: 13,
  LEAVES: 14,
  BARK: 15,
  SODIUM: 16,
  TUBE: 17,
  PAINT: 18,
  WATERSTONE: 19,
  CLOTH: 20,
  LILY: 21,
  FLOWER: 22,
  CROTON: 23,
  GRASS: 24,
  BANANA: 25,
  MTILE: 26,
  BULB: 27,
  SERIAL: 28,
  TV: 29,
  MURAL: 30,
  GLASS: 31,
  SIGN: 32,
  SODIUM_BAD: 33,
  TUBE_BAD: 34,
  CFL: 35,
  LACQUER: 36,
  TAIL: 37,
  HEAD: 38,
  STEEL: 39,
  TIN: 40,
  POSTER: 41,
  BOARD: 42,
  RIVER: 43,
  BROOK: 44,
} as const;

/**
 * Patterns drawn from a baked tile, whose roughness and metalness come from the tile
 * (surfaces.ts `defineBuilt`), so a Mat's own values for them are ignored and don't split
 * merged meshes. surfaces.ts checks its tile chain against this list.
 */
export const TEXTURED: ReadonlySet<number> = new Set<number>([
  P.LATERITE, P.WATERSTONE, P.PLASTER, P.PAINT, P.CONCRETE, P.GRANITE, P.MURAL, P.BRASS, P.GOLD, P.STEEL,
  P.CLOTH, P.TILE, P.MTILE, P.COPPER, P.TIN, P.WOOD, P.LACQUER, P.POSTER, P.BOARD,
]);

/** Untextured roughness in a merged builder, rounded to three levels so near values share a mesh. */
const roughLevel = (r: number) => (r < 0.4 ? 0.3 : r < 0.7 ? 0.6 : 0.9);

/** The poster atlas (tools/posters/make.ts): 4 across, 3 down. */
export const POSTER_ATLAS = { cols: 4, rows: 3, count: 12 } as const;
const POSTER_MAT: Mat = { color: [1, 1, 1], roughness: 0.7, pattern: P.POSTER, doubleSided: true };
const BOARD_MAT: Mat = { color: [1, 1, 1], roughness: 0.6, pattern: P.BOARD, doubleSided: true };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;

  return [a[0] / l, a[1] / l, a[2] / l];
};

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A transform: rotate about y by `yaw`, then translate. Enough for buildings and props. */
export interface Xf {
  at: V3;
  yaw: number;
}

export const ID: Xf = { at: [0, 0, 0], yaw: 0 };

export const xf = (at: V3, yaw = 0): Xf => ({ at, yaw });

const apply = (t: Xf, p: V3): V3 => {
  const c = Math.cos(t.yaw);
  const s = Math.sin(t.yaw);

  return [p[0] * c + p[2] * s + t.at[0], p[1] + t.at[1], -p[0] * s + p[2] * c + t.at[2]];
};

const turn = (t: Xf, n: V3): V3 => {
  const c = Math.cos(t.yaw);
  const s = Math.sin(t.yaw);

  return [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c];
};

class Part {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  pats: number[] = [];
  cols: number[] = [];
  indices: number[] = [];
  /** The colour of the material now adding to this part. */
  color: V3 = [1, 1, 1];
  /** Added to the pattern id, below a half: which flame or bulb this is, for its flicker. */
  seed = 0;
  constructor(readonly mat: Mat) {}
  vertex(p: V3, n: V3, uv: [number, number]) {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(uv[0], uv[1]);
    this.pats.push(this.mat.pattern + this.seed);
    this.cols.push(this.color[0], this.color[1], this.color[2], 1);

    return this.positions.length / 3 - 1;
  }
}

/**
 * What a walker can't pass through, recorded as shapes are built: a box turned about y, or an
 * upright cylinder from its base. World space, in the builder's frame at the time.
 */
/** `high` keeps a box however far above the ground it is: a bridge deck over a ravine. */
export type Solid = { kind: 'box'; c: V3; h: V3; yaw: number; high?: boolean } | { kind: 'cyl'; c: V3; r: number; h: number };

/** Patterns that are never solid: leaves, flames, cloth, light and water. */
const AIRY = new Set<number>([8, 13, 14, 17, 20, 24, 25, 27, 34]);

/** A model from public/models set in the world: where, which way, how big, what tint. */
export interface PropAt {
  name: string;
  at: V3;
  yaw: number;
  scale: V3;
  color?: V3;
}

export class Builder {
  private parts = new Map<Mat | string, Part>();
  private stack: Xf[] = [];
  t: Xf = ID;
  seed = 0;
  /** Models placed while building, drawn from their own files rather than these meshes. */
  readonly props: PropAt[] = [];
  /** What a walker bumps into, gathered from boxes, plinths, posts and lathed forms. */
  readonly solids: Solid[] = [];
  private passable = 0;

  /** Builds `fn`'s shapes as things to walk through or under: arches, hangings, thresholds. */
  open(fn: () => void) {
    this.passable++;

    try {
      fn();
    } finally {
      this.passable--;
    }
  }

  /** An unseen box the walker stands on or bumps into, from its centre and half sizes here. */
  block(c: V3, h: V3, high = false) {
    this.solids.push({ kind: 'box', c: apply(this.t, c), h: [h[0], h[1], h[2]], yaw: this.t.yaw, ...(high ? { high } : {}) });
  }

  private solidMat(mat: Mat) {
    if (this.passable > 0 || AIRY.has(mat.pattern)) return false;
    const e = mat.emission;

    return !(e && e[0] + e[1] + e[2] > 0.05);
  }

  private solidBox(mat: Mat, c: V3, h: V3) {
    // Small things (jars, finials, trims) a walker steps over or doesn't notice
    if (!this.solidMat(mat) || Math.max(h[0], h[2]) < 0.09 || (h[0] < 0.03 && h[2] < 0.03)) return;
    this.solids.push({ kind: 'box', c: apply(this.t, c), h: [h[0], h[1], h[2]], yaw: this.t.yaw });
  }

  private solidCyl(mat: Mat, c: V3, r: number, h: number) {
    if (!this.solidMat(mat) || r < 0.08 || h < 0.1) return;
    this.solids.push({ kind: 'cyl', c: apply(this.t, c), r, h });
  }

  /** Sets model `name` at `at` in the current transform, turned by `yaw`. */
  prop(name: string, at: V3, yaw = 0, scale: number | V3 = 1, color?: V3) {
    this.props.push({ name, at: apply(this.t, at), yaw: this.t.yaw + yaw, scale: typeof scale === 'number' ? [scale, scale, scale] : scale, ...(color ? { color } : {}) });
  }

  /**
   * With `merged`, materials differing only in colour share one mesh, the colour going per
   * vertex, so a model of many paints and goods stays a few meshes.
   */
  constructor(readonly merged = false) {}

  part(mat: Mat) {
    const tex = TEXTURED.has(mat.pattern);
    const rough = tex ? 0 : roughLevel(mat.roughness);
    const key = this.merged ? `${mat.pattern}|${tex ? '' : rough}|${tex ? '' : mat.metallic ?? 0}|${mat.emission?.join(',') ?? ''}|${mat.doubleSided ?? false}` : mat;
    let p = this.parts.get(key);

    if (!p) {
      // Merged, the part's material holds only what its key does (a tile's roughness and
      // metalness come from the tile), so mergeModels can join it with its twin in another model
      p = new Part(!this.merged ? mat : tex ? { ...mat, roughness: 0.5, metallic: 0 } : { ...mat, roughness: rough });
      this.parts.set(key, p);
    }

    p.seed = this.seed;
    p.color = this.merged ? mat.color : [1, 1, 1];

    return p;
  }

  /** Runs `fn` with every shape it adds carrying flicker seed `s`, from 0 up to 0.45. */
  seeded(s: number, fn: () => void) {
    const was = this.seed;
    this.seed = Math.min(Math.max(s, 0), 0.45);
    fn();
    this.seed = was;
  }

  /**
   * A hipped roof side by side, from the eave rectangle (half sizes `b`) at `y0` up to the ridge
   * rectangle `t` at `y1`, sagging by `sag` of its rise in the middle so it flares out at the
   * eaves the Kerala way. UVs are metres: u across the slope, v up it from the eave, so tiles
   * and copper sheets run in courses. `inward` faces the slopes into the rectangle instead, for
   * the courtyard side of a cloister roof.
   */
  roof(mat: Mat, c: V3, b: [number, number], t: [number, number], y0: number, y1: number, opts: { sag?: number; rows?: number; inward?: boolean; sides?: number[] } = {}) {
    const sag = opts.sag ?? 0.12;
    const rows = opts.rows ?? 6;
    const corners: [number, number][] = [[-1, 1], [1, 1], [1, -1], [-1, -1]];

    for (const side of opts.sides ?? [0, 1, 2, 3]) {
      const [ax, az] = corners[side]!;
      const [bx, bz] = corners[(side + 1) % 4]!;
      const out: V3 = [(ax + bx) / 2, 0, (az + bz) / 2];

      const at = (s: number, v: number): V3 => {
        const lerp = (u: number, k: 0 | 1) => {
          const h = k === 0 ? b : t;
          const x = (ax + (bx - ax) * u) * h[0];
          const z = (az + (bz - az) * u) * h[1];

          return [x, z] as const;
        };

        const p0 = lerp(s, 0);
        const p1 = lerp(s, 1);
        const y = y0 + (y1 - y0) * v - sag * (y1 - y0) * v * (1 - v) * 4 * 0.5;

        return [c[0] + p0[0] + (p1[0] - p0[0]) * v, y, c[2] + p0[1] + (p1[1] - p0[1]) * v];
      };

      const p = this.part(mat);
      const base = p.positions.length / 3;
      const cols = 2;
      const e = 1e-3;
      let slope = 0;
      const vs: number[] = [0];

      for (let j = 1; j <= rows; j++) {
        const q0 = at(0.5, (j - 1) / rows);
        const q1 = at(0.5, j / rows);
        slope += Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]);
        vs.push(slope);
      }

      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const width = Math.hypot(...sub(at(1, v), at(0, v)));

        for (let i = 0; i <= cols; i++) {
          const s = i / cols;
          const du = sub(at(Math.min(s + e, 1), v), at(Math.max(s - e, 0), v));
          const dv = sub(at(s, Math.min(v + e, 1)), at(s, Math.max(v - e, 0)));
          let n = norm(cross(du, dv));
          const want = opts.inward ? -1 : 1;

          if ((n[0] * out[0] + n[2] * out[2]) * want < 0) n = [-n[0], -n[1], -n[2]];

          if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
          p.vertex(apply(this.t, at(s, v)), turn(this.t, n), [(s - 0.5) * width, vs[j]!]);
        }
      }

      // Wind each triangle to face along its normal
      const P0 = at(0, 0);
      const P1 = at(1, 0);
      const P2 = at(0, 0.5);
      const f = cross(sub(P1, P0), sub(P2, P0));
      const flip = f[1] < 0;

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const a = base + j * (cols + 1) + i;
          const b2 = a + cols + 1;

          if (flip) p.indices.push(a, b2 + 1, a + 1, a, b2, b2 + 1);
          else p.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
        }
      }
    }
  }

  /** A round conical roof from radius `r0` at `y0` to `r1` at `y1`, flared like `roof`. */
  cone(mat: Mat, c: V3, r0: number, r1: number, y0: number, y1: number, opts: { sag?: number; rows?: number; sides?: number } = {}) {
    const sag = opts.sag ?? 0.12;
    const rows = opts.rows ?? 6;
    const sides = opts.sides ?? 40;
    const p = this.part(mat);
    const base = p.positions.length / 3;
    const prof = (v: number) => ({ r: r0 + (r1 - r0) * v, y: y0 + (y1 - y0) * v - sag * (y1 - y0) * v * (1 - v) * 2 });
    let slope = 0;

    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const g = prof(v);

      if (j > 0) {
        const q = prof((j - 1) / rows);
        slope += Math.hypot(g.r - q.r, g.y - q.y);
      }

      const a = prof(Math.max(v - 0.01, 0));
      const z = prof(Math.min(v + 0.01, 1));
      const tr = z.r - a.r;
      const ty = z.y - a.y;
      const l = Math.hypot(tr, ty) || 1;
      const nr = ty / l;
      const ny = -tr / l;

      for (let i = 0; i <= sides; i++) {
        const ang = (i / sides) * Math.PI * 2;
        const pos: V3 = [c[0] + Math.sin(ang) * g.r, g.y, c[2] + Math.cos(ang) * g.r];
        p.vertex(apply(this.t, pos), turn(this.t, norm([Math.sin(ang) * nr, ny, Math.cos(ang) * nr])), [ang * Math.max(g.r, 0.05), slope]);
      }
    }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < sides; i++) {
        const a = base + j * (sides + 1) + i;
        const b2 = a + sides + 1;
        p.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
      }
    }
  }

  /**
   * A teardrop oil flame standing at `p`, `h` tall, for the Flame kind: its uv x carries the
   * height in millimetres plus the builder's seed, uv y runs 0 at the wick to 1 at the tip.
   */
  flame(mat: Mat, p: V3, h: number) {
    const part = this.part(mat);
    // An oil-wick flame: a rounded base just clear of the wick, widest a quarter of the way up,
    // then a long taper to a fine tip
    // Small flames (most are 3-6 cm) get fewer rings and sides: 42 vertices rather than 81
    const w = h * 0.26;
    const small = h < 0.08;

    const prof: [number, number][] = small
      ? [[0, 0], [w * 0.7, h * 0.08], [w, h * 0.24], [w * 0.78, h * 0.48], [w * 0.36, h * 0.76], [0, h]]
      : [[0, 0], [w * 0.45, h * 0.04], [w * 0.85, h * 0.12], [w, h * 0.24], [w * 0.92, h * 0.38], [w * 0.7, h * 0.55], [w * 0.42, h * 0.72], [w * 0.18, h * 0.88], [0, h]];

    const sides = small ? 6 : 8;
    const base = part.positions.length / 3;
    const tag = Math.round(h * 1000) + this.seed;

    for (let j = 0; j < prof.length; j++) {
      const [r, y] = prof[j]!;
      const prev = prof[Math.max(j - 1, 0)]!;
      const next = prof[Math.min(j + 1, prof.length - 1)]!;
      const tr = next[0] - prev[0];
      const ty = next[1] - prev[1];
      const nl = Math.hypot(tr, ty) || 1;

      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const pos: V3 = [p[0] + Math.sin(a) * r, p[1] + y, p[2] + Math.cos(a) * r];
        part.vertex(apply(this.t, pos), turn(this.t, norm([(Math.sin(a) * ty) / nl, -tr / nl, (Math.cos(a) * ty) / nl])), [tag, y / h]);
      }
    }

    for (let j = 0; j < prof.length - 1; j++) {
      for (let i = 0; i < sides; i++) {
        const a = base + j * (sides + 1) + i;
        const b2 = a + sides + 1;
        part.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
      }
    }
  }


  /** Runs `fn` with every shape it adds placed by `t` inside the current transform. */
  with(t: Xf, fn: () => void) {
    this.stack.push(this.t);
    this.t = { at: apply(this.t, t.at), yaw: this.t.yaw + t.yaw };
    fn();
    this.t = this.stack.pop()!;
  }

  /**
   * A flat quad a→b→c→d. `out` hints which side faces out; the winding follows it.
   * UVs run 0..1 across unless `uvScale` gives metres per unit.
   */
  quad(mat: Mat, a: V3, b: V3, c: V3, dd: V3, out?: V3, uv?: [number, number, number, number], swap = false) {
    const p = this.part(mat);
    let A = apply(this.t, a);
    let B = apply(this.t, b);
    let C = apply(this.t, c);
    let D = apply(this.t, dd);
    let n = norm(cross(sub(B, A), sub(D, A)));

    if (out) {
      const o = turn(this.t, out);

      if (dot(n, o) < 0) {
        [B, D] = [D, B];
        n = [-n[0], -n[1], -n[2]];
      }
    }

    const [u0, v0, u1, v1] = uv ?? [0, 0, 1, 1];
    const at = (u: number, v: number): [number, number] => (swap ? [v, u] : [u, v]);
    const i = p.vertex(A, n, at(u0, v0));
    p.vertex(B, n, at(u1, v0));
    p.vertex(C, n, at(u1, v1));
    p.vertex(D, n, at(u0, v1));
    p.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /**
   * A flat quad a→b→c→d with UVs in metres, u along a→b and v along a→d, so tiles and sheets
   * on it run in courses. `out` picks the face side; the winding flips, the UVs stay.
   */
  plane(mat: Mat, a: V3, b: V3, c: V3, dd: V3, out: V3) {
    const p = this.part(mat);
    const A = apply(this.t, a);
    const B = apply(this.t, b);
    const C = apply(this.t, c);
    const D = apply(this.t, dd);
    let n = norm(cross(sub(B, A), sub(D, A)));
    const flip = dot(n, turn(this.t, out)) < 0;

    if (flip) n = [-n[0], -n[1], -n[2]];
    const ab = norm(sub(B, A));
    const ad = norm(sub(D, A));
    const uvOf = (q: V3): [number, number] => [dot(sub(q, A), ab), dot(sub(q, A), ad)];
    const i = p.vertex(A, n, uvOf(A));
    p.vertex(B, n, uvOf(B));
    p.vertex(C, n, uvOf(C));
    p.vertex(D, n, uvOf(D));

    if (flip) p.indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    else p.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A thin square bar from a to b, for rafters, struts, slats and rails. */
  bar(mat: Mat, a: V3, b: V3, r: number) {
    this.sweep(mat, [a, b], [r, r], 4);
  }

  tri(mat: Mat, a: V3, b: V3, c: V3, out?: V3) {
    const p = this.part(mat);
    let A = apply(this.t, a);
    let B = apply(this.t, b);
    const C = apply(this.t, c);
    let n = norm(cross(sub(B, A), sub(C, A)));

    if (out && dot(n, turn(this.t, out)) < 0) {
      [A, B] = [B, A];
      n = [-n[0], -n[1], -n[2]];
    }

    const i = p.vertex(A, n, [0, 0]);
    p.vertex(B, n, [1, 0]);
    p.vertex(C, n, [0.5, 1]);
    p.indices.push(i, i + 1, i + 2);
  }

  /** An axis-aligned box from its centre and half sizes. `skip` leaves faces out, e.g. 'y-'. */
  box(mat: Mat, c: V3, h: V3, skip = '') {
    this.solidBox(mat, c, h);
    const [x, y, z] = c;
    const [a, b, e] = h;
    const P = (sx: number, sy: number, sz: number): V3 => [x + sx * a, y + sy * b, z + sz * e];
    // v runs along the box's longest side, so wood grain follows a beam or a post
    const longest = a >= b && a >= e ? 'x' : b >= e ? 'y' : 'z';
    const sx = longest === 'x';
    const sz = longest === 'z';

    if (!skip.includes('y+')) this.quad(mat, P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), [0, 1, 0], [0, 0, a * 2, e * 2], sx);

    if (!skip.includes('y-')) this.quad(mat, P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), [0, -1, 0], [0, 0, a * 2, e * 2], sx);

    if (!skip.includes('x+')) this.quad(mat, P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), [1, 0, 0], [0, 0, e * 2, b * 2], sz);

    if (!skip.includes('x-')) this.quad(mat, P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), [-1, 0, 0], [0, 0, e * 2, b * 2], sz);

    if (!skip.includes('z+')) this.quad(mat, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [0, 0, 1], [0, 0, a * 2, b * 2], sx);

    if (!skip.includes('z-')) this.quad(mat, P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), [0, 0, -1], [0, 0, a * 2, b * 2], sx);
  }

  /**
   * The sides of a rectangular frustum between a bottom rectangle (half sizes `b`) at `y0` and a
   * top one (`t`) at `y1`, centred on x,z. Roofs, plinths and tapering towers.
   */
  frustum(mat: Mat, c: V3, b: [number, number], t: [number, number], y0: number, y1: number, caps = '', hint: [number, number] = [1, 0.6]) {
    const [x, , z] = c;

    if (y1 > y0) this.solidBox(mat, [x, (y0 + y1) / 2, z], [(b[0] + t[0]) / 2, (y1 - y0) / 2, (b[1] + t[1]) / 2]);
    const B = (sx: number, sz: number): V3 => [x + sx * b[0], y0, z + sz * b[1]];
    const T = (sx: number, sz: number): V3 => [x + sx * t[0], y1, z + sz * t[1]];
    const slope = Math.hypot(y1 - y0, Math.max(b[0] - t[0], b[1] - t[1]));

    const sides: [number, number, number, number, V3][] = [
      [-1, 1, 1, 1, [0, 0, 1]],
      [1, 1, 1, -1, [1, 0, 0]],
      [1, -1, -1, -1, [0, 0, -1]],
      [-1, -1, -1, 1, [-1, 0, 0]],
    ];

    for (const [ax, az, bx, bz, out] of sides) {
      const len = Math.hypot((bx - ax) * b[0], (bz - az) * b[1]);
      this.quad(mat, B(ax, az), B(bx, bz), T(bx, bz), T(ax, az), [out[0] * hint[0], hint[1], out[2] * hint[0]], [0, 0, len, slope]);
    }

    if (caps.includes('top') && t[0] > 0) this.quad(mat, T(-1, -1), T(1, -1), T(1, 1), T(-1, 1), [0, 1, 0], [0, 0, t[0] * 2, t[1] * 2]);

    if (caps.includes('bottom')) this.quad(mat, B(-1, -1), B(1, -1), B(1, 1), B(-1, 1), [0, -1, 0]);
  }

  /** A round (or n-sided) tapered tube along y with an optional lean and cap. */
  tube(
    mat: Mat,
    c: V3,
    r0: number,
    r1: number,
    h: number,
    sides = 12,
    opts: { cap?: boolean; bottom?: boolean; smooth?: boolean; rings?: number; lean?: (v: number) => [number, number]; radius?: (v: number) => number } = {},
  ) {
    if (!opts.lean) this.solidCyl(mat, c, Math.max(r0, r1) * 0.95, h);
    const p = this.part(mat);
    const rings = opts.rings ?? 1;
    const smooth = opts.smooth ?? true;
    const base = p.positions.length / 3;

    const ring = (v: number) => {
      const r = opts.radius ? opts.radius(v) : r0 + (r1 - r0) * v;
      const [lx, lz] = opts.lean ? opts.lean(v) : [0, 0];

      return { r, cx: c[0] + lx, cz: c[2] + lz, y: c[1] + h * v };
    };

    if (smooth) {
      for (let j = 0; j <= rings; j++) {
        const v = j / rings;
        const g = ring(v);
        const slope = (r0 - r1) / h;

        for (let i = 0; i <= sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          const pos: V3 = [g.cx + Math.sin(a) * g.r, g.y, g.cz + Math.cos(a) * g.r];
          const n = norm([Math.sin(a), slope, Math.cos(a)]);
          p.vertex(apply(this.t, pos), turn(this.t, n), [i / sides, v * h]);
        }
      }

      for (let j = 0; j < rings; j++) {
        for (let i = 0; i < sides; i++) {
          const a = base + j * (sides + 1) + i;
          const b2 = a + sides + 1;
          p.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
        }
      }
    } else {
      for (let j = 0; j < rings; j++) {
        const g0 = ring(j / rings);
        const g1 = ring((j + 1) / rings);

        for (let i = 0; i < sides; i++) {
          const a0 = (i / sides) * Math.PI * 2;
          const a1 = ((i + 1) / sides) * Math.PI * 2;
          const am = (a0 + a1) / 2;
          this.quad(
            mat,
            [g0.cx + Math.sin(a0) * g0.r, g0.y, g0.cz + Math.cos(a0) * g0.r],
            [g0.cx + Math.sin(a1) * g0.r, g0.y, g0.cz + Math.cos(a1) * g0.r],
            [g1.cx + Math.sin(a1) * g1.r, g1.y, g1.cz + Math.cos(a1) * g1.r],
            [g1.cx + Math.sin(a0) * g1.r, g1.y, g1.cz + Math.cos(a0) * g1.r],
            [Math.sin(am), 0, Math.cos(am)],
          );
        }
      }
    }

    if (opts.cap) {
      const g = ring(1);
      this.disc(mat, [g.cx, g.y, g.cz], g.r, sides, 1);
    }

    if (opts.bottom) {
      const g = ring(0);
      this.disc(mat, [g.cx, g.y, g.cz], g.r, sides, -1);
    }
  }

  disc(mat: Mat, c: V3, r: number, sides: number, up: 1 | -1) {
    const p = this.part(mat);
    const n = turn(this.t, [0, up, 0]);
    const mid = p.vertex(apply(this.t, c), n, [0.5, 0.5]);

    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      p.vertex(apply(this.t, [c[0] + Math.sin(a) * r, c[1], c[2] + Math.cos(a) * r]), n, [0.5 + Math.sin(a) * 0.5, 0.5 + Math.cos(a) * 0.5]);
    }

    for (let i = 0; i < sides; i++) {
      if (up > 0) p.indices.push(mid, mid + 1 + i, mid + 2 + i);
      else p.indices.push(mid, mid + 2 + i, mid + 1 + i);
    }
  }

  /** A lathe: a profile of [radius, height] points spun around y. Smooth-shaded. */
  lathe(mat: Mat, c: V3, profile: [number, number][], sides = 16) {
    {
      let r = 0;
      let lo = Infinity;
      let hi = -Infinity;

      for (const [pr, py] of profile) {
        r = Math.max(r, pr);
        lo = Math.min(lo, py);
        hi = Math.max(hi, py);
      }

      this.solidCyl(mat, [c[0], c[1] + lo, c[2]], r * 0.92, hi - lo);
    }

    const p = this.part(mat);
    const base = p.positions.length / 3;
    const n = profile.length;

    for (let j = 0; j < n; j++) {
      const [r, y] = profile[j]!;
      const prev = profile[Math.max(j - 1, 0)]!;
      const next = profile[Math.min(j + 1, n - 1)]!;
      // Profile tangent → outward normal in the (r, y) plane
      const tr = next[0] - prev[0];
      const ty = next[1] - prev[1];
      const nl = Math.hypot(tr, ty) || 1;
      const nr = ty / nl;
      const ny = -tr / nl;

      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const pos: V3 = [c[0] + Math.sin(a) * r, c[1] + y, c[2] + Math.cos(a) * r];
        p.vertex(apply(this.t, pos), turn(this.t, norm([Math.sin(a) * nr, ny, Math.cos(a) * nr])), [i / sides, j / (n - 1)]);
      }
    }

    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < sides; i++) {
        const a = base + j * (sides + 1) + i;
        const b2 = a + sides + 1;
        p.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
      }
    }
  }

  /** A raw grid surface from a function of (u, v), smooth normals by finite differences. */
  surface(mat: Mat, cols: number, rows: number, at: (u: number, v: number) => V3, flip = false) {
    const p = this.part(mat);
    const base = p.positions.length / 3;
    const e = 1e-3;

    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const v = j / rows;
        const du = sub(at(Math.min(u + e, 1), v), at(Math.max(u - e, 0), v));
        const dv = sub(at(u, Math.min(v + e, 1)), at(u, Math.max(v - e, 0)));
        let n = norm(cross(du, dv));

        if (flip) n = [-n[0], -n[1], -n[2]];
        p.vertex(apply(this.t, at(u, v)), turn(this.t, n), [u, v]);
      }
    }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i;
        const b2 = a + cols + 1;

        if (flip) p.indices.push(a, b2 + 1, a + 1, a, b2, b2 + 1);
        else p.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
      }
    }
  }

  /** A small low-poly blob (octahedron-ish sphere) for flames, fruit and finials. */
  blob(mat: Mat, c: V3, r: [number, number, number], seg = 6, rings = 4, bump = 0) {
    const p = this.part(mat);
    const base = p.positions.length / 3;

    for (let j = 0; j <= rings; j++) {
      const th = (j / rings) * Math.PI;

      for (let i = 0; i <= seg; i++) {
        const ph = (i / seg) * Math.PI * 2;
        const n: V3 = [Math.sin(th) * Math.sin(ph), -Math.cos(th), Math.sin(th) * Math.cos(ph)];

        // Lumps: a few crossed waves pushed along the normal, so crowns read as clumps of leaves
        const k = bump
          ? 1 + bump * (Math.sin(n[0] * 5.1 + c[0]) * Math.sin(n[1] * 4.3 + c[2]) * 0.6 + Math.sin(n[2] * 7.7 + n[0] * 3.1 + c[1]) * 0.4) * Math.sin(th)
          : 1;

        const q: V3 = [c[0] + n[0] * r[0] * k, c[1] + n[1] * r[1] * k, c[2] + n[2] * r[2] * k];
        p.vertex(apply(this.t, q), turn(this.t, norm([n[0] / r[0], n[1] / r[1], n[2] / r[2]])), [i / seg, j / rings]);
      }
    }

    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i;
        const b2 = a + seg + 1;
        p.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
      }
    }
  }

  /** A four-cornered card a→b→c→d with one given normal, for leaves: lit as their crown is. */
  card(mat: Mat, a: V3, b: V3, c: V3, dd: V3, n: V3, uv: [number, number, number, number] = [0, 0, 1, 1]) {
    const p = this.part(mat);
    const N = turn(this.t, n);
    const i = p.vertex(apply(this.t, a), N, [uv[0], uv[1]]);
    p.vertex(apply(this.t, b), N, [uv[2], uv[1]]);
    p.vertex(apply(this.t, c), N, [uv[2], uv[3]]);
    p.vertex(apply(this.t, dd), N, [uv[0], uv[3]]);
    p.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /**
   * An oval leaf blade from `base` along `along`, facing `n`: rounded at the shoulders, pointed at
   * the tip, folded along its midrib and curling back a little toward the tip. u runs across
   * (0.5 at the midrib), v along.
   */
  blade(mat: Mat, base: V3, along: V3, n: V3, length: number, width: number, fold = 0.25, curl = 0.12) {
    const p = this.part(mat);
    const side = norm(cross(along, n));
    const first = p.positions.length / 3;
    const STEPS = 5;

    for (let j = 0; j <= STEPS; j++) {
      const t = j / STEPS;
      // Widest a little below the middle, a blunt base and a drawn-out tip
      const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);

      const m: V3 = [
        base[0] + along[0] * length * t - n[0] * curl * length * t * t,
        base[1] + along[1] * length * t - n[1] * curl * length * t * t,
        base[2] + along[2] * length * t - n[2] * curl * length * t * t,
      ];

      // Bending back, the facing tips toward the leaf's own direction near the end
      const bend = norm([n[0] + along[0] * curl * 2 * t, n[1] + along[1] * curl * 2 * t, n[2] + along[2] * curl * 2 * t]);

      for (const s of [-1, 0, 1]) {
        const at: V3 = [m[0] + side[0] * w * s - bend[0] * fold * w * Math.abs(s), m[1] + side[1] * w * s - bend[1] * fold * w * Math.abs(s), m[2] + side[2] * w * s - bend[2] * fold * w * Math.abs(s)];
        const nn = norm([bend[0] + side[0] * s * fold, bend[1] + side[1] * s * fold, bend[2] + side[2] * s * fold]);
        p.vertex(apply(this.t, at), turn(this.t, nn), [0.5 + s * 0.5, t]);
      }
    }

    for (let j = 0; j < STEPS; j++) {
      const a = first + j * 3;
      const c = a + 3;
      p.indices.push(a, a + 1, c + 1, a, c + 1, c, a + 1, a + 2, c + 2, a + 1, c + 2, c + 1);
    }
  }

  /**
   * A poster pasted flat on a wall: centred at `at`, facing `n` (level), `w` by `h` metres, the
   * atlas's poster `which`, a little skewed the way they're slapped up.
   */
  poster(at: V3, n: V3, w: number, h: number, which: number, skew = 0) {
    const { cols, rows, count } = POSTER_ATLAS;
    const k = ((Math.floor(which) % count) + count) % count;
    const right = norm(cross([0, 1, 0], n));
    const c = Math.cos(skew);
    const s = Math.sin(skew);
    const R: V3 = [right[0] * c, s, right[2] * c];
    const U: V3 = [-right[0] * s, c, -right[2] * s];
    const corner = (x: number, y: number): V3 => [at[0] + R[0] * x * w / 2 + U[0] * y * h / 2, at[1] + R[1] * x * w / 2 + U[1] * y * h / 2, at[2] + R[2] * x * w / 2 + U[2] * y * h / 2];
    const inset = 3 / 1024;
    const x0 = (k % cols) / cols + inset;
    const x1 = (k % cols + 1) / cols - inset;
    const y0 = Math.floor(k / cols) / rows + inset;
    const y1 = (Math.floor(k / cols) + 1) / rows - inset;
    this.card(POSTER_MAT, corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1), n, [x0, -y0, x1, -y1]);
  }

  /** A painted sign from the signs atlas (tools/posters/signs.ts, 4 by 4), facing `n`. */
  board(at: V3, n: V3, w: number, h: number, which: number) {
    const right = norm(cross([0, 1, 0], n));
    const corner = (x: number, y: number): V3 => [at[0] + right[0] * x * w / 2, at[1] + y * h / 2, at[2] + right[2] * x * w / 2];
    const inset = 2 / 1024;
    const x0 = (which % 4) / 4 + inset;
    const x1 = (which % 4 + 1) / 4 - inset;
    const y0 = Math.floor(which / 4) / 4 + inset;
    const y1 = (Math.floor(which / 4) + 1) / 4 - inset;
    this.card(BOARD_MAT, corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1), n, [x0, -y0, x1, -y1]);
  }

  /** A tube swept along a polyline, its radius given per point: branches, roots and stems. */
  sweep(mat: Mat, pts: V3[], radii: number[], sides = 6) {
    const p = this.part(mat);
    const base = p.positions.length / 3;
    const n = pts.length;
    let prev: V3 | null = null;
    let run = 0;

    for (let j = 0; j < n; j++) {
      const t = norm(sub(pts[Math.min(j + 1, n - 1)]!, pts[Math.max(j - 1, 0)]!));
      let N: V3;

      if (!prev) N = norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      else {
        const k = dot(prev, t);
        N = norm([prev[0] - t[0] * k, prev[1] - t[1] * k, prev[2] - t[2] * k]);
      }

      prev = N;
      const B = cross(t, N);

      if (j > 0) run += Math.hypot(...sub(pts[j]!, pts[j - 1]!));
      const r = radii[j]!;

      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const dir: V3 = [N[0] * Math.cos(a) + B[0] * Math.sin(a), N[1] * Math.cos(a) + B[1] * Math.sin(a), N[2] * Math.cos(a) + B[2] * Math.sin(a)];
        const q = pts[j]!;
        p.vertex(apply(this.t, [q[0] + dir[0] * r, q[1] + dir[1] * r, q[2] + dir[2] * r]), turn(this.t, dir), [i / sides, run]);
      }
    }

    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < sides; i++) {
        const a = base + j * (sides + 1) + i;
        const b2 = a + sides + 1;
        p.indices.push(a, a + 1, b2 + 1, a, b2 + 1, b2);
      }
    }
  }

  get vertexCount() {
    let n = 0;

    for (const p of this.parts.values()) n += p.positions.length / 3;

    return n;
  }

  /** The model for the mesh pool, one mesh per material. */
  model(): meshPool.ModelData<{ pat: import('typegpu').d.F32; col: import('typegpu').d.Vec4f }> {
    const out = [];

    for (const p of this.parts.values()) {
      if (p.indices.length === 0) continue;
      const m = p.mat;
      out.push({
        positions: new Float32Array(p.positions),
        normals: new Float32Array(p.normals),
        uvs: new Float32Array(p.uvs),
        indices: new Uint32Array(p.indices),
        extra: { pat: new Float32Array(p.pats), col: new Float32Array(p.cols) },
        material: {
          color: (this.merged ? [1, 1, 1, 1] : [m.color[0], m.color[1], m.color[2], 1]) as [number, number, number, number],
          roughness: m.roughness,
          metallic: m.metallic ?? 0,
          emission: m.emission ?? ([0, 0, 0] as V3),
          textures: {},
          doubleSided: m.doubleSided ?? false,
        },
      });
    }

    return { meshes: out, images: [] };
  }
}

type BuiltModel = meshPool.ModelData<{ pat: import('typegpu').d.F32; col: import('typegpu').d.Vec4f }>;

/**
 * Several built models as one, meshes of the same material joined (in merged builders the
 * colour is per vertex, so same-material meshes draw alike): fewer pool slots and draws.
 */
export function mergeModels(models: BuiltModel[]): BuiltModel {
  type Mesh = BuiltModel['meshes'][number];

  const groups = new Map<string, Mesh[]>();

  for (const model of models) {
    // Built models carry no images, so material texture indices can't clash
    if (model.images.length > 0) throw new Error('mergeModels: models with images');

    for (const mesh of model.meshes) {
      const key = JSON.stringify(mesh.material);
      const g = groups.get(key);

      if (g) g.push(mesh);
      else groups.set(key, [mesh]);
    }
  }

  const meshes: Mesh[] = [];

  for (const g of groups.values()) {
    if (g.length === 1) {
      meshes.push(g[0]!);
      continue;
    }

    let nv = 0;
    let ni = 0;

    for (const m of g) {
      nv += m.positions.length / 3;
      ni += m.indices.length;
    }

    const positions = new Float32Array(nv * 3);
    const normals = new Float32Array(nv * 3);
    const uvs = new Float32Array(nv * 2);
    const pat = new Float32Array(nv);
    const col = new Float32Array(nv * 4);
    const indices = new Uint32Array(ni);
    let v = 0;
    let i = 0;

    for (const m of g) {
      const n = m.positions.length / 3;
      positions.set(m.positions, v * 3);
      normals.set(m.normals, v * 3);
      uvs.set(m.uvs, v * 2);

      if (m.extra?.pat) pat.set(m.extra.pat, v);

      if (m.extra?.col) col.set(m.extra.col, v * 4);
      const src = m.indices;

      for (let k = 0; k < src.length; k++) indices[i + k] = src[k]! + v;
      v += n;
      i += src.length;
    }

    meshes.push({ positions, normals, uvs, indices, extra: { pat, col }, material: g[0]!.material });
  }

  return { meshes, images: [] };
}

/** sRGB hex to linear colour. */
export function hex(h: number, k = 1): V3 {
  const c = (v: number) => {
    const s = v / 255;

    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  return [c((h >> 16) & 255) * k, c((h >> 8) & 255) * k, c(h & 255) * k];
}

export { rng } from '../math/random.ts';
