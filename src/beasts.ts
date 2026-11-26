// The animals that move: dholes (the red dogs of the Ghats) and wild elephants. Each is built
// from rigid parts (a body, and legs that swing from the hip) so it can walk and run as a set
// of instances moved every frame. Every model faces +z.

import { Builder, hex, P, type Mat, type V3 } from './geo.ts';

// The dhole, the Indian wild dog: what Malayalam calls chennaya and the town calls wolves.
// Rust-red, cream at the throat, a short muzzle, round ears, and a bushy black tail.
const FUR: Mat = { color: hex(0x9a4a22), roughness: 0.95, pattern: P.PLAIN };
const FUR_DARK: Mat = { color: hex(0x22160f), roughness: 0.95, pattern: P.PLAIN };
const CREAM: Mat = { color: hex(0xc9ab80), roughness: 0.95, pattern: P.PLAIN };
// Dusted with red earth, as the wild herds of the Ghats nearly always are: lighter on the back
// and head where the dust is thrown, darker and wetter low down. Pale enough to catch the moon.
const HIDE: Mat = { color: hex(0x7a6555), roughness: 0.92, pattern: P.PLAIN };
const DUSTED: Mat = { color: hex(0x9a7a62), roughness: 0.95, pattern: P.PLAIN };
const HIDE_LOW: Mat = { color: hex(0x5a4c42), roughness: 0.85, pattern: P.PLAIN };
const IVORY: Mat = { color: hex(0xcfc2a0), roughness: 0.45, pattern: P.PLAIN };

/** Where a wolf's legs hang from, relative to its body's origin on the ground. */
export const WOLF_HIPS: V3[] = [
  [-0.09, 0.5, 0.33],
  [0.09, 0.5, 0.33],
  [-0.09, 0.52, -0.34],
  [0.09, 0.52, -0.34],
];
export const WOLF_LEG = 0.48;

export function wolfBody() {
  const b = new Builder(true);
  // Lighter in the barrel than a wolf, deep in the chest, a straight back; rust over the top
  b.blob(FUR, [0, 0.6, 0.19], [0.14, 0.18, 0.26], 8, 6, 0.04);
  b.blob(FUR, [0, 0.61, -0.02], [0.115, 0.135, 0.29], 8, 5, 0.03);
  b.blob(FUR, [0, 0.6, -0.24], [0.125, 0.145, 0.2], 8, 5, 0.03);
  // The pale underside: throat, chest and belly
  b.blob(CREAM, [0, 0.52, 0.22], [0.11, 0.11, 0.2], 7, 4, 0.04);
  b.blob(CREAM, [0, 0.53, -0.04], [0.085, 0.07, 0.22], 6, 4, 0.03);
  b.blob(FUR, [0, 0.67, 0.33], [0.125, 0.145, 0.13], 7, 5, 0.1);
  for (const sx of [-1, 1]) {
    b.blob(FUR, [sx * 0.08, 0.5, 0.3], [0.055, 0.13, 0.08], 6, 4);
    b.blob(FUR, [sx * 0.08, 0.5, -0.29], [0.06, 0.14, 0.1], 6, 4);
  }
  // A broad head, a short blunt muzzle (shorter than a wolf's), pale cheeks and lips
  b.sweep(FUR, [[0, 0.67, 0.37], [0, 0.71, 0.48], [0, 0.72, 0.57]], [0.1, 0.085, 0.075], 6);
  b.blob(FUR, [0, 0.72, 0.61], [0.09, 0.08, 0.09], 7, 5);
  b.blob(CREAM, [0, 0.67, 0.6], [0.07, 0.04, 0.07], 6, 3);
  b.sweep(FUR, [[0, 0.71, 0.67], [0, 0.69, 0.74], [0, 0.68, 0.78]], [0.05, 0.038, 0.026], 6);
  b.blob(FUR_DARK, [0, 0.685, 0.79], [0.022, 0.017, 0.014], 4, 3);
  // Big rounded ears, set wide, pale inside
  for (const s2 of [-1, 1]) {
    b.blob(FUR, [s2 * 0.065, 0.81, 0.57], [0.035, 0.055, 0.018], 6, 4);
    b.blob(CREAM, [s2 * 0.065, 0.81, 0.585], [0.022, 0.038, 0.006], 5, 3);
  }
  // The thick bushy tail, rust at the root, black for most of its length
  b.sweep(FUR, [[0, 0.61, -0.42], [0, 0.56, -0.52]], [0.035, 0.05], 6);
  b.sweep(FUR_DARK, [[0, 0.56, -0.52], [0, 0.46, -0.63], [0, 0.34, -0.7], [0, 0.24, -0.72]], [0.05, 0.065, 0.055, 0.02], 7);
  return b.model();
}

