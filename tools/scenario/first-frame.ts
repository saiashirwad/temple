import { z } from 'zod';
import { spotAt } from '../../src/content/viewpoints.ts';
import { resolveLaunch } from '../../src/game/launch.ts';

// Retain additional state recorded by newer game builds in capture output.
const cameraFrame = z.looseObject({
  at: z.tuple([z.number(), z.number()]),
  yaw: z.number(),
  pitch: z.number(),
  mode: z.string(),
  readingNote: z.boolean(),
  sitting: z.number(),
  ended: z.boolean(),
  guardGone: z.boolean(),
});

export type FirstFrame = z.infer<typeof cameraFrame> & { ms: number };

export function readFirstFrame(ms: number, snapshot: string): FirstFrame {
  return { ...cameraFrame.parse(JSON.parse(snapshot)), ms };
}

/** A later passing replay cannot excuse a first frame drawn at the wrong location. */
export function verifyFirstFrame(params: URLSearchParams, frame: FirstFrame) {
  const launch = resolveLaunch(params);
  const camera = launch.camera;

  if (!camera) return;
  const [x, z, yaw, pitch] = camera;
  const gap = Math.hypot(frame.at[0] - x, frame.at[1] - z);
  const viewpoint = !launch.bungalow && (launch.preset ? !!spotAt(launch.preset) : launch.tour || params.has('at'));

  if (gap > (viewpoint ? 0.01 : 8)) throw new Error(`First frame was ${gap.toFixed(2)} m from its entry position`);

  if (viewpoint && (frame.mode !== 'held' || Math.abs(Math.sin((frame.yaw - yaw) / 2)) > 0.001 || Math.abs(frame.pitch - pitch) > 0.001))
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
