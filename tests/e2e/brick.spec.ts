import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames } from './helpers';

/** Shape of `window.__brick.getState()` (see src/brick/main.ts). */
interface BrickState {
  inputs: { amount: number; loans: { a: { years: number; apr: number }; b: { years: number; apr: number } } };
  errors: Record<string, string>;
  months: number;
  horizon: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
}

const state = async (page: Page) => (await page.evaluate(() => window.__brick.getState())) as BrickState;

async function gotoBrick(page: Page, opts: { intro?: boolean } = {}): Promise<string[]> {
  const { intro = false } = opts;
  // the introduction shows the first time a demonstration is opened in a session: most tests start past it
  if (!intro) await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:brick-by-brick', '1'));
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/brick-by-brick.html');
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
  await page.evaluate((m) => window.__brick.actions.scrubTo(m), months);
  await frames(page, 3);
};

const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const cap = (page: Page) => page.locator('#caption .cap.on:not(.cap-ghost)');
const plate = async (page: Page, id: 'a' | 'b') => ({
  name: clean(await page.locator(`#plate-${id} .plate-name`).textContent()),
  terms: clean(await page.locator(`#plate-${id} .plate-terms`).textContent()),
  owed: clean(await page.locator(`#plate-${id} .plate-owed`).textContent()),
  interest: clean(await page.locator(`#plate-${id} .plate-interest`).textContent()),
});

/** Independent amortization, written for this spec: what the page must show. */
function amortize(amount: number, years: number, apr: number) {
  const n = years * 12;
  const r = apr / 12;
  const pay = r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
  let bal = amount;
  let interest = 0;
  const owed: number[] = [amount];
  for (let k = 1; k <= n; k++) {
    const i = bal * r;
    interest += i;
    bal = k === n ? 0 : bal - (pay - i);
    owed.push(bal);
  }
  return { pay, interest, owed };
}
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

test.describe('Brick by Brick', () => {
  test('loads with the title, a described canvas, both labels and no console errors', async ({ page }) => {
    const errors = await gotoBrick(page);
    await expect(page).toHaveTitle('Brick by Brick');
    await expect(page.locator('#scene')).toHaveAttribute('aria-label', /Two brick houses going up side by side/);
    expect((await plate(page, 'a')).name).toBe('30-year loan');
    expect((await plate(page, 'b')).name).toBe('15-year loan');
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });

  test('opens with the introduction; it closes to month 0, paused, and stays closed', async ({ page }) => {
    const errors = await gotoBrick(page, { intro: true });
    const intro = page.locator('#intro');
    await expect(intro).toBeVisible();
    await expect(intro.getByRole('heading', { name: 'Brick by Brick' })).toBeVisible();
    await expect(intro).toContainText('The pencil drawing');
    await expect(page.locator('[data-intro-close]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(intro).toBeHidden();
    let s = await state(page);
    expect(s.months).toBe(0);
    expect(s.playing).toBe(false);
    // (the dialog's close event, which remembers it for the session, comes a moment after it hides)
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('fib-intro-seen:brick-by-brick'))).toBe('1');
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

  test('the numbers match an independent amortization (labels, difference and table)', async ({ page }) => {
    await gotoBrick(page);
    const A = amortize(300_000, 30, 0.065);
    const B = amortize(300_000, 15, 0.0575);
    expect((await plate(page, 'a')).terms).toBe(`6.5% · ${usd(A.pay)} a month`);
    expect((await plate(page, 'b')).terms).toBe(`5.75% · ${usd(B.pay)} a month`);
    await scrub(page, 180);
    expect((await plate(page, 'a')).owed).toBe(`${usd(A.owed[180]!)} still owed`);
    expect((await plate(page, 'b')).owed).toBe('Paid off in 15 years');
    await scrub(page, 360);
    expect((await plate(page, 'a')).interest).toBe(`${usd(A.interest)} in interest`);
    expect((await plate(page, 'b')).interest).toBe(`${usd(B.interest)} in interest`);
    await expect(page.locator('#diff-value')).toHaveText(usd(Math.round(A.interest) - Math.round(B.interest)));
    await expect(page.locator('#diff')).toHaveClass(/final/);
    await page.locator('#how summary').click();
    await expect(page.locator('[data-cell="a.payment"]')).toHaveText(`$${A.pay.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
    await expect(page.locator('[data-cell="b.interest"]')).toHaveText(usd(B.interest));
  });

  test('the notes follow the month, played or dragged', async ({ page }) => {
    await gotoBrick(page);
    await expect(cap(page).locator('.cap-1')).toHaveText('The same $300,000 home. Two loans.');
    await scrub(page, 6);
    await expect(cap(page).locator('.cap-1')).toHaveText('Early payments go mostly to interest.');
    await scrub(page, 100);
    await expect(cap(page).locator('.cap-1')).toHaveText('Each cart carries $100,000 of interest to the lender.');
    await expect(cap(page).locator('.cap-2')).toHaveText(/^Interest so far: 30-year \$[\d,]+, 15-year \$[\d,]+\.$/);
    await scrub(page, 185);
    await expect(cap(page).locator('.cap-1')).toHaveText('The 15-year house is paid off.');
    await scrub(page, 360);
    await expect(cap(page).locator('.cap-2')).toHaveText('The 15-year loan saved $234,212, for $595 more a month.');
  });

  test('changing the loans re-renders the numbers, and the notes name them by rate when the terms match', async ({ page }) => {
    await gotoBrick(page);
    await page.locator('#f-b-years').fill('30');
    await page.locator('#f-b-years').press('Enter');
    await frames(page, 3);
    expect((await state(page)).inputs.loans.b.years).toBe(30);
    expect((await plate(page, 'b')).name).toBe('5.75% loan');
    await page.locator('#f-a-years').fill('45');
    await page.locator('#f-a-years').press('Enter');
    await frames(page, 2);
    await expect(page.locator('#f-a-years')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-a-years')).toBeVisible();
    expect((await state(page)).inputs.loans.a.years).toBe(30);
  });

  test('play, pause and speed work; Play at the end starts again from month 0', async ({ page }) => {
    await gotoBrick(page);
    await page.locator('#btn-play').click();
    await expect.poll(async () => (await state(page)).months, { timeout: 5000 }).toBeGreaterThan(5);
    await page.locator('#btn-play').click();
    const m = (await state(page)).months;
    await page.waitForTimeout(300);
    expect((await state(page)).months).toBe(m);
    await scrub(page, 360);
    await page.locator('#btn-play').click();
    await frames(page, 2);
    expect((await state(page)).months).toBeLessThan(20);
  });

  test('the timeline works from the keyboard', async ({ page }) => {
    await gotoBrick(page);
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
    await gotoBrick(page);
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
    await gotoBrick(page);
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    await scrub(page, 360);
    await expect(page.locator('#diff-value')).toHaveText('$234,212');
  });
});

test.describe('Brick by Brick: accessibility', () => {
  test('axe: no violations with the introduction open, at month 0, mid-way and at the end', async ({ page }) => {
    await gotoBrick(page, { intro: true });
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
    await gotoBrick(page);
    for (const id of ['btn-play', 'timeline', 'f-amount', 'f-a-years', 'f-a-apr', 'f-b-years', 'f-b-apr', 'reduce-motion', 'speed']) {
      await expect(page.locator(`#${id}`), id).toHaveAccessibleName(/\S/);
    }
    await expect(page.locator('.title-link')).toHaveAttribute('href', './index.html');
  });
});
