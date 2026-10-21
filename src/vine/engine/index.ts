/**
 * Nip It in the Bud: the engine. Pure, deterministic, full float64 precision. Nothing in here rounds;
 * display formatting lives in ./format.ts.
 *
 * Each month, in this order (see docs/VINE_SPEC.md):
 *   interest = balance × apr / 12            the vine grows back
 *   payment  = the plan's rule, capped at balance + interest
 *   balance' = balance + interest − payment
 * Minimum due = max(minFloor, interest + minPercent × balance), never more than balance + interest.
 * The left cottage pays the minimum due. The right one pays max(fixedPayment, minimum due), as a card requires.
 * A plan ends when the balance is under half a cent, or at MAX_MONTHS.
 */
import { MAX_MONTHS, VINE_LIMITS } from '../types';
import type { MonthRow, PlanId, PlanSchedule, PlanSnapshot, VineInputs } from '../types';

export { DEFAULT_VINE_INPUTS, MAX_MONTHS, PLANS, VINE_LIMITS } from '../types';
export type { CottageVisual, MonthRow, PlanId, PlanSchedule, PlanSnapshot, VineInputs } from '../types';
export * from './format';

/** A balance under this is treated as cleared. */
export const CLEARED_BELOW = 0.005;

/** Within a month, the share of it at which the interest is charged, and then the payment lands (statement figures). */
export const INTEREST_AT = 0.2;
export const PAYMENT_AT = 0.62;

/** The card's minimum payment at this balance: max(floor, interest + share of balance), at most what is owed. */
export function minimumDue(balance: number, inputs: VineInputs): number {
  if (!(balance > 0)) return 0;
  const interest = (balance * inputs.apr) / 12;
  return Math.min(balance + interest, Math.max(inputs.minFloor, interest + inputs.minPercent * balance));
}

/** What a plan wants to pay at this balance (before capping at what is owed). */
export function planPayment(inputs: VineInputs, id: PlanId, balance: number): number {
  const due = minimumDue(balance, inputs);
  return id === 'fixed' ? Math.max(inputs.fixedPayment, due) : due;
}

/* ---------------------------------------------------------------- schedules (memoised) */

interface Computed {
  schedule: PlanSchedule;
  /** interest paid by the end of month k, k = 0…rows.length (index 0 is 0). */
  cumInterest: Float64Array;
  start: number;
}

const CACHE_LIMIT = 24;
const cache = new Map<string, Computed>();

const keyOf = (inputs: VineInputs, id: PlanId): string =>
  `${id}|${inputs.balance}|${inputs.apr}|${inputs.fixedPayment}|${inputs.minPercent}|${inputs.minFloor}`;

function simulate(inputs: VineInputs, id: PlanId): Computed {
  const rows: MonthRow[] = [];
  let balance = inputs.balance;
  let totalInterest = 0;
  let totalPaid = 0;
  let cleared = false;
  const cum = new Float64Array(MAX_MONTHS + 1);
  for (let month = 1; month <= MAX_MONTHS; month++) {
    const interest = (balance * inputs.apr) / 12;
    const owed = balance + interest;
    let payment = Math.min(planPayment(inputs, id, balance), owed);
    let next = owed - payment;
    if (next < CLEARED_BELOW) {
      payment = owed;
      next = 0;
    }
    rows.push({ month, interest, payment, balance: next });
    totalInterest += interest;
    totalPaid += payment;
    cum[month] = totalInterest;
    balance = next;
    if (next === 0) {
      cleared = true;
      break;
    }
  }
  const schedule: PlanSchedule = {
    id,
    rows,
    payoffMonth: rows.length,
    cleared,
    totalInterest,
    totalPaid,
  };
  return { schedule, cumInterest: cum.slice(0, rows.length + 1), start: inputs.balance };
}

