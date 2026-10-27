import { describe, expect, it } from 'vitest';
import { DEFAULT_VINE_INPUTS, INTEREST_AT, formatCurrency, formatDuration, horizonMonths, planSchedule } from '../../src/vine/engine';
import type { VineInputs } from '../../src/vine/engine';
import { FIXED_HOLD, NOTE_KINDS, minimumLiveLine, noteAt, noteFor, noteKindAt, noteMarks } from '../../src/vine/app/notes';
import { sceneSummary, timelineTicks } from '../../src/vine/app/text';

const D = DEFAULT_VINE_INPUTS;
const cases: Array<[string, VineInputs]> = [
  ['default', D],
  ['no interest', { ...D, apr: 0 }],
  ['fixed below the minimum (identical plans)', { ...D, fixedPayment: 20 }],
  ['fixed clears in one month', { ...D, balance: 300, fixedPayment: 5000 }],
  ['fixed clears in two months', { ...D, balance: 1000, fixedPayment: 600 }],
  ['small card', { ...D, balance: 300 }],
  ['big, slow card', { ...D, balance: 40_000, apr: 0.3, minPercent: 0.005 }],
  ['never clears in 60 years', { ...D, balance: 100_000, apr: 0.4, minPercent: 0.005, minFloor: 0, fixedPayment: 10 }],
];

