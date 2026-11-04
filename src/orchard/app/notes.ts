/**
 * The milestone notes: short captions tied to the MONTH, not to a scripted story. Whether the timeline is played or
 * dragged, the note shown is the one for the month on the clock. Pure functions of (months, inputs).
 *
 *   before the first payday                  intro     the same pay, the same match
 *   the first year                           first     what each saves, and the match on it
 *   years 1 to 5                             branch    the free money left on the branch, and what B gives up for it
 *   until the growth passes what was put in  growing   every tree keeps growing (each value so far, live)
 *   until a year before the end              outweigh  the growth outweighs what was put in (left on the branch, live)
 *   the last year and the end                results   each value, and what the match alone grew to
 * The month marks come from the engine, so they follow the inputs; a note whose stretch is empty is skipped, so they
 * always come in this order. "Saves less" is never assumed to be A. Identical savings get one plain note throughout.
 */
import {
  CREDIT_AT,
  PICKERS,
  formatCurrency,
  formatPerDollar,
  formatRate,
  growthPassesMonth,
  horizonMonths,
  lessAndMore,
  matchOffered,
  pickerLetter,
  saveSchedule,
  saveSnapshot,
  savesMatch,
} from '../engine';
import type { OrchardInputs, PickerId } from '../engine';

export type NoteKind = 'same' | 'intro' | 'first' | 'branch' | 'growing' | 'outweigh' | 'results';

/** Every note, in timeline order (for measuring the tallest caption). */
export const NOTE_KINDS: readonly NoteKind[] = ['same', 'intro', 'first', 'branch', 'growing', 'outweigh', 'results'];

/** The free money note stays up until this month (the end of year 5). */
export const BRANCH_UNTIL = 60;

export interface NoteMarks {
  /** The end of the first year. */
  year: number;
  /** The end of year 5. */
  branch: number;
  /** The growth passes what was put in. */
  pass: number;
  /** A year before the end: the results from here (only at the very end on timelines under two years). */
  results: number;
  /** The whole timeline. */
  end: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The months the notes change at, from the engine (non-decreasing, so the notes keep their order). */
export function noteMarks(inputs: OrchardInputs): NoteMarks {
  const end = horizonMonths(inputs);
  const results = end >= 24 ? end - 12 : end;
  const year = Math.min(12, results);
  const branch = clamp(BRANCH_UNTIL, year, results);
  const pass = clamp(growthPassesMonth(inputs) ?? results, branch, results);
  return { year, branch, pass, results, end };
}

/* ---------------------------------------------------------------- captions */

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
  /** True when the secondary line follows the clock (it is rewritten in place, without a crossfade). */
  live?: boolean;
}

const L = pickerLetter;
/** Whole dollars as shown on screen (so differences of shown amounts add up). */
const shown = (n: number): number => Math.round(n);
const usd = (n: number): string => formatCurrency(shown(n));

/** "So far: A $16,108, B $32,217." */
export function valuesLiveLine(inputs: OrchardInputs, months: number): string {
  const parts = PICKERS.map((id) => `${L(id)} ${usd(saveSnapshot(inputs, id, months).valueShown)}`);
  return `So far: ${parts.join(', ')}.`;
}

/** "Left on the branch so far: $13,500. Grown, it would be $26,000." (or both pickers' amounts, or the values). */
export function branchLiveLine(inputs: OrchardInputs, months: number): string {
  const missers = PICKERS.filter((id) => saveSchedule(inputs, id).missedMonthly > 0);
  if (missers.length === 0) return valuesLiveLine(inputs, months);
  if (missers.length === 2) {
    const parts = PICKERS.map((id) => `${L(id)} ${usd(saveSnapshot(inputs, id, months).missedShown)}`);
    return `Left on the branch so far: ${parts.join(', ')}.`;
  }
  const s = saveSnapshot(inputs, missers[0], months);
  return `Left on the branch so far: ${usd(s.missedShown)}. Grown, it would be ${usd(s.missedValueShown)}.`;
}

/** The one note for two pickers saving the same. */
function sameNote(inputs: OrchardInputs): Note {
  const s = saveSchedule(inputs, 'a');
  let secondary: string;
  if (!(s.ownMonthly > 0)) secondary = 'Neither saves anything, so both orchards stay empty.';
  else if (s.matchMonthly > 0) secondary = `Each saves ${usd(s.ownMonthly)} a month, plus ${usd(s.matchMonthly)} free.`;
  else secondary = `Each saves ${usd(s.ownMonthly)} a month.`;
  return { kind: 'same', primary: 'The same savings twice: both orchards grow alike.', secondary };
}

