// What happens along the forest path, the way a jungle trail does in Kenneth Anderson's South
// India: boulders and granite outcrops the path squeezes between, brooks running across it,
// small shrines where someone has lit a lamp tonight, a fresh elephant crossing with dung and
// prints and snapped bamboo, and a few places where the trees fall away and you can see out:
// a watcher's fire on the far ridge, the town's lamps far below, a herd in a moonlit valley.
//
// Everything is laid out from the path itself (trail.ts), so it follows if the path moves.

import { Builder, hex, P, rng, type Mat, type V3 } from './geo.ts';
import type { Lamp } from './flicker.ts';
import { M } from './world.ts';
import { heightAt, riverCut } from './terrain.ts';
import { TRAIL_LENGTH, trailAt, trailNear, trailWidth } from './trail.ts';
import { onBridge } from './bridge.ts';
import { inRiver } from './river.ts';
import { machanFree } from './machan.ts';

const deg = Math.PI / 180;
type XZ = [number, number];

/** A point `side` metres to the right of the path, `along` metres up it. */
const besidePath = (along: number, side: number): XZ => {
  const p = trailAt(along);
  return [p.x + Math.cos(p.heading) * side, p.z - Math.sin(p.heading) * side];
};
/** A compass bearing (0 = +z, 90 = +x) as a unit vector. */
const bearing = (b: number): XZ => [Math.sin(b * deg), Math.cos(b * deg)];

// ---------------------------------------------------------------- the views out

/** Whether the land between an eye and a point leaves it in sight, with `clear` metres to spare. */
const inSight = (from: V3, to: V3, clear = 0.6) => {
  const D = Math.hypot(to[0] - from[0], to[2] - from[2]);
  for (let d = 4; d < D - 6; d += 3) {
    const f = d / D;
    const x = from[0] + (to[0] - from[0]) * f;
    const z = from[2] + (to[2] - from[2]) * f;
    if (from[1] + (to[1] - from[1]) * f < heightAt(x, z) + clear) return false;
  }
  return true;
};

/** The town seen from the hill: toward the temple, over the land. */
const TOWN: XZ = [0, 10];

/** Across the valley from the second view: a spot on a far ridge in plain sight. */
export const FIRE: V3 = (() => {
  const p = trailAt(640);
  const eye: V3 = [p.x, heightAt(p.x, p.z) + 1.62, p.z];
  let best: V3 | null = null;
  let score = -Infinity;
  for (let b = 0; b < 360; b += 6) {
    const u = bearing(b);
    for (let d = 260; d <= 320; d += 10) {
      const x = p.x + u[0] * d;
      const z = p.z + u[1] * d;
      // Out in the wild, away from the path and the town
      if (Math.hypot(x, z) < 200 || trailNear(x, z, 60).distance < 60) continue;
      const y = heightAt(x, z);
      // Well clear of the land all the way, so the felled wedge alone opens it
      if (!inSight(eye, [x, y + 1.5, z], 2.2)) continue;
      const s = -Math.abs(y - (eye[1] + 3)) * 0.5 - Math.abs(d - 290) * 0.03;
      if (s > score) {
        score = s;
        best = [x, y, z];
      }
    }
  }
  return best ?? [p.x + 250, heightAt(p.x + 250, p.z), p.z];
})();

const toward = (along: number, at: XZ) => {
  const p = trailAt(along);
  return (Math.atan2(at[0] - p.x, at[1] - p.z) / deg + 360) % 360;
};
/** Where the trees fall away: from beside the path, a wedge of open ground toward what's there. */
export const VIEWS = [
  { along: 200, dir: toward(200, TOWN), reach: 175, spread: 20 },
  { along: 640, dir: toward(640, [FIRE[0], FIRE[2]]), reach: Math.hypot(FIRE[0] - trailAt(640).x, FIRE[2] - trailAt(640).z) - 12, spread: 12 },
  { along: 880, dir: 192, reach: 112, spread: 16 },
].map((v) => {
  const p = trailAt(v.along);
  const d = bearing(v.dir);
  // On the side of the path the view is on
  const right = Math.cos(p.heading) * d[0] - Math.sin(p.heading) * d[1] > 0 ? 1 : -1;
  const at = besidePath(v.along, right * 2.2);
  return { ...v, at, d, right };
});

/** The valley below the last view, where the herd is grazing in the open grass. */
export const HERD = (() => {
  const v = VIEWS[2]!;
  // Close enough below to make out, in a glade on the slope
  const x = v.at[0] + v.d[0] * 100;
  const z = v.at[1] + v.d[1] * 100;
  return { x, z, r: 18 };
})();

/** The watcher's fire and the lit windows of a hamlet beside it, as points of light far off. */
export const FAR_LAMPS: { at: V3; color: V3; strength: number }[] = (() => {
  const out: { at: V3; color: V3; strength: number }[] = [];
  const r = rng(515);
  out.push({ at: [FIRE[0], FIRE[1] + 0.9, FIRE[2]], color: [1, 0.45, 0.15], strength: 26 });
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const o = 14 + r() * 40;
    const x = FIRE[0] + Math.cos(a) * o;
    const z = FIRE[2] + Math.sin(a) * o;
    out.push({ at: [x, heightAt(x, z) + 1.4, z], color: [1, 0.62, 0.3], strength: 7 + r() * 6 });
  }
  return out;
})();

