/**
 * The single application state object plus small action functions.
 * No DOM access: everything here is unit-testable.
 */
import { BRICK_FIELDS, BRICK_LIMITS, DEFAULT_BRICK_INPUTS, LOANS, horizonMonths, validateBrickInputs } from '../engine';
import type { BrickField, BrickInputs, BrickValidation, LoanId, LoanTerms } from '../engine';

/** Playback speed, a multiple of the normal pace: anywhere from SPEED_MIN to SPEED_MAX, in tenths. */
export type Speed = number;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 5;
/** a speed within the range, rounded to a tenth (so the readout never shows 2.37x) */
export const clampSpeed = (s: number): Speed => {
  const v = Number.isFinite(s) ? s : 1;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) * 10) / 10;
};
export type DraftFields = Record<BrickField, string>;
/** Every field, in panel order: the amount, then each loan's term and rate. */
export const FIELDS: readonly BrickField[] = BRICK_FIELDS;

/** The kind of a field: 'amount', 'years' or 'apr'. */
export type FieldKind = 'amount' | keyof LoanTerms;
export function splitField(field: BrickField): { loan: LoanId; key: keyof LoanTerms } | null {
  if (field === 'amount') return null;
  const [loan, key] = field.split('.') as [LoanId, keyof LoanTerms];
  return { loan, key };
}
export const fieldKind = (field: BrickField): FieldKind => splitField(field)?.key ?? 'amount';

/** Why subscribers were notified; discrete events only, never per frame. */
export type Reason =
  | 'draft'
  | 'inputs'
  | 'errors'
  | 'play'
  | 'pause'
  | 'speed'
  | 'scrub'
  | 'play-end'
  | 'reduced';

export interface AppState {
  /** Last VALID inputs. */
  inputs: BrickInputs;
  /** Raw field text; may be invalid. Rates are shown in percent. */
  draft: DraftFields;
  errors: BrickValidation['errors'];
  /** THE shared clock, in months (float). It starts at 0, paused: the viewer plays it or drags it. */
  months: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  /** How fast the shared clock moved in the last tick, in months per second (0 when not playing). */
  monthsPerSecond: number;
}

/** A full run of the timeline takes this long at 1x, whatever its length (the default 30 years: 15 months a second). */
export const PLAY_SECONDS = 24;
/** Playback at 1x, in months a second: the timeline over PLAY_SECONDS (never slower than half a month a second). */
export const playRate = (horizon: number): number => Math.max(0.5, horizon / PLAY_SECONDS);
/** Max time step the clock will take in one frame (so tab switches don't jump). */
export const MAX_DT = 0.1;

/** Percent text for a decimal rate: 0.065 -> "6.5", 0.0575 -> "5.75", 0.06125 -> "6.125". */
export function rateToDraft(decimal: number): string {
  return String(Math.round(decimal * 1e5) / 1e3);
}

const money = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function inputsToDraft(i: BrickInputs): DraftFields {
  const draft = { amount: money(i.amount) } as DraftFields;
  for (const id of LOANS) {
    draft[`${id}.years`] = String(i.loans[id].years);
    draft[`${id}.apr`] = rateToDraft(i.loans[id].apr);
  }
  return draft;
}

export function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s$%]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

/** Percent to a decimal, rounded to a thousandth of a percent (so 5.75 is exactly 0.0575). */
const toDecimal = (pct: number): number => Math.round(pct * 1e3) / 1e5;

/** Converts raw field text to engine inputs (rate percent -> decimal). Unparseable fields become NaN. */
export function draftToInputs(d: DraftFields): BrickInputs {
  const loans = {} as BrickInputs['loans'];
  for (const id of LOANS) loans[id] = { years: parseNumber(d[`${id}.years`]), apr: toDecimal(parseNumber(d[`${id}.apr`])) };
  return { amount: parseNumber(d.amount), loans };
}

function sameInputs(a: BrickInputs, b: BrickInputs): boolean {
  return (
    a.amount === b.amount &&
    LOANS.every((id) => a.loans[id].years === b.loans[id].years && Math.abs(a.loans[id].apr - b.loans[id].apr) < 1e-12)
  );
}

const cloneInputs = (i: BrickInputs): BrickInputs => ({ amount: i.amount, loans: { a: { ...i.loans.a }, b: { ...i.loans.b } } });

/** Range of each kind of field in the units the field shows (rates in percent). */
export const FIELD_RANGE: Record<FieldKind, { min: number; max: number }> = {
  amount: { min: BRICK_LIMITS.amount.min, max: BRICK_LIMITS.amount.max },
  years: { min: BRICK_LIMITS.years.min, max: BRICK_LIMITS.years.max },
  apr: { min: BRICK_LIMITS.apr.min * 100, max: BRICK_LIMITS.apr.max * 100 },
};

/** One stepper click, in the field's own units. The amount takes bigger steps the bigger it is. */
export function fieldStep(field: BrickField, current: number): number {
  switch (fieldKind(field)) {
    case 'amount':
      return current >= 1_000_000 ? 50_000 : current >= 100_000 ? 10_000 : BRICK_LIMITS.amount.step;
    case 'years':
      return BRICK_LIMITS.years.step;
    case 'apr':
      return BRICK_LIMITS.apr.step * 100;
  }
}

