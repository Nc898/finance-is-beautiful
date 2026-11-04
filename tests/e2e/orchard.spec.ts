import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames } from './helpers';

/** Shape of `window.__orchard.getState()` (see src/orchard/main.ts). */
interface OrchardState {
  inputs: { salary: number; years: number; growth: number; match: { rate: number; limit: number }; save: { a: number; b: number } };
  errors: Record<string, string>;
  months: number;
  horizon: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
}

const state = async (page: Page) => (await page.evaluate(() => window.__orchard.getState())) as OrchardState;

async function gotoOrchard(page: Page, opts: { intro?: boolean } = {}): Promise<string[]> {
  const { intro = false } = opts;
  // the introduction shows the first time a demonstration is opened in a session: most tests start past it
  if (!intro) await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:low-hanging-fruit', '1'));
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/low-hanging-fruit.html');
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  await frames(page, 2);
  if (!intro) await openPanel(page);
  return errors;
}

/** Phones start with the controls folded away: open them, as a visitor would. */
async function openPanel(page: Page): Promise<void> {
  const toggle = page.locator('#panel-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
    await expect(page.locator('#dock')).toBeVisible();
    await frames(page, 2);
  }
}

/** On a phone the open panel covers the stage: fold it to reach the stage's own buttons, then open it again. */
async function onStage(page: Page, act: () => Promise<void>): Promise<void> {
  const toggle = page.locator('#panel-toggle');
  const covers = (page.viewportSize()?.width ?? 1440) < 700 && (await toggle.getAttribute('aria-expanded')) === 'true';
  if (covers) {
    await toggle.click();
    await expect(page.locator('#dock')).toBeHidden();
  }
  await act();
  if (covers) {
    await toggle.click();
    await expect(page.locator('#dock')).toBeVisible();
  }
}

const scrub = async (page: Page, months: number) => {
  await page.evaluate((m) => window.__orchard.actions.scrubTo(m), months);
  await frames(page, 3);
};

const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const cap = (page: Page) => page.locator('#caption .cap.on:not(.cap-ghost)');
const plate = async (page: Page, id: 'a' | 'b') => ({
  name: clean(await page.locator(`#plate-${id} .plate-name`).textContent()),
  terms: clean(await page.locator(`#plate-${id} .plate-terms`).textContent()),
  worth: clean(await page.locator(`#plate-${id} .plate-worth`).textContent()),
  missed: clean(await page.locator(`#plate-${id} .plate-missed`).textContent()),
});

/** Independent savings, written for this spec: what the page must show (value at the end of each month). */
function grow(salary: number, years: number, growth: number, save: number, rate: number, limit: number) {
  const own = (salary / 12) * save;
  const match = (salary / 12) * rate * Math.min(save, limit);
  const missed = (salary / 12) * rate * limit - match;
  let value = 0;
  let missedValue = 0;
  const values: number[] = [0];
  for (let k = 1; k <= years * 12; k++) {
    value = value * (1 + growth / 12) + own + match;
    missedValue = missedValue * (1 + growth / 12) + missed;
    values.push(value);
  }
  return { own, match, missed, values, missedValue };
}
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

