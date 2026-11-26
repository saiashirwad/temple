// What's underfoot at a point, for the sound of a step: the road's tar, the temple's sand, the
// gravel of lanes and yards, grass, the forest's dry leaves, the trail's packed earth, the
// bridge's planks, raised floors (machans, the bungalow's veranda) and the river's shallows.
import { onBridge } from './trail/bridge.ts';
import { inRiver } from './trail/river.ts';
import { heightAt, onRoad } from './terrain.ts';
import { inYard, onLane } from './town/town.ts';
import { trailNear } from './trail/trail.ts';
import { COMPOUND } from '../content/world.ts';

export type Surface = 'dirt' | 'leaves' | 'gravel' | 'grass' | 'wood' | 'stone' | 'wet';

/** Beyond this distance from the temple you're in the forest, where the ground is leaf litter. */
const FOREST = 150;

/**
 * The surface at x, z for feet at height `y` (eye height minus the body, or the walker's feet).
 * Cheap enough for every step.
 */
export function surfaceAt(x: number, z: number, y = heightAt(x, z)): Surface {
  // Feet well above the land: planks of a raised floor or the bridge
  if (onBridge(x, z, 0.2) || y - heightAt(x, z) > 0.6) return 'wood';

  if (inRiver(x, z, 0.3)) return 'wet';

  // Tar sounds like stone under a sandal: hard and dry
  if (onRoad(x, z, -0.3)) return 'stone';

  // The temple's sand court, and its stone path up from the gate
  if (Math.abs(x) < COMPOUND.x && z > COMPOUND.z0 && z < COMPOUND.z1) return Math.abs(x) < 1.6 ? 'stone' : 'dirt';

  if (onLane(x, z, 0) || inYard(x, z, 0) || (Math.abs(x) < 2.2 && z > COMPOUND.z1 && z < 27)) return 'gravel';

  if (Math.hypot(x, z) > FOREST - 30) {
    const near = trailNear(x, z, 4);

    // The trail is beaten earth; off it, the forest floor is all dry leaves
    if (near.distance < 1.4) return 'dirt';

    if (Math.hypot(x, z) > FOREST) return 'leaves';
  }

  return 'grass';
}
