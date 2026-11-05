/**
 * The single application state object plus small action functions (as Brick's store). No DOM access.
 */
import { DEFAULT_WOOD_INPUTS, FUNDS, WOOD_FIELDS, WOOD_LIMITS, horizonMonths, validateWoodInputs } from '../engine';
import type { WoodField, WoodInputs, WoodValidation } from '../engine';

export type Speed = number;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 5;
export const clampSpeed = (s: number): Speed => {
  const v = Number.isFinite(s) ? s : 1;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) * 10) / 10;
};
export type DraftFields = Record<WoodField, string>;
export const FIELDS: readonly WoodField[] = WOOD_FIELDS;

/** The kind of a field, by its units. */
export type FieldKind = 'start' | 'monthly' | 'years' | 'growth' | 'fee';
export const fieldKind = (f: WoodField): FieldKind => (f.endsWith('.fee') ? 'fee' : (f as FieldKind));

export type Reason = 'draft' | 'inputs' | 'errors' | 'play' | 'pause' | 'speed' | 'scrub' | 'play-end' | 'reduced';

export interface AppState {
  inputs: WoodInputs;
  draft: DraftFields;
  errors: WoodValidation['errors'];
  months: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  monthsPerSecond: number;
}

/** A full run of the timeline takes this long at 1x, whatever its length (40 years: 16 months a second). */
export const PLAY_SECONDS = 30;
export const playRate = (horizon: number): number => Math.max(0.5, horizon / PLAY_SECONDS);
export const MAX_DT = 0.1;

export function rateToDraft(decimal: number): string {
  return String(Math.round(decimal * 1e5) / 1e3);
}
const money = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function inputsToDraft(i: WoodInputs): DraftFields {
  return {
    start: money(i.start),
    monthly: money(i.monthly),
    years: String(i.years),
    growth: rateToDraft(i.growth),
    'a.fee': rateToDraft(i.fees.a),
    'b.fee': rateToDraft(i.fees.b),
  };
}

export function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s$%]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

const toDecimal = (pct: number): number => Math.round(pct * 1e3) / 1e5;

export function draftToInputs(d: DraftFields): WoodInputs {
  return {
    start: parseNumber(d.start),
    monthly: parseNumber(d.monthly),
    years: parseNumber(d.years),
    growth: toDecimal(parseNumber(d.growth)),
    fees: { a: toDecimal(parseNumber(d['a.fee'])), b: toDecimal(parseNumber(d['b.fee'])) },
  };
}

function sameInputs(a: WoodInputs, b: WoodInputs): boolean {
  const eq = (x: number, y: number) => Math.abs(x - y) < 1e-12;
  return a.start === b.start && a.monthly === b.monthly && a.years === b.years && eq(a.growth, b.growth) && FUNDS.every((id) => eq(a.fees[id], b.fees[id]));
}

const cloneInputs = (i: WoodInputs): WoodInputs => ({ ...i, fees: { ...i.fees } });

/** Range of each kind of field in the units the field shows (rates in percent). */
export const FIELD_RANGE: Record<FieldKind, { min: number; max: number }> = {
  start: { min: WOOD_LIMITS.start.min, max: WOOD_LIMITS.start.max },
  monthly: { min: WOOD_LIMITS.monthly.min, max: WOOD_LIMITS.monthly.max },
  years: { min: WOOD_LIMITS.years.min, max: WOOD_LIMITS.years.max },
  growth: { min: WOOD_LIMITS.growth.min * 100, max: WOOD_LIMITS.growth.max * 100 },
  fee: { min: WOOD_LIMITS.fee.min * 100, max: WOOD_LIMITS.fee.max * 100 },
};

/** One stepper click, in the field's own units (money takes bigger steps the bigger it is). */
export function fieldStep(field: WoodField, current: number): number {
  switch (fieldKind(field)) {
    case 'start':
      return current >= 100_000 ? 10_000 : WOOD_LIMITS.start.step;
    case 'monthly':
      return current >= 2_000 ? 250 : WOOD_LIMITS.monthly.step;
    case 'years':
      return 1;
    case 'growth':
      return WOOD_LIMITS.growth.step * 100;
    case 'fee':
      // fees move in tenths of a percent, and in hundredths under a quarter of a percent
      return current < 0.25 ? 0.05 : 0.1;
  }
}

export interface Actions {
  setDraftField(field: WoodField, text: string): void;
  commitInputs(): void;
  tidyField(field: WoodField): void;
  stepField(field: WoodField, dir: 1 | -1): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  scrubTo(months: number): void;
  setSpeed(speed: Speed): void;
  setReducedMotion(on: boolean): void;
}

export interface Store {
  state: AppState;
  actions: Actions;
  subscribe(fn: (reason: Reason) => void): () => void;
  tick(dtSeconds: number): void;
  horizon(): number;
}

export function createStore(opts: { reducedMotion?: boolean; inputs?: WoodInputs } = {}): Store {
  const inputs = cloneInputs(opts.inputs ?? DEFAULT_WOOD_INPUTS);
  const state: AppState = {
    inputs,
    draft: inputsToDraft(inputs),
    errors: {},
    months: 0,
    playing: false,
    speed: 1,
    reducedMotion: opts.reducedMotion ?? false,
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
      const result = validateWoodInputs(candidate);
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
      const step = fieldStep(field, dir > 0 ? current : Math.max(min, current - 1e-9));
      const q = current / step;
      const onGrid = Math.abs(q - Math.round(q)) < 1e-9;
      let next = onGrid ? current + dir * step : (dir > 0 ? Math.ceil(q) : Math.floor(q)) * step;
      next = Math.round(Math.min(max, Math.max(min, next)) * 1e6) / 1e6;
      actions.setDraftField(field, kind === 'start' || kind === 'monthly' ? next.toLocaleString('en-US') : String(next));
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
