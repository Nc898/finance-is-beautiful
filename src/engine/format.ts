/** Display formatting. Rounding happens only here, never in the engine. */

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** True minus sign (U+2212). */
const MINUS = '−';

/** Formats dollars with no cents, e.g. "$381,534"; negatives use a true minus sign: "−$1,234". */
export function formatCurrency(n: number): string {
  const text = currency.format(Math.abs(n));
  // Values that round to zero show as "$0", never "−$0".
  return n < 0 && Math.round(Math.abs(n)) !== 0 ? MINUS + text : text;
}

/** Formats a decimal as a percent with up to one decimal place: 0.06 → "6%", 0.065 → "6.5%", −0.02 → "−2%". */
export function formatPercent(decimal: number): string {
  const pct = Math.round(decimal * 1000) / 10;
  if (pct === 0) return '0%';
  const body = Math.abs(pct).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${pct < 0 ? MINUS : ''}${body}%`;
}
