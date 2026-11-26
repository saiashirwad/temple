// The beasts' rig on the CPU: the dholes' bodies and legs, the elephants' bodies, legs, ears and
// trunks, written into the moving set each frame from where danger.ts says they are; and the
// dholes' eyes, caught green-gold by your torch.

import { elephantHips, elephantJoints, WOLF_HIPS } from './beasts.ts';
import type { Beast } from './danger.ts';
import type { createEyes } from './eyes.ts';
import { qmul, qrot, xQ, yawQ, zQ, type Quat } from './quat.ts';
import { heightAt } from './terrain.ts';

type V3 = [number, number, number];
type Elephant = Beast & { size: number };

/** The bits of a kit instance set the rig uses. */
interface Rows<M> {
  add(mesh: M, row: { position: V3; scale?: number }): number;
  write(id: number, row: { position: V3; rotation?: Quat }): void;
}

/** A trot: diagonal pairs together. */
const TROT = [0, Math.PI, Math.PI, 0];
/** A gallop: front pair, then back pair. */
const GALLOP = [0, 0.4, Math.PI, Math.PI + 0.4];
/** The elephant's walk: left hind, left fore, right hind, right fore. */
const ELEPHANT_WALK = [Math.PI * 0.5, 0, Math.PI * 1.5, Math.PI];
const WOLF_HEAD: V3 = [0, 0.7, 0.53];
const WOLF_EYE: V3 = [0.036, 0, 0];

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Per elephant size, computed once: its hips, ear hinges and trunk joints. */
const sized = new Map<number, { hips: V3[]; ears: [V3, V3]; root: V3; bend: V3 }>();
const sizedFor = (size: number) => {
  let got = sized.get(size);
  if (!got) {
    const J = elephantJoints(size);
    got = { hips: elephantHips(size), ears: [J.ear(-1), J.ear(1)], root: J.root, bend: J.bend };
    sized.set(size, got);
  }
  return got;
};

/** `local` turned by `q` and moved to x, y, z. */
const placed = (q: Quat, x: number, y: number, z: number, local: V3): V3 => {
  const o = qrot(q, local);
  return [x + o[0], y + o[1], z + o[2]];
};

