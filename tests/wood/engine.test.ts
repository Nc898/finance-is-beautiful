import { describe, expect, it } from 'vitest';
import {
  CREDIT_AT,
  DEFAULT_WOOD_INPUTS,
  LOGS_AT_END,
  allFunds,
  feeOutrunsSavingMonth,
  fundSchedule,
  fundSnapshot,
  highAndLow,
  horizonMonths,
  logDollars,
  shareLost,
  statementMonth,
  treeScale,
  treeVisual,
  validateWoodInputs,
  yearlyValues,
} from '../../src/wood/engine';
import type { WoodInputs } from '../../src/wood/engine';

const D = DEFAULT_WOOD_INPUTS;
const withFees = (a: number, b: number, more: Partial<WoodInputs> = {}): WoodInputs => ({ ...D, ...more, fees: { a, b } });

/** Closed form, independent of the engine: each month multiplies by q = (1 + g/12)(1 − f/12), then adds the saving. */
function closedForm(i: WoodInputs, f: number, n = horizonMonths(i)): number {
  const q = (1 + i.growth / 12) * (1 - f / 12);
  if (Math.abs(q - 1) < 1e-15) return i.start + i.monthly * n;
  return i.start * q ** n + (i.monthly * (q ** n - 1)) / (q - 1);
}

describe('fund schedule (defaults: $10,000 + $500 a month, 40 years, 7%, fees 1% and 0.1%)', () => {
  const a = fundSchedule(D, 'a');
  const b = fundSchedule(D, 'b');

  it('ends at the verified values', () => {
    expect(a.final).toBeCloseTo(1_103_491.28, 1);
    expect(b.final).toBeCloseTo(1_432_635.12, 1);
    expect(a.idealFinal).toBeCloseTo(1_475_520.81, 1);
    expect(b.idealFinal).toBeCloseTo(a.idealFinal, 6);
  });

  it('matches the closed form at every year', () => {
    for (const y of [1, 5, 10, 20, 33, 40]) {
      expect(a.rows[y * 12 - 1]!.value).toBeCloseTo(closedForm(D, 0.01, y * 12), 4);
      expect(b.rows[y * 12 - 1]!.value).toBeCloseTo(closedForm(D, 0.001, y * 12), 4);
      expect(a.rows[y * 12 - 1]!.ideal).toBeCloseTo(closedForm(D, 0, y * 12), 4);
    }
  });

  it('fees paid and what they cost', () => {
    expect(a.totalFees).toBeCloseTo(143_217.57, 1);
    expect(b.totalFees).toBeCloseTo(17_241.08, 1);
    expect(a.cost).toBeCloseTo(372_029.54, 1);
    expect(b.cost).toBeCloseTo(42_885.69, 1);
    // the cost is more than the fees: the fees' own growth is lost too
    expect(a.cost).toBeGreaterThan(a.totalFees * 2.5);
    expect(shareLost(D, 'a')).toBeCloseTo(0.2521, 4);
    expect(shareLost(D, 'b')).toBeCloseTo(0.0291, 4);
  });

  it('value + cost is always the no-fee value', () => {
    for (const r of a.rows) expect(r.value + (r.ideal - r.value)).toBeCloseTo(r.ideal, 6);
  });

  it("from year 32, A's yearly fee is more than a year's saving", () => {
    expect(feeOutrunsSavingMonth(D, 'a')).toBe(32 * 12);
    expect(feeOutrunsSavingMonth(D, 'b')).toBeNull();
  });
});

describe('edge inputs', () => {
  it('a 0% fee is the no-fee value exactly', () => {
    const s = fundSchedule(withFees(0, 0), 'a');
    expect(s.totalFees).toBe(0);
    expect(s.cost).toBe(0);
  });

  it('0% growth: the money only shrinks by the fee', () => {
    const i = withFees(0.01, 0, { growth: 0 });
    expect(fundSchedule(i, 'b').final).toBeCloseTo(D.start + D.monthly * 480, 6);
    expect(fundSchedule(i, 'a').final).toBeCloseTo(closedForm(i, 0.01), 4);
    expect(fundSchedule(i, 'a').final).toBeLessThan(fundSchedule(i, 'b').final);
  });

  it('nothing saved and nothing to start: empty funds, one log of a dollar', () => {
    const i = withFees(0.01, 0.001, { start: 0, monthly: 0 });
    expect(fundSchedule(i, 'a').final).toBe(0);
    expect(logDollars(i)).toBe(1);
    expect(treeScale(i)).toBe(1);
  });

  it('A may be the cheaper fund: highAndLow never assumes B', () => {
    expect(highAndLow(D)).toEqual({ high: 'a', low: 'b' });
    expect(highAndLow(withFees(0.001, 0.01))).toEqual({ high: 'b', low: 'a' });
  });
});

