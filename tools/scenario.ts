// Run the same static entry and URL used by the workbench. Vite supplies assets locally.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { parseArgs } from 'node:util';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: 'boolean' }, headed: { type: 'boolean' }, game: { type: 'boolean' }, out: { type: 'string' },
    param: { type: 'string', multiple: true }, seed: { type: 'string' },
  },
});
const ids = (await readdir('src/workbench/scenarios')).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).sort();
if (values.list || !positionals.length) {
  console.log(ids.join('\n'));
  process.exit(0);
}
const [id] = positionals;
if (!id || !ids.includes(id)) throw new Error('Unknown scenario. Use --list.');
if (values.game && id !== 'story.bungalow-ending') throw new Error('The full-game replay supports story.bungalow-ending.');
const params = new URLSearchParams(values.param?.map(pair => {
  const eq = pair.indexOf('=');
  if (eq < 1) throw new Error('Expected --param key=value');
  return [pair.slice(0, eq), pair.slice(eq + 1)];
}));
params.set('scenario', id);
params.set('run', '1');
if (values.seed !== undefined) params.set('seed', values.seed);

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('No HTTP port available.');
  const url = 'http://127.0.0.1:' + address.port + '/' + (values.game ? '' : 'workbench.html') + '?' + params;
  const folder = values.out ? resolve(values.out) : undefined;
  if (folder) await mkdir(folder, { recursive: true });
  const asset = params.get('asset') ?? '';
  const needsGpu = values.game || (id === 'asset.inspect' && (asset.startsWith('tree/') || asset.endsWith('.glb')));
  const headed = values.headed || (process.platform === 'darwin' && needsGpu);
  browser = await chromium.launch({ headless: !headed, args: ['--enable-unsafe-webgpu'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: folder ? { dir: folder } : undefined });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto(url, { timeout: 90000, waitUntil: 'domcontentloaded' });
    const target = page.locator(values.game ? '#game-replay' : '#workspace');
    await page.waitForFunction(({game}) => {
      const el = document.querySelector<HTMLElement>(game ? '#game-replay' : '#workspace');
      return el && (el.dataset.error || ((game || el.dataset.verdict !== undefined) ? ['pass','fail'].includes(el.dataset.verdict ?? '') : el.dataset.ready === 'true'));
    }, {game: !!values.game}, {timeout: values.game ? 180000 : 60000});
    const status = await target.evaluate(el => el.dataset.error ?? el.dataset.verdict ?? 'ready');
    const trace = await page.locator('[data-trace]').first().evaluateAll(nodes => nodes[0]?.textContent);
    const result = { scenario: id, status, trace: trace ? JSON.parse(trace) : undefined, errors };
    const json = JSON.stringify(result, null, 2);
    console.log(json);
    if (folder) await writeFile(join(folder, 'result.json'), json + '\n');
    if (errors.length || !['pass', 'ready'].includes(status)) process.exitCode = 1;
  } finally {
    if (folder) await page.screenshot({ path: join(folder, 'frame.png'), timeout: 10000 }).catch(() => {});
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
