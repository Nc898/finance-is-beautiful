// Usage: node scripts/shoot-slice.mjs [tag] [seed]
// Needs the dev server on :5174. Saves PNGs under docs/screens/.
import { createRequire } from 'node:module';
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = createRequire(import.meta.url)(PW);
import { mkdirSync } from 'node:fs';

const tag = process.argv[2] ?? 'slice';
const seed = process.argv[3] ?? '1337';
const out = 'docs/screens';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: process.env.SOFT ? [] : ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu-rasterization','--disable-software-rasterizer'] });
const page = await browser.newPage({ viewport: { width: 1340, height: 1500 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5174/slice.html');
await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
if (seed !== '1337') await page.evaluate((s) => window.__slice.setSeed(Number(s)), seed);

const shootEl = async (sel, name) => {
  await (await page.$(sel)).screenshot({ path: `${out}/${tag}-${name}.png` });
};
await page.screenshot({ path: `${out}/${tag}-page.png`, fullPage: true });
await shootEl('#small', 'panels');
await shootEl('#p1', 'm008');
await shootEl('#p2', 'm020');
await shootEl('#p3', 'm045');
await shootEl('#p4', 'm100');

const scrub = [
  ['seedling', 0.02, 12],
  ['seedling-m2', 0.02, 2.5],
  ['young', 0.2, 12],
  ['mid', 0.45, 12],
  ['mature', 1.0, 12],
];
for (const [name, m, months] of scrub) {
  await page.evaluate(([m, mo]) => window.__slice.setState(m, mo, false), [m, months]);
  await shootEl('#big', `scrub-${name}`);
}
await page.evaluate(() => window.__slice.setState(0.45, 12, false));
const info = await page.evaluate(async () => {
  const check = window.__slice.selfCheck();
  const perf = window.__slice.perfSingle(); const scene = await window.__slice.perfScene(); const load = window.__slice.loadMs();
  return { check, perf, scene, load, stats: window.__slice.stats() };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
