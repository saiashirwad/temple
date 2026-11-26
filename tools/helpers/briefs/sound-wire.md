Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: `src/sound.ts`, new `src/surface.ts`, new `src/soundbank.ts`, `tests/sound*.test.ts`.
Read tools/helpers/out/sound-cut.md (what clips exist, in public/sound/, with steps.json and
calls.json offsets), tools/helpers/out/sound.md (the old audit), and src/sound.ts fully.
Rebuild the sound design around the recorded clips, keeping the existing public API that scene.ts,
journey.ts, unease.ts and beastrig.ts call (growl, howl, whistle, yap, bite, trumpet, rumble, thud,
creak, body, snap, rustle, bark, hush, update, stats, ...): same names and arguments, so nothing
else breaks. Where a recording now exists, play it instead of the synth; keep the synth only where
there's no clip (and say which).
- `src/soundbank.ts`: fetch + decodeAudioData the sprite files lazily after the first gesture,
  bed/ambience first, then calls, then steps; expose `play(item, { at, gain, rate, variant })`
  that picks a random variant (never the same twice in a row), random rate 0.94-1.06, through
  the existing voice()/panner chain, and disconnects when done. Handle missing files gracefully.
- Footsteps: `src/surface.ts` exports `surfaceAt(x, z)` → 'dirt'|'leaves'|'gravel'|'grass'|
  'wood'|'stone'|'tar'|'water' using world.ts (ROAD/COMPOUND/lanes, see git show 6648e0f:src/sound.ts
  for the old version), trail.ts (on the forest trail: dirt; off it in the forest: leaves),
  bridge.ts (on the deck: wood), river.ts (in the shallows: water), machan/bungalow floors: wood.
  It must be pure and cheap (called per step). Add `sound.step(x, z, pace, crouched)`: quiet
  (sandals; crouched/sneaking quieter and softer; running louder), never louder than the bed.
- Birds and animals of the night: a scheduler in sound.ts that, by where you are (town / forest /
  river / glade) and story state hooks you expose (e.g. `sound.setQuiet(level)` when the crickets
  go quiet), places occasional distant calls in 3D around the listener: nightjars and owls in the
  forest every 20-60 s, a lapwing alarm when near the river, sambar/langur alarms when elephants
  are near (expose `sound.alarm(x, z)`), insects as beds. Sparse and far: this is a calm night.
- Elephants: trumpet/rumble/branch-break/footfalls from clips, positioned at the elephant, with a
  lowshelf boost for rumbles so they're felt more than heard, and distance filtering.
- Mix: one master compressor (gentle, ratio 2-3) and a limiter-ish compressor last; buses for
  beds, wild, foley, ui with their own gains in one MIX table at the top of the file.
- Keep: suspend when hidden/muted, the echo, engines, and everything the audit fixed.
- Tests: `tests/sound.test.ts` for `surfaceAt` (points on road, compound, trail, bridge deck,
  forest) and for the variant picker (no repeat).
Needs wiring for scene.ts/walk.ts (don't edit them): list exactly how to hook walker.onStep to
sound.step, where to call sound.alarm and sound.setQuiet, and which new files assets.ts FILES
should know about (src/sound.ts FILES list is yours: update it so tools/check/assets.ts passes).
