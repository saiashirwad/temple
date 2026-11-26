You are now a WRITER (bash/edit/write enabled), working in /home/bashtv/temple at the same time as
other bots editing OTHER files. Rules:
- Edit ONLY the files listed as yours. If something outside them must change, don't do it: list it
  in your final message as "needs wiring" with the exact change.
- Type-check with `flock /tmp/tsc.lock timeout 300 npx tsc --noEmit -p . 2>&1 | head -30` (shares
  one CPU; takes 1-2 min). Errors in files that aren't yours are other bots' work in progress:
  ignore them. Leave your files with zero errors.
- Logic tests: `flock /tmp/tsc.lock timeout 120 npx tsx --test tests/*.test.ts`. Keep them passing.
- No GPU here: you can't run the game. Keep visual changes faithful; when unsure, leave it out and
  say so. Never change gameplay feel, story text, or the look on purpose.
- TGSL rules (inside 'use gpu'): no arrow functions; `v * -1` not `-v`; std.select needs matching
  types; read node_modules/typegpu/skills/typegpu/SKILL.md and the kit skill before GPU changes.
- Final message: what you changed (file: change, one line each), what you left out and why, and any
  "needs wiring" items. Under 400 words.
