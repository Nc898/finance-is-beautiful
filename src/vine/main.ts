import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import '../styles/vine.css';

import { createVineScene } from './scene';
import { createStore } from './app/store';
import { createUI } from './app/ui';
import { startLoop } from './app/loop';
import { allPlans } from './engine';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore({ reducedMotion: motionQuery.matches });
const scene = createVineScene(canvas);

const ui = createUI(store, {
  labelAnchor: (id) => scene.labelAnchor(id),
  pileAnchor: (id) => scene.pileAnchor(id),
  setInsets: (i) => scene.setInsets(i),
});
const loop = startLoop(store, scene, ui);

// Size the canvas to its container.
let fitW = -1;
let fitH = -1;
const fit = () => {
  const w = Math.max(1, Math.round(stage.clientWidth));
  const h = Math.max(1, Math.round(stage.clientHeight));
  if (w === fitW && h === fitH) return;
  fitW = w;
  fitH = h;
  scene.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  ui.setStageSize(w, h);
  loop.invalidate();
};
// The observer only schedules the work for the next frame, so resizing never happens inside delivery.
let fitQueued = false;
new ResizeObserver(() => {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    fit();
  });
}).observe(stage);
fit();

motionQuery.addEventListener('change', (e) => store.actions.setReducedMotion(e.matches));

/** Resolve once frames are flowing smoothly (the first scene frames settle while only paper shows; capped at 700 ms). */
const whenSmooth = (): Promise<void> =>
  new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    let calm = 0;
    const step = (now: number) => {
      calm = now - last < 26 ? calm + 1 : 0;
      last = now;
      if (calm >= 3 || now - start > 700) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

// Story autoplays once the scene is ready (never in reduced motion, and never over a user's first touch).
scene.ready.then(whenSmooth).then(() => {
  document.body.dataset.ready = '1';
  const { state, actions } = store;
  if (!state.reducedMotion && state.mode === 'story' && state.storyTime === 0 && !state.playing) actions.play();
});

// Test hook: a read-only snapshot plus the action functions.
declare global {
  interface Window {
    __vine: {
      getState(): unknown;
      actions: typeof store.actions;
      plans(): ReturnType<typeof allPlans>;
      anchors(): Record<string, { x: number; y: number }>;
    };
  }
}
window.__vine = {
  getState() {
    const { state } = store;
    return JSON.parse(
      JSON.stringify({
        inputs: state.inputs,
        draft: state.draft,
        errors: state.errors,
        months: state.months,
        horizon: store.horizon(),
        mode: state.mode,
        storyTime: state.storyTime,
        playing: state.playing,
        speed: state.speed,
        reducedMotion: state.reducedMotion,
        exploreHint: state.exploreHint,
        monthsPerSecond: state.monthsPerSecond,
        storyLength: store.storyLength(),
      }),
    );
  },
  actions: store.actions,
  plans: () => allPlans(store.state.inputs, store.state.months),
  anchors: () => ({
    labelMinimum: scene.labelAnchor('minimum'),
    labelFixed: scene.labelAnchor('fixed'),
    pileMinimum: scene.pileAnchor('minimum'),
    pileFixed: scene.pileAnchor('fixed'),
  }),
};
