/**
 * The single application state object plus small action functions.
 * No DOM access: everything here is unit-testable.
 */
import { DEBTS, DEFAULT_SNOW_INPUTS, SNOW_FIELDS, SNOW_LIMITS, horizonMonths, validateSnowInputs } from '../engine';
import type { DebtField, DebtId, SnowField, SnowInputs, SnowValidation } from '../engine';

/** Playback speed, a multiple of the normal pace: anywhere from SPEED_MIN to SPEED_MAX, in tenths. */
export type Speed = number;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 5;
/** a speed within the range, rounded to a tenth (so the readout never shows 2.37x) */
export const clampSpeed = (s: number): Speed => {
  const v = Number.isFinite(s) ? s : 1;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) * 10) / 10;
};
export type DraftFields = Record<SnowField, string>;
/** Every field, in panel order: the budget, then each debt's balance, rate and minimum. */
export const FIELDS: readonly SnowField[] = SNOW_FIELDS;

/** Splits 'card.apr' into its debt and field; the budget has neither. */
export function splitField(field: SnowField): { debt: DebtId; key: DebtField } | null {
  if (field === 'budget') return null;
  const [debt, key] = field.split('.') as [DebtId, DebtField];
  return { debt, key };
}

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
  inputs: SnowInputs;
  /** Raw field text; may be invalid. Rates are shown in percent. */
  draft: DraftFields;
  errors: SnowValidation['errors'];
  /** THE shared clock, in months (float). It starts at 0, paused: the viewer plays it or drags it. */
  months: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  /** How fast the shared clock moved in the last tick, in months per second (0 when not playing). */
  monthsPerSecond: number;
}

/** A full run of the timeline takes this long at 1x, whatever its length (slow enough to watch each push). */
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

export function inputsToDraft(i: SnowInputs): DraftFields {
  const draft = { budget: money(i.budget) } as DraftFields;
  for (const d of DEBTS) {
    draft[`${d}.balance`] = money(i.debts[d].balance);
    draft[`${d}.apr`] = rateToDraft(i.debts[d].apr);
    draft[`${d}.minPayment`] = money(i.debts[d].minPayment);
  }
  return draft;
}

export function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s$%]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

const toDecimal = (pct: number): number => Math.round(pct * 1e4) / 1e6;

/** Converts raw field text to engine inputs (rate percent -> decimal). Unparseable fields become NaN. */
export function draftToInputs(d: DraftFields): SnowInputs {
  const debts = {} as SnowInputs['debts'];
  for (const id of DEBTS) {
    debts[id] = {
      balance: parseNumber(d[`${id}.balance`]),
      apr: toDecimal(parseNumber(d[`${id}.apr`])),
      minPayment: parseNumber(d[`${id}.minPayment`]),
    };
  }
  return { debts, budget: parseNumber(d.budget) };
}

function sameInputs(a: SnowInputs, b: SnowInputs): boolean {
  return (
    a.budget === b.budget &&
    DEBTS.every(
      (d) =>
        a.debts[d].balance === b.debts[d].balance &&
        Math.abs(a.debts[d].apr - b.debts[d].apr) < 1e-12 &&
        a.debts[d].minPayment === b.debts[d].minPayment,
    )
  );
}

const cloneInputs = (i: SnowInputs): SnowInputs => ({
  budget: i.budget,
  debts: { medical: { ...i.debts.medical }, car: { ...i.debts.car }, card: { ...i.debts.card } },
});

/** Range of each kind of field in the units the field shows (rates in percent). */
export const FIELD_RANGE: Record<'budget' | DebtField, { min: number; max: number }> = {
  budget: { min: SNOW_LIMITS.budget.min, max: SNOW_LIMITS.budget.max },
  balance: { min: SNOW_LIMITS.balance.min, max: SNOW_LIMITS.balance.max },
  apr: { min: SNOW_LIMITS.apr.min * 100, max: SNOW_LIMITS.apr.max * 100 },
  minPayment: { min: SNOW_LIMITS.minPayment.min, max: SNOW_LIMITS.minPayment.max },
};

/** The kind of a field: 'budget', 'balance', 'apr' or 'minPayment'. */
export const fieldKind = (field: SnowField): 'budget' | DebtField => splitField(field)?.key ?? 'budget';

/** One stepper click, in the field's own units. Dollar fields take bigger steps the bigger they are. */
export function fieldStep(field: SnowField, current: number): number {
  switch (fieldKind(field)) {
    case 'balance':
      return current >= 10_000 ? 1000 : current >= 1000 ? 500 : SNOW_LIMITS.balance.step;
    case 'apr':
      return SNOW_LIMITS.apr.step * 100;
    case 'budget':
      return current >= 10_000 ? 1000 : current >= 2000 ? 250 : current >= 500 ? 50 : SNOW_LIMITS.budget.step;
    case 'minPayment':
      return current >= 1000 ? 100 : current >= 250 ? 25 : current >= 100 ? 10 : SNOW_LIMITS.minPayment.step;
  }
}

export interface Actions {
  setDraftField(field: SnowField, text: string): void;
  /** Applies the draft if valid; otherwise records errors and keeps the last valid inputs. */
  commitInputs(): void;
  /** Normalises a field's text to its canonical form (call on blur). */
  tidyField(field: SnowField): void;
  /** Nudges a field by `dir` steps (clamped to the limits) and commits immediately. */
  stepField(field: SnowField, dir: 1 | -1): void;
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
  /** The timeline length in months for the current inputs (the later payoff). */
  horizon(): number;
}

export function createStore(opts: { reducedMotion?: boolean; inputs?: SnowInputs } = {}): Store {
  const inputs = cloneInputs(opts.inputs ?? DEFAULT_SNOW_INPUTS);
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
      const result = validateSnowInputs(candidate);
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
      actions.setDraftField(field, kind === 'apr' ? String(next) : next.toLocaleString('en-US'));
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
