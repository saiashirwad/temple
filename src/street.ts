// The road outside the gate, as a Kerala village road is at night: concrete poles with curved
// arms, sodium lamps humming orange (one dying and coming back), tube-light poles further out,
// sagging wires and a transformer; the temple's arch over the path, outlined in serial lights;
// black-and-white kerbs; and across the road a row of shops. The tea shop is still open under
// its tube light, with jars of snacks, bananas hanging, the kettle on the boil and the TV on;
// the provision store has its shutter half up; the others are shut, a signboard or a medical
// cross still lit. A bus shelter with a flickering tube, a parked auto, a scooter, a bicycle.

import { Builder, hex, P, rng, type Mat, type V3 } from './geo.ts';
import type { Lamp, LampKind } from './flicker.ts';
import { GROUND, M, ROAD } from './world.ts';
import { heightAt, roadZ } from './terrain.ts';

const SODIUM: V3 = [1, 0.46, 0.1];
const TUBE: V3 = [0.78, 0.96, 1];
const WARM: V3 = [1, 0.72, 0.42];

const lit = (pattern: number, emission: V3): Mat => ({ color: [0, 0, 0], roughness: 1, emission, pattern });
const paint = (h: number, rough = 0.75): Mat => ({ color: hex(h), roughness: rough, pattern: P.PAINT });
const plain = (h: number, rough = 0.6, metallic = 0): Mat => ({ color: hex(h), roughness: rough, metallic, pattern: P.PLAIN });
const S = {
  tube: lit(P.TUBE, [5.5, 7, 7.5]),
  tubeBad: lit(P.TUBE_BAD, [5.5, 7, 7.5]),
  cfl: lit(P.CFL, [7, 6.6, 5.8]),
  bulb: lit(P.BULB, [12, 7, 2.6]),
  serial: lit(P.SERIAL, [1, 1, 1]),
  tv: lit(P.TV, [2.2, 2.6, 3.2]),
  sign: lit(P.SIGN, [4.5, 4.2, 3.4]),
  signRed: lit(P.SIGN, [5, 1.2, 0.6]),
  cross: lit(P.BULB, [0.3, 6, 1.2]),
  glass: { color: [0.02, 0.02, 0.02] as V3, roughness: 0.05, pattern: P.GLASS },
  pole: { color: hex(0x8c8a84), roughness: 0.9, pattern: P.CONCRETE },
  rubber: plain(0x111111, 0.8),
  chrome: plain(0xc8c8c8, 0.2, 1),
  yellow: paint(0xe8b818, 0.5),
  black: plain(0x161616, 0.55),
  red: plain(0xb0201a, 0.45),
  blue: plain(0x1e4e9a, 0.45),
  green: plain(0x2a7a3a, 0.5),
  banana: plain(0xd8b830, 0.6),
  bananaGreen: plain(0x8aa030, 0.6),
  aluminium: { color: hex(0xb8b8b4), roughness: 0.35, metallic: 1, pattern: P.STEEL } as Mat,
  sack: plain(0xc8b898, 0.95),
  rice: plain(0xe8e2d4, 0.9),
};
const GOODS = [0xd83020, 0x2050c0, 0xe8c020, 0x30a040, 0xf0f0e8, 0xe07020, 0x8030a0, 0x20a0b0].map((h) => plain(h, 0.5));
const WALLS = [paint(0x3f8a9a), paint(0x7aa85a), paint(0xd8a040), paint(0xc87890), paint(0xe8e0cf), paint(0x4a6ab0)];
const POSTERS = [0xd82818, 0x1838a8, 0xf0c010, 0x18a058, 0xe85898].map((h) => paint(h, 0.6));
/** Which poster from the atlas: Che and the party, films, a coaching ad, the lottery. */
const POLITICAL = [0, 1, 2, 3, 10];
const FILMS = [4, 5, 6, 7, 8];
const ADS = [9, 11];
const hashed = (x: number, z: number, k = 0) => Math.abs(Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453) % 1;
const posterAt = (x: number, z: number, k = 0) => {
  const h = hashed(x, z, k);
  const list = h < 0.38 ? POLITICAL : h < 0.85 ? FILMS : ADS;
  return list[Math.floor(hashed(x, z, k + 1) * list.length)]!;
};

