// Three ways to see the place, all through one orbit camera. On the ground the orbit shrinks to
// a few centimetres round the eye, so turning it is looking around.
// - tour: a slow walk along TOUR, looking where it goes, when no one is steering
// - walk: free walking with the keys or the on-screen stick, dragging to look
// - above: the orbit over the whole temple, drifting round when left alone

import type { OrbitCamera } from '@typegpu/kit';
import { heightAt, pondQ } from './terrain.ts';
import { TOUR } from './world.ts';
import type { Physics } from './physics.ts';
import { CLEARING, trailDistance } from './trail.ts';
import { inRiver } from './river.ts';
import { onBridge } from './bridge.ts';

export type Mode = 'tour' | 'walk' | 'above' | 'held';
const EYE = 1.62;
const TOUR_SPEED = 0.95;
const WALK_SPEED = 2.0;
const RUN_SPEED = 4.6;
/** How quickly you get going, and come to a stop: the share closed each second, roughly. */
const START = 6;
const STOP = 9;
const SNEAK_SPEED = 0.95;
/** A run lasts this many seconds from fresh, and you're winded until you're this far back. */
const RUN_FOR = 9;
const WINDED_UNTIL = 0.4;
const IDLE_TO_TOUR = 14;
const DRIFT = 0.025;

