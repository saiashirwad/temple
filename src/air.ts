// Life in the night air: fireflies blinking low among the trees and over the pond, and moths
// circling the sodium lamps.

import { Particle, particles, type CameraBase } from '@typegpu/kit';
import { d, std, type TgpuRoot } from 'typegpu';
import { GROUND, POND, ROAD } from './world.ts';
import { riverLevel, riverLocal, riverPoint } from './river.ts';
import { BRIDGE } from './bridge.ts';
import { Q } from './quality.ts';

/** A particle pool's size and a stream's rate at this quality tier. */
const cap = (n: number) => Math.max(16, Math.round(n * Q.air));
const rate = (n: number) => n * Q.air;

/**
 * Smoke from the oil wicks: thin wisps that climb, curl and spread as they cool, warm where the
 * flames light them from below, fading to a cool grey haze up in the moonlight.
 */
const curl = (p: Particle, dt: number) => {
  'use gpu';
  let next = Particle(p);
  const t = p.age * 1.3 + p.seed * 20;
  const k = std.saturate(p.age / std.max(p.life, 0.001));
  const side = d.vec3f(std.sin(t * 1.7 + p.position.y * 3.0), 0, std.cos(t * 1.3 + p.position.y * 2.5)) * (0.12 + k * 0.25);
  next.velocity = d.vec3f(side.x + 0.05, std.mix(0.55, 0.2, k), side.z);
  next.size = std.min(p.size + dt * 0.1, 0.45);
  return next;
};

const wisp = (p: Particle, local: d.v2f) => {
  'use gpu';
  const k = std.saturate(p.age / std.max(p.life, 0.001));
  // A narrow streak, taller than wide while young, broadening into a soft puff as it rises
  const thin = std.mix(5.0, 1.3, std.saturate(k * 1.6));
  const r2 = local.x * local.x * thin + local.y * local.y;
  const soft = std.saturate(1 - r2) * std.saturate(1 - r2);
  const a = soft * 0.11 * std.smoothstep(0, 0.08, k) * (1 - std.smoothstep(0.35, 1, k));
  const warm = std.mix(d.vec3f(0.55, 0.3, 0.1), d.vec3f(0.03, 0.035, 0.05), std.saturate(k * 2.5));
  return d.vec4f(warm * a, a);
};

/** Wood smoke from a kitchen chimney: slow to rise, leaning with the night air, spreading wide. */
const drift = (p: Particle, dt: number) => {
  'use gpu';
  let next = Particle(p);
  const k = std.saturate(p.age / std.max(p.life, 0.001));
  const t = p.age * 0.4 + p.seed * 20;
  const side = d.vec3f(std.sin(t + p.position.y * 0.7), 0, std.cos(t * 0.8 + p.position.y * 0.6)) * (0.08 + k * 0.2);
  next.velocity = d.vec3f(side.x + 0.18 * k, std.mix(0.45, 0.12, k), side.z + 0.06 * k);
  next.size = p.size + dt * 0.28;
  return next;
};

const plume = (p: Particle, local: d.v2f) => {
  'use gpu';
  const k = std.saturate(p.age / std.max(p.life, 0.001));
  const r2 = std.dot(local, local);
  const soft = std.saturate(1 - r2) * std.saturate(1 - r2);
  const a = soft * 0.2 * std.smoothstep(0, 0.06, k) * (1 - std.smoothstep(0.45, 1, k));
  // Grey-blue in the moonlight, a faint warmth from the fire where it leaves the chimney
  const tone = std.mix(d.vec3f(0.2, 0.12, 0.07), d.vec3f(0.09, 0.1, 0.13), std.saturate(k * 4));
  return d.vec4f(tone * a, a);
};

/** Night mist on the pond: wide, flat, barely moving, held down near the water. */
const linger = (p: Particle, dt: number) => {
  'use gpu';
  let next = Particle(p);
  const t = p.age * 0.05 + p.seed * 40;
  next.velocity = d.vec3f(0.12 + std.sin(t) * 0.06, -p.position.y * 0.02 + 0.01, std.cos(t * 1.3) * 0.06);
  next.size = p.size + dt * 0.06;
  return next;
};

