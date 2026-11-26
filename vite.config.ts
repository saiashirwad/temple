import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [typegpu()],
  // Box3D finds its .wasm beside its module; pre-bundling would move the module away from it
  optimizeDeps: { exclude: ['box3d.js'] },
});
