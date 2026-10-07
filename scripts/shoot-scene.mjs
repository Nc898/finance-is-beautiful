// Usage: node scripts/shoot-scene.mjs [tag]   (dev server on :5174). Saves docs/screens/scene-<tag>-*.png
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'C:/Users/Nick/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const tag = process.argv[2] ?? 'p2';
const out = 'docs/screens';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: process.env.SOFT ? [] : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1820, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto('http://localhost:5174/scene-test.html', { timeout: 120000 });
await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
console.log('load ms', Date.now() - t0);
const S = (o) => page.evaluate((o) => window.__scene.setState(o), o);
const shot = async (name) => {
  await page.waitForTimeout(150);
  await (await page.$('#cv')).screenshot({ path: `${out}/scene-${tag}-${name}.png` });
};
await page.evaluate(() => window.__scene.freeze(1000));
const L = (w, h, t = 0, b = 0) => page.evaluate(async ([w, h, t, b]) => window.__scene.setLayout(w, h, t, b), [w, h, t, b]);

await L(1440, 900);
// (a) A 0.29 planted, B unplanted
await S({ mA: 0.29, mB: 0, pA: true, pB: false, months: 12, puA: -1, puB: -1, ls: 0, rm: true });
await shot('a');
// (b) A 0.49 / B 0.29 with pulse mid-way
await S({ mA: 0.49, mB: 0.29, pA: true, pB: true, puA: 0.5, puB: 0.35, ls: 0 });
await shot('b');
// (c) default end state A 1.0 / B 0.715
await S({ mA: 1, mB: 0.715, puA: -1, puB: -1, ls: 0 });
await shot('c');
// (d) loupe on A branches (+ roots, canopy)
await S({ ls: 1, lt: 'A', lg: 'branches' });
await shot('d');
await S({ ls: 1, lt: 'A', lg: 'roots' });
await shot('d-roots');
await S({ ls: 1, lt: 'B', lg: 'canopy' });
await shot('d-canopy');
// roots loupe on a very young tree, and B at its planting moment
await S({ mA: 0.012, mB: 0.0, pA: true, pB: true, months: 1.5, ls: 1, lt: 'A', lg: 'roots', puA: -1 });
await shot('young-roots');
await S({ mA: 0.03, months: 3, ls: 1, lt: 'A', lg: 'roots' });
await shot('young-roots2');
await S({ ls: 0, mA: 1, mB: 0.715, months: 12 });
await S({ mA: 1, mB: 1, ls: 0 });
await shot('f-both-mature');
await S({ mA: 0, mB: 0, pA: true, pB: true, months: 0, ls: 1, lt: 'B', lg: 'roots' });
await shot('b-planting');
await S({ mA: 0.0, mB: 0.0, pA: true, pB: true, months: 0.5, ls: 1, lt: 'B', lg: 'roots' });
await shot('b-planting2');
await S({ ls: 0, mA: 1, mB: 0.715, months: 12 });
// (e) mobile 390x500
await L(390, 500, 40, 60);
await S({ mA: 1, mB: 0.715, ls: 0, months: 12 });
await shot('e-mobile');
await S({ ls: 1, lt: 'A', lg: 'branches' });
await shot('e-mobile-loupe');
await L(1440, 900);
await S({ mA: 1, mB: 0.715, ls: 0 });

const info = await page.evaluate(async () => {
  const check = window.__scene.selfCheck();
  const perf = await window.__scene.perf();
  return { check, perf };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
