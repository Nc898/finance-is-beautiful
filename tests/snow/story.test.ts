import { describe, expect, it } from 'vitest';
import { DEBTS, DEFAULT_SNOW_INPUTS, hillsMatch, horizonMonths, strategySchedule, validateSnowInputs } from '../../src/snow/engine';
import type { SnowInputs } from '../../src/snow/engine';
import {
  BEATS,
  BEAT_STARTS,
  CAMERA_ZOOM,
  SAME_ORDER,
  SETTLE,
  STORY_DURATION,
  captionForBeat,
  interestLiveLine,
  storyBeat,
  storyCamera,
  storyCaption,
  storyDuration,
  storyMonthMarks,
  storyMonths,
} from '../../src/snow/app/story';
import { budgetNote, sceneSummary, timelineTicks } from '../../src/snow/app/text';

const D = DEFAULT_SNOW_INPUTS;
const clone = (i: SnowInputs): SnowInputs => JSON.parse(JSON.stringify(i));
const withDebt = (debt: 'medical' | 'car' | 'card', patch: Partial<SnowInputs['debts']['car']>, base: SnowInputs = D): SnowInputs => {
  const c = clone(base);
  c.debts[debt] = { ...c.debts[debt], ...patch };
  return c;
};

const agree = withDebt('medical', { apr: 0.3 }, withDebt('car', { apr: 0.2 }, withDebt('card', { apr: 0.1 })));
const noInterest = (() => {
  const c = clone(D);
  for (const d of DEBTS) c.debts[d].apr = 0;
  return c;
})();
const clearsInMonthOne: SnowInputs = { ...withDebt('medical', { balance: 100, minPayment: 400 }), budget: 900 };
// each minimum pays exactly the month's interest and the budget is only the minimums: nothing ever shrinks, and the
// two orders differ (smallest first is medical, car, card; highest rate first is card, car, medical)
const stuck: SnowInputs = {
  budget: 6200,
  debts: {
    medical: { balance: 60_000, apr: 0.24, minPayment: 1200 },
    car: { balance: 80_000, apr: 0.3, minPayment: 2000 },
    card: { balance: 90_000, apr: 0.4, minPayment: 3000 },
  },
};

const cases: Array<[string, SnowInputs]> = [
  ['default', D],
  ['identical orders', agree],
  ['budget equals the minimums', { ...D, budget: 520 }],
  ['no interest anywhere', noInterest],
  ['a debt clears in month 1', clearsInMonthOne],
  ['one tiny, one huge', withDebt('card', { balance: 100_000, apr: 0.3, minPayment: 2600 }, { ...withDebt('medical', { balance: 100 }), budget: 4000 })],
  ['never clears in 60 years', stuck],
];

describe('the cases are all valid inputs', () => {
  it.each(cases)('%s', (_n, inputs) => {
    expect(validateSnowInputs(inputs)).toEqual({ ok: true, errors: {} });
  });
});

describe.each([false, true])('story (reduced=%s)', (reduced) => {
  describe.each(cases)('%s', (_name, inputs) => {
    const dur = storyDuration(inputs, reduced);
    const end = horizonMonths(inputs);

    it('starts at month 0 and ends exactly at the later payoff', () => {
      expect(storyMonths(0, inputs, reduced)).toBe(0);
      expect(storyMonths(-3, inputs, reduced)).toBe(0);
      expect(storyMonths(dur, inputs, reduced)).toBe(end);
      expect(storyMonths(dur + 100, inputs, reduced)).toBe(end);
    });

    it('is monotonic and stays inside the timeline', () => {
      let prev = -Infinity;
      for (let t = 0; t <= dur; t += 0.02) {
        const m = storyMonths(t, inputs, reduced);
        expect(m).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(end);
        prev = m;
      }
    });

    it('visits every beat in order and ends on the handoff', () => {
      const seen: string[] = [];
      for (let t = 0; t <= dur; t += 0.05) {
        const b = storyBeat(t, inputs, reduced);
        if (seen[seen.length - 1] !== b) seen.push(b);
      }
      expect(seen).toEqual([...BEATS]);
      expect(storyBeat(0, inputs, reduced)).toBe('intro');
      expect(storyBeat(dur, inputs, reduced)).toBe('handoff');
    });

    it('has live, non-empty captions with real numbers and no dashes', () => {
      for (const beat of BEATS) {
        const c = captionForBeat(beat, inputs);
        expect(c.beat).toBe(beat);
        expect(c.primary.length).toBeGreaterThan(5);
        const text = `${c.primary} ${c.secondary ?? ''}`;
        expect(text).not.toMatch(/NaN|undefined|Infinity|null/);
        expect(text).not.toMatch(/[—–]/);
        expect(text).not.toMatch(/\$-|\$0\.0/);
      }
    });

    it('month marks are in order and inside the timeline', () => {
      const m = storyMonthMarks(inputs);
      expect(m.interest).toBeLessThanOrEqual(3);
      expect(m.interest).toBeLessThanOrEqual(m.win);
      expect(m.win).toBeLessThanOrEqual(m.other);
      expect(m.other).toBeLessThanOrEqual(m.top);
      expect(m.top).toBeLessThanOrEqual(m.end);
      expect(m.end).toBe(end);
      expect(m.hold).toBeGreaterThanOrEqual(m.win);
      expect(m.hold).toBeLessThanOrEqual(m.other);
    });
  });
});

