// How every light in the scene lives: oil flames waver, gutter in the night breeze and now and
// then sputter, the breeze reaching neighbouring lamps together; sodium lamps hum steady, but one
// is dying and cycles off, then warms back up from a dull red; tube lights stutter now and then
// and one in a shop flickers badly; bulbs dip together when the village voltage sags; a TV
// flickers through a shop door. The same sums run on the CPU for the light table and on the GPU
// for the glowing surfaces, so a lamp's light keeps time with its flame.

import { d, std } from 'typegpu';
import type { V3 } from './geo.ts';

export type LampKind = 'oil' | 'sodium' | 'sodiumBad' | 'tube' | 'tubeBad' | 'bulb' | 'tv';

export interface Lamp {
  position: V3;
  color: V3;
  intensity: number;
  range: number;
  /** Which way this light lives; oil when left out. */
  kind?: LampKind;
  /** The flicker seed, 0 to 0.45, matching the glowing surface it belongs to. */
  seed?: number;
  /** Kept for older lamps: a phase from which a seed is made when `seed` is left out. */
  phase?: number;
  flicker?: number;
  shadow?: boolean;
  /** A downward cone, inner and outer half-angles. */
  spot?: [number, number];
}

export const seedOf = (l: Lamp) => l.seed ?? (((l.phase ?? 0) * 0.137) % 1 + 1) % 1 * 0.45;

// ---------------------------------------------------------------- the CPU side

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

  return t * t * (3 - 2 * t);
};

const fract = (x: number) => x - Math.floor(x);

/** An oil flame's brightness at time `t` for seed `s` at world x, z `w` (the breeze's phase). */
export function oilAt(t: number, s: number, w: number) {
  const S = s * 20;
  const waver = 1 + 0.07 * Math.sin(2.1 * t + 6.3 * S) + 0.05 * Math.sin(5.3 * t + 11 * S) + 0.04 * Math.sin(9.7 * t + 17 * S) + 0.03 * Math.sin(15.1 * t + 23 * S);
  const gust = smooth(0.45, 0.95, (0.5 + 0.5 * Math.sin(0.23 * t + w)) * (0.5 + 0.5 * Math.sin(0.17 * t + 1.3 * w + 0.5)) * 1.6);
  const shiver = 0.5 + 0.5 * Math.sin(21 * t + 31 * S) * Math.sin(13 * t + 7 * S);
  const sputter = smooth(0.992, 1, Math.sin(0.61 * t + 40 * S));

  return waver * (1 - gust * (0.22 + 0.32 * shiver)) * (1 - 0.45 * sputter);
}

/** The village mains: a slow wander and now and then a sag that every bulb and tube shares. */
export function mainsAt(t: number) {
  const sag = smooth(0.93, 1, Math.sin(0.13 * t) * Math.sin(0.051 * t + 1));

  return 1 - 0.035 * Math.sin(0.7 * t) - 0.3 * sag;
}

/** The dying sodium lamp: on, then out, then back from a dull red over a dozen seconds. */
export function sodiumBadAt(t: number, s: number) {
  const c = fract(t / 47 + s * 2);

  if (c < 0.6) return { level: 1 - 0.08 * smooth(0.5, 0.6, c) * (0.5 + 0.5 * Math.sin(t * 9)), warm: 1 };

  if (c < 0.66) return { level: 0.02, warm: 0 };
  const k = (c - 0.66) / 0.34;

  return { level: 0.04 + 0.96 * k * k, warm: k };
}

/** A tube light: steady, but for a short stutter every half minute or so. */
export function tubeAt(t: number, s: number) {
  const c = fract(t / 31 + s * 2);

  if (c > 0.025) return 1;

  return Math.sin(t * 47) * Math.sin(t * 29 + s * 9) > -0.2 ? 1 : 0.08;
}

/** The bad tube: glowing ends, bursts of flicker, then a while lit. */
export function tubeBadAt(t: number, s: number) {
  const c = fract(t / 9 + s * 2);

  if (c > 0.35) return 0.95;
  const blink = Math.sin(t * 31 + s * 5) * Math.sin(t * 17) + 0.25 * Math.sin(t * 7);

  return blink > 0 ? 0.9 : 0.12;
}

/** A television's light through a door: a new brightness at each cut, wavering between. */
export function tvAt(t: number, s: number) {
  const n = Math.floor(t * 0.6 + s * 7);
  const level = 0.35 + fract(n * 0.618034) * 0.45 + fract(n * 0.414214) * 0.2;

  return level * (0.92 + 0.08 * Math.sin(t * 6.1 + n));
}

