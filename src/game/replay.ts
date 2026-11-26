import { SPOTS } from '../content/viewpoints.ts';
import { checkpoint, wantsCheckpoint } from '../scenario/checkpoint.ts';
import type { Launch } from './launch.ts';
import { RUNS, type Scene } from './presets.ts';

/** Drive browser replays through the production simulation and input handlers. */
export function gameReplay(launch: Launch) {
  const { bungalow: auto, tour: worldTour } = launch;
  let prepared = false;
  const replayBox = auto || worldTour ? document.createElement('pre') : null;

  if (replayBox) {
    replayBox.id = 'game-replay';
    replayBox.dataset.trace = '';
    replayBox.dataset.verdict = 'running';
    replayBox.hidden = true;
    document.body.append(replayBox);
  }

  type ReplayEntry = { at: number; event: string; detail?: string };

  const trace: ReplayEntry[] = [];
  const began = performance.now();
  let finished = false;
  let scene: Scene | undefined;

  const record = (event: string, detail?: string) => {
    trace.push({ at: +((performance.now() - began) / 1000).toFixed(2), event, ...(detail ? { detail } : {}) });

    if (replayBox) replayBox.textContent = JSON.stringify(trace);
  };

  const finish = (ok: boolean, detail?: string) => {
    if (finished || !replayBox) return;
    finished = true;
    record(ok ? 'pass' : 'fail', detail);

    if (scene) replayBox.dataset.state = JSON.stringify(scene.inspect());
    replayBox.dataset.verdict = ok ? 'pass' : 'fail';
  };

  if (replayBox) {
    record('loading');
    setTimeout(() => finish(false, 'game replay timed out'), 120000);
  }

  async function captureStory(s: Scene, name: string) {
    if (!wantsCheckpoint(name)) return;
    const speed = s.test.timeScale;
    s.test.timeScale = 0;

    try {
      await checkpoint(name, s.inspect());
    } finally {
      s.test.timeScale = speed;
    }
  }

  async function tour(s: Scene) {
    try {
      const preset = launch.preset;
      const encounter = preset ? RUNS[preset] : undefined;

      if (encounter) {
        await encounter.start(s);
        prepared = true;
        const start = performance.now();
        let verdict: string | null = null;

        while (encounter.judge && !verdict) {
          if (finished) return;
          await new Promise((done) => setTimeout(done, 50));
          verdict = encounter.judge(s.inspect(), (performance.now() - start) / 1000, s);
        }

        if (verdict?.startsWith('FAIL')) throw new Error(verdict);
        record('encounter', encounter.name);
        await checkpoint('encounter', s.inspect());
      } else {
        if (preset && !SPOTS[preset]) throw new Error('Unknown view or encounter preset: ' + preset);
        const spots = launch.views;

        for (const spot of spots) {
          await s.test.prepareView(spot);
          s.walker.hold(...spot.at);
          s.view.jump();
          prepared = true;
          record('view', spot.shot);
          await checkpoint(spot.shot, s.inspect());
        }
      }

      finish(true);
    } catch (error) {
      finish(false, String(error));
    }
  }

  const replay = async (s: Scene) => {
    const waitFor = async (predicate: () => boolean, label: string, ms = 10000) => {
      const until = performance.now() + ms;

      while (!predicate()) {
        if (finished) throw new Error('replay stopped');

        if (performance.now() >= until) throw new Error(`timed out: ${label}`);
        await new Promise((done) => setTimeout(done, 50));
      }
    };

    const key = (type: 'keydown' | 'keyup', k: string) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    let examined = '';
    let closed = '';
    const onExamined = (e: Event) => { examined = (e as CustomEvent<string>).detail; record('examined', examined); };
    const onClosed = (e: Event) => { closed = (e as CustomEvent<string>).detail; record('closed', closed); };

    addEventListener('temple:examined', onExamined);
    addEventListener('temple:closed', onClosed);

    try {
      if (launch.physics) await s.test.requirePhysics();
      const [x, z, yaw] = SPOTS['8']!.at;
      s.walker.moveTo(x, z, yaw, true);
      s.walker.touched();
      s.test.timeScale = 16;
      s.test.stepJourney(0);
      const from = launch.beat;
      const seated = from === 'seated' || from === 'guard-gone' || from === 'ending';

      if (from !== 'veranda') record('direct entry', from);
      const note = s.journey.state.near;

      if (note?.id !== 'bungalow.note') throw new Error('Veranda entry did not reach the note');

      if (seated) {
        // Compose a later starting state through the same transitions as the real walk.
        s.journey.examine(note);
        s.test.stepJourney(0.7);
      } else {
        record('placed at veranda');
        prepared = from === 'veranda';

        if (from === 'veranda') {
          if (wantsCheckpoint('veranda')) await captureStory(s, 'veranda');
          else await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
        }

        key('keydown', 'e'); key('keyup', 'e');
        await waitFor(() => examined === 'bungalow.note', 'note examination');
        prepared = true;
        await captureStory(s, 'reading-note');
        key('keydown', 's');

        try { await waitFor(() => closed === 'bungalow.note', 'putting down note', 5000); }
        finally { key('keyup', 's'); }

        record('walked to close note');

        if (s.journey.state.near?.id !== 'bungalow.chair') {
          key('keydown', 'w');

          try { await waitFor(() => s.journey.state.near?.id === 'bungalow.chair', 'chair', 5000); }
          finally { key('keyup', 'w'); }
        }
      }

      await waitFor(() => s.journey.state.near?.id === 'bungalow.chair', 'chair');
      key('keydown', 'e'); key('keyup', 'e');
      await waitFor(() => examined === 'bungalow.chair' && s.journey.story.sitting >= 0, 'chair examination');

      if (seated) s.view.jump();

      if (from === 'guard-gone' || from === 'ending') {
        // Only the narrative clock needs to advance. Deliver its normal HUD and guard effects.
        for (let i = 0; i < 1200; i++) {
          if (from === 'ending' ? s.journey.state.ended : s.test.guardGone) break;
          s.journey.story.update(0.1, { along: s.journey.state.furthest, moving: false, busy: false });
        }

        if (from === 'ending' ? !s.journey.state.ended : !s.test.guardGone) throw new Error('Finale checkpoint unavailable');
      }

      prepared = true;

      if (from !== 'guard-gone' && from !== 'ending') {
        record('sitting');
        await captureStory(s, 'seated');
      }

      if (from !== 'ending') {
        await waitFor(() => s.test.guardGone, 'guard departure', 15000);
        record('guard gone');
        await captureStory(s, 'guard-gone');
      }

      await waitFor(() => s.journey.state.ended, 'ending', 15000);
      record('ended');
      await captureStory(s, 'ending');
      finish(true);
    } catch (error) { finish(false, String(error)); }
    finally {
      key('keyup', 's'); key('keyup', 'w');
      removeEventListener('temple:examined', onExamined);
      removeEventListener('temple:closed', onClosed);
    }
  };

  return {
    active: auto || worldTour,
    get prepared() { return prepared; },
    start(s: Scene) {
      scene = s;

      return worldTour ? tour(s) : replay(s);
    },
  };
}
