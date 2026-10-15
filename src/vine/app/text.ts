/** Pure text helpers shared by the UI and tests. No DOM access. */
import {
  PLANS,
  allPlans,
  formatCurrency,
  formatDuration,
  formatMoney,
  formatPercent,
  minimumDue,
  planName,
  planSchedule,
  plansMatch,
  yearMonthLabel,
} from '../engine';
import type { PlanSnapshot, VineInputs } from '../engine';

/** "$2,736 still owed" or "Paid off in 2 years, 10 months". */
export function owedText(snap: PlanSnapshot): string {
  return snap.paidOff ? `Paid off in ${formatDuration(snap.payoffMonth)}` : `${formatCurrency(snap.balance)} still owed`;
}

/** "$4,412 in interest" (interest paid so far). */
export function interestText(snap: PlanSnapshot): string {
  return `${formatCurrency(snap.interestPaid)} in interest`;
}

/** One sentence about a cottage, used by the hidden summary and scrub announcements. */
export function planSentence(inputs: VineInputs, snap: PlanSnapshot): string {
  return `${planName(snap.id, inputs)}: ${owedText(snap)}, ${interestText(snap)}.`;
}

/** Text alternative for the whole scene at the current month. Updated on discrete changes only. */
export function sceneSummary(inputs: VineInputs, months: number): string {
  const snaps = allPlans(inputs, months);
  const rate = inputs.apr > 0 ? `${formatPercent(inputs.apr)} a year` : 'no interest';
  const parts = [
    `Two cottages with autumn vines, each the same ${formatCurrency(inputs.balance)} card balance at ${rate}. The vine on the wall is what is still owed; the pile of clippings is the interest paid.`,
    `${yearMonthLabel(months)}.`,
    ...snaps.map((s) => planSentence(inputs, s)),
  ];
  return parts.join(' ');
}

/** The short results sentence announced when inputs change. */
export function resultsSentence(inputs: VineInputs): string {
  const parts = PLANS.map((id) => {
    const s = planSchedule(inputs, id);
    const when = s.cleared ? formatDuration(s.payoffMonth) : `still owed after ${formatDuration(s.payoffMonth)}`;
    return `${planName(id, inputs)}: ${when} and ${formatCurrency(s.totalInterest)} in interest.`;
  });
  return parts.join(' ');
}

/** Spoken after a scrub: "Year 5, month 3. Minimum payments: ..." */
export function scrubSentence(inputs: VineInputs, months: number): string {
  const snaps = allPlans(inputs, months);
  return `${yearMonthLabel(months)}. ${snaps.map((s) => planSentence(inputs, s)).join(' ')}`;
}

/** The note under the fixed payment field when it is under the card's first minimum (the card takes the minimum). */
export function fixedNote(inputs: VineInputs): string {
  const due = minimumDue(inputs.balance, inputs);
  if (inputs.fixedPayment >= due) return '';
  const ask = `The card asks for at least ${formatMoney(due)} to start`;
  return plansMatch(inputs) ? `${ask}, so both pay the minimum.` : `${ask}, so the fixed plan pays that at first.`;
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
