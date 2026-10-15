import { describe, expect, it } from 'vitest';
import { DEFAULT_VINE_INPUTS, VINE_LIMITS, allPlans, horizonMonths, planSchedule } from '../../src/vine/engine';
import {
  EXPLORE_MONTHS_PER_SECOND,
  FIELD_RANGE,
  MAX_DT,
  createStore,
  draftToInputs,
  fieldStep,
  inputsToDraft,
  parseNumber,
  rateToDraft,
} from '../../src/vine/app/store';
import type { Reason } from '../../src/vine/app/store';
import { cottageVisual } from '../../src/vine/app/loop';
import { STORY_DURATION } from '../../src/vine/app/story';
import { fixedNote, resultsSentence, scrubSentence } from '../../src/vine/app/text';

const D = DEFAULT_VINE_INPUTS;
const END = 230;

function run(store: ReturnType<typeof createStore>, seconds: number, dt = 1 / 30): void {
  for (let t = 0; t < seconds; t += dt) store.tick(dt);
}

describe('drafts', () => {
  it('shows rates in percent and dollars with grouping', () => {
    expect(inputsToDraft(D)).toEqual({ balance: '5,000', apr: '22', fixedPayment: '200', minPercent: '1', minFloor: '25' });
    expect(rateToDraft(0.005)).toBe('0.5');
    expect(rateToDraft(0.225)).toBe('22.5');
  });

  it('round-trips through draftToInputs', () => {
    expect(draftToInputs(inputsToDraft(D))).toEqual(D);
    const odd = { balance: 12_345, apr: 0.1975, fixedPayment: 1_250, minPercent: 0.035, minFloor: 40 };
    expect(draftToInputs(inputsToDraft(odd))).toEqual(odd);
  });

  it('parses commas, dollar signs and percent signs; rejects junk', () => {
    expect(parseNumber('$12,500')).toBe(12500);
    expect(parseNumber(' 4.5% ')).toBe(4.5);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('1e5')).toBeNaN();
    expect(parseNumber('1.2.3')).toBeNaN();
  });
});

describe('commitInputs', () => {
  it('applies valid drafts, extends the timeline and leaves the story', () => {
    const s = createStore();
    expect(s.horizon()).toBe(END);
    s.actions.setDraftField('apr', '25');
    s.actions.commitInputs();
    expect(s.state.inputs.apr).toBeCloseTo(0.25, 12);
    expect(s.horizon()).toBe(horizonMonths(s.state.inputs));
    expect(s.horizon()).toBeGreaterThan(END);
    expect(s.state.mode).toBe('explore');
    expect(s.state.playing).toBe(false);
  });

  it('keeps the last valid inputs and records an error for each bad field', () => {
    const s = createStore();
    const reasons: Reason[] = [];
    s.subscribe((r) => reasons.push(r));
    s.actions.setDraftField('balance', '50');
    s.actions.setDraftField('fixedPayment', 'lots');
    s.actions.commitInputs();
    expect(s.state.inputs).toEqual(D);
    expect(s.state.errors.balance).toMatch(/between \$100 and \$100,000/);
    expect(s.state.errors.fixedPayment).toMatch(/must be a number/);
    expect(s.state.mode).toBe('story'); // an invalid edit does not leave the story
    expect(reasons).toContain('errors');
    s.actions.setDraftField('balance', '6,000');
    s.actions.setDraftField('fixedPayment', '300');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(s.state.inputs.balance).toBe(6000);
    expect(s.state.inputs.fixedPayment).toBe(300);
  });

  it('rejects out-of-range values in every field', () => {
    const s = createStore();
    for (const [field, text] of [
      ['balance', '99'],
      ['balance', '100001'],
      ['apr', '-1'],
      ['apr', '41'],
      ['fixedPayment', '9'],
      ['fixedPayment', '20001'],
      ['minPercent', '0.4'],
      ['minPercent', '5.5'],
      ['minFloor', '-5'],
      ['minFloor', '501'],
    ] as const) {
      s.actions.setDraftField(field, text);
      s.actions.commitInputs();
      expect(s.state.errors[field], `${field}=${text}`).toBeTruthy();
      s.actions.setDraftField(field, inputsToDraft(D)[field]);
      s.actions.commitInputs();
      expect(s.state.errors).toEqual({});
    }
  });

  it('APR 0 is accepted', () => {
    const s = createStore();
    s.actions.setDraftField('apr', '0');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(s.state.inputs.apr).toBe(0);
  });

  it('a no-op commit does not leave the story', () => {
    const s = createStore();
    s.actions.setDraftField('apr', '22');
    s.actions.commitInputs();
    expect(s.state.mode).toBe('story');
  });

  it('shortening the timeline clamps the clock to the new end and pauses', () => {
    const s = createStore();
    s.actions.skipToExplore();
    s.actions.scrubTo(200);
    s.actions.setDraftField('fixedPayment', '5,000');
    s.actions.setDraftField('minFloor', '500');
    s.actions.commitInputs();
    expect(s.horizon()).toBeLessThan(200);
    expect(s.state.months).toBe(s.horizon());
    expect(s.state.playing).toBe(false);
  });

  it('lengthening keeps the clock where it is', () => {
    const s = createStore();
    s.actions.scrubTo(120);
    s.actions.setDraftField('apr', '30');
    s.actions.commitInputs();
    expect(s.state.months).toBe(120);
  });

  it('tidyField restores the canonical text only when it means the same number', () => {
    const s = createStore();
    s.actions.setDraftField('balance', '5000');
    s.actions.tidyField('balance');
    expect(s.state.draft.balance).toBe('5,000');
    s.actions.setDraftField('apr', 'x');
    s.actions.commitInputs();
    s.actions.tidyField('apr');
    expect(s.state.draft.apr).toBe('x');
  });
});

