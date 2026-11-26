import { buildGrounds } from '../grounds.ts';
import { buildStreet } from '../street.ts';
import { buildTemple } from '../temple.ts';
import { buildVillage } from '../village.ts';
import { plansClear } from '../content/npc-plans.ts';
import { footprints, pushOut } from '../routes.ts';
import { makeWalker, stepWalker, walkerAt } from '../sim/walker.ts';

export async function mount(root: HTMLElement, params: URLSearchParams) {
  root.innerHTML = `<section class="npc-lab"><style>
  .npc-lab{font:14px system-ui;background:#19241e;color:#eef4e9;padding:20px;min-height:100%;box-sizing:border-box}.npc-lab h1{font-size:24px;margin:0}.npc-lab p{color:#c2d0c3;max-width:760px}.npc-controls{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:15px 0}.npc-controls label{display:grid;gap:5px}.npc-controls select,.npc-controls input,.npc-controls button{font:inherit;padding:6px;background:#314638;color:white;border:1px solid #839a87;border-radius:4px}.npc-lab canvas{display:block;width:min(100%,750px);aspect-ratio:1;background:#24382d;border:1px solid #839a87;touch-action:none}.npc-lab output{font-variant-numeric:tabular-nums}
  </style><h1>NPC route rehearsal</h1><p>Actual town routes, cleared against the town’s collision footprints. Click the map to place yourself in the walker’s way; the walker slows and steps aside when there is room.</p><div class="npc-controls"><label>Walker <select name="walker"></select></label><label>Walking pace (m/s) <input name="pace" type="number" min="0" max="3" step="0.05"></label><button type="button" name="restart">Restart</button><button type="button" name="remove">Remove obstacle</button><button type="button" name="pause">Pause</button></div><p><span style="color:#a5e4a0">● Walker</span>　<span style="color:#f1b77c">● You / obstacle</span>　<span style="color:#c8d8c3">— Route</span></p><p role="status">Building town routes…</p><canvas width="750" height="750" aria-label="NPC route map; click to place an obstacle"></canvas><p><output></output></p></section>`;
  const panel = root.querySelector('.npc-lab')!;
  const village = buildVillage();
  const solids = [...buildTemple().solids, ...buildGrounds().solids, ...buildStreet().solids, ...village.solids];
  const feet = footprints(solids);
  const plans = plansClear(village.tulsi, village.seats, solids, feet).filter(p => p.kind === 'walk');
  const select = root.querySelector<HTMLSelectElement>('[name=walker]')!;
  plans.forEach((p, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `${p.who} · ${p.loop ? 'circuit' : 'out and back'} ${i + 1}`; select.append(o); });
  const pace = root.querySelector<HTMLInputElement>('[name=pace]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const output = root.querySelector<HTMLOutputElement>('output')!;
  const status = root.querySelector<HTMLElement>('[role=status]')!;
  let plan = plans[0]!; let state = makeWalker(plan); let obstacle: [number, number] = [1e6, 1e6]; let paused = false;
  let cx = 0, cz = 0, span = 1;
  const reset = () => {
    plan = plans[Number(select.value)]!; state = makeWalker(plan); pace.value = String(plan.speed); obstacle = [1e6, 1e6];
    const xs = plan.route.map(p => p[0]), zs = plan.route.map(p => p[1]);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2; cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    span = Math.max(12, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.2);
    status.textContent = `Route ${state.length.toFixed(1)} m · ${plan.loop ? 'loop' : `turns around after a ${plan.pause ?? 3} s pause`}`;
  };
  const xy = (x: number, z: number) => [375 + (x - cx) / span * 750, 375 + (z - cz) / span * 750] as const;
  const draw = (result: { x: number; z: number; inWay: boolean; stopped: boolean }) => {
    ctx.fillStyle = '#24382d'; ctx.fillRect(0, 0, 750, 750);
    // Town footprints are the same collision geometry consulted by production dodging.
    ctx.strokeStyle = '#506b58'; ctx.lineWidth = 1;
    for (const f of feet) {
      const [x,z] = xy(f.x, f.z); if (x < -100 || x > 850 || z < -100 || z > 850) continue;
      ctx.save(); ctx.translate(x,z); if (f.kind === 'cyl') { ctx.beginPath(); ctx.arc(0,0,f.r / span * 750,0,Math.PI * 2); ctx.stroke(); }
      else { ctx.rotate(-Math.atan2(f.s,f.c)); ctx.strokeRect(-f.hx / span * 750,-f.hz / span * 750,2*f.hx / span * 750,2*f.hz / span * 750); } ctx.restore();
    }
    ctx.strokeStyle = '#c8d8c3'; ctx.lineWidth = 2; ctx.beginPath();
    plan.route.forEach((p,i) => { const [x,y] = xy(...p); if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y); }); if (plan.loop) ctx.closePath(); ctx.stroke();
    const dot = (x: number,z: number,color: string,r: number) => { const q = xy(x,z); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(q[0],q[1],r,0,Math.PI*2); ctx.fill(); };
    dot(obstacle[0], obstacle[1], '#f1b77c', 7); dot(result.x,result.z,'#a5e4a0',6);
    output.textContent = `Speed ${state.speed.toFixed(2)} m/s · route ${state.metres.toFixed(1)} / ${state.length.toFixed(1)} m · dodge ${state.dodge.toFixed(2)} m · ${state.wait > 0 ? 'waiting at endpoint' : result.stopped ? 'stopping for obstacle' : result.inWay ? 'avoiding obstacle' : 'walking'}`;
  };
  select.addEventListener('change', reset);
  root.querySelector('[name=restart]')!.addEventListener('click', reset);
  root.querySelector('[name=remove]')!.addEventListener('click', () => { obstacle = [1e6, 1e6]; });
  root.querySelector('[name=pause]')!.addEventListener('click', event => { paused = !paused; (event.currentTarget as HTMLElement).textContent = paused ? 'Resume' : 'Pause'; });
  canvas.addEventListener('pointerdown', e => { const rect = canvas.getBoundingClientRect(); obstacle = [cx + ((e.clientX-rect.left)/rect.width - 0.5)*span, cz + ((e.clientY-rect.top)/rect.height - 0.5)*span]; });
  if (params.get('person') === 'watcher') { const i = plans.findIndex(p => p.who === 'tea_m01' && p.route.length > 40); if (i >= 0) select.value = String(i); }
  reset(); let last = performance.now(); let frame = 0;
  const tick = (now: number) => {
    if (!panel.isConnected) return;
    const dt = Math.min(0.05, (now-last)/1000); last = now;
    const target = Math.max(0, Math.min(3, Number(pace.value) || 0));
    const current = { ...plan, speed: target };
    const blocked = (x: number,z: number) => { const q = pushOut([x,z],feet,0.28); return q[0] !== x || q[1] !== z; };
    const p = paused ? { ...walkerAt(state,state.metres), inWay: false, stopped: false } : stepWalker(state,current,dt,obstacle,blocked);
    draw(p); frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  // Stop drawing if the host swaps out the workbench.
  new MutationObserver((_, observer) => { if (!panel.isConnected) { cancelAnimationFrame(frame); observer.disconnect(); } }).observe(document, { childList: true, subtree: true });
}
