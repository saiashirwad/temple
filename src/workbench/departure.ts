import { DEPARTURE_SCRIPT, initialDeparture, replayDeparture, type Command, type Tick } from '../sim/departure.ts';

export function mount(root: HTMLElement, params: URLSearchParams) {
  root.innerHTML = `<section class="departure"><style>
  .departure{font:15px system-ui;background:#19241e;color:#edf1e8;padding:24px;min-height:100%;box-sizing:border-box}.departure h1{margin:0}.departure p{color:#c0d0bf;max-width:760px}.departure button{font:inherit;background:#324b39;color:white;border:1px solid #819887;padding:8px 12px;border-radius:4px;cursor:pointer}.departure .actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.departure .state{display:flex;gap:28px;flex-wrap:wrap}.departure pre{background:#101b15;color:#c9dec9;padding:14px;overflow:auto;max-height:330px;white-space:pre-wrap}.departure strong{color:#aee4a5}
  </style><h1>Village departure rehearsal</h1><p>A sandbox for inventory, equipment and quest state machines. Each action advances one fixed tick. Try leaving early, or run the example and replay its trace.</p><div class="actions"><button data-command="ask">Ask about journey</button><button data-command="note">Take note</button><button data-command="torch">Take torch</button><button data-command="equip">Equip torch</button><button data-command="leave">Leave village</button><button data-command="wait">Wait</button><button data-command="script">Run example</button><button data-command="replay">Replay</button><button data-command="reset">Reset</button></div><div class="state"><div>Tick <strong data-state="tick">0</strong></div><div>Inventory <strong data-state="inventory">empty</strong></div><div>Equipped <strong data-state="equipment">none</strong></div><div>Quest <strong data-state="quest">unoffered</strong></div></div><p role="status"></p><h2>Trace</h2><pre data-trace></pre></section>`;
  let commands: Command[] = [];
  const trace = root.querySelector<HTMLPreElement>('[data-trace]')!;
  const status = root.querySelector<HTMLElement>('[role=status]')!;
  const set = (key: string, value: string) => { root.querySelector<HTMLElement>(`[data-state=${key}]`)!.textContent = value; };
  const render = (ticks: Tick[], replayed = false) => {
    const state = ticks.at(-1)?.state ?? initialDeparture();
    set('tick', String(state.tick)); set('inventory', state.inventory.join(', ') || 'empty'); set('equipment', state.equipped ?? 'none'); set('quest', state.quest);
    trace.textContent = JSON.stringify(ticks, null, 2);
    status.textContent = replayed ? 'Replayed from tick zero.' : ticks.at(-1)?.facts.map(f => f.kind === 'denied' ? f.reason : f.kind === 'quest' ? `Quest: ${f.state}` : `${f.kind}: ${f.item}`).join(' · ') || 'No new facts this tick.';
  };
  const update = () => render(replayDeparture(commands));
  root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.command;
    if (action === 'reset') commands = [];
    else if (action === 'script') commands = [...DEPARTURE_SCRIPT];
    else if (action === 'replay') { render(replayDeparture(commands), true); return; }
    else if (action === 'ask') commands.push({ kind: 'ask', topic: 'journey' });
    else if (action === 'note' || action === 'torch') commands.push({ kind: 'acquire', item: action });
    else if (action === 'equip') commands.push({ kind: 'equip', item: 'torch' });
    else if (action === 'leave') commands.push({ kind: 'leave' });
    else if (action === 'wait') commands.push({ kind: 'wait' });
    update();
  }));
  if (params.get('run') === '1') {
    commands = [...DEPARTURE_SCRIPT];
    const first = replayDeparture(commands); const second = replayDeparture(commands);
    const duplicate = first[3];
    root.dataset.verdict = first.at(-1)?.state.quest === 'departed' && duplicate?.facts.length === 0 && JSON.stringify(first) === JSON.stringify(second) ? 'pass' : 'fail';
    render(first, true);
  } else { delete root.dataset.verdict; render([]); }
}
