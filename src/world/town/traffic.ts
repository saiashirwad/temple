// Now and then something passes on the road: a scooter heading home, a woman riding side-saddle
// behind her husband; a yellow-and-black autorickshaw puttering the other way, its driver in
// khaki; and the last red KSRTC bus of the evening, its tube lights glowing green-white through
// open windows, a few tired heads inside. Each keeps to the left, follows the road's bends and
// rises, and carries its headlamp and tail light with it; the bus also lights the road beside it.

import { Builder, hex, P, type Mat, type V3 } from '../../render/geo.ts';
import { heightAt, roadZ } from '../terrain.ts';
import { boot } from '../../game/boot.ts';

const lit = (pattern: number, emission: V3): Mat => ({ color: [0, 0, 0], roughness: 1, emission, pattern });
const plain = (h: number, rough = 0.6, metallic = 0): Mat => ({ color: hex(h), roughness: rough, metallic, pattern: P.PLAIN });
const paint = (h: number, rough = 0.35): Mat => ({ color: hex(h), roughness: rough, pattern: P.PAINT });
const HEAD = lit(P.HEAD, [30, 26, 18]);
const TAIL = lit(P.TAIL, [6, 0.25, 0.1]);
const AMBER: Mat = { color: hex(0x8a4a08), roughness: 0.3, pattern: P.PLAIN };
const RUBBER = plain(0x111111, 0.8);
const RIM = plain(0x8a8a88, 0.35, 1);
const CHROME = plain(0xc8c8c8, 0.2, 1);
const GLASS: Mat = { color: [0.02, 0.02, 0.025], roughness: 0.05, pattern: P.GLASS };
const SKIN = plain(0x5e3a24, 0.7);
const HAIR = plain(0x141010, 0.6);
const PLATE = plain(0xe8e6e0, 0.5);

/** A wheel's place on its vehicle: the hub, the radius and the tyre's width. */
export interface WheelSpot {
  at: V3;
  rad: number;
  wid: number;
}

/** The wheels being laid out, collected rather than drawn, so they can turn. */
let spots: WheelSpot[] = [];

/** Draws an upright wheel into `b` at `c`, its axle along x (or z): tyre, rim, spokes and hub. */
export function wheelInto(b: Builder, c: V3, rad: number, wid: number, axle: 'x' | 'z' = 'x') {
  // Axle along x: a point at angle `a` round the wheel, `r` out, `w` across
  const P3 = (a: number, r: number, w: number): V3 =>
    axle === 'x' ? [c[0] + w, c[1] + Math.cos(a) * r, c[2] + Math.sin(a) * r] : [c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r, c[2] + w];

  const T = Math.PI * 2;
  const h = wid / 2;

  // Tread, rounded at its shoulders
  const both = (mat: Mat, cols: number, rows: number, at: (u: number, v: number) => V3) => {
    b.surface(mat, cols, rows, at, false);
    b.surface(mat, cols, rows, at, true);
  };

  both(RUBBER, 18, 4, (u, v) => {
    const w = (v - 0.5) * wid;
    const r = rad * (1 - 0.12 * Math.pow(Math.abs(v - 0.5) * 2, 3));

    return P3(u * T, r, w);
  });

  // Sidewalls, out to the rim
  for (const side of [-1, 1]) both(RUBBER, 18, 2, (u, v) => P3(u * T, rad * (0.6 + 0.4 * v), side * h * (1 - v * 0.1)));

  // The rim's face, a hub, and spokes, so the turning shows
  for (const side of [-1, 1]) {
    both(RIM, 18, 1, (u, v) => P3(u * T, rad * 0.6 * (0.3 + 0.7 * v), side * (h * 0.85)));
    both(plain(0x2a2a2a, 0.5), 10, 1, (u, v) => P3(u * T, rad * 0.18 * v, side * (h * 0.9)));

    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * T;
      b.bar(plain(0x3a3a3a, 0.4, 0.6), P3(a, rad * 0.16, side * h * 0.92), P3(a, rad * 0.56, side * h * 0.92), rad * 0.045);
    }
  }
}

const wheel = (_b: Builder, c: V3, rad: number, wid: number) => {
  spots.push({ at: c, rad, wid });
};

