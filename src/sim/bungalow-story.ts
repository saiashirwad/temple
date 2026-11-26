/** Stable identifiers for the bungalow's two player interactions. */
export type BungalowInteraction = 'bungalow.note' | 'bungalow.chair';

/** Shared progression for reading the note and sitting in the chair. Times are game seconds. */
export function createBungalowStory(sit: () => void) {
  let noteAt = -1;
  let noteRead = false;
  let sitting = false;
  return {
    get noteRead() { return noteRead; },
    get sitting() { return sitting; },
    get interaction(): BungalowInteraction | null { return sitting ? null : noteRead ? 'bungalow.chair' : 'bungalow.note'; },
    update(seconds: number, reading: boolean) {
      if (noteAt >= 0 && seconds - noteAt > 0.6 && !reading) noteRead = true;
    },
    examine(id: BungalowInteraction, seconds: number): boolean {
      if (id !== this.interaction) return false;
      if (id === 'bungalow.note') noteAt = seconds;
      else { sitting = true; sit(); }
      return true;
    },
  };
}
