// The forest bungalow at the end of the path: an old Forest Department inspection bungalow from
// the British years, the kind still kept up in the Ghats. Limewashed walls on a high laterite
// plinth, a deep veranda on square pillars across the front, a hipped roof of Mangalore tiles,
// tall windows with green shutters. Someone's here: the hurricane lantern is lit on the veranda,
// two windows glow, and a lamp post at the edge of the clearing shows the way in from the dark.

import { Builder, hex, P, type Mat, type V3 } from './geo.ts';
import type { Lamp } from './flicker.ts';
import { M } from './world.ts';
import { heightAt } from './terrain.ts';
import { CLEARING, TRAIL_LENGTH, trailAt } from './trail.ts';

import placement from './content/bungalow-placement.json';

const LIME: Mat = { color: hex(0xe6e0d0), roughness: 0.9, pattern: P.PLASTER };
const SHUTTER: Mat = { color: hex(0x2f5a3a), roughness: 0.65, pattern: P.PAINT };
const FRAME: Mat = { color: hex(0x3a2418), roughness: 0.6, pattern: P.WOOD };
const FLOOR: Mat = { color: hex(0x7a2a1c), roughness: 0.45, pattern: P.PAINT };
const IRON: Mat = { color: hex(0x1c1a18), roughness: 0.5, metallic: 0.6, pattern: P.STEEL };
/** The same warm pane as the town's lit windows, so no new glowing part. */
const WINDOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [2.6, 1.5, 0.55], pattern: P.BULB };
const LANTERN: Mat = { color: [0, 0, 0], roughness: 1, emission: [2.2, 1.25, 0.5], pattern: P.BULB };
const PAPER: Mat = { color: hex(0xd8d0b8), roughness: 0.9, pattern: P.PLAIN };
const DARK: Mat = { color: hex(0x0a0908), roughness: 1, pattern: P.PLAIN };

/** Where the bungalow stands and which way it faces: back down the path. */
export function placeBungalow(settings = placement) {
  const { x, z, heading } = CLEARING;
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const bx = x + c * settings.right + s * settings.forward;
  const bz = z - s * settings.right + c * settings.forward;
  return { x: bx, z: bz, yaw: heading + settings.turn * Math.PI / 180, floor: heightAt(bx, bz) + 0.95 };
}

export const BUNGALOW = placeBungalow();

/** The little table between the cane chairs, with the cook's note on it: in the bungalow's frame. */
const TABLE: [number, number] = [-3.9, 4.5 + 1.95];
export function noteAt({ x, z, yaw } = BUNGALOW) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x + TABLE[0] * c + TABLE[1] * s, z: z - TABLE[0] * s + TABLE[1] * c };
}
export const NOTE_AT = noteAt();

