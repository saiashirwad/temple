// Keeps the townspeople's routes out of the walls: finds where a route's straight legs pass
// through a solid (a wall, a house, a pillar, a trunk), and walks them round it instead.
import type { Solid } from '../render/geo.ts';
import { heightAt } from '../world/terrain.ts';

export type XZ = [number, number];

/** A footprint on the ground: a turned rectangle, or a circle. Only what stands at body height. */
export type Foot = { kind: 'box'; x: number; z: number; hx: number; hz: number; c: number; s: number } | { kind: 'cyl'; x: number; z: number; r: number };

/** How high a person steps up without thinking: a stair, a kerb, a plinth's edge. */
const STEP = 0.45;

/**
 * What stands in a walker's way, as footprints on the ground. Floors are left out: a slab whose
 * top can be stepped onto from the ground, or from another floor beside it (stairs, the gate's
 * plinth, a veranda), is walked on, not into. So is anything above head height.
 */
export function footprints(solids: readonly Solid[]): Foot[] {
  type S = { s: Solid; g: number; lo: number; hi: number; x0: number; x1: number; z0: number; z1: number; floor: boolean };

  const all: S[] = solids.map((s) => {
    const g = heightAt(s.c[0], s.c[2]);
    const lo = s.kind === 'box' ? s.c[1] - s.h[1] : s.c[1];
    const hi = s.kind === 'box' ? s.c[1] + s.h[1] : s.c[1] + s.h;
    // Its extent on the ground, as an axis-aligned box round the turned one
    const ex = s.kind === 'box' ? Math.abs(Math.cos(s.yaw)) * s.h[0] + Math.abs(Math.sin(s.yaw)) * s.h[2] : s.r;
    const ez = s.kind === 'box' ? Math.abs(Math.sin(s.yaw)) * s.h[0] + Math.abs(Math.cos(s.yaw)) * s.h[2] : s.r;
    const wide = s.kind === 'box' ? Math.min(s.h[0], s.h[2]) > 0.12 : s.r > 0.6;

    return { s, g, lo, hi, x0: s.c[0] - ex, x1: s.c[0] + ex, z0: s.c[2] - ez, z1: s.c[2] + ez, floor: wide && hi <= g + STEP };
  });

  // Floors reached from floors: a grid of 4 m cells keeps the neighbour search short
  const cell = 4;
  const grid = new Map<number, S[]>();
  const key = (i: number, j: number) => i * 65536 + j;

  for (const a of all)
    for (let i = Math.floor(a.x0 / cell); i <= Math.floor(a.x1 / cell); i++)
      for (let j = Math.floor(a.z0 / cell); j <= Math.floor(a.z1 / cell); j++) {
        const k = key(i, j);
        const l = grid.get(k);

        if (l) l.push(a);
        else grid.set(k, [a]);
      }

  for (let pass = 0, grew = true; grew && pass < 12; pass++) {
    grew = false;

    for (const a of all) {
      if (a.floor || a.s.kind !== 'box' || Math.min(a.s.h[0], a.s.h[2]) <= 0.12 || a.hi > a.g + 3) continue;

      search: for (let i = Math.floor((a.x0 - 0.2) / cell); i <= Math.floor((a.x1 + 0.2) / cell); i++)
        for (let j = Math.floor((a.z0 - 0.2) / cell); j <= Math.floor((a.z1 + 0.2) / cell); j++)
          for (const b of grid.get(key(i, j)) ?? []) {
            if (!b.floor || b.x1 < a.x0 - 0.2 || b.x0 > a.x1 + 0.2 || b.z1 < a.z0 - 0.2 || b.z0 > a.z1 + 0.2) continue;

            if (a.hi <= b.hi + STEP) {
              a.floor = grew = true;
              break search;
            }
          }
    }
  }

  const out: Foot[] = [];

  for (const { s, g, lo, hi, floor } of all) {
    // Floors, and lintels and eaves overhead
    if (floor || hi < g + STEP || lo > g + 1.7) continue;

    if (s.kind === 'box') out.push({ kind: 'box', x: s.c[0], z: s.c[2], hx: s.h[0], hz: s.h[2], c: Math.cos(s.yaw), s: Math.sin(s.yaw) });
    else out.push({ kind: 'cyl', x: s.c[0], z: s.c[2], r: s.r });
  }

  return out;
}

// ---- a grid over the footprints, so each test looks only at what's near
const CELL = 4;
const grids = new WeakMap<readonly Foot[], Map<number, Foot[]>>();
const reach = (f: Foot) => (f.kind === 'cyl' ? f.r : Math.hypot(f.hx, f.hz));

