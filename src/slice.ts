import { TreeView } from './scene/treeView';
import { createScene } from './scene';
import { buildAtlas } from './scene/sprites';
import { makePaperTile } from './scene/watercolor';
import type { SceneFrame } from './scene/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dpr = Math.min(2, window.devicePixelRatio || 1);

const SMALL = { w: 300, h: 520 };
const BIG = { w: 640, h: 820 };
let seed = 1337;
let loadMs = 0;

const smallViews = [
  { el: $<HTMLCanvasElement>('p1'), m: 0.08 },
  { el: $<HTMLCanvasElement>('p2'), m: 0.2 },
  { el: $<HTMLCanvasElement>('p3'), m: 0.45 },
  { el: $<HTMLCanvasElement>('p4'), m: 1.0 },
].map((p) => ({ v: new TreeView(p.el, seed), m: p.m }));
const big = new TreeView($<HTMLCanvasElement>('big'), seed);

const state = { m: 0.45, months: 12, wind: false };
let tNow = 0;
let extra = '';

function drawSmall(): void {
  for (const s of smallViews) s.v.render({ maturity: s.m, months: 12, timeMs: 0, wind: false });
}
function drawBig(): void {
  big.render({ maturity: state.m, months: state.months, timeMs: tNow, wind: state.wind });
  $('matOut').textContent = state.m.toFixed(3);
  $('monOut').textContent = state.months.toFixed(2);
  const mod = big.model;
  $('bigcap').textContent = `scrub panel  m=${state.m.toFixed(3)}  months=${state.months.toFixed(2)}  seed=${seed}`;
  $('info').textContent =
    `load ${loadMs.toFixed(0)} ms | branches ${mod.stats.branches} | clumps ${mod.stats.clumps} (warm ${mod.stats.warm}) | tips ${mod.stats.tips}\nlast frame ${big.lastMs.toFixed(2)} ms${extra}`;
}
function redrawAll(): void {
  drawSmall();
  drawBig();
}

function loop(t: number): void {
  tNow = t;
  if (state.wind) drawBig();
  requestAnimationFrame(loop);
}

function setState(m: number, months: number, wind?: boolean): void {
  state.m = m;
  state.months = months;
  if (wind !== undefined) state.wind = wind;
  ($('mat') as HTMLInputElement).value = String(m);
  ($('mon') as HTMLInputElement).value = String(months);
  ($('wind') as HTMLInputElement).checked = state.wind;
  drawBig();
}
function setSeed(s: number): void {
  seed = s;
  for (const sv of smallViews) sv.v.setSeed(s);
  big.setSeed(s);
  ($('seed') as HTMLInputElement).value = String(s);
  redrawAll();
}

function snapshot(): Uint8ClampedArray {
  const ctx = big.canvas.getContext('2d')!;
  return new Uint8ClampedArray(ctx.getImageData(0, 0, big.canvas.width, big.canvas.height).data);
}
function selfCheck(): { pass: boolean; detail: string } {
  const keep = { ...state };
  const run = (m: number) => {
    big.render({ maturity: m, months: 12, timeMs: 0, wind: false });
    return snapshot();
  };
  for (let i = 0; i < 3; i++) run(0.45); // settle the canvas backend before comparing
  const a = run(0.45);
  const results: string[] = [];
  let pass = true;
  for (const detour of [1, 0.2, 0.0, 0.7]) {
    run(detour);
    const b = run(0.45);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    results.push(`0.45 -> ${detour} -> 0.45: ${diff} differing bytes`);
    if (diff) pass = false;
  }
  const mod = big.model;
  const st = big.painter.state;
  let prevG: Float32Array | null = null;
  let prevC: Float32Array | null = null;
  let monotone = true;
  for (let i = 0; i <= 400; i++) {
    big.render({ maturity: i / 400, months: 12, timeMs: 0, wind: false });
    if (prevG && prevC) {
      for (let k = 0; k < st.g.length; k++) if (st.g[k]! < prevG[k]! - 1e-6) monotone = false;
      for (let k = 0; k < st.clumpA.length; k++) if (st.clumpA[k]! < prevC[k]! - 1e-6) monotone = false;
    }
    prevG = new Float32Array(st.g);
    prevC = new Float32Array(st.clumpA);
  }
  if (!monotone) pass = false;
  results.push(`per-branch growth + per-clump alpha non-decreasing over 401 steps: ${monotone ? 'ok' : 'VIOLATED'} (${mod.branches.length} branches, ${mod.clumps.length} clumps)`);
  setState(keep.m, keep.months, keep.wind);
  return { pass, detail: results.join('\n') };
}

