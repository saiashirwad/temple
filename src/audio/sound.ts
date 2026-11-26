// The night as heard, kept low: crickets in town and the insects of the forest, a far town's
// traffic, the river, the lamps' flames up close, your own sandals on whatever is underfoot, the
// night birds of the Ghats calling from far off, and the animals of the trail.
//
// Nearly all of it is field recordings (public/sound/CREDITS.txt, cut by tools/sound/cut.ts into
// beds and two sprite sheets whose offsets are src/audio/sprites.json). The engines, the wind in the
// canopy, your breath and heart, and the dholes' whistle and growl are made here. Sound starts at the first tap or key, as browsers require, and the whole
// context is suspended while the tab is hidden or the sound is muted.

import SPRITES from './sprites.json';
import { surfaceAt } from '../world/surface.ts';
import { onRoad } from '../world/terrain.ts';

type V3 = [number, number, number];
import { SOUND_FILES as FILES } from '../content/assets.ts';
type Sheet = keyof typeof SPRITES;
export type Call = keyof typeof SPRITES.calls;
/** The whole mix, kept low: a quiet night. */
const LEVEL = 0.45;
/** Listener, river, canopy and engines are steered this often (seconds), not every frame. */
const TICK = 0.05;
type Name = (typeof FILES)[number];

/** Each engine's voice: its tone, a second tone above or below, how it pulses with its firing. */
const ENGINE = {
  scooter: { base: 62, second: 2.01, cutoff: 900, mix: 0.25, pulse: 0.15, firing: 31, level: 0.16 },
  auto: { base: 27, second: 0.5, cutoff: 520, mix: 0.7, pulse: 0.5, firing: 13.5, level: 0.22 },
  // The bus's diesel: a low knock and a deep growl, heard from further off
  bus: { base: 19, second: 1.5, cutoff: 330, mix: 0.6, pulse: 0.35, firing: 8.5, level: 0.3 },
} as const;

export interface Rider {
  position: V3;
  /** Velocity in metres a second, for the Doppler shift. */
  velocity: V3;
  kind: 'scooter' | 'auto' | 'bus';
  on: boolean;
}

export interface SoundWorld {
  /** Unused; kept so existing callers still compile. */
  homes?: V3[];
  /** Unused; kept so existing callers still compile. */
  walls?: V3[];
  /** Open flames worth hearing up close. */
  fires: V3[];
}

