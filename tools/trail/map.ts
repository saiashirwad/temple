// Bakes the trail map (src/world/trail/trail.ts) to public/tex/trail.png, so loading needn't work it out.
// Run after tools/trail/make.ts:   npx tsx tools/trail/map.ts
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { TRAIL_MAP, trailMap } from '../../src/world/trail/trail.ts';
import { BROOK_HALF, brookDistance, CROSSING, crossingDistance } from '../../src/world/trail/jungle.ts';

const { nx, nz } = TRAIL_MAP;
const c = createCanvas(nx, nz);
const g = c.getContext('2d');
const img = g.createImageData(nx, nz);
const px = trailMap();

// Blue: the bare wet earth along the brooks and where the elephants trampled across
const { lo, res } = TRAIL_MAP;

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

  return t * t * (3 - 2 * t);
};

for (let j = 0; j < nz; j++) {
  const z = lo[1] + (j + 0.5) * res;

  for (let i = 0; i < nx; i++) {
    const x = lo[0] + (i + 0.5) * res;
    const k = (j * nx + i) * 4;
    const wet = 1 - ss(BROOK_HALF, BROOK_HALF + 1.8, brookDistance(x, z));
    const trodden = (1 - ss(CROSSING.half - 0.5, CROSSING.half + 0.7, crossingDistance(x, z))) * 0.8;
    px[k + 2] = Math.round(Math.max(wet, trodden) * 255);
    px[k + 3] = 255;
  }
}

img.data.set(px);

g.putImageData(img, 0, 0);

writeFileSync(new URL('../../public/tex/trail.png', import.meta.url).pathname, c.toBuffer('image/png'));

console.log('trail map', nx, 'x', nz);
