/**
 * The one requestAnimationFrame loop: advance the clocks, derive snapshots,
 * build the SceneFrame, render, and let the UI update only what changed.
 */
import { maturityFor, snapshotAt } from '../engine';
import type { TreeId, TreeSnapshot } from '../engine';
import type { SceneAPI, SceneFrame, TreeVisualState } from '../scene/types';
import type { Store } from './store';
import { loupeAt } from './story';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
}

function treeState(
  id: TreeId,
  snap: TreeSnapshot,
  startAge: number,
  displayScale: number,
  pulse: number,
): TreeVisualState {
  return {
    id,
    planted: snap.planted,
    maturity: snap.planted ? maturityFor(snap.balance, displayScale) : 0,
    monthsSincePlanting: snap.monthsElapsed,
    pulse: snap.planted ? pulse : -1,
    startAge,
  };
}

export function startLoop(store: Store, scene: SceneAPI, ui: UI): Loop {
  const { state } = store;
  let raf = 0;
  let last = performance.now();
  let dirty = true;
  let lastAge = NaN;
  let lastScale = NaN;
  let lastScenario: unknown = null;
  let lastLoupe = '';
  let running = true;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    store.tick(dt);

    const sc = state.scenario;
    const age = state.ageMonths;
    const smoothA = snapshotAt(sc.a, age, 'smooth');
    const smoothB = snapshotAt(sc.b, age, 'smooth');
    const exact = { a: snapshotAt(sc.a, age, 'exact'), b: snapshotAt(sc.b, age, 'exact') };

    // Numbers and labels (DOM touched only when displayed values change).
    ui.update(exact);

    const motion = !state.reducedMotion;
    const loupe =
      state.mode === 'story' ? loupeAt(state.storyTime, state.inputs, state.reducedMotion) : undefined;
    const loupeKey = loupe ? loupe.strength + loupe.target : '';
    if (!motion && !dirty && age === lastAge && state.displayScale === lastScale && sc === lastScenario && loupeKey === lastLoupe) return;
    lastLoupe = loupeKey;
    lastAge = age;
    lastScale = state.displayScale;
    lastScenario = sc;
    dirty = false;

    const pulsing = state.playing && motion && sc.inputs.monthlyContribution > 0;
    const pulse = pulsing ? (age / 12) % 1 : -1;
    const f: SceneFrame = {
      timeMs: now,
      trees: [
        treeState('A', smoothA, sc.inputs.startAgeA, state.displayScale, pulse),
        treeState('B', smoothB, sc.inputs.startAgeB, state.displayScale, pulse),
      ],
      reducedMotion: state.reducedMotion,
      loupe,
    };
    scene.render(f);
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
