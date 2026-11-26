/** Keyboard shortcuts for frequently used launch options. The URL reproduces the complete setup. */
export const RELOAD_PRESETS: Record<string, string[]> = {
  p: ['probe', 'state'], m: ['profile'], c: ['phone', 'state'], '0': [],
};

export function launchOptions(search = '', hash = '') {
  const params = new URLSearchParams(search);
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ''))) {
    if (!params.has(key)) params.set(key, value);
  }
  const key = params.get('preset');
  if (key && Object.hasOwn(RELOAD_PRESETS, key)) {
    for (const flag of RELOAD_PRESETS[key]) params.set(flag, '');
    params.delete('preset');
  }
  return params;
}

export const boot = launchOptions(globalThis.location?.search, globalThis.location?.hash);
