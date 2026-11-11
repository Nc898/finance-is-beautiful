/**
 * The single application state object plus small action functions.
 * No DOM access: everything here is unit-testable.
 */
import { BASKET_LIMITS, DATA_MONTHS, DEFAULT_BASKET, ITEM_KEYS, validateBasket } from '../engine';
import type { BasketInputs, BasketValidation, ItemKey } from '../engine';

/** Playback speed, a multiple of the normal pace: anywhere from SPEED_MIN to SPEED_MAX, in tenths. */
export type Speed = number;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 5;
/** a speed within the range, rounded to a tenth (so the readout never shows 2.37x) */
export const clampSpeed = (s: number): Speed => {
  const v = Number.isFinite(s) ? s : 1;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) * 10) / 10;
};

export type DraftFields = Record<ItemKey, string>;
/** Every field, in panel order. */
export const FIELDS: readonly ItemKey[] = ITEM_KEYS;

/** The last month on the timeline. */
export const LAST_MONTH = DATA_MONTHS - 1;

/** Why subscribers were notified; discrete events only, never per frame. */
export type Reason = 'draft' | 'inputs' | 'errors' | 'play' | 'pause' | 'speed' | 'scrub' | 'play-end' | 'reduced';

export interface AppState {
  /** Last VALID basket. */
  basket: BasketInputs;
  /** Raw field text; may be invalid. */
  draft: DraftFields;
  errors: BasketValidation['errors'];
  /** THE clock, in months (float, 0 … LAST_MONTH). It starts at 0 (January 1980), paused: the viewer plays or drags it. */
  month: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  /** How fast the clock moved in the last tick, in months per second (0 when not playing). */
  monthsPerSecond: number;
  /** Counts the jumps (a drag, a restart): the loop tells the scene to place everything settled on the frame it sees one. */
  jumps: number;
}

/** A year takes this long at 1x: time for the grocer to re-chalk the board once a year at a legible pace. */
export const SECONDS_PER_YEAR = 6;
/** A full run of the timeline takes this long at 1x (about four and a half minutes; the speed slider goes to 5x). */
export const PLAY_SECONDS = (LAST_MONTH / 12) * SECONDS_PER_YEAR;
/** Playback at 1x, in months a second. */
export const PLAY_RATE = LAST_MONTH / PLAY_SECONDS;
/** Max time step the clock will take in one frame (so tab switches don't jump). */
export const MAX_DT = 0.1;

export const inputsToDraft = (b: BasketInputs): DraftFields => {
  const d = {} as DraftFields;
  for (const k of ITEM_KEYS) d[k] = String(b.qty[k]);
  return d;
};

export function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

/** Converts raw field text to a basket. Unparseable fields become NaN (and fail validation). */
export function draftToInputs(d: DraftFields): BasketInputs {
  const qty = {} as Record<ItemKey, number>;
  for (const k of ITEM_KEYS) qty[k] = parseNumber(d[k]);
  return { qty };
}

const sameBasket = (a: BasketInputs, b: BasketInputs): boolean => ITEM_KEYS.every((k) => a.qty[k] === b.qty[k]);
const cloneBasket = (b: BasketInputs): BasketInputs => ({ qty: { ...b.qty } });

export interface Actions {
  setDraftField(field: ItemKey, text: string): void;
  /** Applies the draft if valid; otherwise records errors and keeps the last valid basket. */
  commitInputs(): void;
  /** Normalises a field's text to its canonical form (call on blur). */
  tidyField(field: ItemKey): void;
  /** Nudges a quantity by `dir` (clamped to its limits) and commits immediately. */
  stepField(field: ItemKey, dir: 1 | -1): void;
  /** Play from where the clock is (from January 1980 again if it is at the end). */
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Move the clock to `month` (clamped to 0 … LAST_MONTH), paused. */
  scrubTo(month: number): void;
  setSpeed(speed: Speed): void;
  setReducedMotion(on: boolean): void;
}

export interface Store {
  state: AppState;
  actions: Actions;
  subscribe(fn: (reason: Reason) => void): () => void;
  /** Advance the clock by dt seconds (clamped to MAX_DT). Called by the rAF loop. */
  tick(dtSeconds: number): void;
}

export function createStore(opts: { reducedMotion?: boolean; basket?: BasketInputs } = {}): Store {
  const basket = cloneBasket(opts.basket ?? DEFAULT_BASKET);
  const state: AppState = {
    basket,
    draft: inputsToDraft(basket),
    errors: {},
    month: 0,
    playing: false,
    speed: 1,
    reducedMotion: opts.reducedMotion ?? false,
    monthsPerSecond: 0,
    jumps: 0,
  };
  const listeners = new Set<(r: Reason) => void>();
  const emit = (r: Reason) => listeners.forEach((fn) => fn(r));

  const actions: Actions = {
    setDraftField(field, text) {
      state.draft = { ...state.draft, [field]: text };
      emit('draft');
    },

    commitInputs() {
      const candidate = draftToInputs(state.draft);
      const result = validateBasket(candidate);
      if (!result.ok) {
        state.errors = result.errors;
        emit('errors');
        return;
      }
      const hadErrors = Object.keys(state.errors).length > 0;
      state.errors = {};
      if (sameBasket(candidate, state.basket)) {
        if (hadErrors) emit('errors');
        return;
      }
      state.basket = candidate;
      emit('inputs');
    },

    tidyField(field) {
      if (state.errors[field]) return;
      const canonical = inputsToDraft(state.basket)[field];
      if (parseNumber(state.draft[field]) !== parseNumber(canonical)) return;
      if (state.draft[field] !== canonical) {
        state.draft = { ...state.draft, [field]: canonical };
        emit('draft');
      }
    },

    stepField(field, dir) {
      const { min, max } = BASKET_LIMITS[field];
      let current = parseNumber(state.draft[field]);
      if (!Number.isFinite(current)) current = state.basket.qty[field];
      // a fractional or out-of-range draft steps to the next whole number in that direction
      const next = Math.min(max, Math.max(min, dir > 0 ? Math.floor(current) + 1 : Math.ceil(current) - 1));
      actions.setDraftField(field, String(next));
      actions.commitInputs();
    },

    play() {
      if (state.month >= LAST_MONTH - 1e-6) {
        state.month = 0;
        state.jumps++;
      }
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

    scrubTo(month) {
      state.playing = false;
      state.month = Math.min(LAST_MONTH, Math.max(0, Number.isFinite(month) ? month : 0));
      state.jumps++;
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
    const before = state.month;
    if (state.playing) {
      state.month += PLAY_RATE * state.speed * dt;
      if (state.month >= LAST_MONTH) {
        state.month = LAST_MONTH;
        state.playing = false;
        emit('play-end');
      }
    }
    state.monthsPerSecond = state.playing && dt > 0 ? Math.max(0, (state.month - before) / dt) : 0;
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
