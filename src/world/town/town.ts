// The town round the temple, laid out the way a Kerala temple village on the edge of the forest
// grows: houses strung along the road and up murram lanes into the hills, each in its own swept
// yard behind a laterite wall; the old tharavad by the lane south of the temple; a church on the
// east side and a mosque on the west, each with its own neighbourhood; coconut and areca groves
// behind the houses, a rubber estate past the pond, paddy fields where the valley opens out, and
// the forest on every hill beyond. Pure CPU layout: everything else places itself from here.

import soil from '../../content/soil.json';
import { rng, type V3 } from '../../render/geo.ts';
import { BANYAN, COMPOUND, PADDY, POND, ROAD } from '../../content/world.ts';
import { onRoad, pondQ, roadZ } from '../terrain.ts';

export type HouseKind = 'old' | 'tharavad' | 'concrete' | 'storey' | 'hut';

export type Faith = 'hindu' | 'christian' | 'muslim';

export interface Plot {
  kind: HouseKind;
  faith: Faith;
  /** Where the house's front step is, and which way it faces (the builder's yaw). */
  x: number;
  z: number;
  yaw: number;
  /** Half width and depth of the house itself. */
  w: number;
  d: number;
  lit: boolean;
  seed: number;
}

export interface Lane {
  pts: [number, number][];
  half: number;
}

export type GroveKind = 'coconut' | 'areca' | 'rubber';

export interface Grove {
  kind: GroveKind;
  x: number;
  z: number;
  /** Half sizes along and across its rows, and the turn of the rows. */
  hx: number;
  hz: number;
  yaw: number;
  /** Spacing between trees in a row and between rows. */
  step: [number, number];
}

const S = (x: number, side: number, off: number): [number, number] => [x, roadZ(x) + side * (ROAD.half + off)];

/** The lanes, each from the road's edge up into the hills. */
export const LANES: Lane[] = [
  // West, north up the hill past the areca grove
  { pts: [S(-44, 1, -0.5), [-45, 46], [-50, 62], [-49, 80], [-56, 98], [-68, 116], [-80, 132]], half: 1.5 },
  // West, south past the tharavad, to the fields
  { pts: [S(-30, -1, -0.5), [-29, 14], [-31, -2], [-36, -20], [-33, -40], [-42, -62], [-55, -80]], half: 1.6 },
  // East, north up the hill
  { pts: [S(72, 1, -0.5), [73, 52], [67, 70], [74, 90], [88, 108]], half: 1.4 },
  // East, south to the church and the rubber estate
  { pts: [S(108, -1, -0.5), [107, 10], [110, -14], [104, -36], [112, -60]], half: 1.5 },
];

const segDist = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz)));

  return { d: Math.hypot(a[0] + vx * t - x, a[1] + vz * t - z), px: a[0] + vx * t, pz: a[1] + vz * t };
};

/** The distance to the nearest lane's centre line, and the nearest point on it. */
export const nearestLane = (x: number, z: number) => {
  let best = { d: Infinity, px: 0, pz: 0, half: 1.5 };

  for (const l of LANES) {
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const s = segDist(x, z, l.pts[i]!, l.pts[i + 1]!);

      if (s.d < best.d) best = { ...s, half: l.half };
    }
  }

  return best;
};

export const onLane = (x: number, z: number, margin = 0) => {
  const n = nearestLane(x, z);

  return n.d < n.half + margin;
};

/** The church stands back from the road on the east side, its front to the road. */
const cz = roadZ(88) - ROAD.half - 4 - 20;

/** Its compound: a centre and half sizes, the front edge on the road side. */
export const CHURCH = { x: 88, z: cz, yaw: 0, hx: 14, hz: 20 };

/** The mosque faces the road from the north side, on the west. */
const mz = roadZ(-96) + ROAD.half + 3 + 13;
export const MOSQUE = { x: -96, z: mz, yaw: Math.PI, hx: 13, hz: 13 };

export { PADDY };

