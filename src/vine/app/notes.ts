/**
 * The milestone notes: short captions tied to the MONTH, not to a scripted story. Whether the timeline is played or
 * dragged, the note shown is the one for the month on the clock. Pure functions of (months, inputs).
 *
 *   before the first interest       intro     two cottages, the same vine
 *   the first few months            interest  interest grows it back every month
 *   until a year after the fixed    fixed     the fixed payment clears it in so long
 *     plan clears
 *   until the end                   minimum   minimum payments trim a little (what is still owed, live)
 *   the end                         results   the interest on the minimum, and what the fixed payment saves
 * The month marks come from the engine, so they follow the inputs.
 */
import {
  firstInterest,
  formatCurrency,
  formatDuration,
  formatMoney,
  formatPercent,
  horizonMonths,
  INTEREST_AT,
  minimumDue,
  planSchedule,
  planSnapshot,
  plansMatch,
  statementMonth,
  yearLabel,
} from '../engine';
import type { VineInputs } from '../engine';

export type NoteKind = 'intro' | 'interest' | 'fixed' | 'minimum' | 'results';

/** Every note, in timeline order (for measuring the tallest caption). */
export const NOTE_KINDS: readonly NoteKind[] = ['intro', 'interest', 'fixed', 'minimum', 'results'];

/** The fixed plan's note stays up this many months after it clears (then the minimum's live line takes over). */
export const FIXED_HOLD = 12;

export interface NoteMarks {
  /** The first few months, while the regrowth is the thing to see. */
  interest: number;
  /** The fixed plan's payoff month. */
  fixed: number;
  /** A calm month in the long minimum stretch, on a whole year (the live line's month when none is given). */
  hold: number;
  /** The later payoff month: the whole timeline. */
  end: number;
}

/** The months the notes change at, from the engine. */
export function noteMarks(inputs: VineInputs): NoteMarks {
  const end = horizonMonths(inputs);
  const fixed = Math.min(end, planSchedule(inputs, 'fixed').payoffMonth);
  const interest = Math.min(3, fixed);
  const year = Math.round((fixed + 0.55 * (end - fixed)) / 12) * 12;
  const hold = Math.min(end, Math.max(fixed, year));
  return { interest, fixed, hold, end };
}

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
  /** True when the secondary line follows the clock (it is rewritten in place, without a crossfade). */
  live?: boolean;
}

/** "2 years, 10 months", or for a plan that never clears "still $4,000 owed after 60 years". */
function payoffClause(inputs: VineInputs, id: 'minimum' | 'fixed'): string {
  const s = planSchedule(inputs, id);
  return s.cleared ? formatDuration(s.payoffMonth) : `still ${formatCurrency(planSnapshot(inputs, id, s.payoffMonth).balance)} owed after ${formatDuration(s.payoffMonth)}`;
}

/** The live line in the minimum beat: "Year 12: $1,176 still owed." */
export function minimumLiveLine(inputs: VineInputs, months: number): string {
  const snap = planSnapshot(inputs, 'minimum', months);
  const year = yearLabel(statementMonth(months));
  return snap.paidOff ? `${year}: paid off.` : `${year}: ${formatCurrency(snap.owed)} still owed.`;
}

/** The results' second line: what the fixed plan saves ("A fixed $200 saves $6,350 and 16 years, 4 months."). */
function savingsLine(inputs: VineInputs): string {
  const min = planSchedule(inputs, 'minimum');
  const fixed = planSchedule(inputs, 'fixed');
  const pay = `A fixed ${formatMoney(inputs.fixedPayment)}`;
  // the difference of the two totals as shown, so the sum on screen adds up
  const saved = formatCurrency(Math.round(min.totalInterest) - Math.round(fixed.totalInterest));
  const sooner = min.payoffMonth - fixed.payoffMonth;
  const same = `${pay}: ${formatCurrency(fixed.totalInterest)} in interest.`;
  if (plansMatch(inputs) || !fixed.cleared) return same;
  if (!min.cleared) return `${pay} clears it in ${formatDuration(fixed.payoffMonth)}, with ${saved} less interest.`;
  if (saved === '$0') return sooner >= 1 ? `${pay} clears it ${formatDuration(sooner)} sooner.` : same;
  return sooner >= 1 ? `${pay} saves ${saved} and ${formatDuration(sooner)}.` : `${pay} saves ${saved}.`;
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function noteFor(kind: NoteKind, inputs: VineInputs, months?: number): Note {
  const m = noteMarks(inputs);
  switch (kind) {
    case 'intro':
      return {
        kind,
        primary: `Two cottages. The same ${formatCurrency(inputs.balance)} vine.`,
        secondary: inputs.apr > 0
          ? `Each vine is a credit card balance at ${formatPercent(inputs.apr)} a year.`
          : 'Each vine is a credit card balance with no interest at all.',
      };
    case 'interest':
      return inputs.apr > 0
        ? {
            kind,
            primary: 'Interest grows it back every month.',
            secondary: `About ${formatCurrency(firstInterest(inputs))} a month to start. Each clipping on the pile is interest paid.`,
          }
        : { kind, primary: 'With no interest, nothing grows back.', secondary: 'Every payment goes straight to the balance.' };
    case 'fixed': {
      if (plansMatch(inputs)) {
        return {
          kind,
          primary: `A fixed ${formatMoney(inputs.fixedPayment)} is no more than the minimum, so both pay the minimum.`,
          secondary: `The card asks for at least ${formatMoney(minimumDue(inputs.balance, inputs))} to start.`,
        };
      }
      const fixed = planSchedule(inputs, 'fixed');
      return {
        kind,
        primary: fixed.cleared
          ? `A fixed ${formatMoney(inputs.fixedPayment)} a month clears it in ${formatDuration(fixed.payoffMonth)}.`
          : `A fixed ${formatMoney(inputs.fixedPayment)} a month: ${payoffClause(inputs, 'fixed')}.`,
      };
    }
    case 'minimum': {
      const at = months ?? m.hold;
      return {
        kind,
        primary: 'Minimum payments trim a little. The vine keeps coming back.',
        secondary: minimumLiveLine(inputs, at),
        live: true,
      };
    }
    case 'results': {
      const min = planSchedule(inputs, 'minimum');
      return {
        kind,
        primary: `Minimum payments: ${payoffClause(inputs, 'minimum')} and ${formatCurrency(min.totalInterest)} in interest.`,
        secondary: savingsLine(inputs),
      };
    }
  }
}

/** Which note the month calls for. */
export function noteKindAt(months: number, inputs: VineInputs): NoteKind {
  const m = noteMarks(inputs);
  if (months >= m.end - 1e-6) return 'results';
  if (months < INTEREST_AT) return 'intro';
  if (months < m.interest) return 'interest';
  if (months < Math.min(m.fixed + FIXED_HOLD, m.end)) return 'fixed';
  return 'minimum';
}

/** The note for the month on the clock (its live line, if any, filled in for that month). */
export function noteAt(months: number, inputs: VineInputs): Note {
  return noteFor(noteKindAt(months, inputs), inputs, months);
}
