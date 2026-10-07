// Usage: node scripts/bake-assets.mjs   (dev server on :5174)
// Exports the foliage sprite atlas (+ JSON frame map) and a seamless paper tile to public/assets/.
// The runtime loads them when present and falls back to procedural generation otherwise.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const out = 'public/assets';
mkdirSync(out, { recursive: true });
// make sure the page bakes from procedural sprites, not from a previous bake
for (const f of ['foliage-atlas.png', 'foliage-atlas.json', 'paper-tile.png']) rmSync(`${out}/${f}`, { force: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1340, height: 1500 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5174/slice.html');
await page.waitForSelector('body[data-ready="1"]', { timeout: 180000 });
const r = await page.evaluate(() => window.__slice.bake());
const b64 = (u) => Buffer.from(u.split(',')[1], 'base64');
writeFileSync(`${out}/foliage-atlas.png`, b64(r.atlas));
writeFileSync(`${out}/foliage-atlas.json`, JSON.stringify(r.json));
writeFileSync(`${out}/paper-tile.png`, b64(r.paper));
console.log('baked', Object.keys(r.json.frames).map((k) => `${k}:${r.json.frames[k].length}`).join(' '));
await browser.close();
