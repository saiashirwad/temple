import { writeFileSync } from 'node:fs';

export interface TextureLayer {
  name: string;
  metres: number;
  metal: boolean;
  mean: readonly number[];
  photo?: string;
}

export function writeTextureIndex(layers: readonly TextureLayer[]) {
  const indices = Object.fromEntries(layers.map((layer, i) => [layer.name, i]));

  const source = `// Baked by tools/tex/bake.ts: the texture array's layers, their tile sizes and mean colours.
export const TEX = ${JSON.stringify(indices)} as const;
export const TEX_LAYERS = ${JSON.stringify(layers)} as const;
`;

  writeFileSync(new URL('../../src/generated/textures.gen.ts', import.meta.url), source);
}
