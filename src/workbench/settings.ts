export function slider(
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
