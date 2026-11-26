/** An isolated rehearsal: commands are applied on fixed ticks, then three small machines react. */
export type Item = 'torch' | 'note';
export type Command = { kind: 'acquire'; item: Item } | { kind: 'equip'; item: 'torch' } | { kind: 'ask'; topic: 'journey' } | { kind: 'leave' } | { kind: 'wait' };
export type Fact =
  | { kind: 'acquired'; item: Item }
  | { kind: 'equipped'; item: 'torch' }
  | { kind: 'quest'; state: 'offered' | 'ready' | 'departed' }
  | { kind: 'denied'; reason: string };
export interface State { tick: number; inventory: Item[]; equipped: 'torch' | null; quest: 'unoffered' | 'offered' | 'ready' | 'departed' }
export interface Tick { tick: number; command: Command; facts: Fact[]; state: State }
export const initialDeparture = (): State => ({ tick: 0, inventory: [], equipped: null, quest: 'unoffered' });

type Inventory = { items: Item[] };
type Equipment = { hasTorch: boolean; equipped: 'torch' | null };
type Quest = { status: State['quest']; hasNote: boolean; torchEquipped: boolean };
type Transition<T> = { state: T; facts: Fact[] };

/** Each machine owns its own state and emits facts; inputs are never mutated. */
export function inventoryTransition(state: Inventory, command: Command): Transition<Inventory> {
  if (command.kind !== 'acquire' || state.items.includes(command.item)) return { state, facts: [] };
  return { state: { items: [...state.items, command.item] }, facts: [{ kind: 'acquired', item: command.item }] };
}
export function equipmentTransition(state: Equipment, command: Command, incoming: readonly Fact[]): Transition<Equipment> {
  const hasTorch = state.hasTorch || incoming.some(f => f.kind === 'acquired' && f.item === 'torch');
  if (command.kind !== 'equip') return { state: { ...state, hasTorch }, facts: [] };
  if (!hasTorch) return { state: { ...state, hasTorch }, facts: [{ kind: 'denied', reason: 'The torch is not in the inventory.' }] };
  if (state.equipped === 'torch') return { state: { ...state, hasTorch }, facts: [] };
  return { state: { hasTorch, equipped: 'torch' }, facts: [{ kind: 'equipped', item: 'torch' }] };
}
export function questTransition(state: Quest, command: Command, incoming: readonly Fact[]): Transition<Quest> {
  const next = { ...state, hasNote: state.hasNote || incoming.some(f => f.kind === 'acquired' && f.item === 'note'), torchEquipped: state.torchEquipped || incoming.some(f => f.kind === 'equipped' && f.item === 'torch') };
  const facts: Fact[] = [];
  if (command.kind === 'ask' && next.status === 'unoffered') { next.status = 'offered'; facts.push({ kind: 'quest', state: 'offered' }); }
  if (next.status === 'offered' && next.hasNote && next.torchEquipped) { next.status = 'ready'; facts.push({ kind: 'quest', state: 'ready' }); }
  if (command.kind === 'leave') {
    if (next.status === 'ready') { next.status = 'departed'; facts.push({ kind: 'quest', state: 'departed' }); }
    else if (next.status !== 'departed') facts.push({ kind: 'denied', reason: 'Ask about the journey, take the note and equip the torch first.' });
  }
  return { state: next, facts };
}

/** Deliver inventory facts to equipment, then both sets to the quest, in that order. */
export function departureTick(before: State, command: Command): Tick {
  const inventory = inventoryTransition({ items: before.inventory }, command);
  const equipment = equipmentTransition({ hasTorch: before.inventory.includes('torch'), equipped: before.equipped }, command, inventory.facts);
  const quest = questTransition({ status: before.quest, hasNote: before.inventory.includes('note'), torchEquipped: before.equipped === 'torch' }, command, [...inventory.facts, ...equipment.facts]);
  const state: State = { tick: before.tick + 1, inventory: inventory.state.items, equipped: equipment.state.equipped, quest: quest.state.status };
  return { tick: state.tick, command, facts: [...inventory.facts, ...equipment.facts, ...quest.facts], state };
}
export function replayDeparture(commands: readonly Command[]): Tick[] {
  let state = initialDeparture();
  return commands.map(command => { const tick = departureTick(state, command); state = tick.state; return tick; });
}
export const DEPARTURE_SCRIPT: readonly Command[] = [
  { kind: 'ask', topic: 'journey' }, { kind: 'acquire', item: 'note' }, { kind: 'acquire', item: 'torch' },
  { kind: 'acquire', item: 'torch' }, { kind: 'equip', item: 'torch' }, { kind: 'leave' },
];