describe('snapshots and the clock', () => {
  it('statement month steps at CREDIT_AT', () => {
    expect(statementMonth(0)).toBe(0);
    expect(statementMonth(CREDIT_AT - 0.01)).toBe(0);
    expect(statementMonth(CREDIT_AT)).toBe(1);
    expect(statementMonth(1)).toBe(1);
    expect(statementMonth(480, 480)).toBe(480);
    expect(statementMonth(479.7, 480)).toBe(480);
  });

  it('smooth figures move linearly; statement figures step', () => {
    const s0 = fundSnapshot(D, 'a', 12);
    const s1 = fundSnapshot(D, 'a', 13);
    const mid = fundSnapshot(D, 'a', 12.5);
    expect(mid.value).toBeCloseTo((s0.value + s1.value) / 2, 6);
    expect(mid.worth).toBe(s0.worth);
    expect(fundSnapshot(D, 'a', 12.7).worth).toBe(s1.worth);
  });

  it('clamps outside the timeline', () => {
    expect(fundSnapshot(D, 'a', -5).value).toBe(D.start);
    expect(fundSnapshot(D, 'a', 9999).worth).toBeCloseTo(fundSchedule(D, 'a').final, 6);
    expect(fundSnapshot(D, 'a', Number.NaN).value).toBe(D.start);
  });

  it('putIn and cost are statement figures', () => {
    const [a] = allFunds(D, 120);
    expect(a.putIn).toBe(D.start + D.monthly * 120);
    expect(a.cost).toBeCloseTo(a.idealWorth - a.worth, 6);
  });
});

describe('tree visuals', () => {
  it('the ghost reaches size 1 at the end; the trees are smaller by the square root of what they keep', () => {
    const [a, b] = allFunds(D, 480);
    const va = treeVisual(D, a);
    const vb = treeVisual(D, b);
    expect(va.ghost).toBeCloseTo(1, 9);
    expect(va.maturity).toBeCloseTo(Math.sqrt(1 - 0.2521), 3);
    expect(vb.maturity).toBeGreaterThan(va.maturity);
  });

  it('the larger woodpile ends with LOGS_AT_END logs, both on the same log size', () => {
    const [a, b] = allFunds(D, 480);
    expect(treeVisual(D, a).logs).toBeCloseTo(LOGS_AT_END, 6);
    expect(treeVisual(D, b).logs).toBeCloseTo((LOGS_AT_END * 17_241.08) / 143_217.57, 3);
  });

  it('yearly values run from the start to the end', () => {
    const ys = yearlyValues(D);
    expect(ys).toHaveLength(41);
    expect(ys[0]).toEqual({ year: 0, a: D.start, b: D.start, ideal: D.start });
    expect(ys[40]!.a).toBeCloseTo(1_103_491.28, 1);
  });
});

describe('validation', () => {
  it('accepts the defaults and the limits', () => {
    expect(validateWoodInputs(D).ok).toBe(true);
    expect(validateWoodInputs(withFees(0, 0.03, { growth: 0, start: 0, monthly: 0, years: 1 })).ok).toBe(true);
  });

  it('rejects out-of-range, fractional and missing values with plain messages', () => {
    const r = validateWoodInputs(withFees(0.05, Number.NaN, { years: 2.5, growth: 0.2, monthly: -1 }));
    expect(r.ok).toBe(false);
    expect(r.errors['a.fee']).toBe('A fee must be between 0% and 3%.');
    expect(r.errors['b.fee']).toBe('Enter a fee.');
    expect(r.errors.years).toBe('Use whole years.');
    expect(r.errors.growth).toMatch(/between 0% and 15%/);
    expect(r.errors.monthly).toMatch(/between \$0 and \$20,000/);
    expect(validateWoodInputs(null).ok).toBe(false);
  });
});
