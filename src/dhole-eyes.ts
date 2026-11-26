import type { Beast } from './danger.ts';
import type { createEyes } from './eyes.ts';
import { qrot, yawQ } from './quat.ts';
import { heightAt } from './terrain.ts';

type V3 = [number, number, number];
const WOLF_HEAD: V3 = [0, 0.7, 0.53];
const WOLF_EYE: V3 = [0.036, 0, 0];

/** Place paired eye reflections on the skinned dholes when the torch catches them. */
export function updateDholeEyes(eyes: ReturnType<typeof createEyes>, wolves: readonly Beast[], eyeAt: V3, [fx, fy, fz]: V3, torch: number) {
  wolves.forEach((w, i) => {
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
}
