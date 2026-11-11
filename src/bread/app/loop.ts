/**
 * The one requestAnimationFrame loop: advance the clock, derive the snapshot, build the BreadFrame, render, and let
 * the UI update only what changed.
 */
import { monthRow, snapshot } from '../engine';
import type { BreadFrame, BreadSceneAPI } from '../types';
import type { Store } from './store';
import type { UI } from './ui';
import { boardFor, boardMonth } from './text';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
  /** The frame most recently given to the scene (for tests). */
  lastFrame(): BreadFrame | null;
}

/**
 * Minimum time between rendered frames: 60 fps (with slack so 120 Hz displays land on every 2nd refresh), or 30 fps on
 * a machine where a frame's work takes long: a steady 30 reads far better than an uneven 60 that keeps dropping frames.
 */
const FRAME_60 = 1000 / 60 - 2;
const FRAME_30 = 1000 / 30 - 2;
/** a frame's own work (ms, smoothed) above which the loop drops to 30 fps, and below which it goes back to 60 */
const SLOW_MS = 10;
const FAST_MS = 5;

/** In reduced motion the scene keeps being drawn for this long after anything changes, so it can settle. */
const SETTLE_MS = 1500;

export function startLoop(store: Store, scene: BreadSceneAPI, ui: UI): Loop {
  const { state } = store;
  let raf = 0;
  let last = performance.now();
  let dirty = true;
  let lastMonth = NaN;
  let lastBasket: unknown = null;
  let seenJumps = -1;
  let running = true;
  let settleUntil = 0;
  let frameMs = FRAME_60;
  let latest: BreadFrame | null = null;
  /** a frame's work, smoothed (ms) */
  let work = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - last < frameMs) return;
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const { basket, month } = state;
    const snap = snapshot(basket, month);

    // Numbers and text (DOM touched only when displayed values change).
    ui.update(snap);

    if (state.reducedMotion) {
      const changed = dirty || month !== lastMonth || basket !== lastBasket;
      if (changed) settleUntil = now + SETTLE_MS;
      if (!changed && now > settleUntil) return;
    }
    lastMonth = month;
    lastBasket = basket;
    dirty = false;

    // a drag or a jump this frame (and the very first frame): the scene places everything settled
    const scrubbed = state.jumps !== seenJumps;
    seenJumps = state.jumps;

    const f: BreadFrame = {
      timeMs: now,
      monthsPerSecond: state.playing ? state.monthsPerSecond : 0,
      speed: state.playing ? state.speed : 1,
      month: snap.month,
      statementMonth: snap.statementMonth,
      // the board is chalked once a year, with January's prices (the labels below carry the month's)
      board: boardFor(monthRow(basket, boardMonth(snap.statementMonth))),
      basket,
      scrubbed,
      reducedMotion: state.reducedMotion,
    };
    latest = f;
    scene.render(f);
    ui.place();
    work += (performance.now() - t0 - work) * 0.05;
    if (import.meta.env.DEV) {
      const w = window as unknown as { __breadPerf?: { frames: number; work: number; capped: boolean } };
      const p = (w.__breadPerf ??= { frames: 0, work: 0, capped: false });
      p.frames++;
      p.work = work;
      p.capped = frameMs === FRAME_30;
    }
    if (frameMs === FRAME_60 && work > SLOW_MS) frameMs = FRAME_30;
    else if (frameMs === FRAME_30 && work < FAST_MS) frameMs = FRAME_60;
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
    lastFrame: () => latest,
  };
}
