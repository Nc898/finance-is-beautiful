import { describe, expect, it } from 'vitest';
import { DEFAULT_VINE_INPUTS, formatCurrency, formatDuration, horizonMonths, planSchedule } from '../../src/vine/engine';
import type { VineInputs } from '../../src/vine/engine';
import {
  BEATS,
  BEAT_STARTS,
  CAMERA_ZOOM,
  FIXED_DONE_AT,
  STORY_DURATION,
  captionForBeat,
  minimumLiveLine,
  storyBeat,
  storyCamera,
  storyCaption,
  storyDuration,
  storyMonthMarks,
  storyMonths,
} from '../../src/vine/app/story';
import { sceneSummary, timelineTicks } from '../../src/vine/app/text';

const D = DEFAULT_VINE_INPUTS;
const cases: Array<[string, VineInputs]> = [
  ['default', D],
  ['no interest', { ...D, apr: 0 }],
  ['fixed below the minimum (identical plans)', { ...D, fixedPayment: 20 }],
  ['fixed clears in one month', { ...D, balance: 300, fixedPayment: 5000 }],
  ['fixed clears in two months', { ...D, balance: 1000, fixedPayment: 600 }],
  ['small card', { ...D, balance: 300 }],
  ['big, slow card', { ...D, balance: 40_000, apr: 0.3, minPercent: 0.005 }],
  ['never clears in 60 years', { ...D, balance: 100_000, apr: 0.4, minPercent: 0.005, minFloor: 0, fixedPayment: 10 }],
];

describe.each([false, true])('story (reduced=%s)', (reduced) => {
  describe.each(cases)('%s', (_name, inputs) => {
    const dur = storyDuration(inputs, reduced);
    const end = horizonMonths(inputs);

    it('starts at month 0 and ends exactly at the later payoff', () => {
      expect(storyMonths(0, inputs, reduced)).toBe(0);
      expect(storyMonths(-3, inputs, reduced)).toBe(0);
      expect(storyMonths(dur, inputs, reduced)).toBe(end);
      expect(storyMonths(dur + 100, inputs, reduced)).toBe(end);
    });

    it('is monotonic and stays inside the timeline', () => {
      let prev = -Infinity;
      for (let t = 0; t <= dur; t += 0.02) {
        const m = storyMonths(t, inputs, reduced);
        expect(m).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(end);
        prev = m;
      }
    });

    it('visits every beat in order and ends on the handoff', () => {
      const seen: string[] = [];
      for (let t = 0; t <= dur; t += 0.05) {
        const b = storyBeat(t, inputs, reduced);
        if (seen[seen.length - 1] !== b) seen.push(b);
      }
      expect(seen).toEqual([...BEATS]);
      expect(storyBeat(0, inputs, reduced)).toBe('intro');
      expect(storyBeat(dur, inputs, reduced)).toBe('handoff');
    });

    it('has live, non-empty captions with real numbers and no em-dashes', () => {
      for (const beat of BEATS) {
        const c = captionForBeat(beat, inputs);
        expect(c.beat).toBe(beat);
        expect(c.primary.length).toBeGreaterThan(5);
        const text = `${c.primary} ${c.secondary ?? ''}`;
        expect(text).not.toMatch(/NaN|undefined|Infinity/);
        expect(text).not.toContain('—');
        expect(text).not.toContain('–');
      }
    });
  });
});

