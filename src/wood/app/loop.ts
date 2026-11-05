/**
 * The one requestAnimationFrame loop (as Brick's): advance the clock, derive snapshots, build the WoodFrame, render,
 * and let the UI update only what changed.
 */
import { allFunds, treeVisual } from '../engine';
import type { WoodFrame, WoodSceneAPI } from '../types';
import type { Store } from './store';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  invalidate(): void;
}

const FRAME_60 = 1000 / 60 - 2;
const FRAME_30 = 1000 / 30 - 2;
const SLOW_MS = 10;
const FAST_MS = 5;
const SETTLE_MS = 1500;

export function startLoop(store: Store, scene: WoodSceneAPI, ui: UI): Loop {
  const { state } = store;
  let raf = 0;
  let last = performance.now();
  let dirty = true;
  let lastMonths = NaN;
  let lastInputs: unknown = null;
  let running = true;
  let settleUntil = 0;
  let frameMs = FRAME_60;
  let work = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - last < frameMs) return;
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const { inputs, months } = state;
    const snaps = allFunds(inputs, months);
    ui.update(snaps);

    if (state.reducedMotion) {
      const changed = dirty || months !== lastMonths || inputs !== lastInputs;
      if (changed) settleUntil = now + SETTLE_MS;
      if (!changed && now > settleUntil) return;
    }
    lastMonths = months;
    lastInputs = inputs;
    dirty = false;

    const f: WoodFrame = {
      timeMs: now,
      monthsPerSecond: state.playing ? state.monthsPerSecond : 0,
      months,
      trees: [treeVisual(inputs, snaps[0]), treeVisual(inputs, snaps[1])],
      reducedMotion: state.reducedMotion,
    };
    scene.render(f);
    ui.place();
    work += (performance.now() - t0 - work) * 0.05;
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
  };
}
