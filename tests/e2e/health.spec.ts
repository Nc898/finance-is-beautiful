import { expect, test } from '@playwright/test';
import { frames, gotoReady, scrub, seek, setField, skipToExplore } from './helpers';

test.describe('page health', () => {
  test('no uncaught errors, console errors or failed requests during a normal session', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
    });
    page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => {
      if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
    });
    await gotoReady(page, { pause: false });
    await page.waitForTimeout(1500);
    await seek(page, 20);
    await skipToExplore(page);
    await scrub(page, 40 * 12);
    await setField(page, 'monthlyContribution', '350');
    await setField(page, 'startAgeB', '65');
    await setField(page, 'annualReturn', '-3');
    await setField(page, 'annualReturn', 'oops');
    await page.locator('#how > summary').click();
    await frames(page, 4);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('no ResizeObserver loop errors (layout feedback loop) during play and resize', async ({ page }) => {
    // Regression guard for BUG-1: all ResizeObserver callbacks now only schedule rAF work.
    await page.addInitScript(() => {
      const w = window as unknown as { __roErrors: string[] };
      w.__roErrors = [];
      window.addEventListener('error', (e) => w.__roErrors.push(e.message));
    });
    await gotoReady(page, { pause: false });
    await page.waitForTimeout(2500);
    await skipToExplore(page);
    await scrub(page, 45 * 12);
    await page.setViewportSize({ width: 900, height: 700 });
    await frames(page, 4);
    await page.setViewportSize({ width: 600, height: 800 });
    await frames(page, 4);
    const errs = await page.evaluate(() => (window as unknown as { __roErrors: string[] }).__roErrors);
    expect(errs, 'window error events: ' + errs.join(' | ')).toEqual([]);
  });

  test('web fonts load', async ({ page }) => {
    await gotoReady(page);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((f) => f.status === 'loaded')
        .map((f) => f.family);
    });
    expect(fonts.length).toBeGreaterThan(0);
  });
});
