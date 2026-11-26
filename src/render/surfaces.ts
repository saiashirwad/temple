// What the built things are made of. Each pattern picks a baked tile (tools/tex): colour, normal
// and roughness, read along the mesh's metre UVs for roofs and wood or projected from the world
// for masonry and metal, tinted to the mesh's colour and varied over metres. Lights stay
// procedural, so they flicker.

import { instances, shading, type meshPool } from '@typegpu/kit';
import { perlin3d } from '@typegpu/noise';
import { d, std, tgpu } from 'typegpu';
import { P, TEXTURED } from './geo.ts';
import { POSTER_LAYER, SIGN_LAYER, type Tex } from './tex.ts';
import { TEX } from '../generated/textures.gen.ts';
import { RIVER } from '../generated/river.gen.ts';
import { breezeGpu, mainsGpu, oilGpu, sodiumBadGpu, tubeBadGpu, tubeGpu, tvGpu } from './flicker.ts';

/** Seconds since the scene started, filled by each renderer. */
export const now = tgpu.accessor(d.f32);

/** True while drawing the pond's mirror image, which drops whatever lies under the water. */
export const mirrored = tgpu.slot(false);

const n3 = (p: d.v3f) => {
  'use gpu';
  return perlin3d.sample(p);
};

/** Ripples on the river, carried downstream along x. */
const riverWave = (r: d.v2f, t: number) => {
  'use gpu';
  return perlin3d.sample(d.vec3f(r.x * 0.7 - t * 1.6, r.y * 1.4, t * 0.25)) * 0.05 + perlin3d.sample(d.vec3f(r.x * 2.3 - t * 2.4, r.y * 3.1, t * 0.6)) * 0.02;
};

/** Wall-plane coordinates: along the wall and up it, picked from the normal. */
const wallUv = (p: d.v3f, nrm: d.v3f) => {
  'use gpu';
  return d.vec2f(std.select(p.x, p.z, std.abs(nrm.x) > std.abs(nrm.z)), p.y);
};

/**
 * The patterns the tile chain in `defineBuilt` gives a baked tile, whose roughness and metalness
 * replace the Mat's. geo.ts merges meshes by `TEXTURED`, so the two must agree: keep this in step
 * with the chain, and the check below stops a drift at load.
 */
const TILED = [
  P.LATERITE, P.WATERSTONE, P.PLASTER, P.PAINT, P.CONCRETE, P.GRANITE, P.MURAL, P.BRASS, P.GOLD, P.STEEL,
  P.CLOTH, P.TILE, P.MTILE, P.COPPER, P.TIN, P.WOOD, P.LACQUER, P.POSTER, P.BOARD,
];
if (TILED.length !== TEXTURED.size || !TILED.every((p) => TEXTURED.has(p))) {
  throw new Error('surfaces.ts: the tiled patterns and geo.ts TEXTURED differ');
}

