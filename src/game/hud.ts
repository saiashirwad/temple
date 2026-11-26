// The page's heads-up display: every HUD node, its copy, and what it shows each frame.
// index.ts builds a HudState once per frame and calls update(); writes to the DOM happen only
// when a value has changed, so a still frame costs no style work.

/** What the HUD shows, read from the walker and the journey once per frame. */
export interface HudState {
  above: boolean;
  /** Out on the trail (or already hurt): vitals and the torch button apply. */
  forest: boolean;
  moving: boolean;
  health: number;
  stamina: number;
  winded: boolean;
  hidden: boolean;
  threat: boolean;
  holding: number;
  sinceHurt: number;
  /** The wind's direction on screen, degrees clockwise from straight ahead. */
  windDeg: number;
  torchOn: boolean;
  sneaking: boolean;
}

export interface HudActions {
  mode(): void;
  jump(): void;
  crouch(): void;
  torch(): void;
  look(): void;
}

const HINT_DESK = 'Click to look · WASD to walk · Shift to run';
const HINT_TOUCH = 'Drag to look around · use the stick to walk';
const HINT_WAY = 'The forest path starts by the road, east of the temple.';
const HINT_KEYS = 'C to crouch · F for the torch';

// ---- diffing writes: each remembers the last value it wrote per element
const last = new WeakMap<Element, Map<string, string | boolean>>();

function seen(el: Element, key: string, v: string | boolean) {
  let m = last.get(el);

  if (!m) last.set(el, (m = new Map()));

  if (m.get(key) === v) return true;
  m.set(key, v);

  return false;
}

function put(el: HTMLElement, prop: string, v: string) {
  if (seen(el, prop, v)) return;

  if (prop.startsWith('--')) el.style.setProperty(prop, v);
  else (el.style as unknown as Record<string, string>)[prop] = v;
}

function flag(el: Element, cls: string, on: boolean) {
  if (!seen(el, '.' + cls, on)) el.classList.toggle(cls, on);
}

function hide(el: HTMLElement, h: boolean) {
  if (!seen(el, '[hidden]', h)) el.hidden = h;
}

function attr(el: Element, name: string, v: string) {
  if (!seen(el, '@' + name, v)) el.setAttribute(name, v);
}

function text(el: Node, t: string) {
  if (el.textContent !== t) el.textContent = t;
}

