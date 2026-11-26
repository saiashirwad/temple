// Measure the production game from navigation to its first visible scene. Each sample
// starts a fresh Chromium process and profile so HTTP and browser shader caches are cold.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { verifyFirstFrame, type FirstFrame } from './scenario/first-frame.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  runs: { type: 'string', default: '3' }, dist: { type: 'string', default: 'dist' },
  mbps: { type: 'string' }, latency: { type: 'string' },
  out: { type: 'string' }, cpu: { type: 'boolean' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log("npm run startup -- [--runs N] [--dist DIR] [--out DIR] [--cpu] [--mbps N] [--latency MS] '/?preset=3'\nPass one or more game paths. --out saves timing and resource waterfalls. --cpu also saves Chromium CPU profiles. --mbps and --latency emulate a download link and request latency.");
  process.exit(0);
}
const runs = Number(values.runs);
if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
if (values.cpu && !values.out) throw new Error('--cpu requires an output directory');
const mbps = values.mbps === undefined ? undefined : Number(values.mbps);
const latency = Number(values.latency ?? 0);
if (mbps !== undefined && (!Number.isFinite(mbps) || mbps <= 0)) throw new Error('--mbps must be positive');
if (!Number.isFinite(latency) || latency < 0) throw new Error('--latency must be nonnegative');
const paths = positionals.length ? positionals : ['/?seed=42', '/?preset=3&seed=42', '/?scenario=story.bungalow-ending&from=ending&seed=42'];
if (paths.some(p => !p.startsWith('/') || p.startsWith('//'))) throw new Error('Expected local game paths starting with /');
const out = values.out ? resolve(values.out) : undefined;
if (out) await mkdir(out, { recursive: true });
const server = await preview({ configFile: false, build: { outDir: resolve(values.dist!) }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(values.length / 2);
  return (sorted[i] + sorted[(values.length - 1) - i]) / 2;
};
try {
  for (const [pathIndex, path] of paths.entries()) {
    const frames: number[] = [];
    const nextPaints: number[] = [];
    for (let i = 0; i < runs; i++) {
      const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu'] });
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const trace = values.cpu || mbps || latency ? await page.context().newCDPSession(page) : null;
        if (trace && (mbps || latency)) {
          await trace.send('Network.enable');
          await trace.send('Network.emulateNetworkConditions', {
            offline: false, latency, downloadThroughput: mbps ? mbps * 1e6 / 8 : -1, uploadThroughput: -1,
          });
        }
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.addInitScript(() => {
          performance.setResourceTimingBufferSize(2000);
          // The first animation callback after reveal bounds the next paint opportunity.
          new MutationObserver((_, observer) => {
            if (!performance.getEntriesByName('game:first-frame').length || document.body?.hasAttribute('data-starting')) return;
            observer.disconnect();
            requestAnimationFrame(() => performance.mark('startup:next-frame'));
          }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-starting'] });
        });
        if (trace && values.cpu) { await trace.send('Profiler.enable'); await trace.send('Profiler.start'); }
        await page.goto(new URL(path, server.resolvedUrls!.local[0]).href, { waitUntil: 'commit' });
        await page.waitForFunction(() => performance.getEntriesByName('startup:next-frame').length || document.querySelector('#note[data-error]'), undefined, { timeout: 90000 });
        if (trace && values.cpu) {
          const { profile } = await trace.send('Profiler.stop');
          await writeFile(join(out!, `case-${pathIndex + 1}-run-${i + 1}.cpuprofile`), JSON.stringify(profile));
        }
        const result = await page.evaluate(() => {
          const error = document.querySelector<HTMLElement>('#note[data-error]')?.dataset.error;
          if (error) throw new Error(error);
          const end = performance.getEntriesByName('game:first-frame')[0].startTime;
          const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
            .filter(r => r.startTime < end).map(r => ({
              path: new URL(r.name).pathname, startMs: Math.round(r.startTime), endMs: Math.round(r.responseEnd),
              bytes: r.transferSize, finishedByReveal: r.responseEnd <= end,
            }));
          return {
            frame: { ms: Math.round(end), ...JSON.parse(document.querySelector('canvas')!.dataset.firstFrame!) } as FirstFrame,
            nextFrameMs: Math.round(performance.getEntriesByName('startup:next-frame')[0].startTime),
            stages: performance.getEntriesByType('mark').filter(m => m.name.startsWith('game:')).map(m => ({ name: m.name, ms: Math.round(m.startTime) })),
            resources,
          };
        });
        if (errors.length) throw new Error(errors.join('\n'));
        verifyFirstFrame(new URL(path, 'http://localhost').searchParams, result.frame);
        frames.push(result.frame.ms);
        nextPaints.push(result.nextFrameMs);
        const completed = result.resources.filter(r => r.finishedByReveal);
        console.log(`${path}  ${i + 1}/${runs}  ${result.frame.ms} ms reveal  ${result.nextFrameMs} ms next frame  ${(completed.reduce((sum, r) => sum + r.bytes, 0) / 1e6).toFixed(1)} MB / ${completed.length} completed requests`);
        if (out) await writeFile(join(out, `case-${pathIndex + 1}-run-${i + 1}.json`), JSON.stringify({ path, network: { mbps, latency }, ...result }, null, 2));
      } finally {
        await browser.close();
      }
    }
    console.log(`Median  ${path}  ${median(frames)} ms reveal  ${median(nextPaints)} ms next frame`);
  }
} finally {
  await server.close();
}