export function buildBungalow(b: Builder, building = BUNGALOW) {
  const lamps: Lamp[] = [];
  const { x, z, yaw, floor } = building;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  /** A point in the bungalow's frame (front toward +z), in the world. */
  const world = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, floor + ly, z - lx * s + lz * c];
  const W = 6.5;
  const D = 4.5;
  const V = 2.6;
  const H = 3.6;
  // The ground under it sloping away: the plinth reaches down to the lowest corner
  let low = Infinity;
  for (const lx of [-W - 0.4, 0, W + 0.4]) for (const lz of [-D - 0.4, 0, D + V + 0.4]) low = Math.min(low, heightAt(...(([wx, , wz]) => [wx, wz] as [number, number])(world(lx, 0, lz))));
  const depth = floor - low + 0.3;

  b.with({ at: [x, floor, z], yaw }, () => {
    // ---- the plinth, a granite coping round its top, steps up to the veranda
    // Plinth, coping and veranda floor are felt as one block, up to the coping's top (the
    // veranda floor sits 1.5 cm proud of it)
    b.open(() => {
      b.box(M.laterite, [0, -depth / 2, V / 2], [W + 0.4, depth / 2, D + V / 2 + 0.4], 'y-');
      b.box(M.granite, [0, 0.03, V / 2], [W + 0.5, 0.04, D + V / 2 + 0.5]);
      b.box(FLOOR, [0, 0.075, D + V / 2], [W + 0.3, 0.01, V / 2 + 0.3]);
    });
    b.block([0, (0.07 - depth) / 2, V / 2], [W + 0.4, (depth + 0.07) / 2, D + V / 2 + 0.4]);
    const out = world(0, 0, D + V + 1.4);
    const drop = floor - heightAt(out[0], out[2]);
    const n = Math.max(1, Math.round(drop / 0.18));
    for (let i = 0; i < n; i++) {
      const top = -((i + 1) * drop) / (n + 1);
      const bottom = -drop - 0.25;
      b.box(M.granite, [0, (top + bottom) / 2, D + V + 0.6 + i * 0.32], [1.3, (top - bottom) / 2, 0.16]);
    }
    // ---- the walls, limewashed, a dark skirting at the foot
    const wall = (ax: number, az: number, bx: number, bz: number, gaps: [number, number, number][]) => {
      // gaps: [centre along, half width, sill height]: windows and doors cut as wall pieces round them
      const len = Math.hypot(bx - ax, bz - az);
      const along = (t: number): [number, number] => [ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len];
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const piece = (t0: number, t1: number, y0: number, y1: number) => {
        if (t1 - t0 < 0.02 || y1 - y0 < 0.02) return;
        const [cx, cz] = along((t0 + t1) / 2);
        const h = (t1 - t0) / 2;
        b.box(LIME, [cx, (y0 + y1) / 2, cz], alongX ? [h, (y1 - y0) / 2, 0.15] : [0.15, (y1 - y0) / 2, h]);
      };
      let t = 0;
      for (const [g, hw, sill] of [...gaps].sort((p, q) => p[0] - q[0])) {
        piece(t, g - hw, 0.08, H);
        piece(g - hw, g + hw, 0.08, sill);
        piece(g - hw, g + hw, sill === 0.08 ? 2.4 : 2.5, H);
        t = g + hw;
      }
      piece(t, len, 0.08, H);
      const [mx, mz] = along(len / 2);
      b.box(M.lateriteDark, [mx, 0.2, mz], alongX ? [len / 2 + 0.16, 0.12, 0.165] : [0.165, 0.12, len / 2 + 0.16]);
    };
    const front: [number, number, number][] = [[W - 3.2, 0.55, 0.9], [W, 0.6, 0.08], [W + 3.2, 0.55, 0.9]];
    wall(-W, D, W, D, front);
    wall(-W, -D, W, -D, [[W - 3, 0.5, 0.9], [W + 3, 0.5, 0.9]]);
    wall(-W, -D, -W, D, [[D - 1.6, 0.5, 0.9], [D + 1.6, 0.5, 0.9]]);
    wall(W, -D, W, D, [[D - 1.6, 0.5, 0.9], [D + 1.6, 0.5, 0.9]]);
    // Inside, a dark room seen through the glass: a floor and a back wall so it isn't hollow
    b.box(DARK, [0, 0.09, 0], [W - 0.2, 0.01, D - 0.2]);

    // ---- windows: frames, bars, panes lit or dark, shutters folded back
    const windowAt = (wx: number, wz: number, facing: 'z' | 'x', sign: number, lit: boolean) => {
      const along = facing === 'z';
      const half = 0.55;
      const off = 0.17 * sign;
      const at = (u: number, y: number, o = 0): V3 => (along ? [wx + u, y, wz + off + o * sign] : [wx + off + o * sign, y, wz + u]);
      const size = (u: number, y: number, o: number): V3 => (along ? [u, y, o] : [o, y, u]);
      b.box(lit ? WINDOW : M.black, at(0, 1.7, -0.05), size(half - 0.04, 0.78, 0.01));
      b.box(FRAME, at(0, 0.9, 0.02), size(half + 0.06, 0.04, 0.06));
      b.box(FRAME, at(0, 2.5, 0.02), size(half + 0.06, 0.05, 0.06));
      for (const u of [-half, half]) b.box(FRAME, at(u, 1.7, 0.02), size(0.04, 0.8, 0.06));
      for (let k = -2; k <= 2; k++) b.bar(IRON, at(k * 0.2, 0.92, 0), at(k * 0.2, 2.48, 0), 0.008 * Math.SQRT2);
      b.box(FRAME, at(0, 1.95, 0), size(half, 0.02, 0.03));
      // The shutters, folded back flat against the wall either side
      for (const u of [-1, 1]) b.box(SHUTTER, at(u * (half + 0.33), 1.7, 0.04), size(0.27, 0.8, 0.02));
    };
    windowAt(-3.2, D, 'z', 1, true);
    windowAt(3.2, D, 'z', 1, false);
    windowAt(-3, -D, 'z', -1, false);
    windowAt(3, -D, 'z', -1, false);
    windowAt(-W, -1.6, 'x', -1, true);
    windowAt(-W, 1.6, 'x', -1, false);
    windowAt(W, -1.6, 'x', 1, false);
    windowAt(W, 1.6, 'x', 1, false);
    // The front door, double leaves, one ajar on a lit room
    b.box(WINDOW, [0.15, 1.2, D - 0.08], [0.45, 1.1, 0.01]);
    b.box(FRAME, [0, 2.4, D + 0.02], [0.68, 0.06, 0.08]);
    for (const u of [-0.64, 0.64]) b.box(FRAME, [u, 1.2, D + 0.02], [0.05, 1.15, 0.08]);
    b.box(SHUTTER, [-0.3, 1.2, D + 0.04], [0.3, 1.1, 0.03]);
    b.with({ at: [0.6, 0, D], yaw: 1.2 }, () => b.box(SHUTTER, [-0.3, 1.2, 0], [0.3, 1.1, 0.03]));
    lamps.push({ position: world(0, 1.4, D - 1.2), color: [1, 0.66, 0.34], intensity: 1.6, range: 7, kind: 'bulb', seed: 0.31 });
    lamps.push({ position: world(-3.2, 1.6, D - 1.0), color: [1, 0.66, 0.34], intensity: 1.2, range: 6, kind: 'bulb', seed: 0.31 });
    lamps.push({ position: world(-W + 1.0, 1.6, -1.6), color: [1, 0.66, 0.34], intensity: 1.0, range: 6, kind: 'bulb', seed: 0.31 });

    // ---- the veranda: square pillars on bases, a half wall, a wooden beam
    const front0 = D + V;
    for (let i = 0; i <= 6; i++) {
      const px = -W + (i / 6) * 2 * W;
      if (Math.abs(px) < 0.6) continue;
      b.box(LIME, [px, 0.08 + 1.55, front0 - 0.2], [0.18, 1.55, 0.18]);
      b.box(LIME, [px, 0.08 + 0.12, front0 - 0.2], [0.24, 0.12, 0.24]);
      b.box(LIME, [px, 3.2, front0 - 0.2], [0.24, 0.06, 0.24]);
    }
    for (const side of [-1, 1]) b.box(LIME, [side * (W / 2 + 0.8), 0.45, front0 - 0.2], [W / 2 - 1.1, 0.38, 0.12]);
    for (const side of [-1, 1]) b.box(LIME, [side * W, 0.45, D + V / 2], [0.12, 0.38, V / 2 - 0.3]);
    b.box(FRAME, [0, 3.3, front0 - 0.2], [W + 0.2, 0.1, 0.12]);
    // The veranda's own roof, lower, sloping out from under the main eaves
    b.roof(M.tile, [0, 0, D + 0.2], [W + 0.7, V + 0.5], [W + 0.4, 0.15], 3.3, 3.85, { sides: [0, 1, 3], sag: 0.06 });
    b.box(FRAME, [0, 3.38, D + V / 2], [W + 0.2, 0.02, V / 2 + 0.1]);

    // ---- the main roof: hipped, steep, tiled, a chimney at the back for the kitchen
    b.roof(M.tile, [0, 0, 0], [W + 0.9, D + 0.9], [W - 3.0, 0.15], H - 0.1, H + 3.0, { sag: 0.1, rows: 8 });
    b.box(FRAME, [0, H - 0.05, 0], [W + 0.05, 0.1, D + 0.05]);
    b.box(LIME, [W - 2.2, H + 2.0, -D + 1.6], [0.32, 1.4, 0.32]);
    b.box(M.lateriteDark, [W - 2.2, H + 3.45, -D + 1.6], [0.38, 0.06, 0.38]);

    // ---- on the veranda: the lantern on its hook, two cane chairs, a bench, a nameboard
    b.box(IRON, [-1.4, 3.05, front0 - 0.5], [0.006, 0.25, 0.006]);
    b.lathe(IRON, [-1.4, 2.62, front0 - 0.5], [[0.09, 0], [0.1, 0.02], [0.07, 0.04], [0.05, 0.06]], 10);
    b.lathe(IRON, [-1.4, 2.98, front0 - 0.5], [[0.08, 0], [0.06, 0.05], [0.02, 0.08], [0, 0.09]], 10);
    b.blob(LANTERN, [-1.4, 2.8, front0 - 0.5], [0.07, 0.11, 0.07], 8, 5);
    for (const u of [-1, 1]) b.box(IRON, [-1.4 + u * 0.07, 2.8, front0 - 0.5], [0.006, 0.17, 0.006]);
    lamps.push({ position: world(-1.4, 2.7, front0 - 0.7), color: [1, 0.6, 0.28], intensity: 3.2, range: 13, kind: 'oil', seed: 0.27 });
    b.prop('monobloc', [-3.4, 0.09, D + 1.2], 0.3, 1, [0.55, 0.36, 0.18]);
    b.prop('monobloc', [-4.4, 0.09, D + 1.0], -0.2, 1, [0.55, 0.36, 0.18]);
    b.prop('bench', [3.6, 0.09, D + 0.55], 0, 1);
    // A low teak table between the chairs: a steel flask, a tumbler, and a note under a stone
    {
      const [tx, tz] = TABLE;
      b.box(FRAME, [tx, 0.5, tz], [0.32, 0.02, 0.24]);
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(FRAME, [tx + u * 0.27, 0.29, tz + v * 0.19], [0.02, 0.2, 0.02]);
      b.tube(M.steel, [tx + 0.16, 0.52, tz - 0.06], 0.045, 0.045, 0.24, 10, { lean: () => [0, 0], cap: true });
      b.tube(M.steel, [tx + 0.06, 0.52, tz + 0.08], 0.03, 0.036, 0.09, 10, { lean: () => [0, 0], cap: true });
      b.box(PAPER, [tx - 0.12, 0.523, tz], [0.1, 0.002, 0.07]);
      b.blob(M.granite, [tx - 0.1, 0.54, tz + 0.02], [0.035, 0.02, 0.03], 6, 4);
    }
    b.box(FRAME, [2.2, 2.75, D + 0.16], [0.42, 0.42, 0.02]);
    b.board([2.2, 2.75, D + 0.19], [0, 0, 1], 0.78, 0.78, 10);
  });

  // ---- the lamp post at the edge of the clearing, where the path comes out of the trees
  {
    const px = CLEARING.x + Math.cos(CLEARING.heading) * 1.6;
    const pz = CLEARING.z - Math.sin(CLEARING.heading) * 1.6;
    const g = heightAt(px, pz);
    b.tube(IRON, [px, g, pz], 0.06, 0.045, 2.6, 8);
    b.box(IRON, [px, g + 2.62, pz], [0.13, 0.02, 0.13]);
    b.box(LANTERN, [px, g + 2.45, pz], [0.09, 0.14, 0.09]);
    b.box(IRON, [px, g + 2.28, pz], [0.12, 0.02, 0.12]);
    lamps.push({ position: [px, g + 2.4, pz], color: [1, 0.62, 0.3], intensity: 2.6, range: 14, kind: 'oil', seed: 0.33 });
  }

  // ---- the way there: the Forest Department's board where the path leaves the road, a stone
  // every hundred metres saying how far is left, and a warning where the forest begins
  {
    const start = trailAt(3);
    const side = 1.4;
    const bx = start.x + Math.cos(start.heading) * side;
    const bz = start.z - Math.sin(start.heading) * side;
    const g = heightAt(bx, bz);
    // Facing the road, back down the path
    const n: V3 = [-Math.sin(start.heading), 0, -Math.cos(start.heading)];
    const right: V3 = [-n[2], 0, n[0]];
    for (const u of [-0.55, 0.55]) b.tube(IRON, [bx + right[0] * u, g - 0.1, bz + right[2] * u], 0.035, 0.035, 2.4, 6);
    b.box(IRON, [bx - n[0] * 0.02, g + 1.85, bz - n[2] * 0.02], [Math.abs(right[0]) * 0.62 + Math.abs(n[0]) * 0.015, 0.62, Math.abs(right[2]) * 0.62 + Math.abs(n[2]) * 0.015]);
    b.board([bx + n[0] * 0.005, g + 1.85, bz + n[2] * 0.005], n, 1.2, 1.2, 0);
    // A lantern hung off the post, so the board can be found from the road
    const lx = bx + right[0] * 0.75 + n[0] * 0.15;
    const lz = bz + right[2] * 0.75 + n[2] * 0.15;
    b.box(IRON, [lx, g + 2.42, lz], [0.006, 0.08, 0.006]);
    b.box(LANTERN, [lx, g + 2.26, lz], [0.06, 0.09, 0.06]);
    lamps.push({ position: [lx + n[0] * 0.3, g + 2.2, lz + n[2] * 0.3], color: [1, 0.62, 0.3], intensity: 1.4, range: 6, kind: 'oil', seed: 0.29 });
  }
  const stoneAt = (along: number, which: number, side: number, tall = 0.55, wide = 0.36) => {
    const p = trailAt(along);
    const sx = p.x + Math.cos(p.heading) * side;
    const sz = p.z - Math.sin(p.heading) * side;
    const g = heightAt(sx, sz);
    // Facing someone coming up the path
    const n: V3 = [-Math.sin(p.heading), 0, -Math.cos(p.heading)];
    b.with({ at: [sx, g, sz], yaw: Math.atan2(n[0], n[2]) }, () => {
      b.box(LIME, [0, tall / 2 - 0.1, 0], [wide / 2, tall / 2 + 0.1, 0.09], 'y-');
      b.box(LIME, [0, tall + 0.02, 0], [wide / 2 - 0.02, 0.04, 0.07]);
    });
    b.board([sx + n[0] * 0.095, g + tall * 0.55, sz + n[2] * 0.095], n, wide * 0.94, tall * 0.94, which);
  };
  for (let k = 1; k <= 9; k++) {
    const left = 1000 - k * 100;
    const along = TRAIL_LENGTH - left;
    stoneAt(along, k, (k % 2 ? 1 : -1) * 1.5);
  }
  {
    // The warning, nailed to a post where the trees close in
    const p = trailAt(200);
    const sx = p.x - Math.cos(p.heading) * 1.7;
    const sz = p.z + Math.sin(p.heading) * 1.7;
    const g = heightAt(sx, sz);
    const n: V3 = [-Math.sin(p.heading), 0, -Math.cos(p.heading)];
    b.tube(FRAME, [sx - n[0] * 0.06, g - 0.1, sz - n[2] * 0.06], 0.05, 0.045, 2.1, 6);
    b.board([sx, g + 1.55, sz], n, 0.7, 0.7, 11);
  }
  return { lamps, at: building };
}
