import { expect, test } from '@playwright/test';
import { annuityFV, diffText, frames, gotoReady, openDetails, plate, scrub, atMoment, state, usd } from './helpers';

/** Table cell text for a data-cell key. */
const cell = (page: import('@playwright/test').Page, key: string) =>
  page
    .locator(`[data-cell="${key}"]`)
    .textContent()
    .then((t) => (t ?? '').replace(/\s+/g, ' ').trim());

test.describe('numbers', () => {
  test('difference moment shows the engine values on the plates and difference label', async ({ page }) => {
    await gotoReady(page);
    await atMoment(page, 44);
    const a = await plate(page, 'A');
    const b = await plate(page, 'B');
    expect(a.balance).toBe('$381,536');
    expect(b.balance).toBe('$194,903');
    expect(a.split).toContain('$96,000 contributed');
    expect(a.split).toContain('$285,536 modeled growth');
    expect(b.split).toContain('$72,000 contributed');
    expect(b.split).toContain('$122,903 modeled growth');
    expect(await diffText(page)).toBe('$186,633');
    expect(a.name).toBe('Tree A · started at 25 · Year 40');
    expect(b.name).toBe('Tree B · started at 35 · Year 30');
  });

  test('details table matches the plates at the difference moment', async ({ page }) => {
    await gotoReady(page);
    await atMoment(page, 44);
    await openDetails(page);
    expect(await cell(page, 'A.balance')).toBe('$381,536');
    expect(await cell(page, 'B.balance')).toBe('$194,903');
    expect(await cell(page, 'A.contributed')).toBe('$96,000');
    expect(await cell(page, 'B.contributed')).toBe('$72,000');
    expect(await cell(page, 'A.growth')).toBe('$285,536');
    expect(await cell(page, 'B.growth')).toBe('$122,903');
    expect(await cell(page, 'A.count')).toBe('480');
    expect(await cell(page, 'B.count')).toBe('360');
    expect(await cell(page, 'A.start')).toBe('25');
    expect(await cell(page, 'B.start')).toBe('35');
    expect(await cell(page, 'gap.balance')).toBe('$186,633');
    expect(await cell(page, 'gap.contributions')).toBe('$24,000');
    expect(await cell(page, 'gap.growth')).toBe('$162,633');
    expect(await cell(page, 'gap.label')).toBe('Difference (Tree A ahead)');
    await expect(page.locator('#how-age')).toHaveText('age 65 years');
  });

  test('independent closed-form check of the headline values', async () => {
    // Sanity-check the test's own annuity formula against the documented engine values.
    const a = annuityFV(200, 0.06, 480);
    const b = annuityFV(200, 0.06, 360);
    expect(usd(a)).toBe('$381,536');
    expect(usd(b)).toBe('$194,903');
    expect(usd(a - b)).toBe('$186,633');
    expect(usd(a - 96000)).toBe('$285,536');
    expect(usd(b - 72000)).toBe('$122,903');
  });

  test('scrubbing to age 45 matches the closed-form annuity for 240 and 120 months', async ({ page }) => {
    await gotoReady(page);
    await openDetails(page);
    await scrub(page, 45 * 12);
    const fvA = annuityFV(200, 0.06, 240);
    const fvB = annuityFV(200, 0.06, 120);
    const a = await plate(page, 'A');
    const b = await plate(page, 'B');
    expect(a.balance).toBe(usd(fvA));
    expect(b.balance).toBe(usd(fvB));
    expect(a.split).toContain(`${usd(200 * 240)} contributed`);
    expect(a.split).toContain(`${usd(fvA - 200 * 240)} modeled growth`);
    expect(b.split).toContain(`${usd(200 * 120)} contributed`);
    expect(b.split).toContain(`${usd(fvB - 200 * 120)} modeled growth`);
    expect(await diffText(page)).toBe(usd(fvA - fvB));
    // Table agrees.
    expect(await cell(page, 'A.balance')).toBe(usd(fvA));
    expect(await cell(page, 'B.balance')).toBe(usd(fvB));
    expect(await cell(page, 'A.count')).toBe('240');
    expect(await cell(page, 'B.count')).toBe('120');
    expect(await cell(page, 'gap.balance')).toBe(usd(fvA - fvB));
  });

  test('values at several ages follow the closed form month by month', async ({ page }) => {
    await gotoReady(page);
    for (const ageMonths of [26 * 12 + 1, 30 * 12, 35 * 12 + 1, 41 * 12 + 7, 52 * 12 + 11, 64 * 12 + 11]) {
      await scrub(page, ageMonths);
      const nA = ageMonths - 25 * 12;
      const nB = Math.max(0, ageMonths - 35 * 12);
      expect((await plate(page, 'A')).balance, `A at ${ageMonths} mo`).toBe(usd(annuityFV(200, 0.06, nA)));
      if (nB > 0) expect((await plate(page, 'B')).balance, `B at ${ageMonths} mo`).toBe(usd(annuityFV(200, 0.06, nB)));
    }
  });

  test('displayed numbers use completed months only (no mid-month interpolation)', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 40 * 12 + 0.9);
    expect((await plate(page, 'A')).balance).toBe(usd(annuityFV(200, 0.06, 180)));
    await scrub(page, 40 * 12 + 1);
    expect((await plate(page, 'A')).balance).toBe(usd(annuityFV(200, 0.06, 181)));
  });

  test('before 35 Tree B shows "Plants at 35" and no balance', async ({ page }) => {
    await gotoReady(page);
    for (const m of [25 * 12, 30 * 12, 34 * 12 + 11]) {
      await scrub(page, m);
      const b = await plate(page, 'B');
      expect(b.balance, `B at ${m}`).toBe('Plants at 35');
      expect(b.name).toBe('Tree B · starts at 35');
      expect(b.split).toBe('');
      await expect(page.locator('#plate-B')).toHaveAttribute('data-hold', '');
      await expect(page.locator('#diff')).not.toHaveClass(/\bon\b/);
    }
    await scrub(page, 35 * 12);
    // At exactly 35 B is planted with zero contributions made.
    expect((await plate(page, 'B')).balance).toBe('$0');
    await scrub(page, 35 * 12 + 1);
    expect((await plate(page, 'B')).balance).toBe(usd(200));
  });

  test('the story reaches the same final numbers as exploring to the end', async ({ page }) => {
    await gotoReady(page);
    await atMoment(page, 54);
    const sA = (await plate(page, 'A')).balance;
    const sB = (await plate(page, 'B')).balance;
    await scrub(page, 780);
    expect((await plate(page, 'A')).balance).toBe(sA);
    expect((await plate(page, 'B')).balance).toBe(sB);
    expect((await state(page)).ageMonths).toBe(780);
  });

  test('numbers do not change while only time passes inside one month', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 50 * 12 + 3.1);
    const before = await plate(page, 'A');
    await scrub(page, 50 * 12 + 3.9);
    await frames(page, 2);
    expect(await plate(page, 'A')).toEqual(before);
  });
});
