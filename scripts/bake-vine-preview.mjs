// Usage: node scripts/bake-vine-preview.mjs [port] [storySeconds]   (dev server running, default :5180)
// Paints the landing page's Nip It in the Bud still with the real scene: the story plays to a moment when both
// gardeners are at work on half-cut vines with leaves in the air, the page chrome is hidden, and the painting is
// written to public/assets/preview-vine.webp. Re-run after changing the vine scene's art.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const port = process.argv[2] ?? '5180';
const at = Number(process.argv[3] ?? '15.2');
const out = 'public/assets';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
// rendered large and cropped in to 1300 x 929 (7:5 like the landing card, sharp at 2x)
const page = await browser.newPage({ viewport: { width: 980, height: 700 }, deviceScaleFactor: 2.4 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/nip-it-in-the-bud.html`);
await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 90000 });
// the whole stage for the painting: the controls folded away, then the story plays on to the moment
await page.locator('#panel-toggle').click();
await page.waitForFunction((t) => window.__vine.getState().storyTime >= t, at, { timeout: 90000, polling: 16 });
await page.addStyleTag({ content: '.overlay, .caption, .masthead, .year-readout, .panel-toggle, .loader { display: none !important; }' });
await page.waitForTimeout(60);
const shot = await page.locator('#scene').screenshot({ type: 'png' });
// re-encode as webp in the page (Playwright writes png or jpeg only)
const dataUrl = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  // crop in on the two gardens (the stage leaves a tall sky above them): the middle 64%, at 7:5, down to the border
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const cw = W * 0.64;
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
writeFileSync(`${out}/preview-vine.webp`, buf);
console.log(`baked ${out}/preview-vine.webp (${Math.round(buf.length / 1024)} KB) at story ${at}s`);

// the landing entry's drifting leaves: painted by the scene's own leaf painter (src/vine/scene/leaves.ts), each
// at 4x the size it shows at, written as public/assets/vine-leaf-1..5.webp
const leaves = await page.evaluate(async () => {
  const { paintLeafInto } = await import('/src/vine/scene/leaves.ts');
  const { Rand } = await import('/src/scene/prng.ts');
  // [shape 0 maple / 1 oak / 2 birch, colour group (crimson, scarlet, rust, brown, amber, gold), tone 0 lit .. 2 shaded]
  const picks = [[0, 1, 0], [0, 4, 0], [1, 2, 1], [0, 0, 1], [2, 5, 0]];
  return picks.map(([shape, group, tone], i) => {
    const cv = document.createElement('canvas');
    cv.width = 192;
    cv.height = 192;
    const c = cv.getContext('2d');
    c.translate(96, 104);
    c.scale(11, 11);
    paintLeafInto(c, new Rand(8100 + i * 31), shape, group, tone, 1);
    return cv.toDataURL('image/webp', 0.9);
  });
});
leaves.forEach((u, i) => {
  const b = Buffer.from(u.split(',')[1], 'base64');
  writeFileSync(`${out}/vine-leaf-${i + 1}.webp`, b);
});
console.log(`baked ${leaves.length} leaves (${out}/vine-leaf-*.webp)`);
await browser.close();
