import { buildBungalow, noteAt, placeBungalow } from '../bungalow.ts';
import { Builder } from '../geo.ts';
import placement from '../content/bungalow-placement.json';
import { CLEARING } from '../trail.ts';
import { exportSettings, slider } from './settings.ts';

export function mount(root: HTMLElement) {
  const settings = { ...placement };
  const controls = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 540;
  const ctx = canvas.getContext('2d')!;
  const status = document.createElement('p');
  function draw() {
    const at = placeBungalow(settings);
    const builder = new Builder();
    const { lamps } = buildBungalow(builder, at);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#19251f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const project = (x: number, z: number) => [360 + (x - CLEARING.x) * 10, 270 + (z - CLEARING.z) * 10] as const;
    for (const solid of builder.solids) {
      ctx.save();
      ctx.translate(...project(solid.c[0], solid.c[2]));
      ctx.fillStyle = '#b8bc9e44';
      if (solid.kind === 'box') {
        ctx.rotate(-solid.yaw);
        ctx.fillRect(-10 * solid.h[0], -10 * solid.h[2], 20 * solid.h[0], 20 * solid.h[2]);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, solid.r * 10, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }
    function dot(x: number, z: number, color: string, title?: string) {
      const [px, py] = project(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, 2 * Math.PI);
      ctx.fill();
      if (title) { ctx.font = '14px system-ui'; ctx.fillText(title, px + 8, py - 5); }
    }
    for (const lamp of lamps) dot(lamp.position[0], lamp.position[2], '#ffc363');
    const note = noteAt(at);
    dot(note.x, note.z, '#fff7da', 'Cook’s note');
    dot(CLEARING.x, CLEARING.z, '#88d8ba', 'Trail end');
    status.textContent = 'Collision footprints and lamps · floor ' + at.floor.toFixed(2) + ' m · note at ' + note.x.toFixed(2) + ', ' + note.z.toFixed(2);
  }
  slider(controls, 'Across trail (m)', settings.right, -12, 12, 0.25, value => { settings.right = value; draw(); });
  slider(controls, 'Along trail (m)', settings.forward, -8, 20, 0.25, value => { settings.forward = value; draw(); });
  slider(controls, 'Turn (degrees)', settings.turn, 0, 360, 1, value => { settings.turn = value; draw(); });
  exportSettings(controls, 'bungalow-placement.json', settings);
  root.append(controls, status, canvas);
  draw();
}
