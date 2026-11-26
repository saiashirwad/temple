// The footpath's edges: a line of laterite kerb stones each side, set into the ground the way
// the Forest Department lays its paths, some tipped or sunk, a few missing, moss on the older
// ones. They keep the murram in and show the way even where the torch only just reaches.

import { Builder, hex, rng, P, type Mat } from '../../render/geo.ts';
import { M } from '../../content/world.ts';
import { heightAt, riverCut } from '../terrain.ts';
import { TRAIL_LENGTH, trailAt, trailNear, trailWidth } from './trail.ts';
import { onBridge } from './bridge.ts';
import { BUNGALOW } from './bungalow.ts';
import { BROOK_HALF, brookDistance } from './jungle.ts';

const MOSSY: Mat = { color: hex(0x5a5a3a), roughness: 0.9, pattern: P.LATERITE };

export function buildFootpath(b: Builder) {
  const r = rng(303);
  b.open(() => {
    for (let s = 4; s < TRAIL_LENGTH - 2; s += 0.62) {
      const p = trailAt(s);
      const half = trailWidth(s) / 2 + 0.1;

      for (const side of [-1, 1]) {
        if (r() < 0.06) continue;
        const x = p.x + Math.cos(p.heading) * half * side;
        const z = p.z - Math.sin(p.heading) * half * side;

        // Not on the bridge or down the ravine, and not on another stretch of the path where it doubles back
        if (onBridge(x, z, 2) || riverCut(x, z) > 0.2 || brookDistance(x, z) < BROOK_HALF + 0.5) continue;

        if (trailNear(x, z, 4).distance < half - 0.15) continue;

        if (Math.hypot(x - BUNGALOW.x, z - BUNGALOW.z) < 9) continue;
        const g = Math.min(heightAt(x, z), heightAt(x + Math.sin(p.heading) * 0.25, z + Math.cos(p.heading) * 0.25), heightAt(x - Math.sin(p.heading) * 0.25, z - Math.cos(p.heading) * 0.25));
        const sunk = r() * 0.05;
        const tilt = (r() - 0.5) * 0.25;
        b.with({ at: [x, g, z], yaw: p.heading + tilt }, () => {
          b.box(r() < 0.3 ? MOSSY : M.laterite, [0, 0.03 - sunk, 0], [0.09, 0.09, 0.27 + r() * 0.03], 'y-');
        });
      }
    }
  });
}
