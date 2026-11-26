import * as web from '@typegpu/kit/web';
import { loadSpecimenGeometry } from '../render/vegetation.ts';
import { loadTown } from '../world/town/load.ts';
import { createScene } from './scene.ts';
import { boot } from './boot.ts';
import { resolveLaunch } from './launch.ts';
import { scenarios } from './scenarios.ts';
import { createHud, type Hud } from './hud.ts';

const canvas = document.querySelector('canvas')!;
const forcedPhone = boot.has('phone');
const coarse = forcedPhone || matchMedia('(pointer: coarse)').matches;
type Walker = ReturnType<typeof import('../sim/walk.ts').createWalker>;

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
const launch = (() => {
  try { return resolveLaunch(boot); }
  catch (error) {
    note.dataset.error = note.textContent = String(error);
    throw error;
  }
})();
const tests = scenarios(document.querySelector<HTMLPreElement>('#state')!, launch);
if (boot.has('debug')) {
  addEventListener('error', (e) => (note.textContent = 'ERR ' + String(e.message).slice(0, 3000)));
  addEventListener('unhandledrejection', (e) => (note.textContent = 'REJ ' + String(e.reason?.message ?? e.reason).slice(0, 3000)));
}

// Profiling: ?profile, or the `m chord. Prints measured pass timings on the page.
const profiling = boot.has('profile');
const debug = profiling ? (await import('@typegpu/kit/debug')).gpuDebug : null;
const probe = debug?.install();
let out: HTMLPreElement | null = null;
const report = async (scene: Awaited<ReturnType<typeof createScene>>) => {
  if (!probe || !debug) return;
  const initial = !out;
  if (!out) {
    out = document.createElement('pre');
    out.id = 'perf';
    out.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9;color:#fff;background:#000c;font:11px/1.25 monospace;padding:6px;margin:0;max-height:96vh;overflow:hidden;pointer-events:none';
    document.body.append(out);
  }
  delete out.dataset.done;
  out.textContent = 'measuring…';
  try {
    if (initial) {
      await new Promise(done => setTimeout(done, 1200));
      probe.start();
      await new Promise(done => setTimeout(done, 600));
    }
    const result = await probe.measure({ seconds: 2, detail: 'pass' });
    const state = scene.inspect();
    const rows = Object.entries(state.cpu).map(([name, ms]) => `cpu ${ms}ms ${name}`);
    out.textContent = [debug.measureText(result), ...rows, `scale ${state.scale}, gpu frame ${state.gpuMs ?? '?'}ms`, `canvas ${canvas.width}x${canvas.height}`].join('\n');
  } catch (error) {
    out.textContent = 'measure failed ' + String(error);
  } finally {
    out.dataset.done = '';
  }
};

if (!navigator.gpu) {
  note.dataset.error = 'WebGPU unavailable';
  note.textContent = 'This scene needs WebGPU. Try a recent Chrome, Edge or Safari.';
} else {
  const inputs = { launch, specimensReady: loadSpecimenGeometry(), town: loadTown() };
  web.host((root, surface) => createScene(root, surface, inputs), {
    canvas,
    // Phones have small, dense screens and modest GPUs: fewer pixels there go a long way
    maxPixelRatio: coarse ? 1.15 : 1.5,
    optionalFeatures: ['timestamp-query', 'indirect-first-instance'],
    attach: ({ scene }) => {
      const controls = web.orbitControls(scene.view, canvas, { sensitivity: coarse ? 0.007 : 0.005, onChange: () => scene.walker.touched() });

      const { state, danger } = scene.journey;
      const walker = scene.walker;
      let shown: string | null = null;
      let shownId: string | undefined;
      let since = 0;
      // Bending down to look at something by the path: dung, prints, a shrine, a view
      const examine = () => {
        const it = state.near;
        if (!it) return;
        walker.touched();
        if (it.low || it.sit) walker.crouchDown(it.low);
        scene.journey.examine(it);
        hud.caption(it.text);
        shown = it.text;
        state.reading = true;
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
      const torch = () => { state.torchOff = !state.torchOff; };
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
        scene.walker.touched();
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
            if (out) void report(scene);
            break;
        }
      });
      addEventListener('keyup', (e) => walker.keys.delete(e.key.toLowerCase()));
      // Keys let go while the window was away would otherwise keep you walking
      addEventListener('blur', () => walker.keys.clear());
      setInterval(() => {
        const it = state.near;
        // Up again and the words gone once you walk on, or move away
        if (state.reading && ((walker.moving && performance.now() - since > 600) || !it || it.text !== shown)) {
          shown = null;
          state.reading = false;
          window.dispatchEvent(new CustomEvent('temple:closed', { detail: shownId }));
          shownId = undefined;
          hud.caption(null);
          walker.standUp();
        }
        hud.look(!it || shown !== null || walker.mode === 'above' ? null : (it.label ?? 'Look closer'));
      }, 150);
      scene.journey.attachHud(hud);
      // Health, breath, and what the forest is telling you
      hudFrame = () => {
        // The wind on screen: which way it blows, turned to the way you face
        const yaw = scene.view.pose.yaw;
        const [wx, wz] = state.wind;
        const right = wx * Math.cos(yaw) - wz * Math.sin(yaw);
        const ahead = -wx * Math.sin(yaw) - wz * Math.cos(yaw);
        hud.update({
          above: walker.mode === 'above',
          forest: state.furthest > 60 || danger.health < 1,
          moving: walker.moving,
          health: danger.health,
          stamina: walker.stamina,
          winded: walker.winded,
          hidden: state.hidden,
          threat: danger.threat,
          holding: danger.holding,
          sinceHurt: danger.sinceHurt,
          windDeg: (Math.atan2(right, ahead) * 180) / Math.PI,
          torchOn: !state.torchOff,
          sneaking: walker.sneaking,
        });
      };
      tests.attach(scene);
      void report(scene);
      return controls;
    },
    onFrame: ({ scene }) => {
      hudFrame?.();
      const viewpoint = tests.takeViewChange();
      if (viewpoint) canvas.dataset.view = viewpoint;
      if (canvas.dataset.ready === undefined && tests.prepared) {
        canvas.dataset.ready = '';
        const pose = scene.view.pose;
        canvas.dataset.firstFrame = JSON.stringify({ at: [pose.target[0], pose.target[2]], yaw: pose.yaw, pitch: pose.pitch, mode: scene.walker.mode,
          readingNote: document.querySelector('#caption')?.classList.contains('on') && scene.journey.story.sitting < 0, ended: scene.journey.state.ended, guardGone: scene.test.guardGone, sitting: scene.journey.story.sitting });
        performance.mark('game:first-frame');
        delete document.body.dataset.starting;
        note.remove();
      }
    },
    onError: (error) => {
      console.error(error);
      if (!note.isConnected) document.body.append(note);
      note.dataset.error = String(error);
      note.textContent = 'The scene could not start on this device.';
      if (boot.has('debug')) note.textContent += ' ' + String((error as Error)?.message ?? error).slice(0, 3000);
    },
  });
}