export function defineBuilt(pool: meshPool.MeshPool<{ pat: d.F32; col: d.Vec4f }>, tex: Tex) {
  return instances.define('Built', {
    carry: (vertexIndex) => {
      'use gpu';
      return d.vec4f(pool.extra.pat(vertexIndex), pool.extra.col(vertexIndex).xyz);
    },
    surface: (pixel, base) => {
      'use gpu';
      const raw = pixel.carried.x;
      const pat = d.i32(std.floor(raw + 0.5));
      const seed = raw - d.f32(pat);
      const p = pixel.point.position;
      const nrm = pixel.point.normal;
      const uv = pixel.point.uv;
      const t = now.$;
      const m = shading.Material(base);
      const tint = base.color * pixel.carried.yzw;
      m.color = d.vec3f(tint);

      // Which baked tile, and whether it follows the mesh's UVs (roofs, wood) or the world
      let layer = d.f32(-1);
      let useUv = false;
      if (pat === P.LATERITE || pat === P.WATERSTONE) {
        layer = TEX.laterite;
      } else if (pat === P.PLASTER) {
        layer = TEX.plaster;
      } else if (pat === P.PAINT) {
        layer = TEX.paint;
      } else if (pat === P.CONCRETE) {
        layer = TEX.concrete;
      } else if (pat === P.GRANITE) {
        layer = TEX.granite;
      } else if (pat === P.MURAL) {
        layer = TEX.mural;
      } else if (pat === P.BRASS || pat === P.GOLD) {
        layer = TEX.brass;
      } else if (pat === P.STEEL) {
        layer = TEX.steel;
      } else if (pat === P.CLOTH) {
        layer = TEX.cloth;
      } else if (pat === P.TILE) {
        layer = TEX.ctile;
        useUv = true;
      } else if (pat === P.MTILE) {
        layer = TEX.mtile;
        useUv = true;
      } else if (pat === P.COPPER) {
        layer = TEX.copper;
        useUv = true;
      } else if (pat === P.TIN) {
        layer = TEX.tin;
        useUv = true;
      } else if (pat === P.WOOD) {
        layer = TEX.teak;
        useUv = true;
      } else if (pat === P.LACQUER) {
        layer = TEX.lacquer;
        useUv = true;
      } else if (pat === P.POSTER) {
        layer = d.f32(POSTER_LAYER);
        useUv = true;
      } else if (pat === P.BOARD) {
        layer = d.f32(SIGN_LAYER);
        useUv = true;
      }
      const tx = tex.sample(std.max(layer, 0), nrm, p, uv, useUv);
      let normal = d.vec3f(nrm);

      if (layer >= 0) {
        // The tile, tinted to this mesh's colour where its mask allows, varied over metres so
        // repeats don't show, damp and algae rising from the ground on masonry
        const big = n3(p * 0.31);
        const own = d.vec3f(tx.color.xyz);
        const painted = tex.tinted(layer, tint, own);
        let c = d.vec3f(painted);
        if (tx.metal > 0.5) {
          m.metallic = tx.color.w;
        } else {
          c = std.mix(own, painted, tx.color.w);
          m.metallic = 0;
        }
        c = c * (0.86 + big * 0.28);
        const masonry = pat === P.LATERITE || pat === P.PLASTER || pat === P.PAINT || pat === P.CONCRETE || pat === P.GRANITE;
        const grime = std.saturate(1 - (p.y - 0.9) / 1.3) * std.smoothstep(-0.3, 0.4, big + n3(p * 1.7) * 0.4);
        if (masonry) c = std.mix(c, c * d.vec3f(0.22, 0.24, 0.18), grime * 0.6);
        m.roughness = tx.rough;
        if (pat === P.WATERSTONE) {
          // Pond stone: dark and slick below the waterline, mossy just above it
          const wet = 1 - std.smoothstep(0.0, 0.25, p.y);
          const moss = std.smoothstep(0.0, 0.35, p.y) * (1 - std.smoothstep(0.35, 0.8, p.y));
          c = std.mix(c, d.vec3f(0.03, 0.05, 0.02), moss * 0.7) * std.mix(1, 0.4, wet);
          m.roughness = std.mix(m.roughness, 0.15, wet);
        }
        if (pat === P.GOLD) m.roughness = m.roughness * 0.7;
        m.color = d.vec3f(c);
        normal = d.vec3f(tx.normal);
      } else if (pat === P.RIVER) {
        // The forest stream: black water running downstream, ripples drawn along with it and
        // pale foam where it breaks, catching the moon and a torch
        const flow = d.vec2f(RIVER.u[0], RIVER.u[1]);
        const side = d.vec2f(-flow.y, flow.x);
        const q = d.vec2f(std.dot(p.xz, flow), std.dot(p.xz, side));
        const e = d.f32(0.06);
        const h0 = riverWave(q, t);
        const ga = (riverWave(q + d.vec2f(e, 0), t) - h0) / e;
        const gb = (riverWave(q + d.vec2f(0, e), t) - h0) / e;
        const g = flow * ga + side * gb;
        normal = std.normalize(d.vec3f(-g.x, 1, -g.y));
        const foam = std.smoothstep(0.32, 0.6, perlin3d.sample(d.vec3f(q.x * 0.9 - t * 1.4, q.y * 2.2, t * 0.3)) + h0 * 4);
        m.color = std.mix(d.vec3f(0.012, 0.018, 0.016), d.vec3f(0.35, 0.38, 0.36), foam * 0.6);
        m.roughness = std.mix(0.04, 0.55, foam);
        m.metallic = 0;
      } else if (pat === P.BROOK) {
        // A brook running down the hill: its flow is down the sheet's own slope, quicker where
        // it's steep, broken white over the stones
        const down = nrm.xz * -1;
        const steep = std.length(down);
        const flow = std.select(d.vec2f(1, 0), down * (1 / std.max(steep, 0.001)), steep > 0.01);
        const side = d.vec2f(-flow.y, flow.x);
        const q = d.vec2f(std.dot(p.xz, flow), std.dot(p.xz, side)) * d.vec2f(1.6, 1.6);
        const speed = 1.5 + steep * 6;
        const e = d.f32(0.05);
        const h0 = riverWave(q, t * speed);
        const ga = (riverWave(q + d.vec2f(e, 0), t * speed) - h0) / e;
        const gb = (riverWave(q + d.vec2f(0, e), t * speed) - h0) / e;
        const gg = flow * ga + side * gb;
        normal = std.normalize(d.vec3f(-gg.x, 1, -gg.y) + nrm * 0.2);
        const foam = std.smoothstep(0.25 - steep * 0.6, 0.55, perlin3d.sample(d.vec3f(q.x * 1.3 - t * speed * 1.2, q.y * 2.5, t * 0.4)) + h0 * 4);
        m.color = std.mix(d.vec3f(0.012, 0.018, 0.016), d.vec3f(0.4, 0.42, 0.4), foam * 0.55);
        m.roughness = std.mix(0.04, 0.5, foam);
        m.metallic = 0;
      } else if (pat === P.GLASS) {
        // Its own near-black tint, so dark house and church panes and the lit street's share one mesh
        m.color = d.vec3f(tint);
        m.roughness = 0.06;
        m.metallic = 0;
      } else if (pat === P.SODIUM) {
        m.emission = base.emission * (0.7 + 0.3 * mainsGpu(t));
      } else if (pat === P.SODIUM_BAD) {
        const s = sodiumBadGpu(t, seed);
        const colour = std.mix(d.vec3f(9, 1.4, 1.2), base.emission, s.y);
        m.emission = colour * s.x;
      } else if (pat === P.TUBE || pat === P.CFL || pat === P.BULB) {
        let k = mainsGpu(t);
        if (pat === P.TUBE) k = k * tubeGpu(t, seed);
        m.emission = base.emission * k;
      } else if (pat === P.TUBE_BAD) {
        const k = tubeBadGpu(t, seed) * mainsGpu(t);
        // When the tube stutters its ends still glow orange
        const ends = std.smoothstep(0.4, 0.5, std.abs(std.fract(uv.x) - 0.5));
        m.emission = std.mix(d.vec3f(1.6, 0.5, 0.15) * ends, base.emission, k);
      } else if (pat === P.TV) {
        const k = tvGpu(t, seed);
        const n = std.floor(t * 0.6 + seed * 7);
        const hue = d.vec3f(0.6 + std.fract(n * 0.31) * 0.5, 0.7 + std.fract(n * 0.53) * 0.3, 1.0);
        m.emission = base.emission * hue * k;
      } else if (pat === P.SERIAL) {
        // A string of serial lights chasing in red, green, blue and amber
        const idx = std.floor((p.x + p.z) * 9.0);
        const colourAt = std.fract(idx * 0.25);
        let c = d.vec3f(6, 0.4, 0.3);
        if (colourAt > 0.2) c = d.vec3f(0.4, 5, 0.6);
        if (colourAt > 0.45) c = d.vec3f(0.5, 1.2, 7);
        if (colourAt > 0.7) c = d.vec3f(6, 3.2, 0.3);
        const step = std.floor(t * 2.6);
        const on = std.fract((idx + step) * 0.25) < 0.5;
        m.emission = c * std.select(d.f32(0.06), d.f32(1), on) * mainsGpu(t);
      } else if (pat === P.SIGN) {
        // A backlit signboard: dark letters in rows over a lit panel
        const q = wallUv(p, nrm);
        const letters = std.smoothstep(0.1, 0.25, n3(d.vec3f(q.x * 9, q.y * 5, seed * 40)));
        const rowMask = std.smoothstep(0.3, 0.2, std.abs(std.fract(q.y * 3.2) - 0.5));
        m.emission = base.emission * (1 - letters * rowMask * 0.85) * mainsGpu(t);
      } else if (pat === P.TAIL || pat === P.HEAD) {
        m.emission = d.vec3f(base.emission);
      }

      const moved = shading.Point(pixel.point);
      moved.normal = d.vec3f(normal);
      return instances.Shaded({ point: moved, material: m });
    },
  });
}

