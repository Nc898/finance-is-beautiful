/**
 * The one requestAnimationFrame loop: advance the clock, derive snapshots, build the BrickFrame, render, and let the
 * UI update only what changed.
 */
import { allLoans, cartDollars } from '../engine';
import type { BrickInputs, LoanSnapshot } from '../engine';
import type { BrickFrame, BrickSceneAPI, HouseVisual } from '../types';
import type { Store } from './store';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
}

/**
 * Minimum time between rendered frames: 60 fps (with slack so 120 Hz displays land on every 2nd refresh).
 * The crew's arms and the drifting petals need 60 to read smoothly.
 */
const FRAME_MS = 1000 / 60 - 2;

/** In reduced motion the scene keeps being drawn for this long after anything changes, so it can settle. */
const SETTLE_MS = 1500;

/**
 * One house's scene state from its snapshot: how much is built (the principal paid, as a share of the amount; the
 * same amount on both plots, so the same `built` looks the same), the carts of interest gone to the lender, and the
 * share of this month's barrow load that goes into the cart.
 */
export function houseVisual(snap: LoanSnapshot, inputs: BrickInputs): HouseVisual {
  const per = cartDollars(inputs);
  return {
    id: snap.id,
    built: snap.built,
    carts: per > 0 ? snap.interestPaid / per : 0,
    split: snap.paidOff || !(snap.payment > 0) ? 0 : Math.max(0, Math.min(1, snap.interest / snap.payment)),
    paidOff: snap.paidOff,
  };
}

export function startLoop(store: Store, scene: BrickSceneAPI, ui: UI): Loop {
  const { state } = store;
  let raf = 0;
  let last = performance.now();
  let dirty = true;
  let lastMonths = NaN;
  let lastInputs: unknown = null;
  let running = true;
  let settleUntil = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Motion is capped at 60 fps: skip display refreshes until a 60 fps frame is due. The clock advances by the real
    // elapsed time, so playback speed is unchanged.
    if (now - last < FRAME_MS) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const { inputs, months } = state;
    const snaps = allLoans(inputs, months);

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

    const f: BrickFrame = {
      timeMs: now,
      monthsPerSecond: state.playing ? state.monthsPerSecond : 0,
      speed: state.playing ? state.speed : 1,
      houses: [houseVisual(snaps[0], inputs), houseVisual(snaps[1], inputs)],
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
