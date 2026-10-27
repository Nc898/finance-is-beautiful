import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  annuityFV,
  caption,
  diffText,
  field,
  frames,
  gotoReady,
  plate,
  scrub,
  atMoment,
  setField,
  skipToExplore,
  state,
  usd,
} from './helpers';

const VALID_DEFAULT = { startAgeA: 25, startAgeB: 35, endAge: 65, monthlyContribution: 200, annualReturn: 0.06 };

async function expectInvalid(page: Page, name: string, text: string, messagePattern: RegExp): Promise<void> {
  await setField(page, name, text);
  const input = field(page, name);
  await expect(input, `${name}="${text}" marks the input invalid`).toHaveAttribute('aria-invalid', 'true');
  const err = page.locator(`#err-${name}`);
  await expect(err).toBeVisible();
  await expect(err).toHaveText(messagePattern);
  await expect(input).toHaveAttribute('aria-describedby', `err-${name}`);
  // The scene keeps the last valid scenario.
  const s = await state(page);
  expect(s.inputs, `${name}="${text}" must not change the scenario`).toEqual(VALID_DEFAULT);
  expect(Object.keys(s.errors)).toContain(name);
  // The raw (invalid) text stays in the field so the user can fix it.
  await expect(input).toHaveValue(text);
  // And the numbers on screen are still the last valid ones.
  await scrub(page, 780);
  expect((await plate(page, 'A')).balance).toBe('$381,536');
  expect((await plate(page, 'B')).balance).toBe('$194,903');
}

/** Restore a field to a valid value and check the error clears. */
async function recover(page: Page, name: string, valid: string): Promise<void> {
  await setField(page, name, valid);
  await expect(field(page, name)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(`#err-${name}`)).toBeHidden();
}

test.describe('inputs: valid changes', () => {
  test('fields start at the defaults', async ({ page }) => {
    await gotoReady(page);
    await expect(field(page, 'startAgeA')).toHaveValue('25');
    await expect(field(page, 'startAgeB')).toHaveValue('35');
    await expect(field(page, 'endAge')).toHaveValue('65');
    await expect(field(page, 'monthlyContribution')).toHaveValue('200');
    await expect(field(page, 'annualReturn')).toHaveValue('6');
  });

  test('contribution 300 scales every balance by 300/200', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'monthlyContribution', '300');
    await skipToExplore(page);
    const s = await state(page);
    expect(s.inputs.monthlyContribution).toBe(300);
    const a = (300 / 200) * 381535.55;
    // 381,535.55 is the rounded annuity; use the exact closed form for the assertion and the spec's shortcut as a cross-check.
    expect((await plate(page, 'A')).balance).toBe(usd(annuityFV(300, 0.06, 480)));
    expect(Math.abs(annuityFV(300, 0.06, 480) - a)).toBeLessThan(0.05);
    expect((await plate(page, 'A')).balance).toBe('$572,303');
    expect((await plate(page, 'B')).balance).toBe(usd(annuityFV(300, 0.06, 360)));
    expect(await diffText(page)).toBe(usd(annuityFV(300, 0.06, 480) - annuityFV(300, 0.06, 360)));
    expect((await plate(page, 'A')).split).toContain(`${usd(300 * 480)} contributed`);
  });

  test('stepper buttons and arrow keys nudge a field and commit', async ({ page }) => {
    await gotoReady(page);
    await page.getByRole('button', { name: 'Increase monthly contribution' }).click();
    await frames(page, 2);
    expect((await state(page)).inputs.monthlyContribution).toBe(225);
    await field(page, 'monthlyContribution').press('ArrowDown');
    await field(page, 'monthlyContribution').press('ArrowDown');
    await frames(page, 2);
    expect((await state(page)).inputs.monthlyContribution).toBe(175);
    await page.getByRole('button', { name: 'Increase assumed annual return' }).click();
    await frames(page, 2);
    expect((await state(page)).inputs.annualReturn).toBeCloseTo(0.065, 10);
    await expect(field(page, 'annualReturn')).toHaveValue('6.5');
  });

  test('typing commits after a short pause without pressing Enter', async ({ page }) => {
    await gotoReady(page);
    await field(page, 'monthlyContribution').fill('400');
    await expect.poll(async () => (await state(page)).inputs.monthlyContribution, { timeout: 3000 }).toBe(400);
  });

  test('the scene scale follows the new inputs (both trees together)', async ({ page }) => {
    await gotoReady(page);
    const before = await state(page);
    await setField(page, 'monthlyContribution', '1000');
    await expect.poll(async () => (await state(page)).displayScale, { timeout: 5000 }).toBeCloseTo(
      (await state(page)).targetScale,
      0,
    );
    const after = await state(page);
    expect(after.targetScale).toBeGreaterThan(before.targetScale * 4.5);
  });
});

