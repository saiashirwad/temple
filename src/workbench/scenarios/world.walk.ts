import { SPOTS } from '../../content/viewpoints.ts';
import { encounterFor, RUNS } from '../../game/presets.ts';

export const title = 'Explore the world';

/** Links open the actual game, with the existing scenario chords selected at startup. */
export async function mount(root: HTMLElement, params: URLSearchParams) {
  const heading = document.createElement('h2');
  heading.textContent = 'Open the game at a spot or situation';
  const intro = document.createElement('p');
  intro.textContent = 'Select a viewpoint to explore it here. You can switch viewpoints in the same running world.';
  const frame = document.createElement('iframe');
  frame.title = 'Live game viewpoint';
  frame.style.cssText = 'width:100%;aspect-ratio:16/10;border:0';
  frame.hidden = true;
  const full = document.createElement('a');
  full.textContent = 'Open this view in the full game';
  full.hidden = true;
  let generation = 0;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');

  async function openView(key: string) {
    const token = ++generation;
    delete root.dataset.ready;
    delete root.dataset.error;
    status.textContent = 'Opening viewpoint…';
    const game = new URL('./', location.href);
    game.searchParams.set('preset', key);

    if (params.has('seed')) game.searchParams.set('seed', params.get('seed')!);
    full.href = game.href;
    const child = frame.contentWindow;

    if (child && frame.contentDocument?.querySelector('canvas[data-ready]')) {
      child.dispatchEvent(new CustomEvent('temple:view', { detail: key }));
    } else frame.src = game.href;
    frame.hidden = full.hidden = false;
    const url = new URL(location.href);
    url.searchParams.set('view', key);
    history.replaceState(null, '', url);
    const until = performance.now() + 90000;

    while (generation === token) {
      const doc = frame.contentDocument;
      const error = doc?.querySelector<HTMLElement>('[data-error]')?.dataset.error;

      if (error || performance.now() > until) {
        root.dataset.error = status.textContent = error || 'Timed out loading viewpoint';

        return;
      }

      if (doc?.querySelector(`canvas[data-ready][data-view="${key}"]`)) {
        status.textContent = '';
        root.dataset.ready = 'true';

        return;
      }

      await new Promise(requestAnimationFrame);
    }
  }

  const list = document.createElement('ul');

  const entries: [string, string][] = [
    ...Object.entries(SPOTS).map(([key, spot]): [string, string] => [key, spot.name]),
    ...Object.entries(RUNS).map(([key, run]): [string, string] => [key, run.name]),
    ['t', 'Change clock speed'],
    ['j', 'Toggle state readout'], ['b', 'Benchmark'], ['x', 'Hide drawing group'],
    ['X', 'Hide five drawing groups'], ['p', 'Stage timings'], ['m', 'GPU timings'],
    ['c', 'Phone layout'], ['0', 'Clean game'],
  ];

  for (const [key, label] of entries) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    const url = new URL('./', location.href);

    const encounter = encounterFor(key);

    if (encounter) url.searchParams.set('encounter', encounter.id);
    else url.searchParams.set('preset', key);

    if (params.has('seed')) url.searchParams.set('seed', params.get('seed')!);
    link.href = url.href;
    link.textContent = `${label} (${key})`;

    if (/^[1-9]$/.test(key)) link.onclick = e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      void openView(key);
    };

    item.append(link);
    list.append(item);
  }

  root.replaceChildren(heading, intro, status, frame, full, list);
  const view = params.get('view') ?? '';

  if (/^[1-9]$/.test(view)) await openView(view);
}