// ---------------------------------------------------------------- brooks

export const BROOK_HALF = 0.7;
/** The brooks that cross the path, each traced down the land from where it crosses. */
export const BROOKS = [305, 690, 955].map((along) => {
  const p = trailAt(along);
  const step = 1.5;
  const grad = (x: number, z: number): XZ => [heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5)];
  const trace = (sign: number, metres: number) => {
    const out: XZ[] = [];
    let [x, z] = [p.x, p.z];
    // Start across the path, so it doesn't run down the path itself
    let dir: XZ = [Math.cos(p.heading) * sign, -Math.sin(p.heading) * sign];
    for (let s = 0; s < metres; s += step) {
      const g = grad(x, z);
      const len = Math.hypot(g[0], g[1]) || 1;
      // Downhill (or up, for the stretch above the path), held to its last heading a little
      const want: XZ = [(-g[0] / len) * sign, (-g[1] / len) * sign];
      const k = s < 6 ? 0.15 : 0.45;
      dir = [dir[0] * (1 - k) + want[0] * k, dir[1] * (1 - k) + want[1] * k];
      const dl = Math.hypot(dir[0], dir[1]) || 1;
      dir = [dir[0] / dl, dir[1] / dl];
      x += dir[0] * step;
      z += dir[1] * step;
      if (s > 10 && trailNear(x, z, 6).distance < 4) break;
      out.push([x, z]);
    }
    return out;
  };
  // Whichever side of the path is lower is downstream
  const l = besidePath(along, -6);
  const r = besidePath(along, 6);
  const down = heightAt(...r) < heightAt(...l) ? 1 : -1;
  const below = trace(down, 70);
  const above = trace(-down, 45);
  const pts: XZ[] = [...above.reverse(), [p.x, p.z], ...below];
  // The water's height: just above the land, never rising downstream
  const ys: number[] = [];
  let y = Infinity;
  for (const q of pts) {
    y = Math.min(y, heightAt(q[0], q[1]) + 0.05);
    ys.push(y);
  }
  return { along, pts, ys };
});

