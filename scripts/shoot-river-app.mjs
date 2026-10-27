// Usage: node scripts/shoot-river-app.mjs [port] [sizes]   (dev server must be running; default port 5183)
// Saves docs/screens/river-app/*.png. Sizes: "desktop" (1440x900, default), or any of desktop,laptop,mobile.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const req = createRequire(process.cwd() + '/package.json');
const { chromium } = req('playwright');

const port = process.argv[2] ?? '5183';
const only = (process.argv[3] ?? 'desktop').split(',');
const url = `http://localhost:${port}/against-the-current.html`;
const out = 'docs/screens/river-app';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: process.env.SOFT ? [] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});

async function open(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference', ...extra });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.routeWebSocket(/.*/, () => {}); // no HMR reloads mid-shoot
  await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:against-the-current', '1'));
  await page.goto(url);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 120000 });
  return page;
}

const seek = async (page, years, wait = 1500) => {
  await page.evaluate((y) => window.__river.actions.scrubTo(y), years);
  await page.waitForTimeout(wait);
};
const shot = async (page, name, full = false) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log('saved', name);
};

const sizes = {
  desktop: [1440, 900],
  laptop: [1280, 720],
  mobile: [390, 844],
};
for (const tag of only) {
  const [width, height] = sizes[tag];
  const page = await open({ width, height }, tag === 'mobile' ? { isMobile: true, hasTouch: true } : {});
  const pre = tag === 'desktop' ? '' : `${tag}-`;
  for (const y of [0, 6, 14, 30]) {
    await seek(page, y, y === 0 ? 2000 : 1500);
    await shot(page, `${pre}year-${String(y).padStart(2, '0')}`);
  }
  const toggle = page.locator('#panel-toggle');
  const wasOpen = (await toggle.getAttribute('aria-expanded')) === 'true';
  if (!wasOpen) { await toggle.click(); await page.waitForTimeout(400); }
  await page.fill('#f-inflation', '6');
  await page.keyboard.press('Enter');
  if (!wasOpen) { await toggle.click(); await page.waitForTimeout(400); }
  await page.waitForTimeout(2500);
  await shot(page, `${pre}explore-inflation-6`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(tag, 'horizontal overflow:', overflow);
  await page.context().close();
}
await browser.close();
