import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';

import { assetCatalog } from './tools/asset-catalog.ts';

export default defineConfig({
  plugins: [typegpu(), assetCatalog()],
  build: { rolldownOptions: { input: { game: 'index.html', workbench: 'workbench.html' } } },
  // Box3D finds its .wasm beside its module; pre-bundling would move the module away from it
  optimizeDeps: { exclude: ['box3d.js'] },
});