describe('story timing (normal motion, defaults)', () => {
  it('lasts 52 seconds and follows the month marks 0, 3, 34 and 230', () => {
    expect(STORY_DURATION).toBe(52);
    expect(storyDuration(D)).toBe(52);
    expect(storyMonthMarks(D)).toEqual({ interest: 3, fixed: 34, hold: 144, end: 230 });
    const at = (t: number) => storyMonths(t, D);
    expect(at(0)).toBe(0);
    expect(at(5.9)).toBe(0); // the intro holds still
    expect(at(6)).toBe(0);
    expect(at(12)).toBeCloseTo(3, 12);
    expect(at(FIXED_DONE_AT)).toBeCloseTo(34, 12); // the fixed vine is cleared during its own beat
    expect(at(40)).toBe(230);
    expect(at(48)).toBe(230); // results hold
    expect(at(52)).toBe(230);
  });

  it('puts each beat where the table says', () => {
    const beat = (t: number) => storyBeat(t, D);
    expect(BEAT_STARTS).toEqual({ intro: 0, interest: 6, fixed: 12, minimum: 22, results: 40, handoff: 48 });
    expect(beat(0)).toBe('intro');
    expect(beat(5.99)).toBe('intro');
    expect(beat(6)).toBe('interest');
    expect(beat(12)).toBe('fixed');
    expect(beat(22)).toBe('minimum');
    expect(beat(40)).toBe('results');
    expect(beat(48)).toBe('handoff');
  });

  it('months accelerate smoothly through the long stretch: no jumps in speed from frame to frame', () => {
    const dt = 1 / 60;
    let prevM = storyMonths(0, D);
    let prevV = 0;
    let maxV = 0;
    let maxA = 0;
    for (let t = dt; t <= STORY_DURATION; t += dt) {
      const m = storyMonths(t, D);
      const v = (m - prevM) / dt;
      maxA = Math.max(maxA, Math.abs(v - prevV) / dt);
      maxV = Math.max(maxV, v);
      prevM = m;
      prevV = v;
    }
    expect(maxV).toBeLessThan(20); // months per second
    expect(maxA).toBeLessThan(6); // months per second squared: eased, never a step
    // and it really does speed up from the first beats to the long stretch
    const speed = (t: number) => (storyMonths(t + 0.05, D) - storyMonths(t - 0.05, D)) / 0.1;
    expect(speed(9)).toBeLessThan(speed(16));
    expect(speed(16)).toBeLessThan(speed(30));
  });

  it('does not move before the pruning starts', () => {
    for (let t = 0; t < 6; t += 0.5) expect(storyMonths(t, D)).toBe(0);
    expect(storyMonths(7, D)).toBeGreaterThan(0);
  });
});

