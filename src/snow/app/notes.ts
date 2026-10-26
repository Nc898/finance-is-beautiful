/**
 * The milestone notes: short captions tied to the MONTH, not to a scripted story. Whether the timeline is played or
 * dragged, the note shown is the one for the month on the clock, so the key moments (the first win, the costliest debt
 * cleared, the result) are explained whenever the viewer reaches them. Pure functions of (months, inputs).
 *
 *   before the first interest   intro      three debts, the same budget, the two orders
 *   until the first clear       interest   snow settling on them, most on the highest rate
 *   a few months after it       win        who cleared what first, and where its payment rolls on to
 *   until the top-rate clear    push       the interest so far on each hill, live
 *   until the end               top        the avalanche's costliest debt is gone
 *   the end                     results    the interest on each hill, and whose first win came sooner
 * The month marks come from the engine, so they follow the inputs.
 */
import {
  DEBTS,
  DEBT_NAME,
  MAX_MONTHS,
  STRATEGIES,
  STRATEGY_NAME,
  allStrategies,
  firstInterest,
  formatCurrency,
  formatDuration,
  formatMoney,
  formatPercent,
  hillsMatch,
  horizonMonths,
  INTEREST_AT,
  strategySchedule,
} from '../engine';
import type { DebtId, SnowInputs, StrategyId } from '../engine';

export type NoteKind = 'intro' | 'interest' | 'win' | 'push' | 'top' | 'results';

/** Every note, in timeline order (for measuring the tallest caption). */
export const NOTE_KINDS: readonly NoteKind[] = ['intro', 'interest', 'win', 'push', 'top', 'results'];

/** The first-win note stays up this many months after the clear (then the live interest line takes over). */
export const WIN_HOLD = 3;

export interface NoteMarks {
  /** The first few months, while the snow settling is the thing to see. */
  interest: number;
  /** The first clear on either hill (the first win). */
  win: number;
  /** The other hill's first clear (the later of the two first wins). */
  other: number;
  /** The avalanche's highest-rate debt is cleared. */
  top: number;
  /** The later payoff month: the whole timeline. */
  end: number;
  /** A calm month in the long stretch, on a whole year (the live interest line's month when none is given). */
  hold: number;
}

/** The months the notes change at, from the engine. */
export function noteMarks(inputs: SnowInputs): NoteMarks {
  const snow = strategySchedule(inputs, 'snowball');
  const av = strategySchedule(inputs, 'avalanche');
  const end = horizonMonths(inputs);
  const winS = snow.firstWin ?? end;
  const winA = av.firstWin ?? end;
  const win = Math.min(winS, winA);
  const other = Math.max(winS, winA);
  const topAt = av.clearedAt[av.order[0]] ?? end;
  const top = Math.min(end, Math.max(other, topAt));
  const interest = Math.min(3, win);
  const year = Math.round((win + other) / 2 / 12) * 12;
  const hold = Math.min(other, Math.max(win, year || Math.round((win + other) / 2)));
  return { interest, win, other, top, end, hold };
}

/* ---------------------------------------------------------------- captions */

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
  /** True when the secondary line follows the clock (it is rewritten in place, without a crossfade). */
  live?: boolean;
}

/** The sentence both hills share when they do exactly the same thing. */
export const SAME_ORDER = 'With these debts both orders are the same.';

const the = (d: DebtId): string => `the ${DEBT_NAME[d]}`;
const plainMonths = (n: number): string => `${n} ${n === 1 ? 'month' : 'months'}`;

/** The debts a strategy cleared in a given month, in lane order. */
function clearedIn(inputs: SnowInputs, id: StrategyId, month: number): DebtId[] {
  const s = strategySchedule(inputs, id);
  return DEBTS.filter((d) => s.clearedAt[d] === month);
}

/** The debt that gets the extra the month after `month` (where a freed payment rolls on), or null if none is left. */
function rollsOnTo(inputs: SnowInputs, id: StrategyId, month: number): DebtId | null {
  const s = strategySchedule(inputs, id);
  return s.rows[month]?.target ?? null;
}

