/** Pure text helpers shared by the UI and tests. No DOM access. */
import {
  CREDIT_AT,
  PICKERS,
  allPickers,
  formatCents,
  formatCurrency,
  formatDuration,
  formatRate,
  matchOffered,
  pickerLetter,
  saveSchedule,
  savesMatch,
  statementMonth,
  yearMonthLabel,
} from '../engine';
import type { OrchardInputs, PickerId, SaveSnapshot } from '../engine';

/** "Saves 3%" */
export function savesText(id: PickerId, inputs: OrchardInputs): string {
  return `Saves ${formatRate(inputs.save[id])}`;
}

/** "$150 a month + $75 match", "$150 a month" (no match on offer), "$0 a month, no match" (saving nothing). */
export function termsLine(id: PickerId, inputs: OrchardInputs): string {
  const s = saveSchedule(inputs, id);
  const own = `${formatCurrency(s.ownMonthly)} a month`;
  if (!matchOffered(inputs)) return own;
  if (!(s.matchMonthly > 0)) return `${own}, no match`;
  return `${own} + ${formatCurrency(s.matchMonthly)} match`;
}

/** "Worth $117,208" (statement). */
export function worthText(snap: SaveSnapshot): string {
  return `Worth ${formatCurrency(snap.valueShown)}`;
}

/** "$18,000 left on the branch" (the match untaken so far), or '' for a picker who takes all of it. */
export function missedText(snap: SaveSnapshot, inputs: OrchardInputs): string {
  if (!(saveSchedule(inputs, snap.id).missedMonthly > 0)) return '';
  return `${formatCurrency(snap.missedShown)} left on the branch`;
}

/** One sentence about a picker, used by the hidden summary and scrub announcements. */
export function pickerSentence(inputs: OrchardInputs, snap: SaveSnapshot): string {
  const missed = missedText(snap, inputs);
  return `Picker ${pickerLetter(snap.id)} saves ${formatRate(inputs.save[snap.id])} of pay, ${termsLine(snap.id, inputs)}: ${worthText(snap).toLowerCase()}${missed ? `, ${missed}` : ''}.`;
}

export interface DiffText {
  /** False before both have started (and for identical savings): the label is hidden. */
  show: boolean;
  label: string;
  value: string;
  /** Under the value (empty: hidden). */
  sub: string;
  /** The end of the timeline: the difference is emphasized. */
  final: boolean;
}

/** The difference between the two labels: who is ahead and by how much (statement figures). */
export function diffText(inputs: OrchardInputs, months: number): DiffText {
  const hidden: DiffText = { show: false, label: '', value: '', sub: '', final: false };
  if (savesMatch(inputs) || months < CREDIT_AT) return hidden;
  const [a, b] = allPickers(inputs, months);
  const va = Math.round(a.valueShown);
  const vb = Math.round(b.valueShown);
  if (va === vb) return hidden;
  const ahead = pickerLetter(va > vb ? 'a' : 'b');
  const end = !a.saving && !b.saving;
  const value = formatCurrency(Math.abs(va - vb));
  return end
    ? { show: true, label: `${ahead} ends ahead by`, value, sub: '', final: true }
    : { show: true, label: `${ahead} is ahead by`, value, sub: '', final: false };
}

/** Text alternative for the whole scene at the current month. Updated on discrete changes only. */
export function sceneSummary(inputs: OrchardInputs, months: number): string {
  const snaps = allPickers(inputs, months);
  const pickers = PICKERS.map((id) => `picker ${pickerLetter(id)} saves ${formatRate(inputs.save[id])} of pay`);
  const parts = [
    `Two young apple orchards on a farm, one for each picker, on the same ${formatCurrency(inputs.salary)} a year: ${pickers.join(' and ')}. Golden-apple trees are their own savings; red-apple trees are the match from work, picked from the farmer's old tree. The trees grow with the years.`,
    `${yearMonthLabel(statementMonth(months))}.`,
    ...snaps.map((s) => pickerSentence(inputs, s)),
  ];
  return parts.join(' ');
}

/** The short results sentence announced when inputs change. */
export function resultsSentence(inputs: OrchardInputs): string {
  return PICKERS.map((id) => {
    const s = saveSchedule(inputs, id);
    return `Picker ${pickerLetter(id)}: ${termsLine(id, inputs)}, worth ${formatCurrency(s.finalValue)} after ${formatDuration(s.months)}.`;
  }).join(' ');
}

/** Spoken after a scrub: "Year 5, month 3. Picker A, ..." */
export function scrubSentence(inputs: OrchardInputs, months: number): string {
  const snaps = allPickers(inputs, months);
  return `${yearMonthLabel(statementMonth(months))}. ${snaps.map((s) => pickerSentence(inputs, s)).join(' ')}`;
}

/* ---------------------------------------------------------------- how this is calculated */

const pay = (inputs: OrchardInputs): string => `${formatCurrency(inputs.salary)} ÷ 12`;

/** "$60,000 ÷ 12 × 3% = $150.00" */
export function ownFormula(id: PickerId, inputs: OrchardInputs): string {
  return `${pay(inputs)} × ${formatRate(inputs.save[id])} = ${formatCents(saveSchedule(inputs, id).ownMonthly)}`;
}

/** "$60,000 ÷ 12 × 50% × 3% = $75.00" (the saving, up to the limit) */
export function matchFormula(id: PickerId, inputs: OrchardInputs): string {
  const counted = Math.min(inputs.save[id], inputs.match.limit);
  return `${pay(inputs)} × ${formatRate(inputs.match.rate)} × ${formatRate(counted)} = ${formatCents(saveSchedule(inputs, id).matchMonthly)}`;
}

/** "$112.50 − $75.00 = $37.50" (the offer, less the match taken) */
export function missedFormula(id: PickerId, inputs: OrchardInputs): string {
  const s = saveSchedule(inputs, id);
  return `${formatCents(s.offerMonthly)} − ${formatCents(s.matchMonthly)} = ${formatCents(s.missedMonthly)}`;
}

/** "Month 217 (year 18, month 1)", or "Never". */
export function passText(id: PickerId, inputs: OrchardInputs): string {
  const p = saveSchedule(inputs, id).growthPassesMonth;
  if (p === null) return 'Never';
  return `Month ${p} (${yearMonthLabel(p).toLowerCase()})`;
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
