/** Mapping from dollars to illustrated tree maturity. */
import type { Scenario } from './types';

/** Minimum scale, in dollars, at which a tree is fully mature. Keeps small scenarios from looking full-grown. */
export const SCALE_FLOOR = 25_000;

/**
 * The shared visual scale for a scenario: max(final balance A, final balance B, SCALE_FLOOR).
 * Computed once per input set and used for both trees.
 */
export function visualScaleFor(s: Scenario): number {
  const finalA = s.a.balance[s.a.months] ?? 0;
  const finalB = s.b.balance[s.b.months] ?? 0;
  return Math.max(finalA, finalB, SCALE_FLOOR);
}

/**
 * Maps a balance to a maturity in [0, 1]: clamp(sqrt(max(0, balance) / scale), 0, 1).
 * Illustrated linear size is proportional to maturity, so illustrated area is
 * proportional to balance. The mapping is monotonic and identical for both trees.
 * Returns 0 if scale is not finite or not positive.
 */
export function maturityFor(balance: number, scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  const m = Math.sqrt(Math.max(0, balance) / scale);
  if (Number.isNaN(m)) return 0;
  return Math.min(1, Math.max(0, m));
}
