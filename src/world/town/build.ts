// Build the immutable town once. Keep merged vertex arrays and the gameplay data used on the main thread.
import { mergeModels, P } from '../../render/geo.ts';
import { buildPond } from './pond.ts';
import { footprints } from '../../sim/routes.ts';
import { buildGrounds } from './grounds.ts';
import { buildStreet } from './street.ts';
import { buildTemple } from './temple.ts';
import { buildVillage } from './village.ts';

export function buildTown() {
  const temple = buildTemple(), grounds = buildGrounds(), street = buildStreet(), village = buildVillage();
  const models = [temple.model, grounds.model, street.model, village.model, buildPond()];
  const solids = [...temple.solids, ...grounds.solids, ...street.solids, ...village.solids];
  const meshes = models.flatMap(m => m.meshes);
  const isFlame = (mesh: typeof meshes[number]) => Math.round(mesh.extra?.pat?.[0] ?? 0) === P.FLAME;
  return {
    buildings: mergeModels([{ meshes: meshes.filter(m => !isFlame(m)), images: [] }]),
    flames: mergeModels([{ meshes: meshes.filter(isFlame), images: [] }]),
    placed: [...street.props, ...grounds.props, ...village.props],
    solids, feet: footprints(solids),
    lamps: [...temple.lamps, ...grounds.lamps, ...street.lamps, ...village.lamps],
    streetLights: street.lamps.filter(l => l.spot).map(l => l.position),
    village: { homes: village.homes, tulsi: village.tulsi, seats: village.seats, chimneys: village.chimneys },
  };
}