describe('stepField', () => {
  it('steps within limits and commits immediately', () => {
    const s = createStore();
    s.actions.stepField('apr', 1);
    expect(s.state.inputs.apr).toBeCloseTo(0.225, 12);
    s.actions.stepField('apr', -1);
    s.actions.stepField('apr', -1);
    expect(s.state.inputs.apr).toBeCloseTo(0.215, 12);
    s.actions.stepField('fixedPayment', 1);
    expect(s.state.inputs.fixedPayment).toBe(210);
    s.actions.stepField('minPercent', 1);
    expect(s.state.inputs.minPercent).toBeCloseTo(0.015, 12);
    s.actions.stepField('minFloor', -1);
    expect(s.state.inputs.minFloor).toBe(20);
    s.actions.stepField('balance', 1);
    expect(s.state.inputs.balance).toBe(5500);
  });

  it('clamps at the limits', () => {
    const lo = createStore({ inputs: { balance: 100, apr: 0, fixedPayment: 10, minPercent: 0.005, minFloor: 0 } });
    for (const f of ['balance', 'apr', 'fixedPayment', 'minPercent', 'minFloor'] as const) {
      lo.actions.stepField(f, -1);
      expect(lo.state.errors).toEqual({});
    }
    expect(lo.state.inputs).toEqual({ balance: 100, apr: 0, fixedPayment: 10, minPercent: 0.005, minFloor: 0 });
    const hi = createStore({ inputs: { balance: 100_000, apr: 0.4, fixedPayment: 20_000, minPercent: 0.05, minFloor: 500 } });
    for (const f of ['balance', 'apr', 'fixedPayment', 'minPercent', 'minFloor'] as const) hi.actions.stepField(f, 1);
    expect(hi.state.inputs).toEqual({ balance: 100_000, apr: 0.4, fixedPayment: 20_000, minPercent: 0.05, minFloor: 500 });
    expect(hi.state.errors).toEqual({});
  });

  it('dollar steps grow with the amount and mirror going down', () => {
    expect(fieldStep('balance', 500)).toBe(100);
    expect(fieldStep('balance', 5000)).toBe(500);
    expect(fieldStep('balance', 20_000)).toBe(1000);
    expect(fieldStep('fixedPayment', 200)).toBe(10);
    expect(fieldStep('fixedPayment', 800)).toBe(50);
    const s = createStore();
    s.actions.stepField('balance', 1);
    expect(s.state.inputs.balance).toBe(5500);
    s.actions.stepField('balance', -1);
    expect(s.state.inputs.balance).toBe(5000);
    s.actions.stepField('balance', -1);
    expect(s.state.inputs.balance).toBe(4500);
    s.actions.stepField('balance', 1);
    expect(s.state.inputs.balance).toBe(5000);
  });

  it('snaps off-grid values to the next grid line', () => {
    const s = createStore({ inputs: { ...D, balance: 5_250 } });
    s.actions.stepField('balance', 1);
    expect(s.state.inputs.balance).toBe(5_500);
    s.actions.stepField('balance', -1);
    expect(s.state.inputs.balance).toBe(5_000);
  });

  it('field ranges match the limits', () => {
    expect(FIELD_RANGE.apr).toEqual({ min: 0, max: 40 });
    expect(FIELD_RANGE.minPercent.min).toBeCloseTo(0.5, 12);
    expect(FIELD_RANGE.minPercent.max).toBeCloseTo(5, 12);
    expect(FIELD_RANGE.balance.max).toBe(VINE_LIMITS.balance.max);
    expect(FIELD_RANGE.minFloor).toEqual({ min: 0, max: 500 });
  });
});