/** A lamp's light multiplier and, for the dying sodium lamp, how far it has warmed up. */
export function lampAt(l: Lamp, t: number) {
  const s = seedOf(l);
  const w = l.position[0] * 0.045 + l.position[2] * 0.03;

  switch (l.kind ?? 'oil') {
    case 'oil':
      return { level: oilAt(t, s, w), warm: 1 };
    case 'sodium':
      return { level: mainsAt(t) * 0.3 + 0.7, warm: 1 };
    case 'sodiumBad':
      return sodiumBadAt(t, s);
    case 'tube':
      return { level: tubeAt(t, s) * mainsAt(t), warm: 1 };
    case 'tubeBad':
      return { level: tubeBadAt(t, s) * mainsAt(t), warm: 1 };
    case 'bulb':
      return { level: mainsAt(t), warm: 1 };
    case 'tv':
      return { level: tvAt(t, s), warm: 1 };
  }
}

// ---------------------------------------------------------------- the GPU side, the same sums

export const oilGpu = (t: number, s: number, w: number) => {
  'use gpu';
  const S = s * 20;
  const waver = 1 + 0.07 * std.sin(2.1 * t + 6.3 * S) + 0.05 * std.sin(5.3 * t + 11 * S) + 0.04 * std.sin(9.7 * t + 17 * S) + 0.03 * std.sin(15.1 * t + 23 * S);
  const gust = std.smoothstep(0.45, 0.95, (0.5 + 0.5 * std.sin(0.23 * t + w)) * (0.5 + 0.5 * std.sin(0.17 * t + 1.3 * w + 0.5)) * 1.6);
  const shiver = 0.5 + 0.5 * std.sin(21 * t + 31 * S) * std.sin(13 * t + 7 * S);
  const sputter = std.smoothstep(0.992, 1, std.sin(0.61 * t + 40 * S));

  return waver * (1 - gust * (0.22 + 0.32 * shiver)) * (1 - 0.45 * sputter);
};

/** The breeze as a sideways push on the flames, in x and z, from the same gusts. */
export const breezeGpu = (t: number, s: number, w: number) => {
  'use gpu';
  const S = s * 20;
  const gust = std.smoothstep(0.45, 0.95, (0.5 + 0.5 * std.sin(0.23 * t + w)) * (0.5 + 0.5 * std.sin(0.17 * t + 1.3 * w + 0.5)) * 1.6);
  const sway = std.sin(3.1 * t + 9 * S) * 0.35 + std.sin(7.3 * t + 4 * S) * 0.2;
  const shake = std.sin(19 * t + 13 * S) * gust;

  return d.vec2f(0.25 + gust * 0.9 + sway * 0.4 + shake * 0.5, sway * 0.6 + shake * 0.4);
};

export const mainsGpu = (t: number) => {
  'use gpu';
  const sag = std.smoothstep(0.93, 1, std.sin(0.13 * t) * std.sin(0.051 * t + 1));

  return 1 - 0.035 * std.sin(0.7 * t) - 0.3 * sag;
};

/** x is the level, y how far the lamp has warmed (0 dull red, 1 full orange). */
export const sodiumBadGpu = (t: number, s: number) => {
  'use gpu';
  const c = std.fract(t / 47 + s * 2);
  let level = 1 - 0.08 * std.smoothstep(0.5, 0.6, c) * (0.5 + 0.5 * std.sin(t * 9));
  let warm = d.f32(1);

  if (c >= 0.6 && c < 0.66) {
    level = 0.02;
    warm = 0;
  }

  if (c >= 0.66) {
    const k = (c - 0.66) / 0.34;
    level = 0.04 + 0.96 * k * k;
    warm = k;
  }

  return d.vec2f(level, warm);
};

export const tubeGpu = (t: number, s: number) => {
  'use gpu';
  const c = std.fract(t / 31 + s * 2);
  const on = std.select(d.f32(0.08), d.f32(1), std.sin(t * 47) * std.sin(t * 29 + s * 9) > -0.2);

  return std.select(on, d.f32(1), c > 0.025);
};

export const tubeBadGpu = (t: number, s: number) => {
  'use gpu';
  const c = std.fract(t / 9 + s * 2);
  const blink = std.sin(t * 31 + s * 5) * std.sin(t * 17) + 0.25 * std.sin(t * 7);
  const on = std.select(d.f32(0.12), d.f32(0.9), blink > 0);

  return std.select(on, d.f32(0.95), c > 0.35);
};

export const tvGpu = (t: number, s: number) => {
  'use gpu';
  const n = std.floor(t * 0.6 + s * 7);
  const level = 0.35 + std.fract(n * 0.618034) * 0.45 + std.fract(n * 0.414214) * 0.2;

  return level * (0.92 + 0.08 * std.sin(t * 6.1 + n));
};
