import './departure.css';
import { checkpoint, wantsCheckpoint } from '../scenario/checkpoint.ts';
import { DEPARTURE_SCRIPT, initialDeparture, replayDeparture, type Command, type Tick } from '../sim/departure.ts';

export async function mount(root: HTMLElement, params: URLSearchParams) {
  root.innerHTML = `
<section class="departure">
  <p>
    A sandbox for inventory, equipment and quest state machines. Each action advances one fixed tick. Try leaving early,
    or run the example and replay its trace.
  </p>
  <div class="actions">
    <button data-command="ask">Ask about journey</button><button data-command="note">Take note</button
    ><button data-command="torch">Take torch</button><button data-command="equip">Equip torch</button
    ><button data-command="leave">Leave village</button><button data-command="wait">Wait</button
    ><button data-command="script">Run example</button><button data-command="replay">Replay</button
    ><button data-command="reset">Reset</button>
  </div>
  <div class="state">
    <div>Tick <strong data-state="tick">0</strong></div>
    <div>Inventory <strong data-state="inventory">empty</strong></div>
    <div>Equipped <strong data-state="equipment">none</strong></div>
    <div>Quest <strong data-state="quest">unoffered</strong></div>
  </div>
  <p role="status"></p>
  <h2>Trace</h2>
  <pre data-trace></pre>
</section>`;
  let commands: Command[] = [];
  const trace = root.querySelector<HTMLPreElement>('[data-trace]')!;
  const status = root.querySelector<HTMLElement>('[role=status]')!;
  const set = (key: string, value: string) => {
    root.querySelector<HTMLElement>(`[data-state=${key}]`)!.textContent = value;
  };
  const render = (ticks: Tick[], replayed = false) => {
    const state = ticks.at(-1)?.state ?? initialDeparture();
    set('tick', String(state.tick));
    set('inventory', state.inventory.join(', ') || 'empty');
    set('equipment', state.equipped ?? 'none');
    set('quest', state.quest);
    trace.textContent = JSON.stringify(ticks, null, 2);
    status.textContent = replayed
      ? 'Replayed from tick zero.'
      : ticks
          .at(-1)
          ?.facts.map((f) => (f.kind === 'denied' ? f.reason : f.kind === 'quest' ? `Quest: ${f.state}` : `${f.kind}: ${f.item}`))
          .join(' · ') || 'No new facts this tick.';
  };
  const update = () => render(replayDeparture(commands));
  root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) =>
    button.addEventListener('click', () => {
      const action = button.dataset.command;
      if (action === 'reset') commands = [];
      else if (action === 'script') commands = [...DEPARTURE_SCRIPT];
      else if (action === 'replay') {
        render(replayDeparture(commands), true);
        return;
      } else if (action === 'ask') commands.push({ kind: 'ask', topic: 'journey' });
      else if (action === 'note' || action === 'torch') commands.push({ kind: 'acquire', item: action });
      else if (action === 'equip') commands.push({ kind: 'equip', item: 'torch' });
      else if (action === 'leave') commands.push({ kind: 'leave' });
      else if (action === 'wait') commands.push({ kind: 'wait' });
      update();
    }),
  );
  if (params.has('tick')) {
    const tick = Number(params.get('tick'));
    if (!Number.isInteger(tick) || tick < 0 || tick > DEPARTURE_SCRIPT.length)
      throw new Error(`Expected tick from 0 to ${DEPARTURE_SCRIPT.length}`);
    commands = DEPARTURE_SCRIPT.slice(0, tick);
    update();
  } else if (params.get('run') === '1') {
    commands = [...DEPARTURE_SCRIPT];
    const first = replayDeparture(commands);
    const second = replayDeparture(commands);
    for (let index = 0; index <= first.length; index++) {
      const name = `tick-${index}`;
      if (!wantsCheckpoint(name)) continue;
      const prefix = first.slice(0, index);
      render(prefix);
      await checkpoint(name, prefix.at(-1)?.state ?? initialDeparture());
    }
    const duplicate = first[3];
    root.dataset.verdict =
      first.at(-1)?.state.quest === 'departed' &&
      duplicate?.facts.length === 0 &&
      JSON.stringify(first) === JSON.stringify(second)
        ? 'pass'
        : 'fail';
    render(first, true);
  } else {
    delete root.dataset.verdict;
    render([]);
  }
}
