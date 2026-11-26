// Builds the dhole (Cuon alpinus, the red dog of the Ghats) as one skinned body on a skeleton of
// its own, with its gaits and moods as animations, into public/beasts/dhole.glb. Made here, so it
// needs no licence. A real dhole: about 50 cm at the shoulder and 90 cm long, rust-red above with
// a cream throat and belly, dark lower legs, a short blunt muzzle, big rounded ears set wide, and a
// thick bushy tail, black for most of its length. Faces +z, feet at y = 0, metres.
// Run: nice npx tsx tools/beasts/dhole.ts
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO, type Node as GNode } from '@gltf-transform/core';

type V3 = [number, number, number];
type Q = [number, number, number, number];

// ---- the skeleton: each bone's head in the bind pose, and its parent
const BONES: [name: string, parent: string | null, at: V3][] = [
  ['root', null, [0, 0, 0]],
  ['pelvis', 'root', [0, 0.53, -0.24]],
  ['spine', 'pelvis', [0, 0.55, -0.02]],
  ['chest', 'spine', [0, 0.56, 0.19]],
  ['neck', 'chest', [0, 0.6, 0.31]],
  ['head', 'neck', [0, 0.68, 0.44]],
  ['jaw', 'head', [0, 0.645, 0.5]],
  ['ear.L', 'head', [0.055, 0.76, 0.47]],
  ['ear.R', 'head', [-0.055, 0.76, 0.47]],
  ['tail1', 'pelvis', [0, 0.56, -0.38]],
  ['tail2', 'tail1', [0, 0.52, -0.48]],
  ['tail3', 'tail2', [0, 0.44, -0.56]],
  ['tail4', 'tail3', [0, 0.34, -0.61]],
];
for (const [s, x] of [['L', 1], ['R', -1]] as const) {
  BONES.push(
    [`shoulder.${s}`, 'chest', [x * 0.075, 0.5, 0.24]],
    [`elbow.${s}`, `shoulder.${s}`, [x * 0.072, 0.31, 0.21]],
    [`wrist.${s}`, `elbow.${s}`, [x * 0.07, 0.085, 0.24]],
    [`fpaw.${s}`, `wrist.${s}`, [x * 0.07, 0.025, 0.27]],
    [`thigh.${s}`, 'pelvis', [x * 0.08, 0.5, -0.28]],
    [`knee.${s}`, `thigh.${s}`, [x * 0.08, 0.33, -0.19]],
    [`hock.${s}`, `knee.${s}`, [x * 0.075, 0.15, -0.34]],
    [`hpaw.${s}`, `hock.${s}`, [x * 0.075, 0.025, -0.31]],
  );
}
const index = new Map(BONES.map((b, i) => [b[0], i]));
const at = (name: string) => BONES[index.get(name)!]![2];

// ---- colours, linear
const lin = (hex: number): V3 => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255].map((c) => c ** 2.2) as V3;
const RUST = lin(0x7a3a1c);
const RUST_DARK = lin(0x4e2412);
const CREAM = lin(0xa89272);
const SOOT = lin(0x1d1410);
const NOSE = lin(0x0c0a09);

// ---- the mesh: tubes of elliptical sections along the body, each vertex weighted to bones
const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const jnt: number[] = [];
const wgt: number[] = [];
const idx: number[] = [];

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

interface Section {
  c: V3;
  /** Half width and half height. */
  w: number;
  h: number;
  /** Bones and weights for this ring. */
  bones: [string, number][];
  /** Colour for a point at angle a (0 = top, PI = belly) on this ring. */
  color: (a: number) => V3;
  /** Pushes the ring's top up (positive) or the belly in, as a profile. */
  lift?: number;
}

const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Rings in between each pair: positions on a smooth curve, sizes and bone weights blended. */
function refine(list: Section[], k: number): Section[] {
  if (list.length < 2 || k < 2) return list;
  const out: Section[] = [];
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    const a0 = list[Math.max(0, i - 1)]!.c;
    const b1 = list[Math.min(list.length - 1, i + 2)]!.c;
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const w = new Map<string, number>();
      for (const [n, v] of a.bones) w.set(n, (w.get(n) ?? 0) + v * (1 - t));
      for (const [n, v] of b.bones) w.set(n, (w.get(n) ?? 0) + v * t);
      const bones = [...w].sort((x, y) => y[1] - x[1]).slice(0, 4);
      out.push({
        c: [0, 1, 2].map((d) => cr(a0[d]!, a.c[d]!, b.c[d]!, b1[d]!, t)) as V3,
        w: a.w + (b.w - a.w) * t,
        h: a.h + (b.h - a.h) * t,
        lift: (a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * t,
        bones,
        color: (ang) => mix3(a.color(ang), b.color(ang), t),
      });
    }
  }
  out.push(list.at(-1)!);
  return out;
}

