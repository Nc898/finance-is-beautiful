/**
 * The milestone notes: short captions tied to the YEAR on the clock, not to a scripted story. Whether the timeline is
 * played or dragged, the note shown is the one for that moment. Pure functions of (years, inputs).
 *
 *   at the start              intro     three boats, the same money
 *   the first year            current   prices rise a little every year: that is the current
 *   to a fifth of the way     cash      cash doesn't row; it drifts
 *   to about halfway          savings   a savings account rows, faster or slower than the current
 *   to the end                invest    investing rows harder than the current
 *   the end                   results   what each boat is worth in today's dollars
 * The marks follow the inputs (the number of years).
 */
import { allBoats, buysToday, formatCurrency, formatPercent } from '../engine';
import type { RiverInputs } from '../engine';

export type NoteKind = 'intro' | 'current' | 'cash' | 'savings' | 'invest' | 'results';

/** Every note, in timeline order (for measuring the tallest caption). */
export const NOTE_KINDS: readonly NoteKind[] = ['intro', 'current', 'cash', 'savings', 'invest', 'results'];

/** The opening note shows only at the very start (the current takes over as soon as the water moves). */
const START = 0.04;

/** The whole-year marks the notes change at: the end of the "current", "cash" and "savings" notes. */
export function noteYearMarks(inputs: RiverInputs): { current: number; cash: number; savings: number; end: number } {
  const end = inputs.years;
  const current = Math.min(1, end);
  const cash = Math.min(end, Math.max(current, Math.round(end * 0.2)));
  const savings = Math.min(end, Math.max(cash, Math.round(end * (14 / 30))));
  return { current, cash, savings, end };
}

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
}

/** How a rate compares with inflation. */
function versus(rate: number, inflation: number): 'ahead' | 'level' | 'behind' {
  const d = Math.log1p(rate) - Math.log1p(inflation);
  if (Math.abs(d) < 1e-9) return 'level';
  return d > 0 ? 'ahead' : 'behind';
}

function nominalAndReal(inputs: RiverInputs, id: 'cash' | 'savings' | 'invest', years: number): string {
  const s = allBoats(inputs, years)[id === 'cash' ? 0 : id === 'savings' ? 1 : 2];
  return `${formatCurrency(s.nominal)} ${buysToday(s.real)}`;
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function noteFor(kind: NoteKind, inputs: RiverInputs): Note {
  const m = noteYearMarks(inputs);
  const i = inputs.inflation;
  switch (kind) {
    case 'intro':
      return {
        kind,
        primary: `Three boats. The same ${formatCurrency(inputs.start)}.`,
        secondary: 'Cash, a savings account, and investing.',
      };
    case 'current':
      return i > 0
        ? { kind, primary: "Prices rise a little every year. That's the current.", secondary: `Here, about ${formatPercent(i)} a year.` }
        : { kind, primary: 'In this river, prices hold steady.', secondary: 'With no inflation there is no current: the water is still.' };
    case 'cash':
      return {
        kind,
        primary: i > 0 ? "Cash doesn't row. It drifts." : "Cash doesn't row, but still water keeps it in place.",
        secondary: `By year ${m.cash}, ${formatCurrency(inputs.start)} in cash ${buysToday(allBoats(inputs, m.cash)[0].real)}.`,
      };
    case 'savings': {
      const v = versus(inputs.savingsRate, i);
      const primary =
        inputs.savingsRate <= 0
          ? 'This savings account earns nothing, so it drifts like cash.'
          : v === 'ahead'
            ? 'A savings account rows faster than the current here, so it makes headway.'
            : v === 'level'
              ? 'A savings account rows exactly as fast as the current, so it holds its place.'
              : 'A savings account rows, but slower than the current.';
      return { kind, primary, secondary: `By year ${m.savings}, ${nominalAndReal(inputs, 'savings', m.savings)}.` };
    }
    case 'invest': {
      const v = versus(inputs.investRate, i);
      const primary =
        inputs.investRate < 0
          ? 'Here investing loses value each year, so it drifts faster than cash.'
          : inputs.investRate === 0
            ? 'With no return, investing drifts just like cash.'
            : v === 'ahead'
              ? 'Investing has to row harder than the current to make headway.'
              : v === 'level'
                ? 'Investing only matches the current here, so it holds its place.'
                : 'Even investing rows slower than the current here.';
      return { kind, primary, secondary: `By year ${m.end}, ${nominalAndReal(inputs, 'invest', m.end)}.` };
    }
    case 'results': {
      const [cash, savings, invest] = allBoats(inputs, m.end);
      const cashLine =
        i > 0
          ? `Still ${formatCurrency(cash.nominal)} in cash. It ${buysToday(cash.real)}.`
          : `Still ${formatCurrency(cash.nominal)} in cash. With no inflation, it buys just what it did.`;
      // the boat labels already carry each boat's dollars, so the caption keeps to buying power, on one short line
      return {
        kind,
        primary: cashLine,
        secondary: `In today's dollars, savings is worth ${formatCurrency(savings.real)} and investing ${formatCurrency(invest.real)}.`,
      };
    }
  }
}

/** Which note the year calls for. */
export function noteKindAt(years: number, inputs: RiverInputs): NoteKind {
  const m = noteYearMarks(inputs);
  if (years >= m.end - 1e-6) return 'results';
  if (years < Math.min(START, m.end / 2)) return 'intro';
  if (years < m.current) return 'current';
  if (years < m.cash) return 'cash';
  if (years < m.savings) return 'savings';
  return 'invest';
}

/** The note for the year on the clock. */
export function noteAt(years: number, inputs: RiverInputs): Note {
  return noteFor(noteKindAt(years, inputs), inputs);
}