test.describe('Low-Hanging Fruit', () => {
  test('loads with the title, a described canvas, both labels and no console errors', async ({ page }) => {
    const errors = await gotoOrchard(page);
    await expect(page).toHaveTitle('Low-Hanging Fruit');
    await expect(page.locator('#scene')).toHaveAttribute('aria-label', /Two young apple orchards on a farm/);
    expect((await plate(page, 'a')).name).toBe('Saves 3%');
    expect((await plate(page, 'b')).name).toBe('Saves 6%');
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });

  test('opens with the introduction; it closes to month 0, paused, and stays closed', async ({ page }) => {
    const errors = await gotoOrchard(page, { intro: true });
    const intro = page.locator('#intro');
    await expect(intro).toBeVisible();
    await expect(intro.getByRole('heading', { name: 'Low-Hanging Fruit' })).toBeVisible();
    await expect(intro).toContainText('Saving at work');
    await expect(intro).toContainText('golden apples');
    await expect(page.locator('[data-intro-close]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(intro).toBeHidden();
    let s = await state(page);
    expect(s.months).toBe(0);
    expect(s.playing).toBe(false);
    // (the dialog's close event, which remembers it for the session, comes a moment after it hides)
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('fib-intro-seen:low-hanging-fruit'))).toBe('1');
    await page.reload();
    await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
    await frames(page, 3);
    await expect(intro).toBeHidden();
    await onStage(page, () => page.locator('#btn-about').click());
    await expect(intro).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(intro).toBeHidden();
    s = await state(page);
    expect(s.months).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the numbers match an independent calculation (labels, difference and table)', async ({ page }) => {
    await gotoOrchard(page);
    const A = grow(60_000, 30, 0.07, 0.03, 0.5, 0.06);
    const B = grow(60_000, 30, 0.07, 0.06, 0.5, 0.06);
    expect((await plate(page, 'a')).terms).toBe(`${usd(A.own)} a month + ${usd(A.match)} match`);
    expect((await plate(page, 'b')).terms).toBe(`${usd(B.own)} a month + ${usd(B.match)} match`);
    await scrub(page, 240);
    expect((await plate(page, 'a')).worth).toBe(`Worth ${usd(A.values[240]!)}`);
    expect((await plate(page, 'b')).worth).toBe(`Worth ${usd(B.values[240]!)}`);
    expect((await plate(page, 'a')).missed).toBe(`${usd(A.missed * 240)} left on the branch`);
    await expect(page.locator('#plate-b .plate-missed')).toBeHidden();
    await expect(page.locator('#diff-label')).toHaveText('B is ahead by');
    await scrub(page, 360);
    expect((await plate(page, 'a')).worth).toBe(`Worth ${usd(A.values[360]!)}`);
    await expect(page.locator('#diff-label')).toHaveText('B ends ahead by');
    await expect(page.locator('#diff-value')).toHaveText(usd(Math.round(B.values[360]!) - Math.round(A.values[360]!)));
    await expect(page.locator('#diff')).toHaveClass(/final/);
    await page.locator('#how summary').click();
    await expect(page.locator('[data-cell="a.final"]')).toHaveText('$274,493.47');
    await expect(page.locator('[data-cell="b.final"]')).toHaveText('$548,986.95');
    await expect(page.locator('[data-cell="a.missedGrew"]')).toHaveText(usd(A.missedValue));
    await expect(page.locator('[data-cell="a.ownFormula"]')).toHaveText('$60,000 ÷ 12 × 3% = $150.00');
  });

  test('the notes follow the month, played or dragged', async ({ page }) => {
    await gotoOrchard(page);
    await expect(cap(page).locator('.cap-1')).toHaveText('The same pay. The same match.');
    await expect(cap(page).locator('.cap-2')).toHaveText('Work adds 50¢ for every $1 saved, up to 6% of pay.');
    await scrub(page, 6);
    await expect(cap(page).locator('.cap-1')).toHaveText('A saves 3% of pay. B saves 6%.');
    await scrub(page, 30);
    await expect(cap(page).locator('.cap-1')).toHaveText('A leaves $75 a month of free money on the branch.');
    await scrub(page, 120);
    await expect(cap(page).locator('.cap-1')).toHaveText('Every tree keeps growing.');
    await expect(cap(page).locator('.cap-2')).toHaveText('So far: A $38,944, B $77,888.');
    await scrub(page, 240);
    await expect(cap(page).locator('.cap-1')).toHaveText('Now the growth outweighs everything put in.');
    await expect(cap(page).locator('.cap-2')).toHaveText('Left on the branch so far: $18,000. Grown, it would be $39,069.');
    await scrub(page, 360);
    await expect(cap(page).locator('.cap-1')).toHaveText('A: $274,493. B: $548,987.');
    await expect(cap(page).locator('.cap-2')).toHaveText('The match alone grew to $91,498 for A and $182,996 for B.');
  });

  test('changing the inputs re-renders the numbers; a bad value shows an error and keeps the last good one', async ({ page }) => {
    await gotoOrchard(page);
    await page.locator('#f-a-save').fill('8');
    await page.locator('#f-a-save').press('Enter');
    await frames(page, 3);
    expect((await state(page)).inputs.save.a).toBe(0.08);
    expect((await plate(page, 'a')).name).toBe('Saves 8%');
    expect((await plate(page, 'a')).terms).toBe('$400 a month + $150 match');
    await expect(page.locator('#plate-a .plate-missed')).toBeHidden();
    await page.locator('#f-years').fill('50');
    await page.locator('#f-years').press('Enter');
    await frames(page, 2);
    await expect(page.locator('#f-years')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-years')).toBeVisible();
    expect((await state(page)).inputs.years).toBe(30);
    // the same savings twice: the difference is taken away (one plain note instead)
    await page.locator('#f-years').fill('30');
    await page.locator('#f-years').press('Enter');
    await scrub(page, 360);
    await expect(page.locator('#diff')).toBeVisible();
    await page.locator('#f-b-save').fill('8');
    await page.locator('#f-b-save').press('Enter');
    await frames(page, 3);
    await expect(page.locator('#diff')).toBeHidden();
    await expect(cap(page).locator('.cap-1')).toHaveText('The same savings twice: both orchards grow alike.');
  });

  test('play, pause and speed work; Play at the end starts again from month 0', async ({ page }) => {
    await gotoOrchard(page);
    await page.locator('#btn-play').click();
    await expect.poll(async () => (await state(page)).months, { timeout: 5000 }).toBeGreaterThan(5);
    await page.locator('#btn-play').click();
    const m = (await state(page)).months;
    await page.waitForTimeout(300);
    expect((await state(page)).months).toBe(m);
    await page.evaluate(() => window.__orchard.actions.setSpeed(5));
    await expect(page.locator('#speed-readout')).toHaveText('5×');
    await page.evaluate(() => window.__orchard.actions.setSpeed(1));
    await scrub(page, 360);
    await page.locator('#btn-play').click();
    await frames(page, 2);
    expect((await state(page)).months).toBeLessThan(20);
  });

  test('the scene is given the pickers from the engine', async ({ page }) => {
    await gotoOrchard(page);
    await scrub(page, 360);
    const v = await page.evaluate(() => window.__orchard.visuals());
    expect(v[0]!.trees).toHaveLength(18);
    expect(v[1]!.trees).toHaveLength(36);
    expect(v[0]!.picked).toBeCloseTo(0.5, 9);
    expect(v[1]!.done).toBe(true);
    expect(v[1]!.planting).toBe(35);
  });

  test('the timeline works from the keyboard', async ({ page }) => {
    await gotoOrchard(page);
    const tl = page.locator('#timeline');
    await tl.focus();
    await page.keyboard.press('PageUp');
    await frames(page, 2);
    expect((await state(page)).months).toBe(12);
    await page.keyboard.press('End');
    await frames(page, 2);
    expect((await state(page)).months).toBe(360);
    await expect(tl).toHaveAttribute('aria-valuetext', 'Year 30, month 0');
  });

  test('the labels sit inside the stage and do not overlap', async ({ page }) => {
    await gotoOrchard(page);
    await scrub(page, 100);
    const r = await page.evaluate(() => {
      const box = (id: string) => document.getElementById(id)!.getBoundingClientRect();
      return { a: box('plate-a'), b: box('plate-b'), d: box('diff'), stage: box('stage'), w: window.innerWidth };
    });
    const overlap = (p: DOMRect, q: DOMRect) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
    expect(overlap(r.a, r.b)).toBe(false);
    expect(overlap(r.a, r.d)).toBe(false);
    expect(overlap(r.b, r.d)).toBe(false);
    for (const p of [r.a, r.b]) {
      expect(p.left).toBeGreaterThanOrEqual(-1);
      expect(p.right).toBeLessThanOrEqual(r.w + 1);
      expect(p.bottom).toBeLessThanOrEqual(r.stage.bottom + 1);
    }
  });

  test('reduced motion: nothing plays by itself, and the numbers are the same', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoOrchard(page);
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    await scrub(page, 360);
    await expect(page.locator('#diff-value')).toHaveText('$274,494');
  });
});

test.describe('Low-Hanging Fruit: accessibility', () => {
  test('axe: no violations with the introduction open, at month 0, mid-way and at the end', async ({ page }) => {
    await gotoOrchard(page, { intro: true });
    const run = async (label: string) => {
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(res.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    };
    await expect(page.locator('#intro')).toBeVisible();
    await run('intro');
    await page.keyboard.press('Escape');
    await openPanel(page);
    await run('month 0');
    await scrub(page, 150);
    await run('mid-way');
    await scrub(page, 360);
    await run('end');
  });

  test('controls have accessible names and the title link goes back to the collection', async ({ page }) => {
    await gotoOrchard(page);
    for (const id of ['btn-play', 'timeline', 'f-salary', 'f-years', 'f-growth', 'f-rate', 'f-limit', 'f-a-save', 'f-b-save', 'reduce-motion', 'speed']) {
      await expect(page.locator(`#${id}`), id).toHaveAccessibleName(/\S/);
    }
    await expect(page.locator('.title-link')).toHaveAttribute('href', './index.html');
  });
});
