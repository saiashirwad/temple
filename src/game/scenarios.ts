// Test scenarios, run by a key chord so a test browser that can only open the bare address,
// press keys and take screenshots can still set up any situation: press ` (backquote), then a
// key. Keys pressed while the scene is still loading are kept and run once it's ready.
//
// A scenario puts you somewhere, starts something, and may judge itself: the readout in the
// top-left corner (`#state`) shows its name, PASS / FAIL / waiting, and the game's state as
// text, so one screenshot says what happened.
//
//   1-9  stand at a named spot (SPOTS), held still: a view to look at
//   w    the red dogs come at you now, from ahead (at the bridge path if you're in town)
//   W    the same, and stand your ground facing them with the torch on: they should give up
//   D    the pack held still in view at the path (no physics): standing, stalking, trotting, galloping
//   h    at the herd, downwind; the herd is startled into a charge
//   f    the ending: in his chair with the note read, at 16x speed, through to the last card
//   n    on the veranda by the note, the note not yet read
//   d    you go down (health to nothing), to see the fall and waking again
//   g    walk forward 3 s from where you are (hold W), for checking collisions
//   t    the night's clock at 1x / 4x / 10x
//   j    the readout on or off
//   p    reload with stage timings (probe);  m  reload with GPU timings (profile)
//   c    reload with the phone layout;  0  reload clean

import { boot, RELOAD_PRESETS } from './boot.ts';
import { SPOTS, type Launch } from './launch.ts';
import { RUNS, wildlifeReady, type Run, type Scene } from './presets.ts';
import { gameReplay } from './replay.ts';

export function scenarios(stateBox: HTMLPreElement, launch: Launch) {
  const queued: string[] = [];
  let chord = false;
  let scene: Scene | null = null;
  let current: { run: Run; t0: number; from: readonly [number, number]; verdict: string | null; ready: boolean } | null = null;
  let shown = boot.has('state');
  const replay = gameReplay(launch);
  let pendingView: string | null = null;
  let selecting = 0;
  let prepared = !launch.preset;
  addEventListener(
    'keydown',
    (e) => {
      if (e.key === '`') {
        chord = true;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!chord) return;
      chord = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (scene) run(e.key, scene);
      else queued.push(e.key);
    },
    { capture: true },
  );

  const run = (key: string, s: Scene) => {
    if (Object.hasOwn(RELOAD_PRESETS, key)) {
      // The reload is one-shot; remove a launch preset so it cannot trigger itself again.
      const url = new URL(location.href);
      url.searchParams.delete('preset');
      history.replaceState(null, '', url);
      return boot.reloadWith(...RELOAD_PRESETS[key]!);
    }
    if (key === 'j') return void (shown = !shown);
    // x: hide the next drawing group in turn (for finding what the scene pass spends its time on)
    if (key === 'b') return void (s.test.bench(), (shown = true));
    if (key === 'x' || key === 'X') return void ((s.test.skip = s.test.skip + (key === 'X' ? 5 : 1)), (shown = true));
    if (key === 't') {
      s.test.timeScale = s.test.timeScale === 1 ? 4 : s.test.timeScale === 4 ? 10 : 1;
      return void (shown = true);
    }
    shown = true;
    const spot = SPOTS[key];
    const r: Run | undefined = spot ? { name: spot.name, start(sc) { sc.walker.hold(...spot.at); sc.view.jump(); } } : RUNS[key];
    if (!r) return;
    if (spot) pendingView = key;
    current = { run: r, t0: performance.now(), from: [...s.walker.at] as [number, number], verdict: null, ready: false };
    return Promise.resolve(r.start(s)).then(() => current && current.run === r && ((current.t0 = performance.now()), (current.ready = true), (current.from = [...s.walker.at] as [number, number]))).catch((error: unknown) => { if (current?.run === r) { current.ready = true; current.verdict = `FAIL: ${String(error)}`; } });
  };

  // Same-origin workbench switches views without recreating the device or downloading assets.
  addEventListener('temple:view', async event => {
    const key = (event as CustomEvent<string>).detail;
    const spot = SPOTS[key];
    if (!scene || !spot) return;
    const request = ++selecting;
    try {
      if (key === '1') await scene.test.townReady();
      if (spot.shot.startsWith('herd-')) await wildlifeReady(scene);
      if (request !== selecting) return;
      await run(key, scene);
      const url = new URL(location.href);
      url.searchParams.set('preset', key);
      history.replaceState(null, '', url);
    } catch (error) {
      if (request === selecting) stateBox.dataset.error = String(error);
    }
  });

  let lastText = '';
  setInterval(() => {
    if (scene) while (queued.length) run(queued.shift()!, scene);
    stateBox.hidden = !shown;
    if (!shown || !scene) return;
    const st = scene.inspect();
    let head = 'no scenario';
    if (current) {
      const t = (performance.now() - current.t0) / 1000;
      if (current.ready && !current.verdict && current.run.judge) current.verdict = current.run.judge(st, t, scene);
      const moved = Math.hypot(st.at[0]! - current.from[0], st.at[1]! - current.from[1]);
      head = `${current.run.name} · ${current.verdict ?? (!current.ready ? 'setting up' : current.run.judge ? 'waiting' : 'running')} · ${t.toFixed(0)}s · moved ${moved.toFixed(1)}m`;
    }
    const fields = Object.entries(st).map(([key, value]) => `${key}  ${JSON.stringify(value)}`);
    const text = [head, `clock ×${scene.test.timeScale}`, ...fields].join('\n');
    if (text !== lastText) stateBox.textContent = lastText = text;
  }, 250);

  return {
    get prepared() { return replay.active ? replay.prepared : prepared; },
    takeViewChange() {
      const key = pendingView;
      pendingView = null;
      return key;
    },
    attach(s: Scene) {
      scene = s;
      if (replay.active) void replay.start(s);
      else if (launch.preset) void Promise.resolve(run(launch.preset, s)).then(() => { prepared = true; });
    },
  };
}
