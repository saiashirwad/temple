// Kerala clothes for the Rocketbox townsfolk, built onto each avatar in its own bind pose: a mundu,
// lungi, sari skirt or nightie as a tube skinned to the hips and legs; a sari's pallu or a man's
// thorthu laid over the left shoulder as a strip that follows the body's surface; a white
// thoppi; a string of jasmine at the back of the head. Their cloth is drawn into one small atlas,
// and the scan's own clothes are repainted beneath to match, so a knee pushing through a mundu
// shows mundu.
//
// Bind space is Z up, the figure facing -Y, its left side at +X.

import type { Document, Primitive } from '@gltf-transform/core';

export type Skirt = { kind: 'mundu' | 'lungi' | 'sari' | 'nightie'; color: number; border?: number; check?: number; folded?: boolean };

export type Top = { kind: 'bare' | 'shirt' | 'half' | 'banian' | 'blouse' | 'nightie'; color: number; check?: number; floral?: number };

export interface Outfit {
  top: Top;
  skirt: Skirt;
  pallu?: { color: number; border: number };
  thorthu?: number;
  cap?: boolean;
  jasmine?: boolean;
  barefoot?: boolean;
  /** Something carried in one hand. */
  carry?: { kind: 'umbrella' | 'bag' | 'tiffin' | 'basket' | 'torch'; side: 'L' | 'R'; color?: number };
}

/** A solid-coloured part of a carried thing, drawn with a material of its own. */
export interface Part {
  geo: Geo;
  color: number;
  metal: number;
  rough: number;
}

type V3 = [number, number, number];

const rgb = (c: number): V3 => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(...a) || 1));
const lerp3 = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));

  return t * t * (3 - 2 * t);
};

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;

  return s - Math.floor(s);
};

/** Geometry for a new primitive, skinned to joints by name. */
class Geo {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  joints: number[] = [];
  weights: number[] = [];
  idx: number[] = [];
  constructor(private jointOf: (name: string) => number) {}
  vertex(p: V3, n: V3, uv: [number, number], w: [string, number][]) {
    const top = w.filter((x) => x[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, x) => s + x[1], 0) || 1;

    for (let k = 0; k < 4; k++) {
      this.joints.push(top[k] ? this.jointOf(top[k]![0]) : 0);
      this.weights.push(top[k] ? top[k]![1] / sum : 0);
    }

    this.pos.push(...p);
    this.nrm.push(...n);
    this.uv.push(...uv);

    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }
}

export interface Body {
  /** Every vertex of the body, head and hair, in bind space. */
  points: Float32Array;
  /** The body's own points, without head or hair, for what lies over the torso. */
  torso: Float32Array;
  head: Float32Array;
  joint: (name: string) => V3;
  jointIndex: (name: string) => number;
}

/** How far the body reaches from `from` along `dir`, among the points within a narrow cone. */
function reach(points: Float32Array, from: V3, dir: V3, cone = 0.985, most = 9) {
  let best = 0;
  let near = 0;

  for (let i = 0; i < points.length; i += 3) {
    const v: V3 = [points[i]! - from[0], points[i + 1]! - from[1], points[i + 2]! - from[2]];
    const l = Math.hypot(...v);

    if (l < 1e-4 || l > most) continue;
    const c = dot(v, dir) / l;

    if (c > cone && l > best) best = l;

    if (c > 0.9 && l > near) near = l * c;
  }

  return best || near;
}

/** The body's reach in a horizontal slice, from the centre, toward angle `a` (0 = +X). */
function sliceReach(points: Float32Array, z: number, c: [number, number], a: number, band = 0.025) {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let best = 0.04;

  for (let i = 0; i < points.length; i += 3) {
    const x = points[i]!;

    if (Math.abs(points[i + 2]! - z) > band || Math.abs(x) > 0.3) continue;
    best = Math.max(best, (x - c[0]) * dx + (points[i + 1]! - c[1]) * dy);
  }

  return best;
}

// ---- the atlas: skirt cloth on the left half, the drape top right, cap and jasmine below it
export const ATLAS = 512;

const R = {
  skirt: { u0: 0.01, u1: 0.49, v0: 0.01, v1: 0.99 },
  drape: { u0: 0.51, u1: 0.99, v0: 0.01, v1: 0.74 },
  cap: { u0: 0.52, u1: 0.73, v0: 0.77, v1: 0.98 },
  flower: { u0: 0.77, u1: 0.98, v0: 0.77, v1: 0.98 },
};

const inR = (r: typeof R.skirt, u: number, v: number): [number, number] => [r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v];

