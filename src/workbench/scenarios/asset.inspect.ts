import '../assets.css';
import assets from 'virtual:temple-assets';
import { specimens } from '../../world/vegetation/specimens.ts';

export const title = 'Asset inspector';

export async function mount(root: HTMLElement, params: URLSearchParams) {
  root.innerHTML = `
<div class="asset-workbench">
  <aside>
    <input type="search" placeholder="Filter assets" aria-label="Filter assets" /><select aria-label="Asset type">
      <option value="">All assets</option>
      <option value="model">Models</option>
      <option value="image">Textures</option>
      <option value="audio">Audio</option>
      <option value="specimen">Trees and undergrowth</option>
    </select>
    <div class="count"></div>
    <ul></ul>
  </aside>
  <article>
    <h2>Select an asset</h2>
    <p class="meta"></p>
    <div class="controls"></div>
    <div class="preview"></div>
    <p class="hint"></p>
  </article>
</div>`;
  const search = root.querySelector<HTMLInputElement>('input')!;
  const type = root.querySelector<HTMLSelectElement>('select')!;
  const list = root.querySelector<HTMLUListElement>('ul')!;
  const count = root.querySelector<HTMLElement>('.count')!;
  const title = root.querySelector<HTMLElement>('h2')!;
  const meta = root.querySelector<HTMLElement>('.meta')!;
  const preview = root.querySelector<HTMLElement>('.preview')!;
  const controls = root.querySelector<HTMLElement>('.controls')!;
  const hint = root.querySelector<HTMLElement>('.hint')!;
  const variants = new Map(Object.values(specimens).flat().map(s => [s.id, s]));
  const supported = [
    ...assets.filter((p) => /\.(gltf|glb|png|jpe?g|webp|mp3|wav|ogg)$/i.test(p)),
    ...variants.keys(),
  ].sort();
  const clips = assets.filter((p) => p.startsWith('people/clips/') && p.endsWith('.glb')).sort();
  let seed = params.has('seed') ? Number(params.get('seed')) : undefined;
  let night = params.get('light') === 'night';
  let clipPath = params.get('clip') ?? '';
  const kind = (p: string) =>
    variants.has(p) ? 'specimen' : /\.(gltf|glb)$/i.test(p) ? 'model' : /\.(mp3|wav|ogg)$/i.test(p) ? 'audio' : 'image';
  let selected = params.get('asset') ?? '';
  let cleanup = () => {};
  let generation = 0;
  let disposed = false;
  const urlOf = (p: string) => `${import.meta.env.BASE_URL}${p.split('/').map(encodeURIComponent).join('/')}`;
  function drawList() {
    const paths = supported.filter(
      (p) => p.toLowerCase().includes(search.value.toLowerCase()) && (!type.value || kind(p) === type.value),
    );
    count.textContent = `${paths.length} assets`;
    list.replaceChildren(
      ...paths.map((p) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.textContent = p;
        b.setAttribute('aria-current', String(p === selected));
        b.onclick = () => void load(p);
        li.append(b);
        return li;
      }),
    );
  }
  async function select(path: string) {
    delete root.dataset.ready;
    delete root.dataset.error;
    selected = path;
    const address = new URL(location.href);
    address.searchParams.set('asset', path);
    if (seed === undefined) address.searchParams.delete('seed');
    else address.searchParams.set('seed', String(seed));
    if (clipPath) address.searchParams.set('clip', clipPath);
    else address.searchParams.delete('clip');
    if (night) address.searchParams.set('light', 'night');
    else address.searchParams.delete('light');
    history.replaceState(null, '', address);
    drawList();
    cleanup();
    cleanup = () => {};
    const token = ++generation;
    title.textContent = path;
    meta.textContent = 'Loading…';
    hint.textContent = '';
    preview.replaceChildren();
    controls.replaceChildren();
    const url = urlOf(path);
    const specimen = variants.get(path);
    if (!specimen) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = 'Open asset';
      link.target = '_blank';
      link.rel = 'noopener';
      hint.append(link);
    }
    if (kind(path) === 'model' || specimen) {
      const lighting = document.createElement('select');
      lighting.setAttribute('aria-label', 'Lighting');
      lighting.innerHTML = '<option value="neutral">Neutral light</option><option value="night">Night light</option>';
      lighting.value = night ? 'night' : 'neutral';
      lighting.onchange = () => {
        night = lighting.value === 'night';
        void load(path);
      };
      controls.append(lighting);
      if (specimen) {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(seed ?? specimen.seed);
        input.setAttribute('aria-label', 'Specimen seed');
        input.onchange = () => {
          seed = input.value === '' ? undefined : input.valueAsNumber;
          void load(path);
        };
        controls.append(input);
      }
      if (path.startsWith('people/') && !path.startsWith('people/clips/')) {
        const choices = document.createElement('select');
        choices.setAttribute('aria-label', 'Animation clip');
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'Rest pose';
        choices.append(none);
        for (const c of clips) {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c.slice('people/clips/'.length, -4);
          choices.append(opt);
        }
        choices.value = clipPath;
        choices.onchange = () => {
          clipPath = choices.value;
          void load(path);
        };
        controls.append(choices);
      }
      const canvas = document.createElement('canvas');
      preview.append(canvas);
      hint.append(' · Drag to orbit; scroll to zoom');
      try {
        const { inspectModel } = await import('../model.ts');
        if (disposed || generation !== token) return;
        const stop = await inspectModel(
          canvas,
          url,
          (text) => {
            if (token === generation && !disposed) {
              meta.textContent = text;
              if (text.startsWith('Preview error:')) {
                delete root.dataset.ready;
                root.dataset.error = text;
              }
            }
          },
          {
            night,
            specimen: specimen?.build(seed),
            ...(path.startsWith('people/') && !path.startsWith('people/clips/') && clipPath ? { clipUrl: urlOf(clipPath) } : {}),
          },
        );
        if (token !== generation || disposed) stop();
        else cleanup = stop;
      } catch (error) {
        if (token === generation && !disposed) {
          meta.textContent = `Could not inspect model: ${String(error)}`;
          root.dataset.error = meta.textContent;
          throw error;
        }
      }
    } else if (kind(path) === 'image') {
      const img = document.createElement('img');
      img.alt = path;
      preview.append(img);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          if (token === generation) meta.textContent = `${img.naturalWidth} × ${img.naturalHeight} pixels`;
          resolve();
        };
        img.onerror = () => reject(new Error(`Could not load image: ${path}`));
        img.src = url;
      });
    } else {
      const audio = document.createElement('audio');
      audio.controls = true;
      preview.append(audio);
      cleanup = () => {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      };
      await new Promise<void>((resolve, reject) => {
        audio.onloadedmetadata = () => {
          if (token === generation) meta.textContent = `${audio.duration.toFixed(1)} seconds`;
          resolve();
        };
        audio.onerror = () => reject(new Error(`Could not load audio: ${path}`));
        audio.src = url;
      });
    }
    if (token === generation && !disposed) root.dataset.ready = 'true';
  }
  const load = (path: string) => {
    const pending = select(path);
    const token = generation;
    return pending.catch((error) => {
      if (!disposed && token === generation) {
        root.dataset.error = String(error);
        meta.textContent = String(error);
      }
    });
  };
  search.oninput = drawList;
  type.onchange = drawList;
  drawList();
  const ready = selected
    ? supported.includes(selected)
      ? select(selected)
      : Promise.reject(new Error(`Unknown asset: ${selected}`))
    : Promise.resolve();
  const destroy = () => {
    disposed = true;
    generation++;
    cleanup();
    root.replaceChildren();
  };
  addEventListener('pagehide', destroy, { once: true });
  await ready;
}
