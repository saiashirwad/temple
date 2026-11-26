// The herd, drawn from a real rigged elephant (AnimalAnimator's bull, CC BY 4.0, made Asian and
// tuskless for a cow herd by tools/beasts/elephant.ts) playing its own animations: grazing and
// standing when at ease, walking and running by speed, the threat display when she charges.
import { BEAST_FILES } from './content/assets.ts';
import { gltf, instances, meshPool, poses, shading, type Frame } from '@typegpu/kit';
import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { heightAt } from './terrain.ts';

type V3 = [number, number, number];
type ModelData = Awaited<ReturnType<typeof gltf.load>>;

/** What the herd needs from each elephant the danger module moves. */
export interface HerdMember {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  alert: number;
  on: boolean;
  size: number;
}

/** The model is a 3.2 m bull; an Asian cow stands about 2.4 m at the shoulder. */
const SCALE = 0.78;
/** Ground speeds, in metres a second at size 1, at which the walk and the run clips look planted. */
const WALK_PACE = 1.3;
const RUN_PACE = 4.2;

export const loadHerd = (base = import.meta.env.BASE_URL) => gltf.load(`${base}${BEAST_FILES.herd}`);

// Night dust: wild elephants here wear the red laterite they throw over their backs
const Elephant = instances.define('Elephant', {
  host: { pose: d.u32 },
  pose: (row) => {
    'use gpu';
    return row.pose;
  },
  material: (_pixel, base) => {
    'use gpu';
    const m = shading.Material(base);
    const grey = std.dot(base.color, d.vec3f(0.33, 0.34, 0.33));
    m.color = std.mix(base.color, d.vec3f(grey * 1.12, grey * 0.86, grey * 0.72), 0.45) * 0.85;
    m.roughness = 0.93;
    return m;
  },
});

export function createHerd(root: TgpuRoot, model: ModelData, count: number) {
  const pool = meshPool.create(root, { ...meshPool.roomFor([model]), anisotropy: 4 });
  const body = pool.add(model);
  const c = (name: string) => poses.clip(model, name);
  const figures = poses.create(
    root,
    model.skin!,
    { moving: [c('01_Idle'), c('02_Walk'), c('03_Run')], eat: c('04_Eating'), threat: c('05_Attack') },
    { capacity: count },
  );
  const set = instances.create(root, pool, { kind: Elephant, capacity: count * model.meshes.length, history: true });
  const hidden: V3 = [0, -60, 0];
  const herd = Array.from({ length: count }, (_, i) => {
    const pose = figures.add('moving', 0, { from: i * 1.7 });
    const id = set.add(body, { position: hidden, pose });
    return { pose, id, doing: 'moving' as 'moving' | 'eat' | 'threat', until: 0, shown: false, threatT: -1 };
  });

  return {
    renderer: set.renderer().pipe(figures.inject()),
    /** Places and animates each elephant from where danger has it, once a frame. */
    update(members: readonly HerdMember[], seconds: number) {
      members.forEach((e, i) => {
        const h = herd[i];
        if (!h) return;
        if (!e.on) {
          if (h.shown) set.write(h.id, { position: hidden });
          h.shown = false;
          return;
        }
        h.shown = true;
        const s = SCALE * e.size;
        const rotation: [number, number, number, number] = [0, Math.sin(e.yaw / 2), 0, Math.cos(e.yaw / 2)];
        const position: V3 = [e.x, heightAt(e.x, e.z) - 0.04, e.z];
        set.write(h.id, { position, rotation, scale: s });
        // What she's doing: the threat display once as a charge begins, grazing between rests
        // when at ease, otherwise walking or running at her pace
        const speed = e.speed / Math.max(0.3, e.size);
        let want: typeof h.doing = 'moving';
        if (e.alert > 0.8 && speed > 2.5 && h.threatT < 0) {
          h.threatT = seconds;
          want = 'threat';
        } else if (h.doing === 'threat' && seconds - h.threatT < 1.6) want = 'threat';
        else if (speed < 0.15 && e.alert < 0.3) {
          if (seconds > h.until) {
            h.until = seconds + 8 + Math.random() * 10;
            want = h.doing === 'eat' ? 'moving' : 'eat';
          } else want = h.doing;
        }
        if (e.alert < 0.5) h.threatT = -1;
        if (want !== h.doing) {
          figures.play(h.pose, want, seconds, { fade: want === 'threat' ? 0.25 : 0.8, loop: want !== 'threat' });
          h.doing = want;
        }
        if (h.doing === 'moving') {
          const mix = speed <= WALK_PACE ? speed / WALK_PACE : 1 + Math.min(1, (speed - WALK_PACE) / (RUN_PACE - WALK_PACE));
          figures.mix(h.pose, Math.round(mix * 50) / 50, seconds);
        }
      });
    },
    flush: (frame: Frame) => set.flush(frame),
    animate: (pass: Parameters<poses.Poses<string>['animate']>[0], time: number) => figures.animate(pass, time),
    initAsync: () => figures.initAsync(),
    ready: body.ready,
    destroy() {
      figures.destroy();
      set.destroy();
      pool.destroy();
    },
  };
}
