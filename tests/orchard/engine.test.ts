import { describe, expect, it } from 'vitest';
import {
  CREDIT_AT,
  DEFAULT_ORCHARD_INPUTS,
  TREES_AT_END,
  allPickers,
  growthPassesMonth,
  horizonMonths,
  lessAndMore,
  saveSchedule,
  saveSnapshot,
  savesMatch,
  statementMonth,
  treeDollars,
  treeScale,
  treesAt,
  validateOrchardInputs,
  yearlyValues,
} from '../../src/orchard/engine';
import type { OrchardInputs, PickerId } from '../../src/orchard/engine';

const D = DEFAULT_ORCHARD_INPUTS;
const valueAfter = (inputs: OrchardInputs, id: PickerId, month: number) => saveSchedule(inputs, id).rows[month - 1]!.value;
const withSaves = (a: number, b: number, base: OrchardInputs = D): OrchardInputs => ({ ...base, save: { a, b } });
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('the default pickers (docs/ORCHARD_SPEC.md)', () => {
  it('A saves 3%: $150 a month, $75 match, $75 left untaken', () => {
    const s = saveSchedule(D, 'a');
    expect(s.months).toBe(360);
    expect(s.ownMonthly).toBeCloseTo(150, 9);
    expect(s.matchMonthly).toBeCloseTo(75, 9);
    expect(s.offerMonthly).toBeCloseTo(150, 9);
    expect(s.missedMonthly).toBeCloseTo(75, 9);
    expect(valueAfter(D, 'a', 60)).toBeCloseTo(16108, -1);
    expect(valueAfter(D, 'a', 120)).toBeCloseTo(38944, -1);
    expect(valueAfter(D, 'a', 180)).toBeCloseTo(71317, -1);
    expect(valueAfter(D, 'a', 240)).toBeCloseTo(117208, -1);
    expect(valueAfter(D, 'a', 300)).toBeCloseTo(182266, -1);
    expect(s.finalValue).toBeCloseTo(274493.47, 2);
    expect(s.rows[359]!.ownValue).toBeCloseTo(182995.65, 2);
    expect(s.rows[359]!.matchValue).toBeCloseTo(91497.82, 2);
    expect(s.ownTotal).toBeCloseTo(54000, 6);
    expect(s.matchTotal).toBeCloseTo(27000, 6);
    expect(s.missedTotal).toBeCloseTo(27000, 6);
    expect(s.rows[359]!.missedValue).toBeCloseTo(91497.82, 2);
  });

  it('B saves 6%: $300 a month, $150 match, nothing left', () => {
    const s = saveSchedule(D, 'b');
    expect(s.ownMonthly).toBeCloseTo(300, 9);
    expect(s.matchMonthly).toBeCloseTo(150, 9);
    expect(s.missedMonthly).toBe(0);
    expect(valueAfter(D, 'b', 60)).toBeCloseTo(32217, -1);
    expect(valueAfter(D, 'b', 120)).toBeCloseTo(77888, -1);
    expect(valueAfter(D, 'b', 180)).toBeCloseTo(142633, -1);
    expect(valueAfter(D, 'b', 240)).toBeCloseTo(234417, -1);
    expect(valueAfter(D, 'b', 300)).toBeCloseTo(364532, -1);
    expect(s.finalValue).toBeCloseTo(548986.95, 2);
    expect(s.rows[359]!.ownValue).toBeCloseTo(365991.3, 2);
    expect(s.rows[359]!.matchValue).toBeCloseTo(182995.65, 2);
    expect(s.ownTotal).toBeCloseTo(108000, 6);
    expect(s.matchTotal).toBeCloseTo(54000, 6);
    expect(s.missedTotal).toBe(0);
  });

  it('B takes home $54,000 less over 30 years, gets $27,000 more match, and ends $274,493.48 ahead', () => {
    const a = saveSchedule(D, 'a');
    const b = saveSchedule(D, 'b');
    expect(b.ownTotal - a.ownTotal).toBeCloseTo(54000, 6);
    expect(b.matchTotal - a.matchTotal).toBeCloseTo(27000, 6);
    // (the spec's figure is the difference of the two statements, each to the cent)
    const cents = (n: number) => Math.round(n * 100);
    expect(cents(b.finalValue) - cents(a.finalValue)).toBe(27449348);
    expect(b.finalValue - a.finalValue).toBeCloseTo(274493.474, 3);
  });

  it('for both, the growth passes what was put in at month 217 (year 19)', () => {
    expect(saveSchedule(D, 'a').growthPassesMonth).toBe(217);
    expect(saveSchedule(D, 'b').growthPassesMonth).toBe(217);
    expect(growthPassesMonth(D)).toBe(217);
    expect(Math.ceil(217 / 12)).toBe(19);
  });

  it('value is the own part plus the match part, every month', () => {
    for (const id of ['a', 'b'] as const) for (const r of saveSchedule(D, id).rows) expect(r.value).toBe(r.ownValue + r.matchValue);
  });

  it('the timeline is years × 12; yearly values run from 0 to the end', () => {
    expect(horizonMonths(D)).toBe(360);
    const y = yearlyValues(D);
    expect(y).toHaveLength(31);
    expect(y[0]).toEqual({ year: 0, a: 0, b: 0 });
    expect(y[20]!.a).toBeCloseTo(117208, -1);
    expect(y[30]!.b).toBeCloseTo(548986.95, 2);
  });
});