/** "B saves $150 more a month, so takes home $150 less." */
function takeHome(inputs: OrchardInputs, less: PickerId, more: PickerId): string {
  const d = usd(saveSchedule(inputs, more).ownMonthly - saveSchedule(inputs, less).ownMonthly);
  return `${L(more)} saves ${d} more a month, so takes home ${d} less.`;
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function noteFor(kind: NoteKind, inputs: OrchardInputs, months?: number): Note {
  if (kind === 'same' || savesMatch(inputs)) return sameNote(inputs);
  const m = noteMarks(inputs);
  const { less, more } = lessAndMore(inputs);
  const S = { a: saveSchedule(inputs, 'a'), b: saveSchedule(inputs, 'b') };
  const offered = matchOffered(inputs);
  switch (kind) {
    case 'intro':
      if (!offered) return { kind, primary: 'The same pay.', secondary: 'No match here: only the saving differs.' };
      return {
        kind,
        primary: 'The same pay. The same match.',
        secondary: `Work adds ${formatPerDollar(inputs.match.rate)} for every $1 saved, up to ${formatRate(inputs.match.limit)} of pay.`,
      };
    case 'first': {
      const sum = (id: PickerId, first: boolean) => {
        const s = S[id];
        const own = `${usd(s.ownMonthly)}${first ? ' a month' : ''}`;
        return s.matchMonthly > 0 ? `${own}, plus ${usd(s.matchMonthly)} free` : own;
      };
      // one picker saves nothing (it can only be the one saving less)
      if (!(S[less].ownMonthly > 0)) {
        const rate = formatRate(inputs.save[more]);
        if (!offered) return { kind, primary: `${L(less)} saves nothing. ${L(more)} saves ${rate} of pay.`, secondary: `${L(more)}: ${sum(more, true)}.` };
        return { kind, primary: `${L(less)} saves nothing, so ${L(less)} gets no match.`, secondary: `${L(more)} saves ${rate} of pay: ${sum(more, true)}.` };
      }
      return {
        kind,
        primary: `A saves ${formatRate(inputs.save.a)} of pay. B saves ${formatRate(inputs.save.b)}.`,
        secondary: `A: ${sum('a', true)}. B: ${sum('b', false)}.`,
      };
    }
    case 'branch': {
      if (!offered) return { kind, primary: 'No match here: only the saving differs.', secondary: takeHome(inputs, less, more) };
      if (!(S[less].missedMonthly > 0)) return { kind, primary: 'Both save enough for the whole match.', secondary: takeHome(inputs, less, more) };
      const d = usd(S[more].ownMonthly - S[less].ownMonthly);
      const dm = usd(S[more].matchMonthly - S[less].matchMonthly);
      return {
        kind,
        primary: `${L(less)} leaves ${usd(S[less].missedMonthly)} a month of free money on the branch.`,
        secondary: `${L(more)} takes home ${d} less a month, and gets ${dm} more free.`,
      };
    }
    case 'growing':
      return {
        kind,
        primary: inputs.growth > 0 ? 'Every tree keeps growing.' : 'With no growth, the trees hold only what is put in.',
        secondary: valuesLiveLine(inputs, months ?? m.branch),
        live: true,
      };
    case 'outweigh':
      return {
        kind,
        primary: 'Now the growth outweighs everything put in.',
        secondary: branchLiveLine(inputs, months ?? m.pass),
        live: true,
      };
    case 'results': {
      const primary = `A: ${usd(S.a.finalValue)}. B: ${usd(S.b.finalValue)}.`;
      if (!offered) {
        const ahead = shown(S[more].finalValue) - shown(S[less].finalValue);
        const d = usd(S[more].ownMonthly - S[less].ownMonthly);
        return { kind, primary, secondary: `${L(more)} ends ${usd(ahead)} ahead, from saving ${d} more a month.` };
      }
      const grew = (id: PickerId) => {
        const rows = saveSchedule(inputs, id).rows;
        return usd(rows.length ? rows[rows.length - 1].matchValue : 0);
      };
      if (!(S[less].matchTotal > 0)) {
        return { kind, primary, secondary: `The match alone grew to ${grew(more)} for ${L(more)}. ${L(less)} got none.` };
      }
      return { kind, primary, secondary: `The match alone grew to ${grew('a')} for A and ${grew('b')} for B.` };
    }
  }
}

/** Which note the month calls for. */
export function noteKindAt(months: number, inputs: OrchardInputs): NoteKind {
  if (savesMatch(inputs)) return 'same';
  const m = noteMarks(inputs);
  if (months >= m.results - 1e-6) return 'results';
  if (months < CREDIT_AT) return 'intro';
  if (months < m.year) return 'first';
  if (months < m.branch) return 'branch';
  if (months < m.pass) return 'growing';
  return 'outweigh';
}

/** The note for the month on the clock (its live line, if any, filled in for that month). */
export function noteAt(months: number, inputs: OrchardInputs): Note {
  return noteFor(noteKindAt(months, inputs), inputs, months);
}
