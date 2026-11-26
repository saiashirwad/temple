import { FAR_KINDS, tourDistance, type Planted, type FarTree, type plantAll } from './vegetation/planting.ts';
import { specimens } from './vegetation/specimens.ts';
import type { meadowPlaces } from './vegetation/meadow.ts';
import type { Plan } from '../content/npc-plans.ts';
import type { landMap } from './town/town.ts';

export interface WorldLayout {
  plans: Plan[];
  planted: ReturnType<typeof plantAll>;
  grassAt: ReturnType<typeof meadowPlaces>;
  land: ReturnType<typeof landMap>;
}

// Header: version, tree/plant/far/meadow counts, land-map width and height, JSON plan byte count.
// Plant rows: x, y, z, yaw, scale, three tint channels, specimen index, stiffness (or far kind).
// Meadow rows: x, y, z, yaw, scale, length index. Each matrix stores matching bytes
// from each row together for gzip. RGBA soil bytes and UTF-8 NPC plans follow.
export const LAYOUT_VERSION = 1;
export const PLANT_WORDS = 10;
export const GRASS_WORDS = 6;
export const HEADER_WORDS = 8;
export const GRASS_LENGTHS = ['short', 'mid', 'tall'] as const;
export const CATALOG = Object.values(specimens).flat();

export function decodeWorldLayout(buffer: ArrayBuffer): WorldLayout {
  const [version, treesCount, plantsCount, farCount, grassCount, width, height, planBytes] = new Uint32Array(buffer, 0, HEADER_WORDS);
  const landOffset = 4 * (HEADER_WORDS + PLANT_WORDS * (treesCount + plantsCount + farCount) + GRASS_WORDS * grassCount);
  const planOffset = landOffset + width * height * 4;
  if (version !== LAYOUT_VERSION || planOffset + planBytes !== buffer.byteLength) {
    throw new Error('Invalid baked world layout');
  }

  const rows = new Float32Array(landOffset / 4 - HEADER_WORDS);
  const output = new Uint8Array(rows.buffer);
  const stored = new Uint8Array(buffer, HEADER_WORDS * 4, output.length);
  let block = 0;
  function restoreRows(count: number, stride: number) {
    let src = block;
    for (let byte = 0; byte < stride; byte++) {
      for (let row = 0; row < count; row++) output[block + row * stride + byte] = stored[src++];
    }
    block = src;
  }
  restoreRows(treesCount + plantsCount + farCount, PLANT_WORDS * 4);
  restoreRows(grassCount, GRASS_WORDS * 4);
  let i = 0;
  const vector = (): [number, number, number] => [rows[i++], rows[i++], rows[i++]];
  const pose = () => ({ at: vector(), yaw: rows[i++], scale: rows[i++], tint: vector() });
  function plant(): Planted {
    const transform = pose();
    return { ...transform, specimen: CATALOG[rows[i++]], stiff: rows[i++] };
  }
  const trees = Array.from({ length: treesCount }, plant);
  const plants = Array.from({ length: plantsCount }, plant);
  const far = Array.from({ length: farCount }, (): FarTree => {
    const transform = pose();
    const id = rows[i++];
    return { ...transform, specimen: id < 0 ? undefined : CATALOG[id], kind: FAR_KINDS[rows[i++]] };
  });
  const grassAt = Array.from({ length: grassCount }, (): WorldLayout['grassAt'][number] => {
    return { at: vector(), yaw: rows[i++], scale: rows[i++], length: GRASS_LENGTHS[rows[i++]] };
  });
  const plans: Plan[] = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, planOffset)));
  return { plans, planted: { trees, plants, far, walked: tourDistance }, grassAt, land: { width, height, pixels: new Uint8Array(buffer, landOffset, width * height * 4) } };
}

export async function loadWorldLayout(url: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Could not load world layout (${response.status})`);
  const bytes = response.body.pipeThrough(new DecompressionStream('gzip'));
  return decodeWorldLayout(await new Response(bytes).arrayBuffer());
}
