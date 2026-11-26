import { readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

export function assetCatalog(): Plugin {
  const id = 'virtual:temple-assets';
  let directory: string;
  return {
    name: 'temple-asset-catalog',
    configResolved(config) { directory = resolve(config.root, config.publicDir); },
    resolveId(source) { if (source === id) return '\0' + id; },
    load(source) {
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
        const module = server.moduleGraph.getModuleById('\0' + id);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.on('add', refresh).on('unlink', refresh);
    },
  };
}
