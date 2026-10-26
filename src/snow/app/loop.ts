/**
 * The one requestAnimationFrame loop: advance the clocks, derive snapshots,
 * build the SnowFrame, render, and let the UI update only what changed.
 */
import { DEBTS, allStrategies, largestStart } from '../engine';
import type { SnowInputs, StrategySnapshot } from '../engine';
import type { BallVisual, HillVisual, SnowFrame, SnowSceneAPI } from '../types';
import type { Store } from './store';
import { CAMERA_ZOOM, storyCamera } from './story';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
}

/**
 * Minimum time between rendered frames: 60 fps (with slack so 120 Hz displays land on every 2nd refresh).
 * The climbers' arms and the falling snow need 60 to read smoothly.
 */
const FRAME_MS = 1000 / 60 - 2;

/** In reduced motion the scene keeps being drawn for this long after anything changes, so it can settle. */
const SETTLE_MS = 1500;

/**
 * One hill's scene state from its snapshot. Sizes are fractions of the LARGEST starting balance, so the same debt
 * looks the same on both hills at the same balance and the comparison stays honest.
 */
export function hillVisual(snap: StrategySnapshot, inputs: SnowInputs): HillVisual {
  const scale = largestStart(inputs);
  const ball = (id: (typeof DEBTS)[number]): BallVisual => {
    const d = snap.debts[id];
    const start = inputs.debts[id].balance;
    return {
      id,
      size: Math.max(0, d.balance / scale),
      progress: Math.max(0, Math.min(1, 1 - d.balance / start)),
      snowfall: d.interest / scale,
      rolling: d.payment / scale,
      target: snap.target === id && !d.paidOff,
      paidOff: d.paidOff,
    };
  };
  return { id: snap.id, balls: [ball('medical'), ball('car'), ball('card')], paidOff: snap.paidOff };
}

export function startLoop(store: Store, scene: SnowSceneAPI, ui: UI): Loop {
  const { state } = store;
  let raf = 0;
  let last = performance.now();
  let dirty = true;
  let lastMonths = NaN;
  let lastInputs: unknown = null;
  let lastCamKey = '';
  let running = true;
  let camZoom = 1;
  let camInit = false;
  let camFocus: 'both' = 'both';
  let lastFade = -1;
  let settleUntil = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Motion is capped at 60 fps: skip display refreshes until a 60 fps frame is due. The clock advances by
    // the real elapsed time, so playback speed and story length are unchanged.
    if (now - last < FRAME_MS) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const { inputs, months } = state;
    const snaps = allStrategies(inputs, months);

    // Numbers and text (DOM touched only when displayed values change).
    ui.update(snaps);

    const motion = !state.reducedMotion;

    // Opening camera move (story only). Eased, so leaving the story mid-zoom glides back to the full view;
    // the first frame starts already close in.
    const camTarget = state.mode === 'story' ? storyCamera(state.storyTime, inputs, state.reducedMotion) : undefined;
    const tz = camTarget?.zoom ?? 1;
    if (camTarget) camFocus = camTarget.focus;
    camZoom = camInit && motion ? camZoom + (tz - camZoom) * (1 - Math.exp(-dt / 0.35)) : tz;
    camInit = true;
    if (Math.abs(camZoom - 1) < 0.002) camZoom = 1;
    const camKey = camZoom.toFixed(3);
    if (!motion) {
      const changed = dirty || months !== lastMonths || inputs !== lastInputs || camKey !== lastCamKey;
      if (changed) settleUntil = now + SETTLE_MS;
      if (!changed && now > settleUntil) return;
    }
    lastCamKey = camKey;
    lastMonths = months;
    lastInputs = inputs;
    dirty = false;

    // The hill labels wait out the close-up and fade back in over the last part of the ease out.
    const fade = Math.max(0, Math.min(1, 1 - (camZoom - 1) / ((CAMERA_ZOOM - 1) * 0.6)));
    if (Math.abs(fade - lastFade) > 0.01 || (fade === 1 && lastFade !== 1)) {
      document.documentElement.style.setProperty('--label-fade', fade.toFixed(3));
      lastFade = fade;
    }

    const f: SnowFrame = {
      timeMs: now,
      monthsPerSecond: state.playing ? state.monthsPerSecond : 0,
      speed: state.playing ? state.speed : 1,
      hills: [hillVisual(snaps[0], inputs), hillVisual(snaps[1], inputs)],
      reducedMotion: state.reducedMotion,
      camera: camZoom > 1 ? { zoom: camZoom, focus: camFocus } : undefined,
    };
    scene.render(f);
    ui.place();
  };

  raf = requestAnimationFrame(frame);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    invalidate() {
      dirty = true;
    },
  };
}