function compute(inputs: VineInputs, id: PlanId): Computed {
  const key = keyOf(inputs, id);
  const hit = cache.get(key);
  if (hit) {
    // keep recently used entries at the end
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = simulate(inputs, id);
  cache.set(key, made);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return made;
}

/** The whole month-by-month schedule of one plan. Memoised per inputs. */
export function planSchedule(inputs: VineInputs, id: PlanId): PlanSchedule {
  return compute(inputs, id).schedule;
}

/**
 * One plan at one moment. `month` may be fractional: within month k (from k to k + 1) every running total moves
 * linearly from its value at the end of month k to its value at the end of month k + 1. Clamped to the schedule.
 */
export function planSnapshot(inputs: VineInputs, id: PlanId, month: number): PlanSnapshot {
  const { schedule, cumInterest, start } = compute(inputs, id);
  const rows = schedule.rows;
  const n = rows.length;
  const m = Math.min(n, Math.max(0, Number.isFinite(month) ? month : 0));
  let k = Math.floor(m);
  let f = m - k;
  if (k >= n) {
    k = n;
    f = 0;
  }
  const balanceAt = (j: number): number => (j === 0 ? start : rows[j - 1].balance);
  const b0 = balanceAt(k);
  const i0 = cumInterest[k];
  let balance = b0;
  let interestPaid = i0;
  if (f > 0 && k < n) {
    balance = b0 + (rows[k].balance - b0) * f;
    interestPaid = i0 + (cumInterest[k + 1] - i0) * f;
  }
  const principalPaid = start - balance;
  const row = k < n ? rows[k] : undefined;
  const paidOff = schedule.cleared && m >= n - 1e-9;
  // the statement figures: through month k + 1 the balance stands, then the interest is charged, then the payment lands
  let owed = b0;
  let interestCharged = i0;
  if (row && f >= INTEREST_AT) {
    owed = b0 + row.interest;
    interestCharged = cumInterest[k + 1];
  }
  if (row && f >= PAYMENT_AT) owed = row.balance;
  return {
    id,
    month: m,
    balance,
    owed: paidOff ? 0 : owed,
    interestPaid,
    interestCharged,
    principalPaid,
    totalPaid: principalPaid + interestPaid,
    payment: paidOff || !row ? 0 : row.payment,
    interest: paidOff || !row ? 0 : row.interest,
    paidOff,
    payoffMonth: schedule.payoffMonth,
    totalInterest: schedule.totalInterest,
  };
}

/** Both plans at one moment, in PLANS order (minimum, fixed). */
export function allPlans(inputs: VineInputs, month: number): [PlanSnapshot, PlanSnapshot] {
  return [planSnapshot(inputs, 'minimum', month), planSnapshot(inputs, 'fixed', month)];
}

/** The later payoff month of the two plans: the length of the timeline. */
export function horizonMonths(inputs: VineInputs): number {
  return Math.max(planSchedule(inputs, 'minimum').payoffMonth, planSchedule(inputs, 'fixed').payoffMonth);
}

/** True when the fixed payment never exceeds the minimum, so both cottages pay exactly the same. */
export function plansMatch(inputs: VineInputs): boolean {
  const a = planSchedule(inputs, 'minimum');
  const b = planSchedule(inputs, 'fixed');
  return a.payoffMonth === b.payoffMonth && Math.abs(a.totalPaid - b.totalPaid) < 0.005;
}

/** Interest in the first month (the balance grows back by this much before any payment). */
export function firstInterest(inputs: VineInputs): number {
  return (inputs.balance * inputs.apr) / 12;
}

/* ---------------------------------------------------------------- validation */

export type VineField = keyof VineInputs;
export interface VineValidation {
  ok: boolean;
  errors: Partial<Record<VineField, string>>;
}

/** Tolerance for step-size float noise on the rate limits. */
const RATE_EPS = 1e-12;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function pct(decimal: number): string {
  return `${Math.round(decimal * 1000) / 10}%`;
}

const dollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

/** Checks every field; one plain-language message per offending field. Accepts anything (unknown input is invalid). */
export function validateVineInputs(raw: unknown): VineValidation {
  const errors: Partial<Record<VineField, string>> = {};
  const r = (raw ?? {}) as Partial<Record<VineField, unknown>>;
  const { balance, apr, fixedPayment, minPercent, minFloor } = VINE_LIMITS;

  const checkMoney = (field: 'balance' | 'fixedPayment' | 'minFloor', label: string, lim: { min: number; max: number }) => {
    const v = r[field];
    if (!isFiniteNumber(v)) errors[field] = `${label} must be a number.`;
    else if (v < lim.min || v > lim.max) errors[field] = `${label} must be between ${dollars(lim.min)} and ${dollars(lim.max)}.`;
  };
  const checkRate = (field: 'apr' | 'minPercent', label: string, lim: { min: number; max: number }) => {
    const v = r[field];
    if (!isFiniteNumber(v)) errors[field] = `${label} must be a number.`;
    else if (v < lim.min - RATE_EPS || v > lim.max + RATE_EPS) errors[field] = `${label} must be between ${pct(lim.min)} and ${pct(lim.max)}.`;
  };

  checkMoney('balance', 'The card balance', balance);
  checkRate('apr', 'The interest rate', apr);
  checkMoney('fixedPayment', 'The fixed payment', fixedPayment);
  checkRate('minPercent', 'The share of the balance', minPercent);
  checkMoney('minFloor', 'The floor', minFloor);

  return { ok: Object.keys(errors).length === 0, errors };
}
