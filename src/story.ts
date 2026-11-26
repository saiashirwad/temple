// The story of the walk: why you'd go up the forest path at night, alone, with no weapon.
//
// You grew up in this town and left it at nineteen. Your grandfather, Appooppan (Raghavan), was
// the forest watcher on the hill for thirty-one years: every night he walked the path from the
// road to the inspection bungalow and back, with a hurricane lantern and a stick, lighting the
// shrine lamps, keeping the herd off the path and the woodcutters safe. Never a gun. He was a
// Party man, no gods and no ghosts; he believed in the forest.
//
// When you were seven he took you up the path once, at six in the evening. An elephant rumbled
// somewhere ahead in the dark and you ran all the way home. He laughed about it for years, and
// told you to come back when you were ready: at night, because in the day it is only a path.
//
// He died while you were abroad. You didn't make it home in time. His letter reached you three
// weeks after the funeral: walk my beat once, at night, the way I did, and then it is finished.
// The old watchers say a man's beat isn't over until someone of his blood walks it after dark,
// all the way to the bungalow; until then he keeps walking it. And since he died, the town says
// the path is haunted: a lantern moving on the hill at night, down to the river and back.
//
// Tonight is the forty-first night. So you go: at night, alone, empty-handed, the way he did.
// On the path you meet a watcher with a lantern who knows your childhood name.
//
// The story is told in lines that come up quietly as you walk, by how far up the path you've
// come and by what happens to you on the way. Nothing here touches the GPU.

import { stepFixed } from './math.ts';
import { TUNING } from './tuning.ts';

export type StoryEvent = 'pack' | 'stood' | 'hid' | 'bitten' | 'scented' | 'charge' | 'trampled' | 'howl' | 'hush' | 'dark' | 'down' | 'herdPassed' | 'guard' | 'note' | 'sat' | 'rested';

type Beat = { at: number; text: string };

/** Lines in town, before the path: time spent walking about. */
const TOWN: string[] = [
  'Twenty-two years. The town has not moved: the tea shop, the lamp at the temple gate, Che on the wall by the bus stand.',
  'Tonight is the forty-first night since Appooppan died. You were not here for the first forty.',
];

/** Lines along the path, by metres along it. */
const PATH: Beat[] = [
  { at: 4, text: 'For thirty-one years he walked this every night: a forest watcher, a hurricane lantern, a stick. Never a gun. "A gun makes a man stupid," he said.' },
  { at: 45, text: 'In town they say the path is haunted. Since he died, people have seen a lantern on the hill at night, going down to the river and back.' },
  { at: 95, text: 'You were seven the last time. Six in the evening, your hand in his. Somewhere ahead an elephant spoke, low, like a door opening in the earth, and you ran all the way home.' },
  { at: 135, text: 'He lit this lamp every night on his way up. Someone has lit it tonight.' },
  { at: 195, text: 'He was a Party man. No gods, no ghosts. He believed in the forest, and in walking it properly: slowly, empty-handed, listening.' },
  { at: 255, text: 'His letter found you abroad three weeks after the funeral, the handwriting gone shaky. "When I go, walk my beat once, at night, the way I did. Then it is finished. In the day it is only a path."' },
  { at: 305, text: "The old watchers say a man's beat is not over until someone of his blood walks it after dark, all the way to the bungalow. Until then, he keeps walking it." },
  { at: 345, text: 'He built these machans with the others, the year a woodcutter was killed on this path. Somewhere to wait out the night.' },
  { at: 420, text: "You keep listening for him. A cough. Footsteps that aren't yours. Beedi smoke." },
  { at: 468, text: 'The serpent stones. Your grandmother tied a thread here for you the week you were born.' },
  { at: 515, text: 'The river. Halfway across, the bridge sways, and you remember: he always stopped in the middle. "Listen. The river is the only one that talks all night."' },
  { at: 600, text: "The fear is still here. But it has changed. It isn't telling you to run any more. It is telling you to pay attention." },
  { at: 690, text: 'Somewhere here he found the woodcutter, at dawn, the year you were born. He never talked about it. He never missed a night after.' },
  { at: 870, text: 'Not far now. Your legs are shaking, and you notice that you are not ashamed of it.' },
  { at: 955, text: 'A lamp at the edge of the clearing. Someone lit it for you.' },
];

/** Lines for things that happen to you, each said once. */
const EVENTS: Partial<Record<StoryEvent, string>> = {
  howl: 'A howl, far off on the ridge. In town they say chennaya, wolves. But he always said there are no wolves in these hills, only the red dogs, and red dogs do not howl. So what does?',
  hush: 'The crickets have stopped. All of them. He taught you this: when the forest goes quiet, something big is listening.',
  dark: 'Your eyes open into the dark. The path is pale under the stars. He never needed the lantern to see by. Only to be seen.',
  stood: 'You stood, and they went. Your hands will not stop shaking. He would have laughed, and been proud.',
  hid: 'They went past. You let your breath out. "The forest," he used to say, "is mostly waiting."',
  herdPassed: 'You passed them. A mother feeding, a calf leaning on her leg. At seven you thought they were monsters. They were only living.',
  trampled: 'You lie in the leaves a long moment, breathing. She could have killed you. She chose not to.',
};

/** What the watcher on the path says, one thing each time you stop him. */
export const GUARD_LINES = [
  "The watcher lifts his lantern to your face and looks a long time. 'Ah. Kunje. You came back. Last time you ran all the way down.'",
  "'The herd is in the glade past the river. Keep the wind in your face: they see poorly, but they smell everything. And if the crickets stop, you stop.'",
  "'The red dogs are about. Don't run from them, running is the only thing they understand. Face them, light in their eyes, back to a tree. They test you from the front and bite from behind.'",
  "'Me? I walk to the river and back. Every night. Until someone comes to take the beat off me.'",
  "He offers you a beedi, then laughs and tucks it behind his ear. 'Go on. Ouseppachan keeps the kettle on.'",
  "'He was proud of you, you know. He just never said it in words. Nobody does, in that family.'",
];

