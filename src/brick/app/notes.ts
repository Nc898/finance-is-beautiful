/**
 * The milestone notes: short captions tied to the MONTH, not to a scripted story. Whether the timeline is played or
 * dragged, the note shown is the one for the month on the clock. Pure functions of (months, inputs).
 *
 *   before the first payment              intro    the same home, two loans
 *   the first year                        early    early payments go mostly to interest
 *   until the shorter loan's crossover    more     the shorter loan costs more a month, so more builds the house
 *   until the shorter loan is paid off    carts    each cart is so much interest (interest so far, live)
 *   a year from that payoff               paid     the shorter loan's house is paid off; the other is so far built
 *   until the longer loan's crossover     free     no more payments: that frees so much a month
 *   until the end                         late     now most of each longer payment builds the house (owed, live)
 *   the end                               results  the interest on each, and what the shorter loan saved
 * The month marks come from the engine, so they follow the inputs; a note whose stretch is empty is skipped, so they
 * always come in this order. "Shorter" is by term, or by rate when the terms are equal; never assumed to be B.
 * Identical loans get one plain note throughout.
 */
import {
  INTEREST_AT,
  LOANS,
  cartDollars,
  formatCurrency,
  formatDuration,
  formatShare,
  horizonMonths,
  loanName,
  loanSchedule,
  loanSnapshot,
  loansMatch,
  shortAndLong,
  termsPhrase,
} from '../engine';
import type { BrickInputs, LoanId } from '../engine';

export type NoteKind = 'same' | 'intro' | 'early' | 'more' | 'carts' | 'paid' | 'free' | 'late' | 'results';

/** Every note, in timeline order (for measuring the tallest caption). */
export const NOTE_KINDS: readonly NoteKind[] = ['same', 'intro', 'early', 'more', 'carts', 'paid', 'free', 'late', 'results'];

/** The shorter loan's payoff note stays up this many months. */
export const PAID_HOLD = 12;

