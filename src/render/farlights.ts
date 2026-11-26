// Lamps seen from far off: from the hills the town's lamps, a watcher's fire across the valley
// and a hamlet's windows are points of light, too small for their own meshes to show and too
// faint to beat the haze. Each is drawn here as a dot of fixed size on screen, fading in only
// beyond the distance where the lamp itself is seen, pulled a little toward the eye so the
// palms round it don't swallow it: lights glint through trees at night.

import { cameras, passes } from '@typegpu/kit';
import { d, std, tgpu } from 'typegpu';

const Corner = d.struct({ position: d.vec4f, uv: d.vec2f, color: d.vec3f });
const Seen = d.struct({ color: d.vec4f });

export type FarLight = { at: readonly [number, number, number]; color: readonly [number, number, number]; strength: number };

/**
 * `wanderer` is one more light that moves: xyz where it is, w how bright (0 for none). It's the
 * last instance, drawn at any distance.
 */
export function createFarLights(lights: FarLight[], time: { $: number }, wanderer: { $: d.v4f }) {
  const m = Math.max(lights.length, 1);
  const n = m + 1;

  const fallback: FarLight = { at: [0, -999, 0], color: [0, 0, 0], strength: 0 };
  const sources = lights.length ? lights : [fallback];

  const where = tgpu.const(
    d.arrayOf(d.vec4f, m),
    sources.map((l, i) => d.vec4f(l.at[0], l.at[1], l.at[2], i * 0.618)),
  );

  const tint = tgpu.const(
    d.arrayOf(d.vec3f, m),
    sources.map((l) => d.vec3f(l.color[0] * l.strength, l.color[1] * l.strength, l.color[2] * l.strength)),
  );

  const quad = tgpu.const(
    d.arrayOf(d.vec2f, 6),
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) => d.vec2f(x!, y!)),
  );

  const drawing: passes.Drawing<typeof Corner, d.Infer<typeof Seen>> = {
    label: 'far lights',
    Vertex: Corner,
    at: (vertexIndex: number, instanceIndex: number) => {
      'use gpu';
      const last = instanceIndex === n - 1;
      const wv = wanderer.$;
      const w = std.select(where.$[std.min(instanceIndex, m - 1)], d.vec4f(wv.xyz, 0.37), last);
      const cam = cameras.current.$;
      const toEye = cam.position - w.xyz;
      const dist = std.length(toEye);
      // Only from far off; near, the lamp's own mesh and light show it
      const show = std.select(std.smoothstep(55, 90, dist), std.smoothstep(12, 30, dist), last);
      // A few pixels across wherever it is, a gentle shimmer through the air
      const shimmer = 0.85 + 0.15 * std.sin(time.$ * (2.1 + std.fract(w.w) * 2) + w.w * 40);
      // The wanderer is drawn just beyond the clearing, on the line to where it really is, so
      // the forest between doesn't hide it: a light seen through the trees
      const near = d.f32(5);
      const size = std.select(dist * 0.0021, near * 0.012, last) * show;
      const pull = (toEye / dist) * std.select(std.min(dist * 0.08, 16), std.max(dist - near, 0), last);
      const q = quad.$[vertexIndex];
      const world = w.xyz + pull + cam.right * q.x * size + cam.up * q.y * size;
      const fade = std.exp(-dist * 0.0016);
      const color = std.select(tint.$[std.min(instanceIndex, m - 1)], d.vec3f(1, 0.6, 0.28) * wv.w, last);

      return Corner({ position: cameras.toClip(world), uv: q, color: color * shimmer * fade * show });
    },
    pixelOf: (corner) => {
      'use gpu';
      const r = std.length(corner.uv);

      // Opaque, so only the bright heart is drawn; bloom gives it its halo
      if (r > 0.55) {
        std.discard();
      }

      const k = 0.35 + 0.65 * (1 - r / 0.55);

      return Seen({ color: d.vec4f(corner.color * k, 1) });
    },
    color: passes.shaded,
    draw: (pass) => pass.draw(6, n),
  };

  return drawing;
}