test.describe('inputs: validation', () => {
  test('start A 70 > end 65 shows an inline error and keeps the last valid scenario', async ({ page }) => {
    await gotoReady(page);
    await expectInvalid(page, 'startAgeA', '70', /Tree A.*starting age.*at or before the ending age/i);
    await recover(page, 'startAgeA', '25');
  });

  test('return 20% (above the 12% limit)', async ({ page }) => {
    await gotoReady(page);
    await expectInvalid(page, 'annualReturn', '20', /annual return must be between/i);
    await recover(page, 'annualReturn', '6');
  });

  test('contribution -5', async ({ page }) => {
    await gotoReady(page);
    await expectInvalid(page, 'monthlyContribution', '-5', /monthly contribution must be between/i);
    await recover(page, 'monthlyContribution', '200');
  });

  test('contribution "abc"', async ({ page }) => {
    await gotoReady(page);
    await expectInvalid(page, 'monthlyContribution', 'abc', /must be a number/i);
    await recover(page, 'monthlyContribution', '200');
  });

  test('age 25.5 (not a whole number of years)', async ({ page }) => {
    await gotoReady(page);
    await expectInvalid(page, 'startAgeA', '25.5', /whole number of years/i);
    await recover(page, 'startAgeA', '25');
  });

  test('ages outside 16-90 and an empty field are rejected', async ({ page }) => {
    await gotoReady(page);
    await expectInvalid(page, 'endAge', '95', /between 16 and 90/i);
    await recover(page, 'endAge', '65');
    await expectInvalid(page, 'startAgeB', '10', /between 16 and 90/i);
    await recover(page, 'startAgeB', '35');
    await expectInvalid(page, 'startAgeB', '', /must be a number/i);
    await recover(page, 'startAgeB', '35');
  });

  test('an error is announced in the live region and cleared by a valid value', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'annualReturn', '20');
    await expect(page.locator('#announcer')).toContainText(/annual return must be between/i, { timeout: 3000 });
    await setField(page, 'annualReturn', '6');
    await expect(page.locator('#err-annualReturn')).toBeHidden();
    expect((await state(page)).errors).toEqual({});
  });

  test('invalid text while playing changes nothing and keeps playing', async ({ page }) => {
    await gotoReady(page);
    await page.evaluate(() => window.__ttg.actions.play());
    await setField(page, 'monthlyContribution', 'abc');
    const s = await state(page);
    // An invalid draft is not a scenario change
    expect(s.inputs.monthlyContribution).toBe(200);
    expect(s.playing).toBe(true);
  });
});

