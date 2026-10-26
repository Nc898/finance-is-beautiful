/**
 * On a Roll: the engine. Pure, deterministic, full float64 precision. Nothing in here rounds;
 * display formatting lives in ./format.ts.
 *
 * Each month, in this order (see docs/SNOW_SPEC.md):
 *   interest   = balance × apr / 12 on every debt still owed
 *   minimums   = every debt's minimum, capped at what it owes
 *   extra      = budget − the minimums paid, handed to the debts in the strategy's order; a debt that clears
 *                mid-month passes the rest on to the next one
 * The order is fixed at the start: snowball by smallest starting balance (ties: higher rate first), avalanche by
 * highest rate (ties: smaller balance first). Because the budget stays the same, a cleared debt's payment rolls on.
 * A schedule ends when every balance is under half a cent, or at MAX_MONTHS.
 */
import { DEBTS, MAX_MONTHS, SNOW_LIMITS } from '../types';
import type {
  Debt,
  DebtId,
  DebtMonth,
  DebtSnapshot,
  MonthRow,
  SnowInputs,
  StrategyId,
  StrategySchedule,
  StrategySnapshot,
} from '../types';
import { formatMoney } from './format';

export { DEBTS, DEFAULT_SNOW_INPUTS, MAX_MONTHS, SNOW_LIMITS, STRATEGIES } from '../types';
export type {
  BallVisual,
  Debt,
  DebtId,
  DebtMonth,
  DebtSnapshot,
  HillVisual,
  MonthRow,
  SnowFrame,
  SnowInputs,
  StrategyId,
  StrategySchedule,
  StrategySnapshot,
} from '../types';
export * from './format';

/** A balance under this is treated as cleared. */
export const CLEARED_BELOW = 0.005;

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

/** The largest starting balance of the three: the scale both hills share. */
export function largestStart(inputs: SnowInputs): number {
  return Math.max(...DEBTS.map((d) => inputs.debts[d].balance));
}

/** Interest on a debt in its first month. */
export function firstInterest(debt: Debt): number {
  return (debt.balance * debt.apr) / 12;
}

/** The sum of the three minimums. */
export function sumMinimums(inputs: SnowInputs): number {
  return DEBTS.reduce((sum, d) => sum + inputs.debts[d].minPayment, 0);
}

/** What is left of the budget once every minimum is paid (at the start). */
export function extraAboveMinimums(inputs: SnowInputs): number {
  return Math.max(0, inputs.budget - sumMinimums(inputs));
}

/* ---------------------------------------------------------------- order */

/** The order the extra goes in. Ties fall back to lane order so the result is always the same. */
export function strategyOrder(inputs: SnowInputs, id: StrategyId): DebtId[] {
  const lane = (d: DebtId) => DEBTS.indexOf(d);
  const by = (cmp: (a: DebtId, b: DebtId) => number) => [...DEBTS].sort((a, b) => cmp(a, b) || lane(a) - lane(b));
  const bal = (d: DebtId) => inputs.debts[d].balance;
  const apr = (d: DebtId) => inputs.debts[d].apr;
  return id === 'snowball'
    ? by((a, b) => bal(a) - bal(b) || apr(b) - apr(a))
    : by((a, b) => apr(b) - apr(a) || bal(a) - bal(b));
}

/* ---------------------------------------------------------------- schedules (memoised) */

interface Computed {
  schedule: StrategySchedule;
  /** per debt: interest charged by the end of month k, k = 0…rows.length (index 0 is 0). */
  cumInterest: Record<DebtId, Float64Array>;
  start: Record<DebtId, number>;
}

const CACHE_LIMIT = 24;
const cache = new Map<string, Computed>();

const keyOf = (inputs: SnowInputs, id: StrategyId): string =>
  `${id}|${inputs.budget}|` +
  DEBTS.map((d) => `${inputs.debts[d].balance},${inputs.debts[d].apr},${inputs.debts[d].minPayment}`).join('|');

