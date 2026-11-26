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

Install the browser once with `npx playwright install chromium`. The CLI starts its own local Vite instance. Use the same scenario, seed and parameters when comparing two revisions.

```sh
npm run scenario -- --list
npm run scenario -- asset.inspect --param asset=tree/teak --seed 42 --out /tmp/temple-teak
npm run scenario -- story.village-departure
npm run scenario -- story.bungalow-ending --game --seed 42 --out /tmp/temple-ending
npm run check
npm run build
```

With `--out`, the runner saves a JSON result, a browser recording and a screenshot when capture succeeds. An inspector returns `ready` after mounting. Story replays also check the outcome and report a verdict and event trace. The full-game ending replay drives the note and chair interactions through gameplay input. Seeds control random choices. Render timing and recorded event times depend on the machine.

## Add a scenario

Add `src/workbench/scenarios/<id>.ts` exporting a `title` and a `mount(root, params)` function. Both the URL router and CLI discover the filename automatically. Import the production builder or transition under test. Read scenario options from `URLSearchParams` so another developer or agent can reopen the same case. For a replay, follow the verdict and trace conventions in `src/workbench/bungalow.ts`.

Inventory, equipment and the departure quest each own a transition function. One command advances a tick. For example, acquiring the torch emits an inventory fact, equipping it emits an equipment fact, and the quest observes both equipment and note state to decide whether departure is possible. Their fixed delivery order gives the rehearsal a readable trace. Keep these low-frequency narrative decisions separate from the loops that place and render thousands of plants. XState actors become an option if story branches need independent lifetimes or asynchronous mailboxes. [XState actors](https://stately.ai/docs/xstate/v5/actors)

The workbench uses native controls and TypeGPU for its 3D previews. Poimandres' Leva would fit a React-based editor if one grows here. Playwright already gives humans and agents the same browser entry points and captures. For rendering work, compare a fixed camera and seed, select stage or GPU timings in `world.walk`, and measure on the intended device before changing instance layouts or draw distances. [Leva](https://github.com/pmndrs/leva) · [Playwright recordings](https://playwright.dev/docs/videos) · [Mike Acton's data-oriented design talk](https://www.youtube.com/watch?v=rX0ItVEVjHc)

## Rebuild the trail

Run `npm run gen:trail` after editing the route generator or its terrain inputs. It computes the path over the uncut land, places the river at the crossing, then bakes the trail mask. Review the two files under `src/generated/` and `public/tex/trail.png` together. The normal game build uses the checked-in assets.
