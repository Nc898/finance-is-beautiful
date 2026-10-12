import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames, usd } from './helpers';

/** Shape of `window.__river.getState()` (see src/river/main.ts). */
interface RiverState {
  inputs: { start: number; years: number; inflation: number; savingsRate: number; investRate: number };
  draft: Record<string, string>;
  errors: Record<string, string>;
  years: number;
  mode: 'story' | 'explore';
  storyTime: number;
  storyLength: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
  exploreHint: boolean;
  displayScale: number;
  targetScale: number;
  scale: number;
}

const state = async (page: Page) => (await page.evaluate(() => window.__river.getState())) as RiverState;

async function gotoRiver(page: Page, opts: { pause?: boolean } = {}): Promise<string[]> {
  const { pause = true } = opts;
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  // Swallow Vite's HMR websocket: a full-reload mid-test would wipe the in-memory app state.
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/against-the-current.html');
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 45_000 });
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect && (a as CSSAnimation).animationName === 'reveal-in').map((a) => a.finished)),
  );
  await frames(page, 2);
  if (pause) {
    await page.evaluate(() => window.__river.actions.pause());
    await frames(page, 2);
  }
  return errors;
}

const seek = async (page: Page, seconds: number) => {
  await page.evaluate((s) => window.__river.actions.seekStory(s), seconds);
  await frames(page, 3);
};

/** Independent closed-form copy of the model: what the page must show. */
function expected(inp: RiverState['inputs'], years: number) {
  const mk = (r: number) => {
    const nominal = inp.start * Math.pow(1 + r, years);
    return { nominal, real: nominal / Math.pow(1 + inp.inflation, years) };
  };
  return { cash: mk(0), savings: mk(inp.savingsRate), invest: mk(inp.investRate) };
}

const D = { start: 10_000, years: 30, inflation: 0.03, savingsRate: 0.02, investRate: 0.06 };

async function labelTexts(page: Page, id: 'cash' | 'savings' | 'invest') {
  const root = page.locator(`#lab-${id}`);
  const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  return {
    name: clean(await root.locator('.bl-name').textContent()),
    amount: clean(await root.locator('.bl-amount').textContent()),
    buys: clean(await root.locator('.bl-buys').textContent()),
  };
}

