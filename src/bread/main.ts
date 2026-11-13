import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import '../styles/bread.css';
import '../styles/intro.css';

import { createStore } from './app/store';
import { createUI } from './app/ui';
import { startLoop } from './app/loop';
import { snapshot } from './engine';
import { createStandInScene } from './app/standInScene';
import { setupIntro } from '../shared/intro';
import type { BreadSceneAPI } from './types';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

/**
 * The shop (./scene/index.ts, createBreadScene) when it exists; until it does, the plain stand-in keeps the page
 * working. (A glob, so the page builds either way and picks the shop up as soon as the file is there.)
 */
async function loadScene(): Promise<BreadSceneAPI> {
  const found = import.meta.glob<{ createBreadScene: (c: HTMLCanvasElement) => BreadSceneAPI }>('./scene/index.ts');
  const load = found['./scene/index.ts'];
  if (load) return (await load()).createBreadScene(canvas);
  return createStandInScene(canvas);
}

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore({ reducedMotion: motionQuery.matches });

void loadScene().then((scene) => {
  const ui = createUI(store, {
    labelAnchor: (id) => scene.labelAnchor(id),
    setInsets: (i) => scene.setInsets(i),
  });
  const loop = startLoop(store, scene, ui);
  // Fill the labels before the first measure: the scene's bottom band is sized from them, and a build started while
  // they were still empty was thrown away and painted again once they filled (about 1.5 s lost on every load).
  ui.update(snapshot(store.state.basket, store.state.month));

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

  // The page waits at January 1980, paused. The introduction (the first time this session) explains it over the
  // blurred scene; closing it points the eye at the controls.
  scene.ready.then(whenSmooth).then(() => {
    document.body.dataset.ready = '1';
    setupIntro({
      slug: 'bread-and-butter',
      dialog: document.getElementById('intro') as HTMLDialogElement,
      openButton: document.getElementById('btn-about'),
      onClose: () => ui.highlight(),
    });
  });

  // Test hook: a read-only snapshot, the action functions and the frame last given to the scene.
  window.__bread = {
    getState() {
      const { state } = store;
      return JSON.parse(
        JSON.stringify({
          basket: state.basket,
          draft: state.draft,
          errors: state.errors,
          month: state.month,
          playing: state.playing,
          speed: state.speed,
          reducedMotion: state.reducedMotion,
          monthsPerSecond: state.monthsPerSecond,
        }),
      );
    },
    actions: store.actions,
    frame: () => loop.lastFrame(),
    anchors: () => ({ basket: scene.labelAnchor('basket'), pay: scene.labelAnchor('pay'), minutes: scene.labelAnchor('minutes') }),
  };
});

declare global {
  interface Window {
    __bread: {
      getState(): unknown;
      actions: typeof store.actions;
      frame(): ReturnType<ReturnType<typeof startLoop>['lastFrame']>;
      anchors(): Record<string, { x: number; y: number }>;
    };
  }
}