/** A tube through sections; `around` vertices a ring; capped at both ends. */
function tube(raw: Section[], around = 14, cap = true, k = 3) {
  const sections = refine(raw, k);
  around = Math.round(around * 1.5);
  const base = pos.length / 3;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    const prev = sections[Math.max(0, i - 1)]!.c;
    const next = sections[Math.min(sections.length - 1, i + 1)]!.c;
    const along = norm(sub(next, prev));
    // A frame for the ring: "up" kept as close to world up as the tube allows
    let side = cross([0, 1, 0], along);
    if (Math.hypot(...side) < 0.2) side = cross([0, 0, 1], along);
    side = norm(side);
    const up = norm(cross(along, side));
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      const cy = Math.cos(a);
      const sx = Math.sin(a);
      // Fur is never smooth: each vertex a little in or out
      const fluff = 1 + (rnd() - 0.5) * 0.06;
      const ry = s.h * fluff * (cy > 0 ? 1 + (s.lift ?? 0) : 1 - (s.lift ?? 0) * 0.5);
      const rx = s.w * fluff;
      const p: V3 = [s.c[0] + side[0] * sx * rx + up[0] * cy * ry, s.c[1] + side[1] * sx * rx + up[1] * cy * ry, s.c[2] + side[2] * sx * rx + up[2] * cy * ry];
      pos.push(...p);
      nor.push(...norm([side[0] * sx * ry + up[0] * cy * rx, side[1] * sx * ry + up[1] * cy * rx, side[2] * sx * ry + up[2] * cy * rx]));
      const c = s.color(a);
      const v = 0.88 + rnd() * 0.24;
      col.push(c[0] * v, c[1] * v, c[2] * v, 1);
      const b = [...s.bones, ['root', 0], ['root', 0], ['root', 0]].slice(0, 4) as [string, number][];
      const total = b.reduce((n, x) => n + x[1], 0) || 1;
      jnt.push(...b.map((x) => index.get(x[0])!));
      wgt.push(...b.map((x) => x[1] / total));
    }
  }
  for (let i = 0; i < sections.length - 1; i++)
    for (let k = 0; k < around; k++) {
      const a = base + i * around + k;
      const b = base + i * around + ((k + 1) % around);
      const c = a + around;
      const d = b + around;
      idx.push(a, c, b, b, c, d);
    }
  if (cap)
    for (const [i, flip] of [[0, true], [sections.length - 1, false]] as const) {
      const s = sections[i]!;
      const centre = pos.length / 3;
      pos.push(...s.c);
      const dir = norm(sub(sections[i === 0 ? 0 : i]!.c, sections[i === 0 ? 1 : i - 1]!.c));
      nor.push(...(i === 0 ? ([-dir[0], -dir[1], -dir[2]] as V3) : norm(sub(s.c, sections[i - 1]!.c))));
      const c = s.color(0);
      col.push(...c, 1);
      const b = [...s.bones, ['root', 0], ['root', 0], ['root', 0]].slice(0, 4) as [string, number][];
      const total = b.reduce((n, x) => n + x[1], 0) || 1;
      jnt.push(...b.map((x) => index.get(x[0])!));
      wgt.push(...b.map((x) => x[1] / total));
      for (let k = 0; k < around; k++) {
        const a = base + i * around + k;
        const b2 = base + i * around + ((k + 1) % around);
        if (flip) idx.push(centre, a, b2);
        else idx.push(centre, b2, a);
      }
    }
}

/** Bones blended along a chain at share t between bone a and bone b. */
const between = (a: string, b: string, t: number): [string, number][] => [
  [a, 1 - t],
  [b, t],
];
const coat = (top: V3, belly: V3, edge = 0.55) => (a: number) => {
  // a: 0 at the top, PI under; the cream starts below the flanks
  const under = Math.max(0, -Math.cos(a));
  const t = Math.min(1, Math.max(0, (under - (1 - edge)) / 0.25));
  return mix3(top, belly, t);
};

