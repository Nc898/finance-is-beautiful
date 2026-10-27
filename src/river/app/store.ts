/**
 * The single application state object plus small action functions.
 * No DOM access: everything here is unit-testable.
 */
import { DEFAULT_RIVER_INPUTS, RIVER_LIMITS, riverScale, validateRiverInputs } from '../engine';
import type { RiverField, RiverInputs, RiverValidation } from '../engine';

export type Speed = 0.5 | 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 4];
export type DraftFields = Record<RiverField, string>;
export const FIELDS: readonly RiverField[] = ['start', 'years', 'inflation', 'savingsRate', 'investRate'];

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
  inputs: RiverInputs;
  /** Raw field text; may be invalid. Rates are shown in percent. */
  draft: DraftFields;
  errors: RiverValidation['errors'];
  targetScale: number;
  displayScale: number;
  /** THE shared clock, in years (float). It starts at 0, paused: the viewer plays it or drags it. */
  years: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  /** How fast the shared clock moved in the last tick, in years per second (0 when not playing). */
  yearsPerSecond: number;
}

/** A full run of the timeline takes this long at 1x, whatever its length (the default 30 years: 1.25 years a second). */
export const PLAY_SECONDS = 24;
/** Playback at 1x, in years a second: the timeline over PLAY_SECONDS (never slower than a quarter year a second). */
export const playRate = (horizon: number): number => Math.max(0.25, horizon / PLAY_SECONDS);
/** Max time step the clock will take in one frame (so tab switches don't jump). */
export const MAX_DT = 0.1;
/** Scale easing time constants, seconds. */
export const SCALE_TAU = 0.3;
export const SCALE_TAU_REDUCED = 0.15;

/** Percent text for a decimal rate: 0.06 -> "6", 0.065 -> "6.5". */
export function rateToDraft(decimal: number): string {
  return String(Math.round(decimal * 10000) / 100);
}

export function inputsToDraft(i: RiverInputs): DraftFields {
  return {
    start: i.start.toLocaleString('en-US', { maximumFractionDigits: 2 }),
    years: String(i.years),
    inflation: rateToDraft(i.inflation),
    savingsRate: rateToDraft(i.savingsRate),
    investRate: rateToDraft(i.investRate),
  };
}

export function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s$%]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

const toDecimal = (pct: number): number => Math.round(pct * 1e4) / 1e6;

/** Converts raw field text to engine inputs (rate percent -> decimal). Unparseable fields become NaN. */
export function draftToInputs(d: DraftFields): RiverInputs {
  return {
    start: parseNumber(d.start),
    years: parseNumber(d.years),
    inflation: toDecimal(parseNumber(d.inflation)),
    savingsRate: toDecimal(parseNumber(d.savingsRate)),
    investRate: toDecimal(parseNumber(d.investRate)),
  };
}

function sameInputs(a: RiverInputs, b: RiverInputs): boolean {
  return (
    a.start === b.start &&
    a.years === b.years &&
    Math.abs(a.inflation - b.inflation) < 1e-12 &&
    Math.abs(a.savingsRate - b.savingsRate) < 1e-12 &&
    Math.abs(a.investRate - b.investRate) < 1e-12
  );
}

/** Range of each field in the units the field shows (rates in percent). */
export const FIELD_RANGE: Record<RiverField, { min: number; max: number }> = {
  start: { min: RIVER_LIMITS.start.min, max: RIVER_LIMITS.start.max },
  years: { min: RIVER_LIMITS.years.min, max: RIVER_LIMITS.years.max },
  inflation: { min: RIVER_LIMITS.inflation.min * 100, max: RIVER_LIMITS.inflation.max * 100 },
  savingsRate: { min: RIVER_LIMITS.savingsRate.min * 100, max: RIVER_LIMITS.savingsRate.max * 100 },
  investRate: { min: RIVER_LIMITS.investRate.min * 100, max: RIVER_LIMITS.investRate.max * 100 },
};

