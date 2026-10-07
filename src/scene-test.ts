import { createScene } from './scene';
import type { SceneAPI, SceneFrame, TreeVisualState } from './scene/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cv = $<HTMLCanvasElement>('cv');
const dpr = Math.min(2, window.devicePixelRatio || 1);

interface State {
  mA: number;
  mB: number;
  pA: boolean;
  pB: boolean;
  months: number;
  puA: number;
  puB: number;
  lt: 'A' | 'B';
  lg: 'roots' | 'branches' | 'canopy';
  ls: number;
  rm: boolean;
}
const st: State = { mA: 1, mB: 0.715, pA: true, pB: true, months: 12, puA: -1, puB: -1, lt: 'A', lg: 'branches', ls: 0, rm: false };
let size = { w: 1440, h: 900 };
let insets = { top: 0, bottom: 0 };
let scene: SceneAPI = createScene(cv);
let frozenT: number | null = null;
let lastMs = 0;

function mk(id: 'A' | 'B', s: State): TreeVisualState {
  return {
    id, planted: id === 'A' ? s.pA : s.pB, maturity: id === 'A' ? s.mA : s.mB, monthsSincePlanting: s.months,
    pulse: id === 'A' ? s.puA : s.puB, startAge: id === 'A' ? 25 : 35,
  };
}
function frame(s: State, t: number): SceneFrame {
  return {
    timeMs: t, trees: [mk('A', s), mk('B', s)], reducedMotion: s.rm,
    loupe: s.ls > 0 ? { tree: s.lt, target: s.lg, strength: s.ls } : undefined,
  };
}

function applyLayout(): void {
  cv.style.width = `${size.w}px`;
  cv.style.height = `${size.h}px`;
  scene.resize(size.w, size.h, dpr);
  scene.setInsets(insets);
}

function render(t = performance.now()): void {
  const a = performance.now();
  scene.render(frame(st, frozenT ?? t));
  lastMs = performance.now() - a;
}

function sync(): void {
  $('oA').textContent = st.mA.toFixed(3);
  $('oB').textContent = st.mB.toFixed(3);
  $('oM').textContent = st.months.toFixed(2);
  $('oPa').textContent = st.puA.toFixed(2);
  $('oPb').textContent = st.puB.toFixed(2);
  $('oL').textContent = st.ls.toFixed(2);
  ($('mA') as HTMLInputElement).value = String(st.mA);
  ($('mB') as HTMLInputElement).value = String(st.mB);
  ($('pA') as HTMLInputElement).checked = st.pA;
  ($('pB') as HTMLInputElement).checked = st.pB;
  ($('mon') as HTMLInputElement).value = String(st.months);
  ($('puA') as HTMLInputElement).value = String(st.puA);
  ($('puB') as HTMLInputElement).value = String(st.puB);
  ($('ls') as HTMLInputElement).value = String(st.ls);
  ($('lt') as HTMLSelectElement).value = st.lt;
  ($('lg') as HTMLSelectElement).value = st.lg;
  ($('rm') as HTMLInputElement).checked = st.rm;
}

function bind(): void {
  const num = (id: string, key: keyof State) => $(id).addEventListener('input', (e) => { (st[key] as number) = parseFloat((e.target as HTMLInputElement).value); sync(); });
  num('mA', 'mA');
  num('mB', 'mB');
  num('mon', 'months');
  num('puA', 'puA');
  num('puB', 'puB');
  num('ls', 'ls');
  $('pA').addEventListener('change', (e) => { st.pA = (e.target as HTMLInputElement).checked; });
  $('pB').addEventListener('change', (e) => { st.pB = (e.target as HTMLInputElement).checked; });
  $('rm').addEventListener('change', (e) => { st.rm = (e.target as HTMLInputElement).checked; });
  $('lt').addEventListener('change', (e) => { st.lt = (e.target as HTMLSelectElement).value as 'A' | 'B'; });
  $('lg').addEventListener('change', (e) => { st.lg = (e.target as HTMLSelectElement).value as State['lg']; });
  $('apply').addEventListener('click', () => {
    size = { w: parseInt(($('cw') as HTMLInputElement).value, 10) || 1440, h: parseInt(($('ch') as HTMLInputElement).value, 10) || 900 };
    insets = { top: parseInt(($('it') as HTMLInputElement).value, 10) || 0, bottom: parseInt(($('ib') as HTMLInputElement).value, 10) || 0 };
    applyLayout();
  });
}