// The body, from rump to withers: a slim waist, a deep chest, a level back
const BODY: [z: number, y: number, w: number, h: number][] = [
  [-0.43, 0.53, 0.06, 0.06],
  [-0.38, 0.53, 0.1, 0.1],
  [-0.3, 0.535, 0.12, 0.12],
  [-0.2, 0.54, 0.115, 0.115],
  [-0.08, 0.545, 0.105, 0.11],
  [0.04, 0.545, 0.115, 0.135],
  [0.14, 0.54, 0.13, 0.16],
  [0.23, 0.55, 0.13, 0.165],
  [0.31, 0.58, 0.11, 0.13],
];
tube(
  BODY.map(([z, y, w, h]) => {
    // Weighted along pelvis-spine-chest by how far forward
    const bones: [string, number][] = z < -0.24 ? [['pelvis', 1]] : z < -0.02 ? between('pelvis', 'spine', (z + 0.24) / 0.22) : z < 0.19 ? between('spine', 'chest', (z + 0.02) / 0.21) : between('chest', 'neck', Math.min(1, (z - 0.19) / 0.2) * 0.5);
    const belly = z > 0.1 ? CREAM : mix3(RUST, CREAM, 0.7);
    return { c: [0, y, z], w, h, bones, color: coat(RUST, belly, z > 0.15 ? 0.7 : 0.45) };
  }),
  18,
);
// The neck and head: up from the chest to the skull, then the short blunt muzzle
const HEAD: [z: number, y: number, w: number, h: number, bone: [string, number][], cream: number][] = [
  [0.28, 0.58, 0.1, 0.12, [['chest', 0.6], ['neck', 0.4]], 0.6],
  [0.36, 0.62, 0.085, 0.095, [['neck', 1]], 0.62],
  [0.42, 0.67, 0.08, 0.085, [['neck', 0.4], ['head', 0.6]], 0.6],
  [0.47, 0.695, 0.078, 0.075, [['head', 1]], 0.45],
  [0.52, 0.69, 0.06, 0.055, [['head', 1]], 0.4],
  [0.565, 0.675, 0.043, 0.04, [['head', 1]], 0.35],
  [0.6, 0.668, 0.03, 0.028, [['head', 1]], 0.3],
];
tube(
  HEAD.map(([z, y, w, h, bones, cream]) => ({ c: [0, y, z] as V3, w, h, bones, color: coat(z > 0.5 ? mix3(RUST, RUST_DARK, 0.45) : RUST, CREAM, cream) })),
  16,
);
// The nose, and the lower jaw (open when it snarls)
tube(
  [
    { c: [0, 0.672, 0.6], w: 0.022, h: 0.016, bones: [['head', 1]], color: () => NOSE },
    { c: [0, 0.672, 0.615], w: 0.012, h: 0.01, bones: [['head', 1]], color: () => NOSE },
  ],
  8,
);
tube(
  [
    { c: [0, 0.65, 0.49], w: 0.045, h: 0.02, bones: [['jaw', 1]], color: () => CREAM },
    { c: [0, 0.645, 0.55], w: 0.032, h: 0.016, bones: [['jaw', 1]], color: () => CREAM },
    { c: [0, 0.648, 0.585], w: 0.02, h: 0.01, bones: [['jaw', 1]], color: () => mix3(CREAM, SOOT, 0.4) },
  ],
  10,
);
// Big rounded ears, set wide, pale inside: flattened cones on the ear bones
for (const [s, x] of [['L', 1], ['R', -1]] as const) {
  const e = at(`ear.${s}`);
  tube(
    [
      { c: [e[0], e[1] - 0.01, e[2]], w: 0.032, h: 0.012, bones: [[`ear.${s}`, 0.6], ['head', 0.4]], color: () => RUST },
      { c: [e[0] + x * 0.012, e[1] + 0.03, e[2] - 0.004], w: 0.034, h: 0.011, bones: [[`ear.${s}`, 1]], color: (a) => (Math.cos(a) < 0 ? CREAM : RUST) },
      { c: [e[0] + x * 0.02, e[1] + 0.058, e[2] - 0.008], w: 0.024, h: 0.008, bones: [[`ear.${s}`, 1]], color: () => RUST_DARK },
      { c: [e[0] + x * 0.024, e[1] + 0.072, e[2] - 0.01], w: 0.008, h: 0.004, bones: [[`ear.${s}`, 1]], color: () => SOOT },
    ],
    8,
  );
}
// The tail: rust at the root, thick and black for most of its length
const T = ['tail1', 'tail2', 'tail3', 'tail4'].map(at);
const TAIL_R = [0.035, 0.05, 0.062, 0.058, 0.04, 0.012];
const tailPts: V3[] = [T[0]!, mix3(T[0]!, T[1]!, 0.6), T[1]!, mix3(T[1]!, T[2]!, 0.6), T[2]!, mix3(T[2]!, T[3]!, 0.8)];
tube(
  tailPts.map((c, i) => {
    const bone = ['tail1', 'tail1', 'tail2', 'tail2', 'tail3', 'tail4'][i]!;
    const nextBone = ['tail1', 'tail2', 'tail2', 'tail3', 'tail4', 'tail4'][i]!;
    return { c, w: TAIL_R[i]!, h: TAIL_R[i]!, bones: between(bone, nextBone, 0.5), color: () => (i < 2 ? mix3(RUST, SOOT, i * 0.5) : SOOT) };
  }),
  12,
);
// Legs: rust above, darkening below the elbow and stifle, sooty feet
for (const s of ['L', 'R'] as const) {
  for (const [a, b, c, d, r] of [
    [`shoulder.${s}`, `elbow.${s}`, `wrist.${s}`, `fpaw.${s}`, [0.05, 0.036, 0.022, 0.024]],
    [`thigh.${s}`, `knee.${s}`, `hock.${s}`, `hpaw.${s}`, [0.065, 0.04, 0.022, 0.024]],
  ] as const) {
    const pa = at(a);
    const pb = at(b);
    const pc = at(c);
    const pd = at(d);
    tube(
      [
        { c: mix3(pa, pb, -0.05), w: r[0], h: r[0] * 1.3, bones: [[a, 1]], color: () => RUST },
        { c: mix3(pa, pb, 0.5), w: r[0] * 0.8, h: r[0], bones: [[a, 1]], color: () => RUST },
        { c: pb, w: r[1], h: r[1], bones: between(a, b, 0.5), color: () => mix3(RUST, RUST_DARK, 0.5) },
        { c: mix3(pb, pc, 0.55), w: r[2] * 1.05, h: r[2] * 1.1, bones: [[b, 1]], color: () => RUST_DARK },
        { c: pc, w: r[2], h: r[2], bones: between(b, c, 0.5), color: () => mix3(RUST_DARK, SOOT, 0.5) },
        { c: mix3(pc, pd, 0.6), w: r[3], h: r[3] * 0.8, bones: [[c, 1]], color: () => SOOT },
        { c: [pd[0], 0.018, pd[2] + 0.025], w: r[3] * 0.9, h: 0.014, bones: [[d, 1]], color: () => SOOT },
      ],
      10,
    );
  }
}

