import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { frames, usd } from './helpers';

type Debt = { balance: number; apr: number; minPayment: number };
interface Inputs {
  budget: number;
  debts: { medical: Debt; car: Debt; card: Debt };
}

/** Shape of `window.__snow.getState()` (see src/snow/main.ts). */
interface SnowState {
  inputs: Inputs;
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

const state = async (page: Page) => (await page.evaluate(() => window.__snow.getState())) as SnowState;

async function gotoSnow(page: Page, opts: { pause?: boolean } = {}): Promise<string[]> {
  const { pause = true } = opts;
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  // Swallow Vite's HMR websocket: a full-reload mid-test would wipe the in-memory app state.
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/on-a-roll.html');
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 45_000 });
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect && (a as CSSAnimation).animationName === 'reveal-in').map((a) => a.finished)),
  );
  await frames(page, 2);
  if (pause) {
    await page.evaluate(() => window.__snow.actions.pause());
    await frames(page, 2);
  }
  // phones start with the controls folded away (the scene gets the whole screen): open them, as a visitor would
  const toggle = page.locator('#panel-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
    await expect(page.locator('#dock')).toBeVisible();
    await frames(page, 2);
  }
  return errors;
}

/** On a phone the open panel covers the whole stage: fold it to reach the stage's own buttons, then open it again. */
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

const clickSkip = (page: Page) => onStage(page, () => page.locator('#btn-skip').click());

/** Tests that follow the normal-motion story (autoplay, the close-up, beat timings) do not apply under reduced motion,
 * which holds each beat still instead; the reduced-motion test below covers that story. */
const normalMotionOnly = (info: TestInfo) =>
  test.skip(info.project.use.reducedMotion === 'reduce', 'the reduced-motion story has its own timing (see the reduced-motion test)');

const seek = async (page: Page, seconds: number) => {
  await page.evaluate((s) => window.__snow.actions.seekStory(s), seconds);
  await frames(page, 3);
};

const scrub = async (page: Page, months: number) => {
  await page.evaluate((m) => window.__snow.actions.scrubTo(m), months);
  await frames(page, 3);
};

const DEBTS = ['medical', 'car', 'card'] as const;
type DebtKey = (typeof DEBTS)[number];

/**
 * Independent copy of the monthly rule, written for this spec: what the page must show at a whole month.
 * One pot of money is poured into the debts: every minimum, then the rest in the strategy's order.
 */
function simulate(inp: Inputs, strategy: 'snowball' | 'avalanche', months: number) {
  const bal: Record<DebtKey, number> = { medical: inp.debts.medical.balance, car: inp.debts.car.balance, card: inp.debts.card.balance };
  const order = [...DEBTS].sort((a, b) =>
    strategy === 'snowball'
      ? inp.debts[a].balance - inp.debts[b].balance || inp.debts[b].apr - inp.debts[a].apr
      : inp.debts[b].apr - inp.debts[a].apr || inp.debts[a].balance - inp.debts[b].balance,
  );
  let interest = 0;
  let month = 0;
  while (month < months && DEBTS.some((d) => bal[d] > 0.005)) {
    for (const d of DEBTS) {
      if (bal[d] <= 0) continue;
      const add = (bal[d] * inp.debts[d].apr) / 12;
      interest += add;
      bal[d] += add;
    }
    let pot = inp.budget;
    for (const d of DEBTS) {
      const pay = Math.min(bal[d], inp.debts[d].minPayment);
      bal[d] -= pay;
      pot -= pay;
    }
    for (const d of order) {
      const pay = Math.min(Math.max(0, pot), bal[d]);
      bal[d] -= pay;
      pot -= pay;
    }
    for (const d of DEBTS) if (bal[d] < 0.005) bal[d] = 0;
    month++;
  }
  return { bal, owed: bal.medical + bal.car + bal.card, interest, month };
}

const D: Inputs = {
  budget: 800,
  debts: {
    medical: { balance: 1000, apr: 0, minPayment: 40 },
    car: { balance: 6000, apr: 0.06, minPayment: 180 },
    card: { balance: 12000, apr: 0.26, minPayment: 300 },
  },
};

