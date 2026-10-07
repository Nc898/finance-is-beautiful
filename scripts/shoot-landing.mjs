// Usage: node scripts/shoot-landing.mjs   (dev server on :5195). Saves docs/screens/landing/*.png and prints frame timings.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const out = 'docs/screens/landing';
mkdirSync(out, { recursive: true });
const URL = process.env.URL ?? 'http://localhost:5195/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return page;
}

for (const [w, h] of [[1440, 900], [1920, 1080]]) {
  const page = await open(w, h);
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  if (w === 1440) {
    // mid-grow frame: as soon as the grove has painted, wait ~1.1 s
    await page.waitForFunction(() => document.querySelector('#grove')?.width > 300 && document.querySelector('#grove').style.backgroundImage);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${out}/hero-grow-mid-${w}.png` });
  }
  await page.waitForFunction(() => document.documentElement.dataset.grown === '1', null, { timeout: 30000 });
  await page.waitForTimeout(400);
  console.log(`${w}: grown after ${Date.now() - t0} ms`);
  await page.screenshot({ path: `${out}/hero-${w}.png` });
  if (w === 1440) {
    await page.evaluate(() => window.scrollTo(0, 0));
    // make sure lazily painted vignettes are done
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/full-${w}.png`, fullPage: true });
    // frame timing while the grove sways
    const stats = await page.evaluate(
      () =>
        new Promise((res) => {
          const d = [];
          let last = performance.now();
          const start = last;
          const f = (n) => {
            d.push(n - last);
            last = n;
            if (n - start < 3000) requestAnimationFrame(f);
            else {
              d.shift();
              const s = [...d].sort((a, b) => a - b);
              res({ n: d.length, mean: d.reduce((a, b) => a + b, 0) / d.length, p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] });
            }
          };
          requestAnimationFrame(f);
        }),
    );
    console.log('rAF intervals (ms) over 3 s:', JSON.stringify(stats));
    const cost = await page.evaluate(async () => {
      // paint-cost: time per rAF callback is not exposed; use long-task style sampling via performance.now around two frames
      return null;
    });
    void cost;
  }
  await page.close();
}
await browser.close();