/** One wheel, hub at the origin, axle along x, for turning as an instance of its own. */
export function wheelModel(rad: number, wid: number) {
  const b = new Builder(true);
  wheelInto(b, [0, 0, 0], rad, wid);

  return b.model();
}

/** A seated figure, hips at `hip`, facing +z: shirt and lower cloth, hands reaching to `hands`. */
function figure(b: Builder, hip: V3, o: { shirt: Mat; lower: Mat; hands?: V3; helmet?: Mat; knees?: number; feet?: number; hair?: 'short' | 'long'; side?: boolean }) {
  const [x, y, z] = hip;
  const knees = o.knees ?? 0.42;
  const feet = o.feet ?? y - 0.45;

  // Hips and thighs forward, shins down, sitting astride or (side) both legs to the left
  if (o.side) {
    b.blob(o.lower, [x, y + 0.05, z], [0.19, 0.13, 0.17], 8, 4);

    for (const s of [-0.07, 0.07]) b.sweep(o.lower, [[x + 0.05, y + 0.02, z + s], [x + 0.38, y, z + s * 1.2], [x + 0.42, feet + 0.05, z + s * 1.4]], [0.085, 0.075, 0.07], 6);
    b.sweep(o.lower, [[x + 0.4, y + 0.02, z - 0.13], [x + 0.44, feet + 0.25, z - 0.15], [x + 0.45, feet, z - 0.12]], [0.03, 0.1, 0.16], 7);
  } else {
    b.blob(o.lower, [x, y + 0.05, z], [0.19, 0.13, 0.17], 8, 4);

    for (const s of [-1, 1]) {
      b.sweep(o.lower, [[x + s * 0.1, y + 0.02, z + 0.02], [x + s * 0.17, y + 0.02, z + knees], [x + s * 0.17, feet + 0.08, z + knees + 0.04]], [0.085, 0.075, 0.065], 6);
      b.blob(plain(0x2a1a12, 0.7), [x + s * 0.17, feet + 0.03, z + knees + 0.1], [0.05, 0.035, 0.11], 6, 3);
    }
  }

  // The torso, leaning a little forward, and shoulders
  const chest: V3 = [x, y + 0.42, z - 0.02 + (o.hands ? 0.06 : 0)];
  b.sweep(o.shirt, [[x, y + 0.12, z - 0.02], [x, y + 0.3, z], chest, [x, y + 0.56, chest[2] + 0.01]], [0.16, 0.17, 0.19, 0.12], 8);
  // Neck and head
  const head: V3 = [x, y + 0.75, chest[2] + 0.03];
  b.bar(SKIN, [x, y + 0.56, chest[2]], [x, y + 0.66, head[2]], 0.045);
  b.blob(SKIN, head, [0.085, 0.11, 0.1], 8, 5);

  if (o.helmet) {
    b.blob(o.helmet, [x, head[1] + 0.035, head[2] - 0.01], [0.135, 0.13, 0.15], 10, 6);
    b.box(GLASS, [x, head[1] + 0.01, head[2] + 0.13], [0.09, 0.045, 0.012]);
  } else {
    b.blob(HAIR, [x, head[1] + 0.04, head[2] - 0.015], [0.09, 0.08, 0.1], 8, 4);

    if (o.hair === 'long') {
      b.sweep(HAIR, [[x, head[1] + 0.02, head[2] - 0.08], [x, head[1] - 0.12, head[2] - 0.12], [x, head[1] - 0.35, head[2] - 0.12]], [0.05, 0.035, 0.02], 5);
      // Jasmine at the plait
      b.blob(plain(0xf2efe4, 0.8), [x, head[1] - 0.04, head[2] - 0.11], [0.05, 0.03, 0.025], 6, 3);
    }
  }

  // Arms: to the handlebar, or folded in the lap
  for (const s of [-1, 1]) {
    const sh: V3 = [x + s * 0.17, y + 0.52, chest[2]];
    const hand: V3 = o.hands ? [o.hands[0] + s * 0.25, o.hands[1], o.hands[2]] : o.side ? [x + 0.2 + s * 0.04, y + 0.12, z + 0.08] : [x + s * 0.1, y + 0.12, z + 0.22];
    const elbow: V3 = [(sh[0] + hand[0]) / 2 + s * 0.06, (sh[1] + hand[1]) / 2 - 0.08, (sh[2] + hand[2]) / 2];
    b.sweep(o.shirt, [sh, elbow], [0.055, 0.045], 6);
    b.sweep(SKIN, [elbow, hand], [0.04, 0.032], 6);
  }
}

