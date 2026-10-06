/**
 * Shared financial contract. Owned by the coordinator — workers must not change
 * these shapes without escalating.
 *
 * Time convention: the shared clock is `ageMonths` (age × 12, a float).
 * A tree that starts at age S and the timeline ending at age E receives
 * N = (E − S) × 12 end-of-month contributions, at ages S + k/12 for k = 1…N.
 * Month k's balance is: b[k] = b[k−1] × (1 + monthlyRate) + contribution.
 */

export type TreeId = 'A' | 'B';

export interface Inputs {
  /** Whole years. */
  startAgeA: number;
  /** Whole years. */
  startAgeB: number;
  /** Whole years, shared by both trees. */
  endAge: number;
  /** Dollars per month, shared, ≥ 0. */
  monthlyContribution: number;
  /** Effective annual return as a decimal (0.06 = 6%). Shared. May be negative within LIMITS. */
  annualReturn: number;
}

export const DEFAULT_INPUTS: Inputs = {
  startAgeA: 25,
  startAgeB: 35,
  endAge: 65,
  monthlyContribution: 200,
  annualReturn: 0.06,
};

export const LIMITS = {
  age: { min: 16, max: 90, step: 1 },
  contribution: { min: 0, max: 5000, step: 25 },
  /** Decimal. −5% … 12% in 0.5% steps. */
  annualReturn: { min: -0.05, max: 0.12, step: 0.005 },
} as const;

export type InputField = keyof Inputs;

export interface ValidationResult {
  ok: boolean;
  /** Human-readable message per offending field, written for the end user. */
  errors: Partial<Record<InputField, string>>;
}

/** Full-precision monthly series for one tree. */
export interface TreeSeries {
  id: TreeId;
  startAge: number;
  endAge: number;
  /** Number of monthly contributions, max(0, (endAge − startAge) × 12). */
  months: number;
  /** length months + 1; balance[0] = 0 (the moment of planting). */
  balance: Float64Array;
  /** length months + 1; cumulative contributions; contributed[0] = 0. */
  contributed: Float64Array;
}

export interface Scenario {
  inputs: Inputs;
  monthlyRate: number;
  /** min(startAgeA, startAgeB) × 12 — where the shared timeline begins. */
  timelineStartMonths: number;
  /** endAge × 12. */
  timelineEndMonths: number;
  a: TreeSeries;
  b: TreeSeries;
}

export interface TreeSnapshot {
  id: TreeId;
  /** age ≥ startAge and startAge < endAge. */
  planted: boolean;
  /** Fractional months since planting, clamped to [0, months]. 0 if not planted. */
  monthsElapsed: number;
  /** Completed monthly contributions so far (integer). */
  contributionsMade: number;
  balance: number;
  contributed: number;
  /** balance − contributed (may be negative with negative returns). */
  growth: number;
}

/**
 * Engine functions (implemented in src/engine/finance.ts, re-exported by src/engine/index.ts):
 *
 *   monthlyRateFromAnnual(annual: number): number        // (1 + annual)^(1/12) − 1
 *   validateInputs(raw: Inputs): ValidationResult
 *   simulateTree(id, startAge, endAge, contribution, annualReturn): TreeSeries
 *   buildScenario(inputs: Inputs): Scenario              // throws RangeError if !validateInputs(inputs).ok
 *   snapshotAt(series: TreeSeries, ageMonths: number, mode: 'exact' | 'smooth'): TreeSnapshot
 *       'exact'  → values at the last completed month-end (for displayed numbers)
 *       'smooth' → linear interpolation between month-ends (for continuous visuals only)
 *
 * Mapping (src/engine/mapping.ts):
 *   SCALE_FLOOR = 25_000
 *   visualScaleFor(s: Scenario): number   // max(final balance A, final balance B, SCALE_FLOOR)
 *   maturityFor(balance: number, scale: number): number   // clamp(sqrt(max(0,balance)/scale), 0, 1)
 */
