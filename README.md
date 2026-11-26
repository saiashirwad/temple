# This is where I'm from

A walk from a Kerala town to a forest bungalow at night. Run `npm ci` and `npm run dev`. Open the URL Vite prints to play, or open `/workbench.html` on the same host to work on one part of the game. The game and 3D previews use WebGPU. Both entry points build into `dist/` for static hosting.

## Find the right scenario

| To work on | Open in the workbench | Where changes belong |
| --- | --- | --- |
| Models, animations, textures, recordings and procedural trees | `asset.inspect` | Media in `public/`, game asset IDs in `src/content/assets.ts`, tree builders in `src/world/vegetation/` |
| Tree, undergrowth and grass distribution | `forest.distribution` | Export the seed and density to `src/content/vegetation.json`. Species and placement rules live in `src/world/vegetation/planting.ts` and `meadow.ts`. |
| Building placement | `building.placement` | Move and rotate the bungalow against the trail end, then save the exported `bungalow-placement.json` in `src/content/`. Town plots are defined separately in `src/world/town/town.ts`. |
| Soil | `terrain.soil` | Inspect or sample individual ground-cover channels, then save the exported `soil.json` in `src/content/`. |
| NPC routes, pace and avoidance | `npc.route` | Click the map to put an obstacle in a walker's way. Edit `src/content/npc-plans.ts` for routes and `src/sim/walker.ts` for movement. The rehearsal uses production collision footprints. The game integrates Box3D WASM in `src/physics/physics.ts`. |
| Bungalow story and interactions | `story.bungalow-ending` | Edit `src/content/narrative.ts` for text and `src/sim/bungalow-story.ts` for transitions. Replay the ending in the full game after changing either. |
| Inventory, equipment and quest experiments | `story.village-departure` | Edit `src/sim/departure.ts`. This is a workbench rehearsal. The released walk still starts as before. |
| Lighting, encounters and frame timings in context | `world.walk` | Jump into the game at the bridge, herd glade or veranda, or select a benchmark. Rendering lives in `src/render/` and scene assembly in `src/game/`. |

A scenario URL can go directly in a task or bug report, for example `/workbench.html?scenario=forest.distribution&region=bridge&group=grass&seed=42`.

## Reproduce a change

Install Chromium once with `npx playwright install chromium`. Run `npm run scenario -- --help` for capture options. The runner uses headless Chromium on every platform, including for WebGPU screenshots and clips. It advances the scenario in a private browser session. A visible window requires the explicit `--headed` flag.

| What you want | Command |
| --- | --- |
| Discover the available checkpoints | `npm run scenario -- story.bungalow-ending --game --list-shots` |
| Photograph the bridge from the game camera | `npm run scenario -- world.walk --game --shot bridge --seed 42 --out /tmp/bridge` |
| Capture the elephant herd as the charge begins | `npm run scenario -- world.walk --game --param encounter=herd-charge --shot encounter --seed 42` |
| Compare several viewpoints in one loaded world | `npm run scenario -- world.walk --game --spread --shot bridge --shot herd-glade --shot town --seed 42 --out /tmp/walk` |
| Record the action starting when the note opens | `npm run scenario -- story.bungalow-ending --game --shot reading-note --clip 3 --seed 42 --out /tmp/note` |
| Capture only the lanes channel of the soil inspector | `npm run scenario -- terrain.soil --param channel=lanes --param laneShoulder=2.4 --target canvas --out /tmp/soil` |
| Inspect the departure quest before and after equipping the torch | `npm run scenario -- story.village-departure --shot tick-4 --shot tick-5 --spread --out /tmp/quest` |
| Compare frames from different runs or revisions | `npm run scenario -- --sheet /tmp/comparison.png /tmp/soil /tmp/walk` |

Each capture directory contains `result.json` with the entry URL, verdict, errors and the filenames from that run. Full-game runs include a structured `finalState` with interaction and story state, mesh counts, startup milestones in milliseconds since navigation, and CPU and GPU timings in milliseconds. Named checkpoints include their own state when supplied. In the game, press backquote then J to inspect the live state. `--out` alone saves the final viewport as `frame.png`. `--target` crops stills to one matching element. `--clip` records just the browser viewport for the requested interval starting at the first selected checkpoint. `--spread` produces a labeled PNG and keeps the originals. Without an output path, an explicit capture prints its temporary directory. Use a different directory per revision to keep both sets. [Playwright page screencasts](https://playwright.dev/docs/api/class-screencast)

### Direct entry and load timing

In `world.walk`, select a viewpoint to open it in the workbench. Subsequent viewpoints reuse the same renderer and assets. A link such as `/workbench.html?scenario=world.walk&view=3&seed=42` opens straight into the bridge viewer. To put a camera anywhere, pass `--game --param at=x,z,yaw,pitch,height` to `world.walk`. Positions and heights are in metres and angles are in radians.

A game launch resolves the camera and the resources it needs before presenting the world. Forest launches prepare the watcher first and stream the village residents afterward. Herd views wait for wildlife. For the bungalow, selecting a later beat initializes the story through its own transitions. Omitting `--shot` runs the full note-to-chair input sequence. Use the full replay to check progression and a named checkpoint to work on its appearance.

For load measurements, run `npm run build` and add `--built` to the scenario command. This serves that build from `dist/`. The default mode serves current source. The result includes `firstFrame.ms` from page navigation, the camera pose, and the visible story state. The runner checks the first location and relevant story conditions, in addition to the final verdict. Browser startup, Vite startup and artifact encoding are outside this timing. Seeded random choices are repeatable. Frame times and pixels can vary by device.

## Add a scenario

Add `src/workbench/scenarios/<id>.ts` exporting a `title` and a `mount(root, params)` function. Both the URL router and CLI discover the filename automatically. Import the production builder or transition under test. Read scenario options from `URLSearchParams` so another developer or agent can reopen the same case. For a replay, follow the verdict and trace conventions in `src/workbench/scenarios/story.bungalow-ending.ts`.

To add a full-game encounter, define its ID, camera spot, resource requirements, setup and verdict together in `src/game/presets.ts`. The workbench lists it automatically. Named camera positions live in `src/content/viewpoints.ts`.

Inventory, equipment and the departure quest each own a transition function. One command advances a tick. For example, acquiring the torch emits an inventory fact, equipping it emits an equipment fact, and the quest observes both equipment and note state to decide whether departure is possible. Their fixed delivery order gives the rehearsal a readable trace. Keep these low-frequency narrative decisions separate from the loops that place and render thousands of plants. XState actors become an option if story branches need independent lifetimes or asynchronous mailboxes. [XState actors](https://stately.ai/docs/xstate/v5/actors)

The workbench uses native controls and TypeGPU for its 3D previews. Poimandres' Leva would fit a React-based editor if one grows here. Playwright already gives humans and agents the same browser entry points and captures. For rendering work, compare a fixed camera and seed, select stage or GPU timings in `world.walk`, and measure on the intended device before changing instance layouts or draw distances. [Leva](https://github.com/pmndrs/leva) · [Playwright recordings](https://playwright.dev/docs/videos) · [Mike Acton's data-oriented design talk](https://www.youtube.com/watch?v=rX0ItVEVjHc)

## Rebuild the trail

Run `npm run gen:trail` after editing the route generator or its terrain inputs. It computes the path over the uncut land, places the river at the crossing, then bakes the trail mask. Review the two files under `src/generated/` and `public/tex/trail.png` together. The normal game build uses the checked-in assets.
