/**
 * Bread and Butter: the engine. Pure and deterministic, full float64 precision; nothing in here rounds (display
 * formatting lives in ./format.ts). See docs/BREAD_SPEC.md and the contract in ../types.ts.
 *
 * Real prices and pay (./data.ts, generated). A month the BLS did not publish is filled by a straight line between
 * the nearest published months and flagged `estimated`. Per month m (0 = January 1980):
 *   basket(m)  = Σ quantity × price
 *   pay(m)     = the median weekly pay of the quarter ⌊m / 3⌋
 *   minutes(m) = basket ÷ (pay ÷ 40) × 60
 *   rate(m)    = index(m) ÷ index(m − 12) − 1     (prices overall, groceries, core)
 */
import { BASKET_LIMITS, ITEM_KEYS, WORK_HOURS } from '../types';
import type { BasketInputs, BreadSnapshot, Figure, InflationRates, ItemKey, Landmarks, MonthRow } from '../types';
import { DATA_FETCHED, DATA_MONTHS, DATA_START, INDEXES, INDEX_SERIES, PAY_SERIES, PRICES, PRICE_SERIES, WEEKLY_PAY } from './data';
import { monthName, monthShort } from './format';

export { BASKET_LIMITS, DEFAULT_BASKET, ITEMS, ITEM_KEYS, WORK_HOURS } from '../types';
export type { BasketInputs, BoardContent, BreadFrame, BreadSnapshot, Figure, InflationRates, ItemKey, Landmarks, MonthRow } from '../types';
export { DATA_FETCHED, DATA_MONTHS, DATA_START, INDEX_SERIES, PAY_SERIES, PRICE_SERIES };
export * from './format';

export type SeriesKey = ItemKey | 'pay' | 'overall' | 'groceries' | 'core';
export type IndexKey = 'overall' | 'groceries' | 'core';
const INDEX_DATA: Record<IndexKey, readonly (number | null)[]> = {
  overall: INDEXES.cpi,
  groceries: INDEXES.foodAtHome,
  core: INDEXES.core,
};
export const INDEX_KEYS: readonly IndexKey[] = ['overall', 'groceries', 'core'] as const;

/** The index series start in January 1979 so that 1980 has its 12-month rate: month m sits at index m + this. */
const INDEX_LEAD = 12;

/* ---------------------------------------------------------------- filled series */

/** A series as published (`null` = not) turned into figures: a gap is a straight line between the nearest published
 *  values (the data always has a published first and last value). */
function fill(raw: readonly (number | null)[]): Figure[] {
  const out: Figure[] = raw.map((v) => ({ value: v ?? NaN, estimated: v === null }));
  let i = 0;
  while (i < raw.length) {
    if (raw[i] !== null) {
      i++;
      continue;
    }
    let hi = i;
    while (hi < raw.length && raw[hi] === null) hi++;
    const lo = i - 1;
    // (guarded, so a bad file shows as flat rather than NaN)
    const a = raw[lo] ?? raw[hi] ?? 0;
    const b = raw[hi] ?? a;
    for (let k = i; k < hi; k++) out[k].value = lo < 0 ? a : a + ((b - a) * (k - lo)) / (hi - lo);
    i = hi;
  }
  return out;
}

interface Series {
  prices: Record<ItemKey, Figure[]>;
  /** per quarter */
  pay: Figure[];
  indexes: Record<IndexKey, Figure[]>;
}
let seriesCache: Series | null = null;
function series(): Series {
  if (!seriesCache) {
    const prices = {} as Record<ItemKey, Figure[]>;
    for (const k of ITEM_KEYS) prices[k] = fill(PRICES[k]);
    const indexes = {} as Record<IndexKey, Figure[]>;
    for (const k of INDEX_KEYS) indexes[k] = fill(INDEX_DATA[k]);
    seriesCache = { prices, pay: fill(WEEKLY_PAY), indexes };
  }
  return seriesCache;
}

/* ---------------------------------------------------------------- months */

export const monthCount = (): number => DATA_MONTHS;

const clampMonth = (m: number): number => Math.min(DATA_MONTHS - 1, Math.max(0, Number.isFinite(m) ? m : 0));

/** The whole month the clock shows (a price counts from the first of its month). */
export function statementMonth(month: number): number {
  return Math.floor(clampMonth(month) + 1e-9);
}

const startYear = (): number => Number(DATA_START.slice(0, 4));
const startMonth = (): number => Number(DATA_START.slice(5, 7)) - 1;
export const yearOf = (m: number): number => startYear() + Math.floor((startMonth() + m) / 12);
export const monthOfYear = (m: number): number => (startMonth() + m) % 12;
/** the month index of a calendar month (may fall outside the data) */
export const monthIndex = (year: number, monthInYear: number): number => (year - startYear()) * 12 + monthInYear - startMonth();
export const monthLabel = (m: number): string => `${monthName(monthOfYear(m))} ${yearOf(m)}`;
export const monthShortLabel = (m: number): string => `${monthShort(monthOfYear(m))} ${yearOf(m)}`;

