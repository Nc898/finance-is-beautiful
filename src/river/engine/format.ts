/** Display helpers for the river (rounding happens here and nowhere else). */
import { formatCurrency, formatPercent } from '../../engine/format';
import type { BoatId, RiverInputs } from '../types';

export { formatCurrency, formatPercent };

export const BOAT_NAMES: Record<BoatId, string> = {
  cash: 'Cash',
  savings: 'Savings account',
  invest: 'Investing',
};

/** "Cash", "Savings account · 2%", "Investing · 6%". */
export function boatLabel(id: BoatId, inputs: RiverInputs): string {
  if (id === 'cash') return BOAT_NAMES.cash;
  const rate = id === 'savings' ? inputs.savingsRate : inputs.investRate;
  return `${BOAT_NAMES[id]} · ${formatPercent(rate)}`;
}

/** "buys what $4,120 buys today" */
export function buysToday(real: number): string {
  return `buys what ${formatCurrency(real)} buys today`;
}

/** "−59%", "+137%", "0%" for a fractional change (−0.588 → "−59%"). Always a true minus sign. */
export function formatChange(fraction: number): string {
  const p = Math.round(fraction * 100);
  if (p === 0) return '0%';
  return `${p < 0 ? '−' : '+'}${Math.abs(p).toLocaleString('en-US')}%`;
}

/** "$5,000 today" for a milepost. */
export function milepostLabel(value: number): string {
  return `${formatCurrency(value)} today`;
}

/** Whole years shown on the clock: floor, with float noise forgiven. */
export function wholeYears(years: number): number {
  return Math.max(0, Math.floor(years + 1e-9));
}

/** "Year 12" */
export function yearLabel(years: number): string {
  return `Year ${wholeYears(years)}`;
}

/** Spoken form: "Year 12" or "Year 12, 3 months". */
export function yearSpoken(years: number): string {
  const total = Math.max(0, Math.floor(years * 12 + 1e-9));
  const y = Math.floor(total / 12);
  const m = total % 12;
  return m === 0 ? `Year ${y}` : `Year ${y}, ${m} ${m === 1 ? 'month' : 'months'}`;
}
