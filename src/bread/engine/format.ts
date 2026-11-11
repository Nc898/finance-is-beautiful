/** Display helpers for Bread and Butter (rounding happens here and nowhere else). */
import { formatCurrency } from '../../engine/format';

export { formatCurrency };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthName = (monthOfYear: number): string => MONTH_NAMES[monthOfYear] ?? '';
export const monthShort = (monthOfYear: number): string => MONTH_SHORT[monthOfYear] ?? '';

/** Dollars and cents: "$9.16". */
export function formatCents(n: number): string {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The pay: whole dollars ("$254", "$1,239"). */
export const formatPay = (n: number): string => formatCurrency(n);

/** Minutes of work as the headline says them: whole minutes. */
export const formatMinutes = (minutes: number): string => String(Math.round(minutes));

/** "86.5" (the panel's tables). */
export const formatMinutesTenth = (minutes: number): string => (Math.round(minutes * 10) / 10).toFixed(1);

/** "1 minute", "51 minutes" */
export function minutesPhrase(minutes: number): string {
  const n = Math.round(minutes);
  return `${n} minute${n === 1 ? '' : 's'}`;
}

/** A 12-month rate (a decimal) to one decimal place: 0.148 → "14.8%", −0.004 → "−0.4%". */
export function formatRate(decimal: number): string {
  const pct = Math.round(decimal * 1000) / 10;
  if (pct === 0) return '0.0%';
  return `${pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`;
}

/** A rate with no decimals, for sentences that round ("14%"). */
export const formatRateWhole = (decimal: number): string => `${Math.round(decimal * 100)}%`;

/** A multiple to one decimal: 2.86 → "×2.9". */
export function formatMultiple(x: number): string {
  return `×${(Math.round(x * 10) / 10).toFixed(1)}`;
}
