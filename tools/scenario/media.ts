import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Panel {
  label: string;
  path: string;
}

export async function writeSheet(path: string, panels: Panel[]) {
  if (!panels.length) throw new Error('A screenshot sheet needs at least one frame.');
  const columns = panels.length === 4 ? 2 : Math.min(3, panels.length);
  const width = 480, height = 300, caption = 36;
  const canvas = createCanvas(columns * width, Math.ceil(panels.length / columns) * (height + caption));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#161c19';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '16px sans-serif';

  for (const [i, panel] of panels.entries()) {
    const img = await loadImage(panel.path);
    const scale = Math.min(width / img.width, height / img.height);
    const x = (i % columns) * width, y = Math.floor(i / columns) * (height + caption);
    ctx.drawImage(img, x + (width - img.width * scale) / 2, y, img.width * scale, img.height * scale);
    ctx.fillStyle = '#edf1e8';
    ctx.fillText(panel.label, x + 10, y + height + 23, width - 20);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canvas.toBuffer('image/png'));
}

/** Start at the checkpoint and let gameplay continue while recording this page. */
export async function startClip(page: Page, path: string, seconds: number) {
  await page.screencast.start({ path, size: page.viewportSize()!, fps: 25 });

  const done = new Promise<void>((resolve, reject) => {
    setTimeout(() => page.screencast.stop().then(resolve, reject), seconds * 1000);
  });

  // The runner also awaits this promise during finalization.
  void done.catch(() => {});

  return { done };
}
