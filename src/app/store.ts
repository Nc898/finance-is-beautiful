/**
 * The single application state object plus small action functions.
 * No DOM access: everything here is unit-testable.
 */
import {
  DEFAULT_INPUTS,
  LIMITS,
  buildScenario,
  validateInputs,
  visualScaleFor,
} from '../engine';
import type { InputField, Inputs, Scenario, ValidationResult } from '../engine';

export type Speed = 0.5 | 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 4];
export type DraftFields = Record<InputField, string>;

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
  inputs: Inputs;
  /** Raw field text; may be invalid. The return field is shown in percent. */
  draft: DraftFields;
  errors: ValidationResult['errors'];
  scenario: Scenario;
  targetScale: number;
  displayScale: number;
  /** THE shared clock, in months (float). */
  ageMonths: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
}

/** A full run of the timeline takes this long at 1x, whatever its length (the default 40 years: 20 months a second). */
export const PLAY_SECONDS = 24;
/** Playback at 1x, in months a second: the timeline over PLAY_SECONDS (never slower than half a month a second). */
export const playRate = (span: number): number => Math.max(0.5, span / PLAY_SECONDS);
/** Max time step the clock will take in one frame (so tab switches don't jump). */
export const MAX_DT = 0.1;
/** Scale easing time constants, seconds. */
export const SCALE_TAU = 0.3;
export const SCALE_TAU_REDUCED = 0.15;

/** Percent text for a decimal return: 0.06 -> "6", 0.065 -> "6.5". */
export function returnToDraft(decimal: number): string {
  return String(Math.round(decimal * 10000) / 100);
}

export function inputsToDraft(i: Inputs): DraftFields {
  return {
    startAgeA: String(i.startAgeA),
    startAgeB: String(i.startAgeB),
    endAge: String(i.endAge),
    monthlyContribution: String(i.monthlyContribution),
    annualReturn: returnToDraft(i.annualReturn),
  };
}

function parseNumber(text: string): number {
  const t = text.trim().replace(/[,\s$%]/g, '').replace(/−/g, '-');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

/** Converts raw field text to engine inputs (return percent -> decimal). Unparseable fields become NaN. */
export function draftToInputs(d: DraftFields): Inputs {
  const pct = parseNumber(d.annualReturn);
  return {
    startAgeA: parseNumber(d.startAgeA),
    startAgeB: parseNumber(d.startAgeB),
    endAge: parseNumber(d.endAge),
    monthlyContribution: parseNumber(d.monthlyContribution),
    annualReturn: Math.round(pct * 1e4) / 1e6,
  };
}

function sameInputs(a: Inputs, b: Inputs): boolean {
  return (
    a.startAgeA === b.startAgeA &&
    a.startAgeB === b.startAgeB &&
    a.endAge === b.endAge &&
    a.monthlyContribution === b.monthlyContribution &&
    Math.abs(a.annualReturn - b.annualReturn) < 1e-12
  );
}

export const FIELD_STEP: Record<InputField, number> = {
  startAgeA: LIMITS.age.step,
  startAgeB: LIMITS.age.step,
  endAge: LIMITS.age.step,
  monthlyContribution: LIMITS.contribution.step,
  /** Percent points. */
  annualReturn: LIMITS.annualReturn.step * 100,
};

export const FIELD_RANGE: Record<InputField, { min: number; max: number }> = {
  startAgeA: { min: LIMITS.age.min, max: LIMITS.age.max },
  startAgeB: { min: LIMITS.age.min, max: LIMITS.age.max },
  endAge: { min: LIMITS.age.min, max: LIMITS.age.max },
  monthlyContribution: { min: LIMITS.contribution.min, max: LIMITS.contribution.max },
  annualReturn: { min: LIMITS.annualReturn.min * 100, max: LIMITS.annualReturn.max * 100 },
};

export interface Actions {
  setDraftField(field: InputField, text: string): void;
  /** Applies the draft if valid; otherwise records errors and keeps the last valid scenario. */
  commitInputs(): void;
  /** Normalises a field's text to its canonical form (call on blur). */
  tidyField(field: InputField): void;
  /** Nudges a field by `dir` steps (clamped to LIMITS) and commits immediately. */
  stepField(field: InputField, dir: 1 | -1): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  scrubTo(ageMonths: number): void;
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

export function createStore(opts: { reducedMotion?: boolean; inputs?: Inputs } = {}): Store {
  const inputs = { ...(opts.inputs ?? DEFAULT_INPUTS) };
  const scenario = buildScenario(inputs);
  const reducedMotion = opts.reducedMotion ?? false;
  const scale = visualScaleFor(scenario);
  const state: AppState = {
    inputs,
    draft: inputsToDraft(inputs),
    errors: {},
    scenario,
    targetScale: scale,
    displayScale: scale,
    // the clock starts where the timeline does (the earlier planting), paused
    ageMonths: scenario.timelineStartMonths,
    playing: false,
    speed: 1,
    reducedMotion,
  };
  const listeners = new Set<(r: Reason) => void>();
  const emit = (r: Reason) => listeners.forEach((fn) => fn(r));
  const tlStart = () => state.scenario.timelineStartMonths;
  const tlEnd = () => state.scenario.timelineEndMonths;

  const actions: Actions = {
    setDraftField(field, text) {
      state.draft = { ...state.draft, [field]: text };
      emit('draft');
    },

    commitInputs() {
      const candidate = draftToInputs(state.draft);
      const result = validateInputs(candidate);
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
      state.scenario = buildScenario(candidate);
      state.targetScale = visualScaleFor(state.scenario);
      if (state.ageMonths < tlStart()) state.ageMonths = tlStart();
      if (state.ageMonths > tlEnd()) {
        state.ageMonths = tlEnd();
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
      const step = FIELD_STEP[field];
      let current = parseNumber(state.draft[field]);
      if (!Number.isFinite(current)) current = parseNumber(inputsToDraft(state.inputs)[field]);
      // Move one step; if off the step grid, snap to the next grid line in that direction.
      const q = current / step;
      const onGrid = Math.abs(q - Math.round(q)) < 1e-9;
      let next = onGrid ? current + dir * step : (dir > 0 ? Math.ceil(q) : Math.floor(q)) * step;
      next = Math.round(Math.min(max, Math.max(min, next)) * 1e6) / 1e6;
      actions.setDraftField(field, String(next));
      actions.commitInputs();
    },

    play() {
      if (tlEnd() <= tlStart()) return;
      if (state.ageMonths >= tlEnd() - 1e-6) state.ageMonths = tlStart();
      state.playing = true;
      emit('play');
    },

    pause() {
      if (!state.playing) return;
      state.playing = false;
      emit('pause');
    },

    togglePlay() {
      if (state.playing) actions.pause();
      else actions.play();
    },



    scrubTo(ageMonths) {
      state.playing = false;
      state.ageMonths = Math.min(tlEnd(), Math.max(tlStart(), ageMonths));
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
    if (state.playing) {
      state.ageMonths += playRate(tlEnd() - tlStart()) * state.speed * dt;
      if (state.ageMonths >= tlEnd()) {
        state.ageMonths = tlEnd();
        state.playing = false;
        emit('play-end');
      }
    }
    // Ease the shared visual scale toward its target (both trees together).
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
