// Serves /code.zip: the whole project as it is right now (committed or not, everything git doesn't
// ignore), zipped fresh on each request by git, for the download button in the corner.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Connect, Plugin } from 'vite';

export function zipNow(dir: string): Buffer {
  const tmp = mkdtempSync(join(tmpdir(), 'codezip-'));
  try {
    // A throwaway index, so the real one (and what's staged) is left alone
    const env = { ...process.env, GIT_INDEX_FILE: join(tmp, 'index') };
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, maxBuffer: 1 << 30 });
    git('add', '-A');
    const tree = git('write-tree').toString().trim();
    return git('archive', '--format=zip', '--prefix=temple/', tree);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function codeZip(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/code.zip') return next();
    try {
      const zip = zipNow(process.cwd());
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="temple-${stamp}.zip"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', zip.length);
      res.end(zip);
    } catch (e) {
      res.statusCode = 500;
      res.end(`Could not zip the code: ${String(e)}`);
    }
  };
  return {
    name: 'code-zip',
    configureServer: (s) => void s.middlewares.use(serve),
    configurePreviewServer: (s) => void s.middlewares.use(serve),
  };
}
