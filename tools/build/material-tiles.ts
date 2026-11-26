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

// This tiny script runs as the browser reads the game HTML, before the JavaScript
// entry or device initialization. Capture URLs and workbench iframes stay exact.
const preload = `{
  const params = new URLSearchParams(location.search);
  for (const [key, value] of new URLSearchParams(location.hash.slice(1))) {
    if (!params.has(key)) params.set(key, value);
  }
  const mode = params.get('materials');
  const play = [...params.keys()].every(key => key === 'seed' || key === 'materials');
  const capture = window.top !== window || ['scenario', 'run', 'shot'].some(key => params.has(key));
  const preview = !capture && (mode === 'preview' || (mode !== 'full' && play));
  for (const link of document.querySelectorAll('link[id^="material-"]')) {
    if (preview === (link.id === 'material-preview')) link.rel = 'preload';
  }
}`;

export function materialTiles(): Plugin {
  let dir: string;
  let base: string;
  let links: HtmlTagDescriptor[];
  return {
    name: 'temple-material-tiles',
    apply: 'build',
    configResolved(config) { dir = join(config.publicDir, 'tex'); base = config.base; },
    async buildStart() {
      const { default: sharp } = await import('sharp');
      const pack = (id: string, tiles: Buffer[], media?: string): HtmlTagDescriptor => {
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
          attrs: { id: `material-${id}`, as: 'fetch', crossorigin: 'anonymous', fetchpriority: 'low', href: base + file, ...(media && { media }) },
        };
      };
      const sets = await Promise.all(packs.map(async ({ id, suffix, media }) => {
        const tiles = await Promise.all(materialLayers.map(({ name }) => {
          const path = join(dir, name + '_' + suffix);
          this.addWatchFile(path);
          return readFile(path);
        }));
        const previews = id === 'color-1024' ? [] : await Promise.all(tiles.map(tile =>
          // Keep RGB even at near-zero alpha: alpha holds a surface mask on the mural.
          sharp(tile).resize(128, 128).webp({ quality: 80 }).toBuffer()));
        return { link: pack(id, tiles, media), previews };
      }));
      // Store data, then colour, in the same order as the two 512px source sets above.
      links = [...sets.map(set => set.link), pack('preview', sets.flatMap(set => set.previews)),
        { tag: 'script', children: preload, injectTo: 'head' }];
    },
    transformIndexHtml(_html, context) {
      if (context.path === '/index.html') return links;
    },
  };
}
