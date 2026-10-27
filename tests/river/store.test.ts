import { describe, expect, it } from 'vitest';
import { DEFAULT_RIVER_INPUTS, RIVER_LIMITS, allBoats, effortOf, riverScale } from '../../src/river/engine';
import {
  FIELD_RANGE,
  MAX_DT,
  PLAY_SECONDS,
  SCALE_TAU,
  createStore,
  draftToInputs,
  fieldStep,
  inputsToDraft,
  parseNumber,
  playRate,
  rateToDraft,
} from '../../src/river/app/store';
import type { Reason } from '../../src/river/app/store';
import { BOAT_HALF_U, boatVisual, fitFactor } from '../../src/river/app/loop';

const D = DEFAULT_RIVER_INPUTS;
const END = D.years;

function run(store: ReturnType<typeof createStore>, seconds: number, dt = 1 / 30): void {
  for (let t = 0; t < seconds; t += dt) store.tick(dt);
}

describe('drafts', () => {
  it('shows rates in percent and dollars with grouping', () => {
    expect(inputsToDraft(D)).toEqual({ start: '10,000', years: '30', inflation: '3', savingsRate: '2', investRate: '6' });
    expect(rateToDraft(0.065)).toBe('6.5');
    expect(rateToDraft(-0.015)).toBe('-1.5');
  });

  it('round-trips through draftToInputs', () => {
    expect(draftToInputs(inputsToDraft(D))).toEqual(D);
    const odd = { start: 1_234_00, years: 45, inflation: 0.045, savingsRate: 0.0125, investRate: -0.035 };
    expect(draftToInputs(inputsToDraft(odd))).toEqual(odd);
  });

  it('parses commas, dollar signs, percent signs and true minus signs; rejects junk', () => {
    expect(parseNumber('$12,500')).toBe(12500);
    expect(parseNumber(' 4.5% ')).toBe(4.5);
    expect(parseNumber('−2')).toBe(-2);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('1e5')).toBeNaN();
    expect(parseNumber('1.2.3')).toBeNaN();
  });
});

describe('commitInputs', () => {
  it('applies valid drafts, updates the target scale and leaves the story', () => {
    const s = createStore();
    s.actions.setDraftField('inflation', '6');
    s.actions.commitInputs();
    expect(s.state.inputs.inflation).toBeCloseTo(0.06, 12);
    expect(s.state.targetScale).toBeCloseTo(riverScale(s.state.inputs), 12);
    expect(s.state.targetScale).toBeGreaterThan(riverScale(D));
    expect(s.state.playing).toBe(false);
  });

  it('keeps the last valid inputs and records an error for each bad field', () => {
    const s = createStore();
    const reasons: Reason[] = [];
    s.subscribe((r) => reasons.push(r));
    s.actions.setDraftField('years', '12.5');
    s.actions.setDraftField('investRate', 'lots');
    s.actions.commitInputs();
    expect(s.state.inputs).toEqual(D);
    expect(s.state.errors.years).toMatch(/whole/);
    expect(s.state.errors.investRate).toMatch(/must be a number/);
    expect(reasons).toContain('errors');
    // fixing the draft clears the errors
    s.actions.setDraftField('years', '12');
    s.actions.setDraftField('investRate', '6');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(s.state.inputs.years).toBe(12);
  });

  it('rejects out-of-range values', () => {
    const s = createStore();
    for (const [field, text] of [
      ['start', '50'],
      ['start', '2000000'],
      ['years', '0'],
      ['years', '61'],
      ['inflation', '13'],
      ['inflation', '-1'],
      ['savingsRate', '11'],
      ['investRate', '-6'],
      ['investRate', '16'],
    ] as const) {
      s.actions.setDraftField(field, text);
      s.actions.commitInputs();
      expect(s.state.errors[field], `${field}=${text}`).toBeTruthy();
      s.actions.setDraftField(field, inputsToDraft(D)[field]);
      s.actions.commitInputs();
      expect(s.state.errors).toEqual({});
    }
  });

  it('a no-op commit changes nothing and tells no one', () => {
    const s = createStore();
    const reasons: Reason[] = [];
    s.subscribe((r) => reasons.push(r));
    s.actions.setDraftField('years', '30');
    s.actions.commitInputs();
    expect(reasons).not.toContain('inputs');
  });

  it('shortening the timeline clamps the clock to the new end and pauses', () => {
    const s = createStore();
    s.actions.scrubTo(25);
    s.actions.setDraftField('years', '10');
    s.actions.commitInputs();
    expect(s.state.years).toBe(10);
    expect(s.state.playing).toBe(false);
  });

  it('lengthening keeps the clock where it is', () => {
    const s = createStore();
    s.actions.scrubTo(12);
    s.actions.setDraftField('years', '40');
    s.actions.commitInputs();
    expect(s.state.years).toBe(12);
  });

  it('tidyField restores the canonical text only when it means the same number', () => {
    const s = createStore();
    s.actions.setDraftField('start', '10000');
    s.actions.tidyField('start');
    expect(s.state.draft.start).toBe('10,000');
    s.actions.setDraftField('inflation', 'x');
    s.actions.commitInputs();
    s.actions.tidyField('inflation');
    expect(s.state.draft.inflation).toBe('x');
  });
});