describe.each(cases)('notes: %s', (_name, inputs) => {
  const end = horizonMonths(inputs);

  it('go in timeline order as the months pass, from the opening to the result', () => {
    const seen: string[] = [];
    for (let m = 0; m <= end; m += 0.05) {
      const k = noteKindAt(m, inputs);
      if (seen[seen.length - 1] !== k) seen.push(k);
    }
    if (noteKindAt(end, inputs) !== seen[seen.length - 1]) seen.push(noteKindAt(end, inputs));
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
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      expect(text).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it('marks stay ordered: interest <= fixed <= hold <= end', () => {
    const m = noteMarks(inputs);
    expect(m.interest).toBeLessThanOrEqual(m.fixed);
    expect(m.fixed).toBeLessThanOrEqual(m.hold);
    expect(m.hold).toBeLessThanOrEqual(m.end);
    expect(m.end).toBe(end);
  });
});

describe('which note the month shows (defaults)', () => {
  it('follows the month marks 3, 34 and 230', () => {
    const m = noteMarks(D);
    expect(m.interest).toBe(3);
    expect(m.fixed).toBe(34);
    expect(m.end).toBe(230);
    const at = (x: number) => noteKindAt(x, D);
    expect(at(0)).toBe('intro');
    expect(at(INTEREST_AT - 0.01)).toBe('intro');
    expect(at(INTEREST_AT)).toBe('interest');
    expect(at(2.99)).toBe('interest');
    expect(at(3)).toBe('fixed');
    expect(at(34 + FIXED_HOLD - 0.01)).toBe('fixed');
    expect(at(34 + FIXED_HOLD)).toBe('minimum');
    expect(at(229.99)).toBe('minimum');
    expect(at(230)).toBe('results');
  });

  it('noteAt fills in the live line for the month on the clock', () => {
    expect(noteAt(120, D).secondary).toBe(minimumLiveLine(D, 120));
    expect(noteAt(120, D).live).toBe(true);
    expect(noteAt(230, D).primary).toBe('Minimum payments: 19 years, 2 months and $8,100 in interest.');
  });

  it('identical plans (fixed below the minimum): the fixed note says so', () => {
    const inp = { ...D, fixedPayment: 20 };
    expect(noteFor('fixed', inp).primary).toBe('A fixed $20 is no more than the minimum, so both pay the minimum.');
    expect(noteFor('fixed', inp).secondary).toBe('The card asks for at least $141.67 to start.');
  });

  it('a fixed plan that clears within three months: the interest note runs only that long', () => {
    const inp = { ...D, balance: 300, fixedPayment: 5000 };
    expect(planSchedule(inp, 'fixed').payoffMonth).toBe(1);
    expect(noteMarks(inp).interest).toBe(1);
  });
});

describe('notes', () => {
  it('give the defaults the documented copy', () => {
    expect(noteFor('intro', D)).toEqual({
      kind: 'intro',
      primary: 'Two cottages. The same $5,000 vine.',
      secondary: 'Each vine is a credit card balance at 22% a year.',
    });
    expect(noteFor('interest', D)).toEqual({
      kind: 'interest',
      primary: 'Interest grows it back every month.',
      secondary: 'About $92 a month to start. Each clipping on the pile is interest paid.',
    });
    expect(noteFor('fixed', D).primary).toBe('A fixed $200 a month clears it in 2 years, 10 months.');
    expect(noteFor('minimum', D, 144)).toEqual({
      kind: 'minimum',
      primary: 'Minimum payments trim a little. The vine keeps coming back.',
      secondary: 'Year 12: $1,176 still owed.',
      live: true,
    });
    expect(noteFor('results', D)).toEqual({
      kind: 'results',
      primary: 'Minimum payments: 19 years, 2 months and $8,100 in interest.',
      secondary: 'A fixed $200 saves $6,350 and 16 years, 4 months.',
    });
  });

  it('the live line follows the clock: year and what is still owed', () => {
    expect(minimumLiveLine(D, 60)).toBe('Year 5: $2,736 still owed.');
    expect(minimumLiveLine(D, 120)).toBe('Year 10: $1,497 still owed.');
    expect(minimumLiveLine(D, 180)).toBe('Year 15: $813 still owed.');
    expect(minimumLiveLine(D, 230)).toBe('Year 19: paid off.');
  });

  it('the live line turns the year over with the statement, as the readouts do', () => {
    // month 12's interest is charged a fifth of the way through it, so 11.2 months already reads as year 1
    expect(minimumLiveLine(D, 11.1)).toMatch(/^Year 0:/);
    expect(minimumLiveLine(D, 11.2)).toMatch(/^Year 1:/);
  });

  it('the results say what the fixed plan saves, as the totals on screen add up', () => {
    const shown = (n: number) => Math.round(n);
    const min = planSchedule(D, 'minimum');
    const fixed = planSchedule(D, 'fixed');
    expect(formatCurrency(shown(min.totalInterest) - shown(fixed.totalInterest))).toBe('$6,350');
    // identical plans have nothing to compare
    expect(noteFor('results', { ...D, fixedPayment: 20 }).secondary).toMatch(/^A fixed \$20: \$[\d,]+ in interest\.$/);
    // no interest: only time is saved
    expect(noteFor('results', { ...D, apr: 0 }).secondary).toMatch(/^A fixed \$200 clears it [\w ,]+ sooner\.$/);
    // a minimum plan that never clears: the fixed one does, with less interest
    const slow = { ...D, balance: 40_000, apr: 0.3, minPercent: 0.005, minFloor: 0, fixedPayment: 1500 };
    if (!planSchedule(slow, 'minimum').cleared) {
      expect(noteFor('results', slow).secondary).toMatch(/^A fixed \$1,500 clears it in .+, with \$[\d,]+ less interest\.$/);
    }
  });

  it('every number comes from the inputs and the engine', () => {
    const inp = { ...D, balance: 8000, apr: 0.18, fixedPayment: 350 };
    const min = planSchedule(inp, 'minimum');
    const fixed = planSchedule(inp, 'fixed');
    expect(noteFor('intro', inp).primary).toBe('Two cottages. The same $8,000 vine.');
    expect(noteFor('intro', inp).secondary).toBe('Each vine is a credit card balance at 18% a year.');
    expect(noteFor('interest', inp).secondary).toBe('About $120 a month to start. Each clipping on the pile is interest paid.');
    expect(noteFor('fixed', inp).primary).toBe(`A fixed $350 a month clears it in ${formatDuration(fixed.payoffMonth)}.`);
    const results = noteFor('results', inp);
    expect(results.primary).toBe(`Minimum payments: ${formatDuration(min.payoffMonth)} and ${formatCurrency(min.totalInterest)} in interest.`);
    const saved = formatCurrency(Math.round(min.totalInterest) - Math.round(fixed.totalInterest));
    expect(results.secondary).toBe(`A fixed $350 saves ${saved} and ${formatDuration(min.payoffMonth - fixed.payoffMonth)}.`);
  });

  it('with no interest nothing grows back', () => {
    const inp = { ...D, apr: 0 };
    expect(noteFor('intro', inp).secondary).toBe('Each vine is a credit card balance with no interest at all.');
    expect(noteFor('interest', inp).primary).toBe('With no interest, nothing grows back.');
    expect(noteFor('results', inp).primary).toContain('$0 in interest');
  });

  it('a plan that never clears says what is left after 60 years', () => {
    const inp = { ...D, balance: 100_000, apr: 0.4, minPercent: 0.005, minFloor: 0, fixedPayment: 10 };
    const results = noteFor('results', inp);
    expect(results.primary).toMatch(/^Minimum payments: still \$[\d,]+ owed after 60 years and \$[\d,]+ in interest\.$/);
    expect(minimumLiveLine(inp, 720)).toMatch(/^Year 60: \$[\d,]+ still owed\.$/);
  });

  it('never uses a hard-coded dollar figure: captions change with the balance', () => {
    const a = noteFor('intro', { ...D, balance: 5000 });
    const b = noteFor('intro', { ...D, balance: 12_000 });
    expect(a.primary).not.toBe(b.primary);
    expect(b.primary).toContain('$12,000');
  });
});

describe('text: summary and timeline ticks', () => {
  it('the scene summary describes both cottages and follows the clock', () => {
    const s = sceneSummary(D, 144);
    expect(s).toContain('Two cottages');
    expect(s).toContain('$5,000');
    expect(s).toContain('Year 12, month 0.');
    expect(s).toContain('Minimum payments: $1,176 still owed');
    expect(s).toContain('A fixed $200 a month: Paid off in 2 years, 10 months');
    expect(s).not.toContain('—');
  });

  it('ticks: a label every five years for the default 230 months, and one tick per year', () => {
    const t = timelineTicks(230);
    expect(t.filter((x) => x.label).map((x) => x.label)).toEqual(['0', '5', '10', '15']);
    expect(t).toHaveLength(20); // years 0 to 19
    expect(t.find((x) => x.label === '5')!.month).toBe(60);
  });

  it('ticks adapt to the length of the timeline', () => {
    expect(timelineTicks(60).filter((x) => x.label).map((x) => x.label)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(timelineTicks(120).filter((x) => x.label).map((x) => x.label)).toEqual(['0', '2', '4', '6', '8', '10']);
    expect(timelineTicks(720).filter((x) => x.label).map((x) => x.label)).toEqual(['0', '10', '20', '30', '40', '50', '60']);
    expect(timelineTicks(10).filter((x) => x.label).map((x) => x.label)).toEqual(['0 mo', '3 mo', '6 mo', '9 mo']);
    expect(timelineTicks(0)).toEqual([{ month: 0, major: true, label: '0' }]);
  });

  it('a label too close to the end gives way to it', () => {
    const t = timelineTicks(61); // year 5 is one month from the end
    expect(t.find((x) => x.month === 60)!.label).toBeUndefined();
  });
});
