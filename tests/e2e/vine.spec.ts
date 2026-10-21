import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames, usd } from './helpers';

/** Shape of `window.__vine.getState()` (see src/vine/main.ts). */
interface VineState {
  inputs: { balance: number; apr: number; fixedPayment: number; minPercent: number; minFloor: number };
  draft: Record<string, string>;
  errors: Record<string, string>;
  months: number;
  horizon: number;
  mode: 'story' | 'explore';
  storyTime: number;
  storyLength: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
  exploreHint: boolean;
  monthsPerSecond: number;
}

const state = async (page: Page) => (await page.evaluate(() => window.__vine.getState())) as VineState;

async function gotoVine(page: Page, opts: { pause?: boolean } = {}): Promise<string[]> {
  const { pause = true } = opts;
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  // Swallow Vite's HMR websocket: a full-reload mid-test would wipe the in-memory app state.
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/nip-it-in-the-bud.html');
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 45_000 });
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect && (a as CSSAnimation).animationName === 'reveal-in').map((a) => a.finished)),
  );
  await frames(page, 2);
  if (pause) {
    await page.evaluate(() => window.__vine.actions.pause());
    await frames(page, 2);
  }
  return errors;
}

const seek = async (page: Page, seconds: number) => {
  await page.evaluate((s) => window.__vine.actions.seekStory(s), seconds);
  await frames(page, 3);
};

const scrub = async (page: Page, months: number) => {
  await page.evaluate((m) => window.__vine.actions.scrubTo(m), months);
  await frames(page, 3);
};

/** Independent closed-form copy of the month recurrence: what the page must show at a whole month. */
function simulate(inp: VineState['inputs'], plan: 'minimum' | 'fixed', months: number) {
  let balance = inp.balance;
  let interestPaid = 0;
  let month = 0;
  while (month < months && balance > 0.005) {
    const interest = (balance * inp.apr) / 12;
    const due = Math.min(balance + interest, Math.max(inp.minFloor, interest + inp.minPercent * balance));
    const want = plan === 'fixed' ? Math.max(inp.fixedPayment, due) : due;
    const pay = Math.min(want, balance + interest);
    interestPaid += interest;
    balance = balance + interest - pay;
    if (balance < 0.005) balance = 0;
    month++;
  }
  return { balance, interestPaid, month };
}

const D = { balance: 5000, apr: 0.22, fixedPayment: 200, minPercent: 0.01, minFloor: 25 };

async function labelTexts(page: Page, id: 'minimum' | 'fixed') {
  const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  return {
    name: clean(await page.locator(`#lab-${id} .pl-name`).textContent()),
    owed: clean(await page.locator(`#lab-${id} .pl-owed`).textContent()),
    tag: clean(await page.locator(`#tag-${id} .pt-amount`).textContent()),
  };
}

