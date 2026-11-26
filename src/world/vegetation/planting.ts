// Where everything grows. Near the temple every tree and plant is a full mesh; beyond NEAR the
// woods go on as cards (impostors) over the hills to the horizon. Coconut palms lean out over
// the road and the pond, areca stands in groves, flowering bushes line the compound wall, grass
// pushes up between the slabs.
//
// Town and near woods: coconut, areca, mango, a few jack, tamarind, cashew, teak, gulmohar
// (some over the road), ezhilampala, peepal, drumstick and papaya by the kitchens, banana, and
// hedges of shoe-flower, croton and chethi. The serpent grove: wild fig, ezhilampala, irul,
// maruthu, peepal. The forest: teak, irul, silk cotton, rubber gone wild and cashew lower down,
// maruthu, wild fig, ezhilampala, wild mango and the odd jack higher up, bamboo by the lower path;
// under them ferns, lantana and communist pacha on the open edges, wild ginger and turmeric,
// cane. By the river and the brooks: screwpine, wild plantain, cane.

import { rng, type V3 } from '../../render/geo.ts';
import { heightAt, onRoad, pondQ, riverCut, roadZ } from '../terrain.ts';
import { inRiver, RIVER, riverPoint, WATER_HALF } from '../trail/river.ts';
import { onBridge } from '../trail/bridge.ts';
import { BROOKS, plantFree, treeFree } from '../trail/jungle.ts';
import { BALIKKAL, BANYAN, CLOISTER, COMPOUND, GANAPATHI, GROUND, KOOTH, POND, ROAD, TOUR } from '../../content/world.ts';
import { OUTER, SERPENT_GROVE, TULSI } from '../town/grounds.ts';
import { CLEARING, trailAt as trailAtLocal, trailNear } from '../trail/trail.ts';
import { specimens, type Specimen } from './specimens.ts';
import VEGETATION from '../../content/vegetation.json';
import { GROVES, groveAt, groveTrees, inPaddy, inYard, onLane, PADDY, PLOTS, plotPoint } from '../town/town.ts';

/** The kinds of tree that go on as cards in the distance, each with its own atlas. */
export type FarKind = 'palm' | 'broad' | 'areca' | 'rubber';
export const FAR_KINDS: FarKind[] = ['palm', 'broad', 'areca', 'rubber'];

export interface Planted {
  specimen: Specimen;
  at: V3;
  yaw: number;
  scale: number;
  stiff: number;
  /** A colour multiplier near white, so no two trees of a kind are quite the same shade. */
  tint?: V3;
}

/** A far tree: a card of its kind's atlas from afar, `specimen` (or the kind's own) up close. */
export interface FarTree {
  kind: FarKind;
  at: V3;
  yaw: number;
  scale: number;
  specimen?: Specimen;
  tint?: V3;
}

/** A shade near white: brighter or darker, a little warmer (yellower) or cooler (bluer). */
const tintOf = (t: () => number, k = 1): V3 => {
  const v = 1 + (t() - 0.5) * 0.26 * k;
  const h = (t() - 0.5) * 0.14 * k;
  return [v * (1 + h * 0.8), v * (1 + h * 0.25), v * (1 - h * 1.4)];
};

/** Full meshes inside this distance of the temple, cards beyond it. */
export const NEAR = 62;
const FAR = 430;

class Spacing {
  private cells = new Map<number, [number, number, number][]>();
  private key = (i: number, j: number) => i * 100003 + j;
  constructor(private size: number) {}
  ok(x: number, z: number, r: number) {
    const i0 = Math.floor(x / this.size);
    const j0 = Math.floor(z / this.size);
    for (let i = i0 - 2; i <= i0 + 2; i++) {
      for (let j = j0 - 2; j <= j0 + 2; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const p = list[k]!;
          const dx = p[0] - x;
          const dz = p[1] - z;
          const m = p[2] > r ? p[2] : r;
          if (dx * dx + dz * dz < m * m) return false;
        }
      }
    }
    return true;
  }
  put(x: number, z: number, r: number) {
    const k = this.key(Math.floor(x / this.size), Math.floor(z / this.size));
    const list = this.cells.get(k) ?? [];
    list.push([x, z, r]);
    this.cells.set(k, list);
  }
}

const tourDistance = (x: number, z: number) => {
  let best = Infinity;
  for (let i = 0; i < TOUR.length; i++) {
    const [ax, az] = TOUR[i]!;
    const [bx, bz] = TOUR[(i + 1) % TOUR.length]!;
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
  }
  return best;
};

