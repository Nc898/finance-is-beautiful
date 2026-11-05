import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames } from './helpers';

/** Shape of `window.__wood.getState()` (see src/wood/main.ts). */
interface WoodState {
  inputs: { start: number; monthly: number; years: number; growth: number; fees: { a: number; b: number } };
  errors: Record<string, string>;
  months: number;
  horizon: number;
  playing: boolean;
  speed: number;
  reducedMotion: boolean;
}

const state = async (page: Page) => (await page.evaluate(() => window.__wood.getState())) as WoodState;

async function gotoWood(page: Page, opts: { intro?: boolean } = {}): Promise<string[]> {
  const { intro = false } = opts;
  if (!intro) await page.addInitScript(() => sessionStorage.setItem('fib-intro-seen:a-little-off-the-top', '1'));
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('/a-little-off-the-top.html');
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  await frames(page, 2);
  if (!intro) {
    const toggle = page.locator('#panel-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
      await expect(page.locator('#dock')).toBeVisible();
    }
  }
  return errors;
}

const scrub = async (page: Page, months: number) => {
  await page.evaluate((m) => window.__wood.actions.scrubTo(m), months);
  await frames(page, 3);
};

test.describe('A Little Off the Top', () => {
  test('loads with the title, a described canvas, two tree labels and no console errors', async ({ page }) => {
    const errors = await gotoWood(page);
    await expect(page).toHaveTitle('A Little Off the Top');
    await expect(page.locator('#scene')).toHaveAttribute('aria-label', /Two trees in a bluebell wood/);
    await expect(page.locator('#plate-a .plate-name')).toHaveText('1% fee');
    await expect(page.locator('#plate-b .plate-name')).toHaveText('0.1% fee');
    const s = await state(page);
    expect(s.months).toBe(0);
    expect(s.playing).toBe(false);
    expect(s.horizon).toBe(480);
    expect(errors).toEqual([]);
  });

  test('the introduction opens first, and closes to the scene', async ({ page }) => {
    await gotoWood(page, { intro: true });
    const dialog = page.locator('#intro');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.intro-title')).toHaveText('A Little Off the Top');
    await dialog.locator('[data-intro-close]').click();
    await expect(dialog).toBeHidden();
  });

  test('the labels, the difference and the notes carry the verified numbers at the end', async ({ page }) => {
    await gotoWood(page);
    await scrub(page, 480);
    await expect(page.locator('#plate-a .plate-terms')).toHaveText('Worth $1,103,491');
    await expect(page.locator('#plate-b .plate-terms')).toHaveText('Worth $1,432,635');
    await expect(page.locator('#plate-a .plate-owed')).toHaveText('$143,218 in fees');
    await expect(page.locator('#plate-a .plate-interest')).toHaveText('$372,030 lost to the fee');
    await expect(page.locator('#diff-label')).toHaveText('B ends ahead by');
    await expect(page.locator('#diff-value')).toHaveText('$329,144');
    await expect(page.locator('#caption .cap.on .cap-1')).toHaveText('A: $1,103,491. B: $1,432,635.');
    await expect(page.locator('#caption .cap.on .cap-2')).toContainText('$372,030, 25%');
  });

  test('the notes follow the month in order', async ({ page }) => {
    await gotoWood(page);
    const seen: string[] = [];
    for (const m of [0, 6, 60, 200, 400, 475]) {
      await scrub(page, m);
      seen.push((await page.locator('#caption .cap.on .cap-1').textContent()) ?? '');
    }
    expect(seen).toEqual([
      'The same savings. The same growth.',
      'Every month, a little off the top.',
      '1% looks like very little.',
      'The fee grows with the fund.',
      "Now A's fee each year is more than A saves in a year.",
      'A: $1,103,491. B: $1,432,635.',
    ]);
  });

  test('play runs the timeline and pause stops it', async ({ page }) => {
    await gotoWood(page);
    await page.locator('#btn-play').click();
    await page.waitForTimeout(800);
    await page.locator('#btn-play').click();
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.months).toBeGreaterThan(4);
    expect(s.months).toBeLessThan(40);
  });

  test('editing a fee updates the numbers; an invalid fee shows an error and keeps the last valid inputs', async ({ page }) => {
    await gotoWood(page);
    const fee = page.locator('#f-a-fee');
    await fee.fill('2');
    await fee.press('Enter');
    await expect.poll(async () => (await state(page)).inputs.fees.a).toBe(0.02);
    await expect(page.locator('#plate-a .plate-name')).toHaveText('2% fee');
    await fee.fill('9');
    await fee.press('Enter');
    await expect(page.locator('#err-a-fee')).toHaveText('A fee must be between 0% and 3%.');
    await expect(fee).toHaveAttribute('aria-invalid', 'true');
    expect((await state(page)).inputs.fees.a).toBe(0.02);
    await fee.fill('0.1');
    await fee.press('Enter');
    await expect(page.locator('#err-a-fee')).toBeHidden();
    // equal fees: one plain note, no difference
    await scrub(page, 200);
    await expect(page.locator('#caption .cap.on .cap-1')).toHaveText('The same fee twice.');
    await expect(page.locator('#diff')).toBeHidden();
  });

  test('the steppers move the fee in small steps', async ({ page }) => {
    await gotoWood(page);
    await page.locator('[data-field="b.fee"] .step[data-dir="1"]').click();
    await expect.poll(async () => (await state(page)).inputs.fees.b).toBeCloseTo(0.0015, 9);
  });

  test('the labels sit inside the stage and do not overlap each other', async ({ page }) => {
    await gotoWood(page);
    await scrub(page, 480);
    const stage = (await page.locator('#stage').boundingBox())!;
    const a = (await page.locator('#plate-a').boundingBox())!;
    const b = (await page.locator('#plate-b').boundingBox())!;
    for (const r of [a, b]) {
      expect(r.x).toBeGreaterThanOrEqual(stage.x - 1);
      expect(r.y + r.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
    }
    const apart = a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;
    expect(apart).toBe(true);
  });

  test('reduced motion: the same month paints the same pixels', async ({ page }) => {
    await gotoWood(page);
    await page.evaluate(() => window.__wood.actions.setReducedMotion(true));
    await scrub(page, 300);
    await page.waitForTimeout(1700);
    const one = await page.locator('#scene').screenshot();
    await page.waitForTimeout(500);
    const two = await page.locator('#scene').screenshot();
    expect(one.equals(two)).toBe(true);
  });
});

test.describe('A Little Off the Top: accessibility', () => {
  test('axe: no violations with the panel open, at the end, and with the explanation open', async ({ page }) => {
    await gotoWood(page);
    await scrub(page, 480);
    await page.locator('#how summary').click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