test.describe('Against the Current', () => {
  test('loads with the title, a described canvas, three labels and no console errors', async ({ page }) => {
    const errors = await gotoRiver(page);
    await expect(page).toHaveTitle('Against the Current');
    await expect(page.locator('h1 a')).toHaveAttribute('href', './');
    await expect(page.locator('h1 a')).toContainText('Against the Current');
    const canvas = page.locator('#scene');
    await expect(canvas).toHaveAttribute('role', 'img');
    const label = (await canvas.getAttribute('aria-label')) ?? '';
    expect(label).toContain('Three rowboats');
    expect(label).toContain('$10,000');
    for (const id of ['cash', 'savings', 'invest'] as const) await expect(page.locator(`#lab-${id}`)).toBeVisible();
    expect(await page.locator('#summary').textContent()).toBe(label);
    expect(errors).toEqual([]);
  });

  test('the story autoplays from the start and hands off to explore', async ({ page }) => {
    await gotoRiver(page, { pause: false });
    // autoplay: the story clock runs by itself
    await expect.poll(async () => (await state(page)).storyTime, { timeout: 10_000 }).toBeGreaterThan(0.3);
    expect((await state(page)).mode).toBe('story');
    await expect(page.locator('#caption .cap.on:not(.cap-ghost) .cap-1')).toContainText('Three boats. The same $10,000.');
    // run it to the end at 4x so the whole hand-off happens naturally
    await page.evaluate(() => window.__river.actions.setSpeed(4));
    await expect.poll(async () => (await state(page)).mode, { timeout: 40_000 }).toBe('explore');
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.years).toBe(30);
    expect(s.exploreHint).toBe(true);
    await expect(page.locator('#caption .cap.on:not(.cap-ghost) .cap-1')).toHaveText('Explore your own river');
  });

  test('skip goes straight to explore at the last year', async ({ page }) => {
    await gotoRiver(page, { pause: false });
    await page.locator('#btn-skip').click();
    await frames(page, 3);
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.years).toBe(30);
    await expect(page.locator('#btn-skip')).toBeHidden();
    await expect(page.locator('#btn-play')).toContainText('Play');
  });

  test('the numbers at the end match the engine (labels, readouts and table)', async ({ page }) => {
    await gotoRiver(page);
    await page.locator('#btn-skip').click();
    await frames(page, 3);
    const e = expected(D, 30);
    expect(await labelTexts(page, 'cash')).toEqual({ name: 'Cash', amount: usd(10_000), buys: `buys what ${usd(e.cash.real)} buys today` });
    expect(await labelTexts(page, 'savings')).toEqual({
      name: 'Savings account · 2%',
      amount: usd(e.savings.nominal),
      buys: `buys what ${usd(e.savings.real)} buys today`,
    });
    expect(await labelTexts(page, 'invest')).toEqual({
      name: 'Investing · 6%',
      amount: usd(e.invest.nominal),
      buys: `buys what ${usd(e.invest.real)} buys today`,
    });
    // the documented defaults
    expect(usd(e.cash.real)).toBe('$4,120');
    expect(usd(e.savings.nominal)).toBe('$18,114');
    expect(usd(e.savings.real)).toBe('$7,463');
    expect(usd(e.invest.nominal)).toBe('$57,435');
    expect(usd(e.invest.real)).toBe('$23,662');
    await expect(page.locator('#year-readout')).toHaveText('Year 30');
    await expect(page.locator('#age-readout')).toHaveText('Year 30');
    await page.locator('#how > summary').click();
    await frames(page, 2);
    for (const id of ['cash', 'savings', 'invest'] as const) {
      await expect(page.locator(`[data-cell="${id}.nominal"]`)).toHaveText(usd(e[id].nominal));
      await expect(page.locator(`[data-cell="${id}.real"]`)).toHaveText(usd(e[id].real));
    }
    await expect(page.locator('[data-cell="cash.change"]')).toHaveText('−59%');
    await expect(page.locator('[data-cell="invest.change"]')).toHaveText('+137%');
    await expect(page.locator('#how-age')).toHaveText('year 30');
  });

  test('story captions carry the live results', async ({ page }) => {
    await gotoRiver(page);
    await seek(page, 40);
    await page.waitForTimeout(800);
    const cap = page.locator('#caption .cap.on:not(.cap-ghost)');
    await expect(cap.locator('.cap-1')).toHaveText('Still $10,000 in cash. It buys what $4,120 buys today.');
    await expect(cap.locator('.cap-2')).toContainText('$57,435');
    await seek(page, 22);
    await page.waitForTimeout(800);
    await expect(page.locator('#caption .cap.on:not(.cap-ghost) .cap-1')).toHaveText('A savings account rows, but slower than the current.');
  });

  test('changing inflation re-renders the numbers and the shared scale', async ({ page }) => {
    await gotoRiver(page);
    await page.locator('#btn-skip').click();
    const before = await state(page);
    await page.locator('#f-inflation').fill('6');
    await page.locator('#f-inflation').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.inputs.inflation).toBeCloseTo(0.06, 12);
    expect(s.targetScale).toBeGreaterThan(before.targetScale);
    await expect.poll(async () => (await state(page)).displayScale, { timeout: 5000 }).toBeCloseTo(s.targetScale, 6);
    const e = expected({ ...D, inflation: 0.06 }, 30);
    expect((await labelTexts(page, 'cash')).buys).toBe(`buys what ${usd(e.cash.real)} buys today`);
    expect((await labelTexts(page, 'invest')).buys).toBe(`buys what ${usd(e.invest.real)} buys today`);
    expect((await labelTexts(page, 'cash')).amount).toBe('$10,000');
  });

  test('the timeline works from the keyboard', async ({ page }) => {
    await gotoRiver(page);
    const timeline = page.locator('#timeline');
    await timeline.focus();
    await page.keyboard.press('Home');
    await frames(page, 2);
    expect((await state(page)).years).toBe(0);
    await expect(timeline).toHaveAttribute('aria-valuetext', 'Year 0');
    await page.keyboard.press('ArrowRight');
    await frames(page, 2);
    expect((await state(page)).years).toBeCloseTo(1 / 12, 9);
    await page.keyboard.press('PageUp');
    await frames(page, 2);
    expect((await state(page)).years).toBeCloseTo(1 + 1 / 12, 9);
    await expect(timeline).toHaveAttribute('aria-valuetext', 'Year 1, 1 month');
    await page.keyboard.press('End');
    await frames(page, 2);
    expect((await state(page)).years).toBe(30);
    await page.keyboard.press('PageDown');
    await frames(page, 2);
    expect((await state(page)).years).toBe(29);
    await expect(page.locator('#year-readout')).toHaveText('Year 29');
    // scrubbing leaves the story and pauses
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.playing).toBe(false);
    // the labels follow the clock
    const e = expected(D, 29);
    expect((await labelTexts(page, 'invest')).amount).toBe(usd(e.invest.nominal));
  });

  test('the timeline has a tick label every five years', async ({ page }) => {
    await gotoRiver(page);
    const labels = await page.locator('#scale-ticks .tick-label').allTextContents();
    expect(labels).toEqual(['0', '5', '10', '15', '20', '25', '30']);
    await page.locator('#f-years').fill('12');
    await page.locator('#f-years').press('Enter');
    await frames(page, 2);
    expect(await page.locator('#scale-ticks .tick-label').allTextContents()).toEqual(['0', '5', '10', '12']);
    await expect(page.locator('#timeline')).toHaveAttribute('max', String(12 * 12));
  });

  test('an invalid input shows an inline error and keeps the last valid numbers', async ({ page }) => {
    await gotoRiver(page);
    await page.locator('#btn-skip').click();
    const input = page.locator('#f-investRate');
    await input.fill('20');
    await input.press('Enter');
    await expect(page.locator('#err-investRate')).toBeVisible();
    await expect(page.locator('#err-investRate')).toHaveText('The investment return must be between −5% and 15%.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await state(page)).inputs.investRate).toBeCloseTo(0.06, 12);
    expect((await labelTexts(page, 'invest')).name).toBe('Investing · 6%');
    // not a number
    await input.fill('lots');
    await input.press('Enter');
    await expect(page.locator('#err-investRate')).toHaveText('The investment return must be a number.');
    // fixing it clears the error
    await input.fill('7');
    await input.press('Enter');
    await expect(page.locator('#err-investRate')).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect((await labelTexts(page, 'invest')).name).toBe('Investing · 7%');
    // whole years only
    await page.locator('#f-years').fill('12.5');
    await page.locator('#f-years').press('Enter');
    await expect(page.locator('#err-years')).toContainText('whole number');
  });

  test('negative investment returns are accepted and shown with a true minus sign', async ({ page }) => {
    await gotoRiver(page);
    await page.locator('#btn-skip').click();
    await page.locator('#f-investRate').fill('-2');
    await page.locator('#f-investRate').press('Enter');
    await frames(page, 3);
    expect((await state(page)).inputs.investRate).toBeCloseTo(-0.02, 12);
    expect((await labelTexts(page, 'invest')).name).toBe('Investing · −2%');
    const e = expected({ ...D, investRate: -0.02 }, 30);
    expect((await labelTexts(page, 'invest')).amount).toBe(usd(e.invest.nominal));
  });

  test('steppers change values and the starting amount reads with grouping', async ({ page }) => {
    await gotoRiver(page);
    await expect(page.locator('#f-start')).toHaveValue('10,000');
    await page.getByRole('button', { name: 'Increase starting amount' }).click();
    await expect(page.locator('#f-start')).toHaveValue('11,000');
    await page.getByRole('button', { name: 'Decrease inflation' }).click();
    await expect(page.locator('#f-inflation')).toHaveValue('2.5');
    expect((await state(page)).inputs.inflation).toBeCloseTo(0.025, 12);
  });

  test('play, pause and speed work in explore', async ({ page }) => {
    await gotoRiver(page);
    await page.locator('#btn-skip').click();
    await page.evaluate(() => window.__river.actions.scrubTo(0));
    await page.locator('#btn-play').click();
    await expect(page.locator('#btn-play')).toContainText('Pause');
    await page.locator('.speed:has-text("4×")').click();
    await expect.poll(async () => (await state(page)).years, { timeout: 8000 }).toBeGreaterThan(2);
    await page.locator('#btn-play').click();
    const y = (await state(page)).years;
    await page.waitForTimeout(300);
    expect((await state(page)).years).toBe(y);
    await expect(page.locator('#btn-play')).toHaveText(/Play/);
    expect((await state(page)).speed).toBe(4);
  });

  test('the panel collapses and Space plays', async ({ page }) => {
    await gotoRiver(page);
    const toggle = page.locator('#panel-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#dock')).toBeHidden({ timeout: 2000 });
    await toggle.click();
    await expect(page.locator('#dock')).toBeVisible();
    await page.locator('#btn-skip').click();
    await page.evaluate(() => window.__river.actions.scrubTo(0));
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).playing).toBe(true);
  });

  test('labels sit inside the stage and do not overlap each other', async ({ page }) => {
    await gotoRiver(page);
    for (const t of [12, 20, 30, 40]) {
      await seek(page, t);
      await page.waitForTimeout(500);
      const boxes = await page.evaluate(() =>
        ['cash', 'savings', 'invest'].map((id) => {
          const r = document.getElementById(`lab-${id}`)!.getBoundingClientRect();
          return { id, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      // the visible river is the stage minus the open panel
      const limit = (await page.locator('#dock').boundingBox())!.x;
      for (const b of boxes) {
        expect(b.x, `${b.id} at t=${t}`).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.w, `${b.id} at t=${t}`).toBeLessThanOrEqual(limit + 1);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.id} vs ${b.id} at t=${t}`).toBe(false);
        }
      }
    }
  });

  test('announcements are discrete: the live region only changes on events', async ({ page }) => {
    await gotoRiver(page, { pause: false });
    const region = page.locator('#announcer');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await page.evaluate(() => window.__river.actions.pause());
    await expect(region).toContainText('Paused');
    const before = await region.textContent();
    await page.waitForTimeout(1200);
    expect(await region.textContent()).toBe(before); // nothing per frame while idle
    await page.locator('#f-inflation').fill('5');
    await page.locator('#f-inflation').press('Enter');
    await expect(region).toContainText('Updated. After 30 years', { timeout: 3000 });
  });

  test('reduced motion: no autoplay, labels still show, story still reaches the numbers', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = await gotoRiver(page, { pause: false });
    await page.waitForTimeout(800);
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.storyTime).toBe(0);
    await expect(page.locator('#reduce-motion')).toBeChecked();
    for (const id of ['cash', 'savings', 'invest']) await expect(page.locator(`#lab-${id}`)).toBeVisible();
    await page.locator('#btn-skip').click();
    await frames(page, 3);
    expect((await labelTexts(page, 'cash')).buys).toBe('buys what $4,120 buys today');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

const TAGS = ['wcag2a', 'wcag2aa'];

function describeViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>): string {
  return results.violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n` +
        v.nodes
          .slice(0, 6)
          .map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary?.replace(/\n/g, '\n      ')}`)
          .join('\n'),
    )
    .join('\n');
}

test.describe('Against the Current: accessibility', () => {
  test('axe: no violations in explore, with details open, with an error showing, and during the story', async ({ page }) => {
    await gotoRiver(page);
    await page.evaluate(() => document.fonts.ready);
    for (const t of [3, 40]) {
      await seek(page, t);
      await page.waitForTimeout(1200);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(r.violations, `story t=${t}\n` + describeViolations(r)).toEqual([]);
    }
    await page.locator('#btn-skip').click();
    await page.waitForTimeout(1800);
    let results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'explore\n' + describeViolations(results)).toEqual([]);

    await page.locator('#how > summary').click();
    await page.evaluate(() => window.__river.actions.scrubTo(12.25));
    await page.waitForTimeout(600);
    results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'details open\n' + describeViolations(results)).toEqual([]);

    await page.locator('#f-inflation').fill('40');
    await page.locator('#f-inflation').press('Enter');
    await expect(page.locator('#err-inflation')).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'error\n' + describeViolations(results)).toEqual([]);
  });

  test('controls have accessible names and the title link goes back to the collection', async ({ page }) => {
    await gotoRiver(page);
    await expect(page.getByRole('link', { name: /back to all demonstrations/ })).toHaveAttribute('href', './');
    await expect(page.getByRole('slider', { name: 'Timeline year' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Playback speed' })).toBeVisible();
    for (const name of ['Starting amount', 'Years', 'Inflation', 'Savings account', 'Investment return']) {
      await expect(page.getByRole('textbox', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeVisible();
    await expect(page.locator('#announcer')).toHaveAttribute('role', 'status');
  });
});
