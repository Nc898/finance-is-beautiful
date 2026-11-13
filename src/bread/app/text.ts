/** Pure text helpers shared by the UI, the loop and tests. No DOM access. */
import {
  DATA_MONTHS,
  ITEMS,
  ITEM_KEYS,
  WORK_HOURS,
  basketIsEmpty,
  estimatedMonths,
  formatCents,
  formatMinutes,
  formatMinutesTenth,
  formatPay,
  minutesPhrase,
  monthIndex,
  monthLabel,
  monthRow,
  monthRuns,
  monthShortLabel,
  rowEstimates,
  statementMonth,
  yearOf,
} from '../engine';
import type { BasketInputs, BoardContent, MonthRow, SeriesKey } from '../engine';

/**
 * What the price board should say for a month: the year, each item's price per unit ("$0.51"), the basket's total.
 * A price the BLS did not publish that month (filled by interpolation) shows a "~" ("~$3.47", about), and so does the
 * total while any price is: the board never shows an estimate as if it were published.
 */
export function boardFor(row: MonthRow): BoardContent {
  const price = (f: MonthRow['prices'][keyof MonthRow['prices']]) => (f.estimated ? '~' : '') + formatCents(f.value);
  const anyEstimated = Object.values(row.prices).some((f) => f.estimated);
  return {
    month: row.shortLabel.slice(0, 3).toUpperCase(),
    year: String(row.year),
    prices: {
      bread: price(row.prices.bread),
      eggs: price(row.prices.eggs),
      coffee: price(row.prices.coffee),
      bananas: price(row.prices.bananas),
      chicken: price(row.prices.chicken),
      flour: price(row.prices.flour),
    },
    total: (anyEstimated ? '~' : '') + formatCents(row.basket),
  };
}

export interface LabelText {
  /** the receipt: "This week's basket", the total, and the month ("Jan 1980", or "Oct 2025, estimated") */
  receiptTotal: string;
  receiptDate: string;
  /** the envelope */
  payAmount: string;
  paySub: string;
  /** the headline: "51 minutes of work" (the number is its own span) and what follows it */
  minutes: string;
  minutesUnit: string;
  minutesSub: string;
  /** one sentence for screen readers */
  sentence: string;
}

/** The labels' words for a month's row (statement figures). Filled-in figures are said to be estimated, never shown as published. */
export function labelText(basket: BasketInputs, row: MonthRow): LabelText {
  const est = rowEstimates(basket, row);
  const minutes = basketIsEmpty(basket) ? '0' : formatMinutes(row.minutes);
  const minutesUnit = minutes === '1' ? 'minute of work' : 'minutes of work';
  const estimated = est.basket || est.pay;
  return {
    receiptTotal: formatCents(row.basket),
    receiptDate: est.basket ? `${row.shortLabel}, estimated` : row.shortLabel,
    payAmount: formatPay(row.weeklyPay.value),
    paySub: est.pay ? 'estimated: not published' : 'median, full time, before tax',
    minutes,
    minutesUnit,
    minutesSub: estimated ? 'to buy the basket (estimated)' : 'to buy the basket',
    sentence: `${row.label}: the basket costs ${formatCents(row.basket)}, a week's pay is ${formatPay(row.weeklyPay.value)}, so the basket takes ${minutes} ${minutesUnit}${estimated ? ' (estimated, not all prices were published)' : ''}.`,
  };
}

/** Text alternative for the whole scene at the current month. Updated on discrete changes only. */
export function sceneSummary(basket: BasketInputs, month: number): string {
  const row = monthRow(basket, statementMonth(month));
  const t = labelText(basket, row);
  return `A corner grocery on a rainy morning. The grocer chalks this week's prices on his board and keeps the basket on his counter. ${t.sentence}`;
}

/** Spoken after a scrub: "March 1980. The basket costs ..." */
export function scrubSentence(basket: BasketInputs, month: number): string {
  return labelText(basket, monthRow(basket, statementMonth(month))).sentence;
}

/** The short results sentence announced when the basket changes. */
export function resultsSentence(basket: BasketInputs, month: number): string {
  const row = monthRow(basket, statementMonth(month));
  if (basketIsEmpty(basket)) return `${row.label}: an empty basket costs nothing.`;
  return `${row.label}: the basket costs ${formatCents(row.basket)}, ${minutesPhrase(row.minutes)} of work.`;
}

/* ---------------------------------------------------------------- how this is calculated */

/** "$9.16 ÷ ($254 ÷ 40) × 60 = 86.5 minutes" */
export function minutesFormula(row: MonthRow): string {
  return `${formatCents(row.basket)} ÷ (${formatPay(row.weeklyPay.value)} ÷ ${WORK_HOURS}) × 60 = ${formatMinutesTenth(row.minutes)} minutes`;
}

/** "2 × $0.51 + 1 × $1.47 + ... = $9.16" (only the items in the basket; "$0.00" for an empty one) */
export function basketFormula(basket: BasketInputs, row: MonthRow): string {
  const parts = ITEM_KEYS.filter((k) => basket.qty[k] > 0).map((k) => `${basket.qty[k]} × ${formatCents(row.prices[k].value)}`);
  return parts.length ? `${parts.join(' + ')} = ${formatCents(row.basket)}` : `Nothing in the basket = ${formatCents(0)}`;
}

/** What the filled-in series are called in the list of months not published. */
export const SERIES_NAMES: Record<SeriesKey, string> = {
  bread: `${ITEMS.bread.label}, price`,
  eggs: `${ITEMS.eggs.label}, price`,
  coffee: `${ITEMS.coffee.label}, price`,
  bananas: `${ITEMS.bananas.label}, price`,
  chicken: `${ITEMS.chicken.label}, price`,
  flour: `${ITEMS.flour.label}, price`,
  pay: "A week's pay",
  overall: 'Prices overall, index',
  groceries: 'All groceries, index',
  core: 'Core, index',
};

/** "Sep 2007 to Mar 2010, Jun 2014" */
export function runsText(months: readonly number[]): string {
  return monthRuns(months)
    .map(([a, b]) => (a === b ? monthShortLabel(a) : `${monthShortLabel(a)} to ${monthShortLabel(b)}`))
    .join(', ');
}

/** The filled-in months for the panel: one line per series. */
export function estimatedLines(): { name: string; months: string }[] {
  return estimatedMonths().map((e) => ({ name: SERIES_NAMES[e.series], months: runsText(e.months) }));
}

/** "November 11, 2026" from the data's fetch date ("2026-11-11") */
export function fetchedText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${monthLabel(monthIndex(y, m - 1)).split(' ')[0]} ${d}, ${y}`;
}

/* ---------------------------------------------------------------- timeline scale */

export interface ScaleTick {
  month: number;
  major: boolean;
  /** Present on the labelled ticks. */
  label?: string;
}

/** Ticks for the timeline bar: one a year (each January), labelled with the year every five years. */
export function timelineTicks(): ScaleTick[] {
  const out: ScaleTick[] = [];
  for (let m = 0; m < DATA_MONTHS; m += 12) {
    const year = yearOf(m);
    const labelled = year % 5 === 0;
    out.push({ month: m, major: labelled, label: labelled ? String(year) : undefined });
  }
  return out;
}
