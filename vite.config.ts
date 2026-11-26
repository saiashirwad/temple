import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import { codeZip } from './tools/codezip.ts';

export default defineConfig({
  plugins: [typegpu(), codeZip()],
  // Box3D finds its .wasm beside its module; pre-bundling would move the module away from it
  optimizeDeps: { exclude: ['box3d.js'] },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, hmr: { overlay: false } },
});
