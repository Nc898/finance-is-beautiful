/** Harness for the shop scene alone: a month slider with default board text, reduced motion, and a button that wipes and
 *  writes the bread line over a second each so the chalk can be watched. Not part of the build. */
import { createBreadScene } from './bread/scene/index';
import type { BoardContent, BreadFrame } from './bread/types';
import { DEFAULT_BASKET } from './bread/types';

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const scene = createBreadScene(canvas);
const month = document.getElementById('month') as HTMLInputElement;
const mo = document.getElementById('mo')!;
const reduced = document.getElementById('reduced') as HTMLInputElement;

const BOARDS: [number, BoardContent][] = [
  [0, { year: '1980', prices: { bread: '$0.51', eggs: '$0.84', coffee: '$3.22', bananas: '$0.29', chicken: '$0.75', flour: '$0.25' }, total: '$9.16' }],
  [240, { year: '2000', prices: { bread: '$0.99', eggs: '$0.96', coffee: '$3.40', bananas: '$0.50', chicken: '$1.05', flour: '$0.30' }, total: '$12.41' }],
  [510, { year: '2022', prices: { bread: '$1.79', eggs: '$2.67', coffee: '$5.41', bananas: '$0.66', chicken: '$1.97', flour: '~$0.80' }, total: '$26.15' }],
];
const boardFor = (m: number): BoardContent => [...BOARDS].reverse().find(([k]) => m >= k)![1];

const setup = () => {
  const r = window.visualViewport;
  const w = Math.round(r?.width ?? innerWidth);
  const h = Math.round(r?.height ?? innerHeight);
  scene.setInsets({ top: 70, bottom: 150 });
  scene.resize(w, h, Math.min(2, devicePixelRatio || 1));
};
setup();
addEventListener('resize', setup);

let scrubbed = true;
month.addEventListener('input', () => (scrubbed = true));
const hide = document.getElementById('hide')!;
hide.addEventListener('click', () => document.getElementById('ui')!.classList.add('hidden'));

document.getElementById('write')!.addEventListener('click', () => {
  const dev = (window as unknown as { __breadScene: { board: import('./bread/scene/partsApi').Board; manual: boolean } }).__breadScene;
  dev.manual = true;
  const t0 = performance.now();
  const old = dev.board.shown().prices.bread;
  const next = old === '$3.47' ? '$0.51' : '$3.47';
  const step = () => {
    const t = (performance.now() - t0) / 2000;
    if (t < 0.5) dev.board.wipe('bread', Math.min(1, t * 2));
    else {
      dev.board.wipe('bread', 1);
      dev.board.write('bread', next, Math.min(1, (t - 0.5) * 2));
    }
    if (t < 1) requestAnimationFrame(step);
    else dev.manual = false;
  };
  step();
});

const loop = (ms: number) => {
  const m = +month.value;
  mo.textContent = String(m);
  const f: BreadFrame = {
    timeMs: ms,
    monthsPerSecond: 0,
    speed: 1,
    month: m,
    statementMonth: m,
    board: boardFor(m),
    basket: DEFAULT_BASKET,
    scrubbed,
    reducedMotion: reduced.checked,
  };
  scrubbed = false;
  scene.render(f);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
