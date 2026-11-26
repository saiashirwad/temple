import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { Plugin } from 'vite';

interface Bake { source: Uint8Array; files: string[] }

function bake(level: number): Promise<Bake> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./world-layout-worker.mjs', import.meta.url), { workerData: { level } });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Layout worker exited with code ${code}`)));
  });
}

const digest = (source: Uint8Array) => createHash('sha256').update(source).digest('hex').slice(0, 12);

export function worldLayout(): Plugin {
  let file = '@temple/layout.bin';
  let base: string;
  let production: boolean;

  return {
    name: 'temple-world-layout',
    configResolved(config) { base = config.base; production = config.command === 'build'; },
    async buildStart() {
      if (!production) return;
      const { source, files } = await bake(9);
      files.forEach(path => this.addWatchFile(path));
      file = `assets/layout-${digest(source)}.bin`;
      this.emitFile({ type: 'asset', fileName: file, source });
    },
    configureServer(server) {
      let cached: Promise<{ source: Uint8Array; etag: string }> | undefined;
      let inputs = new Set<string>();
      let duringBake: Set<string> | undefined;
      server.watcher.on('all', (_event, path: string) => {
        if (duringBake) duringBake.add(path);
        else if (inputs.has(path)) cached = undefined;
      });

      function current(): NonNullable<typeof cached> {
        if (cached) return cached;
        const edits = duringBake = new Set<string>();
        cached = bake(1).then(({ source, files }) => {
          inputs = new Set(files);
          server.watcher.add(files);
          duringBake = undefined;

          // An edit can arrive while the worker is reading its dependency graph.
          if (files.some(path => edits.has(path))) {
            cached = undefined;

            return current();
          }

          return { source, etag: '"' + digest(source) + '"' };
        }).catch(error => {
          cached = undefined;
          duringBake = undefined;
          throw error;
        });

        return cached;
      }

      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== base + file) return next();
        void current().then(({ source, etag }) => {
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('ETag', etag);

          if (req.headers['if-none-match'] === etag) { res.writeHead(304).end();

 return; }

          res.setHeader('Content-Type', 'application/octet-stream');
          res.end(source);
        }).catch(next);
      });
    },
    transformIndexHtml(_html, context) {
      if (context.path !== '/index.html') return;

      return [{ tag: 'link', attrs: { id: 'world-layout', rel: 'preload', as: 'fetch', crossorigin: 'anonymous', href: base + file }, injectTo: 'head-prepend' }];
    },
  };
}
