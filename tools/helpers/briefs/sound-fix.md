Read briefs/_writer.md (tools/helpers/briefs/_writer.md) first: you are a writer.
Your files: `src/sound.ts` only.
Implement the audit in `tools/helpers/out/sound.md`: findings 1 (suspend when hidden/muted),
2 (delete dead footstep code and 'step' from FILES), 3 (comments; keep `homes`/`walls` fields in
the SoundWorld type but mark them optional/unused so scene.ts still compiles), 4-6 (a `voice()`
helper with cleanup; port every one-shot to it; keep each sound's character: same oscillator
types, frequencies, filters, envelopes and levels), 5 (one panner per event; equalpower for
<0.3 s), 7 (echo built at load, idle), 8 (engines: cheaper when silent; listener updates ~20 Hz),
10 (`stats` getter: {state, live, engines}), 11 (Firefox listener fallback).
Skip finding 9 (level table) unless it's trivially behaviour-preserving. Keep the exported API
used by other files (grep `sound\.` in src/ for every call) exactly compatible.
