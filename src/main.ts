import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import './styles/main.css';

import { createScene } from './scene';
import { createStore } from './app/store';
import { createUI } from './app/ui';
import { startLoop } from './app/loop';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore({ reducedMotion: motionQuery.matches });
const scene = createScene(canvas);

const ui = createUI(store, {
  setInsets: (i) => {
    if ('setInsets' in scene) scene.setInsets(i);
  },
  getBases: () => ({
    A: scene.anchorsFor('A', 0).base,
    B: scene.anchorsFor('B', 0).base,
  }),
});
const loop = startLoop(store, scene, ui);

// Size the canvas to its container.
const fit = () => {
  const w = Math.max(1, Math.round(stage.clientWidth));
  const h = Math.max(1, Math.round(stage.clientHeight));
  scene.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  ui.setStageSize(w, h);
  loop.invalidate();
};
new ResizeObserver(fit).observe(stage);
fit();

motionQuery.addEventListener('change', (e) => store.actions.setReducedMotion(e.matches));

// Story autoplays once the scene is ready (never in reduced motion, and never over a user's first touch).
scene.ready.then(() => {
  document.body.dataset.ready = '1';
  const { state, actions } = store;
  if (!state.reducedMotion && state.mode === 'story' && state.storyTime === 0 && !state.playing) actions.play();
});

// Test hook: a read-only snapshot plus the action functions.
declare global {
  interface Window {
    __ttg: {
      getState(): unknown;
      actions: typeof store.actions;
      anchors(id: 'A' | 'B', maturity: number): ReturnType<typeof scene.anchorsFor>;
    };
  }
}
window.__ttg = {
  getState() {
    const { state } = store;
    return JSON.parse(
      JSON.stringify({
        inputs: state.inputs,
        draft: state.draft,
        errors: state.errors,
        targetScale: state.targetScale,
        displayScale: state.displayScale,
        ageMonths: state.ageMonths,
        mode: state.mode,
        storyTime: state.storyTime,
        playing: state.playing,
        speed: state.speed,
        reducedMotion: state.reducedMotion,
        exploreHint: state.exploreHint,
        timelineStartMonths: state.scenario.timelineStartMonths,
        timelineEndMonths: state.scenario.timelineEndMonths,
        monthlyRate: state.scenario.monthlyRate,
      }),
    );
  },
  actions: store.actions,
  anchors: (id, maturity) => scene.anchorsFor(id, maturity),
};