/** A Honda-style scooter, a man riding and his wife side-saddle behind; facing +z, wheels on y = 0. */
function scooter() {
  const b = new Builder(true);
  const body = paint(0x6a1218);
  const black = plain(0x161616, 0.55);
  // Front apron and leg shield: one curved panel, narrow at the floor, wide at the bar
  b.surface(body, 8, 6, (u, v) => {
    const w = 0.12 + v * 0.12;
    const a = (u - 0.5) * 2;

    return [a * w, 0.3 + v * 0.72, 0.5 + (1 - a * a) * 0.08 - v * 0.04 + Math.pow(1 - v, 2) * 0.06];
  });
  b.surface(black, 8, 6, (u, v) => {
    const w = 0.12 + v * 0.12;
    const a = (u - 0.5) * 2;

    return [a * w, 0.3 + v * 0.72, 0.47 + (1 - a * a) * 0.05 - v * 0.04 + Math.pow(1 - v, 2) * 0.05];
  }, true);
  // Floorboard, the rear body under the seat, the seat
  b.box(black, [0, 0.33, 0.18], [0.16, 0.03, 0.3]);
  b.blob(body, [0, 0.55, -0.38], [0.19, 0.2, 0.46], 10, 6);
  b.blob(plain(0x1c1a18, 0.7), [0, 0.76, -0.33], [0.165, 0.06, 0.4], 10, 4);
  b.box(CHROME, [0, 0.72, -0.82], [0.12, 0.012, 0.05]);
  b.blob(TAIL, [0, 0.62, -0.84], [0.09, 0.035, 0.02], 6, 3);
  b.box(PLATE, [0, 0.47, -0.86], [0.1, 0.05, 0.005]);
  // Front fender, the fork and the handlebar cover with its lamp, the mirrors
  b.blob(body, [0, 0.36, 0.64], [0.07, 0.1, 0.2], 6, 4);
  b.bar(black, [0, 0.3, 0.66], [0, 1.0, 0.5], 0.03);
  b.blob(body, [0, 1.05, 0.52], [0.2, 0.07, 0.11], 10, 4);
  b.blob(HEAD, [0, 1.06, 0.63], [0.07, 0.045, 0.02], 6, 3);

  for (const s of [-1, 1]) {
    b.bar(black, [s * 0.18, 1.05, 0.5], [s * 0.32, 1.04, 0.48], 0.016);
    b.blob(AMBER, [s * 0.17, 1.04, 0.62], [0.03, 0.015, 0.012], 5, 2);
    b.bar(CHROME, [s * 0.15, 1.08, 0.48], [s * 0.2, 1.3, 0.44], 0.006);
    b.blob(GLASS, [s * 0.21, 1.32, 0.44], [0.05, 0.035, 0.008], 6, 3);
  }

  wheel(b, [0, 0.25, 0.62], 0.25, 0.09);
  wheel(b, [0, 0.25, -0.5], 0.25, 0.1);
  // The man in a helmet, white shirt and mundu; his wife behind in a sari, sitting sideways
  figure(b, [0, 0.8, -0.12], { shirt: plain(0xe4e0d6, 0.85), lower: plain(0xe8e4da, 0.85), hands: [0, 1.04, 0.47], helmet: paint(0x1c2030, 0.3), knees: 0.38, feet: 0.36 });
  b.with({ at: [0, 0, -0.5], yaw: 0 }, () => figure(b, [-0.05, 0.8, 0], { shirt: plain(0x2a6a3a, 0.8), lower: { color: hex(0xe8dcc0), roughness: 0.85, pattern: P.CLOTH }, side: true, feet: 0.32, hair: 'long' }));

  return b.model();
}

