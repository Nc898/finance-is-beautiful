import type { Locator, Page, TestInfo } from '@playwright/test';

/** Shape of `window.__ttg.getState()` (see src/main.ts). */
export interface TtgState {
  inputs: {
    startAgeA: number;
    startAgeB: number;
    endAge: number;
    monthlyContribution: number;
    annualReturn: number;
  };
  draft: Record<string, string>;
  errors: Record<string, string>;
  targetScale: number;
  displayScale: number;
  ageMonths: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
  timelineStartMonths: number;
  timelineEndMonths: number;
  monthlyRate: number;
}

/**
 * Load the app and wait for the scene to be ready. The introduction (shown the first time per session) is skipped
 * unless `intro` is set; with it open the panel is left as it is (the page waits behind the introduction).
 */
export async function gotoReady(page: Page, opts: { pause?: boolean; query?: string; panel?: boolean; intro?: boolean } = {}): Promise<void> {
  const { pause = true, query = '', panel = true, intro = false } = opts;
  if (!intro) await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:time-to-grow', '1'));
  // Swallow Vite's HMR websocket: if source files are edited while the suite runs (other workers, editors), the dev
  // server would push a full-reload and wipe the in-memory app state mid-test. The app itself does not use websockets.
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/time-to-grow.html' + query);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 45_000 });
  // let the load reveal (opacity animations) finish before measuring contrast or layout
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && (a as CSSAnimation).animationName === 'reveal-in').map((a) => a.finished)));
  await frames(page, 2);
  if (pause) {
    await page.evaluate(() => window.__ttg.actions.pause());
    await frames(page, 2);
  }
  // The controls live in a collapsible side panel (closed by default on phones).
  if (!intro) await setPanel(page, panel);
}

/** Open or close the controls side panel and wait for its slide transition to settle. */
export async function setPanel(page: Page, open: boolean): Promise<void> {
  const toggle = page.locator('#panel-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== String(open)) {
    await toggle.click();
    await page.waitForTimeout(320);
  }
  await frames(page, 2);
}

/** Resolve after n animation frames (the app updates its DOM inside rAF). */
export async function frames(page: Page, n = 3): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const step = () => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    n,
  );
}

export async function state(page: Page): Promise<TtgState> {
  return (await page.evaluate(() => window.__ttg.getState())) as TtgState;
}

/**
 * The moments these tests look at, named by the second the old guided story showed them at (default inputs):
 * 0 s the first planting, 7 s three months in, 15 s the later planting, 18 s its first months, 37 s and on the end.
 * Moves the clock (paused) to the age of that moment for the current inputs, linearly between them.
 */
export async function atMoment(page: Page, seconds: number): Promise<void> {
  await page.evaluate((t) => {
    const s = window.__ttg.getState() as { inputs: { startAgeA: number; startAgeB: number; endAge: number } };
    const t0 = Math.min(s.inputs.startAgeA, s.inputs.startAgeB) * 12;
    const t1 = Math.max(s.inputs.startAgeA, s.inputs.startAgeB) * 12;
    const end = s.inputs.endAge * 12;
    const knots: Array<[number, number]> = [[0, t0], [7, Math.min(end, t0 + 3)]];
    if (t1 > t0) knots.push([15, t1], [18, Math.min(end, t1 + 4.8)]);
    knots.push([37, end]);
    let age = end;
    for (let k = 0; k < knots.length - 1; k++) {
      const [ta, aa] = knots[k];
      const [tb, ab] = knots[k + 1];
      if (t <= tb) {
        age = aa + ((ab - aa) * Math.max(0, t - ta)) / (tb - ta);
        break;
      }
    }
    window.__ttg.actions.scrubTo(Math.min(end, Math.max(t0, age)));
  }, seconds);
  await frames(page, 3);
}

/** Scrub the shared clock (paused). */
export async function scrub(page: Page, ageMonths: number): Promise<void> {
  await page.evaluate((m) => window.__ttg.actions.scrubTo(m), ageMonths);
  await frames(page, 3);
}

/** Drag the clock to the timeline end (the result), as a visitor would with the timeline. */
export async function skipToExplore(page: Page): Promise<void> {
  await page.evaluate(() => window.__ttg.actions.scrubTo(1e6));
  await frames(page, 3);
}

/** Open the "How this is calculated" details so the comparison table is kept live. */
export async function openDetails(page: Page): Promise<void> {
  await page.locator('#how > summary').click();
  await page.waitForFunction(() => (document.getElementById('how') as HTMLDetailsElement).open);
  await frames(page, 2);
}

export const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Independent copy of the display rule: whole dollars, true minus sign for negatives. */
export function usd(n: number): string {
  const body = usdFmt.format(Math.abs(n));
  return n < 0 && Math.round(Math.abs(n)) !== 0 ? '−' + body : body;
}

/**
 * Closed-form future value of an end-of-month annuity, computed independently of the engine:
 * i = (1 + annual)^(1/12) - 1, FV = c * ((1 + i)^n - 1) / i.
 */
export function annuityFV(contribution: number, annualReturn: number, months: number): number {
  const i = Math.pow(1 + annualReturn, 1 / 12) - 1;
  if (i === 0) return contribution * months;
  return contribution * ((Math.pow(1 + i, months) - 1) / i);
}

export interface PlateText {
  name: string;
  balance: string;
  split: string;
}

export async function plate(page: Page, id: 'A' | 'B'): Promise<PlateText> {
  const root = page.locator(`#plate-${id}`);
  const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  return {
    name: clean(await root.locator('.plate-name').textContent()),
    balance: clean(await root.locator('.plate-balance').textContent()),
    split: clean(await root.locator('.plate-split').textContent()),
  };
}

export async function diffText(page: Page): Promise<string> {
  return ((await page.locator('#diff-value').textContent()) ?? '').trim();
}

/** Visible caption lines (the active crossfade layer). */
export async function caption(page: Page): Promise<{ primary: string; secondary: string }> {
  const layer = page.locator('#caption .cap.on:not(.cap-ghost)').first();
  const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  return {
    primary: clean(await layer.locator('.cap-1').textContent()),
    secondary: clean(await layer.locator('.cap-2').textContent()),
  };
}

/** Type into a dock field and commit with Enter. */
export async function setField(page: Page, field: string, text: string): Promise<void> {
  const input = page.locator(`#f-${field}`);
  await input.fill(text);
  await input.press('Enter');
  await frames(page, 3);
}

export function field(page: Page, name: string): Locator {
  return page.locator(`#f-${name}`);
}

/** Canvas pixels as a data URL (the canvas is a 2D canvas, so readback is safe). */
export async function canvasData(page: Page): Promise<string> {
  return page.evaluate(() => (document.getElementById('scene') as HTMLCanvasElement).toDataURL('image/png'));
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function intersects(a: Box, b: Box, pad = 0): boolean {
  return a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;
}

export async function boxOf(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  if (!b) throw new Error('element has no bounding box');
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

export function projectName(info: TestInfo): string {
  return info.project.name;
}