describe('story timing (normal motion, defaults)', () => {
  it('lasts 52 seconds and follows the month marks 0, 3, 4, 25, 28 and 32', () => {
    expect(STORY_DURATION).toBe(52);
    expect(storyDuration(D)).toBe(52);
    expect(storyMonthMarks(D)).toEqual({ interest: 3, win: 4, other: 25, top: 28, end: 32, hold: 12 });
    const at = (t: number) => storyMonths(t, D);
    expect(at(0)).toBe(0);
    expect(at(5.9)).toBe(0); // the intro holds still
    expect(at(12)).toBeCloseTo(3, 12);
    expect(at(18 - SETTLE)).toBeCloseTo(4, 12); // the medical ball breaks up, then the clock rests for the cheer
    expect(at(17.5)).toBeCloseTo(4, 12);
    expect(at(18)).toBeCloseTo(4, 12);
    expect(at(30 - SETTLE)).toBeCloseTo(25, 12);
    expect(at(36 - SETTLE)).toBeCloseTo(28, 12);
    expect(at(42 - SETTLE)).toBeCloseTo(32, 12);
    expect(at(48)).toBe(32);
    expect(at(52)).toBe(32);
  });

  it('puts each beat where the table says', () => {
    const beat = (t: number) => storyBeat(t, D);
    expect(BEAT_STARTS).toEqual({ intro: 0, interest: 6, win: 12, push: 18, top: 30, clear: 36, results: 42, handoff: 48 });
    expect(beat(0)).toBe('intro');
    expect(beat(5.99)).toBe('intro');
    expect(beat(6)).toBe('interest');
    expect(beat(12)).toBe('win');
    expect(beat(18)).toBe('push');
    expect(beat(30)).toBe('top');
    expect(beat(36)).toBe('clear');
    expect(beat(42)).toBe('results');
    expect(beat(48)).toBe('handoff');
  });

  it('months speed up smoothly: no jumps in speed from frame to frame', () => {
    const dt = 1 / 60;
    let prevM = storyMonths(0, D);
    let prevV = 0;
    let maxV = 0;
    let maxA = 0;
    for (let t = dt; t <= STORY_DURATION; t += dt) {
      const m = storyMonths(t, D);
      const v = (m - prevM) / dt;
      maxA = Math.max(maxA, Math.abs(v - prevV) / dt);
      maxV = Math.max(maxV, v);
      prevM = m;
      prevV = v;
    }
    expect(maxV).toBeLessThan(5); // months per second
    expect(maxA).toBeLessThan(3); // months per second squared: eased, never a step
  });

  it('does not move before the pushing starts', () => {
    for (let t = 0; t < 6; t += 0.5) expect(storyMonths(t, D)).toBe(0);
    expect(storyMonths(7, D)).toBeGreaterThan(0);
  });
});