describe('story marks adapt to the inputs', () => {
  it('the fixed beat ends at the fixed payoff month, wherever it is', () => {
    const inp = { ...D, fixedPayment: 400 };
    const marks = storyMonthMarks(inp);
    expect(marks.fixed).toBe(planSchedule(inp, 'fixed').payoffMonth);
    expect(storyMonths(FIXED_DONE_AT, inp)).toBeCloseTo(marks.fixed, 12);
    expect(storyMonths(40, inp)).toBe(marks.end);
    const slow = { ...D, fixedPayment: 150 };
    expect(storyMonthMarks(slow).fixed).toBeGreaterThan(storyMonthMarks(D).fixed);
    expect(storyMonths(FIXED_DONE_AT, slow)).toBeCloseTo(planSchedule(slow, 'fixed').payoffMonth, 12);
  });

  it('marks stay ordered: interest <= fixed <= hold <= end', () => {
    for (const [, inputs] of cases) {
      const m = storyMonthMarks(inputs);
      expect(m.interest).toBeLessThanOrEqual(m.fixed);
      expect(m.fixed).toBeLessThanOrEqual(m.hold);
      expect(m.hold).toBeLessThanOrEqual(m.end);
      expect(m.end).toBe(horizonMonths(inputs));
    }
  });

  it('when the plans are identical (fixed below the minimum) the clock just runs on, with no stall at the fixed mark', () => {
    const inp = { ...D, fixedPayment: 20 };
    expect(storyMonthMarks(inp).fixed).toBe(230);
    let prev = storyMonths(12, inp);
    for (let t = 12.5; t <= 40; t += 0.5) {
      const m = storyMonths(t, inp);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
    expect(storyMonths(40, inp)).toBe(230);
    expect(captionForBeat('fixed', inp).primary).toBe('A fixed $20 is no more than the minimum, so both pay the minimum.');
    expect(captionForBeat('fixed', inp).secondary).toBe('The card asks for at least $141.67 to start.');
  });

  it('when the fixed plan clears within three months the beat holds there', () => {
    const inp = { ...D, balance: 300, fixedPayment: 5000 };
    expect(planSchedule(inp, 'fixed').payoffMonth).toBe(1);
    expect(storyMonthMarks(inp).interest).toBe(1);
    expect(storyMonths(12, inp)).toBe(1);
    expect(storyMonths(20, inp)).toBe(1);
    expect(storyMonths(40, inp)).toBe(horizonMonths(inp));
  });

  it('a very long minimum stretch still ends at its payoff, in 40 seconds', () => {
    const inp = { ...D, balance: 40_000, apr: 0.3, minPercent: 0.005 };
    const end = horizonMonths(inp);
    expect(end).toBeGreaterThan(300);
    expect(storyMonths(40, inp)).toBe(end);
    expect(storyMonths(39.99, inp)).toBeLessThanOrEqual(end);
  });
});

describe('story captions', () => {
  it('give the default story the documented copy', () => {
    expect(captionForBeat('intro', D)).toEqual({
      beat: 'intro',
      primary: 'Two cottages. The same $5,000 vine.',
      secondary: 'A credit card balance at 22% a year.',
    });
    expect(captionForBeat('interest', D)).toEqual({
      beat: 'interest',
      primary: 'Interest grows it back every month.',
      secondary: 'About $92 a month to start.',
    });
    expect(captionForBeat('fixed', D).primary).toBe('A fixed $200 a month clears it in 2 years, 10 months.');
    expect(captionForBeat('minimum', D, 144)).toEqual({
      beat: 'minimum',
      primary: 'Minimum payments trim a little. The vine keeps coming back.',
      secondary: 'Year 12: $1,176 still owed.',
      live: true,
    });
    expect(captionForBeat('results', D)).toEqual({
      beat: 'results',
      primary: 'Minimum payments: 19 years, 2 months and $8,100 in interest.',
      secondary: 'A fixed $200: $1,750 in interest.',
    });
    expect(captionForBeat('handoff', D).primary).toBe('Explore your own garden');
  });

  it('the live line follows the clock: year and what is still owed', () => {
    expect(minimumLiveLine(D, 60)).toBe('Year 5: $2,736 still owed.');
    expect(minimumLiveLine(D, 120)).toBe('Year 10: $1,497 still owed.');
    expect(minimumLiveLine(D, 180)).toBe('Year 15: $813 still owed.');
    expect(minimumLiveLine(D, 230)).toBe('Year 19: paid off.');
    // storyCaption passes the clock in
    expect(storyCaption(30, D).secondary).toBe(minimumLiveLine(D, storyMonths(30, D)));
    expect(storyCaption(30, D).live).toBe(true);
  });

  it('every number comes from the inputs and the engine', () => {
    const inp = { ...D, balance: 8000, apr: 0.18, fixedPayment: 350 };
    const min = planSchedule(inp, 'minimum');
    const fixed = planSchedule(inp, 'fixed');
    expect(captionForBeat('intro', inp).primary).toBe('Two cottages. The same $8,000 vine.');
    expect(captionForBeat('intro', inp).secondary).toBe('A credit card balance at 18% a year.');
    expect(captionForBeat('interest', inp).secondary).toBe('About $120 a month to start.');
    expect(captionForBeat('fixed', inp).primary).toBe(`A fixed $350 a month clears it in ${formatDuration(fixed.payoffMonth)}.`);
    const results = captionForBeat('results', inp);
    expect(results.primary).toBe(`Minimum payments: ${formatDuration(min.payoffMonth)} and ${formatCurrency(min.totalInterest)} in interest.`);
    expect(results.secondary).toBe(`A fixed $350: ${formatCurrency(fixed.totalInterest)} in interest.`);
  });

  it('with no interest nothing grows back', () => {
    const inp = { ...D, apr: 0 };
    expect(captionForBeat('intro', inp).secondary).toBe('A credit card balance with no interest at all.');
    expect(captionForBeat('interest', inp).primary).toBe('With no interest, nothing grows back.');
    expect(captionForBeat('results', inp).primary).toContain('$0 in interest');
  });

  it('a plan that never clears says what is left after 60 years', () => {
    const inp = { ...D, balance: 100_000, apr: 0.4, minPercent: 0.005, minFloor: 0, fixedPayment: 10 };
    const results = captionForBeat('results', inp);
    expect(results.primary).toMatch(/^Minimum payments: still \$[\d,]+ owed after 60 years and \$[\d,]+ in interest\.$/);
    expect(minimumLiveLine(inp, 720)).toMatch(/^Year 60: \$[\d,]+ still owed\.$/);
  });

  it('storyCaption follows the beat', () => {
    expect(storyCaption(0, D).beat).toBe('intro');
    expect(storyCaption(7, D).beat).toBe('interest');
    expect(storyCaption(15, D).primary).toContain('clears it in 2 years, 10 months');
    expect(storyCaption(45, D).primary).toContain('19 years, 2 months');
    expect(storyCaption(49, D).primary).toBe('Explore your own garden');
  });

  it('never uses a hard-coded dollar figure: captions change with the balance', () => {
    const a = captionForBeat('intro', { ...D, balance: 5000 });
    const b = captionForBeat('intro', { ...D, balance: 12_000 });
    expect(a.primary).not.toBe(b.primary);
    expect(b.primary).toContain('$12,000');
  });
});

describe('story camera', () => {
  it('starts close on both vines, then eases out to the whole garden by 12 s', () => {
    const c0 = storyCamera(0, D)!;
    expect(c0.zoom).toBeGreaterThan(2);
    expect(c0.zoom).toBeLessThan(CAMERA_ZOOM * 1.06);
    expect(c0.focus).toBe('both');
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
  it('holds still at the month marks with short eased tweens, shorter than the full story', () => {
    const dur = storyDuration(D, true);
    expect(dur).toBeGreaterThan(20);
    expect(dur).toBeLessThan(STORY_DURATION + 5);
    const months = new Set<number>();
    for (let t = 0; t < dur; t += 0.1) months.add(Math.round(storyMonths(t, D, true) * 1000) / 1000);
    for (const m of [0, 3, 34, 144, 230]) expect(months.has(m)).toBe(true);
    expect(storyMonths(4, D, true)).toBe(0);
  });

  it('shows the same final results as the normal story', () => {
    expect(storyMonths(storyDuration(D, true), D, true)).toBe(storyMonths(STORY_DURATION, D));
    expect(storyBeat(storyDuration(D, true) - 5, D, true)).toBe('results');
  });
});

describe('text: summary and timeline ticks', () => {
  it('the scene summary describes both cottages and follows the clock', () => {
    const s = sceneSummary(D, 144);
    expect(s).toContain('Two cottages');
    expect(s).toContain('$5,000');
    expect(s).toContain('Year 12, month 0.');
    expect(s).toContain('Minimum payments: $1,176 still owed');
    expect(s).toContain('A fixed $200 a month: Paid off in 2 years, 10 months');
    expect(s).not.toContain('—');
  });

  it('ticks: a label every five years for the default 230 months, and one tick per year', () => {
    const t = timelineTicks(230);
    expect(t.filter((x) => x.label).map((x) => x.label)).toEqual(['0', '5', '10', '15']);
    expect(t).toHaveLength(20); // years 0 to 19
    expect(t.find((x) => x.label === '5')!.month).toBe(60);
  });

  it('ticks adapt to the length of the timeline', () => {
    expect(timelineTicks(60).filter((x) => x.label).map((x) => x.label)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(timelineTicks(120).filter((x) => x.label).map((x) => x.label)).toEqual(['0', '2', '4', '6', '8', '10']);
    expect(timelineTicks(720).filter((x) => x.label).map((x) => x.label)).toEqual(['0', '10', '20', '30', '40', '50', '60']);
    expect(timelineTicks(10).filter((x) => x.label).map((x) => x.label)).toEqual(['0 mo', '3 mo', '6 mo', '9 mo']);
    expect(timelineTicks(0)).toEqual([{ month: 0, major: true, label: '0' }]);
  });

  it('a label too close to the end gives way to it', () => {
    const t = timelineTicks(61); // year 5 is one month from the end
    expect(t.find((x) => x.month === 60)!.label).toBeUndefined();
  });
});