export function createHud(actions: HudActions, touch: boolean) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const root = $('#hud');
  const pad = $('#pad');
  const knob = $('#knob');
  const modeButton = $<HTMLButtonElement>('#mode');
  const jumpButton = $<HTMLButtonElement>('#jump');
  const crouchButton = $<HTMLButtonElement>('#crouch');
  const torchButton = $<HTMLButtonElement>('#torch');
  const look = $<HTMLButtonElement>('#look');
  const caption = $('#caption');
  const hint = $('#hint');
  const vitals = $('#vitals');
  const healthBar = $('#health');
  const health = $('#health i');
  const breathBar = $('#breath');
  const breath = $('#breath i');
  const windArrow = $('#wind b');
  const hiddenTag = $('#hidden');
  const holding = $('#holding');
  const storyLine = $('#story');
  const alert = $('#alert');
  const hurt = $('#hurt');
  const down = $('#down');
  const arrived = $('#arrived');
  const ended = $('#ended');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  modeButton.addEventListener('click', () => {
    actions.mode();
    // Focus left on the button would let Space and Enter press it again
    modeButton.blur();
  });
  look.addEventListener('click', actions.look);
  jumpButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    actions.jump();
  });

  for (const [b, fn] of [[crouchButton, actions.crouch], [torchButton, actions.torch]] as const)
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });

  const setTouch = (on: boolean) => {
    touch = on;
    flag(root, 'touch', on);
  };

  setTouch(touch);
  hide(modeButton, false);

  // Hints: the controls until you first move, then the way, then the crouch and torch keys the
  // first time the vitals come up (touch has labelled buttons for those)
  let stage = 0;
  let stageAt = performance.now();
  let vitalsSeen = false;
  let keysUntil = 0;
  let lastHealth = 1;
  let over = false;

  const update = (s: HudState) => {
    if (over) return;
    const now = performance.now();
    const out = !s.above;
    const vitalsOn = out && s.forest;

    if (stage === 0 && s.moving && now - stageAt > 3000) {
      stage = 1;
      stageAt = now;
    } else if (stage === 1 && now - stageAt > 9000) stage = 2;

    if (vitalsOn && !vitalsSeen) {
      vitalsSeen = true;

      if (!touch) keysUntil = now + 7000;
    }

    const h = now < keysUntil ? HINT_KEYS : stage === 0 ? (touch ? HINT_TOUCH : HINT_DESK) : stage === 1 ? HINT_WAY : '';

    if (h) text(hint, h);
    flag(hint, 'on', h !== '');

    text(modeButton, s.above ? 'Walk' : 'Look from above');
    hide(pad, !touch || s.above);
    hide(jumpButton, !touch || s.above);
    hide(crouchButton, !touch || s.above);
    hide(torchButton, !touch || s.above || !s.forest);
    flag(crouchButton, 'on', s.sneaking);
    flag(torchButton, 'on', s.torchOn);

    flag(vitals, 'on', vitalsOn);
    const hp = Math.round(s.health * 200) / 200;
    const st = Math.round(s.stamina * 200) / 200;
    put(health, 'transform', `scaleX(${hp})`);
    put(breath, 'transform', `scaleX(${st})`);
    attr(healthBar, 'aria-valuenow', String(Math.round(s.health * 10) * 10));
    attr(breathBar, 'aria-valuenow', String(Math.round(s.stamina * 10) * 10));
    flag(breathBar, 'full', s.stamina > 0.99);
    flag(breathBar, 'winded', s.winded);
    put(windArrow, 'transform', `rotate(${Math.round(s.windDeg)}deg)`);
    flag(hiddenTag, 'on', out && s.hidden && s.threat);
    flag(holding, 'on', out && s.holding > 0.05);
    put(holding, '--k', `${Math.round(s.holding * 100)}%`);

    // A red flash when hurt, and a steady edge while badly hurt
    const rest = s.health < 0.35 ? '0.35' : '0';

    if (s.health < lastHealth - 0.01) {
      put(hurt, 'transition', 'none');
      put(hurt, 'opacity', calm ? '0.5' : '1');
      requestAnimationFrame(() => {
        put(hurt, 'transition', 'opacity 1.1s');
        put(hurt, 'opacity', rest);
      });
    } else if (s.sinceHurt > 1.2) put(hurt, 'opacity', rest);
    lastHealth = s.health;
  };

  let alertTimer = 0;
  let storyTimer = 0;

  return {
    pad,
    knob,
    get touch() {
      return touch;
    },
    setTouch,
    update,
    /** An urgent line in the middle of the screen. */
    say(t: string, seconds: number) {
      alert.textContent = t;
      flag(alert, 'on', true);
      clearTimeout(alertTimer);
      alertTimer = window.setTimeout(() => flag(alert, 'on', false), seconds * 1000);
    },
    /** A story line at the top; the last one fades out before the next comes up. */
    tell(t: string, seconds: number) {
      flag(storyLine, 'on', false);
      clearTimeout(storyTimer);
      storyTimer = window.setTimeout(
        () => {
          storyLine.textContent = t;
          flag(storyLine, 'on', true);
          storyTimer = window.setTimeout(() => flag(storyLine, 'on', false), Math.max(2, seconds - 2.2) * 1000);
        },
        storyLine.textContent ? 900 : 0,
      );
    },
    /** The words for a thing looked at closely, or null to fade them. */
    caption(t: string | null) {
      if (t !== null) caption.textContent = t;
      flag(caption, 'on', t !== null);
    },
    /** The look-closer button's label, or null to hide it. */
    look(label: string | null) {
      hide(look, label === null);

      if (label !== null) text(look.firstChild!, label);
    },
    down() {
      flag(down, 'on', true);
      setTimeout(() => flag(down, 'on', false), 3200);
    },
    arrive() {
      flag(arrived, 'on', true);
      setTimeout(() => flag(arrived, 'on', false), 9000);
    },
    /** The end card: everything else goes. */
    end() {
      over = true;
      flag(root, 'ended', true);
      flag(ended, 'on', true);
    },
  };
}

export type Hud = ReturnType<typeof createHud>;
