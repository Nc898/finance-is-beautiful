import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { annuityFV, frames, gotoReady, intersects, scrub, atMoment, setField, setPanel, skipToExplore, state } from './helpers';
import type { Box } from './helpers';

const SCREEN_DIR = 'docs/screens/e2e';

interface Rects {
  vw: number;
  vh: number;
  stage: Box;
  canvas: Box;
  dock: Box;
  caption: Box | null;
  captionLines: Box[];
  plateA: Box;
  plateB: Box;
  diff: Box | null;
  masthead: Box;
}

/** All rectangles measured in one evaluate so nothing moves between reads. */
async function measure(page: Page): Promise<Rects> {
  return page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const cap = document.querySelector('#caption .cap.on:not(.cap-ghost)');
    const lines = cap ? Array.from(cap.querySelectorAll('p')).filter((p) => (p.textContent ?? '').trim()) : [];
    const diff = document.getElementById('diff');
    const diffOn = diff?.classList.contains('on') ?? false;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      stage: box(document.getElementById('stage'))!,
      canvas: box(document.getElementById('scene'))!,
      dock: box(document.getElementById('dock'))!,
      caption: box(cap),
      captionLines: lines.map((l) => box(l)!),
      plateA: box(document.getElementById('plate-A'))!,
      plateB: box(document.getElementById('plate-B'))!,
      diff: diffOn ? box(diff) : null,
      masthead: box(document.querySelector('.masthead'))!,
    };
  });
}

interface Crown {
  id: 'A' | 'B';
  box: Box;
}

/**
 * Approximate crown box in page coordinates for the current age: apex from scene.anchorsFor, width ~ maturity x the
 * mature spread (canopy width scales with maturity since maturity = sqrt(balance / scale)), top 60% of the trunk height.
 */
