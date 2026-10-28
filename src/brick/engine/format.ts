/** Display helpers for Brick by Brick (rounding happens here and nowhere else). */
import { formatCurrency } from '../../engine/format';
import type { BrickInputs, LoanId } from '../types';

export { formatCurrency };

const MINUS = '−';

/** Whole months shown on the clock: floor, with float noise forgiven. */
export function wholeMonths(months: number): number {
  return Math.max(0, Math.floor(months + 1e-9));
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "15 years", "2 years, 10 months", "1 year", "5 months", "0 months". */
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

/** Dollars and cents: "$1,896.20". */
export function formatCents(n: number): string {
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 && Math.abs(n) >= 0.005 ? MINUS : ''}$${body}`;
}

/** An interest rate with as many decimals as it has (up to three): 0.065 → "6.5%", 0.0575 → "5.75%", 0 → "0%". */
export function formatRate(decimal: number): string {
  const pct = Math.round(decimal * 1e5) / 1e3;
  if (pct === 0) return '0%';
  return `${pct.toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
}

/** A whole percentage: 0.274 → "27%". */
export function formatShare(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** The letter of a loan: "A" or "B". */
export const loanLetter = (id: LoanId): string => id.toUpperCase();

/**
 * What a loan is called: by its term ("30-year"), or by its rate ("6.5%") when both terms are equal. Identical loans
 * share one name (the letters tell them apart).
 */
export function loanName(id: LoanId, inputs: BrickInputs): string {
  const { a, b } = inputs.loans;
  const t = inputs.loans[id];
  if (a.years !== b.years || Math.abs(a.apr - b.apr) < 1e-12) return `${t.years}-year`;
  return formatRate(t.apr);
}

/** "30-year loan" or "6.5% loan". */
export function loanTitle(id: LoanId, inputs: BrickInputs): string {
  return `${loanName(id, inputs)} loan`;
}

/** "30 years at 6.5%". */
export function termsPhrase(id: LoanId, inputs: BrickInputs): string {
  const t = inputs.loans[id];
  return `${t.years} ${t.years === 1 ? 'year' : 'years'} at ${formatRate(t.apr)}`;
}