/* ---------------------------------------------------------------- the basket */

export interface BasketValidation {
  ok: boolean;
  errors: Partial<Record<ItemKey, string>>;
}

/** Whole quantities, each within its limits. A basket of nothing is valid. */
export function validateBasket(raw: unknown): BasketValidation {
  const errors: Partial<Record<ItemKey, string>> = {};
  const qty = (raw as { qty?: Record<string, unknown> } | null | undefined)?.qty;
  for (const k of ITEM_KEYS) {
    const { min, max } = BASKET_LIMITS[k];
    const v = qty ? qty[k] : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v)) errors[k] = `Enter a whole number from ${min} to ${max}.`;
    else if (!Number.isInteger(v)) errors[k] = 'Use a whole number.';
    else if (v < min || v > max) errors[k] = `Choose from ${min} to ${max}.`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export const basketIsEmpty = (b: BasketInputs): boolean => ITEM_KEYS.every((k) => !(b.qty[k] > 0));

const basketKey = (b: BasketInputs): string => ITEM_KEYS.map((k) => b.qty[k]).join(',');

/* ---------------------------------------------------------------- rows (memoised per basket) */

const CACHE_LIMIT = 16;
const rowCache = new Map<string, (MonthRow | undefined)[]>();
function rowsFor(basket: BasketInputs): (MonthRow | undefined)[] {
  const key = basketKey(basket);
  let rows = rowCache.get(key);
  if (!rows) {
    if (rowCache.size >= CACHE_LIMIT) rowCache.delete(rowCache.keys().next().value as string);
    rows = new Array<MonthRow | undefined>(DATA_MONTHS);
    rowCache.set(key, rows);
  }
  return rows;
}

function rate(key: IndexKey, m: number): Figure {
  const s = series().indexes[key];
  const now = s[m + INDEX_LEAD];
  const then = s[m];
  return { value: now.value / then.value - 1, estimated: now.estimated || then.estimated };
}

/** One price, the pay or a rate in a whole month; the same for every basket. */
export function priceOf(item: ItemKey, m: number): Figure {
  return series().prices[item][statementMonth(m)];
}
export function payOf(m: number): Figure {
  return series().pay[Math.floor(statementMonth(m) / 3)];
}
export function rateOf(key: IndexKey, m: number): Figure {
  return rate(key, statementMonth(m));
}

/** Whole month m at the reader's basket (memoised). */
export function monthRow(basket: BasketInputs, month: number): MonthRow {
  const m = statementMonth(month);
  const rows = rowsFor(basket);
  const hit = rows[m];
  if (hit) return hit;
  const s = series();
  const prices = {} as Record<ItemKey, Figure>;
  let total = 0;
  for (const k of ITEM_KEYS) {
    prices[k] = s.prices[k][m];
    total += basket.qty[k] * prices[k].value;
  }
  const weeklyPay = payOf(m);
  const row: MonthRow = {
    month: m,
    label: monthLabel(m),
    shortLabel: monthShortLabel(m),
    year: yearOf(m),
    prices,
    basket: total,
    weeklyPay,
    minutes: (total / (weeklyPay.value / WORK_HOURS)) * 60,
    inflation: { overall: rate('overall', m), groceries: rate('groceries', m), core: rate('core', m) },
  };
  rows[m] = row;
  return row;
}

/** The smooth moment: figures move linearly from month k to month k + 1, the shown row is whole month k. */
export function snapshot(basket: BasketInputs, month: number): BreadSnapshot {
  const t = clampMonth(month);
  const k = statementMonth(t);
  const a = monthRow(basket, k);
  const b = monthRow(basket, k + 1);
  const f = Math.min(1, Math.max(0, t - k));
  return {
    month: t,
    statementMonth: k,
    basket: a.basket + (b.basket - a.basket) * f,
    minutes: a.minutes + (b.minutes - a.minutes) * f,
    row: a,
  };
}

/** Whether what the labels show for this month is filled in rather than published: the basket (only items in it
 *  count), the pay, and the rates. */
export function rowEstimates(basket: BasketInputs, row: MonthRow): { basket: boolean; pay: boolean; rates: boolean } {
  return {
    basket: ITEM_KEYS.some((k) => basket.qty[k] > 0 && row.prices[k].estimated),
    pay: row.weeklyPay.estimated,
    rates: row.inflation.overall.estimated || row.inflation.groceries.estimated || row.inflation.core.estimated,
  };
}

/* ---------------------------------------------------------------- landmarks, years, gaps */

const landmarkCache = new Map<string, Landmarks>();