/** One stepper click, in the field's own units. The starting amount takes bigger steps the bigger it is. */
export function fieldStep(field: RiverField, current: number): number {
  switch (field) {
    case 'start':
      return current >= 10_000 ? 1000 : current >= 1000 ? 500 : RIVER_LIMITS.start.step;
    case 'years':
      return RIVER_LIMITS.years.step;
    case 'inflation':
      return RIVER_LIMITS.inflation.step * 100;
    case 'savingsRate':
      return RIVER_LIMITS.savingsRate.step * 100;
    case 'investRate':
      return RIVER_LIMITS.investRate.step * 100;
  }
}

export interface Actions {
  setDraftField(field: RiverField, text: string): void;
  /** Applies the draft if valid; otherwise records errors and keeps the last valid inputs. */
  commitInputs(): void;
  /** Normalises a field's text to its canonical form (call on blur). */
  tidyField(field: RiverField): void;
  /** Nudges a field by `dir` steps (clamped to the limits) and commits immediately. */
  stepField(field: RiverField, dir: 1 | -1): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Move the shared clock to `years` (clamped to 0…inputs.years). Paused. */
  scrubTo(years: number): void;
  setSpeed(speed: Speed): void;
  setReducedMotion(on: boolean): void;
}

export interface Store {
  state: AppState;
  actions: Actions;
  subscribe(fn: (reason: Reason) => void): () => void;
  /** Advance the clocks by dt seconds (clamped to MAX_DT). Called by the rAF loop. */
  tick(dtSeconds: number): void;
}

export function createStore(opts: { reducedMotion?: boolean; inputs?: RiverInputs } = {}): Store {
  const inputs = { ...(opts.inputs ?? DEFAULT_RIVER_INPUTS) };
  const reducedMotion = opts.reducedMotion ?? false;
  const scale = riverScale(inputs);
  const state: AppState = {
    inputs,
    draft: inputsToDraft(inputs),
    errors: {},
    targetScale: scale,
    displayScale: scale,
    years: 0,
    playing: false,
    speed: 1,
    reducedMotion,
    yearsPerSecond: 0,
  };
  const listeners = new Set<(r: Reason) => void>();
  const emit = (r: Reason) => listeners.forEach((fn) => fn(r));
  const end = () => state.inputs.years;



  const actions: Actions = {
    setDraftField(field, text) {
      state.draft = { ...state.draft, [field]: text };
      emit('draft');
    },

    commitInputs() {
      const candidate = draftToInputs(state.draft);
      const result = validateRiverInputs(candidate);
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
      state.targetScale = riverScale(candidate);
      if (state.years > end()) {
        state.years = end();
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
      actions.setDraftField(field, field === 'start' ? next.toLocaleString('en-US') : String(next));
      actions.commitInputs();
    },

    play() {
      if (end() <= 0) return;
      if (state.years >= end() - 1e-6) state.years = 0;
      state.playing = true;
      emit('play');
    },

    pause() {
      if (!state.playing) return;
      state.playing = false;
      state.yearsPerSecond = 0;
      emit('pause');
    },

    togglePlay() {
      if (state.playing) actions.pause();
      else actions.play();
    },



    scrubTo(years) {
      state.playing = false;
      state.years = Math.min(end(), Math.max(0, years));
      emit('scrub');
    },

    setSpeed(speed) {
      state.speed = speed;
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
    const before = state.years;
    if (state.playing) {
      state.years += playRate(end()) * state.speed * dt;
      if (state.years >= end()) {
        state.years = end();
        state.playing = false;
        emit('play-end');
      }
    }
    state.yearsPerSecond = state.playing && dt > 0 ? Math.max(0, (state.years - before) / dt) : 0;
    // Ease the shared scale toward its target (all three boats together, never per boat).
    const tau = state.reducedMotion ? SCALE_TAU_REDUCED : SCALE_TAU;
    const diff = state.targetScale - state.displayScale;
    if (Math.abs(diff) < state.targetScale * 1e-4) state.displayScale = state.targetScale;
    else state.displayScale += diff * (1 - Math.exp(-dt / tau));
  };

  return {
    state,
    actions,
    tick,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
