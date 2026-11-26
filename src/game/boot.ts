// Start-up switches for building and testing, so nothing is turned on by editing code.
// They come from the address (`?probe&phone`, or `#probe`) or, for a test browser that can only
// open the bare address, from a one-shot `sessionStorage.boot` set by a key chord (see
// scenarios.ts) just before it reloads. One-shot: the next reload is a clean game again.
//
//   probe    stage timings on screen and the solid world early (scene.ts)
//   profile  measured GPU pass timings (index.ts; press M to measure again)
//   phone    the touch layout and phone pixel ratio, on any device
//   lineup   everyone in a row by the road, for checking people (people.ts)
//   park     vehicles parked in a row, for checking them (traffic.ts)
//   noao     no ambient occlusion;  nopeople  no people;  debug  errors on screen

export const RELOAD_PRESETS: Record<string, string[]> = { p: ['probe', 'state'], m: ['profile'], c: ['phone', 'state'], '0': [] };

const g = globalThis as { location?: Location; sessionStorage?: Storage };
const words = new Set<string>();
for (const part of [g.location?.search, g.location?.hash])
  part
    ?.replace(/^[?#]/, '')
    .split(/[&,]/)
    .forEach((w) => w && words.add(decodeURIComponent(w.split('=')[0]!)));
const preset = new URLSearchParams(g.location?.search).get('preset');
if (preset && Object.hasOwn(RELOAD_PRESETS, preset)) for (const flag of RELOAD_PRESETS[preset]) words.add(flag);
let once: string | null = null;
try {
  once = g.sessionStorage?.getItem('boot') ?? null;
  g.sessionStorage?.removeItem('boot');
} catch {}
once?.split(',').forEach((w) => w && words.add(w));

export const boot = {
  has: (word: string) => words.has(word),
  /** `?at=…` and other valued switches, from the address only. */
  get: (word: string) => (g.location ? new URLSearchParams(g.location.search).get(word) : null),
  /** Reloads the page with these switches on, once. */
  reloadWith(...on: string[]) {
    g.sessionStorage?.setItem('boot', on.join(','));
    g.location?.reload();
  },
  words: [...words],
};
