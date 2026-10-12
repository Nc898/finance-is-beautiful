/** Harness for the Against the Current river scene: sliders, presets, perf measurement, scripted time. */
import { createRiverScene } from './river/scene';
import type { BoatId, RiverFrame } from './river/types';

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const insetsTop = Number(params.get('top') ?? 90);
const insetsBottom = Number(params.get('bottom') ?? 70);
const scene = createRiverScene(canvas);

interface St {
  u: Record<BoatId, number>;
  effort: Record<BoatId, number>;
  current: number;
  flowing: boolean;
  reduced: boolean;
  zoom: number;
  focusU: number;
  /** speed through the water per unit effort, u per second */
  wsK: number;
}
const st: St = {
  u: { cash: 0, savings: 0, invest: 0 },
  effort: { cash: 0, savings: 0.35, invest: 1 },
  current: 0.03,
  flowing: true,
  reduced: false,
  zoom: 1,
  focusU: 0,
  wsK: 0.1,
};

const PRESETS: Record<string, Partial<St> & { u?: Record<BoatId, number> }> = {
  dock: { u: { cash: 0, savings: 0, invest: 0 }, flowing: false, zoom: 3, focusU: 0 },
  mid: { u: { cash: -0.4, savings: -0.15, invest: 0.35 }, flowing: true, current: 0.03, zoom: 1 },
  end: { u: { cash: -1, savings: -0.33, invest: 0.97 }, flowing: true, current: 0.03, zoom: 1 },
  infl: { u: { cash: -1, savings: -0.6, invest: 0.45 }, flowing: true, current: 0.1, zoom: 1 },
};
const apply = (p: string) => {
  const pr = PRESETS[p]!;
  if (pr.u) Object.assign(st.u, pr.u);
  for (const k of ['flowing', 'zoom', 'focusU', 'current'] as const) if (pr[k] !== undefined) (st as unknown as Record<string, unknown>)[k] = pr[k];
  syncUi();
};

const sl = document.getElementById('sl')!;
const sliders: Array<{ id: string; label: string; min: number; max: number; step: number; get: () => number; set: (v: number) => void }> = [];
const add = (id: string, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) => sliders.push({ id, label, min, max, step, get, set });
for (const b of ['cash', 'savings', 'invest'] as BoatId[]) {
  add(`u-${b}`, `${b} u`, -1.1, 1.1, 0.01, () => st.u[b], (v) => (st.u[b] = v));
  add(`e-${b}`, `${b} effort`, 0, 1, 0.01, () => st.effort[b], (v) => (st.effort[b] = v));
}
add('cur', 'current (inflation)', 0, 0.12, 0.001, () => st.current, (v) => (st.current = v));
add('zoom', 'camera zoom', 1, 4, 0.01, () => st.zoom, (v) => (st.zoom = v));
add('focus', 'focus u', -1, 1, 0.01, () => st.focusU, (v) => (st.focusU = v));
for (const s of sliders) {
  const l = document.createElement('label');
  l.innerHTML = `${s.label} <output></output><input id="${s.id}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" />`;
  sl.appendChild(l);
  const inp = l.querySelector('input')!;
  inp.addEventListener('input', () => {
    s.set(Number(inp.value));
    syncUi();
  });
}
const flowing = document.getElementById('flowing') as HTMLInputElement;
const reduced = document.getElementById('reduced') as HTMLInputElement;
flowing.addEventListener('change', () => (st.flowing = flowing.checked));
reduced.addEventListener('change', () => (st.reduced = reduced.checked));
document.querySelectorAll<HTMLButtonElement>('button[data-p]').forEach((b) => b.addEventListener('click', () => apply(b.dataset.p!)));
function syncUi() {
  for (const s of sliders) {
    const inp = document.getElementById(s.id) as HTMLInputElement;
    inp.value = String(s.get());
    (inp.previousElementSibling as HTMLOutputElement).textContent = s.get().toFixed(2);
  }
  flowing.checked = st.flowing;
  reduced.checked = st.reduced;
}
syncUi();

// anchors (DOM labels) to verify boatAnchor / postAnchor
const anchors = document.getElementById('anchors')!;
const mk = (cls: string) => {
  const d = document.createElement('div');
  d.className = 'anchor ' + cls;
  anchors.appendChild(d);
  return d;
};
const boatDivs: Record<BoatId, HTMLDivElement> = { cash: mk(''), savings: mk(''), invest: mk('') };
const postDivs = [-1, -0.5, 0, 0.5, 1].map((u) => ({ u, el: mk('post') }));
for (const b of ['cash', 'savings', 'invest'] as BoatId[]) boatDivs[b].textContent = b;
for (const p of postDivs) p.el.textContent = `post ${p.u}`;
let showAnchors = params.get('anchors') !== '0';