/** A Bajaj-style autorickshaw, yellow below and black canvas above, its driver in khaki; facing +z. */
function auto() {
  const b = new Builder(true);
  const yellow = paint(0xe0a810, 0.4);
  const black = plain(0x141414, 0.55);
  const canvas: Mat = { color: hex(0x18181a), roughness: 0.85, pattern: P.CLOTH };
  const W = 0.66;

  // The canvas hood, round-shouldered, from the windscreen back to the tail
  const shoulder = (u: number): [number, number] => {
    const a = (u - 0.5) * Math.PI;
    const s = Math.sin(a);
    const c = Math.cos(a);

    return [W * Math.sign(s) * Math.pow(Math.abs(s), 0.35), 1.42 + 0.2 * Math.pow(c, 0.35)];
  };

  b.surface(canvas, 12, 6, (u, v) => {
    const [x, y] = shoulder(u);

    return [x, y, 0.72 - v * 1.78];
  });
  b.surface(plain(0x0a0a0a, 0.9), 12, 6, (u, v) => {
    const [x, y] = shoulder(u);

    return [x * 0.98, y - 0.015, 0.72 - v * 1.78];
  }, true);

  // Closed canvas over the rear quarters and the back, with a small rear window
  for (const s of [-1, 1]) b.quad(canvas, [s * W, 0.75, -1.06], [s * W, 0.75, -0.62], [s * W, 1.44, -0.62], [s * W, 1.44, -1.06], [s, 0, 0]);
  b.quad(canvas, [-W, 0.75, -1.06], [W, 0.75, -1.06], [W, 1.44, -1.06], [-W, 1.44, -1.06], [0, 0, -1]);
  b.box(GLASS, [0, 1.25, -1.07], [0.3, 0.1, 0.005]);
  // Yellow body: the rounded nose over the front wheel, the cowl, the passenger tub
  b.blob(yellow, [0, 0.78, 0.92], [0.46, 0.36, 0.32], 12, 6);
  b.box(yellow, [0, 0.95, 0.68], [0.6, 0.12, 0.08]);
  b.box(yellow, [0, 0.52, -0.2], [W, 0.24, 0.86]);
  b.box(black, [0, 0.3, -0.2], [W - 0.02, 0.04, 0.86]);

  for (const s of [-1, 1]) b.box(black, [s * (W + 0.005), 0.66, -0.2], [0.005, 0.03, 0.85]);
  // The windscreen in its frame, a strip of the driver's own lettering across its top
  b.box(GLASS, [0, 1.28, 0.71], [0.55, 0.26, 0.01]);
  b.box(plain(0xa01818, 0.5), [0, 1.52, 0.715], [0.55, 0.035, 0.008]);
  b.box(plain(0xe8e0c0, 0.5), [0, 1.52, 0.72], [0.35, 0.014, 0.004]);

  for (const s of [-1, 1]) b.bar(black, [s * 0.58, 1.0, 0.71], [s * 0.6, 1.56, 0.71], 0.02);
  b.bar(black, [0.1, 1.04, 0.73], [-0.25, 1.22, 0.73], 0.006);
  // Front: the headlamp, indicators, fender over the wheel, the plate
  b.lathe(CHROME, [0, 0.84, 1.18], [[0, 0], [0.085, 0], [0.085, 0.03], [0, 0.03]], 12);
  b.blob(HEAD, [0, 0.84, 1.22], [0.07, 0.07, 0.02], 8, 3);

  for (const s of [-1, 1]) b.blob(AMBER, [s * 0.3, 0.9, 1.08], [0.035, 0.025, 0.015], 5, 2);
  b.blob(yellow, [0, 0.36, 1.02], [0.09, 0.12, 0.22], 6, 4);
  b.box(PLATE, [0, 0.6, 1.23], [0.13, 0.05, 0.005]);
  // Inside: handlebar, the driver's seat, the passengers' bench, grab rails, the meter
  b.bar(CHROME, [-0.32, 1.06, 0.5], [0.32, 1.06, 0.5], 0.015);
  b.bar(black, [0, 0.95, 0.62], [0, 1.06, 0.5], 0.025);
  b.box(plain(0x2a1410, 0.6), [0, 0.8, 0.12], [0.2, 0.05, 0.18]);
  b.box(plain(0x5a1a14, 0.6), [0, 0.8, -0.72], [0.6, 0.06, 0.22]);
  b.box(plain(0x5a1a14, 0.6), [0, 1.1, -0.94], [0.6, 0.24, 0.05]);

  for (const s of [-1, 1]) b.bar(CHROME, [s * 0.62, 0.8, -0.6], [s * 0.62, 1.42, -0.6], 0.012);
  b.bar(CHROME, [-0.55, 1.4, -0.2], [0.55, 1.4, -0.2], 0.012);
  b.box(lit(P.PLAIN, [1.5, 0.3, 0.1]), [0.25, 1.02, 0.6], [0.05, 0.03, 0.01]);

  // A string of marigold hung across the windscreen, and the tail
  for (let k = 0; k < 9; k++) {
    const t = k / 8;
    b.blob(plain(0xd88a18, 0.8), [-0.45 + t * 0.9, 1.5 - Math.sin(t * Math.PI) * 0.08, 0.69], [0.02, 0.02, 0.02], 5, 3);
  }

  for (const s of [-1, 1]) b.box(TAIL, [s * 0.5, 0.55, -1.07], [0.05, 0.04, 0.01]);
  b.box(PLATE, [0, 0.55, -1.075], [0.16, 0.06, 0.005]);
  // Wheels, and the spare on the back
  wheel(b, [0, 0.2, 1.0], 0.2, 0.1);

  for (const s of [-1, 1]) wheel(b, [s * 0.58, 0.2, -0.55], 0.2, 0.12);
  wheelInto(b, [0, 0.95, -1.13], 0.19, 0.1, 'z');
  figure(b, [0, 0.82, 0.12], { shirt: { color: hex(0x8a7448), roughness: 0.85, pattern: P.CLOTH }, lower: plain(0xd8d2c4, 0.85), hands: [0, 1.06, 0.5], knees: 0.4, feet: 0.34 });
  // A passenger in the back
  figure(b, [0.3, 0.84, -0.72], { shirt: plain(0x3a4a6a, 0.85), lower: plain(0xe4e0d6, 0.85), knees: 0.4, feet: 0.36 });

  return b.model();
}

