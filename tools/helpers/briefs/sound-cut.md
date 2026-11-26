Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: new `tools/sound/cut.ts` (and any helper module under tools/sound/), everything under
`public/sound/` (add files; delete only files nothing in src/ loads: check with grep), and
`public/sound/CREDITS.txt`. Nothing in src/.
Inputs: /home/bashtv/sound-src/wild/manifest.json and /home/bashtv/sound-src/foley/manifest.json
(and the files beside them), made by two hunter bots. Read both final reports in
tools/helpers/out/hunt-wild.md and hunt-foley.md.
Write `tools/sound/cut.ts` (run with `nice npx tsx tools/sound/cut.ts`) that turns the rank-1
(fall back to rank-2 when rank 1 is unusable) sources into game-ready clips, reproducibly:
- A table in the script: output name, source file, start/end seconds (or 'auto' using
  silencedetect), gain trim, highpass/lowpass, mono or stereo, loop or one-shot.
- Footsteps: cut each surface's sequence into 6-8 single steps (silencedetect on the onsets),
  each 0.25-0.6 s with a 5 ms fade-in and 40 ms fade-out, peak-matched, as ONE sprite file per
  surface plus a JSON of offsets (`public/sound/steps.json`: { surface: [[start, dur], ...] }).
- One-shots (trumpets, rumbles, alarms, bird calls, creaks, dhole calls): trimmed to the call
  with short fades; several variants per item where the source allows, also as sprites + offsets
  in `public/sound/calls.json` ({ item: [[start, dur], ...] }), one sprite file per group.
- Beds (forest night, insects, river, town): 45-90 s, made seamlessly loopable with an equal-
  power crossfade of the end into the start (acrossfade), stereo kept for beds.
- Loudness: one-shots to -16 LUFS short-term peak-normalised to -1 dBTP; beds to -24 LUFS.
  The game sets the final mix; consistent source levels matter more than loudness.
- Clean-up: highpass 40-80 Hz on everything but elephant rumbles (they live at 15-40 Hz; keep a
  20 Hz highpass there), gentle afftdn noise reduction (nr 6-10) only where floorDb > -55.
- Encode: `.mp3` (libmp3lame VBR -q:a 2) for broad browser support (Safari), 44.1 kHz.
  Keep total public/sound under 8 MB.
- Write CREDITS.txt: every source with author, licence, page URL, and "trimmed, filtered,
  levelled" note (CC BY-SA edits stay CC BY-SA). Keep bed.mp3's credit if you keep it.
Then print the size per file. Run `npx tsx tools/check/assets.ts`: it will report your new files
as UNUSED (fine, another bot wires them) — list them in your report. Report every output with
duration and what's in it, so the wiring bot can use them.