/** Weave grain, light and fine. */
const weave = (x: number, y: number) => 0.93 + 0.07 * ((x + y) % 2) + (hash(x, y) - 0.5) * 0.08;

export function paintAtlas(o: Outfit): Buffer {
  const px = Buffer.alloc(ATLAS * ATLAS * 3);

  const put = (x: number, y: number, c: V3) => {
    const i = (y * ATLAS + x) * 3;
    px[i] = Math.round(255 * Math.min(1, Math.max(0, c[0])));
    px[i + 1] = Math.round(255 * Math.min(1, Math.max(0, c[1])));
    px[i + 2] = Math.round(255 * Math.min(1, Math.max(0, c[2])));
  };

  const s = o.skirt;
  const base = rgb(s.color);
  const border = s.border !== undefined ? rgb(s.border) : null;

  for (let y = 0; y < ATLAS; y++) {
    for (let x = 0; x < ATLAS; x++) {
      const u = x / ATLAS;
      const v = y / ATLAS;
      const w = weave(x, y);
      let c: V3 = base;

      if (u < 0.5) {
        // The skirt: v runs from the waist (0) to the hem (1), u around it
        const t = (v - R.skirt.v0) / (R.skirt.v1 - R.skirt.v0);
        const a = (u - R.skirt.u0) / (R.skirt.u1 - R.skirt.u0);

        if (s.check !== undefined) {
          const ch = rgb(s.check);
          const sx = Math.floor(a * 40) % 2;
          const sy = Math.floor(t * 46) % 2;
          c = sx && sy ? ch : sx || sy ? lerp3(base, ch, 0.5) : base;

          if (Math.floor(a * 160) % 8 === 0) c = mul(c, 0.8);
        }

        if (s.kind === 'nightie' && o.top.floral !== undefined) {
          const f = hash(Math.floor(a * 26), Math.floor(t * 34));
          const fx = (a * 26) % 1;
          const fy = (t * 34) % 1;

          if (f > 0.45 && Math.hypot(fx - 0.5, fy - 0.5) < 0.22) c = rgb(o.top.floral);
        }

        if (border) {
          // The kasavu: a broad gold band above the hem, fine lines over it
          const b = 1 - t;

          if (b > 0.015 && b < 0.07) c = border;
          else if (Math.abs(b - 0.085) < 0.005 || Math.abs(b - 0.1) < 0.003) c = border;

          // and along the front edge where it folds, for the mundu
          if (s.kind === 'mundu' && a > 0.47 && a < 0.53) c = border;
        }

        // A darker fold where the waist is tucked
        if (t < 0.04) c = mul(c, 0.82);
      } else if (v < 0.75) {
        // The drape: long along v, its edges along u
        const a = (u - R.drape.u0) / (R.drape.u1 - R.drape.u0);
        const t = (v - R.drape.v0) / (R.drape.v1 - R.drape.v0);

        if (o.pallu) {
          c = rgb(o.pallu.color);
          const e = Math.min(a, 1 - a);

          if (e < 0.09 && e > 0.015) c = rgb(o.pallu.border);

          // The pallu's end is worked heavy with gold
          if (t > 0.8 && Math.floor(t * 60) % 3 !== 0) c = lerp3(c, rgb(o.pallu.border), 0.8);
        } else if (o.thorthu !== undefined) {
          c = rgb(o.thorthu);

          if (t > 0.9 && Math.floor(a * 30) % 2) c = mul(c, 0.85);

          if (Math.abs(t - 0.86) < 0.012) c = [0.75, 0.35, 0.25];
        }
      } else if (u < 0.75) {
        // The cap's crochet: white, its rounds of holes faintly dark
        const k = Math.sin(x * 0.9) * Math.sin(y * 0.9);
        c = mul([0.93, 0.92, 0.88], 0.9 + 0.1 * k);
      } else {
        // Jasmine: white petals, a touch of green at the heart
        const k = hash(Math.floor(x / 6), Math.floor(y / 6));
        c = k > 0.85 ? [0.7, 0.8, 0.55] : [0.97, 0.96, 0.9];
      }

      put(x, y, mul(c, w));
    }
  }

  return px;
}

