/**
 * The money of A Little Off the Top. Pure and unit-tested; no DOM.
 *
 * Each month, for each fund: the fund grows by growth / 12, then the fee takes fee / 12 of what is there, then the
 * month's saving goes in. The no-fee value ("ideal") runs the same months without the fee, so the two only ever
 * differ by the fees and the growth those fees would have earned. Full precision, no cent rounding.
 */
import { DEFAULT_WOOD_INPUTS, FUNDS, LOGS_AT_END, WOOD_LIMITS } from '../types';
import type { FundId, FundRow, FundSchedule, FundSnapshot, TreeVisual, WoodInputs } from '../types';

export { DEFAULT_WOOD_INPUTS, FUNDS, LOGS_AT_END, WOOD_LIMITS } from '../types';
export type { FundId, FundRow, FundSchedule, FundSnapshot, TreeVisual, WoodInputs } from '../types';
export * from './format';

/** Within a month, the statement figures step when the month's saving lands (as the brick and the orchard). */
export const CREDIT_AT = 0.62;

export const horizonMonths = (inputs: WoodInputs): number => Math.max(0, Math.round(inputs.years) * 12);

/** The whole month the clock shows: month k is shown from k − 1 + CREDIT_AT. */
export function statementMonth(months: number, horizon = Infinity): number {
  if (!(months > 0)) return 0;
  return Math.min(horizon, Math.max(0, Math.floor(months - CREDIT_AT + 1 + 1e-9)));
}

const memo = new Map<string, FundSchedule>();
const keyOf = (i: WoodInputs, id: FundId): string => `${id}|${i.start}|${i.monthly}|${i.years}|${i.growth}|${i.fees[id]}`;

export function fundSchedule(inputs: WoodInputs, id: FundId): FundSchedule {
  const key = keyOf(inputs, id);
  const hit = memo.get(key);
  if (hit) return hit;
  const n = horizonMonths(inputs);
  const g = inputs.growth / 12;
  const f = inputs.fees[id] / 12;
  let v = inputs.start;
  let ideal = inputs.start;
  let fees = 0;
  const rows: FundRow[] = [];
  for (let m = 1; m <= n; m++) {
    v *= 1 + g;
    const fee = v * f;
    v -= fee;
    v += inputs.monthly;
    ideal = ideal * (1 + g) + inputs.monthly;
    fees += fee;
    rows.push({ month: m, fee, value: v, ideal, feesToDate: fees });
  }
  const s: FundSchedule = { id, months: n, rows, final: v, idealFinal: ideal, totalFees: fees, cost: ideal - v };
  if (memo.size > 64) memo.clear();
  memo.set(key, s);
  return s;
}

/** Month-end figures for month k (0 = the start). */
function at(inputs: WoodInputs, s: FundSchedule, k: number): { value: number; ideal: number; fees: number; fee: number } {
  if (k <= 0) return { value: inputs.start, ideal: inputs.start, fees: 0, fee: 0 };
  const r = s.rows[Math.min(k, s.rows.length) - 1]!;
  return { value: r.value, ideal: r.ideal, fees: r.feesToDate, fee: r.fee };
}

export function fundSnapshot(inputs: WoodInputs, id: FundId, monthsRaw: number): FundSnapshot {
  const s = fundSchedule(inputs, id);
  const n = s.months;
  const months = Math.min(n, Math.max(0, Number.isFinite(monthsRaw) ? monthsRaw : 0));
  const k = Math.floor(months);
  const t = months - k;
  const a = at(inputs, s, k);
  const b = k >= n ? a : at(inputs, s, k + 1);
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const sm = statementMonth(months, n);
  const st = at(inputs, s, sm);
  return {
    id,
    month: months,
    value: lerp(a.value, b.value),
    worth: st.value,
    fees: lerp(a.fees, b.fees),
    feesCharged: st.fees,
    ideal: lerp(a.ideal, b.ideal),
    idealWorth: st.ideal,
    cost: st.ideal - st.value,
    putIn: inputs.start + inputs.monthly * sm,
    feeThisMonth: st.fee,
  };
}

export function allFunds(inputs: WoodInputs, months: number): [FundSnapshot, FundSnapshot] {
  return [fundSnapshot(inputs, 'a', months), fundSnapshot(inputs, 'b', months)];
}

/** The largest no-fee value reached: the scale of both trees (a tree of this value is maturity 1). */
export function treeScale(inputs: WoodInputs): number {
  const s = fundSchedule(inputs, 'a');
  let top = inputs.start;
  for (const r of s.rows) top = Math.max(top, r.ideal);
  return Math.max(1, top);
}

