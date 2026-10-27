import { expect, test } from '@playwright/test';
import { canvasData, caption, frames, gotoReady, scrub, atMoment, skipToExplore, state } from './helpers';

/** This file only runs in the `reduced-motion` project (prefers-reduced-motion: reduce). See playwright.config.ts. */

test.describe('reduced motion (prefers-reduced-motion: reduce)', () => {
  test('waits at the first planting, paused, with a Play button', async ({ page }) => {
    await gotoReady(page, { pause: false });
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.ageMonths).toBe(300);
    await expect(page.locator('#btn-play')).toBeVisible();
    await expect(page.locator('#play-label')).toHaveText('Play');
    await expect(page.locator('#reduce-motion')).toBeChecked();
    await page.waitForTimeout(1200);
    expect((await state(page)).ageMonths).toBe(300);
    expect((await caption(page)).primary).toBe('Same monthly contribution. Different starting ages.');
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  });

  test('no wind: two snapshots 500 ms apart at the same moment are identical', async ({ page }) => {
    await gotoReady(page);
    for (const t of [3, 20, 44]) {
      await atMoment(page, t);
      await frames(page, 4);
      const a = await canvasData(page);
      await page.waitForTimeout(500);
      const b = await canvasData(page);
      expect(b === a, `canvas changed with no state change at moment ${t}`).toBe(true);
    }
  });

  test('no wind: two snapshots 500 ms apart at the same explore age are identical', async ({ page }) => {
    await gotoReady(page);
    for (const m of [30 * 12, 45 * 12 + 3, 65 * 12]) {
      await scrub(page, m);
      await frames(page, 4);
      const a = await canvasData(page);
      await page.waitForTimeout(500);
      const b = await canvasData(page);
      expect(b === a, `canvas changed with no state change at age ${m} months`).toBe(true);
    }
  });

  test('playing runs to 65 and stops there, paused, on the difference note', async ({ page }) => {
    await gotoReady(page, { pause: false });
    await atMoment(page, 33);
    await page.evaluate(() => {
      window.__ttg.actions.setSpeed(4);
      window.__ttg.actions.play();
    });
    await expect.poll(async () => (await state(page)).playing, { timeout: 10_000 }).toBe(false);
    const s = await state(page);
    expect(s.ageMonths).toBe(780);
    expect((await caption(page)).primary).toBe('Time gives growth room to branch.');
  });

  test('playback still works (age advances, no wind)', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await scrub(page, 25 * 12);
    await page.locator('#btn-play').click();
    await expect.poll(async () => (await state(page)).ageMonths, { timeout: 5000 }).toBeGreaterThan(25 * 12 + 24);
    await page.locator('#btn-play').click();
  });

  test('the same numbers appear under reduced motion', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await expect(page.locator('#plate-A .plate-balance')).toHaveText('$381,536');
    await expect(page.locator('#plate-B .plate-balance')).toHaveText('$194,903');
    await expect(page.locator('#diff-value')).toHaveText('$186,633');
  });
});

test.describe('in-page "Reduce motion" toggle', () => {
  // Start with the OS preference off so the checkbox is the only switch.
  test.use({ reducedMotion: 'no-preference' });

  test('checking the box removes wind; unchecking brings wind back', async ({ page }) => {
    await gotoReady(page, { pause: false });
    expect((await state(page)).reducedMotion).toBe(false);
    await page.locator('#reduce-motion').check();
    await frames(page, 3);
    let s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    await scrub(page, 50 * 12);
    await frames(page, 4);
    const still1 = await canvasData(page);
    await page.waitForTimeout(500);
    expect((await canvasData(page)) === still1, 'wind is off with the box checked').toBe(true);

    await page.locator('#reduce-motion').uncheck();
    await frames(page, 3);
    s = await state(page);
    expect(s.reducedMotion).toBe(false);
    // Control: with motion on, the same state is no longer static (wind sways the canopy).
    const m1 = await canvasData(page);
    await page.waitForTimeout(500);
    const m2 = await canvasData(page);
    expect(m2 === m1, 'wind should animate the canvas when motion is allowed').toBe(false);
  });
});
