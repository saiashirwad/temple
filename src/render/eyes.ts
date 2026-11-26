// Eyeshine: a pair of eyes in the dark between the trees, caught for a moment by your torch,
// green-gold and steady, and then gone. A deer, a civet, a jungle cat. Never anything that
// comes closer. Up to four pairs at once, their places and brightness set each frame, uploaded only when they change.

import { cameras, passes } from '@typegpu/kit';
import { d, std, tgpu, type TgpuRoot } from 'typegpu';

const MAX = 16;
const Corner = d.struct({ position: d.vec4f, uv: d.vec2f, glow: d.f32 });
const Seen = d.struct({ color: d.vec4f });

export function createEyes(root: TgpuRoot) {
  const data = new Float32Array(MAX * 4);
  const buffer = root.createUniform(d.arrayOf(d.vec4f, MAX));
  /** Whether `data` changed since the last upload. Starts set so the first write() uploads. */
  let dirty = true;

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
    label: 'eyes',
    Vertex: Corner,
    at: (vertexIndex: number, instanceIndex: number) => {
      'use gpu';
      const e = buffer.$[instanceIndex];
      const cam = cameras.current.$;
      const dist = std.length(cam.position - e.xyz);
      // Small as an eye, but never smaller than a pixel or two
      const size = std.max(0.018, dist * 0.0013) * std.select(d.f32(0), d.f32(1), e.w > 0.001);
      const q = quad.$[vertexIndex];
      const world = e.xyz + cam.right * q.x * size + cam.up * q.y * size * 0.8;

      return Corner({ position: cameras.toClip(world), uv: q, glow: e.w });
    },
    pixelOf: (corner) => {
      'use gpu';
      const r = std.length(corner.uv);

      if (r > 1) {
        std.discard();
      }

      const k = std.smoothstep(1, 0.55, r);

      return Seen({ color: d.vec4f(d.vec3f(5, 7, 1.6) * k * corner.glow, 1) });
    },
    color: passes.shaded,
    draw: (pass) => pass.draw(6, MAX),
  };

  return {
    drawing,
    /** Sets eye `i` at x, y, z with brightness `glow` (0 hides it). */
    set(i: number, x: number, y: number, z: number, glow: number) {
      const k = i * 4;

      // Compare in f32, as stored, so an unchanged value never marks it dirty
      if (data[k] === Math.fround(x) && data[k + 1] === Math.fround(y) && data[k + 2] === Math.fround(z) && data[k + 3] === Math.fround(glow)) return;
      data[k] = x;
      data[k + 1] = y;
      data[k + 2] = z;
      data[k + 3] = glow;
      dirty = true;
    },
    /** Uploads the eyes, only when something changed since last time. */
    write() {
      if (!dirty) return;
      dirty = false;
      // array<vec4f, 16> has no padding: the Float32Array is the buffer's layout, copied as is
      buffer.write(data);
    },
    max: MAX,
    /** The first pairs are the forest's chance sightings; after them, the wolves'. */
    chance: 8,
  };
}
