import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import { materialLayers } from '../../src/content/materials.ts';

// At intermediate viewport sizes the device pixel ratio decides the colour tier.
// Only preload a colour pack when the tier is certain. See web.host's 1.5 ratio cap.
const packs = [
  { id: 'data', suffix: '512_d.jpg' },
  { id: 'color-512', suffix: '512_c.webp', media: '(max-width: 466px), (max-height: 466px)' },
  { id: 'color-1024', suffix: '1024_c.webp', media: '(min-width: 701px) and (min-height: 701px) and (min-resolution: 1dppx)' },
];

export function materialTiles(): Plugin {
  let dir: string;
  let base: string;
  let links: HtmlTagDescriptor[];
  return {
    name: 'temple-material-tiles',
    apply: 'build',
    configResolved(config) { dir = join(config.publicDir, 'tex'); base = config.base; },
    async buildStart() {
      links = await Promise.all(packs.map(async ({ id, suffix, media }) => {
        const tiles = await Promise.all(materialLayers.map(({ name }) => {
          const path = join(dir, name + '_' + suffix);
          this.addWatchFile(path);
          return readFile(path);
        }));
        const offsets = Buffer.alloc((tiles.length + 1) * 4);
        let offset = offsets.length;
        offsets.writeUInt32LE(offset);
        tiles.forEach((tile, i) => {
          offset += tile.length;
          offsets.writeUInt32LE(offset, (i + 1) * 4);
        });
        const source = Buffer.concat([offsets, ...tiles]);
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
        const file = `assets/material-${id}-${hash}.bin`;
        this.emitFile({ type: 'asset', fileName: file, source });
        return {
          tag: 'link', injectTo: 'head',
          attrs: { id: `material-${id}`, rel: 'preload', as: 'fetch', crossorigin: 'anonymous', fetchpriority: 'low', href: base + file, ...(media && { media }) },
        };
      }));
    },
    transformIndexHtml(_html, context) {
      if (context.path === '/index.html') return links;
    },
  };
}
