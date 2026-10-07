import { expect, test } from '@playwright/test';
import { STORY_DURATION, caption, diffText, frames, gotoReady, plate, seek, state } from './helpers';

test.describe('guided story', () => {
  test('autoplays after the scene is ready', async ({ page }) => {
    await gotoReady(page, { pause: false });
    const s0 = await state(page);
    expect(s0.mode).toBe('story');
    expect(s0.playing).toBe(true);
    await expect.poll(async () => (await state(page)).storyTime, { timeout: 5000 }).toBeGreaterThan(0.4);
    await expect(page.locator('#play-label')).toHaveText('Pause story');
  });

  test('shows the right caption for each chapter', async ({ page }) => {
    await gotoReady(page);
    const cases: Array<[number, string, string?]> = [
      [3, 'Same monthly contribution. Different starting ages.', 'Tree A starts at 25. Tree B starts at 35.'],
      [10, 'Each month, $200 goes in.'],
      [16, 'At 35, Tree B begins.'],
      [26, 'Growth is reinvested, so branches grow new branches.'],
      [
        44,
        'Time gives growth room to branch.',
        '$24,000 of the gap is extra contributions. $162,633 is growth that had ten more years to compound.',
      ],
      [52, 'Explore your own timeline'],
    ];
    for (const [t, primary, secondary] of cases) {
      await seek(page, t);
      const cap = await caption(page);
      expect(cap.primary, `primary caption at t=${t}`).toBe(primary);
      if (secondary) expect(cap.secondary, `secondary caption at t=${t}`).toBe(secondary);
    }
  });

  test('story age is monotonic from the earlier start to the ending age', async ({ page }) => {
    await gotoReady(page);
    let prev = -Infinity;
    for (let t = 0; t <= STORY_DURATION; t += 1.5) {
      await page.evaluate((s) => window.__ttg.actions.seekStory(s), t);
      const age = (await state(page)).ageMonths;
      expect(age, `age at t=${t}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = age;
    }
    await seek(page, 0);
    expect((await state(page)).ageMonths).toBeCloseTo(300, 6);
    await seek(page, STORY_DURATION);
    expect((await state(page)).ageMonths).toBeCloseTo(780, 6);
  });

  test('story is ~54 s long at 1x', async ({ page }) => {
    await gotoReady(page);
    await page.evaluate(() => window.__ttg.actions.seekStory(10_000));
    const s = await state(page);
    expect(s.storyTime).toBeCloseTo(STORY_DURATION, 6);
    expect(s.mode).toBe('story');
  });

  test('pause stops and resume restarts the story clock', async ({ page }) => {
    await gotoReady(page, { pause: false });
    const play = page.locator('#btn-play');
    await expect(play).toContainText('Pause story');
    await play.click();
    await expect(play).toContainText('Resume story');
    expect((await state(page)).playing).toBe(false);
    const t0 = (await state(page)).storyTime;
    await page.waitForTimeout(500);
    expect((await state(page)).storyTime).toBe(t0);

    await play.click();
    await expect(play).toContainText('Pause story');
    await expect.poll(async () => (await state(page)).storyTime, { timeout: 5000 }).toBeGreaterThan(t0 + 0.3);
  });

  test('Replay resets the story to the start and plays', async ({ page }) => {
    await gotoReady(page);
    await seek(page, 30);
    expect((await state(page)).storyTime).toBe(30);
    await page.locator('#btn-replay').click();
    await frames(page, 2);
    const s = await state(page);
    expect(s.mode).toBe('story');
    expect(s.storyTime).toBeLessThan(1);
    expect(s.playing).toBe(true);
    expect(s.ageMonths).toBeLessThan(310);
    expect((await caption(page)).primary).toBe('Same monthly contribution. Different starting ages.');
  });

  test('Skip to explore jumps to age 65, paused, with results visible', async ({ page }) => {
    await gotoReady(page, { pause: false });
    await page.locator('#btn-skip').click();
    await frames(page, 3);
    const s = await state(page);
    expect(s.mode).toBe('explore');
    expect(s.ageMonths).toBe(780);
    expect(s.playing).toBe(false);
    await expect(page.locator('#diff')).toHaveClass(/\bon\b/);
    expect(await diffText(page)).toBe('$186,633');
    expect((await plate(page, 'A')).balance).toBe('$381,536');
    expect((await plate(page, 'B')).balance).toBe('$194,903');
    await expect(page.locator('#plate-A')).not.toHaveClass(/hide-split/);
    expect((await caption(page)).primary).toBe('Explore your own timeline');
    await expect(page.locator('#btn-play')).toContainText('Play');
    await expect(page.locator('#btn-skip')).toBeHidden();
  });

  test('results stay hidden early in the story and appear at the difference moment', async ({ page }) => {
    await gotoReady(page);
    await seek(page, 20);
    await expect(page.locator('#plate-A')).toHaveClass(/hide-split/);
    await expect(page.locator('#diff')).not.toHaveClass(/\bon\b/);
    await seek(page, 44);
    await expect(page.locator('#plate-A')).not.toHaveClass(/hide-split/);
    await expect(page.locator('#diff')).toHaveClass(/\bon\b/);
  });

  test('speed 2x advances the story clock about twice as fast as 1x', async ({ page }) => {
    await gotoReady(page);
    // Stay inside the growing chapter so nothing hits an end clamp; measure real elapsed time in the page.
    const rate = (speed: number) =>
      page.evaluate(async (sp) => {
        const a = window.__ttg.actions;
        a.seekStory(8);
        a.setSpeed(sp as 1 | 2);
        const s0 = (window.__ttg.getState() as { storyTime: number }).storyTime;
        const t0 = performance.now();
        a.play();
        await new Promise((r) => setTimeout(r, 1200));
        const s1 = (window.__ttg.getState() as { storyTime: number }).storyTime;
        const dt = (performance.now() - t0) / 1000;
        a.pause();
        return (s1 - s0) / dt;
      }, speed);
    const r1 = await rate(1);
    const r2 = await rate(2);
    expect(r1).toBeGreaterThan(0.75);
    expect(r1).toBeLessThan(1.15);
    expect(r2 / r1).toBeGreaterThan(1.7);
    expect(r2 / r1).toBeLessThan(2.3);
  });

  test('speed radios drive the store', async ({ page }) => {
    await gotoReady(page);
    for (const v of ['0.5', '2', '4', '1']) {
      await page.locator(`#speeds input[value="${v}"]`).check({ force: true });
      expect((await state(page)).speed).toBe(Number(v));
    }
  });

  test('end of story hands off to explore with "Explore your own timeline"', async ({ page }) => {
    await gotoReady(page);
    await seek(page, 53);
    await page.evaluate(() => {
      window.__ttg.actions.setSpeed(4);
      window.__ttg.actions.play();
    });
    await expect.poll(async () => (await state(page)).mode, { timeout: 8000 }).toBe('explore');
    await frames(page, 3);
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.ageMonths).toBe(780);
    expect(s.exploreHint).toBe(true);
    expect((await caption(page)).primary).toBe('Explore your own timeline');
    await expect(page.locator('#diff')).toHaveClass(/\bon\b/);
  });

  test('story copy follows edited inputs (no hard-coded values)', async ({ page }) => {
    await gotoReady(page);
    await page.locator('#f-monthlyContribution').fill('350');
    await page.locator('#f-monthlyContribution').press('Enter');
    await page.locator('#f-startAgeB').fill('40');
    await page.locator('#f-startAgeB').press('Enter');
    await frames(page, 3);
    expect((await state(page)).inputs.startAgeB).toBe(40);
    await page.locator('#btn-replay').click();
    await page.evaluate(() => window.__ttg.actions.pause());
    await seek(page, 3);
    expect((await caption(page)).secondary).toBe('Tree A starts at 25. Tree B starts at 40.');
    await seek(page, 10);
    expect((await caption(page)).primary).toBe('Each month, $350 goes in.');
    await seek(page, 16);
    expect((await caption(page)).primary).toBe('At 40, Tree B begins.');
  });
});
