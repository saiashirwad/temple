import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('Box3D owns its exported type names, while the lint rule checks our local names', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'temple-box3d-lint-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'colliders.ts');

  writeFileSync(file, `import type * as SDK from 'box3d.js';
import type { b3ShapeId as ColliderId } from 'box3d.js';

export type Collider = ColliderId | SDK.b3ShapeId;

export const localShape = 0;
`);

  const run = spawnSync(process.execPath, ['node_modules/oxlint/bin/oxlint', '-c', '.oxlintrc.json', '-f', 'unix', file], { encoding: 'utf8' });

  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /Rename symbol "localShape"/);
  assert.doesNotMatch(run.stdout, /Rename symbol "b3ShapeId"/);
});