/** Each log in a woodpile is this many dollars of fees: the larger pile ends with LOGS_AT_END logs. */
export function logDollars(inputs: WoodInputs): number {
  const most = Math.max(fundSchedule(inputs, 'a').totalFees, fundSchedule(inputs, 'b').totalFees);
  return most > 0 ? most / LOGS_AT_END : 1;
}

/** The scene's state for a fund at a moment. */
export function treeVisual(inputs: WoodInputs, snap: FundSnapshot): TreeVisual {
  const S = treeScale(inputs);
  const fee = inputs.fees[snap.id];
  return {
    id: snap.id,
    maturity: Math.sqrt(Math.max(0, snap.value) / S),
    ghost: Math.sqrt(Math.max(0, snap.ideal) / S),
    logs: snap.fees / logDollars(inputs),
    trim: fee * 1000 / 12,
  };
}

export const fundsMatch = (inputs: WoodInputs): boolean => Math.abs(inputs.fees.a - inputs.fees.b) < 1e-12;

/** The fund with the higher fee and the one with the lower (ties: A is "high"). Never assumes B is cheaper. */
export function highAndLow(inputs: WoodInputs): { high: FundId; low: FundId } {
  return inputs.fees.b > inputs.fees.a ? { high: 'b', low: 'a' } : { high: 'a', low: 'b' };
}

export const otherFund = (id: FundId): FundId => (id === 'a' ? 'b' : 'a');

/** Values at the end of each year (year 0 … years). */
export function yearlyValues(inputs: WoodInputs): Array<{ year: number; a: number; b: number; ideal: number }> {
  const out: Array<{ year: number; a: number; b: number; ideal: number }> = [];
  const sa = fundSchedule(inputs, 'a');
  const sb = fundSchedule(inputs, 'b');
  for (let y = 0; y <= Math.round(inputs.years); y++) {
    const k = y * 12;
    out.push({ year: y, a: at(inputs, sa, k).value, b: at(inputs, sb, k).value, ideal: at(inputs, sa, k).ideal });
  }
  return out;
}

/** The share of the no-fee value the fee takes by the end: cost / idealFinal (0 … 1). */
export function shareLost(inputs: WoodInputs, id: FundId): number {
  const s = fundSchedule(inputs, id);
  return s.idealFinal > 0 ? s.cost / s.idealFinal : 0;
}

/** The first month a fund's fees for that year top what was saved that year (or null). For the notes. */
export function feeOutrunsSavingMonth(inputs: WoodInputs, id: FundId): number | null {
  const s = fundSchedule(inputs, id);
  const yearSaving = inputs.monthly * 12;
  for (let y = 1; y * 12 <= s.months; y++) {
    let fees = 0;
    for (let m = (y - 1) * 12; m < y * 12; m++) fees += s.rows[m]!.fee;
    if (fees > yearSaving) return y * 12;
  }
  return null;
}

/* ---------------------------------------------------------------- inputs */

export type WoodField = 'start' | 'monthly' | 'years' | 'growth' | `${FundId}.fee`;
export const WOOD_FIELDS: readonly WoodField[] = ['start', 'monthly', 'years', 'growth', 'a.fee', 'b.fee'];

export interface WoodValidation {
  ok: boolean;
  errors: Partial<Record<WoodField, string>>;
}

const pct = (d: number): string => `${Math.round(d * 1e5) / 1e3}%`;
const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

export function validateWoodInputs(raw: unknown): WoodValidation {
  const errors: Partial<Record<WoodField, string>> = {};
  const i = raw as Partial<WoodInputs> | null;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const L = WOOD_LIMITS;
  const range = (f: WoodField, v: unknown, min: number, max: number, show: (n: number) => string, what: string) => {
    if (!num(v)) errors[f] = `Enter ${what}.`;
    else if (v < min || v > max) errors[f] = `${what[0]!.toUpperCase()}${what.slice(1)} must be between ${show(min)} and ${show(max)}.`;
  };
  range('start', i?.start, L.start.min, L.start.max, money, 'a starting amount');
  range('monthly', i?.monthly, L.monthly.min, L.monthly.max, money, 'a monthly saving');
  range('years', i?.years, L.years.min, L.years.max, String, 'a number of years');
  if (!errors.years && num(i?.years) && !Number.isInteger(i!.years)) errors.years = 'Use whole years.';
  range('growth', i?.growth, L.growth.min, L.growth.max, pct, 'a growth rate');
  for (const id of FUNDS) range(`${id}.fee`, i?.fees?.[id], L.fee.min, L.fee.max, pct, 'a fee');
  return { ok: Object.keys(errors).length === 0, errors };
}

export const DEFAULTS = DEFAULT_WOOD_INPUTS;
