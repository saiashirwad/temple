import type { buildTown } from './build.ts';

export type TownData = ReturnType<typeof buildTown>;

export async function loadTown(): Promise<TownData> {
  try {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'town-geometry' });

    try {
      return await new Promise<TownData>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<TownData>) => resolve(event.data);
        worker.onerror = event => { event.preventDefault(); reject(new Error(event.message)); };

        worker.onmessageerror = () => reject(new Error('Could not read the town geometry'));
      });
    } finally {
      worker.terminate();
    }
  } catch (error) {
    console.warn('Building town geometry on the main thread', error);

    return (await import('./build.ts')).buildTown();
  }
}