test.describe('inputs: edge scenarios', () => {
  test('start B equal to start A: identical numbers and no "begins" beat', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'startAgeB', '25');
    await skipToExplore(page);
    const a = await plate(page, 'A');
    const b = await plate(page, 'B');
    expect(b.balance).toBe(a.balance);
    expect(b.balance).toBe('$381,536');
    expect(b.split).toBe(a.split);
    expect(await diffText(page)).toBe('$0');
    // No note anywhere on the timeline mentions Tree B beginning.
    for (const t of [0.03, 0.15, 0.22, 0.3, 0.37, 0.55, 0.74, 0.81, 0.96]) {
      await atMoment(page, t * 54);
      const cap = await caption(page);
      expect(cap.primary, `caption at ${t}`).not.toMatch(/begins/i);
      expect(cap.secondary, `caption at ${t}`).not.toMatch(/waits until/i);
    }
    await atMoment(page, 0.03 * 54);
    expect((await caption(page)).primary).toBe('Same monthly contribution. Same starting age.');
    await atMoment(page, 0.81 * 54);
    expect((await caption(page)).primary).toBe('Starting together, the two trees grow together.');
  });

  test('start B equal to the ending age: B shows "No growing time before 65" and $0', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'startAgeB', '65');
    expect((await state(page)).errors).toEqual({});
    await skipToExplore(page);
    const b = await plate(page, 'B');
    expect(b.balance).toBe('No growing time before 65');
    expect(b.split).toBe('');
    const a = await plate(page, 'A');
    expect(a.balance).toBe('$381,536');
    await expect(page.locator('#diff')).not.toHaveClass(/\bon\b/);
    // The table reports B as $0.
    await page.locator('#how > summary').click();
    await frames(page, 3);
    await expect(page.locator('[data-cell="B.balance"]')).toHaveText('$0');
    await expect(page.locator('[data-cell="B.count"]')).toHaveText('0');
    await expect(page.locator('#conv-count')).toContainText('No monthly contributions');
  });

  test('negative return: growth is negative and the balance is below contributions', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'annualReturn', '-2');
    expect((await state(page)).errors).toEqual({});
    expect((await state(page)).inputs.annualReturn).toBeCloseTo(-0.02, 10);
    await skipToExplore(page);
    const a = await plate(page, 'A');
    const m = a.split.match(/^(.+?) contributed . (.+?) modeled growth$/);
    expect(m, `split text: "${a.split}"`).not.toBeNull();
    expect(m![2]).toMatch(/^−\$[\d,]+$/);
    const contributed = Number(m![1].replace(/[$,]/g, ''));
    const balance = Number(a.balance.replace(/[$,]/g, ''));
    expect(contributed).toBe(96000);
    expect(balance).toBeLessThan(contributed);
    expect(balance).toBeGreaterThan(0);
    expect(balance).toBe(Math.round(annuityFV(200, -0.02, 480)));
    expect(m![2]).toBe(usd(annuityFV(200, -0.02, 480) - 96000));
  });

  test('zero contribution: both trees show $0', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'monthlyContribution', '0');
    expect((await state(page)).errors).toEqual({});
    await skipToExplore(page);
    expect((await plate(page, 'A')).balance).toBe('$0');
    expect((await plate(page, 'B')).balance).toBe('$0');
    expect(await diffText(page)).toBe('$0');
    await atMoment(page, 0.81 * 54);
    expect((await caption(page)).primary).toBe('Time gives growth room to branch.');
    await atMoment(page, 0.19 * 54);
    expect((await caption(page)).primary).toBe('In this scenario, nothing goes in each month.');
  });

  test('zero return: balance equals contributed', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'annualReturn', '0');
    expect((await state(page)).errors).toEqual({});
    await skipToExplore(page);
    const a = await plate(page, 'A');
    const b = await plate(page, 'B');
    expect(a.balance).toBe('$96,000');
    expect(b.balance).toBe('$72,000');
    expect(a.split).toContain('$96,000 contributed');
    expect(a.split).toContain('$0 modeled growth');
    expect(b.split).toContain('$72,000 contributed');
    expect(await diffText(page)).toBe('$24,000');
    expect(a.split).not.toContain('−');
  });

  test('extremes: 5,000/month at 12% and the 16-90 age span stay finite', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'startAgeA', '16');
    await setField(page, 'endAge', '90');
    await setField(page, 'monthlyContribution', '5000');
    await setField(page, 'annualReturn', '12');
    expect((await state(page)).errors).toEqual({});
    await skipToExplore(page);
    const a = await plate(page, 'A');
    expect(a.balance).toBe(usd(annuityFV(5000, 0.12, (90 - 16) * 12)));
    expect(a.balance).not.toMatch(/NaN|Infinity/);
  });
});

