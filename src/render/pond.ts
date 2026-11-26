// The temple pond: laterite steps going down to still black water that mirrors the lamps, the
// palms and the moon. The mirror is a second pass through the camera reflected about y = 0.

import { cameras, Camera, passes, targets, type OrbitCamera, type Frame, type Lighting, type SizeSource } from '@typegpu/kit';
import type { Inject } from '@typegpu/kit/inject';
import { memo } from '@typegpu/kit/memo';
import { perlin2d } from '@typegpu/noise';
import { d, std, tgpu, type TgpuRoot, type TgpuTexture, type TgpuUniform } from 'typegpu';
import { pondQGpu } from '../world/terrain.ts';
import { mirrored } from './surfaces.ts';
import { POND } from '../content/world.ts';
import { Q } from './quality.ts';

const MIRROR_SCALE = Q.mirrorScale;
const DEEP = d.vec3f(0.002, 0.004, 0.004);

const Picture = tgpu.bindGroupLayout({
  picture: { texture: d.texture2d(d.f32) },
  smooth: { sampler: 'filtering' },
});

const reflectionOf = (view: d.Infer<typeof Camera>) => {
  'use gpu';
  const flip = d.vec4f(-1, 1, 1, 1);
  const m = view.viewProjection;
  return Camera({
    viewProjection: d.mat4x4f(m.columns[0] * flip, m.columns[1] * flip * -1, m.columns[2] * flip, m.columns[3] * flip),
    position: view.position * d.vec3f(1, -1, 1),
    right: view.right * d.vec3f(-1, 1, -1),
    up: view.up * d.vec3f(1, -1, 1),
  });
};

const Corner = d.struct({ position: d.vec4f, world: d.vec3f, clip: d.vec4f });
const Seen = d.struct({ color: d.vec4f });

const quad = tgpu.const(
  d.arrayOf(d.vec2f, 6),
  [
    [0, 0],
    [1, 1],
    [1, 0],
    [0, 0],
    [0, 1],
    [1, 1],
  ].map(([x, z]) => d.vec2f(x!, z!)),
);

const ripplesAt = (p: d.v2f, t: number) => {
  'use gpu';
  return perlin2d.sample(p * 0.9 + d.vec2f(t * 0.05, t * 0.03)) * 0.015 + perlin2d.sample(p * 3.1 - d.vec2f(t * 0.11, -t * 0.07)) * 0.006;
};

