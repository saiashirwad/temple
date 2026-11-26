import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUNING } from '../src/content/tuning.ts';

// A snapshot of every tuning value. If this fails you changed one: if you meant to, change it here too.
const SNAPSHOT = {
  move: { arrive: 0.05, brake: 2, accel: 3, turn: 4 },
  dholes: {
    size: [3, 4], smallChance: 0.5, firstIn: [45, 75], afterDown: [60, 100], afterLeave: [80, 150], fromBehind: 1.2,
    spawnDist: 60, summonDist: 17, scatter: 4, answerIn: 1.3, answerOffset: [8, -6], stride: 1.3,
    coming: { trot: 4.2, stalkDist: 38, stalk: 2.4, spacingTrot: 2.2, spacingStalk: 5, whistleEvery: [4, 8], noticeDist: 22, passBeyond: 25, passSide: 10, giveUp: 40 },
    searching: { speed: 1.5, turn: 2, sniffRate: 0.7, sniffPhase: 2, sniffAmp: 3, spacing: 1.5, growlDist: 18, growlEvery: [3, 6], seeDist: 15, giveUp: 12 },
    attack: {
      firstLunge: 1.2, firstLungeSeen: 0.8, lungeEvery: [1.8, 3.2], runHaste: 2.2, viewCos: 0.8, tallPace: 1.6, hold: 7,
      nerveTorch: 1, nerveTorchCover: 1.7, nerveDark: 0.4, nerveDecay: 0.5, nerveRun: 3, nervePerBite: 2,
      ringSpin: 0.5, ring: 5.5, ringPerNerve: 0.35, ringSpeed: 3.4, ringTurn: 6, backRing: 8, backSpeed: 6, backFeint: 1.2, backBite: 0.8,
      lungeSpeed: 7.5, lungeTurn: 10, feintAt: 2.6, reach: 1.1, lungeFor: 1.6, bite: [0.08, 0.13], seen: 0.7, behind: 1.3, push: 2.2,
      growlEvery: [1.2, 2.5], giveUp: 45,
    },
    leaving: { ahead: 10, speed: 5.5, turn: 3, goneDist: 70 },
  },
  herd: {
    sizes: [1.05, 0.95, 0.55], spreadAngle: 0.9, spacing: 3, startYaw: 1.5, firstWait: [3, 10], stride: 2.6, range: 200, warnDist: 55,
    sense: {
      stillPace: 0.2, still: 0.05, crouch: 0.18, walk: 1, run: 3.2, beamCos: 0.9, beamDist: 35, lit: 0.7, glow: 0.12, near: 32, span: 20, reachMax: 1.5,
      scentCos: 0.35, scentDist: 48, scentGain: 0.6, downCos: -0.3, downMuffle: 0.6, gain: 0.11, scentRate: 0.11, riseMin: 0.012, decay: 0.045, scentTell: 0.08, scentAlarm: 0.3,
    },
    alarm: { threat: 0.3, alert: 0.35, alertRate: 2, rumble: 0.45, trumpet: 0.8, calm: 0.25, charge: 1 },
    charge: { mockChance: 0.45, speed: 6.8, mockSpeed: 5, turn: 5, thudEvery: 0.32, hitDist: 2.4, dmg: 0.5, push: 7, afterHit: 0.5, mockRun: 12, mockStop: 7, maxRun: 28, maxT: 9, afterStop: 0.55 },
    alert: { calfBehind: 2, speed: 1.2, turn: 1.5, face: 1.2 },
    feed: { wait: [6, 16], roam: 0.55, calfNear: 3, speed: 0.6, calfSpeed: 0.8, turn: 0.8 },
  },
  player: { afterDown: 0.7, healWild: 0.006, healSafe: 0.05, wait: 6, healAloft: 0.1, aloftWait: 2 },
  maxStep: 1 / 30,
};

test('TUNING matches its snapshot', () => {
  assert.deepStrictEqual(TUNING, SNAPSHOT);
});