function simulate(inputs: SnowInputs, id: StrategyId): Computed {
  const order = strategyOrder(inputs, id);
  const start = {} as Record<DebtId, number>;
  const balance = {} as Record<DebtId, number>;
  const cum = {} as Record<DebtId, Float64Array>;
  const clearedAt = {} as Record<DebtId, number | null>;
  for (const d of DEBTS) {
    start[d] = inputs.debts[d].balance;
    balance[d] = inputs.debts[d].balance;
    cum[d] = new Float64Array(MAX_MONTHS + 1);
    clearedAt[d] = null;
  }
  const rows: MonthRow[] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  let firstWin: number | null = null;
  let allClear = false;

  for (let month = 1; month <= MAX_MONTHS; month++) {
    const target = order.find((d) => balance[d] > 0) ?? null;
    const interest = {} as Record<DebtId, number>;
    const payment = {} as Record<DebtId, number>;
    const owed = {} as Record<DebtId, number>;
    for (const d of DEBTS) {
      interest[d] = balance[d] > 0 ? (balance[d] * inputs.debts[d].apr) / 12 : 0;
      owed[d] = balance[d] + interest[d];
      payment[d] = 0;
    }
    // every minimum first, capped at what is owed
    let left = inputs.budget;
    for (const d of DEBTS) {
      if (balance[d] <= 0) continue;
      payment[d] = Math.min(inputs.debts[d].minPayment, owed[d]);
      left -= payment[d];
    }
    // then whatever is left goes down the order, passing on when a debt clears
    left = Math.max(0, left);
    for (const d of order) {
      if (left <= 0) break;
      const room = owed[d] - payment[d];
      if (room <= 0) continue;
      const give = Math.min(left, room);
      payment[d] += give;
      left -= give;
    }
    const debts = {} as Record<DebtId, DebtMonth>;
    for (const d of DEBTS) {
      let next = owed[d] - payment[d];
      if (balance[d] > 0 && next < CLEARED_BELOW) {
        payment[d] = owed[d];
        next = 0;
      }
      debts[d] = { interest: interest[d], payment: payment[d], balance: next };
      totalInterest += interest[d];
      totalPaid += payment[d];
      cum[d][month] = cum[d][month - 1] + interest[d];
      if (balance[d] > 0 && next === 0) {
        clearedAt[d] = month;
        if (firstWin === null) firstWin = month;
      }
      balance[d] = next;
    }
    rows.push({ month, debts, target });
    if (DEBTS.every((d) => balance[d] === 0)) {
      allClear = true;
      break;
    }
  }
  const n = rows.length;
  const trim = (a: Float64Array) => a.slice(0, n + 1);
  const schedule: StrategySchedule = {
    id,
    order,
    rows,
    clearedAt,
    payoffMonth: n,
    cleared: allClear,
    firstWin,
    totalInterest,
    totalPaid,
  };
  return { schedule, cumInterest: { medical: trim(cum.medical), car: trim(cum.car), card: trim(cum.card) }, start };
}

