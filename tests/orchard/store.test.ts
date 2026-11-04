import { describe, expect, it } from 'vitest';
import { DEFAULT_ORCHARD_INPUTS, saveSnapshot, treesAt } from '../../src/orchard/engine';
import { PLAY_SECONDS, createStore, draftToInputs, inputsToDraft, parseNumber, playRate, shareToDraft } from '../../src/orchard/app/store';
import type { Reason } from '../../src/orchard/app/store';
import { pickerVisual } from '../../src/orchard/app/loop';

const D = DEFAULT_ORCHARD_INPUTS;

describe('drafts', () => {
  it('shows pay with grouping and shares in percent; round-trips', () => {
    expect(inputsToDraft(D)).toEqual({ salary: '60,000', years: '30', growth: '7', rate: '50', limit: '6', 'a.save': '3', 'b.save': '6' });
    expect(draftToInputs(inputsToDraft(D))).toEqual(D);
    expect(shareToDraft(0.0725)).toBe('7.25');
    expect(parseNumber('$60,000')).toBe(60000);
    expect(parseNumber('6.5%')).toBe(6.5);
    expect(parseNumber('50¢')).toBe(50);
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });
});

describe('the clock', () => {
  it('starts at month 0, paused, and waits until played', () => {
    const s = createStore();
    expect(s.state.months).toBe(0);
    expect(s.state.playing).toBe(false);
    for (let i = 0; i < 30; i++) s.tick(0.1);
    expect(s.state.months).toBe(0);
  });

  it('plays the whole timeline in 30 s at 1x, times speed; stops at the end and restarts from 0', () => {
    expect(PLAY_SECONDS).toBe(30);
    const s = createStore();
    const rate = playRate(360);
    expect(rate).toBe(12);
    s.actions.play();
    s.tick(0.1);
    expect(s.state.months).toBeCloseTo(1.2, 9);
    expect(s.state.monthsPerSecond).toBeCloseTo(12, 9);
    s.actions.setSpeed(4);
    s.tick(0.1);
    expect(s.state.months).toBeCloseTo(6, 9);
    s.actions.scrubTo(359.5);
    s.actions.play();
    s.tick(0.1);
    expect(s.state.months).toBe(360);
    expect(s.state.playing).toBe(false);
    s.actions.play();
    expect(s.state.months).toBe(0);
    expect(s.state.playing).toBe(true);
  });

  it('speed stays within 0.1x and 5x, in tenths', () => {
    const s = createStore();
    s.actions.setSpeed(0.01);
    expect(s.state.speed).toBe(0.1);
    s.actions.setSpeed(9);
    expect(s.state.speed).toBe(5);
    s.actions.setSpeed(2.37);
    expect(s.state.speed).toBe(2.4);
  });

  it('scrubbing pauses and clamps', () => {
    const s = createStore();
    s.actions.play();
    s.actions.scrubTo(9999);
    expect(s.state.months).toBe(360);
    expect(s.state.playing).toBe(false);
    s.actions.scrubTo(-4);
    expect(s.state.months).toBe(0);
  });
});

describe('inputs', () => {
  it('a valid edit applies; an invalid one keeps the last valid inputs and records an error', () => {
    const s = createStore();
    const seen: Reason[] = [];
    s.subscribe((r) => seen.push(r));
    s.actions.setDraftField('a.save', '4.5');
    s.actions.commitInputs();
    expect(s.state.inputs.save.a).toBe(0.045);
    s.actions.setDraftField('rate', 'lots');
    s.actions.commitInputs();
    expect(s.state.inputs.match.rate).toBe(0.5);
    expect(s.state.errors.rate).toBeTruthy();
    expect(seen).toContain('inputs');
    expect(seen).toContain('errors');
  });

  it('a shorter timeline pulls the clock back to its end', () => {
    const s = createStore();
    s.actions.scrubTo(300);
    s.actions.setDraftField('years', '20');
    s.actions.commitInputs();
    expect(s.state.months).toBe(240);
  });

  it('steppers move by a step and clamp to the limits', () => {
    const s = createStore();
    s.actions.stepField('a.save', 1);
    expect(s.state.inputs.save.a).toBe(0.035);
    expect(s.state.draft['a.save']).toBe('3.5');
    s.actions.stepField('growth', -1);
    expect(s.state.inputs.growth).toBe(0.0675);
    s.actions.stepField('rate', 1);
    expect(s.state.inputs.match.rate).toBe(0.55);
    s.actions.stepField('salary', 1);
    expect(s.state.inputs.salary).toBe(61_000);
    for (let i = 0; i < 50; i++) s.actions.stepField('years', 1);
    expect(s.state.inputs.years).toBe(45);
    for (let i = 0; i < 50; i++) s.actions.stepField('limit', 1);
    expect(s.state.inputs.match.limit).toBe(0.1);
    for (let i = 0; i < 50; i++) s.actions.stepField('b.save', -1);
    expect(s.state.inputs.save.b).toBe(0);
  });
});

describe('what the scene is given', () => {
  it('the baskets and the offer on the larger picker’s scale; picked; planting; done', () => {
    const a = pickerVisual(D, 'a', 100);
    const b = pickerVisual(D, 'b', 100);
    expect(a.basket.own).toBeCloseTo(150 / 450, 12);
    expect(a.basket.match).toBeCloseTo(75 / 450, 12);
    expect(b.basket.own).toBeCloseTo(300 / 450, 12);
    expect(b.basket.match).toBeCloseTo(150 / 450, 12);
    expect(a.basket.own + a.basket.match).toBeCloseTo((b.basket.own + b.basket.match) / 2, 12);
    expect(a.offer).toBeCloseTo(150 / 450, 12);
    expect(a.offer).toBe(b.offer);
    expect(a.picked).toBeCloseTo(0.5, 12);
    expect(b.picked).toBe(1);
    expect(a.trees).toEqual(treesAt(D, 'a', 100));
    expect(a.planting).toBe(a.trees[a.trees.length - 1]!.index);
    expect(a.done).toBe(false);
  });

  it('before the first tree, planting is −1; at the end the baskets are empty and the pickers rest', () => {
    expect(pickerVisual(D, 'a', 0).planting).toBe(-1);
    expect(pickerVisual(D, 'a', 0).basket.own).toBeGreaterThan(0);
    const end = pickerVisual(D, 'b', 360, saveSnapshot(D, 'b', 360));
    expect(end).toMatchObject({ basket: { own: 0, match: 0 }, done: true, planting: 35 });
  });

  it('nothing offered: everything "picked"; nobody saving: the offer is its own scale and all of it falls', () => {
    const none = { ...D, match: { rate: 0, limit: 0.06 } };
    expect(pickerVisual(none, 'a', 10)).toMatchObject({ offer: 0, picked: 1 });
    const idle = { ...D, save: { a: 0, b: 0 } };
    expect(pickerVisual(idle, 'a', 10)).toMatchObject({ basket: { own: 0, match: 0 }, offer: 1, picked: 0, planting: -1 });
  });
});