describe('the trees', () => {
  it('$4,500 a tree: A plants 12 golden + 6 red, B 24 golden + 12 red', () => {
    expect(treeDollars(D)).toBeCloseTo(4500, 9);
    const count = (id: PickerId) => {
      const t = saveSchedule(D, id).trees;
      return { all: t.length, own: t.filter((x) => x.variety === 'own').length, match: t.filter((x) => x.variety === 'match').length };
    };
    expect(count('a')).toEqual({ all: 18, own: 12, match: 6 });
    expect(count('b')).toEqual({ all: TREES_AT_END, own: 24, match: 12 });
  });

  it('planting order: own before match in the same month, each tree full after treeDollars', () => {
    const t = saveSchedule(D, 'b').trees;
    expect(t[0]).toEqual({ index: 0, variety: 'own', startMonth: 1, fullMonth: 15 });
    expect(t[1]).toEqual({ index: 1, variety: 'match', startMonth: 1, fullMonth: 30 });
    expect(t[2]).toEqual({ index: 2, variety: 'own', startMonth: 16, fullMonth: 30 });
    t.forEach((x, i) => expect(x.index).toBe(i));
    for (let i = 1; i < t.length; i++) expect(t[i]!.startMonth).toBeGreaterThanOrEqual(t[i - 1]!.startMonth);
    const a = saveSchedule(D, 'a').trees;
    expect(a[0]).toMatchObject({ variety: 'own', startMonth: 1, fullMonth: 30 });
    expect(a[1]).toMatchObject({ variety: 'match', startMonth: 1, fullMonth: 60 });
  });

  it("the trees' values add up to the picker's value, in whole and fractional months", () => {
    for (const id of ['a', 'b'] as const) {
      for (const m of [0, 0.3, 1, 1.5, 15.25, 100, 216.62, 359.99, 360]) {
        const trees = treesAt(D, id, m);
        expect(sum(trees.map((t) => t.value))).toBeCloseTo(saveSnapshot(D, id, m).value, 6);
      }
    }
  });

  it('size is value / treeScale, the same scale on both plots; the oldest tree is the biggest', () => {
    const scale = treeScale(D);
    const b = treesAt(D, 'b', 360);
    const a = treesAt(D, 'a', 360);
    expect(Math.max(...b.map((t) => t.size))).toBeCloseTo(1, 12);
    expect(Math.max(...[...a, ...b].map((t) => t.value))).toBeCloseTo(scale, 9);
    for (const t of [...a, ...b]) expect(t.size).toBeCloseTo(t.value / scale, 12);
    expect(b[0]!.value).toBeGreaterThan(b[b.length - 1]!.value);
    // A's first golden tree is planted over 30 months, B's over 15: B's first is the bigger
    expect(b[0]!.value).toBeGreaterThan(a[0]!.value);
  });

  it('a tree is there from its first dollar; filled and age are smooth', () => {
    expect(treesAt(D, 'b', 0)).toEqual([]);
    const early = treesAt(D, 'b', 0.5);
    expect(early.map((t) => t.variety)).toEqual(['own', 'match']);
    expect(early[0]!.filled).toBeCloseTo(150 / 4500, 9);
    expect(early[0]!.age).toBeCloseTo(0.5, 9);
    expect(treesAt(D, 'b', 15)).toHaveLength(2);
    expect(treesAt(D, 'b', 15.01)).toHaveLength(3);
    expect(treesAt(D, 'b', 15)[0]!.filled).toBeCloseTo(1, 12);
    expect(treesAt(D, 'b', 360)).toHaveLength(36);
    expect(treesAt(D, 'a', 360)).toHaveLength(18);
  });

  it('never more trees than slots, even when both varieties end part full', () => {
    // own and match both leave a part-full tree: one tree fewer shares the larger total
    // B: $235 + $78.75 a month for 84 months = $26,355; at /36 that is 27 golden + 10 red = 37 trees
    const odd = { ...D, years: 7, save: { a: 0.013, b: 0.047 }, match: { rate: 0.35, limit: 0.045 } };
    expect(treeDollars(odd)).toBeCloseTo(26355 / 35, 9);
    expect(saveSchedule(odd, 'b').trees).toHaveLength(36);
    for (const id of ['a', 'b'] as const) expect(saveSchedule(odd, id).trees.length).toBeLessThanOrEqual(36);
    for (const id of ['a', 'b'] as const) {
      const trees = treesAt(odd, id, 84);
      expect(sum(trees.map((t) => t.value))).toBeCloseTo(saveSchedule(odd, id).finalValue, 6);
    }
  });
});

