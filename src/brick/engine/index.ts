/**
 * Brick by Brick: the engine. Pure, deterministic, full float64 precision. Nothing in here rounds; display
 * formatting lives in ./format.ts.
 *
 * Two loans for the same amount (see docs/BRICK_SPEC.md). Each has a fixed monthly payment
 *   payment = amount × r / (1 − (1 + r)^−n),  r = apr / 12,  n = years × 12   (amount / n at 0%)
 * and each month, in this order:
 *   interest  = balance × r
 *   principal = payment − interest        (the last month: whatever is left, so the balance ends at exactly 0)
 *   balance'  = balance − principal
 */
import { BRICK_LIMITS, CARTS_PER_AMOUNT, LOANS } from '../types';
import type { BrickInputs, LoanId, LoanRow, LoanSchedule, LoanSnapshot, LoanTerms } from '../types';

export { BRICK_LIMITS, CARTS_PER_AMOUNT, DEFAULT_BRICK_INPUTS, LOANS } from '../types';
export type { BrickInputs, HouseVisual, LoanId, LoanRow, LoanSchedule, LoanSnapshot, LoanTerms } from '../types';
export * from './format';

/** Within a month, the share of it at which the interest is charged, and then the payment lands (statement figures). */
export const INTEREST_AT = 0.2;
export const PAYMENT_AT = 0.62;

/**
 * The whole month the clock shows: a month starts counting when its interest is charged, so the readouts never
 * trail the statement figures (at 1.3 months the second month's interest is in, and the clock says month 2).
 */
export function statementMonth(months: number): number {
  return Math.max(0, Math.floor(months + 1 - INTEREST_AT + 1e-9));
}

/** The fixed monthly payment for a loan of `amount` on these terms (full precision). */
export function monthlyPayment(amount: number, terms: LoanTerms): number {
  const n = Math.round(terms.years * 12);
  if (!(n > 0)) return 0;
  const r = terms.apr / 12;
  if (r === 0) return amount / n;
  return (amount * r) / (1 - Math.pow(1 + r, -n));
}

/* ---------------------------------------------------------------- schedules (memoised) */

const CACHE_LIMIT = 24;
const cache = new Map<string, LoanSchedule>();

const keyOf = (amount: number, terms: LoanTerms, id: LoanId): string => `${id}|${amount}|${terms.years}|${terms.apr}`;

function simulate(amount: number, terms: LoanTerms, id: LoanId): LoanSchedule {
  const months = Math.round(terms.years * 12);
  const r = terms.apr / 12;
  const payment = monthlyPayment(amount, terms);
  const rows: LoanRow[] = [];
  let balance = amount;
  let interestToDate = 0;
  let principalToDate = 0;
  let crossoverMonth: number | null = null;
  let halfOwnedMonth = months;
  let halfFound = false;
  for (let month = 1; month <= months; month++) {
    const interest = balance * r;
    let principal = payment - interest;
    if (month === months || principal >= balance) principal = balance;
    const pay = interest + principal;
    balance = month === months ? 0 : balance - principal;
    interestToDate += interest;
    principalToDate += principal;
    rows.push({ month, interest, principal, payment: pay, balance, interestToDate, principalToDate });
    if (crossoverMonth === null && principal >= interest) crossoverMonth = month;
    if (!halfFound && balance <= amount / 2) {
      halfFound = true;
      halfOwnedMonth = month;
    }
    if (balance === 0) break;
  }
  return {
    id,
    months: rows.length,
    payment,
    rows,
    totalInterest: interestToDate,
    totalPaid: interestToDate + principalToDate,
    crossoverMonth,
    halfOwnedMonth,
  };
}