export const REST_TEXT =
  'You sit with your back against a post. The lantern ticks. Nothing down there can reach you up here: get your breath back, and let whatever is out there pass.';

export const COOK_NOTE =
  "A note in pencil, under a stone: 'Kunje. You came. Tea is in the flask, your room is on the left. Sit in his chair a while, the one by the post, nobody else sits there. Funny thing: since he went, the Department never sent another watcher. But some nights I still see a lantern on the path. — Ouseppachan.'";

export const DOWN_TEXT = "You come to by a shrine lamp. You don't remember getting here. There is a smell of beedi smoke, and no one about.";

/** The end: sitting in his chair on the veranda. */
const FINALE: { after: number; text: string }[] = [
  { after: 0, text: 'You sit. The chair gives under you, the way it gave under him every night for thirty-one years.' },
  { after: 11, text: 'Far down the hill, a light is moving along the path, toward the river. It stops.' },
  { after: 22, text: 'Then it goes out.' },
  { after: 29, text: 'The crickets start again, one by one. His beat is finished. Yours, maybe, is just starting.' },
];

export interface StoryHooks {
  /** Show a line of the story for `seconds`. */
  tell(text: string, seconds: number): void;
  /** The watcher's lantern goes out, for good. */
  guardGone(): void;
  /** The last card. */
  end(): void;
}

/** How long a line stays up: long enough to read slowly. */
const readTime = (text: string) => Math.max(6, 3 + text.split(/\s+/).length * 0.33);

export function createStory(hooks: StoryHooks) {
  const queue: string[] = [];
  const seen = new Set<string>();
  let showing = 0;
  let gap = 0;
  let walked = 0;
  let townNext = 8;
  let townIndex = 0;
  let finaleAt = -1;
  let finaleIndex = 0;
  let clock = 0;
  /** When the end card comes up, on the story clock; -1 until the last line. */
  let endAt = -1;
  /** One substep, no longer than TUNING.maxStep. */
  const step = (dt: number, s: { along: number; moving: boolean; busy: boolean }) => {
    clock += dt;
    if (s.moving) walked += dt;
    // In town, before the path
    if (s.along < 2 && townIndex < TOWN.length && walked > townNext) {
      push(TOWN[townIndex++]!);
      townNext = walked + 30;
    }
    // Straight onto the path without lingering in town: the reason still needs telling first
    if (s.along >= 2 && s.along < 150) while (townIndex < TOWN.length) push(TOWN[townIndex++]!);
    if (s.along >= 150) townIndex = TOWN.length;
    // Lines well behind you (you came up fast, or were carried) are let go
    for (const b of PATH) {
      if (s.along - b.at > 150) seen.add(b.text);
      else if (s.along >= b.at) push(b.text);
    }
    // The end
    if (finaleAt >= 0) {
      if (endAt >= 0 && clock >= endAt) {
        endAt = -1;
        hooks.end();
      }
      while (finaleIndex < FINALE.length && clock - finaleAt >= FINALE[finaleIndex]!.after) {
        const f = FINALE[finaleIndex++]!;
        queue.length = 0;
        showing = 0;
        gap = 0;
        hooks.tell(f.text, readTime(f.text));
        if (finaleIndex === 3) hooks.guardGone();
        if (finaleIndex === FINALE.length) endAt = clock + readTime(f.text) + 1.5;
      }
      return;
    }
    // One at a time, a pause between, held back while something urgent is up
    if (showing > 0) {
      showing -= dt;
      if (showing <= 0) gap = 3.5;
      return;
    }
    if (gap > 0) {
      gap -= dt;
      return;
    }
    if (s.busy || !queue.length) return;
    const text = queue.shift()!;
    showing = readTime(text);
    hooks.tell(text, showing);
  };
  function push(text: string, front = false) {
    if (seen.has(text)) return;
    seen.add(text);
    if (front) queue.unshift(text);
    else queue.push(text);
  }

  return {
    /** Something happened: tell it, once. */
    mark(e: StoryEvent) {
      const text = EVENTS[e];
      if (text) push(text, e === 'stood' || e === 'hid' || e === 'trampled');
    },
    /** Shows `text` now, ahead of anything waiting, and holds the queue while it's up. */
    tellNow(text: string, seconds: number) {
      showing = seconds;
      gap = 0;
      hooks.tell(text, seconds);
    },
    /** The walker has sat in his chair: the end begins. */
    sit() {
      if (finaleAt < 0) finaleAt = clock;
    },
    get ended() {
      return finaleAt >= 0;
    },
    get debug() {
      return { queued: queue.length, showing: +showing.toFixed(1), finale: finaleIndex, sitting: finaleAt >= 0 ? +(clock - finaleAt).toFixed(1) : -1 };
    },
    /** Seconds since you sat in his chair, or -1. */
    get sitting() {
      return finaleAt >= 0 ? clock - finaleAt : -1;
    },
    /**
     * Each frame: `along` is the furthest you've come up the path, `moving` whether you're
     * walking about, `busy` whether something urgent is on screen (the story waits for it).
     * A big dt (fast-forward) is split into substeps of at most TUNING.maxStep.
     */
    update(dt: number, s: { along: number; moving: boolean; busy: boolean }) {
      stepFixed(dt, (h) => step(h, s), TUNING.maxStep);
    },
  };
}
