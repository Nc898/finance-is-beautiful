import { describe, expect, it } from 'vitest';
import { DEBTS, DEFAULT_SNOW_INPUTS, hillsMatch, horizonMonths, strategySchedule, validateSnowInputs } from '../../src/snow/engine';
import type { SnowInputs } from '../../src/snow/engine';
import { INTEREST_AT } from '../../src/snow/engine';
import { NOTE_KINDS, SAME_ORDER, WIN_HOLD, interestLiveLine, noteAt, noteFor, noteKindAt, noteMarks } from '../../src/snow/app/notes';
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

describe.each(cases)('notes: %s', (_name, inputs) => {
  const end = horizonMonths(inputs);

  it('go in timeline order as the months pass, from the opening to the result', () => {
    const seen: string[] = [];
    for (let m = 0; m <= end; m += 0.05) {
      const k = noteKindAt(m, inputs);
      if (seen[seen.length - 1] !== k) seen.push(k);
    }
    if (noteKindAt(end, inputs) !== seen[seen.length - 1]) seen.push(noteKindAt(end, inputs));
    // in order (a short timeline may pass a note by), starting at the opening and ending on the result
    const idx = seen.map((k) => NOTE_KINDS.indexOf(k as (typeof NOTE_KINDS)[number]));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    expect(noteKindAt(0, inputs)).toBe('intro');
    expect(noteKindAt(end, inputs)).toBe('results');
  });

  it('are non-empty, with real numbers and no dashes', () => {
    for (const kind of NOTE_KINDS) {
      const c = noteFor(kind, inputs);
      expect(c.kind).toBe(kind);
      expect(c.primary.length).toBeGreaterThan(5);
      const text = `${c.primary} ${c.secondary ?? ''}`;
      expect(text).not.toMatch(/NaN|undefined|Infinity|null/);
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/\$-|\$0\.0/);
    }
  });

  it('month marks are in order and inside the timeline', () => {
    const m = noteMarks(inputs);
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

describe('which note the month shows (defaults)', () => {
  it('follows the month marks 4, 28 and 32', () => {
    expect(noteMarks(D)).toEqual({ interest: 3, win: 4, other: 25, top: 28, end: 32, hold: 12 });
    const at = (m: number) => noteKindAt(m, D);
    expect(at(0)).toBe('intro');
    expect(at(INTEREST_AT - 0.01)).toBe('intro');
    expect(at(INTEREST_AT)).toBe('interest');
    expect(at(3.99)).toBe('interest');
    expect(at(4)).toBe('win');
    expect(at(4 + WIN_HOLD - 0.01)).toBe('win');
    expect(at(4 + WIN_HOLD)).toBe('push');
    expect(at(27.99)).toBe('push');
    expect(at(28)).toBe('top');
    expect(at(31.99)).toBe('top');
    expect(at(32)).toBe('results');
  });

  it('noteAt fills in the live line for the month on the clock', () => {
    const c = noteAt(15, D);
    expect(c.kind).toBe('push');
    expect(c.secondary).toBe(interestLiveLine(D, 15));
    expect(noteAt(32, D).primary).toBe('Avalanche: $4,642 in interest. Snowball: $6,295.');
  });
});

describe('notes (defaults)', () => {
  it('say what the spec table says, with live numbers', () => {
    expect(noteFor('intro', D)).toEqual({
      kind: 'intro',
      primary: 'Three debts. The same $800 a month.',
      secondary: 'Snowball rolls the smallest away first. Avalanche, the highest rate.',
    });
    expect(noteFor('interest', D)).toEqual({
      kind: 'interest',
      primary: 'Interest settles on them every month.',
      secondary: 'Most on the card at 26%. None on the 0% medical bill.',
    });
    expect(noteFor('win', D)).toEqual({
      kind: 'win',
      primary: 'Snowball clears the medical bill in 4 months.',
      secondary: 'A quick win. Its $40 rolls on to the car loan.',
    });
    expect(noteFor('push', D, 12)).toEqual({
      kind: 'push',
      primary: 'Avalanche keeps pushing the card at 26%.',
      secondary: 'Interest so far: snowball $3,311, avalanche $2,937.',
      live: true,
    });
    expect(noteFor('top', D)).toEqual({
      kind: 'top',
      primary: 'Avalanche clears the card in 2 years, 4 months.',
      secondary: 'The costliest debt is gone, so every dollar goes further.',
    });
    expect(noteFor('results', D)).toEqual({
      kind: 'results',
      primary: 'Avalanche: $4,642 in interest. Snowball: $6,295.',
      secondary: "Snowball's first win came 21 months sooner.",
    });
  });

  it('the live interest line follows the clock', () => {
    expect(interestLiveLine(D, 0)).toBe('Interest so far: snowball $0, avalanche $0.');
    expect(interestLiveLine(D, 12)).toBe('Interest so far: snowball $3,311, avalanche $2,937.');
    // the numbers step with the statement, not with every frame
    expect(interestLiveLine(D, 12.1)).toBe(interestLiveLine(D, 12));
    expect(interestLiveLine(D, 12.3)).not.toBe(interestLiveLine(D, 12));
    expect(interestLiveLine(D, 32)).toBe('Interest so far: snowball $6,295, avalanche $4,642.');
  });

});

describe('note marks adapt to the inputs', () => {
  it('the first clear on either hill, the avalanche top-rate clear and each payoff come from the engine', () => {
    for (const [, inputs] of cases) {
      const m = noteMarks(inputs);
      const s = strategySchedule(inputs, 'snowball');
      const a = strategySchedule(inputs, 'avalanche');
      expect(m.win).toBe(Math.min(s.firstWin ?? m.end, a.firstWin ?? m.end));
      expect(m.other).toBe(Math.max(s.firstWin ?? m.end, a.firstWin ?? m.end));
      expect(m.top).toBeGreaterThanOrEqual(Math.min(m.end, a.clearedAt[a.order[0]] ?? m.end));
    }
  });

  it('a bigger budget moves the marks earlier', () => {
    const rich = noteMarks({ ...D, budget: 2000 });
    const base = noteMarks(D);
    expect(rich.end).toBeLessThan(base.end);
    expect(rich.win).toBeLessThan(base.win);
  });

  it('a debt cleared in month 1: the interest note only runs to month 1', () => {
    const m = noteMarks(clearsInMonthOne);
    expect(m.win).toBe(1);
    expect(m.interest).toBe(1);
    const c = noteFor('win', clearsInMonthOne);
    // both orders start with the medical bill's own minimum, so both hills clear it at once
    expect(c.primary).toBe('Both hills clear the medical bill in 1 month.');
    expect(c.secondary).toBe('A quick win. The freed payment rolls on to the next debt.');
  });
});

describe('edge cases', () => {
  it('identical orders: the notes say so plainly', () => {
    expect(hillsMatch(agree)).toBe(true);
    const win = noteFor('win', agree);
    expect(win.primary).toBe(SAME_ORDER);
    expect(win.secondary).toMatch(/^Both clear the medical bill in 4 months\./);
    const push = noteFor('push', agree, 12);
    expect(push.secondary).toMatch(/^Interest so far: \$[\d,]+ on each hill\.$/);
    expect(noteFor('top', agree).primary).toMatch(/^Both hills clear the /);
    const results = noteFor('results', agree);
    expect(results.primary).toMatch(/^Both hills: \$[\d,]+ in interest\.$/);
    expect(results.secondary).toBe(SAME_ORDER);
  });

  it('budget equal to the minimums: the hills still differ once a payment rolls on', () => {
    const tight = { ...D, budget: 520 };
    expect(hillsMatch(tight)).toBe(false);
    expect(budgetNote(tight)).toMatch(/nothing is left over at first/);
    const win = noteFor('win', tight);
    expect(win.primary).toBe('Both hills clear the medical bill in 2 years, 1 month.'); // 1,000 / 40 = 25 months, on both hills
    const results = noteFor('results', tight);
    expect(results.primary).not.toMatch(/Both/);
  });

  it('APR 0 everywhere: no interest to talk about, and the costs are the same either way', () => {
    expect(noteFor('interest', noInterest)).toEqual({
      kind: 'interest',
      primary: 'With no interest, nothing settles on them.',
      secondary: 'Every payment goes straight to the balance.',
    });
    // (with every rate equal the two orders are the same, so this is also the identical-orders story)
    expect(hillsMatch(noInterest)).toBe(true);
    expect(noteFor('results', noInterest).primary).toBe('Both hills: $0 in interest.');
    expect(noteFor('push', noInterest, 6).primary).not.toMatch(/at 0%/);
  });

  it('the 0% debt is named when there is a mix, and the least-interest debt otherwise', () => {
    expect(noteFor('interest', D).secondary).toContain('None on the 0% medical bill.');
    const none0 = withDebt('medical', { apr: 0.05 });
    expect(noteFor('interest', none0).secondary).toBe('Most on the card at 26%. Least on the medical bill at 5%.');
  });

  it('a schedule that never clears: honest text, no crash', () => {
    expect(noteMarks(stuck).end).toBe(720);
    expect(noteFor('win', stuck).primary).toBe('No debt is cleared in 60 years.');
    // nothing ever changes, so the two hills do exactly the same thing
    expect(hillsMatch(stuck)).toBe(true);
    expect(noteFor('results', stuck).secondary).toBe(SAME_ORDER);
    expect(noteFor('top', stuck).primary).toBe('Both hills keep going.');
  });

  it('if the avalanche clears first, it is named', () => {
    // the dearest debt is also the smallest, so both start the same; make the avalanche's top debt clear first
    const inp = withDebt('card', { balance: 600, apr: 0.3, minPayment: 60 }, withDebt('medical', { balance: 2000 }));
    const s = strategySchedule(inp, 'snowball');
    const a = strategySchedule(inp, 'avalanche');
    expect(s.order[0]).toBe('card');
    expect(a.order[0]).toBe('card');
    expect(hillsMatch(inp)).toBe(false); // the rest of the order differs
    expect(noteFor('win', inp).primary).toMatch(/^Both hills clear the card in \d+ months\.$/);
  });

  it('text never claims the wrong hill: results always name the cheaper first', () => {
    const r = noteFor('results', D).primary;
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
