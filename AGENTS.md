Read node_modules/@typegpu/kit/skills/typegpu-kit/SKILL.md and node_modules/typegpu/skills/typegpu/SKILL.md before writing GPU code.

## Working on the game

- Find the owning file and a runnable scenario in the README. Keep authored values in `src/content/`. Give the game and its workbench the same placement function, route step or story transition.
- For quests and inventory, follow `src/sim/departure.ts`. An input becomes a typed command. A transition reads the current model and returns the next state and facts. The HUD, sound and capture code consume those results at the boundary. This is where the Elm model/update/view pattern fits. [The Elm Architecture](https://guide.elm-lang.org/architecture/)
- For work repeated across thousands of instances, group data by the operation that consumes it. Keep static meshes and placements reusable. Mutate the existing frame buffers in the render loop and measure at a fixed viewpoint before changing their layout.
- Add a workbench scenario as `src/workbench/scenarios/<id>.ts`. Give it URL parameters for values another person needs to reproduce. For a named capture, await `checkpoint(name, state)` after applying the transition and updating the view, before sending the next command. Keep the state serializable.
- Define named viewpoints in `src/content/viewpoints.ts`. Put each encounter’s ID, starting spot, required resources, setup, and verdict together in `src/game/presets.ts`. The workbench discovers those definitions. `src/game/launch.ts` resolves the URL before scene creation, and `src/game/replay.ts` drives the input sequence. Install the requested state before presenting the first frame. Exercise a direct entry and the ordinary play path when they share code.
- Run browser automation headlessly. A visible browser requires an explicit request from the user for that run. Use the saved frames and clips to inspect results.
- `npm run lint` checks authored game code, tools and tests with the vendored anti-slop rules and the game’s debug-marker checks. For a focused pass, run `npx oxlint path/to/file.ts`. The upstream revision and local rule change are recorded in `tools/oxlint/anti-slop/UPSTREAM.md`.
- Run `npm run check` and `npm run build` before each atomic commit. For visual or narrative changes, run the relevant capture command from the README and inspect the image or clip alongside its state trace.