const veil = (p: Particle, local: d.v2f) => {
  'use gpu';
  const k = std.saturate(p.age / std.max(p.life, 0.001));
  // A flattened disc, wider than tall, so it lies on the water like a sheet
  const r2 = local.x * local.x + local.y * local.y * 3.0;
  const soft = std.saturate(1 - r2) * std.saturate(1 - r2) * std.saturate(1 - r2);
  const a = soft * 0.055 * std.smoothstep(0, 0.25, k) * (1 - std.smoothstep(0.65, 1, k));
  return d.vec4f(d.vec3f(0.07, 0.085, 0.11) * a, a);
};

const FIREFLY = d.vec3f(2.2, 3.2, 0.6);
const MOTH = d.vec3f(1.4, 0.8, 0.35);

const wander = (p: Particle, dt: number) => {
  'use gpu';
  let next = Particle(p);
  const t = p.age * 0.7 + p.seed * 50;
  const push = d.vec3f(std.sin(t * 1.3), std.sin(t * 0.9 + 2) * 0.4, std.cos(t * 1.1)) * 0.5;
  next.velocity = p.velocity * (1 - dt * 0.8) + push * dt;
  return next;
};

const blink = (p: Particle, local: d.v2f) => {
  'use gpu';
  const r = std.length(local);
  const core = std.exp(-r * r * 9);
  // Each one flashes on its own slow rhythm, fading in and out of its life
  const pulse = std.pow(std.saturate(std.sin(p.age * (1.5 + p.seed * 1.5) + p.seed * 40)), 3.0);
  const life = std.smoothstep(0, 0.1, p.age / p.life) * (1 - std.smoothstep(0.85, 1, p.age / p.life));
  return d.vec4f(FIREFLY * (core * pulse * life), 0);
};

const circle = (p: Particle, dt: number) => {
  'use gpu';
  let next = Particle(p);
  // Orbit the lamp the moth was born under, wobbling, pulled back in when it strays
  const t = p.age * (3 + p.seed * 4) + p.seed * 30;
  const swirl = d.vec3f(std.cos(t), std.sin(t * 1.7) * 0.6, std.sin(t)) * 2.5;
  next.velocity = p.velocity * (1 - dt * 3) + swirl * dt * 3;
  return next;
};

const flutter = (p: Particle, local: d.v2f) => {
  'use gpu';
  const r = std.length(local);
  const dot = std.saturate(1 - r) * std.saturate(1 - r);
  const life = 1 - std.smoothstep(0.8, 1, p.age / p.life);
  return d.vec4f(MOTH * dot * life * (0.6 + 0.4 * std.sin(p.age * 40 + p.seed * 9)), 0);
};

