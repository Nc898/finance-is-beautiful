import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import '../styles/wood.css';
import '../styles/intro.css';

import { createWoodScene } from './scene';
import { createStore } from './app/store';
import { createUI } from './app/ui';
import { startLoop } from './app/loop';
import { allFunds } from './engine';
import { setupIntro } from '../shared/intro';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore({ reducedMotion: motionQuery.matches });
const scene = createWoodScene(canvas);

const ui = createUI(store, {
  labelAnchor: (id) => scene.labelAnchor(id),
  setInsets: (i) => scene.setInsets(i),
});
const loop = startLoop(store, scene, ui);

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

scene.ready.then(whenSmooth).then(() => {
  document.body.dataset.ready = '1';
  setupIntro({
    slug: 'a-little-off-the-top',
    dialog: document.getElementById('intro') as HTMLDialogElement,
    openButton: document.getElementById('btn-about'),
    onClose: () => ui.highlight(),
  });
});

// Test hook: a read-only snapshot plus the action functions.
declare global {
  interface Window {
    __wood: {
      getState(): unknown;
      actions: typeof store.actions;
      funds(): ReturnType<typeof allFunds>;
      anchors(): Record<string, { x: number; y: number }>;
    };
  }
}
window.__wood = {
  getState() {
    const { state } = store;
    return JSON.parse(
      JSON.stringify({
        inputs: state.inputs,
        draft: state.draft,
        errors: state.errors,
        months: state.months,
        horizon: store.horizon(),
        playing: state.playing,
        speed: state.speed,
        reducedMotion: state.reducedMotion,
      }),
    );
  },
  actions: store.actions,
  funds: () => allFunds(store.state.inputs, store.state.months),
  anchors: () => ({ labelA: scene.labelAnchor('a'), labelB: scene.labelAnchor('b') }),
};