function compute(inputs: SnowInputs, id: StrategyId): Computed {
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

/** The whole month-by-month schedule of one strategy. Memoised per inputs. */
export function strategySchedule(inputs: SnowInputs, id: StrategyId): StrategySchedule {
  return compute(inputs, id).schedule;
}

/**
 * One strategy at one moment. `month` may be fractional: within month k (from k to k + 1) every smooth figure
 * moves linearly from its value at the end of month k to its value at the end of month k + 1; the statement figures
 * (owed, interest charged) step as a statement does. Clamped to the schedule.
 */
export function strategySnapshot(inputs: SnowInputs, id: StrategyId, month: number): StrategySnapshot {
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
  const row = k < n ? rows[k] : undefined;
  const interestStep = !!row && f >= INTEREST_AT;
  const paymentStep = !!row && f >= PAYMENT_AT;
  const strategyPaidOff = schedule.cleared && m >= n - 1e-9;

  const debts = {} as Record<DebtId, DebtSnapshot>;
  let owedAll = 0;
  let chargedAll = 0;
  let clearedCount = 0;
  for (const d of DEBTS) {
    const b0 = k === 0 ? start[d] : rows[k - 1].debts[d].balance;
    const balance = row && f > 0 ? b0 + (row.debts[d].balance - b0) * f : b0;
    const at = schedule.clearedAt[d];
    const paidOff = at !== null && m >= at - 1e-9;
    let owed = b0;
    let interestCharged = cumInterest[d][k];
    if (interestStep) {
      owed = b0 + row!.debts[d].interest;
      interestCharged = cumInterest[d][k + 1];
    }
    if (paymentStep) owed = row!.debts[d].balance;
    if (paidOff) {
      owed = 0;
      clearedCount++;
    }
    debts[d] = {
      id: d,
      balance: paidOff ? 0 : balance,
      owed,
      interestCharged,
      interest: paidOff || !row ? 0 : row.debts[d].interest,
      payment: paidOff || !row ? 0 : row.debts[d].payment,
      paidOff,
    };
    owedAll += owed;
    chargedAll += interestCharged;
  }
  return {
    id,
    month: m,
    debts,
    target: strategyPaidOff || !row ? null : row.target,
    owed: owedAll,
    interestCharged: chargedAll,
    clearedCount,
    paidOff: strategyPaidOff,
    payoffMonth: schedule.payoffMonth,
    totalInterest: schedule.totalInterest,
  };
}

/** Both strategies at one moment, in STRATEGIES order (snowball, avalanche). */
export function allStrategies(inputs: SnowInputs, month: number): [StrategySnapshot, StrategySnapshot] {
  return [strategySnapshot(inputs, 'snowball', month), strategySnapshot(inputs, 'avalanche', month)];
}

/** The later payoff month of the two strategies: the length of the timeline. */
export function horizonMonths(inputs: SnowInputs): number {
  return Math.max(strategySchedule(inputs, 'snowball').payoffMonth, strategySchedule(inputs, 'avalanche').payoffMonth);
}

/** True when the two hills do exactly the same thing month after month (the orders are the same in effect). */
export function hillsMatch(inputs: SnowInputs): boolean {
  const a = strategySchedule(inputs, 'snowball');
  const b = strategySchedule(inputs, 'avalanche');
  if (a.payoffMonth !== b.payoffMonth) return false;
  return a.rows.every((ra, i) => {
    const rb = b.rows[i];
    return DEBTS.every(
      (d) =>
        Math.abs(ra.debts[d].balance - rb.debts[d].balance) < 1e-9 && Math.abs(ra.debts[d].payment - rb.debts[d].payment) < 1e-9,
    );
  });
}

/* ---------------------------------------------------------------- validation */

/** A field key: 'budget', or 'medical.balance', 'car.apr', 'card.minPayment' and so on. */
export type DebtField = 'balance' | 'apr' | 'minPayment';
export type SnowField = 'budget' | `${DebtId}.${DebtField}`;
export const DEBT_FIELDS: readonly DebtField[] = ['balance', 'apr', 'minPayment'] as const;
export const SNOW_FIELDS: readonly SnowField[] = [
  'budget',
  ...DEBTS.flatMap((d) => DEBT_FIELDS.map((f) => `${d}.${f}` as SnowField)),
];

export interface SnowValidation {
  ok: boolean;
  errors: Partial<Record<string, string>>;
}

/** Tolerance for step-size float noise on the rate limits. */
const RATE_EPS = 1e-12;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const pct = (decimal: number): string => `${Math.round(decimal * 1000) / 10}%`;
const dollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

/**
 * Checks every field; one plain-language message per offending field. Accepts anything (unknown input is invalid).
 * Besides each field's range, two rules cross fields: a minimum must cover its own debt's first month of interest,
 * and the budget must cover the three minimums.
 */
export function validateSnowInputs(raw: unknown): SnowValidation {
  const errors: Partial<Record<string, string>> = {};
  const r = (raw ?? {}) as { budget?: unknown; debts?: Partial<Record<DebtId, Partial<Record<DebtField, unknown>>>> };
  const debts = r.debts ?? {};

  const checkMoney = (key: string, v: unknown, label: string, lim: { min: number; max: number }) => {
    if (!isFiniteNumber(v)) errors[key] = `${label} must be a number.`;
    else if (v < lim.min || v > lim.max) errors[key] = `${label} must be between ${dollars(lim.min)} and ${dollars(lim.max)}.`;
  };
  const checkRate = (key: string, v: unknown, label: string, lim: { min: number; max: number }) => {
    if (!isFiniteNumber(v)) errors[key] = `${label} must be a number.`;
    else if (v < lim.min - RATE_EPS || v > lim.max + RATE_EPS) errors[key] = `${label} must be between ${pct(lim.min)} and ${pct(lim.max)}.`;
  };

  checkMoney('budget', r.budget, 'The monthly budget', SNOW_LIMITS.budget);
  for (const d of DEBTS) {
    const x = debts[d] ?? {};
    checkMoney(`${d}.balance`, x.balance, 'The balance', SNOW_LIMITS.balance);
    checkRate(`${d}.apr`, x.apr, 'The interest rate', SNOW_LIMITS.apr);
    checkMoney(`${d}.minPayment`, x.minPayment, 'The minimum payment', SNOW_LIMITS.minPayment);
  }

  // each minimum must cover its debt's first month of interest
  for (const d of DEBTS) {
    const x = debts[d] ?? {};
    if (errors[`${d}.balance`] || errors[`${d}.apr`] || errors[`${d}.minPayment`]) continue;
    const interest = ((x.balance as number) * (x.apr as number)) / 12;
    if ((x.minPayment as number) < interest - 1e-9) {
      errors[`${d}.minPayment`] = `The minimum payment must be at least ${dollars(Math.ceil(interest - 1e-9))} to cover the interest.`;
    }
  }

  // the budget must cover the three minimums (checked when the minimums are all numbers in range)
  const mins = DEBTS.map((d) => (debts[d] ?? {}).minPayment);
  const minsOk = mins.every((v, i) => isFiniteNumber(v) && !(errors[`${DEBTS[i]}.minPayment`] ?? '').includes('must be between') );
  if (!errors['budget'] && minsOk) {
    const sum = (mins as number[]).reduce((s, v) => s + v, 0);
    if ((r.budget as number) < sum - 1e-9) {
      errors['budget'] = `The monthly budget must be at least ${formatMoney(sum)}, the three minimums.`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
