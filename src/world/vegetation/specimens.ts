import { Builder, rng } from '../../render/geo.ts';
import { bambooClump } from '../trail/jungle.ts';
import { arecaPalm, banyan, broadleaf, coconutPalm, rubberTree } from './trees.ts';
import { banana, chromolaena, croton, fern, floweringShrub, ginger, grassTuft, lantana, PL, rattan, tulsi } from './plants.ts';
import { alstonia, cashew, drumstick, fig, gulmohar, irul, laurel, papaya, screwpine, silkCotton, tamarind, teak } from './trees2.ts';

/** Layouts keep these small descriptors. Only a renderer or inspector builds geometry. */
function variants(path: string, count: number, seed: number, draw: (b: Builder, r: () => number, variant: number) => void, merged = true) {
  return Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? path : `${path}/${i + 1}`,
    species: path.split('/')[1]!,
    seed: seed + i,
    build(usingSeed = seed + i) {
      const b = new Builder(merged);
      draw(b, rng(usingSeed), i);

      return b.model();
    },
  }));
}

export type Specimen = ReturnType<typeof variants>[number];

export const specimens = {
  palms: variants('tree/coconut', 6, 5, (b, r, i) => coconutPalm(b, r, 9 + i * 1.3, 0), false),
  arecas: variants('tree/areca', 3, 12, (b, r, i) => arecaPalm(b, r, 9 + i * 1.8)),
  mangos: variants('tree/mango', 2, 19, (b, r, i) => broadleaf(b, r, 1.05 + i * 0.3, 'mango'), false),
  jacks: variants('tree/jack', 2, 26, (b, r, i) => broadleaf(b, r, 0.95 + i * 0.25, 'jack')),
  banyans: variants('tree/banyan', 1, 33, (b, r) => banyan(b, r)),
  rubbers: variants('tree/rubber', 2, 40, (b, r, i) => rubberTree(b, r, 1 + i * 0.15)),
  tufts: variants('plant/tuft', 4, 47, (b, r, i) => grassTuft(b, r, 0.3 + i * 0.12)),
  ferns: variants('plant/fern', 2, 54, (b, r) => fern(b, r)),
  chethi: variants('plant/chethi', 2, 61, (b, r, i) => floweringShrub(b, r, 0.9 + i * 0.4, PL.ixora, 26, 0.06)),
  hibiscus: variants('plant/hibiscus', 1, 68, (b, r) => floweringShrub(b, r, 1.9, PL.hibiscus, 18, 0.07)),
  jasmine: variants('plant/jasmine', 1, 75, (b, r) => floweringShrub(b, r, 1.2, PL.jasmine, 40, 0.04)),
  crotons: variants('plant/croton', 2, 82, (b, r) => croton(b, r)),
  bananas: variants('plant/banana', 3, 89, (b, r, i) => banana(b, r, i === 0)),
  tulsis: variants('plant/tulsi', 1, 96, (b, r) => tulsi(b, r)),
  teaks: variants('tree/teak', 2, 31, (b, r, i) => teak(b, r, 0.95 + i * 0.2)),
  laurels: variants('tree/laurel', 2, 33, (b, r, i) => laurel(b, r, 0.95 + i * 0.15)),
  iruls: variants('tree/irul', 2, 35, (b, r, i) => irul(b, r, 0.95 + i * 0.2)),
  figs: variants('tree/fig', 1, 37, (b, r) => fig(b, r, 1)),
  peepals: variants('tree/peepal', 1, 38, (b, r) => fig(b, r, 1, true)),
  silks: variants('tree/silk-cotton', 1, 39, (b, r) => silkCotton(b, r, 1)),
  alstonias: variants('tree/alstonia', 1, 40, (b, r) => alstonia(b, r, 1)),
  cashews: variants('tree/cashew', 1, 41, (b, r) => cashew(b, r, 1)),
  tamarinds: variants('tree/tamarind', 1, 42, (b, r) => tamarind(b, r, 1)),
  gulmohars: variants('tree/gulmohar', 1, 43, (b, r) => gulmohar(b, r, 1)),
  drumsticks: variants('tree/drumstick', 1, 44, (b, r) => drumstick(b, r, 1)),
  papayas: variants('tree/papaya', 2, 45, (b, r, i) => papaya(b, r, 0.9 + i * 0.2)),
  screwpines: variants('tree/screwpine', 2, 47, (b, r, i) => screwpine(b, r, 0.9 + i * 0.25)),
  lantanas: variants('plant/lantana', 2, 49, (b, r, i) => lantana(b, r, 0.9 + i * 0.4)),
  chromolaenas: variants('plant/chromolaena', 1, 51, (b, r) => chromolaena(b, r, 1)),
  gingers: variants('plant/ginger', 2, 52, (b, r, i) => ginger(b, r, 1, i === 1)),
  rattans: variants('plant/rattan', 1, 54, (b, r) => rattan(b, r, 1)),
  bamboos: variants('tree/bamboo', 3, 61, (b, r) => bambooClump(b, r, 1)),
  arecaAtlas: variants('tree/areca-atlas', 1, 71, (b, r) => arecaPalm(b, r, 11), false),
  rubberAtlas: variants('tree/rubber-atlas', 1, 72, (b, r) => rubberTree(b, r, 1.05), false),
};

export const farSpecimens = {
  palm: specimens.palms[3], broad: specimens.mangos[1],
  areca: specimens.arecaAtlas[0], rubber: specimens.rubberAtlas[0],
};