// ---- the clothes' geometry
export function buildGarments(body: Body, o: Outfit, female: boolean) {
  const g = new Geo(body.jointIndex);
  const P = body.points;
  const pelvis = body.joint('Bip01 Pelvis');
  const knee = body.joint('Bip01 L Calf');
  const head = body.joint('Bip01 Head');
  // The torso's middle, front to back, at the hips
  let y0 = 9;
  let y1 = -9;

  for (let i = 0; i < P.length; i += 3) {
    if (Math.abs(P[i + 2]! - pelvis[2]) < 0.03 && Math.abs(P[i]!) < 0.25) {
      y0 = Math.min(y0, P[i + 1]!);
      y1 = Math.max(y1, P[i + 1]!);
    }
  }

  const cy = (y0 + y1) / 2;
  const centre: [number, number] = [0, cy];

  // The skirt: rings from the waist to the hem
  const s = o.skirt;
  const waist = s.kind === 'nightie' ? pelvis[2] + 0.12 : pelvis[2] + (female ? 0.07 : 0.1);
  const hem = s.folded ? knee[2] + 0.03 : 0.06;
  const RINGS = 22;
  const SEG = 36;
  const flare = s.kind === 'sari' ? 0.1 : s.kind === 'nightie' ? 0.13 : 0.05;
  let prev: number[] | null = null;
  const ringStart: number[] = [];

  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS;
    const z = waist + (hem - waist) * t;
    const r: number[] = [];

    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      const zs = Math.max(z, 0.3);
      let rr = Math.max(sliceReach(P, zs, centre, a), sliceReach(P, zs + 0.04, centre, a)) + 0.02 + (waist - zs) * flare;

      // Hanging straight from the hips: never tighter than just above
      if (prev) rr = z < 0.3 ? prev[j]! : Math.max(rr, prev[j]! * 0.985);

      // A sari's pleats, gathered at the front
      if (s.kind === 'sari' && t > 0.15) {
        const front = Math.max(0, -Math.sin(a));
        rr += 0.012 * Math.sin(a * 22) * front * front * t;
      }

      r.push(rr);
    }

    prev = r;
    ringStart.push(g.pos.length / 3);
    // Weights: the hips at the waist, the legs below, each side to its own leg
    const tk = (waist - z) / (waist - knee[2]);
    const hip = Math.max(0.22, 1 - smooth(0.05, 0.5, tk));
    const calf = smooth(0.85, 1.25, tk);

    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      const rr = r[j % SEG]!;
      const p: V3 = [centre[0] + Math.cos(a) * rr, centre[1] + Math.sin(a) * rr, z];
      const side = smooth(-0.6, 0.6, Math.cos(a));
      const leg = 1 - hip;
      g.vertex(p, [Math.cos(a), Math.sin(a), 0.05], inR(R.skirt, j / SEG, t), [
        ['Bip01 Pelvis', hip],
        ['Bip01 L Thigh', leg * side * (1 - calf)],
        ['Bip01 R Thigh', leg * (1 - side) * (1 - calf)],
        ['Bip01 L Calf', leg * side * calf],
        ['Bip01 R Calf', leg * (1 - side) * calf],
      ]);
    }
  }

  for (let k = 0; k < RINGS; k++) {
    for (let j = 0; j < SEG; j++) {
      const a = ringStart[k]! + j;
      const b = ringStart[k + 1]! + j;
      g.quad(a, b, b + 1, a + 1);
    }
  }

  // A strip over the body's surface, along keys of where it lies and how it is turned
  const spine: [string, number][] = [
    ['Bip01 Pelvis', pelvis[2]],
    ['Bip01 Spine', body.joint('Bip01 Spine')[2]],
    ['Bip01 Spine1', body.joint('Bip01 Spine1')[2]],
    ['Bip01 Spine2', body.joint('Bip01 Spine2')[2]],
    ['Bip01 Neck', body.joint('Bip01 Neck')[2]],
  ];

  const along = (p: V3): [string, number][] => {
    const z = p[2];
    let w: [string, number][] = [[spine[0]![0], 1]];

    for (let i = 0; i < spine.length - 1; i++) {
      const [a, za] = spine[i]!;
      const [b, zb] = spine[i + 1]!;

      if (z >= za && z <= zb) {
        const t = (z - za) / (zb - za);
        w = [[a, 1 - t], [b, t]];
      }
    }

    if (z > spine.at(-1)![1]) w = [[spine.at(-1)![0], 1]];

    if (z < pelvis[2]) w = [['Bip01 Pelvis', 0.7], ['Bip01 L Thigh', 0.15], ['Bip01 R Thigh', 0.15]];
    // Over the left shoulder, partly carried by the collarbone
    const sh = smooth(1.3, 1.42, z) * smooth(0.05, 0.11, p[0]);

    if (sh > 0) w = [...w.map(([n, x]): [string, number] => [n, x * (1 - sh * 0.6)]), ['Bip01 L Clavicle', sh * 0.6]];

    return w;
  };

  type Key = { from: V3; dir: V3; width: number; lift?: number };

  const strip = (keys: Key[], steps: number) => {
    const lerpKey = (t: number) => {
      const f = t * (keys.length - 1);
      const i = Math.min(keys.length - 2, Math.floor(f));
      const u = f - i;
      const a = keys[i]!;
      const b = keys[i + 1]!;

      return { from: lerp3(a.from, b.from, u), dir: norm(lerp3(a.dir, b.dir, u)), width: a.width + (b.width - a.width) * u, lift: (a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * u };
    };

    const onBody = (from: V3, dir: V3, lift: number) => add(from, mul(dir, reach(body.torso, from, dir, 0.97, 0.32) + 0.018 + lift));
    const mid: { c: V3; k: ReturnType<typeof lerpKey> }[] = [];

    for (let i = 0; i <= steps; i++) {
      const k = lerpKey(i / steps);
      mid.push({ c: onBody(k.from, k.dir, k.lift), k });
    }

    // Cloth lies smooth over the scan's bumps: relax the line, then keep it clear of the body
    for (let pass = 0; pass < 6; pass++) {
      const c = mid.map((m) => m.c);

      for (let i = 1; i < steps; i++) mid[i]!.c = mul(add(add(c[i - 1]!, c[i + 1]!), mul(c[i]!, 2)), 0.25);
    }

    for (const m of mid) {
      const need = reach(body.torso, m.k.from, m.k.dir, 0.97, 0.32) + 0.012;
      const has = dot(sub(m.c, m.k.from), m.k.dir);

      if (has < need) m.c = add(m.c, mul(m.k.dir, need - has));
    }

    const first = g.pos.length / 3;
    mid.forEach(({ c, k }, i) => {
      const tangent = norm(sub(mid[Math.min(steps, i + 1)]!.c, mid[Math.max(0, i - 1)]!.c));
      const across = norm(cross(tangent, k.dir));

      for (const e of [-0.5, 0.5]) {
        // The edges fall a little away from the body, as cloth does
        const p = add(add(c, mul(across, k.width * e)), mul(k.dir, -0.006));
        g.vertex(p, k.dir, inR(R.drape, e + 0.5, i / steps), along(p));
      }
    });

    for (let i = 0; i < steps; i++) g.quad(first + i * 2, first + i * 2 + 1, first + i * 2 + 3, first + i * 2 + 2);
  };

  const F: V3 = [0, -1, 0];
  const B: V3 = [0, 1, 0];
  const up: V3 = [0, 0, 1];
  const at = (x: number, z: number): V3 => [x, cy, z];
  const sz = body.joint('Bip01 L Clavicle')[2] - 0.08;

  if (o.pallu) {
    // From the right hip across the front, over the left shoulder, and down the back
    strip(
      [
        { from: at(-0.07, waist - 0.03), dir: norm([-0.3, -1, 0]), width: 0.13 },
        { from: at(-0.02, waist + 0.1), dir: F, width: 0.17 },
        { from: at(0.05, sz - 0.12), dir: norm([0.2, -1, 0.1]), width: 0.17 },
        { from: at(0.11, sz), dir: norm([0, -1, 0.6]), width: 0.12 },
        { from: at(0.12, sz), dir: up, width: 0.1 },
        { from: at(0.11, sz), dir: norm([0, 1, 0.5]), width: 0.13 },
        { from: at(0.08, sz - 0.2), dir: B, width: 0.22 },
        { from: at(0.06, waist), dir: B, width: 0.25, lift: 0.01 },
        { from: at(0.05, pelvis[2] - 0.22), dir: B, width: 0.27, lift: 0.03 },
      ],
      40,
    );
  } else if (o.thorthu !== undefined) {
    strip(
      [
        { from: at(0.11, sz - 0.28), dir: F, width: 0.15 },
        { from: at(0.12, sz - 0.1), dir: F, width: 0.15 },
        { from: at(0.12, sz), dir: norm([0, -1, 0.6]), width: 0.13 },
        { from: at(0.13, sz), dir: up, width: 0.12 },
        { from: at(0.12, sz), dir: norm([0, 1, 0.5]), width: 0.13 },
        { from: at(0.12, sz - 0.1), dir: B, width: 0.15 },
        { from: at(0.11, sz - 0.3), dir: B, width: 0.15 },
      ],
      24,
    );
  }

  // The head: its top and middle, from the head and hair points
  const H = body.head;
  let top = 0;
  let hy0 = 9;
  let hy1 = -9;

  for (let i = 0; i < H.length; i += 3) {
    top = Math.max(top, H[i + 2]!);

    if (H[i + 2]! > head[2] + 0.05) {
      hy0 = Math.min(hy0, H[i + 1]!);
      hy1 = Math.max(hy1, H[i + 1]!);
    }
  }

  const hc: V3 = [0, (hy0 + hy1) / 2, top - 0.1];
  const headW: [string, number][] = [['Bip01 Head', 1]];

  if (o.cap) {
    // A crochet thoppi over the crown, the hair under it
    const ELEV = 6;
    const AZ = 28;
    const start = g.pos.length / 3;

    for (let e = 0; e <= ELEV; e++) {
      const el = (0.32 + (e / ELEV) * (Math.PI / 2 - 0.32)) * 0.999;

      for (let a = 0; a <= AZ; a++) {
        const az = (a / AZ) * Math.PI * 2;
        const dir: V3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
        const p = add(hc, mul(dir, reach(H, hc, dir, 0.97) + 0.006));
        g.vertex(p, dir, inR(R.cap, a / AZ, e / ELEV), headW);
      }
    }

    for (let e = 0; e < ELEV; e++) {
      for (let a = 0; a < AZ; a++) {
        const i = start + e * (AZ + 1) + a;
        g.quad(i, i + 1, i + AZ + 2, i + AZ + 1);
      }
    }
  }

  if (o.jasmine) {
    // A string of buds around the back of the head, and a short fall of it down the hair
    const bud = (p: V3, r: number, w: [string, number][]) => {
      const n = 6;
      const axes: V3[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
      const ids = axes.map((ax, k) => g.vertex(add(p, ax), norm(ax), inR(R.flower, (k % 3) / 2, k < 3 ? 0.2 : 0.8), w));
      const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];

      for (const f of faces) g.idx.push(ids[f[0]!]!, ids[f[1]!]!, ids[f[2]!]!);
      void n;
    };

    for (let k = 0; k < 22; k++) {
      const az = Math.PI / 2 + (k / 21 - 0.5) * 2.1;
      const el = -0.15 + Math.sin((k / 21) * Math.PI) * 0.12;
      const dir: V3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
      bud(add(hc, mul(dir, reach(H, hc, dir, 0.97) + 0.008)), 0.011, headW);
    }

    for (let k = 0; k < 7; k++) {
      const dir: V3 = norm([0.02, 1, -0.3 - k * 0.12]);
      bud(add(hc, mul(dir, reach(H, hc, dir, 0.97) + 0.012)), 0.01, k < 4 ? headW : [['Bip01 Head', 0.5], ['Bip01 Neck', 0.5]]);
    }
  }

  return g;
}

