// Use the same static game and workbench entries as a human player.
import type {} from '../src/scenario/checkpoint.ts';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { parseArgs } from 'node:util';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startClip, writeSheet, type Panel } from './scenario/media.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean' }, list: { type: 'boolean' }, 'list-shots': { type: 'boolean' }, headed: { type: 'boolean' },
    game: { type: 'boolean' }, out: { type: 'string' }, seed: { type: 'string' },
    param: { type: 'string', multiple: true }, shot: { type: 'string', multiple: true },
    spread: { type: 'boolean' }, target: { type: 'string' }, clip: { type: 'string' }, sheet: { type: 'string' },
  },
});
if (values.help) {
  console.log(`npm run scenario -- <id> [--game] [--seed N] [--param key=value]
  --list                  List scenario IDs
  --list-shots            Rehearse this scenario and list its available checkpoints
  --shot NAME             Capture a checkpoint (repeat to select several)
  --spread                Write a labeled PNG sheet (all checkpoints by default)
  --clip SECONDS          Record the page starting at the first selected checkpoint
  --target SELECTOR       Crop stills to one DOM element, e.g. canvas or #workspace
  --out DIR               Save artifacts here (defaults to a temporary folder for captures)
  --headed                Show Chromium during the run
  --sheet FILE DIR...     Combine frames from existing capture directories into one PNG`);
  process.exit(0);
}
interface Shot { name: string; file: string; state?: unknown }
if (values.sheet) {
  const panels: Panel[] = [];
  for (const folder of positionals) {
    const result = JSON.parse(await readFile(join(folder, 'result.json'), 'utf8')) as { scenario: string; shots: Shot[] };
    for (const shot of result.shots) panels.push({ label: result.scenario + ' / ' + shot.name, path: join(folder, shot.file) });
  }
  await writeSheet(values.sheet, panels);
  console.log(resolve(values.sheet));
  process.exit(0);
}

const ids = (await readdir('src/workbench/scenarios')).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).sort();
if (values.list || !positionals.length) {
  console.log(ids.join('\n'));
  process.exit(0);
}
const [id] = positionals;
if (!id || positionals.length !== 1 || !ids.includes(id)) throw new Error('Expected one scenario ID. Use --list.');
if (values.game && !['story.bungalow-ending', 'world.walk'].includes(id))
  throw new Error('Full-game scenarios are story.bungalow-ending and world.walk.');
const seconds = Number(values.clip ?? 0);
if (values.clip !== undefined && (!Number.isFinite(seconds) || seconds < 0.25 || seconds > 30))
  throw new Error('--clip takes a duration between 0.25 and 30 seconds.');
