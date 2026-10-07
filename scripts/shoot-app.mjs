// Usage: node scripts/shoot-app.mjs [port]   (dev server must be running; default 5175)
// Saves docs/screens/app-*.png
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'C:/Users/Nick/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const port = process.argv[2] ?? '5175';
const url = `http://localhost:${port}/`;
const out = 'docs/screens';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: process.env.SOFT ? [] : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-software-rasterizer'],
});

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  // Take over the story clock: pause, then seek.
  await page.evaluate(() => window.__ttg.actions.pause());
  return page;
}

const seek = async (page, t) => {
  await page.evaluate((t) => window.__ttg.actions.seekStory(t), t);
  await page.waitForTimeout(700);
};
const shot = async (page, name) => {
  await page.screenshot({ path: `${out}/app-${name}.png` });
  console.log('saved', name);
};

// Desktop 1440x900
{
  const page = await open({ width: 1440, height: 900 });
  await seek(page, 3);
  await shot(page, 'desktop-planting');
  await seek(page, 20);
  await shot(page, 'desktop-growing');
  await seek(page, 42);
  await shot(page, 'desktop-difference');
  // Explore after editing the contribution to 300.
  await page.evaluate(() => window.__ttg.actions.skipToExplore());
  await page.fill('#f-monthlyContribution', '300');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  await shot(page, 'desktop-explore');
  await page.close();
}

// Mobile 390x844
{
  const page = await open({ width: 390, height: 844 });
  await seek(page, 42);
  await shot(page, 'mobile-difference');
  await page.evaluate(() => window.__ttg.actions.skipToExplore());
  await page.waitForTimeout(700);
  await shot(page, 'mobile-explore');
  await page.screenshot({ path: `${out}/app-mobile-explore-full.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log('mobile horizontal overflow:', overflow);
  await page.close();
}

await browser.close();