/** The thing carried in the hand, laid down the arm's line from the grip so it hangs as the arm does. */
export function buildCarry(body: Body, o: Outfit): Part[] {
  const c = o.carry;

  if (!c) return [];
  const sign = c.side === 'L' ? 1 : -1;
  const hand = body.joint(`Bip01 ${c.side} Hand`);
  const fore = body.joint(`Bip01 ${c.side} Forearm`);
  const down = norm(sub(hand, fore));
  const out = mul(norm(cross([0, -1, 0], down)), sign);
  const front = norm(cross(down, out));
  // Held a little away from the leg, so a basket or tin swings clear of the skirt
  const clear = { umbrella: 0, bag: 0.03, tiffin: 0.05, basket: 0.07, torch: 0.0 }[c.kind];
  const grip = add(add(hand, mul(down, 0.075)), mul(out, clear));
  const w: [string, number][] = [[`Bip01 ${c.side} Hand`, 1]];
  const parts: Part[] = [];

  const part = (color: number, metal = 0, rough = 0.8) => {
    const p = { geo: new Geo(body.jointIndex), color, metal, rough };
    parts.push(p);

    return p.geo;
  };

  /** A point `t` metres down from the grip, `x` out from the leg and `y` forward. */
  const at = (t: number, x = 0, y = 0): V3 => add(add(add(grip, mul(down, t)), mul(out, x)), mul(front, y));

  /** A tube down the line, its radius along it given at each end. */
  const tube = (g: Geo, t0: number, t1: number, r0: number, r1: number, seg = 10, off: [number, number] = [0, 0], caps = true, flat = 1) => {
    const base = g.pos.length / 3;

    for (const [t, r] of [[t0, r0], [t1, r1]] as const) {
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const n = add(mul(out, Math.cos(a)), mul(front, Math.sin(a)));
        g.vertex(add(at(t, off[0], off[1]), add(mul(out, Math.cos(a) * r * flat), mul(front, Math.sin(a) * r))), n, [0, 0], w);
      }
    }

    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      g.quad(base + k, base + seg + k, base + seg + k1, base + k1);
    }

    if (caps) {
      for (const [t, ring, dir] of [[t0, base, -1], [t1, base + seg, 1]] as const) {
        const mid = g.vertex(at(t, off[0], off[1]), mul(down, dir), [0, 0], w);

        for (let k = 0; k < seg; k++) {
          const k1 = (k + 1) % seg;

          if (dir > 0) g.idx.push(mid, ring + k, ring + k1);
          else g.idx.push(mid, ring + k1, ring + k);
        }
      }
    }
  };

  if (c.kind === 'umbrella') {
    // A folded black umbrella: a crook in the hand, the furled canopy hanging past the knee
    const cloth = part(0x141416, 0, 0.7);
    const wood = part(0x5a3a22, 0, 0.55);
    tube(wood, -0.03, 0.06, 0.011, 0.011, 8);
    tube(wood, -0.05, -0.02, 0.011, 0.011, 8, [0, 0.035]);
    tube(wood, -0.03, -0.01, 0.011, 0.011, 8, [0, 0.07]);
    tube(cloth, 0.06, 0.14, 0.012, 0.035, 12);
    tube(cloth, 0.14, 0.52, 0.035, 0.02, 12);
    tube(wood, 0.52, 0.6, 0.006, 0.004, 6);
  } else if (c.kind === 'bag') {
    // A thin plastic carry bag, full of the evening's vegetables
    const bag = part(c.color ?? 0x2a6ab0, 0, 0.3);
    tube(bag, -0.01, 0.07, 0.007, 0.007, 6, [0, -0.035], false);
    tube(bag, -0.01, 0.07, 0.007, 0.007, 6, [0, 0.035], false);
    // Gathered at the handles, swelling with its load and sagging to a round bottom
    tube(bag, 0.06, 0.1, 0.03, 0.08, 14, [0, 0], false, 0.6);
    tube(bag, 0.1, 0.22, 0.08, 0.11, 14, [0, 0], false, 0.6);
    tube(bag, 0.22, 0.29, 0.11, 0.07, 14, [0, 0], true, 0.6);
    const veg = part(0x3f7a2a, 0, 0.7);
    tube(veg, 0.0, 0.08, 0.012, 0.02, 6, [0.005, 0.03]);
    tube(veg, 0.02, 0.09, 0.01, 0.018, 6, [-0.01, -0.02]);
  } else if (c.kind === 'tiffin') {
    // A steel tiffin carrier: three stacked tins on a clip handle
    const steel = part(0xdcdee0, 1, 0.22);
    tube(steel, -0.01, 0.01, 0.009, 0.009, 6, [-0.05, 0], true);
    tube(steel, 0.0, 0.035, 0.006, 0.006, 6, [-0.05, -0.06]);
    tube(steel, 0.0, 0.035, 0.006, 0.006, 6, [-0.05, 0.06]);
    tube(steel, 0.035, 0.05, 0.075, 0.075, 18);

    for (let k = 0; k < 3; k++) tube(steel, 0.05 + k * 0.07, 0.115 + k * 0.07, 0.068, 0.068, 18);
    tube(steel, 0.035, 0.26, 0.005, 0.005, 6, [0, -0.072], false);
    tube(steel, 0.035, 0.26, 0.005, 0.005, 6, [0, 0.072], false);
  } else if (c.kind === 'torch') {
    // A steel torch held in the fist, its lens pointing forward and down at the path
    const steel = part(0xb8bab8, 1, 0.3);
    const fwd = norm(add(front, mul(down, 0.35)));
    const p0 = add(grip, mul(down, -0.03));
    const g = steel;
    const base = g.pos.length / 3;
    const seg = 10;
    const ax = norm(cross(fwd, out));

    for (const [t, r] of [[-0.09, 0.016], [0.07, 0.016], [0.08, 0.026], [0.12, 0.028]] as const) {
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const n = add(mul(out, Math.cos(a)), mul(ax, Math.sin(a)));
        g.vertex(add(add(p0, mul(fwd, t)), mul(n, r)), n, [0, 0], w);
      }
    }

    for (let ring = 0; ring < 3; ring++)
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        g.quad(base + ring * seg + k, base + (ring + 1) * seg + k, base + (ring + 1) * seg + k1, base + ring * seg + k1);
      }

    const lens = part(0xfff4d8, 0, 0.1);
    const mid = lens.vertex(add(p0, mul(fwd, 0.121)), fwd, [0, 0], w);
    const ring0 = lens.pos.length / 3;

    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      lens.vertex(add(add(p0, mul(fwd, 0.121)), add(mul(out, Math.cos(a) * 0.024), mul(ax, Math.sin(a) * 0.024))), fwd, [0, 0], w);
    }

    for (let k = 0; k < seg; k++) lens.idx.push(mid, ring0 + k, ring0 + ((k + 1) % seg));
  } else if (c.kind === 'basket') {
    // A small cane basket of flowers for the temple: jasmine, marigold and a lotus or two
    const cane = part(0x9a7a4a, 0, 0.85);
    tube(cane, -0.02, 0.09, 0.006, 0.006, 6, [-0.035, -0.06], false);
    tube(cane, -0.02, 0.09, 0.006, 0.006, 6, [-0.035, 0.06], false);
    tube(cane, -0.03, -0.01, 0.008, 0.008, 6, [-0.07, 0], false);
    tube(cane, 0.09, 0.21, 0.095, 0.07, 16);
    const flowers = [part(0xe89a20, 0, 0.8), part(0xf2efe4, 0, 0.8), part(0xd8608a, 0, 0.7)];

    for (let k = 0; k < 18; k++) {
      const a = k * 2.39996;
      const r = 0.075 * Math.sqrt((k + 0.5) / 18);
      tube(flowers[k % 3]!, 0.065, 0.1, 0.022, 0.02, 6, [Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  return parts;
}

/** Adds the garments to the body's mesh, skinned with its skin. */
export function attach(doc: Document, like: Primitive, g: Geo, material: ReturnType<Document['createMaterial']>) {
  const buffer = doc.getRoot().listBuffers()[0]!;
  const acc = (type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR', array: Float32Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(g.nrm.length ? normalsOf(g) : [])))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(g.joints)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(g.weights)))
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)))
    .setMaterial(material);

  void like;

  return prim;
}

/** Smooth normals from the faces, turned to agree with the outward hint each vertex was given. */
function normalsOf(g: Geo) {
  const n = new Float32Array(g.pos.length);
  const p = g.pos;

  for (let i = 0; i < g.idx.length; i += 3) {
    const [a, b, c] = [g.idx[i]!, g.idx[i + 1]!, g.idx[i + 2]!];
    const pa: V3 = [p[a * 3]!, p[a * 3 + 1]!, p[a * 3 + 2]!];
    const f = cross(sub([p[b * 3]!, p[b * 3 + 1]!, p[b * 3 + 2]!], pa), sub([p[c * 3]!, p[c * 3 + 1]!, p[c * 3 + 2]!], pa));

    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[v * 3 + k]! += f[k]!;
  }

  for (let v = 0; v < n.length / 3; v++) {
    let m: V3 = norm([n[v * 3]!, n[v * 3 + 1]!, n[v * 3 + 2]!]);
    const hint: V3 = [g.nrm[v * 3]!, g.nrm[v * 3 + 1]!, g.nrm[v * 3 + 2]!];

    if (dot(m, hint) < 0) m = mul(m, -1);
    n.set(m, v * 3);
  }

  return n;
}

// ---- repainting the scan's own clothes beneath
export type Label = 0 | 1 | 2 | 3 | 4 | 5;

export const L = { none: 0, leg: 1, foot: 2, torso: 3, arm: 4, scalp: 5 } as const;

/** Paints each texel with the part of the body its triangle covers. */
export function labelMap(size: number, pos: Float32Array, uv: Float32Array, idx: Uint32Array | Uint16Array, label: (centroid: V3) => number) {
  const map = new Uint8Array(size * size);

  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    const U = [a, b, c].map((v) => [uv[v * 2]! * size, uv[v * 2 + 1]! * size] as const);
    const [x0, x1] = [Math.floor(Math.min(U[0]![0], U[1]![0], U[2]![0])) - 1, Math.ceil(Math.max(U[0]![0], U[1]![0], U[2]![0])) + 1];
    const [y0, y1] = [Math.floor(Math.min(U[0]![1], U[1]![1], U[2]![1])) - 1, Math.ceil(Math.max(U[0]![1], U[1]![1], U[2]![1])) + 1];
    const area = (U[1]![0] - U[0]![0]) * (U[2]![1] - U[0]![1]) - (U[2]![0] - U[0]![0]) * (U[1]![1] - U[0]![1]);

    if (Math.abs(area) < 1e-9) continue;

    for (let y = Math.max(0, y0); y <= Math.min(size - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(size - 1, x1); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        // Inside, or within a texel of an edge, so seams are covered
        const w0 = ((U[1]![0] - px) * (U[2]![1] - py) - (U[2]![0] - px) * (U[1]![1] - py)) / area;
        const w1 = ((U[2]![0] - px) * (U[0]![1] - py) - (U[0]![0] - px) * (U[2]![1] - py)) / area;
        const w2 = 1 - w0 - w1;

        if (w0 > -0.02 && w1 > -0.02 && w2 > -0.02) {
          // Labelled by the point this texel shows, so a neckline's edge is a clean curve
          const q: V3 = [0, 0, 0];
          [a, b, c].forEach((v, k) => {
            const wk = [w0, w1, w2][k]!;

            for (let j = 0; j < 3; j++) q[j] += pos[v * 3 + j]! * wk;
          });
          map[y * size + x] = label(q);
        }
      }
    }
  }

  return map;
}

