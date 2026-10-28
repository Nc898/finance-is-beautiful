/** Pure text helpers shared by the UI and tests. No DOM access. */
import {
  INTEREST_AT,
  LOANS,
  allLoans,
  formatCents,
  formatCurrency,
  formatDuration,
  formatRate,
  loanLetter,
  loanSchedule,
  loanTitle,
  loansMatch,
  shortAndLong,
  statementMonth,
  yearMonthLabel,
} from '../engine';
import type { BrickInputs, LoanId, LoanSnapshot } from '../engine';

/** "6.5% · $1,896 a month" */
export function termsLine(id: LoanId, inputs: BrickInputs): string {
  return `${formatRate(inputs.loans[id].apr)} · ${formatCurrency(loanSchedule(inputs, id).payment)} a month`;
}

/** "$217,677 still owed" or "Paid off in 15 years". */
export function owedText(snap: LoanSnapshot): string {
  return snap.paidOff ? `Paid off in ${formatDuration(snap.payoffMonth)}` : `${formatCurrency(snap.owed)} still owed`;
}

/** "$258,994 in interest" (interest charged so far). */
export function interestText(snap: LoanSnapshot): string {
  return `${formatCurrency(snap.interestCharged)} in interest`;
}

/** One sentence about a house, used by the hidden summary and scrub announcements. */
export function loanSentence(inputs: BrickInputs, snap: LoanSnapshot): string {
  return `Loan ${loanLetter(snap.id)}, the ${loanTitle(snap.id, inputs)}: ${owedText(snap)}, ${interestText(snap)}.`;
}

export interface DiffText {
  /** False before both houses have started (and for identical loans): the label is hidden. */
  show: boolean;
  label: string;
  value: string;
  /** Which loan is ahead (under the value while playing), or '' at the end. */
  sub: string;
  /** The end of the timeline: the difference is emphasized. */
  final: boolean;
}

/** The difference between the two labels: the interest saved so far, and at the end the whole saving. */
export function diffText(inputs: BrickInputs, months: number): DiffText {
  const hidden: DiffText = { show: false, label: '', value: '', sub: '', final: false };
  if (loansMatch(inputs) || months < INTEREST_AT) return hidden;
  const [a, b] = allLoans(inputs, months);
  const ia = Math.round(a.interestCharged);
  const ib = Math.round(b.interestCharged);
  const end = a.paidOff && b.paidOff;
  const { short } = shortAndLong(inputs);
  // the loan with less interest so far (ties go to the shorter one)
  const ahead: LoanId = ia === ib ? short : ia < ib ? 'a' : 'b';
  const value = formatCurrency(Math.abs(ia - ib));
  if (end) {
    if (ia === ib) return { show: true, label: 'The same interest', value: formatCurrency(ia), sub: '', final: true };
    return { show: true, label: `The ${loanTitle(ahead, inputs)} saves`, value, sub: '', final: true };
  }
  return { show: true, label: 'Interest saved so far', value, sub: ia === ib ? 'neither loan, yet' : `with the ${loanTitle(ahead, inputs)}`, final: false };
}

/** Text alternative for the whole scene at the current month. Updated on discrete changes only. */
export function sceneSummary(inputs: BrickInputs, months: number): string {
  const snaps = allLoans(inputs, months);
  const loans = LOANS.map((id) => `loan ${loanLetter(id)} for ${inputs.loans[id].years} years at ${formatRate(inputs.loans[id].apr)}`);
  const parts = [
    `Two brick houses going up side by side, each bought with ${formatCurrency(inputs.amount)} borrowed: ${loans.join(' and ')}. The pencil drawing is the part the lender still owns; the painted bricks are the part paid for. The interest goes to the lender in carts.`,
    `${yearMonthLabel(statementMonth(months))}.`,
    ...snaps.map((s) => loanSentence(inputs, s)),
  ];
  return parts.join(' ');
}

/** The short results sentence announced when inputs change. */
export function resultsSentence(inputs: BrickInputs): string {
  return LOANS.map((id) => {
    const s = loanSchedule(inputs, id);
    return `Loan ${loanLetter(id)}: ${formatCurrency(s.payment)} a month, ${formatCurrency(s.totalInterest)} in interest over ${formatDuration(s.months)}.`;
  }).join(' ');
}

/** Spoken after a scrub: "Year 5, month 3. Loan A, ..." */
export function scrubSentence(inputs: BrickInputs, months: number): string {
  const snaps = allLoans(inputs, months);
  return `${yearMonthLabel(statementMonth(months))}. ${snaps.map((s) => loanSentence(inputs, s)).join(' ')}`;
}

/* ---------------------------------------------------------------- how this is calculated */

/** The payment formula with its numbers: "$300,000 × 0.005417 ÷ (1 − 1.005417^−360) = $1,896.20". */
export function formulaText(id: LoanId, inputs: BrickInputs): string {
  const s = loanSchedule(inputs, id);
  const n = s.months;
  const r = inputs.loans[id].apr / 12;
  const amount = formatCurrency(inputs.amount);
  if (r === 0) return `${amount} ÷ ${n} = ${formatCents(s.payment)}`;
  const rText = r.toFixed(6).replace(/0+$/, '');
  return `${amount} × ${rText} ÷ (1 − ${(1 + r).toFixed(6).replace(/0+$/, '')}^−${n}) = ${formatCents(s.payment)}`;
}

/** "Month 233" for the crossover, or "From the first month" when principal leads from the start. */
export function crossoverText(id: LoanId, inputs: BrickInputs): string {
  const c = loanSchedule(inputs, id).crossoverMonth;
  if (c === null) return 'Never';
  if (c === 1) return 'From month 1';
  return `Month ${c} (${yearMonthLabel(c).toLowerCase()})`;
}

/** Which loan the label names first in the panel headings: "A · 30-year". */
export function headingText(id: LoanId, inputs: BrickInputs): string {
  return `${loanLetter(id)} · ${loanTitle(id, inputs)}`;
}

/* ---------------------------------------------------------------- timeline scale */

export interface ScaleTick {
  month: number;
  major: boolean;
  /** Present on the labelled ticks. */
  label?: string;
}

/**
 * Ticks for the timeline bar (positions in months). One tick a year, labelled in whole years every five years
 * (every year or two on short timelines, every ten on the longest). Under two years it counts months instead.
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
    const step = years <= 6 ? 1 : years <= 12 ? 2 : years <= 35 ? 5 : 10;
    for (let y = 0; y * 12 <= horizon; y++) {
      const labelled = y % step === 0;
      out.push({ month: y * 12, major: labelled, label: labelled ? String(y) : undefined });
    }
  }
  // a label that would crowd the very end of the bar gives way to it
  return out.map((t) => (t.label && t.month !== 0 && horizon - t.month > 0 && horizon - t.month < horizon * 0.04 ? { month: t.month, major: false } : t));
}
