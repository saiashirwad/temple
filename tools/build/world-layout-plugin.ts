import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { tsImport } from 'tsx/esm/api';

export function worldLayout(): Plugin {
  let file: string;
  let base: string;
  return {
    name: 'temple-world-layout',
    apply: 'build',
    configResolved(config) { base = config.base; },
    async buildStart() {
      // Load generators only while baking. A dev server can edit a specimen without
      // restarting Vite's own config or regenerating the rest of the world.
      const { bakeWorldLayout } = await tsImport('./world-layout.ts', {
        parentURL: import.meta.url,
        onImport: url => {
          if (url.startsWith('file:') && !url.includes('/node_modules/')) this.addWatchFile(fileURLToPath(url));
        },
      }) as typeof import('./world-layout.ts');
      const source = bakeWorldLayout();
      const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
      file = `assets/layout-${hash}.bin`;
      this.emitFile({ type: 'asset', fileName: file, source });
    },
    transformIndexHtml(_html, context) {
      if (context.path !== '/index.html') return;
      return [{ tag: 'link', attrs: { id: 'world-layout', rel: 'preload', as: 'fetch', crossorigin: 'anonymous', href: base + file }, injectTo: 'head-prepend' }];
    },
  };
}
