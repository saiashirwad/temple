import { buildTown } from './build.ts';

const town = buildTown();
const buffers = new Set<ArrayBuffer>();

for (const model of [town.buildings, town.flames]) for (const mesh of model.meshes) {
  for (const array of [mesh.positions, mesh.normals, mesh.indices, mesh.uvs, ...Object.values(mesh.extra ?? {})]) {
    if (array?.buffer instanceof ArrayBuffer) buffers.add(array.buffer);
  }
}

self.postMessage(town, { transfer: [...buffers] });