describe('story captions (defaults)', () => {
  it('say what the spec table says, with live numbers', () => {
    expect(captionForBeat('intro', D)).toEqual({
      beat: 'intro',
      primary: 'Three debts. The same $800 a month.',
      secondary: 'Snowball rolls the smallest away first. Avalanche, the highest rate.',
    });
    expect(captionForBeat('interest', D)).toEqual({
      beat: 'interest',
      primary: 'Interest settles on them every month.',
      secondary: 'Most on the card at 26%. None on the 0% medical bill.',
    });
    expect(captionForBeat('win', D)).toEqual({
      beat: 'win',
      primary: 'Snowball clears the medical bill in 4 months.',
      secondary: 'A quick win. Its $40 rolls on to the car loan.',
    });
    expect(captionForBeat('push', D, 12)).toEqual({
      beat: 'push',
      primary: 'Avalanche keeps pushing the card at 26%.',
      secondary: 'Interest so far: snowball $3,311, avalanche $2,937.',
      live: true,
    });
    expect(captionForBeat('top', D)).toEqual({
      beat: 'top',
      primary: 'Avalanche clears the card in 2 years, 4 months.',
      secondary: 'The costliest debt is gone, so every dollar goes further.',
    });
    expect(captionForBeat('clear', D)).toEqual({
      beat: 'clear',
      primary: 'Both hills are clear.',
      secondary: 'Avalanche in 2 years, 6 months. Snowball, 2 months later.',
    });
    expect(captionForBeat('results', D)).toEqual({
      beat: 'results',
      primary: 'Avalanche: $4,642 in interest. Snowball: $6,295.',
      secondary: "Snowball's first win came 21 months sooner.",
    });
    expect(captionForBeat('handoff', D)).toEqual({ beat: 'handoff', primary: 'Explore your own debts' });
  });

  it('the live interest line follows the clock', () => {
    expect(interestLiveLine(D, 0)).toBe('Interest so far: snowball $0, avalanche $0.');
    expect(interestLiveLine(D, 12)).toBe('Interest so far: snowball $3,311, avalanche $2,937.');
    // the numbers step with the statement, not with every frame
    expect(interestLiveLine(D, 12.1)).toBe(interestLiveLine(D, 12));
    expect(interestLiveLine(D, 12.3)).not.toBe(interestLiveLine(D, 12));
    expect(interestLiveLine(D, 32)).toBe('Interest so far: snowball $6,295, avalanche $4,642.');
  });

  it('storyCaption follows the beat at that second and the clock at that moment', () => {
    expect(storyCaption(0, D).beat).toBe('intro');
    const c = storyCaption(24, D);
    expect(c.beat).toBe('push');
    expect(c.secondary).toBe(interestLiveLine(D, storyMonths(24, D)));
    expect(storyCaption(45, D).primary).toBe('Avalanche: $4,642 in interest. Snowball: $6,295.');
    expect(storyCaption(50, D).primary).toBe('Explore your own debts');
  });

  it('the camera starts close, holds, eases out by second 12 and then goes', () => {
    expect(CAMERA_ZOOM * 1.05).toBeLessThan(1.3);
    const z0 = storyCamera(0, D)!;
    expect(z0.focus).toBe('both');
    expect(z0.zoom).toBeCloseTo(CAMERA_ZOOM, 6);
    expect(storyCamera(6, D)!.zoom).toBeGreaterThan(CAMERA_ZOOM);
    expect(storyCamera(9, D)!.zoom).toBeLessThan(storyCamera(6, D)!.zoom);
    expect(storyCamera(12, D)).toBeUndefined();
    expect(storyCamera(3, D, true)).toBeUndefined();
  });
});

describe('story marks adapt to the inputs', () => {
  it('the first clear on either hill, the avalanche top-rate clear and each payoff come from the engine', () => {
    for (const [, inputs] of cases) {
      const m = storyMonthMarks(inputs);
      const s = strategySchedule(inputs, 'snowball');
      const a = strategySchedule(inputs, 'avalanche');
      expect(m.win).toBe(Math.min(s.firstWin ?? m.end, a.firstWin ?? m.end));
      expect(m.other).toBe(Math.max(s.firstWin ?? m.end, a.firstWin ?? m.end));
      expect(m.top).toBeGreaterThanOrEqual(Math.min(m.end, a.clearedAt[a.order[0]] ?? m.end));
    }
  });

  it('a bigger budget moves the marks earlier', () => {
    const rich = storyMonthMarks({ ...D, budget: 2000 });
    const base = storyMonthMarks(D);
    expect(rich.end).toBeLessThan(base.end);
    expect(rich.win).toBeLessThan(base.win);
  });

  it('a debt cleared in month 1: the interest beat only runs to month 1', () => {
    const m = storyMonthMarks(clearsInMonthOne);
    expect(m.win).toBe(1);
    expect(m.interest).toBe(1);
    const c = captionForBeat('win', clearsInMonthOne);
    // both orders start with the medical bill's own minimum, so both hills clear it at once
    expect(c.primary).toBe('Both hills clear the medical bill in 1 month.');
    expect(c.secondary).toBe('A quick win. The freed payment rolls on to the next debt.');
  });
});

