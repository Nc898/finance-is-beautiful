/** Display helpers for Low-Hanging Fruit (rounding happens here and nowhere else). */
import { formatCurrency } from '../../engine/format';
import type { PickerId } from '../types';

export { formatCurrency };

const MINUS = '−';

/** Whole months shown on the clock: floor, with float noise forgiven. */
export function wholeMonths(months: number): number {
  return Math.max(0, Math.floor(months + 1e-9));
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "30 years", "2 years, 10 months", "1 year", "5 months", "0 months". */
export function formatDuration(months: number): string {
  const total = Math.max(0, Math.round(months));
  const y = Math.floor(total / 12);
  const m = total % 12;
  if (y === 0) return plural(m, 'month');
  if (m === 0) return plural(y, 'year');
  return `${plural(y, 'year')}, ${plural(m, 'month')}`;
}

/** "Year 5, month 3" for a (possibly fractional) month count; the month counter is whole. */
export function yearMonthLabel(months: number): string {
  const total = wholeMonths(months);
  return `Year ${Math.floor(total / 12)}, month ${total % 12}`;
}

/** "Year 5" alone, for captions. */
export function yearLabel(months: number): string {
  return `Year ${Math.floor(wholeMonths(months) / 12)}`;
}

/** Dollars and cents: "$150.00". */
export function formatCents(n: number): string {
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 && Math.abs(n) >= 0.005 ? MINUS : ''}$${body}`;
}

/** A share with as many decimals as it has (up to three): 0.03 → "3%", 0.065 → "6.5%", 0.0725 → "7.25%", 0 → "0%". */
export function formatRate(decimal: number): string {
  const pct = Math.round(decimal * 1e5) / 1e3;
  if (pct === 0) return '0%';
  return `${pct.toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
}

/** The match per dollar saved: 0.5 → "50¢", 1 → "$1", 0.05 → "5¢". */
export function formatPerDollar(rate: number): string {
  const cents = Math.round(rate * 100);
  if (cents >= 100 && cents % 100 === 0) return `$${cents / 100}`;
  if (cents > 100) return formatCents(cents / 100);
  return `${cents}¢`;
}

/** The letter of a picker: "A" or "B". */
export const pickerLetter = (id: PickerId): string => id.toUpperCase();