/** The tour as a dense closed polyline with distances along it. */
export function tourPath() {
  const pts: [number, number][] = [];
  const n = TOUR.length;
  for (let i = 0; i < n; i++) {
    const p0 = TOUR[(i - 1 + n) % n]!;
    const p1 = TOUR[i]!;
    const p2 = TOUR[(i + 1) % n]!;
    const p3 = TOUR[(i + 2) % n]!;
    const steps = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 4);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, e: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (3 * b - a - 3 * c + e) * t3);
      pts.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const at: number[] = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i % pts.length]!;
    at.push(at[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = at[pts.length]!;
  const sample = (s: number): [number, number] => {
    s = ((s % total) + total) % total;
    let lo = 0;
    let hi = pts.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const a = pts[lo]!;
    const b = pts[(lo + 1) % pts.length]!;
    const t = (s - at[lo]!) / (at[lo + 1]! - at[lo]!);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const nearest = (x: number, z: number) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dd = Math.hypot(pts[i]![0] - x, pts[i]![1] - z);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    return at[best]!;
  };
  return { sample, nearest, total };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createWalker(view: OrbitCamera) {
  const path = tourPath();
  let mode: Mode = 'tour';
  let s = 0;
  let idle = 0;
  let eyeY = heightAt(...path.sample(0)) + EYE;
  const keys = new Set<string>();
  /** The on-screen stick, -1..1 each way, +y forward. */
  const stick = { x: 0, y: 0 };

  // The solid world, once it's loaded: until then the eye follows the land alone
  let physics: Physics | null = null;
  let foot = eyeY - EYE;
  /** What's underfoot at x, z for a walker not driven by physics: steps, plinths, the land. */
  const standAt = (x: number, z: number) => {
    const land = heightAt(x, z);
    if (!physics) return land;
    const g = physics.groundAt(x, z, Math.max(foot, land) + 0.55, 2.5);
    // Never climb more than a plinth's height above the land, so a wall is not a stair
    return Math.min(Math.max(g, land - 0.2), land + 1.8);
  };
  const ground = () => {
    view.goal.distance = 0.06;
  };
  // Walking: the head rises and dips a little with each stride, and every footfall is told
  let phase = 0;
  let pace = 0;
  /** Bending down to look at something, 0 standing to 1 crouched. */
  let crouch = 0;
  let crouchGoal = 0;
  let last: [number, number] | null = null;
  let onStep: ((x: number, z: number, pace: number, foot: number) => void) | null = null;
  /** How you're moving over the ground now, eased toward what the keys ask. */
  const vel = [0, 0];
  /** A dip of the head on landing from a jump or a drop, sprung back up. */
  let dip = 0;
  let dipV = 0;
  let wasOnGround = true;
  /** Whether anyone has steered yet: after that the tour never takes over again. */
  let steered = false;
  /** Breath for running, 0 to 1, and whether you've run yourself out. */
  let stamina = 1;
  let bridgeSwing = 0;
  let bridgeT = 0;
  let winded = false;
  let running = false;
  /** Crouched by choice, to sneak or hide, rather than to look at something. */
  let sneaking = false;
  const place = (x: number, z: number, dt: number, footY = standAt(x, z)) => {
    // Landing: how hard you came down sets how far the head dips
    const grounded = physics?.onGround ?? true;
    if (grounded && !wasOnGround) dipV -= Math.min(Math.max(foot - footY, 0.15) * 2.2, 1.4);
    wasOnGround = grounded;
    dipV += (-dip * 90 - dipV * 14) * dt;
    dip += dipV * dt;
    foot = footY;
    crouch += (crouchGoal - crouch) * Math.min(1, dt * 4);
    const goal = footY + EYE - crouch * 0.85;
    // Up and down steps quickly, so the eye never lags behind the feet
    eyeY += (goal - eyeY) * Math.min(1, dt * 16);
    if (Math.abs(goal - eyeY) > 1.5) eyeY = goal;
    let moved = last ? Math.hypot(x - last[0], z - last[1]) : 0;
    if (moved > 3) moved = 0;
    last = [x, z];
    const speed = dt > 0 ? moved / dt : 0;
    pace += (Math.min(speed, 6) - pace) * Math.min(1, dt * 5);
    // A stride of about 1.4 m: two footfalls per cycle, each at the bottom of the dip
    const before = phase;
    phase += (moved / 1.4) * Math.PI * 2;
    if (Math.floor(before / Math.PI) !== Math.floor(phase / Math.PI) && pace > 0.3) onStep?.(x, z, pace, footY);
    // The head: a soft dip at each footfall and a slight sway from foot to foot, across the way
    // you face, both growing with pace and gone when you stand still
    const amount = Math.min(pace / WALK_SPEED, 1.5) * (1 - crouch * 0.6);
    const bob = (Math.cos(phase * 2) * 0.5 - 0.5) * 0.026 * amount;
    let sway = Math.sin(phase) * 0.012 * amount;
    // On the hanging bridge the deck swings under you: a slow sideways roll that grows as you
    // walk and dies away slowly when you stop, and a give with each step
    const swinging = onBridge(x, z) ? 1 : 0;
    bridgeSwing += (Math.min(1, pace / WALK_SPEED) * swinging - bridgeSwing) * Math.min(1, dt * (swinging ? 0.8 : 3));
    bridgeT += dt;
    sway += Math.sin(bridgeT * 1.6) * 0.07 * bridgeSwing + Math.sin(bridgeT * 0.9 + 1) * 0.012 * swinging;
    const give = (Math.cos(phase * 2) * 0.5 - 0.5) * 0.03 * bridgeSwing;
    const yaw = view.goal.yaw;
    view.goal.target = [x - Math.cos(yaw) * sway, eyeY + bob + dip + give, z + Math.sin(yaw) * sway];
  };
  const startTour = () => {
    const t = view.goal.target;
    s = path.nearest(t[0], t[2]);
    mode = 'tour';
  };
  /** Sets the walker's capsule down where the eye is now, before it starts walking. */
  const land = () => {
    const at = last ?? [view.goal.target[0], view.goal.target[2]];
    physics?.teleport(at[0], at[1], foot);
  };

  return {
    get mode() {
      return mode;
    },
    keys,
    stick,
    /** Calls `fn` at each footfall, with where and how fast. */
    set onStep(fn: ((x: number, z: number, pace: number, foot: number) => void) | null) {
      onStep = fn;
    },
    /** Crouches to look at the ground just ahead, or stands up again. */
    crouchDown(low: boolean) {
      crouchGoal = 1;
      if (low) view.goal.pitch = Math.max(view.goal.pitch, 0.75);
    },
    standUp() {
      crouchGoal = sneaking ? 1 : 0;
    },
    /** Crouches to creep or hide, or stands again. */
    toggleCrouch() {
      sneaking = !sneaking;
      crouchGoal = sneaking ? 1 : 0;
    },
    get sneaking() {
      return sneaking;
    },
    get stamina() {
      return stamina;
    },
    get winded() {
      return winded;
    },
    get running() {
      return running;
    },
    /** Knocked back: thrown along vx, vz, metres a second. */
    shove(vx: number, vz: number) {
      vel[0] = vx;
      vel[1] = vz;
    },
    /** Picks you up and sets you down at x, z facing `yaw`; `fresh` also stands you up rested. */
    moveTo(x: number, z: number, yaw: number, fresh = false) {
      mode = 'walk';
      if (fresh) {
        // Waking up: on your feet, breath back
        sneaking = false;
        crouchGoal = 0;
        winded = false;
        stamina = 1;
      }
      last = [x, z];
      foot = standAt(x, z);
      eyeY = foot + EYE;
      vel[0] = 0;
      vel[1] = 0;
      view.goal.target = [x, eyeY, z];
      view.goal.yaw = yaw;
      view.goal.pitch = 0;
      physics?.teleport(x, z);
      view.jump();
    },
    get crouching() {
      return crouchGoal > 0;
    },
    /** Whether walking keys or the stick are held. */
    get moving() {
      return keys.size > 0 || stick.x !== 0 || stick.y !== 0;
    },
    /** Where the feet are, x and z. */
    get at(): readonly [number, number] {
      if (mode === 'held' || !last) return [view.goal.target[0], view.goal.target[2]];
      return last;
    },
    /** How fast the eye is going over the ground, in metres a second. */
    get pace() {
      return pace;
    },
    /** Whether the solid world has loaded. */
    get solid() {
      return physics !== null;
    },
    /** The solid world to walk in. */
    set physics(p: Physics | null) {
      physics = p;
      land();
    },
    /** Someone dragged, scrolled or pressed a key. */
    touched() {
      idle = 0;
      steered = true;
      if (mode === 'tour' || mode === 'held') {
        vel[0] = 0;
        vel[1] = 0;
        mode = 'walk';
        land();
      }
    },
    jump() {
      if (mode !== 'walk' || stamina < 0.15 || !(physics?.onGround ?? false)) return;
      stamina -= 0.12;
      if (sneaking) {
        sneaking = false;
        crouchGoal = 0;
      }
      physics?.jump();
    },
    /** Holds the eye still at a spot, for checking a view: `?at=x,z,yaw,pitch[,height]`. */
    hold(x: number, z: number, yaw: number, pitch: number, height = EYE) {
      mode = 'held';
      foot = standAt(x, z) + Math.max(0, height - EYE);
      view.goal.target = [x, standAt(x, z) + height, z];
      view.goal.distance = 0.06;
      view.goal.yaw = yaw;
      view.goal.pitch = pitch;
    },
    /** Switches between the ground and the view from above. */
    toggleAbove() {
      idle = 0;
      if (mode === 'above') {
        startTour();
        mode = 'walk';
        land();
      } else {
        mode = 'above';
        // Over the town, or over wherever you are out on the path
        const at = last ?? [2, 4];
        view.goal.target = Math.hypot(at[0], at[1]) < 120 ? [2, 3, 4] : [at[0], heightAt(at[0], at[1]) + 2, at[1]];
        view.goal.distance = 42;
        view.goal.pitch = 0.42;
      }
    },
    update(dt: number) {
      idle += dt;
      const moving = keys.size > 0 || stick.x !== 0 || stick.y !== 0;
      if (moving) this.touched();

      if (mode === 'held') return;
      if (mode === 'above') {
        if (idle > 4) view.goal.yaw += DRIFT * dt * Math.min(1, (idle - 4) / 3);
        return;
      }
      ground();
      // The tour drifts back on its own only in town: out on the path you're left where you are
      const at = last ?? [view.goal.target[0], view.goal.target[2]];
      if (mode === 'walk' && !steered && idle > IDLE_TO_TOUR && Math.hypot(at[0], at[1]) < 120) startTour();

      if (mode === 'tour') {
        s += TOUR_SPEED * dt;
        const [x, z] = path.sample(s);
        const [ax, az] = path.sample(s + 6);
        const yaw = Math.atan2(-(ax - x), -(az - z));
        view.goal.yaw = view.pose.yaw + wrap(yaw - view.pose.yaw) * Math.min(1, dt * 1.5);
        view.goal.pitch += (-0.05 - view.goal.pitch) * Math.min(1, dt * 1.5);
        place(x, z, dt);
        return;
      }

      // Walking: forward is where the camera looks, flattened
      let f = stick.y;
      let side = stick.x;
      if (keys.has('w') || keys.has('arrowup')) f += 1;
      if (keys.has('s') || keys.has('arrowdown')) f -= 1;
      if (keys.has('d') || keys.has('arrowright')) side += 1;
      if (keys.has('a') || keys.has('arrowleft')) side -= 1;
      // The same speed every way, diagonals too; a little slower going backwards
      const len = Math.hypot(f, side);
      if (len > 1) {
        f /= len;
        side /= len;
      }
      if (f < 0) f *= 0.7;
      // Running costs breath; run out and you're winded, walking slower, until you get it back
      const wantRun = (keys.has('shift') || Math.hypot(stick.x, stick.y) > 0.96) && f > 0.2 && !sneaking;
      running = wantRun && !winded;
      if (running && pace > 2.6) stamina -= dt / RUN_FOR;
      else stamina += dt * (pace < 0.3 ? 0.2 : 0.11);
      stamina = Math.min(1, Math.max(0, stamina));
      if (stamina <= 0) winded = true;
      if (winded && stamina >= WINDED_UNTIL) winded = false;
      const yaw = view.goal.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      // From where the feet are, not the swaying eye
      const t = last ?? [view.goal.target[0], view.goal.target[2]];
      let wx = fx * f - fz * side;
      let wz = fz * f + fx * side;
      // Slower climbing a slope, as legs are
      const wl = Math.hypot(wx, wz);
      let speed = sneaking || crouchGoal > 0 ? SNEAK_SPEED : running ? RUN_SPEED : WALK_SPEED * (winded ? 0.75 : 1);
      if (wl > 0.01) {
        const grade = (heightAt(t[0] + (wx / wl) * 0.8, t[1] + (wz / wl) * 0.8) - heightAt(t[0], t[1])) / 0.8;
        speed *= 1 - Math.min(Math.max(grade, 0), 0.7) * 0.55;
      }
      wx *= speed;
      wz *= speed;
      // Ease into it and out of it: a step to get going, a step to stop
      const k = Math.min(1, dt * (wl > 0.01 ? START : STOP));
      vel[0] += (wx - vel[0]) * k;
      vel[1] += (wz - vel[1]) * k;
      // Stay out of deep water and within the valley, or out on the forest path and the clearing
      // at its end, and not into the river, only over it on the bridge. At an edge you slide along
      // it rather than stopping dead.
      const blocked = (vx: number, vz: number) => {
        const nx = t[0] + vx * 0.25;
        const nz = t[1] + vz * 0.25;
        const inForest = trailDistance(nx, nz, 24) < 22 || Math.hypot(nx - CLEARING.x, nz - CLEARING.z) < 38;
        const wading = inRiver(nx, nz, 0.2) && !onBridge(nx, nz, 0.1);
        return pondQ(nx, nz) < 0.9 || wading || (Math.hypot(nx, nz) > 160 && !inForest);
      };
      let vx = vel[0]!;
      let vz = vel[1]!;
      if (Math.abs(vx) + Math.abs(vz) > 0.001 && blocked(vx, vz)) {
        if (!blocked(vx, 0)) vz = 0;
        else if (!blocked(0, vz)) vx = 0;
        else {
          vx = 0;
          vz = 0;
        }
        vel[0] = vx;
        vel[1] = vz;
      }
      // A touch wider when running, so speed is felt
      view.goal.fov = 0.95 + Math.min(Math.max(pace - WALK_SPEED, 0) / (RUN_SPEED - WALK_SPEED), 1) * 0.06;
      if (physics) {
        const feet = physics.step(dt, vx, vz);
        place(feet[0], feet[2], dt, feet[1]);
        return;
      }
      const x = t[0] + vx * dt;
      const z = t[1] + vz * dt;
      place(x, z, dt);
    },
  };
}
