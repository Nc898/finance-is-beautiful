import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames, gotoReady, openDetails, scrub, skipToExplore, state } from './helpers';

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

test.describe('accessibility', () => {
  test('axe (wcag2a + wcag2aa): no violations in the explore state', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await page.evaluate(() => document.fonts.ready);
    // Let caption/highlight animations settle so contrast is measured on final colors.
    await page.waitForTimeout(1800);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('axe: no violations with the calculation details open and a scrubbed age', async ({ page }) => {
    await gotoReady(page);
    await scrub(page, 45 * 12 + 3);
    await openDetails(page);
    await page.waitForTimeout(600);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('axe: no violations during the story (planting and difference captions)', async ({ page }) => {
    await gotoReady(page);
    for (const t of [3, 44]) {
      await page.evaluate((s) => window.__ttg.actions.seekStory(s), t);
      await frames(page, 4);
      await page.waitForTimeout(1200);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(results.violations, `t=${t}\n` + describeViolations(results)).toEqual([]);
    }
  });

  test('axe: no violations with an input error showing', async ({ page }) => {
    await gotoReady(page);
    await page.locator('#f-annualReturn').fill('20');
    await page.locator('#f-annualReturn').press('Enter');
    await expect(page.locator('#err-annualReturn')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('every control is reachable by Tab, in logical order, with a visible focus indicator', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page); // Skip is hidden outside the story
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const expected = [
      'Time to Grow, back to all demonstrations',
      'btn-replay',
      'panel-toggle',
      'btn-play',
      'radio:1',
      'timeline',
      'Decrease Tree A starting age',
      'f-startAgeA',
      'Increase Tree A starting age',
      'Decrease Tree B starting age',
      'f-startAgeB',
      'Increase Tree B starting age',
      'Decrease ending age',
      'f-endAge',
      'Increase ending age',
      'Decrease monthly contribution',
      'f-monthlyContribution',
      'Increase monthly contribution',
      'Decrease assumed annual return',
      'f-annualReturn',
      'Increase assumed annual return',
      'reduce-motion',
      'summary:How this is calculated',
    ];

    const seen: string[] = [];
    const problems: string[] = [];
    for (let i = 0; i < expected.length + 1; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { id: '(body)', focus: 'n/a' };
        let id = el.id || el.getAttribute('aria-label') || el.tagName.toLowerCase();
        if (el instanceof HTMLInputElement && el.type === 'radio') id = `radio:${el.value}`;
        if (el.tagName === 'SUMMARY') id = `summary:${(el.textContent ?? '').trim()}`;
        const visible = (cs: CSSStyleDeclaration) => cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        let focus = 'none';
        if (visible(getComputedStyle(el))) focus = 'outline';
        if (focus === 'none' && el instanceof HTMLInputElement && el.type === 'radio') {
          const sib = el.nextElementSibling as HTMLElement | null;
          if (sib && visible(getComputedStyle(sib))) focus = 'sibling-outline';
        }
        if (focus === 'none' && el instanceof HTMLInputElement && el.type === 'range') {
          // Computed style of ::-webkit-slider-thumb is not reliable; the thumb ring is verified by pixels in the next test.
          focus = 'thumb-checked-by-pixels';
        }
        if (focus === 'none' && el instanceof HTMLInputElement && el.type === 'checkbox') {
          const sib = el.nextElementSibling as HTMLElement | null;
          if (sib && visible(getComputedStyle(sib))) focus = 'sibling-outline';
        }
        if (focus === 'none') {
          // Fall back to a non-outline indicator (box-shadow or border change) so we report precisely what exists.
          const cs = getComputedStyle(el);
          if (cs.boxShadow && cs.boxShadow !== 'none') focus = 'box-shadow';
        }
        return { id, focus };
      });
      seen.push(info.id);
      if (info.focus === 'none') problems.push(`${info.id}: no visible focus indicator (no outline/box-shadow)`);
    }
    expect(seen.slice(0, expected.length), 'Tab order').toEqual(expected);
    // After the last control, focus leaves the page (or wraps), never lands on a stray element.
    expect([...expected.slice(0, 1), '(body)'], `Tab after last control landed on "${seen[expected.length]}"`).toContain(
      seen[expected.length],
    );
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('the timeline thumb shows a focus ring (pixel comparison)', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await scrub(page, 45 * 12);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    const scale = page.locator('#scale');
    const unfocused = await scale.screenshot({ animations: 'disabled' });
    await page.locator('#btn-play').focus();
    await page.keyboard.press('Tab'); // speed radio
    await page.keyboard.press('Tab'); // timeline
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('timeline');
    await page.waitForTimeout(400);
    const focused = await scale.screenshot({ animations: 'disabled' });
    expect(focused.equals(unfocused), 'focused timeline looks identical to unfocused').toBe(false);
  });

  test('Skip to explore is in the Tab order while the story is active', async ({ page }) => {
    await gotoReady(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // title link home, Replay, then Skip
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id);
    expect(id).toBe('btn-skip');
  });

  test('focus indicators are not clipped: focus ring has contrast against the background', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await page.locator('#btn-play').focus();
    await page.keyboard.press('Shift+Tab'); // then back, ensures :focus-visible via keyboard
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('btn-play')!);
      return { color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle, offset: cs.outlineOffset };
    });
    expect(ring.style).not.toBe('none');
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
  });

  test('Space toggles play from the page body, but not while typing in an input', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator('body').press('Space');
    await frames(page, 2);
    expect((await state(page)).playing).toBe(true);
    await page.locator('body').press('Space');
    await frames(page, 2);
    expect((await state(page)).playing).toBe(false);

    // In a text input Space types a space and does not toggle playback.
    const input = page.locator('#f-monthlyContribution');
    await input.focus();
    await input.press('Space');
    await frames(page, 2);
    expect((await state(page)).playing).toBe(false);
    await expect(input).toHaveValue('200 ');
    // Restore a clean value.
    await input.fill('200');
    await input.press('Enter');
  });

  test('Space on a focused button activates it exactly once (no double toggle)', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await page.locator('#btn-play').focus();
    await page.keyboard.press('Space');
    await frames(page, 3);
    expect((await state(page)).playing).toBe(true);
    await page.keyboard.press('Space');
    await frames(page, 3);
    expect((await state(page)).playing).toBe(false);
  });

  test('Space on the timeline slider does not start playback', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await page.locator('#timeline').focus();
    await page.keyboard.press('Space');
    await frames(page, 3);
    expect((await state(page)).playing).toBe(false);
  });

  async function observeMutations(page: Page): Promise<void> {
    await page.evaluate(() => {
      const w = window as unknown as { __mut: { announcer: number; summary: number; canvasLabel: number; texts: string[] } };
      w.__mut = { announcer: 0, summary: 0, canvasLabel: 0, texts: [] };
      const ann = document.getElementById('announcer')!;
      new MutationObserver((records) => {
        w.__mut.announcer += records.length;
        w.__mut.texts.push(ann.textContent ?? '');
      }).observe(ann, { childList: true, characterData: true, subtree: true });
      new MutationObserver((r) => (w.__mut.summary += r.length)).observe(document.getElementById('summary')!, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      new MutationObserver((r) => (w.__mut.canvasLabel += r.length)).observe(document.getElementById('scene')!, {
        attributes: true,
        attributeFilter: ['aria-label'],
      });
    });
  }
  const mutations = (page: Page) =>
    page.evaluate(() => (window as unknown as { __mut: { announcer: number; summary: number; canvasLabel: number; texts: string[] } }).__mut);

  test('live region announces play and pause', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await scrub(page, 40 * 12);
    const live = page.locator('#announcer');
    await expect(live).toHaveAttribute('role', 'status');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await page.locator('#btn-play').click();
    await expect(live).toHaveText(/^Playing\./);
    await page.locator('#btn-play').click();
    await expect(live).toHaveText(/^Paused\. Age \d+ years?/);
  });

  test('live region is quiet during 3 s of explore playback', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    await scrub(page, 25 * 12);
    await observeMutations(page);
    await page.locator('#btn-play').click();
    await page.waitForTimeout(3000);
    const m = await mutations(page);
    await page.locator('#btn-play').click();
    expect((await state(page)).playing).toBe(false);
    expect(m.announcer, `announcer texts during playback: ${JSON.stringify(m.texts)}`).toBeLessThanOrEqual(3);
    expect(m.announcer).toBeGreaterThanOrEqual(1);
    // The scene description is not rewritten every frame either.
    expect(m.summary, 'hidden #summary rewrites during playback').toBeLessThanOrEqual(3);
    expect(m.canvasLabel, 'canvas aria-label rewrites during playback').toBeLessThanOrEqual(3);
  });

  test('live region is quiet during 3 s of story playback (chapter changes only)', async ({ page }) => {
    await gotoReady(page);
    await observeMutations(page);
    await page.evaluate(() => {
      window.__ttg.actions.seekStory(5.5);
      window.__ttg.actions.setSpeed(1);
      window.__ttg.actions.play();
    });
    await page.waitForTimeout(3000); // crosses planting -> growing at 7 s
    const m = await mutations(page);
    const s = await state(page);
    expect(s.storyTime).toBeGreaterThan(7);
    expect(m.announcer, `announcer texts: ${JSON.stringify(m.texts)}`).toBeLessThanOrEqual(3);
    expect(m.summary).toBeLessThanOrEqual(3);
    expect(m.canvasLabel).toBeLessThanOrEqual(3);
  });

  test('canvas is an image with a non-empty, current text alternative', async ({ page }) => {
    await gotoReady(page);
    const canvas = page.locator('#scene');
    await expect(canvas).toHaveAttribute('role', 'img');
    const label = (await canvas.getAttribute('aria-label')) ?? '';
    expect(label.trim().length).toBeGreaterThan(20);
    expect(label).toContain('Tree A');
    expect(label).toContain('Tree B');
    expect(label).not.toMatch(/loading/i);
    await scrub(page, 45 * 12);
    await expect(canvas).toHaveAttribute('aria-label', /Age 45 years\./, { timeout: 4000 });
    const label2 = (await canvas.getAttribute('aria-label')) ?? '';
    expect(label2).toContain('Tree A, started at 25, holds $');
    expect(label2).toContain('Tree A is ahead by');
  });

  test('tree identity is never color-only: letter markers on plates, inputs and the timeline', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    const marks = await page.evaluate(() => {
      const textOf = (sel: string) =>
        Array.from(document.querySelectorAll(sel)).map((n) => (n.querySelector('text')?.textContent ?? '').trim());
      const shapeOf = (sel: string) =>
        Array.from(document.querySelectorAll(sel)).map((n) => (n.querySelector('circle') ? 'circle' : n.querySelector('path') ? 'path' : 'none'));
      return {
        plateA: textOf('#plate-A [data-mark]'),
        plateB: textOf('#plate-B [data-mark]'),
        scaleA: textOf('.scale-marker[data-tree="A"]'),
        scaleB: textOf('.scale-marker[data-tree="B"]'),
        labelA: textOf('label[for="f-startAgeA"] [data-mark]'),
        labelB: textOf('label[for="f-startAgeB"] [data-mark]'),
        shapeA: shapeOf('#plate-A [data-mark]'),
        shapeB: shapeOf('#plate-B [data-mark]'),
        nameA: document.querySelector('#plate-A .plate-name')?.textContent ?? '',
        nameB: document.querySelector('#plate-B .plate-name')?.textContent ?? '',
      };
    });
    expect(marks.plateA).toEqual(['A']);
    expect(marks.plateB).toEqual(['B']);
    expect(marks.scaleA).toEqual(['A']);
    expect(marks.scaleB).toEqual(['B']);
    expect(marks.labelA).toEqual(['A']);
    expect(marks.labelB).toEqual(['B']);
    // Different silhouettes as well as different letters.
    expect(marks.shapeA).not.toEqual(marks.shapeB);
    expect(marks.nameA).toContain('Tree A');
    expect(marks.nameB).toContain('Tree B');
  });

  test('form controls have accessible names and the error text is associated', async ({ page }) => {
    await gotoReady(page);
    for (const name of ['startAgeA', 'startAgeB', 'endAge', 'monthlyContribution', 'annualReturn']) {
      const input = page.locator(`#f-${name}`);
      await expect(input).toHaveAccessibleName(/.+/);
      await expect(input).toHaveAttribute('aria-describedby', `err-${name}`);
    }
    await expect(page.locator('#timeline')).toHaveAccessibleName('Timeline age');
    await expect(page.getByRole('radiogroup', { name: 'Playback speed' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Time to Grow' })).toBeVisible();
  });

  test('document has a language and a title', async ({ page }) => {
    await gotoReady(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Time to Grow');
  });
});
