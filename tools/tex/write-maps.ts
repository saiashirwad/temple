import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = fileURLToPath(new URL('../../public/tex/', import.meta.url));

const resizedInput = (format: 'rgba' | 'rgb24', side: number) => [
  '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', format,
  '-s', `${side}x${side}`, '-i', 'pipe:0', '-vf', 'scale=512:512:flags=lanczos',
];

/** Alpha carries a material mask. Resize straight RGBA so it never weights the sRGB channels. */
export async function writeColourTiers(name: string, side: number, rgba: Uint8Array, quality: number) {
  await mkdir(directory, { recursive: true });

  const smaller = execFileSync('ffmpeg', [
    ...resizedInput('rgba', side), '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { input: rgba, maxBuffer: 512 * 512 * 4 + 65536 });

  const encode = (pixels: Uint8Array, size: number) =>
    sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
      .webp({ quality, alphaQuality: 100, effort: 4 })
      .toFile(join(directory, `${name}_${size}_c.webp`));

  await Promise.all([encode(rgba, side), encode(smaller, 512)]);
}

/** The renderer samples both colour tiers and one 512px RGB normal/roughness map. */
export async function writeMaterialMaps(name: string, side: number, albedo: Uint8Array, surface: Uint8Array) {
  await writeColourTiers(name, side, albedo, 86);
  execFileSync('ffmpeg', [
    ...resizedInput('rgb24', side), '-pix_fmt', 'yuvj444p', '-q:v', '4',
    join(directory, `${name}_512_d.jpg`),
  ], { input: surface });
}
