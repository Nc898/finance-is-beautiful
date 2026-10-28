import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRICK_INPUTS,
  INTEREST_AT,
  PAYMENT_AT,
  allLoans,
  cartDollars,
  horizonMonths,
  loanSchedule,
  loanSnapshot,
  loansMatch,
  monthlyPayment,
  shortAndLong,
  statementMonth,
  validateBrickInputs,
  yearlyBalances,
} from '../../src/brick/engine';
import type { BrickInputs } from '../../src/brick/engine';

const D = DEFAULT_BRICK_INPUTS;
const owedAfter = (inputs: BrickInputs, id: 'a' | 'b', month: number) => loanSchedule(inputs, id).rows[month - 1]!.balance;

describe('the default loans (docs/BRICK_SPEC.md)', () => {
  it('the 30-year loan at 6.5%', () => {
    const s = loanSchedule(D, 'a');
    expect(s.months).toBe(360);
    expect(s.payment).toBeCloseTo(1896.2, 2);
    expect(s.rows[0]!.interest).toBeCloseTo(1625, 6);
    expect(s.rows[0]!.principal).toBeCloseTo(271.2, 2);
    expect(s.totalInterest).toBeCloseTo(382633.47, 1);
    expect(s.totalPaid).toBeCloseTo(682633.47, 1);
    expect(s.crossoverMonth).toBe(233);
    expect(s.halfOwnedMonth).toBe(257);
    expect(owedAfter(D, 'a', 60)).toBeCloseTo(280833, -1);
    expect(owedAfter(D, 'a', 120)).toBeCloseTo(254328, -1);
    expect(owedAfter(D, 'a', 180)).toBeCloseTo(217677, -1);
    expect(owedAfter(D, 'a', 240)).toBeCloseTo(166996, -1);
    expect(owedAfter(D, 'a', 300)).toBeCloseTo(96912, -1);
    expect(s.rows[179]!.interestToDate).toBeCloseTo(258994, -1);
  });

  it('the 15-year loan at 5.75%', () => {
    const s = loanSchedule(D, 'b');
    expect(s.months).toBe(180);
    expect(s.payment).toBeCloseTo(2491.23, 2);
    expect(s.rows[0]!.interest).toBeCloseTo(1437.5, 6);
    expect(s.rows[0]!.principal).toBeCloseTo(1053.73, 2);
    expect(s.totalInterest).toBeCloseTo(148421.45, 1);
    expect(s.totalPaid).toBeCloseTo(448421.45, 1);
    expect(s.crossoverMonth).toBe(36);
    expect(s.halfOwnedMonth).toBe(109);
    expect(owedAfter(D, 'b', 60)).toBeCloseTo(226952, -1);
    expect(owedAfter(D, 'b', 120)).toBeCloseTo(129638, -1);
  });

  it('the 15-year loan costs $595 more a month and saves $234,212 in interest', () => {
    const a = loanSchedule(D, 'a');
    const b = loanSchedule(D, 'b');
    expect(b.payment - a.payment).toBeCloseTo(595.03, 2);
    expect(a.totalInterest - b.totalInterest).toBeCloseTo(234212.02, 1);
  });

  it('every balance ends at exactly 0, and principal adds up to the amount', () => {
    for (const id of ['a', 'b'] as const) {
      const s = loanSchedule(D, id);
      expect(s.rows[s.rows.length - 1]!.balance).toBe(0);
      expect(s.rows[s.rows.length - 1]!.principalToDate).toBeCloseTo(D.amount, 6);
      for (const r of s.rows) expect(r.payment).toBeCloseTo(r.interest + r.principal, 9);
    }
  });

  it('a cart carries a third of the amount; the timeline is the longer term', () => {
    expect(cartDollars(D)).toBe(100_000);
    expect(horizonMonths(D)).toBe(360);
    expect(loanSnapshot(D, 'a', 360).interestPaid / cartDollars(D)).toBeCloseTo(3.83, 2);
    expect(loanSnapshot(D, 'b', 180).interestPaid / cartDollars(D)).toBeCloseTo(1.48, 2);
  });
});