export function createSound(world: SoundWorld, random = Math.random) {
  const rand = (a: number, b: number) => a + random() * (b - a);
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const buffers = new Map<Name, AudioBuffer>();
  let muted = localStorage.getItem('temple-muted') === '1';
  let started = false;
  let noise: AudioBuffer | null = null;
  /** One-shot voices still sounding (or waiting to). Returns to 0 when all is quiet. */
  let live = 0;

  // ---- suspend the whole context when hidden or muted, so nothing runs in the background
  let pause: ReturnType<typeof setTimeout> | undefined;
  const sync = () => {
    if (!ctx) return;
    clearTimeout(pause);
    if (document.hidden) void ctx.suspend();
    // Let the mute fade out first
    else if (muted) pause = setTimeout(() => void (ctx && muted && ctx.suspend()), 600);
    else void ctx.resume();
  };

  // ---- the little speaker button
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Sound');
  button.style.cssText =
    'position:fixed;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));z-index:5;width:40px;height:40px;border-radius:20px;border:1px solid #fff3;background:#0006;color:#f3e6cc;display:grid;place-items:center;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:0';
  const icon = () => {
    const on = started && !muted;
    button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/>${on ? '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>' : '<path d="m16 9 5 6M21 9l-5 6"/>'}</svg>`;
  };
  icon();
  document.body.append(button);
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!started) {
      muted = false;
      start();
    } else muted = !muted;
    localStorage.setItem('temple-muted', muted ? '1' : '0');
    sync();
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.15);
    icon();
  });
  // The first gesture starts the sound; later ones wake a context the browser suspended (iOS
  // won't resume from visibilitychange alone)
  const wake = (event: Event) => {
    if (muted || !event.isTrusted) return;
    if (!started) start();
    else if (ctx && ctx.state !== 'running' && !document.hidden) void ctx.resume();
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) addEventListener(ev, wake, { passive: true });

  function start() {
    if (started) return;
    started = true;
    ctx = new AudioContext({ latencyHint: 'playback' });
    void ctx.resume();
    document.addEventListener('visibilitychange', sync);
    master = ctx.createGain();
    master.gain.value = 0;
    master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime + 0.1, 1.2);
    // A touch of compression keeps a near call from jumping out
    const squeeze = ctx.createDynamicsCompressor();
    squeeze.threshold.value = -14;
    squeeze.ratio.value = 3;
    master.connect(squeeze).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const n = noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = random() * 2 - 1;
    icon();
    void load();
  }

  async function load() {
    const c = ctx!;
    // The hills' echo, built when the page has a moment to spare
    if (typeof requestIdleCallback === 'function') requestIdleCallback(buildEcho, { timeout: 4000 });
    else setTimeout(buildEcho, 500);
    await Promise.all(
      FILES.map(async (name) => {
        try {
          const raw = await (await fetch(`${import.meta.env.BASE_URL}sound/${name}.mp3`)).arrayBuffer();
          buffers.set(name, await c.decodeAudioData(raw));
        } catch (e) {
          console.warn('sound', name, e);
        }
      }),
    );
    beds();
    built();
  }

  let echo: ConvolverNode | null = null;
  function buildEcho() {
    const c = ctx;
    if (!c || !master || echo) return;
    const len = Math.floor(c.sampleRate * 3.8);
    const buf = c.createBuffer(2, len, c.sampleRate);
    const fade = c.sampleRate * 0.08;
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < fade ? i / fade : 1);
    }
    const e = c.createConvolver();
    e.buffer = buf;
    const back = c.createGain();
    back.gain.value = 0.5;
    e.connect(back).connect(master);
    echo = e;
  }

  // ---- nodes
  const panner = (ref: number, rolloff = 1, max = 400, model: PanningModelType = 'HRTF') => {
    const p = ctx!.createPanner();
    p.panningModel = model;
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = max;
    return p;
  };
  const put = (p: PannerNode, at: V3, smooth = 0.05) => {
    const t = ctx!.currentTime;
    p.positionX.setTargetAtTime(at[0], t, smooth);
    p.positionY.setTargetAtTime(at[1], t, smooth);
    p.positionZ.setTargetAtTime(at[2], t, smooth);
  };
  /** One-shots only play into a running context: nothing piles up while suspended. */
  const ready = () => !!ctx && !!master && ctx.state === 'running';

  /**
   * A one-shot sound: an output gain (`out`, at 1) into one panner at `at` (or straight to `to`,
   * default the master), and every node made through it. When the last source it played ends,
   * the whole chain is disconnected. HRTF only when asked: short sounds use equal-power panning.
   */
  const voice = (at: V3 | null, o: { ref?: number; rolloff?: number; max?: number; hrtf?: boolean; to?: AudioNode } = {}) => {
    const c = ctx!;
    const nodes: AudioNode[] = [];
    let pending = 0;
    let armed = false;
    let gone = false;
    live++;
    const end = () => {
      if (gone || pending > 0 || !armed) return;
      gone = true;
      for (const n of nodes) n.disconnect();
      live--;
    };
    const track = <T extends AudioNode>(n: T) => (nodes.push(n), n);
    const out = track(c.createGain());
    const dest = o.to ?? master!;
    let p: PannerNode | null = null;
    if (at) {
      p = track(panner(o.ref ?? 4, o.rolloff ?? 1, o.max ?? 400, o.hrtf ? 'HRTF' : 'equalpower'));
      p.positionX.value = at[0];
      p.positionY.value = at[1];
      p.positionZ.value = at[2];
      out.connect(p).connect(dest);
    } else out.connect(dest);
    // Everything is scheduled synchronously; once that's done, a voice that played nothing goes
    queueMicrotask(() => {
      armed = true;
      end();
    });
    return {
      out,
      p,
      gain(value = 1) {
        const g = track(c.createGain());
        g.gain.value = value;
        return g;
      },
      filter(type: BiquadFilterType, freq: number, q?: number) {
        const f = track(c.createBiquadFilter());
        f.type = type;
        f.frequency.value = freq;
        if (q !== undefined) f.Q.value = q;
        return f;
      },
      osc(type: OscillatorType = 'sine') {
        const s = track(c.createOscillator());
        s.type = type;
        return s;
      },
      noise() {
        const s = track(c.createBufferSource());
        s.buffer = noise;
        return s;
      },
      /** Starts `src` at `t` and stops it at `stop`; noise starts somewhere random in the buffer. */
      clip(buffer: AudioBuffer) {
        const s = track(c.createBufferSource());
        s.buffer = buffer;
        return s;
      },
      play(src: OscillatorNode | AudioBufferSourceNode, t: number, stop: number, offset?: number, length?: number) {
        pending++;
        src.onended = () => {
          pending--;
          end();
        };
        if (src instanceof AudioBufferSourceNode) src.start(t, offset ?? random() * 3, length ?? stop - t);
        else {
          src.start(t);
          src.stop(stop);
        }
      },
    };
  };
  type Voice = ReturnType<typeof voice>;

  /** The last clip played of each item, so the same one never plays twice running. */
  const lastOf = new Map<string, number>();
  interface ClipOptions {
    gain?: number;
    ref?: number;
    rolloff?: number;
    max?: number;
    hrtf?: boolean;
    /** Pitch: a little random around it, so a call heard twice is never quite the same. */
    rate?: number;
    /** A low-pass at this frequency: distance, or a soft footfall. */
    low?: number;
    /** A low shelf boost in dB under 120 Hz, for the rumbles you feel. */
    shelf?: number;
    /** How much goes to the hills' echo. */
    echo?: number;
    /** Seconds from now. */
    delay?: number;
  }
  /**
   * Plays a variant of `item` from a sprite sheet at `at` (or in your head when null). Returns the
   * voice, or null if the sheet hasn't loaded (callers fall back to the synth).
   */
  const sprite = (sheet: Sheet, item: string, at: V3 | null, o: ClipOptions = {}) => {
    const buf = buffers.get(sheet);
    const list = (SPRITES[sheet] as Record<string, number[][]>)[item];
    if (!ready() || !buf || !list?.length) return null;
    const key = sheet + item;
    let k = Math.floor(random() * list.length);
    if (list.length > 1 && k === lastOf.get(key)) k = (k + 1 + Math.floor(random() * (list.length - 1))) % list.length;
    lastOf.set(key, k);
    const [from, len] = list[k] as [number, number];
    const v = voice(at, { ref: o.ref ?? 6, rolloff: o.rolloff ?? 1, max: o.max ?? 500, hrtf: o.hrtf });
    const src = v.clip(buf);
    const rate = (o.rate ?? 1) * rand(0.95, 1.05);
    src.playbackRate.value = rate;
    let head: AudioNode = src;
    if (o.low) head = head.connect(v.filter('lowpass', o.low));
    if (o.shelf) {
      const f = v.filter('lowshelf', 120);
      f.gain.value = o.shelf;
      head = head.connect(f);
    }
    head.connect(v.gain(o.gain ?? 1)).connect(v.out);
    if (o.echo && echo) v.out.connect(v.gain(o.echo)).connect(echo);
    const t = ctx!.currentTime + 0.02 + (o.delay ?? 0);
    v.play(src, t, t + len / rate + 0.05, from, len);
    return v;
  };

  const loop = (name: Name | 'noise', gain: number, at: PannerNode | null) => {
    const buf = name === 'noise' ? noise : buffers.get(name);
    if (!ctx || !master || !buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (at) g.connect(at).connect(master);
    else g.connect(master);
    src.start(ctx.currentTime, random() * buf.duration);
    return { src, g };
  };

  // ---- the beds: crickets everywhere, wind in the canopy, the river
  let bed: ReturnType<typeof loop> = null;
  /** The forest: wind going through the canopy high overhead, in slow swells. */
  let canopy: { g: GainNode; f: BiquadFilterNode } | null = null;
  function beds() {
    bed = loop('bed', 0.35, null);
    insects = loop('forest', 0, null);
    townBed = loop('town', 0, null);
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 0.6;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(lp).connect(g).connect(master!);
    src.start();
    canopy = { g, f };
    // The river: a recording of water over stones, heard from the nearest bit of bank
    const p = panner(4, 1, 200);
    const water = loop('river', 0, p);
    if (water) {
      stream = { p, g: water.g, bp: null };
      return;
    }
    // Without it, a low rush and, over it, a babble made of noise
    const rush = c.createBufferSource();
    rush.buffer = noise;
    rush.loop = true;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 520;
    const babble = c.createBufferSource();
    babble.buffer = noise;
    babble.loop = true;
    babble.playbackRate.value = 0.83;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 1.4;
    const bg = c.createGain();
    bg.gain.value = 0.35;
    const sg = c.createGain();
    sg.gain.value = 0;
    rush.connect(low).connect(sg);
    babble.connect(bp).connect(bg).connect(sg);
    sg.connect(p).connect(master!);
    rush.start();
    babble.start(0, 1.3);
    stream = { p, g: sg, bp };
  }
  let stream: { p: PannerNode; g: GainNode; bp: BiquadFilterNode | null } | null = null;
  let insects: ReturnType<typeof loop> = null;
  let townBed: ReturnType<typeof loop> = null;
  let fireLoop: ReturnType<typeof loop> = null;
  let hushUntil = 0;
  let breathIn = 0;
  let beatIn = 0;
  /** A short burst of filtered noise into `v`, from `when`, for snaps, rustles and knocks. */
  const burst = (v: Voice, when: number, dur: number, freq: number, q: number, gain: number) => {
    const src = v.noise();
    const f = v.filter('bandpass', freq, q);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + Math.min(0.004, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f).connect(g).connect(v.out);
    v.play(src, when, when + dur + 0.05);
  };
  let streamAt: V3 | null = null;
  /** How deep in the forest the ear is, 0 in town to 1 under the old trees. */
  let deep = 0;

  // ---- fire: crackles from the nearest flames, made from bursts of noise
  let fire: { p: PannerNode; hiss: GainNode; crackle: GainNode } | null = null;
  let fireNear = false;
  function built() {
    const c = ctx!;
    const p = panner(1.2, 1.6, 30);
    const hissSrc = c.createBufferSource();
    hissSrc.buffer = noise;
    hissSrc.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 500;
    const hiss = c.createGain();
    hiss.gain.value = 0;
    hissSrc.connect(bp).connect(hiss).connect(p);
    const crackle = c.createGain();
    crackle.gain.value = 0;
    crackle.connect(p);
    p.connect(master!);
    hissSrc.start();
    fire = { p, hiss, crackle };
    fireLoop = loop('fire', 0, p);
  }
  const pop = (strength: number) => {
    if (!ready() || !fire || !noise) return;
    const v = voice(null, { to: fire.crackle });
    const src = v.noise();
    const f = v.filter('bandpass', rand(1500, 5000), 1.5);
    const t = ctx!.currentTime;
    v.out.gain.setValueAtTime(strength * rand(0.3, 1), t);
    v.out.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.006, 0.03));
    src.connect(f).connect(v.out);
    v.play(src, t, t + 0.05);
  };

  // ---- engines on the road: built when a rider is on, torn down once it has been quiet a while
  type Engine = { osc: OscillatorNode; osc2: OscillatorNode; g: GainNode; p: PannerNode; base: number; quiet: number; parts: AudioNode[] };
  const engines: (Engine | null)[] = [];
  const engine = (kind: Rider['kind'], at: V3): Engine => {
    const c = ctx!;
    const osc = c.createOscillator();
    const osc2 = c.createOscillator();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    const E = ENGINE[kind];
    const base = E.base;
    osc.frequency.value = base;
    osc2.frequency.value = base * E.second;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = E.cutoff;
    f.Q.value = 2;
    const g = c.createGain();
    g.gain.value = 0;
    const g2 = c.createGain();
    g2.gain.value = E.mix;
    // The autorickshaw's two-stroke putter: its tone pulses at the firing rate
    const am = c.createGain();
    am.gain.value = 1 - E.pulse;
    const lfo = c.createOscillator();
    lfo.frequency.value = E.firing;
    const depth = c.createGain();
    depth.gain.value = E.pulse;
    lfo.connect(depth).connect(am.gain);
    osc.connect(am);
    osc2.connect(g2).connect(am);
    const p = panner(kind === 'bus' ? 6 : 3, 1.2, 300);
    p.positionX.value = at[0];
    p.positionY.value = at[1];
    p.positionZ.value = at[2];
    am.connect(f).connect(g).connect(p).connect(master!);
    osc.start();
    osc2.start();
    lfo.start();
    return { osc, osc2, g, p, base, quiet: 0, parts: [osc, osc2, lfo, depth, g2, am, f, g, p] };
  };
  const drop = (e: Engine) => {
    for (const n of e.parts) {
      if (n instanceof OscillatorNode) n.stop();
      n.disconnect();
    }
  };

  const ear: V3 = [0, 0, 0];
  const nearest = (list: V3[], within: number) => {
    let best: V3 | undefined;
    let bd = within;
    for (const p of list) {
      const d = Math.hypot(p[0] - ear[0], p[2] - ear[2]);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  };

  // ---- the night's birds, far off: a call now and then, somewhere around you
  let birdIn = 6 + random() * 8;
  const around = (near: number, far: number, up: number): V3 => {
    const a = random() * Math.PI * 2;
    const d = rand(near, far);
    return [ear[0] + Math.sin(a) * d, ear[1] + up, ear[2] + Math.cos(a) * d];
  };
  /** A call from `at`, dulled by the distance and the trees, a little of it ringing off the hills. */
  const far = (item: Call, at: V3, gain: number, delay = 0) => {
    const d = Math.hypot(at[0] - ear[0], at[2] - ear[2]);
    return sprite('calls', item, at, { gain, ref: 25, max: 2500, low: Math.max(1800, 12000 - d * 55), echo: 0.18, delay });
  };
  function birds(dt: number, t: number) {
    if ((birdIn -= dt) > 0) return;
    // Nothing calls while the forest holds its breath
    if (t < hushUntil) {
      birdIn = 5;
      return;
    }
    const r = random();
    let item: Call;
    if (deep > 0.5) item = r < 0.32 ? 'nightjar' : r < 0.6 ? 'owl' : r < 0.78 ? 'scops' : r < 0.92 ? 'cuckoo' : 'deer';
    else if (streamAt && r < 0.35) item = 'lapwing';
    else item = r < 0.45 ? 'owlet' : r < 0.8 ? 'scops' : 'nightjar';
    birdIn = deep > 0.5 ? rand(16, 45) : rand(28, 70);
    const at: V3 = item === 'lapwing' && streamAt ? [streamAt[0] + rand(-25, 25), streamAt[1] + 1, streamAt[2] + rand(-25, 25)] : around(45, 150, rand(5, 15));
    far(item, at, item === 'deer' ? 0.35 : 0.42);
    // A nightjar keeps on, as they do, and an owl is often answered
    if (item === 'nightjar' && random() < 0.6) far(item, at, 0.42, rand(4, 8));
    if (item === 'owl' && random() < 0.4) far(item, around(80, 200, 10), 0.3, rand(3, 7));
  }

  /** What the last footstep fell on, for the test readout. */
  let lastStep = '';
  let crackleIn = 0;
  /** Time since the last steering tick; starts full so the first frame steers. */
  let since = TICK;
  return {
    /** For the profile overlay: the context's state, one-shot voices alive, engines built. */
    get stats() {
      return { state: ctx?.state ?? 'off', live, engines: engines.filter(Boolean).length, loaded: buffers.size, under: lastStep };
    },
    /** How deep in the forest the listener is, 0 to 1. */
    set forest(v: number) {
      deep = Math.min(1, Math.max(0, v));
    },
    /** The nearest bit of river, heard from there; null when it's too far to hear. */
    set river(at: V3 | null) {
      streamAt = at;
    },
    /**
     * A footfall of yours at x, z with feet at height `y`: sandals on whatever is underfoot, soft
     * when you creep, louder when you run, always under the night itself.
     */
    step(x: number, z: number, pace: number, y?: number, creeping = false) {
      const s = surfaceAt(x, z, y);
      lastStep = s;
      const gain = (creeping ? 0.07 : 0.16) * (pace > 2.6 ? 1.45 : 1) * (s === 'leaves' ? 1.15 : 1);
      sprite('steps', s, null, { gain, rate: creeping ? 0.92 : 1, low: creeping ? 2400 : 9000 });
    },
    /** The jungle's warning: a barking deer, or the monkeys, shouting about something at x, z. */
    alarm(at: V3) {
      if (!far(random() < 0.75 ? 'deer' : 'monkey', at, 0.55)) this.bark(at);
    },
    /** A dhole's growl at `at`: a low, rough, rising snarl. */
    growl(at: V3, gain = 0.5) {
      if (!ready() || !noise) return;
      const t = ctx!.currentTime + 0.02;
      const dur = 0.9 + random() * 0.9;
      const v = voice(at, { ref: 3, rolloff: 1.2, max: 120, hrtf: true });
      const src = v.noise();
      const bp = v.filter('bandpass', 170, 3);
      bp.frequency.setValueAtTime(170, t);
      bp.frequency.linearRampToValueAtTime(260, t + dur);
      // The rasp: the noise chopped about 28 times a second
      const am = v.gain(0);
      const lfo = v.osc();
      lfo.frequency.value = 24 + random() * 10;
      lfo.connect(v.gain(1)).connect(am.gain);
      const g = v.gain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * 2.2, t + 0.15);
      g.gain.setValueAtTime(gain * 2.2, t + dur - 0.2);
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.connect(bp).connect(am).connect(g).connect(v.out);
      v.play(src, t, t + dur + 0.1);
      v.play(lfo, t, t + dur + 0.1);
    },
    /**
     * A dhole's whistle at `at`: the pack calling to itself in the dark, a thin rising note,
     * often answered by a second. Not a howl: red dogs don't howl.
     */
    whistle(at: V3, gain = 0.4) {
      if (!ready()) return;
      const c = ctx!;
      const v = voice(at, { ref: 8, rolloff: 1, max: 400, hrtf: true });
      const n = random() < 0.6 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const t = c.currentTime + 0.02 + k * (0.32 + random() * 0.2);
        const f = 1300 + random() * 500;
        const len = 0.18 + random() * 0.14;
        const o = v.osc();
        o.frequency.setValueAtTime(f * 0.7, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.25, t + len * 0.6);
        o.frequency.exponentialRampToValueAtTime(f * 1.05, t + len);
        // A breathy edge: a second, slightly sharp voice beating against the first
        const o2 = v.osc();
        o2.frequency.setValueAtTime(f * 0.71, t);
        o2.frequency.exponentialRampToValueAtTime(f * 1.27, t + len * 0.6);
        const g = v.gain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain * 0.35, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + len);
        o.connect(g);
        o2.connect(v.gain(0.3)).connect(g);
        g.connect(v.out);
        v.play(o, t, t + len + 0.05);
        v.play(o2, t, t + len + 0.05);
      }
    },
    /** A short sharp yap, the pack excited, closing in. */
    yap(at: V3, gain = 0.5) {
      if (sprite('calls', 'yap', at, { gain: gain * 1.2, ref: 4, rolloff: 1.2, max: 200, rate: rand(0.9, 1.15) })) return;
      if (!ready()) return;
      const t = ctx!.currentTime + 0.01;
      const v = voice(at, { ref: 4, rolloff: 1.2, max: 200 });
      const o = v.osc('sawtooth');
      const f = 520 + random() * 220;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.09);
      const g = v.gain();
      g.gain.setValueAtTime(gain * 0.8, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(v.filter('bandpass', 1400, 2)).connect(g).connect(v.out);
      v.play(o, t, t + 0.15);
      burst(v, t, 0.04, 1800, 1.2, gain * 0.25);
    },
    /** Jaws snapping shut right by you. */
    bite(at: V3) {
      if (!ready()) return;
      const t = ctx!.currentTime + 0.01;
      const v = voice(at, { ref: 2, rolloff: 1.2, max: 200 });
      burst(v, t, 0.06, 1400, 1.4, 1.2);
      burst(v, t + 0.07, 0.05, 1900, 1.4, 0.9);
    },
    /** An elephant trumpeting at `at`: a brassy blare, rising and breaking. */
    trumpet(at: V3, long = true) {
      // A real trumpet; the long one, close, is a roar after it
      if (sprite('calls', 'trumpet', at, { gain: long ? 1 : 0.75, ref: 20, max: 1500, hrtf: true, echo: 0.35, rate: long ? 1 : 1.04 })) {
        if (long && random() < 0.5) sprite('calls', 'roar', at, { gain: 0.7, ref: 15, max: 800, echo: 0.2, delay: rand(1.4, 2) });
        return;
      }
      if (!ready()) return;
      const t = ctx!.currentTime + 0.03;
      const dur = long ? 1.6 + random() * 0.6 : 0.7;
      const v = voice(at, { ref: 20, rolloff: 1, max: 1200, hrtf: true });
      const out = v.out;
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(0.9, t + 0.08);
      out.gain.setValueAtTime(0.8, t + dur * 0.7);
      out.gain.exponentialRampToValueAtTime(0.001, t + dur);
      if (echo) out.connect(echo);
      for (const k of [1, 1.5, 2.01]) {
        const o = v.osc('sawtooth');
        o.frequency.setValueAtTime(380 * k, t);
        o.frequency.exponentialRampToValueAtTime(620 * k, t + 0.25);
        o.frequency.setValueAtTime(600 * k, t + dur * 0.55);
        o.frequency.exponentialRampToValueAtTime(700 * k, t + dur * 0.6);
        o.frequency.exponentialRampToValueAtTime(480 * k, t + dur);
        const vib = v.osc();
        vib.frequency.value = 9;
        vib.connect(v.gain(14 * k)).connect(o.frequency);
        o.connect(v.filter('bandpass', 1300, 1.2)).connect(v.gain(0.35 / k)).connect(out);
        v.play(o, t, t + dur + 0.05);
        v.play(vib, t, t + dur + 0.05);
      }
    },
    /** An elephant's warning rumble: felt more than heard, a low purr. */
    rumble(at: V3) {
      if (sprite('calls', 'rumble', at, { gain: 1.3, ref: 15, max: 600, hrtf: true, shelf: 9, low: 600 })) return;
      if (!ready()) return;
      const t = ctx!.currentTime + 0.03;
      const dur = 2.2;
      const v = voice(at, { ref: 15, rolloff: 1, max: 600, hrtf: true });
      const o = v.osc('sawtooth');
      o.frequency.setValueAtTime(48, t);
      o.frequency.linearRampToValueAtTime(62, t + dur * 0.5);
      o.frequency.linearRampToValueAtTime(44, t + dur);
      const g = v.out;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1.3, t + 0.5);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(v.filter('lowpass', 260)).connect(g);
      v.play(o, t, t + dur + 0.05);
    },
    /** A heavy footfall at `at`, for a charge. */
    thud(at: V3, gain = 0.9) {
      if (!ready()) return;
      const t = ctx!.currentTime + 0.01;
      const v = voice(at, { ref: 6, rolloff: 1, max: 300 });
      const o = v.osc();
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
      const g = v.gain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(v.out);
      v.play(o, t, t + 0.3);
      burst(v, t, 0.1, 400, 0.8, gain * 0.3);
    },
    /** The hanging bridge taking your weight: a plank's dry creak, and a cable's low groan. */
    creak(at: V3, gain = 0.25) {
      if (sprite('calls', 'creak', at, { gain: gain * 2.2, ref: 4, max: 60, rate: rand(0.85, 1.1) })) return;
      if (!ready()) return;
      const t = ctx!.currentTime + 0.01;
      const v = voice(at, { ref: 4, rolloff: 1, max: 60, hrtf: true });
      // Wood rubbing on wood: a rough buzz whose pitch wavers as the plank gives
      const o = v.osc('sawtooth');
      const f0 = 180 + random() * 160;
      const len = 0.25 + random() * 0.35;
      o.frequency.setValueAtTime(f0, t);
      for (let k = 1; k <= 6; k++) o.frequency.linearRampToValueAtTime(f0 * (0.85 + random() * 0.35), t + (len * k) / 6);
      const bp = v.filter('bandpass', 900 + random() * 600, 4);
      const g = v.gain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.04);
      g.gain.setValueAtTime(gain * 0.7, t + len * 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(bp).connect(g).connect(v.out);
      v.play(o, t, t + len + 0.05);
      // Now and then the cable answers, low and slow
      if (random() < 0.4) {
        const w = v.osc();
        w.frequency.setValueAtTime(62 + random() * 20, t + 0.1);
        w.frequency.linearRampToValueAtTime(55, t + 1.2);
        const wg = v.gain();
        wg.gain.setValueAtTime(0, t + 0.1);
        wg.gain.linearRampToValueAtTime(gain * 0.5, t + 0.3);
        wg.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
        w.connect(wg).connect(v.out);
        v.play(w, t + 0.1, t + 1.4);
      }
    },
    /**
     * Your own body: `breath` 0 to 1 is how hard you're breathing after a run, `heart` 0 to 1 how
     * loud your heartbeat is when hurt. Call every frame.
     */
    body(dt: number, breath: number, heart: number) {
      if (!ready() || !noise) return;
      const c = ctx!;
      breathIn -= dt;
      if (breath > 0.05 && breathIn < 0) {
        breathIn = 0.75 - breath * 0.3;
        const t = c.currentTime + 0.01;
        const v = voice(null);
        for (const [at, len, f, gain] of [[0, 0.28, 1100, 0.18], [0.34, 0.3, 800, 0.24]] as const) {
          const src = v.noise();
          const g = v.gain();
          g.gain.setValueAtTime(0, t + at);
          g.gain.linearRampToValueAtTime(gain * breath, t + at + len * 0.4);
          g.gain.linearRampToValueAtTime(0, t + at + len);
          src.connect(v.filter('bandpass', f, 0.8)).connect(g).connect(v.out);
          v.play(src, t + at, t + at + len + 0.05);
        }
      }
      beatIn -= dt;
      if (heart > 0.05 && beatIn < 0) {
        beatIn = 0.62;
        const t = c.currentTime + 0.01;
        const v = voice(null);
        for (const [at, gain] of [[0, 1], [0.16, 0.7]] as const) {
          const o = v.osc();
          o.frequency.setValueAtTime(62, t + at);
          o.frequency.exponentialRampToValueAtTime(40, t + at + 0.12);
          const g = v.gain();
          g.gain.setValueAtTime(0, t + at);
          g.gain.linearRampToValueAtTime(0.7 * heart * gain, t + at + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t + at + 0.16);
          o.connect(g).connect(v.out);
          v.play(o, t + at, t + at + 0.2);
        }
      }
    },
    /** The insects all stop at once, for `seconds`, as they do when something moves near. */
    hush(seconds: number) {
      if (ctx) hushUntil = ctx.currentTime + seconds;
    },
    get hushed() {
      return !!ctx && ctx.currentTime < hushUntil;
    },
    /** A dry stick breaking under a weight at `at`: a crack, sometimes a second. */
    snap(at: V3) {
      if (sprite('calls', 'branch', at, { gain: 0.8, ref: 6, rolloff: 1.1, max: 300, hrtf: true, echo: 0.1 })) return;
      if (!ready()) return;
      const t = ctx!.currentTime + 0.02;
      const v = voice(at, { ref: 4, rolloff: 1.2, max: 200 });
      burst(v, t, 0.05, 2600 + random() * 1500, 1.2, 0.9);
      burst(v, t + 0.012, 0.12, 900, 0.9, 0.35);
      if (random() < 0.5) burst(v, t + 0.25 + random() * 0.4, 0.04, 3200, 1.5, 0.5);
    },
    /** Something moving through the undergrowth from `a` to `b`, then stopping. */
    rustle(a: V3, b: V3, seconds: number) {
      // Brush pushed through, carried from a to b
      const heard = sprite('calls', 'rustle', a, { gain: 0.6, ref: 3, rolloff: 1.2, max: 200, hrtf: true, rate: Math.min(1.1, Math.max(0.8, 1.4 / seconds)) });
      if (heard?.p) {
        const t0 = ctx!.currentTime + 0.02;
        for (const [k, q] of [[0, heard.p.positionX], [1, heard.p.positionY], [2, heard.p.positionZ]] as const) {
          q.setValueAtTime(a[k], t0);
          q.linearRampToValueAtTime(b[k], t0 + seconds);
        }
        return;
      }
      if (!ready()) return;
      const t0 = ctx!.currentTime + 0.05;
      // One panner for the whole passage, carried along the path
      const v = voice(a, { ref: 3, rolloff: 1.2, max: 200, hrtf: true });
      const p = v.p!;
      for (const [k, q] of [[0, p.positionX], [1, p.positionY], [2, p.positionZ]] as const) {
        q.setValueAtTime(a[k], t0);
        q.linearRampToValueAtTime(b[k], t0 + seconds);
      }
      const n = Math.round(seconds * 9);
      for (let i = 0; i < n; i++) {
        if (random() < 0.3) continue;
        const f = i / n;
        burst(v, t0 + f * seconds + random() * 0.05, 0.07 + random() * 0.12, 1800 + random() * 2600, 0.7, 0.18 + random() * 0.2);
      }
    },
    /** A sambar deer's alarm call far off: a hoarse honk, two or three times. */
    bark(at: V3) {
      if (sprite('calls', 'deer', at, { gain: 0.6, ref: 30, max: 1500, hrtf: true, echo: 0.3 })) return;
      if (!ready()) return;
      const c = ctx!;
      const times = 2 + Math.floor(random() * 2);
      const v = voice(at, { ref: 30, rolloff: 1, max: 1500, hrtf: true });
      const lp = v.filter('lowpass', 1400);
      lp.connect(v.out);
      for (let k = 0; k < times; k++) {
        const t = c.currentTime + 0.05 + k * (0.9 + random() * 0.7);
        const o = v.osc('sawtooth');
        o.frequency.setValueAtTime(330, t);
        o.frequency.exponentialRampToValueAtTime(230, t + 0.28);
        const g = v.gain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o.connect(v.filter('bandpass', 820, 2.2)).connect(g).connect(lp);
        if (echo) g.connect(echo);
        v.play(o, t, t + 0.35);
      }
    },
    /**
     * A lone wolf howling far off at `at`: one long voice rising, holding and falling away,
     * dulled by the distance and the trees, ringing back off the hills. Each is a little different.
     */
    howl(at: V3, gain = 0.5) {
      if (!ready()) return;
      const t = ctx!.currentTime + 0.05;
      const base = 300 + random() * 140;
      const rise = 0.5 + random() * 0.5;
      const hold = 2.0 + random() * 2.2;
      const fall = 0.7 + random() * 0.5;
      const end = t + rise + hold + fall;
      const v = voice(at, { ref: 60, rolloff: 1, max: 2000, hrtf: true });
      const cry = v.osc();
      const over = v.osc('triangle');
      // The voice's pitch, and the overtone's an octave up, gliding together
      const broken = random() < 0.4;
      const glide = (q: AudioParam, k: number) => {
        q.setValueAtTime(base * 0.72 * k, t);
        q.exponentialRampToValueAtTime(base * 1.22 * k, t + rise);
        // Sometimes the voice breaks upward half way through the hold
        if (broken) {
          q.exponentialRampToValueAtTime(base * 1.16 * k, t + rise + hold * 0.45);
          q.exponentialRampToValueAtTime(base * 1.32 * k, t + rise + hold * 0.55);
        }
        q.exponentialRampToValueAtTime(base * 1.12 * k, t + rise + hold);
        q.exponentialRampToValueAtTime(base * 0.7 * k, end);
      };
      const f = cry.frequency;
      glide(f, 1);
      glide(over.frequency, 2);
      // A slow waver in the voice
      const lfo = v.osc();
      lfo.frequency.value = 4.5 + random() * 1.5;
      lfo.connect(v.gain(base * 0.012)).connect(f);
      const env = v.gain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + rise * 0.8);
      env.gain.setValueAtTime(0.9, t + rise + hold * 0.7);
      env.gain.linearRampToValueAtTime(0.75, t + rise + hold);
      env.gain.linearRampToValueAtTime(0, end);
      cry.connect(env);
      over.connect(v.gain(0.12)).connect(env);
      // Far off: the highs gone, the rest half echo
      v.out.gain.value = gain;
      env.connect(v.filter('lowpass', 1100)).connect(v.out);
      if (echo) v.out.connect(v.gain(gain * 0.22)).connect(echo);
      for (const o of [cry, over, lfo]) v.play(o, t, end + 0.1);
    },
    /** Moves the ear and everything heard with the eye; call once a frame. */
    update(dt: number, eye: V3, yaw: number, riders: Rider[]) {
      if (!ready()) return;
      const c = ctx!;
      const t = c.currentTime;
      ear[0] = eye[0];
      ear[1] = eye[1];
      ear[2] = eye[2];
      // Fire crackles keep their own quick rhythm, every frame
      if (fire && fireNear && !fireLoop) {
        crackleIn -= dt;
        if (crackleIn < 0) {
          pop(0.5);
          if (random() < 0.3) pop(0.3);
          crackleIn = rand(0.05, 0.5);
        }
      }
      since += dt;
      if (since < TICK) return;
      const step = since;
      since = 0;

      const L = c.listener;
      // Firefox has no listener AudioParams: fall back to the old setters
      if (L.positionX) {
        L.positionX.setTargetAtTime(eye[0], t, 0.05);
        L.positionY.setTargetAtTime(eye[1], t, 0.05);
        L.positionZ.setTargetAtTime(eye[2], t, 0.05);
        L.forwardX.setTargetAtTime(-Math.sin(yaw), t, 0.05);
        L.forwardY.value = 0;
        L.forwardZ.setTargetAtTime(-Math.cos(yaw), t, 0.05);
        L.upY.value = 1;
      } else {
        L.setPosition(eye[0], eye[1], eye[2]);
        L.setOrientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0);
      }

      // Crickets, a little fewer out on the tar, and thinning out in the deep forest, where the
      // wind in the canopy takes over, rising and falling
      const crickets = (onRoad(eye[0], eye[2], 4) ? 0.25 : 0.35) * (1 - deep * 0.7) * (t < hushUntil ? 0.04 : 1);
      // Quiet falls fast and comes back slowly, insect by insect
      bed?.g.gain.setTargetAtTime(crickets, t, t < hushUntil ? 0.6 : 3.5);
      // The forest's own insects take over from the town's crickets as you go in, and fall
      // silent with them; the far town's traffic fades behind you
      insects?.g.gain.setTargetAtTime(deep * 0.5 * (t < hushUntil ? 0.03 : 1), t, t < hushUntil ? 0.6 : 3.5);
      townBed?.g.gain.setTargetAtTime((1 - deep) ** 2 * 0.22, t, 2);
      birds(step, t);
      if (stream) {
        if (streamAt) put(stream.p, streamAt, 0.2);
        stream.g.gain.setTargetAtTime(streamAt ? (stream.bp ? 0.5 : 0.9) : 0, t, 0.8);
        stream.bp?.frequency.setTargetAtTime(1500 + 400 * Math.sin(t * 0.7) * Math.sin(t * 0.31), t, 0.3);
      }
      if (canopy) {
        const swell = 0.55 + 0.45 * Math.sin(t * 0.11) * Math.sin(t * 0.047 + 1.3);
        canopy.g.gain.setTargetAtTime(deep * 0.09 * swell, t, 1.5);
        canopy.f.frequency.setTargetAtTime(320 + swell * 260, t, 2);
      }
      // Fire near enough to hear
      if (fire) {
        const f = nearest(world.fires, 5);
        fireNear = !!f;
        if (f) {
          put(fire.p, f, 0.15);
          fireLoop?.g.gain.setTargetAtTime(0.7, t, 0.3);
          fire.hiss.gain.setTargetAtTime(fireLoop ? 0 : 0.02, t, 0.3);
          fire.crackle.gain.setTargetAtTime(0.4, t, 0.3);
        } else {
          fireLoop?.g.gain.setTargetAtTime(0, t, 0.5);
          fire.hiss.gain.setTargetAtTime(0, t, 0.5);
          fire.crackle.gain.setTargetAtTime(0, t, 0.5);
        }
      }
      // Engines: pitch rises coming and falls going, as they pass
      for (let i = 0; i < riders.length; i++) {
        const r = riders[i]!;
        let e = engines[i] ?? null;
        if (!r.on) {
          if (!e) continue;
          e.quiet += step;
          // Faded to nothing (time constant 0.2 s): free its oscillators and panner
          if (e.quiet > 1.5) {
            drop(e);
            engines[i] = null;
          } else e.g.gain.setTargetAtTime(0, t, 0.2);
          continue;
        }
        if (!e) e = engines[i] = engine(r.kind, r.position);
        e.quiet = 0;
        put(e.p, r.position, 0.05);
        const dx = r.position[0] - eye[0];
        const dy = r.position[1] - eye[1];
        const dz = r.position[2] - eye[2];
        const d = Math.max(Math.hypot(dx, dy, dz), 0.1);
        const closing = -(r.velocity[0] * dx + r.velocity[1] * dy + r.velocity[2] * dz) / d;
        const shift = 343 / (343 - closing);
        const wobble = 1 + Math.sin(t * 1.3 + i) * 0.03;
        e.osc.frequency.setTargetAtTime(e.base * shift * wobble, t, 0.05);
        e.osc2.frequency.setTargetAtTime(e.base * shift * wobble * ENGINE[r.kind].second, t, 0.05);
        e.g.gain.setTargetAtTime(ENGINE[r.kind].level, t, 0.4);
      }
    },
  };
}