describe('playback', () => {
  it('story plays at 1x and ends in explore at the later payoff, paused', () => {
    const s = createStore();
    const reasons: Reason[] = [];
    s.subscribe((r) => reasons.push(r));
    s.actions.play();
    expect(s.state.playing).toBe(true);
    run(s, 20);
    expect(s.state.storyTime).toBeGreaterThan(19);
    expect(s.state.storyTime).toBeLessThan(21);
    run(s, STORY_DURATION);
    expect(s.state.mode).toBe('explore');
    expect(s.state.playing).toBe(false);
    expect(s.state.months).toBe(END);
    expect(s.state.exploreHint).toBe(true);
    expect(reasons).toContain('story-end');
  });

  it('speed scales the story clock', () => {
    const s = createStore();
    s.actions.setSpeed(4);
    s.actions.play();
    run(s, 5);
    expect(s.state.storyTime).toBeGreaterThan(19);
    expect(s.state.storyTime).toBeLessThan(21);
  });

  it('months advance with the story, never backwards', () => {
    const s = createStore();
    s.actions.play();
    let prev = 0;
    for (let i = 0; i < 30 * 60; i++) {
      s.tick(1 / 30);
      expect(s.state.months).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = s.state.months;
    }
    expect(s.state.months).toBe(END);
  });

  it('monthsPerSecond is the live clock rate: 0 in the intro, rising through the long stretch, 0 when paused', () => {
    const s = createStore();
    s.actions.play();
    run(s, 3);
    expect(s.state.monthsPerSecond).toBe(0); // the intro holds still
    run(s, 20); // t = 23
    const mid = s.state.monthsPerSecond;
    expect(mid).toBeGreaterThan(5);
    s.actions.pause();
    expect(s.state.monthsPerSecond).toBe(0);
    s.tick(1 / 30);
    expect(s.state.monthsPerSecond).toBe(0);
  });

  it('explore advances 10 months per second at 1x and stops at the end', () => {
    const s = createStore();
    s.actions.skipToExplore();
    s.actions.scrubTo(0);
    s.actions.play();
    run(s, 5);
    expect(s.state.months).toBeCloseTo(5 * EXPLORE_MONTHS_PER_SECOND, 0);
    expect(s.state.monthsPerSecond).toBeCloseTo(EXPLORE_MONTHS_PER_SECOND, 5);
    s.actions.setSpeed(2);
    run(s, 2);
    expect(s.state.months).toBeCloseTo(90, 0);
    expect(s.state.monthsPerSecond).toBeCloseTo(2 * EXPLORE_MONTHS_PER_SECOND, 5);
    run(s, 20);
    expect(s.state.months).toBe(END);
    expect(s.state.playing).toBe(false);
    expect(s.state.monthsPerSecond).toBe(0);
  });

  it('pressing play at the end restarts from month 0', () => {
    const s = createStore();
    s.actions.skipToExplore();
    s.actions.play();
    expect(s.state.months).toBe(0);
    expect(s.state.playing).toBe(true);
  });

  it('clamps huge frame gaps (tab switches) to MAX_DT', () => {
    const s = createStore();
    s.actions.skipToExplore();
    s.actions.scrubTo(0);
    s.actions.play();
    s.tick(30);
    expect(s.state.months).toBeCloseTo(EXPLORE_MONTHS_PER_SECOND * MAX_DT, 12);
  });

  it('scrubbing leaves the story, pauses, clamps and clears the hint', () => {
    const s = createStore();
    s.actions.play();
    s.actions.scrubTo(63);
    expect(s.state.mode).toBe('explore');
    expect(s.state.playing).toBe(false);
    expect(s.state.months).toBe(63);
    s.actions.scrubTo(9999);
    expect(s.state.months).toBe(END);
    s.actions.scrubTo(-4);
    expect(s.state.months).toBe(0);
    expect(s.state.exploreHint).toBe(false);
  });

  it('skip jumps to the end with the hint; replay starts over and plays', () => {
    const s = createStore();
    s.actions.skipToExplore();
    expect(s.state.months).toBe(END);
    expect(s.state.exploreHint).toBe(true);
    s.actions.replayStory();
    expect(s.state.mode).toBe('story');
    expect(s.state.storyTime).toBe(0);
    expect(s.state.months).toBe(0);
    expect(s.state.playing).toBe(true);
    expect(s.state.exploreHint).toBe(false);
  });

  it('seekStory moves the shared clock with the story', () => {
    const s = createStore();
    s.actions.seekStory(21.5);
    expect(s.state.mode).toBe('story');
    expect(s.state.months).toBeCloseTo(34, 12);
    s.actions.seekStory(1e6);
    expect(s.state.storyTime).toBe(s.storyLength());
    expect(s.state.months).toBe(END);
  });
});