export const inPaddy = (x: number, z: number, m = 0) => ((x - PADDY.x) / (PADDY.rx + m)) ** 2 + ((z - PADDY.z) / (PADDY.rz + m)) ** 2 < 1;

export const GROVES: Grove[] = [
  // The coconut garden on the slope behind the shops
  { kind: 'coconut', x: -4, z: 70, hx: 30, hz: 13, yaw: 0.05, step: [7.5, 7.5] },
  { kind: 'coconut', x: 40, z: 58, hx: 16, hz: 12, yaw: -0.2, step: [7.5, 7.5] },
  // Areca beside the west lane
  { kind: 'areca', x: -63, z: 72, hx: 9, hz: 17, yaw: 0.15, step: [2.7, 2.7] },
  { kind: 'areca', x: 52, z: 88, hx: 10, hz: 8, yaw: -0.3, step: [2.7, 2.7] },
  // The rubber estate past the pond, rows running across the slope
  { kind: 'rubber', x: 92, z: -72, hx: 36, hz: 26, yaw: 0.25, step: [4.5, 6] },
  { kind: 'rubber', x: -78, z: -70, hx: 26, hz: 20, yaw: -0.3, step: [4.5, 6] },
];

const inGroveRect = (g: Grove, x: number, z: number, m: number) => {
  const dx = x - g.x;
  const dz = z - g.z;
  const c = Math.cos(g.yaw);
  const s = Math.sin(g.yaw);
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;

  return Math.abs(u) < g.hx + m && Math.abs(v) < g.hz + m;
};

export const groveAt = (x: number, z: number, m = 0) => GROVES.find((g) => inGroveRect(g, x, z, m)) ?? null;

/** The trees of a grove, in rows, each a little off its mark. */
export function groveTrees(g: Grove, r: () => number) {
  const out: [number, number][] = [];
  const c = Math.cos(g.yaw);
  const s = Math.sin(g.yaw);

  for (let u = -g.hx; u <= g.hx; u += g.step[0]) {
    for (let v = -g.hz; v <= g.hz; v += g.step[1]) {
      if (r() < 0.06) continue;
      const uu = u + (r() - 0.5) * 0.5;
      const vv = v + (r() - 0.5) * 0.5;
      out.push([g.x + uu * c + vv * s, g.z - uu * s + vv * c]);
    }
  }

  return out;
}

const SHOPS = (x: number, z: number) => x > -22 && x < 14 && z > ROAD.z + ROAD.half - 1 && z < ROAD.z + ROAD.half + 13;
const inCompound = (x: number, z: number, m: number) => x > -COMPOUND.x - m && x < COMPOUND.x + m && z > COMPOUND.z0 - m && z < COMPOUND.z1 + m;

const nearBig = (x: number, z: number, m: number) =>
  (Math.abs(x - CHURCH.x) < CHURCH.hx + m && Math.abs(z - CHURCH.z) < CHURCH.hz + m) ||
  (Math.abs(x - MOSQUE.x) < MOSQUE.hx + m && Math.abs(z - MOSQUE.z) < MOSQUE.hz + m);

/** What faith a household in this part of town most likely keeps. */
const faithAt = (x: number, r: () => number): Faith => {
  const p = r();

  if (x > 60) return p < 0.6 ? 'christian' : p < 0.85 ? 'hindu' : 'muslim';

  if (x < -70) return p < 0.6 ? 'muslim' : p < 0.85 ? 'hindu' : 'christian';

  return p < 0.75 ? 'hindu' : p < 0.88 ? 'christian' : 'muslim';
};

const SIZES: Record<HouseKind, [number, number]> = {
  old: [3.4, 2.9],
  tharavad: [7.5, 5.5],
  concrete: [4.4, 3.8],
  storey: [4.6, 4.2],
  hut: [2.4, 2.1],
};

