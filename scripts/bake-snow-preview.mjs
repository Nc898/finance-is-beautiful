// Usage: node scripts/bake-snow-preview.mjs [port] [month]   (dev server running, default :5180)
// Paints the landing page's On a Roll still with the real scene: the timeline is set to a month when a ball is rolling
// down each hill, others wait at the top, and both climbers are up the hill; the page chrome is hidden, and the
// painting is written to public/assets/preview-snow.webp. Re-run after changing the snow scene's art.
// It also bakes the entry's perched birds (the scene's own bird painter) as public/assets/snow-bird-1..3.webp.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const port = process.argv[2] ?? '5180';
const at = Number(process.argv[3] ?? '11');
const out = 'public/assets';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
// rendered large and cropped in to 1300 x 929 (7:5 like the landing card, sharp at 2x)
const page = await browser.newPage({ viewport: { width: 980, height: 700 }, deviceScaleFactor: 2.4 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// past the introduction (it shows the first time per session)
await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:on-a-roll', '1'));
await page.goto(`http://localhost:${port}/on-a-roll.html`);
await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 90000 });
// the whole stage for the painting: the controls folded away, then the timeline set to the moment
await page.locator('#panel-toggle').click();
await page.evaluate((m) => window.__snow.actions.scrubTo(m), at);
await page.waitForTimeout(1500);
await page.addStyleTag({ content: '.overlay, .caption, .masthead, .year-readout, .panel-toggle, .loader { display: none !important; }' });
await page.waitForTimeout(60);
const shot = await page.locator('#scene').screenshot({ type: 'png' });
// re-encode as webp in the page (Playwright writes png or jpeg only)
const dataUrl = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  // crop in on the two hills (the sky above is quiet): the middle 62%, at 7:5, down to the snowbank, so the crest,
  // the waiting balls and the climbers sit in the clear middle of the landing card's feathered frame
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const cw = W * 0.62;
  const ch = (cw * 5) / 7;
  const cx = (W - cw) / 2;
  const cy = H * 0.985 - ch;
  const cv = document.createElement('canvas');
  cv.width = 1300;
  cv.height = Math.round((1300 * 5) / 7);
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, cx, cy, cw, ch, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/webp', 0.88);
}, shot.toString('base64'));
const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(`${out}/preview-snow.webp`, buf);
console.log(`baked ${out}/preview-snow.webp (${Math.round(buf.length / 1024)} KB) at month ${at}`);

// the entry's birds: painted by the scene's own bird painter (src/snow/scene/birdArt.ts), perched, at 3x the size
// they show at
const birds = await page.evaluate(async () => {
  const { makeBirdArt } = await import('/src/snow/scene/birdArt.ts');
  const picks = [
    ['chickadee', 0],
    ['cardinal', 0],
    ['chickadee', 1],
  ];
  return picks.map(([sp, pose]) => {
    const f = makeBirdArt(sp, 96).perch[pose];
    // trimmed to the bird, its feet at the bottom middle
    const cv = document.createElement('canvas');
    cv.width = 144;
    cv.height = 120;
    const c = cv.getContext('2d');
    c.drawImage(f.cv, 72 - f.ax, 116 - f.ay);
    return cv.toDataURL('image/webp', 0.9);
  });
});
birds.forEach((u, i) => writeFileSync(`${out}/snow-bird-${i + 1}.webp`, Buffer.from(u.split(',')[1], 'base64')));
console.log(`baked ${birds.length} birds (${out}/snow-bird-*.webp)`);
await browser.close();
