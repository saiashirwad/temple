import { LAND, LAND_N, landMap } from '../town.ts';
import soil from '../content/soil.json';
import { exportSettings, slider } from './settings.ts';

const names = ['Swept yards', 'Murram lanes', 'Leaf litter', 'Paddy'];
export function mount(root: HTMLElement) {
  const settings = { ...soil };
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
  let mask = landMap(settings);
  function paint() {
    const image = ctx.createImageData(LAND_N, LAND_N);
    const palette = [[173, 94, 63], [208, 155, 96], [107, 98, 49], [126, 160, 84]];
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
  channel.onchange = paint;
  const update = (key: keyof typeof soil, value: number) => { settings[key] = value; mask = landMap(settings); paint(); };
  slider(controls, 'Lane shoulder (m)', settings.laneShoulder, 0, 4, .1, v => update('laneShoulder', v));
  slider(controls, 'Yard edge (m)', settings.yardFeather, 0, 4, .1, v => update('yardFeather', v));
  slider(controls, 'Litter edge (m)', settings.litterFeather, 0, 6, .1, v => update('litterFeather', v));
  slider(controls, 'Paddy inner radius', settings.paddyEdge, .5, .99, .01, v => update('paddyEdge', v));
  controls.append(channel);
  exportSettings(controls, 'soil.json', settings);
  canvas.onclick = e => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(LAND_N - 1, Math.floor((e.clientX - rect.left) * LAND_N / rect.width));
    const z = Math.min(LAND_N - 1, Math.floor((e.clientY - rect.top) * LAND_N / rect.height));
    const k = (z * LAND_N + x) * 4;
    status.textContent = [x, z].map(v => ((v + .5) * 2 * LAND / LAND_N - LAND).toFixed(1)).join(', ') + ' m · ' +
      names.map((n, i) => n + ' ' + Math.round(100 * mask.pixels[k + i]! / 255) + '%').join(' · ');
  };
  root.append(controls, status, canvas);
  paint();
}
