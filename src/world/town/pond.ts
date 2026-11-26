import { Builder, hex, P, rng } from '../../render/geo.ts';
import { GHAT, POND_FLOOR, pondQ, pondR } from '../terrain.ts';
import { GROUND, M, POND } from '../../content/world.ts';

const LILY = { color: hex(0x1d3a14), roughness: 0.35, pattern: P.LILY, doubleSided: true };
const LOTUS = { color: hex(0xe8a0b4), roughness: 0.6, pattern: P.PLAIN, doubleSided: true };
const LOTUS_HEART = { color: hex(0xe8c040), roughness: 0.6, pattern: P.PLAIN };

/** The bathing ghat on the temple side, lily pads and a few lotus flowers on the water. */
export function buildPond() {
  const b = new Builder(true);
  const r = rng(21);
  const { x0, step, rise, count, half } = GHAT;
  for (let i = 0; i <= count; i++) {
    const top = GROUND - i * rise;
    const xa = x0 + i * step;
    const len = i === count ? 2.2 : step;
    b.box(M.pondStone, [xa + len / 2, (top + POND_FLOOR) / 2, POND.z], [len / 2, (top - POND_FLOOR) / 2, half], 'y-');
  }
  // Laterite parapets down both sides, stepping down with the flight
  for (const s of [-1, 1]) {
    for (let i = 0; i <= count; i++) {
      const top = GROUND - i * rise + 0.55;
      const xa = x0 - 1.2 + i * step;
      const len = i === 0 ? 1.2 + step : step;
      b.box(M.laterite, [xa + len / 2, (top + POND_FLOOR) / 2, POND.z + s * (half + 0.3)], [len / 2 + 0.01, (top - POND_FLOOR) / 2, 0.3], 'y-');
    }
  }
  // Lily pads in drifts near the banks, each a disc with a notch
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2;
    const at = 0.55 + r() * 0.3;
    const cx = POND.x + Math.cos(a) * pondR(a) * at;
    const cz = POND.z + Math.sin(a) * pondR(a) * at;
    if (Math.abs(cz - POND.z) < half + 1.5 && cx < POND.x - 5) continue;
    const n = 10 + Math.floor(r() * 16);
    for (let i = 0; i < n; i++) {
      const px = cx + (r() - 0.5) * 4.5;
      const pz = cz + (r() - 0.5) * 4.5;
      if (pondQ(px, pz) > 0.86) continue;
      const rad = 0.16 + r() * 0.2;
      const turn = r() * Math.PI * 2;
      const y = 0.012 + r() * 0.006;
      b.surface(LILY, 10, 1, (u, v) => {
        const t = turn + 0.35 + u * (Math.PI * 2 - 0.7);
        const rr = rad * v;
        return [px + Math.cos(t) * rr, y + v * v * 0.01, pz + Math.sin(t) * rr];
      });
      if (r() < 0.07) {
        // A lotus: two rings of cupped petals round a golden heart
        const fx = px + 0.1;
        const fz = pz;
        const fy = 0.1;
        b.blob(LOTUS_HEART, [fx, fy + 0.04, fz], [0.035, 0.025, 0.035], 6, 3);
        for (let ring = 0; ring < 2; ring++) {
          const np = ring ? 6 : 8;
          for (let j = 0; j < np; j++) {
            const ta = (j / np) * Math.PI * 2 + ring * 0.4;
            const lean = ring ? 0.35 : 0.8;
            const len = ring ? 0.11 : 0.13;
            b.surface(LOTUS, 3, 3, (u, v) => {
              const w = Math.sin(Math.PI * v) * 0.045 * (1 - u * 0.4);
              const along = u * len;
              const out = Math.sin(lean) * along;
              const up = Math.cos(lean) * along + u * u * 0.02;
              const side = (v - 0.5) * 2 * w;
              const cup = -Math.abs((v - 0.5) * 2) * 0.012;
              return [fx + Math.cos(ta) * (out - cup) - Math.sin(ta) * side, fy + up, fz + Math.sin(ta) * (out - cup) + Math.cos(ta) * side];
            });
          }
        }
        b.tube(LILY, [fx, 0, fz], 0.012, 0.012, fy, 5);
      }
    }
  }
  return b.model();
}
