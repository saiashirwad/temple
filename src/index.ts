import * as web from '@typegpu/kit/web';
import { createScene } from './scene.ts';
import { boot } from './boot.ts';
import { scenarios } from './scenarios.ts';
import { createHud, type Hud } from './hud.ts';

declare global {
  interface Window {
    bash?: {
      preview?: { onCapture?: (h: (o: { capture: () => void; signal: AbortSignal }) => unknown) => () => void };
    };
  }
}

const canvas = document.querySelector('canvas')!;
const forcedPhone = boot.has('phone');
const coarse = forcedPhone || matchMedia('(pointer: coarse)').matches;
type Walker = ReturnType<typeof import('./walk.ts').createWalker>;

/** The on-screen stick, wired to the walker. */
function stick(walker: Walker, hud: Hud) {
  const { pad, knob } = hud;
  let held: number | null = null;
  const at = (e: PointerEvent) => {
    const box = pad.getBoundingClientRect();
    const r = box.width / 2;
    let x = (e.clientX - box.left - r) / r;
    let y = (e.clientY - box.top - r) / r;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    walker.stick.x = Math.abs(x) < 0.15 ? 0 : x;
    walker.stick.y = Math.abs(y) < 0.15 ? 0 : -y;
    knob.style.transform = `translate(${x * r * 0.6}px, ${y * r * 0.6}px)`;
  };
  pad.addEventListener('pointerdown', (e) => {
    held = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    at(e);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === held) at(e);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== held) return;
    held = null;
    walker.stick.x = 0;
    walker.stick.y = 0;
    knob.style.transform = '';
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
}
/** Runs after each frame once the scene is up: the HUD's per-frame update. */
let hudFrame: (() => void) | null = null;
const note = document.querySelector<HTMLElement>('#note')!;
// Test scenarios by key chord (` then a key), and the state readout they report in
const tests = scenarios(document.querySelector<HTMLPreElement>('#state')!);
if (boot.has('debug')) {
  addEventListener('error', (e) => (note.textContent = 'ERR ' + String(e.message).slice(0, 3000)));
  addEventListener('unhandledrejection', (e) => (note.textContent = 'REJ ' + String(e.reason?.message ?? e.reason).slice(0, 3000)));
}

// The preview capture copies the canvas right after a frame is submitted
let pendingCapture: (() => void) | null = null;
window.bash?.preview?.onCapture?.(
  ({ capture, signal }) =>
    new Promise<void>((resolve) => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        if (!signal.aborted) capture();
        resolve();
      };
      pendingCapture = run;
      // Still loading: show the page as it is
      setTimeout(run, 2500);
    }),
);

// Profiling: ?profile, or the `m chord. Prints measured pass timings on the page.
const profiling = boot.has('profile');
const debug = profiling ? (await import('@typegpu/kit/debug')).gpuDebug : null;
const probe = debug?.install();
let out: HTMLPreElement | null = null;
const report = async () => {
  if (!probe || !debug) return;
  if (out) {
    delete out.dataset.done;
    out.textContent = 'measuring…';
    const result = await probe.measure({ seconds: 2, detail: 'pass' });
    out.textContent = debug.measureText(result) + '\n' + ((window as { cpuReport?: () => string }).cpuReport?.() ?? '');
    out.dataset.done = '';
    return;
  }
  (window as { pinScale?: number }).pinScale = 1;
  out = document.createElement('pre');
  out.id = 'perf';
  out.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9;color:#fff;background:#000c;font:11px/1.25 monospace;padding:6px;margin:0;max-height:96vh;overflow:hidden;pointer-events:none';
  document.body.append(out);
  out.textContent = 'measuring…';
  // Short enough to finish inside one GPU-worker check after the `m reload
  await new Promise((r) => setTimeout(r, 1200));
  try {
    probe.start();
    await new Promise((r) => setTimeout(r, 600));
    const result = await probe.measure({ seconds: 1.5, detail: 'pass' });
    out.textContent = debug.measureText(result) + '\n' + ((window as { cpuReport?: () => string }).cpuReport?.() ?? '') + `\ncanvas ${canvas.width}x${canvas.height}`;
    out.dataset.done = '';
  } catch (e) {
    out.textContent = 'measure failed ' + String(e);
    out.dataset.done = '';
  }
};

