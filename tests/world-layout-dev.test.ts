import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { createServer } from 'vite';

test('the dev server bakes on demand and invalidates only edited layout dependencies', { timeout: 15000 }, async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'temple-dev-layout-')));
  const build = join(folder, 'build');
  const value = join(build, 'value.ts');
  const unrelated = join(folder, 'workbench.html');
  try {
    await mkdir(build);
    await symlink(new URL('../node_modules/', import.meta.url), join(folder, 'node_modules'), 'dir');
    for (const name of ['world-layout-plugin.ts', 'world-layout-worker.mjs'])
      await copyFile(new URL('../tools/build/' + name, import.meta.url), join(build, name));
    await writeFile(join(folder, 'package.json'), '{"type":"module"}');
    await writeFile(join(folder, 'vite.config.ts'), "import { worldLayout } from './build/world-layout-plugin.ts'; export default { plugins: [worldLayout()] };");
    await writeFile(join(folder, 'index.html'), '<html><head></head></html>');
    await writeFile(unrelated, '<html></html>');
    await writeFile(value, "export const value = 'first';");
    await writeFile(join(build, 'world-layout.ts'), `
      import { appendFileSync } from 'node:fs';
      import { value } from './value.ts';
      export function bakeWorldLayout() {
        appendFileSync(new URL('./runs', import.meta.url), '1');
        return new TextEncoder().encode(value);
      }
    `);
    const server = await createServer({ root: folder, base: '/postcard/', logLevel: 'silent',
      optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0 } });
    try {
      await server.listen();
      const base = server.resolvedUrls!.local[0];
      const url = new URL('@temple/layout.bin', base);
      const runs = join(build, 'runs');
      assert.doesNotMatch(await (await fetch(new URL('workbench.html', base))).text(), /world-layout/);
      assert.match(await (await fetch(base)).text(), /id="world-layout"/);
      await assert.rejects(readFile(runs), { code: 'ENOENT' });
      const [first, duplicate] = await Promise.all([fetch(url), fetch(url)]);
      assert.equal(await first.text(), 'first');
      assert.equal(await duplicate.text(), 'first');
      const etag = first.headers.get('etag')!;
      assert.equal(await readFile(runs, 'utf8'), '1');

      await writeFile(unrelated, '<html>edited</html>');
      const revalidate = () => fetch(url, { headers: { 'If-None-Match': etag } });
      assert.equal((await revalidate()).status, 304);
      assert.equal(await readFile(runs, 'utf8'), '1');
      await writeFile(value, "export const value = 'second';");
      let next = await revalidate();
      const deadline = Date.now() + 4000;
      while (next.status === 304 && Date.now() < deadline) {
        await wait(25);
        next = await revalidate();
      }
      assert.equal(await next.text(), 'second');
      assert.equal(await readFile(runs, 'utf8'), '11');
    } finally {
      await server.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
