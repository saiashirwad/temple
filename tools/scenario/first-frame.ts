import { resolveLaunch, SPOTS } from '../../src/game/launch.ts';

export interface FirstFrame {
  ms: number;
  at: [number, number];
  yaw: number;
  mode: string;
  readingNote: boolean;
  sitting: number;
  ended: boolean;
  guardGone: boolean;
}

/** A later passing replay cannot excuse a first frame drawn at the wrong location. */
export function verifyFirstFrame(params: URLSearchParams, frame: FirstFrame) {
  const launch = resolveLaunch(params);
  const camera = launch.camera;
  if (!camera) return;
  const [x, z, yaw] = camera;
  const gap = Math.hypot(frame.at[0] - x, frame.at[1] - z);
  const viewpoint = launch.tour && (!launch.preset || !!SPOTS[launch.preset]);
  if (gap > (viewpoint ? 0.01 : 8)) throw new Error(`First frame was ${gap.toFixed(2)} m from its entry position`);
  if (viewpoint && (frame.mode !== 'held' || Math.abs(Math.sin((frame.yaw - yaw) / 2)) > 0.001))
    throw new Error('First frame missed the requested held camera');
  if (launch.bungalow) {
    const conditions = {
      veranda: !frame.readingNote && frame.sitting < 0 && !frame.ended,
      'reading-note': frame.readingNote,
      seated: frame.sitting >= 0 && !frame.guardGone,
      'guard-gone': frame.guardGone && !frame.ended,
      ending: frame.ended && frame.guardGone,
    };
    if (!conditions[launch.beat]) throw new Error('First frame missed bungalow state ' + launch.beat);
  }
}
