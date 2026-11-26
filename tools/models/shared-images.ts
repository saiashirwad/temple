import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Format, type Document, type NodeIO } from '@gltf-transform/core';

/** Variants of a scan keep their geometry separate and share the unchanged, encoded maps. */
export async function writeSharedModel(io: NodeIO, doc: Document, folder: string, name: string) {
  for (const texture of doc.getRoot().listTextures()) {
    const hash = createHash('sha256').update(texture.getImage()!).digest('hex').slice(0, 24);
    texture.setURI(`shared/${hash}.webp`);
  }

  const { json, resources } = await io.writeJSON(doc, { format: Format.GLTF, basename: name });

  for (const [uri, bytes] of Object.entries(resources)) {
    const path = join(folder, uri);
    await mkdir(dirname(path), { recursive: true });
    const pending = path + '.' + process.pid;
    await writeFile(pending, bytes);
    await rename(pending, path);
  }

  // Publish the model only after every URI it names is on disk.
  const path = join(folder, name + '.gltf');
  await writeFile(path + '.' + process.pid, JSON.stringify(json, null, 2) + '\n');
  await rename(path + '.' + process.pid, path);
}
