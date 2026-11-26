// Turns the field recordings in ~/sound-src into the game’s sounds. See manifest.json for source licences.
//   public/sound/<bed>.mp3     looping beds: forest insects, river, town, fire
//   public/sound/calls.mp3     one sprite of every one-shot call, offsets in calls.json
//   public/sound/steps.mp3     one sprite of footsteps per surface, offsets in steps.json
// Each call and step is found automatically (onsets of loud stretches), cleaned (high-pass, noise
// reduction where the source is noisy), levelled to the same loudness, and faded at both ends.
// Run: nice npx tsx tools/sound/cut.ts
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = join(homedir(), 'sound-src');
const OUT = join(import.meta.dirname, '../../public/sound');
const RATE = 44100;

/** Decodes a stretch of a file to mono floats at RATE, through `filter` (ffmpeg -af). */
function decode(file: string, filter: string, from = 0, length = 0) {
  const args = ['-v', 'error', '-ss', String(from), ...(length ? ['-t', String(length)] : []), '-i', join(SRC, file), '-ac', '1', '-ar', String(RATE)];
  if (filter) args.push('-af', filter);
  args.push('-f', 'f32le', '-');
  const raw = execFileSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

/** RMS in 10 ms frames. */
function envelope(s: Float32Array) {
  const n = Math.floor(RATE / 100);
  const e = new Float32Array(Math.floor(s.length / n));
  for (let i = 0; i < e.length; i++) {
    let a = 0;
    for (let k = 0; k < n; k++) a += s[i * n + k]! ** 2;
    e[i] = Math.sqrt(a / n);
  }
  return e;
}

interface Find {
  /** Loud enough to count: this many dB under the loudest frame. */
  under: number;
  /** Quiet stretches shorter than this (s) join two loud ones into one event. */
  join: number;
  /** Events kept: shortest and longest (s), before the tail. */
  min: number;
  max: number;
  /** Seconds kept before the onset and after the end (the ring of the place). */
  pre: number;
  tail: number;
  /** How many to keep; the loudest first, never overlapping. */
  count: number;
}

/** Loud stretches of `s`: [start, end] in samples. */
function events(s: Float32Array, f: Find) {
  const e = envelope(s);
  let peak = 0;
  for (const v of e) peak = Math.max(peak, v);
  const thr = peak * 10 ** (-f.under / 20);
  const found: { a: number; b: number; energy: number }[] = [];
  let a = -1;
  let quiet = 0;
  for (let i = 0; i <= e.length; i++) {
    const loud = i < e.length && e[i]! > thr;
    if (loud) {
      if (a < 0) a = i;
      quiet = 0;
    } else if (a >= 0 && (++quiet * 0.01 > f.join || i === e.length)) {
      const b = i - quiet;
      const len = (b - a) * 0.01;
      if (len >= f.min) {
        // A long stretch gives several events, each as long as allowed
        const step = Math.round(f.max * 100);
        for (let c = a; c < b; c += step) {
          const d = Math.min(b, c + step);
          if ((d - c) * 0.01 < f.min) break;
          let en = 0;
          for (let k = c; k <= d; k++) en += e[k]! ** 2;
          found.push({ a: c, b: d, energy: en / (d - c + 1) });
        }
      }
      a = -1;
    }
  }
  // Loud but not the outliers: sort by energy and drop the very loudest (handling bumps, clips)
  found.sort((x, y) => y.energy - x.energy);
  const pick = found.length > f.count + 2 ? found.slice(1) : found;
  const kept: [number, number][] = [];
  for (const ev of pick) {
    const s0 = Math.max(0, Math.round((ev.a * 0.01 - f.pre) * RATE));
    const s1 = Math.min(s.length, Math.round((ev.b * 0.01 + f.tail) * RATE));
    if (kept.some(([x, y]) => s0 < y && s1 > x)) continue;
    kept.push([s0, s1]);
    if (kept.length >= f.count) break;
  }
  return kept.sort((x, y) => x[0] - y[0]);
}

/** A clip levelled to `rmsDb` (over its loudest half second), peak held under -1 dBFS, faded. */
function level(c: Float32Array, rmsDb: number) {
  const e = envelope(c);
  const sorted = [...e].sort((x, y) => y - x);
  const top = sorted.slice(0, Math.max(1, Math.min(50, sorted.length >> 1)));
  const rms = Math.sqrt(top.reduce((a, v) => a + v * v, 0) / top.length) || 1e-6;
  let peak = 0;
  for (const v of c) peak = Math.max(peak, Math.abs(v));
  const gain = Math.min(10 ** (rmsDb / 20) / rms, 0.89 / (peak || 1));
  const out = new Float32Array(c.length);
  const fin = Math.min(c.length >> 2, Math.round(RATE * 0.006));
  const fout = Math.min(c.length >> 1, Math.round(RATE * 0.06));
  for (let i = 0; i < c.length; i++) {
    let g = gain;
    if (i < fin) g *= i / fin;
    if (i > c.length - fout) g *= (c.length - i) / fout;
    out[i] = c[i]! * g;
  }
  return out;
}

interface Item {
  file: string;
  /** ffmpeg filters: cleaning for this source. */
  filter?: string;
  /** Only this part of the file (s). */
  from?: number;
  length?: number;
  find: Find;
  /** Level, dBFS RMS over its loudest stretch. */
  rms: number;
}

const HP = (hz: number) => `highpass=f=${hz}`;
const NR = (floor: number) => `afftdn=nr=10:nf=${Math.max(-80, Math.min(-20, floor))}`;
const CALL: Find = { under: 22, join: 0.35, min: 0.25, max: 3.5, pre: 0.08, tail: 0.6, count: 4 };
const STEP: Find = { under: 20, join: 0.06, min: 0.04, max: 0.35, pre: 0.012, tail: 0.12, count: 8 };

/** One-shot calls, by the name the game plays them by. */
const CALLS: Record<string, Item[]> = {
  // An Asian-elephant zoo recording (the trumpet), and African rumbles and roars, which carry the
  // same infrasonic purr and the same blare; no wild Asian recording has an open licence
  trumpet: [{ file: 'wild/ele/fs819668_zoo.ogg', filter: `${HP(60)},${NR(-38)}`, find: { ...CALL, under: 14, max: 4.5, tail: 0.9, count: 2 }, rms: -16 }],
  rumble: [{ file: 'wild/ele/fs818986_serengeti_rumble.ogg', filter: `${HP(16)},lowpass=f=700`, find: { ...CALL, under: 24, join: 0.6, min: 0.8, max: 4.5, tail: 0.5, count: 3 }, rms: -16 }],
  roar: [{ file: 'wild/ele/fs35142_tanzania_growl.ogg', filter: `${HP(40)},${NR(-58)}`, find: { ...CALL, under: 14, min: 0.6, max: 3.2, count: 3 }, rms: -16 }],
  branch: [
    { file: 'wild/ele/fs540435_branch_forest.ogg', filter: HP(70), find: { ...CALL, under: 26, min: 0.05, max: 1.6, join: 0.12, tail: 0.4, count: 4 }, rms: -16 },
    { file: 'wild/ele/fs660471_branch_crack.ogg', filter: HP(70), find: { ...CALL, under: 20, min: 0.05, max: 1.6, join: 0.12, tail: 0.4, count: 2 }, rms: -16 },
    { file: 'wild/ele/fs434555_branches_snapped.ogg', filter: HP(70), find: { ...CALL, under: 20, min: 0.05, max: 1.6, join: 0.12, tail: 0.4, count: 2 }, rms: -16 },
  ],
  // A captive dhole's yap, the first 0.9 s (after it a person whistles)
  yap: [{ file: 'wild/dhole/cm_dhole_yap_squeak.oga', filter: HP(300), length: 0.9, find: { ...CALL, under: 26, min: 0.03, max: 0.8, join: 0.08, tail: 0.1, count: 3 }, rms: -18 }],
  // The barking deer (muntjac), of these hills, alarm-calling at night: the jungle's warning
  deer: [{ file: 'wild/deer/cm_barking_deer_night.wav', filter: `${HP(150)},${NR(-48)}`, find: { ...CALL, under: 14, min: 0.12, max: 1.4, tail: 0.9, count: 4 }, rms: -17 }],
  monkey: [{ file: 'wild/deer/fs187587_bonnet_macaque_alarm.ogg', filter: `${HP(200)},${NR(-47)}`, find: { ...CALL, under: 20, join: 0.2, max: 2.5, count: 3 }, rms: -18 }],
  // Night birds of Kerala and the Ghats
  nightjar: [
    { file: 'wild/birds/cm_indiannightjar_xc360498.mp3', filter: `${HP(400)},${NR(-50)}`, find: { ...CALL, max: 3.5, join: 0.5, count: 2 }, rms: -19 },
    { file: 'wild/birds/cm_junglenightjar_mtabu.ogg', filter: `${HP(300)},${NR(-70)}`, find: { ...CALL, max: 3.5, join: 0.5, count: 2 }, rms: -19 },
    { file: 'wild/birds/cm_greateared_nightjar_vazhachal.ogg', filter: HP(300), find: { ...CALL, max: 3, count: 2 }, rms: -19 },
  ],
  owl: [
    { file: 'wild/birds/xc757995_mottledwoodowl_kerala.mp3', filter: HP(150), find: { ...CALL, max: 3.5, join: 0.5, count: 2 }, rms: -18 },
    { file: 'wild/birds/cm_brownwoodowl_wynaad.ogg', filter: HP(150), find: { ...CALL, max: 3.5, join: 0.5, count: 2 }, rms: -18 },
    { file: 'wild/birds/cm_brownfishowl_bondla.wav', filter: `${HP(120)},${NR(-38)}`, find: { ...CALL, max: 3, join: 0.5, count: 1 }, rms: -18 },
  ],
  scops: [{ file: 'wild/birds/cm_scops_dandoba.wav', filter: `${HP(250)},${NR(-60)}`, find: { ...CALL, min: 0.1, max: 1.2, count: 3 }, rms: -19 }],
  owlet: [{ file: 'wild/birds/cm_spottedowlet_kolhapur.wav', filter: `${HP(400)},${NR(-52)}`, find: { ...CALL, max: 3.2, count: 3 }, rms: -19 }],
  lapwing: [{ file: 'wild/birds/xc878420_lapwing_kerala.mp3', filter: HP(400), find: { ...CALL, max: 3, count: 2 }, rms: -18 }],
  cuckoo: [{ file: 'wild/birds/xc743750_hawkcuckoo_kerala.mp3', filter: HP(400), find: { ...CALL, under: 18, max: 3.5, join: 0.4, count: 2 }, rms: -19 }],
  // Things in the dark close by
  rustle: [{ file: 'foley/rustle_kyles_brush.ogg', filter: HP(150), find: { ...CALL, under: 20, min: 0.3, max: 1.8, join: 0.2, tail: 0.2, count: 6 }, rms: -20 }],
  creak: [{ file: 'foley/creak_patrick_wood.ogg', filter: HP(80), find: { ...CALL, under: 18, min: 0.15, max: 1.6, join: 0.15, tail: 0.2, count: 5 }, rms: -20 }],
};

/** Footsteps per surface. Sandals where a sandal recording exists. */
const STEPS: Record<string, Item> = {
  dirt: { file: 'foley/step_dirt_kyles_sandals.ogg', filter: HP(70), find: STEP, rms: -20 },
  leaves: { file: 'foley/step_leaves_joelmcdaniel.ogg', filter: HP(90), find: { ...STEP, max: 0.45 }, rms: -20 },
  gravel: { file: 'foley/step_gravel_alexmol.ogg', filter: HP(90), find: STEP, rms: -20 },
  grass: { file: 'foley/step_grass_henkonen.ogg', filter: HP(90), find: STEP, rms: -21 },
  wood: { file: 'foley/step_wood_bridge_audioninja.ogg', filter: HP(60), find: { ...STEP, tail: 0.18 }, rms: -19 },
  stone: { file: 'foley/step_stone_sandals_ftpalad.ogg', filter: `${HP(90)},${NR(-60)}`, find: STEP, rms: -21 },
  wet: { file: 'foley/step_wet_aglinder.ogg', filter: `${HP(80)},${NR(-56)}`, find: { ...STEP, max: 0.45 }, rms: -21 },
};

/** Looping beds: a stretch of each, its end crossfaded into its start so it loops unseen. */
const BEDS: Record<string, { file: string; from: number; length: number; filter: string; lufs: number }> = {
  // Insects of an Indian (Goa) night: crickets and katydids, steady, no birds
  forest: { file: 'wild/insects/fs803556_goa_alley.ogg', from: 20, length: 70, filter: HP(200), lufs: -24 },
  river: { file: 'foley/river_hargis_burbling.ogg', from: 10, length: 60, filter: HP(50), lufs: -24 },
  // A far town: distant traffic and horns, softened by distance
  town: { file: 'foley/town_delhi_far_soundensemble.ogg', from: 2, length: 52, filter: `${HP(80)},lowpass=f=3200`, lufs: -28 },
  fire: { file: 'foley/fire_kyles_smallcampfire.ogg', from: 2, length: 28, filter: `${HP(120)},${NR(-44)}`, lufs: -24 },
};

const GAP = Math.round(RATE * 0.25);

function wav(file: string, s: Float32Array, channels = 1) {
  const b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + s.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2 * channels, 28);
  b.writeUInt16LE(2 * channels, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i]!)) * 32767), 44 + i * 2);
  writeFileSync(file, b);
}
const mp3 = (from: string, to: string, extra: string[] = []) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', from, ...extra, '-c:a', 'libmp3lame', '-q:a', '3', to]);

