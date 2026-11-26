/** The CLI installs this observer only in the page it owns. */
declare global {
  interface Window {
    scenarioCapture?: (name: string, state: unknown) => Promise<void>;
    scenarioShots?: string[];
  }
}

export function wantsCheckpoint(name: string) {
  return !!window.scenarioCapture && (window.scenarioShots?.includes('*') || window.scenarioShots?.includes(name));
}

/** Yield until the observer has captured the painted state before issuing another command. */
export async function checkpoint(name: string, state: unknown) {
  if (!wantsCheckpoint(name)) return;
  await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  await window.scenarioCapture!(name, state);
}