export function createBeastRig<M, Mdl>(o: {
  pool: { add(model: Mdl): M };
  moving: Rows<M>;
  models: { wolf: Mdl; wolfLeg: Mdl; elephant: { body: Mdl; leg: Mdl; ear: Mdl; trunk: { upper: Mdl; lower: Mdl } } };
  herdSizes: readonly number[];
  /** How many dholes to build from parts (0 when they're drawn skinned elsewhere). */
  wolves?: number;
  /** Where rows go when out of sight. */
  hidden: V3;
}) {
  const { pool, moving, models, herdSizes, hidden } = o;
  const wolfMesh = pool.add(models.wolf);
  const wolfLegMesh = pool.add(models.wolfLeg);
  const wolfIds = Array.from({ length: o.wolves ?? 4 }, () => ({ body: moving.add(wolfMesh, { position: hidden }), legs: WOLF_HIPS.map(() => moving.add(wolfLegMesh, { position: hidden })) }));
  // One set of elephant meshes, built at size 1 and scaled per animal: the calf is the cow, smaller
  const e = models.elephant;
  const herdMeshes = { body: pool.add(e.body), leg: pool.add(e.leg), ear: pool.add(e.ear), upper: pool.add(e.trunk.upper), lower: pool.add(e.trunk.lower) };
  const herdIds = herdSizes.map((size) => {
    const ids = {
      size,
      body: moving.add(herdMeshes.body, { position: hidden, scale: size }),
      legs: [0, 1, 2, 3].map(() => moving.add(herdMeshes.leg, { position: hidden, scale: size })),
      ears: [0, 1].map(() => moving.add(herdMeshes.ear, { position: hidden, scale: size })),
      trunk: [moving.add(herdMeshes.upper, { position: hidden, scale: size }), moving.add(herdMeshes.lower, { position: hidden, scale: size })],
    };
    return { ...ids, head: [...ids.ears, ...ids.trunk] };
  });

  /** Rows already put away out of sight. */
  const parked = new Set<number>();
  /** Writes a beast's body and legs: a trot or a walk, by how fast it's going. */
  const poseBeast = (ids: { body: number; legs: number[] }, b: Beast, hips: V3[], amp: number, offsets: number[], bob: number) => {
    if (!b.on) {
      // Put away once, not every frame
      if (parked.has(ids.body)) return;
      parked.add(ids.body);
      moving.write(ids.body, { position: hidden });
      for (const l of ids.legs) moving.write(l, { position: hidden });
      return;
    }
    parked.delete(ids.body);
    const y = heightAt(b.x, b.z) - 0.03;
    const q = yawQ(b.yaw);
    const lift = Math.abs(Math.sin(b.phase)) * bob;
    moving.write(ids.body, { position: [b.x, y + lift, b.z], rotation: q });
    for (let k = 0; k < hips.length; k++) {
      moving.write(ids.legs[k]!, { position: placed(q, b.x, y + lift, b.z, hips[k]!), rotation: qmul(q, xQ(Math.sin(b.phase + offsets[k]!) * amp)) });
    }
  };

  return {
    wolfIds,
    herdIds,
    /**
     * Ties the rig to the beasts it follows. Call once, after danger exists: it draws each
     * elephant's first feeding time (Math.random), so keep it where those draws happened before.
     */
    animate(a: {
      danger: { wolves: readonly Beast[]; herd: readonly Elephant[] };
      eyes: ReturnType<typeof createEyes>;
      /** Your eye, updated in place each frame. */
      eyeAt: V3;
      /** How far your torch is up, 0-1. */
      torch: () => number;
    }) {
      const { danger, eyes, eyeAt } = a;
      /** Each elephant's trunk and ears: what it's doing, eased so it never snaps from one to the next. */
      const herdHeads = herdSizes.map(() => ({ ear: 0, lift: 0, feed: 0, feedIn: 3 + Math.random() * 6, feedT: -1, swing: 0, last: 0 }));
      const poseHead = (ids: (typeof herdIds)[number], e: Elephant, i: number, seconds: number) => {
        if (!e.on) {
          if (parked.has(ids.ears[0]!)) return;
          parked.add(ids.ears[0]!);
          for (const p of ids.head) moving.write(p, { position: hidden });
          return;
        }
        parked.delete(ids.ears[0]!);
        const h = herdHeads[i]!;
        const t = seconds + i * 7.3;
        const dt = Math.min(0.1, Math.max(0, seconds - h.last));
        h.last = seconds;
        const J = sizedFor(e.size);
        // Feeding when standing still and easy: the trunk goes down, wraps a clump of grass, tears
        // it, curls up to the mouth. Every few seconds, one after another.
        const easy = e.speed < 0.3 && e.alert < 0.3;
        if (h.feedT < 0 && easy && (h.feedIn -= dt) < 0) h.feedT = 0;
        let reach = 0;
        let curl = 0;
        if (h.feedT >= 0) {
          h.feedT += dt;
          const f = h.feedT;
          // 0-1.4 s down to the grass, 1.4-2.0 a tug, 2.0-3.4 up to the mouth, then let down
          reach = f < 1.4 ? smooth(0, 1.4, f) : f < 2.0 ? 1 - Math.sin((f - 1.4) * 16) * 0.08 : 1 - smooth(2.0, 3.0, f);
          curl = f < 2.0 ? 0 : f < 3.4 ? smooth(2.0, 3.0, f) : 1 - smooth(3.4, 4.2, f);
          if (f > 4.2 || !easy) {
            h.feedT = -1;
            h.feedIn = 3 + Math.random() * 8;
          }
        }
        // Alarmed: ears thrown wide and the trunk raised to smell you; the herd's warning to watch for
        h.lift += (e.alert - h.lift) * Math.min(1, dt * 3);
        const lift = smooth(0.25, 0.9, h.lift);
        // At ease, the ears fan slowly to cool; when she's uneasy they stand out from the head
        const fan = Math.max(0, Math.sin(t * 1.9)) ** 2 * 0.45 * (1 - lift);
        h.ear += (fan + lift * 1.1 - h.ear) * Math.min(1, dt * 6);
        // The trunk sways as she walks, and idly when she stands
        h.swing = Math.sin(t * 0.7) * 0.12 + Math.sin(e.phase) * 0.12 * Math.min(1, e.speed);
        const y = heightAt(e.x, e.z) - 0.03;
        const q = yawQ(e.yaw);
        for (let k = 0; k < ids.ears.length; k++) {
          const side = k === 0 ? -1 : 1;
          moving.write(ids.ears[k]!, { position: placed(q, e.x, y, e.z, J.ears[k]!), rotation: qmul(q, yawQ(-side * h.ear)) });
        }
        // Upper trunk: swings side to side, reaches forward and down to feed, rises when alarmed
        const qU = qmul(q, qmul(zQ(h.swing), xQ(-(reach * 0.35 + lift * 1.5 + curl * 0.5))));
        const root = placed(q, e.x, y, e.z, J.root);
        moving.write(ids.trunk[0]!, { position: root, rotation: qU });
        const b = qrot(qU, J.bend);
        // Lower trunk: curls up to the mouth with the grass; held out and up when smelling the air
        const qL = qmul(qU, xQ(-(curl * 1.9 + lift * 0.8 - reach * 0.25)));
        moving.write(ids.trunk[1]!, { position: [root[0] + b[0], root[1] + b[1], root[2] + b[2]], rotation: qL });
      };

      /** Poses every beast for this frame; fx, fy, fz is where you're looking. */
      return (seconds: number, fx: number, fy: number, fz: number) => {
        // The wolves' eyes: green-gold when your torch finds them, a faint glint by the moon
        const torch = a.torch();
        danger.wolves.forEach((w, i) => {
          const slot = eyes.chance + i * 2;
          if (!w.on) {
            eyes.set(slot, 0, -99, 0, 0);
            eyes.set(slot + 1, 0, -99, 0, 0);
            return;
          }
          const q = yawQ(w.yaw);
          const head = qrot(q, WOLF_HEAD);
          const side = qrot(q, WOLF_EYE);
          const hx = w.x + head[0];
          const hy = heightAt(w.x, w.z) + head[1];
          const hz = w.z + head[2];
          const dx = hx - eyeAt[0];
          const dy = hy - eyeAt[1];
          const dz = hz - eyeAt[2];
          const d = Math.hypot(dx, dy, dz) || 1;
          // Only seen when it looks your way
          const facing = Math.max(0, -(dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw)) / d);
          const beam = torch > 0.3 && (dx * fx + dy * fy + dz * fz) / d > 0.86 ? 1 : 0.18;
          const glow = beam * Math.min(1, 26 / d) * Math.min(1, facing * 2.5);
          eyes.set(slot, hx - side[0], hy, hz - side[2], glow);
          eyes.set(slot + 1, hx + side[0], hy, hz + side[2], glow);
        });
        eyes.write();
        danger.wolves.forEach((w, i) => {
          if (!wolfIds[i]) return;
          const amp = Math.min(w.speed / 3.5, 1) * (w.speed > 5 ? 0.75 : 0.5);
          poseBeast(wolfIds[i]!, w, WOLF_HIPS, amp, w.speed > 5 ? GALLOP : TROT, Math.min(w.speed / 6, 1) * 0.04);
        });
        danger.herd.forEach((e, i) => {
          if (!herdIds[i]) return;
          const amp = Math.min(e.speed / 1.2, 1) * (e.speed > 3 ? 0.42 : 0.26);
          poseBeast(herdIds[i]!, e, sizedFor(e.size).hips, amp, ELEPHANT_WALK, Math.min(e.speed / 6, 1) * 0.08);
          poseHead(herdIds[i]!, e, i, seconds);
        });
      };
    },
  };
}
