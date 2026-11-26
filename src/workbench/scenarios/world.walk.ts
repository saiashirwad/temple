export const title = 'Explore the world';

/** Links open the actual game, with the existing scenario chords selected at startup. */
export function mount(root: HTMLElement) {
  const heading = document.createElement('h2');
  heading.textContent = 'Open the game at a spot or situation';
  const intro = document.createElement('p');
  intro.textContent = 'The original backquote shortcuts also work in the game.';
  const list = document.createElement('ul');
  const entries: [string, string][] = [
    ['1', 'Town view'], ['2', 'Path before the bridge'], ['3', 'Bridge'],
    ['4', 'Dung by the path'], ['5', 'Machan stair'], ['6', 'Herd glade'],
    ['7', 'Herd glade, close'], ['8', 'Veranda and note'], ['9', 'Chair'],
    ['w', 'Red dogs'], ['W', 'Stand your ground'], ['D', 'Dholes up close'],
    ['h', 'Herd charge'], ['f', 'Bungalow ending'], ['n', 'The note'],
    ['d', 'Going down'], ['g', 'Walk forward'], ['t', 'Change clock speed'],
    ['j', 'Toggle state readout'], ['b', 'Benchmark'], ['x', 'Hide drawing group'],
    ['X', 'Hide five drawing groups'], ['p', 'Stage timings'], ['m', 'GPU timings'],
    ['c', 'Phone layout'], ['0', 'Clean game'],
  ];
  for (const [key, label] of entries) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = './?preset=' + encodeURIComponent(key);
    link.textContent = `${label} (${key})`;
    item.append(link);
    list.append(item);
  }
  root.replaceChildren(heading, intro, list);
}
