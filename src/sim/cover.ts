// Places to hide from what hunts you, and places it won't follow: rocks and big trunks out in
// the forest, the machans' platforms, the shrines' lamps. Pure: built once from the planted world.
import { ROCKS, SHRINES } from '../world/trail/jungle.ts';
import { onMachan } from '../world/trail/machan.ts';

type V3 = [number, number, number];

/** Cover is only counted this far out of town. */
const FOREST_R = 90;
/** Cover cells are this many metres a side. */
const CELL = 6;
const key = (i: number, j: number) => i * 4099 + j;

export interface Cover {
  /** Whether x, z is in cover a crouching person could hide in. */
  inCover(x: number, z: number): boolean;
  /** Whether x, z is up on a machan, for feet at height `foot`. */
  aloft(x: number, z: number, foot: number): boolean;
  /** Whether x, z is by a shrine's lamp. */
  atShrine(x: number, z: number): boolean;
}

export function createCover(trees: readonly { at: V3; scale: number; trunk: number }[], plants: readonly { at: V3; scale: number }[]): Cover {
  const cells = new Map<number, [number, number, number][]>();
  const add = (x: number, z: number, r: number) => {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let list = cells.get(k);
    if (!list) cells.set(k, (list = []));
    list.push([x, z, r]);
  };
  for (const k of ROCKS) if (k.r > 0.45) add(k.x, k.z, k.r + 1.2);
  for (const t of trees) if (t.trunk > 0.14 && Math.hypot(t.at[0], t.at[2]) > FOREST_R) add(t.at[0], t.at[2], t.trunk * t.scale + 1.3);
  for (const pl of plants) if (pl.scale > 0.9 && Math.hypot(pl.at[0], pl.at[2]) > FOREST_R) add(pl.at[0], pl.at[2], 1.1);
  return {
    inCover(x, z) {
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const list = cells.get(key(cx + i, cz + j));
          if (list) for (const c of list) if (Math.hypot(x - c[0], z - c[1]) < c[2]) return true;
        }
      return false;
    },
    aloft: (x, z, foot) => onMachan(x, z, foot) !== null,
    atShrine: (x, z) => SHRINES.some((sh) => Math.hypot(x - sh.x, z - sh.z) < 7),
  };
}