const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

async function labelTexts(page: Page, id: 'snowball' | 'avalanche') {
  return {
    name: clean(await page.locator(`#lab-${id} .hl-name`).textContent()),
    owed: clean(await page.locator(`#lab-${id} .hl-owed`).textContent()),
    tag: clean(await page.locator(`#tag-${id} .it-amount`).textContent()),
  };
}

const cap = (page: Page) => page.locator('#caption .cap.on:not(.cap-ghost)');

test.describe('On a Roll', () => {
  test('loads with the title, a described canvas, two hill labels, six ball tags and no console errors', async ({ page }) => {
    const errors = await gotoSnow(page);
    await expect(page).toHaveTitle('On a Roll');
    await expect(page.locator('h1 a')).toHaveAttribute('href', './index.html');
    await expect(page.locator('h1 a')).toContainText('On a Roll');
    const canvas = page.locator('#scene');
    await expect(canvas).toHaveAttribute('role', 'img');
    const label = (await canvas.getAttribute('aria-label')) ?? '';
    expect(label).toContain('Two snowy hillsides');
    expect(label).toContain('$12,000 credit card at 26% a year');
    expect(label).toContain('$800 a month');
    for (const id of ['snowball', 'avalanche']) {
      await expect(page.locator(`#lab-${id}`)).toBeVisible();
      await expect(page.locator(`#tag-${id}`)).toBeVisible();
    }
    for (const hill of ['snowball', 'avalanche']) {
      expect(await page.locator(`[id^="bt-${hill}-"] .bt-name`).allTextContents()).toEqual(['Medical 0%', 'Car 6%', 'Card 26%']);
    }
    expect(await page.locator('#summary').textContent()).toBe(label);
    expect(errors).toEqual([]);
  });

  test('the story autoplays from the start and hands off to explore', async ({ page }, info) => {
    normalMotionOnly(info);
    await gotoSnow(page, { pause: false });
    // autoplay: the story clock runs by itself
    await expect.poll(async () => (await state(page)).storyTime, { timeout: 10_000 }).toBeGreaterThan(0.3);
    expect((await state(page)).mode).toBe('story');
    await expect(cap(page).locator('.cap-1')).toContainText('Three debts. The same $800 a month.');
    // run it to the end at 4x so the whole hand-off happens naturally
    await page.evaluate(() => window.__snow.actions.setSpeed(4));
    await expect.poll(async () => (await state(page)).mode, { timeout: 40_000 }).toBe('explore');
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.months).toBe(32);
    expect(s.exploreHint).toBe(true);
    await expect(cap(page).locator('.cap-1')).toHaveText('Explore your own debts');
  });

  test('skip goes straight to explore at the last month', async ({ page }) => {
    await gotoSnow(page, { pause: false });
    await clickSkip(page);
    await frames(page, 3);
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.months).toBe(32);
    await expect(page.locator('#btn-skip')).toBeHidden();
    await expect(page.locator('#btn-play')).toContainText('Play');
  });

  test('the numbers at the end match the engine (labels, readouts and tables)', async ({ page }) => {
    await gotoSnow(page);
    await clickSkip(page);
    await frames(page, 3);
    expect(await labelTexts(page, 'snowball')).toEqual({ name: 'Snowball: smallest first', owed: 'Debt-free in 2 years, 8 months', tag: '$6,295 in interest' });
    expect(await labelTexts(page, 'avalanche')).toEqual({ name: 'Avalanche: highest rate first', owed: 'Debt-free in 2 years, 6 months', tag: '$4,642 in interest' });
    await expect(page.locator('#year-readout')).toHaveText('Year 2, month 8');
    await expect(page.locator('#age-readout')).toHaveText('Year 2, month 8');
    await page.locator('#how > summary').click();
    await frames(page, 2);
    await expect(page.locator('[data-cell="snowball.order"]')).toHaveText('Medical, Car and Card');
    await expect(page.locator('[data-cell="avalanche.order"]')).toHaveText('Card, Car and Medical');
    await expect(page.locator('[data-cell="snowball.payoff"]')).toHaveText('2 years, 8 months');
    await expect(page.locator('[data-cell="avalanche.payoff"]')).toHaveText('2 years, 6 months');
    await expect(page.locator('[data-cell="snowball.months"]')).toHaveText('32');
    await expect(page.locator('[data-cell="avalanche.months"]')).toHaveText('30');
    await expect(page.locator('[data-cell="snowball.interest"]')).toHaveText('$6,295');
    await expect(page.locator('[data-cell="avalanche.interest"]')).toHaveText('$4,642');
    await expect(page.locator('[data-cell="snowball.paid"]')).toHaveText('$25,295');
    await expect(page.locator('[data-cell="avalanche.paid"]')).toHaveText('$23,642');
    for (const [debt, snow, av] of [['medical', 4, 25], ['car', 15, 30], ['card', 32, 28]] as const) {
      await expect(page.locator(`[data-cell="snowball.clear.${debt}"]`)).toHaveText(`Month ${snow}`);
      await expect(page.locator(`[data-cell="avalanche.clear.${debt}"]`)).toHaveText(`Month ${av}`);
    }
    await expect(page.locator('[data-cell="snowball.owed"]')).toHaveText('Debt-free');
    await expect(page.locator('[data-cell="avalanche.count"]')).toHaveText('3 of 3');
    await expect(page.locator('#how-age')).toHaveText('year 2, month 8');
    // the first months of each method: interest, paid, owed and where the extra goes
    const first = page.locator('#excerpt-snowball tbody tr').first();
    await expect(first.locator('th')).toHaveText('1');
    await expect(first.locator('td')).toHaveText(['$290.00', '$800.00', '$18,490.00', 'Medical']);
    await expect(page.locator('#excerpt-avalanche tbody tr').first().locator('td')).toHaveText(['$290.00', '$800.00', '$18,490.00', 'Card']);
    expect(await page.locator('#excerpt-snowball tbody tr').count()).toBe(4);
  });

  test('the labels follow the clock: owed and interest at months 6, 12, 20 and 28', async ({ page }) => {
    await gotoSnow(page);
    for (const months of [6, 12, 20, 28]) {
      await scrub(page, months);
      for (const id of ['snowball', 'avalanche'] as const) {
        const e = simulate(D, id, months);
        const t = await labelTexts(page, id);
        expect(t.owed, `${id} at month ${months}`).toBe(DEBTS.every((d) => e.bal[d] === 0) ? 'Debt-free' : `${usd(e.owed)} still owed`);
        expect(t.tag, `${id} at month ${months}`).toBe(`${usd(e.interest)} in interest`);
        // each ball's tag: what is owed on that debt now (gone once it is cleared)
        for (const d of DEBTS) {
          const owed = page.locator(`#bt-${id}-${d} .bt-owed`);
          if (e.bal[d] === 0) await expect(page.locator(`#bt-${id}-${d}`)).toHaveClass(/off/);
          else await expect(owed, `${id} ${d} at month ${months}`).toHaveText(usd(e.bal[d]));
        }
      }
    }
    // the spec's month-12 figures, debt by debt: medical 0, car $1,253, card $11,458 (snowball); 520, 4,150, 7,668 (avalanche)
    const s12 = simulate(D, 'snowball', 12);
    expect([s12.bal.medical, s12.bal.car, s12.bal.card].map(usd)).toEqual(['$0', '$1,253', '$11,458']);
    const a12 = simulate(D, 'avalanche', 12);
    expect([a12.bal.medical, a12.bal.car, a12.bal.card].map(usd)).toEqual(['$520', '$4,150', '$7,668']);
    await scrub(page, 12);
    await expect(page.locator('#year-readout')).toHaveText('Year 1, month 0');
    expect((await labelTexts(page, 'snowball')).owed).toBe('$12,711 still owed');
    await scrub(page, 15);
    await expect(page.locator('#year-readout')).toHaveText('Year 1, month 3');
  });

  test('story captions carry the live numbers, and the push beat follows the clock in place', async ({ page }, info) => {
    normalMotionOnly(info);
    await gotoSnow(page);
    await seek(page, 0.5);
    await page.waitForTimeout(800);
    await expect(cap(page).locator('.cap-1')).toHaveText('Three debts. The same $800 a month.');
    await expect(cap(page).locator('.cap-2')).toHaveText('Snowball rolls the smallest away first. Avalanche, the highest rate.');
    await seek(page, 8);
    await page.waitForTimeout(800);
    await expect(cap(page).locator('.cap-1')).toHaveText('Interest settles on them every month.');
    await expect(cap(page).locator('.cap-2')).toHaveText('Most on the card at 26%. None on the 0% medical bill.');
    await seek(page, 15);
    await page.waitForTimeout(800);
    await expect(cap(page).locator('.cap-1')).toHaveText('Snowball clears the medical bill in 4 months.');
    await expect(cap(page).locator('.cap-2')).toHaveText('A quick win. Its $40 rolls on to the car loan.');
    await seek(page, 24);
    await page.waitForTimeout(800);
    await expect(cap(page).locator('.cap-1')).toHaveText('Avalanche keeps pushing the card at 26%.');
    const s = await state(page);
    // the live line reads as a statement does: the interest charged so far steps in as each month's interest is charged
    const whole = Math.floor(s.months);
    const shown = s.months - whole < 0.2 ? whole : whole + 1;
    await expect(cap(page).locator('.cap-2')).toHaveText(
      `Interest so far: snowball ${usd(simulate(D, 'snowball', shown).interest)}, avalanche ${usd(simulate(D, 'avalanche', shown).interest)}.`,
    );
    // the line updates without the caption swapping layers
    const layerBefore = await cap(page).getAttribute('data-layer');
    await seek(page, 27);
    await frames(page, 2);
    expect(await cap(page).getAttribute('data-layer')).toBe(layerBefore);
    await seek(page, 33);
    await page.waitForTimeout(800);
    await expect(cap(page).locator('.cap-1')).toHaveText('Avalanche clears the card in 2 years, 4 months.');
    await expect(cap(page).locator('.cap-2')).toHaveText('The costliest debt is gone, so every dollar goes further.');
    await seek(page, 39);
    await page.waitForTimeout(800);
    await expect(cap(page).locator('.cap-1')).toHaveText('Both hills are clear.');
    await expect(cap(page).locator('.cap-2')).toHaveText('Avalanche in 2 years, 6 months. Snowball, 2 months later.');
    await seek(page, 45);
    await page.waitForTimeout(800);
    await expect(cap(page).locator('.cap-1')).toHaveText('Avalanche: $4,642 in interest. Snowball: $6,295.');
    await expect(cap(page).locator('.cap-2')).toHaveText("Snowball's first win came 21 months sooner.");
  });

  test('changing a rate re-renders the numbers and the timeline', async ({ page }) => {
    await gotoSnow(page);
    await clickSkip(page);
    const before = await state(page);
    await page.locator('#f-card-apr').fill('30');
    await page.locator('#f-card-apr').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.inputs.debts.card.apr).toBeCloseTo(0.3, 12);
    expect(s.horizon).toBeGreaterThan(before.horizon);
    await expect(page.locator('#timeline')).toHaveAttribute('max', String(s.horizon));
    // the ball tag follows the rate
    await expect(page.locator('#bt-snowball-card .bt-name')).toHaveText('Card 30%');
    await expect(page.locator('#bt-avalanche-card .bt-name')).toHaveText('Card 30%');
    // the clock stays where it was, so the labels now show money still owed
    expect(s.months).toBe(before.months);
    const inp = { ...D, debts: { ...D.debts, card: { ...D.debts.card, apr: 0.3 } } };
    const e = simulate(inp, 'snowball', Math.floor(s.months));
    expect((await labelTexts(page, 'snowball')).owed).toBe(e.owed === 0 ? 'Debt-free' : `${usd(e.owed)} still owed`);
  });

  test('the budget names what is left to roll, and the rules explain themselves', async ({ page }) => {
    await gotoSnow(page);
    await clickSkip(page);
    await expect(page.locator('#note-budget')).toHaveText('The three minimums are $520, so $280 a month is left to roll toward the target.');
    // a budget under the minimums is refused with the reason
    await page.locator('#f-budget').fill('500');
    await page.locator('#f-budget').press('Enter');
    await expect(page.locator('#err-budget')).toHaveText('The monthly budget must be at least $520, the three minimums.');
    expect((await state(page)).inputs.budget).toBe(800);
    // a minimum under the first month's interest, too
    await page.locator('#f-budget').fill('800');
    await page.locator('#f-budget').press('Enter');
    await page.locator('#f-card-minPayment').fill('250');
    await page.locator('#f-card-minPayment').press('Enter');
    await expect(page.locator('#err-card-minPayment')).toHaveText('The minimum payment must be at least $260 to cover the interest.');
    // the budget equal to the minimums leaves nothing at first
    await page.locator('#f-card-minPayment').fill('300');
    await page.locator('#f-card-minPayment').press('Enter');
    await page.locator('#f-budget').fill('520');
    await page.locator('#f-budget').press('Enter');
    await expect(page.locator('#note-budget')).toContainText('nothing is left over at first');
    expect((await state(page)).inputs.budget).toBe(520);
    await expect(page.locator('#err-budget')).toBeHidden();
  });

  test('the timeline works from the keyboard', async ({ page }) => {
    await gotoSnow(page);
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
    expect((await state(page)).months).toBe(32);
    await page.keyboard.press('PageDown');
    await frames(page, 2);
    expect((await state(page)).months).toBe(20);
    await expect(page.locator('#year-readout')).toHaveText('Year 1, month 8');
    // scrubbing leaves the story and pauses
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.playing).toBe(false);
    // the labels follow the clock
    const e = simulate(D, 'snowball', 20);
    expect((await labelTexts(page, 'snowball')).owed).toBe(`${usd(e.owed)} still owed`);
  });

  test('the timeline is in months with a year tick, and follows the inputs', async ({ page }) => {
    await gotoSnow(page);
    expect(await page.locator('#scale-ticks .tick-label').allTextContents()).toEqual(['0', '1', '2']);
    await expect(page.locator('#scale-ticks .tick')).toHaveCount(3);
    await expect(page.locator('#timeline')).toHaveAttribute('max', '32');
    await expect(page.locator('#timeline')).toHaveAttribute('aria-label', 'Timeline in months');
    // a bigger budget changes the length of the timeline
    await page.locator('#f-budget').fill('3,000');
    await page.locator('#f-budget').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.horizon).toBeLessThan(10);
    await expect(page.locator('#timeline')).toHaveAttribute('max', String(s.horizon));
    expect((await page.locator('#scale-ticks .tick-label').allTextContents())[0]).toBe('0 mo');
  });

  test('an invalid input shows an inline error and keeps the last valid numbers', async ({ page }) => {
    await gotoSnow(page);
    await clickSkip(page);
    const input = page.locator('#f-car-balance');
    await input.fill('50');
    await input.press('Enter');
    await expect(page.locator('#err-car-balance')).toBeVisible();
    await expect(page.locator('#err-car-balance')).toHaveText('The balance must be between $100 and $100,000.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await state(page)).inputs.debts.car.balance).toBe(6000);
    expect((await labelTexts(page, 'snowball')).tag).toBe('$6,295 in interest');
    // not a number
    const rate = page.locator('#f-medical-apr');
    await rate.fill('lots');
    await rate.press('Enter');
    await expect(page.locator('#err-medical-apr')).toHaveText('The interest rate must be a number.');
    // out of range
    await page.locator('#f-card-apr').fill('90');
    await page.locator('#f-card-apr').press('Enter');
    await expect(page.locator('#err-card-apr')).toHaveText('The interest rate must be between 0% and 40%.');
    // fixing them clears the errors
    await input.fill('7000');
    await input.press('Enter');
    await rate.fill('2');
    await rate.press('Enter');
    await page.locator('#f-card-apr').fill('26');
    await page.locator('#f-card-apr').press('Enter');
    await expect(page.locator('#err-car-balance')).toBeHidden();
    await expect(page.locator('#err-medical-apr')).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect((await state(page)).inputs.debts.car.balance).toBe(7000);
    expect((await state(page)).inputs.debts.medical.apr).toBeCloseTo(0.02, 12);
    await page.locator('#f-budget').fill('9');
    await page.locator('#f-budget').press('Enter');
    await expect(page.locator('#err-budget')).toHaveText('The monthly budget must be between $30 and $20,000.');
  });

  test('an interest rate of 0 is accepted: nothing settles on that ball', async ({ page }) => {
    await gotoSnow(page);
    await clickSkip(page);
    await page.locator('#f-card-apr').fill('0');
    await page.locator('#f-card-apr').press('Enter');
    await page.locator('#f-car-apr').fill('0');
    await page.locator('#f-car-apr').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.errors).toEqual({});
    expect(s.inputs.debts.card.apr).toBe(0);
    await scrub(page, 0);
    expect((await labelTexts(page, 'snowball')).tag).toBe('$0 in interest');
    await scrub(page, s.horizon);
    expect((await labelTexts(page, 'avalanche')).tag).toBe('$0 in interest');
    await expect(page.locator('#bt-snowball-card .bt-name')).toHaveText('Card 0%');
  });

  test('steppers change values and the money fields read with grouping', async ({ page }) => {
    await gotoSnow(page);
    await expect(page.locator('#f-budget')).toHaveValue('800');
    await expect(page.locator('#f-medical-balance')).toHaveValue('1,000');
    await expect(page.locator('#f-card-balance')).toHaveValue('12,000');
    await page.getByRole('button', { name: 'Increase monthly budget' }).click();
    await expect(page.locator('#f-budget')).toHaveValue('850');
    await page.getByRole('button', { name: 'Increase car loan balance' }).click();
    await expect(page.locator('#f-car-balance')).toHaveValue('6,500');
    await page.getByRole('button', { name: 'Decrease credit card interest rate' }).click();
    await expect(page.locator('#f-card-apr')).toHaveValue('25.5');
    expect((await state(page)).inputs.debts.card.apr).toBeCloseTo(0.255, 12);
    await page.getByRole('button', { name: 'Increase medical bill minimum payment' }).click();
    await expect(page.locator('#f-medical-minPayment')).toHaveValue('45');
  });

  test('play, pause and speed work in explore', async ({ page }) => {
    await gotoSnow(page);
    await clickSkip(page);
    await scrub(page, 0);
    await page.locator('#btn-play').click();
    await expect(page.locator('#btn-play')).toContainText('Pause');
    // the speed slider runs on a log scale from 0.1x (0) to 5x (1000) in steps of 10: 4x is at about 1000 * ln(40) / ln(50)
    await page.locator('#speed').fill(String(Math.round((100 * Math.log(40)) / Math.log(50)) * 10));
    await expect(page.locator('#speed-readout')).toHaveText('4×');
    await expect.poll(async () => (await state(page)).months, { timeout: 8000 }).toBeGreaterThan(10);
    expect((await state(page)).monthsPerSecond).toBeGreaterThan(8);
    await page.locator('#btn-play').click();
    const m = (await state(page)).months;
    await page.waitForTimeout(300);
    expect((await state(page)).months).toBe(m);
    expect((await state(page)).monthsPerSecond).toBe(0);
    await expect(page.locator('#btn-play')).toHaveText(/Play/);
    expect((await state(page)).speed).toBe(4);
  });

  test('the panel collapses and Space plays', async ({ page }) => {
    await gotoSnow(page);
    const toggle = page.locator('#panel-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#dock')).toBeHidden({ timeout: 2000 });
    await toggle.click();
    await expect(page.locator('#dock')).toBeVisible();
    await clickSkip(page);
    await scrub(page, 0);
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).playing).toBe(true);
  });

  test('labels sit inside the stage and do not overlap each other', async ({ page }) => {
    await gotoSnow(page);
    // (a phone's panel covers the hills: the labels are seen with it folded away)
    if ((page.viewportSize()?.width ?? 1440) < 700) await page.locator('#panel-toggle').click();
    for (const t of [14, 20, 30, 44]) {
      await seek(page, t);
      await page.waitForTimeout(500);
      const boxes = await page.evaluate(() =>
        ['lab-snowball', 'lab-avalanche', 'tag-snowball', 'tag-avalanche'].map((id) => {
          const r = document.getElementById(id)!.getBoundingClientRect();
          return { id, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      // the visible hills are the stage minus the open panel
      const dock = page.locator('#dock');
      const limit = (await dock.isVisible()) ? (await dock.boundingBox())!.x : page.viewportSize()!.width;
      for (const b of boxes) {
        expect(b.x, `${b.id} at t=${t}`).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.w, `${b.id} at t=${t}`).toBeLessThanOrEqual(limit + 1);
        expect(b.w).toBeGreaterThan(0);
      }
      // the two hills' labels never touch
      const [ls, la, ts, ta] = boxes;
      const overlap = ls.x < la.x + la.w && la.x < ls.x + ls.w && ls.y < la.y + la.h && la.y < ls.y + ls.h;
      expect(overlap, `labels overlap at t=${t}`).toBe(false);
      // each label carries its interest line, under what is owed
      for (const [lab, tag] of [[ls, ts], [la, ta]]) {
        expect(tag.x, `${tag.id} at t=${t}`).toBeGreaterThanOrEqual(lab.x - 1);
        expect(tag.x + tag.w, `${tag.id} at t=${t}`).toBeLessThanOrEqual(lab.x + lab.w + 1);
        expect(tag.y + tag.h, `${tag.id} at t=${t}`).toBeLessThanOrEqual(lab.y + lab.h + 1);
        expect(tag.y, `${tag.id} at t=${t}`).toBeGreaterThan(lab.y + lab.h / 2);
      }
    }
  });

  test('each ball carries its name tag, and the tag goes when the debt is cleared', async ({ page }) => {
    await gotoSnow(page);
    // (a phone's panel covers the hills)
    if ((page.viewportSize()?.width ?? 1440) < 700) await page.locator('#panel-toggle').click();
    await scrub(page, 2);
    for (const hill of ['snowball', 'avalanche']) {
      for (const [debt, text] of [['medical', 'Medical 0%'], ['car', 'Car 6%'], ['card', 'Card 26%']] as const) {
        await expect(page.locator(`#bt-${hill}-${debt} .bt-name`)).toHaveText(text);
        await expect(page.locator(`#bt-${hill}-${debt}`)).toBeVisible();
      }
    }
    // month 5: the snowball has cleared the medical bill, the avalanche has not
    await scrub(page, 5);
    await expect(page.locator('#bt-snowball-medical')).toBeHidden();
    await expect(page.locator('#bt-avalanche-medical')).toBeVisible();
    await expect(page.locator('#bt-snowball-car')).toBeVisible();
    // month 26: the avalanche's medical bill is cleared too (month 25); the card is not
    await scrub(page, 26);
    await expect(page.locator('#bt-avalanche-medical')).toBeHidden();
    await expect(page.locator('#bt-avalanche-card')).toBeVisible();
    await expect(page.locator('#bt-snowball-car')).toBeHidden();
    await expect(page.locator('#bt-snowball-card')).toBeVisible();
    // the end: all gone; scrubbing back brings them back
    await scrub(page, 32);
    for (const hill of ['snowball', 'avalanche']) for (const debt of ['medical', 'car', 'card']) await expect(page.locator(`#bt-${hill}-${debt}`)).toBeHidden();
    await scrub(page, 0);
    await expect(page.locator('#bt-snowball-medical')).toBeVisible();
    // every visible tag sits inside the stage
    const limit = page.viewportSize()!.width;
    const boxes = await page.evaluate(() => [...document.querySelectorAll('.ball-tag')].map((e) => e.getBoundingClientRect().toJSON()));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width).toBeLessThanOrEqual(limit + 1);
    }
  });

  test('the labels wait out the opening close-up and appear as the camera settles', async ({ page }, info) => {
    normalMotionOnly(info);
    await gotoSnow(page);
    await seek(page, 2);
    await page.waitForTimeout(900);
    const fade = () => page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--label-fade') || '1'));
    expect(await fade()).toBe(0);
    await seek(page, 20);
    await expect.poll(fade, { timeout: 8000 }).toBeGreaterThan(0.95);
  });

  test('announcements are discrete: the live region only changes on events', async ({ page }) => {
    await gotoSnow(page, { pause: false });
    const region = page.locator('#announcer');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    // (reduced motion does not autoplay: start the story so there is something to pause)
    await page.evaluate(() => window.__snow.actions.play());
    await frames(page, 2);
    await page.evaluate(() => window.__snow.actions.pause());
    await expect(region).toContainText('Paused');
    const before = await region.textContent();
    await page.waitForTimeout(1200);
    expect(await region.textContent()).toBe(before); // nothing per frame while idle
    await page.locator('#f-card-apr').fill('24');
    await page.locator('#f-card-apr').press('Enter');
    await expect(region).toContainText('Updated. Snowball: smallest first:', { timeout: 3000 });
  });

  test('reduced motion: no autoplay, labels still show, story still reaches the numbers', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = await gotoSnow(page, { pause: false });
    await page.waitForTimeout(800);
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.storyTime).toBe(0);
    await expect(page.locator('#reduce-motion')).toBeChecked();
    for (const id of ['snowball', 'avalanche']) await expect(page.locator(`#lab-${id}`)).toBeVisible();
    // the opening is not zoomed, so the labels are there from the start
    expect(await page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--label-fade') || '1'))).toBe(1);
    await clickSkip(page);
    await frames(page, 3);
    expect((await labelTexts(page, 'snowball')).tag).toBe('$6,295 in interest');
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

test.describe('On a Roll: accessibility', () => {
  test('axe: no violations in explore, with details open, with an error showing, and during the story', async ({ page }) => {
    await gotoSnow(page);
    await page.evaluate(() => document.fonts.ready);
    for (const t of [3, 15, 24, 45]) {
      await seek(page, t);
      await page.waitForTimeout(1200);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(r.violations, `story t=${t}\n` + describeViolations(r)).toEqual([]);
    }
    await clickSkip(page);
    await page.waitForTimeout(1800);
    let results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'explore\n' + describeViolations(results)).toEqual([]);

    await page.locator('#how > summary').click();
    await page.evaluate(() => window.__snow.actions.scrubTo(14));
    await page.waitForTimeout(600);
    results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'details open\n' + describeViolations(results)).toEqual([]);

    await page.locator('#f-budget').fill('500');
    await page.locator('#f-budget').press('Enter');
    await expect(page.locator('#err-budget')).toBeVisible();
    await page.locator('#f-card-apr').fill('90');
    await page.locator('#f-card-apr').press('Enter');
    await expect(page.locator('#err-card-apr')).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, 'error\n' + describeViolations(results)).toEqual([]);
  });

  test('controls have accessible names and the title link goes back to the collection', async ({ page }) => {
    await gotoSnow(page);
    await expect(page.getByRole('link', { name: /back to all demonstrations/ })).toHaveAttribute('href', './index.html');
    await expect(page.getByRole('slider', { name: 'Timeline in months' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Playback speed' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Monthly budget/ })).toBeVisible();
    for (const debt of ['Medical bill', 'Car loan', 'Credit card']) {
      await expect(page.getByRole('group', { name: debt })).toBeVisible();
      for (const name of ['Balance', 'Interest rate', 'Minimum payment']) {
        await expect(page.getByRole('group', { name: debt }).getByRole('textbox', { name: new RegExp(name) })).toBeVisible();
      }
    }
    await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeVisible();
    await expect(page.locator('#announcer')).toHaveAttribute('role', 'status');
  });
});
