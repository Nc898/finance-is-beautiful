import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import '../styles/river.css';
import '../styles/intro.css';

import { createRiverScene } from './scene';
import { createStore } from './app/store';
import { createUI } from './app/ui';
import { startLoop } from './app/loop';
import { allBoats, riverScale } from './engine';
import { setupIntro } from '../shared/intro';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore({ reducedMotion: motionQuery.matches });
const scene = createRiverScene(canvas);

const ui = createUI(store, {
  boatAnchor: (id) => scene.boatAnchor(id),
  postAnchor: (u) => scene.postAnchor(u),
  cameraTransform: () => ('cameraTransform' in scene && typeof scene.cameraTransform === 'function' ? scene.cameraTransform() : { a: 1, bx: 0, by: 0 }),
  postPlaque: () => ('postPlaque' in scene && typeof scene.postPlaque === 'function' ? scene.postPlaque() : { w: 90, h: 34 }),
  visibleU: () => scene.visibleU(),
  setInsets: (i) => scene.setInsets(i),
  setPosts: (us) => {
    if ('setPosts' in scene && typeof scene.setPosts === 'function') scene.setPosts(us);
  },
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

// The scene waits at its start, paused. The introduction (the first time this session) explains it over the
// blurred scene; closing it points the eye at the controls.
scene.ready.then(whenSmooth).then(() => {
  document.body.dataset.ready = '1';
  setupIntro({
    slug: 'against-the-current',
    dialog: document.getElementById('intro') as HTMLDialogElement,
    openButton: document.getElementById('btn-about'),
    onClose: () => ui.highlight(),
  });
});

// Test hook: a read-only snapshot plus the action functions.
declare global {
  interface Window {
    __river: {
      getState(): unknown;
      actions: typeof store.actions;
      boats(): ReturnType<typeof allBoats>;
      anchors(): Record<string, { x: number; y: number }>;
    };
  }
}
window.__river = {
  getState() {
    const { state } = store;
    return JSON.parse(
      JSON.stringify({
        inputs: state.inputs,
        draft: state.draft,
        errors: state.errors,
        targetScale: state.targetScale,
        displayScale: state.displayScale,
        scale: riverScale(state.inputs),
        years: state.years,
        playing: state.playing,
        speed: state.speed,
        reducedMotion: state.reducedMotion,
        yearsPerSecond: state.yearsPerSecond,
      }),
    );
  },
  actions: store.actions,
  boats: () => allBoats(store.state.inputs, store.state.years),
  anchors: () => ({
    cash: scene.boatAnchor('cash'),
    savings: scene.boatAnchor('savings'),
    invest: scene.boatAnchor('invest'),
  }),
};