describe('reduced motion', () => {
  it('starts at the first hold, paused, and does not move until played', () => {
    const s = createStore({ reducedMotion: true });
    expect(s.state.reducedMotion).toBe(true);
    expect(s.state.playing).toBe(false);
    run(s, 3);
    expect(s.state.storyTime).toBe(0);
    expect(s.state.months).toBe(0);
  });

  it('switching restarts the story paused with the matching timeline', () => {
    const s = createStore();
    s.actions.play();
    run(s, 15);
    s.actions.setReducedMotion(true);
    expect(s.state.storyTime).toBe(0);
    expect(s.state.playing).toBe(false);
    expect(s.storyLength()).not.toBe(STORY_DURATION);
    s.actions.setReducedMotion(false);
    expect(s.storyLength()).toBe(STORY_DURATION);
  });
});

describe('scene frame values (cottageVisual)', () => {
  it('everything is a fraction of the STARTING balance, on one scale for both cottages', () => {
    const [min, fixed] = allPlans(D, 12);
    const a = cottageVisual(min, D);
    const b = cottageVisual(fixed, D);
    expect(a.id).toBe('minimum');
    expect(b.id).toBe('fixed');
    expect(a.vine).toBeCloseTo(min.balance / 5000, 12);
    expect(a.regrowth).toBeCloseTo(min.interest / 5000, 12);
    expect(a.pruning).toBeCloseTo(min.payment / 5000, 12);
    expect(a.pile).toBeCloseTo(min.interestPaid / 5000, 12);
    expect(b.vine).toBeLessThan(a.vine);
    expect(b.pruning).toBeCloseTo(200 / 5000, 12);
  });

  it('starts as a full vine, no pile, nothing paid off', () => {
    const [min, fixed] = allPlans(D, 0);
    for (const snap of [min, fixed]) {
      const v = cottageVisual(snap, D);
      expect(v.vine).toBe(1);
      expect(v.pile).toBe(0);
      expect(v.paidOff).toBe(false);
      expect(v.regrowth).toBeCloseTo(91.6667 / 5000, 6);
    }
  });

  it('when cleared: no vine, no regrowth, no pruning, paid off, and the pile holds the total interest', () => {
    const [, fixed] = allPlans(D, 40);
    const v = cottageVisual(fixed, D);
    expect(v.vine).toBe(0);
    expect(v.regrowth).toBe(0);
    expect(v.pruning).toBe(0);
    expect(v.paidOff).toBe(true);
    expect(v.pile).toBeCloseTo(planSchedule(D, 'fixed').totalInterest / 5000, 12);
  });

  it('the pile can exceed 1 (more interest than the balance) and the vine stays within 0 to 1', () => {
    const [min] = allPlans(D, END);
    const v = cottageVisual(min, D);
    expect(v.pile).toBeGreaterThan(1.5);
    expect(v.pile).toBeCloseTo(8099.77 / 5000, 3);
    for (let m = 0; m <= END; m += 3) {
      const c = cottageVisual(allPlans(D, m)[0], D);
      expect(c.vine).toBeGreaterThanOrEqual(0);
      expect(c.vine).toBeLessThanOrEqual(1);
    }
  });

  it('the vine falls smoothly: no frame-to-frame jump larger than a month of payments', () => {
    let prev = 1;
    for (let m = 0; m <= 34; m += 1 / 60) {
      const v = cottageVisual(allPlans(D, m)[1], D).vine;
      expect(prev - v).toBeLessThan(0.0035);
      prev = v;
    }
  });
});

describe('text for announcements and notes', () => {
  it('results sentence names both plans with their time and interest', () => {
    expect(resultsSentence(D)).toBe(
      'Minimum payments: 19 years, 2 months and $8,100 in interest. A fixed $200 a month: 2 years, 10 months and $1,750 in interest.',
    );
  });

  it('scrub sentence gives the clock and both balances', () => {
    expect(scrubSentence(D, 60)).toBe(
      'Year 5, month 0. Minimum payments: $2,736 still owed, $4,151 in interest. A fixed $200 a month: Paid off in 2 years, 10 months, $1,750 in interest.',
    );
  });

  it('the fixed-payment note appears only when the card asks for more than the fixed amount', () => {
    expect(fixedNote(D)).toBe('');
    expect(fixedNote({ ...D, fixedPayment: 100 })).toBe('The card asks for at least $141.67 to start, so the fixed plan pays that at first.');
    expect(fixedNote({ ...D, fixedPayment: 20 })).toBe('The card asks for at least $141.67 to start, so both pay the minimum.');
  });
});