export interface Actions {
  setDraftField(field: BrickField, text: string): void;
  /** Applies the draft if valid; otherwise records errors and keeps the last valid inputs. */
  commitInputs(): void;
  /** Normalises a field's text to its canonical form (call on blur). */
  tidyField(field: BrickField): void;
  /** Nudges a field by `dir` steps (clamped to the limits) and commits immediately. */
  stepField(field: BrickField, dir: 1 | -1): void;
  /** Play from where the clock is (from the start again if it is at the end). */
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Move the shared clock to `months` (clamped to 0…horizon), paused. */
  scrubTo(months: number): void;
  setSpeed(speed: Speed): void;
  setReducedMotion(on: boolean): void;
}

export interface Store {
  state: AppState;
  actions: Actions;
  subscribe(fn: (reason: Reason) => void): () => void;
  /** Advance the clocks by dt seconds (clamped to MAX_DT). Called by the rAF loop. */
  tick(dtSeconds: number): void;
  /** The timeline length in months for the current inputs (the longer term). */
  horizon(): number;
}

export function createStore(opts: { reducedMotion?: boolean; inputs?: BrickInputs } = {}): Store {
  const inputs = cloneInputs(opts.inputs ?? DEFAULT_BRICK_INPUTS);
  const reducedMotion = opts.reducedMotion ?? false;
  const state: AppState = {
    inputs,
    draft: inputsToDraft(inputs),
    errors: {},
    months: 0,
    playing: false,
    speed: 1,
    reducedMotion,
    monthsPerSecond: 0,
  };
  const listeners = new Set<(r: Reason) => void>();
  const emit = (r: Reason) => listeners.forEach((fn) => fn(r));
  const end = () => horizonMonths(state.inputs);

  const actions: Actions = {
    setDraftField(field, text) {
      state.draft = { ...state.draft, [field]: text };
      emit('draft');
    },

    commitInputs() {
      const candidate = draftToInputs(state.draft);
      const result = validateBrickInputs(candidate);
      if (!result.ok) {
        state.errors = result.errors;
        emit('errors');
        return;
      }
      const hadErrors = Object.keys(state.errors).length > 0;
      state.errors = {};
      if (sameInputs(candidate, state.inputs)) {
        if (hadErrors) emit('errors');
        return;
      }
      state.inputs = candidate;
      if (state.months > end()) {
        state.months = end();
        state.playing = false;
      }
      emit('inputs');
    },

    tidyField(field) {
      if (state.errors[field]) return;
      const canonical = inputsToDraft(state.inputs)[field];
      if (parseNumber(state.draft[field]) !== parseNumber(canonical)) return;
      if (state.draft[field] !== canonical) {
        state.draft = { ...state.draft, [field]: canonical };
        emit('draft');
      }
    },

    stepField(field, dir) {
      const kind = fieldKind(field);
      const { min, max } = FIELD_RANGE[kind];
      let current = parseNumber(state.draft[field]);
      if (!Number.isFinite(current)) current = parseNumber(inputsToDraft(state.inputs)[field]);
      // Step size follows the side of the value we are moving toward, so up and down are mirror images.
      const step = fieldStep(field, dir > 0 ? current : Math.max(min, current - 1e-9));
      // Move one step; if off the step grid, snap to the next grid line in that direction.
      const q = current / step;
      const onGrid = Math.abs(q - Math.round(q)) < 1e-9;
      let next = onGrid ? current + dir * step : (dir > 0 ? Math.ceil(q) : Math.floor(q)) * step;
      next = Math.round(Math.min(max, Math.max(min, next)) * 1e6) / 1e6;
      actions.setDraftField(field, kind === 'amount' ? next.toLocaleString('en-US') : String(next));
      actions.commitInputs();
    },

    play() {
      if (end() <= 0) return;
      if (state.months >= end() - 1e-6) state.months = 0;
      state.playing = true;
      emit('play');
    },

    pause() {
      if (!state.playing) return;
      state.playing = false;
      state.monthsPerSecond = 0;
      emit('pause');
    },

    togglePlay() {
      if (state.playing) actions.pause();
      else actions.play();
    },

    scrubTo(months) {
      state.playing = false;
      state.months = Math.min(end(), Math.max(0, Number.isFinite(months) ? months : 0));
      emit('scrub');
    },

    setSpeed(speed) {
      const s = clampSpeed(speed);
      if (s === state.speed) return;
      state.speed = s;
      emit('speed');
    },

    setReducedMotion(on) {
      if (state.reducedMotion === on) return;
      state.reducedMotion = on;
      emit('reduced');
    },
  };

  const tick = (dtRaw: number) => {
    const dt = Math.min(MAX_DT, Math.max(0, dtRaw));
    const before = state.months;
    if (state.playing) {
      state.months += playRate(end()) * state.speed * dt;
      if (state.months >= end()) {
        state.months = end();
        state.playing = false;
        emit('play-end');
      }
    }
    state.monthsPerSecond = state.playing && dt > 0 ? Math.max(0, (state.months - before) / dt) : 0;
  };

  return {
    state,
    actions,
    tick,
    horizon: end,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
