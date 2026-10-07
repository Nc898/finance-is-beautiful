// Performance probe. Usage: node scripts/perf.mjs            (builds + serves a production bundle on :5191)
//   PERF_URL=http://localhost:5174/ node scripts/perf.mjs   (measure an already-running server, e.g. the dev server)
//   PERF_GPU=0 node scripts/perf.mjs                        (software rendering: no GPU flags)
//   PERF_SECONDS=5 PERF_JSON=out.json                       (window length; also dump raw results as JSON)
//
// For each profile (desktop 1440x900 DPR1, mobile 412x915 DPR2.6) and each CPU throttle (1x, 4x) it measures:
//   - time-to-ready: navigation start -> body[data-ready] (scene textures/sprites generated)
//   - frame intervals from requestAnimationFrame during story playback at 2x speed (two windows inside the
//     growing chapter): mean fps, median/p95/p99 frame time, frames > 50 ms, frames > 100 ms
//   - main-thread busy share (CDP Performance.getMetrics TaskDuration / ScriptDuration deltas) and long tasks
//   - JS heap (performance.memory / CDP Runtime.getHeapUsage)
// scene.render is not exposed on window, so per-render timing is approximated by rAF intervals + task duration.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const SECONDS = Number(process.env.PERF_SECONDS ?? 5);
const GPU = process.env.PERF_GPU !== '0';
const PORT = 5191;
let baseUrl = process.env.PERF_URL;
let server = null;

async function waitForHttp(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not start at ${url}`);
}

async function startServer() {
  const outDir = mkdtempSync(join(tmpdir(), 'ttg-perf-'));
  const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { stdio: 'inherit', shell: true });
  if (build.status !== 0) throw new Error('vite build failed');
  server = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: true });
  baseUrl = `http://localhost:${PORT}/time-to-grow.html`;
  await waitForHttp(baseUrl);
}

function stats(intervals) {
  const a = [...intervals].sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const total = intervals.reduce((s, v) => s + v, 0);
  return {
    frames: intervals.length,
    meanFps: +((intervals.length / total) * 1000).toFixed(1),
    meanMs: +(total / intervals.length).toFixed(2),
    medianMs: +q(0.5).toFixed(2),
    p95Ms: +q(0.95).toFixed(2),
    p99Ms: +q(0.99).toFixed(2),
    maxMs: +a[a.length - 1].toFixed(1),
    over50: intervals.filter((v) => v > 50).length,
    over100: intervals.filter((v) => v > 100).length,
  };
}

async function measureProfile(browser, profile, throttle) {
  const ctx = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.dpr,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

  // Record when the app flags itself ready, in the page's own clock (0 = navigation start).
  await page.addInitScript(() => {
    window.__perf = { ready: null, longTasks: [] };
    // documentElement does not exist yet when init scripts run, so poll (2 ms) for the ready flag the app sets on <body>.
    const timer = setInterval(() => {
      if (document.body?.dataset.ready === '1') {
        window.__perf.ready = performance.now();
        clearInterval(timer);
      }
    }, 2);
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perf.longTasks.push(e.duration))).observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask unsupported */
    }
  });

  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 120000 });
  const readyMs = await page.evaluate(() => window.__perf.ready);
  await page.evaluate(() => window.__ttg.actions.pause());
  await page.waitForTimeout(500);

  const windows = [];
  for (const w of [
    { name: 'growing early (story 8-18 s, loupe on roots)', seek: 8 },
    { name: 'growing late (story 22-32 s, branch loupe)', seek: 22 },
  ]) {
    await page.evaluate(({ seek }) => {
      window.__ttg.actions.pause();
      window.__ttg.actions.seekStory(seek);
      window.__ttg.actions.setSpeed(2);
    }, { seek: w.seek });
    await page.waitForTimeout(600); // let the scene settle on the new age before measuring

    const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const lt0 = await page.evaluate(() => window.__perf.longTasks.length);
    const result = await page.evaluate(async (seconds) => {
      window.__ttg.actions.play();
      const s0 = window.__ttg.getState().storyTime;
      const intervals = [];
      let last = null;
      await new Promise((resolve) => {
        const t0 = performance.now();
        const step = (now) => {
          if (last !== null) intervals.push(now - last);
          last = now;
          if (now - t0 < seconds * 1000) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      const s1 = window.__ttg.getState().storyTime;
      window.__ttg.actions.pause();
      return { intervals, storyAdvanced: s1 - s0, mode: window.__ttg.getState().mode };
    }, SECONDS);
    const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const longTasks = await page.evaluate((from) => window.__perf.longTasks.slice(from), lt0);
    const wall = SECONDS;
    windows.push({
      name: w.name,
      ...stats(result.intervals),
      storyAdvancedSeconds: +result.storyAdvanced.toFixed(2),
      taskBusyPct: +(((m1.TaskDuration - m0.TaskDuration) / wall) * 100).toFixed(0),
      scriptBusyPct: +(((m1.ScriptDuration - m0.ScriptDuration) / wall) * 100).toFixed(0),
      longTasks: longTasks.length,
      longestTaskMs: longTasks.length ? +Math.max(...longTasks).toFixed(0) : 0,
    });
  }

  const heap = await cdp.send('Runtime.getHeapUsage');
  const perfMemory = await page.evaluate(() => (performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null));
  await ctx.close();
  return {
    profile: profile.name,
    throttle,
    readyMs: readyMs === null ? null : Math.round(readyMs),
    heapUsedMB: +(heap.usedSize / 1048576).toFixed(1),
    heapTotalMB: +(heap.totalSize / 1048576).toFixed(1),
    perfMemoryUsedMB: perfMemory ? +(perfMemory.used / 1048576).toFixed(1) : null,
    windows,
  };
}

const profiles = [
  { name: 'desktop 1440x900 @1x', viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false },
  { name: 'mobile 412x915 @2.6x', viewport: { width: 412, height: 915 }, dpr: 2.6, mobile: true },
];

try {
  if (!baseUrl) await startServer();
  const browser = await chromium.launch({
    args: GPU ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : [],
  });
  const gl = await (async () => {
    const p = await browser.newPage();
    await p.goto('about:blank');
    const info = await p.evaluate(() => {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl');
      const e = g?.getExtension('WEBGL_debug_renderer_info');
      return g && e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    await p.close();
    return info;
  })();
  const results = [];
  for (const throttle of [1, 4]) {
    for (const profile of profiles) {
      process.stdout.write(`measuring ${profile.name} cpu x${throttle} ... `);
      const r = await measureProfile(browser, profile, throttle);
      results.push(r);
      console.log(`ready ${r.readyMs} ms, ${r.windows.map((w) => `${w.meanFps} fps / p95 ${w.p95Ms} ms`).join('; ')}`);
    }
  }
  const version = browser.version();
  await browser.close();

  const out = { when: new Date().toISOString(), chromium: version, gpuRenderer: gl, gpuFlags: GPU, node: process.version, baseUrl, seconds: SECONDS, results };
  console.log(JSON.stringify(out, null, 2));
  if (process.env.PERF_JSON) writeFileSync(process.env.PERF_JSON, JSON.stringify(out, null, 2));
} finally {
  if (server) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  }
}
