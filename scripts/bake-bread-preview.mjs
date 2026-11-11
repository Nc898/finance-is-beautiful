// Usage: node scripts/bake-bread-preview.mjs [port] [month]   (dev server running, default :5180)
// Paints the landing page's Bread and Butter still with the real scene: the timeline is set in the mid-1980s and
// played a moment so the grocer is at his board with the chalk in hand; the page chrome is hidden, and the painting
// (the counter, the basket, the grocer and the board) is written to public/assets/preview-bread.webp. Re-run after
// changing the scene's art.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const port = process.argv[2] ?? '5180';
const at = Number(process.argv[3] ?? '71');
const out = 'public/assets';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 980, height: 700 }, deviceScaleFactor: 2.4 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// past the introduction (it shows the first time per session)
await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:bread-and-butter', '1'));
await page.goto(`http://localhost:${port}/bread-and-butter.html`);
await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 120000 });
// the whole stage for the painting: the controls folded away, the timeline set just before a new year, then played
// so the grocer walks out to re-chalk the board
await page.locator('#panel-toggle').click();
await page.evaluate((m) => window.__bread.actions.scrubTo(m), at);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__bread.actions.play());
await page.waitForFunction(() => /^(reach|wipe|shift|write)/.test(window.__grocer?.debug?.phase ?? ''), null, { timeout: 30000 });
await page.waitForTimeout(250);
await page.evaluate(() => window.__bread.actions.pause());
await page.waitForTimeout(100);
await page.addStyleTag({ content: '.overlay, .caption, .masthead, .year-readout, .panel-toggle, .loader, .labels, .label { display: none !important; }' });
await page.waitForTimeout(60);
const shot = await page.locator('#scene').screenshot({ type: 'png' });
// re-encode as webp in the page (Playwright writes png or jpeg only)
const dataUrl = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  // crop to the shelves' right half, the counter, the grocer and the board, at 7:5 like the landing card
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const cw = W * 0.52;
  const ch = (cw * 5) / 7;
  const cx = W * 0.32;
  const cy = H * 0.22;
  const cv = document.createElement('canvas');
  cv.width = 1300;
  cv.height = Math.round((1300 * 5) / 7);
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, cx, cy, cw, ch, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/webp', 0.88);
}, shot.toString('base64'));
const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(`${out}/preview-bread.webp`, buf);
console.log(`baked ${out}/preview-bread.webp (${Math.round(buf.length / 1024)} KB) at month ${at}`);
await browser.close();