test.describe('inputs during playback and clamping', () => {
  test('input change during explore playback keeps ageMonths (in one tick) and keeps playing', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 40 * 12);
    const r = await page.evaluate(() => {
      const a = window.__ttg.actions;
      a.play();
      const before = window.__ttg.getState() as { ageMonths: number; playing: boolean };
      a.setDraftField('monthlyContribution', '250');
      a.commitInputs();
      const after = window.__ttg.getState() as { ageMonths: number; playing: boolean; inputs: { monthlyContribution: number } };
      return { before, after };
    });
    expect(r.before.playing).toBe(true);
    expect(r.after.inputs.monthlyContribution).toBe(250);
    expect(r.after.ageMonths).toBe(r.before.ageMonths);
    expect(r.after.playing).toBe(true);
    // And it carries on from there.
    await expect.poll(async () => (await state(page)).ageMonths, { timeout: 5000 }).toBeGreaterThan(r.before.ageMonths + 12);
  });

  test('editing an input through the UI while exploring keeps the age when it is still in range', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 50 * 12 + 5);
    await setField(page, 'monthlyContribution', '300');
    const s = await state(page);
    expect(s.ageMonths).toBe(50 * 12 + 5);
  });

  test('end age lowered below the current age clamps to the new end and pauses', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 62 * 12);
    await page.evaluate(() => window.__ttg.actions.play());
    expect((await state(page)).playing).toBe(true);
    await setField(page, 'endAge', '50');
    const s = await state(page);
    expect(s.inputs.endAge).toBe(50);
    expect(s.ageMonths).toBe(600);
    expect(s.timelineEndMonths).toBe(600);
    expect(s.playing).toBe(false);
    await expect(page.locator('#timeline')).toHaveValue('600');
    await expect(page.locator('#btn-play')).toContainText('Play');
  });

  test('end age lowered below the current age (paused) also clamps to the new end', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 64 * 12);
    await setField(page, 'endAge', '55');
    const s = await state(page);
    expect(s.ageMonths).toBe(660);
    expect(s.playing).toBe(false);
  });

  test('start ages raised above the current age clamp to the new timeline start', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 25 * 12 + 4);
    await setField(page, 'startAgeA', '30');
    let s = await state(page);
    // B still starts at 35, so the timeline now begins at A's 30.
    expect(s.timelineStartMonths).toBe(360);
    expect(s.ageMonths).toBe(360);
    await scrub(page, 31 * 12);
    await setField(page, 'startAgeA', '40');
    await setField(page, 'startAgeB', '45');
    s = await state(page);
    expect(s.timelineStartMonths).toBe(480);
    expect(s.ageMonths).toBe(480);
    await expect(page.locator('#timeline')).toHaveAttribute('min', '480');
  });

  test('changing inputs while paused keeps the current age, paused', async ({ page }) => {
    await gotoReady(page);
    await atMoment(page, 26);
    const before = await state(page);
    await setField(page, 'monthlyContribution', '250');
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.ageMonths).toBe(before.ageMonths);
  });

  test('Play from the end after edits starts again from the edited start', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'startAgeA', '30');
    await skipToExplore(page);
    await page.locator('#btn-play').click();
    await frames(page, 2);
    const s = await state(page);
    expect(s.playing).toBe(true);
    expect(s.ageMonths).toBeGreaterThanOrEqual(360);
    expect(s.ageMonths).toBeLessThan(372);
  });
});
