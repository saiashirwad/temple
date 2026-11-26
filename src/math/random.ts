/** A seeded random in [0, 1). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent replay streams keep audio and cosmetic choices out of encounter decisions. */
export function randomStreams(seed: string | null) {
  const value = Number(seed);
  const stream = (offset: number) => seed !== null && Number.isSafeInteger(value) ? rng(value + offset) : Math.random;
  return { danger: stream(0), ambience: stream(1), unease: stream(2), people: stream(3), audio: stream(4) };
}
