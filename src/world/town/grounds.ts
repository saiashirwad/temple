// The temple yard: the walk round the shrine and round the cloister laid in loose granite slabs
// with grass in the gaps, stone lamps (kalvilakku) along the outer walk, hanging brass lamps on
// the cloister front, the small offering stones round the shrine, a laterite well, a tulsi stand,
// an uruli of floating flowers, and outside the wall a serpent grove with its naga stones.

import { Builder, hex, P, rng, type V3 } from '../../render/geo.ts';
import type { Lamp } from './temple.ts';
import { CLOISTER, COMPOUND, GROUND, M, SHRINE } from '../../content/world.ts';

const OIL: V3 = [1, 0.52, 0.18];
const G = GROUND;
const FLOWERS = [
  { color: hex(0xe8a020), roughness: 0.7, pattern: P.FLOWER },
  { color: hex(0xd8401a), roughness: 0.7, pattern: P.FLOWER },
  { color: hex(0xf0ece0), roughness: 0.7, pattern: P.FLOWER },
];
const WATER = { color: hex(0x050806), roughness: 0.05, pattern: P.PLAIN };
const ROPE = { color: hex(0x6a5a3a), roughness: 0.9, pattern: P.PLAIN };
const TURMERIC = { color: hex(0xd8a020), roughness: 0.8, pattern: P.PLAIN };
const VERMILION = { color: hex(0xb01810), roughness: 0.8, pattern: P.PLAIN };

/** The outer walk, inside the compound wall. */
export const OUTER = { x: 11, z0: -12.8, z1: 12.8 };
/** The inner walk, round the shrine inside the cloister. */
export const INNER = { x: 3.5, z0: -5.3, z1: 2.8 };
export const TULSI: V3 = [-3.0, G, 14.6];
export const SERPENT_GROVE: V3 = [-24, G, -10];