// ---- the animations: rotations per bone, and the pelvis's height, keyed 30 times a second
const qx = (a: number): Q => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qy = (a: number): Q => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const qz = (a: number): Q => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const qm = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
type Pose = { rot: Record<string, Q>; lift: number; reach?: number };
interface ClipDef {
  name: string;
  seconds: number;
  pose: (t: number) => Pose;
}
/**
 * One leg at cycle share `p` (0-1): forward under the body at 0, back at 0.5, lifted and folded
 * coming forward. `swing` is how far it sweeps (radians), `fold` how much it tucks up.
 * Positive x-rotation swings a hanging leg back.
 */
function leg(rot: Record<string, Q>, top: string, mid: string, low: string, p: number, swing: number, fold: number, hind: boolean, bend = 0) {
  const stance = p < 0.6;
  // Back through the stance, then forward through the swing
  const sweep = stance ? -swing + (2 * swing * p) / 0.6 : swing - (2 * swing * (p - 0.6)) / 0.4;
  const up = stance ? 0 : Math.sin(((p - 0.6) / 0.4) * Math.PI);
  rot[top] = qx(sweep + (hind ? bend * 0.5 : -bend * 0.3));
  // Fore: the elbow folds back and the wrist flicks; hind: the stifle flexes, the hock folds
  rot[mid] = qx((hind ? -1 : 1) * (fold * up + bend));
  rot[low] = qx((hind ? 1 : -1) * fold * 0.8 * up - sweep * 0.3);
}
const legs = (rot: Record<string, Q>, t: number, phases: number[], swing: number, fold: number, bend = 0) => {
  const L = ['L', 'R'] as const;
  L.forEach((s, i) => leg(rot, `shoulder.${s}`, `elbow.${s}`, `wrist.${s}`, (t + phases[i]!) % 1, swing, fold, false, bend));
  L.forEach((s, i) => leg(rot, `thigh.${s}`, `knee.${s}`, `hock.${s}`, (t + phases[i + 2]!) % 1, swing, fold, true, bend));
};
const TAU = Math.PI * 2;
const CLIPS: ClipDef[] = [
  {
    // Standing, watching: breathing, the head turning to listen, ears flicking, the tail low
    name: 'idle',
    seconds: 4,
    pose: (t) => {
      const rot: Record<string, Q> = {};
      legs(rot, 0, [0, 0, 0, 0], 0, 0);
      for (const k of Object.keys(rot)) rot[k] = [0, 0, 0, 1];
      const breath = Math.sin(t * TAU * 2) * 0.012;
      rot.chest = qx(breath);
      rot.neck = qx(-0.05 + breath);
      rot.head = qm(qy(Math.sin(t * TAU) * 0.35), qx(0.1));
      rot['ear.L'] = qz(Math.max(0, Math.sin(t * TAU * 3 + 1)) ** 8 * -0.4);
      rot['ear.R'] = qz(Math.max(0, Math.sin(t * TAU * 2.5)) ** 8 * 0.4);
      rot.tail1 = qm(qx(0.5), qy(Math.sin(t * TAU) * 0.15));
      rot.tail2 = qx(0.15);
      rot.tail3 = qy(Math.sin(t * TAU + 1) * 0.1);
      return { rot, lift: 0 };
    },
  },
  {
    // The trot: diagonal pairs together, the back level, the tail out behind
    name: 'trot',
    seconds: 0.5,
    pose: (t) => {
      const rot: Record<string, Q> = {};
      legs(rot, t, [0, 0.5, 0.5, 0], 0.55, 0.9);
      rot.neck = qx(0.1);
      rot.head = qx(0.05 + Math.sin(t * TAU * 2) * 0.04);
      rot.tail1 = qm(qx(0.35), qy(Math.sin(t * TAU) * 0.12));
      rot.tail2 = qx(0.1);
      rot.tail3 = qy(Math.sin(t * TAU - 1) * 0.12);
      return { rot, lift: Math.abs(Math.sin(t * TAU)) * 0.02 };
    },
  },
  {
    // The gallop: front pair then back pair, the spine folding and stretching, head low and out
    name: 'gallop',
    seconds: 0.4,
    pose: (t) => {
      const rot: Record<string, Q> = {};
      legs(rot, t, [0, 0.1, 0.5, 0.6], 0.85, 1.3);
      const flex = Math.sin(t * TAU);
      rot.pelvis = qx(flex * 0.12);
      rot.spine = qx(-flex * 0.12);
      rot.chest = qx(-flex * 0.08);
      rot.neck = qx(0.3 + flex * 0.08);
      rot.head = qx(-0.15);
      rot['ear.L'] = qx(0.5);
      rot['ear.R'] = qx(0.5);
      rot.tail1 = qx(0.05 + flex * 0.12);
      rot.tail2 = qx(-0.15);
      return { rot, lift: (Math.sin(t * TAU) * 0.5 + 0.5) * 0.06 };
    },
  },
  {
    // Stalking: low, slow, head down and level with the back, every step placed
    name: 'stalk',
    seconds: 1.1,
    pose: (t) => {
      const rot: Record<string, Q> = {};
      legs(rot, t, [0, 0.5, 0.75, 0.25], 0.35, 0.7, 0.35);
      rot.neck = qx(0.45);
      rot.head = qx(-0.25);
      rot['ear.L'] = qx(-0.2);
      rot['ear.R'] = qx(-0.2);
      rot.tail1 = qx(0.95);
      rot.tail2 = qx(0.2);
      return { rot, lift: -0.08 };
    },
  },
  {
    // Facing you down: crouched to spring, head low, lips back from the teeth, tail stiff
    name: 'snarl',
    seconds: 1.6,
    pose: (t) => {
      const rot: Record<string, Q> = {};
      legs(rot, 0, [0, 0, 0, 0], 0, 0, 0.45);
      const shake = Math.sin(t * TAU * 6) * 0.02;
      rot.neck = qx(0.4 + shake);
      rot.head = qx(-0.35);
      rot.jaw = qx(0.28 + Math.sin(t * TAU * 2) * 0.06);
      rot['ear.L'] = qm(qx(-0.5), qz(0.3));
      rot['ear.R'] = qm(qx(-0.5), qz(-0.3));
      rot.tail1 = qx(0.25);
      rot.tail2 = qx(-0.1);
      return { rot, lift: -0.1 };
    },
  },
];