export function landmarks(basket: BasketInputs): Landmarks {
  const key = basketKey(basket);
  const hit = landmarkCache.get(key);
  if (hit) return hit;
  const first = monthRow(basket, 0);
  const last = monthRow(basket, DATA_MONTHS - 1);
  const since2010 = monthIndex(2010, 0);
  let most = { month: 0, minutes: first.minutes };
  let fewest = { month: 0, minutes: first.minutes };
  let peak = { month: 0, rate: -Infinity };
  let peak2010 = { month: since2010, rate: -Infinity };
  let groc = { month: 0, rate: -Infinity };
  for (let m = 0; m < DATA_MONTHS; m++) {
    const r = monthRow(basket, m);
    if (r.minutes > most.minutes) most = { month: m, minutes: r.minutes };
    if (r.minutes < fewest.minutes) fewest = { month: m, minutes: r.minutes };
    if (r.inflation.overall.value > peak.rate) peak = { month: m, rate: r.inflation.overall.value };
    if (m >= since2010 && r.inflation.overall.value > peak2010.rate) peak2010 = { month: m, rate: r.inflation.overall.value };
    if (r.inflation.groceries.value > groc.rate) groc = { month: m, rate: r.inflation.groceries.value };
  }
  const s = series();
  const ratio = (k: IndexKey) => s.indexes[k][DATA_MONTHS - 1 + INDEX_LEAD].value / s.indexes[k][INDEX_LEAD].value;
  const out: Landmarks = {
    mostMinutes: most,
    fewestMinutes: fewest,
    overallPeak: peak,
    overallPeakSince2010: peak2010,
    groceriesPeak: groc,
    growth: {
      // (an empty basket has no growth to report: 1)
      basket: first.basket > 0 ? last.basket / first.basket : 1,
      groceries: ratio('groceries'),
      overall: ratio('overall'),
      core: ratio('core'),
      pay: last.weeklyPay.value / first.weeklyPay.value,
    },
  };
  if (landmarkCache.size >= CACHE_LIMIT) landmarkCache.delete(landmarkCache.keys().next().value as string);
  landmarkCache.set(key, out);
  return out;
}

/** The average of each year's months: the basket, pay, minutes and rates (label "1980"). The last year is partial
 *  when the data stops mid-year: its shortLabel says so ("Jan to Sep"). A figure is `estimated` when any month it
 *  averages was filled in. */
export function yearTable(basket: BasketInputs): MonthRow[] {
  const out: MonthRow[] = [];
  const years = yearOf(DATA_MONTHS - 1) - startYear() + 1;
  for (let y = 0; y < years; y++) {
    const year = startYear() + y;
    const from = Math.max(0, monthIndex(year, 0));
    const to = Math.min(DATA_MONTHS - 1, monthIndex(year, 11));
    const rows: MonthRow[] = [];
    for (let m = from; m <= to; m++) rows.push(monthRow(basket, m));
    const n = rows.length;
    const avg = (pick: (r: MonthRow) => number): number => rows.reduce((t, r) => t + pick(r), 0) / n;
    const fig = (pick: (r: MonthRow) => Figure): Figure => ({ value: avg((r) => pick(r).value), estimated: rows.some((r) => pick(r).estimated) });
    const prices = {} as Record<ItemKey, Figure>;
    for (const k of ITEM_KEYS) prices[k] = fig((r) => r.prices[k]);
    const inflation: InflationRates = {
      overall: fig((r) => r.inflation.overall),
      groceries: fig((r) => r.inflation.groceries),
      core: fig((r) => r.inflation.core),
    };
    out.push({
      month: from,
      label: String(year),
      shortLabel: n < 12 ? `${monthShort(monthOfYear(from))} to ${monthShort(monthOfYear(to))}` : String(year),
      year,
      prices,
      basket: avg((r) => r.basket),
      weeklyPay: fig((r) => r.weeklyPay),
      minutes: avg((r) => r.minutes),
      inflation,
    });
  }
  return out;
}

/** Every filled-in month, by series (months are whole month indexes; pay's are the months of a missing quarter).
 *  Series with nothing filled in are left out. */
export function estimatedMonths(): { series: SeriesKey; months: number[] }[] {
  const s = series();
  const out: { series: SeriesKey; months: number[] }[] = [];
  const add = (key: SeriesKey, months: number[]) => {
    if (months.length) out.push({ series: key, months });
  };
  for (const k of ITEM_KEYS) add(k, s.prices[k].flatMap((f, m) => (f.estimated ? [m] : [])));
  const payMonths: number[] = [];
  s.pay.forEach((f, q) => {
    if (f.estimated) for (let m = q * 3; m < q * 3 + 3 && m < DATA_MONTHS; m++) payMonths.push(m);
  });
  add('pay', payMonths);
  for (const k of INDEX_KEYS) add(k, s.indexes[k].flatMap((f, i) => (f.estimated && i >= INDEX_LEAD ? [i - INDEX_LEAD] : [])));
  return out;
}

/** Runs of consecutive months as ranges: [3, 4, 5, 9] gives [[3, 5], [9, 9]]. */
export function monthRuns(months: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const m of months) {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else runs.push([m, m]);
  }
  return runs;
}

/** How much a price rose from month `from` to month `to` (a decimal), for the notes. */
export function priceChange(item: ItemKey, from: number, to: number): number {
  return priceOf(item, to).value / priceOf(item, from).value - 1;
}