export function createPond(root: TgpuRoot, opts: { view: OrbitCamera; light: Lighting; size: SizeSource; time: TgpuUniform<d.F32>; shared: passes.Options['shared'] }) {
  const { view, light, size, time } = opts;
  const mirror = targets.create(root, size, {
    hdr: { format: 'rgba16float', sampled: true, scale: MIRROR_SCALE },
    depth: { format: 'depth24plus', scale: MIRROR_SCALE },
  });
  const reflectedView = () => {
    'use gpu';
    return reflectionOf(view.uniform.$);
  };
  const reflected: Inject = (cfg) => cfg.with(cameras.current, reflectedView).with(mirrored, true);
  const eye: [number, number, number] = [0, 0, 0];
  const bounds = POND.r * 1.5;
  let visible = false;
  function inView(x: number, y: number, z: number, yaw: number, pitch: number) {
    const dx = POND.x - x, dy = -y, dz = POND.z - z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= bounds) return true;
    const aspect = size.width / Math.max(1, size.height);
    const halfAngle = Math.atan(Math.tan(view.pose.fov / 2) * Math.hypot(1, aspect));
    const forward = -(dx * Math.sin(yaw) + dz * Math.cos(yaw)) * Math.cos(pitch) - dy * Math.sin(pitch);
    return forward > distance * Math.cos(Math.min(Math.PI, halfAngle + Math.asin(bounds / distance) + 0.05));
  }
  let approached = false;
  function updateVisibility(afterFirstFrame = false) {
    cameras.eyeOf(view.pose, eye);
    visible = inView(eye[0], eye[1], eye[2], view.pose.yaw, view.pose.pitch);
    // Approaching the bank, warm before a turn can expose the water. Distant forest
    // views can stay there indefinitely without compiling or culling a mirror.
    if (afterFirstFrame && !visible && !approached && Math.hypot(POND.x - eye[0], POND.z - eye[2]) < 5 * POND.r) {
      approached = true;
      void prepare().catch(error => console.warn('Pond reflection', error));
    }
  }
  updateVisibility();
  const reflection = passes
    .create(root, mirror, { hdr: passes.color, depth: passes.depth }, { label: 'mirror', shared: opts.shared, enabled: () => visible })
    .pipe(reflected)
    .beneath(light.inject());

  let warm: Promise<void> | undefined;
  let warming = false;
  function prepare() {
    if (!warm) {
      warming = true;
      warm = reflection.initAsync().catch(error => {
        warm = undefined;
        throw error;
      }).finally(() => { warming = false; });
    }
    return warm;
  }

  const smooth = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const groupOf = memo((picture: TgpuTexture & { usableAsSampled: true }) => root.createBindGroup(Picture, { picture, smooth }));

  const reach = POND.r * 1.4;
  const lo = d.vec2f(POND.x - reach, POND.z - reach);
  const hi = d.vec2f(POND.x + reach, POND.z + reach);

  const water: passes.Drawing<typeof Corner, d.Infer<typeof Seen>> = {
    label: 'water',
    Vertex: Corner,
    at: (vertexIndex: number, _instanceIndex: number) => {
      'use gpu';
      const q = quad.$[vertexIndex];
      const world = d.vec3f(std.mix(lo.x, hi.x, q.x), 0, std.mix(lo.y, hi.y, q.y));
      const clip = cameras.toClip(world);
      return Corner({ position: clip, world, clip });
    },
    pixelOf: (corner) => {
      'use gpu';
      if (pondQGpu(corner.world.xz) > 1.12) {
        std.discard();
      }
      const toEye = cameras.current.$.position - corner.world;
      const distance = std.length(toEye);
      const toward = toEye / distance;
      const p = corner.world.xz;
      const e = 0.05;
      const h = ripplesAt(p, time.$);
      const dx = ripplesAt(p + d.vec2f(e, 0), time.$) - h;
      const dz = ripplesAt(p + d.vec2f(0, e), time.$) - h;
      const normal = std.normalize(d.vec3f(-dx, e, -dz));
      const screen = (corner.clip.xy / corner.clip.w) * d.vec2f(-0.5, -0.5) + 0.5;
      const shift = (normal.xz * 0.6) / std.max(distance, 4.0);
      const above = std.textureSampleLevel(Picture.$.picture, Picture.$.smooth, screen + shift, 0).xyz;
      const cosine = std.saturate(std.dot(normal, toward));
      const fresnel = 0.02 + 0.98 * std.pow(1 - cosine, 5);
      const tint = d.vec3f(0.85, 0.95, 0.9);
      const color = DEEP + above * tint * std.mix(0.25, 1.0, fresnel);
      return Seen({ color: d.vec4f(color, 1) });
    },
    color: passes.shaded,
    draw(pass) {
      pass.setBindGroup(groupOf(mirror.textures.hdr));
      pass.draw(6);
    },
  };

  return {
    reflection,
    water,
    updateVisibility, inView, prepare,
    get prepareActors() { return visible || warm !== undefined; },
    get waitingForPicture() { return visible && warming; },
    record(frame: Frame, drawn: readonly passes.Drawn[]) {
      if (!visible) return;
      mirror.fit();
      reflection.record(frame, drawn);
    },
    initAsync: () => visible ? prepare() : Promise.resolve(),
    destroy() {
      mirror.destroy();
    },
  };
}
