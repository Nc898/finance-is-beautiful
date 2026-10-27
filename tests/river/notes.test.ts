import { describe, expect, it } from 'vitest';
import { DEFAULT_RIVER_INPUTS, allBoats, buysToday, formatCurrency } from '../../src/river/engine';
import type { RiverInputs } from '../../src/river/engine';
import { NOTE_KINDS, noteAt, noteFor, noteKindAt, noteYearMarks } from '../../src/river/app/notes';

const D = DEFAULT_RIVER_INPUTS;
const cases: Array<[string, RiverInputs]> = [
  ['default', D],
  ['one year', { ...D, years: 1 }],
  ['short', { ...D, years: 7 }],
  ['long', { ...D, years: 60 }],
  ['zero inflation', { ...D, inflation: 0 }],
  ['negative investing', { ...D, investRate: -0.04 }],
  ['rate equals inflation', { ...D, savingsRate: 0.03, investRate: 0.03 }],
];

describe.each(cases)('notes: %s', (_name, inputs) => {
  it('go in timeline order as the years pass, from the opening to the result', () => {
    const end = inputs.years;
    const seen: string[] = [];
    for (let y = 0; y <= end; y += 0.01) {
      const k = noteKindAt(y, inputs);
      if (seen[seen.length - 1] !== k) seen.push(k);
    }
    if (noteKindAt(end, inputs) !== seen[seen.length - 1]) seen.push(noteKindAt(end, inputs));
    const idx = seen.map((k) => NOTE_KINDS.indexOf(k as (typeof NOTE_KINDS)[number]));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    expect(noteKindAt(0, inputs)).toBe('intro');
    expect(noteKindAt(end, inputs)).toBe('results');
  });

  it('are non-empty, with the real numbers', () => {
    for (const kind of NOTE_KINDS) {
      const c = noteFor(kind, inputs);
      expect(c.kind).toBe(kind);
      expect(c.primary.length).toBeGreaterThan(5);
      expect(`${c.primary} ${c.secondary ?? ''}`).not.toMatch(/NaN|undefined|Infinity/);
    }
    const results = noteFor('results', inputs);
    const [cash, savings, invest] = allBoats(inputs, inputs.years);
    expect(results.primary).toContain(formatCurrency(inputs.start));
    expect(results.secondary).toContain(formatCurrency(savings.real));
    expect(results.secondary).toContain(formatCurrency(invest.real));
    if (inputs.inflation > 0) expect(results.primary).toContain(buysToday(cash.real));
  });
});

describe('which note the year shows', () => {
  it('uses the whole-year marks 1, 6, 14, 30 at the defaults and clamps them for short timelines', () => {
    expect(noteYearMarks(D)).toEqual({ current: 1, cash: 6, savings: 14, end: 30 });
    expect(noteYearMarks({ ...D, years: 1 })).toEqual({ current: 1, cash: 1, savings: 1, end: 1 });
    const m7 = noteYearMarks({ ...D, years: 7 });
    expect(m7.current).toBeLessThanOrEqual(m7.cash);
    expect(m7.cash).toBeLessThanOrEqual(m7.savings);
    expect(m7.savings).toBeLessThanOrEqual(7);
  });

  it('follows them at the defaults', () => {
    const at = (y: number) => noteKindAt(y, D);
    expect(at(0)).toBe('intro');
    expect(at(0.5)).toBe('current');
    expect(at(1)).toBe('cash');
    expect(at(5.99)).toBe('cash');
    expect(at(6)).toBe('savings');
    expect(at(14)).toBe('invest');
    expect(at(29.99)).toBe('invest');
    expect(at(30)).toBe('results');
    expect(noteAt(30, D).primary).toContain('Still $10,000 in cash');
  });
});

describe('notes', () => {
  it('opens with the three boats and the live starting amount', () => {
    const c = noteFor('intro', { ...D, start: 25_000 });
    expect(c.primary).toBe('Three boats. The same $25,000.');
    expect(c.secondary).toBe('Cash, a savings account, and investing.');
  });

  it('gives the default results the documented numbers', () => {
    const c = noteFor('results', D);
    expect(c.primary).toBe('Still $10,000 in cash. It buys what $4,120 buys today.');
    expect(c.secondary).toBe("In today's dollars, savings is worth $7,463 and investing $23,662.");
  });

  it('copy follows the scenario: still water, savings ahead, negative investing', () => {
    expect(noteFor('current', { ...D, inflation: 0 }).primary).toBe('In this river, prices hold steady.');
    expect(noteFor('cash', { ...D, inflation: 0 }).primary).toMatch(/still water/);
    expect(noteFor('savings', D).primary).toBe('A savings account rows, but slower than the current.');
    expect(noteFor('savings', { ...D, savingsRate: 0.05 }).primary).toMatch(/faster than the current/);
    expect(noteFor('savings', { ...D, savingsRate: 0.03 }).primary).toMatch(/exactly as fast/);
    expect(noteFor('savings', { ...D, savingsRate: 0 }).primary).toMatch(/earns nothing/);
    expect(noteFor('invest', D).primary).toBe('Investing has to row harder than the current to make headway.');
    expect(noteFor('invest', { ...D, investRate: -0.02 }).primary).toMatch(/drifts faster than cash/);
    expect(noteFor('invest', { ...D, investRate: 0.02 }).primary).toMatch(/slower than the current/);
  });

  it('never uses a hard-coded dollar figure: captions change with the starting amount', () => {
    const a = noteFor('results', { ...D, start: 10_000 });
    const b = noteFor('results', { ...D, start: 50_000 });
    expect(a.primary).not.toBe(b.primary);
    expect(b.primary).toContain('$50,000');
  });
});

describe('formatting in captions', () => {
  it('uses the shared currency format (no cents, grouped)', () => {
    expect(formatCurrency(1234567)).toBe('$1,234,567');
  });
});
