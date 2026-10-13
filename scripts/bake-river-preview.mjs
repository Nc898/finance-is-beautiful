// Usage: node scripts/bake-river-preview.mjs [port]   (dev server running, default :5180)
// Paints the landing page's Against the Current still with the real river scene (src/river/preview.ts) and
// writes it to public/assets/preview-river.webp. Re-run after changing the river's art.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const port = process.argv[2] ?? '5180';
const out = 'public/assets';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// any page on the dev server will do: it only provides the origin the module is imported from
await page.goto(`http://localhost:${port}/river-scene-test.html`);
const dataUrl = await page.evaluate(async () => {
  const { paintRiverStill } = await import('/src/river/preview.ts');
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:500px';
  document.body.append(cv);
  // the landing card is about 650 x 465 CSS px, so 700 x 500 at 2x stays sharp on high-density screens
  await paintRiverStill(cv, 700, 500, 2);
  return cv.toDataURL('image/webp', 0.9);
});
const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(`${out}/preview-river.webp`, buf);
console.log(`baked ${out}/preview-river.webp (${Math.round(buf.length / 1024)} KB)`);
await browser.close();
