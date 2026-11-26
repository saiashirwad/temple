import { readFileSync, readdirSync } from 'node:fs';
import { load } from '@typegpu/kit/gltf';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { roomFor } from '@typegpu/kit/meshPool';
import { relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

export function assetCatalog(): Plugin {
  const id = 'virtual:temple-assets';
  const propSizes = 'virtual:temple-prop-sizes';
  let directory: string;
  return {
    name: 'temple-asset-catalog',
    configResolved(config) { directory = resolve(config.root, config.publicDir); },
    resolveId(source) { if (source === id || source === propSizes) return '\0' + source; },
    async load(source) {
      if (source === '\0' + propSizes) {
        const models = resolve(directory, 'models');
        const files = readdirSync(models).filter(file => /\.(glb|gltf)$/.test(file));
        const entries = await Promise.all(files.map(async file => {
          const model = await load(pathToFileURL(resolve(models, file)).href, {
            fetch: async url => {
              const path = fileURLToPath(url);
              this.addWatchFile(path);
              return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(readFileSync(path)).buffer };
            },
          });
          const { capacity: meshes, ...sizes } = roomFor([model]);
          return [file.slice(0, file.lastIndexOf('.')), { file, meshes, ...sizes }];
        }));
        return 'export default ' + JSON.stringify(Object.fromEntries(entries));
      }
      if (source !== '\0' + id) return;
      const files = readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => relative(directory, resolve(entry.parentPath, entry.name)).split(sep).join('/'))
        .sort();
      return 'export default ' + JSON.stringify(files);
    },
    configureServer(server) {
      const refresh = (file: string) => {
        if (!file.startsWith(directory + sep)) return;
        const changed = file.startsWith(resolve(directory, 'models') + sep) ? [id, propSizes] : [id];
        for (const name of changed) {
          const module = server.moduleGraph.getModuleById('\0' + name);
          if (module) server.moduleGraph.invalidateModule(module);
        }
      };
      server.watcher.on('add', refresh).on('unlink', refresh).on('change', refresh);
    },
  };
}
