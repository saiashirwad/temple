// One CPU job shared by every game launch. Transfer the finished vertex arrays into the renderer.
import { specimens } from '../world/vegetation/specimens.ts';

const models = Object.values(specimens).flat().map(specimen => [specimen.id, specimen.build()] as const);

const buffers = new Set<ArrayBuffer>();

for (const [, model] of models) {
  for (const mesh of model.meshes) {
    for (const array of [mesh.positions, mesh.normals, mesh.uvs, mesh.indices, ...Object.values(mesh.extra ?? {})]) {
      if (array?.buffer instanceof ArrayBuffer) buffers.add(array.buffer);
    }
  }
}

self.postMessage(models, { transfer: [...buffers] });