const inCompound = (x: number, z: number, m: number) => x > -COMPOUND.x - m && x < COMPOUND.x + m && z > COMPOUND.z0 - m && z < COMPOUND.z1 + m;
const inShops = (x: number, z: number) => x > -20 && x < 12 && z > ROAD.z + ROAD.half && z < ROAD.z + ROAD.half + 11;

/** Deterministic thinning used by production placement and its distribution workbench. */
export function inPlantingDensity(at: readonly number[], density: number) {
  const n = Math.sin(at[0]! * 12.9898 + at[2]! * 78.233) * 43758.5453;
  return n - Math.floor(n) < Math.max(0, Math.min(1, density));
}

export function plantAll(homes: V3[], gaps: V3[], tulsiSpots: V3[] = [], options: { seed?: number; density?: number } = {}) {
  const seed = options.seed ?? VEGETATION.seed;
  const r = rng(seed);
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)]!;
  const { palms, arecas, mangos, jacks, banyans, rubbers, tufts, ferns, chethi, hibiscus, jasmine,
    crotons, bananas, tulsis, teaks, laurels, iruls, figs, peepals, silks, alstonias, cashews,
    tamarinds, gulmohars, drumsticks, papayas, screwpines, lantanas, chromolaenas, gingers, rattans, bamboos } = specimens;
  /** A tree for a yard or the near woods by weight: mostly mango, jack kept rare. */
  const yardTrees = [
    { w: 0.4, list: mangos, room: 5, stiff: 3 },
    { w: 0.09, list: jacks, room: 5, stiff: 3 },
    { w: 0.1, list: tamarinds, room: 6, stiff: 4 },
    { w: 0.1, list: cashews, room: 5, stiff: 3 },
    { w: 0.12, list: teaks, room: 4.5, stiff: 2.5 },
    { w: 0.08, list: gulmohars, room: 6, stiff: 3 },
    { w: 0.05, list: alstonias, room: 4.5, stiff: 3 },
    { w: 0.06, list: peepals, room: 6, stiff: 4 },
  ];
  const yardTree = (q: number) => {
    let acc = 0;
    for (const t of yardTrees) if (q < (acc += t.w)) return t;
    return yardTrees[0]!;
  };

  const trees: Planted[] = [];
  const plants: Planted[] = [];
  /** Far trees: a card of their kind's atlas from afar, `specimen` (or the kind's own) up close. */
  const far: FarTree[] = [];
  const spacing = new Spacing(6);

  const blocked = (x: number, z: number, m: number) =>
    onRoad(x, z, m * 0.5 + 0.8) ||
    pondQ(x, z) < 1.08 ||
    inShops(x, z) ||
    Math.hypot(x - BANYAN[0], z - BANYAN[2]) < 6 + m ||
    homes.some((h) => Math.hypot(h[0] - x, h[2] - z) < 7 + m) ||
    onLane(x, z, m * 0.5 + 0.6) ||
    inPaddy(x, z, -1) ||
    groveAt(x, z, 1) !== null ||
    (Math.abs(x) < 2.4 && z > COMPOUND.z1 && z < ROAD.z);
  /** Trees stand clear of the river's ravine and its bridge; small plants only stay out of the water. */
  const ravine = (x: number, z: number) => riverCut(x, z) > 0.5 || inRiver(x, z, 1.5) || onBridge(x, z, 2.5) || !treeFree(x, z);
  const wet = (x: number, z: number) => inRiver(x, z, 0.4) || onBridge(x, z, 0.4) || !plantFree(x, z, 0.9);
  const tree = (specimen: Specimen, x: number, z: number, scale: number, stiff: number, room: number, yaw = r() * Math.PI * 2) => {
    if (!spacing.ok(x, z, room) || trailNear(x, z, 6).distance < 3 || ravine(x, z)) return false;
    spacing.put(x, z, room);
    trees.push({ specimen, at: [x, heightAt(x, z) - 0.05, z], yaw, scale, stiff });
    return true;
  };
  const plant = (specimen: Specimen, x: number, z: number, scale: number, stiff = 0.3, y?: number) => {
    // Nothing grows on the worn path itself
    if (trailNear(x, z, 4).distance < 1.55 || wet(x, z)) return;
    plants.push({ specimen, at: [x, y ?? heightAt(x, z) - 0.02, z], yaw: r() * Math.PI * 2, scale, stiff });
  };

  trees.push({ specimen: banyans[0], at: BANYAN, yaw: 0.4, scale: 1, stiff: 6 });
  spacing.put(BANYAN[0], BANYAN[2], 9);

  // ---- inside the compound: a few palms and a flowering tree in the corners
  tree(palms[2]!, -13.2, -15.2, 1, 1, 3, 2.4);
  tree(palms[4]!, 13.4, 15.0, 1, 1, 3, -2.4);
  tree(palms[1]!, -13.5, 6.5, 0.95, 1, 3, -1.6);
  tree(mangos[0]!, 12.8, -3.5, 0.75, 3, 4);
  plant(tulsis[0], TULSI[0], TULSI[2], 1, 0.4, GROUND + 0.93);
  // Chethi and jasmine along the inside of the wall
  const wallIn = COMPOUND.x - 0.9;
  for (let z = COMPOUND.z0 + 1.2; z < COMPOUND.z1 - 1; z += 1.6 + r() * 1.6) {
    for (const s of [-1, 1]) if (r() < 0.75) plant(r() < 0.7 ? pick(chethi) : jasmine[0]!, s * wallIn, z, 0.8 + r() * 0.4);
  }
  for (let x = -COMPOUND.x + 1.5; x < COMPOUND.x - 1.5; x += 1.6 + r() * 1.6) {
    if (Math.abs(x - 12.9) < 1.6) continue;
    if (r() < 0.7) plant(pick(chethi), x, COMPOUND.z0 + 0.9, 0.8 + r() * 0.4);
    if (Math.abs(x) > 4.8 && r() < 0.7) plant(pick(chethi), x, COMPOUND.z1 - 0.9, 0.8 + r() * 0.4);
  }
  // Grass in the slab gaps and in tufts over the sand, thicker by the walls
  for (const g of gaps) plant(pick(tufts), g[0], g[2], 0.5 + r() * 0.4, 0.2, GROUND);
  for (let i = 0; i < 900; i++) {
    const x = (r() * 2 - 1) * (COMPOUND.x - 0.3);
    const z = COMPOUND.z0 + 0.3 + r() * (COMPOUND.z1 - COMPOUND.z0 - 0.6);
    const edge = Math.min(COMPOUND.x - Math.abs(x), z - COMPOUND.z0, COMPOUND.z1 - z);
    if (r() > 0.25 + 0.75 * Math.exp(-edge * 0.8)) continue;
    if (Math.abs(x) < CLOISTER.x + 0.3 && z > CLOISTER.z0 - 0.3 && z < CLOISTER.z1 + 0.3) continue;
    if (Math.abs(x) < 4.5 && z > COMPOUND.z1 - 3.2) continue;
    if (Math.abs(Math.abs(x) - OUTER.x) < 0.9 || Math.abs(z - OUTER.z0) < 0.9 || Math.abs(z - OUTER.z1) < 0.9) continue;
    if (Math.abs(x) < 2.5 && z > 5 && z < 13) continue;
    if (x > KOOTH[0] - 3.3 && x < KOOTH[0] + 3.4 && Math.abs(z - KOOTH[2]) < 3.9) continue;
    if (Math.abs(x - GANAPATHI[0]) < 1.4 && Math.abs(z - GANAPATHI[2]) < 1.6) continue;
    if (Math.abs(x) < 2.1 && Math.abs(z - BALIKKAL[2]) < 2.1) continue;
    plant(pick(tufts), x, z, 0.4 + r() * 0.5, 0.2, GROUND);
  }
  // Inside the cloister's courtyard, a little grass at the foot of the walls
  for (let i = 0; i < 60; i++) {
    const s = r() < 0.5 ? -1 : 1;
    plant(pick(tufts), s * (CLOISTER.x - CLOISTER.depth - 0.25), -6 + r() * 9, 0.35 + r() * 0.3, 0.2, GROUND);
  }

  // ---- the serpent grove: a dark knot of trees round the naga stones
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = 4 + r() * 3;
    // A sacred grove is a scrap of the old forest: wild figs, ezhilampala, irul, maruthu
    const grove = [figs, alstonias, iruls, mangos, laurels, alstonias, peepals, iruls, figs][i]!;
    tree(pick(grove), SERPENT_GROVE[0] + Math.cos(a) * d, SERPENT_GROVE[2] + Math.sin(a) * d, 0.8 + r() * 0.3, 3, 3.2);
  }
  for (let i = 0; i < 40; i++) {
    const a = r() * 6.3;
    const d = 2.5 + r() * 7;
    const k = r();
    plant(k < 0.45 ? pick(ferns) : k < 0.75 ? pick(chethi) : pick(gingers), SERPENT_GROVE[0] + Math.cos(a) * d, SERPENT_GROVE[2] + Math.sin(a) * d, 0.8 + r() * 0.6);
  }

  // ---- coconut palms round the pond, leaning out over the water
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.15;
    const x = POND.x + Math.cos(a) * POND.r * (1.2 + r() * 0.35);
    const z = POND.z + Math.sin(a) * POND.r * (1.2 + r() * 0.35);
    if (blocked(x, z, 0) || inCompound(x, z, 2) || tourDistance(x, z) < 1.6) continue;
    tree(pick(palms), x, z, 0.85 + r() * 0.35, 1, 3, Math.atan2(POND.x - x, POND.z - z) + (r() - 0.5) * 0.6);
  }
  // ---- palms along the road, leaning over it
  for (let x = -NEAR; x < NEAR; x += 4 + r() * 6) {
    for (const s of [-1, 1]) {
      const z = roadZ(x) + s * (ROAD.half + 1.6 + r() * 3);
      if (blocked(x, z, -1.5) || inCompound(x, z, 1.5) || tourDistance(x, z) < 1.6) continue;
      // Now and then a gulmohar spreading over the road instead, as they're planted along it
      if (r() < 0.1 && tree(pick(gulmohars), x, z + s * 1.5, 0.85 + r() * 0.3, 3, 5)) continue;
      tree(pick(palms), x, z, 0.9 + r() * 0.3, 1, 3, Math.atan2(0, -s) + (r() - 0.5) * 0.9);
    }
  }
  // ---- the rest of the near woods, and the undergrowth beneath
  for (let i = 0; i < 5000; i++) {
    const x = (r() * 2 - 1) * NEAR;
    const z = (r() * 2 - 1) * NEAR;
    const d = Math.hypot(x, z);
    if (d > NEAR || inCompound(x, z, 2.5) || blocked(x, z, 0.5) || tourDistance(x, z) < 2.5) continue;
    const p = r();
    if (p < 0.5) tree(pick(palms), x, z, 0.85 + r() * 0.35, 1, 4.5);
    else if (p < 0.66) tree(pick(arecas), x, z, 0.9 + r() * 0.3, 0.8, 2.6);
    else if (p < 0.69) tree(pick(drumsticks), x, z, 0.85 + r() * 0.3, 1.2, 3);
    else if (p < 0.72) tree(pick(papayas), x, z, 0.85 + r() * 0.3, 0.9, 2.2);
    else {
      const t = yardTree((p - 0.72) / 0.28);
      tree(pick(t.list), x, z, 0.85 + r() * 0.35, t.stiff, t.room + 1.5);
    }
  }
  // A banana patch either side of the path outside the gate, where everyone walks past it
  for (const [x, z, k] of [[-4.6, 20.4, 0], [-6.3, 21.8, 1], [-5.0, 23.3, 2], [-7.6, 20.2, 1], [5.2, 21.0, 0], [6.8, 22.6, 2], [4.9, 23.6, 1]] as const) {
    plant(bananas[k]!, x, z, 0.95 + r() * 0.2, 0.5);
  }
  // Bananas round the houses and in patches
  for (const h of homes) {
    if (Math.hypot(h[0], h[2]) > NEAR + 30) continue;
    for (let k = 0; k < 6; k++) {
      const a = r() * 6.3;
      const x = h[0] + Math.cos(a) * (7 + r() * 4);
      const z = h[2] + Math.sin(a) * (7 + r() * 4);
      if (!onRoad(x, z, 1)) plant(pick(bananas), x, z, 0.9 + r() * 0.3, 0.5);
    }
  }
  for (let i = 0; i < 2600; i++) {
    const x = (r() * 2 - 1) * NEAR;
    const z = (r() * 2 - 1) * NEAR;
    if (Math.hypot(x, z) > NEAR || inCompound(x, z, 0.4) || inShops(x, z) || onRoad(x, z, 0.2) || pondQ(x, z) < 0.98) continue;
    if (Math.abs(x) < 1.8 && z > COMPOUND.z1 && z < ROAD.z) continue;
    const onTour = tourDistance(x, z) < 1.2;
    const p = r();
    if (p < 0.62) plant(pick(tufts), x, z, 0.6 + r() * 0.7, 0.2);
    else if (onTour) continue;
    else if (p < 0.7) plant(pick(ferns), x, z, 0.8 + r() * 0.6);
    else if (p < 0.78) plant(pick(chethi), x, z, 0.9 + r() * 0.6);
    else if (p < 0.83) plant(pick(crotons), x, z, 0.9 + r() * 0.5);
    else if (p < 0.88) plant(hibiscus[0]!, x, z, 0.8 + r() * 0.4);
    else if (p < 0.91) plant(pick(lantanas), x, z, 0.8 + r() * 0.4);
    else if (p < 0.95) plant(pick(gingers), x, z, 0.8 + r() * 0.5);
    else if (!blocked(x, z, 0)) plant(pick(bananas), x, z, 0.9 + r() * 0.3, 0.5);
  }
  // Bushes along the outside of the compound wall
  for (let z = COMPOUND.z0 - 1; z < COMPOUND.z1; z += 1.5 + r() * 2) {
    for (const s of [-1, 1]) if (r() < 0.6) plant(r() < 0.6 ? pick(chethi) : pick(crotons), s * (COMPOUND.x + 1.1), z, 0.9 + r() * 0.5);
  }

  // ---- the town: every yard planted the way people plant them, groves in rows, the paddy
  const farSpacing = new Spacing(8);
  /** Near the temple a full tree; out in the town a tree that turns to a card far from the eye. */
  const townTree = (kind: FarKind, specimen: Specimen, x: number, z: number, scale: number, stiff: number, room: number, yaw = r() * Math.PI * 2) => {
    if (Math.hypot(x, z) < NEAR) return tree(specimen, x, z, scale, stiff, room, yaw);
    if (!spacing.ok(x, z, room) || trailNear(x, z, 6).distance < 3 || ravine(x, z)) return false;
    spacing.put(x, z, room);
    farSpacing.put(x, z, room);
    far.push({ kind, at: [x, heightAt(x, z) - 0.05, z], yaw, scale, specimen });
    return true;
  };
  for (const p of PLOTS) {
    const yardOK = (lx: number, lz: number) => {
      const [x, z] = plotPoint(p, lx, lz);
      return !onRoad(x, z, 1.5) && !onLane(x, z, 1.2) && pondQ(x, z) > 1.1 ? ([x, z] as const) : null;
    };
    const hw = p.w + 2.6;
    // Coconut palms in the corners and along the back, leaning out of the yard
    for (const [lx, lz] of [[-hw + 0.8, p.d + 4.5], [hw - 0.8, -p.d - 1.2], [-hw + 1, -p.d - 1.4], [hw + 2.5, p.d + 2]] as const) {
      if (r() < 0.25) continue;
      const at = yardOK(lx, lz);
      if (at) townTree('palm', pick(palms), at[0], at[1], 0.85 + r() * 0.35, 1, 3, p.yaw + Math.atan2(lx, lz) + (r() - 0.5) * 0.8);
    }
    // A mango or a jack behind the house, an areca or two by the well
    if (r() < 0.75) {
      const at = yardOK((r() - 0.5) * hw, -p.d - 5 - r() * 3);
      const t = yardTree(r());
      if (at) townTree('broad', pick(t.list), at[0], at[1], 0.75 + r() * 0.3, t.stiff, t.room);
    }
    // By the kitchen, a papaya or a drumstick tree, the curry's own
    if (r() < 0.7) {
      const at = yardOK((r() < 0.5 ? -1 : 1) * (hw - 1 - r() * 2), -p.d - 1.5 - r() * 2);
      const near = at && Math.hypot(at[0], at[1]) < NEAR + 40;
      if (at && r() < 0.55) plant(pick(papayas), at[0], at[1], 0.85 + r() * 0.3, 0.9);
      else if (near) plant(pick(drumsticks), at[0], at[1], 0.8 + r() * 0.25, 1.2);
    }
    for (let k = 0; k < 2; k++) {
      const at = yardOK((r() < 0.5 ? -1 : 1) * (hw + 1 + r() * 2), -p.d + r() * p.d * 2);
      if (at) townTree('areca', pick(arecas), at[0], at[1], 0.85 + r() * 0.3, 0.8, 2.4);
    }
    // Bananas down the side, hibiscus and crotons and ixora along the front wall
    for (let k = 0; k < 4; k++) {
      const at = yardOK((r() < 0.5 ? -1 : 1) * (hw - 0.9), -p.d + r() * (p.d * 2 + 3));
      if (at) plant(pick(bananas), at[0], at[1], 0.85 + r() * 0.3, 0.5);
    }
    for (let lx = -hw + 0.6; lx < hw - 0.5; lx += 0.9 + r() * 1.1) {
      if (Math.abs(lx) < 1.8) continue;
      const at = yardOK(lx, p.d + 5.0);
      if (!at) continue;
      const q = r();
      // A shoe-flower hedge as often as not, crotons and chethi between
      plant(q < 0.42 ? hibiscus[0]! : q < 0.66 ? pick(crotons) : q < 0.9 ? pick(chethi) : jasmine[0]!, at[0], at[1], 0.6 + r() * 0.4, 0.3);
    }
    // Grass and ferns at the foot of the wall, outside
    for (let k = 0; k < 14; k++) {
      const a = r() * Math.PI * 2;
      const at = yardOK(Math.cos(a) * (hw + 0.4 + r()), Math.sin(a) * (p.d + 4) + 1.5);
      if (at) plant(r() < 0.7 ? pick(tufts) : pick(ferns), at[0], at[1], 0.6 + r() * 0.6, 0.2);
    }
  }
  for (const t of tulsiSpots) plant(tulsis[0], t[0], t[2], 0.85, 0.4, t[1]);
  // Groves in their rows
  for (const g of GROVES) {
    const kind: FarKind = g.kind === 'coconut' ? 'palm' : g.kind;
    for (const [x, z] of groveTrees(g, r)) {
      if (onRoad(x, z, 1.5) || onLane(x, z, 1.2) || inYard(x, z, 0.5) || pondQ(x, z) < 1.1) continue;
      // A patch felled for replanting, where the hill path looks down over the town
      if (!treeFree(x, z)) continue;
      const specimen = g.kind === 'coconut' ? pick(palms) : g.kind === 'areca' ? pick(arecas) : pick(rubbers);
      if (Math.hypot(x, z) < NEAR) {
        // Trees inside the near ring are full meshes always
        trees.push({ specimen, at: [x, heightAt(x, z) - 0.05, z], yaw: r() * Math.PI * 2, scale: 0.9 + r() * 0.25, stiff: g.kind === 'rubber' ? 2 : 1 });
        spacing.put(x, z, 2);
      } else {
        far.push({ kind, at: [x, heightAt(x, z) - 0.05, z], yaw: r() * Math.PI * 2, scale: 0.9 + r() * 0.25, specimen });
        spacing.put(x, z, 2);
        farSpacing.put(x, z, 2);
      }
      if (g.kind !== 'coconut' && r() < 0.5) plant(r() < 0.6 ? pick(ferns) : pick(tufts), x + (r() - 0.5) * 2, z + (r() - 0.5) * 2, 0.7 + r() * 0.5, 0.2);
    }
  }
  // Coconut palms along the paddy's bunds and round its edge
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const q = 0.97 + r() * 0.12;
    const x = PADDY.x + Math.cos(a) * PADDY.rx * q;
    const z = PADDY.z + Math.sin(a) * PADDY.rz * q;
    if (onRoad(x, z, 2) || !farSpacing.ok(x, z, 4)) continue;
    farSpacing.put(x, z, 4);
    far.push({ kind: 'palm', at: [x, heightAt(x, z) - 0.05, z], yaw: r() * 6.3, scale: 0.9 + r() * 0.35 });
  }

  // ---- the forest along the path up the hill: big trees well apart, as in old forest, their
  // crowns meeting over the path further in; ferns and shrubs crowding its edges. A seed of its
  // own, so the town's planting stays as it was.
  {
    const f = rng(77 + seed - 5);
    const pickF = <T,>(list: T[]) => list[Math.floor(f() * list.length)]!;
    // Lower down, moist deciduous forest: teak, irul, silk cotton, an old rubber estate gone
    // wild, cashew at its edge; higher up, evergreen: maruthu, wild fig, ezhilampala, wild mango
    // and the odd jack
    const wild = (deep: number) => [
      { w: 0.2 - deep * 0.12, list: teaks, kind: 'broad' as FarKind },
      { w: 0.16 - deep * 0.06, list: iruls, kind: 'broad' as FarKind },
      { w: 0.07, list: silks, kind: 'broad' as FarKind },
      { w: 0.1 - deep * 0.07, list: rubbers, kind: 'rubber' as FarKind },
      { w: 0.05 - deep * 0.05, list: cashews, kind: 'broad' as FarKind },
      { w: 0.1 + deep * 0.12, list: laurels, kind: 'broad' as FarKind },
      { w: 0.06 + deep * 0.06, list: figs, kind: 'broad' as FarKind },
      { w: 0.07 + deep * 0.06, list: alstonias, kind: 'broad' as FarKind },
      { w: 0.12 + deep * 0.04, list: mangos, kind: 'broad' as FarKind },
      { w: 0.05 + deep * 0.02, list: jacks, kind: 'broad' as FarKind },
    ];
    const wildTree = (q: number, deep: number) => {
      const list = wild(deep);
      const total = list.reduce((n, t) => n + t.w, 0);
      let acc = 0;
      for (const t of list) if (q * total < (acc += t.w)) return t;
      return list[0]!;
    };
    const forestSpacing = new Spacing(8);
    /** A fixed share of the tree spots by the lower path go to bamboo, without a draw from `f`. */
    const bambooHere = (x: number, z: number, along: number) => ((((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) + 1) % 1) < (along < 480 ? 0.22 : 0.07);
    for (let i = 0; i < 40000; i++) {
      // Scattered near the path, thinning out to 46 m either side
      const along = f() * 1030;
      const at = trailAtLocal(along);
      const side = (f() < 0.5 ? -1 : 1) * (2.6 + Math.pow(f(), 1.4) * 44);
      const x = at.x + Math.cos(at.heading) * side + (f() - 0.5) * 3;
      const z = at.z - Math.sin(at.heading) * side + (f() - 0.5) * 3;
      const deepish = Math.min(1, Math.max(0, (along - 50) / 120));
      const keep = f();
      const room = 4.8 + f() * 2.0;
      if (deepish <= 0 || keep > deepish || !forestSpacing.ok(x, z, room)) continue;
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < 22 || pondQ(x, z) < 1.2) continue;
      // Where the path doubles back, a tree set beside one stretch may stand on another
      if (trailNear(x, z, 4).distance < 3.2 || inYard(x, z, 2) || ravine(x, z)) continue;
      forestSpacing.put(x, z, room);
      farSpacing.put(x, z, room);
      const t = wildTree(f(), Math.min(1, Math.max(0, (along - 380) / 300)));
      const bamboo = bambooHere(x, z, along);
      const yaw = f() * Math.PI * 2;
      const scale = 1.1 + f() * 0.3;
      if (bamboo) far.push({ kind: 'areca', at: [x, heightAt(x, z) - 0.05, z], yaw, scale: scale * 0.8, specimen: pickF(bamboos) });
      else far.push({ kind: t.kind, at: [x, heightAt(x, z) - 0.1, z], yaw, scale, specimen: pickF(t.list) });
    }
    // The undergrowth: thick along the path's edges, sparse between the trunks
    for (let i = 0; i < 20000; i++) {
      const along = 40 + f() * 990;
      const at = trailAtLocal(along);
      const side = (f() < 0.5 ? -1 : 1) * (1.9 + Math.pow(f(), 1.6) * 22);
      const x = at.x + Math.cos(at.heading) * side;
      const z = at.z - Math.sin(at.heading) * side;
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < 9) continue;
      if (trailNear(x, z, 3).distance < 1.75 || pondQ(x, z) < 1.1) continue;
      // Lantana and communist pacha crowd the path's open edges; ferns, wild ginger and cane the shade
      const k = f();
      const edge = Math.abs(side) < 6;
      const specimen = k < 0.4 ? pickF(ferns) : k < 0.58 ? (edge ? pickF(lantanas) : pickF(ferns)) : k < 0.68 ? (edge ? pickF(chromolaenas) : pickF(lantanas)) : k < 0.76 ? pickF(gingers) : k < 0.78 ? pickF(rattans) : pick(tufts);
      plant(specimen, x, z, 0.7 + f() * 0.8, 0.3);
    }
    // Bamboo: thickets of it crowding the path in the lower forest, clumps between the trees above
    const bambooSpacing = new Spacing(6);
    for (let i = 0; i < 4000; i++) {
      const along = 60 + f() * 900;
      const at = trailAtLocal(along);
      const side = (f() < 0.5 ? -1 : 1) * (3.2 + Math.pow(f(), 1.3) * 30);
      const x = at.x + Math.cos(at.heading) * side;
      const z = at.z - Math.sin(at.heading) * side;
      const thick = along < 480 ? 0.55 : 0.25;
      if (f() > thick || !bambooSpacing.ok(x, z, 4.5) || !forestSpacing.ok(x, z, 2.5)) continue;
      if (trailNear(x, z, 4).distance < 3 || ravine(x, z) || inYard(x, z, 2) || pondQ(x, z) < 1.2) continue;
      bambooSpacing.put(x, z, 4.5);
      forestSpacing.put(x, z, 2.5);
      far.push({ kind: 'areca', at: [x, heightAt(x, z) - 0.05, z], yaw: f() * Math.PI * 2, scale: 0.85 + f() * 0.3, specimen: pickF(bamboos) });
    }
  }

  // ---- by the water: screwpine leaning out over the river and the brooks, wild plantain and
  // cane in the wet ground beside them. A seed of their own, so nothing else moves.
  {
    const w = rng(91 + seed - 5);
    const pickW = <T,>(list: T[]) => list[Math.floor(w() * list.length)]!;
    const wetEdge = (x: number, z: number) => {
      const k = w();
      if (k < 0.4) plant(pickW(screwpines), x, z, 0.85 + w() * 0.4, 0.6);
      else if (k < 0.65) plant(pickW(bananas), x, z, 1.1 + w() * 0.3, 0.5);
      else if (k < 0.8) plant(pickW(rattans), x, z, 0.9 + w() * 0.4, 0.4);
      else plant(pickW(gingers), x, z, 0.9 + w() * 0.4, 0.3);
    };
    for (let s = -RIVER.length + 10; s < RIVER.length - 10; s += 5 + w() * 6) {
      for (const side of [-1, 1]) {
        if (w() < 0.45) continue;
        const [x, z] = riverPoint(s, side * (WATER_HALF + 0.7 + w() * 1.6));
        wetEdge(x, z);
      }
    }
    for (const br of BROOKS) {
      for (let i = 2; i + 1 < br.pts.length; i += 2 + Math.floor(w() * 2)) {
        const [ax, az] = br.pts[i]!;
        const [bx, bz] = br.pts[i + 1]!;
        const l = Math.hypot(bx - ax, bz - az) || 1;
        const side = w() < 0.5 ? -1 : 1;
        const o = 1.7 + w() * 2;
        wetEdge(ax - ((bz - az) / l) * o * side, az + ((bx - ax) / l) * o * side);
      }
    }
  }

  // ---- beyond: the woods as cards over the hills, out to the horizon, palms round the town
  // giving way to the forest on the far hills
  for (let i = 0; i < 70000 && far.length < 14000; i++) {
    const a = r() * Math.PI * 2;
    const d = NEAR + Math.sqrt(r()) * (FAR - NEAR);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    // Cheapest tests first (all pure, none draws from `r`, so the order keeps the layout)
    if (onRoad(x, z, 2.5) || pondQ(x, z) < 1.1 || inPaddy(x, z, 1) || Math.hypot(x - CLEARING.x, z - CLEARING.z) < 26) continue;
    if (onLane(x, z, 1.5) || groveAt(x, z, 2) || inYard(x, z, 1)) continue;
    if (homes.some((h) => Math.hypot(h[0] - x, h[2] - z) < 7) || trailNear(x, z, 12).distance < 12 || ravine(x, z)) continue;
    const forest = Math.min(Math.max((d - 150) / 90, 0), 1);
    const palm = r() < 0.62 - forest * 0.5;
    const kind: FarKind = palm ? 'palm' : forest < 0.5 && r() < 0.12 ? 'areca' : 'broad';
    const room = palm ? 4.2 : kind === 'areca' ? 3 : 6.5 - forest * 1.5;
    if (!farSpacing.ok(x, z, room) || !spacing.ok(x, z, 3)) continue;
    farSpacing.put(x, z, room);
    far.push({ kind, at: [x, heightAt(x, z) - 0.1, z], yaw: r() * Math.PI * 2, scale: (kind === 'broad' ? 0.9 + forest * 0.35 : 0.9) + r() * 0.4 });
  }

  // A shade of its own for every tree and plant, from a seed of its own
  const t = rng(13);
  for (const list of [trees, plants, far]) for (const p of list) p.tint = tintOf(t, list === plants ? 0.7 : 1);
  const density = options.density ?? VEGETATION.density;
  if (density < 1) return { trees: trees.filter(p => inPlantingDensity(p.at, density)), plants: plants.filter(p => inPlantingDensity(p.at, density)), far: far.filter(p => inPlantingDensity(p.at, density)), walked: tourDistance };
  return { trees, plants, far, walked: tourDistance };
}