export function wolfLeg() {
  const b = new Builder(true);
  // Rust above, darker below the hock and pastern
  b.tube(FUR, [0, -WOLF_LEG * 0.45, 0], 0.03, 0.055, WOLF_LEG * 0.45, 6, { lean: () => [0, 0] });
  b.tube(FUR_DARK, [0, -WOLF_LEG, 0], 0.024, 0.03, WOLF_LEG * 0.56, 6, { lean: () => [0, 0] });
  b.blob(FUR_DARK, [0, -WOLF_LEG + 0.02, 0.025], [0.032, 0.022, 0.045], 5, 3);
  return b.model();
}

/** Where an elephant's legs hang from, for a beast of `size`, and how long they are. */
export const elephantHips = (s: number): V3[] => [
  [-0.45 * s, 1.5 * s, 0.85 * s],
  [0.45 * s, 1.5 * s, 0.9 * s],
  [-0.45 * s, 1.5 * s, -0.85 * s],
  [0.45 * s, 1.5 * s, -0.8 * s],
];
export const elephantLegLength = (s: number) => 1.5 * s;

export function elephantBody(s: number, tusks: boolean) {
  const b = new Builder(true);
  const leg = 1.35 * s;
  const EYE: Mat = { color: hex(0x0c0a08), roughness: 0.3, pattern: P.PLAIN };
  // The barrel, with the Asian elephant's arched back: highest in the middle, falling to the rump
  b.blob(HIDE, [0, leg + 0.72 * s, 0], [0.86 * s, 0.82 * s, 1.4 * s], 12, 8, 0.05);
  b.blob(DUSTED, [0, leg + 1.12 * s, -0.1 * s], [0.66 * s, 0.5 * s, 0.95 * s], 10, 6, 0.03);
  // The belly hanging low between the legs, the shoulders and the rump rounding out the ends
  b.blob(HIDE, [0, leg + 0.38 * s, 0.05 * s], [0.78 * s, 0.6 * s, 1.0 * s], 10, 6, 0.04);
  b.blob(HIDE, [0, leg + 0.85 * s, 0.85 * s], [0.8 * s, 0.75 * s, 0.6 * s], 10, 6, 0.05);
  b.blob(HIDE, [0, leg + 0.72 * s, -1.05 * s], [0.74 * s, 0.74 * s, 0.55 * s], 10, 6, 0.04);
  // Folds of loose skin where each leg meets the body
  for (const [hx, hz] of [[-0.45, 0.85], [0.45, 0.9], [-0.45, -0.85], [0.45, -0.8]] as const)
    b.blob(HIDE, [hx * s * 1.05, leg + 0.2 * s, hz * s], [0.36 * s, 0.55 * s, 0.4 * s], 8, 5, 0.06);
  // A short thick neck, and the head carried high: a domed brow with the two humps on top
  const hy = leg + 1.0 * s;
  const hz = 1.6 * s;
  b.blob(HIDE, [0, hy - 0.05 * s, 1.2 * s], [0.6 * s, 0.68 * s, 0.45 * s], 10, 6, 0.04);
  b.blob(HIDE, [0, hy, hz], [0.5 * s, 0.62 * s, 0.52 * s], 10, 7, 0.03);
  b.blob(HIDE, [0, hy - 0.3 * s, hz + 0.25 * s], [0.34 * s, 0.4 * s, 0.32 * s], 8, 5);
  for (const side of [-1, 1]) {
    b.blob(DUSTED, [side * 0.17 * s, hy + 0.44 * s, hz - 0.02 * s], [0.21 * s, 0.2 * s, 0.26 * s], 8, 5);
    // A small dark eye, deep set under the brow
    b.blob(EYE, [side * 0.4 * s, hy - 0.02 * s, hz + 0.3 * s], [0.035 * s, 0.03 * s, 0.035 * s], 6, 4);
  }
  // The trunk's root, where the separately moving trunk joins
  b.blob(HIDE, [0, hy - 0.15 * s, hz + 0.38 * s], [0.24 * s, 0.26 * s, 0.2 * s], 8, 5);
  if (tusks) for (const side of [-1, 1]) b.sweep(IVORY, [[side * 0.17 * s, hy - 0.35 * s, hz + 0.3 * s], [side * 0.2 * s, hy - 0.62 * s, hz + 0.62 * s], [side * 0.18 * s, hy - 0.62 * s, hz + 0.9 * s]], [0.06 * s, 0.045 * s, 0.015 * s], 5);
  // The tail, with its tuft of coarse hair
  b.sweep(HIDE, [[0, leg + 1.1 * s, -1.5 * s], [0, leg + 0.5 * s, -1.62 * s], [0, leg - 0.05 * s, -1.58 * s]], [0.06 * s, 0.035 * s, 0.025 * s], 5);
  b.blob(FUR_DARK, [0, leg - 0.15 * s, -1.58 * s], [0.04 * s, 0.12 * s, 0.04 * s], 5, 3);
  return b.model();
}

