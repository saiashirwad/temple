/** Capture data crosses the browser boundary and is saved in result.json. */
export type Snapshot = string | number | boolean | null | readonly Snapshot[] | { readonly [key: string]: Snapshot | undefined };

/** The CLI installs this observer only in the page it owns. */
declare global {
  interface Window {
    scenarioCapture?: (name: string, state: Snapshot) => Promise<void>;
    scenarioShots?: string[];
  }
}

export function wantsCheckpoint(name: string) {
  return !!window.scenarioCapture && (window.scenarioShots?.includes('*') || window.scenarioShots?.includes(name));
}

/** Yield until the observer has captured the painted state before issuing another command. */
export async function checkpoint(name: string, state: Snapshot) {
  if (!wantsCheckpoint(name)) return;
  await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  await window.scenarioCapture!(name, state);
}
