/**
 * The one requestAnimationFrame loop: advance the clock, derive snapshots, build the OrchardFrame, render, and let
 * the UI update only what changed.
 */
import { PICKERS, allPickers, saveSchedule, treesAt } from '../engine';
import type { OrchardInputs, PickerId, SaveSnapshot } from '../engine';
import type { OrchardFrame, OrchardSceneAPI, PickerVisual } from '../types';
import type { Store } from './store';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
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

/**
 * One picker's scene state at `months`: its trees (from the engine), this month's basket and the free fruit on offer
 * as shares of the larger picker's monthly own + match (so B's basket is twice A's at the defaults), the share of the
 * offer picked, the slot of the newest tree, and whether the whole time has run.
 */
export function pickerVisual(inputs: OrchardInputs, id: PickerId, months: number, snap?: SaveSnapshot): PickerVisual {
  const s = saveSchedule(inputs, id);
  const larger = Math.max(...PICKERS.map((p) => saveSchedule(inputs, p)).map((p) => p.ownMonthly + p.matchMonthly));
  // (when nobody saves, the offer is still on the branch: it is its own scale, and all of it falls)
  const scale = larger > 0 ? larger : s.offerMonthly > 0 ? s.offerMonthly : 1;
  const trees = treesAt(inputs, id, months);
  const saving = snap ? snap.saving : months < s.months - 1e-9;
  const share = (v: number) => Math.max(0, Math.min(1, v / scale));
  return {
    id,
    trees,
    basket: saving ? { own: share(s.ownMonthly), match: share(s.matchMonthly) } : { own: 0, match: 0 },
    offer: share(s.offerMonthly),
    picked: s.offerMonthly > 0 ? Math.max(0, Math.min(1, s.matchMonthly / s.offerMonthly)) : 1,
    planting: trees.length ? trees[trees.length - 1].index : -1,
    done: months >= s.months - 1e-9,
  };
}

export function startLoop(store: Store, scene: OrchardSceneAPI, ui: UI): Loop {
  const { state } = store;
  let raf = 0;
  let last = performance.now();
  let dirty = true;
  let lastMonths = NaN;
  let lastInputs: unknown = null;
  let running = true;
  let settleUntil = 0;
  let frameMs = FRAME_60;
  /** a frame's work, smoothed (ms) */
  let work = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Motion is capped at 60 fps: skip display refreshes until a 60 fps frame is due. The clock advances by the real
    // elapsed time, so playback speed is unchanged.
    if (now - last < frameMs) return;
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const { inputs, months } = state;
    const snaps = allPickers(inputs, months);

    // Numbers and text (DOM touched only when displayed values change).
    ui.update(snaps);

    if (state.reducedMotion) {
      const changed = dirty || months !== lastMonths || inputs !== lastInputs;
      if (changed) settleUntil = now + SETTLE_MS;
      if (!changed && now > settleUntil) return;
    }
    lastMonths = months;
    lastInputs = inputs;
    dirty = false;

    const f: OrchardFrame = {
      timeMs: now,
      monthsPerSecond: state.playing ? state.monthsPerSecond : 0,
      speed: state.playing ? state.speed : 1,
      month: months,
      pickers: [pickerVisual(inputs, 'a', months, snaps[0]), pickerVisual(inputs, 'b', months, snaps[1])],
      reducedMotion: state.reducedMotion,
    };
    scene.render(f);
    ui.place();
    work += (performance.now() - t0 - work) * 0.05;
    if (import.meta.env.DEV) {
      const w = window as unknown as { __orchardPerf?: { frames: number; work: number; capped: boolean } };
      const p = (w.__orchardPerf ??= { frames: 0, work: 0, capped: false });
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
  };
}
