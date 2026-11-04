/**
 * The single application state object plus small action functions.
 * No DOM access: everything here is unit-testable.
 */
import { DEFAULT_ORCHARD_INPUTS, ORCHARD_FIELDS, ORCHARD_LIMITS, PICKERS, horizonMonths, validateOrchardInputs } from '../engine';
import type { OrchardField, OrchardInputs, OrchardValidation } from '../engine';

/** Playback speed, a multiple of the normal pace: anywhere from SPEED_MIN to SPEED_MAX, in tenths. */
export type Speed = number;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 5;
/** a speed within the range, rounded to a tenth (so the readout never shows 2.37x) */
export const clampSpeed = (s: number): Speed => {
  const v = Number.isFinite(s) ? s : 1;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) * 10) / 10;
};
export type DraftFields = Record<OrchardField, string>;
/** Every field, in panel order: pay, years, growth, the match and its limit, then each picker's saving. */
export const FIELDS: readonly OrchardField[] = ORCHARD_FIELDS;

/** The kind of a field: pay, years, or one of the shares shown in percent. */
export type FieldKind = 'salary' | 'years' | 'growth' | 'rate' | 'limit' | 'save';
export const fieldKind = (field: OrchardField): FieldKind => (field.endsWith('.save') ? 'save' : (field as FieldKind));
/** The fields shown in percent (decimals in the engine). */
const isShare = (kind: FieldKind): boolean => kind !== 'salary' && kind !== 'years';

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
  inputs: OrchardInputs;
  /** Raw field text; may be invalid. Shares are shown in percent. */
  draft: DraftFields;
  errors: OrchardValidation['errors'];
  /** THE shared clock, in months (float). It starts at 0, paused: the viewer plays it or drags it. */
  months: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  /** How fast the shared clock moved in the last tick, in months per second (0 when not playing). */
  monthsPerSecond: number;
}

/** A full run of the timeline takes this long at 1x, whatever its length (the default 30 years: 12 months a second). */
export const PLAY_SECONDS = 30;
/** Playback at 1x, in months a second: the timeline over PLAY_SECONDS (never slower than half a month a second). */
export const playRate = (horizon: number): number => Math.max(0.5, horizon / PLAY_SECONDS);
/** Max time step the clock will take in one frame (so tab switches don't jump). */
export const MAX_DT = 0.1;

/** Percent text for a decimal share: 0.03 -> "3", 0.065 -> "6.5", 0.0725 -> "7.25". */
export function shareToDraft(decimal: number): string {
  return String(Math.round(decimal * 1e5) / 1e3);
}

const money = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function inputsToDraft(i: OrchardInputs): DraftFields {
  return {
    salary: money(i.salary),
    years: String(i.years),
    growth: shareToDraft(i.growth),
    rate: shareToDraft(i.match.rate),
    limit: shareToDraft(i.match.limit),
    'a.save': shareToDraft(i.save.a),
    'b.save': shareToDraft(i.save.b),
  };
}

export function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s$%¢]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

/** Percent to a decimal, rounded to a thousandth of a percent (so 6.5 is exactly 0.065). */
const toDecimal = (pct: number): number => Math.round(pct * 1e3) / 1e5;

/** Converts raw field text to engine inputs (percent -> decimal). Unparseable fields become NaN. */
export function draftToInputs(d: DraftFields): OrchardInputs {
  return {
    salary: parseNumber(d.salary),
    years: parseNumber(d.years),
    growth: toDecimal(parseNumber(d.growth)),
    match: { rate: toDecimal(parseNumber(d.rate)), limit: toDecimal(parseNumber(d.limit)) },
    save: { a: toDecimal(parseNumber(d['a.save'])), b: toDecimal(parseNumber(d['b.save'])) },
  };
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-12;

function sameInputs(a: OrchardInputs, b: OrchardInputs): boolean {
  return (
    a.salary === b.salary &&
    a.years === b.years &&
    near(a.growth, b.growth) &&
    near(a.match.rate, b.match.rate) &&
    near(a.match.limit, b.match.limit) &&
    PICKERS.every((id) => near(a.save[id], b.save[id]))
  );
}

const cloneInputs = (i: OrchardInputs): OrchardInputs => ({ ...i, match: { ...i.match }, save: { ...i.save } });

/** Range of each kind of field in the units the field shows (shares in percent). */
export const FIELD_RANGE: Record<FieldKind, { min: number; max: number }> = {
  salary: { min: ORCHARD_LIMITS.salary.min, max: ORCHARD_LIMITS.salary.max },
  years: { min: ORCHARD_LIMITS.years.min, max: ORCHARD_LIMITS.years.max },
  growth: { min: ORCHARD_LIMITS.growth.min * 100, max: ORCHARD_LIMITS.growth.max * 100 },
  rate: { min: ORCHARD_LIMITS.rate.min * 100, max: ORCHARD_LIMITS.rate.max * 100 },
  limit: { min: ORCHARD_LIMITS.limit.min * 100, max: ORCHARD_LIMITS.limit.max * 100 },
  save: { min: ORCHARD_LIMITS.save.min * 100, max: ORCHARD_LIMITS.save.max * 100 },
};

/** One stepper click, in the field's own units. Pay takes bigger steps the bigger it is. */
export function fieldStep(field: OrchardField, current: number): number {
  const kind = fieldKind(field);
  switch (kind) {
    case 'salary':
      return current >= 100_000 ? 5_000 : ORCHARD_LIMITS.salary.step;
    case 'years':
      return ORCHARD_LIMITS.years.step;
    default:
      return ORCHARD_LIMITS[kind].step * 100;
  }
}

export interface Actions {
  setDraftField(field: OrchardField, text: string): void;
  /** Applies the draft if valid; otherwise records errors and keeps the last valid inputs. */
  commitInputs(): void;
  /** Normalises a field's text to its canonical form (call on blur). */
  tidyField(field: OrchardField): void;
  /** Nudges a field by `dir` steps (clamped to the limits) and commits immediately. */
  stepField(field: OrchardField, dir: 1 | -1): void;
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
  /** The timeline length in months for the current inputs (years × 12). */
  horizon(): number;
}

export function createStore(opts: { reducedMotion?: boolean; inputs?: OrchardInputs } = {}): Store {
  const inputs = cloneInputs(opts.inputs ?? DEFAULT_ORCHARD_INPUTS);
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
      const result = validateOrchardInputs(candidate);
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
      actions.setDraftField(field, kind === 'salary' ? next.toLocaleString('en-US') : isShare(kind) ? shareToDraft(next / 100) : String(next));
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
