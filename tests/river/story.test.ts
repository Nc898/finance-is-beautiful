import { describe, expect, it } from 'vitest';
import { DEFAULT_RIVER_INPUTS, allBoats, buysToday, formatCurrency } from '../../src/river/engine';
import type { RiverInputs } from '../../src/river/engine';
import {
  BEATS,
  STORY_DURATION,
  captionForBeat,
  storyBeat,
  storyCamera,
  storyChapter,
  storyDuration,
  storyCaption,
  storyYearMarks,
  storyYears,
} from '../../src/river/app/story';

const D = DEFAULT_RIVER_INPUTS;
const cases: Array<[string, RiverInputs]> = [
  ['default', D],
  ['one year', { ...D, years: 1 }],
  ['short', { ...D, years: 7 }],
  ['long', { ...D, years: 60 }],
  ['zero inflation', { ...D, inflation: 0 }],
  ['negative investing', { ...D, investRate: -0.04 }],
  ['rate equals inflation', { ...D, savingsRate: 0.03, investRate: 0.03 }],
];

describe.each([false, true])('story (reduced=%s)', (reduced) => {
  describe.each(cases)('%s', (_name, inputs) => {
    const dur = storyDuration(inputs, reduced);

    it('starts at year 0 and ends exactly at the last year', () => {
      expect(storyYears(0, inputs, reduced)).toBe(0);
      expect(storyYears(-3, inputs, reduced)).toBe(0);
      expect(storyYears(dur, inputs, reduced)).toBe(inputs.years);
      expect(storyYears(dur + 100, inputs, reduced)).toBe(inputs.years);
    });

    it('is monotonic and stays inside the timeline', () => {
      let prev = -Infinity;
      for (let t = 0; t <= dur; t += 0.02) {
        const y = storyYears(t, inputs, reduced);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(inputs.years);
        prev = y;
      }
    });

    it('runs the chapters in order and ends on the handoff', () => {
      const order = ['intro', 'current', 'rowing', 'results', 'handoff'];
      let idx = 0;
      for (let t = 0; t <= dur; t += 0.05) {
        const i = order.indexOf(storyChapter(t, inputs, reduced));
        expect(i).toBeGreaterThanOrEqual(idx);
        idx = i;
      }
      expect(storyChapter(0, inputs, reduced)).toBe('intro');
      expect(storyBeat(dur, inputs, reduced)).toBe('handoff');
      expect(storyBeat(dur - 0.01, inputs, reduced)).toBe('handoff');
    });

    it('visits every beat in order', () => {
      const seen: string[] = [];
      for (let t = 0; t <= dur; t += 0.05) {
        const b = storyBeat(t, inputs, reduced);
        if (seen[seen.length - 1] !== b) seen.push(b);
      }
      expect(seen).toEqual([...BEATS]);
    });

    it('has live, non-empty captions with the real numbers', () => {
      for (const beat of BEATS) {
        const c = captionForBeat(beat, inputs);
        expect(c.beat).toBe(beat);
        expect(c.primary.length).toBeGreaterThan(5);
        expect(`${c.primary} ${c.secondary ?? ''}`).not.toMatch(/NaN|undefined|Infinity/);
      }
      const results = captionForBeat('results', inputs);
      const [cash, savings, invest] = allBoats(inputs, inputs.years);
      expect(results.primary).toContain(formatCurrency(inputs.start));
      expect(results.secondary).toContain(formatCurrency(savings.nominal));
      expect(results.secondary).toContain(formatCurrency(invest.nominal));
      if (inputs.inflation > 0) expect(results.primary).toContain(buysToday(cash.real));
    });
  });
});

describe('story timing (normal motion)', () => {
  it('lasts 52 seconds and follows the documented table at the defaults', () => {
    expect(STORY_DURATION).toBe(52);
    expect(storyDuration(D)).toBe(52);
    const at = (t: number) => storyYears(t, D);
    expect(at(0)).toBe(0);
    expect(at(6)).toBe(0); // the intro holds still
    expect(at(5.9)).toBe(0);
    expect(at(12)).toBeCloseTo(1, 12);
    expect(at(20)).toBeCloseTo(6, 12);
    expect(at(28)).toBeCloseTo(14, 12);
    expect(at(38)).toBe(30);
    expect(at(48)).toBe(30); // results hold
    expect(at(52)).toBe(30);
  });

  it('puts each beat where the table says', () => {
    const beat = (t: number) => storyBeat(t, D);
    expect(beat(0)).toBe('intro');
    expect(beat(5.99)).toBe('intro');
    expect(beat(6)).toBe('current');
    expect(beat(12)).toBe('cash');
    expect(beat(20)).toBe('savings');
    expect(beat(28)).toBe('invest');
    expect(beat(38)).toBe('results');
    expect(beat(48)).toBe('handoff');
  });

  it('uses the whole-year marks 1, 6, 14, 30 at the defaults and clamps them for short timelines', () => {
    expect(storyYearMarks(D)).toEqual({ current: 1, cash: 6, savings: 14, end: 30 });
    const m1 = storyYearMarks({ ...D, years: 1 });
    expect(m1).toEqual({ current: 1, cash: 1, savings: 1, end: 1 });
    const m7 = storyYearMarks({ ...D, years: 7 });
    expect(m7.current).toBeLessThanOrEqual(m7.cash);
    expect(m7.cash).toBeLessThanOrEqual(m7.savings);
    expect(m7.savings).toBeLessThanOrEqual(7);
  });

  it('moves the boats during the rowing beats, not before the water flows', () => {
    for (let t = 0; t < 6; t += 0.5) expect(storyYears(t, D)).toBe(0);
    expect(storyYears(7, D)).toBeGreaterThan(0);
    expect(storyYears(25, D)).toBeGreaterThan(storyYears(20, D));
  });
});