function gridOf(feet: readonly Foot[]) {
  let g = grids.get(feet);

  if (g) return g;
  g = new Map();

  for (const f of feet) {
    const e = reach(f);

    for (let i = Math.floor((f.x - e) / CELL); i <= Math.floor((f.x + e) / CELL); i++)
      for (let j = Math.floor((f.z - e) / CELL); j <= Math.floor((f.z + e) / CELL); j++) {
        const k = i * 65536 + j;
        const l = g.get(k);

        if (l) l.push(f);
        else g.set(k, [f]);
      }
  }

  grids.set(feet, g);

  return g;
}

/** Footprints whose cells meet the box x0..x1, z0..z1 grown by `m`. */
function near(feet: readonly Foot[], x0: number, z0: number, x1: number, z1: number, m: number): Foot[] {
  const g = gridOf(feet);
  const out = new Set<Foot>();

  for (let i = Math.floor((Math.min(x0, x1) - m) / CELL); i <= Math.floor((Math.max(x0, x1) + m) / CELL); i++)
    for (let j = Math.floor((Math.min(z0, z1) - m) / CELL); j <= Math.floor((Math.max(z0, z1) + m) / CELL); j++) for (const f of g.get(i * 65536 + j) ?? []) out.add(f);

  return [...out];
}

/** Visibility only needs the first hit. Avoid materializing a candidate set for every edge. */
function obstructed(grid: Map<number, Foot[]>, a: XZ, b: XZ, radius: number) {
  const margin = radius + 0.1;
  const x1 = Math.floor((Math.max(a[0], b[0]) + margin) / CELL);
  const z1 = Math.floor((Math.max(a[1], b[1]) + margin) / CELL);
  const z0 = Math.floor((Math.min(a[1], b[1]) - margin) / CELL);

  for (let x = Math.floor((Math.min(a[0], b[0]) - margin) / CELL); x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const cell = grid.get(x * 65536 + z);

      if (cell) for (const foot of cell) if (crosses(foot, a, b, radius)) return true;
    }
  }

  return false;
}

/** Into a box's own frame (x along its width, z along its depth). */
const local = (f: Extract<Foot, { kind: 'box' }>, x: number, z: number): XZ => {
  const dx = x - f.x;
  const dz = z - f.z;

  return [dx * f.c - dz * f.s, dx * f.s + dz * f.c];
};

const world = (f: Extract<Foot, { kind: 'box' }>, u: number, v: number): XZ => [f.x + u * f.c + v * f.s, f.z - u * f.s + v * f.c];

/** Whether the leg a-b, swept by a body of `radius`, passes through footprint f. */
export function crosses(f: Foot, a: XZ, b: XZ, radius: number) {
  if (f.kind === 'cyl') {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((f.x - a[0]) * dx + (f.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));

    return Math.hypot(a[0] + dx * t - f.x, a[1] + dz * t - f.z) < f.r + radius;
  }

  // Slab test against the box grown by the radius
  const p = local(f, a[0], a[1]);
  const q = local(f, b[0], b[1]);
  let t0 = 0;
  let t1 = 1;

  for (const [o, d, h] of [[p[0], q[0] - p[0], f.hx + radius], [p[1], q[1] - p[1], f.hz + radius]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o) >= h) return false;
      continue;
    }

    let ta = (-h - o) / d;
    let tb = (h - o) / d;

    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);

    if (t0 >= t1) return false;
  }

  return true;
}

const inside = (f: Foot, x: number, z: number, radius: number) => {
  if (f.kind === 'cyl') return Math.hypot(x - f.x, z - f.z) < f.r + radius;
  const [u, v] = local(f, x, z);

  return Math.abs(u) < f.hx + radius && Math.abs(v) < f.hz + radius;
};

/** Each leg of the route (by its start index) and the footprints it passes through. */
export function blocked(route: readonly XZ[], feet: readonly Foot[], radius = 0.3, loop = false) {
  const out: { leg: number; feet: Foot[] }[] = [];
  const n = loop ? route.length : route.length - 1;

  for (let i = 0; i < n; i++) {
    const a = route[i]!;
    const b = route[(i + 1) % route.length]!;
    const hit = near(feet, a[0], a[1], b[0], b[1], radius + 0.1).filter((f) => crosses(f, a, b, radius));

    if (hit.length) out.push({ leg: i, feet: hit });
  }

  return out;
}

/** Corners of a footprint grown by `clear`, to walk round it by. */
const corners = (f: Foot, clear: number): XZ[] => {
  if (f.kind === 'box') {
    const u = f.hx + clear;
    const v = f.hz + clear;

    return [world(f, -u, -v), world(f, u, -v), world(f, u, v), world(f, -u, v)];
  }

  const r = (f.r + clear) / Math.cos(Math.PI / 8);

  return Array.from({ length: 8 }, (_, k) => [f.x + Math.cos((k * Math.PI) / 4) * r, f.z + Math.sin((k * Math.PI) / 4) * r] as XZ);
};

