/** Pure text helpers shared by the UI and tests. No DOM access. */
import {
  DEBTS,
  DEBT_NAME,
  STRATEGIES,
  STRATEGY_LABEL,
  allStrategies,
  extraAboveMinimums,
  formatCurrency,
  formatDuration,
  formatMoney,
  formatPercent,
  statementMonth,
  strategySchedule,
  sumMinimums,
  yearMonthLabel,
} from '../engine';
import type { SnowInputs, StrategySnapshot } from '../engine';

/** "$13,970 still owed" or "Debt-free in 2 years, 8 months". */
export function owedText(snap: StrategySnapshot): string {
  return snap.paidOff ? `Debt-free in ${formatDuration(snap.payoffMonth)}` : `${formatCurrency(snap.owed)} still owed`;
}

/** "$3,311 in interest" (interest charged so far). */
export function interestText(snap: StrategySnapshot): string {
  return `${formatCurrency(snap.interestCharged)} in interest`;
}

/** One sentence about a hill, used by the hidden summary and scrub announcements. */
export function hillSentence(snap: StrategySnapshot): string {
  return `${STRATEGY_LABEL[snap.id]}: ${owedText(snap)}, ${interestText(snap)}.`;
}

/** The three debts in a phrase: "a $1,000 medical bill at no interest, a $6,000 car loan at 6% a year and ...". */
function debtsPhrase(inputs: SnowInputs): string {
  const parts = DEBTS.map((d) => {
    const x = inputs.debts[d];
    const rate = x.apr > 0 ? `${formatPercent(x.apr)} a year` : 'no interest';
    return `a ${formatCurrency(x.balance)} ${d === 'card' ? 'credit card' : DEBT_NAME[d]} at ${rate}`;
  });
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Text alternative for the whole scene at the current month. Updated on discrete changes only. */
export function sceneSummary(inputs: SnowInputs, months: number): string {
  const snaps = allStrategies(inputs, months);
  const parts = [
    `Two snowy hillsides, each with the same three debts as snowballs: ${debtsPhrase(inputs)}, paid from the same ${formatMoney(inputs.budget)} a month. The size of a snowball is what is still owed; snow settling on it is interest.`,
    `${yearMonthLabel(statementMonth(months))}.`,
    ...snaps.map(hillSentence),
  ];
  return parts.join(' ');
}

/** The short results sentence announced when inputs change. */
export function resultsSentence(inputs: SnowInputs): string {
  const parts = STRATEGIES.map((id) => {
    const s = strategySchedule(inputs, id);
    const when = s.cleared ? formatDuration(s.payoffMonth) : `still owed after ${formatDuration(s.payoffMonth)}`;
    return `${STRATEGY_LABEL[id]}: ${when} and ${formatCurrency(s.totalInterest)} in interest.`;
  });
  return parts.join(' ');
}

/** Spoken after a scrub: "Year 1, month 0. Snowball: ..." */
export function scrubSentence(inputs: SnowInputs, months: number): string {
  const snaps = allStrategies(inputs, months);
  return `${yearMonthLabel(statementMonth(months))}. ${snaps.map(hillSentence).join(' ')}`;
}

/** The note under the budget: what is left once the minimums are paid. */
export function budgetNote(inputs: SnowInputs): string {
  const sum = sumMinimums(inputs);
  const extra = extraAboveMinimums(inputs);
  if (extra <= 0) return `The three minimums are ${formatMoney(sum)}, so nothing is left over at first. Each cleared debt's payment still rolls on.`;
  return `The three minimums are ${formatMoney(sum)}, so ${formatMoney(extra)} a month is left to roll toward the target.`;
}

/* ---------------------------------------------------------------- timeline scale */

export interface ScaleTick {
  month: number;
  major: boolean;
  /** Present on the labelled ticks. */
  label?: string;
}

/**
 * Ticks for the timeline bar (positions in months). Normally one tick a year, labelled in whole years every
 * 1, 2, 5 or 10 years so about six labels fit. Under two years it counts months instead (labelled every 3).
 */
export function timelineTicks(horizon: number): ScaleTick[] {
  if (horizon <= 0) return [{ month: 0, major: true, label: '0' }];
  const out: ScaleTick[] = [];
  if (horizon < 24) {
    for (let m = 0; m <= horizon; m++) {
      const labelled = m % 3 === 0;
      out.push({ month: m, major: labelled, label: labelled ? `${m} mo` : undefined });
    }
  } else {
    const years = horizon / 12;
    const step = years <= 6 ? 1 : years <= 12 ? 2 : years <= 30 ? 5 : 10;
    for (let y = 0; y * 12 <= horizon; y++) {
      const labelled = y % step === 0;
      out.push({ month: y * 12, major: labelled, label: labelled ? String(y) : undefined });
    }
  }
  // a label that would crowd the very end of the bar gives way to it
  return out.map((t) => (t.label && t.month !== 0 && horizon - t.month > 0 && horizon - t.month < horizon * 0.04 ? { month: t.month, major: false } : t));
}
