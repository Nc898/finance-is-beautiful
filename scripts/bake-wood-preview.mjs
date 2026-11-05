// Usage: node scripts/bake-wood-preview.mjs [port] [month]   (dev server running, default :5180)
// Paints the landing page's A Little Off the Top still with the real scene: the timeline is set to the end, when
// both trees are grown, the ghost crown shows behind A's and A's woodpile is full; the page chrome is
// hidden, and the painting is written to public/assets/preview-wood.webp. Re-run after changing the scene's art.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const port = process.argv[2] ?? '5180';
const at = Number(process.argv[3] ?? '480');
const out = 'public/assets';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 980, height: 700 }, deviceScaleFactor: 2.4 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// past the introduction (it shows the first time per session)
await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:a-little-off-the-top', '1'));
await page.goto(`http://localhost:${port}/a-little-off-the-top.html`);
await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 90000 });
// the whole stage for the painting: the controls folded away, then the timeline set to the moment
await page.locator('#panel-toggle').click();
await page.evaluate((m) => window.__wood.actions.scrubTo(m), at);
await page.waitForTimeout(4000);
await page.addStyleTag({ content: '.overlay, .caption, .masthead, .year-readout, .panel-toggle, .loader { display: none !important; }' });
await page.waitForTimeout(60);
const shot = await page.locator('#scene').screenshot({ type: 'png' });
// re-encode as webp in the page (Playwright writes png or jpeg only)
const dataUrl = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  // crop to the two trees and their woodpiles (the sky above is quiet), at 7:5 like the landing card
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const cw = W * 0.74;
  const ch = (cw * 5) / 7;
  const cx = (W - cw) / 2;
  const cy = Math.max(0, H * 0.985 - ch);
  const cv = document.createElement('canvas');
  cv.width = 1300;
  cv.height = Math.round((1300 * 5) / 7);
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, cx, cy, cw, ch, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/webp', 0.88);
}, shot.toString('base64'));
const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(`${out}/preview-wood.webp`, buf);
console.log(`baked ${out}/preview-wood.webp (${Math.round(buf.length / 1024)} KB) at month ${at}`);
await browser.close();
