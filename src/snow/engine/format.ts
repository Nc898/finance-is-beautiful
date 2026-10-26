/** Display helpers for On a Roll (rounding happens here and nowhere else). */
import { formatCurrency, formatPercent } from '../../engine/format';
import type { DebtId, StrategyId } from '../types';

export { formatCurrency, formatPercent };

const MINUS = '−';

/** Whole months shown on the clock: floor, with float noise forgiven. */
export function wholeMonths(months: number): number {
  return Math.max(0, Math.floor(months + 1e-9));
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "2 years, 8 months", "19 years, 2 months", "1 year", "5 months", "0 months". */
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

/** Dollars for a payment: whole dollars, with cents only when the amount has them ("$200", "$187.50"). */
export function formatMoney(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.005) return formatCurrency(n);
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? MINUS : ''}$${body}`;
}

/** Dollars and cents, for the schedule excerpt: "$141.67". */
export function formatCents(n: number): string {
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? MINUS : ''}$${body}`;
}

/** How each debt is named in running text ("the medical bill"), in labels ("Medical bill") and on its tag ("Medical"). */
export const DEBT_NAME: Record<DebtId, string> = { medical: 'medical bill', car: 'car loan', card: 'card' };
export const DEBT_TITLE: Record<DebtId, string> = { medical: 'Medical bill', car: 'Car loan', card: 'Credit card' };
export const DEBT_SHORT: Record<DebtId, string> = { medical: 'Medical', car: 'Car', card: 'Card' };

/** "Snowball" / "Avalanche". */
export const STRATEGY_NAME: Record<StrategyId, string> = { snowball: 'Snowball', avalanche: 'Avalanche' };
/** "Snowball: smallest first" / "Avalanche: highest rate first". */
export const STRATEGY_LABEL: Record<StrategyId, string> = {
  snowball: 'Snowball: smallest first',
  avalanche: 'Avalanche: highest rate first',
};

/** "Card 26%", "Car 6%", "Medical 0%": a ball's small name tag. */
export function ballTag(debt: DebtId, apr: number): string {
  return `${DEBT_SHORT[debt]} ${formatPercent(apr)}`;
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
