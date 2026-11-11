/**
 * The milestone notes: short captions tied to the MONTH, not to a scripted story. Whether the timeline is played or
 * dragged, the note shown is the one for the month on the clock. Pure functions of (month, basket); every number
 * comes from the engine.
 *
 *   1980                    start     prices rising fast, pay behind
 *   1981 to 1985            cooling   inflation cools, pay catches up (this basket's minutes, live)
 *   1986 to 2006            calm      two calm decades
 *   2007 to 2009            spike     the 2008 food spike
 *   2010 to 2020            steady    groceries steady, pay rising (minutes, live)
 *   2021                    cheapest  the basket at its cheapest
 *   2022 to Sep 2025        surge     the 2022 grocery surge (from 2023 the price of eggs, live)
 *   the last twelve months  latest    this month's basket and minutes, and the growth since 1980
 *   the last month          end       since 1980: the basket, groceries and pay
 * A note whose claim no longer fits the reader's basket (eggs taken out, say) falls back to the minutes of work.
 */
import {
  DATA_MONTHS,
  basketIsEmpty,
  formatCents,
  formatMultiple,
  formatRate,
  landmarks,
  minutesPhrase,
  monthIndex,
  monthRow,
  monthShortLabel,
  priceChange,
  priceOf,
  rowEstimates,
  statementMonth,
  yearOf,
} from '../engine';
import type { BasketInputs } from '../engine';

export type NoteKind = 'start' | 'cooling' | 'calm' | 'spike' | 'steady' | 'cheapest' | 'surge' | 'latest' | 'end';

/** Every note, in timeline order (for measuring the tallest caption). */
export const NOTE_KINDS: readonly NoteKind[] = ['start', 'cooling', 'calm', 'spike', 'steady', 'cheapest', 'surge', 'latest', 'end'];

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
  /** True when the secondary line follows the clock (it is rewritten in place, without a crossfade). */
  live?: boolean;
}

/** The first month of each era (month indexes). */
export const ERA_START = {
  cooling: monthIndex(1981, 0),
  calm: monthIndex(1986, 0),
  spike: monthIndex(2007, 0),
  steady: monthIndex(2010, 0),
  cheapest: monthIndex(2021, 0),
  surge: monthIndex(2022, 0),
  /** from here the surge note's second line is the price of eggs */
  eggs: monthIndex(2023, 0),
  latest: DATA_MONTHS - 12,
  end: DATA_MONTHS - 1,
} as const;

/** the first month of each note's stretch (what a note shows when asked for without a month) */
const KIND_START: Record<NoteKind, number> = {
  start: 0,
  cooling: ERA_START.cooling,
  calm: ERA_START.calm,
  spike: ERA_START.spike,
  steady: ERA_START.steady,
  cheapest: ERA_START.cheapest,
  surge: ERA_START.surge,
  latest: ERA_START.latest,
  end: ERA_START.end,
};

/** Which note the month calls for (the month on the clock, whole). */
export function noteKindAt(month: number): NoteKind {
  const m = statementMonth(month);
  if (m >= ERA_START.end) return 'end';
  if (m >= ERA_START.latest) return 'latest';
  if (m >= ERA_START.surge) return 'surge';
  if (m >= ERA_START.cheapest) return 'cheapest';
  if (m >= ERA_START.steady) return 'steady';
  if (m >= ERA_START.spike) return 'spike';
  if (m >= ERA_START.calm) return 'calm';
  if (m >= ERA_START.cooling) return 'cooling';
  return 'start';
}

/** "64 minutes of work." for this month's basket, or the empty basket's plain line. */
function minutesLine(basket: BasketInputs, m: number): string {
  if (basketIsEmpty(basket)) return 'An empty basket costs nothing.';
  return `${minutesPhrase(monthRow(basket, m).minutes)} of work.`;
}

/** "$9.16 for the basket, 87 minutes of work." */
function nowLine(basket: BasketInputs, m: number): string {
  const row = monthRow(basket, m);
  if (basketIsEmpty(basket)) return 'An empty basket costs nothing.';
  return `${formatCents(row.basket)} for the basket, ${minutesPhrase(row.minutes)} of work.`;
}

/** The first month's minutes against the last month's of a stretch: pay outran this basket over it. */
function payOutranBasket(basket: BasketInputs, from: number, to: number): boolean {
  return monthRow(basket, to).minutes < monthRow(basket, from).minutes;
}

