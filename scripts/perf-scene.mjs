import { createRequire } from 'node:module';
const PW = process.env.PLAYWRIGHT_PATH ?? 'C:/Users/Nick/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1820, height: 1000 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5174/scene-test.html', { timeout: 120000 });
await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
for (let i = 0; i < 4; i++) {
  const r = await page.evaluate(() => window.__scene.perf());
  console.log(JSON.stringify(r));
}
const st = await page.evaluate(async () => { const m = await import('/src/scene/treeModel.ts'); const t = m.generateTree(1337); return t.stats; });
console.log(JSON.stringify(st));
await browser.close();
