import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../../src/engine';
import { PLAY_SECONDS, createStore, playRate } from '../../src/app/store';
import { ageSpoken, sceneSummary, splitAge } from '../../src/app/text';

describe('store input rules', () => {
  it('keeps the age when inside the new range', () => {
    const s = createStore();
    s.actions.scrubTo(400);
    s.actions.setDraftField('monthlyContribution', '300');
    s.actions.commitInputs();
    expect(s.state.inputs.monthlyContribution).toBe(300);
    expect(s.state.ageMonths).toBe(400);
    expect(s.state.targetScale).toBeGreaterThan(0);
  });
  it('clamps to the start when the new range starts later', () => {
    const s = createStore();
    s.actions.scrubTo(310);
    s.actions.setDraftField('startAgeA', '30');
    s.actions.setDraftField('startAgeB', '35');
    s.actions.commitInputs();
    expect(s.state.ageMonths).toBe(360);
  });
  it('clamps to the end and pauses when the new end is earlier', () => {
    const s = createStore();
    s.actions.scrubTo(700);
    s.actions.play();
    expect(s.state.playing).toBe(true);
    s.actions.setDraftField('endAge', '50');
    s.actions.commitInputs();
    expect(s.state.ageMonths).toBe(600);
    expect(s.state.playing).toBe(false);
  });
  it('invalid drafts set errors and keep the last valid scenario', () => {
    const s = createStore();
    const before = s.state.scenario;
    s.actions.setDraftField('monthlyContribution', '99999');
    s.actions.commitInputs();
    expect(s.state.errors.monthlyContribution).toBeTruthy();
    expect(s.state.scenario).toBe(before);
    expect(s.state.inputs).toEqual(DEFAULT_INPUTS);
    s.actions.setDraftField('monthlyContribution', '250');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(s.state.inputs.monthlyContribution).toBe(250);
  });
  it('rejects text and decimals for ages', () => {
    const s = createStore();
    s.actions.setDraftField('startAgeA', 'abc');
    s.actions.commitInputs();
    expect(s.state.errors.startAgeA).toBeTruthy();
    s.actions.setDraftField('startAgeA', '30.5');
    s.actions.commitInputs();
    expect(s.state.errors.startAgeA).toBeTruthy();
  });
  it('converts the return percent to a decimal', () => {
    const s = createStore();
    s.actions.setDraftField('annualReturn', '7.5');
    s.actions.commitInputs();
    expect(s.state.inputs.annualReturn).toBeCloseTo(0.075, 12);
    s.actions.setDraftField('annualReturn', '-2');
    s.actions.commitInputs();
    expect(s.state.inputs.annualReturn).toBeCloseTo(-0.02, 12);
  });
  it('an edit while playing keeps the current age', () => {
    const s = createStore();
    s.actions.play();
    for (let i = 0; i < 30; i++) s.tick(0.1);
    const age = s.state.ageMonths;
    expect(age).toBeGreaterThan(300);
    s.actions.setDraftField('monthlyContribution', '300');
    s.actions.commitInputs();
    expect(s.state.ageMonths).toBe(age);
  });
  it('steppers move one step and clamp', () => {
    const s = createStore();
    s.actions.stepField('monthlyContribution', 1);
    expect(s.state.inputs.monthlyContribution).toBe(225);
    s.actions.stepField('annualReturn', -1);
    expect(s.state.inputs.annualReturn).toBeCloseTo(0.055, 12);
    for (let i = 0; i < 40; i++) s.actions.stepField('startAgeB', -1);
    expect(s.state.inputs.startAgeB).toBe(16);
  });
});

describe('store clocks', () => {
  it('starts at the earlier planting, paused, and does not move until played', () => {
    const s = createStore();
    expect(s.state.ageMonths).toBe(300);
    expect(s.state.playing).toBe(false);
    for (let i = 0; i < 30; i++) s.tick(0.1);
    expect(s.state.ageMonths).toBe(300);
  });
  it('plays the whole timeline in PLAY_SECONDS at 1x, times speed, stops at the end, restarts from the start', () => {
    const s = createStore();
    const rate = playRate(780 - 300);
    expect(rate).toBeCloseTo(480 / PLAY_SECONDS, 12);
    s.actions.play();
    s.tick(0.1);
    expect(s.state.ageMonths).toBeCloseTo(300 + rate * 0.1, 9);
    s.actions.setSpeed(4);
    s.tick(0.1);
    expect(s.state.ageMonths).toBeCloseTo(300 + rate * 0.5, 9);
    s.actions.scrubTo(779);
    s.actions.play();
    s.tick(0.1);
    expect(s.state.ageMonths).toBe(780);
    expect(s.state.playing).toBe(false);
    s.actions.play();
    expect(s.state.ageMonths).toBe(300);
    expect(s.state.playing).toBe(true);
  });
  it('dt is clamped to 100 ms', () => {
    const s = createStore();
    s.actions.play();
    s.tick(5);
    expect(s.state.ageMonths).toBeCloseTo(300 + playRate(480) * 0.1, 9);
  });
  it('scrubbing pauses and clamps', () => {
    const s = createStore();
    s.actions.play();
    s.tick(0.1);
    s.actions.scrubTo(500);
    expect(s.state.playing).toBe(false);
    expect(s.state.ageMonths).toBe(500);
    s.actions.scrubTo(99999);
    expect(s.state.ageMonths).toBe(780);
    s.actions.scrubTo(0);
    expect(s.state.ageMonths).toBe(300);
  });
  it('display scale eases toward the target', () => {
    const s = createStore();
    s.actions.setDraftField('monthlyContribution', '500');
    s.actions.commitInputs();
    const target = s.state.targetScale;
    const start = s.state.displayScale;
    expect(target).toBeGreaterThan(start);
    s.tick(0.1);
    expect(s.state.displayScale).toBeGreaterThan(start);
    expect(s.state.displayScale).toBeLessThan(target);
    for (let i = 0; i < 100; i++) s.tick(0.1);
    expect(s.state.displayScale).toBeCloseTo(target, 3);
  });
  it('reduced motion changes no time: the clock stays where it is', () => {
    const s = createStore();
    s.actions.scrubTo(500);
    s.actions.setReducedMotion(true);
    expect(s.state.ageMonths).toBe(500);
    expect(s.state.playing).toBe(false);
  });
});

describe('text helpers', () => {
  it('speaks ages', () => {
    expect(ageSpoken(45 * 12 + 3)).toBe('Age 45 years, 3 months');
    expect(ageSpoken(45 * 12)).toBe('Age 45 years');
    expect(ageSpoken(1 * 12 + 1)).toBe('Age 1 year, 1 month');
    expect(splitAge(300.9)).toEqual({ years: 25, months: 0 });
  });
  it('summarises the scene', () => {
    const s = createStore();
    const text = sceneSummary(s.state.scenario, 300);
    expect(text).toContain('Tree B is not planted yet');
    const late = sceneSummary(s.state.scenario, 780);
    expect(late).toContain('ahead by');
  });
});
