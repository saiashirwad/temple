import '../forest.css';
// A top-down inspection of the same placements the game builds, without a GPU.
import { buildGrounds } from '../../world/town/grounds.ts';
import { buildVillage } from '../../world/town/village.ts';
import { inPlantingDensity, plantAll } from '../../world/vegetation/planting.ts';
import { meadowPlaces } from '../../world/vegetation/meadow.ts';
import { landMap } from '../../world/town/town.ts';
import { trailAt, TRAIL_LENGTH } from '../../world/trail/trail.ts';
import { BRIDGE } from '../../world/trail/bridge.ts';
import VEGETATION from '../../content/vegetation.json';

const colors: Record<string, string> = { trees: '#8bd88c', far: '#4f8f71', plants: '#e4ba6e', grass: '#99a967' };
type Point = { at: readonly number[]; name: string; group: string };

export const title = 'Forest distribution';

export async function mount(root: HTMLElement, params: URLSearchParams) {
  root.innerHTML = `
<section class="forest-workbench">
  <p>Choose a region to inspect its plant distribution. Rebuild after changing the seed.</p>
  <div class="forest-controls">
    <label>Seed <input name="seed" type="number" step="1" value="${VEGETATION.seed}" /></label
    ><button type="button" name="rebuild">Rebuild layout</button
    ><label
      >Placement density <input name="density" type="range" min="0" max="100" value="${VEGETATION.density * 100}" /><output
        >${VEGETATION.density * 100}%</output
      ></label
    ><label
      >Show
      <select name="group">
        <option value="all">All placements</option>
        <option value="trees">Near trees</option>
        <option value="far">Far trees</option>
        <option value="plants">Plants</option>
        <option value="grass">Meadow grass</option>
      </select></label
    ><label
      >Region
      <select name="region">
        <option value="world">Whole map</option>
        <option value="bridge">Bridge</option>
      </select></label
    ><label><input name="grass" type="checkbox" checked /> Show grass</label
    ><button type="button" name="export">Export settings</button
    ><button type="button" name="export-content">Export vegetation JSON</button>
  </div>
  <label
    >Settings JSON <textarea name="settings" rows="3" style="display: block; width: min(100%, 700px)"></textarea></label
  ><button type="button" name="apply">Apply settings</button>
  <p class="forest-share"></p>
  <p class="forest-key">
    <span style="--c: ${colors.trees}">Near trees</span><span style="--c: ${colors.far}">Far trees / cards</span
    ><span style="--c: ${colors.plants}">Plants</span><span style="--c: #99a967">Meadow grass</span
    ><span style="--c: #f4e5c3">Trail</span>
  </p>
  <div role="status" class="forest-status">Building production layout…</div>
  <div class="forest-layout">
    <canvas width="800" height="800" aria-label="Top-down map of plant placements"></canvas>
    <div>
      <h2>Visible placements</h2>
      <p class="forest-total"></p>
      <table>
        <tbody></tbody>
      </table>
    </div>
  </div>
</section>`;
  const seed = root.querySelector<HTMLInputElement>('[name=seed]')!;
  const density = root.querySelector<HTMLInputElement>('[name=density]')!;
  const group = root.querySelector<HTMLSelectElement>('[name=group]')!;
  const status = root.querySelector<HTMLElement>('.forest-status')!;
  const region = root.querySelector<HTMLSelectElement>('[name=region]')!;
  const grass = root.querySelector<HTMLInputElement>('[name=grass]')!;
  const settings = root.querySelector<HTMLTextAreaElement>('[name=settings]')!;
  const share = root.querySelector<HTMLElement>('.forest-share')!;
  if (params.get('region') === 'bridge') region.value = 'bridge';
  if (params.get('grass') === '0') grass.checked = false;
  if (['trees', 'far', 'plants', 'grass'].includes(params.get('group') ?? '')) group.value = params.get('group')!;
  // Geometry inputs do not change with the seed; build them once per mount.
  const grounds = buildGrounds(),
    village = buildVillage(),
    land = landMap();
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const tbody = root.querySelector<HTMLTableSectionElement>('tbody')!;
  const total = root.querySelector<HTMLElement>('.forest-total')!;
  const parsedSeed = Number(params.get('seed'));
  if (params.has('seed') && Number.isSafeInteger(parsedSeed)) seed.value = String(parsedSeed);
  const parsedDensity = Number(params.get('density'));
  if (params.has('density') && Number.isFinite(parsedDensity)) density.value = String(Math.max(0, Math.min(100, parsedDensity)));
  let points: Point[] = [];
  const draw = () => {
    const fraction = Number(density.value) / 100;
    root.querySelector('output')!.textContent = `${density.value}%`;
    const span = region.value === 'bridge' ? 120 : 900;
    const centre = region.value === 'bridge' ? [BRIDGE.x, BRIDGE.z] : [0, 0];
    const selected = points.filter(
      (p) =>
        (grass.checked || p.group !== 'grass') &&
        (group.value === 'all' || p.group === group.value) &&
        Math.abs(p.at[0]! - centre[0]!) <= span / 2 &&
        Math.abs(p.at[2]! - centre[1]!) <= span / 2 &&
        inPlantingDensity(p.at, fraction),
    );
    ctx.fillStyle = '#26382d';
    ctx.fillRect(0, 0, 800, 800);
    const xy = (x: number, z: number) => [((x - centre[0]!) / span) * 800 + 400, ((z - centre[1]!) / span) * 800 + 400] as const;
    ctx.strokeStyle = '#f4e5c3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let d = 0; d <= TRAIL_LENGTH; d += 3) {
      const p = trailAt(d);
      const [x, y] = xy(p.x, p.z);
      if (d === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const counts = new Map<string, number>();
    for (const p of selected) {
      const [x, y] = xy(p.at[0]!, p.at[2]!);
      ctx.fillStyle = colors[p.group]!;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      const label = `${p.name} · ${p.group}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    total.textContent = `${selected.length.toLocaleString()} shown of ${points.length.toLocaleString()} total placements. Map spans ${span} × ${span} m; north is up (−z).`;
    tbody.replaceChildren(
      ...[...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => {
          const tr = document.createElement('tr');
          const a = document.createElement('td');
          const b = document.createElement('td');
          a.textContent = name;
          b.textContent = count.toLocaleString();
          tr.append(a, b);
          return tr;
        }),
    );
  };
  const rebuild = async () => {
    const value = Number(seed.value);
    if (!Number.isSafeInteger(value)) {
      status.textContent = 'Enter a whole-number seed.';
      return;
    }
    delete root.dataset.error;
    status.textContent = 'Building production layout…';
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    try {
      const p = plantAll(village.homes, grounds.gaps, village.tulsi, { seed: value, density: 1, distributionOnly: true });
      points = [
        ...p.trees.map((t) => ({ at: t.at, name: p.species.get(t.model) ?? 'unknown', group: 'trees' })),
        ...p.far.map((t) => ({ at: t.at, name: t.model ? (p.species.get(t.model) ?? t.kind) : `${t.kind} card`, group: 'far' })),
        ...p.plants.map((t) => ({ at: t.at, name: p.species.get(t.model) ?? 'unknown', group: 'plants' })),
        ...meadowPlaces(land.pixels, p.walked, { seed: value, density: 1 }).map((t) => ({
          at: t.at,
          name: t.length,
          group: 'grass',
        })),
      ];
      status.textContent = `Layout ready · seed ${value}`;
      draw();
    } catch (error) {
      root.dataset.error = String(error);
      status.textContent = `Could not build layout: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  root.querySelector('[name=rebuild]')!.addEventListener('click', () => void rebuild());
  density.addEventListener('input', draw);
  group.addEventListener('change', draw);
  region.addEventListener('change', draw);
  grass.addEventListener('change', draw);
  root.querySelector('[name=export]')!.addEventListener('click', () => {
    const data = {
      seed: Number(seed.value),
      density: Number(density.value),
      region: region.value,
      grass: grass.checked,
      group: group.value,
    };
    settings.value = JSON.stringify(data, null, 2);
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(data))
      url.searchParams.set(key, key === 'grass' ? (value ? '1' : '0') : String(value));
    share.textContent = `Share URL: ${url.href}`;
  });
  root.querySelector('[name=export-content]')!.addEventListener('click', () => {
    settings.value = JSON.stringify({ seed: Number(seed.value), density: Number(density.value) / 100 }, null, 2);
    share.textContent = 'Vegetation content JSON: save it as src/content/vegetation.json to use it in the game.';
  });
  root.querySelector('[name=apply]')!.addEventListener('click', () => {
    try {
      const data: unknown = JSON.parse(settings.value);
      if (!data || typeof data !== 'object') throw new Error('Expected a settings object');
      const d = data as Record<string, unknown>;
      if (
        !Number.isSafeInteger(d.seed) ||
        typeof d.density !== 'number' ||
        !Number.isFinite(d.density) ||
        d.density < 0 ||
        d.density > 100 ||
        !['world', 'bridge'].includes(String(d.region)) ||
        typeof d.grass !== 'boolean' ||
        !['all', 'trees', 'far', 'plants', 'grass'].includes(String(d.group))
      )
        throw new Error('Invalid settings');
      seed.value = String(d.seed);
      density.value = String(d.density);
      region.value = String(d.region);
      grass.checked = d.grass;
      group.value = String(d.group);
      void rebuild();
    } catch (error) {
      root.dataset.error = String(error);
      status.textContent = `Settings error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  await rebuild();
}
