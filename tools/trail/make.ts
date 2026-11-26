// Finds the forest path: from the road by the temple, out between the houses, and up into the
// hills to a clearing where the forest bungalow stands, about a kilometre on foot. A cheapest-
// path search over the land, where steep ground costs dearly, so the path winds along the
// slopes the way a path worn by feet does. Writes src/generated/trail.gen.ts.
//
//   npx tsx tools/trail/make.ts
import { writeFileSync } from 'node:fs';
import { heightAt, landAt, onRoad, pondQ, roadZ } from '../../src/world/terrain.ts';
import { inYard, PADDY } from '../../src/world/town/town.ts';
import { COMPOUND, ROAD } from '../../src/content/world.ts';

const GOAL = 1000;
const C = 3;
const X0 = -220;
const X1 = 220;
const Z0 = -440;
const Z1 = 32;
const NX = Math.round((X1 - X0) / C);
const NZ = Math.round((Z1 - Z0) / C);
const cx = (i: number) => X0 + i * C;
const cz = (j: number) => Z0 + j * C;

const START: [number, number] = [20, roadZ(20) - ROAD.half - 0.6];

// What each cell costs to cross, besides its slope
const H = new Float32Array(NX * NZ);
const BAD = new Float32Array(NX * NZ);

for (let j = 0; j < NZ; j++) {
  for (let i = 0; i < NX; i++) {
    const x = cx(i);
    const z = cz(j);
    const k = j * NX + i;
    // The river is carved around this path's crossing after the route is generated.
    H[k] = landAt(x, z);
    let bad = 0;

    if (pondQ(x, z) < 1.25) bad = Infinity;

    if (Math.abs(x) < COMPOUND.x + 3 && z > COMPOUND.z0 - 3 && z < COMPOUND.z1 + 3) bad = Infinity;

    if (Math.hypot((x - PADDY.x) / PADDY.rx, (z - PADDY.z) / PADDY.rz) < 1.1) bad = Infinity;

    if (inYard(x, z, 2)) bad += 40;

    if (onRoad(x, z, 2) && Math.hypot(x - START[0], z - START[1]) > 6) bad += 30;
    BAD[k] = bad;
  }
}

// Dijkstra over 8 neighbours, from one cell to every other
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const cellOf = (x: number, z: number) => Math.round((z - Z0) / C) * NX + Math.round((x - X0) / C);
const cost = new Float64Array(NX * NZ);
const from = new Int32Array(NX * NZ);

function search(s0: number) {
  cost.fill(Infinity);
  from.fill(-1);
  cost[s0] = 0;
  heap.length = 0;
  push([0, s0]);

  while (heap.length) {
    const [c, k] = pop();

    if (c > cost[k]!) continue;
    const i = k % NX;
    const j = (k - i) / NX;

    for (const [di, dj] of NB) {
      const ni = i + di;
      const nj = j + dj;

      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const n = nj * NX + ni;

      if (BAD[n] === Infinity) continue;
      const len = Math.hypot(di, dj) * C;
      const grade = Math.abs(H[n]! - H[k]!) / len;
      // Gentle is cheap, a steady climb is fine, steep is to be walked round
      const step = len * (1 + 40 * grade * grade + (grade > 0.16 ? 600 * (grade - 0.16) : 0) + BAD[n]! * 0.1);

      if (c + step < cost[n]!) {
        cost[n] = c + step;
        from[n] = k;
        push([c + step, n]);
      }
    }
  }
}

// A binary heap of [cost, cell]
const heap: [number, number][] = [];

const push = (e: [number, number]) => {
  heap.push(e);
  let n = heap.length - 1;

  while (n > 0) {
    const p = (n - 1) >> 1;

    if (heap[p]![0] <= heap[n]![0]) break;
    [heap[p], heap[n]] = [heap[n]!, heap[p]!];
    n = p;
  }
};

const pop = () => {
  const top = heap[0]!;
  const last = heap.pop()!;

  if (heap.length) {
    heap[0] = last;
    let n = 0;

    for (;;) {
      const a = 2 * n + 1;
      const b = a + 1;
      let m = n;

      if (a < heap.length && heap[a]![0] < heap[m]![0]) m = a;

      if (b < heap.length && heap[b]![0] < heap[m]![0]) m = b;

      if (m === n) break;
      [heap[m], heap[n]] = [heap[n]!, heap[m]!];
      n = m;
    }
  }

  return top;
};

const chain = (k: number) => {
  const out: [number, number][] = [];

  for (let n = k; n >= 0; n = from[n]!) out.push([cx(n % NX), cz(Math.floor(n / NX))]);

  return out.reverse();
};

const lengthOf = (pts: [number, number][]) => {
  let L = 0;

  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);

  return L;
};

/** Rounds the grid's corners off: Chaikin, a few times over. */
const smooth = (pts: [number, number][], times: number) => {
  let p = pts;

  for (let t = 0; t < times; t++) {
    const q: [number, number][] = [p[0]!];

    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }

    q.push(p.at(-1)!);
    p = q;
  }

  return p;
};

