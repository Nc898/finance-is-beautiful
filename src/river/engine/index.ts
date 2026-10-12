/**
 * Against the Current: the engine. Pure, deterministic, full float64 precision.
 * Nothing in here rounds; display formatting lives in ./format.ts and src/engine/format.ts.
 *
 * With a constant effective annual return r and inflation i, after t years (t may be fractional):
 *   nominal(t) = start · (1 + r)^t
 *   real(t)    = nominal(t) / (1 + i)^t          what those dollars buy in today's money
 *   logReal(t) = ln(real / start) = t · (ln(1 + r) − ln(1 + i))     a boat's position: constant speed
 */
import { BOATS, RIVER_LIMITS } from '../types';
import type { BoatId, BoatSnapshot, RiverInputs } from '../types';

export { BOATS, DEFAULT_RIVER_INPUTS, RIVER_LIMITS } from '../types';
export type { BoatId, BoatSnapshot, BoatVisual, RiverInputs } from '../types';
export * from './format';

/** The smallest span the shared scale ever covers: a scenario where nothing moves far still shows a river. */
export const SCALE_FLOOR = Math.log(1.6);

/** Annual rate used by a boat: cash earns nothing. */
export function boatRate(inputs: RiverInputs, id: BoatId): number {
  if (id === 'cash') return 0;
  return id === 'savings' ? inputs.savingsRate : inputs.investRate;
}

/** One boat after `years` years (fractional allowed). Values are exact; round only for display. */
export function boatSnapshot(inputs: RiverInputs, id: BoatId, years: number): BoatSnapshot {
  const rate = boatRate(inputs, id);
  const nominal = inputs.start * Math.pow(1 + rate, years);
  const real = nominal / Math.pow(1 + inputs.inflation, years);
  const logReal = years === 0 ? 0 : years * (Math.log1p(rate) - Math.log1p(inputs.inflation));
  return { id, rate, nominal, real, logReal };
}

/** All three boats at one moment, in BOATS order (cash, savings, invest). */
export function allBoats(inputs: RiverInputs, years: number): [BoatSnapshot, BoatSnapshot, BoatSnapshot] {
  return [boatSnapshot(inputs, 'cash', years), boatSnapshot(inputs, 'savings', years), boatSnapshot(inputs, 'invest', years)];
}

/**
 * The shared span of the river: max(|logReal at the end| over the three boats, ln 1.6).
 * Every boat's scene position is logReal / riverScale, so ±1 is the farthest any boat gets at the end
 * (and the comparison between boats is always at one scale, never per boat).
 */
export function riverScale(inputs: RiverInputs): number {
  let span = SCALE_FLOOR;
  for (const id of BOATS) span = Math.max(span, Math.abs(boatSnapshot(inputs, id, inputs.years).logReal));
  return span;
}

/** Position of a real value on the river as a fraction of the shared scale. */
export function uOfReal(start: number, real: number, scale: number): number {
  return Math.log(real / start) / scale;
}

/** Fractional change in buying power since the start: real / start − 1 (−0.588 = 58.8% less). */
export function buyingPowerChange(snap: BoatSnapshot, start: number): number {
  return snap.real / start - 1;
}

/** How hard each boat rows, 0…1: its return relative to the strongest of the three (cash, and non-positive returns, are 0). */
export function effortOf(inputs: RiverInputs, id: BoatId): number {
  const top = Math.max(0, inputs.savingsRate, inputs.investRate);
  if (top <= 0) return 0;
  return Math.max(0, boatRate(inputs, id)) / top;
}

/* ---------------------------------------------------------------- mileposts */

export interface Milepost {
  /** Stable key for reusing DOM nodes: "2^k" (doublings, k = 0 is the dock) or "1.5^k" (k = ±1). */
  key: string;
  /** The real value (today's dollars) the post stands for: start × 2^k or start × 1.5^±1. */
  value: number;
  /** Position along the river as a fraction of the shared scale. */
  u: number;
  /** True for the dock and doublings (the main posts); false for the half-steps. */
  major: boolean;
}

/**
 * Mileposts at real values start × 2^k and start × 1.5^±1 that fall inside the visible stretch of the
 * river (given as u), sorted from upstream (+u) to downstream. `margin` keeps posts off the very edges.
 */
export function mileposts(start: number, scale: number, visible: { min: number; max: number }, margin = 0): Milepost[] {
  const lo = visible.min + margin;
  const hi = visible.max - margin;
  const out: Milepost[] = [];
  const push = (key: string, factor: number, major: boolean) => {
    const u = Math.log(factor) / scale;
    if (u >= lo - 1e-9 && u <= hi + 1e-9) out.push({ key, value: start * factor, u, major });
  };
  const kMax = Math.ceil((Math.max(Math.abs(visible.min), Math.abs(visible.max)) * scale) / Math.LN2) + 1;
  for (let k = -kMax; k <= kMax; k++) push(`2^${k}`, Math.pow(2, k), true);
  push('1.5^1', 1.5, false);
  push('1.5^-1', 1 / 1.5, false);
  return out.sort((a, b) => b.u - a.u);
}

/* ---------------------------------------------------------------- validation */

export type RiverField = keyof RiverInputs;
export interface RiverValidation {
  ok: boolean;
  errors: Partial<Record<RiverField, string>>;
}

/** Tolerance for slider-step float noise on the rate limits. */
const RATE_EPS = 1e-12;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function pct(decimal: number): string {
  return `${Math.round(decimal * 1000) / 10}%`.replace('-', '−');
}

/** Checks every field; one plain-language message per offending field. Accepts anything (unknown input is invalid). */
export function validateRiverInputs(raw: unknown): RiverValidation {
  const errors: Partial<Record<RiverField, string>> = {};
  const r = (raw ?? {}) as Partial<Record<RiverField, unknown>>;
  const { start, years, inflation, savingsRate, investRate } = RIVER_LIMITS;

  const s = r.start;
  if (!isFiniteNumber(s)) errors.start = 'The starting amount must be a number.';
  else if (s < start.min || s > start.max) {
    errors.start = `The starting amount must be between $${start.min.toLocaleString('en-US')} and $${start.max.toLocaleString('en-US')}.`;
  }

  const y = r.years;
  if (!isFiniteNumber(y)) errors.years = 'Years must be a number.';
  else if (!Number.isInteger(y)) errors.years = 'Years must be a whole number.';
  else if (y < years.min || y > years.max) errors.years = `Years must be between ${years.min} and ${years.max}.`;

  const checkRate = (field: 'inflation' | 'savingsRate' | 'investRate', label: string, lim: { min: number; max: number }) => {
    const v = r[field];
    if (!isFiniteNumber(v)) errors[field] = `${label} must be a number.`;
    else if (v < lim.min - RATE_EPS || v > lim.max + RATE_EPS) errors[field] = `${label} must be between ${pct(lim.min)} and ${pct(lim.max)}.`;
  };
  checkRate('inflation', 'Inflation', inflation);
  checkRate('savingsRate', 'The savings account return', savingsRate);
  checkRate('investRate', 'The investment return', investRate);

  return { ok: Object.keys(errors).length === 0, errors };
}