// ---- write the file
const doc = new Document();
const buffer = doc.createBuffer();
const acc = (type: 'SCALAR' | 'VEC3' | 'VEC4' | 'MAT4', array: Float32Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const nodes: GNode[] = BONES.map(([name, parent, p]) => {
  const n = doc.createNode(name);
  const pp = parent ? at(parent) : ([0, 0, 0] as V3);
  n.setTranslation(sub(p, pp));
  return n;
});
BONES.forEach(([, parent], i) => parent && nodes[index.get(parent)!]!.addChild(nodes[i]!));
const ibm = new Float32Array(BONES.length * 16);
BONES.forEach(([, , p], i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16));
const skin = doc.createSkin('dhole').setInverseBindMatrices(acc('MAT4', ibm)).setSkeleton(nodes[0]!);
for (const n of nodes) skin.addJoint(n);
const material = doc.createMaterial('fur').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.95).setMetallicFactor(0);
const prim = doc
  .createPrimitive()
  .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
  .setAttribute('NORMAL', acc('VEC3', new Float32Array(nor)))
  .setAttribute('COLOR_0', acc('VEC4', new Float32Array(col)))
  .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(jnt)))
  .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(wgt)))
  .setIndices(acc('SCALAR', new Uint32Array(idx)))
  .setMaterial(material);
