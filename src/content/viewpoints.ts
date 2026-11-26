import { NOTE_AT } from '../world/trail/bungalow.ts';

/** x, z, yaw, pitch, eye height above the ground. Yaw π faces +z, 0 faces -z. */
export type Spot = readonly [number, number, number, number, number];

export const SPOTS: Record<string, { name: string; shot: string; at: Spot }> = {
  '1': { shot: 'town', name: 'town view', at: [122.8, -128.1, 2.41, 0.06, 1.62] },
  '2': { shot: 'bridge-path', name: 'path before the bridge', at: [-160.5, -113.5, 1.55, 0.18, 1.62] },
  '3': { shot: 'bridge', name: 'bridge', at: [-169.73, -108.86, 0.981, 0.22, 1.62] },
  '4': { shot: 'dung', name: 'dung by the path', at: [-69.66, -139.88, 2.458, 0.45, 1.62] },
  '5': { shot: 'machan', name: 'machan stair', at: [-17.44, -159.78, 0.421, 0.1, 3.8] },
  '6': { shot: 'herd-glade', name: 'herd glade', at: [-114.55, -258.42, -2.05, 0.08, 1.62] },
  '7': { shot: 'herd-close', name: 'herd glade, close', at: [-110.2, -256.1, -2.05, 0.12, 1.62] },
  '8': { shot: 'veranda', name: 'veranda, the note', at: [NOTE_AT.x, NOTE_AT.z + 1.2, 0.186, 0.75, 3.5] },
  '9': { shot: 'chair', name: 'his chair, looking out', at: [20.61, -396.33, 2.792, 0.07, 2.63] },
};
