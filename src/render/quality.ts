// One quality tier for the whole game, chosen once at start-up: a phone (touch screen, or the
// `phone` boot switch) gets shorter draw distances, fewer samples and smaller particle pools; a
// desktop keeps everything as it was tuned. `desktop` forces the desktop tier on a touch device.
// None of the knobs costs mesh-pool slots or changes the forest layout (RNG order).

import { boot } from '../game/boot.ts';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const phone = boot.has('phone') || (!boot.has('desktop') && coarse);

const DESKTOP = {
  /** ground.ts: cells across the terrain grid. */
  groundN: 384,
  /** scene.ts: grass reach and its fade, metres. */
  grassTo: 38,
  grassFade: 10,
  /** scene.ts: undergrowth reach and its fade, metres. */
  underTo: 48,
  underFade: 6,
  /** scene.ts: distance where trees swap mesh for card. */
  lod: 46,
  /** scene.ts: share of far cards (> 200 m from the origin) kept, thinned by hash at add time. */
  farCards: 1,
  /** scene.ts: moon shadow cascade reach. */
  shadowFar: 70,
  /** atmosphere.ts: moon-shaft march steps and lamp halos. */
  steps: 16,
  halos: 12,
  /** pond.ts: the mirror pass's resolution scale. */
  mirrorScale: 0.4,
  /** tex.ts: sampler anisotropy. */
  anisotropy: 8,
  /** air.ts: particle capacities and stream rates, as a share of the desktop ones. */
  air: 1,
};

const PHONE: typeof DESKTOP = {
  groundN: 256,
  grassTo: 24,
  grassFade: 6,
  underTo: 32,
  underFade: 5,
  lod: 40,
  farCards: 0.65,
  shadowFar: 50,
  steps: 6,
  halos: 6,
  mirrorScale: 0.25,
  anisotropy: 4,
  air: 0.5,
};

export const Q: Readonly<typeof DESKTOP> = phone ? PHONE : DESKTOP;