describe('edge cases', () => {
  it('0% interest: the amount in equal parts, no interest at all', () => {
    const z = { ...D, loans: { a: { years: 10, apr: 0 }, b: { years: 5, apr: 0 } } };
    expect(monthlyPayment(z.amount, z.loans.a)).toBeCloseTo(2500, 9);
    const s = loanSchedule(z, 'b');
    expect(s.totalInterest).toBe(0);
    expect(s.crossoverMonth).toBe(1);
    expect(s.rows[59]!.balance).toBe(0);
  });

  it('a one-year term', () => {
    const one = { ...D, loans: { a: { years: 1, apr: 0.06 }, b: { years: 2, apr: 0.06 } } };
    const s = loanSchedule(one, 'a');
    expect(s.months).toBe(12);
    expect(s.rows[11]!.balance).toBe(0);
    expect(horizonMonths(one)).toBe(24);
  });

  it('which loan is the shorter: by term, or by rate when the terms are equal; never assumed to be B', () => {
    expect(shortAndLong(D)).toEqual({ short: 'b', long: 'a' });
    expect(shortAndLong({ ...D, loans: { a: D.loans.b, b: D.loans.a } })).toEqual({ short: 'a', long: 'b' });
    expect(shortAndLong({ ...D, loans: { a: { years: 20, apr: 0.05 }, b: { years: 20, apr: 0.06 } } })).toEqual({ short: 'a', long: 'b' });
    expect(loansMatch({ ...D, loans: { a: D.loans.a, b: { ...D.loans.a } } })).toBe(true);
  });

  it('yearly balances run from the amount to 0', () => {
    const y = yearlyBalances(D);
    expect(y[0]).toEqual({ year: 0, a: 300000, b: 300000 });
    expect(y[15]!.b).toBe(0);
    expect(y[30]!.a).toBe(0);
  });
});

describe('snapshots in fractional months', () => {
  it('smooth figures move linearly within a month; the statement steps at the interest and the payment', () => {
    const r1 = loanSchedule(D, 'a').rows[0]!;
    const half = loanSnapshot(D, 'a', 0.5);
    expect(half.balance).toBeCloseTo((D.amount + r1.balance) / 2, 6);
    expect(loanSnapshot(D, 'a', INTEREST_AT - 0.01).owed).toBe(D.amount);
    expect(loanSnapshot(D, 'a', INTEREST_AT + 0.01).owed).toBeCloseTo(D.amount + r1.interest, 6);
    expect(loanSnapshot(D, 'a', PAYMENT_AT + 0.01).owed).toBeCloseTo(r1.balance, 6);
    expect(loanSnapshot(D, 'a', INTEREST_AT + 0.01).interestCharged).toBeCloseTo(r1.interest, 6);
  });

  it('built follows the principal paid; paid off at the end', () => {
    const [a, b] = allLoans(D, 180);
    expect(a.built).toBeCloseTo(1 - 217677 / 300000, 4);
    expect(b.paidOff).toBe(true);
    expect(b.built).toBe(1);
    expect(b.owed).toBe(0);
    expect(loanSnapshot(D, 'a', 0).built).toBe(0);
  });

  it('the clock shows the statement month', () => {
    expect(statementMonth(0)).toBe(0);
    expect(statementMonth(0.19)).toBe(0);
    expect(statementMonth(0.2)).toBe(1);
    expect(statementMonth(1.3)).toBe(2);
  });
});

describe('validation', () => {
  it('accepts the defaults and 0%', () => {
    expect(validateBrickInputs(D).ok).toBe(true);
    expect(validateBrickInputs({ ...D, loans: { a: { years: 30, apr: 0 }, b: D.loans.b } }).ok).toBe(true);
  });

  it('rejects out-of-range and non-numeric values, with plain messages and no dashes', () => {
    const v = validateBrickInputs({ amount: 5, loans: { a: { years: 0, apr: 0.2 }, b: { years: 12.5, apr: NaN } } });
    expect(v.ok).toBe(false);
    expect(Object.keys(v.errors).sort()).toEqual(['a.apr', 'a.years', 'amount', 'b.apr', 'b.years']);
    for (const m of Object.values(v.errors)) expect(m).not.toMatch(/[—–]/);
    expect(validateBrickInputs(null).ok).toBe(false);
  });
});
