// The baked material tiles (tools/tex/bake.ts) as two texture arrays: colour with a mask in alpha,
// and data with the normal's x, y and roughness. Every surface samples them once per pixel, by
// world projection for masonry and ground, or by the mesh's metre UVs for roofs and wood.

import { images } from '@typegpu/kit';
import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { TEX, TEX_LAYERS } from '../generated/textures.gen.ts';
import { materialLayers as LAYERS } from '../content/materials.ts';
import { Q } from './quality.ts';

export { TEX };

/** The poster atlas's layer, read with the mesh's own UVs. */
export const POSTER_LAYER = TEX_LAYERS.length;

/** The path's painted signs. */
export const SIGN_LAYER = TEX_LAYERS.length + 1;
const TINTED = new Set(['laterite', 'plaster', 'paint', 'concrete', 'granite', 'copper', 'tin', 'teak', 'lacquer', 'brass', 'steel', 'cloth', 'bark', 'palmbark']);

export interface Tex {
  sample: (layer: number, nrm: d.v3f, p: d.v3f, uv: d.v2f, useUv: boolean) => d.Infer<typeof Sampled>;
  /**
   * World-projected sampling from `p`'s screen derivatives (`std.dpdx(p)`, `std.dpdy(p)`, taken
   * in uniform control flow), so it may be called inside a branch: the same result as `sample`
   * without UVs.
   */
  sampleGrad: (layer: number, nrm: d.v3f, p: d.v3f, dpx: d.v3f, dpy: d.v3f) => d.Infer<typeof Sampled>;
  /** Ground sampling: one layer projected from above. */
  ground: (layer: number, xz: d.v2f) => d.Infer<typeof Flat>;
  /** A mesh tint relative to the tile's own colour, as a multiplier. */
  ratio: (layer: number, tint: d.v3f) => d.v3f;
  tinted: (layer: number, tint: d.v3f, c: d.v3f) => d.v3f;
  /** Replace preview texels in place with the original assets. Safe to call more than once. */
  refine(): void;
  readonly detail: 'preview' | 'full' | 'error';
  destroy(): void;
}

export const Sampled = d.struct({ color: d.vec4f, normal: d.vec3f, rough: d.f32, metal: d.f32, ratioOn: d.f32 });
export const Flat = d.struct({ color: d.vec4f, slope: d.vec2f, rough: d.f32 });

function materialLink(id: string) {
  return document.querySelector<HTMLLinkElement>(`#material-${id}`);
}

async function readBytes(url: string) {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`Missing material ${url} (${response.status})`);

  return response.arrayBuffer();
}

function packedTile(bytes: ArrayBuffer, i: number) {
  const offsets = new DataView(bytes);
  const start = offsets.getUint32(4 * i, true);

  return new Uint8Array(bytes, start, offsets.getUint32(4 * (i + 1), true) - start);
}

async function fullTiles(id: string, suffix: string, mimeType: string) {
  const pack = materialLink(id);
  const bytes = pack && await readBytes(pack.href);

  return Promise.all(LAYERS.map(async (layer, i) => {
    const tile = bytes ? packedTile(bytes, i) : new Uint8Array(await readBytes(
      `${import.meta.env.BASE_URL}tex/${layer.name}_${suffix}?v=${layer.mean.join('_')}`));

    return images.decodeBitmap({ bytes: tile, mimeType });
  }));
}

/** Scale a real 128 px tile into its final-sized slot. All mips are populated on
 * frame one, and the shader keeps the same texture view when detail arrives. */
function previewTiles(bytes: ArrayBuffer, offset: number, size: number) {
  return Promise.all(LAYERS.map((_, i) => createImageBitmap(
    new Blob([packedTile(bytes, offset + i)], { type: 'image/webp' }), {
      resizeWidth: size, resizeHeight: size, resizeQuality: 'low', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
    })));
}

