/**
 * The one requestAnimationFrame loop: advance the clocks, derive snapshots,
 * build the VineFrame, render, and let the UI update only what changed.
 */
import { allPlans } from '../engine';
import type { PlanSnapshot, VineInputs } from '../engine';
import type { CottageVisual, VineFrame, VineSceneAPI } from '../types';
import type { Store } from './store';
import { storyCamera } from './story';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
}

/**
 * Minimum time between rendered frames: 60 fps (with slack so 120 Hz displays land on every 2nd refresh).
 * The gardeners' arms and the falling leaves need 60 to read smoothly.
 */
const FRAME_MS = 1000 / 60 - 2;

/** In reduced motion the scene keeps being drawn for this long after anything changes, so it can settle. */
const SETTLE_MS = 1500;

/**
 * One cottage's scene state from its snapshot. Every amount is a fraction of the STARTING balance, so both
 * cottages share one scale and the comparison stays honest.
 */
export function cottageVisual(snap: PlanSnapshot, inputs: VineInputs): CottageVisual {
  const start = inputs.balance;
  return {
    id: snap.id,
    vine: Math.max(0, Math.min(1, snap.balance / start)),
    regrowth: snap.interest / start,
    pruning: snap.payment / start,
    pile: snap.interestPaid / start,
    paidOff: snap.paidOff,
  };
}

export function startLoop(store: Store, scene: VineSceneAPI, ui: UI): Loop {
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
  let camFocus: 'both' | 'minimum' | 'fixed' = 'both';
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
    const snaps = allPlans(inputs, months);

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

    // The labels wait out the close-up and fade back in as the camera settles.
    const fade = Math.max(0, Math.min(1, (1.35 - camZoom) / 0.35));
    if (Math.abs(fade - lastFade) > 0.01 || (fade === 1 && lastFade !== 1)) {
      document.documentElement.style.setProperty('--label-fade', fade.toFixed(3));
      lastFade = fade;
    }

    const f: VineFrame = {
      timeMs: now,
      monthsPerSecond: state.playing ? state.monthsPerSecond : 0,
      cottages: [cottageVisual(snaps[0], inputs), cottageVisual(snaps[1], inputs)],
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
