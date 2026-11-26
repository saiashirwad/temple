// The forest path: from the road beside the temple, out past the pond and up into the hills,
// a kilometre on foot to the forest bungalow in its clearing. The line itself is found by
// tools/trail/make.ts (trail.gen.ts); here is how far anything is from it, how far along it a
// walker has come, and a soft map of it for the ground to paint.

import { CLEARING, TRAIL_POINTS } from './trail.gen.ts';

export { CLEARING };
type XZ = readonly [number, number];
const PTS: readonly XZ[] = TRAIL_POINTS;

/** Metres along the path at each point. */
const ALONG: number[] = [0];
for (let i = 1; i < PTS.length; i++) ALONG.push(ALONG[i - 1]! + Math.hypot(PTS[i]![0] - PTS[i - 1]![0], PTS[i]![1] - PTS[i - 1]![1]));
/** How long the path is, end to end. */
export const TRAIL_LENGTH = ALONG.at(-1)!;

// The segments in 10 m cells, for asking what's near
const CELL = 10;
const cells = new Map<number, number[]>();
const key = (i: number, j: number) => i * 4099 + j;
for (let k = 0; k + 1 < PTS.length; k++) {
  const a = PTS[k]!;
  const b = PTS[k + 1]!;
  const i0 = Math.floor(Math.min(a[0], b[0]) / CELL);
  const i1 = Math.floor(Math.max(a[0], b[0]) / CELL);
  const j0 = Math.floor(Math.min(a[1], b[1]) / CELL);
  const j1 = Math.floor(Math.max(a[1], b[1]) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (cells.get(key(i, j)) ?? cells.set(key(i, j), []).get(key(i, j))!).push(k);
}

/** The nearest point of the path to x, z: how far off it is and how far along. */
export function trailNear(x: number, z: number, reach = 40) {
  let best = Infinity;
  let along = 0;
  const n = Math.ceil(reach / CELL);
  const ci = Math.floor(x / CELL);
  const cj = Math.floor(z / CELL);
  for (let i = ci - n; i <= ci + n; i++) {
    for (let j = cj - n; j <= cj + n; j++) {
      for (const k of cells.get(key(i, j)) ?? []) {
        const a = PTS[k]!;
        const b = PTS[k + 1]!;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const L2 = dx * dx + dz * dz || 1;
        const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
        const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
        if (d < best) {
          best = d;
          along = ALONG[k]! + Math.sqrt(L2) * t;
        }
      }
    }
  }
  return { distance: best, along };
}
/** How far x, z is from the path (Infinity beyond `reach`). */
export const trailDistance = (x: number, z: number, reach = 40) => trailNear(x, z, reach).distance;

/** The point `s` metres along the path, and which way it runs there. */
export function trailAt(s: number) {
  const t = Math.min(Math.max(s, 0), TRAIL_LENGTH);
  let lo = 0;
  let hi = ALONG.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ALONG[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const a = PTS[lo]!;
  const b = PTS[Math.min(lo + 1, PTS.length - 1)]!;
  const f = (t - ALONG[lo]!) / (ALONG[lo + 1]! - ALONG[lo]! || 1);
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

/** How wide the footpath is: a laid path of packed murram, two can walk side by side. */
export const trailWidth = (along: number) => 2.4 - 0.2 * Math.min(1, along / 300);

/** The box the trail map covers, and how many texels across. */
export const TRAIL_MAP = (() => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of PTS) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const pad = 60;
  const res = 0.5;
  const lo: XZ = [Math.floor(x0 - pad), Math.floor(z0 - pad)];
  const nx = Math.ceil((x1 - x0 + pad * 2) / res);
  const nz = Math.ceil((z1 - z0 + pad * 2) / res);
  return { lo, res, nx, nz, size: [nx * res, nz * res] as XZ };
})();

/**
 * The trail map, in RGBA: the worn path (r), the forest floor of fallen leaves either side of
 * it (g), and how far along the path each texel is, as a fraction (b), for the path's colour to
 * change as it climbs.
 */
export function trailMap() {
  const { lo, res, nx, nz } = TRAIL_MAP;
  const px = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) {
    const z = lo[1] + (j + 0.5) * res;
    for (let i = 0; i < nx; i++) {
      const x = lo[0] + (i + 0.5) * res;
      const near = trailNear(x, z, 50);
      if (near.distance > 50) continue;
      const w = trailWidth(near.along);
      const k = (j * nx + i) * 4;
      // A firm edge where the kerb stones hold it, only a little grass creeping over
      const rag = Math.sin(x * 2.1 + z * 1.3) * 0.5 + Math.sin(x * 0.7 - z * 1.9) * 0.5;
      const path = 1 - smooth(w * 0.5 - 0.12, w * 0.5 + 0.04 + rag * 0.03, near.distance);
      const deep = smooth(60, 160, near.along);
      const floor = (1 - smooth(18, 46, near.distance)) * deep;
      px[k] = Math.round(path * 255);
      px[k + 1] = Math.round(floor * 255);
      px[k + 2] = Math.round(Math.min(1, near.along / TRAIL_LENGTH) * 255);
      px[k + 3] = 255;
    }
  }
  return px;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Squares of land round the path beyond the town, for the physics: [x0, z0, size]. */
export function trailPatches(inside: number, size = 40) {
  const out: [number, number, number][] = [];
  const { lo, size: span } = TRAIL_MAP;
  for (let z = lo[1]; z < lo[1] + span[1]; z += size) {
    for (let x = lo[0]; x < lo[0] + span[0]; x += size) {
      // Skip squares inside the town's own mesh
      if (x >= -inside && z >= -inside && x + size <= inside && z + size <= inside) continue;
      if (trailNear(x + size / 2, z + size / 2, size).distance > size * 0.71 + 25) continue;
      out.push([x - 1.5, z - 1.5, size + 3]);
    }
  }
  return out;
}
