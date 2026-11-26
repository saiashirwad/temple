import { createBungalowStory, type BungalowInteraction } from '../sim/bungalow-story.ts';
import { createStory } from '../sim/story.ts';

export type Trace = { at: number; event: string; detail?: string };

/** CPU-only rehearsal using the game's interaction state and story clock. */
export function rehearseBungalow() {
  const trace: Trace[] = [];
  let time = 0;
  const add = (event: string, detail?: string) => trace.push({ at: +time.toFixed(2), event, ...(detail === undefined ? {} : { detail }) });
  const story = createStory({ tell: (text) => add('line', text), guardGone: () => add('guard gone'), end: () => add('end') });
  const bungalow = createBungalowStory(() => { add('sit'); story.sit(); });
  const step = (dt: number, reading = false) => {
    time += dt;
    bungalow.update(time, reading);
    story.update(dt, { along: 960, moving: false, busy: reading });
  };
  const examine = (id: BungalowInteraction) => {
    const accepted = bungalow.examine(id, time);
    add(accepted ? 'examine' : 'rejected', id);
    return accepted;
  };
  return { trace, step, examine, get interaction() { return bungalow.interaction; }, get sitting() { return bungalow.sitting; } };
}

/** Replays the same deterministic sequence each time, without WebGPU. */
export function replayBungalow(): Trace[] {
  const run = rehearseBungalow();
  run.examine('bungalow.note');
  run.step(1, true);
  run.step(0.1);
  run.examine('bungalow.chair');
  for (let i = 0; i < 440; i++) run.step(0.1);
  return run.trace;
}

export function mount(root: HTMLElement, params: URLSearchParams) {
  const game = document.createElement('a');
  game.href = './?scenario=story.bungalow-ending';
  game.textContent = 'Replay in the full game ↗';
  const output = document.createElement('pre');
  output.setAttribute('aria-live', 'polite');
  output.dataset.trace = '';
  let run = rehearseBungalow();
  let reading = false;
  const show = () => {
    const events = run.trace.map((entry) => entry.event);
    const sit = events.indexOf('sit');
    const gone = events.indexOf('guard gone');
    const end = events.indexOf('end');
    root.dataset.verdict = sit >= 0 && gone > sit && end > gone && events.slice(sit + 1).filter((e) => e === 'line').length === 4 ? 'pass' : 'running';
    output.textContent = JSON.stringify(run.trace, null, 2);
  };
  const button = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => { action(); show(); });
    return b;
  };
  const note = button('Read note', () => { if (run.examine('bungalow.note')) reading = true; });
  const close = button('Put note down', () => { reading = false; run.step(1, false); });
  const chair = button('Sit in chair', () => { run.examine('bungalow.chair'); });
  const advance = button('Advance 10 seconds', () => { for (let i = 0; i < 100; i++) run.step(0.1, reading); });
  const reset = button('Reset', () => { run = rehearseBungalow(); reading = false; });
  const replay = button('Replay', () => {
    run = rehearseBungalow();
    run.examine('bungalow.note');
    run.step(1, true);
    run.step(0.1);
    run.examine('bungalow.chair');
    for (let i = 0; i < 440; i++) run.step(0.1);
    reading = false;
  });
  root.replaceChildren(game, note, close, chair, advance, reset, replay, output);
  if (params.get('run') === '1') replay.click();
  else show();
}
