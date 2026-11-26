// Fails if test-only edits were left in the code: TEMP_ markers, debugger, a hard-wired test
// spot, or a debug switch turned on in code instead of through boot.ts.
import { readdirSync, readFileSync } from 'node:fs';

const rules = [
  [/TEMP_/, 'a TEMP_ marker'],
  [/\bdebugger\b/, 'debugger'],
  [/\bconst (PROFILE|PROBE_STAGES|LINEUP|PARK|TEST_WOLVES)\s*=\s*true/, 'a debug flag on in code'],
  [/\bconst (WALK_TEST|TEST_AT)\b/, 'a hand-set test (use a scenario in scenarios.ts)'],
  [/\bconst coarse\s*=\s*true/, 'touch layout forced (use ?phone or the `c chord)'],
  [/danger\.update\(.*'held'/, 'danger running while held'],
];
let bad = 0;
for (const dir of ['src', 'tests']) {
  for (const f of readdirSync(dir, { recursive: true })) {
    if (!f.endsWith('.ts') || f.endsWith('.gen.ts')) continue;
    if (f.split('/').at(-1).startsWith('_')) {
      console.error(`${dir}/${f}: a scratch file (starts with _)`);
      bad++;
      continue;
    }
    readFileSync(`${dir}/${f}`, 'utf8').split('\n').forEach((line, i) => {
      for (const [re, what] of rules)
        if (re.test(line)) {
          console.error(`${dir}/${f}:${i + 1}: ${what}\n    ${line.trim()}`);
          bad++;
        }
    });
  }
}
if (bad) process.exit(1);
console.log('no leftovers');