function layout() {
  const r = rng(77);
  const plots: Plot[] = [];

  const room = (x: number, z: number, rad: number) =>
    !onRoad(x, z, rad) &&
    !onLane(x, z, rad - 0.5) &&
    pondQ(x, z) > 1.25 &&
    !inCompound(x, z, rad + 3) &&
    !SHOPS(x, z) &&
    !nearBig(x, z, rad + 2) &&
    !groveAt(x, z, rad) &&
    !inPaddy(x, z, rad + 4) &&
    Math.hypot(x - BANYAN[0], z - BANYAN[2]) > 12 + rad &&
    Math.hypot(x - POND.x, z - POND.z) > POND.r + 8 + rad &&
    plots.every((p) => Math.hypot(p.x - x, p.z - z) > Math.max(SIZES[p.kind][0], SIZES[p.kind][1]) + rad + 3);

  const kindAt = (d: number): HouseKind => {
    const p = r();

    // Newer concrete houses close to the road, older tiled ones and huts further in
    if (d < 1) return p < 0.38 ? 'concrete' : p < 0.62 ? 'storey' : p < 0.92 ? 'old' : 'hut';

    return p < 0.28 ? 'concrete' : p < 0.42 ? 'storey' : p < 0.78 ? 'old' : 'hut';
  };

  const add = (kind: HouseKind, x: number, z: number, faceX: number, faceZ: number) => {
    const [w, d] = SIZES[kind];
    const rad = Math.max(w, d) + 1.5;

    if (!room(x, z, rad)) return false;
    const yaw = Math.atan2(faceX - x, faceZ - z) + (r() - 0.5) * 0.15;
    plots.push({ kind, faith: faithAt(x, r), x, z, yaw, w, d, lit: r() < 0.85, seed: r() });

    return true;
  };

  // The old tharavad south of the temple, its gatehouse on the lane
  add('tharavad', -46, -14, -33, -16);

  // Along the road, both sides, set back behind their front yards
  for (let x = -128; x <= 140; x += 6 + r() * 5) {
    if (Math.abs(x) < 24) continue;

    for (const side of [-1, 1]) {
      if (r() < 0.15) continue;
      const kind = kindAt(0);
      const back = ROAD.half + 7 + SIZES[kind][1] + r() * 5;
      const z = roadZ(x) + side * back;
      add(kind, x + (r() - 0.5) * 3, z, x, roadZ(x));

      // A second row behind, reached by a footpath, older houses among the trees
      if (r() < 0.55) {
        const k2 = kindAt(1);
        const xb = x + (r() - 0.5) * 6;
        add(k2, xb, roadZ(xb) + side * (back + 16 + r() * 6), xb, roadZ(xb));
      }
    }
  }

  // Up the lanes, every so often, facing the lane
  for (const l of LANES) {
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, az] = l.pts[i]!;
      const [bx, bz] = l.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);

      for (let t = 4; t < len; t += 8 + r() * 6) {
        const k = t / len;
        const px = ax + (bx - ax) * k;
        const pz = az + (bz - az) * k;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;

        for (const side of [-1, 1]) {
          if (r() < 0.2) continue;
          const kind = kindAt(1);
          const back = l.half + 6 + SIZES[kind][1] + r() * 4;
          add(kind, px + nx * side * back, pz + nz * side * back, px, pz);
        }
      }
    }
  }

  return plots;
}

export const PLOTS = layout();

/** Every house's yard, as a centre and a radius, for whatever must keep out of it. */
export const yards = PLOTS.map((p) => ({ x: p.x, z: p.z, r: Math.max(p.w, p.d) + 3.5 }));

export const inYard = (x: number, z: number, m = 0) =>
  yards.some((y) => Math.hypot(y.x - x, y.z - z) < y.r + m) || nearBig(x, z, m);

/** A plot's corner in world space, from its own frame. */
export const plotPoint = (p: Pick<Plot, 'x' | 'z' | 'yaw'>, lx: number, lz: number): [number, number] => {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);

  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
};

// ---------------------------------------------------------------- the land map

/** The land map covers ±LAND metres each way in LAND_N texels. */
export const LAND = 256;
export const LAND_N = 1024;

/**
 * What the ground is at each texel: red swept yards (r), murram lanes (g), leaf litter under
 * the plantations (b), paddy (a), each 0..255 with soft edges.
 */