/**
 * Oil flames: teardrops that stretch, shrink and lean in the breeze. Their uv carries the
 * flame's height in millimetres plus its flicker seed in x, and the height up the flame in y.
 */
export function defineFlame() {
  return instances.define('Flame', {
    deform: (vertex) => {
      'use gpu';
      const v = vertex.uv.y;
      const mm = std.floor(vertex.uv.x);
      const seed = vertex.uv.x - mm;
      const tall = mm * 0.001;
      const base = vertex.position - d.vec3f(0, v * tall, 0);
      const w = base.x * 0.045 + base.z * 0.03;
      const f = oilGpu(now.$, seed, w);
      const lean = breezeGpu(now.$, seed, w);
      const up = v * tall * (0.55 + 0.45 * f * f);
      const side = (vertex.position.xz - base.xz) * (0.8 + 0.25 * f);
      const bend = lean * v * v * tall * 0.45;
      return d.vec3f(base.x + side.x + bend.x, base.y + up, base.z + side.y + bend.y);
    },
    deformShadow: false,
    bounds: (_flame, b) => {
      'use gpu';
      return instances.Sphere({ center: b.center, radius: b.radius + 0.1 });
    },
    // Seen edge-on the flame thins to nothing, so it reads as a glowing volume, not a shell
    coverage: (pixel) => {
      'use gpu';
      const facing = std.saturate(std.abs(std.dot(pixel.point.normal, pixel.point.view)));
      const v = pixel.point.uv.y;
      return std.smoothstep(0.05, 0.55, facing) * (1 - std.smoothstep(0.8, 1, v) * 0.7) * std.smoothstep(0, 0.06, v);
    },
    material: (pixel, base) => {
      'use gpu';
      const v = pixel.point.uv.y;
      const mm = std.floor(pixel.point.uv.x);
      const seed = pixel.point.uv.x - mm;
      const p = pixel.point.position;
      const f = oilGpu(now.$, seed, p.x * 0.045 + p.z * 0.03);
      const facing = std.saturate(std.abs(std.dot(pixel.point.normal, pixel.point.view)));
      // The flame's layers as a candle shows them: a blue cup round the wick, a dim dark zone
      // above it, the bright yellow-white body, an orange mantle and a smoky red tip
      const core = std.smoothstep(0.35, 0.9, facing);
      const blue = d.vec3f(0.25, 0.45, 1.6) * (1 - std.smoothstep(0.02, 0.16, v)) * (1 - core * 0.7);
      const body = std.mix(d.vec3f(5.2, 2.3, 0.55), d.vec3f(7.5, 5.4, 2.4), core) * std.smoothstep(0.08, 0.26, v) * (1 - std.smoothstep(0.45, 0.82, v));
      const mantle = d.vec3f(3.6, 1.1, 0.18) * std.smoothstep(0.3, 0.6, v) * (1 - std.smoothstep(0.8, 1.0, v));
      const dark = 1 - 0.45 * (1 - std.smoothstep(0.06, 0.2, v)) * core;
      const m = shading.Material(base);
      m.color = d.vec3f(0);
      m.emission = (blue + body + mantle) * dark * (0.6 + 0.4 * f);
      return m;
    },
  });
}
