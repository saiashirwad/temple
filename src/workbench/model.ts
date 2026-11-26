// An independent studio for the game's glTF and procedural geometry.
import {
  cameras,
  finish,
  gltf,
  instances,
  lighting,
  meshPool,
  passes,
  pipelines,
  poses,
  targets,
  tone,
  type Frame,
  type Surface,
} from '@typegpu/kit';
import * as web from '@typegpu/kit/web';
import { d, type TgpuRoot } from 'typegpu';

const Figure = instances.define('WorkbenchFigure', {
  host: { pose: d.u32 },
  pose: (figure) => {
    'use gpu';
    return figure.pose;
  },
});
type Options = { night?: boolean; clipUrl?: string; tree?: { name: string; seed: number } };
export async function inspectModel(
  canvas: HTMLCanvasElement,
  url: string,
  report: (text: string) => void,
  options: Options = {},
) {
  const file = options.tree ? null : await gltf.load(url);
  const model = options.tree ? (await import('./specimens.ts')).treeSpecimen(options.tree.name, options.tree.seed) : file!;
  const clipFile = options.clipUrl ? await gltf.load(options.clipUrl) : file;
  const sourceClip = clipFile?.clips[0];
  // External people clips share joint names but carry their source body's bone lengths.
  const rest = new Map(file?.skin?.joints.map((joint) => [joint.name, joint.position]) ?? []);
  const clip =
    sourceClip && options.clipUrl
      ? {
          ...sourceClip,
          channels: sourceClip.channels.map((channel) => {
            const own = rest.get(channel.joint);
            if (channel.path !== 'position' || channel.joint === 'Bip01' || !own) return channel;
            const values = new Float32Array(channel.values.length);
            for (let i = 0; i < values.length; i += 3) values.set(own, i);
            return { ...channel, values };
          }),
        }
      : sourceClip;
  const vertices = model.meshes.reduce((n, m) => n + m.positions.length / 3, 0);
  const triangles = model.meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  report(
    `${model.meshes.length} meshes · ${vertices.toLocaleString()} vertices · ${triangles.toLocaleString()} triangles · ${model.images.length} images · ${file?.skin?.joints.length ?? 0} joints · ${clipFile?.clips.length ?? 0} clips${clip ? ` · playing ${clip.name}` : ''}`,
  );
  if (!vertices) {
    report('No visible mesh in this file. Select a body and an animation clip to preview it.');
    return () => {};
  }
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of model.meshes)
    for (let i = 0; i < mesh.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const v = mesh.positions[i + k]!;
        min[k] = Math.min(min[k]!, v);
        max[k] = Math.max(max[k]!, v);
      }
  const center = min.map((v, i) => (v + max[i]!) / 2) as [number, number, number];
  const size = Math.max(...max.map((v, i) => v - min[i]!), 0.01);
  const create = async (root: TgpuRoot, surface: Surface) => {
    const screen = targets.create(root, surface, {
      hdr: { format: 'rgba16float', sampled: true },
      depth: { format: 'depth24plus', sampled: true },
    });
    const view = cameras.orbit(root, {
      size: surface,
      target: center,
      distance: size * 2,
      near: size / 1000,
      far: size * 100,
      distanceRange: [size * 0.2, size * 12],
      yaw: 0.7,
      pitch: 0.35,
    });
    const settings = options.night
      ? {
          sunDirection: [-1, 1.4, 0.8] as const,
          sunColor: [0.48, 0.58, 1] as const,
          sunIntensity: 0.25,
          skyTop: [0.08, 0.11, 0.2] as const,
          skyBottom: [0.025, 0.03, 0.05] as const,
          skyIntensity: 0.45,
        }
      : {
          sunDirection: [-1, 1.4, 0.8] as const,
          sunColor: [1, 0.96, 0.9] as const,
          sunIntensity: 3,
          skyTop: [0.6, 0.7, 0.85] as const,
          skyBottom: [0.25, 0.23, 0.22] as const,
          skyIntensity: 1,
        };
    const light = lighting.create(root, { settings });
    const scene = passes
      .create(root, screen, { hdr: passes.color, depth: passes.depth }, { clear: [0.035, 0.04, 0.05, 1] })
      .pipe(view.inject())
      .beneath(light.inject());
    const pool = meshPool.create(root, meshPool.roomFor([model]));
    const object = pool.add(model);
    const figures = file?.skin && clip ? poses.create(root, file.skin, { clip }, { capacity: 1 }) : null;
    const things = figures
      ? instances.create(root, pool, { kind: Figure, capacity: model.meshes.length })
      : instances.create(root, pool, { capacity: model.meshes.length });
    if (figures) (things as ReturnType<typeof instances.create<typeof Figure>>).add(object, { pose: figures.add('clip', 0) });
    else things.add(object, {});
    const renderer = figures ? things.renderer().pipe(figures.inject()) : things.renderer();
    const drawn = [scene.add(renderer)];
    const final = finish.create(root, { format: surface.format, source: () => screen.textures.hdr, tone: tone.aces });
    await Promise.all([object.ready, figures?.initAsync(), pipelines.compile([scene, final])]);
    let time = 0;
    return {
      view,
      frame(frame: Frame) {
        screen.fit();
        view.update(frame.dt);
        things.flush();
        if (figures) {
          time += frame.dt;
          const pass = frame.encoder.beginComputePass();
          figures.animate(pass, time);
          pass.end();
        }
        scene.record(frame, drawn);
        final.record(frame, surface.view(frame));
      },
      destroy() {
        figures?.destroy();
        things.destroy();
        pool.destroy();
        light.destroy();
        screen.destroy();
      },
    };
  };
  let ready!: () => void;
  let fail!: (error: unknown) => void;
  const firstFrame = new Promise<void>((resolve, reject) => {
    ready = resolve;
    fail = reject;
  });
  const host = web.host(create, {
    canvas,
    attach: ({ scene }) => web.orbitControls(scene.view, canvas),
    onFrame: () => ready(),
    onError: (error) => {
      report(`Preview error: ${String(error)}`);
      fail(error);
    },
  });
  try {
    await firstFrame;
  } catch (error) {
    host.destroy();
    throw error;
  }
  return () => host.destroy();
}
