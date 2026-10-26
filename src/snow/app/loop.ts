/**
 * The one requestAnimationFrame loop: advance the clocks, derive snapshots,
 * build the SnowFrame, render, and let the UI update only what changed.
 */
import { DEBTS, allStrategies, largestStart, strategySchedule } from '../engine';
import type { DebtId, SnowInputs, StrategyId, StrategySnapshot } from '../engine';
import type { BallVisual, HillVisual, SnowFrame, SnowSceneAPI } from '../types';
import type { Store } from './store';
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

const rollCache = new WeakMap<SnowInputs, Record<StrategyId, Record<DebtId, number>>>();

/**
 * The balance each debt rolls down its lane from (its place on the lane is 1 − balance / this). A debt that gets the
 * extra rolls from its balance at the start of the month it first gets it: it waits at the top until then, for the
 * climber to push it off. A debt its minimums alone pay off (it never gets the extra) rolls slowly down by itself
 * from the start, from its starting balance, and reaches the foot as it is cleared: no ball vanishes at the top.
 */
export function rollStarts(inputs: SnowInputs, id: StrategyId): Record<DebtId, number> {
  let hit = rollCache.get(inputs);
  if (!hit) {
    hit = {} as Record<StrategyId, Record<DebtId, number>>;
    rollCache.set(inputs, hit);
  }
  const have = hit[id];
  if (have) return have;
  const rows = strategySchedule(inputs, id).rows;
  const out: Record<DebtId, number> = { medical: 0, car: 0, card: 0 };
  for (const d of DEBTS) {
    out[d] = inputs.debts[d].balance;
    for (let i = 0; i < rows.length; i++) {
      const start = i === 0 ? inputs.debts[d].balance : rows[i - 1]!.debts[d].balance;
      if (start <= 0.005) break;
      const row = rows[i]!.debts[d];
      const due = Math.min(inputs.debts[d].minPayment, start + row.interest);
      if (row.payment > due + 1e-6) {
        out[d] = start;
        break;
      }
    }
  }
  hit[id] = out;
  return out;
}

/**
 * One hill's scene state from its snapshot. Sizes are fractions of the LARGEST starting balance, so the same debt
 * looks the same on both hills at the same balance and the comparison stays honest. A ball waits at the top until it
 * first gets the extra, then rolls down its lane as that balance is paid off (see BallVisual.progress).
 */
export function hillVisual(snap: StrategySnapshot, inputs: SnowInputs): HillVisual {
  const scale = largestStart(inputs);
  const rolls = rollStarts(inputs, snap.id);
  const queue = strategySchedule(inputs, snap.id).order.filter((d) => !snap.debts[d].paidOff);
  const ball = (id: (typeof DEBTS)[number]): BallVisual => {
    const d = snap.debts[id];
    const from = rolls[id];
    return {
      id,
      size: Math.max(0, d.balance / scale),
      progress: Math.max(0, Math.min(1, 1 - d.balance / from)),
      queue: queue.indexOf(id),
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
  let running = true;
  let settleUntil = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Motion is capped at 60 fps: skip display refreshes until a 60 fps frame is due. The clock advances by
    // the real elapsed time, so playback speed is unchanged.
    if (now - last < FRAME_MS) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const { inputs, months } = state;
    const snaps = allStrategies(inputs, months);

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

    const f: SnowFrame = {
      timeMs: now,
      monthsPerSecond: state.playing ? state.monthsPerSecond : 0,
      speed: state.playing ? state.speed : 1,
      hills: [hillVisual(snaps[0], inputs), hillVisual(snaps[1], inputs)],
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
