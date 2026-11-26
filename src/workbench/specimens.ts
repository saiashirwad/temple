// The same tree builders used by the world, with a separately chosen random seed.
import { Builder, rng } from '../render/geo.ts';
import { arecaPalm, banyan, broadleaf, coconutPalm, rubberTree } from '../world/vegetation/trees.ts';
import { alstonia, cashew, drumstick, fig, gulmohar, irul, laurel, papaya, screwpine, silkCotton, tamarind, teak } from '../world/vegetation/trees2.ts';

export const TREE_NAMES = ['coconut', 'areca', 'mango', 'jack', 'banyan', 'rubber', 'teak', 'laurel', 'irul', 'fig', 'peepal', 'silk cotton', 'alstonia', 'cashew', 'tamarind', 'gulmohar', 'drumstick', 'papaya', 'screwpine'] as const;
export function treeSpecimen(name: string, seed: number) {
  const b = new Builder(false), r = rng(seed);
  switch (name) {
    case 'coconut': coconutPalm(b, r, 10, 0); break;
    case 'areca': arecaPalm(b, r, 10); break;
    case 'mango': case 'jack': broadleaf(b, r, 1, name); break;
    case 'banyan': banyan(b, r); break;
    case 'rubber': rubberTree(b, r, 1); break;
    case 'teak': teak(b, r, 1); break;
    case 'laurel': laurel(b, r, 1); break;
    case 'irul': irul(b, r, 1); break;
    case 'fig': case 'peepal': fig(b, r, 1, name === 'peepal'); break;
    case 'silk cotton': silkCotton(b, r, 1); break;
    case 'alstonia': alstonia(b, r, 1); break;
    case 'cashew': cashew(b, r, 1); break;
    case 'tamarind': tamarind(b, r, 1); break;
    case 'gulmohar': gulmohar(b, r, 1); break;
    case 'drumstick': drumstick(b, r, 1); break;
    case 'papaya': papaya(b, r, 1); break;
    case 'screwpine': screwpine(b, r, 1); break;
    default: throw new Error(`Unknown tree ${name}`);
  }
  return b.model();
}
