/**
 * Financial engine: pure, deterministic, full float64 precision.
 * Nothing in here rounds; formatting lives in format.ts.
 */
import {
  LIMITS,
  type InputField,
  type Inputs,
  type Scenario,
  type TreeId,
  type TreeSeries,
  type TreeSnapshot,
  type ValidationResult,
} from './types';

/** Tolerance for float noise when comparing ages and months. */
const EPS = 1e-9;
/** Tolerance for slider-step float noise on the annual return limits. */
const RETURN_EPS = 1e-12;

/** Converts an effective annual return to its equivalent monthly rate: (1 + r)^(1/12) − 1. */
export function monthlyRateFromAnnual(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Checks every input field and returns a plain-language message per offending field.
 * Starting age equal to the ending age is valid (zero months of growth).
 */
export function validateInputs(raw: Inputs): ValidationResult {
  const errors: Partial<Record<InputField, string>> = {};
  const { age, contribution, annualReturn } = LIMITS;

  const checkAge = (field: 'startAgeA' | 'startAgeB' | 'endAge', label: string): void => {
    const v: unknown = raw?.[field];
    if (!isFiniteNumber(v)) {
      errors[field] = `${label} must be a number.`;
    } else if (!Number.isInteger(v)) {
      errors[field] = `${label} must be a whole number of years.`;
    } else if (v < age.min || v > age.max) {
      errors[field] = `${label} must be between ${age.min} and ${age.max}.`;
    }
  };
  checkAge('startAgeA', "Tree A's starting age");
  checkAge('startAgeB', "Tree B's starting age");
  checkAge('endAge', 'The ending age');

  if (!errors.endAge) {
    const end = raw.endAge;
    if (!errors.startAgeA && raw.startAgeA > end) {
      errors.startAgeA = `Tree A's starting age must be at or before the ending age (${end}).`;
    }
    if (!errors.startAgeB && raw.startAgeB > end) {
      errors.startAgeB = `Tree B's starting age must be at or before the ending age (${end}).`;
    }
  }

  const c: unknown = raw?.monthlyContribution;
  if (!isFiniteNumber(c)) {
    errors.monthlyContribution = 'The monthly contribution must be a number.';
  } else if (c < contribution.min || c > contribution.max) {
    errors.monthlyContribution = `The monthly contribution must be between $${contribution.min} and $${contribution.max.toLocaleString('en-US')}.`;
  }

  const r: unknown = raw?.annualReturn;
  if (!isFiniteNumber(r)) {
    errors.annualReturn = 'The annual return must be a number.';
  } else if (r < annualReturn.min - RETURN_EPS || r > annualReturn.max + RETURN_EPS) {
    errors.annualReturn = `The annual return must be between ${Math.round(annualReturn.min * 100)}% and ${Math.round(annualReturn.max * 100)}%.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Simulates one tree month by month with end-of-month contributions:
 * balance[k] = balance[k−1] × (1 + i) + contribution, for k = 1…N,
 * where N = max(0, (endAge − startAge) × 12) and i is the monthly rate.
 */
export function simulateTree(
  id: TreeId,
  startAge: number,
  endAge: number,
  contribution: number,
  annualReturn: number,
): TreeSeries {
  const months = Math.max(0, Math.floor((endAge - startAge) * 12 + EPS));
  const growthFactor = 1 + monthlyRateFromAnnual(annualReturn);
  const balance = new Float64Array(months + 1);
  const contributed = new Float64Array(months + 1);
  for (let k = 1; k <= months; k++) {
    balance[k] = balance[k - 1] * growthFactor + contribution;
    contributed[k] = contributed[k - 1] + contribution;
  }
  return { id, startAge, endAge, months, balance, contributed };
}

/** Validates the inputs (throws RangeError with the joined messages if invalid) and simulates both trees. */
export function buildScenario(inputs: Inputs): Scenario {
  const result = validateInputs(inputs);
  if (!result.ok) {
    throw new RangeError(Object.values(result.errors).join(' '));
  }
  const copy: Inputs = { ...inputs };
  const { startAgeA, startAgeB, endAge, monthlyContribution, annualReturn } = copy;
  return {
    inputs: copy,
    monthlyRate: monthlyRateFromAnnual(annualReturn),
    timelineStartMonths: Math.min(startAgeA, startAgeB) * 12,
    timelineEndMonths: endAge * 12,
    a: simulateTree('A', startAgeA, endAge, monthlyContribution, annualReturn),
    b: simulateTree('B', startAgeB, endAge, monthlyContribution, annualReturn),
  };
}

/**
 * Reads a tree's state at a shared-clock age (in months).
 * 'exact' returns values at the last completed month-end (for displayed numbers);
 * 'smooth' linearly interpolates between month-ends (for continuous visuals only).
 * Before planting, everything is zero.
 */
export function snapshotAt(
  series: TreeSeries,
  ageMonths: number,
  mode: 'exact' | 'smooth',
): TreeSnapshot {
  const startMonths = series.startAge * 12;
  const planted = series.startAge < series.endAge && ageMonths >= startMonths - EPS;
  if (!planted) {
    return {
      id: series.id,
      planted: false,
      monthsElapsed: 0,
      contributionsMade: 0,
      balance: 0,
      contributed: 0,
      growth: 0,
    };
  }

  const elapsed = Math.min(series.months, Math.max(0, ageMonths - startMonths));
  const k = Math.min(series.months, Math.floor(elapsed + EPS));

  let balance = series.balance[k];
  let contributed = series.contributed[k];
  if (mode === 'smooth' && k < series.months) {
    const frac = Math.min(1, Math.max(0, elapsed - k));
    balance += (series.balance[k + 1] - balance) * frac;
    contributed += (series.contributed[k + 1] - contributed) * frac;
  }

  return {
    id: series.id,
    planted: true,
    monthsElapsed: elapsed,
    contributionsMade: k,
    balance,
    contributed,
    growth: balance - contributed,
  };
}
