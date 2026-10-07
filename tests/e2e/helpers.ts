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
  mode: 'story' | 'explore';
  storyTime: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
  exploreHint: boolean;
  timelineStartMonths: number;
  timelineEndMonths: number;
  monthlyRate: number;
}

/** Story length at 1x in normal motion (docs/APP_SPEC.md). */
export const STORY_DURATION = 54;

/** Load the app and wait for the scene to be ready. By default the autoplaying story is paused so tests are deterministic. */
export async function gotoReady(page: Page, opts: { pause?: boolean; query?: string; panel?: boolean } = {}): Promise<void> {
  const { pause = true, query = '', panel = true } = opts;
  // Swallow Vite's HMR websocket: if source files are edited while the suite runs (other workers, editors), the dev
  // server would push a full-reload and wipe the in-memory app state mid-test. The app itself does not use websockets.
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/' + query);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 45_000 });
  await frames(page, 2);
  if (pause) {
    await page.evaluate(() => window.__ttg.actions.pause());
    await frames(page, 2);
  }
  // The controls live in a collapsible side panel (closed by default on phones).
  await setPanel(page, panel);
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

/** Jump the guided story clock (story mode) and let the DOM catch up. */
export async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => window.__ttg.actions.seekStory(s), seconds);
  await frames(page, 3);
}

/** Story length in seconds for the current inputs and motion preference (54 s normally, ~34.5 s in reduced motion). */
export async function storyLength(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.__ttg.actions.seekStory(1e6);
    return (window.__ttg.getState() as { storyTime: number }).storyTime;
  });
}

/** Seek to a fraction of the story, so beat-based assertions hold for both the normal and reduced-motion timelines. */
export async function seekFrac(page: Page, fraction: number): Promise<void> {
  const len = await storyLength(page);
  await seek(page, fraction * len);
}

/** Scrub the shared clock (enters explore mode, paused). */
export async function scrub(page: Page, ageMonths: number): Promise<void> {
  await page.evaluate((m) => window.__ttg.actions.scrubTo(m), ageMonths);
  await frames(page, 3);
}

/** Jump to the explore state at the timeline end (the "Skip to explore" result). */
export async function skipToExplore(page: Page): Promise<void> {
  await page.evaluate(() => window.__ttg.actions.skipToExplore());
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