const mesh = doc.createMesh('dhole').addPrimitive(prim);
const body = doc.createNode('body').setMesh(mesh).setSkin(skin);
doc.createScene('dhole').addChild(nodes[0]!).addChild(body);

const HZ = 30;
for (const c of CLIPS) {
  const anim = doc.createAnimation(c.name);
  const n = Math.round(c.seconds * HZ);
  const times = new Float32Array(n + 1).map((_, i) => i / HZ);
  const poses = Array.from({ length: n + 1 }, (_, i) => c.pose((i % n) / n));
  const moved = new Set(poses.flatMap((p) => Object.keys(p.rot)));
  for (const name of moved) {
    const out = new Float32Array((n + 1) * 4);
    poses.forEach((p, i) => out.set(p.rot[name] ?? [0, 0, 0, 1], i * 4));
    const s = doc.createAnimationSampler().setInput(acc('SCALAR', times)).setOutput(acc('VEC4', out)).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes[index.get(name)!]!).setTargetPath('rotation').setSampler(s));
  }
  // The pelvis rides up and down with the gait
  const pelvis = at('pelvis');
  const out = new Float32Array((n + 1) * 3);
  poses.forEach((p, i) => out.set([pelvis[0], pelvis[1] + p.lift, pelvis[2]], i * 3));
  const s = doc.createAnimationSampler().setInput(acc('SCALAR', times)).setOutput(acc('VEC3', out)).setInterpolation('LINEAR');
  anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes[index.get('pelvis')!]!).setTargetPath('translation').setSampler(s));
}

const OUT = join(import.meta.dirname, '../../public/beasts');
mkdirSync(OUT, { recursive: true });
const file = join(OUT, 'dhole.glb');
await new NodeIO().write(file, doc);
console.log(file, (statSync(file).size / 1e3).toFixed(0), 'KB', pos.length / 3, 'vertices', idx.length / 3, 'triangles', BONES.length, 'bones');
