// The river where the path crosses it, and the hanging bridge over the ravine: the kind the
// Forest Department strings across streams in the Ghats. Concrete posts painted green at each
// end, steel cables sagging between them, hangers down to a deck of wooden planks laid across
// steel stringers. Planks are solid one by one, so the deck you walk on sags with the cables,
// and an unseen wall each side at hand height keeps you on it.

import { Builder, hex, P, rng, type Mat, type V3 } from './geo.ts';
import { M } from './world.ts';
import { heightAt, riverCut } from './terrain.ts';
import { PATCH, riverLevel, riverPoint, WATER_HALF } from './river.ts';
import { trailAt } from './trail.ts';

const WATER: Mat = { color: hex(0x0b1210), roughness: 0.05, pattern: P.RIVER };
const PLANK: Mat = { color: hex(0x6a5440), roughness: 0.85, pattern: P.WOOD };
const POST: Mat = { color: hex(0x34483a), roughness: 0.85, pattern: P.CONCRETE };
const CABLE: Mat = { color: hex(0x2a2a28), roughness: 0.45, metallic: 0.7, pattern: P.STEEL };
const ROCK: Mat = { color: hex(0x4a4640), roughness: 0.7, pattern: P.GRANITE };

/** The bridge: where it starts on the path, which way it runs, and its two ends. */
export const BRIDGE = (() => {
  const c = trailAt(520);
  const hx = Math.sin(c.heading);
  const hz = Math.cos(c.heading);
  // Out from the river along the path until the ravine is behind, then a metre on firm ground
  const end = (dir: number) => {
    let t = 0;
    while (t < 40 && riverCut(c.x + hx * t * dir, c.z + hz * t * dir) > 0.12) t += 0.25;
    return t + 1.2;
  };
  const a = end(-1);
  const b = end(1);
  const groundAt = (t: number) => heightAt(c.x + hx * t, c.z + hz * t);
  return { x: c.x, z: c.z, heading: c.heading, a, b, ya: groundAt(-a) + 0.14, yb: groundAt(b) + 0.14, half: 0.62 };
})();

/** Along the bridge from its middle, and across it. */
export function bridgeLocal(x: number, z: number) {
  const dx = x - BRIDGE.x;
  const dz = z - BRIDGE.z;
  const s = Math.sin(BRIDGE.heading);
  const c = Math.cos(BRIDGE.heading);
  return { along: dx * s + dz * c, across: dx * c - dz * s };
}

/** Whether x, z is on the bridge's deck. */
export function onBridge(x: number, z: number, margin = 0) {
  const { along, across } = bridgeLocal(x, z);
  return Math.abs(across) < BRIDGE.half + margin && along > -BRIDGE.a - margin && along < BRIDGE.b + margin;
}

/** The deck's height `t` metres along from the middle: straight between the ends, sagging. */
const deckAt = (t: number) => {
  const { a, b, ya, yb } = BRIDGE;
  const f = (t + a) / (a + b);
  return ya + (yb - ya) * f - 0.32 * (1 - (2 * f - 1) ** 2);
};