export async function loadTextures(root: TgpuRoot, sharp: boolean): Promise<Tex> {
  const size = sharp ? 1024 : 512;
  const link = materialLink('preview');
  const preview = link?.rel === 'preload' ? await readBytes(link.href) : null;
  let disposed = false;
  let refining = false;
  let detail: Tex['detail'] = preview ? 'preview' : 'full';

  function upload(pictures: ImageBitmap[], color: 'srgb' | 'linear') {
    try { return images.array(root, pictures, { color }); }
    finally { for (const picture of pictures) picture.close(); }
  }

  async function make(id: string, suffix: string, mime: string, width: number, color: 'srgb' | 'linear') {
    const offset = color === 'linear' ? 0 : LAYERS.length;
    const pictures = preview ? await previewTiles(preview, offset, width) : await fullTiles(id, suffix, mime);
    const texture = upload(pictures, color);

    const refine = async () => {
      const full = await fullTiles(id, suffix, mime);

      try {
        if (disposed) return;

        for (const [layer, picture] of full.entries()) texture.write(picture, { origin: [0, 0, layer] });
        texture.generateMipmaps();
      } finally { for (const picture of full) picture.close(); }
    };

    return { texture, refine };
  }

  const [colors, normals] = await Promise.all([
    make(`color-${size}`, `${size}_c.webp`, 'image/webp', size, 'srgb'),
    make('data', '512_d.jpg', 'image/jpeg', 512, 'linear'),
  ]);

  const color = colors.texture, data = normals.texture;

  if (!preview) performance.mark('game:materials-ready');

  const refine = () => {
    if (!preview || refining || disposed) return;
    refining = true;
    void Promise.all([colors.refine(), normals.refine()]).then(() => {
      if (disposed) return;
      detail = 'full';
      performance.mark('game:materials-ready');
    }).catch(error => {
      if (disposed) return;
      detail = 'error';
      performance.mark('game:materials-error', { detail: String(error) });
      console.warn('Material detail', error);
    });
  };

  const colorView = color.createView(d.texture2dArray(d.f32));
  const dataView = data.createView(d.texture2dArray(d.f32));
  const smooth = images.sampler(root, { anisotropy: Q.anisotropy });

  const scales = tgpu.const(d.arrayOf(d.f32, LAYERS.length), LAYERS.map((l) => 1 / l.metres));
  const metals = tgpu.const(d.arrayOf(d.f32, LAYERS.length), LAYERS.map((l) => (l.metal ? 1 : 0)));

  const refs = tgpu.const(
    d.arrayOf(d.vec4f, LAYERS.length),
    LAYERS.map((l) => {
      if (!TINTED.has(l.name)) return d.vec4f(1, 1, 1, 0);
      const c = l.mean;

      return d.vec4f(1 / Math.max(c[0]!, 2e-3), 1 / Math.max(c[1]!, 2e-3), 1 / Math.max(c[2]!, 2e-3), 1);
    }),
  );

  /** Tangent-space normal from the data texel: x, y and the height slope's z. */
  const unpack = (t: d.v4f) => {
    'use gpu';
    const xy = t.xy * 2 - 1;
    const z = std.sqrt(std.max(1 - std.dot(xy, xy), 0.04));

    return d.vec3f(xy, z);
  };

  /** Each projection's slope along its own axes, as a bend of the surface normal. */
  const bendOf = (w: d.v3f, ax: d.v3f, ay: d.v3f, az: d.v3f) => {
    'use gpu';
    let bend = (d.vec3f(0, 0, 1) * ax.x + d.vec3f(0, -1, 0) * ax.y) * (w.x / ax.z);
    bend = bend + (d.vec3f(1, 0, 0) * ay.x + d.vec3f(0, 0, 1) * ay.y) * (w.y / ay.z);
    bend = bend + (d.vec3f(1, 0, 0) * az.x + d.vec3f(0, -1, 0) * az.y) * (w.z / az.z);

    return bend;
  };

  /** The triplanar weights: mostly the axis the surface faces. */
  const weightsOf = (nrm: d.v3f) => {
    'use gpu';
    const w = std.pow(std.abs(nrm), d.vec3f(6));

    return w / (w.x + w.y + w.z);
  };

  const sample = (layer: number, nrm: d.v3f, p: d.v3f, uv: d.v2f, useUv: boolean) => {
    'use gpu';
    const L = d.i32(layer);
    const s = scales.$[L];
    // World projections along each axis; image rows run down the wall
    let w = weightsOf(nrm);
    let qx = d.vec2f(p.z, -p.y) * s;
    const qy = d.vec2f(p.x, p.z) * s;
    const qz = d.vec2f(p.x, -p.y) * s;
    // The mesh's UVs, u across and v up in metres, read with v down the image
    const qu = d.vec2f(uv.x, -uv.y) * s;
    // Their tangent frame from screen derivatives
    const dp1 = std.dpdx(p);
    const dp2 = std.dpdy(p);
    const du1 = std.dpdx(qu);
    const du2 = std.dpdy(qu);
    const perp2 = std.cross(dp2, nrm);
    const perp1 = std.cross(nrm, dp1);
    const tu = perp2 * du1.x + perp1 * du2.x;
    const tv = perp2 * du1.y + perp1 * du2.y;
    const inv = std.inverseSqrt(std.max(std.max(std.dot(tu, tu), std.dot(tv, tv)), 1e-20));
    // The other two projections only without UVs (weighted 0 with them): read with explicit
    // gradients, the derivatives of the same linear maps, so they may sit in the branch
    let cy = d.vec4f(0);
    let cz = d.vec4f(0);
    let ny = d.vec4f(0);
    let nz = d.vec4f(0);

    if (useUv) {
      qx = d.vec2f(qu);
      w = d.vec3f(1, 0, 0);
    } else {
      const gy1 = d.vec2f(dp1.x, dp1.z) * s;
      const gy2 = d.vec2f(dp2.x, dp2.z) * s;
      const gz1 = d.vec2f(dp1.x, -dp1.y) * s;
      const gz2 = d.vec2f(dp2.x, -dp2.y) * s;
      cy = std.textureSampleGrad(colorView.$, smooth.$, qy, L, gy1, gy2);
      cz = std.textureSampleGrad(colorView.$, smooth.$, qz, L, gz1, gz2);
      ny = std.textureSampleGrad(dataView.$, smooth.$, qy, L, gy1, gy2);
      nz = std.textureSampleGrad(dataView.$, smooth.$, qz, L, gz1, gz2);
    }

    const cx = std.textureSample(colorView.$, smooth.$, qx, L);
    const nx = std.textureSample(dataView.$, smooth.$, qx, L);
    const color = cx * w.x + cy * w.y + cz * w.z;
    const rough = nx.z * w.x + ny.z * w.y + nz.z * w.z;
    // Each projection's slope along its own axes, added to the surface normal
    const ax = unpack(nx);
    let bend = d.vec3f(0);

    if (useUv) {
      bend = (tu * inv * ax.x + tv * inv * ax.y) / ax.z;
    } else {
      bend = bendOf(w, ax, unpack(ny), unpack(nz));
    }

    const bent = std.normalize(nrm + bend - nrm * std.dot(nrm, bend));

    return Sampled({ color, normal: bent, rough, metal: metals.$[L], ratioOn: refs.$[L].w });
  };

  const sampleGrad = (layer: number, nrm: d.v3f, p: d.v3f, dpx: d.v3f, dpy: d.v3f) => {
    'use gpu';
    const L = d.i32(layer);
    const s = scales.$[L];
    const w = weightsOf(nrm);
    const qx = d.vec2f(p.z, -p.y) * s;
    const qy = d.vec2f(p.x, p.z) * s;
    const qz = d.vec2f(p.x, -p.y) * s;
    const gx1 = d.vec2f(dpx.z, -dpx.y) * s;
    const gx2 = d.vec2f(dpy.z, -dpy.y) * s;
    const gy1 = d.vec2f(dpx.x, dpx.z) * s;
    const gy2 = d.vec2f(dpy.x, dpy.z) * s;
    const gz1 = d.vec2f(dpx.x, -dpx.y) * s;
    const gz2 = d.vec2f(dpy.x, -dpy.y) * s;
    const cx = std.textureSampleGrad(colorView.$, smooth.$, qx, L, gx1, gx2);
    const cy = std.textureSampleGrad(colorView.$, smooth.$, qy, L, gy1, gy2);
    const cz = std.textureSampleGrad(colorView.$, smooth.$, qz, L, gz1, gz2);
    const nx = std.textureSampleGrad(dataView.$, smooth.$, qx, L, gx1, gx2);
    const ny = std.textureSampleGrad(dataView.$, smooth.$, qy, L, gy1, gy2);
    const nz = std.textureSampleGrad(dataView.$, smooth.$, qz, L, gz1, gz2);
    const color = cx * w.x + cy * w.y + cz * w.z;
    const rough = nx.z * w.x + ny.z * w.y + nz.z * w.z;
    const bend = bendOf(w, unpack(nx), unpack(ny), unpack(nz));
    const bent = std.normalize(nrm + bend - nrm * std.dot(nrm, bend));

    return Sampled({ color, normal: bent, rough, metal: metals.$[L], ratioOn: refs.$[L].w });
  };

  /** The tint of a mesh relative to the tile's own colour, as a multiplier. */
  const ratioOf = (layer: number, tint: d.v3f) => {
    'use gpu';
    const r = refs.$[d.i32(layer)];

    return std.select(d.vec3f(1), std.min(tint * r.xyz, d.vec3f(8)), r.w > 0.5);
  };

  /**
   * A tile pixel in a mesh's colour: mostly its brightness against the tile's mean times the
   * tint, keeping a little of the photo's own hue so stains and moss still read.
   */
  const tintedOf = (layer: number, tint: d.v3f, c: d.v3f) => {
    'use gpu';
    const r = refs.$[d.i32(layer)];
    const W = d.vec3f(0.2126, 0.7152, 0.0722);
    const meanLum = std.dot(d.vec3f(1) / std.max(r.xyz, d.vec3f(1e-3)), W);
    const flat = tint * (std.dot(c, W) / std.max(meanLum, 1e-3));
    const hued = tint * c * r.xyz;

    return std.select(d.vec3f(c), std.min(std.mix(flat, hued, 0.3), d.vec3f(8)), r.w > 0.5);
  };

  const ground = (layer: number, xz: d.v2f) => {
    'use gpu';
    const L = d.i32(layer);
    const q = xz * scales.$[L];
    const c = std.textureSample(colorView.$, smooth.$, q, L);
    const t = std.textureSample(dataView.$, smooth.$, q, L);
    const n = unpack(t);

    return Flat({ color: c, slope: n.xy / n.z, rough: t.z });
  };

  return {
    sample,
    sampleGrad,
    ground,
    ratio: ratioOf,
    tinted: tintedOf,
    refine,
    get detail() { return detail; },
    destroy() {
      disposed = true;
      color.destroy();
      data.destroy();
    },
  };
}

