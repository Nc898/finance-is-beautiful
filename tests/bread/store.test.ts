import { describe, expect, it } from 'vitest';
import { DEFAULT_BASKET } from '../../src/bread/engine';
import { LAST_MONTH, PLAY_RATE, PLAY_SECONDS, createStore, draftToInputs, inputsToDraft, parseNumber } from '../../src/bread/app/store';
import type { Reason } from '../../src/bread/app/store';
import { snapshot } from '../../src/bread/engine';

describe('drafts', () => {
  it('round-trips the basket', () => {
    expect(inputsToDraft(DEFAULT_BASKET)).toEqual({ bread: '2', eggs: '1', coffee: '1', bananas: '3', chicken: '3', flour: '5' });
    expect(draftToInputs(inputsToDraft(DEFAULT_BASKET))).toEqual(DEFAULT_BASKET);
    expect(parseNumber(' 4 ')).toBe(4);
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });
});

describe('the clock', () => {
  it('starts at January 1980, paused, and waits until played', () => {
    const s = createStore();
    expect(s.state.month).toBe(0);
    expect(s.state.playing).toBe(false);
    for (let i = 0; i < 30; i++) s.tick(0.1);
    expect(s.state.month).toBe(0);
  });

  it('plays a year in about two seconds at 1x, times speed; stops at the end and restarts from 0', () => {
    expect(PLAY_SECONDS).toBe(94);
    expect(LAST_MONTH).toBe(560);
    expect(12 / PLAY_RATE).toBeGreaterThan(1.9);
    expect(12 / PLAY_RATE).toBeLessThan(2.1);
    const s = createStore();
    s.actions.play();
    s.tick(0.1);
    expect(s.state.month).toBeCloseTo(PLAY_RATE * 0.1, 9);
    expect(s.state.monthsPerSecond).toBeCloseTo(PLAY_RATE, 9);
    s.actions.setSpeed(4);
    s.tick(0.1);
    expect(s.state.month).toBeCloseTo(PLAY_RATE * 0.5, 9);
    s.actions.scrubTo(LAST_MONTH - 0.2);
    s.actions.play();
    s.tick(0.1);
    s.tick(0.1);
    expect(s.state.month).toBe(LAST_MONTH);
    expect(s.state.playing).toBe(false);
    const jumps = s.state.jumps;
    s.actions.play();
    expect(s.state.month).toBe(0);
    expect(s.state.playing).toBe(true);
    expect(s.state.jumps).toBe(jumps + 1);
  });

  it('the whole timeline takes about 94 s at 1x', () => {
    const s = createStore();
    s.actions.play();
    let t = 0;
    while (s.state.playing && t < 200) {
      s.tick(0.05);
      t += 0.05;
    }
    expect(t).toBeGreaterThan(93);
    expect(t).toBeLessThan(95);
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

  it('scrubbing pauses, clamps and counts as a jump', () => {
    const s = createStore();
    s.actions.play();
    const jumps = s.state.jumps;
    s.actions.scrubTo(9999);
    expect(s.state.month).toBe(LAST_MONTH);
    expect(s.state.playing).toBe(false);
    expect(s.state.jumps).toBe(jumps + 1);
    s.actions.scrubTo(-4);
    expect(s.state.month).toBe(0);
  });

  it('playing a day does not skip months: a long frame is clamped', () => {
    const s = createStore();
    s.actions.play();
    s.tick(60);
    expect(s.state.month).toBeCloseTo(PLAY_RATE * 0.1, 9);
  });
});

describe('the basket', () => {
  it('a valid edit applies; an invalid one keeps the last valid basket and records an error', () => {
    const s = createStore();
    const seen: Reason[] = [];
    s.subscribe((r) => seen.push(r));
    s.actions.setDraftField('bread', '3');
    s.actions.commitInputs();
    expect(s.state.basket.qty.bread).toBe(3);
    expect(seen).toContain('inputs');
    s.actions.setDraftField('eggs', '9');
    s.actions.commitInputs();
    expect(s.state.basket.qty.eggs).toBe(1);
    expect(s.state.errors.eggs).toBeTruthy();
    s.actions.setDraftField('eggs', '2');
    s.actions.commitInputs();
    expect(s.state.errors.eggs).toBeUndefined();
    expect(s.state.basket.qty.eggs).toBe(2);
  });

  it('steppers move one whole step and stop at the limits', () => {
    const s = createStore();
    s.actions.stepField('eggs', 1);
    s.actions.stepField('eggs', 1);
    expect(s.state.basket.qty.eggs).toBe(3);
    s.actions.stepField('eggs', 1);
    expect(s.state.basket.qty.eggs).toBe(3);
    for (let i = 0; i < 5; i++) s.actions.stepField('bread', -1);
    expect(s.state.basket.qty.bread).toBe(0);
    expect(s.state.draft.bread).toBe('0');
  });

  it('an empty basket is allowed and the clock is untouched', () => {
    const s = createStore();
    s.actions.scrubTo(100);
    for (const k of ['bread', 'eggs', 'coffee', 'bananas', 'chicken', 'flour'] as const) s.actions.setDraftField(k, '0');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(snapshot(s.state.basket, s.state.month).minutes).toBe(0);
    expect(s.state.month).toBe(100);
  });

  it('a new basket is a new object (the loop and the notes notice)', () => {
    const s = createStore();
    const before = s.state.basket;
    s.actions.stepField('flour', 1);
    expect(s.state.basket).not.toBe(before);
    expect(before.qty.flour).toBe(5);
  });
});
