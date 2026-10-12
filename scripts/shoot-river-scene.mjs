// Usage: node scripts/shoot-river-scene.mjs [what]   (dev server on :5182). Saves docs/screens/river/*.png
//   what = all | quick | perf   (default all)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const what = process.argv[2] ?? 'all';
const base = process.env.RIVER_URL ?? 'http://localhost:5182/river-scene-test.html';
const out = 'docs/screens/river';
mkdirSync(out, { recursive: true });
const args = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });

async function open(dpr, w = 1440, h = 900, q = '?anchors=0') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const t0 = Date.now();
  await page.goto(base + q, { timeout: 120000 });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  console.log(`ready dpr${dpr} ${w}x${h}: ${Date.now() - t0} ms`);
  await page.evaluate(() => { window.__river.setAuto(false); window.__river.hideUi(); });
  return page;
}
const R = (page, fn, arg) => page.evaluate(fn, arg);
const shot = async (page, name, clip) => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${name}.png`, clip });
  console.log('saved', name);
};
const warm = (page, ms = 4000) => R(page, (ms) => window.__river.advance(ms), ms);

if (what === 'perf') {
  const page = await open(1);
  for (const p of ['mid', 'end', 'infl']) {
    await R(page, (p) => window.__river.apply(p), p);
    await warm(page, 1500);
    console.log(p, JSON.stringify(await R(page, () => window.__river.perf(200))));
  }
  await browser.close();
  process.exit(0);
}

const page = await open(1);
if (what === 'quick') {
  await R(page, () => window.__river.apply('mid'));
  await warm(page, 5000);
  await shot(page, 'quick');
  await browser.close();
  process.exit(0);
}

// dock, zoomed
await R(page, () => window.__river.apply('dock'));
await R(page, () => window.__river.set({ effort: { cash: 0, savings: 0.35, invest: 1 } }));
await warm(page, 3000);
await shot(page, 'dock-zoomed');
// dock, zoom 1 (full)
await R(page, () => window.__river.set({ zoom: 1 }));
await warm(page, 500);
await shot(page, 'dock-full');
// mid story
await R(page, () => window.__river.apply('mid'));
await warm(page, 5000);
await shot(page, 'mid-story');
// end
await R(page, () => window.__river.apply('end'));
await warm(page, 5000);
await shot(page, 'end');
// high inflation
await R(page, () => window.__river.apply('infl'));
await warm(page, 6000);
await shot(page, 'high-inflation');
// reduced motion
await R(page, () => window.__river.apply('mid'));
await R(page, () => window.__river.set({ reduced: true }));
await warm(page, 800);
await shot(page, 'reduced-motion');
await R(page, () => window.__river.set({ reduced: false }));

// stroke cycle strip: a boat close-up (zoom 3.4 about the invest boat) at 4 phases
await R(page, () => window.__river.apply('mid'));
await R(page, () => window.__river.set({ zoom: 2.3, focusU: 0.35, effort: { invest: 1, savings: 0.6, cash: 0 } }));
await warm(page, 3000);
const strip = [];
for (let i = 0; i < 4; i++) {
  await warm(page, 160);
  await page.waitForTimeout(60);
  strip.push(await page.screenshot({ clip: { x: 420, y: 140, width: 780, height: 440 } }));
}
await R(page, () => window.__river.set({ zoom: 1 }));
await page.close();

// 2x close-up with wake + reflection (DPR 2)
const p2 = await open(2);
await R(p2, () => window.__river.apply('mid'));
await R(p2, () => window.__river.set({ zoom: 2.6, focusU: 0.35, effort: { invest: 1, savings: 0.6, cash: 0 } }));
await warm(p2, 4000);
await shot(p2, 'closeup-2x');
await R(p2, () => window.__river.set({ zoom: 1 }));
await warm(p2, 500);
await shot(p2, 'mid-story-2x');
console.log('perf @DPR2', JSON.stringify(await R(p2, () => window.__river.perf(100))));
await p2.close();

// strip: stitch with a second page using the captured buffers
const { writeFileSync } = await import('node:fs');
const sp = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const imgs = strip.map((b) => 'data:image/png;base64,' + b.toString('base64'));
await sp.setContent(`<body style="margin:0;background:#fff"><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;width:1566px">${imgs.map((s) => `<img src="${s}" style="width:780px;display:block">`).join('')}</div></body>`);
await sp.waitForTimeout(300);
const buf = await sp.screenshot({ clip: { x: 0, y: 0, width: 1566, height: 846 } });
writeFileSync(`${out}/stroke-cycle.png`, buf);
console.log('saved stroke-cycle');
await browser.close();