export interface Repaint {
  /** 1 where the scan's texel is skin. */
  mask: Uint8Array;
  outfit: Outfit;
}

/** Repaints the body's texture by label: legs to the skirt's cloth, the top to its colour or to skin. */
export function repaintBody(px: Buffer, size: number, labels: Uint8Array, o: Repaint) {
  // The figure's own skin, averaged, to paint bare skin with
  let sk: V3 = [0, 0, 0];
  let n = 0;
  const lum = (i: number) => (px[i]! * 0.3 + px[i + 1]! * 0.55 + px[i + 2]! * 0.15) / 255;
  const mean = new Float64Array(8);
  const count = new Float64Array(8);

  for (let i = 0, p = 0; i < px.length; i += 3, p++) {
    const r = px[i]! / 255;
    const g = px[i + 1]! / 255;
    const b = px[i + 2]! / 255;

    if (o.mask[p]) {
      sk = add(sk, [r, g, b]);
      n++;
    } else {
      const lab = labels[p]!;
      mean[lab]! += lum(i);
      count[lab]! += 1;
    }
  }

  sk = mul(sk, 1 / Math.max(1, n));
  const out = o.outfit;
  const top = rgb(out.top.color);
  const skirt = rgb(out.skirt.color);

  for (let i = 0, p = 0; i < px.length; i += 3, p++) {
    if (o.mask[p]) continue;
    const lab = labels[p]!;

    if (lab === L.none || lab === L.scalp) continue;
    const x = p % size;
    const y = Math.floor(p / size);
    const rel = lum(i) / Math.max(0.02, mean[lab]! / Math.max(1, count[lab]!));
    let c: V3;
    const bare = (k: number) => mul(sk, Math.min(1.15, Math.max(0.7, 1 + (rel - 1) * k)));
    const cloth = (col: V3) => mul(col, Math.min(1.3, Math.max(0.5, 1 + (rel - 1) * 0.55)));

    if (lab === L.foot) c = out.barefoot ? bare(0.25) : mul([0.28, 0.18, 0.12], Math.min(1.3, Math.max(0.6, rel)));
    else if (lab === L.leg) {
      // The same cloth as the skirt above it, its checks and border, so a knee through it reads as it
      c = cloth(skirt);

      if (out.skirt.check !== undefined) {
        const ch = rgb(out.skirt.check);
        const sx = Math.floor(x / 12) % 2;
        const sy = Math.floor(y / 12) % 2;
        c = cloth(sx && sy ? ch : sx || sy ? lerp3(skirt, ch, 0.5) : skirt);
      }
    }
    else if (out.top.kind === 'bare' || lab === L.arm) c = bare(0.2);
    else {
      c = cloth(top);

      if (out.top.check !== undefined) {
        const ch = rgb(out.top.check);
        const sx = Math.floor(x / 14) % 2;
        const sy = Math.floor(y / 14) % 2;
        c = cloth(sx && sy ? ch : sx || sy ? lerp3(top, ch, 0.45) : top);
      }

      if (out.top.floral !== undefined && hash(Math.floor(x / 22), Math.floor(y / 22)) > 0.5 && Math.hypot((x % 22) - 11, (y % 22) - 11) < 5) c = cloth(rgb(out.top.floral));
    }

    px[i] = Math.round(255 * Math.min(1, c[0]));
    px[i + 1] = Math.round(255 * Math.min(1, c[1]));
    px[i + 2] = Math.round(255 * Math.min(1, c[2]));
  }

  return px;
}

/** Darkens hair to the near-black of Kerala hair, keeping its strands' shading. */
export function blackenHair(px: Buffer, channels: 3 | 4, only?: (p: number) => boolean) {
  for (let i = 0, p = 0; i < px.length; i += channels, p++) {
    if (only && !only(p)) continue;
    const r = px[i]! / 255;
    const g = px[i + 1]! / 255;
    const b = px[i + 2]! / 255;
    const l = r * 0.3 + g * 0.55 + b * 0.15;
    const k = 0.12 + l * 0.35;
    px[i] = Math.round(255 * k * 0.95);
    px[i + 1] = Math.round(255 * k * 0.82);
    px[i + 2] = Math.round(255 * k * 0.72);
  }

  return px;
}