describe('story captions', () => {
  it('opens with the three boats and the live starting amount', () => {
    const c = captionForBeat('intro', { ...D, start: 25_000 });
    expect(c.primary).toBe('Three boats. The same $25,000.');
    expect(c.secondary).toBe('Cash, a savings account, and investing.');
  });

  it('gives the default results the documented numbers', () => {
    const c = captionForBeat('results', D);
    expect(c.primary).toBe('Still $10,000 in cash. It buys what $4,120 buys today.');
    expect(c.secondary).toContain('$18,114');
    expect(c.secondary).toContain('$7,463');
    expect(c.secondary).toContain('$57,435');
    expect(c.secondary).toContain('$23,662');
  });

  it('copy follows the scenario: still water, savings ahead, negative investing', () => {
    expect(captionForBeat('current', { ...D, inflation: 0 }).primary).toBe('In this river, prices hold steady.');
    expect(captionForBeat('cash', { ...D, inflation: 0 }).primary).toMatch(/still water/);
    expect(captionForBeat('savings', D).primary).toBe('A savings account rows, but slower than the current.');
    expect(captionForBeat('savings', { ...D, savingsRate: 0.05 }).primary).toMatch(/faster than the current/);
    expect(captionForBeat('savings', { ...D, savingsRate: 0.03 }).primary).toMatch(/exactly as fast/);
    expect(captionForBeat('savings', { ...D, savingsRate: 0 }).primary).toMatch(/earns nothing/);
    expect(captionForBeat('invest', D).primary).toBe('Investing has to row harder than the current to make headway.');
    expect(captionForBeat('invest', { ...D, investRate: -0.02 }).primary).toMatch(/drifts faster than cash/);
    expect(captionForBeat('invest', { ...D, investRate: 0.02 }).primary).toMatch(/slower than the current/);
    expect(captionForBeat('handoff', D).primary).toBe('Explore your own river');
  });

  it('storyCaption follows the beat and the inputs', () => {
    expect(storyCaption(0, D).beat).toBe('intro');
    expect(storyCaption(40, D).primary).toContain('Still $10,000 in cash');
    expect(storyCaption(49, D).primary).toBe('Explore your own river');
  });

  it('never uses a hard-coded dollar figure: captions change with the starting amount', () => {
    const a = captionForBeat('results', { ...D, start: 10_000 });
    const b = captionForBeat('results', { ...D, start: 50_000 });
    expect(a.primary).not.toBe(b.primary);
    expect(b.primary).toContain('$50,000');
  });
});

describe('story camera', () => {
  it('starts close on the dock, then eases out to the full river before the boats separate far', () => {
    const c0 = storyCamera(0, D)!;
    expect(c0.zoom).toBeGreaterThan(2);
    expect(c0.focusU).toBe(0);
    expect(storyCamera(11.99, D)!.zoom).toBeLessThan(1.05);
    expect(storyCamera(12, D)).toBeUndefined();
    expect(storyCamera(30, D)).toBeUndefined();
  });

  it('never zooms below 1 and eases out monotonically after the hold', () => {
    let prev = Infinity;
    for (let t = 6; t < 12; t += 0.05) {
      const z = storyCamera(t, D)!.zoom;
      expect(z).toBeGreaterThanOrEqual(1);
      expect(z).toBeLessThanOrEqual(prev + 1e-9);
      prev = z;
    }
  });

  it('has no camera move in reduced motion', () => {
    for (const t of [0, 3, 8, 11]) expect(storyCamera(t, D, true)).toBeUndefined();
  });
});

describe('reduced motion holds', () => {
  it('holds still at discrete years with short tweens, and is shorter than the full story', () => {
    const dur = storyDuration(D, true);
    expect(dur).toBeGreaterThan(20);
    expect(dur).toBeLessThan(STORY_DURATION + 5);
    // Within a hold the clock is constant: sample the middle of each hold.
    const years = new Set<number>();
    for (let t = 0; t < dur; t += 0.1) years.add(Math.round(storyYears(t, D, true) * 1000) / 1000);
    for (const y of [0, 1, 6, 14, 30]) expect(years.has(y)).toBe(true);
    // the first hold is flat for several seconds
    expect(storyYears(0, D, true)).toBe(0);
    expect(storyYears(4, D, true)).toBe(0);
  });

  it('shows the same final results as the normal story', () => {
    expect(storyYears(storyDuration(D, true), D, true)).toBe(storyYears(STORY_DURATION, D));
    expect(storyBeat(storyDuration(D, true) - 5, D, true)).toBe('results');
  });
});

describe('formatting in captions', () => {
  it('uses the shared currency format (no cents, grouped)', () => {
    expect(formatCurrency(1234567)).toBe('$1,234,567');
  });
});
