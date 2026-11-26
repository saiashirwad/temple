// Small quaternion helpers for placing rows on the CPU: [x, y, z, w].

type V3 = [number, number, number];
export type Quat = [number, number, number, number];

/** A turn of `yaw` about the vertical. */
export const yawQ = (yaw: number): Quat => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
/** A turn of `a` about x. */
export const xQ = (a: number): Quat => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
/** A turn of `a` about z. */
export const zQ = (a: number): Quat => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];

/** `a` then `b` (a * b). */
export const qmul = (a: number[], b: number[]): Quat => [
  a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!,
  a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!,
  a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!,
  a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!,
];

/** `v` turned by the quaternion `q`. */
export const qrot = (q: Quat, v: V3): V3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
