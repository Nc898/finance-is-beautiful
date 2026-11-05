/**
 * The milestone notes: short captions tied to the MONTH (played or dragged), never a scripted story.
 *
 *   before the first month ends          intro    the same savings, two fees
 *   the first year                       early    the fee is a share of everything, every year
 *   years 1 to 10                        small    it looks like a little (fees so far, live)
 *   until the high fee outruns saving    grows    the fee grows with the fund (this year's fees)
 *   until a year before the end          late     the fee now takes more than a year's saving (lost so far, live)
 *   the last year and the end            results  what each fund ends with, and what the fee cost
 * Month marks come from the engine and are clamped to keep this order; empty stretches are skipped. "High" and
 * "low" are by fee, never assumed to be A and B. Equal fees get one plain note throughout.
 */
import {
  CREDIT_AT,
  allFunds,
  feeOutrunsSavingMonth,
  formatCurrency,
  formatRate,
  formatShare,
  fundLetter,
  fundSchedule,
  fundsMatch,
  highAndLow,
  horizonMonths,
  shareLost,
  statementMonth,
} from '../engine';
import type { WoodInputs } from '../engine';

export type NoteKind = 'same' | 'intro' | 'early' | 'small' | 'grows' | 'late' | 'results';
export const NOTE_KINDS: readonly NoteKind[] = ['same', 'intro', 'early', 'small', 'grows', 'late', 'results'];

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
  live?: boolean;
}

export interface NoteMarks {
  year: number;
  small: number;
  late: number;
  results: number;
  end: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function noteMarks(inputs: WoodInputs): NoteMarks {
  const end = horizonMonths(inputs);
  const results = Math.max(0, end - 12);
  const year = Math.min(12, results);
  const small = clamp(120, year, results);
  const { high } = highAndLow(inputs);
  const outrun = feeOutrunsSavingMonth(inputs, high);
  const late = clamp(outrun ?? Math.round(end * 0.6), small, results);
  return { year, small, late, results, end };
}

/** This calendar year's fees so far for a fund (statement). */
function feesThisYear(inputs: WoodInputs, id: 'a' | 'b', months: number): number {
  const s = fundSchedule(inputs, id);
  const m = statementMonth(months, s.months);
  const y0 = Math.floor(Math.max(0, m - 1) / 12) * 12;
  let sum = 0;
  for (let k = y0; k < y0 + 12 && k < s.rows.length; k++) sum += s.rows[k]!.fee;
  return sum;
}

export function noteFor(kind: NoteKind, inputs: WoodInputs, months = 0): Note {
  const { high, low } = highAndLow(inputs);
  const H = fundLetter(high);
  const Lw = fundLetter(low);
  const fh = formatRate(inputs.fees[high]);
  const fl = formatRate(inputs.fees[low]);
  const [a, b] = allFunds(inputs, months);
  const snap = { a, b };
  switch (kind) {
    case 'same':
      return { kind, primary: 'The same fee twice.', secondary: 'Both trees grow alike.' };
    case 'intro':
      return { kind, primary: 'The same savings. The same growth.', secondary: `Only the fee differs: ${H} pays ${fh} a year, ${Lw} pays ${fl}.` };
    case 'early':
      return { kind, primary: 'Every month, a little off the top.', secondary: `The fee is a share of the whole fund, every year, whether it grows or not.` };
    case 'small':
      return {
        kind,
        primary: `${fh} looks like very little.`,
        secondary: `Fees so far: ${H} ${formatCurrency(snap[high].feesCharged)}, ${Lw} ${formatCurrency(snap[low].feesCharged)}.`,
        live: true,
      };
    case 'grows':
      return {
        kind,
        primary: 'The fee grows with the fund.',
        secondary: `This year ${H} pays ${formatCurrency(feesThisYear(inputs, high, months))} in fees, ${Lw} ${formatCurrency(feesThisYear(inputs, low, months))}.`,
        live: true,
      };
    case 'late': {
      const outrun = feeOutrunsSavingMonth(inputs, high);
      const m = statementMonth(months);
      return {
        kind,
        primary:
          outrun !== null && m >= outrun
            ? `Now ${H}'s fee each year is more than ${H} saves in a year.`
            : `And every dollar taken would have grown too.`,
        secondary: `${H} has lost ${formatCurrency(Math.max(0, snap[high].cost))} so far: the fees, and the growth they would have earned.`,
        live: true,
      };
    }
    case 'results': {
      const sh = fundSchedule(inputs, high);
      return {
        kind,
        primary: `A: ${formatCurrency(fundSchedule(inputs, 'a').final)}. B: ${formatCurrency(fundSchedule(inputs, 'b').final)}.`,
        secondary: `The ${fh} fee cost ${H} ${formatCurrency(sh.cost)}, ${formatShare(shareLost(inputs, high))} of what the savings could have grown to.`,
      };
    }
  }
}

export function noteKindAt(months: number, inputs: WoodInputs): NoteKind {
  if (fundsMatch(inputs)) return 'same';
  const k = noteMarks(inputs);
  const m = statementMonth(months, k.end);
  if (months < CREDIT_AT) return 'intro';
  if (m >= k.results) return 'results';
  if (m < k.year) return 'early';
  if (m < k.small) return 'small';
  if (m < k.late) return 'grows';
  return 'late';
}

export const noteAt = (months: number, inputs: WoodInputs): Note => noteFor(noteKindAt(months, inputs), inputs, months);