test.describe('Nip It in the Bud', () => {
  test('loads with the title, a described canvas, two cottage labels and no console errors', async ({ page }) => {
    const errors = await gotoVine(page);
    await expect(page).toHaveTitle('Nip It in the Bud');
    await expect(page.locator('h1 a')).toHaveAttribute('href', './index.html');
    await expect(page.locator('h1 a')).toContainText('Nip It in the Bud');
    const canvas = page.locator('#scene');
    await expect(canvas).toHaveAttribute('role', 'img');
    const label = (await canvas.getAttribute('aria-label')) ?? '';
    expect(label).toContain('Two cottages');
    expect(label).toContain('$5,000');
    for (const id of ['minimum', 'fixed']) {
      await expect(page.locator(`#lab-${id}`)).toBeVisible();
      await expect(page.locator(`#tag-${id}`)).toBeVisible();
    }
    expect(await page.locator('#summary').textContent()).toBe(label);
    expect(errors).toEqual([]);
  });

  test('the story autoplays from the start and hands off to explore', async ({ page }) => {
    await gotoVine(page, { pause: false });
    // autoplay: the story clock runs by itself
    await expect.poll(async () => (await state(page)).storyTime, { timeout: 10_000 }).toBeGreaterThan(0.3);
    expect((await state(page)).mode).toBe('story');
    await expect(page.locator('#caption .cap.on:not(.cap-ghost) .cap-1')).toContainText('Two cottages. The same $5,000 vine.');
    // run it to the end at 4x so the whole hand-off happens naturally
    await page.evaluate(() => window.__vine.actions.setSpeed(4));
    await expect.poll(async () => (await state(page)).mode, { timeout: 40_000 }).toBe('explore');
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.months).toBe(230);
    expect(s.exploreHint).toBe(true);
    await expect(page.locator('#caption .cap.on:not(.cap-ghost) .cap-1')).toHaveText('Explore your own garden');
  });

  test('skip goes straight to explore at the last month', async ({ page }) => {
    await gotoVine(page, { pause: false });
    await page.locator('#btn-skip').click();
    await frames(page, 3);
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.months).toBe(230);
    await expect(page.locator('#btn-skip')).toBeHidden();
    await expect(page.locator('#btn-play')).toContainText('Play');
  });

  test('the numbers at the end match the engine (labels, readouts and tables)', async ({ page }) => {
    await gotoVine(page);
    await page.locator('#btn-skip').click();
    await frames(page, 3);
    expect(await labelTexts(page, 'minimum')).toEqual({ name: 'Minimum payments', owed: 'Paid off in 19 years, 2 months', tag: '$8,100 in interest' });
    expect(await labelTexts(page, 'fixed')).toEqual({ name: 'A fixed $200 a month', owed: 'Paid off in 2 years, 10 months', tag: '$1,750 in interest' });
    await expect(page.locator('#year-readout')).toHaveText('Year 19, month 2');
    await expect(page.locator('#age-readout')).toHaveText('Year 19, month 2');
    await page.locator('#how > summary').click();
    await frames(page, 2);
    await expect(page.locator('[data-cell="minimum.payoff"]')).toHaveText('19 years, 2 months');
    await expect(page.locator('[data-cell="fixed.payoff"]')).toHaveText('2 years, 10 months');
    await expect(page.locator('[data-cell="minimum.months"]')).toHaveText('230');
    await expect(page.locator('[data-cell="fixed.months"]')).toHaveText('34');
    await expect(page.locator('[data-cell="minimum.interest"]')).toHaveText('$8,100');
    await expect(page.locator('[data-cell="fixed.interest"]')).toHaveText('$1,750');
    await expect(page.locator('[data-cell="minimum.paid"]')).toHaveText('$13,100');
    await expect(page.locator('[data-cell="fixed.paid"]')).toHaveText('$6,750');
    await expect(page.locator('[data-cell="minimum.owed"]')).toHaveText('Paid off');
    await expect(page.locator('#how-age')).toHaveText('year 19, month 2');
    // the first months of each plan
    const first = page.locator('#excerpt-minimum tbody tr').first();
    await expect(first.locator('th')).toHaveText('1');
    await expect(first.locator('td')).toHaveText(['$91.67', '$141.67', '$4,950.00']);
    await expect(page.locator('#excerpt-fixed tbody tr').first().locator('td')).toHaveText(['$91.67', '$200.00', '$4,891.67']);
    expect(await page.locator('#excerpt-minimum tbody tr').count()).toBe(4);
  });

  test('the labels follow the clock: owed and interest at years 5, 10, 12 and 15', async ({ page }) => {
    await gotoVine(page);
    for (const [months, owed] of [
      [60, 2736],
      [120, 1497],
      [144, 1176],
      [180, 813],
    ] as const) {
      await scrub(page, months);
      const e = simulate(D, 'minimum', months);
      expect(usd(e.balance)).toBe(usd(owed));
      expect((await labelTexts(page, 'minimum')).owed).toBe(`${usd(owed)} still owed`);
      expect((await labelTexts(page, 'minimum')).tag).toBe(`${usd(e.interestPaid)} in interest`);
      expect((await labelTexts(page, 'fixed')).owed).toBe('Paid off in 2 years, 10 months');
    }
    await expect(page.locator('#year-readout')).toHaveText('Year 15, month 0');
    await scrub(page, 63);
    await expect(page.locator('#year-readout')).toHaveText('Year 5, month 3');
    const e = { min: simulate(D, 'minimum', 63), fixed: simulate(D, 'fixed', 63) };
    expect((await labelTexts(page, 'minimum')).owed).toBe(`${usd(e.min.balance)} still owed`);
    expect((await labelTexts(page, 'fixed')).owed).toBe(`${usd(e.fixed.balance)} still owed`.replace(/.*/, 'Paid off in 2 years, 10 months'));
  });

  test('story captions carry the live numbers, and the minimum beat follows the clock in place', async ({ page }) => {
    await gotoVine(page);
    await seek(page, 8);
    await page.waitForTimeout(800);
    const cap = () => page.locator('#caption .cap.on:not(.cap-ghost)');
    await expect(cap().locator('.cap-1')).toHaveText('Interest grows it back every month.');
    await expect(cap().locator('.cap-2')).toHaveText('About $92 a month to start.');
    await seek(page, 16);
    await page.waitForTimeout(800);
    await expect(cap().locator('.cap-1')).toHaveText('A fixed $200 a month clears it in 2 years, 10 months.');
    await seek(page, 30);
    await page.waitForTimeout(800);
    await expect(cap().locator('.cap-1')).toHaveText('Minimum payments trim a little. The vine keeps coming back.');
    const s = await state(page);
    // what is owed reads as a statement does: the month's opening balance, then up by its interest once that is
    // charged, then down to the closing balance once the payment lands (src/vine/engine INTEREST_AT, PAYMENT_AT)
    const whole = Math.floor(s.months);
    const f = s.months - whole;
    const a = simulate(D, 'minimum', whole).balance;
    const b = simulate(D, 'minimum', whole + 1).balance;
    const owed = f < 0.2 ? a : f < 0.62 ? a + (a * D.apr) / 12 : b;
    await expect(cap().locator('.cap-2')).toHaveText(`Year ${Math.floor(whole / 12)}: ${usd(owed)} still owed.`);
    await expect(page.locator('#lab-minimum .pl-owed')).toHaveText(`${usd(owed)} still owed`);
    // the line updates without the caption swapping layers
    const layerBefore = await page.locator('#caption .cap.on:not(.cap-ghost)').getAttribute('data-layer');
    await seek(page, 36);
    await frames(page, 2);
    expect(await page.locator('#caption .cap.on:not(.cap-ghost)').getAttribute('data-layer')).toBe(layerBefore);
    await seek(page, 44);
    await page.waitForTimeout(800);
    await expect(cap().locator('.cap-1')).toHaveText('Minimum payments: 19 years, 2 months and $8,100 in interest.');
    await expect(cap().locator('.cap-2')).toHaveText('A fixed $200: $1,750 in interest.');
  });

  test('changing the interest rate re-renders the numbers and the timeline', async ({ page }) => {
    await gotoVine(page);
    await page.locator('#btn-skip').click();
    const before = await state(page);
    await page.locator('#f-apr').fill('30');
    await page.locator('#f-apr').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.inputs.apr).toBeCloseTo(0.3, 12);
    expect(s.horizon).toBeGreaterThan(before.horizon);
    await expect(page.locator('#timeline')).toHaveAttribute('max', String(s.horizon));
    // the clock stays where it was, so the labels now show money still owed
    expect(s.months).toBe(before.months);
    const e = simulate({ ...D, apr: 0.3 }, 'minimum', Math.floor(s.months));
    expect((await labelTexts(page, 'minimum')).owed).toBe(`${usd(e.balance)} still owed`);
    expect((await labelTexts(page, 'minimum')).tag).toBe(`${usd(e.interestPaid)} in interest`);
  });

  test('the fixed payment names its cottage, and a payment under the minimum explains itself', async ({ page }) => {
    await gotoVine(page);
    await page.locator('#btn-skip').click();
    await expect(page.locator('#note-fixedPayment')).toBeHidden();
    await page.locator('#f-fixedPayment').fill('350');
    await page.locator('#f-fixedPayment').press('Enter');
    await frames(page, 3);
    expect((await labelTexts(page, 'fixed')).name).toBe('A fixed $350 a month');
    await page.locator('#f-fixedPayment').fill('100');
    await page.locator('#f-fixedPayment').press('Enter');
    await expect(page.locator('#note-fixedPayment')).toBeVisible();
    await expect(page.locator('#note-fixedPayment')).toHaveText('The card asks for at least $141.67 to start, so the fixed plan pays that at first.');
    await page.locator('#f-fixedPayment').fill('20');
    await page.locator('#f-fixedPayment').press('Enter');
    await expect(page.locator('#note-fixedPayment')).toContainText('so both pay the minimum');
    expect((await state(page)).horizon).toBe(230);
  });

  test('the timeline works from the keyboard', async ({ page }) => {
    await gotoVine(page);
    const timeline = page.locator('#timeline');
    await timeline.focus();
    await page.keyboard.press('Home');
    await frames(page, 2);
    expect((await state(page)).months).toBe(0);
    await expect(timeline).toHaveAttribute('aria-valuetext', 'Year 0, month 0');
    await page.keyboard.press('ArrowRight');
    await frames(page, 2);
    expect((await state(page)).months).toBe(1);
    await expect(timeline).toHaveAttribute('aria-valuetext', 'Year 0, month 1');
    await page.keyboard.press('PageUp');
    await frames(page, 2);
    expect((await state(page)).months).toBe(13);
    await expect(timeline).toHaveAttribute('aria-valuetext', 'Year 1, month 1');
    await page.keyboard.press('End');
    await frames(page, 2);
    expect((await state(page)).months).toBe(230);
    await page.keyboard.press('PageDown');
    await frames(page, 2);
    expect((await state(page)).months).toBe(218);
    await expect(page.locator('#year-readout')).toHaveText('Year 18, month 2');
    // scrubbing leaves the story and pauses
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.playing).toBe(false);
    // the labels follow the clock
    const e = simulate(D, 'minimum', 218);
    expect((await labelTexts(page, 'minimum')).owed).toBe(`${usd(e.balance)} still owed`);
  });

  test('the timeline is in months with a year tick, labelled every five years', async ({ page }) => {
    await gotoVine(page);
    expect(await page.locator('#scale-ticks .tick-label').allTextContents()).toEqual(['0', '5', '10', '15']);
    await expect(page.locator('#scale-ticks .tick')).toHaveCount(20);
    await expect(page.locator('#timeline')).toHaveAttribute('max', '230');
    await expect(page.locator('#timeline')).toHaveAttribute('aria-label', 'Timeline in months');
    // a different card changes the length of the timeline
    await page.locator('#f-balance').fill('1,000');
    await page.locator('#f-balance').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.horizon).toBeLessThan(120);
    await expect(page.locator('#timeline')).toHaveAttribute('max', String(s.horizon));
    expect((await page.locator('#scale-ticks .tick-label').allTextContents())[0]).toBe('0');
  });

  test('an invalid input shows an inline error and keeps the last valid numbers', async ({ page }) => {
    await gotoVine(page);
    await page.locator('#btn-skip').click();
    const input = page.locator('#f-balance');
    await input.fill('50');
    await input.press('Enter');
    await expect(page.locator('#err-balance')).toBeVisible();
    await expect(page.locator('#err-balance')).toHaveText('The card balance must be between $100 and $100,000.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await state(page)).inputs.balance).toBe(5000);
    expect((await labelTexts(page, 'minimum')).tag).toBe('$8,100 in interest');
    // not a number
    const fixed = page.locator('#f-fixedPayment');
    await fixed.fill('lots');
    await fixed.press('Enter');
    await expect(page.locator('#err-fixedPayment')).toHaveText('The fixed payment must be a number.');
    // fixing them clears the errors
    await input.fill('6000');
    await input.press('Enter');
    await fixed.fill('250');
    await fixed.press('Enter');
    await expect(page.locator('#err-balance')).toBeHidden();
    await expect(page.locator('#err-fixedPayment')).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect((await labelTexts(page, 'fixed')).name).toBe('A fixed $250 a month');
    // the minimum rule fields
    await page.locator('#f-minPercent').fill('9');
    await page.locator('#f-minPercent').press('Enter');
    await expect(page.locator('#err-minPercent')).toHaveText('The share of the balance must be between 0.5% and 5%.');
    await page.locator('#f-minFloor').fill('900');
    await page.locator('#f-minFloor').press('Enter');
    await expect(page.locator('#err-minFloor')).toHaveText('The floor must be between $0 and $500.');
  });

  test('an interest rate of 0 is accepted: nothing grows back', async ({ page }) => {
    await gotoVine(page);
    await page.locator('#btn-skip').click();
    await page.locator('#f-apr').fill('0');
    await page.locator('#f-apr').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.errors).toEqual({});
    expect(s.inputs.apr).toBe(0);
    await scrub(page, 0);
    expect((await labelTexts(page, 'minimum')).tag).toBe('$0 in interest');
    await scrub(page, s.horizon);
    expect((await labelTexts(page, 'fixed')).tag).toBe('$0 in interest');
  });

  test('steppers change values and the money fields read with grouping', async ({ page }) => {
    await gotoVine(page);
    await expect(page.locator('#f-balance')).toHaveValue('5,000');
    await page.getByRole('button', { name: 'Increase card balance' }).click();
    await expect(page.locator('#f-balance')).toHaveValue('5,500');
    await page.getByRole('button', { name: 'Decrease interest rate' }).click();
    await expect(page.locator('#f-apr')).toHaveValue('21.5');
    expect((await state(page)).inputs.apr).toBeCloseTo(0.215, 12);
    await page.getByRole('button', { name: 'Increase fixed payment' }).click();
    await expect(page.locator('#f-fixedPayment')).toHaveValue('210');
    await page.getByRole('button', { name: 'Increase share of balance' }).click();
    await expect(page.locator('#f-minPercent')).toHaveValue('1.5');
    await page.getByRole('button', { name: 'Decrease floor' }).click();
    await expect(page.locator('#f-minFloor')).toHaveValue('20');
  });

  test('play, pause and speed work in explore', async ({ page }) => {
    await gotoVine(page);
    await page.locator('#btn-skip').click();
    await scrub(page, 0);
    await page.locator('#btn-play').click();
    await expect(page.locator('#btn-play')).toContainText('Pause');
    await page.locator('.speed:has-text("4×")').click();
    await expect.poll(async () => (await state(page)).months, { timeout: 8000 }).toBeGreaterThan(30);
    expect((await state(page)).monthsPerSecond).toBeGreaterThan(20);
    await page.locator('#btn-play').click();
    const m = (await state(page)).months;
    await page.waitForTimeout(300);
    expect((await state(page)).months).toBe(m);
    expect((await state(page)).monthsPerSecond).toBe(0);
    await expect(page.locator('#btn-play')).toHaveText(/Play/);
    expect((await state(page)).speed).toBe(4);
  });

  test('the panel collapses and Space plays', async ({ page }) => {
    await gotoVine(page);
    const toggle = page.locator('#panel-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#dock')).toBeHidden({ timeout: 2000 });
    await toggle.click();
    await expect(page.locator('#dock')).toBeVisible();
    await page.locator('#btn-skip').click();
    await scrub(page, 0);
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).playing).toBe(true);
  });

  test('labels sit inside the stage and do not overlap each other', async ({ page }) => {
    await gotoVine(page);
    for (const t of [14, 20, 30, 44]) {
      await seek(page, t);
      await page.waitForTimeout(500);
      const boxes = await page.evaluate(() =>
        ['lab-minimum', 'lab-fixed', 'tag-minimum', 'tag-fixed'].map((id) => {
          const r = document.getElementById(id)!.getBoundingClientRect();
          return { id, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      // the visible garden is the stage minus the open panel
      const limit = (await page.locator('#dock').boundingBox())!.x;
      for (const b of boxes) {
        expect(b.x, `${b.id} at t=${t}`).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.w, `${b.id} at t=${t}`).toBeLessThanOrEqual(limit + 1);
        expect(b.w).toBeGreaterThan(0);
      }
      // the two cottages' labels never touch
      const [lm, lf, tm, tf] = boxes;
      const overlap = lm.x < lf.x + lf.w && lf.x < lm.x + lm.w && lm.y < lf.y + lf.h && lf.y < lm.y + lm.h;
      expect(overlap, `labels overlap at t=${t}`).toBe(false);
      // each label carries its interest line, under what is owed
      for (const [lab, tag] of [[lm, tm], [lf, tf]]) {
        expect(tag.x, `${tag.id} at t=${t}`).toBeGreaterThanOrEqual(lab.x - 1);
        expect(tag.x + tag.w, `${tag.id} at t=${t}`).toBeLessThanOrEqual(lab.x + lab.w + 1);
        expect(tag.y + tag.h, `${tag.id} at t=${t}`).toBeLessThanOrEqual(lab.y + lab.h + 1);
        expect(tag.y, `${tag.id} at t=${t}`).toBeGreaterThan(lab.y + lab.h / 2);
      }
    }
  });

  test('the labels wait out the opening close-up and appear as the camera settles', async ({ page }) => {
    await gotoVine(page);
    await seek(page, 2);
    await page.waitForTimeout(900);
    const fade = () => page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--label-fade') || '1'));
    expect(await fade()).toBe(0);
    await seek(page, 20);
    await expect.poll(fade, { timeout: 8000 }).toBeGreaterThan(0.95);
  });

  test('announcements are discrete: the live region only changes on events', async ({ page }) => {
    await gotoVine(page, { pause: false });
    const region = page.locator('#announcer');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await page.evaluate(() => window.__vine.actions.pause());
    await expect(region).toContainText('Paused');
    const before = await region.textContent();
    await page.waitForTimeout(1200);
    expect(await region.textContent()).toBe(before); // nothing per frame while idle
    await page.locator('#f-apr').fill('18');
    await page.locator('#f-apr').press('Enter');
    await expect(region).toContainText('Updated. Minimum payments:', { timeout: 3000 });
  });

  test('reduced motion: no autoplay, labels still show, story still reaches the numbers', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = await gotoVine(page, { pause: false });
    await page.waitForTimeout(800);
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.storyTime).toBe(0);
    await expect(page.locator('#reduce-motion')).toBeChecked();
    for (const id of ['minimum', 'fixed']) await expect(page.locator(`#lab-${id}`)).toBeVisible();
    // the opening is not zoomed, so the labels are there from the start
    expect(await page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--label-fade') || '1'))).toBe(1);
    await page.locator('#btn-skip').click();
    await frames(page, 3);
    expect((await labelTexts(page, 'minimum')).tag).toBe('$8,100 in interest');
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

test.describe('Nip It in the Bud: accessibility', () => {
  test('axe: no violations in explore, with details open, with an error showing, and during the story', async ({ page }) => {
    await gotoVine(page);
    await page.evaluate(() => document.fonts.ready);
    for (const t of [3, 16, 30, 44]) {
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
    await page.evaluate(() => window.__vine.actions.scrubTo(147));
    await page.waitForTimeout(600);
    results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'details open\n' + describeViolations(results)).toEqual([]);

    await page.locator('#f-fixedPayment').fill('100');
    await page.locator('#f-fixedPayment').press('Enter');
    await expect(page.locator('#note-fixedPayment')).toBeVisible();
    await page.locator('#f-apr').fill('90');
    await page.locator('#f-apr').press('Enter');
    await expect(page.locator('#err-apr')).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'error\n' + describeViolations(results)).toEqual([]);
  });

  test('controls have accessible names and the title link goes back to the collection', async ({ page }) => {
    await gotoVine(page);
    await expect(page.getByRole('link', { name: /back to all demonstrations/ })).toHaveAttribute('href', './index.html');
    await expect(page.getByRole('slider', { name: 'Timeline in months' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Playback speed' })).toBeVisible();
    for (const name of ['Card balance', 'Interest rate', 'Fixed monthly payment', 'Share of balance', 'Floor']) {
      await expect(page.getByRole('textbox', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(page.getByRole('group', { name: 'Minimum payment rule' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeVisible();
    await expect(page.locator('#announcer')).toHaveAttribute('role', 'status');
  });
});
