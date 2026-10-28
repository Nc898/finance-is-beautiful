import { describe, expect, it } from 'vitest';
import { DEFAULT_BRICK_INPUTS } from '../../src/brick/engine';
import { PLAY_SECONDS, createStore, draftToInputs, inputsToDraft, parseNumber, playRate, rateToDraft } from '../../src/brick/app/store';
import type { Reason } from '../../src/brick/app/store';
import { houseVisual } from '../../src/brick/app/loop';
import { loanSnapshot } from '../../src/brick/engine';

const D = DEFAULT_BRICK_INPUTS;

describe('drafts', () => {
  it('shows the amount with grouping and rates in percent; round-trips', () => {
    expect(inputsToDraft(D)).toEqual({ amount: '300,000', 'a.years': '30', 'a.apr': '6.5', 'b.years': '15', 'b.apr': '5.75' });
    expect(draftToInputs(inputsToDraft(D))).toEqual(D);
    expect(rateToDraft(0.06125)).toBe('6.125');
    expect(parseNumber('$1,250')).toBe(1250);
    expect(parseNumber('6.5%')).toBe(6.5);
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

  it('plays the whole timeline in PLAY_SECONDS at 1x, times speed; stops at the end and restarts from 0', () => {
    const s = createStore();
    const rate = playRate(360);
    expect(rate).toBeCloseTo(360 / PLAY_SECONDS, 12);
    s.actions.play();
    s.tick(0.1);
    expect(s.state.months).toBeCloseTo(rate * 0.1, 9);
    s.actions.setSpeed(4);
    s.tick(0.1);
    expect(s.state.months).toBeCloseTo(rate * 0.5, 9);
    s.actions.scrubTo(359.5);
    s.actions.play();
    s.tick(0.1);
    expect(s.state.months).toBe(360);
    expect(s.state.playing).toBe(false);
    s.actions.play();
    expect(s.state.months).toBe(0);
    expect(s.state.playing).toBe(true);
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
    s.actions.setDraftField('b.years', '20');
    s.actions.commitInputs();
    expect(s.state.inputs.loans.b.years).toBe(20);
    s.actions.setDraftField('a.apr', 'lots');
    s.actions.commitInputs();
    expect(s.state.inputs.loans.a.apr).toBe(0.065);
    expect(s.state.errors['a.apr']).toBeTruthy();
    expect(seen).toContain('inputs');
    expect(seen).toContain('errors');
  });

  it('a shorter timeline pulls the clock back to its end', () => {
    const s = createStore();
    s.actions.scrubTo(300);
    s.actions.setDraftField('a.years', '20');
    s.actions.commitInputs();
    expect(s.state.months).toBe(240);
  });

  it('steppers move by a step and clamp to the limits', () => {
    const s = createStore();
    s.actions.stepField('a.apr', 1);
    expect(s.state.inputs.loans.a.apr).toBeCloseTo(0.06625, 9);
    s.actions.stepField('amount', 1);
    expect(s.state.inputs.amount).toBe(310_000);
    for (let i = 0; i < 50; i++) s.actions.stepField('b.years', 1);
    expect(s.state.inputs.loans.b.years).toBe(40);
  });
});

describe('what the scene is given', () => {
  it('built, carts and the split follow the money', () => {
    const a1 = houseVisual(loanSnapshot(D, 'a', 0.5), D);
    expect(a1.split).toBeCloseTo(1625 / 1896.2, 3);
    expect(a1.paidOff).toBe(false);
    const b = houseVisual(loanSnapshot(D, 'b', 180), D);
    expect(b).toMatchObject({ built: 1, split: 0, paidOff: true });
    expect(b.carts).toBeCloseTo(1.484, 3);
  });
});
