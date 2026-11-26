/** Route movement shared by the town and the NPC rehearsal. Coordinates are metres in x/z. */
export type XZ = [number, number];
export interface WalkPlan {
  route: XZ[];
  loop?: boolean;
  speed: number;
  from?: number;
  pause?: number;
  side?: number;
}
export interface Walker {
  metres: number;
  dir: number;
  speed: number;
  yaw: number;
  wait: number;
  lens: number[];
  length: number;
  pts: XZ[];
  dodge: number;
}
export function makeWalker(plan: WalkPlan): Walker {
  const pts = plan.loop ? [...plan.route, plan.route[0]!] : plan.route;
  const lens = [0];
  for (let k = 1; k < pts.length; k++)
    lens.push(lens[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
  const length = lens.at(-1)!;
  return {
    metres: length ? (plan.from ?? 0) % length : 0,
    dir: 1,
    speed: plan.speed,
    yaw: 0,
    wait: 0,
    lens,
    length,
    pts,
    dodge: 0,
  };
}
export function walkerAt(p: Walker, m: number) {
  let k = 1;
  while (k < p.pts.length - 1 && p.lens[k]! < m) k++;
  const a = p.pts[k - 1]!;
  const b = p.pts[k]!;
  const t = Math.min(1, Math.max(0, (m - p.lens[k - 1]!) / (p.lens[k]! - p.lens[k - 1]! || 1)));
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export function stepWalker(
  p: Walker,
  plan: WalkPlan,
  dt: number,
  you: readonly [number, number],
  blocked: (x: number, z: number) => boolean,
) {
  const here = walkerAt(p, p.metres);
  const hd = here.heading + (p.dir < 0 ? Math.PI : 0);
  const fx = Math.sin(hd),
    fz = Math.cos(hd);
  const ox = you[0] - here.x,
    oz = you[1] - here.z;
  const ahead = ox * fx + oz * fz,
    across = ox * fz - oz * fx;
  const inWay = ahead > -0.2 && ahead < 1.3 && Math.abs(across - p.dodge) < 0.75;
  if (inWay) {
    const want = across > 0 ? -0.8 : 0.8;
    if (!blocked(here.x + fz * want, here.z - fx * want)) p.dodge += (want - p.dodge) * Math.min(1, dt * 2.5);
  } else if (Math.hypot(ox, oz) > 2) {
    const back = p.dodge * Math.min(1, dt * 1.2);
    if (!blocked(here.x + fz * (p.dodge - back), here.z - fx * (p.dodge - back))) p.dodge -= back;
  }
  const stopped = inWay && ahead < 0.9 && Math.abs(across - p.dodge) < 0.5;
  if (p.wait > 0) {
    p.wait -= dt;
    p.speed = Math.max(0, p.speed - dt * 1.5);
    if (p.wait <= 0) p.dir = -p.dir;
  } else p.speed += ((stopped ? 0 : plan.speed) - p.speed) * Math.min(1, dt * (stopped ? 5 : 1.2));
  p.metres += p.speed * p.dir * dt;
  if (plan.loop && p.length) p.metres = ((p.metres % p.length) + p.length) % p.length;
  else if (p.metres > p.length || p.metres < 0) {
    p.metres = Math.min(Math.max(p.metres, 0), p.length);
    if (p.wait <= 0) p.wait = plan.pause ?? 3;
  }
  const s = walkerAt(p, p.metres);
  const heading = s.heading + (p.dir < 0 ? Math.PI : 0);
  p.yaw = wrap(p.yaw + wrap(heading - p.yaw) * Math.min(1, dt * 3));
  const side = (plan.side ?? 0) + p.dodge;
  return { x: s.x + Math.cos(heading) * side, z: s.z - Math.sin(heading) * side, inWay, stopped };
}