function snap(): Uint8ClampedArray {
  return new Uint8ClampedArray(cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data);
}
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** determinism: scrubbing back reproduces state exactly; pulse / loupe / wind never alter the growth state */
function selfCheck(): { pass: boolean; detail: string } {
  const keep = { ...st };
  const keepFrozen = frozenT;
  frozenT = 1000;
  const lines: string[] = [];
  let pass = true;
  const base: State = { ...st, mA: 0.45, mB: 0.3, pA: true, pB: true, puA: -1, puB: -1, ls: 0, rm: true, months: 12 };
  const draw = (s: State) => {
    scene.render(frame(s, 1000));
    return snap();
  };
  for (let i = 0; i < 3; i++) draw(base);
  const a = draw(base);
  for (const detour of [1, 0.15, 0]) {
    draw({ ...base, mA: detour, mB: 1 - detour });
    const b = draw(base);
    const d = diff(a, b);
    lines.push(`A0.45/B0.3 -> A${detour} -> back: ${d} differing bytes`);
    if (d) pass = false;
  }
  // pulse and loupe overlays must be additive only: with them off again, identical pixels
  draw({ ...base, puA: 0.5, puB: 0.3, ls: 1 });
  const c = draw(base);
  const d2 = diff(a, c);
  lines.push(`after pulse+loupe on/off: ${d2} differing bytes`);
  if (d2) pass = false;
  // wind is decorative only: reducedMotion render equals itself regardless of timeMs
  scene.render(frame(base, 5000));
  const d3 = diff(a, snap());
  lines.push(`reducedMotion at another timeMs: ${d3} differing bytes`);
  if (d3) pass = false;
  Object.assign(st, keep);
  frozenT = keepFrozen;
  sync();
  return { pass, detail: lines.join('\n') };
}

/** two mature trees + roots + loupe, 1440x900 @DPR1 */
async function perf(): Promise<{ plain: number; withLoupe: number; flushed: number; readyMs: number }> {
  const c2 = document.createElement('canvas');
  c2.style.cssText = 'position:absolute;left:-99999px;top:0;width:1440px;height:900px';
  document.body.appendChild(c2);
  const t0 = performance.now();
  const sc = createScene(c2);
  sc.resize(1440, 900, 1);
  await sc.ready;
  const readyMs = performance.now() - t0;
  const s: State = { ...st, mA: 1, mB: 1, pA: true, pB: true, puA: 0.5, puB: 0.4, rm: false };
  const run = (withLoupe: boolean) => {
    const f = (t: number): SceneFrame => ({ ...frame({ ...s, ls: withLoupe ? 1 : 0, lt: 'A', lg: 'branches' }, t) });
    for (let i = 0; i < 10; i++) sc.render(f(i * 16));
    let acc = 0;
    for (let i = 0; i < 200; i++) {
      const a = performance.now();
      sc.render(f(i * 16.7));
      acc += performance.now() - a;
    }
    return acc / 200;
  };
  const plain = run(false);
  const withLoupe = run(true);
  const g = c2.getContext('2d')!;
  const b = performance.now();
  for (let i = 0; i < 200; i++) sc.render(frame({ ...s, ls: 1 }, i * 16.7));
  g.getImageData(0, 0, 1, 1);
  const flushed = (performance.now() - b) / 200;
  sc.destroy();
  c2.remove();
  return { plain, withLoupe, flushed, readyMs };
}

function setState(p: Partial<State>): void {
  Object.assign(st, p);
  sync();
  render(frozenT ?? performance.now());
}
async function setLayout(w: number, h: number, top = 0, bottom = 0): Promise<void> {
  size = { w, h };
  insets = { top, bottom };
  ($('cw') as HTMLInputElement).value = String(w);
  ($('ch') as HTMLInputElement).value = String(h);
  applyLayout();
  await scene.ready;
  await new Promise((r) => setTimeout(r, 120));
}

function loop(t: number): void {
  if (frozenT === null) render(t);
  $('info').textContent = `render ${lastMs.toFixed(2)} ms\n${extra}`;
  requestAnimationFrame(loop);
}
let extra = '';

$('check').addEventListener('click', () => {
  const r = selfCheck();
  const o = $('checkOut');
  o.textContent = r.pass ? ' PASS' : ' FAIL';
  o.className = r.pass ? 'pass' : 'fail';
  extra = r.detail;
});
$('perf').addEventListener('click', () => {
  void perf().then((r) => {
    extra = `2 mature trees @1440x900 DPR1: CPU ${r.plain.toFixed(2)} ms; + loupe ${r.withLoupe.toFixed(2)} ms; incl GPU flush ${r.flushed.toFixed(2)} ms; ready ${r.readyMs.toFixed(0)} ms`;
  });
});

async function boot(): Promise<void> {
  bind();
  sync();
  applyLayout();
  await scene.ready;
  requestAnimationFrame(loop);
  (window as unknown as Record<string, unknown>).__scene = {
    setState, setLayout, selfCheck, perf, freeze: (t: number) => { frozenT = t; render(t); }, unfreeze: () => { frozenT = null; },
    anchors: (id: 'A' | 'B', m: number) => scene.anchorsFor(id, m), w2s: (x: number, y: number) => scene.worldToScreen(x, y),
  };
  document.body.dataset.ready = '1';
}
void boot();
