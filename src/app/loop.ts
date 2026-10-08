/**
 * The one requestAnimationFrame loop: advance the clocks, derive snapshots,
 * build the SceneFrame, render, and let the UI update only what changed.
 */
import { maturityFor, snapshotAt } from '../engine';
import type { TreeId, TreeSnapshot } from '../engine';
import type { SceneAPI, SceneFrame, TreeVisualState } from '../scene/types';
import type { Store } from './store';
import { loupeAt, storyCamera } from './story';
import type { UI } from './ui';

export interface Loop {
  stop(): void;
  /** Force a render on the next frame (e.g. after a resize while idle in reduced motion). */
  invalidate(): void;
}

/** Minimum time between rendered frames: 30 fps, with a little slack so 60/120 Hz displays land every 2nd/4th refresh. */
const FRAME_MS = 1000 / 30 - 4;

function treeState(
  id: TreeId,
  snap: TreeSnapshot,
  exact: TreeSnapshot,
  contribution: number,
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
    bills: exact.planted && contribution > 0 ? Math.floor(exact.contributionsMade / 12) : 0,
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
  let camZoom = 1;
  let camInit = false;
  let camFocus = { x: 0, y: 0 };
  let lastFade = -1;
  let camTree: 'A' | 'B' = 'A';

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Motion is capped at 30 fps: skip display refreshes until a 30 fps frame is due. The clock advances by
    // the real elapsed time, so playback speed and story length are unchanged.
    if (now - last < FRAME_MS) return;
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

    // Opening camera move (story only). Eased, so leaving the story mid-zoom glides back to the full view;
    // the first frame starts already close in.
    const camTarget = state.mode === 'story' ? storyCamera(state.storyTime, state.inputs, state.reducedMotion) : undefined;
    const tz = camTarget?.zoom ?? 1;
    if (camTarget) camFocus = camTarget.focus;
    camZoom = camInit && motion ? camZoom + (tz - camZoom) * (1 - Math.exp(-dt / 0.35)) : tz;
    camInit = true;
    if (Math.abs(camZoom - 1) < 0.002) camZoom = 1;
    // the other labels wait out the close-up and fade back in as the camera settles
    const fade = Math.max(0, Math.min(1, (1.35 - camZoom) / 0.35));
    if (Math.abs(fade - lastFade) > 0.01 || (fade === 1 && lastFade !== 1)) {
      document.documentElement.style.setProperty('--label-fade', fade.toFixed(3));
      lastFade = fade;
    }
    if (camTarget) camTree = camTarget.tree;

    const pulsing = state.playing && motion && sc.inputs.monthlyContribution > 0;
    const pulse = pulsing ? (age / 12) % 1 : -1;
    const f: SceneFrame = {
      timeMs: now,
      trees: [
        treeState('A', smoothA, exact.a, sc.inputs.monthlyContribution, sc.inputs.startAgeA, state.displayScale, pulse),
        treeState('B', smoothB, exact.b, sc.inputs.monthlyContribution, sc.inputs.startAgeB, state.displayScale, pulse),
      ],
      reducedMotion: state.reducedMotion,
      loupe,
      camera: camZoom > 1 ? { zoom: camZoom, focus: camFocus } : undefined,
    };
    scene.render(f);

    // the zoomed tree's label rides along with the camera, so its money is readable from the first month
    const T = scene.cameraTransform();
    for (const id of ['A', 'B'] as const) {
      const el = document.getElementById(`plate-${id}`);
      if (!el) continue;
      // follow only during the opening's own camera move; after a skip or scrub the label fades back in
      // with the others while the camera glides out
      const follow = !!camTarget && camZoom > 1 && id === camTree;
      el.classList.toggle('cam-follow', follow);
      if (follow) {
        const b = scene.anchorsFor(id, 0).base;
        el.style.translate = `${Math.round(b.x * (T.a - 1) + T.bx)}px ${Math.round(b.y * (T.a - 1) + T.by)}px`;
      } else if (el.style.translate) el.style.translate = '';
    }
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
