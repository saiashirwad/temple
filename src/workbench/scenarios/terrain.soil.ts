import { LAND, LAND_N, landMap } from '../../world/town/town.ts';
import soil from '../../content/soil.json';
import { exportSettings, numericSettings, setParam } from '../settings.ts';

const names = ['Swept yards', 'Murram lanes', 'Leaf litter', 'Paddy'];
export const title = 'Town soil and ground cover';

export function mount(root: HTMLElement, params: URLSearchParams) {
  const controls = document.createElement('div');
  const channel = document.createElement('select');
  channel.setAttribute('aria-label', 'Ground cover channel');
  for (const name of ['Composite', ...names]) channel.add(new Option(name));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LAND_N;
  canvas.style.width = 'min(100%, 720px)';
  const ctx = canvas.getContext('2d')!;
  const status = document.createElement('p');
  status.textContent = 'Select a point to sample the four ground-cover channels.';
  const settings = numericSettings(controls, params, soil, [
    ['laneShoulder', 'Lane shoulder (m)', 0, 4, 0.1],
    ['yardFeather', 'Yard edge (m)', 0, 4, 0.1],
    ['litterFeather', 'Litter edge (m)', 0, 6, 0.1],
    ['paddyEdge', 'Paddy inner radius', 0.5, 0.99, 0.01],
  ], () => { mask = landMap(settings); paint(); });
  let mask = landMap(settings);
  const channels = ['composite', 'yards', 'lanes', 'litter', 'paddy'];
  const selected = params.get('channel') ?? channels[0];
  if (!channels.includes(selected)) throw new Error(`Unknown soil channel: ${selected}`);
  channel.selectedIndex = channels.indexOf(selected);
  function paint() {
    const image = ctx.createImageData(LAND_N, LAND_N);
    const palette = [
      [173, 94, 63],
      [208, 155, 96],
      [107, 98, 49],
      [126, 160, 84],
    ];
    for (let i = 0; i < image.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let value = 29 + c;
        for (let j = 0; j < 4; j++) {
          const weight = mask.pixels[i + j]! / 255;
          if (channel.selectedIndex === 0 || channel.selectedIndex === j + 1) value += (palette[j]![c]! - value) * weight;
        }
        image.data[i + c] = value;
      }
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }
  channel.onchange = () => {
    setParam('channel', channels[channel.selectedIndex]);
    paint();
  };
  controls.append(channel);
  exportSettings(controls, 'soil.json', settings);
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(LAND_N - 1, Math.floor(((e.clientX - rect.left) * LAND_N) / rect.width));
    const z = Math.min(LAND_N - 1, Math.floor(((e.clientY - rect.top) * LAND_N) / rect.height));
    const k = (z * LAND_N + x) * 4;
    status.textContent =
      [x, z].map((v) => (((v + 0.5) * 2 * LAND) / LAND_N - LAND).toFixed(1)).join(', ') +
      ' m · ' +
      names.map((n, i) => n + ' ' + Math.round((100 * mask.pixels[k + i]!) / 255) + '%').join(' · ');
  };
  root.append(controls, status, canvas);
  paint();
}