const frameNow = (t: number): RiverFrame => ({
  timeMs: t,
  current: st.current,
  flowing: st.flowing,
  reducedMotion: st.reduced,
  camera: st.zoom > 1.0005 ? { zoom: st.zoom, focusU: st.focusU } : undefined,
  boats: (['invest', 'savings', 'cash'] as BoatId[]).map((id) => ({
    id,
    u: st.u[id],
    effort: st.effort[id],
    waterSpeed: st.flowing ? st.effort[id] * st.wsK : 0,
  })) as unknown as RiverFrame['boats'],
});

let auto = true;
let simT = 0;
const draw = (t: number) => {
  const f = frameNow(t);
  scene.render(f);
  for (const b of ['cash', 'savings', 'invest'] as BoatId[]) {
    const a = scene.boatAnchor(b);
    boatDivs[b].style.display = showAnchors ? '' : 'none';
    boatDivs[b].style.left = a.x + 'px';
    boatDivs[b].style.top = a.y + 'px';
  }
  for (const p of postDivs) {
    const a = scene.postAnchor(p.u);
    p.el.style.display = showAnchors && st.zoom < 1.01 ? '' : 'none';
    p.el.style.left = a.x + 'px';
    p.el.style.top = a.y + 'px';
  }
};

const layout = () => {
  scene.setInsets({ top: insetsTop, bottom: insetsBottom, side: Number(params.get('side') ?? 0) });
  scene.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
};
layout();
window.addEventListener('resize', layout);

const stat = document.getElementById('stat')!;
let lastMs = 0;
const loop = (now: number) => {
  requestAnimationFrame(loop);
  if (!auto) return;
  const t0 = performance.now();
  draw(now);
  lastMs = lastMs * 0.9 + (performance.now() - t0) * 0.1;
  stat.textContent = `render ${lastMs.toFixed(2)} ms (avg)`;
};

interface Hooks {
  api: typeof scene;
  st: St;
  apply: (p: string) => void;
  set: (o: Partial<Omit<St, 'u' | 'effort'>> & { u?: Partial<Record<BoatId, number>>; effort?: Partial<Record<BoatId, number>> }) => void;
  setAuto: (v: boolean) => void;
  hideUi: () => void;
  anchors: (v: boolean) => void;
  /** render frames from the scripted clock forward by ms at dt steps (for screenshots) */
  advance: (ms: number, dt?: number) => void;
  perf: (n?: number) => { avg: number; cpuAvg: number; max: number; p95: number };
  layout: () => void;
}
const hooks: Hooks = {
  api: scene,
  st,
  apply,
  set: (o) => {
    if (o.u) Object.assign(st.u, o.u);
    if (o.effort) Object.assign(st.effort, o.effort);
    for (const k of ['current', 'flowing', 'reduced', 'zoom', 'focusU', 'wsK'] as const) if (o[k] !== undefined) (st as unknown as Record<string, unknown>)[k] = o[k];
    syncUi();
  },
  setAuto: (v) => (auto = v),
  hideUi: () => document.getElementById('ui')!.classList.add('hidden'),
  anchors: (v) => (showAnchors = v),
  advance: (ms, dt = 33.3) => {
    for (let t = 0; t < ms; t += dt) {
      simT += dt;
      draw(simT);
    }
  },
  perf: (n = 200) => {
    const was = auto;
    auto = false;
    const times: number[] = [];
    const T0 = performance.now();
    for (let i = 0; i < n; i++) {
      simT += 33.3;
      const t0 = performance.now();
      draw(simT);
      times.push(performance.now() - t0);
    }
    canvas.getContext('2d')!.getImageData(0, 0, 1, 1); // flush queued GPU work once, so raster time is included
    const total = performance.now() - T0;
    auto = was;
    times.sort((a, b) => a - b);
    return { avg: total / n, cpuAvg: times.reduce((a, b) => a + b, 0) / n, max: times[n - 1]!, p95: times[Math.floor(n * 0.95)]! };
  },
  layout,
};
(window as unknown as { __river: Hooks }).__river = hooks;
scene.ready.then(() => {
  document.body.dataset.ready = '1';
  requestAnimationFrame(loop);
});
