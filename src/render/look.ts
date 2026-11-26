// The grade: lamplight kept warm and rich, shadows pushed toward moonlit indigo, as in an oil
// painting of a lamp-lit night.

import { d, std } from 'typegpu';

export const grade = (color: d.v3f, _uv: d.v2f) => {
  'use gpu';
  const luma = std.dot(color, d.vec3f(0.2126, 0.7152, 0.0722));
  // Split tone: cool, deep shadows; warm highlights
  const shadows = d.vec3f(0.82, 0.9, 1.12);
  const lights = d.vec3f(1.06, 0.98, 0.86);
  const t = std.smoothstep(0.02, 0.5, luma);
  let c = color * std.mix(shadows, lights, t);
  // A touch more saturation in the midtones, like oil pigment
  const grey = d.vec3f(std.dot(c, d.vec3f(0.2126, 0.7152, 0.0722)));
  c = std.mix(grey, c, 1.18);
  // Lift the blacks just off zero so the night has a body to it
  c = c * 0.97 + d.vec3f(0.006, 0.008, 0.016);

  return std.max(c, d.vec3f(0));
};
