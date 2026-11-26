import { stepFixed } from '../math/math.ts';
import { TUNING } from '../content/tuning.ts';

import { TOWN, PATH, EVENTS, FINALE, type StoryEvent } from '../content/narrative.ts';

export interface StoryHooks {
  /** Show a line of the story for `seconds`. */
  tell(text: string, seconds: number): void;
  /** The watcher's lantern goes out, for good. */
  guardGone(): void;
  /** The last card. */
  end(): void;
}

/** How long a line stays up: long enough to read slowly. */
const readTime = (text: string) => Math.max(6, 3 + text.split(/\s+/).length * 0.33);

export function createStory(hooks: StoryHooks) {
  const queue: string[] = [];
  const seen = new Set<string>();
  let showing = 0;
  let gap = 0;
  let walked = 0;
  let townNext = 8;
  let townIndex = 0;
  let finaleAt = -1;
  let finaleIndex = 0;
  let clock = 0;
  /** When the end card comes up, on the story clock; -1 until the last line. */
  let endAt = -1;

  /** One substep, no longer than TUNING.maxStep. */
  const step = (dt: number, s: { along: number; moving: boolean; busy: boolean }) => {
    clock += dt;

    if (s.moving) walked += dt;

    // In town, before the path
    if (s.along < 2 && townIndex < TOWN.length && walked > townNext) {
      push(TOWN[townIndex++]!);
      townNext = walked + 30;
    }

    // Straight onto the path without lingering in town: the reason still needs telling first
    if (s.along >= 2 && s.along < 150) while (townIndex < TOWN.length) push(TOWN[townIndex++]!);

    if (s.along >= 150) townIndex = TOWN.length;

    // Lines well behind you (you came up fast, or were carried) are let go
    for (const b of PATH) {
      if (s.along - b.at > 150) seen.add(b.text);
      else if (s.along >= b.at) push(b.text);
    }

    // The end
    if (finaleAt >= 0) {
      if (endAt >= 0 && clock >= endAt) {
        endAt = -1;
        hooks.end();
      }

      while (finaleIndex < FINALE.length && clock - finaleAt >= FINALE[finaleIndex]!.after) {
        const f = FINALE[finaleIndex++]!;
        queue.length = 0;
        showing = 0;
        gap = 0;
        hooks.tell(f.text, readTime(f.text));

        if (finaleIndex === 3) hooks.guardGone();

        if (finaleIndex === FINALE.length) endAt = clock + readTime(f.text) + 1.5;
      }

      return;
    }

    // One at a time, a pause between, held back while something urgent is up
    if (showing > 0) {
      showing -= dt;

      if (showing <= 0) gap = 3.5;

      return;
    }

    if (gap > 0) {
      gap -= dt;

      return;
    }

    if (s.busy || !queue.length) return;
    const text = queue.shift()!;
    showing = readTime(text);
    hooks.tell(text, showing);
  };

  function push(text: string, front = false) {
    if (seen.has(text)) return;
    seen.add(text);

    if (front) queue.unshift(text);
    else queue.push(text);
  }

  return {
    /** Something happened: tell it, once. */
    mark(e: StoryEvent) {
      const text = EVENTS[e];

      if (text) push(text, e === 'stood' || e === 'hid' || e === 'trampled');
    },
    /** Shows `text` now, ahead of anything waiting, and holds the queue while it's up. */
    tellNow(text: string, seconds: number) {
      showing = seconds;
      gap = 0;
      hooks.tell(text, seconds);
    },
    /** The walker has sat in his chair: the end begins. */
    sit() {
      if (finaleAt < 0) finaleAt = clock;
    },
    get ended() {
      return finaleAt >= 0;
    },
    get debug() {
      return { queued: queue.length, showing: +showing.toFixed(1), finale: finaleIndex, sitting: finaleAt >= 0 ? +(clock - finaleAt).toFixed(1) : -1 };
    },
    /** Seconds since you sat in his chair, or -1. */
    get sitting() {
      return finaleAt >= 0 ? clock - finaleAt : -1;
    },
    /**
     * Each frame: `along` is the furthest you've come up the path, `moving` whether you're
     * walking about, `busy` whether something urgent is on screen (the story waits for it).
     * A big dt (fast-forward) is split into substeps of at most TUNING.maxStep.
     */
    update(dt: number, s: { along: number; moving: boolean; busy: boolean }) {
      stepFixed(dt, (h) => step(h, s), TUNING.maxStep);
    },
  };
}