export interface NoteMarks {
  /** The end of the first year (or the shorter payoff, if sooner). */
  year: number;
  /** The shorter loan's crossover (most of a payment builds the house from here). */
  shortCross: number;
  /** The shorter loan's payoff. */
  shortPaid: number;
  /** A year after that payoff. */
  paidHold: number;
  /** The longer loan's crossover. */
  longCross: number;
  /** The longer term: the whole timeline. */
  end: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The months the notes change at, from the engine (non-decreasing, so the notes keep their order). */
export function noteMarks(inputs: BrickInputs): NoteMarks {
  const { short, long } = shortAndLong(inputs);
  const s = loanSchedule(inputs, short);
  const l = loanSchedule(inputs, long);
  const end = horizonMonths(inputs);
  const shortPaid = Math.min(end, s.months);
  const year = Math.min(12, shortPaid);
  const shortCross = clamp(s.crossoverMonth ?? shortPaid, year, shortPaid);
  const paidHold = Math.min(end, shortPaid + PAID_HOLD);
  const longCross = clamp(l.crossoverMonth ?? end, paidHold, end);
  return { year, shortCross, shortPaid, paidHold, longCross, end };
}

/* ---------------------------------------------------------------- captions */

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
  /** True when the secondary line follows the clock (it is rewritten in place, without a crossfade). */
  live?: boolean;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** "the 30-year loan", "the 6.5% loan" */
const theLoan = (id: LoanId, inputs: BrickInputs): string => `the ${loanName(id, inputs)} loan`;
/** "the 15-year house" */
const theHouse = (id: LoanId, inputs: BrickInputs): string => `the ${loanName(id, inputs)} house`;
/** "30-year", or "6.5% loan" when named by rate (so a bare number never stands alone). */
const shortLabel = (id: LoanId, inputs: BrickInputs): string =>
  inputs.loans.a.years === inputs.loans.b.years ? `${loanName(id, inputs)} loan` : loanName(id, inputs);

/** Whole dollars as shown on screen (so differences of shown amounts add up). */
const shown = (n: number): number => Math.round(n);

/** The live line while the carts roll: "Interest so far: 30-year $45,210, 15-year $31,870." */
export function interestLiveLine(inputs: BrickInputs, months: number): string {
  const parts = LOANS.map((id) => `${shortLabel(id, inputs)} ${formatCurrency(loanSnapshot(inputs, id, months).interestCharged)}`);
  return `Interest so far: ${parts.join(', ')}.`;
}

/** The live line near the end: "$96,912 still owed." on the longer loan. */
export function owedLiveLine(inputs: BrickInputs, months: number): string {
  const { long } = shortAndLong(inputs);
  const snap = loanSnapshot(inputs, long, months);
  return snap.paidOff ? 'Paid off.' : `${formatCurrency(snap.owed)} still owed.`;
}

/** "costs $595 more a month" (or less, or the same), the shorter loan against the longer. */
function monthlyCompare(inputs: BrickInputs, id: LoanId, other: LoanId): { diff: number; text: string } {
  const diff = shown(loanSchedule(inputs, id).payment) - shown(loanSchedule(inputs, other).payment);
  if (diff > 0) return { diff, text: `${formatCurrency(diff)} more a month` };
  if (diff < 0) return { diff, text: `${formatCurrency(-diff)} less a month` };
  return { diff, text: 'the same each month' };
}

/** The one note for two identical loans. */
function sameNote(inputs: BrickInputs): Note {
  const s = loanSchedule(inputs, 'a');
  return {
    kind: 'same',
    primary: 'The same loan twice: both houses go up together.',
    secondary: `${cap(termsPhrase('a', inputs))}, ${formatCurrency(s.payment)} a month.`,
  };
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function noteFor(kind: NoteKind, inputs: BrickInputs, months?: number): Note {
  if (kind === 'same' || loansMatch(inputs)) return sameNote(inputs);
  const m = noteMarks(inputs);
  const { short, long } = shortAndLong(inputs);
  const S = loanSchedule(inputs, short);
  const L = loanSchedule(inputs, long);
  switch (kind) {
    case 'intro':
      return {
        kind,
        primary: `The same ${formatCurrency(inputs.amount)} home. Two loans.`,
        secondary: `${cap(termsPhrase('a', inputs))}, or ${termsPhrase('b', inputs)}.`,
      };
    case 'early': {
      // the loan whose first payment is most interest
      const share = (id: LoanId) => {
        const r = loanSchedule(inputs, id).rows[0];
        return r && r.payment > 0 ? r.interest / r.payment : 0;
      };
      const id = share('a') >= share('b') ? 'a' : 'b';
      const first = loanSchedule(inputs, id).rows[0];
      if (!first || first.interest <= 0) {
        return { kind, primary: 'With no interest, every payment builds the house.', secondary: 'Not a single brick goes to the lender.' };
      }
      const of = `Of the first ${formatCurrency(first.payment)} on ${theLoan(id, inputs)}, ${formatCurrency(first.interest)} is interest.`;
      return share(id) >= 0.5
        ? { kind, primary: 'Early payments go mostly to interest.', secondary: of }
        : { kind, primary: 'Each payment is part interest, part house.', secondary: of };
    }
    case 'more': {
      const cmp = monthlyCompare(inputs, short, long);
      if (cmp.diff > 0) {
        return { kind, primary: `${cap(theLoan(short, inputs))} costs ${cmp.text}.`, secondary: 'So more of every payment builds the house.' };
      }
      return {
        kind,
        primary: cmp.diff < 0 ? `${cap(theLoan(short, inputs))} costs ${cmp.text}.` : `Both loans cost ${formatCurrency(S.payment)} a month.`,
        secondary: 'With its lower rate, more of each payment builds the house.',
      };
    }
    case 'carts': {
      if (S.totalInterest <= 0 && L.totalInterest <= 0) {
        return { kind, primary: 'With no interest, no cart ever fills.', secondary: 'Every payment goes into the house.' };
      }
      return {
        kind,
        primary: `Each cart carries ${formatCurrency(cartDollars(inputs))} of interest to the lender.`,
        secondary: interestLiveLine(inputs, months ?? m.shortCross),
        live: true,
      };
    }
    case 'paid': {
      const built = loanSnapshot(inputs, long, m.shortPaid).built;
      const toGo = L.months - S.months;
      return {
        kind,
        primary: `${cap(theHouse(short, inputs))} is paid off.`,
        secondary: `${cap(theHouse(long, inputs))} is ${formatShare(built)} built, with ${formatDuration(toGo)} to go.`,
      };
    }
    case 'free':
      return {
        kind,
        primary: `No more payments on ${theHouse(short, inputs)}.`,
        secondary: `That frees ${formatCurrency(S.payment)} a month.`,
      };
    case 'late':
      return {
        kind,
        primary: `Now most of each ${loanName(long, inputs)} payment builds the house.`,
        secondary: owedLiveLine(inputs, months ?? Math.round((m.longCross + m.end) / 2)),
        live: true,
      };
    case 'results': {
      const ia = loanSchedule(inputs, 'a').totalInterest;
      const ib = loanSchedule(inputs, 'b').totalInterest;
      if (ia <= 0 && ib <= 0) {
        return {
          kind,
          primary: 'No interest on either loan.',
          secondary: `${cap(theHouse(short, inputs))} was owned ${formatDuration(L.months - S.months)} sooner.`,
        };
      }
      const primary = `${shortLabel('a', inputs)}: ${formatCurrency(ia)} in interest. ${shortLabel('b', inputs)}: ${formatCurrency(ib)}.`;
      const saved = shown(L.totalInterest) - shown(S.totalInterest);
      if (saved === 0) return { kind, primary, secondary: 'The same interest either way.' };
      // the loan that paid less interest, and what it saved
      const winner = saved > 0 ? short : long;
      const loser = saved > 0 ? long : short;
      const cmp = monthlyCompare(inputs, winner, loser);
      const how = cmp.diff > 0 ? `, for ${cmp.text}` : cmp.diff < 0 ? `, and costs ${cmp.text}` : `, for the same payment`;
      return { kind, primary, secondary: `${cap(theLoan(winner, inputs))} saved ${formatCurrency(Math.abs(saved))}${how}.` };
    }
  }
}

/** Which note the month calls for. */
export function noteKindAt(months: number, inputs: BrickInputs): NoteKind {
  if (loansMatch(inputs)) return 'same';
  const m = noteMarks(inputs);
  if (months >= m.end - 1e-6) return 'results';
  if (months < INTEREST_AT) return 'intro';
  if (months < m.year) return 'early';
  if (months < m.shortCross) return 'more';
  if (months < m.shortPaid) return 'carts';
  if (months < m.paidHold) return 'paid';
  if (months < m.longCross) return 'free';
  return 'late';
}

/** The note for the month on the clock (its live line, if any, filled in for that month). */
export function noteAt(months: number, inputs: BrickInputs): Note {
  return noteFor(noteKindAt(months, inputs), inputs, months);
}