/** How far x, z is from the nearest brook's line. */
export function brookDistance(x: number, z: number) {
  let best = Infinity;
  for (const b of BROOKS) {
    for (let i = 0; i + 1 < b.pts.length; i++) {
      const [ax, az] = b.pts[i]!;
      const [bx, bz] = b.pts[i + 1]!;
      if (Math.abs(x - ax) > 30 || Math.abs(z - az) > 30) continue;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const ex = x - ax - dx * t;
      const ez = z - az - dz * t;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------- the elephant crossing

/** Where a herd crossed the path tonight, coming down toward the brook. */
export const CROSSING = (() => {
  const along = 405;
  const p = trailAt(along);
  // Across the path at a slant
  const a = p.heading + 70 * deg;
  const d: XZ = [Math.sin(a), Math.cos(a)];
  const pts: XZ[] = [];
  for (let s = -45; s <= 45; s += 1.5) {
    const bend = Math.sin(s / 14) * 2.2;
    pts.push([p.x + d[0] * s + d[1] * bend, p.z + d[1] * s - d[0] * bend]);
  }
  return { along, at: [p.x, p.z] as XZ, d, pts, half: 1.4 };
})();

export function crossingDistance(x: number, z: number) {
  let best = Infinity;
  const pts = CROSSING.pts;
  if (Math.hypot(x - CROSSING.at[0], z - CROSSING.at[1]) > 60) return best;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// ---------------------------------------------------------------- rocks

type Rock = { x: number; z: number; r: number; tall: number; seed: number };
/** Boulders scattered beside the path, and outcrops it squeezes between. */
export const ROCKS: Rock[] = (() => {
  const out: Rock[] = [];
  const r = rng(808);
  const free = (x: number, z: number, size: number) =>
    trailNear(x, z, size + 4).distance > trailWidth(0) / 2 + size + 0.3 &&
    riverCut(x, z) < 0.3 &&
    !onBridge(x, z, 4) &&
    brookDistance(x, z) > BROOK_HALF + size + 0.2 &&
    crossingDistance(x, z) > CROSSING.half + size;
  // Outcrops: big domed granite either side of the path
  for (const along of [235, 590, 800, 915]) {
    for (const side of [-1, 1]) {
      const size = 1.8 + r() * 1.6;
      const [x, z] = besidePath(along + (r() - 0.5) * 3, side * (trailWidth(along) / 2 + size + 0.5));
      if (free(x, z, size * 0.9)) out.push({ x, z, r: size, tall: 0.6 + r() * 0.35, seed: r() });
      // Smaller ones heaped against it
      for (let k = 0; k < 3; k++) {
        const s2 = 0.4 + r() * 0.8;
        const [x2, z2] = besidePath(along + (r() - 0.5) * 10, side * (trailWidth(along) / 2 + s2 + 0.6 + r() * 5));
        if (free(x2, z2, s2)) out.push({ x: x2, z: z2, r: s2, tall: 0.55 + r() * 0.3, seed: r() });
      }
    }
  }
  // Boulders all along, in ones and twos
  for (let along = 70; along < TRAIL_LENGTH - 30; along += 9 + r() * 16) {
    const n = 1 + Math.floor(r() * 3);
    const side = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < n; k++) {
      const size = 0.25 + r() ** 2 * 1.3;
      const [x, z] = besidePath(along + (r() - 0.5) * 4, side * (trailWidth(along) / 2 + size + 0.4 + r() ** 1.5 * 12));
      if (free(x, z, size)) out.push({ x, z, r: size, tall: 0.5 + r() * 0.4, seed: r() });
    }
  }
  return out;
})();

// ---------------------------------------------------------------- shrines

export const SHRINES = [
  { along: 140, kind: 'stone' as const, side: 1 },
  { along: 470, kind: 'naga' as const, side: -1 },
  { along: 765, kind: 'hut' as const, side: 1 },
].map((s) => {
  const p = trailAt(s.along);
  const [x, z] = besidePath(s.along, s.side * (trailWidth(s.along) / 2 + 1.6));
  // Facing the path
  const yaw = p.heading + (s.side > 0 ? -Math.PI / 2 : Math.PI / 2);
  return { ...s, x, z, yaw };
});

// ---------------------------------------------------------------- what to look at closely

export type Interest = { id?: import('./bungalow-story.ts').BungalowInteraction; x: number; z: number; r: number; text: string; low: boolean; label?: string; sit?: boolean };
function dungPosition(s: number, side: number): XZ {
  const i = Math.round((s + 45) / 1.5);
  const [x0, z0] = CROSSING.pts[Math.min(Math.max(i, 0), CROSSING.pts.length - 1)]!;
  const x = x0 - CROSSING.d[1] * side;
  const z = z0 + CROSSING.d[0] * side;
  return [x, z];
}

export const INTEREST: readonly Interest[] = (() => {
  const points: Interest[] = [];
  const fresh = dungPosition(3.5, 0.5);
  const [cx, cz] = CROSSING.pts[Math.round(CROSSING.pts.length * 0.72)]!;
  points.push({ x: fresh[0], z: fresh[1], r: 3.2, low: true, text: 'Elephant dung. Fresh. Still warm, the flies not yet found it. The herd came through tonight.' });
  points.push({ x: CROSSING.at[0], z: CROSSING.at[1], r: 3.5, low: true, text: 'Footprints, big as dinner plates, their edges still crisp and wet. They cross the path and go down toward the water.' });
  points.push({ x: cx, z: cz, r: 3, low: true, text: 'Bamboo snapped off and stripped of its leaves. They were feeding as they went.' });
  for (const [i, v] of VIEWS.entries()) {
    const text = [
      "The trees open here. Back down there, the town's lamps, and the temple's among them. Already small.",
      'Across the valley, on the far ridge, a fire, and a few lamps near it: a hamlet, a watcher up all night keeping the elephants off the crop.',
      'Down in the moonlit grass of the valley, grey shapes moving slowly. A herd of elephants. Best keep walking, quietly.',
    ][i]!;
    points.push({ x: v.at[0], z: v.at[1], r: 4, low: false, text });
  }
  // ---- what to look at, at the shrines and brooks
  const shrineText = {
    stone: 'A stone daubed with vermilion and turmeric, a trident hung with bells beside it. The lamp has been lit tonight. Someone passed this way not long ago.',
    naga: "Serpent stones, the cobras worn smooth with age, smeared with turmeric. Offerings to the nagas who keep the forest.",
    hut: "A wayside shrine no bigger than a kennel. Marigolds, half a coconut, a wick still burning. Whoever left them asked for a safe night's walk.",
  };
  for (const s of SHRINES) points.push({ x: s.x, z: s.z, r: 3.2, low: true, text: shrineText[s.kind] });
  const brookText = [
    'A brook, cold and quick off the hill. Step on the stones.',
    'Water talking over the stones in the dark. Somewhere upstream a frog has gone quiet.',
    'The last brook. The air is cooler here, and smells of wet leaves.',
  ];
  BROOKS.forEach((br, i) => {
    const p = trailAt(br.along);
    points.push({ x: p.x, z: p.z, r: 2.5, low: true, text: brookText[i]! });
  });
  return points;
})();

// ---------------------------------------------------------------- what keeps trees away

/** Whether a tree may stand at x, z: not in the views, on the rocks, in the brooks or the crossing. */
/**
 * A glade right beside the path, some way past the river, where a small herd is feeding: a cow,
 * her sister and a calf. The path runs past within a stone's throw, so you have to creep by.
 */
export const GLADE = (() => {
  let best = { x: 0, z: 0, along: 0, facing: 0, score: -Infinity };
  for (let along = 715; along <= 745; along += 5) {
    const p = trailAt(along);
    for (const side of [-1, 1]) {
      const rx = Math.cos(p.heading) * side;
      const rz = -Math.sin(p.heading) * side;
      const x = p.x + rx * 15;
      const z = p.z + rz * 15;
      if (trailNear(x, z, 14).distance < 12) continue;
      if (brookDistance(x, z) < 12) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let a = 0; a < 8; a++) {
        const h = heightAt(x + Math.sin(a) * 9, z + Math.cos(a) * 9);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      const score = -(hi - lo) - Math.abs(heightAt(x, z) - heightAt(p.x, p.z)) * 0.5;
      if (score > best.score) best = { x, z, along, facing: Math.atan2(p.x - x, p.z - z), score };
    }
  }
  return { x: best.x, z: best.z, along: best.along, facing: best.facing, r: 11 };
})();

export function treeFree(x: number, z: number) {
  if (Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r + 2) return false;
  if (!machanFree(x, z, 2)) return false;
  for (const v of VIEWS) {
    const dx = x - v.at[0];
    const dz = z - v.at[1];
    const dist = Math.hypot(dx, dz);
    if (dist < 14) return false;
    // A wedge widened by a crown's spread, so no branches reach in over it
    const along = dx * v.d[0] + dz * v.d[1];
    const off = Math.abs(dx * v.d[1] - dz * v.d[0]);
    if (along > -6 && along < v.reach + 8 && off < Math.max(along, 0) * Math.tan(v.spread * deg) + 9) return false;
  }
  if (Math.hypot(x - HERD.x, z - HERD.z) < HERD.r) return false;
  if (Math.hypot(x - FIRE[0], z - FIRE[2]) < 10) return false;
  for (const s of SHRINES) if (Math.hypot(x - s.x, z - s.z) < 3.5) return false;
  return plantFree(x, z, 1.2);
}

/** Whether a small plant may grow at x, z. */
export function plantFree(x: number, z: number, margin = 0) {
  if (Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r - 2 + margin) return false;
  if (!machanFree(x, z, margin - 0.8)) return false;
  // Low grass only at the lookouts: nothing tall between you and the view
  for (const v of VIEWS) {
    const dx = x - v.at[0];
    const dz = z - v.at[1];
    const dist = Math.hypot(dx, dz);
    if (dist < 5) return false;
    if (dist < 40 && (dx * v.d[0] + dz * v.d[1]) / dist > Math.cos((v.spread + 15) * deg)) return false;
  }
  for (const k of ROCKS) if (Math.abs(x - k.x) < k.r + 1 + margin && Math.hypot(x - k.x, z - k.z) < k.r * 0.85 + margin) return false;
  if (brookDistance(x, z) < BROOK_HALF + 0.2 + margin) return false;
  if (crossingDistance(x, z) < CROSSING.half + margin) return false;
  for (const s of SHRINES) if (Math.hypot(x - s.x, z - s.z) < 1.6) return false;
  // Nothing over the dung, the prints, the snapped bamboo, the brook's things: they're on the ground to be seen
  for (const it of INTEREST) if (it.low && Math.hypot(x - it.x, z - it.z) < 1.4 + margin * 0.5) return false;
  return true;
}

// ---------------------------------------------------------------- building it

const GRANITE: Mat[] = [0x55524c, 0x4a4842, 0x605a50].map((h) => ({ color: hex(h), roughness: 0.75, pattern: P.GRANITE }));
const LICHEN: Mat = { color: hex(0x4a5236), roughness: 0.85, pattern: P.GRANITE };
const WATER: Mat = { color: hex(0x0b1210), roughness: 0.05, pattern: P.BROOK };
const WET_STONE: Mat = { color: hex(0x2e2c28), roughness: 0.25, pattern: P.GRANITE };
const VERMILION: Mat = { color: hex(0xa8160c), roughness: 0.55, pattern: P.PLAIN };
const TURMERIC: Mat = { color: hex(0xd09a14), roughness: 0.6, pattern: P.PLAIN };
const CLOTH_RED: Mat = { color: hex(0x9a1410), roughness: 0.8, pattern: P.CLOTH, doubleSided: true };
const MARIGOLD: Mat = { color: hex(0xe87a10), roughness: 0.7, pattern: P.FLOWER };
const CLAY: Mat = { color: hex(0x7a3a1c), roughness: 0.8, pattern: P.PLAIN };
const IRON: Mat = { color: hex(0x1c1a18), roughness: 0.5, metallic: 0.6, pattern: P.STEEL };
const COCONUT: Mat = { color: hex(0x4a3018), roughness: 0.8, pattern: P.PLAIN };
const KERNEL: Mat = { color: hex(0xe8e0cc), roughness: 0.6, pattern: P.PLAIN };
const DUNG: Mat = { color: hex(0x5c4a2a), roughness: 0.72, pattern: P.BARK };
const DUNG_OLD: Mat = { color: hex(0x6e6248), roughness: 0.92, pattern: P.BARK };
/** Undigested grass and bark fibre, the straw an elephant leaves in its dung. */
const FIBRE: Mat = { color: hex(0x8a7a50), roughness: 0.9, pattern: P.PLAIN };
const PRINT: Mat = { color: hex(0x1a120a), roughness: 0.35, pattern: P.PLAIN };
const BAMBOO: Mat = { color: hex(0x6a7a2a), roughness: 0.5, pattern: P.PALM_BARK };
const BAMBOO_DRY: Mat = { color: hex(0x8a7a4a), roughness: 0.7, pattern: P.PALM_BARK };
const BAMBOO_LEAF: Mat = { color: hex(0x4a6a1c), roughness: 0.6, pattern: P.FROND, doubleSided: true };
const HIDE: Mat = { color: hex(0x6a645c), roughness: 0.9, pattern: P.PLAIN };
const EMBER: Mat = { color: [0, 0, 0], roughness: 1, emission: [9, 3.2, 0.8], pattern: P.BULB };

const g = (x: number, z: number) => heightAt(x, z);

function rock(b: Builder, k: Rock) {
  const y = g(k.x, k.z);
  const mat = GRANITE[Math.floor(k.seed * 3)]!;
  const h = k.r * k.tall;
  b.blob(mat, [k.x, y - h * 0.25, k.z], [k.r, h, k.r * (0.75 + k.seed * 0.45)], 9, 6, 0.18);
  // Lichen on its shoulder
  if (k.r > 0.8) b.blob(LICHEN, [k.x + k.r * 0.15, y + h * 0.45, k.z - k.r * 0.1], [k.r * 0.6, h * 0.42, k.r * 0.55], 7, 4, 0.2);
  if (k.r > 0.45) b.solids.push({ kind: 'cyl', c: [k.x, y - 0.2, k.z], r: k.r * 0.85, h: h * 0.75 + 0.2 });
}

function brook(b: Builder, br: (typeof BROOKS)[number]) {
  const { pts, ys } = br;
  const n = pts.length;
  const at = (u: number, v: number): V3 => {
    const f = v * (n - 1);
    const i = Math.min(Math.floor(f), n - 2);
    const t = f - i;
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const o = (u - 0.5) * 2 * BROOK_HALF;
    return [ax + dx * t - (dz / len) * o, ys[i]! + (ys[i + 1]! - ys[i]!) * t, az + dz * t + (dx / len) * o];
  };
  b.surface(WATER, 2, (n - 1) * 2, at, true);
  // Pebbles and stones along its edges and in it, wet and dark
  const r = rng(Math.round(br.along));
  for (let i = 0; i < n * 3; i++) {
    const v = r();
    const u = r() < 0.7 ? (r() < 0.5 ? -0.05 - r() * 0.25 : 1.05 + r() * 0.25) : r();
    const p = at(Math.min(Math.max(u, -0.4), 1.4), v);
    if (trailNear(p[0], p[2], 3).distance < 1.3) continue;
    const s = 0.06 + r() ** 2 * 0.3;
    b.blob(WET_STONE, [p[0], Math.min(p[1], g(p[0], p[2])) + s * 0.15, p[2]], [s * (1 + r() * 0.5), s * 0.5, s], 6, 3, 0.25);
  }
  // Stepping stones across, where the path goes over
  const p = trailAt(br.along);
  const hx = Math.sin(p.heading);
  const hz = Math.cos(p.heading);
  for (let k = -2; k <= 2; k++) {
    const x = p.x + hx * k * 0.55 + (r() - 0.5) * 0.15;
    const z = p.z + hz * k * 0.55 + (r() - 0.5) * 0.15;
    const top = Math.max(g(x, z), ys[Math.floor((n - 1) / 2)] ?? g(x, z)) + 0.1;
    b.blob(GRANITE[k & 1]!, [x, top - 0.12, z], [0.28, 0.13, 0.24], 8, 4, 0.15);
  }
}

function lampAt(lamps: Lamp[], b: Builder, at: V3, seed: number, strength = 1) {
  // A clay lamp with a lit wick
  b.lathe(CLAY, at, [[0.0, 0], [0.05, 0.005], [0.06, 0.02], [0.045, 0.035], [0.0, 0.025]], 8);
  b.flame(M.flame, [at[0], at[1] + 0.03, at[2]], 0.05);
  lamps.push({ position: [at[0], at[1] + 0.12, at[2]], color: [1, 0.58, 0.24], intensity: 1.3 * strength, range: 6, kind: 'oil', seed });
}

function shrine(b: Builder, lamps: Lamp[], s: (typeof SHRINES)[number]) {
  const y = g(s.x, s.z);
  b.with({ at: [s.x, y, s.z], yaw: s.yaw }, () => {
    if (s.kind === 'stone') {
      // The forest's own: a rough upright stone daubed red and yellow, a trident planted beside
      // it hung with bells and strips of red cloth, a lamp at its foot
      b.blob(GRANITE[1]!, [0, 0.3, 0], [0.26, 0.45, 0.2], 8, 6, 0.2);
      b.blob(VERMILION, [0, 0.42, 0.06], [0.2, 0.3, 0.16], 8, 5, 0.15);
      b.blob(TURMERIC, [0, 0.5, 0.12], [0.08, 0.1, 0.06], 6, 4);
      b.box(GRANITE[2]!, [0, 0.03, 0.35], [0.4, 0.04, 0.22]);
      b.tube(IRON, [0.45, -0.1, 0], 0.012, 0.012, 1.7, 5);
      b.bar(IRON, [0.33, 1.5, 0], [0.57, 1.5, 0], 0.012);
      for (const u of [-0.12, 0, 0.12]) b.bar(IRON, [0.45 + u, 1.5, 0], [0.45 + u * 1.1, u === 0 ? 1.8 : 1.68, 0], 0.01);
      for (const [u, h] of [[-0.1, 1.2], [0.08, 1.1], [0.0, 0.95]] as const) {
        b.box(IRON, [0.45 + u, h + 0.12, 0], [0.003, 0.1, 0.003]);
        b.blob(M.brass, [0.45 + u, h, 0], [0.035, 0.04, 0.035], 6, 4);
      }
      for (let i = 0; i < 4; i++) b.box(CLOTH_RED, [0.47, 1.3 - i * 0.04, 0.02], [0.02, 0.12 + i * 0.02, 0.005]);
      lampAt(lamps, b, [0, 0.07, 0.38], 0.41);
      b.blob(MARIGOLD, [-0.15, 0.08, 0.34], [0.05, 0.03, 0.05], 6, 3, 0.4);
      b.blob(MARIGOLD, [0.15, 0.08, 0.36], [0.05, 0.03, 0.05], 6, 3, 0.4);
    } else if (s.kind === 'naga') {
      // Serpent stones: slabs carved with rearing cobras, set in a row on a laterite ledge, worn
      // smooth and smeared with turmeric, under the trees that are theirs
      b.box(M.laterite, [0, 0.12, 0], [1.1, 0.14, 0.4], 'y-');
      const slabs = [[-0.7, 0.62, 12], [0, 0.82, 12], [0.7, 0.58, 12]] as const;
      for (const [x, h, tile] of slabs) {
        b.box(GRANITE[0]!, [x, 0.26 + h / 2, -0.05], [0.24, h / 2, 0.06]);
        b.board([x, 0.26 + h / 2, 0.012], [0, 0, 1], 0.46, h * 0.98, tile);
        b.blob(TURMERIC, [x, 0.26 + h * 0.75, 0.02], [0.06, 0.05, 0.015], 5, 3);
      }
      lampAt(lamps, b, [0.35, 0.27, 0.25], 0.43, 0.9);
      b.blob(MARIGOLD, [-0.35, 0.29, 0.25], [0.06, 0.03, 0.06], 6, 3, 0.4);
    } else {
      // A wayside shrine no bigger than a dog's kennel: laterite walls, a little tiled roof, the
      // goddess inside a dark niche, a lamp burning, marigolds and half a coconut left for her
      b.box(M.laterite, [0, 0.15, 0], [0.55, 0.15, 0.5], 'y-');
      b.box(M.laterite, [-0.42, 0.62, 0], [0.1, 0.32, 0.42]);
      b.box(M.laterite, [0.42, 0.62, 0], [0.1, 0.32, 0.42]);
      b.box(M.laterite, [0, 0.62, -0.36], [0.52, 0.32, 0.08]);
      b.box(M.lateriteDark, [0, 0.31, 0.02], [0.32, 0.01, 0.34]);
      b.roof(M.tile, [0, 0, 0], [0.7, 0.62], [0.2, 0.05], 0.94, 1.32, { sag: 0.02, rows: 3 });
      b.blob(VERMILION, [0, 0.52, -0.22], [0.09, 0.18, 0.07], 7, 5);
      b.blob(M.brass, [0, 0.72, -0.2], [0.07, 0.04, 0.04], 6, 3);
      lampAt(lamps, b, [0, 0.32, 0.08], 0.47, 0.9);
      // A garland over the opening, half a coconut on the step
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        b.blob(MARIGOLD, [-0.32 + t * 0.64, 0.92 - Math.sin(t * Math.PI) * 0.16, 0.36], [0.03, 0.03, 0.03], 5, 3, 0.4);
      }
      b.with({ at: [0.3, 0.32, 0.42], yaw: 0 }, () => {
        b.lathe(COCONUT, [0, 0, 0], [[0.0, 0], [0.08, 0.02], [0.09, 0.06], [0.085, 0.07]], 8);
        b.lathe(KERNEL, [0, 0.005, 0], [[0.0, 0.03], [0.07, 0.04], [0.078, 0.066]], 8);
      });
      b.blob(MARIGOLD, [-0.3, 0.34, 0.42], [0.06, 0.03, 0.06], 6, 3, 0.4);
    }
  });
}

/**
 * A clump of bamboo, the thorny kind (Bambusa bambos) of the Ghats' lower slopes: culms packed
 * tight at the root, rising straight and then arching out and over like a fountain, a few dead
 * and straw-yellow, a tangle of thorny side shoots round the foot, leaf sprays hanging along the
 * upper culms.
 */
export function bambooClump(b: Builder, r: () => number, size = 1) {
  const n = 22 + Math.floor(r() * 12);
  // The clump leans toward its open side, its culms longer and more arched there
  const side = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const toward = Math.cos(a - side);
    const o = Math.sqrt(r()) * 0.7;
    const lean = 0.12 + r() * 0.3 + toward * 0.08;
    const tall = (7 + r() * 5) * size * (1 + toward * 0.1);
    const dead = r() < 0.1;
    const pts: V3[] = [];
    const radii: number[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const out = o + lean * tall * Math.pow(t, 2.2);
      pts.push([Math.sin(a) * out, tall * t * (1 - lean * 0.55 * t * t), Math.cos(a) * out]);
      radii.push(0.06 * (1 - t * 0.75) * size);
    }
    b.sweep(dead ? BAMBOO_DRY : BAMBOO, pts, radii, 5);
    if (dead) continue;
    // Leaf sprays from the upper culm, drooping off its outer side
    const sprays = 4 + Math.floor(r() * 3);
    for (let k = 0; k < sprays; k++) {
      const t = 0.45 + (k / sprays) * 0.55;
      const p = pts[Math.min(Math.round(t * 8), 8)]!;
      frondish(b, p, a + (r() - 0.5) * 2.4, 0.9 + r() * 0.9, r);
    }
  }
  // Thorny side shoots tangled round the foot
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    const y = 0.2 + r() * 1.8 * size;
    const from: V3 = [Math.sin(a) * 0.5, y, Math.cos(a) * 0.5];
    const L = 0.5 + r() * 0.9;
    const to: V3 = [Math.sin(a + (r() - 0.5)) * (0.5 + L), y + (r() - 0.6) * 0.5, Math.cos(a + (r() - 0.5)) * (0.5 + L)];
    b.sweep(BAMBOO_DRY, [from, to], [0.012, 0.004], 3);
  }
}
function frondish(b: Builder, base: V3, yaw: number, length: number, r: () => number) {
  // A thin drooping twig with narrow lance-shaped leaves along it
  const leaves = 7;
  for (let i = 1; i <= leaves; i++) {
    const t = i / leaves;
    const x = Math.sin(yaw) * length * t;
    const z = Math.cos(yaw) * length * t;
    const y = -length * t * t * 0.6;
    const side = i % 2 ? 1 : -1;
    const ya = yaw + side * (0.7 + r() * 0.5);
    const L = 0.22 + r() * 0.1;
    const at: V3 = [base[0] + x, base[1] + y, base[2] + z];
    const drop = 0.1 + r() * 0.1;
    const tip: V3 = [at[0] + Math.sin(ya) * L, at[1] - drop, at[2] + Math.cos(ya) * L];
    const w = 0.022;
    const nx = Math.cos(ya) * w;
    const nz = -Math.sin(ya) * w;
    const m: V3 = [at[0] + Math.sin(ya) * L * 0.35, at[1] - drop * 0.25, at[2] + Math.cos(ya) * L * 0.35];
    b.card(BAMBOO_LEAF, at, [m[0] + nx, m[1], m[2] + nz], tip, [m[0] - nx, m[1], m[2] - nz], [0, 1, 0]);
  }
}