const requested = [...new Set(values.shot ?? [])];
if (requested.some(name => !/^[a-z0-9][a-z0-9-]*$/.test(name))) throw new Error('Invalid checkpoint name. Use --list-shots.');
const listing = !!values['list-shots'];
const selection = listing || (values.spread && !requested.length) ? ['*'] : requested.length ? requested : ['ready'];
const params = new URLSearchParams(values.param?.map(pair => {
  const eq = pair.indexOf('=');
  if (eq < 1) throw new Error('Expected --param key=value');
  return [pair.slice(0, eq), pair.slice(eq + 1)];
}));
params.set('scenario', id);
params.set('run', '1');
if (selection.includes('*')) params.append('shot', '*');
else for (const shot of requested) params.append('shot', shot);
if (values.seed !== undefined) params.set('seed', values.seed);
const entry = (values.game ? '/' : '/workbench.html') + '?' + params;
const capture = !listing && (values.out !== undefined || values.spread || values.target || requested.length > 0 || seconds > 0);
const folder = capture ? (values.out ? resolve(values.out) : await mkdtemp(join(tmpdir(), id + '-'))) : undefined;
if (folder) await mkdir(folder, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('No HTTP port available.');
  const asset = params.get('asset') ?? '';
  const needsGpu = values.game || (id === 'world.walk' && params.has('view')) || (id === 'asset.inspect' && (asset.startsWith('tree/') || asset.endsWith('.glb')));
  const headed = values.headed || (process.platform === 'darwin' && needsGpu);
  browser = await chromium.launch({ headless: !headed, args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [], available: string[] = [];
  const shots: Shot[] = [];
  let clip: { file: string; from: string; done: Promise<void> } | undefined;
  let trace: unknown;
  let firstFrame: unknown;
  let status = 'fail';
  let sheet: string | undefined;
  page.on('pageerror', err => errors.push(err.message));
  const collect = async (name: string, state?: unknown) => {
    available.push(name);
    if (!folder) return;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || shots.some(shot => shot.name === name))
      throw new Error(`Invalid or repeated checkpoint: ${name}`);
    const file = name === 'ready' ? 'frame.png' : name + '.png';
    const subject = values.target ? page.locator(values.target) : page;
    await subject.screenshot({ path: join(folder, file), timeout: 15000, animations: 'disabled' });
    shots.push({ name, file, state });
    if (seconds && !clip) {
      const video = name + '.webm';
      clip = { file: video, from: name, ...await startClip(page, join(folder, video), seconds) };
      // A tour moves its camera at the next instruction. Keep this viewpoint for the clip.
      if (id === 'world.walk') await clip.done;
    }
  };
  try {
    if (capture || listing) {
      await page.addInitScript(shots => { window.scenarioShots = shots; }, selection);
      await page.exposeFunction('scenarioCapture', collect);
    }
    await page.goto('http://127.0.0.1:' + address.port + entry, { timeout: 90000, waitUntil: 'domcontentloaded' });
    const selector = values.game ? '#game-replay' : '#workspace';
    const target = page.locator(selector);
    await page.waitForFunction(selector => {
      const el = document.querySelector<HTMLElement>(selector);
      if (document.querySelector('#note[data-error]')) return true;
      if (!el) return false;
      if (el.dataset.error) return true;
      return el.dataset.verdict === undefined ? el.dataset.ready === 'true' : ['pass', 'fail'].includes(el.dataset.verdict);
    }, selector, {timeout: values.game ? 180000 : 60000});
    const bootError = await page.locator('#note[data-error]').evaluateAll(nodes => nodes[0]?.getAttribute('data-error'));
    if (bootError) throw new Error(bootError);
    status = await target.evaluate(el => el.dataset.error ?? el.dataset.verdict ?? 'ready');
    if (values.game && status === 'pass') {
      await page.locator('canvas[data-first-frame]').waitFor();
      firstFrame = await page.evaluate(() => ({
        ms: Math.round(performance.getEntriesByName('game:first-frame')[0].startTime),
        ...JSON.parse(document.querySelector('canvas')!.dataset.firstFrame!),
      }));
    }
    const raw = await page.locator('[data-trace]').first().evaluateAll(nodes => nodes[0]?.textContent);
    if (raw) trace = JSON.parse(raw);
    if (['ready', 'pass'].includes(status)) {
      if (listing || selection.includes('ready') || (!shots.length && selection.includes('*'))) {
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        await collect('ready');
      }
      const missing = requested.filter(name => !available.includes(name));
      if (missing.length) throw new Error('Checkpoint not reached: ' + missing.join(', ') + '. Use --list-shots.');
    }
    if (values.spread && folder && shots.length) {
      await writeSheet(join(folder, 'spread.png'), shots.map(s => ({ label: s.name, path: join(folder, s.file) })));
      sheet = 'spread.png';
    }
  } catch (error) {
    errors.push(String(error));
    status = 'fail';
  } finally {
    try { await clip?.done; } catch (error) { errors.push(String(error)); }
    if (errors.length || !['ready', 'pass'].includes(status)) {
      if (['pass', 'ready'].includes(status)) status = 'fail';
      process.exitCode = 1;
      if (folder) await page.screenshot({ path: join(folder, 'failure.png'), timeout: 5000 }).catch(() => {});
    }
    if (listing && !process.exitCode) console.log(available.join('\n'));
    else {
      const result = { scenario: id, entry, target: values.target, status, firstFrame, trace, errors, shots, sheet, clip: clip && { file: clip.file, from: clip.from, seconds } };
      const json = JSON.stringify(result, null, 2);
      if (folder) await writeFile(join(folder, 'result.json'), json + '\n');
      console.log(json);
      if (folder) console.error('Capture saved in ' + folder);
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
