You are now a WRITER (you have bash/edit/write). Implement the HUD cleanup described in
`tools/helpers/out/ui.md` (read it first; it's an audit of this UI). Files you own and may edit:
`index.html`, `src/index.ts`, and a new `src/hud.ts`. DO NOT edit any other file (other bots are
editing scene.ts, danger.ts, story.ts, walk.ts and others at the same time).

Do, in this order, checking `npx tsc --noEmit -p .` (run from /home/bashtv/temple, takes ~60 s;
use `timeout 110`) after each step:
1. ui.md findings 1 (remove 'control' crouch key), 2 (one keydown handler, e.repeat, blur the mode
   button after click, remove leftovers), 3 (diffing setters; no style writes when nothing changed).
2. Move all HUD DOM code out of index.ts into `src/hud.ts` (createHud + update(state) + event
   methods). index.ts keeps hosting, pointer lock, steer/stick wiring, and calls into hud.
   Keep the public scene API exactly as used today (`scene.journey.*`, `scene.walker.*`,
   `scene.view`); you can't change scene.ts. Keep `scenarios(...)`/`tests.attach(scene)` and the
   `#state` element and its CSS exactly as they are.
3. The layout: a `#hud` grid with named regions so text (story, alert, caption, hint, look
   button) can never overlap the touch controls (pad, Torch, Crouch, Jump, mode). Use ui.md's
   sketch. Touch layout is chosen by `coarse` (already `boot.has('phone') || matchMedia(...)`);
   also switch to touch on a touch pointerdown and back on keydown, as ui.md 6 says.
   Explicit z-index for the full-screen layers (#hurt < #down < #arrived < #ended).
4. When the end card shows (`journey.onEnd`), hide #arrived, #story, #hint, vitals and controls.
5. ui.md 7 copy changes (shorter hints, crouch/torch hint first time vitals appear, hints advance on
   first movement instead of timers), ui.md 8 (min 14px text, full-opacity text, soft backing
   behind hint/caption/alert), ui.md 9 (aria), ui.md 10 (canvas fixed inset 0, no callout on pad).
Keep the look and wording style (Georgia serif, warm #e8cf9c text, italic story line). Don't add
features or new copy beyond ui.md. Don't run the dev server or a browser (there's none with a GPU).
Final message: a short list of what you changed and anything you left undone, with reasons.
