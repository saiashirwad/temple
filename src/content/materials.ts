import { TEX_LAYERS } from '../generated/textures.gen.ts';

/** The texture array's layers: the baked tiles, then the poster atlas painted on its own. */
export const materialLayers = [
  ...TEX_LAYERS,
  { name: 'posters', metres: 1, metal: false, mean: [0.3, 0.12, 0.08] },
  { name: 'signs', metres: 1, metal: false, mean: [0.4, 0.38, 0.3] },
] as const;