describe('edge cases', () => {
  it('saving 0: no money, no match, an empty orchard; the whole offer is missed', () => {
    const z = withSaves(0, 0.06);
    const s = saveSchedule(z, 'a');
    expect(s.finalValue).toBe(0);
    expect(s.matchTotal).toBe(0);
    expect(s.missedMonthly).toBeCloseTo(150, 9);
    expect(s.trees).toEqual([]);
    expect(s.growthPassesMonth).toBeNull();
    expect(treesAt(z, 'a', 200)).toEqual([]);
    expect(saveSchedule(z, 'b').trees).toHaveLength(36);
  });

  it('nobody saving: a tree is $1, both orchards empty', () => {
    const z = withSaves(0, 0);
    expect(treeDollars(z)).toBe(1);
    expect(treeScale(z)).toBe(1);
    expect(saveSchedule(z, 'b').trees).toEqual([]);
    expect(savesMatch(z)).toBe(true);
  });

  it('a 0 match rate, or a 0 limit: no match and nothing missed; only golden trees', () => {
    for (const match of [{ rate: 0, limit: 0.06 }, { rate: 0.5, limit: 0 }]) {
      const z = { ...D, match };
      for (const id of ['a', 'b'] as const) {
        const s = saveSchedule(z, id);
        expect(s.matchTotal).toBe(0);
        expect(s.missedTotal).toBe(0);
        expect(s.trees.every((t) => t.variety === 'own')).toBe(true);
      }
      expect(saveSchedule(z, 'b').trees).toHaveLength(36);
      expect(saveSchedule(z, 'a').trees).toHaveLength(18);
    }
  });

  it('0 growth: the value is what was put in, and the growth never passes it', () => {
    const z = { ...D, growth: 0 };
    const s = saveSchedule(z, 'a');
    expect(s.finalValue).toBeCloseTo(81000, 6);
    expect(s.growthPassesMonth).toBeNull();
    expect(growthPassesMonth(z)).toBeNull();
    expect(treeScale(z)).toBeCloseTo(4500, 6);
  });

  it('A saving more than B: the copy follows (never assume B saves more)', () => {
    const s = withSaves(0.06, 0.03);
    expect(lessAndMore(s)).toEqual({ less: 'b', more: 'a' });
    expect(saveSchedule(s, 'a').finalValue).toBeCloseTo(548986.95, 2);
    expect(saveSchedule(s, 'b').missedMonthly).toBeCloseTo(75, 9);
    expect(saveSchedule(s, 'a').trees).toHaveLength(36);
  });

  it('both over the limit: the whole match each, nothing missed; the match counts only up to the limit', () => {
    const s = withSaves(0.08, 0.12);
    const a = saveSchedule(s, 'a');
    const b = saveSchedule(s, 'b');
    expect(a.matchMonthly).toBeCloseTo(150, 9);
    expect(b.matchMonthly).toBeCloseTo(150, 9);
    expect(a.missedTotal + b.missedTotal).toBe(0);
    expect(b.ownMonthly).toBeCloseTo(600, 9);
    expect(b.trees.length).toBeLessThanOrEqual(36);
  });

  it('a one-year and a 45-year timeline', () => {
    const one = { ...D, years: 1 };
    expect(horizonMonths(one)).toBe(12);
    expect(saveSchedule(one, 'b').rows).toHaveLength(12);
    expect(saveSchedule(one, 'b').trees).toHaveLength(36);
    expect(sum(treesAt(one, 'b', 12).map((t) => t.value))).toBeCloseTo(saveSchedule(one, 'b').finalValue, 9);
    const long = { ...D, years: 45 };
    expect(horizonMonths(long)).toBe(540);
    expect(saveSchedule(long, 'b').rows).toHaveLength(540);
    expect(saveSchedule(long, 'b').growthPassesMonth).toBe(217);
    expect(sum(treesAt(long, 'a', 540).map((t) => t.value))).toBeCloseTo(saveSchedule(long, 'a').finalValue, 6);
  });
});

