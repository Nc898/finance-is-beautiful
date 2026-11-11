import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames } from './helpers';

/** Shape of `window.__bread.getState()` (see src/bread/main.ts). */
interface BreadState {
  basket: { qty: Record<string, number> };
  errors: Record<string, string>;
  month: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
}

const state = async (page: Page) => (await page.evaluate(() => window.__bread.getState())) as BreadState;

async function gotoBread(page: Page, opts: { intro?: boolean } = {}): Promise<string[]> {
  const { intro = false } = opts;
  // the introduction shows the first time a demonstration is opened in a session: most tests start past it
  if (!intro) await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:bread-and-butter', '1'));
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/bread-and-butter.html');
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

const scrub = async (page: Page, month: number) => {
  await page.evaluate((m) => window.__bread.actions.scrubTo(m), month);
  await frames(page, 3);
};

/** month index of a calendar month (January 1980 = 0) */
const at = (year: number, month: number) => (year - 1980) * 12 + month - 1;

const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const cap = (page: Page) => page.locator('#caption .cap.on:not(.cap-ghost)');
const labels = async (page: Page) => ({
  total: clean(await page.locator('#receipt-total').textContent()),
  date: clean(await page.locator('#receipt-date').textContent()),
  pay: clean(await page.locator('#pay-amount').textContent()),
  paySub: clean(await page.locator('#pay-sub').textContent()),
  minutes: clean(await page.locator('#headline-num').textContent()),
  unit: clean(await page.locator('#headline-unit').textContent()),
  sub: clean(await page.locator('#headline-sub').textContent()),
});

test.describe('Bread and Butter', () => {
  test('loads with the title, a described canvas, the three labels and no console errors', async ({ page }) => {
    const errors = await gotoBread(page);
    await expect(page).toHaveTitle('Bread and Butter');
    await expect(page.locator('#scene')).toHaveAttribute('aria-label', /corner grocery/);
    expect(await labels(page)).toEqual({
      total: '$9.16',
      date: 'Jan 1980',
      pay: '$254',
      paySub: 'median, full time, before tax',
      minutes: '87',
      unit: 'minutes of work',
      sub: 'to buy the basket',
    });
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });

  test('opens with the introduction; it closes to January 1980, paused, and stays closed', async ({ page }) => {
    const errors = await gotoBread(page, { intro: true });
    const intro = page.locator('#intro');
    await expect(intro).toBeVisible();
    await expect(intro.getByRole('heading', { name: 'Bread and Butter' })).toBeVisible();
    await expect(intro).toContainText('Prices and pay');
    await expect(intro).toContainText('every month since 1980');
    await expect(intro).toContainText('prices were rising 14% a year');
    await expect(page.locator('[data-intro-close]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(intro).toBeHidden();
    let s = await state(page);
    expect(s.month).toBe(0);
    expect(s.playing).toBe(false);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('fib-intro-seen:bread-and-butter'))).toBe('1');
    await page.reload();
    await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
    await frames(page, 3);
    await expect(intro).toBeHidden();
    await onStage(page, () => page.locator('#btn-about').click());
    await expect(intro).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(intro).toBeHidden();
    s = await state(page);
    expect(s.month).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the labels and the scene frame show the real figures', async ({ page }) => {
    await gotoBread(page);
    await scrub(page, at(2022, 8));
    expect(await labels(page)).toMatchObject({ date: 'Aug 2022', unit: 'minutes of work' });
    const f = await page.evaluate(() => window.__bread.frame());
    expect(f).toMatchObject({ statementMonth: at(2022, 8), scrubbed: false, reducedMotion: false });
    // a jump is flagged on exactly one frame
    const flags = await page.evaluate(
      () =>
        new Promise<boolean[]>((resolve) => {
          const seen = new Map<number, boolean>();
          window.__bread.actions.scrubTo(100);
          let n = 0;
          const step = () => {
            const fr = window.__bread.frame();
            if (fr) seen.set(fr.timeMs, fr.scrubbed);
            if (++n < 12) requestAnimationFrame(step);
            else resolve([...seen.values()]);
          };
          requestAnimationFrame(step);
        }),
    );
    expect(flags.filter(Boolean)).toHaveLength(1);
    await scrub(page, at(2022, 8));
    expect(f!.board.year).toBe('2022');
    expect(f!.board.total).toMatch(/^\$\d+\.\d\d$/);
    expect(f!.board.prices.eggs).toMatch(/^\$\d+\.\d\d$/);
    expect(f!.basket.qty).toEqual({ bread: 2, eggs: 1, coffee: 1, bananas: 3, chicken: 3, flour: 5 });
    // the board is chalked once a year with January's prices: in January the label's total is the board's total
    await scrub(page, at(2022, 1));
    const jan = await page.evaluate(() => window.__bread.frame());
    expect(jan!.board.year).toBe('2022');
    expect((await labels(page)).total).toBe(jan!.board.total);
    expect(f!.board.total).toBe(jan!.board.total);
    await scrub(page, at(2026, 9));
    expect(await labels(page)).toMatchObject({ total: '$26.15', pay: '$1,239', minutes: '51', date: 'Sep 2026' });
    await scrub(page, at(2021, 7));
    expect((await labels(page)).minutes).toBe('41');
  });

  test('a filled-in month says so on the labels, and in the panel', async ({ page }) => {
    await gotoBread(page);
    await scrub(page, at(2025, 10));
    expect(await labels(page)).toMatchObject({ date: 'Oct 2025, estimated', paySub: 'estimated: not published', sub: 'to buy the basket (estimated)' });
    await page.locator('#how summary').click();
    await expect(page.locator('#prices-table .est').first()).toHaveText('estimated: not published');
    await expect(page.locator('#prices-table .est')).toHaveCount(7);
    await expect(page.locator('#gaps')).toContainText('Oct 2025');
    await expect(page.locator('#gaps')).toContainText('Sep 2007');
    await scrub(page, at(2025, 9));
    await expect(page.locator('#prices-table .est')).toHaveCount(0);
  });

  test('the notes follow the month, played or dragged', async ({ page }) => {
    await gotoBread(page);
    await expect(cap(page).locator('.cap-1')).toHaveText('1980: prices rising 14.8% a year.');
    await expect(cap(page).locator('.cap-2')).toHaveText('The fastest since 1947, and pay had fallen behind.');
    await scrub(page, at(1985, 1));
    await expect(cap(page).locator('.cap-1')).toHaveText('The 1980s: inflation cools and pay catches up.');
    await expect(cap(page).locator('.cap-2')).toHaveText('This basket now takes 64 minutes of work.');
    await scrub(page, at(2008, 6));
    await expect(cap(page).locator('.cap-1')).toHaveText('2008: food prices jump, then the recession.');
    await scrub(page, at(2021, 7));
    await expect(cap(page).locator('.cap-1')).toHaveText('2021: the basket at its cheapest, 41 minutes of work.');
    await scrub(page, at(2022, 8));
    await expect(cap(page).locator('.cap-1')).toHaveText('2022: grocery prices up 13.5% in a year.');
    await scrub(page, at(2025, 3));
    await expect(cap(page).locator('.cap-2')).toHaveText('Eggs: $6.23 a dozen.');
    await scrub(page, at(2026, 9));
    await expect(cap(page).locator('.cap-1')).toHaveText('Since 1980: this basket ×2.9, all groceries ×3.8, pay ×4.9.');
    await expect(cap(page).locator('.cap-2')).toHaveText('Today: $26.15 for the basket, 51 minutes of work.');
  });

  test('changing the basket re-renders the numbers; a bad value shows an error and keeps the last good one', async ({ page }) => {
    await gotoBread(page);
    await page.locator('#f-eggs').fill('2');
    await page.locator('#f-eggs').press('Enter');
    await frames(page, 3);
    expect((await state(page)).basket.qty.eggs).toBe(2);
    expect((await labels(page)).total).toBe('$10.04');
    const f = await page.evaluate(() => window.__bread.frame());
    expect(f!.basket.qty.eggs).toBe(2);
    await page.locator('#f-flour').fill('11');
    await page.locator('#f-flour').press('Enter');
    await frames(page, 2);
    await expect(page.locator('#f-flour')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-flour')).toBeVisible();
    expect((await state(page)).basket.qty.flour).toBe(5);
    // the steppers (the bad draft goes first: a basket is committed whole)
    await page.locator('#f-flour').fill('5');
    await page.locator('#f-flour').press('Enter');
    await page.getByRole('button', { name: 'More pounds of coffee' }).click();
    expect((await state(page)).basket.qty.coffee).toBe(2);
    // nothing in the basket: it costs nothing and takes no minutes
    for (const id of ['bread', 'eggs', 'coffee', 'bananas', 'chicken', 'flour']) {
      await page.locator(`#f-${id}`).fill('0');
      await page.locator(`#f-${id}`).press('Enter');
    }
    await frames(page, 3);
    expect(await labels(page)).toMatchObject({ total: '$0.00', minutes: '0' });
    await expect(cap(page).locator('.cap-2')).toHaveText('The fastest since 1947, and pay had fallen behind.');
    await scrub(page, at(1985, 1));
    await expect(cap(page).locator('.cap-2')).toHaveText('An empty basket costs nothing.');
  });

  test('play, pause and speed work; Play at the end starts again from January 1980', async ({ page }) => {
    await gotoBread(page);
    await page.locator('#btn-play').click();
    await expect.poll(async () => (await state(page)).month, { timeout: 5000 }).toBeGreaterThan(5);
    await page.locator('#btn-play').click();
    const m = (await state(page)).month;
    await page.waitForTimeout(300);
    expect((await state(page)).month).toBe(m);
    await page.evaluate(() => window.__bread.actions.setSpeed(5));
    await expect(page.locator('#speed-readout')).toHaveText('5×');
    await page.evaluate(() => window.__bread.actions.setSpeed(1));
    await scrub(page, 560);
    await page.locator('#btn-play').click();
    await frames(page, 2);
    expect((await state(page)).month).toBeLessThan(20);
  });

  test('the timeline works from the keyboard, in months', async ({ page }) => {
    await gotoBread(page);
    const tl = page.locator('#timeline');
    await tl.focus();
    await page.keyboard.press('PageUp');
    await frames(page, 2);
    expect((await state(page)).month).toBe(12);
    await expect(page.locator('#age-readout')).toHaveText('Jan 1981');
    await page.keyboard.press('End');
    await frames(page, 2);
    expect((await state(page)).month).toBe(560);
    await expect(tl).toHaveAttribute('aria-valuetext', 'September 2026');
  });

  test('the labels sit inside the stage and do not overlap', async ({ page }) => {
    await gotoBread(page);
    await scrub(page, at(2000, 1));
    const r = await page.evaluate(() => {
      const box = (id: string) => document.getElementById(id)!.getBoundingClientRect();
      return { a: box('label-basket'), b: box('label-pay'), d: box('label-minutes'), stage: box('stage'), w: window.innerWidth };
    });
    const overlap = (p: DOMRect, q: DOMRect) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
    expect(overlap(r.a, r.b)).toBe(false);
    expect(overlap(r.a, r.d)).toBe(false);
    expect(overlap(r.b, r.d)).toBe(false);
    for (const p of [r.a, r.b, r.d]) {
      expect(p.left).toBeGreaterThanOrEqual(-1);
      expect(p.right).toBeLessThanOrEqual(r.w + 1);
      expect(p.bottom).toBeLessThanOrEqual(r.stage.bottom + 1);
    }
  });

  test('"How this is calculated" shows the formula with this month\'s numbers, the years, and the sources', async ({ page }) => {
    await gotoBread(page);
    await page.locator('#how summary').click();
    await expect(page.locator('[data-cell="minutesFormula"]')).toHaveText('$9.16 ÷ ($254 ÷ 40) × 60 = 86.5 minutes');
    await expect(page.locator('[data-cell="basketFormula"]')).toContainText('= $9.16');
    await expect(page.locator('#yearly tbody tr')).toHaveCount(47);
    await expect(page.locator('#yearly tbody tr.now')).toHaveAttribute('data-year', '1980');
    await expect(page.locator('#yearly tbody tr[data-year="2026"]')).toContainText('Jan to Sep');
    await expect(page.locator('[data-cell="since.pay"]')).toHaveText('×4.9');
    await expect(page.locator('[data-cell="coreNote"]')).toContainText('This month it was 12.0%.');
    await expect(page.locator('#sources')).toContainText('APU0000702111');
    await expect(page.locator('#sources')).toContainText('LES1252881500Q');
    await expect(page.locator('#sources')).toContainText('CPILFENS');
    await expect(page.locator('#sources')).toContainText('November 11, 2026');
    await scrub(page, at(2008, 6));
    await expect(page.locator('#how-month')).toHaveText('Jun 2008');
    await expect(page.locator('#yearly tbody tr.now')).toHaveAttribute('data-year', '2008');
  });

  test('reduced motion: nothing plays by itself, and the numbers are the same', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoBread(page);
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    await scrub(page, 560);
    expect(await labels(page)).toMatchObject({ total: '$26.15', minutes: '51' });
  });
});

test.describe('Bread and Butter: accessibility', () => {
  test('axe: no violations with the introduction open, at January 1980, mid-way, an estimated month and the end', async ({ page }) => {
    await gotoBread(page, { intro: true });
    const run = async (label: string) => {
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(res.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    };
    await expect(page.locator('#intro')).toBeVisible();
    await run('intro');
    await page.keyboard.press('Escape');
    await openPanel(page);
    await run('month 0');
    await scrub(page, at(2008, 6));
    await run('mid-way');
    await page.locator('#how summary').click();
    await scrub(page, at(2025, 10));
    await run('estimated month, panel explained');
    await scrub(page, 560);
    await run('end');
  });

  test('controls have accessible names and the title link goes back to the collection', async ({ page }) => {
    await gotoBread(page);
    for (const id of ['btn-play', 'timeline', 'f-bread', 'f-eggs', 'f-coffee', 'f-bananas', 'f-chicken', 'f-flour', 'reduce-motion', 'speed']) {
      await expect(page.locator(`#${id}`), id).toHaveAccessibleName(/\S/);
    }
    await expect(page.locator('.title-link')).toHaveAttribute('href', './index.html');
  });
});
