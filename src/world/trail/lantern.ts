import { Builder, hex, P, type Mat } from '../../render/geo.ts';

/** The guard's hurricane lantern: a tin frame, a glass chimney glowing round a turned-down wick. */
export function lantern() {
  const b = new Builder(true);
  const TIN: Mat = { color: hex(0x3a3a34), roughness: 0.5, metallic: 0.6, pattern: P.TIN };
  const GLOW: Mat = { color: [0, 0, 0], roughness: 1, emission: [7, 3.6, 1.3], pattern: P.BULB };
  b.tube(TIN, [0, -0.1, 0], 0.07, 0.07, 0.03, 10, { lean: () => [0, 0], cap: true });
  b.blob(GLOW, [0, 0.0, 0], [0.05, 0.075, 0.05], 8, 6);
  b.tube(TIN, [0, 0.08, 0], 0.05, 0.03, 0.05, 10, { lean: () => [0, 0], cap: true });

  for (const a of [0.8, 2.4, 4.0, 5.6]) b.sweep(TIN, [[Math.sin(a) * 0.065, -0.08, Math.cos(a) * 0.065], [Math.sin(a) * 0.055, 0.09, Math.cos(a) * 0.055]], [0.006, 0.006], 3);
  b.sweep(TIN, [[-0.06, 0.12, 0], [0, 0.2, 0], [0.06, 0.12, 0]], [0.005, 0.005, 0.005], 3);

  return b.model();
}
