/** Display helpers for A Little Off the Top (rounding happens here and nowhere else). */
import { formatCurrency } from '../../engine/format';
import type { FundId } from '../types';

export { formatCurrency };

const MINUS = '−';

/** Whole months shown on the clock: floor, with float noise forgiven. */
export function wholeMonths(months: number): number {
  return Math.max(0, Math.floor(months + 1e-9));
}

/** "Year 5, month 3" for a (possibly fractional) month count; the month counter is whole. */
export function yearMonthLabel(months: number): string {
  const total = wholeMonths(months);
  return `Year ${Math.floor(total / 12)}, month ${total % 12}`;
}

/** Dollars and cents: "$1,896.20". */
export function formatCents(n: number): string {
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 && Math.abs(n) >= 0.005 ? MINUS : ''}$${body}`;
}

/** A rate with as many decimals as it has (up to three): 0.01 → "1%", 0.001 → "0.1%", 0.0075 → "0.75%". */
export function formatRate(decimal: number): string {
  const pct = Math.round(decimal * 1e5) / 1e3;
  if (pct === 0) return '0%';
  return `${pct.toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
}

/** A whole percentage: 0.274 → "27%". */
export function formatShare(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Big round money for prose: $1,234,567 → "$1.2 million", $234,567 → "$234,567". */
export function formatBig(n: number): string {
  if (Math.abs(n) >= 1e6) {
    const m = Math.round(n / 1e5) / 10;
    return `$${m.toLocaleString('en-US', { maximumFractionDigits: 1 })} million`;
  }
  return formatCurrency(n);
}

export const fundLetter = (id: FundId): string => id.toUpperCase();