/** The KSRTC bus: red, a cream band, open windows lit by tube lights, facing +z. */
function bus() {
  const b = new Builder(true);
  const red = paint(0xa8141a, 0.45);
  const cream = paint(0xe8d8a0, 0.45);
  const dark = plain(0x161616, 0.6);
  const L = 5.5;
  const W = 1.25;
  // Lower body, the band, pillars between the windows, the upper band and a rounded roof
  b.box(red, [0, 0.85, 0], [W, 0.42, L]);
  b.box(cream, [0, 1.36, 0], [W + 0.005, 0.09, L + 0.005]);
  b.box(red, [0, 2.65, 0], [W, 0.2, L]);
  b.box(cream, [0, 2.48, 0], [W + 0.005, 0.03, L + 0.005]);
  b.surface(plain(0xd8d4cc, 0.6), 10, 1, (u, v) => {
    const a = (u - 0.5) * Math.PI;

    return [Math.sin(a) * W, 2.85 + Math.cos(a) * 0.16, L - v * 2 * L];
  });
  b.box(dark, [0, 0.38, 0], [W - 0.1, 0.06, L - 0.3]);
  // Inside: the lit ceiling and walls glow through the windows, seats and a few heads
  const glow = lit(P.PLAIN, [0.5, 0.68, 0.56]);
  b.box(glow, [0, 2.4, 0], [W - 0.06, 0.02, L - 0.1]);
  // The floor and the lower walls inside, lit faintly by the tubes; above the sills, open air
  b.box(plain(0x3a3e38, 0.8), [0, 1.0, 0], [W - 0.05, 0.02, L - 0.1]);

  for (const s of [-1, 1]) b.box(lit(P.PLAIN, [0.02, 0.028, 0.022]), [s * (W - 0.05), 1.22, 0], [0.01, 0.2, L - 0.1]);

  // Tube lights along the ceiling
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.box(lit(P.PLAIN, [4, 5.2, 4.4]), [s * 0.6, 2.38, -L + 1.5 + i * 2.6], [0.02, 0.015, 0.55]);
  const heads: Mat[] = [HAIR, plain(0x222018, 0.7), plain(0xe8e4da, 0.8)];
  let k = 0;

  for (let i = 0; i < 9; i++) {
    const z = -L + 1.2 + i * 1.02;

    for (const s of [-1, 1]) {
      b.box(plain(0x2a3a5a, 0.7), [s * 0.72, 1.45, z], [0.42, 0.25, 0.04]);

      // Not every seat taken this late
      if ((i * 7 + (s + 1) * 3) % 5 < 2) {
        const x = s * (0.55 + ((i + s) % 2) * 0.3);
        b.blob(heads[k++ % 3]!, [x, 1.7, z + 0.2], [0.18, 0.18, 0.12], 6, 3);
        b.blob(SKIN, [x, 2.0, z + 0.2], [0.09, 0.11, 0.1], 6, 4);
        b.blob(HAIR, [x, 2.06, z + 0.18], [0.09, 0.07, 0.1], 6, 3);
      }
    }
  }

  // Window pillars, and some shutters drawn half down
  const WIN = 10;

  for (const s of [-1, 1]) {
    for (let i = 0; i <= WIN; i++) {
      const z = -L + 0.4 + (i * (2 * L - 1.6)) / WIN;
      b.box(red, [s * W, 1.95, z], [0.02, 0.5, 0.06]);

      if (i < WIN && (i * 3 + (s > 0 ? 1 : 0)) % 4 === 0) b.box(plain(0x4a4440, 0.6, 0.4), [s * (W - 0.01), 2.25, z + (2 * L - 1.6) / WIN / 2], [0.015, 0.2, (2 * L - 1.6) / WIN / 2 - 0.06]);
    }

    b.box(red, [s * W, 1.95, L - 0.55], [0.02, 0.5, 0.15]);
    b.box(red, [s * W, 1.95, -L + 0.2], [0.02, 0.5, 0.2]);

    // The window bars of an ordinary bus
    for (const y of [1.7, 1.95]) b.bar(CHROME, [s * (W + 0.01), y, -L + 0.4], [s * (W + 0.01), y, L - 0.7], 0.008);
  }

  // The doors on the left, open, the steps lit from within
  for (const z of [L - 1.35, -0.6]) {
    b.box(glow, [W + 0.005, 1.4, z], [0.005, 0.9, 0.42]);
    b.box(dark, [W - 0.05, 0.62, z], [0.08, 0.04, 0.42]);
  }

  // The front: windscreen, the lit destination board, headlamps, grille and bumper
  b.box(GLASS, [0, 1.95, L + 0.01], [W - 0.08, 0.5, 0.01]);
  b.box(lit(P.PLAIN, [0.05, 0.07, 0.06]), [0, 1.95, L - 0.3], [W - 0.1, 0.5, 0.01]);
  b.box(dark, [0, 2.65, L + 0.02], [0.9, 0.13, 0.01]);

  for (let i = 0; i < 14; i++) if (i % 4 !== 3) b.box(lit(P.PLAIN, [6, 2.8, 0.3]), [-0.78 + i * 0.12, 2.65, L + 0.03], [0.045, 0.07, 0.003]);

  for (const s of [-1, 1]) {
    b.lathe(CHROME, [s * 0.92, 0.95, L + 0.01], [[0, 0], [0.13, 0], [0.13, 0.02], [0, 0.02]], 12);
    b.blob(HEAD, [s * 0.92, 0.95, L + 0.035], [0.1, 0.1, 0.02], 8, 3);
    b.blob(AMBER, [s * 1.12, 1.12, L + 0.02], [0.05, 0.03, 0.01], 5, 2);
  }

  for (let i = 0; i < 6; i++) b.box(dark, [0, 0.82 + i * 0.07, L + 0.01], [0.55, 0.012, 0.01]);
  b.box(dark, [0, 0.52, L + 0.06], [W + 0.03, 0.1, 0.06]);
  b.box(PLATE, [0, 0.6, L + 0.12], [0.25, 0.07, 0.005]);
  // The back: window, tail lights, the plate
  b.box(GLASS, [0, 2.0, -L - 0.01], [W - 0.15, 0.4, 0.01]);

  for (const s of [-1, 1]) b.box(TAIL, [s * 1.05, 0.95, -L - 0.01], [0.1, 0.07, 0.01]);
  b.box(PLATE, [0, 0.75, -L - 0.02], [0.25, 0.07, 0.005]);
  b.box(dark, [0, 0.52, -L - 0.04], [W + 0.03, 0.1, 0.05]);

  // Wheels and their arches
  for (const z of [L - 1.75, -L + 2.3]) {
    for (const s of [-1, 1]) {
      wheel(b, [s * (W - 0.18), 0.52, z], 0.52, 0.3);
      b.box(dark, [s * (W + 0.005), 0.9, z], [0.005, 0.12, 0.62]);
    }
  }

  return b.model();
}

