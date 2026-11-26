// Each bake reads current source, including edits to transitive TS and JSON imports.
import { fileURLToPath } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';

const files = new Set([fileURLToPath(import.meta.url)]);

const { bakeWorldLayout } = await tsImport('./world-layout.ts', {
  parentURL: import.meta.url,
  onImport(url) {
    if (url.startsWith('file:') && !url.includes('/node_modules/')) files.add(fileURLToPath(url));
  },
});

const source = Uint8Array.from(bakeWorldLayout(workerData.level));

parentPort.postMessage({ source, files: [...files] }, [source.buffer]);