export function buildRiver(b: Builder) {
  // ---- the water: one sheet along the patch, flat across, falling downstream
  const len = PATCH.length;
  const rows = Math.round((len * 2) / 2);
  b.surface(WATER, 3, rows, (u, v) => {
    const s = -len + v * len * 2;
    const [x, z] = riverPoint(s, (u - 0.5) * 2 * (WATER_HALF + 0.7));
    return [x, riverLevel(s), z];
  });
  // Boulders in the stream and along its edges, the water breaking round them
  const r = rng(91);
  for (let i = 0; i < 70; i++) {
    const s = -len + 6 + r() * (len * 2 - 12);
    const v = (r() - 0.5) * 2 * (WATER_HALF + 1.2);
    const [x, z] = riverPoint(s, v);
    if (onBridge(x, z, 1.5)) continue;
    const size = 0.25 + r() ** 2 * 0.9;
    const y = Math.min(heightAt(x, z), riverLevel(s) - 0.2) + size * 0.3;
    b.blob(ROCK, [x, y, z], [size * (1 + r() * 0.5), size * 0.6, size * (1 + r() * 0.5)], 7, 4, 0.25);
  }

  // ---- the bridge, built in its own frame: z along the path, x across
  const { x: bx, z: bz, heading, a, b: bEnd, ya, yb, half } = BRIDGE;
  const cy = Math.cos(heading);
  const sy = Math.sin(heading);
  const world = (lx: number, y: number, lz: number): V3 => [bx + lx * cy + lz * sy, y, bz - lx * sy + lz * cy];
  b.with({ at: [bx, 0, bz], yaw: heading }, () => {
    // Landings of concrete at each end, from the ground up to the deck
    for (const [t, y, dir] of [[-a, ya, -1], [bEnd, yb, 1]] as const) {
      const g = heightAt(...((p) => [p[0], p[2]] as [number, number])(world(0, 0, t)));
      const low = Math.min(g, heightAt(...((p) => [p[0], p[2]] as [number, number])(world(0, 0, t - dir * 1.0)))) - 0.4;
      b.box(M.concrete, [0, (y + low) / 2, t - dir * 0.2], [half + 0.35, (y - low) / 2, 1.0], 'y-');
      // Posts, a beam across their tops, the main cables' anchors behind on the ground
      for (const side of [-1, 1]) {
        b.box(POST, [side * (half + 0.18), y + 1.2, t - dir * 0.6], [0.13, 1.25, 0.13]);
        b.box(POST, [side * (half + 0.18), y + 2.5, t - dir * 0.6], [0.16, 0.06, 0.16]);
        const ax = side * (half + 0.4);
        const az = t + dir * 2.8;
        const ag = heightAt(...((p) => [p[0], p[2]] as [number, number])(world(ax, 0, az)));
        b.box(M.concrete, [ax, ag + 0.15, az], [0.3, 0.35, 0.3], 'y-');
        b.bar(CABLE, [side * (half + 0.18), y + 2.4, t - dir * 0.6], [ax, ag + 0.45, az], 0.018);
      }
      b.box(POST, [0, y + 2.42, t - dir * 0.6], [half + 0.3, 0.08, 0.1]);
    }
    // Steel stringers under the planks, edge to edge, and the planks across them
    const from = -a + 0.6;
    const to = bEnd - 0.6;
    const n = Math.round((to - from) / 0.17);
    const edge = (side: number, lift: number): V3[] => {
      const pts: V3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = -a + (i / 24) * (a + bEnd);
        pts.push([side, deckAt(t) + lift, t]);
      }
      return pts;
    };
    for (const side of [-half + 0.05, half - 0.05]) b.sweep(CABLE, edge(side, -0.07), new Array(25).fill(0.03), 4);
    const plankR = rng(7);
    // Seen only: the walker stands on the level deck pieces below, which cover the same span
    b.open(() => {
      for (let i = 0; i <= n; i++) {
        const t = from + (i / n) * (to - from);
        // Here and there an old plank, a little skewed or a shade darker
        const tilt = (plankR() - 0.5) * 0.05;
        const dark = plankR() < 0.2;
        b.with({ at: [0, 0, t], yaw: tilt }, () => b.box(dark ? M.wood : PLANK, [0, deckAt(t) - 0.02, 0], [half, 0.02, 0.065]));
      }
    });
    // The main cables: from post top, sagging to just above hand height in the middle
    const topA = ya + 2.4;
    const topB = yb + 2.4;
    const cableAt = (t: number) => {
      const f = (t + a - 0.6) / (a + bEnd - 1.2);
      return topA + (topB - topA) * f - 1.75 * (1 - (2 * f - 1) ** 2);
    };
    for (const side of [-1, 1]) {
      const x = side * (half + 0.18);
      const main: V3[] = [];
      const rail: V3[] = [];
      const mid: V3[] = [];
      for (let i = 0; i <= 32; i++) {
        const t = -a + 0.6 + (i / 32) * (a + bEnd - 1.2);
        main.push([x, cableAt(t), t]);
        rail.push([x * 0.97, deckAt(t) + 1.0, t]);
        mid.push([x * 0.96, deckAt(t) + 0.5, t]);
      }
      b.sweep(CABLE, main, new Array(33).fill(0.022), 5);
      b.sweep(CABLE, rail, new Array(33).fill(0.016), 4);
      b.sweep(CABLE, mid, new Array(33).fill(0.01), 4);
      // Hangers down from the main cable to the deck's edge, every half metre
      for (let t = -a + 1.1; t < bEnd - 1.0; t += 0.5) {
        const top = cableAt(t);
        if (top < deckAt(t) + 0.3) continue;
        b.bar(CABLE, [x, top, t], [side * (half - 0.02), deckAt(t) - 0.05, t], 0.007);
      }
    }
  });
  // Unseen walls each side at hand height, a few metres each, so nobody falls off
  for (let t = -a + 0.6; t < bEnd - 0.6; t += 1.5) {
    const m = t + 0.75;
    for (const side of [-1, 1]) {
      const c = world(side * (half + 0.12), deckAt(m) + 0.6, m);
      b.solids.push({ kind: 'box', c, h: [0.06, 0.75, 0.8], yaw: heading, high: true });
    }
  }
  // The deck as the walker feels it, in short level pieces following the sag; the planks
  // themselves are too high over the ravine floor for the physics to keep
  for (let t = -a + 0.6; t < bEnd - 0.6; t += 0.4) {
    const m = t + 0.2;
    b.solids.push({ kind: 'box', c: world(0, deckAt(m) - 0.06, m), h: [half, 0.06, 0.22], yaw: heading, high: true });
  }
}
