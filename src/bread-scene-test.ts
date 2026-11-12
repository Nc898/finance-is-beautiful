/** Harness for the shop scene alone, driving the split-flap price board with the real engine's months: a month slider,
 *  play at 1x (2 months/s) or 5x, scrub, reduced motion, a stepped clock for frame captures (window.__h.step), and a
 *  button that retargets one figure mid-flip. Not part of the build. */
import { createBreadScene } from './bread/scene/index';
import type { BoardContent, BreadFrame } from './bread/types';
import { DEFAULT_BASKET } from './bread/types';
import { monthCount, monthRow } from './bread/engine';
import { boardFor } from './bread/app/text';
import type { Board } from './bread/scene/partsApi';

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const scene = createBreadScene(canvas);
const month = document.getElementById('month') as HTMLInputElement;
const mo = document.getElementById('mo')!;
const reduced = document.getElementById('reduced') as HTMLInputElement;
const speedSel = document.getElementById('speed') as HTMLSelectElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const dev = (): { board: Board & { pending(): number; ages(): number[] }; manual: boolean } => (window as unknown as { __breadScene: { board: Board & { pending(): number; ages(): number[] }; manual: boolean } }).__breadScene;

month.max = String(monthCount() - 1);
const MPS = 2; // months per second at 1x: a year every 6 s

const setup = () => {
  const r = window.visualViewport;
  scene.setInsets({ top: 70, bottom: 150 });
  scene.resize(Math.round(r?.width ?? innerWidth), Math.round(r?.height ?? innerHeight), Math.min(2, devicePixelRatio || 1));
};
setup();
addEventListener('resize', setup);

let m = 0;
let playing = false;
let scrubbed = true;
let clock = 0;
let stepped = false;
/** an override of one figure (retarget test): replaces the bread price until cleared */
let override: string | null = null;

const content = (): BoardContent => {
  const c = boardFor(monthRow(DEFAULT_BASKET, Math.floor(m)));
  if (override) c.prices.bread = override;
  return c;
};

const frame = (dt: number): void => {
  clock += dt * 1000;
  const speed = +speedSel.value;
  if (playing && !reduced.checked) {
    m = Math.min(monthCount() - 1, m + MPS * speed * dt);
    month.value = String(Math.floor(m));
    if (m >= monthCount() - 1) playing = false;
  } else if (!playing) m = +month.value;
  mo.textContent = `${Math.floor(m)} ${monthRow(DEFAULT_BASKET, Math.floor(m)).shortLabel}`;
  playBtn.textContent = playing ? 'pause' : 'play';
  const f: BreadFrame = {
    timeMs: clock,
    monthsPerSecond: playing ? MPS * speed : 0,
    speed: playing ? speed : 1,
    month: m,
    statementMonth: Math.floor(m),
    board: content(),
    basket: DEFAULT_BASKET,
    scrubbed,
    reducedMotion: reduced.checked,
  };
  scrubbed = false;
  scene.render(f);
};

month.addEventListener('input', () => {
  playing = false;
  m = +month.value;
  scrubbed = true;
});
playBtn.addEventListener('click', () => (playing = !playing));
document.getElementById('hide')!.addEventListener('click', () => document.getElementById('ui')!.classList.add('hidden'));
document.getElementById('retarget')!.addEventListener('click', () => {
  // change the bread price now, and again 0.12 s later, to a figure the cells have just passed
  const was = dev().board.shown().prices.bread;
  override = was === '$3.47' ? '$0.58' : '$3.47';
  setTimeout(() => (override = '$1.29'), 120);
  setTimeout(() => (override = null), 900);
});

const h = {
  /** go to a month at once (a scrub) */
  jump(to: number) {
    m = to;
    month.value = String(to);
    playing = false;
    scrubbed = true;
  },
  play(speed: number) {
    speedSel.value = String(speed);
    playing = true;
  },
  pause() {
    playing = false;
  },
  setOverride(s: string | null) {
    override = s;
  },
  setReduced(on: boolean) {
    reduced.checked = on;
  },
  /** stepped clock: stop the rAF loop and advance by dtMs per call */
  step(dtMs = 1000 / 60) {
    stepped = true;
    frame(dtMs / 1000);
  },
  month: () => m,
  shown: () => dev().board.shown(),
  pending: () => dev().board.pending(),
  ages: () => dev().board.ages(),
  target: () => content(),
};
(window as unknown as { __h: typeof h }).__h = h;

let lastMs = -1;
const loop = (ms: number) => {
  if (!stepped) {
    frame(lastMs < 0 ? 0 : Math.min(0.1, (ms - lastMs) / 1000));
    lastMs = ms;
    requestAnimationFrame(loop);
  }
};
requestAnimationFrame(loop);
