export function setParam(key: string, value: string) {
  const url = new URL(location.href);
  url.searchParams.set(key, value);
  history.replaceState(null, '', url);
}

/** One schema drives the URL reader and the editor controls. Read all values before drawing. */
export function numericSettings<K extends string>(
  root: HTMLElement, params: URLSearchParams, defaults: Record<K, number>,
  controls: readonly [K, string, number, number, number][], redraw: () => void,
) {
  const settings = { ...defaults };
  for (const [key, label, min, max, step] of controls) {
    if (params.has(key)) {
      const raw = params.get(key)!;
      const value = raw.trim() ? Number(raw) : NaN;
      if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Expected ${key} between ${min} and ${max}`);
      settings[key] = value;
    }
    slider(root, label, settings[key], min, max, step, value => {
      settings[key] = value;
      setParam(key, String(value));
      redraw();
    });
  }
  return settings;
}

function slider(
  root: HTMLElement,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  change: (value: number) => void,
) {
  const field = document.createElement('label');
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  const out = document.createElement('output');
  out.textContent = range.value;
  range.oninput = () => {
    out.textContent = range.value;
  };
  range.onchange = () => change(range.valueAsNumber);
  field.append(label, range, out);
  root.append(field);
}

export function exportSettings(root: HTMLElement, filename: string, settings: object) {
  const button = document.createElement('button');
  button.textContent = 'Export ' + filename;
  button.onclick = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2) + '\n'], { type: 'application/json' }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  root.append(button);
}
