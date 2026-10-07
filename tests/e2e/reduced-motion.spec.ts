import { expect, test } from '@playwright/test';
import { canvasData, caption, frames, gotoReady, scrub, seek, skipToExplore, state } from './helpers';

/** This file only runs in the `reduced-motion` project (prefers-reduced-motion: reduce). See playwright.config.ts. */

test.describe('reduced motion (prefers-reduced-motion: reduce)', () => {
  test('the story does not autoplay: paused on moment one with a "Play story" button', async ({ page }) => {
    await gotoReady(page, { pause: false });
    const s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.mode).toBe('story');
    expect(s.playing).toBe(false);
    expect(s.storyTime).toBe(0);
    await expect(page.locator('#btn-play')).toBeVisible();
    await expect(page.locator('#play-label')).toHaveText('Play story');
    await expect(page.locator('#reduce-motion')).toBeChecked();
    await page.waitForTimeout(1200);
    expect((await state(page)).storyTime).toBe(0);
    expect((await caption(page)).primary).toBe('Same monthly contribution. Different starting ages.');
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  });

  test('no wind: two snapshots 500 ms apart at the same story state are identical', async ({ page }) => {
    await gotoReady(page);
    for (const t of [3, 20, 44]) {
      await seek(page, t);
      await frames(page, 4);
      const a = await canvasData(page);
      await page.waitForTimeout(500);
      const b = await canvasData(page);
      expect(b === a, `canvas changed with no state change at story t=${t}`).toBe(true);
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

  test('story holds sit at 25, 25 1/4, 35, 45, 55 and 65', async ({ page }) => {
    await gotoReady(page);
    // Holds are 4.5 s with 0.4 s tweens; the last hold is 7 s.
    const holdAges = [300, 303, 420, 540, 660, 780];
    for (let k = 0; k < holdAges.length; k++) {
      await seek(page, k * 4.9 + 2);
      expect((await state(page)).ageMonths, `hold ${k}`).toBeCloseTo(holdAges[k], 6);
    }
  });

  test('playing the story advances through the holds (no continuous sweep)', async ({ page }) => {
    await gotoReady(page, { pause: false });
    await page.locator('#btn-play').click();
    await page.evaluate(() => window.__ttg.actions.setSpeed(4));
    const res = await page.evaluate(async () => {
      const ages: number[] = [];
      const t0 = performance.now();
      let mode = 'story';
      while (performance.now() - t0 < 20000 && mode === 'story') {
        const s = window.__ttg.getState() as { ageMonths: number; mode: string };
        mode = s.mode;
        ages.push(s.ageMonths);
        await new Promise((r) => setTimeout(r, 40));
      }
      return ages;
    });
    expect((await state(page)).mode).toBe('explore');
    const plateauAges = new Set<number>();
    let run = 1;
    for (let i = 1; i < res.length; i++) {
      run = Math.abs(res[i] - res[i - 1]) < 1e-9 ? run + 1 : 1;
      if (run >= 4) plateauAges.add(Math.round(res[i]));
    }
    for (const hold of [300, 303, 420, 540, 660, 780]) {
      expect(Array.from(plateauAges), `hold at ${hold} months was observed`).toContain(hold);
    }
    // Most of the playback is spent holding still, not sweeping.
    let still = 0;
    for (let i = 1; i < res.length; i++) if (Math.abs(res[i] - res[i - 1]) < 1e-9) still++;
    expect(still / res.length).toBeGreaterThan(0.6);
  });

  test('story ends at 65 in explore mode after playing through', async ({ page }) => {
    await gotoReady(page, { pause: false });
    await seek(page, 33);
    await page.evaluate(() => {
      window.__ttg.actions.setSpeed(4);
      window.__ttg.actions.play();
    });
    await expect.poll(async () => (await state(page)).mode, { timeout: 10_000 }).toBe('explore');
    const s = await state(page);
    expect(s.ageMonths).toBe(780);
    expect(s.playing).toBe(false);
    expect((await caption(page)).primary).toBe('Explore your own timeline');
  });

  test('explore playback still works (age advances, no wind)', async ({ page }) => {
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

  test('checking the box stops autoplay and removes wind; unchecking brings wind back', async ({ page }) => {
    await gotoReady(page, { pause: false });
    expect((await state(page)).reducedMotion).toBe(false);
    expect((await state(page)).playing).toBe(true);
    await page.locator('#reduce-motion').check();
    await frames(page, 3);
    let s = await state(page);
    expect(s.reducedMotion).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.storyTime).toBe(0);
    await expect(page.locator('#play-label')).toHaveText('Play story');
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