export function landMap(settings = soil) {
  const N = LAND_N;
  const px = new Uint8Array(N * N * 4);
  const m = N / (2 * LAND);

  const put = (x: number, z: number, ch: number, v: number) => {
    const i = Math.floor((x + LAND) * m);
    const j = Math.floor((z + LAND) * m);

    if (i < 0 || j < 0 || i >= N || j >= N) return;
    const k = (j * N + i) * 4 + ch;
    px[k] = Math.max(px[k]!, Math.round(v * 255));
  };

  const each = (x0: number, z0: number, x1: number, z1: number, fn: (x: number, z: number) => void) => {
    for (let j = Math.floor((z0 + LAND) * m); j <= Math.ceil((z1 + LAND) * m); j++) {
      for (let i = Math.floor((x0 + LAND) * m); i <= Math.ceil((x1 + LAND) * m); i++) {
        fn((i + 0.5) / m - LAND, (j + 0.5) / m - LAND);
      }
    }
  };

  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

    return t * t * (3 - 2 * t);
  };

  // Lanes
  for (const l of LANES) {
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const a = l.pts[i]!;
      const b = l.pts[i + 1]!;
      const pad = l.half + Math.max(1.5, settings.laneShoulder);
      each(Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, (x, z) => {
        const d = segDist(x, z, a, b).d;
        put(x, z, 1, 1 - ss(l.half - 0.4, l.half + settings.laneShoulder, d));
      });
    }
  }

  // Yards: a swept rectangle round each house, the front yard deepest
  for (const p of PLOTS) {
    const hw = p.w + 2.6;
    const front = p.d + 5.5;
    const back = p.d + 2;
    const R = Math.hypot(hw, front) + Math.max(1, settings.yardFeather);
    each(p.x - R, p.z - R, p.x + R, p.z + R, (x, z) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      const u = dx * c - dz * s;
      const v = dx * s + dz * c;
      const e = Math.max(Math.abs(u) - hw, v - front, -v - back);
      put(x, z, 0, 1 - ss(-0.8, settings.yardFeather, e));
    });
  }

  for (const big of [CHURCH, MOSQUE]) {
    each(big.x - big.hx - 2, big.z - big.hz - 2, big.x + big.hx + 2, big.z + big.hz + 2, (x, z) => {
      const e = Math.max(Math.abs(x - big.x) - big.hx, Math.abs(z - big.z) - big.hz);
      put(x, z, 0, 1 - ss(-1, 0.5, e));
    });
  }

  // Leaf litter under the rubber and areca
  for (const g of GROVES) {
    if (g.kind === 'coconut') continue;
    const R = Math.hypot(g.hx, g.hz) + Math.max(4, settings.litterFeather);
    each(g.x - R, g.z - R, g.x + R, g.z + R, (x, z) => {
      const dx = x - g.x;
      const dz = z - g.z;
      const c = Math.cos(g.yaw);
      const s = Math.sin(g.yaw);
      const e = Math.max(Math.abs(dx * c - dz * s) - g.hx, Math.abs(dx * s + dz * c) - g.hz);
      put(x, z, 2, 1 - ss(-1, settings.litterFeather, e));
    });
  }

  // Paddy
  each(PADDY.x - PADDY.rx - 4, PADDY.z - PADDY.rz - 4, PADDY.x + PADDY.rx + 4, PADDY.z + PADDY.rz + 4, (x, z) => {
    const q = Math.hypot((x - PADDY.x) / PADDY.rx, (z - PADDY.z) / PADDY.rz);
    put(x, z, 3, 1 - ss(settings.paddyEdge, 1.0, q));
  });

  return { width: N, height: N, pixels: px };
}

/** How many houses of each kind, for the log. */
export const townSummary = () => {
  const by: Record<string, number> = {};

  for (const p of PLOTS) by[p.kind] = (by[p.kind] ?? 0) + 1;

  return `${PLOTS.length} houses ${JSON.stringify(by)}`;
};

export type { V3 };