/** Builds a vehicle, taking the wheels it laid out. */
const withWheels = (make: () => ReturnType<Builder['model']>) => {
  spots = [];
  const model = make();

  return { model, wheels: spots };
};

export type RiderKind = 'scooter' | 'auto' | 'bus';

export interface Rider {
  model: ReturnType<typeof scooter>;
  /** Its wheels, which turn as it goes. */
  wheels: WheelSpot[];
  kind: RiderKind;
  /** Metres per second, the direction along x, how long one round takes and when it starts. */
  speed: number;
  dir: 1 | -1;
  period: number;
  start: number;
  /** Where its headlamp sits, ahead of the origin, and its tail behind. */
  lamp: { forward: number; up: number; back: number };
  /** Light spilling from it onto the road, as the bus's lit windows do. */
  glow?: { color: V3; intensity: number; range: number; up: number };
  /** How far from the road's middle it keeps. */
  lane: number;
}

// Timed so nothing on the same side meets: the bus sets off ten seconds behind a scooter, slower
// than it, and is gone before the next scooter comes
export const RIDERS = (): Rider[] => [
  { ...withWheels(scooter), kind: 'scooter', speed: 10, dir: 1, period: 38, start: 6, lamp: { forward: 0.7, up: 1.06, back: 0.9 }, lane: 1.6 },
  { ...withWheels(auto), kind: 'auto', speed: 7, dir: -1, period: 61, start: 24, lamp: { forward: 1.25, up: 0.84, back: 1.1 }, lane: 1.5 },
  { ...withWheels(bus), kind: 'bus', speed: 9, dir: 1, period: 76, start: 16, lamp: { forward: 5.6, up: 0.95, back: 5.6 }, glow: { color: [0.75, 1, 0.82], intensity: 5, range: 8, up: 2.0 }, lane: 1.75 },
];

