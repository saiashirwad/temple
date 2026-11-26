// The night sky: deep indigo overhead, a warm haze low down where the village lights are, thin
// moonlit clouds, stars and the moon.

import { environment } from '@typegpu/kit';
import { perlin2d } from '@typegpu/noise';
import { d, std } from 'typegpu';

export const MOON_ARRAY: [number, number, number] = [-0.55, 0.42, -0.72];
export const MOON_DIR = std.normalize(d.vec3f(...MOON_ARRAY));

const ZENITH = d.vec3f(0.003, 0.006, 0.03);
const HORIZON = d.vec3f(0.022, 0.035, 0.075);
const GLOW = d.vec3f(0.05, 0.025, 0.012);
const CLOUD = d.vec3f(0.028, 0.034, 0.055);
const BELOW = d.vec3f(0.006, 0.008, 0.014);

const starAt = environment.stars({ cells: 110, chance: 0.22, size: 0.75 });

/** The sky's colour without stars or moon, which the water and fog also use. */
export const skyColor = (look: d.v3f) => {
  'use gpu';
  const up = look.y;
  let c = std.mix(HORIZON, ZENITH, std.pow(std.saturate(up), 0.5));
  c += GLOW * std.exp(-std.max(up, 0) * 14);
  const toMoon = std.saturate(std.dot(look, MOON_DIR));
  c += d.vec3f(0.03, 0.04, 0.06) * std.pow(toMoon, 12.0);
  const onCloud = look.xz / (std.max(up, 0) + 0.1);
  const cover = perlin2d.sample(onCloud * 0.5) * 0.6 + perlin2d.sample(onCloud * 1.4 + 3) * 0.4;
  const lit = 1 + std.pow(toMoon, 6.0) * 3;
  c += CLOUD * lit * std.smoothstep(0.0, 0.5, cover) * std.smoothstep(0.02, 0.2, up);
  return std.select(std.mix(HORIZON, BELOW, std.saturate(-up * 5)), c, up > 0);
};

export const sky = environment.background((look: d.v3f) => {
  'use gpu';
  let c = skyColor(look);
  const star = starAt(look);
  const tint = std.mix(d.vec3f(1, 0.85, 0.7), d.vec3f(0.75, 0.85, 1), star.seed.y);
  c += tint * (std.pow(star.seed.x, 5.0) * star.disc * 0.6) * std.smoothstep(0.03, 0.25, look.y);
  // The moon, a little past full, with a soft halo
  const m = std.dot(look, MOON_DIR);
  const disc = std.smoothstep(0.99955, 0.99968, m);
  const maria = 0.85 + perlin2d.sample(look.xy * 900) * 0.15;
  c += d.vec3f(1.6, 1.7, 1.9) * disc * maria;
  c += d.vec3f(0.02, 0.03, 0.05) * std.pow(std.saturate(m), 400.0);
  return c;
});