/** Where the elephant's ears hinge and its trunk hangs from, in its own frame. */
export const elephantJoints = (s: number) => {
  const hy = 2.35 * s;
  const hz = 1.6 * s;
  return {
    ear: (side: number): V3 => [side * 0.46 * s, hy + 0.06 * s, hz + 0.04 * s],
    root: [0, hy - 0.2 * s, hz + 0.42 * s] as V3,
    /** From the root to the bend, about two thirds of the way down. */
    bend: [0, -1.05 * s, 0.17 * s] as V3,
  };
};

/** One ear, hinged at its front edge: a thin flap of hide, the lower edge folded forward. */
export function elephantEar(s: number) {
  const b = new Builder(true);
  b.blob(HIDE, [0, 0.02 * s, -0.33 * s], [0.06 * s, 0.42 * s, 0.37 * s], 8, 5, 0.05);
  b.blob(HIDE, [0, -0.36 * s, -0.2 * s], [0.055 * s, 0.17 * s, 0.2 * s], 6, 4);
  return b.model();
}

/** The trunk in two lengths, each hanging from its own joint so it can swing and curl. */
export function elephantTrunk(s: number) {
  const { bend } = elephantJoints(s);
  const upper = new Builder(true);
  upper.sweep(HIDE, [[0, 0, 0], [0, -0.5 * s, 0.14 * s], [0, bend[1], bend[2]]], [0.21 * s, 0.15 * s, 0.11 * s], 9);
  const lower = new Builder(true);
  lower.sweep(HIDE, [[0, 0.02 * s, 0], [0, -0.45 * s, -0.04 * s], [0, -0.78 * s, 0.02 * s], [0, -0.9 * s, 0.16 * s]], [0.11 * s, 0.085 * s, 0.07 * s, 0.055 * s], 9);
  return { upper: upper.model(), lower: lower.model() };
}

export function elephantLeg(s: number) {
  const b = new Builder(true);
  const L = elephantLegLength(s);
  // A pillar, thick at the top, a little narrower at the knee, then spreading to the foot
  b.tube(HIDE, [0, -L, 0], 0.29 * s, 0.33 * s, L + 0.1 * s, 10, { lean: () => [0, 0] });
  b.blob(HIDE, [0, -0.15 * s, 0], [0.36 * s, 0.4 * s, 0.38 * s], 8, 5, 0.05);
  b.blob(HIDE_LOW, [0, -L * 0.55, 0.03 * s], [0.31 * s, 0.1 * s, 0.32 * s], 8, 3, 0.08);
  b.blob(HIDE_LOW, [0, -L + 0.06 * s, 0.02 * s], [0.34 * s, 0.1 * s, 0.35 * s], 10, 4);
  // Toenails, pale, round the front of the foot
  for (const a of [-0.6, 0, 0.6]) b.blob(HIDE_LOW, [Math.sin(a) * 0.3 * s, -L + 0.05 * s, Math.cos(a) * 0.3 * s], [0.05 * s, 0.04 * s, 0.03 * s], 5, 3);
  return b.model();
}

/** The guard's hurricane lantern: a tin frame, a glass chimney glowing round a turned-down wick. */
export function lantern() {
  const b = new Builder(true);
  const TIN: Mat = { color: hex(0x3a3a34), roughness: 0.5, metallic: 0.6, pattern: P.TIN };
  const GLOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [7, 3.6, 1.3], pattern: P.BULB };
  b.tube(TIN, [0, -0.1, 0], 0.07, 0.07, 0.03, 10, { lean: () => [0, 0], cap: true });
  b.blob(GLOW, [0, 0.0, 0], [0.05, 0.075, 0.05], 8, 6);
  b.tube(TIN, [0, 0.08, 0], 0.05, 0.03, 0.05, 10, { lean: () => [0, 0], cap: true });
  for (const a of [0.8, 2.4, 4.0, 5.6]) b.sweep(TIN, [[Math.sin(a) * 0.065, -0.08, Math.cos(a) * 0.065], [Math.sin(a) * 0.055, 0.09, Math.cos(a) * 0.055]], [0.006, 0.006], 3);
  b.sweep(TIN, [[-0.06, 0.12, 0], [0, 0.2, 0], [0.06, 0.12, 0]], [0.005, 0.005, 0.005], 3);
  return b.model();
}