export function buildStreet() {
  const b = new Builder(true);
  const lamps: Lamp[] = [];
  const r = rng(29);
  const G = GROUND;
  const light = (position: V3, color: V3, intensity: number, range: number, kind: LampKind, seed: number, extra: Partial<Lamp> = {}) =>
    lamps.push({ position, color, intensity, range, kind, seed, ...extra });
  /** The frame of a place beside the road: x along it, -z toward it, y from the ground. */
  const beside = (x: number, off: number, fn: (y: number) => void) => {
    const z = roadZ(x) + off;
    const y = heightAt(x, z);
    const toward = Math.atan2(roadZ(x + 1) - roadZ(x - 1), 2);
    b.with({ at: [x, y, z], yaw: -toward }, () => fn(y));
    return { z, y, yaw: -toward };
  };
  const world = (x: number, off: number, local: V3): V3 => {
    const z = roadZ(x) + off;
    const y = heightAt(x, z);
    const yaw = -Math.atan2(roadZ(x + 1) - roadZ(x - 1), 2);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [x + local[0] * c + local[2] * s, y + local[1], z - local[0] * s + local[2] * c];
  };

  // ================================================================ poles, lamps and wires
  type Pole = { px: number; kind: 'sodium' | 'sodiumBad' | 'tube' | 'tubeBad' };
  const poles: Pole[] = [
    { px: -110, kind: 'tube' }, { px: -78, kind: 'tube' }, { px: -55, kind: 'tubeBad' }, { px: -30, kind: 'sodium' },
    { px: -9, kind: 'sodium' }, { px: 12, kind: 'sodium' }, { px: 33, kind: 'sodiumBad' }, { px: 55, kind: 'sodium' },
    { px: 78, kind: 'tube' }, { px: 98, kind: 'tube' },
  ];
  const tops: V3[][] = [];
  poles.forEach(({ px, kind }, i) => {
    const off = ROAD.half + 0.8;
    const seed = (i * 0.137) % 0.45;
    beside(px, off, () => {
      // A tapered concrete pole, the KSEB kind, with its holes and climbing steps
      b.frustum(S.pole, [0, 0, 0], [0.14, 0.1], [0.07, 0.06], -0.3, 8.4, 'top');
      for (let y = 1.2; y < 7.5; y += 0.6) b.box(M.dark, [0, y, 0.101 - (y / 8.4) * 0.04], [0.03, 0.08, 0.01]);
      // Cross-arm with insulators for the wires
      b.box(M.steel, [0, 8.1, 0], [0.7, 0.03, 0.04]);
      for (const ix of [-0.6, -0.2, 0.2, 0.6]) b.lathe(plain(0xd8d4c8, 0.3), [ix, 8.13, 0], [[0, 0], [0.035, 0], [0.04, 0.04], [0.02, 0.06], [0.03, 0.09], [0, 0.11]], 8);
      // The curved GI arm and the lamp
      b.sweep(M.steel, [[0, 6.9, -0.08], [0, 7.25, -0.6], [0, 7.45, -1.3], [0, 7.5, -2.1]], [0.035, 0.035, 0.032, 0.03], 6);
      if (kind === 'tube' || kind === 'tubeBad') {
        b.box(M.steel, [0, 7.48, -2.1], [0.08, 0.03, 0.62]);
        b.with({ at: [0, 0, 0], yaw: 0 }, () => b.seeded(seed, () => b.box(kind === 'tube' ? S.tube : S.tubeBad, [0, 7.42, -2.1], [0.018, 0.018, 0.58])));
      } else {
        b.lathe(M.steel, [0, 7.42, -2.25], [[0.0, 0.14], [0.2, 0.1], [0.22, 0.04], [0.2, 0.0]], 12);
        b.seeded(seed, () => b.lathe(kind === 'sodium' ? M.sodium : M.sodiumBad, [0, 7.42, -2.25], [[0.18, 0.0], [0.12, -0.07], [0, -0.09]], 12));
      }
      // Notices and a cable-TV junction box strapped on
      if (r() < 0.6) {
        r();
        b.poster([0, 2.2 + r(), -0.13], [0, 0, -1], 0.34, 0.45, posterAt(px, 1), (hashed(px, 2) - 0.5) * 0.12);
      }
      if (r() < 0.5) b.box(plain(0x2a2a2a), [0.12, 5.2, 0], [0.06, 0.12, 0.06]);
    });
    const head = world(px, off, [0, 7.36, kind.startsWith('tube') ? -2.1 : -2.25]);
    const tube = kind.startsWith('tube');
    light(head, tube ? TUBE : SODIUM, tube ? 5.5 : 11, tube ? 12 : 15, kind, seed, { spot: [0.8, 1.3], shadow: px === -9 || px === 12 });
    tops.push([-0.6, -0.2, 0.2].map((ix) => world(px, off, [ix, 8.24, 0])));
  });
  // The wires sag between poles; the cable-TV line hangs lower and slacker
  for (let i = 0; i + 1 < poles.length; i++) {
    for (let k = 0; k < 3; k++) {
      const a = tops[i]![k]!;
      const c = tops[i + 1]![k]!;
      const segs = 14;
      const sag = k === 2 ? 1.1 : 0.55;
      const pts: V3[] = [];
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        pts.push([a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u - (k === 2 ? 1.2 : 0) - 4 * u * (1 - u) * sag, a[2] + (c[2] - a[2]) * u]);
      }
      b.sweep(M.dark, pts, pts.map(() => (k === 2 ? 0.016 : 0.01)), 3);
    }
  }
  // A transformer on a double pole by the road, west of the shops
  beside(-21, ROAD.half + 2.2, () => {
    b.prop('pole1', [0, 0, 0], 0, 1.3);
    b.box(plain(0xc8b030, 0.6), [0, 1.6, -0.2], [0.22, 0.16, 0.01]);
    b.prop('utility', [1.2, 0, 0.1], -0.3);
  });
  beside(-40, ROAD.half + 2.4, () => b.prop('pole2', [0, 0, 0], 0.2, 1.3));
  beside(44, ROAD.half + 2.4, () => b.prop('pole3', [0, 0, 0], -0.1, 1.3));

  // ================================================================ the temple arch over the path
  {
    const z = roadZ(0) - ROAD.half - 1.2;
    const y = heightAt(0, z);
    b.with({ at: [0, y, z], yaw: 0 }, () => {
      for (const s of [-1, 1]) {
        b.box(M.plaster, [s * 3.3, 2.6, 0], [0.32, 2.6, 0.32], 'y-');
        b.box(M.laterite, [s * 3.3, 0.3, 0], [0.4, 0.4, 0.4], 'y-');
        b.box(M.ochre, [s * 3.3, 5.25, 0], [0.4, 0.12, 0.4]);
        b.lathe(M.gold, [s * 3.3, 5.37, 0], [[0, 0], [0.14, 0.04], [0.1, 0.16], [0.05, 0.22], [0.08, 0.32], [0, 0.55]], 10);
      }
      b.box(M.plaster, [0, 4.75, 0], [3.0, 0.42, 0.26]);
      b.box(M.ochre, [0, 4.3, 0], [3.0, 0.04, 0.3]);
      b.roof(M.tile, [0, 0, 0], [3.8, 0.75], [3.1, 0.05], 5.18, 5.8, { sag: 0.12, rows: 3 });
      b.seeded(0.19, () => b.box(S.sign, [0, 4.75, 0.27], [2.6, 0.32, 0.01]));
      b.seeded(0.19, () => b.box(S.sign, [0, 4.75, -0.27], [2.6, 0.32, 0.01]));
      // Serial lights all round the arch, both faces
      for (const fz of [0.36, -0.36]) {
        for (let i = 0; i <= 44; i++) b.blob(S.serial, [-3.0 + (i / 44) * 6.0, 5.2, fz], [0.025, 0.025, 0.025], 4, 2);
        for (const s of [-1, 1]) for (let i = 0; i <= 26; i++) b.blob(S.serial, [s * 2.95, 0.6 + (i / 26) * 3.65, fz], [0.025, 0.025, 0.025], 4, 2);
      }
    });
    light([0, y + 4.2, z + 0.9], WARM, 1.6, 7, 'bulb', 0.19);
  }

  // ================================================================ kerbs painted black and white
  for (const side of [-1, 1]) {
    for (let x = -46; x < 46; x += 0.6) {
      if (side < 0 && Math.abs(x) < 2.3) continue;
      // ...and where the forest path leaves the road
      if (side < 0 && Math.abs(x - 20) < 1.4) continue;
      if (side > 0 && x > -17.5 && x < -13.5) continue;
      const k = Math.round((x + 46) / 0.6);
      beside(x, side * (ROAD.half + 0.12), () => b.box(k % 2 ? M.white : M.black, [0, 0.07, 0], [0.27, 0.11, 0.09], 'y-'));
    }
  }
  // A milestone by the road
  beside(-27, -(ROAD.half + 0.9), () => {
    b.box(M.white, [0, 0.35, 0], [0.18, 0.35, 0.08], 'y-');
    b.lathe(paint(0xe8b818), [0, 0.7, 0], [[0.18, 0], [0.16, 0.08], [0.1, 0.15], [0, 0.18]], 10);
  });

  // ================================================================ the shops across the road
  const FRONT = ROAD.half + 1.7;
  /** A shop's shell: plinth, side and back walls, ceiling and a Mangalore-tiled roof. */
  const shell = (w: number, wall: Mat) => {
    const D = 4;
    b.box(M.concrete, [0, -0.25, D / 2], [w / 2 + 0.05, 0.5, D / 2 + 0.4], 'y-');
    for (const s of [-1, 1]) b.box(wall, [s * (w / 2 - 0.1), 0.25 + 1.5, D / 2], [0.1, 1.5, D / 2], 'y-');
    b.box(wall, [0, 0.25 + 1.5, D - 0.1], [w / 2, 1.5, 0.1], 'y-');
    b.box(wall, [0, 3.0, 0.1], [w / 2, 0.25, 0.1]);
    b.box(plain(0x8a8478, 0.9), [0, 3.25, D / 2], [w / 2, 0.05, D / 2]);
    b.box(plain(0x3a3632, 0.9), [0, 0.26, D / 2], [w / 2 - 0.2, 0.01, D / 2 - 0.2]);
    b.roof(M.mtile, [0, 0, D / 2], [w / 2 + 0.35, D / 2 + 0.4], [w / 2 + 0.35, 0.05], 3.3, 4.6, { sag: 0.05, rows: 3, sides: [0, 2] });
    for (const s of [-1, 1]) b.tri(wall, [s * (w / 2 - 0.05), 3.3, -0.35], [s * (w / 2 - 0.05), 3.3, D + 0.35], [s * (w / 2 - 0.05), 4.58, D / 2], [s, 0, 0]);
    // The tin awning out over the step, on two thin posts
    b.plane(M.tin, [-w / 2 - 0.1, 2.75, -1.5], [w / 2 + 0.1, 2.75, -1.5], [w / 2 + 0.1, 3.05, 0], [-w / 2 - 0.1, 3.05, 0], [0, 1, -0.2]);
    b.plane(M.tin, [-w / 2 - 0.1, 2.73, -1.5], [w / 2 + 0.1, 2.73, -1.5], [w / 2 + 0.1, 3.03, 0], [-w / 2 - 0.1, 3.03, 0], [0, -1, 0.2]);
    for (const s of [-1, 1]) b.tube(M.steel, [s * (w / 2 - 0.05), 0.25, -1.4], 0.025, 0.025, 2.5, 6);
    b.box(M.steel, [0, 2.74, -1.45], [w / 2 + 0.05, 0.02, 0.02]);
    // Posters pasted on the side walls, peeling
    // (often two or three of the same, side by side, the way a film's are pasted up)
    for (let i = 0; i < 3; i++) {
      const s = r() < 0.5 ? -1 : 1;
      r();
      const y = 1.2 + r() * 1.2;
      const z = 0.6 + r() * 2.6;
      const k = posterAt(w * 7.1 + i, z);
      const copies = FILMS.includes(k) && hashed(w, z, 3) < 0.6 ? 2 : 1;
      for (let j = 0; j < copies; j++) {
        const zz = z + (j - (copies - 1) / 2) * 0.53;
        b.poster([s * (w / 2 + 0.012 + i * 0.002), y, zz], [s, 0, 0], 0.5, 0.66, k, (hashed(zz, y, 4) - 0.5) * 0.06);
      }
    }
  };
  /** A rolling shutter from the floor up to `h`, its slats horizontal. */
  const shutter = (w: number, h: number) => {
    b.plane(M.tin, [-w / 2 + 0.2, 0.26, 0.02], [-w / 2 + 0.2, 0.26 + h, 0.02], [w / 2 - 0.2, 0.26 + h, 0.02], [w / 2 - 0.2, 0.26, 0.02], [0, 0, -1]);
    b.tube(M.tin, [-w / 2 + 0.2, 2.95, -0.05], 0.12, 0.12, 0.01, 12);
    b.box(M.tin, [0, 2.92, -0.06], [w / 2 - 0.2, 0.13, 0.12]);
    b.box(M.steel, [0, 0.32, -0.02], [0.08, 0.04, 0.02]);
  };
  /** Shelves of boxed and bottled goods against the back wall. */
  const shelves = (w: number, z: number) => {
    for (let k = 0; k < 4; k++) {
      const y = 0.7 + k * 0.55;
      b.box(M.teak, [0, y, z], [w / 2 - 0.25, 0.02, 0.22]);
      for (let x = -w / 2 + 0.35; x < w / 2 - 0.35; x += 0.12 + r() * 0.1) {
        const hh = 0.08 + r() * 0.16;
        if (r() < 0.3) b.tube(GOODS[Math.floor(r() * GOODS.length)]!, [x, y + 0.02, z], 0.04, 0.04, hh * 1.2, 6, { cap: true });
        else b.box(GOODS[Math.floor(r() * GOODS.length)]!, [x, y + 0.02 + hh / 2, z + (r() - 0.5) * 0.1], [0.04 + r() * 0.03, hh / 2, 0.06]);
      }
    }
  };
  /** Strips of snack sachets hanging from the front beam. */
  const sachets = (x: number, z: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const mat = GOODS[Math.floor(r() * GOODS.length)]!;
      b.bar(M.dark, [x + i * 0.14, 2.7, z], [x + i * 0.14, 1.5, z], 0.004);
      for (let k = 0; k < 9; k++) b.box(mat, [x + i * 0.14, 2.6 - k * 0.13, z], [0.05, 0.055, 0.004]);
    }
  };

  // ---------------------------------------------------------------- the tea shop, open
  {
    const x = 3.4;
    const w = 4.6;
    const at = beside(x, FRONT, () => {
      shell(w, WALLS[2]!);
      shelves(w, 3.6);
      // Counter with glass jars of snacks and a steel tray of fritters
      b.box(M.teak, [0.4, 0.75, 0.55], [1.6, 0.5, 0.3], 'y-');
      b.box(plain(0xe0dcd0, 0.5), [0.4, 1.27, 0.55], [1.65, 0.02, 0.34]);
      for (let j = 0; j < 7; j++) {
        const jx = -1.0 + j * 0.36;
        b.tube(GOODS[(j * 3) % GOODS.length]!, [jx, 1.29, 0.42], 0.1, 0.1, 0.2, 10, { cap: false });
        b.tube(S.glass, [jx, 1.29, 0.42], 0.11, 0.11, 0.28, 10, { cap: false });
        b.tube(S.aluminium, [jx, 1.57, 0.42], 0.1, 0.1, 0.03, 10, { cap: true });
      }
      b.box(S.aluminium, [0.9, 1.31, 0.72], [0.35, 0.02, 0.15]);
      for (let k = 0; k < 14; k++) b.blob(plain(0xb06818, 0.7), [0.65 + (k % 7) * 0.08, 1.36, 0.65 + Math.floor(k / 7) * 0.12], [0.04, 0.025, 0.04], 5, 3, 0.4);
      // The big kettle on its stove, a blue gas flame under it
      b.box(M.steel, [-1.55, 1.0, 0.7], [0.3, 0.25, 0.25]);
      b.lathe(S.aluminium, [-1.55, 1.25, 0.7], [[0, 0], [0.2, 0.02], [0.24, 0.12], [0.24, 0.4], [0.18, 0.48], [0.06, 0.52], [0.06, 0.58], [0, 0.6]], 16);
      b.sweep(S.aluminium, [[-1.35, 1.45, 0.7], [-1.2, 1.58, 0.68], [-1.1, 1.66, 0.66]], [0.03, 0.025, 0.02], 5);
      b.seeded(0.43, () => {
        for (let i = 0; i < 6; i++) b.flame(M.flame, [-1.55 + Math.sin(i) * 0.08, 1.24, 0.7 + Math.cos(i) * 0.08], 0.03);
      });
      // Glass tumblers upside down on a tray
      for (let k = 0; k < 6; k++) b.tube(S.glass, [-0.4 + k * 0.09, 1.29, 0.68], 0.03, 0.035, 0.1, 8, { cap: true });
      // Bananas hanging from the front beam
      for (const bx of [-1.7, -1.25, 1.95]) {
        b.bar(M.teak, [bx, 2.95, -0.1], [bx, 2.2, -0.1], 0.02);
        for (let k = 0; k < 26; k++) {
          const a = k * 2.4;
          const y = 2.85 - (k / 26) * 0.6;
          const g = k % 5 === 0 ? S.bananaGreen : S.banana;
          b.blob(g, [bx + Math.sin(a) * 0.09, y, -0.1 + Math.cos(a) * 0.09], [0.025, 0.08, 0.025], 5, 3);
        }
      }
      sachets(-2.0, -0.05, 3);
      // A stray asleep on the swept ground by the corner of the shop, curled nose to tail the way
      // the tan pariah dogs of every Kerala junction sleep, ignored by everyone and ignoring them
      b.with({ at: [-2.6, 0, -0.95], yaw: Math.PI + 0.35 }, () => {
        const coat = plain(0xa87a48, 0.85);
        const pale = plain(0xd8bc94, 0.85);
        const dark = plain(0x3a2a1e, 0.6);
        // The body, bent round in a C: a chain of soft lumps along an arc
        const R = 0.2;
        // Haunch big and round at one end, narrowing through the ribs to the shoulders
        for (let i = 0; i <= 12; i++) {
          const k = i / 12;
          const a = -1.9 + k * 3.4;
          const fat = 0.085 + 0.05 * Math.exp(-((k - 0.2) ** 2) * 14) + 0.02 * Math.sin(k * Math.PI);
          b.blob(coat, [Math.cos(a) * R, fat * 0.8, Math.sin(a) * R], [fat * 1.05, fat * 0.8, fat * 1.05], 12, 6);
        }
        // Pale belly and folded legs tucked inside the curl
        b.blob(pale, [0.03, 0.05, 0.02], [0.1, 0.05, 0.13], 6, 3);
        for (const [lx, lz] of [[0.08, -0.08], [0.1, 0.06]] as const) b.blob(pale, [lx, 0.035, lz], [0.08, 0.035, 0.03], 5, 3);
        // A darker saddle along the spine, the way these dogs are coloured
        const saddle = plain(0x6e4a2a, 0.85);
        for (let i = 1; i <= 9; i++) {
          const a = -1.9 + (i / 12) * 3.4;
          b.blob(saddle, [Math.cos(a) * (R + 0.03), 0.15, Math.sin(a) * (R + 0.03)], [0.07, 0.035, 0.07], 8, 4);
        }
        // The head resting on the front paws, raised clear of the curl, eyes shut
        const hx = Math.cos(1.5) * R - 0.02;
        const hz = Math.sin(1.5) * R + 0.05;
        for (const s2 of [-1, 1]) b.blob(pale, [hx - 0.12, 0.03, hz + s2 * 0.04], [0.09, 0.03, 0.03], 6, 3);
        b.blob(coat, [hx, 0.12, hz], [0.095, 0.08, 0.09], 12, 6);
        b.blob(coat, [hx - 0.1, 0.1, hz], [0.07, 0.05, 0.05], 10, 5);
        b.blob(dark, [hx - 0.15, 0.09, hz], [0.035, 0.035, 0.038], 8, 4);
        b.blob(dark, [hx - 0.185, 0.1, hz], [0.014, 0.013, 0.016], 5, 3);
        // Ears pricked up, the way the pariah dogs carry them even half asleep
        for (const s2 of [-1, 1]) b.blob(saddle, [hx + 0.03, 0.22, hz + s2 * 0.055], [0.022, 0.05, 0.03], 6, 3);
        // The tail wrapped round over the nose, its tip paler
        const tail: V3[] = [];
        for (let i = 0; i <= 5; i++) {
          const a = -1.9 - (i / 5) * 1.2;
          tail.push([Math.cos(a) * (R + 0.08), 0.05 + Math.sin((i / 5) * Math.PI) * 0.03, Math.sin(a) * (R + 0.08)]);
        }
        b.sweep(coat, tail, [0.04, 0.035, 0.02], 6);
        b.blob(pale, tail[5]!, [0.025, 0.022, 0.025], 5, 3);
      });
      // A small TV on a high shelf, its light flickering over the room
      b.prop('tv', [1.6, 2.32, 3.45], Math.PI, 0.75);
      b.seeded(0.07, () => b.box(S.tv, [1.55, 2.5, 3.27], [0.15, 0.11, 0.004]));
      // A calendar and a framed picture with a little red bulb under it
      b.box(paint(0xf0ece0), [-1.4, 2.2, 3.79], [0.22, 0.3, 0.005]);
      b.box(paint(0xc02818), [-1.4, 2.36, 3.785], [0.2, 0.1, 0.005]);
      b.box(M.gold, [0.2, 2.35, 3.79], [0.25, 0.3, 0.01]);
      b.box(M.mural, [0.2, 2.35, 3.78], [0.21, 0.26, 0.005]);
      b.blob(lit(P.BULB, [8, 0.6, 0.3]), [0.2, 1.98, 3.75], [0.02, 0.025, 0.02], 5, 3);
      // The tube light under the awning, serial lights along its edge, the signboard above
      b.box(M.steel, [0, 2.92, -0.9], [0.62, 0.02, 0.04]);
      b.seeded(0.29, () => b.box(S.tube, [0, 2.88, -0.9], [0.6, 0.018, 0.018]));
      for (let i = 0; i <= 40; i++) b.blob(S.serial, [-w / 2 + (i / 40) * w, 2.72, -1.5], [0.022, 0.022, 0.022], 4, 2);
      b.box(M.steel, [0, 3.5, -0.02], [w / 2 - 0.1, 0.32, 0.03]);
      b.seeded(0.13, () => b.box(S.signRed, [0, 3.5, -0.06], [w / 2 - 0.2, 0.28, 0.01]));
      // Benches and plastic chairs out front, a newspaper on one
      b.prop('bench', [-1.3, 0, -0.85], Math.PI);
      b.prop('bench', [1.25, 0, -0.85], Math.PI);
      b.prop('monobloc', [-0.2, 0, -2.0], 2.8, 1, [0.62, 0.05, 0.04]);
      b.prop('monobloc', [0.75, 0, -2.25], -2.6, 1, [0.06, 0.16, 0.5]);
      b.prop('monobloc', [-1.9, 0, -2.1], 1.9);
      // The gas tank under the stove, a stool and a crate of empties, the fan and the bottles
      b.prop('lpg', [-1.85, 0.26, 1.05], 0.4, 1, [0.62, 0.08, 0.05]);
      b.prop('stool', [-1.2, 0.26, 1.35], 0.3, 2.4);
      b.prop('crate', [1.7, 0.26, 1.3], 0.1);
      b.prop('crate', [1.7, 0.51, 1.3], -0.05);
      b.prop('fan', [0, 2.7, 2.0], 0.3, 0.8);
      b.prop('bottles', [-1.1, 2.37, 3.62], 0);
      b.prop('bottles', [0.6, 1.82, 3.62], 0);
    });
    // Shining down and out over the benches; the tin just above it stays in its own shadow
    light(world(x, FRONT, [0, 2.78, -1.0]), TUBE, 2.6, 9, 'tube', 0.29, { spot: [1.15, 1.5] });
    light(world(x, FRONT, [1.6, 2.4, 2.9]), [0.6, 0.72, 1], 0.5, 4.5, 'tv', 0.07);
    light(world(x, FRONT, [-1.55, 1.3, 0.4]), [0.6, 0.65, 1], 0.12, 1.5, 'oil', 0.43);
    void at;
  }

  // ---------------------------------------------------------------- the provision store, shutter half up
  {
    const x = -1.6;
    const w = 4;
    beside(x, FRONT, () => {
      shell(w, WALLS[0]!);
      shelves(w, 3.6);
      for (const s of [-1, 1]) {
        b.box(M.teak, [s * (w / 2 - 0.4), 1.4, 1.9], [0.2, 1.15, 1.4]);
        for (let k = 0; k < 4; k++) for (let i = 0; i < 9; i++) b.box(GOODS[(i + k) % GOODS.length]!, [s * (w / 2 - 0.62), 0.6 + k * 0.5, 0.7 + i * 0.28], [0.03, 0.09, 0.1]);
      }
      // The shutter rolled two-thirds up, sacks of rice and a scale at the front
      shutter(w, 0.55);
      b.plane(M.tin, [-w / 2 + 0.2, 1.95, 0.02], [-w / 2 + 0.2, 2.8, 0.02], [w / 2 - 0.2, 2.8, 0.02], [w / 2 - 0.2, 1.95, 0.02], [0, 0, -1]);
      for (let k = 0; k < 3; k++) {
        b.blob(S.sack, [-1.1 + k * 0.5, 0.55, 0.45], [0.22, 0.32, 0.2], 8, 5, 0.15);
        b.disc(S.rice, [-1.1 + k * 0.5, 0.86, 0.45], 0.17, 8, 1);
      }
      b.box(S.aluminium, [0.9, 0.95, 0.4], [0.2, 0.06, 0.15]);
      b.prop('crate', [1.2, 0, -0.7], 0.2);
      b.prop('crate', [1.2, 0.25, -0.7], 0.15);
      b.prop('basket', [1.2, 0.5, -0.7], 0.6, 1.3);
      b.prop('gallon', [0.55, 0.26, 0.15], 0.3);
      b.prop('gallon', [0.4, 0.26, 0.3], 1.2);
      b.prop('bleach', [-1.6, 0.26, 0.3], 0.2);
      b.prop('cleaner', [-1.5, 0.26, 0.2], -0.4);
      b.prop('jerrycan', [-1.7, 0, -0.6], 0.9);
      b.lathe(S.aluminium, [0.9, 1.0, 0.4], [[0, 0], [0.2, 0.02], [0.22, 0.06], [0, 0.04]], 12);
      sachets(1.0, -0.06, 4);
      b.seeded(0.17, () => b.box(S.cfl, [0, 3.18, 1.8], [0.35, 0.02, 0.02]));
      b.blob(S.bulb, [-1.3, 2.62, -0.6], [0.04, 0.055, 0.04], 6, 4);
      b.bar(M.dark, [-1.3, 2.68, -0.6], [-1.3, 3.0, -0.6], 0.004);
    });
    light(world(x, FRONT, [0, 2.9, 1.6]), [1, 0.95, 0.85], 1.6, 7, 'bulb', 0.17);
    light(world(x, FRONT, [-1.3, 2.5, -0.8]), WARM, 1.0, 6, 'bulb', 0.3);
  }

  // ---------------------------------------------------------------- shut shops: a signboard, a medical cross
  for (const [x, w, wall, sign] of [[-6.1, 4, WALLS[3]!, true], [8.2, 4, WALLS[1]!, false], [12.5, 3.6, WALLS[4]!, false]] as const) {
    beside(x, FRONT, () => {
      shell(w, wall);
      b.prop('shutter', [0, 0.26, 0.05], 0, [(w - 0.4) / 3.08, 2.7 / 2.4, 1]);
      b.box(M.steel, [0, 3.5, -0.02], [w / 2 - 0.1, 0.3, 0.03]);
      if (sign) b.seeded(0.23, () => b.box(S.sign, [0, 3.5, -0.06], [w / 2 - 0.2, 0.26, 0.01]));
      else {
        r();
        // Posters pasted across the shut shutter, a row of one film and a party notice
        const film = FILMS[Math.floor(hashed(x, 5) * FILMS.length)]!;
        const n = Math.floor((w - 0.6) / 0.56);
        for (let j = 0; j < n; j++) {
          const k = j === n - 1 ? POLITICAL[Math.floor(hashed(x, 6) * POLITICAL.length)]! : film;
          b.poster([-((n - 1) / 2) * 0.56 + j * 0.56, 1.55 + (hashed(x, j) - 0.5) * 0.08, -0.16], [0, 0, -1], 0.5, 0.66, k, (hashed(x, j + 9) - 0.5) * 0.05);
        }
      }
    });
  }
  beside(8.2, FRONT, () => {
    b.box(M.steel, [1.35, 2.35, -0.2], [0.03, 0.03, 0.2]);
    b.box(S.cross, [1.35, 2.35, -0.42], [0.05, 0.17, 0.03]);
    b.box(S.cross, [1.35, 2.35, -0.42], [0.17, 0.05, 0.03]);
  });
  light(world(8.2, FRONT, [1.35, 2.35, -0.6]), [0.2, 1, 0.35], 0.4, 3.5, 'bulb', 0.1);
  light(world(-6.1, FRONT, [0, 3.0, -0.8]), [1, 0.95, 0.85], 0.7, 4.5, 'bulb', 0.23);

  // ---------------------------------------------------------------- the bus shelter, its tube dying
  beside(-15.5, ROAD.half + 1.3, () => {
    b.box(M.concrete, [0, 0.1, 0.7], [2.3, 0.2, 0.75], 'y-');
    b.box(M.concrete, [0, 1.5, 1.4], [2.2, 1.3, 0.08], 'y-');
    b.box(paint(0x1868b0), [0, 1.6, 1.31], [1.4, 0.65, 0.01]);
    b.box(paint(0xf0c010), [-0.5, 1.75, 1.3], [0.6, 0.2, 0.005]);
    for (const s of [-1, 1]) b.box(M.concrete, [s * 2.2, 1.5, 0.7], [0.08, 1.3, 0.75], 'y-');
    b.plane(M.tin, [-2.5, 2.8, -0.35], [2.5, 2.8, -0.35], [2.5, 2.95, 1.6], [-2.5, 2.95, 1.6], [0, 1, 0]);
    b.plane(M.tin, [-2.5, 2.78, -0.35], [2.5, 2.78, -0.35], [2.5, 2.93, 1.6], [-2.5, 2.93, 1.6], [0, -1, 0]);
    b.box(M.concrete, [0, 0.5, 1.1], [1.8, 0.05, 0.2]);
    b.box(M.steel, [0, 2.7, 0.8], [0.62, 0.02, 0.04]);
    b.seeded(0.37, () => b.box(S.tubeBad, [0, 2.66, 0.8], [0.6, 0.018, 0.018]));
    b.prop('trashbag', [2.75, 0, 0.9], 0.7, 0.9);
  });
  beside(14.6, FRONT + 0.6, () => b.prop('tyre', [0, 0, 0], 0.15, 1));
  light(world(-15.5, ROAD.half + 1.3, [0, 2.55, 0.6]), TUBE, 1.6, 7, 'tubeBad', 0.37);

  // ================================================================ parked: an auto, a scooter, a bicycle
  const wheel = (c: V3, rad: number, wid: number) => {
    b.with({ at: c, yaw: Math.PI / 2 }, () => {
      b.lathe(S.rubber, [0, -wid / 2, 0], [[0, 0], [rad * 0.6, 0], [rad, wid * 0.2], [rad, wid * 0.8], [rad * 0.6, wid], [0, wid]], 12);
    });
  };
  beside(7.2, ROAD.half + 1.2, () => {
    b.with({ at: [0, 0, -0.1], yaw: Math.PI / 2 }, () => {
      // The autorickshaw: a yellow-and-black body, a canvas top, three wheels
      b.blob(S.yellow, [0, 0.55, 0.85], [0.42, 0.32, 0.35], 8, 5);
      b.box(S.black, [0, 0.42, -0.2], [0.62, 0.22, 0.75]);
      b.box(S.yellow, [0, 0.72, -0.35], [0.6, 0.12, 0.55]);
      b.box(S.black, [0, 1.62, -0.15], [0.66, 0.05, 0.95]);
      b.box(S.black, [0, 1.15, -1.05], [0.63, 0.5, 0.04]);
      for (const s of [-1, 1]) {
        b.box(S.black, [s * 0.64, 1.25, -0.6], [0.02, 0.38, 0.4]);
        b.tube(M.steel, [s * 0.6, 0.65, 0.5], 0.015, 0.015, 0.98, 4);
      }
      b.box(S.glass, [0, 1.25, 0.72], [0.5, 0.3, 0.02]);
      b.box(S.chrome, [0, 1.0, 0.9], [0.32, 0.015, 0.015]);
      b.blob(S.chrome, [0, 0.82, 1.17], [0.06, 0.06, 0.03], 6, 3);
      b.box(plain(0x6a2a18, 0.8), [0, 0.95, -0.55], [0.55, 0.12, 0.25]);
      wheel([0, 0.2, 1.05], 0.2, 0.1);
      for (const s of [-1, 1]) wheel([s * 0.58, 0.2, -0.55], 0.2, 0.12);
    });
  });
  beside(-0.6, ROAD.half + 0.9, () => {
    b.with({ at: [0, 0, 0], yaw: Math.PI / 2 + 0.25 }, () => {
      // A scooter on its stand
      b.box(S.blue, [0, 0.45, 0.0], [0.17, 0.15, 0.45]);
      b.blob(S.blue, [0, 0.62, -0.3], [0.2, 0.15, 0.35], 8, 4);
      b.box(S.black, [0, 0.8, -0.25], [0.15, 0.04, 0.3]);
      b.box(S.blue, [0, 0.75, 0.5], [0.16, 0.35, 0.06]);
      b.bar(M.steel, [0, 1.05, 0.52], [0, 1.18, 0.58], 0.02);
      b.box(S.chrome, [0, 1.2, 0.58], [0.32, 0.015, 0.015]);
      b.blob(S.chrome, [0, 1.1, 0.64], [0.06, 0.05, 0.03], 6, 3);
      wheel([0, 0.2, 0.6], 0.2, 0.09);
      wheel([0, 0.2, -0.55], 0.2, 0.09);
    });
  });
  beside(-9.0, ROAD.half + 0.95, () => {
    b.with({ at: [0.25, 0, 0], yaw: Math.PI / 2 }, () => {
      // A black roadster bicycle leaning on the pole
      for (const z of [-0.5, 0.5]) {
        const ring: V3[] = [];
        for (let i = 0; i <= 16; i++) ring.push([0, 0.34 + Math.cos((i / 16) * Math.PI * 2) * 0.33, z + Math.sin((i / 16) * Math.PI * 2) * 0.33]);
        b.sweep(S.black, ring, ring.map(() => 0.012), 4);
      }
      b.bar(S.black, [0, 0.34, -0.5], [0, 0.9, -0.1], 0.015);
      b.bar(S.black, [0, 0.34, -0.5], [0, 0.4, 0.05], 0.015);
      b.bar(S.black, [0, 0.4, 0.05], [0, 0.9, -0.1], 0.015);
      b.bar(S.black, [0, 0.9, -0.1], [0, 0.92, 0.42], 0.015);
      b.bar(S.black, [0, 0.4, 0.05], [0, 0.92, 0.42], 0.015);
      b.bar(S.black, [0, 0.92, 0.42], [0, 0.34, 0.5], 0.015);
      b.bar(S.chrome, [-0.25, 1.05, 0.42], [0.25, 1.05, 0.42], 0.012);
      b.box(S.black, [0, 0.95, -0.12], [0.06, 0.03, 0.1]);
    });
  });

  return { model: b.model(), lamps, props: b.props, solids: b.solids };
}
