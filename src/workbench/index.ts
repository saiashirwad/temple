interface Scenario {
  title: string;
  mount(root: HTMLElement, params: URLSearchParams): void | Promise<void>;
}

const modules = import.meta.glob<Scenario>('./scenarios/*.ts');

const scenarios = Object.entries(modules).map(([file, load]) => ({
  id: file.slice('./scenarios/'.length, -3), load,
}));

const params = new URLSearchParams(location.search);
const selected = params.get('scenario') ?? 'story.bungalow-ending';
const root = document.querySelector<HTMLElement>('#workspace')!;
const heading = document.querySelector<HTMLHeadingElement>('#title')!;
const nav = document.querySelector('nav')!;

for (const { id } of scenarios) {
  const link = document.createElement('a');
  link.textContent = id.replaceAll('.', ' / ').replaceAll('-', ' ');
  link.href = '?scenario=' + encodeURIComponent(id);

  if (id === selected) link.setAttribute('aria-current', 'page');
  nav.append(link);
}

try {
  const entry = scenarios.find(({ id }) => id === selected);

  if (!entry) throw new Error('Unknown scenario: ' + selected);
  const { title, mount } = await entry.load();
  heading.textContent = title;
  document.title = title + ' · Temple';
  await mount(root, params);
  root.dataset.ready = 'true';
} catch (err) {
  root.dataset.error = String(err);
  root.textContent = String(err);
}