/** Test only: every rider parked by the tea shop. */
const PARK = boot.has('park');

/** Where a rider is at time `t`: on stage, its position, heading and the road's slope. */
export function rideAt(r: Rider, t: number) {
  const span = 230;
  const travel = ((t - r.start) % r.period + r.period) % r.period;
  const s = travel * r.speed;
  const on = PARK || (t > r.start && s < span);
  const x = PARK ? { scooter: -3, auto: 4, bus: -14 }[r.kind] : r.dir > 0 ? -span / 2 + s : span / 2 - s;
  const lane = -r.dir * r.lane;
  const z = roadZ(x) + lane;
  const reach = r.kind === 'bus' ? 4 : 1;
  const ahead = x + r.dir * reach;
  const za = roadZ(ahead) + lane;
  const yaw = Math.atan2(ahead - x, za - z);
  const behind = x - r.dir * reach;
  const zb = roadZ(behind) + lane;
  const y = r.kind === 'bus' ? Math.min(heightAt(ahead, za), heightAt(behind, zb), heightAt(x, z)) : heightAt(x, z);
  const pitch = Math.atan2(heightAt(ahead, za) - heightAt(behind, zb), Math.hypot(ahead - behind, za - zb));

  return { on, position: [x, y, z] satisfies V3, yaw, pitch, travelled: s };
}
