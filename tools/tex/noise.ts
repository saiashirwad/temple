// Seamless noise for baking tiles: every function takes coordinates across the tile, 0..1, and
// whole-number periods, so the tile repeats without a seam.

export const fract = (x: number) => x - Math.floor(x);
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** A 32-bit hash of two ints and a seed, as a float in 0..1. */
export function hash(x: number, y: number, s = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const GX = new Float32Array(256);
const GY = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  GX[i] = Math.cos((i / 256) * Math.PI * 2);
  GY[i] = Math.sin((i / 256) * Math.PI * 2);
}

/** Gradient noise about -0.7..0.7, repeating every `px` by `py` lattice cells across the tile. */
export function noise(u: number, v: number, px: number, py = px, s = 0) {
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const x0 = mod(ix, px);
  const y0 = mod(iy, py);
  const x1 = mod(ix + 1, px);
  const y1 = mod(iy + 1, py);
  const g = (cx: number, cy: number, dx: number, dy: number) => {
    const k = (hash(cx, cy, s) * 256) | 0;
    return GX[k]! * dx + GY[k]! * dy;
  };
  const a = g(x0, y0, fx, fy);
  const b = g(x1, y0, fx - 1, fy);
  const c = g(x0, y1, fx, fy - 1);
  const d = g(x1, y1, fx - 1, fy - 1);
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}

/** Fractal noise, the period doubling each octave, about -1..1. */
export function fbm(u: number, v: number, px: number, py = px, oct = 5, s = 0, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise(u, v, px << i, py << i, s + i * 131) * amp;
    norm += amp;
    amp *= gain;
  }
  return (sum / norm) * 1.6;
}

/** Ridged noise, 0..1, bright along thin creases. */
export function ridge(u: number, v: number, px: number, py = px, oct = 4, s = 0) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += (1 - Math.abs(noise(u, v, px << i, py << i, s + i * 71) * 1.4)) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/** The result of the latest `worley` call: nearest and second distances in cells, the cell's id. */
export const W = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0, dx: 0, dy: 0 };

/** Cellular noise repeating every `px` by `py` cells; `jitter` 0..1 scatters the points. */
export function worley(u: number, v: number, px: number, py = px, s = 0, jitter = 1) {
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  let bx = 0;
  let by = 0;
  let bdx = 0;
  let bdy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = mod(ix + i, px);
      const cy = mod(iy + j, py);
      const ox = ix + i + 0.5 + (hash(cx, cy, s) - 0.5) * jitter;
      const oy = iy + j + 0.5 + (hash(cx, cy, s + 7) - 0.5) * jitter;
      const dx = ox - x;
      const dy = oy - y;
      const dd = dx * dx + dy * dy;
      if (dd < f1) {
        f2 = f1;
        f1 = dd;
        id = hash(cx, cy, s + 13);
        bx = cx;
        by = cy;
        bdx = dx;
        bdy = dy;
      } else if (dd < f2) f2 = dd;
    }
  }
  W.f1 = Math.sqrt(f1);
  W.f2 = Math.sqrt(f2);
  W.id = id;
  W.cx = bx;
  W.cy = by;
  W.dx = bdx;
  W.dy = bdy;
  return W;
}

/** Blocks in courses: `cols` by `rows` across the tile, each course shifted by `shift(row)` of a block. */
export const B = { fu: 0, fv: 0, col: 0, row: 0, id: 0, id2: 0 };
export function blocks(u: number, v: number, cols: number, rows: number, shift: (row: number) => number) {
  const y = v * rows;
  const row = Math.floor(y);
  const x = u * cols + shift(mod(row, rows));
  const col = Math.floor(x);
  B.fu = x - col;
  B.fv = y - row;
  B.row = mod(row, rows);
  B.col = mod(col, cols);
  B.id = hash(B.col, B.row, 911);
  B.id2 = hash(B.col, B.row, 377);
  return B;
}

/** sRGB hex to linear colour. */
export function hex(h: number): [number, number, number] {
  const c = (x: number) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255)];
}

export type C = [number, number, number];
export const lerp3 = (a: C, b: C, t: number): C => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const mul3 = (a: C, k: number): C => [a[0] * k, a[1] * k, a[2] * k];