async function crowns(page: Page): Promise<Crown[]> {
  const s = await state(page);
  const months = Math.floor(s.ageMonths + 1e-9);
  const nA = Math.max(0, months - s.inputs.startAgeA * 12);
  const nB = Math.max(0, months - s.inputs.startAgeB * 12);
  const c = s.inputs.monthlyContribution;
  const r = s.inputs.annualReturn;
  const mat = (n: number) => Math.min(1, Math.sqrt(Math.max(0, annuityFV(c, r, n)) / s.displayScale));
  const out: Crown[] = [];
  for (const [id, n] of [['A', nA], ['B', nB]] as const) {
    const m = mat(n);
    if (m <= 0) continue;
    const geom = await page.evaluate(
      ([who, mm]) => {
        const a = window.__ttg.anchors(who as 'A' | 'B', mm as number);
        const b = window.__ttg.anchors('B', 0).base.x - window.__ttg.anchors('A', 0).base.x;
        const cv = document.getElementById('scene')!.getBoundingClientRect();
        return { base: a.base, top: a.top, unit: b / 400, cx: cv.left, cy: cv.top };
      },
      [id, m] as [string, number],
    );
    const half = (400 * m * geom.unit) / 2;
    const height = geom.base.y - geom.top.y;
    out.push({
      id,
      box: { x: geom.cx + geom.top.x - half, y: geom.cy + geom.top.y, w: half * 2, h: height * 0.6 },
    });
  }
  return out;
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const o = await page.evaluate(() => ({
    docScroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    inner: window.innerWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(o.docScroll, `${label}: documentElement.scrollWidth vs innerWidth`).toBeLessThanOrEqual(o.inner);
  expect(o.bodyScroll, `${label}: body.scrollWidth vs innerWidth`).toBeLessThanOrEqual(o.inner);
}

test.describe('layout', () => {
  test('no horizontal overflow in any state', async ({ page }) => {
    await gotoReady(page);
    await expectNoHorizontalOverflow(page, 'initial');
    for (const t of [3, 16, 26, 44, 52]) {
      await atMoment(page, t);
      await expectNoHorizontalOverflow(page, `story t=${t}`);
    }
    await skipToExplore(page);
    await expectNoHorizontalOverflow(page, 'explore');
    await page.locator('#how > summary').click();
    await frames(page, 3);
    await expectNoHorizontalOverflow(page, 'details open');
    await page.locator('#f-annualReturn').fill('20');
    await page.locator('#f-annualReturn').press('Enter');
    await page.locator('#f-startAgeA').fill('99999999');
    await page.locator('#f-startAgeA').press('Enter');
    await frames(page, 3);
    await expectNoHorizontalOverflow(page, 'with errors showing');
    await setField(page, 'startAgeA', '16');
    await setField(page, 'endAge', '90');
    await setField(page, 'monthlyContribution', '5000');
    await setField(page, 'annualReturn', '12');
    await skipToExplore(page);
    await expectNoHorizontalOverflow(page, 'extreme values (seven-digit balances)');
  });

  test('stage fills the viewport height and the side panel sits beside or over it', async ({ page }, info) => {
    await gotoReady(page);
    const r = await measure(page);
    expect(Math.abs(r.canvas.w - r.stage.w)).toBeLessThan(1);
    expect(r.stage.h / r.vh, `${info.project.name}: stage height`).toBeGreaterThan(0.98);
    if (r.vw >= 900) {
      // Wide: the panel docks to the right edge and the scene slides left by half its width (no re-layout),
      // so the canvas keeps its size whether the panel is open or closed.
      expect(Math.abs(r.dock.x + r.dock.w - r.vw)).toBeLessThan(1);
      expect(Math.abs(r.stage.w - r.vw)).toBeLessThan(1);
      const w0 = await page.locator('#scene').evaluate((c) => (c as HTMLCanvasElement).width);
      await setPanel(page, false);
      expect(await page.locator('#scene').evaluate((c) => (c as HTMLCanvasElement).width)).toBe(w0);
    } else {
      // Phones: panel overlays the scene and closes to give the trees the full screen.
      expect(r.dock.w).toBeLessThanOrEqual(r.vw * 0.92 + 1);
      await setPanel(page, false);
      const closed = await measure(page);
      expect(closed.dock.x).toBeGreaterThanOrEqual(closed.vw - 1);
      expect(await page.locator('#dock').evaluate((d) => (d as HTMLElement).inert)).toBe(true);
    }
  });

  test('the caption never intersects a crown at the difference moment', async ({ page }) => {
    await gotoReady(page);
    await atMoment(page, 44);
    await page.waitForTimeout(700); // let the caption crossfade finish
    const r = await measure(page);
    expect(r.caption).not.toBeNull();
    const cs = await crowns(page);
    expect(cs.map((c) => c.id)).toEqual(['A', 'B']);
    for (const line of r.captionLines) {
      for (const c of cs) {
        expect(
          intersects(line, c.box),
          `caption line ${JSON.stringify(line)} intersects crown ${c.id} ${JSON.stringify(c.box)}`,
        ).toBe(false);
      }
    }
    // The whole caption block clears the crowns too, and stays within the viewport horizontally.
    for (const c of cs) {
      expect(intersects(r.caption!, c.box), `caption block vs crown ${c.id}`).toBe(false);
    }
    expect(r.caption!.x).toBeGreaterThanOrEqual(0);
    expect(r.caption!.x + r.caption!.w).toBeLessThanOrEqual(r.vw + 0.5);
  });

  test('captions clear the crowns through the growing chapter', async ({ page }) => {
    await gotoReady(page);
    for (const t of [3, 10, 20, 26, 37, 44, 52]) {
      await atMoment(page, t);
      await page.waitForTimeout(500);
      const r = await measure(page);
      const cs = await crowns(page);
      for (const line of r.captionLines) {
        for (const c of cs) {
          expect(intersects(line, c.box), `t=${t}: caption line vs crown ${c.id}`).toBe(false);
        }
      }
    }
  });

  test('the masthead does not overlap the crowns', async ({ page }) => {
    await gotoReady(page);
    await skipToExplore(page);
    const cs = await crowns(page);
    const r = await measure(page);
    for (const c of cs) expect(intersects(r.masthead, c.box), `masthead vs crown ${c.id}`).toBe(false);
  });

  test('specimen plates do not overlap each other, the difference label, or the dock', async ({ page }) => {
    // On phones the panel overlays the scene by design, so measure with it closed.
    await gotoReady(page, { panel: (page.viewportSize()?.width ?? 0) >= 900 });
    const moments: Array<[string, () => Promise<void>]> = [
      ['planting t=3', () => atMoment(page, 3)],
      ['growing t=26', () => atMoment(page, 26)],
      ['difference t=44', () => atMoment(page, 44)],
      ['explore end', () => skipToExplore(page)],
      ['explore age 30 (B not planted)', () => scrub(page, 30 * 12)],
      ['explore age 45', () => scrub(page, 45 * 12)],
    ];
    for (const [name, go] of moments) {
      await go();
      await page.waitForTimeout(300);
      const r = await measure(page);
      // during the opening close-up the other tree's label waits, faded out, under the one riding with the camera
      const faded = await page.evaluate(() =>
        ['A', 'B'].filter((id) => getComputedStyle(document.getElementById(`plate-${id}`)!).filter === 'opacity(0)'),
      );
      if (!faded.length) expect(intersects(r.plateA, r.plateB), `${name}: plate A vs plate B`).toBe(false);
      if (r.diff) {
        expect(intersects(r.diff, r.plateA), `${name}: difference vs plate A`).toBe(false);
        expect(intersects(r.diff, r.plateB), `${name}: difference vs plate B`).toBe(false);
        expect(intersects(r.diff, r.dock), `${name}: difference vs dock`).toBe(false);
      }
      expect(intersects(r.plateA, r.dock), `${name}: plate A vs dock`).toBe(false);
      expect(intersects(r.plateB, r.dock), `${name}: plate B vs dock`).toBe(false);
      for (const [id, p] of [['A', r.plateA], ['B', r.plateB]] as const) {
        expect(p.x, `${name}: plate ${id} left edge`).toBeGreaterThanOrEqual(-0.5);
        expect(p.x + p.w, `${name}: plate ${id} right edge`).toBeLessThanOrEqual(r.vw + 0.5);
        expect(p.y + p.h, `${name}: plate ${id} stays inside the stage`).toBeLessThanOrEqual(r.stage.y + r.stage.h + 1);
      }
    }
  });

  test('plates and difference stay clear of each other with seven-digit balances', async ({ page }) => {
    await gotoReady(page);
    await setField(page, 'startAgeA', '16');
    await setField(page, 'endAge', '90');
    await setField(page, 'monthlyContribution', '5000');
    await setField(page, 'annualReturn', '12');
    await skipToExplore(page);
    if ((page.viewportSize()?.width ?? 0) < 900) await setPanel(page, false);
    await page.waitForTimeout(500);
    const r = await measure(page);
    expect(intersects(r.plateA, r.plateB)).toBe(false);
    if (r.diff) {
      expect(intersects(r.diff, r.plateA)).toBe(false);
      expect(intersects(r.diff, r.plateB)).toBe(false);
    }
    expect(intersects(r.plateA, r.dock)).toBe(false);
    expect(intersects(r.plateB, r.dock)).toBe(false);
    await expectNoHorizontalOverflow(page, 'seven digits');
  });

  test('touch targets', async ({ page }, info) => {
    await gotoReady(page);
    await skipToExplore(page);
    const targets = await page.evaluate(() => {
      const out: Array<{ name: string; w: number; h: number }> = [];
      const push = (name: string, el: Element | null) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        out.push({ name, w: r.width, h: r.height });
      };
      document.querySelectorAll('.dock button, .masthead button').forEach((b) => {
        push(`button "${(b.getAttribute('aria-label') || b.textContent || b.id).trim()}"`, b);
      });
      document.querySelectorAll('.dock input[type="text"]').forEach((i) => push(`input #${i.id}`, i));
      document.querySelectorAll('.speeds label').forEach((l) => push(`speed ${l.textContent?.trim()}`, l));
      push('timeline slider', document.getElementById('timeline'));
      push('reduce motion label', document.querySelector('label.reduce'));
      push('details summary', document.querySelector('#how > summary'));
      return out;
    });
    expect(targets.length).toBeGreaterThan(15);
    const min = info.project.name === 'mobile' ? 44 : 24;
    const small = targets.filter((t) => t.w < min - 0.5 || t.h < min - 0.5);
    expect(
      small,
      `${info.project.name}: targets under ${min}x${min}:\n` + small.map((t) => `  ${t.name}: ${t.w.toFixed(1)}x${t.h.toFixed(1)}`).join('\n'),
    ).toEqual([]);
  });

  test('screenshots of planting, growing, difference and explore', async ({ page }, info) => {
    await gotoReady(page);
    const shots: Array<[string, () => Promise<void>]> = [
      ['planting', () => atMoment(page, 3)],
      ['growing', () => atMoment(page, 26)],
      ['difference', () => atMoment(page, 44)],
      ['explore', () => skipToExplore(page)],
    ];
    for (const [moment, go] of shots) {
      await go();
      await page.waitForTimeout(900); // caption crossfade and highlight settle
      await page.screenshot({ path: `${SCREEN_DIR}/${info.project.name}-${moment}.png`, fullPage: true });
    }
  });
});