describe('edge cases', () => {
  it('identical orders: the story says so plainly and runs on', () => {
    expect(hillsMatch(agree)).toBe(true);
    const win = captionForBeat('win', agree);
    expect(win.primary).toBe(SAME_ORDER);
    expect(win.secondary).toMatch(/^Both clear the medical bill in 4 months\./);
    const push = captionForBeat('push', agree, 12);
    expect(push.secondary).toMatch(/^Interest so far: \$[\d,]+ on each hill\.$/);
    expect(captionForBeat('top', agree).primary).toMatch(/^Both hills clear the /);
    expect(captionForBeat('clear', agree).secondary).toMatch(/^Both in /);
    const results = captionForBeat('results', agree);
    expect(results.primary).toMatch(/^Both hills: \$[\d,]+ in interest\.$/);
    expect(results.secondary).toBe(SAME_ORDER);
    // and the clock still runs the whole way
    expect(storyMonths(storyDuration(agree), agree)).toBe(horizonMonths(agree));
  });

  it('budget equal to the minimums: the hills still differ once a payment rolls on', () => {
    const tight = { ...D, budget: 520 };
    expect(hillsMatch(tight)).toBe(false);
    expect(budgetNote(tight)).toMatch(/nothing is left over at first/);
    const win = captionForBeat('win', tight);
    expect(win.primary).toBe('Both hills clear the medical bill in 2 years, 1 month.'); // 1,000 / 40 = 25 months, on both hills
    const results = captionForBeat('results', tight);
    expect(results.primary).not.toMatch(/Both/);
  });

  it('APR 0 everywhere: no interest to talk about, and the costs are the same either way', () => {
    expect(captionForBeat('interest', noInterest)).toEqual({
      beat: 'interest',
      primary: 'With no interest, nothing settles on them.',
      secondary: 'Every payment goes straight to the balance.',
    });
    // (with every rate equal the two orders are the same, so this is also the identical-orders story)
    expect(hillsMatch(noInterest)).toBe(true);
    expect(captionForBeat('results', noInterest).primary).toBe('Both hills: $0 in interest.');
    expect(captionForBeat('push', noInterest, 6).primary).not.toMatch(/at 0%/);
  });

  it('the 0% debt is named when there is a mix, and the least-interest debt otherwise', () => {
    expect(captionForBeat('interest', D).secondary).toContain('None on the 0% medical bill.');
    const none0 = withDebt('medical', { apr: 0.05 });
    expect(captionForBeat('interest', none0).secondary).toBe('Most on the card at 26%. Least on the medical bill at 5%.');
  });

  it('a schedule that never clears: honest text, no crash', () => {
    expect(storyMonthMarks(stuck).end).toBe(720);
    const clear = captionForBeat('clear', stuck);
    expect(clear.primary).toBe('After 60 years, some debt is still owed.');
    expect(clear.secondary).toMatch(/^Snowball: \$[\d,]+ owed\. Avalanche: \$[\d,]+ owed\.$/);
    expect(captionForBeat('win', stuck).primary).toBe('No debt is cleared in 60 years.');
    // nothing ever changes, so the two hills do exactly the same thing
    expect(hillsMatch(stuck)).toBe(true);
    expect(captionForBeat('results', stuck).secondary).toBe(SAME_ORDER);
    expect(captionForBeat('top', stuck).primary).toBe('Both hills keep going.');
  });

  it('if the avalanche clears first, it is named', () => {
    // the dearest debt is also the smallest, so both start the same; make the avalanche's top debt clear first
    const inp = withDebt('card', { balance: 600, apr: 0.3, minPayment: 60 }, withDebt('medical', { balance: 2000 }));
    const s = strategySchedule(inp, 'snowball');
    const a = strategySchedule(inp, 'avalanche');
    expect(s.order[0]).toBe('card');
    expect(a.order[0]).toBe('card');
    expect(hillsMatch(inp)).toBe(false); // the rest of the order differs
    expect(captionForBeat('win', inp).primary).toMatch(/^Both hills clear the card in \d+ months\.$/);
  });

  it('text never claims the wrong hill: results always name the cheaper first', () => {
    const r = captionForBeat('results', D).primary;
    expect(r.indexOf('Avalanche')).toBeLessThan(r.indexOf('Snowball'));
  });
});

describe('text', () => {
  it('describes the whole scene for the canvas label', () => {
    const t = sceneSummary(D, 0);
    expect(t).toContain('Two snowy hillsides');
    expect(t).toContain('$1,000 medical bill at no interest');
    expect(t).toContain('$6,000 car loan at 6% a year');
    expect(t).toContain('$12,000 credit card at 26% a year');
    expect(t).toContain('$800 a month');
    expect(t).toContain('Year 0, month 0.');
    expect(t).toContain('Snowball: smallest first: $19,000 still owed, $0 in interest.');
    expect(t).toContain('Avalanche: highest rate first: $19,000 still owed, $0 in interest.');
    expect(sceneSummary(D, 32)).toContain('Snowball: smallest first: Debt-free in 2 years, 8 months, $6,295 in interest.');
    expect(sceneSummary(D, 32)).toContain('Avalanche: highest rate first: Debt-free in 2 years, 6 months, $4,642 in interest.');
    expect(t).not.toMatch(/[—–]/);
  });

  it('the budget note says what is left to roll', () => {
    expect(budgetNote(D)).toBe('The three minimums are $520, so $280 a month is left to roll toward the target.');
  });

  it('the timeline ticks by the year', () => {
    const ticks = timelineTicks(32);
    expect(ticks.map((t) => t.month)).toEqual([0, 12, 24]);
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toEqual(['0', '1', '2']);
    expect(timelineTicks(18).filter((t) => t.label).map((t) => t.label)).toEqual(['0 mo', '3 mo', '6 mo', '9 mo', '12 mo', '15 mo', '18 mo']);
  });
});
