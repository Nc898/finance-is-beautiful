import { expect, test } from '@playwright/test';
import { caption, diffText, frames, gotoReady, plate, atMoment, scrub, skipToExplore, state } from './helpers';

test.describe('introduction', () => {
  test('opens over the scene the first time; it closes to the first planting, paused, and stays closed', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoReady(page, { intro: true, pause: false });
    const intro = page.locator('#intro');
    await expect(intro).toBeVisible();
    await expect(intro.getByRole('heading', { name: 'Time to Grow' })).toBeVisible();
    await expect(intro).toContainText('Growth is reinvested');
    await expect(page.locator('[data-intro-close]')).toBeFocused();
    let s = await state(page);
    expect(s.ageMonths).toBe(300);
    expect(s.playing).toBe(false);
    await page.keyboard.press('Enter');
    await expect(intro).toBeHidden();
    await frames(page, 3);
    s = await state(page);
    expect(s.ageMonths).toBe(300);
    expect(s.playing).toBe(false);
    await expect(page.locator('#play-label')).toHaveText('Play');
    // the first time per session only
    await page.reload();
    await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 45_000 });
    await frames(page, 3);
    await expect(intro).toBeHidden();
    // "About this demo" opens it again; Escape closes it
    await page.locator('#btn-about').click();
    await expect(intro).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(intro).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('notes and playback', () => {
  test('waits at the first planting until Play is pressed', async ({ page }) => {
    await gotoReady(page, { pause: false });
    await page.waitForTimeout(800);
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.ageMonths).toBe(300);
    await page.locator('#btn-play').click();
    await expect(page.locator('#play-label')).toHaveText('Pause');
    await expect.poll(async () => (await state(page)).ageMonths, { timeout: 5000 }).toBeGreaterThan(306);
  });

  test('shows the right note for each part of the timeline', async ({ page }) => {
    await gotoReady(page);
    const cases: Array<[number, string, string?]> = [
      [300, 'Same monthly contribution. Different starting ages.', 'Tree A starts at 25. Tree B starts at 35.'],
      [360, 'Each month, $200 goes in.'],
      [424, 'At 35, Tree B begins.'],
      [600, 'Growth is reinvested, so branches grow new branches.'],
      [
        780,
        'Time gives growth room to branch.',
        '$24,000 of the gap is extra contributions. $162,633 is growth that had ten more years to compound.',
      ],
    ];
    for (const [age, primary, secondary] of cases) {
      await scrub(page, age);
      const cap = await caption(page);
      expect(cap.primary, `primary note at ${age} months`).toBe(primary);
      if (secondary) expect(cap.secondary, `secondary note at ${age} months`).toBe(secondary);
    }
  });

  test('pause holds the clock and Play resumes from there', async ({ page }) => {
    await gotoReady(page);
    const play = page.locator('#btn-play');
    await play.click();
    await expect(play).toContainText('Pause');
    await play.click();
    await expect(play).toContainText('Play');
    const a0 = (await state(page)).ageMonths;
    await page.waitForTimeout(500);
    expect((await state(page)).ageMonths).toBe(a0);
    await play.click();
    await expect.poll(async () => (await state(page)).ageMonths, { timeout: 5000 }).toBeGreaterThan(a0 + 3);
  });

  test('the end: age 65, paused, with the results showing; Play starts over from the first planting', async ({ page }) => {
    await gotoReady(page);
    await atMoment(page, 36);
    await page.evaluate(() => {
      window.__ttg.actions.setSpeed(4);
      window.__ttg.actions.play();
    });
    await expect.poll(async () => (await state(page)).playing, { timeout: 8000 }).toBe(false);
    await frames(page, 3);
    const s = await state(page);
    expect(s.ageMonths).toBe(780);
    await expect(page.locator('#diff')).toHaveClass(/\bon\b/);
    expect(await diffText(page)).toBe('$186,633');
    expect((await plate(page, 'A')).balance).toBe('$381,536');
    expect((await plate(page, 'B')).balance).toBe('$194,903');
    expect((await plate(page, 'A')).split).toContain('$96,000 contributed');
    expect((await caption(page)).primary).toBe('Time gives growth room to branch.');
    await page.evaluate(() => window.__ttg.actions.setSpeed(1));
    await page.locator('#btn-play').click();
    await frames(page, 2);
    const r = await state(page);
    expect(r.playing).toBe(true);
    expect(r.ageMonths).toBeLessThan(330); // back at 300, a moment of playback in
  });

  test('breakdown and Difference show once the trees are planted; Difference is emphasised at rest and at the end', async ({ page }) => {
    await gotoReady(page);
    await atMoment(page, 20);
    expect((await plate(page, 'A')).split).toMatch(/contributed . .+ modeled growth$/);
    expect((await plate(page, 'B')).split).toMatch(/contributed . .+ modeled growth$/);
    await expect(page.locator('#diff')).toHaveClass(/\bon\b/);
    await expect(page.locator('#diff')).toHaveClass(/\bemph\b/); // the clock is resting
    await page.evaluate(() => window.__ttg.actions.play());
    await expect(page.locator('#diff')).not.toHaveClass(/\bemph\b/);
    await skipToExplore(page);
    await expect(page.locator('#diff')).toHaveClass(/\bemph\b/);
  });

  test('speed 2x advances the clock about twice as fast as 1x', async ({ page }) => {
    await gotoReady(page);
    // Stay well inside the timeline so nothing hits the end clamp; measure real elapsed time in the page.
    const rate = (speed: number) =>
      page.evaluate(async (sp) => {
        const a = window.__ttg.actions;
        a.scrubTo(320);
        a.setSpeed(sp as 1 | 2);
        const m0 = (window.__ttg.getState() as { ageMonths: number }).ageMonths;
        const t0 = performance.now();
        a.play();
        await new Promise((r) => setTimeout(r, 1200));
        const m1 = (window.__ttg.getState() as { ageMonths: number }).ageMonths;
        const dt = (performance.now() - t0) / 1000;
        a.pause();
        return (m1 - m0) / dt;
      }, speed);
    const r1 = await rate(1);
    const r2 = await rate(2);
    // The whole 40 years play in 24 s at 1x: 20 months a second.
    expect(r1).toBeGreaterThan(15);
    expect(r1).toBeLessThan(23);
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

  test('note copy follows edited inputs (no hard-coded values)', async ({ page }) => {
    await gotoReady(page);
    await page.locator('#f-monthlyContribution').fill('350');
    await page.locator('#f-monthlyContribution').press('Enter');
    await page.locator('#f-startAgeB').fill('40');
    await page.locator('#f-startAgeB').press('Enter');
    await frames(page, 3);
    expect((await state(page)).inputs.startAgeB).toBe(40);
    await atMoment(page, 3);
    expect((await caption(page)).secondary).toBe('Tree A starts at 25. Tree B starts at 40.');
    await atMoment(page, 10);
    expect((await caption(page)).primary).toBe('Each month, $350 goes in.');
    await atMoment(page, 16);
    expect((await caption(page)).primary).toBe('At 40, Tree B begins.');
  });
});