/**
 * Shortest way from a to b among the corners of what's in the way (a small visibility graph):
 * the waypoints to insert between them, or null when there's no way round.
 */
function detour(a: XZ, b: XZ, feet: readonly Foot[], radius: number, clear: number, margin = 3): XZ[] | null {
  // Only what's near this leg matters
  const close = near(feet, a[0], a[1], b[0], b[1], margin);
  const nodes: XZ[] = [a, b];

  for (const f of close) for (const c of corners(f, radius + clear)) if (!close.some((g) => inside(g, c[0], c[1], radius))) nodes.push(c);
  // A corner can lie past what was gathered: test each leg against what's near it
  const grid = gridOf(feet);
  // A straight line to the destination bounds the remaining walking distance.
  const dist = nodes.map(() => Infinity);
  const remaining = nodes.map(p => Math.hypot(p[0] - b[0], p[1] - b[1]));
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[0] = 0;

  for (;;) {
    let u = -1;

    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! + remaining[i]! < dist[u]! + remaining[u]!)) u = i;

    if (u < 0) return null;

    if (u === 1) break;
    done[u] = true;

    for (let v = 0; v < nodes.length; v++) {
      if (done[v]) continue;
      const d = dist[u]! + Math.hypot(nodes[v]![0] - nodes[u]![0], nodes[v]![1] - nodes[u]![1]);

      if (d < dist[v]! && !obstructed(grid, nodes[u]!, nodes[v]!, radius)) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }

  const path: XZ[] = [];

  for (let v = prev[1]!; v > 0; v = prev[v]!) path.unshift(nodes[v]!);

  return path;
}

/** Moves a point out of anything it stands in, to the nearest edge plus `clear`. */
export function pushOut(p: XZ, feet: readonly Foot[], radius = 0.3, clear = 0.05): XZ {
  let [x, z] = p;

  for (let pass = 0; pass < 4; pass++) {
    const f = near(feet, x, z, x, z, radius + 0.1).find((g) => inside(g, x, z, radius));

    if (!f) break;

    if (f.kind === 'cyl') {
      const a = Math.atan2(z - f.z, x - f.x);
      x = f.x + Math.cos(a) * (f.r + radius + clear);
      z = f.z + Math.sin(a) * (f.r + radius + clear);
    } else {
      const [u, v] = local(f, x, z);
      const du = f.hx + radius + clear - Math.abs(u);
      const dv = f.hz + radius + clear - Math.abs(v);
      [x, z] = du < dv ? world(f, Math.sign(u || 1) * (f.hx + radius + clear), v) : world(f, u, Math.sign(v || 1) * (f.hz + radius + clear));
    }
  }

  return [x, z];
}

/**
 * The route with every leg that passes through a solid walked round it instead. Waypoints inside
 * a solid move out first. A route that is already clear comes back unchanged (the same array).
 */
export function clear(route: readonly XZ[], feet: readonly Foot[], o: { radius?: number; clear?: number; loop?: boolean } = {}): XZ[] {
  const radius = o.radius ?? 0.3;
  const room = o.clear ?? 0.35;
  const pts = route.map((p) => pushOut(p, feet, radius));
  const moved = pts.some((p, i) => p[0] !== route[i]![0] || p[1] !== route[i]![1]);

  if (!moved && !blocked(pts, feet, radius, o.loop).length) return route as XZ[];
  const out: XZ[] = [];
  const n = pts.length;
  const last = o.loop ? n : n - 1;
  const hit = (a: XZ, b: XZ) => obstructed(gridOf(feet), a, b, radius);
  const round = (a: XZ, b: XZ) => (hit(a, b) ? (detour(a, b, feet, radius, room) ?? detour(a, b, feet, radius, room, 9)) : []);
  let i = 0;
  out.push(pts[0]!);

  while (i < last) {
    // To the next waypoint, round what's in the way. A waypoint shut in (inside a shop, a yard
    // with no gap) is skipped for one after it; if the one we stand on is shut in, step back off it
    let from = out.at(-1)!;
    let j = i + 1;
    let way = round(from, pts[j % n]!);

    while (!way && j < last && j - i < 4) way = round(from, pts[++j % n]!);

    if (!way && out.length > 1) {
      out.pop();
      from = out.at(-1)!;
      j = i + 1;
      way = round(from, pts[j % n]!);

      while (!way && j < last && j - i < 4) way = round(from, pts[++j % n]!);
    }

    if (way) out.push(...way);

    if (j < n) out.push(pts[j]!);
    i = j;
  }

  return out;
}