/** The live line in the push beat: "Interest so far: snowball $3,311, avalanche $2,937." */
export function interestLiveLine(inputs: SnowInputs, months: number): string {
  const [snow, av] = allStrategies(inputs, months);
  if (hillsMatch(inputs)) return `Interest so far: ${formatCurrency(snow.interestCharged)} on each hill.`;
  return `Interest so far: snowball ${formatCurrency(snow.interestCharged)}, avalanche ${formatCurrency(av.interestCharged)}.`;
}

/** "The first win" caption: who clears what first, and where its payment goes. */
function winCaption(inputs: SnowInputs): Note {
  const m = noteMarks(inputs);
  const snow = strategySchedule(inputs, 'snowball');
  const av = strategySchedule(inputs, 'avalanche');
  if (snow.firstWin === null && av.firstWin === null) {
    return { kind: 'win', primary: `No debt is cleared in ${formatDuration(MAX_MONTHS)}.`, secondary: 'A little more each month makes a big difference.' };
  }
  const winners = STRATEGIES.filter((id) => strategySchedule(inputs, id).firstWin === m.win);
  const cleared = winners.map((id) => clearedIn(inputs, id, m.win));
  const same = winners.length === 2 && cleared[0].join() === cleared[1].join();
  const subject = winners.length === 1 ? STRATEGY_NAME[winners[0]] : hillsMatch(inputs) || same ? 'Both hills' : 'Each hill';
  const verb = subject.endsWith('hills') ? 'clear' : 'clears';
  const what = winners.length === 1 || same ? cleared[0].map(the).join(' and ') : 'a debt';
  const when = formatDuration(m.win);
  const freed = cleared[0].reduce((sum, d) => sum + inputs.debts[d].minPayment, 0);
  const nexts = winners.map((id) => rollsOnTo(inputs, id, m.win));
  const nextSame = nexts.every((n) => n === nexts[0]);
  const its = (winners.length === 2 && !same) || cleared[0].length > 1 ? 'Their' : 'Its';
  let roll: string;
  if (nexts.every((n) => n === null)) roll = 'That is every debt.';
  else if (winners.length === 2 && !same) roll = 'The freed payments roll on to the next debts.';
  else if (nextSame && nexts[0]) roll = `${its} ${formatMoney(freed)} ${its === 'Their' ? 'roll' : 'rolls'} on to ${the(nexts[0])}.`;
  else roll = 'The freed payment rolls on to the next debt.';
  const lead = m.win <= 12 ? 'A quick win. ' : 'The first win. ';
  if (hillsMatch(inputs)) {
    return { kind: 'win', primary: SAME_ORDER, secondary: `Both clear ${what} in ${when}. ${roll}` };
  }
  return { kind: 'win', primary: `${subject} ${verb} ${what} in ${when}.`, secondary: `${lead}${roll}` };
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function noteFor(kind: NoteKind, inputs: SnowInputs, months?: number): Note {
  const m = noteMarks(inputs);
  const snow = strategySchedule(inputs, 'snowball');
  const av = strategySchedule(inputs, 'avalanche');
  const match = hillsMatch(inputs);
  switch (kind) {
    case 'intro':
      return {
        kind,
        primary: `Three debts. The same ${formatMoney(inputs.budget)} a month.`,
        secondary: 'Snowball rolls the smallest away first. Avalanche, the highest rate.',
      };
    case 'interest': {
      if (DEBTS.every((d) => inputs.debts[d].apr === 0)) {
        return { kind, primary: 'With no interest, nothing settles on them.', secondary: 'Every payment goes straight to the balance.' };
      }
      const byInterest = [...DEBTS].sort((a, b) => firstInterest(inputs.debts[b]) - firstInterest(inputs.debts[a]));
      const most = byInterest[0];
      const least = byInterest[byInterest.length - 1];
      const mostText = `Most on the ${DEBT_NAME[most]} at ${formatPercent(inputs.debts[most].apr)}.`;
      const leastText =
        inputs.debts[least].apr === 0
          ? `None on the 0% ${DEBT_NAME[least]}.`
          : `Least on the ${DEBT_NAME[least]} at ${formatPercent(inputs.debts[least].apr)}.`;
      return { kind, primary: 'Interest settles on them every month.', secondary: `${mostText} ${leastText}` };
    }
    case 'win':
      return winCaption(inputs);
    case 'push': {
      const topDebt = av.order[0];
      const topApr = inputs.debts[topDebt].apr;
      const stillPushing = (av.clearedAt[topDebt] ?? m.end) > m.other;
      const live = interestLiveLine(inputs, months ?? m.hold);
      if (match) return { kind, primary: 'Both hills keep rolling the same way.', secondary: live, live: true };
      return {
        kind,
        primary: stillPushing
          ? `Avalanche keeps pushing ${the(topDebt)}${topApr > 0 ? ` at ${formatPercent(topApr)}` : ''}.`
          : 'Both hills keep rolling their snow down.',
        secondary: live,
        live: true,
      };
    }
    case 'top': {
      const topDebt = av.order[0];
      const at = av.clearedAt[topDebt];
      if (match) {
        const first = at === null ? 'a debt' : the(topDebt);
        return { kind, primary: at === null ? 'Both hills keep going.' : `Both hills clear ${first} in ${formatDuration(at)}.`, secondary: 'The same debts, in the same order.' };
      }
      if (at === null) return { kind, primary: `Avalanche is still working on ${the(topDebt)}.`, secondary: 'Every payment still counts.' };
      return {
        kind,
        primary: `Avalanche clears ${the(topDebt)} in ${formatDuration(at)}.`,
        secondary:
          inputs.debts[topDebt].apr > 0
            ? 'The costliest debt is gone, so every dollar goes further.'
            : 'With no interest on it, only the timing changes.',
      };
    }
    case 'results': {
      const sInt = formatCurrency(snow.totalInterest);
      const aInt = formatCurrency(av.totalInterest);
      if (match) return { kind, primary: `Both hills: ${sInt} in interest.`, secondary: SAME_ORDER };
      let primary: string;
      if (sInt === aInt) primary = `Both hills pay ${sInt} in interest.`;
      else if (av.totalInterest < snow.totalInterest) primary = `Avalanche: ${aInt} in interest. Snowball: ${sInt}.`;
      else primary = `Snowball: ${sInt} in interest. Avalanche: ${aInt}.`;
      let secondary: string;
      if (snow.firstWin !== null && av.firstWin !== null) {
        const d = av.firstWin - snow.firstWin;
        if (d > 0) secondary = `Snowball's first win came ${plainMonths(d)} sooner.`;
        else if (d < 0) secondary = `Avalanche's first win came ${plainMonths(-d)} sooner.`;
        else secondary = `Both had their first win in month ${snow.firstWin}.`;
      } else if (snow.firstWin !== null) secondary = `Snowball's first win came in month ${snow.firstWin}.`;
      else if (av.firstWin !== null) secondary = `Avalanche's first win came in month ${av.firstWin}.`;
      else secondary = 'Neither hill has had a first win yet.';
      return { kind, primary, secondary };
    }
  }
}

/** Which note the month calls for. */
export function noteKindAt(months: number, inputs: SnowInputs): NoteKind {
  const m = noteMarks(inputs);
  if (months >= m.end - 1e-6) return 'results';
  if (months < INTEREST_AT) return 'intro';
  if (months < m.win) return 'interest';
  if (months < Math.min(m.win + WIN_HOLD, m.top)) return 'win';
  if (months < m.top) return 'push';
  return 'top';
}

/** The note for the month on the clock (its live line, if any, filled in for that month). */
export function noteAt(months: number, inputs: SnowInputs): Note {
  return noteFor(noteKindAt(months, inputs), inputs, months);
}