/** Did both flour and eggs rise by a quarter or more within some twelve months of 2007 to 2009? */
function foodSpiked(): boolean {
  const from = monthIndex(2007, 0);
  const to = monthIndex(2009, 11) - 12;
  let flour = 0;
  let eggs = 0;
  for (let m = from; m <= to; m++) {
    flour = Math.max(flour, priceChange('flour', m, m + 12));
    eggs = Math.max(eggs, priceChange('eggs', m, m + 12));
  }
  return flour >= 0.25 && eggs >= 0.25;
}

/** Caption text for a note, using live values from the engine (never hard-coded figures). */
export function noteFor(kind: NoteKind, basket: BasketInputs, month?: number): Note {
  const L = landmarks(basket);
  const m = statementMonth(month ?? KIND_START[kind]);
  switch (kind) {
    case 'start': {
      // (the headline rate is the peak, in March 1980; if the data ever changed so it were not in 1980, say this month's)
      const inYear = yearOf(L.overallPeak.month) === 1980;
      const rate = inYear ? L.overallPeak.rate : monthRow(basket, 0).inflation.overall.value;
      return { kind, primary: `1980: prices rising ${formatRate(rate)} a year.`, secondary: 'The fastest since 1947, and pay had fallen behind.' };
    }
    case 'cooling':
      return {
        kind,
        primary: 'The 1980s: inflation cools and pay catches up.',
        secondary: basketIsEmpty(basket) ? minutesLine(basket, m) : `This basket now takes ${minutesLine(basket, m)}`,
        live: true,
      };
    case 'calm': {
      const fits = payOutranBasket(basket, ERA_START.calm, ERA_START.spike - 1);
      return {
        kind,
        primary: 'Two calm decades: prices creep up a little each year.',
        secondary: fits ? 'Pay rises a little faster.' : minutesLine(basket, m),
        live: !fits,
      };
    }
    case 'spike':
      return {
        kind,
        primary: '2008: food prices jump, then the recession.',
        secondary: foodSpiked() ? 'Flour and eggs leap in a year.' : minutesLine(basket, m),
        live: !foodSpiked(),
      };
    case 'steady':
      return { kind, primary: 'Groceries stay steady while pay keeps rising.', secondary: minutesLine(basket, m), live: true };
    case 'cheapest': {
      const fewest = L.fewestMinutes;
      if (!basketIsEmpty(basket) && yearOf(fewest.month) === 2021) {
        return { kind, primary: `2021: the basket at its cheapest, ${minutesPhrase(fewest.minutes)} of work.`, secondary: 'Then prices start to climb.' };
      }
      return { kind, primary: '2021: prices start to climb.', secondary: minutesLine(basket, m), live: true };
    }
    case 'surge': {
      const peak = L.groceriesPeak;
      const primary = `${yearOf(peak.month)}: grocery prices up ${formatRate(peak.rate)} in a year.`;
      if (m >= ERA_START.eggs && basket.qty.eggs > 0) {
        const eggs = priceOf('eggs', m);
        return { kind, primary, secondary: `Eggs: ${formatCents(eggs.value)} a dozen${eggs.estimated ? ' (estimated)' : ''}.`, live: true };
      }
      if (m >= ERA_START.eggs) return { kind, primary, secondary: minutesLine(basket, m), live: true };
      return { kind, primary, secondary: 'Faster than at any point since 1980.' };
    }
    case 'latest': {
      const row = monthRow(basket, m);
      const est = rowEstimates(basket, row).basket ? ' (estimated)' : '';
      const growth = basketIsEmpty(basket)
        ? `Since 1980, pay ${formatMultiple(L.growth.pay)}.`
        : `Since 1980, the basket ${formatMultiple(L.growth.basket)}, pay ${formatMultiple(L.growth.pay)}.`;
      return { kind, primary: `${monthShortLabel(m)}: ${nowLine(basket, m)}${est}`, secondary: growth, live: true };
    }
    case 'end': {
      const parts = basketIsEmpty(basket)
        ? [`all groceries ${formatMultiple(L.growth.groceries)}`, `pay ${formatMultiple(L.growth.pay)}`]
        : [`this basket ${formatMultiple(L.growth.basket)}`, `all groceries ${formatMultiple(L.growth.groceries)}`, `pay ${formatMultiple(L.growth.pay)}`];
      return { kind, primary: `Since 1980: ${parts.join(', ')}.`, secondary: basketIsEmpty(basket) ? nowLine(basket, m) : `Today: ${nowLine(basket, m)}` };
    }
  }
}

/** The note for the month on the clock (its live line, if any, filled in for that month). */
export function noteAt(month: number, basket: BasketInputs): Note {
  return noteFor(noteKindAt(month), basket, month);
}