export function buildGrounds() {
  const b = new Builder(true);
  const lamps: Lamp[] = [];
  const r = rng(77);
  /** Where grass can grow up through the gaps, for the planting. */
  const gaps: V3[] = [];

  /** A brass cup and its flame; the seed ties the flame to the light it throws. */
  let seed = 0;
  const cup = (p: V3, size = 1) => {
    const s = size;
    b.lathe(M.brass, [p[0], p[1] - 0.035 * s, p[2]], [[0, 0], [0.012 * s, 0], [0.014 * s, 0.008 * s], [0.03 * s, 0.02 * s], [0.036 * s, 0.034 * s], [0.03 * s, 0.036 * s], [0, 0.03 * s]], 8);
    b.seeded(seed, () => b.flame(M.flame, [p[0], p[1] - 0.004 * s, p[2]], 0.05 * s));
  };
  const lit = (s: number) => {
    seed = s;
    return s;
  };

  // ---------------------------------------------------------------- slab walks
  const walk = (a: [number, number], c: [number, number], width: number) => {
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const dir = [(c[0] - a[0]) / L, (c[1] - a[1]) / L] as const;
    const yaw = Math.atan2(dir[0], dir[1]);
    let s = 0;
    while (s < L) {
      const l = 0.55 + r() * 0.5;
      const gap = 0.06 + r() * 0.18;
      const rows = width > 1.3 && r() < 0.6 ? 2 : 1;
      for (let k = 0; k < rows; k++) {
        if (r() < 0.07) continue; // a missing slab, earth showing
        const w = rows === 2 ? width / 2 - 0.05 : width;
        const off = rows === 2 ? (k - 0.5) * (width / 2) : 0;
        const m = s + l / 2;
        const cx = a[0] + dir[0] * m + dir[1] * off;
        const cz = a[1] + dir[1] * m - dir[0] * off;
        const top = 0.025 + r() * 0.045;
        b.with({ at: [cx, G, cz], yaw: yaw + (r() - 0.5) * 0.08 }, () => b.box(M.granite, [0, top - 0.06, 0], [(w / 2) * (0.92 + r() * 0.08), 0.06, l / 2], 'y-'));
      }
      const gx = a[0] + dir[0] * (s + l + gap / 2);
      const gz = a[1] + dir[1] * (s + l + gap / 2);
      if (r() < 0.45) gaps.push([gx + dir[1] * (r() - 0.5) * width, G, gz - dir[0] * (r() - 0.5) * width]);
      s += l + gap;
    }
  };
  const { x: ox, z0: oz0, z1: oz1 } = OUTER;
  walk([-ox, oz0], [ox, oz0], 1.5);
  walk([ox, oz0 + 0.9], [ox, oz1], 1.5);
  walk([ox - 0.9, oz1], [1.8, oz1], 1.5);
  walk([-1.8, oz1], [-ox + 0.9, oz1], 1.5);
  walk([-ox, oz1], [-ox, oz0 + 0.9], 1.5);
  walk([-0.0, oz1 + 0.6], [0, COMPOUND.z1 - 2.9], 1.4);
  const { x: ix, z0: iz0, z1: iz1 } = INNER;
  walk([-ix, iz0], [ix, iz0], 1.1);
  walk([ix, iz0 + 0.6], [ix, iz1], 1.1);
  walk([-ix, iz1], [-ix, iz0 + 0.6], 1.1);

  // ---------------------------------------------------------------- stone lamps along the outer walk
  const kal = (x: number, z: number, phase: number) => {
    lit((phase * 0.061) % 0.45);
    b.with({ at: [x, G, z], yaw: 0 }, () => {
      b.box(M.granite, [0, 0.12, 0], [0.32, 0.12, 0.32], 'y-');
      b.tube(M.granite, [0, 0.24, 0], 0.13, 0.11, 1.05, 8, { smooth: false });
      b.lathe(M.granite, [0, 1.29, 0], [[0.1, 0], [0.24, 0.06], [0.26, 0.12], [0.2, 0.14], [0, 0.14]], 10);
      cup([0, 1.46, 0], 1.6);
    });
    lamps.push({ position: [x, G + 1.65, z], color: OIL, intensity: 1.4, range: 6, seed });
  };
  for (const [i, z] of [-9, -1, 7].entries()) {
    kal(-ox - 1.3, z, i);
    kal(ox + 1.3, z, i + 3);
  }
  kal(-6, oz0 - 1.3, 7);
  kal(6, oz0 - 1.3, 8);

  // ---------------------------------------------------------------- hanging lamps on the cloister front
  for (const x of [-5.8, -3.6, 3.6, 5.8]) {
    lit(((x + 6) * 0.037) % 0.45);
    const z = CLOISTER.z1 + 0.9;
    const y = G + CLOISTER.height - 0.05;
    b.tube(M.brass, [x, y - 0.85, z], 0.005, 0.005, 0.85, 3);
    b.lathe(M.brass, [x, y - 1.0, z], [[0, 0], [0.1, 0.04], [0.14, 0.09], [0.12, 0.11], [0.03, 0.12], [0.02, 0.18], [0, 0.18]], 12);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      cup([x + Math.sin(a) * 0.12, y - 0.88, z + Math.cos(a) * 0.12], 1.1);
    }
    lamps.push({ position: [x, G + CLOISTER.height - 0.7, z], color: OIL, intensity: 1.2, range: 5, seed });
  }

  // ---------------------------------------------------------------- small offering stones round the shrine
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = SHRINE[0] + Math.sin(a) * 4.2;
    const z = SHRINE[2] + Math.cos(a) * 3.5;
    if (z > 1.6) continue;
    b.with({ at: [x, G, z], yaw: a }, () => {
      b.box(M.granite, [0, 0.06, 0], [0.22, 0.06, 0.22], 'y-');
      b.lathe(M.granite, [0, 0.12, 0], [[0.16, 0], [0.12, 0.06], [0.15, 0.12], [0.06, 0.2], [0, 0.22]], 10);
      // Rice and flowers left on it
      for (let k = 0; k < 3; k++) b.blob(FLOWERS[k % 3]!, [(r() - 0.5) * 0.12, 0.32, (r() - 0.5) * 0.12], [0.025, 0.015, 0.025], 5, 3);
    });
  }

  // ---------------------------------------------------------------- the well, in the north-east corner
  {
    const at: V3 = [12.9, G, -14.9];
    b.with({ at, yaw: 0 }, () => {
      b.tube(M.laterite, [0, -0.6, 0], 0.95, 0.95, 1.45, 18, { smooth: false });
      b.tube(M.dark, [0, -0.6, 0], 0.72, 0.72, 1.46, 18, { smooth: false });
      b.disc(WATER, [0, -0.3, 0], 0.72, 18, 1);
      b.tube(M.granite, [0, 0.85, 0], 0.98, 0.98, 0.06, 18, { cap: false });
      // The pulley frame and its rope and bucket
      for (const s of [-1, 1]) b.box(M.wood, [s * 0.85, 1.6, 0], [0.06, 0.75, 0.06]);
      b.box(M.wood, [0, 2.33, 0], [0.95, 0.05, 0.05]);
      b.tube(M.wood, [0, 2.18, 0], 0.09, 0.09, 0.08, 10, { cap: true, bottom: true });
      b.tube(ROPE, [0.09, 1.3, 0], 0.008, 0.008, 0.9, 3);
      b.tube(M.brass, [0.09, 1.1, 0], 0.08, 0.11, 0.2, 10, { bottom: true });
      b.prop('bucket', [1.35, 0, 0.4], 0.5);
      b.prop('claypot', [-1.3, 0, 0.7], 2.2, 0.7);
    });
  }

  // ---------------------------------------------------------------- the tulsi stand (tulsi thara)
  b.with({ at: TULSI, yaw: 0 }, () => {
    b.box(M.laterite, [0, 0.2, 0], [0.55, 0.2, 0.55], 'y-');
    b.box(M.plaster, [0, 0.6, 0], [0.38, 0.2, 0.38], 'y-');
    b.frustum(M.plaster, [0, 0, 0], [0.42, 0.42], [0.48, 0.48], 0.8, 0.92, '');
    b.box(M.dark, [0, 0.925, 0], [0.4, 0.004, 0.4]);
    // A little niche lamp on its front
    lit(0.21);
    cup([0, 0.48, 0.42], 1.3);
  });
  lamps.push({ position: [TULSI[0], G + 0.6, TULSI[2] + 0.5], color: OIL, intensity: 0.6, range: 3, seed: 0.21 });

  // ---------------------------------------------------------------- the uruli: a wide brass bowl with flowers floating
  b.with({ at: [3.5, G, 7.2], yaw: 0 }, () => {
    b.lathe(M.brass, [0, 0, 0], [[0, 0], [0.2, 0.0], [0.5, 0.08], [0.62, 0.2], [0.64, 0.24], [0.6, 0.25], [0, 0.18]], 22);
    b.disc(WATER, [0, 0.2, 0], 0.58, 18, 1);
    for (let k = 0; k < 30; k++) {
      const a = r() * 6.3;
      const o = Math.sqrt(r()) * 0.5;
      b.blob(FLOWERS[k % 3]!, [Math.sin(a) * o, 0.21, Math.cos(a) * o], [0.04, 0.015, 0.04], 6, 3, 0.3);
    }
    lit(0.27);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 6.3 + 0.4;
      cup([Math.sin(a) * 0.25, 0.25, Math.cos(a) * 0.25], 1.1);
    }
  });
  lamps.push({ position: [3.5, G + 0.5, 7.2], color: OIL, intensity: 0.5, range: 2.5, seed: 0.27 });
  // Brass vessels set down beside it: a lidded pot, a flat pan, a little vase of water
  b.prop('brasspot', [4.45, G, 7.7], 0.4, 0.8);
  b.prop('brasspot2', [4.5, G, 6.7], 1.1);
  b.prop('brassvase', [2.55, G, 7.6], 0, 1.2);
  b.prop('diya', [2.7, G, 6.8], 0.3, 0.9);

  // ---------------------------------------------------------------- the serpent grove (sarpa kavu)
  b.with({ at: SERPENT_GROVE, yaw: 0.5 }, () => {
    b.box(M.lateriteDark, [0, 0.15, 0], [1.6, 0.25, 1.0], 'y-');
    // Naga stones: hooded serpents carved in granite slabs, smeared with turmeric
    for (let i = 0; i < 5; i++) {
      const x = -1.2 + i * 0.6;
      const h = 0.45 + (i % 2) * 0.2;
      b.box(M.granite, [x, 0.4 + h / 2, -0.4], [0.2, h / 2, 0.06], 'y-');
      b.lathe(M.granite, [x, 0.4 + h, -0.4], [[0.2, 0], [0.22, 0.08], [0.12, 0.2], [0, 0.24]], 8);
      b.box(i % 2 ? TURMERIC : VERMILION, [x, 0.5 + h * 0.6, -0.33], [0.06, 0.08, 0.01]);
    }
    lit(0.33);
    cup([0, 0.48, 0.3], 1.6);
    cup([-0.8, 0.48, 0.35], 1.2);
  });
  lamps.push({ position: [SERPENT_GROVE[0], G + 0.8, SERPENT_GROVE[2] + 0.4], color: OIL, intensity: 1.0, range: 5, seed: 0.33 });
  // Ferns crowding the grove's stones
  b.with({ at: SERPENT_GROVE, yaw: 0.5 }, () => {
    for (const [x, z, yaw, s] of [[-2.4, -0.6, 0.3, 1], [2.3, -0.9, 2.1, 0.9], [-1.6, -1.8, 4, 1.1], [1.2, -2.0, 1, 1], [2.6, 0.9, 5, 0.8], [-2.7, 1.1, 3, 0.9]] as const) b.prop('fern', [x, 0, z], yaw, s);
  });

  return { model: b.model(), lamps, gaps, props: b.props, solids: b.solids };
}
