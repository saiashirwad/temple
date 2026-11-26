// The temple pond: laterite steps going down to still black water that mirrors the lamps, the
// palms and the moon. The mirror is a second pass through the camera reflected about y = 0.

import { cameras, Camera, passes, targets, type CameraBase, type Frame, type Lighting, type SizeSource } from '@typegpu/kit';
import type { Inject } from '@typegpu/kit/inject';
import { memo } from '@typegpu/kit/memo';
import { perlin2d } from '@typegpu/noise';
import { d, std, tgpu, type TgpuRoot, type TgpuTexture, type TgpuUniform } from 'typegpu';
import { Builder, hex, P, rng } from './geo.ts';
import { GHAT, POND_FLOOR, pondQ, pondQGpu, pondR } from '../world/terrain.ts';
import { mirrored } from './surfaces.ts';
import { GROUND, M, POND } from '../content/world.ts';
import { Q } from './quality.ts';

const MIRROR_SCALE = Q.mirrorScale;
const DEEP = d.vec3f(0.002, 0.004, 0.004);

const Picture = tgpu.bindGroupLayout({
  picture: { texture: d.texture2d(d.f32) },
  smooth: { sampler: 'filtering' },
});

const LILY = { color: hex(0x1d3a14), roughness: 0.35, pattern: P.LILY, doubleSided: true };
const LOTUS = { color: hex(0xe8a0b4), roughness: 0.6, pattern: P.PLAIN, doubleSided: true };
const LOTUS_HEART = { color: hex(0xe8c040), roughness: 0.6, pattern: P.PLAIN };

/** The bathing ghat on the temple side, lily pads and a few lotus flowers on the water. */
export function buildPond() {
  const b = new Builder(true);
  const r = rng(21);
  const { x0, step, rise, count, half } = GHAT;
  for (let i = 0; i <= count; i++) {
    const top = GROUND - i * rise;
    const xa = x0 + i * step;
    const len = i === count ? 2.2 : step;
    b.box(M.pondStone, [xa + len / 2, (top + POND_FLOOR) / 2, POND.z], [len / 2, (top - POND_FLOOR) / 2, half], 'y-');
  }
  // Laterite parapets down both sides, stepping down with the flight
  for (const s of [-1, 1]) {
    for (let i = 0; i <= count; i++) {
      const top = GROUND - i * rise + 0.55;
      const xa = x0 - 1.2 + i * step;
      const len = i === 0 ? 1.2 + step : step;
      b.box(M.laterite, [xa + len / 2, (top + POND_FLOOR) / 2, POND.z + s * (half + 0.3)], [len / 2 + 0.01, (top - POND_FLOOR) / 2, 0.3], 'y-');
    }
  }
  // Lily pads in drifts near the banks, each a disc with a notch
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2;
    const at = 0.55 + r() * 0.3;
    const cx = POND.x + Math.cos(a) * pondR(a) * at;
    const cz = POND.z + Math.sin(a) * pondR(a) * at;
    if (Math.abs(cz - POND.z) < half + 1.5 && cx < POND.x - 5) continue;
    const n = 10 + Math.floor(r() * 16);
    for (let i = 0; i < n; i++) {
      const px = cx + (r() - 0.5) * 4.5;
      const pz = cz + (r() - 0.5) * 4.5;
      if (pondQ(px, pz) > 0.86) continue;
      const rad = 0.16 + r() * 0.2;
      const turn = r() * Math.PI * 2;
      const y = 0.012 + r() * 0.006;
      b.surface(LILY, 10, 1, (u, v) => {
        const t = turn + 0.35 + u * (Math.PI * 2 - 0.7);
        const rr = rad * v;
        return [px + Math.cos(t) * rr, y + v * v * 0.01, pz + Math.sin(t) * rr];
      });
      if (r() < 0.07) {
        // A lotus: two rings of cupped petals round a golden heart
        const fx = px + 0.1;
        const fz = pz;
        const fy = 0.1;
        b.blob(LOTUS_HEART, [fx, fy + 0.04, fz], [0.035, 0.025, 0.035], 6, 3);
        for (let ring = 0; ring < 2; ring++) {
          const np = ring ? 6 : 8;
          for (let j = 0; j < np; j++) {
            const ta = (j / np) * Math.PI * 2 + ring * 0.4;
            const lean = ring ? 0.35 : 0.8;
            const len = ring ? 0.11 : 0.13;
            b.surface(LOTUS, 3, 3, (u, v) => {
              const w = Math.sin(Math.PI * v) * 0.045 * (1 - u * 0.4);
              const along = u * len;
              const out = Math.sin(lean) * along;
              const up = Math.cos(lean) * along + u * u * 0.02;
              const side = (v - 0.5) * 2 * w;
              const cup = -Math.abs((v - 0.5) * 2) * 0.012;
              return [fx + Math.cos(ta) * (out - cup) - Math.sin(ta) * side, fy + up, fz + Math.sin(ta) * (out - cup) + Math.cos(ta) * side];
            });
          }
        }
        b.tube(LILY, [fx, 0, fz], 0.012, 0.012, fy, 5);
      }
    }
  }
  return b.model();
}

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

export function createPond(root: TgpuRoot, opts: { view: CameraBase & { uniform: TgpuUniform<typeof Camera> }; light: Lighting; size: SizeSource; time: TgpuUniform<d.F32>; shared: passes.Options['shared'] }) {
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
  const reflection = passes
    .create(root, mirror, { hdr: passes.color, depth: passes.depth }, { label: 'mirror', shared: opts.shared })
    .pipe(reflected)
    .beneath(light.inject());

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
    record(frame: Frame, drawn: readonly passes.Drawn[]) {
      mirror.fit();
      reflection.record(frame, drawn);
    },
    initAsync: () => reflection.initAsync(),
    destroy() {
      mirror.destroy();
    },
  };
}
