/**
 * The single application state object plus small action functions.
 * No DOM access: everything here is unit-testable.
 */
import { DEFAULT_VINE_INPUTS, VINE_LIMITS, horizonMonths, validateVineInputs } from '../engine';
import type { VineField, VineInputs, VineValidation } from '../engine';

/** Playback speed, a multiple of the normal pace: anywhere from SPEED_MIN to SPEED_MAX, in tenths. */
export type Speed = number;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 5;
/** a speed within the range, rounded to a tenth (so the readout never shows 2.37x) */
export const clampSpeed = (s: number): Speed => {
  const v = Number.isFinite(s) ? s : 1;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) * 10) / 10;
};
export type DraftFields = Record<VineField, string>;
export const FIELDS: readonly VineField[] = ['balance', 'apr', 'fixedPayment', 'minPercent', 'minFloor'];

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
  inputs: VineInputs;
  /** Raw field text; may be invalid. Rates are shown in percent. */
  draft: DraftFields;
  errors: VineValidation['errors'];
  /** THE shared clock, in months (float). It starts at 0, paused: the viewer plays it or drags it. */
  months: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  /** How fast the shared clock moved in the last tick, in months per second (0 when not playing). */
  monthsPerSecond: number;
}

/** A full run of the timeline takes this long at 1x, whatever its length (the default 19 years: about 10 months a second). */
export const PLAY_SECONDS = 24;
/** Playback at 1x, in months a second: the timeline over PLAY_SECONDS (never slower than half a month a second). */
export const playRate = (horizon: number): number => Math.max(0.5, horizon / PLAY_SECONDS);
/** Max time step the clock will take in one frame (so tab switches don't jump). */
export const MAX_DT = 0.1;

/** Percent text for a decimal rate: 0.22 -> "22", 0.005 -> "0.5". */
export function rateToDraft(decimal: number): string {
  return String(Math.round(decimal * 10000) / 100);
}

const money = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function inputsToDraft(i: VineInputs): DraftFields {
  return {
    balance: money(i.balance),
    apr: rateToDraft(i.apr),
    fixedPayment: money(i.fixedPayment),
    minPercent: rateToDraft(i.minPercent),
    minFloor: money(i.minFloor),
  };
}

export function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s$%]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

const toDecimal = (pct: number): number => Math.round(pct * 1e4) / 1e6;

/** Converts raw field text to engine inputs (rate percent -> decimal). Unparseable fields become NaN. */
export function draftToInputs(d: DraftFields): VineInputs {
  return {
    balance: parseNumber(d.balance),
    apr: toDecimal(parseNumber(d.apr)),
    fixedPayment: parseNumber(d.fixedPayment),
    minPercent: toDecimal(parseNumber(d.minPercent)),
    minFloor: parseNumber(d.minFloor),
  };
}

function sameInputs(a: VineInputs, b: VineInputs): boolean {
  return (
    a.balance === b.balance &&
    Math.abs(a.apr - b.apr) < 1e-12 &&
    a.fixedPayment === b.fixedPayment &&
    Math.abs(a.minPercent - b.minPercent) < 1e-12 &&
    a.minFloor === b.minFloor
  );
}

/** Range of each field in the units the field shows (rates in percent). */
export const FIELD_RANGE: Record<VineField, { min: number; max: number }> = {
  balance: { min: VINE_LIMITS.balance.min, max: VINE_LIMITS.balance.max },
  apr: { min: VINE_LIMITS.apr.min * 100, max: VINE_LIMITS.apr.max * 100 },
  fixedPayment: { min: VINE_LIMITS.fixedPayment.min, max: VINE_LIMITS.fixedPayment.max },
  minPercent: { min: VINE_LIMITS.minPercent.min * 100, max: VINE_LIMITS.minPercent.max * 100 },
  minFloor: { min: VINE_LIMITS.minFloor.min, max: VINE_LIMITS.minFloor.max },
};

/** One stepper click, in the field's own units. Dollar fields take bigger steps the bigger they are. */
export function fieldStep(field: VineField, current: number): number {
  switch (field) {
    case 'balance':
      return current >= 10_000 ? 1000 : current >= 1000 ? 500 : VINE_LIMITS.balance.step;
    case 'apr':
      return VINE_LIMITS.apr.step * 100;
    case 'fixedPayment':
      return current >= 10_000 ? 1000 : current >= 2000 ? 250 : current >= 500 ? 50 : VINE_LIMITS.fixedPayment.step;
    case 'minPercent':
      return VINE_LIMITS.minPercent.step * 100;
    case 'minFloor':
      return current >= 100 ? 25 : VINE_LIMITS.minFloor.step;
  }
}

export interface Actions {
  setDraftField(field: VineField, text: string): void;
  /** Applies the draft if valid; otherwise records errors and keeps the last valid inputs. */
  commitInputs(): void;
  /** Normalises a field's text to its canonical form (call on blur). */
  tidyField(field: VineField): void;
  /** Nudges a field by `dir` steps (clamped to the limits) and commits immediately. */
  stepField(field: VineField, dir: 1 | -1): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Move the shared clock to `months` (clamped to 0…horizon). Paused. */
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
  /** The timeline length in months for the current inputs (the later payoff). */
  horizon(): number;
}

export function createStore(opts: { reducedMotion?: boolean; inputs?: VineInputs } = {}): Store {
  const inputs = { ...(opts.inputs ?? DEFAULT_VINE_INPUTS) };
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
      const result = validateVineInputs(candidate);
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
      const { min, max } = FIELD_RANGE[field];
      let current = parseNumber(state.draft[field]);
      if (!Number.isFinite(current)) current = parseNumber(inputsToDraft(state.inputs)[field]);
      // Step size follows the side of the value we are moving toward, so up and down are mirror images.
      const step = fieldStep(field, dir > 0 ? current : Math.max(min, current - 1e-9));
      // Move one step; if off the step grid, snap to the next grid line in that direction.
      const q = current / step;
      const onGrid = Math.abs(q - Math.round(q)) < 1e-9;
      let next = onGrid ? current + dir * step : (dir > 0 ? Math.ceil(q) : Math.floor(q)) * step;
      next = Math.round(Math.min(max, Math.max(min, next)) * 1e6) / 1e6;
      const isMoney = field === 'balance' || field === 'fixedPayment' || field === 'minFloor';
      actions.setDraftField(field, isMoney ? next.toLocaleString('en-US') : String(next));
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
      state.months = Math.min(end(), Math.max(0, months));
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
