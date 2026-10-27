/**
 * The one requestAnimationFrame loop: advance the clocks, derive snapshots,
 * build the RiverFrame, render, and let the UI update only what changed.
 */
import { BOATS, allBoats, effortOf } from '../engine';
import type { BoatId, BoatSnapshot } from '../engine';
import type { BoatVisual, RiverFrame, RiverSceneAPI } from '../types';
import type { Store } from './store';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
}

/**
 * Minimum time between rendered frames: 60 fps (with slack so 120 Hz displays land on every 2nd refresh).
 * The other pages cap at 30 fps; here the rowing strokes need 60 to read smoothly, and the whole river
 * scene costs about 2 ms a frame.
 */
const FRAME_MS = 1000 / 60 - 2;
/** The scene accepts u in [-1.1, 1.1]. */
const U_LIMIT = 1.1;

const clampU = (u: number): number => Math.max(-U_LIMIT, Math.min(U_LIMIT, u));

/**
 * How much of the shared scale fits the visible river. Wide screens show beyond ±1 so this is 1; a portrait phone
 * sees a narrower slice, so every boat and milepost is drawn closer to the dock by the same factor (still one
 * linear scale for all three boats, so the comparison stays honest).
 */
export function fitFactor(visible: { min: number; max: number }): number {
  const half = Math.min(-visible.min, visible.max);
  // keep the whole boat in view, not just its centre: with the cash boat's stowed blades out past the stern,
  // a boat reaches about 0.32 u either side of its anchor
  return Math.max(0.35, Math.min(1, half - BOAT_HALF_U));
}

/** half a boat's length in u, oars included (about 135 world units each side of its centre, 420 units per u) */
export const BOAT_HALF_U = 0.32;

/**
 * One boat's scene state from its snapshot. Position is logReal over the SHARED display scale; effort only
 * drives the rowing; waterSpeed (how fast it moves through the water) only drives the wake.
 */
export function boatVisual(
  snap: BoatSnapshot,
  effort: number,
  displayScale: number,
  yearsPerSecond: number,
): BoatVisual {
  return {
    id: snap.id,
    u: clampU(snap.logReal / displayScale),
    effort,
    waterSpeed: (Math.max(0, Math.log1p(snap.rate)) / displayScale) * yearsPerSecond,
  };
}

export function startLoop(store: Store, scene: RiverSceneAPI, ui: UI): Loop {
  const { state } = store;
  let raf = 0;
  let last = performance.now();
  let dirty = true;
  let lastYears = NaN;
  let lastScale = NaN;
  let lastInputs: unknown = null;
  let running = true;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Motion is capped at 60 fps: skip display refreshes until a 60 fps frame is due. The clock advances by
    // the real elapsed time, so playback speed and is unchanged.
    if (now - last < FRAME_MS) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const { inputs, years, displayScale } = state;
    const snaps = allBoats(inputs, years);

    // Numbers and text (DOM touched only when displayed values change).
    ui.update(snaps);

    if (state.reducedMotion && !dirty && years === lastYears && displayScale === lastScale && inputs === lastInputs) return;
    lastYears = years;
    lastScale = displayScale;
    lastInputs = inputs;
    dirty = false;


    const flowing = state.playing && state.yearsPerSecond > 1e-6 && years < inputs.years;
    const yps = flowing ? state.yearsPerSecond : 0;
    const fit = fitFactor(scene.visibleU());
    ui.setFit(fit);
    const visual = (id: BoatId, i: number): BoatVisual => boatVisual(snaps[i], effortOf(inputs, id), displayScale / fit, yps);
    const f: RiverFrame = {
      timeMs: now,
      current: inputs.inflation,
      flowing,
      boats: [visual(BOATS[0], 0), visual(BOATS[1], 1), visual(BOATS[2], 2)],
      reducedMotion: state.reducedMotion,
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
