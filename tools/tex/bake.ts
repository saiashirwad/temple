// Bakes every layer into a colour image (sRGB, alpha the mask) and a data image (normal x, y and
// roughness), at 1024 and 512, and writes the names, sizes and mean colours for the shaders.
//   npx tsx tools/tex/bake.ts [names...]

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { LAYERS, type Px } from './layers.ts';

const S = 1024;
const OUT = new URL('../../public/tex/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const toSrgb = (x: number) => {
  const c = Math.min(Math.max(x, 0), 1);
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};

function blur(src: Float32Array, r: number) {
  const tmp = new Float32Array(S * S);
  const out = new Float32Array(S * S);
  const k = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    const a = pass === 0 ? src : out;
    for (let y = 0; y < S; y++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[y * S + ((i + S) % S)]!;
      for (let x = 0; x < S; x++) {
        tmp[y * S + x] = sum / k;
        sum += a[y * S + ((x + r + 1) % S)]! - a[y * S + ((x - r + S) % S)]!;
      }
    }
    for (let x = 0; x < S; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += tmp[((i + S) % S) * S + x]!;
      for (let y = 0; y < S; y++) {
        out[y * S + x] = sum / k;
        sum += tmp[((y + r + 1) % S) * S + x]! - tmp[((y - r + S) % S) * S + x]!;
      }
    }
  }
  return out;
}

const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

const meta: { name: string; metres: number; metal: boolean; mean: number[] }[] = [];
for (const layer of LAYERS) {
  const t0 = Date.now();
  const col = new Float32Array(S * S * 3);
  const h = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const mask = new Float32Array(S * S);
  const skip = only.length > 0 && !only.includes(layer.name);
  if (!skip) {
    const o: Px = { c: [0, 0, 0], h: 0, rough: 0, mask: 0 };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        layer.fn((x + 0.5) / S, (y + 0.5) / S, o);
        const i = y * S + x;
        col[i * 3] = o.c[0];
        col[i * 3 + 1] = o.c[1];
        col[i * 3 + 2] = o.c[2];
        h[i] = o.h;
        rough[i] = o.rough;
        mask[i] = o.mask;
      }
    }
  }
  const texel = layer.metres / S;
  const r = Math.max(1, Math.round(layer.reach / texel / 2));
  const soft = blur(h, r);
  const albedo = new Uint8Array(S * S * 4);
  const data = new Uint8Array(S * S * 3);
  const mean = [0, 0, 0];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const ao = Math.min(1, Math.max(0, 1 - Math.max(0, soft[i]! - h[i]!) / (layer.reach * 0.6)));
      const k = 1 - layer.cavity * (1 - ao);
      for (let c = 0; c < 3; c++) {
        const lin = col[i * 3 + c]! * k;
        mean[c] += lin;
        albedo[i * 4 + c] = toSrgb(lin);
      }
      albedo[i * 4 + 3] = 1 + Math.round(Math.min(1, Math.max(0, mask[i]!)) * 254);
      const dx = (h[y * S + ((x + 1) % S)]! - h[y * S + ((x - 1 + S) % S)]!) / (2 * texel);
      const dy = (h[((y + 1) % S) * S + x]! - h[((y - 1 + S) % S) * S + x]!) / (2 * texel);
      const l = Math.hypot(dx, dy, 1);
      data[i * 3] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[i * 3 + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[i * 3 + 2] = Math.round(Math.min(1, Math.max(0, rough[i]!)) * 255);
    }
  }
  meta.push({ name: layer.name, metres: layer.metres, metal: layer.metal, mean: mean.map((m) => +(m / (S * S)).toFixed(4)) });
  if (skip) continue;
  const rawA = `/tmp/${layer.name}_a.raw`;
  const rawD = `/tmp/${layer.name}_d.raw`;
  writeFileSync(rawA, albedo);
  writeFileSync(rawD, data);
  for (const size of [1024, 512]) {
    const scale = size === S ? [] : ['-vf', `scale=${size}:${size}:flags=lanczos`];
    ff(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${S}x${S}`, '-i', rawA, ...scale, '-c:v', 'libwebp', '-quality', '86', '-pix_fmt', 'yuva420p', `${OUT}${layer.name}_${size}_c.webp`]);
    if (size === 512) ff(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${S}x${S}`, '-i', rawD, ...scale, '-pix_fmt', 'yuvj444p', '-q:v', '4', `${OUT}${layer.name}_${size}_d.jpg`]); // only the 512 data map is ever loaded (src/tex.ts)
  }
  rmSync(rawA);
  rmSync(rawD);
  console.log(`${layer.name} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (only.length > 0) {
  // Update just the layers baked now in the index, keeping the rest (and the photo layers)
  const gen = new URL('../../src/textures.gen.ts', import.meta.url).pathname;
  const old = readFileSync(gen, 'utf8');
  const m = old.match(/export const TEX_LAYERS = (.*) as const;/)!;
  const list = JSON.parse(m[1]!) as typeof meta;
  for (const l of meta) {
    const at = list.findIndex((x) => x.name === l.name);
    if (at >= 0 && only.includes(l.name)) list[at] = l;
  }
  writeFileSync(gen, old.replace(m[0], `export const TEX_LAYERS = ${JSON.stringify(list)} as const;`));
} else {
  const src = `// Baked by tools/tex/bake.ts: the texture array's layers, their tile sizes and mean colours.
export const TEX = ${JSON.stringify(Object.fromEntries(meta.map((m, i) => [m.name, i])))} as const;
export const TEX_LAYERS = ${JSON.stringify(meta, null, 0)} as const;
`;
  writeFileSync(new URL('../../src/textures.gen.ts', import.meta.url).pathname, src);
}