if (!navigator.gpu) {
  note.textContent = 'This scene needs WebGPU. Try a recent Chrome, Edge or Safari.';
} else {
  web.host(createScene, {
    canvas,
    // Phones have small, dense screens and modest GPUs: fewer pixels there go a long way
    maxPixelRatio: coarse ? 1.15 : 1.5,
    optionalFeatures: ['timestamp-query', 'indirect-first-instance'],
    attach: ({ scene }) => {
      console.log('scene ready');
      canvas.dataset.ready = '';
      note.remove();
      // Something for test browsers to wait on: the scene is up and drawing
      document.body.append(Object.assign(document.createElement('i'), { id: 'running', style: 'position:fixed;left:0;bottom:0;width:1px;height:1px' }));
      const controls = web.orbitControls(scene.view, canvas, { sensitivity: coarse ? 0.007 : 0.005, onChange: () => scene.touched() });
      tests.attach(scene);
      const j = scene.journey;
      const walker = scene.walker;
      let shown: string | null = null;
      let shownId: string | undefined;
      let since = 0;
      // Bending down to look at something by the path: dung, prints, a shrine, a view
      const examine = () => {
        const it = j.near;
        if (!it) return;
        walker.touched();
        if (it.low || it.sit) walker.crouchDown(it.low);
        j.examined(it);
        hud.caption(it.text);
        shown = it.text;
        shownId = it.id;
        window.dispatchEvent(new CustomEvent('temple:examined', { detail: it.id }));
        since = performance.now();
        hud.look(null);
      };
      const jump = () => {
        walker.touched();
        walker.jump();
      };
      const crouch = () => {
        walker.touched();
        walker.toggleCrouch();
      };
      const torch = () => j.toggleTorch();
      const hud = createHud(
        {
          mode: () => {
            walker.toggleAbove();
            if (walker.mode === 'above' && document.pointerLockElement) document.exitPointerLock();
          },
          jump,
          crouch,
          torch,
          look: examine,
        },
        coarse,
      );
      stick(walker, hud);
      // Touch layout follows the input in use: a finger on the screen, or a key pressed
      addEventListener('pointerdown', (e) => e.pointerType === 'touch' && hud.setTouch(true), true);
      // On a computer, a click on the scene takes the mouse for looking round, as in any game on
      // foot; Esc gives it back. Where the browser won't, dragging still looks
      canvas.addEventListener('click', () => {
        if (hud.touch || walker.mode === 'above' || document.pointerLockElement) return;
        try {
          const p = canvas.requestPointerLock() as unknown;
          if (p instanceof Promise) p.catch(() => {});
        } catch {}
      });
      addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        const g = scene.view.goal;
        g.yaw -= e.movementX * 0.0022;
        g.pitch = Math.min(1.3, Math.max(-1.1, g.pitch + e.movementY * 0.0022));
        scene.touched();
      });
      // Every key in one place
      const moveKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
      addEventListener('keydown', (e) => {
        if (!forcedPhone) hud.setTouch(false);
        const k = e.key.toLowerCase();
        if (moveKeys.has(k)) {
          if (k.startsWith('arrow')) e.preventDefault();
          walker.keys.add(k);
          return;
        }
        // Leave browser shortcuts (Ctrl+F, Cmd+E…) to the browser
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === ' ' && walker.mode !== 'above') e.preventDefault();
        if (e.repeat) return;
        switch (k) {
          case ' ':
            if (walker.mode !== 'above') jump();
            break;
          case 'e':
            examine();
            break;
          case 'c':
            crouch();
            break;
          case 'f':
            torch();
            break;
          case 'm':
            if (out) void report();
            break;
        }
      });
      addEventListener('keyup', (e) => walker.keys.delete(e.key.toLowerCase()));
      // Keys let go while the window was away would otherwise keep you walking
      addEventListener('blur', () => walker.keys.clear());
      setInterval(() => {
        const it = j.near;
        const reading = shown !== null;
        j.reading = reading;
        // Up again and the words gone once you walk on, or move away
        if (reading && ((walker.moving && performance.now() - since > 600) || !it || it.text !== shown)) {
          shown = null;
          window.dispatchEvent(new CustomEvent('temple:closed', { detail: shownId }));
          shownId = undefined;
          hud.caption(null);
          walker.standUp();
        }
        hud.look(!it || shown !== null || walker.mode === 'above' ? null : (it.label ?? 'Look closer'));
      }, 150);
      j.onSay = hud.say;
      j.onTell = hud.tell;
      j.onEnd = hud.end;
      j.onDown = hud.down;
      j.onArrive = hud.arrive;
      // Health, breath, and what the forest is telling you
      hudFrame = () => {
        // The wind on screen: which way it blows, turned to the way you face
        const yaw = scene.view.pose.yaw;
        const [wx, wz] = j.wind;
        const right = wx * Math.cos(yaw) - wz * Math.sin(yaw);
        const ahead = -wx * Math.sin(yaw) - wz * Math.cos(yaw);
        hud.update({
          above: walker.mode === 'above',
          forest: j.furthest > 60 || j.health < 1,
          moving: walker.moving,
          health: j.health,
          stamina: walker.stamina,
          winded: walker.winded,
          hidden: j.hidden,
          threat: j.threat,
          holding: j.holding,
          sinceHurt: j.sinceHurt,
          windDeg: (Math.atan2(right, ahead) * 180) / Math.PI,
          torchOn: j.torchOn,
          sneaking: walker.sneaking,
        });
      };
      // ?at=x,z,yaw,pitch[,height] holds the eye at a spot, for checking a view
      const at = boot.get('at');
      if (at) {
        const [x, z, yaw, pitch, h] = at.split(',').map(Number);
        scene.walker.hold(x!, z!, yaw!, pitch!, h);
      }
      void report();
      return controls;
    },
    onFrame: () => {
      hudFrame?.();
      if (pendingCapture) {
        const run = pendingCapture;
        pendingCapture = null;
        queueMicrotask(run);
      }
    },
    onError: (error) => {
      console.error(error);
      note.textContent = 'The scene could not start on this device.';
      if (boot.has('debug')) note.textContent += ' ' + String((error as Error)?.message ?? error).slice(0, 3000);
    },
  });
}