describe('stepField', () => {
  it('steps within limits and commits immediately', () => {
    const s = createStore();
    s.actions.stepField('inflation', 1);
    expect(s.state.inputs.inflation).toBeCloseTo(0.035, 12);
    s.actions.stepField('inflation', -1);
    s.actions.stepField('inflation', -1);
    expect(s.state.inputs.inflation).toBeCloseTo(0.025, 12);
    s.actions.stepField('years', 1);
    expect(s.state.inputs.years).toBe(31);
  });

  it('clamps at the limits', () => {
    const s = createStore({ inputs: { ...D, inflation: 0, investRate: -0.05, years: 1 } });
    s.actions.stepField('inflation', -1);
    expect(s.state.inputs.inflation).toBe(0);
    s.actions.stepField('investRate', -1);
    expect(s.state.inputs.investRate).toBeCloseTo(-0.05, 12);
    s.actions.stepField('years', -1);
    expect(s.state.inputs.years).toBe(1);
    const hi = createStore({ inputs: { ...D, start: 1_000_000, years: 60 } });
    hi.actions.stepField('start', 1);
    hi.actions.stepField('years', 1);
    expect(hi.state.inputs.start).toBe(1_000_000);
    expect(hi.state.inputs.years).toBe(60);
  });

  it('starting amount steps grow with the amount and mirror going down', () => {
    expect(fieldStep('start', 500)).toBe(100);
    expect(fieldStep('start', 5000)).toBe(500);
    expect(fieldStep('start', 20_000)).toBe(1000);
    const s = createStore();
    s.actions.stepField('start', 1);
    expect(s.state.inputs.start).toBe(11_000);
    s.actions.stepField('start', -1);
    expect(s.state.inputs.start).toBe(10_000);
    s.actions.stepField('start', -1);
    expect(s.state.inputs.start).toBe(9_500);
    s.actions.stepField('start', 1);
    expect(s.state.inputs.start).toBe(10_000);
  });

  it('snaps off-grid values to the next grid line', () => {
    const s = createStore({ inputs: { ...D, start: 12_345 } });
    s.actions.stepField('start', 1);
    expect(s.state.inputs.start).toBe(13_000);
    s.actions.stepField('start', -1);
    expect(s.state.inputs.start).toBe(12_000);
  });

  it('field ranges match the limits', () => {
    expect(FIELD_RANGE.inflation).toEqual({ min: 0, max: 12 });
    expect(FIELD_RANGE.investRate.min).toBeCloseTo(-5, 12);
    expect(FIELD_RANGE.start.max).toBe(RIVER_LIMITS.start.max);
  });
});

describe('playback', () => {
  it('starts at 0, paused, and does not move until played', () => {
    const s = createStore();
    expect(s.state.years).toBe(0);
    expect(s.state.playing).toBe(false);
    run(s, 3);
    expect(s.state.years).toBe(0);
  });

  it('plays the whole timeline in PLAY_SECONDS at 1x, then stops at the end, paused', () => {
    const s = createStore();
    const reasons: Reason[] = [];
    s.subscribe((r) => reasons.push(r));
    s.actions.play();
    expect(s.state.playing).toBe(true);
    run(s, PLAY_SECONDS / 2);
    expect(s.state.years / END).toBeCloseTo(0.5, 1);
    run(s, PLAY_SECONDS);
    expect(s.state.years).toBe(END);
    expect(s.state.playing).toBe(false);
    expect(reasons).toContain('play-end');
  });

  it('speed scales the pace', () => {
    const s = createStore();
    s.actions.setSpeed(2);
    s.actions.play();
    run(s, 2);
    expect(s.state.years).toBeCloseTo(2 * 2 * playRate(END), 0);
  });

  it('advances while playing, never backwards', () => {
    const s = createStore();
    s.actions.play();
    let prev = 0;
    for (let i = 0; i < 30 * 30; i++) {
      s.tick(1 / 30);
      expect(s.state.years).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = s.state.years;
    }
    expect(s.state.years).toBe(END);
  });

  it('pressing play at the end starts over from 0', () => {
    const s = createStore();
    s.actions.scrubTo(END);
    s.actions.play();
    expect(s.state.years).toBe(0);
    expect(s.state.playing).toBe(true);
  });

  it('clamps huge frame gaps (tab switches) to MAX_DT', () => {
    const s = createStore();
    s.actions.play();
    s.tick(30);
    expect(s.state.years).toBeCloseTo(playRate(END) * MAX_DT, 12);
  });

  it('scrubbing pauses and clamps', () => {
    const s = createStore();
    s.actions.play();
    s.actions.scrubTo(10);
    expect(s.state.playing).toBe(false);
    expect(s.state.years).toBe(10);
    s.actions.scrubTo(1e9);
    expect(s.state.years).toBe(END);
    s.actions.scrubTo(-4);
    expect(s.state.years).toBe(0);
  });
});