/** The whole month-by-month schedule of one loan. Memoised per inputs. */
export function loanSchedule(inputs: BrickInputs, id: LoanId): LoanSchedule {
  const terms = inputs.loans[id];
  const key = keyOf(inputs.amount, terms, id);
  const hit = cache.get(key);
  if (hit) {
    // keep recently used entries at the end
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = simulate(inputs.amount, terms, id);
  cache.set(key, made);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return made;
}

/**
 * One loan at one moment. `months` may be fractional: within month k (from k to k + 1) the smooth figures move
 * linearly from their values at the end of month k to those at the end of month k + 1; the statement figures (owed,
 * interest charged) step as a statement does: the interest at INTEREST_AT, the payment at PAYMENT_AT. Clamped to
 * the schedule.
 */
export function loanSnapshot(inputs: BrickInputs, id: LoanId, months: number): LoanSnapshot {
  const s = loanSchedule(inputs, id);
  const amount = inputs.amount;
  const rows = s.rows;
  const n = rows.length;
  const m = Math.min(n, Math.max(0, Number.isFinite(months) ? months : 0));
  let k = Math.floor(m);
  let f = m - k;
  if (k >= n) {
    k = n;
    f = 0;
  }
  const balanceAt = (j: number): number => (j === 0 ? amount : rows[j - 1].balance);
  const interestAt = (j: number): number => (j === 0 ? 0 : rows[j - 1].interestToDate);
  const b0 = balanceAt(k);
  const i0 = interestAt(k);
  const row = k < n ? rows[k] : undefined;
  let balance = b0;
  let interestPaid = i0;
  if (row && f > 0) {
    balance = b0 + (row.balance - b0) * f;
    interestPaid = i0 + (row.interestToDate - i0) * f;
  }
  const paidOff = m >= n - 1e-9;
  if (paidOff) {
    balance = 0;
    interestPaid = s.totalInterest;
  }
  // the statement figures: through the first part of the month the balance stands, then the interest is charged,
  // then the payment lands
  let owed = b0;
  let interestCharged = i0;
  if (row && f >= INTEREST_AT) {
    owed = b0 + row.interest;
    interestCharged = row.interestToDate;
  }
  if (row && f >= PAYMENT_AT) owed = row.balance;
  if (paidOff) {
    owed = 0;
    interestCharged = s.totalInterest;
  }
  const principalPaid = amount - balance;
  return {
    id,
    month: m,
    balance,
    owed,
    principalPaid,
    interestPaid,
    interestCharged,
    payment: paidOff || !row ? 0 : row.payment,
    interest: paidOff || !row ? 0 : row.interest,
    principal: paidOff || !row ? 0 : row.principal,
    built: Math.max(0, Math.min(1, principalPaid / amount)),
    paidOff,
    payoffMonth: n,
    totalInterest: s.totalInterest,
  };
}

/** Both loans at one moment, in LOANS order (A, B). */
export function allLoans(inputs: BrickInputs, months: number): [LoanSnapshot, LoanSnapshot] {
  return [loanSnapshot(inputs, 'a', months), loanSnapshot(inputs, 'b', months)];
}

/** The longer term, in months: the length of the timeline. */
export function horizonMonths(inputs: BrickInputs): number {
  return Math.max(loanSchedule(inputs, 'a').months, loanSchedule(inputs, 'b').months);
}

/** The interest one lender's cart carries: amount / CARTS_PER_AMOUNT ($100,000 on $300,000). */
export function cartDollars(inputs: BrickInputs): number {
  return inputs.amount / CARTS_PER_AMOUNT;
}

/** True when both loans have the same term and rate (both houses go up together). */
export function loansMatch(inputs: BrickInputs): boolean {
  const { a, b } = inputs.loans;
  return a.years === b.years && Math.abs(a.apr - b.apr) < 1e-12;
}

/**
 * The shorter loan and the longer one: by term, or by rate when the terms are equal (the lower rate counts as the
 * "shorter", the one that builds faster). Never assumes B is the shorter. For identical loans: A, then B.
 */
export function shortAndLong(inputs: BrickInputs): { short: LoanId; long: LoanId } {
  const { a, b } = inputs.loans;
  const bFirst = b.years < a.years || (b.years === a.years && b.apr < a.apr - 1e-12);
  return bFirst ? { short: 'b', long: 'a' } : { short: 'a', long: 'b' };
}

/** The other loan. */
export const otherLoan = (id: LoanId): LoanId => (id === 'a' ? 'b' : 'a');

/** Still owed (end of month) at the end of each whole year, year 0 … the longer term. */
export function yearlyBalances(inputs: BrickInputs): Array<{ year: number; a: number; b: number }> {
  const years = Math.ceil(horizonMonths(inputs) / 12);
  const out: Array<{ year: number; a: number; b: number }> = [];
  const owedAt = (id: LoanId, month: number): number => {
    const rows = loanSchedule(inputs, id).rows;
    if (month <= 0) return inputs.amount;
    return month >= rows.length ? 0 : rows[month - 1].balance;
  };
  for (let y = 0; y <= years; y++) out.push({ year: y, a: owedAt('a', y * 12), b: owedAt('b', y * 12) });
  return out;
}

/* ---------------------------------------------------------------- validation */

/** Every input field, in panel order: the amount, then each loan's term and rate. */
export type BrickField = 'amount' | `${LoanId}.years` | `${LoanId}.apr`;
export const BRICK_FIELDS: readonly BrickField[] = ['amount', 'a.years', 'a.apr', 'b.years', 'b.apr'];

export interface BrickValidation {
  ok: boolean;
  errors: Partial<Record<BrickField, string>>;
}

/** Tolerance for step-size float noise on the rate limits. */
const RATE_EPS = 1e-12;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const pct = (decimal: number): string => `${Math.round(decimal * 1000) / 10}%`;
const dollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

/** Checks every field; one plain-language message per offending field. Accepts anything (unknown input is invalid). */
export function validateBrickInputs(raw: unknown): BrickValidation {
  const errors: Partial<Record<BrickField, string>> = {};
  const r = (raw ?? {}) as { amount?: unknown; loans?: Partial<Record<LoanId, Partial<Record<keyof LoanTerms, unknown>>>> };
  const { amount, years, apr } = BRICK_LIMITS;

  if (!isFiniteNumber(r.amount)) errors.amount = 'The amount borrowed must be a number.';
  else if (r.amount < amount.min || r.amount > amount.max) {
    errors.amount = `The amount borrowed must be between ${dollars(amount.min)} and ${dollars(amount.max)}.`;
  }

  for (const id of LOANS) {
    const loan = r.loans?.[id] ?? {};
    const name = `Loan ${id.toUpperCase()}`;
    const y = loan.years;
    if (!isFiniteNumber(y)) errors[`${id}.years`] = `${name}'s term must be a number of years.`;
    else if (!Number.isInteger(y) || y < years.min || y > years.max) {
      errors[`${id}.years`] = `${name}'s term must be a whole number of years, from ${years.min} to ${years.max}.`;
    }
    const a = loan.apr;
    if (!isFiniteNumber(a)) errors[`${id}.apr`] = `${name}'s interest rate must be a number.`;
    else if (a < apr.min - RATE_EPS || a > apr.max + RATE_EPS) {
      errors[`${id}.apr`] = `${name}'s interest rate must be between ${pct(apr.min)} and ${pct(apr.max)}.`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
