import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';

import { materialTiles } from './tools/build/material-tiles.ts';
import { worldLayout } from './tools/build/world-layout-plugin.ts';
import { assetCatalog } from './tools/asset-catalog.ts';

export default defineConfig({
  plugins: [typegpu(), assetCatalog(), worldLayout(), materialTiles()],
  build: {
    rolldownOptions: {
      input: { game: 'index.html', workbench: 'workbench.html' },
      // Inline small shared modules into their consumers. Story tools stay lightweight,
      // and opening the game avoids a separate request for every shared world helper.
      output: { codeSplitting: { experimentalInlineCommonChunks: { maxSize: 128 * 1024 } } },
    },
  },
  // Box3D finds its .wasm beside its module; pre-bundling would move the module away from it
  optimizeDeps: { exclude: ['box3d.js'] },
});
