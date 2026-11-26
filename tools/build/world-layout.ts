import { gzipSync } from 'node:zlib';
import { plansClear } from '../../src/content/npc-plans.ts';
import { buildStreet } from '../../src/world/town/street.ts';
import { buildTemple } from '../../src/world/town/temple.ts';
import { buildGrounds } from '../../src/world/town/grounds.ts';
import { buildVillage } from '../../src/world/town/village.ts';
import { landMap } from '../../src/world/town/town.ts';
import { FAR_KINDS, plantAll, type Planted, type FarTree } from '../../src/world/vegetation/planting.ts';
import { meadowPlaces } from '../../src/world/vegetation/meadow.ts';
import { CATALOG, GRASS_LENGTHS, GRASS_WORDS, HEADER_WORDS, LAYOUT_VERSION, PLANT_WORDS, type WorldLayout } from '../../src/world/layout.ts';

export function encodeWorldLayout({ plans, planted, grassAt, land }: WorldLayout) {
  const { trees, plants, far } = planted;
  const planBytes = new TextEncoder().encode(JSON.stringify(plans));
  const header = new Uint32Array([LAYOUT_VERSION, trees.length, plants.length, far.length, grassAt.length, land.width, land.height, planBytes.byteLength]);
  const rowWords = (trees.length + plants.length + far.length) * PLANT_WORDS + grassAt.length * GRASS_WORDS;
  const buffer = new ArrayBuffer((HEADER_WORDS + rowWords) * 4 + land.pixels.byteLength + planBytes.byteLength);
  new Uint32Array(buffer, 0, HEADER_WORDS).set(header);
  const rows = new Float32Array(rowWords);
  const ids = new Map(CATALOG.map((s, i) => [s, i]));
  let i = 0;
  const plant = (p: Planted | FarTree, kindOrStiffness: number) => {
    rows.set(p.at, i); i += 3;
    rows[i++] = p.yaw;
    rows[i++] = p.scale;
    rows.set(p.tint ?? [1, 1, 1], i); i += 3;
    rows[i++] = p.specimen ? ids.get(p.specimen)! : -1;
    rows[i++] = kindOrStiffness;
  };
  for (const p of trees) plant(p, p.stiff);
  for (const p of plants) plant(p, p.stiff);
  for (const p of far) plant(p, FAR_KINDS.indexOf(p.kind));
  for (const p of grassAt) {
    rows.set(p.at, i); i += 3;
    rows[i++] = p.yaw;
    rows[i++] = p.scale;
    rows[i++] = GRASS_LENGTHS.indexOf(p.length);
  }
  const raw = new Uint8Array(rows.buffer);
  const stored = new Uint8Array(buffer, HEADER_WORDS * 4, raw.length);
  let block = 0;
  function storeRows(count: number, stride: number) {
    let dest = block;
    for (let byte = 0; byte < stride; byte++) {
      for (let row = 0; row < count; row++) stored[dest++] = raw[block + row * stride + byte];
    }
    block = dest;
  }
  storeRows(trees.length + plants.length + far.length, PLANT_WORDS * 4);
  storeRows(grassAt.length, GRASS_WORDS * 4);
  new Uint8Array(buffer, (HEADER_WORDS + rowWords) * 4).set(land.pixels);
  new Uint8Array(buffer, buffer.byteLength - planBytes.byteLength).set(planBytes);
  return buffer;
}

/** Bake the world from the same authored generators the workbench edits. */
export function bakeWorldLayout(level = 9) {
  const grounds = buildGrounds(), village = buildVillage(), land = landMap();
  const planted = plantAll(village.homes, grounds.gaps, village.tulsi);
  const solids = [...buildTemple().solids, ...grounds.solids, ...buildStreet().solids, ...village.solids];
  const plans = plansClear(village.tulsi, village.seats, solids);
  const grassAt = meadowPlaces(land.pixels, planted.walked);
  return gzipSync(new Uint8Array(encodeWorldLayout({ plans, planted, grassAt, land })), { level });
}