export function createAir(root: TgpuRoot, view: CameraBase, step: number, lampHeads: [number, number, number][], wicks: [number, number, number][] = [], chimneys: [number, number, number][] = []) {
  const smoke = particles.create(root, view, { capacity: cap(1200), step, update: curl, shade: wisp, blend: 'over', label: 'smoke', settings: { gravity: [0, 0, 0], drag: 0 } });
  for (const at of wicks) smoke.stream(rate(7), { position: [at[0], at[1] + 0.14, at[2]], area: [0.02, 0.02, 0.02], velocity: [0, 0.5, 0], scatter: 0.05, size: 0.06, life: 2.6, variance: 0.3 });
  const kitchen = particles.create(root, view, { capacity: cap(Math.max(16, chimneys.length * 40)), step, update: drift, shade: plume, blend: 'over', label: 'kitchen smoke', settings: { gravity: [0, 0, 0], drag: 0 } });
  for (const at of chimneys) kitchen.stream(rate(5), { position: [at[0], at[1] + 0.05, at[2]], area: [0.08, 0.02, 0.08], velocity: [0, 0.45, 0], scatter: 0.08, size: 0.35, life: 10, variance: 0.3 });
  const mist = particles.create(root, view, { capacity: cap(160), step, update: linger, shade: veil, blend: 'over', label: 'pond mist', settings: { gravity: [0, 0, 0], drag: 0 } });
  mist.stream(rate(6), { position: [POND.x, 0.35, POND.z], area: [POND.r * 0.7, 0.15, POND.r * 0.7], velocity: [0, 0, 0], scatter: 0.02, size: 2.2, life: 22, variance: 0.3 });
  // Mist on the river too, lying in the ravine under the hanging bridge and up and down from it,
  // the cool air pooled over the water: cut loose and drifting slowly downstream
  const under = riverLocal(BRIDGE.x, BRIDGE.z).s;
  const river = particles.create(root, view, { capacity: cap(420), step, update: linger, shade: veil, blend: 'over', label: 'river mist', settings: { gravity: [0, 0, 0], drag: 0 } });
  for (let k = -3; k <= 3; k++) {
    const sAt = under + k * 14;
    const [x, z] = riverPoint(sAt);
    river.stream(rate(2.5), { position: [x, riverLevel(sAt) + 0.45, z], area: [4.5, 0.2, 4.5], velocity: [0, 0, 0], scatter: 0.02, size: 2.6, life: 22, variance: 0.3 });
  }
  const flies = particles.create(root, view, { capacity: cap(600), step, update: wander, shade: blink, label: 'fireflies', settings: { gravity: [0, 0, 0], drag: 0 } });
  const moths = particles.create(root, view, { capacity: cap(400), step, update: circle, shade: flutter, label: 'moths', settings: { gravity: [0, 0, 0], drag: 0 } });

  const fly = (x: number, z: number, w: number, dz: number, perSecond: number) =>
    flies.stream(rate(perSecond), { position: [x, GROUND + 1.8, z], area: [w, 1.4, dz], velocity: [0, 0, 0], scatter: 0.25, size: 0.09, life: 9, variance: 0.4 });
  fly(-9, 22, 7, 7, 6); // under the banyan
  fly(POND.x, POND.z, 11, 11, 12); // over the pond
  fly(0, -40, 40, 18, 18); // the groves behind
  fly(-30, ROAD.z + 14, 25, 6, 6);
  fly(30, 12, 12, 12, 6);
  for (const at of lampHeads) {
    moths.stream(rate(14), { position: [at[0], at[1] - 0.6, at[2]], area: [0.6, 0.4, 0.6], velocity: [0, 0, 0], scatter: 0.6, size: 0.05, life: 5, variance: 0.5 });
  }

  type System = typeof flies;
  /** A set of systems stepped and drawn together, so a far group can be skipped as a whole. */
  const group = (systems: System[]) => ({
    drawings: systems.map((s) => s.drawing),
    spawn(pass: Parameters<System['spawn']>[0]) {
      for (const s of systems) s.spawn(pass);
    },
    step(pass: Parameters<System['step']>[0]) {
      for (const s of systems) s.step(pass);
    },
    compact(pass: Parameters<System['compact']>[0], ahead: number) {
      for (const s of systems) s.compact(pass, ahead);
    },
  });
  /** Everything over the town and the pond; the river's mist, along the trail, on its own. */
  const townAir = group([mist, smoke, kitchen, flies, moths]);
  const riverAir = group([river]);
  const all = group([smoke, kitchen, mist, river, flies, moths]);

  return {
    drawings: [mist.drawing, river.drawing, smoke.drawing, kitchen.drawing, flies.drawing, moths.drawing],
    spawn: all.spawn,
    step: all.step,
    compact: all.compact,
    townAir,
    riverAir,
    initAsync: async () => {
      await Promise.all([smoke.initAsync(), kitchen.initAsync(), mist.initAsync(), river.initAsync(), flies.initAsync(), moths.initAsync()]);
    },
    destroy() {
      smoke.destroy();
      kitchen.destroy();
      mist.destroy();
      river.destroy();
      flies.destroy();
      moths.destroy();
    },
  };
}
