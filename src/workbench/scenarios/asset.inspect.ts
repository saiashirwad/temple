import { mount as mountInspector } from '../assets.ts';
export const title = 'Asset inspector';
export async function mount(root: HTMLElement, params: URLSearchParams) {
  await mountInspector(root, params).ready;
}
