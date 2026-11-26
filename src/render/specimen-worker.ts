// One CPU job shared by every game launch. Transfer the finished vertex arrays into the renderer.
import { specimens } from '../world/vegetation/specimens.ts';

const models = Object.values(specimens).flat().map(specimen => [specimen.id, specimen.build()] as const);
const buffers = models.flatMap(([, model]) => model.meshes.flatMap(mesh =>
  [mesh.positions, mesh.normals, mesh.uvs, mesh.indices, mesh.extra!.pat!, mesh.extra!.col!].map(array => array.buffer as ArrayBuffer),
));
self.postMessage(models, { transfer: buffers });
