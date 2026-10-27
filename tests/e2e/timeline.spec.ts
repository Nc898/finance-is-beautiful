import { expect, test } from '@playwright/test';
import { canvasData, frames, gotoReady, scrub, atMoment, state } from './helpers';

test.describe('timeline', () => {
  test('range min/max equal the timeline start and end months', async ({ page }) => {
    await gotoReady(page);
    const s = await state(page);
    const tl = page.locator('#timeline');
    await expect(tl).toHaveAttribute('min', String(s.timelineStartMonths));
    await expect(tl).toHaveAttribute('max', String(s.timelineEndMonths));
    expect(s.timelineStartMonths).toBe(300);
    expect(s.timelineEndMonths).toBe(780);
    await expect(tl).toHaveAttribute('aria-label', 'Timeline age');
    await expect(tl).toHaveAttribute('step', '1');
  });

  test('range bounds follow edited inputs', async ({ page }) => {
    await gotoReady(page);
    await page.locator('#f-startAgeA').fill('30');
    await page.locator('#f-startAgeA').press('Enter');
    await page.locator('#f-endAge').fill('60');
    await page.locator('#f-endAge').press('Enter');
    await frames(page, 3);
    const s = await state(page);
    expect(s.timelineStartMonths).toBe(360);
    expect(s.timelineEndMonths).toBe(720);
    await expect(page.locator('#timeline')).toHaveAttribute('min', '360');
    await expect(page.locator('#timeline')).toHaveAttribute('max', '720');
  });

  test('keyboard: ArrowRight/Left move one month, PageUp/PageDown 12, Home/End jump to the ends', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 45 * 12);
    const tl = page.locator('#timeline');
    await tl.focus();
    await page.keyboard.press('ArrowRight');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(541);
    await page.keyboard.press('ArrowLeft');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(540);
    await page.keyboard.press('PageUp');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(552);
    await expect(tl).toHaveValue('552');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(528);
    await expect(tl).toHaveValue('528');
    await page.keyboard.press('Home');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(300);
    await page.keyboard.press('End');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(780);
    // Clamped at the ends.
    await page.keyboard.press('PageUp');
    await page.keyboard.press('ArrowRight');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(780);
    await page.keyboard.press('Home');
    await page.keyboard.press('PageDown');
    await frames(page, 2);
    expect((await state(page)).ageMonths).toBe(300);
  });

  test('aria-valuetext reads "Age 45 years, 3 months"', async ({ page }) => {
    await gotoReady(page);
    const tl = page.locator('#timeline');
    await scrub(page, 45 * 12 + 3);
    await expect(tl).toHaveAttribute('aria-valuetext', 'Age 45 years, 3 months');
    await scrub(page, 45 * 12);
    await expect(tl).toHaveAttribute('aria-valuetext', 'Age 45 years');
    await scrub(page, 46 * 12 + 1);
    await expect(tl).toHaveAttribute('aria-valuetext', 'Age 46 years, 1 month');
    await expect(page.locator('#age-readout')).toHaveText('Age 46 y 1 mo');
  });

  test('keyboard changes keep aria-valuetext in sync', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 45 * 12);
    await page.locator('#timeline').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await frames(page, 3);
    await expect(page.locator('#timeline')).toHaveAttribute('aria-valuetext', 'Age 45 years, 3 months');
  });

  test('scrubbing while playing pauses at the new age', async ({ page }) => {
    await gotoReady(page);
    await page.evaluate(() => window.__ttg.actions.play());
    await page.locator('#timeline').focus();
    await page.keyboard.press('PageUp');
    await frames(page, 2);
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.ageMonths).toBeGreaterThan(300);
    await expect(page.locator('#btn-play')).toContainText('Play');
  });

  test('pointer drag on the timeline scrubs the age', async ({ page }) => {
    await gotoReady(page, { pause: false });
    const tl = page.locator('#timeline');
    const box = (await tl.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
    await frames(page, 3);
    const s = await state(page);
    // Roughly halfway along the track (thumb inset makes this approximate).
    expect(s.ageMonths).toBeGreaterThan(500);
    expect(s.ageMonths).toBeLessThan(580);
  });

  test.describe('same age, same tree (wind off)', () => {
    // Reduced motion removes wind (the only wall-clock-dependent drawing), so equal age must mean equal pixels.
    test.use({ reducedMotion: 'reduce' });

    test('scrubbing backward to the same age reproduces identical canvas pixels', async ({ page }) => {
      await gotoReady(page);
      expect((await state(page)).reducedMotion).toBe(true);
      await scrub(page, 50 * 12);
      await frames(page, 4);
      const first = await canvasData(page);
      await scrub(page, 65 * 12);
      await frames(page, 4);
      const end = await canvasData(page);
      expect(end).not.toBe(first);
      await scrub(page, 50 * 12);
      await frames(page, 4);
      const again = await canvasData(page);
      expect(again === first, 'canvas at age 50 after scrubbing 65 -> 50 equals the first age-50 render').toBe(true);
    });

    test('same age gives the same tree regardless of path (seedling-stage detour)', async ({ page }) => {
      await gotoReady(page);
      await scrub(page, 55 * 12 + 4);
      await frames(page, 4);
      const direct = await canvasData(page);
      await scrub(page, 26 * 12);
      await frames(page, 4);
      await scrub(page, 55 * 12 + 4);
      await frames(page, 4);
      const fromYounger = await canvasData(page);
      expect(fromYounger === direct, 'age 55y4m after a seedling-stage detour').toBe(true);
    });

    test('story and explore render the same pixels at the same age', async ({ page }) => {
      await gotoReady(page);
      await atMoment(page, 54); // story hold at the end: age 65, no loupe
      await frames(page, 4);
      const fromStory = await canvasData(page);
      await scrub(page, 780);
      await frames(page, 4);
      const fromExplore = await canvasData(page);
      expect(fromExplore === fromStory, 'age 65: story end vs explore end').toBe(true);
    });
  });
});
