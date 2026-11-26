// The wet night air of Kerala, lit: each lamp near the eye wrapped in its own soft halo of
// moisture, worked out exactly for a light in uniform air and cut off by whatever stands between,
// and the moon's light falling in faint shafts through the palms, marched through its shadow.
// Drawn additively into the scene's picture before TAA, which smooths the march's dither.

import { cameras, shading, type CameraBase, type Frame, type Lighting, type targets } from '@typegpu/kit';
import { memo } from '@typegpu/kit/memo';
import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';
import { Q } from './quality.ts';

/** The most lamp halos drawn by default (fewer on phones): `values.count` must not exceed it. */
export const HALOS = Q.halos;

export function createAtmosphere(
  root: TgpuRoot,
  view: CameraBase,
  light: Lighting,
  format: GPUTextureFormat,
  shared: { layout: never; group: () => never },
  /** Moon-shaft march steps and lamp halos at most. */
  { steps = Q.steps, halos = HALOS }: { steps?: number; halos?: number } = {},
) {
  const STEPS = steps;
  const HALOS = halos;
  const Air = d.struct({
    /** Lamps: position and range, and colour times intensity. */
    at: d.arrayOf(d.vec4f, HALOS),
    glow: d.arrayOf(d.vec4f, HALOS),
    count: d.u32,
    frame: d.u32,
    /** How thick the air is with lamplight, and with moonlight. */
    lampDensity: d.f32,
    moonDensity: d.f32,
    moon: d.vec3f,
  });
  const layout = tgpu.bindGroupLayout({
    depth: { texture: d.textureDepth2d() },
    air: { uniform: Air },
  });
  const air = root.createUniform(Air);
  const values = {
    at: Array.from({ length: HALOS }, () => d.vec4f()),
    glow: Array.from({ length: HALOS }, () => d.vec4f()),
    count: 0,
    frame: 0,
    lampDensity: 0.006,
    moonDensity: 0.0024,
    moon: d.vec3f(0.36, 0.5, 0.85),
  };

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f, position: d.builtin.position },
    out: d.vec4f,
  })(({ uv, position }) => {
    'use gpu';
    const a = layout.$.air;
    const pixel = d.vec2i(position.xy);
    const z = std.textureLoad(layout.$.depth, pixel, 0);
    const camera = cameras.current.$;
    const ray = cameras.rayOf(camera, uv * d.vec2f(2, -2) + d.vec2f(-1, 1));
    const far = cameras.distanceOf(camera, z) / std.max(0.1, std.dot(ray.direction, cameras.forwardOf(camera)));
    // Each lamp's halo: the in-scattered light of a point source along the ray, in closed form
    let lit = d.vec3f(0);
    for (let i = d.u32(0); i < a.count; i++) {
      const L = a.at[i];
      const toL = L.xyz - ray.origin;
      const tc = std.dot(toL, ray.direction);
      const h2 = std.max(std.dot(toL, toL) - tc * tc, 0.0025);
      const h = std.sqrt(h2);
      const T = std.min(far, L.w);
      const span = (std.atan((T - tc) / h) - std.atan(-tc / h)) / h;
      // Halos fade out with the lamp's own reach, so a far lamp doesn't fill the sky
      const reach = 1 - std.smoothstep(L.w * 0.1, L.w * 0.55, h);
      lit += a.glow[i].xyz * std.max(span, 0) * reach;
    }
    lit = lit * a.lampDensity;
    // Moonlight shafts: march the moon's shadow, a little denser near the ground
    const dist = std.min(far, 40);
    const n = std.fract(52.98292 * std.fract(0.06711 * position.x + 0.00584 * position.y) + d.f32(a.frame % 64) * 0.618034);
    let beam = d.f32(0);
    for (let s = d.u32(0); s < STEPS; s++) {
      // Steps packed closer near the eye, where a shaft between two trunks is widest on screen
      const u = (d.f32(s) + n) / d.f32(STEPS);
      const t = dist * std.pow(u, 1.6);
      const stride = (dist * 1.6 * std.pow(std.max(u, 0.02), 0.6)) / d.f32(STEPS);
      const w = ray.origin + ray.direction * t;
      // The damp air under the canopy carries the light; above the palms it thins to nothing, so
      // open sky keeps its depth and the beams read where the leaves cut them
      const thick = std.exp(-std.max(w.y - 0.9, 0) * 0.08) * (1 - std.smoothstep(13, 22, w.y));
      beam += shading.sunShare(shading.pointAt(w, d.vec3f(0, 1, 0))) * thick * stride;
    }
    // Mostly forward scattering, as in real mist: faint looking away, bright toward the moon
    const toward = std.saturate(std.dot(ray.direction, shading.towardsSun()));
    const facing = std.pow(toward, 8) * 4 + std.pow(toward, 2) * 0.8;
    lit += a.moon * (beam * a.moonDensity * (0.25 + facing));
    return d.vec4f(std.min(lit, d.vec3f(8)), 0);
  });

  const pipeline = root
    .pipe(view.inject())
    .pipe(light.inject())
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment,
      targets: {
        format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
        },
      },
    });
  const bound = memo((depth: targets.Depth) => pipeline.with(root.createBindGroup(layout, { depth, air })));

  return {
    values,
    /** How many halos `values` holds at most. */
    halos: HALOS,
    initAsync: () => pipeline.initAsync(),
    /** Adds the air's light over `color`, reading `depth`, within `region`. */
    record(frame: Frame, color: GPUTextureView | (() => GPUTextureView), depth: targets.Depth, region: { width: number; height: number }) {
      values.frame++;
      air.write(values);
      const pass = frame.encoder.beginRenderPass({ colorAttachments: { view: typeof color === 'function' ? color() : color, loadOp: 'load', storeOp: 'store' } } as never);
      pass.setViewport(0, 0, region.width, region.height, 0, 1);
      pass.setBindGroup(shared.layout, shared.group());
      pass.setPipeline(bound(depth));
      pass.draw(3);
      pass.end();
    },
    bound,
    destroy() {
      air.buffer.destroy();
    },
  };
}