function perfSingle(): { avgMs: number; flushedMs: number } {
  const keep = { ...state };
  const frames = 200;
  const params = { maturity: 1, months: 12, timeMs: 0, wind: true };
  for (let i = 0; i < 10; i++) big.render(params);
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    params.timeMs = i * 16.7;
    big.render(params);
    acc += big.lastMs;
  }
  const ctx = big.canvas.getContext('2d')!;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    params.timeMs = i * 16.7;
    big.render(params);
  }
  ctx.getImageData(0, 0, 1, 1);
  const flushed = (performance.now() - t0) / frames;
  setState(keep.m, keep.months, keep.wind);
  return { avgMs: acc / frames, flushedMs: flushed };
}

/** Two mature trees through the real createScene() at 1440x900, DPR 1. */
async function perfScene(): Promise<{ avgMs: number; flushedMs: number; readyMs: number }> {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;left:-99999px;top:0;width:1440px;height:900px';
  document.body.appendChild(cv);
  const t0 = performance.now();
  const scene = createScene(cv);
  scene.resize(1440, 900, 1);
  await scene.ready;
  const readyMs = performance.now() - t0;
  const mk = (id: 'A' | 'B') => ({ id, planted: true, maturity: 1, monthsSincePlanting: 12, pulse: -1, startAge: 25 });
  const frame: SceneFrame = { timeMs: 0, trees: [mk('A'), mk('B')], reducedMotion: false };
  for (let i = 0; i < 10; i++) scene.render(frame);
  const frames = 200;
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    frame.timeMs = i * 16.7;
    const a = performance.now();
    scene.render(frame);
    acc += performance.now() - a;
  }
  const ctx = cv.getContext('2d')!;
  const b = performance.now();
  for (let i = 0; i < frames; i++) {
    frame.timeMs = i * 16.7;
    scene.render(frame);
  }
  ctx.getImageData(0, 0, 1, 1);
  const flushed = (performance.now() - b) / frames;
  scene.destroy();
  cv.remove();
  return { avgMs: acc / frames, flushedMs: flushed, readyMs };
}

async function showPerf(): Promise<void> {
  const r = perfSingle();
  const s = await perfScene();
  extra =
    `\n\none mature tree, ${BIG.w}x${BIG.h} @DPR${dpr}, wind on, 200 frames:\n  CPU-submit avg ${r.avgMs.toFixed(2)} ms | incl. GPU flush ${r.flushedMs.toFixed(2)} ms` +
    `\nTWO mature trees via createScene, 1440x900 @DPR1, wind on:\n  CPU-submit avg ${s.avgMs.toFixed(2)} ms | incl. GPU flush ${s.flushedMs.toFixed(2)} ms | scene ready ${s.readyMs.toFixed(0)} ms`;
  drawBig();
}

/** For scripts/bake-assets.mjs */
async function bake(): Promise<{ atlas: string; json: unknown; paper: string }> {
  const { canvas, json } = await buildAtlas(2);
  return { atlas: canvas.toDataURL('image/png'), json, paper: makePaperTile().toDataURL('image/png') };
}

$('mat').addEventListener('input', (e) => setState(parseFloat((e.target as HTMLInputElement).value), state.months));
$('mon').addEventListener('input', (e) => setState(state.m, parseFloat((e.target as HTMLInputElement).value)));
$('seed').addEventListener('change', (e) => setSeed(parseInt((e.target as HTMLInputElement).value, 10) || 1));
$('wind').addEventListener('change', (e) => {
  state.wind = (e.target as HTMLInputElement).checked;
  drawBig();
});
$('check').addEventListener('click', () => {
  const r = selfCheck();
  const out = $('checkOut');
  out.textContent = r.pass ? ' PASS' : ' FAIL';
  out.className = r.pass ? 'pass' : 'fail';
  extra = '\n\n' + r.detail;
  drawBig();
});
$('perf').addEventListener('click', () => void showPerf());

async function boot(): Promise<void> {
  const t0 = performance.now();
  await Promise.all([
    ...smallViews.map((s) => s.v.init(SMALL.w, SMALL.h, dpr)),
    big.init(BIG.w, BIG.h, dpr),
  ]);
  loadMs = performance.now() - t0;
  requestAnimationFrame(loop);
  redrawAll();
  (window as unknown as Record<string, unknown>).__slice = {
    setState, setSeed, selfCheck, perfSingle, perfScene, bake, big, stats: () => big.model.stats, redrawAll, loadMs: () => loadMs,
  };
  document.body.dataset.ready = '1';
}
void boot();