const sheets: Record<string, Record<string, [number, number][]>> = {};
/** Lays clips one after another with a gap of silence; returns the offsets in seconds. */
function sprite(name: string, groups: Record<string, Float32Array[]>) {
  const offsets: Record<string, [number, number][]> = {};
  const parts: Float32Array[] = [new Float32Array(GAP)];
  let at = GAP;
  for (const [k, clips] of Object.entries(groups)) {
    offsets[k] = [];
    for (const c of clips) {
      offsets[k].push([+(at / RATE).toFixed(3), +(c.length / RATE).toFixed(3)]);
      parts.push(c, new Float32Array(GAP));
      at += c.length + GAP;
    }
  }
  const all = new Float32Array(at);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  const tmp = join(tmpdir(), `${name}.wav`);
  wav(tmp, all);
  // Mono, 96 kbit/s VBR is plenty for single calls and steps
  mp3(tmp, join(OUT, `${name}.mp3`), ['-ac', '1']);
  unlinkSync(tmp);
  sheets[name] = offsets;
  console.log(`${name}.mp3 ${(statSync(join(OUT, `${name}.mp3`)).size / 1e6).toFixed(2)} MB, ${(at / RATE).toFixed(0)} s:`, Object.entries(offsets).map(([k, v]) => `${k} ${v.length}`).join(', '));
}

