// Usage: node scripts/shoot-app.mjs [port]   (dev server must be running; default 5175)
// Saves docs/screens/app/*.png (a subfolder, so the slice shoot's clean-up leaves these alone).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const port = process.argv[2] ?? '5175';
const url = `http://localhost:${port}/time-to-grow.html`;
const out = 'docs/screens/app';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: process.env.SOFT ? [] : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-software-rasterizer'],
});

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  await page.evaluate(() => window.__ttg.actions.pause()); // take over the story clock
  return page;
}

const seek = async (page, t) => {
  await page.evaluate((t) => window.__ttg.actions.seekStory(t), t);
  await page.waitForTimeout(1200);
};
const shot = async (page, name, full = false) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log('saved', name);
};

const sizes = [
  ['desktop', 1440, 900],
  ['laptop', 1280, 720],
  ['mobile', 390, 844],
  ['small', 360, 740],
];
for (const [tag, width, height] of sizes) {
  const page = await open({ width, height });
  await seek(page, 3);
  await shot(page, `${tag}-planting`);
  await seek(page, 20);
  await shot(page, `${tag}-growing`);
  await seek(page, 44);
  await shot(page, `${tag}-difference`);
  const h = await page.evaluate(() => { const a = window.__ttg.anchors('A', 1); return Math.round(a.base.y - a.top.y); });
  console.log(tag, 'mature Tree A height px:', h);
  await page.evaluate(() => window.__ttg.actions.skipToExplore());
  await page.fill('#f-monthlyContribution', '300');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await shot(page, `${tag}-explore`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(tag, 'horizontal overflow:', overflow);
  if (width < 700) await shot(page, `${tag}-explore-full`, true);
  await page.context().close();
}
await browser.close();
