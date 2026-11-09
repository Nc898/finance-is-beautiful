/** Pure text helpers shared by the UI and tests. No DOM access. */
import {
  CREDIT_AT,
  FUNDS,
  allFunds,
  formatCurrency,
  formatRate,
  fundLetter,
  fundSchedule,
  fundsMatch,
  highAndLow,
  statementMonth,
  yearMonthLabel,
} from '../engine';
import type { FundId, FundSnapshot, WoodInputs } from '../engine';

/** What a fund is called: by its fee. "1% fee". */
export const fundTitle = (id: FundId, inputs: WoodInputs): string => `${formatRate(inputs.fees[id])} fee`;

/** "Worth $1,103,491" */
export const worthText = (s: FundSnapshot): string => `Worth ${formatCurrency(s.worth)}`;

/** "$143,218 in fees" */
export const feesText = (s: FundSnapshot): string => `${formatCurrency(s.feesCharged)} in fees`;

/** "$372,030 lost to the fee" (the fees and the growth they would have earned), or "Nothing lost yet". */
export function costText(s: FundSnapshot): string {
  const c = Math.round(s.cost);
  return c >= 1 ? `${formatCurrency(c)} lost to the fee` : 'Nothing lost yet';
}

export function fundSentence(inputs: WoodInputs, s: FundSnapshot): string {
  return `Fund ${fundLetter(s.id)}, with a ${fundTitle(s.id, inputs)}: worth ${formatCurrency(s.worth)}, ${formatCurrency(s.feesCharged)} paid in fees, ${formatCurrency(Math.max(0, s.cost))} less than with no fee.`;
}

export interface DiffText {
  show: boolean;
  label: string;
  value: string;
  sub: string;
  final: boolean;
}

/** Between the labels: how far the cheaper fund is ahead. */
export function diffText(inputs: WoodInputs, months: number): DiffText {
  const hidden: DiffText = { show: false, label: '', value: '', sub: '', final: false };
  if (fundsMatch(inputs) || months < CREDIT_AT) return hidden;
  const [a, b] = allFunds(inputs, months);
  const wa = Math.round(a.worth);
  const wb = Math.round(b.worth);
  if (wa === wb) return hidden;
  const ahead: FundId = wa > wb ? 'a' : 'b';
  const end = statementMonth(months) >= Math.round(inputs.years) * 12;
  const gap = Math.abs(inputs.fees.a - inputs.fees.b);
  return {
    show: true,
    label: `${fundLetter(ahead)} ${end ? 'ends' : 'is'} ahead by`,
    value: formatCurrency(Math.abs(wa - wb)),
    sub: `for ${formatRate(gap)} a year less in fees`,
    final: end,
  };
}

export function sceneSummary(inputs: WoodInputs, months: number): string {
  const snaps = allFunds(inputs, months);
  const fees = FUNDS.map((id) => `fund ${fundLetter(id)} charging ${formatRate(inputs.fees[id])} a year`);
  return [
    `Two trees in a bluebell wood, each a fund holding the same savings (${formatCurrency(inputs.start)} to start and ${formatCurrency(inputs.monthly)} a month, growing ${formatRate(inputs.growth)} a year): ${fees.join(' and ')}. The crown is the money; the fee is cut off the top and stacked in a woodpile beside each tree; a pale ghost of each crown shows the tree with no fee.`,
    `${yearMonthLabel(statementMonth(months))}.`,
    ...snaps.map((s) => fundSentence(inputs, s)),
  ].join(' ');
}

export function resultsSentence(inputs: WoodInputs): string {
  return FUNDS.map((id) => {
    const s = fundSchedule(inputs, id);
    return `Fund ${fundLetter(id)}: ${formatCurrency(s.final)} at the end, ${formatCurrency(s.totalFees)} in fees, ${formatCurrency(s.cost)} less than with no fee.`;
  }).join(' ');
}

export function scrubSentence(inputs: WoodInputs, months: number): string {
  return `${yearMonthLabel(statementMonth(months))}. ${allFunds(inputs, months).map((s) => fundSentence(inputs, s)).join(' ')}`;
}

/** "Each month: grow by 7% ÷ 12, then the fee takes 1% ÷ 12 of the fund, then $500 goes in." */
export function formulaText(id: FundId, inputs: WoodInputs): string {
  const q = (1 + inputs.growth / 12) * (1 - inputs.fees[id] / 12);
  return `× (1 + ${formatRate(inputs.growth)} ÷ 12) × (1 − ${formatRate(inputs.fees[id])} ÷ 12) = × ${q.toFixed(6)} a month, then + ${formatCurrency(inputs.monthly)}`;
}

export { highAndLow };

/* ---------------------------------------------------------------- timeline scale (as the brick) */

export interface ScaleTick {
  month: number;
  major: boolean;
  label?: string;
}

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
  return out.map((t) => (t.label && t.month !== 0 && horizon - t.month > 0 && horizon - t.month < horizon * 0.04 ? { month: t.month, major: false } : t));
}