/** An elephant, standing or grazing: the herd seen far off, so shape over detail. */
function elephant(b: Builder, at: V3, yaw: number, size: number, grazing: boolean) {
  b.with({ at, yaw }, () => {
    const s = size;
    const leg = 1.35 * s;
    b.blob(HIDE, [0, leg + 0.75 * s, 0], [0.85 * s, 0.85 * s, 1.45 * s], 10, 7, 0.06);
    b.blob(HIDE, [0, leg + 1.05 * s, -0.5 * s], [0.75 * s, 0.6 * s, 0.8 * s], 8, 5);
    for (const [x, z] of [[-0.45, 0.85], [0.45, 0.9], [-0.45, -0.85], [0.45, -0.8]] as const) b.tube(HIDE, [x * s, 0, z * s], 0.27 * s, 0.24 * s, leg + 0.4 * s, 8);
    const hy = grazing ? leg + 0.55 * s : leg + 1.05 * s;
    const hz = 1.75 * s;
    b.blob(HIDE, [0, hy, hz], [0.5 * s, 0.6 * s, 0.5 * s], 8, 6);
    for (const side of [-1, 1]) b.blob(HIDE, [side * 0.55 * s, hy + 0.05 * s, hz - 0.2 * s], [0.08 * s, 0.55 * s, 0.45 * s], 6, 4);
    const trunk: V3[] = grazing
      ? [[0, hy - 0.2 * s, hz + 0.35 * s], [0, hy - 0.8 * s, hz + 0.55 * s], [0, 0.4 * s, hz + 0.7 * s], [0.1, 0.05, hz + 0.95 * s]]
      : [[0, hy - 0.2 * s, hz + 0.35 * s], [0, hy - 0.9 * s, hz + 0.5 * s], [0, hy - 1.6 * s, hz + 0.45 * s], [0, 0.35 * s, hz + 0.6 * s]];
    b.sweep(HIDE, trunk, [0.18 * s, 0.14 * s, 0.1 * s, 0.07 * s], 6);
    b.sweep(HIDE, [[0, leg + 1.1 * s, -1.4 * s], [0, leg + 0.4 * s, -1.55 * s], [0, leg - 0.1 * s, -1.5 * s]], [0.05 * s, 0.03 * s, 0.02 * s], 4);
  });
}