/** The flattest cell near a spot, for the clearing. */
const levelNear = (x: number, z: number, reach: number) => {
  let bestK = cellOf(x, z);
  let bestRough = Infinity;

  for (let dz = -reach; dz <= reach; dz += C) {
    for (let dx = -reach; dx <= reach; dx += C) {
      const k = cellOf(x + dx, z + dz);
      const i = k % NX;
      const j = (k - i) / NX;

      if (i < 3 || j < 3 || i >= NX - 3 || j >= NZ - 3 || BAD[k] === Infinity) continue;
      let rough = 0;

      for (const [di, dj] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2]]) rough = Math.max(rough, Math.abs(H[(j + dj!) * NX + i + di!]! - H[k]!));
      const score = rough - H[k]! * 0.05;

      if (score < bestRough) {
        bestRough = score;
        bestK = k;
      }
    }
  }

  return bestK;
};

// Out east along the slope, back west across the hill above the town, then up to the clearing:
// the waypoints stretched until the walk is a kilometre
const walk = (stretch: number) => {
  const via: [number, number][] = [[70 * stretch, -120], [-95 * stretch, -235], [25, -395]];
  const cells = [cellOf(...START), cellOf(...via[0]!), cellOf(...via[1]!), levelNear(...via[2]!, 30)];
  let pts: [number, number][] = [];

  for (let l = 0; l + 1 < cells.length; l++) {
    search(cells[l]!);
    const leg = chain(cells[l + 1]!);
    pts = pts.length ? [...pts, ...leg.slice(1)] : leg;
  }

  return smooth(pts, 4);
};

// The path, rounded, every 2 m, and stopped short of the bungalow's veranda steps
const finish = (raw: [number, number][]) => {
const out: [number, number][] = [raw[0]!];
let carry = 0;

for (let i = 1; i < raw.length; i++) {
  const a = raw[i - 1]!;
  const b = raw[i]!;
  const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let t = 2 - carry;

  while (t <= seg) {
    out.push([a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg]);
    t += 2;
  }

  carry = seg - (t - 2);
}

out.push(raw.at(-1)!);

// Worn paths don't follow a grid: averaged over about 30 m, then wandering a little either side,
// held fixed at both ends
for (let pass = 0; pass < 2; pass++) {
  const prev = out.map(([x, z]): [number, number] => [x, z]);
  const R = 3;

  for (let i = 1; i < out.length - 1; i++) {
    let sx = 0;
    let sz = 0;
    let n = 0;

    for (let k = -R; k <= R; k++) {
      const q = prev[Math.min(out.length - 1, Math.max(0, i + k))]!;
      sx += q[0];
      sz += q[1];
      n++;
    }

    const hold = Math.min(1, i / 10, (out.length - 1 - i) / 6);
    out[i] = [prev[i]![0] + (sx / n - prev[i]![0]) * hold, prev[i]![1] + (sz / n - prev[i]![1]) * hold];
  }
}

for (let i = 1; i < out.length - 1; i++) {
  const a = out[i - 1]!;
  const b = out[i + 1]!;
  const tx = b[0] - a[0];
  const tz = b[1] - a[1];
  const l = Math.hypot(tx, tz) || 1;
  const hold = Math.min(1, i / 15, (out.length - 1 - i) / 10);
  const m = (Math.sin(i * 0.071) * 0.9 + Math.sin(i * 0.19 + 1.3) * 0.4) * hold;
  out[i] = [out[i]![0] - (tz / l) * m, out[i]![1] + (tx / l) * m];
}

return out;
};

let raw: [number, number][] = [];
let bestGap = Infinity;

for (let k = 0; k <= 30; k++) {
  const stretch = 1.5 + k * 0.03;
  const pts = walk(stretch);
  const gap = Math.abs(lengthOf(finish(pts)) - GOAL);

  if (gap < bestGap) {
    bestGap = gap;
    raw = pts;
    console.log('stretch', stretch.toFixed(2), 'length', lengthOf(finish(pts)).toFixed(0));
  }

  if (gap < 8) break;
}

const out = finish(raw);
const end = out.at(-1)!;
const before = out[out.length - 8]!;

// Steepest grade along it, as a check
let steep = 0;

for (let i = 1; i < out.length; i++) steep = Math.max(steep, Math.abs(heightAt(...out[i]!) - heightAt(...out[i - 1]!)) / 2);

const src = `// Made by tools/trail/make.ts: the forest path, every 2 m from the road to the bungalow.
export const TRAIL_POINTS: readonly (readonly [number, number])[] = ${JSON.stringify(out.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]))};
/** The clearing at the path's end and the way the path comes into it. */
export const CLEARING = { x: ${end[0].toFixed(2)}, z: ${end[1].toFixed(2)}, heading: ${Math.atan2(end[0] - before[0], end[1] - before[1]).toFixed(4)} } as const;
`;

writeFileSync(new URL('../../src/generated/trail.gen.ts', import.meta.url).pathname, src);

console.log(`path ${lengthOf(out).toFixed(0)} m, ${out.length} points, ends at ${end[0].toFixed(1)}, ${end[1].toFixed(1)} (height ${heightAt(...end).toFixed(1)}), steepest ${(steep * 100).toFixed(0)}%`);