describe('reduced motion', () => {
  it('changes no time: the clock stays where it is, and still plays when asked', () => {
    const s = createStore({ reducedMotion: true });
    expect(s.state.playing).toBe(false);
    s.actions.scrubTo(10);
    s.actions.setReducedMotion(false);
    expect(s.state.years).toBe(10);
    s.actions.setReducedMotion(true);
    s.actions.play();
    run(s, 1);
    expect(s.state.years).toBeGreaterThan(10);
  });

  it('eases the scale faster in reduced motion', () => {
    const slow = createStore();
    const fast = createStore({ reducedMotion: true });
    for (const s of [slow, fast]) {
      s.actions.setDraftField('years', '60');
      s.actions.commitInputs();
      s.tick(0.1);
    }
    const gap = (s: typeof slow) => Math.abs(s.state.targetScale - s.state.displayScale);
    expect(gap(fast)).toBeLessThan(gap(slow));
  });
});

describe('shared display scale', () => {
  it('eases toward the target with the same value for every boat, and settles', () => {
    const s = createStore();
    s.actions.setDraftField('inflation', '9');
    s.actions.commitInputs();
    const start = s.state.displayScale;
    const target = s.state.targetScale;
    expect(target).toBeGreaterThan(start);
    s.tick(1 / 30);
    expect(s.state.displayScale).toBeGreaterThan(start);
    expect(s.state.displayScale).toBeLessThan(target);
    run(s, SCALE_TAU * 12);
    expect(s.state.displayScale).toBe(target);
  });
});

describe('scene frame values (boatVisual)', () => {
  const scale = riverScale(D);
  const snaps = allBoats(D, 30);

  it('position is logReal over the shared scale, within +-1', () => {
    for (const snap of snaps) {
      const v = boatVisual(snap, effortOf(D, snap.id), scale, 0);
      expect(v.id).toBe(snap.id);
      expect(v.u).toBeCloseTo(snap.logReal / scale, 12);
      expect(Math.abs(v.u)).toBeLessThanOrEqual(1 + 1e-12);
    }
    expect(boatVisual(snaps[0], 0, scale, 0).u).toBeCloseTo(-1, 12); // cash drifts farthest at the defaults
  });

  it('clamps to the scene limit while the shared scale is still easing', () => {
    expect(boatVisual(snaps[0], 0, scale / 4, 0).u).toBe(-1.1);
    expect(boatVisual(snaps[2], 1, scale / 4, 0).u).toBe(1.1);
  });

  it('wake speed follows the return, only while the clock runs', () => {
    const [cash, savings, invest] = snaps;
    expect(boatVisual(cash, 0, scale, 2).waterSpeed).toBe(0);
    expect(boatVisual(invest, 1, scale, 0).waterSpeed).toBe(0);
    expect(boatVisual(savings, 1 / 3, scale, 2).waterSpeed).toBeCloseTo((Math.log(1.02) / scale) * 2, 12);
    expect(boatVisual(invest, 1, scale, 2).waterSpeed).toBeGreaterThan(boatVisual(savings, 1 / 3, scale, 2).waterSpeed);
  });

  it('a negative return never rows (no wake through the water)', () => {
    const inp = { ...D, investRate: -0.04 };
    const neg = allBoats(inp, 30)[2];
    expect(boatVisual(neg, effortOf(inp, 'invest'), riverScale(inp), 2).waterSpeed).toBe(0);
    expect(boatVisual(neg, effortOf(inp, 'invest'), riverScale(inp), 2).effort).toBe(0);
  });
});

describe('fitFactor (narrow screens)', () => {
  it('is 1 when the visible river is wider than the shared scale', () => {
    expect(fitFactor({ min: -1.4, max: 1.4 })).toBe(1);
    expect(fitFactor({ min: -2, max: 3 })).toBe(1);
  });

  it('shrinks every boat toward the dock by the same factor on a narrow slice, keeping them in view', () => {
    const k = fitFactor({ min: -0.67, max: 0.67 });
    expect(k).toBeCloseTo(0.67 - BOAT_HALF_U, 6);
    const scale = riverScale(D);
    for (const snap of allBoats(D, 30)) {
      const v = boatVisual(snap, 0, scale / k, 0);
      expect(Math.abs(v.u)).toBeLessThanOrEqual(0.67 - BOAT_HALF_U + 1e-9);
      expect(v.u).toBeCloseTo((snap.logReal / scale) * k, 12);
    }
  });

  it('uses the tighter side and never collapses the river entirely', () => {
    expect(fitFactor({ min: -0.7, max: 1.2 })).toBeCloseTo(0.7 - BOAT_HALF_U, 6);
    expect(fitFactor({ min: -0.1, max: 0.1 })).toBe(0.35);
  });
});
