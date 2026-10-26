import { describe, expect, it } from 'vitest';
import { DEFAULT_SNOW_INPUTS, SNOW_FIELDS, SNOW_LIMITS, allStrategies, horizonMonths, strategySchedule } from '../../src/snow/engine';
import type { SnowInputs } from '../../src/snow/engine';
import {
  EXPLORE_MONTHS_PER_SECOND,
  FIELDS,
  FIELD_RANGE,
  MAX_DT,
  createStore,
  draftToInputs,
  exploreRate,
  fieldStep,
  inputsToDraft,
  parseNumber,
  rateToDraft,
  splitField,
} from '../../src/snow/app/store';
import type { Reason } from '../../src/snow/app/store';
import { hillVisual } from '../../src/snow/app/loop';
import { STORY_DURATION } from '../../src/snow/app/story';
import { resultsSentence, scrubSentence } from '../../src/snow/app/text';

const D = DEFAULT_SNOW_INPUTS;
const END = 32;

function run(store: ReturnType<typeof createStore>, seconds: number, dt = 1 / 30): void {
  for (let t = 0; t < seconds; t += dt) store.tick(dt);
}

describe('drafts', () => {
  it('lists every field in panel order', () => {
    expect(FIELDS).toEqual(SNOW_FIELDS);
    expect(FIELDS[0]).toBe('budget');
    expect(FIELDS.length).toBe(10);
    expect(splitField('card.apr')).toEqual({ debt: 'card', key: 'apr' });
    expect(splitField('budget')).toBe(null);
  });

  it('shows rates in percent and dollars with grouping', () => {
    expect(inputsToDraft(D)).toEqual({
      budget: '800',
      'medical.balance': '1,000',
      'medical.apr': '0',
      'medical.minPayment': '40',
      'car.balance': '6,000',
      'car.apr': '6',
      'car.minPayment': '180',
      'card.balance': '12,000',
      'card.apr': '26',
      'card.minPayment': '300',
    });
    expect(rateToDraft(0.005)).toBe('0.5');
    expect(rateToDraft(0.225)).toBe('22.5');
  });

  it('round-trips through draftToInputs', () => {
    expect(draftToInputs(inputsToDraft(D))).toEqual(D);
    const odd: SnowInputs = {
      budget: 1_250,
      debts: {
        medical: { balance: 1_300, apr: 0.0575, minPayment: 45 },
        car: { balance: 12_345, apr: 0.1975, minPayment: 400 },
        card: { balance: 800, apr: 0.035, minPayment: 25 },
      },
    };
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
  it('applies valid drafts, changes the timeline and leaves the story', () => {
    const s = createStore();
    expect(s.horizon()).toBe(END);
    s.actions.setDraftField('card.apr', '30');
    s.actions.commitInputs();
    expect(s.state.inputs.debts.card.apr).toBeCloseTo(0.3, 12);
    expect(s.horizon()).toBe(horizonMonths(s.state.inputs));
    expect(s.horizon()).toBeGreaterThan(END);
    expect(s.state.mode).toBe('explore');
    expect(s.state.playing).toBe(false);
  });

  it('keeps the last valid inputs and records an error for each bad field', () => {
    const s = createStore();
    const reasons: Reason[] = [];
    s.subscribe((r) => reasons.push(r));
    s.actions.setDraftField('car.balance', '50');
    s.actions.setDraftField('card.minPayment', 'lots');
    s.actions.commitInputs();
    expect(s.state.inputs).toEqual(D);
    expect(s.state.errors['car.balance']).toMatch(/between \$100 and \$100,000/);
    expect(s.state.errors['card.minPayment']).toMatch(/must be a number/);
    expect(s.state.mode).toBe('story'); // an invalid edit does not leave the story
    expect(reasons).toContain('errors');
    s.actions.setDraftField('car.balance', '7,000');
    s.actions.setDraftField('card.minPayment', '320');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(s.state.inputs.debts.car.balance).toBe(7000);
    expect(s.state.inputs.debts.card.minPayment).toBe(320);
  });

  it('rejects out-of-range values in every kind of field', () => {
    const s = createStore();
    for (const [field, text] of [
      ['budget', '29'],
      ['budget', '20001'],
      ['medical.balance', '99'],
      ['car.balance', '100001'],
      ['medical.apr', '-1'],
      ['card.apr', '41'],
      ['car.minPayment', '9'],
      ['car.minPayment', '5001'],
    ] as const) {
      s.actions.setDraftField(field, text);
      s.actions.commitInputs();
      expect(s.state.errors[field], `${field}=${text}`).toBeTruthy();
      s.actions.setDraftField(field, inputsToDraft(D)[field]);
      s.actions.commitInputs();
      expect(s.state.errors).toEqual({});
    }
  });

  it('a minimum under its first month of interest, and a budget under the minimums, are refused with a reason', () => {
    const s = createStore();
    s.actions.setDraftField('card.minPayment', '250');
    s.actions.commitInputs();
    expect(s.state.errors['card.minPayment']).toBe('The minimum payment must be at least $260 to cover the interest.');
    expect(s.state.inputs).toEqual(D);
    s.actions.setDraftField('card.minPayment', '300');
    s.actions.setDraftField('budget', '500');
    s.actions.commitInputs();
    expect(s.state.errors['budget']).toBe('The monthly budget must be at least $520, the three minimums.');
    expect(s.state.inputs).toEqual(D);
    s.actions.setDraftField('budget', '520');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(s.state.inputs.budget).toBe(520);
  });

  it('APR 0 is accepted', () => {
    const s = createStore();
    s.actions.setDraftField('car.apr', '0');
    s.actions.commitInputs();
    expect(s.state.errors).toEqual({});
    expect(s.state.inputs.debts.car.apr).toBe(0);
  });

  it('a no-op commit does not leave the story', () => {
    const s = createStore();
    s.actions.setDraftField('card.apr', '26');
    s.actions.commitInputs();
    expect(s.state.mode).toBe('story');
  });

  it('shortening the timeline clamps the clock to the new end and pauses', () => {
    const s = createStore();
    s.actions.skipToExplore();
    s.actions.scrubTo(31);
    s.actions.setDraftField('budget', '3,000');
    s.actions.commitInputs();
    expect(s.horizon()).toBeLessThan(31);
    expect(s.state.months).toBe(s.horizon());
    expect(s.state.playing).toBe(false);
  });

  it('lengthening keeps the clock where it is', () => {
    const s = createStore();
    s.actions.scrubTo(20);
    s.actions.setDraftField('budget', '600');
    s.actions.commitInputs();
    expect(s.state.months).toBe(20);
  });

  it('tidyField restores the canonical text only when it means the same number', () => {
    const s = createStore();
    s.actions.setDraftField('car.balance', '6000');
    s.actions.tidyField('car.balance');
    expect(s.state.draft['car.balance']).toBe('6,000');
    s.actions.setDraftField('card.apr', 'x');
    s.actions.commitInputs();
    s.actions.tidyField('card.apr');
    expect(s.state.draft['card.apr']).toBe('x');
  });

  it('does not share its inputs with the defaults', () => {
    const s = createStore();
    s.actions.stepField('medical.balance', 1);
    expect(D.debts.medical.balance).toBe(1000);
  });
});

describe('stepField', () => {
  it('steps within limits and commits immediately', () => {
    const s = createStore();
    s.actions.stepField('budget', 1);
    expect(s.state.inputs.budget).toBe(850);
    s.actions.stepField('card.apr', 1);
    expect(s.state.inputs.debts.card.apr).toBeCloseTo(0.265, 12);
    s.actions.stepField('card.apr', -1);
    s.actions.stepField('card.apr', -1);
    expect(s.state.inputs.debts.card.apr).toBeCloseTo(0.255, 12);
    s.actions.stepField('car.balance', 1);
    expect(s.state.inputs.debts.car.balance).toBe(6500);
    s.actions.stepField('medical.minPayment', 1);
    expect(s.state.inputs.debts.medical.minPayment).toBe(45);
    s.actions.stepField('car.minPayment', 1);
    expect(s.state.inputs.debts.car.minPayment).toBe(190);
  });

  it('a step the rules refuse leaves the numbers and shows why', () => {
    const s = createStore({ inputs: { ...D, budget: 520 } });
    s.actions.stepField('budget', -1);
    expect(s.state.errors['budget']).toMatch(/at least \$520/);
    expect(s.state.inputs.budget).toBe(520);
  });

  it('clamps at the limits', () => {
    const lo: SnowInputs = {
      budget: SNOW_LIMITS.budget.min,
      debts: {
        medical: { balance: 100, apr: 0, minPayment: 10 },
        car: { balance: 100, apr: 0, minPayment: 10 },
        card: { balance: 100, apr: 0, minPayment: 10 },
      },
    };
    // (the lowest budget, $30, is exactly the three lowest minimums)
    const s = createStore({ inputs: lo });
    for (const f of ['budget', 'medical.balance', 'car.apr', 'card.minPayment'] as const) {
      s.actions.stepField(f, -1);
      expect(s.state.errors, f).toEqual({});
    }
    expect(s.state.inputs).toEqual(lo);
    const hi = createStore({ inputs: { budget: 20_000, debts: { medical: { balance: 100_000, apr: 0.4, minPayment: 5_000 }, car: { balance: 1000, apr: 0, minPayment: 10 }, card: { balance: 1000, apr: 0, minPayment: 10 } } } });
    for (const f of ['budget', 'medical.balance', 'medical.apr', 'medical.minPayment'] as const) hi.actions.stepField(f, 1);
    expect(hi.state.errors).toEqual({});
    expect(hi.state.inputs.budget).toBe(20_000);
    expect(hi.state.inputs.debts.medical).toEqual({ balance: 100_000, apr: 0.4, minPayment: 5_000 });
  });

  it('dollar steps grow with the amount and mirror going down', () => {
    expect(fieldStep('car.balance', 500)).toBe(100);
    expect(fieldStep('car.balance', 5000)).toBe(500);
    expect(fieldStep('car.balance', 20_000)).toBe(1000);
    expect(fieldStep('budget', 200)).toBe(10);
    expect(fieldStep('budget', 800)).toBe(50);
    expect(fieldStep('card.minPayment', 40)).toBe(5);
    expect(fieldStep('card.minPayment', 300)).toBe(25);
    expect(fieldStep('card.apr', 26)).toBe(0.5);
    const s = createStore();
    s.actions.stepField('car.balance', 1);
    expect(s.state.inputs.debts.car.balance).toBe(6500);
    s.actions.stepField('car.balance', -1);
    expect(s.state.inputs.debts.car.balance).toBe(6000);
    s.actions.stepField('car.balance', -1);
    expect(s.state.inputs.debts.car.balance).toBe(5500);
    s.actions.stepField('car.balance', 1);
    expect(s.state.inputs.debts.car.balance).toBe(6000);
  });

  it('snaps off-grid values to the next grid line', () => {
    const s = createStore();
    s.actions.setDraftField('car.balance', '6,250');
    s.actions.commitInputs();
    s.actions.stepField('car.balance', 1);
    expect(s.state.inputs.debts.car.balance).toBe(6_500);
    s.actions.stepField('car.balance', -1);
    expect(s.state.inputs.debts.car.balance).toBe(6_000);
  });

  it('field ranges match the limits', () => {
    expect(FIELD_RANGE.apr).toEqual({ min: 0, max: 40 });
    expect(FIELD_RANGE.balance.max).toBe(SNOW_LIMITS.balance.max);
    expect(FIELD_RANGE.minPayment).toEqual({ min: 10, max: 5000 });
    expect(FIELD_RANGE.budget).toEqual({ min: 30, max: 20000 });
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

  it('speed runs from 0.1x to 5x, in tenths', () => {
    const s = createStore();
    s.actions.setSpeed(0.02);
    expect(s.state.speed).toBe(0.1);
    s.actions.setSpeed(9);
    expect(s.state.speed).toBe(5);
    s.actions.setSpeed(2.37);
    expect(s.state.speed).toBe(2.4);
    s.actions.setSpeed(Number.NaN);
    expect(s.state.speed).toBe(1);
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

  it('monthsPerSecond is the live clock rate: 0 in the intro, moving through the long stretch, 0 when paused', () => {
    const s = createStore();
    s.actions.play();
    run(s, 3);
    expect(s.state.monthsPerSecond).toBe(0); // the intro holds still
    run(s, 20); // t = 23
    expect(s.state.monthsPerSecond).toBeGreaterThan(1);
    s.actions.pause();
    expect(s.state.monthsPerSecond).toBe(0);
    s.tick(1 / 30);
    expect(s.state.monthsPerSecond).toBe(0);
  });

  it('explore advances 3 months per second at 1x and stops at the end', () => {
    const s = createStore();
    s.actions.skipToExplore();
    s.actions.scrubTo(0);
    s.actions.play();
    run(s, 4);
    expect(s.state.months).toBeCloseTo(4 * EXPLORE_MONTHS_PER_SECOND, 0);
    expect(s.state.monthsPerSecond).toBeCloseTo(EXPLORE_MONTHS_PER_SECOND, 5);
    s.actions.setSpeed(2);
    run(s, 2);
    expect(s.state.months).toBeCloseTo(24, 0);
    expect(s.state.monthsPerSecond).toBeCloseTo(2 * EXPLORE_MONTHS_PER_SECOND, 5);
    run(s, 20);
    expect(s.state.months).toBe(END);
    expect(s.state.playing).toBe(false);
    expect(s.state.monthsPerSecond).toBe(0);
  });

  it('very long timelines play faster so they still take about 30 seconds', () => {
    expect(exploreRate(32)).toBe(EXPLORE_MONTHS_PER_SECOND);
    expect(exploreRate(720)).toBe(24);
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
    s.actions.scrubTo(13);
    expect(s.state.mode).toBe('explore');
    expect(s.state.playing).toBe(false);
    expect(s.state.months).toBe(13);
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
    s.actions.seekStory(17.5);
    expect(s.state.mode).toBe('story');
    expect(s.state.months).toBeCloseTo(4, 12);
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

describe('scene frame values (hillVisual)', () => {
  const [snow0, av0] = allStrategies(D, 0);

  it('sizes are fractions of the LARGEST starting balance, on one scale for both hills', () => {
    const s = hillVisual(snow0, D);
    const a = hillVisual(av0, D);
    expect(s.id).toBe('snowball');
    expect(a.id).toBe('avalanche');
    expect(s.balls.map((b) => b.id)).toEqual(['medical', 'car', 'card']);
    expect(s.balls.map((b) => b.size)).toEqual([1000 / 12000, 6000 / 12000, 1]);
    expect(a.balls.map((b) => b.size)).toEqual(s.balls.map((b) => b.size));
  });

  it('starts at the top of every lane with nothing rolling yet paid, the first targets set, nothing cleared', () => {
    const s = hillVisual(snow0, D);
    expect(s.balls.every((b) => b.progress === 0 && !b.paidOff)).toBe(true);
    expect(s.balls.map((b) => b.target)).toEqual([true, false, false]);
    expect(hillVisual(av0, D).balls.map((b) => b.target)).toEqual([false, false, true]);
    expect(s.paidOff).toBe(false);
    // snowfall: this month's interest over the largest balance; none on the 0% debt, most on the card
    expect(s.balls[0].snowfall).toBe(0);
    expect(s.balls[1].snowfall).toBeCloseTo(30 / 12000, 12);
    expect(s.balls[2].snowfall).toBeCloseTo(260 / 12000, 12);
    // rolling: this month's payment over the largest balance
    expect(s.balls[0].rolling).toBeCloseTo(320 / 12000, 12);
    expect(s.balls[1].rolling).toBeCloseTo(180 / 12000, 12);
    expect(s.balls[2].rolling).toBeCloseTo(300 / 12000, 12);
    expect(hillVisual(av0, D).balls[2].rolling).toBeCloseTo(580 / 12000, 12);
  });

  it('progress is 1 minus balance over the debt\'s own starting balance, clamped to 0 to 1', () => {
    const snap = allStrategies(D, 12)[0];
    const v = hillVisual(snap, D);
    expect(v.balls[1].progress).toBeCloseTo(1 - snap.debts.car.balance / 6000, 12);
    expect(v.balls[2].progress).toBeCloseTo(1 - snap.debts.card.balance / 12000, 12);
    expect(v.balls[0].progress).toBe(1);
    for (let m = 0; m <= END; m += 0.25) {
      for (const id of [0, 1] as const) {
        for (const b of hillVisual(allStrategies(D, m)[id], D).balls) {
          expect(b.progress).toBeGreaterThanOrEqual(0);
          expect(b.progress).toBeLessThanOrEqual(1);
          expect(b.size).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('a ball that stays as it is (payments only cover the interest) has not rolled and keeps its size', () => {
    const flat: SnowInputs = { budget: 6200, debts: { medical: { balance: 60_000, apr: 0.24, minPayment: 1200 }, car: { balance: 80_000, apr: 0.3, minPayment: 2000 }, card: { balance: 90_000, apr: 0.4, minPayment: 3000 } } };
    const v = hillVisual(allStrategies(flat, 100)[0], flat);
    expect(v.balls.every((b) => Math.abs(b.progress) < 1e-9)).toBe(true);
    expect(v.balls.map((b) => b.size)).toEqual([60_000 / 90_000, 80_000 / 90_000, 1]);
  });

  it('a cleared debt: ball gone (paidOff), nothing falling, nothing rolling, not the target', () => {
    const snap = allStrategies(D, 5)[0];
    const v = hillVisual(snap, D);
    expect(v.balls[0]).toMatchObject({ size: 0, progress: 1, snowfall: 0, rolling: 0, target: false, paidOff: true });
    expect(v.balls[1].target).toBe(true);
  });

  it('the target ball is the one in the engine\'s own row', () => {
    for (let m = 0; m < END; m += 1) {
      const snap = allStrategies(D, m + 0.5)[0];
      const target = hillVisual(snap, D).balls.find((b) => b.target)?.id;
      expect(target).toBe(strategySchedule(D, 'snowball').rows[m].target);
    }
  });

  it('when everything is cleared the hill is paidOff and no ball is the target', () => {
    const v = hillVisual(allStrategies(D, 32)[0], D);
    expect(v.paidOff).toBe(true);
    expect(v.balls.every((b) => b.paidOff && !b.target && b.size === 0)).toBe(true);
    const av = hillVisual(allStrategies(D, 32)[1], D);
    expect(av.paidOff).toBe(true);
  });

  it('balls fall smoothly: no frame-to-frame jump in size larger than a month of payments', () => {
    let prev = hillVisual(allStrategies(D, 0)[0], D).balls.map((b) => b.size);
    for (let m = 1 / 60; m <= END; m += 1 / 60) {
      const now = hillVisual(allStrategies(D, m)[0], D).balls.map((b) => b.size);
      now.forEach((size, i) => expect(Math.abs(prev[i] - size)).toBeLessThan(0.04));
      prev = now;
    }
  });
});

describe('text for announcements', () => {
  it('results sentence names both hills with their time and interest', () => {
    expect(resultsSentence(D)).toBe(
      'Snowball: smallest first: 2 years, 8 months and $6,295 in interest. Avalanche: highest rate first: 2 years, 6 months and $4,642 in interest.',
    );
  });

  it('scrub sentence gives the clock and both totals', () => {
    expect(scrubSentence(D, 12)).toBe(
      'Year 1, month 0. Snowball: smallest first: $12,711 still owed, $3,311 in interest. Avalanche: highest rate first: $12,337 still owed, $2,937 in interest.',
    );
  });
});