function cut(it: Item) {
  const s = decode(it.file, it.filter ?? '', it.from ?? 0, it.length ?? 0);
  return events(s, it.find).map(([a, b]) => level(s.subarray(a, b), it.rms));
}

const calls: Record<string, Float32Array[]> = {};
for (const [k, items] of Object.entries(CALLS)) {
  calls[k] = items.flatMap(cut);
  if (!calls[k].length) console.warn('no clips for', k);
}
sprite('calls', calls);

const steps: Record<string, Float32Array[]> = {};
for (const [k, it] of Object.entries(STEPS)) {
  steps[k] = cut(it);
  if (steps[k].length < 4) console.warn('few steps for', k, steps[k].length);
}
sprite('steps', steps);
// The offsets, for the game to import: [start, length] in seconds of each clip in its sheet
writeFileSync(join(import.meta.dirname, '../../src/audio/sprites.json'), JSON.stringify(sheets, null, 1) + '\n');

for (const [k, b] of Object.entries(BEDS)) {
  // A loop: the stretch plus 3 s more, the extra crossfaded over the start
  const fade = 3;
  const tmp = join(tmpdir(), `${k}.raw`);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', String(b.from), '-t', String(b.length + fade), '-i', join(SRC, b.file), '-ac', '2', '-ar', String(RATE),
    '-af', `${b.filter},loudnorm=I=${b.lufs}:TP=-2:LRA=7`, '-ar', String(RATE), '-f', 's16le', tmp,
  ]);
  // Equal-power crossfade of the tail into the head
  const raw = readFileSync(tmp);
  const data = raw;
  const frames = Math.floor(data.length / 4);
  const n = Math.round(fade * RATE);
  const keep = frames - n;
  const out = new Float32Array(keep * 2);
  for (let i = 0; i < keep; i++)
    for (let ch = 0; ch < 2; ch++) {
      let v = data.readInt16LE((i * 2 + ch) * 2) / 32767;
      if (i < n) {
        const t = i / n;
        const tail = data.readInt16LE(((keep + i) * 2 + ch) * 2) / 32767;
        v = v * Math.sin((t * Math.PI) / 2) + tail * Math.cos((t * Math.PI) / 2);
      }
      out[i * 2 + ch] = v;
    }
  const looped = join(tmpdir(), `${k}-loop.wav`);
  wav(looped, out, 2);
  mp3(looped, join(OUT, `${k}.mp3`), ['-ac', '2', '-q:a', '4']);
  unlinkSync(tmp);
  unlinkSync(looped);
  console.log(`${k}.mp3 ${(statSync(join(OUT, `${k}.mp3`)).size / 1e6).toFixed(2)} MB`);
}
