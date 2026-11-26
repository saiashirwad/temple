// Small shared helpers for the CPU-side logic (no GPU here). Pure functions only.

/** `x` held between `lo` and `hi`. */
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Linear blend from `a` (t = 0) to `b` (t = 1). */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite smoothstep: 0 below `a`, 1 above `b`, smooth between (like WGSL smoothstep). */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);

  return t * t * (3 - 2 * t);
};

/** An angle wrapped into -π..π. */
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Flat length of dx, dz. */
export const hypot2 = (dx: number, dz: number) => Math.hypot(dx, dz);

/**
 * The flat unit vector from a to b, and the distance. The distance is never 0 (it comes back as 1
 * when the points meet), so it is always safe to divide by.
 */
export const toward = (ax: number, az: number, bx: number, bz: number): [ux: number, uz: number, d: number] => {
  const dx = bx - ax;
  const dz = bz - az;
  const d = Math.hypot(dx, dz) || 1;

  return [dx / d, dz / d, d];
};

/** Cosine of the angle between the offset dx, dz and the unit direction fx, fz (1 = straight ahead). */
export const facingCos = (dx: number, dz: number, fx: number, fz: number) => (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);

/** `x` eased toward `goal` at `rate` per second, never past it. */
export const approach = (x: number, goal: number, rate: number, dt: number) => x + (goal - x) * Math.min(1, dt * rate);

/** A number between a and b from `random`, which should be in [0, 1). */
export const between = (random: () => number, a: number, b: number) => a + random() * (b - a);

/**
 * Splits `dt` into equal substeps no longer than `max` and calls `fn` with each, in order. A dt of
 * 0 (paused) still makes one call with 0. `fn` may return `false` to skip the rest of the substeps.
 * Returns how many substeps ran.
 */
export function stepFixed(dt: number, fn: (h: number, i: number) => boolean | void, max = 1 / 30) {
  const n = dt > 0 ? Math.max(1, Math.ceil(dt / max - 1e-9)) : 1;
  const h = dt > 0 ? dt / n : 0;

  for (let i = 0; i < n; i++) if (fn(h, i) === false) return i + 1;

  return n;
}
