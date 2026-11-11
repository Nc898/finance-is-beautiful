/** Harness for the grocer and the basket in the shop: the month (the board's target), the basket's quantities, play
 *  and pause, 1x and 5x, scrubbing (the slider), reduced motion. Not part of the build. `window.__grocerTest` lets a
 *  capture script drive it. */
import { createBreadScene } from './bread/scene/index';
import { monthRow, statementMonth } from './bread/engine';
import { boardFor } from './bread/app/text';
import { LAST_MONTH, PLAY_RATE } from './bread/app/store';
import type { BasketInputs, BreadFrame, ItemKey } from './bread/types';
import { BASKET_LIMITS, DEFAULT_BASKET, ITEM_KEYS } from './bread/types';

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const scene = createBreadScene(canvas);
const monthEl = document.getElementById('month') as HTMLInputElement;
monthEl.max = String(LAST_MONTH);
const mo = document.getElementById('mo')!;
const reduced = document.getElementById('reduced') as HTMLInputElement;
const dbg = document.getElementById('dbg')!;

const st = {
  month: 0,
  playing: false,
  speed: 1,
  scrubbed: true,
  basket: { qty: { ...DEFAULT_BASKET.qty } } as BasketInputs,
  /** a fixed clock for captures: when set, each frame advances this many ms instead of the wall clock */
  manual: false,
  t: 0,
};

const setup = () => {
  const r = window.visualViewport;
  const w = Math.round(r?.width ?? innerWidth);
  const h = Math.round(r?.height ?? innerHeight);
  scene.setInsets({ top: 70, bottom: 150 });
  scene.resize(w, h, Math.min(2, devicePixelRatio || 1));
};
setup();
addEventListener('resize', setup);

monthEl.addEventListener('input', () => {
  st.month = +monthEl.value;
  st.playing = false;
  st.scrubbed = true;
});
document.getElementById('play')!.addEventListener('click', () => (st.playing = !st.playing));
document.getElementById('s1')!.addEventListener('click', () => (st.speed = 1));
document.getElementById('s5')!.addEventListener('click', () => (st.speed = 5));
document.getElementById('hide')!.addEventListener('click', () => document.getElementById('ui')!.classList.add('hidden'));
const qtyEl = document.getElementById('qty')!;
const setQty = (k: ItemKey, v: number) => {
  st.basket = { qty: { ...st.basket.qty, [k]: Math.max(0, Math.min(BASKET_LIMITS[k].max, v)) } };
  render();
};
const render = () => {
  qtyEl.innerHTML = '';
  for (const k of ITEM_KEYS) {
    const row = document.createElement('div');
    row.className = 'q';
    row.innerHTML = `<span>${k}</span><button>-</button><span>${st.basket.qty[k]}</span><button>+</button>`;
    const [minus, plus] = row.querySelectorAll('button');
    minus!.addEventListener('click', () => setQty(k, st.basket.qty[k] - 1));
    plus!.addEventListener('click', () => setQty(k, st.basket.qty[k] + 1));
    qtyEl.appendChild(row);
  }
};
render();

let last = -1;
/** one frame of the harness at clock `now` (ms) */
const frame = (now: number) => {
  const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st.playing) {
    st.month = Math.min(LAST_MONTH, st.month + PLAY_RATE * st.speed * dt);
    if (st.month >= LAST_MONTH) st.playing = false;
  }
  const sm = statementMonth(st.month);
  const row = monthRow(st.basket, sm);
  monthEl.value = String(st.month);
  mo.textContent = `${sm} (${row.shortLabel})`;
  document.getElementById('sp')!.textContent = ` ${st.speed}x ${st.playing ? 'playing' : 'paused'}`;
  const f: BreadFrame = {
    timeMs: now,
    monthsPerSecond: st.playing ? PLAY_RATE * st.speed : 0,
    speed: st.playing ? st.speed : 1,
    month: st.month,
    statementMonth: sm,
    board: boardFor(row),
    basket: st.basket,
    scrubbed: st.scrubbed,
    reducedMotion: reduced.checked,
  };
  st.scrubbed = false;
  scene.render(f);
};

const dbgOf = () => (window as unknown as { __grocer?: { debug: Record<string, unknown> } }).__grocer?.debug;
const loop = (ms: number) => {
  if (!st.manual) frame(ms);
  const d = dbgOf();
  if (d) dbg.textContent = JSON.stringify(d, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v), 1);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

(window as unknown as { __grocerTest: unknown }).__grocerTest = {
  st,
  setQty,
  scrub(m: number) {
    st.month = m;
    st.playing = false;
    st.scrubbed = true;
  },
  /** take the clock over: render n frames of `ms` each, now; returns the worst contact and reach errors seen */
  advance(n: number, ms = 1000 / 60) {
    if (!st.manual) {
      st.manual = true;
      st.t = performance.now();
    }
    let worst = { chalk: 0, cloth: 0, reach: 0, phases: [] as string[] };
    for (let i = 0; i < n; i++) {
      st.t += ms;
      frame(st.t);
      const d = dbgOf() as { chalkErr: number; clothErr: number; reach: [number, number]; phase: string } | undefined;
      if (d) {
        worst.chalk = Math.max(worst.chalk, d.chalkErr);
        worst.cloth = Math.max(worst.cloth, d.clothErr);
        worst.reach = Math.max(worst.reach, d.reach[0], d.reach[1]);
        if (worst.phases[worst.phases.length - 1] !== d.phase) worst.phases.push(d.phase);
      }
    }
    return worst;
  },
  debug: dbgOf,
};