export function buildJungle(b: Builder) {
  const lamps: Lamp[] = [];
  const r = rng(4242);
  for (const k of ROCKS) rock(b, k);
  for (const br of BROOKS) brook(b, br);
  for (const s of SHRINES) shrine(b, lamps, s);

  // ---- the elephant crossing: prints, dung, snapped bamboo and a sapling pushed over
  b.open(() => {
    const pts = CROSSING.pts;
    let foot = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      // Two lines of prints, the hind feet stepping into the fore
      for (let t = 0; t < len; t += 1.1) {
        foot++;
        if (r() < 0.25) continue;
        const side = foot % 2 ? 0.55 : -0.55;
        const x = ax + (dx * t) / len - (dz / len) * side + (r() - 0.5) * 0.2;
        const z = az + (dz * t) / len + (dx / len) * side + (r() - 0.5) * 0.2;
        const y = g(x, z);
        const rad = 0.2 + r() * 0.06;
        b.surface(PRINT, 10, 2, (u, v) => {
          const a = u * Math.PI * 2;
          const rr = rad * (v === 0 ? 0 : v < 0.75 ? v * 1.0 : 1.08);
          const lift = v === 1 ? 0.025 : 0.012 - (1 - v) * 0.004;
          return [x + Math.cos(a) * rr, y + lift, z + Math.sin(a) * rr];
        }, true);
      }
    }
    // Dung: a few heaps of boluses where they paused, fibrous and still moist
    const dungAt = (s: number, side: number, fresh: boolean) => {
      const [x, z] = dungPosition(s, side);
      // Boluses the size of a coconut, slumped where they fell, one or two broken open
      for (let k = 0; k < 7; k++) {
        const a = r() * Math.PI * 2;
        const o = r() * 0.3;
        const px = x + Math.cos(a) * o;
        const pz = z + Math.sin(a) * o;
        const s2 = 0.09 + r() * 0.04;
        const flat = fresh ? 0.7 : 0.55;
        b.blob(fresh ? DUNG : DUNG_OLD, [px, g(px, pz) + s2 * flat * 0.8 + (k > 4 ? s2 * 0.9 : 0), pz], [s2 * 1.1, s2 * flat, s2 * 1.2], 8, 5, 0.35);
      }
      // Loose fibre scattered round the heap
      for (let k = 0; k < 14; k++) {
        const a = r() * Math.PI * 2;
        const o = 0.15 + r() * 0.4;
        const px = x + Math.cos(a) * o;
        const pz = z + Math.sin(a) * o;
        const t = r() * Math.PI;
        const l = 0.04 + r() * 0.05;
        const y = g(px, pz) + 0.012;
        b.sweep(FIBRE, [[px - Math.cos(t) * l, y, pz - Math.sin(t) * l], [px + Math.cos(t) * l, y + 0.01, pz + Math.sin(t) * l]], [0.006, 0.004], 3);
      }
    };
    dungAt(3.5, 0.5, true);
    dungAt(-9, -0.3, false);
    // Bamboo snapped and stripped, a clump trampled half flat
    const [cx, cz] = pts[Math.round(pts.length * 0.72)]!;
    const cr = rng(99);
    for (let k = 0; k < 7; k++) {
      const a = cr() * Math.PI * 2;
      const L = 2.5 + cr() * 3;
      const x = cx + Math.cos(a) * 0.6;
      const z = cz + Math.sin(a) * 0.6;
      const y = g(x, z) + 0.06;
      b.bar(k % 3 ? BAMBOO_DRY : BAMBOO, [x, y, z], [x + Math.cos(a) * L, g(x + Math.cos(a) * L, z + Math.sin(a) * L) + 0.05, z + Math.sin(a) * L], 0.045);
    }
    for (let k = 0; k < 6; k++) {
      const a = cr() * Math.PI * 2;
      const x = cx + 1.8 + Math.cos(a) * 0.4;
      const z = cz + Math.sin(a) * 0.4;
      b.tube(BAMBOO, [x, g(x, z) - 0.05, z], 0.05, 0.045, 0.4 + cr() * 0.6, 5);
    }
  });

  // ---- the views: a flat rock to stand on, and what's out there
  for (const v of VIEWS) {
    // A flat rock to sit on, beside and behind you, out of the view
    const px = v.at[0] - v.d[0] * 1.6 + v.d[1] * 1.4;
    const pz = v.at[1] - v.d[1] * 1.6 - v.d[0] * 1.4;
    b.blob(GRANITE[2]!, [px, g(px, pz) - 0.2, pz], [0.9, 0.42, 0.7], 9, 5, 0.12);

  }
  // The watcher's fire and his hut on the far ridge
  {
    const [x, y, z] = FIRE;
    b.blob(EMBER, [x, y + 0.3, z], [0.5, 0.35, 0.5], 6, 4);
    b.flame(M.flame, [x, y + 0.3, z], 1.4);
    lamps.push({ position: [x, y + 1.2, z], color: [1, 0.5, 0.2], intensity: 6, range: 14, kind: 'oil', seed: 0.51 });
    b.box(HIDE, [x + 2.5, y + 1.2, z + 1], [1.2, 1.2, 1]);
    b.roof(M.tile, [x + 2.5, y, z + 1], [1.6, 1.4], [0.2, 0.05], 2.3, 3.3, { sag: 0.02, rows: 3 });
  }
  // The herd grazing in the valley: two big cows, a younger one, a calf at its mother's side
  {
    const herd = [
      [0, 0, 0.4, 1.0, true],
      [7, 4, -0.6, 0.95, false],
      [-5, 6, 1.2, 0.8, true],
      [1.8, 1.5, 0.5, 0.45, false],
      [-9, -4, 2.3, 1.05, true],
    ] as const;
    for (const [dx, dz, yaw, size, grazing] of herd) {
      const x = HERD.x + dx;
      const z = HERD.z + dz;
      elephant(b, [x, g(x, z) - 0.05, z], yaw, size, grazing);
    }
  }

  return { lamps };
}
