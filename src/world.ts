// Layout and palette shared by every part of the scene. Metres; +y up. The pond's water lies at
// y = 0 so the mirror camera can reflect about it, and the land sits at GROUND above it.

import { hex, P, type Mat, type V3 } from './geo.ts';

export const GROUND = 0.9;

/** The outer compound wall (prakaram), its gatehouse at +z facing the road. */
export const COMPOUND = { x: 15, z0: -17, z1: 17, height: 2.9, thick: 0.6 };
/** The cloister (nalambalam) around the shrine, with its lamp lattice on the outside. */
export const CLOISTER = { x: 7.2, z0: -8.5, z1: 5.5, height: 2.5, depth: 2.4 };
export const SHRINE: V3 = [0, GROUND, -2.4];
export const MANDAPAM: V3 = [0, GROUND, 2.0];
/** The great offering stone's pavilion (valiya balikkalpura), before the cloister door. */
export const BALIKKAL: V3 = [0, GROUND, 7.6];
/** The temple theatre (koothambalam), to the left of the way in, long side along z. */
export const KOOTH: V3 = [-7.6, GROUND, 9.6];
/** A small Ganapathi shrine behind the cloister. */
export const GANAPATHI: V3 = [-6, GROUND, -14.6];
export const FLAGSTAFF: V3 = [0, GROUND, 9];
export const LAMP_TOWER: V3 = [0, GROUND, 11.2];
export const GATE: V3 = [0, GROUND, COMPOUND.z1];
/** The pond, east of the compound: an irregular bank round a centre, the temple's ghat on its west. */
export const POND = { x: 39, z: -2, r: 14 };
/** The road runs along x in front of the gate. */
export const ROAD = { z: 29.5, half: 3.6 };
/** The paddy fields, where the valley opens out west of the town, and their level. */
export const PADDY = { x: -168, z: 18, rx: 52, rz: 46, y: GROUND + 0.45 };
export const BANYAN: V3 = [-11, GROUND, 21.6];

export const M = {
  laterite: { color: hex(0x9a4a2c), roughness: 0.92, pattern: P.LATERITE },
  lateriteDark: { color: hex(0x6e3220), roughness: 0.95, pattern: P.LATERITE },
  plaster: { color: hex(0xe8e0cf), roughness: 0.85, pattern: P.PLASTER },
  ochre: { color: hex(0xc98f45), roughness: 0.85, pattern: P.PLASTER },
  granite: { color: hex(0x6c6862), roughness: 0.7, pattern: P.GRANITE },
  tile: { color: hex(0x8e3b22), roughness: 0.75, pattern: P.TILE },
  copper: { color: hex(0x6f4a30), roughness: 0.45, metallic: 0.6, pattern: P.COPPER },
  wood: { color: hex(0x3b2216), roughness: 0.7, pattern: P.WOOD },
  woodRed: { color: hex(0x5a1f14), roughness: 0.5, pattern: P.LACQUER },
  teak: { color: hex(0x5a3420), roughness: 0.6, pattern: P.WOOD },
  mural: { color: hex(0xb08040), roughness: 0.9, pattern: P.MURAL },
  mtile: { color: hex(0x9a4020), roughness: 0.75, pattern: P.MTILE },
  tin: { color: hex(0x7a7c7e), roughness: 0.5, metallic: 0.6, pattern: P.TIN },
  white: { color: hex(0xd8d2c4), roughness: 0.6, pattern: P.PAINT },
  black: { color: hex(0x1a1716), roughness: 0.6, pattern: P.PAINT },
  brass: { color: hex(0xd0a24a), roughness: 0.32, metallic: 1, pattern: P.BRASS },
  gold: { color: hex(0xf0c060), roughness: 0.22, metallic: 1, pattern: P.GOLD },
  /** Old bell metal, oiled and smoked: darker and browner than the household brass. */
  bronze: { color: hex(0x9a7038), roughness: 0.34, metallic: 1, pattern: P.BRASS },
  flame: { color: [0, 0, 0], roughness: 1, emission: [9, 4.2, 1.1], pattern: P.FLAME },
  concrete: { color: hex(0x8a877f), roughness: 0.9, pattern: P.CONCRETE },
  steel: { color: hex(0x55575a), roughness: 0.5, metallic: 0.8, pattern: P.STEEL },
  sodium: { color: [0, 0, 0], roughness: 1, emission: [14, 6, 1.4], pattern: P.SODIUM },
  sodiumBad: { color: [0, 0, 0], roughness: 1, emission: [14, 6, 1.4], pattern: P.SODIUM_BAD },
  dark: { color: hex(0x121010), roughness: 0.9, pattern: P.PLAIN },
  cloth: { color: hex(0xb8261b), roughness: 0.9, pattern: P.CLOTH, doubleSided: true },
  pondStone: { color: hex(0x7d4630), roughness: 0.9, pattern: P.WATERSTONE },
} satisfies Record<string, Mat>;

/**
 * The walk the camera takes when left alone, as x, z points of a closed loop: along the road, in
 * through the gate, round the shrine inside the cloister, round the outer walk, out to the pond's
 * ghat, round the pond and back by the road.
 */
export const TOUR: [number, number][] = [
  [-12, 27.6], [-6, 27.2], [-2.2, 26.6], [-0.2, 24.6], [0.3, 21.5], [0.65, 16.5], [1.2, 13.2], [2.2, 9.8], [1.8, 7.2],
  [0.5, 5.9], [0, 4.6], [-2.9, 3.6], [-3.7, -0.5], [-3.4, -5.2], [0, -5.6], [3.4, -5.2], [3.7, -0.5], [2.9, 3.6],
  [0.6, 4.9], [0, 6.2], [-2.6, 7.4], [-3.9, 9.6], [-4.3, 13.4], [-10.6, 13.5], [-11, 0], [-11, -11.6], [-4, -12.8], [5, -12.8], [11, -11.6],
  [11, 0], [10.4, 10.8], [3.4, 12.2], [1.0, 12.4], [0.65, 15.2], [0.65, 18], [0.8, 22.4], [7, 23.6], [17, 21.5], [21.5, 11],
  [22.6, 2.5], [22.9, -2], [21.6, -8], [24, -17], [34, -20.5], [47, -18.5], [55, -7], [54, 7], [44, 15.5],
  [30, 18.5], [18, 25.5], [8, 28.6], [-6, 29.6],
];