describe('snapshots in fractional months', () => {
  it('smooth figures move linearly within a month; the statement steps when the money lands', () => {
    const r1 = saveSchedule(D, 'a').rows[0]!;
    expect(saveSnapshot(D, 'a', 0.5).value).toBeCloseTo(r1.value / 2, 9);
    expect(saveSnapshot(D, 'a', CREDIT_AT - 0.01).valueShown).toBe(0);
    expect(saveSnapshot(D, 'a', CREDIT_AT).valueShown).toBeCloseTo(225, 9);
    expect(saveSnapshot(D, 'a', CREDIT_AT).ownShown).toBeCloseTo(150, 9);
    expect(saveSnapshot(D, 'a', CREDIT_AT).matchShown).toBeCloseTo(75, 9);
    expect(saveSnapshot(D, 'a', CREDIT_AT).missedShown).toBeCloseTo(75, 9);
    const r2 = saveSchedule(D, 'a').rows[1]!;
    const s = saveSnapshot(D, 'a', 1.25);
    expect(s.value).toBeCloseTo(r1.value + (r2.value - r1.value) * 0.25, 9);
    expect(s.valueShown).toBe(r1.value);
    expect(s.missedValue).toBeCloseTo(r1.missedValue + (r2.missedValue - r1.missedValue) * 0.25, 9);
  });

  it('saving until the end, then the final figures; clamped', () => {
    const [a, b] = allPickers(D, 360);
    expect(a.saving).toBe(false);
    expect(b.valueShown).toBeCloseTo(548986.95, 2);
    expect(saveSnapshot(D, 'a', 359.9).saving).toBe(true);
    expect(saveSnapshot(D, 'a', 9999).value).toBeCloseTo(274493.47, 2);
    expect(saveSnapshot(D, 'a', -5).value).toBe(0);
    expect(saveSnapshot(D, 'a', NaN).value).toBe(0);
  });

  it('the clock shows the statement month', () => {
    expect(statementMonth(0)).toBe(0);
    expect(statementMonth(0.61)).toBe(0);
    expect(statementMonth(0.62)).toBe(1);
    expect(statementMonth(1.3)).toBe(1);
    expect(statementMonth(1.7)).toBe(2);
    expect(statementMonth(360)).toBe(360);
  });
});

describe('validation', () => {
  it('accepts the defaults and every 0 the spec allows', () => {
    expect(validateOrchardInputs(D).ok).toBe(true);
    expect(validateOrchardInputs({ ...D, growth: 0, match: { rate: 0, limit: 0 }, save: { a: 0, b: 0 } }).ok).toBe(true);
    expect(validateOrchardInputs({ ...D, years: 45, save: { a: 0.25, b: 0.25 } }).ok).toBe(true);
  });

  it('rejects out-of-range and non-numeric values, with plain messages and no dashes', () => {
    const v = validateOrchardInputs({ salary: 5, years: 12.5, growth: 0.2, match: { rate: 1.5, limit: NaN }, save: { a: -0.01, b: 0.3 } });
    expect(v.ok).toBe(false);
    expect(Object.keys(v.errors).sort()).toEqual(['a.save', 'b.save', 'growth', 'limit', 'rate', 'salary', 'years']);
    for (const m of Object.values(v.errors)) expect(m).not.toMatch(/[—–]/);
    expect(validateOrchardInputs(null).ok).toBe(false);
    expect(validateOrchardInputs({ ...D, years: 0 }).ok).toBe(false);
    expect(validateOrchardInputs({ ...D, years: 46 }).ok).toBe(false);
  });
});
