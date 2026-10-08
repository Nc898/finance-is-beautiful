import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, buildScenario } from '../../src/engine';
import type { Inputs } from '../../src/engine';
import {
  STORY_DURATION,
  loupeAt,
  storyCamera,
  storyAge,
  storyBeat,
  storyCaption,
  storyChapter,
  storyDuration,
} from '../../src/app/story';

const cases: Array<[string, Inputs]> = [
  ['default', DEFAULT_INPUTS],
  ['reversed starts', { ...DEFAULT_INPUTS, startAgeA: 35, startAgeB: 25 }],
  ['equal starts', { ...DEFAULT_INPUTS, startAgeA: 30, startAgeB: 30 }],
  ['start == end (both)', { ...DEFAULT_INPUTS, startAgeA: 65, startAgeB: 65 }],
  ['later tree starts at end', { ...DEFAULT_INPUTS, startAgeA: 25, startAgeB: 65 }],
  ['short timeline', { ...DEFAULT_INPUTS, startAgeA: 60, startAgeB: 62, endAge: 63 }],
];

describe.each([false, true])('story (reduced=%s)', (reduced) => {
  describe.each(cases)('%s', (_name, inputs) => {
    const start = Math.min(inputs.startAgeA, inputs.startAgeB) * 12;
    const end = inputs.endAge * 12;
    const dur = storyDuration(inputs, reduced);

    it('starts at the earlier start and ends exactly at endAge', () => {
      expect(storyAge(0, inputs, reduced)).toBe(start);
      expect(storyAge(dur, inputs, reduced)).toBe(end);
      expect(storyAge(dur + 100, inputs, reduced)).toBe(end);
      expect(storyAge(-5, inputs, reduced)).toBe(start);
    });

    it('is monotonic and stays inside the timeline', () => {
      let prev = -Infinity;
      for (let t = 0; t <= dur; t += 0.02) {
        const a = storyAge(t, inputs, reduced);
        expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(a).toBeGreaterThanOrEqual(start);
        expect(a).toBeLessThanOrEqual(end);
        prev = a;
      }
    });

    it('runs the chapters in order and ends on the handoff', () => {
      const order = ['planting', 'growing', 'difference', 'handoff'];
      let idx = 0;
      for (let t = 0; t <= dur; t += 0.05) {
        const i = order.indexOf(storyChapter(t, inputs, reduced));
        expect(i).toBeGreaterThanOrEqual(idx);
        idx = i;
      }
      expect(storyChapter(0, inputs, reduced)).toBe('planting');
      expect(storyChapter(dur, inputs, reduced)).toBe('handoff');
    });
  });
});

describe('normal story timing (default inputs)', () => {
  const i = DEFAULT_INPUTS;
  it('lasts 54 s', () => {
    expect(STORY_DURATION).toBe(54);
    expect(storyDuration(i)).toBe(54);
  });
  it('hits the keyframes from the spec', () => {
    expect(storyAge(7, i)).toBeCloseTo(25 * 12 + 3, 9);
    expect(storyAge(15, i)).toBeCloseTo(35 * 12, 9);
    expect(storyAge(18, i)).toBeCloseTo(35 * 12 + 4.8, 9);
    expect(storyAge(37, i)).toBe(65 * 12);
    expect(storyAge(45, i)).toBe(65 * 12);
    expect(storyAge(53.9, i)).toBe(65 * 12);
  });
  it('holds at 65 through the difference and handoff chapters', () => {
    for (let t = 37; t <= 54; t += 0.5) expect(storyAge(t, i)).toBe(780);
  });
  it('maps time to the spec chapters', () => {
    expect(storyChapter(3, i)).toBe('planting');
    expect(storyChapter(7, i)).toBe('growing');
    expect(storyChapter(16, i)).toBe('growing');
    expect(storyChapter(36.9, i)).toBe('growing');
    expect(storyChapter(37, i)).toBe('difference');
    expect(storyChapter(49.9, i)).toBe('difference');
    expect(storyChapter(50, i)).toBe('handoff');
    expect(storyBeat(16, i)).toBe('bBegins');
  });
  it('shows the loupe windows from the spec', () => {
    // the opening close-up of the first seedling is a camera move now, not a loupe
    expect(loupeAt(0.5, i)).toBeUndefined();
    expect(loupeAt(4, i)).toBeUndefined();
    expect(loupeAt(10, i)).toBeUndefined();
    expect(loupeAt(13, i)).toBeUndefined();
    // reduced motion keeps the static loupe instead of a camera move
    expect(loupeAt(4, i, true) ?? loupeAt(2, i, true) ?? loupeAt(8, i, true)).toBeDefined();
    expect(loupeAt(16.5, i)).toMatchObject({ tree: 'B', target: 'roots', strength: 1 });
    expect(loupeAt(20, i)).toBeUndefined();
    expect(loupeAt(27, i)).toBeUndefined(); // no close-up on the branches
    for (let t = 0; t < 60; t += 0.5) expect(loupeAt(t, i)?.target).not.toBe('branches');
    for (let t = 0; t < 60; t += 0.5) expect(loupeAt(t, i, true)?.target).not.toBe('branches');
    expect(loupeAt(40, i)).toBeUndefined();
  });
  it('opens close on the first seedling and is back at the full view before the second tree is planted', () => {
    const c0 = storyCamera(0, i)!;
    expect(c0.tree).toBe('A');
    expect(c0.zoom).toBeGreaterThan(3);
    expect(storyCamera(6, i)!.zoom).toBeGreaterThanOrEqual(c0.zoom);
    // eases out monotonically
    let prev = Infinity;
    for (let t = 6.5; t < 14.5; t += 0.25) {
      const z = storyCamera(t, i)?.zoom ?? 1;
      expect(z).toBeLessThanOrEqual(prev + 1e-9);
      prev = z;
    }
    expect(storyCamera(14.5, i)).toBeUndefined();
    expect(storyCamera(15, i)).toBeUndefined(); // the second tree is planted at the full shared view
    expect(storyCamera(2, i, true)).toBeUndefined(); // no camera move in reduced motion
    expect(storyCamera(2, { ...i, startAgeA: 40, startAgeB: 30 })!.tree).toBe('B'); // follows the earlier starter
  });
  it('puts the second-tree loupe on whichever tree starts later', () => {
    const rev = { ...i, startAgeA: 35, startAgeB: 25 };
    expect(storyCamera(4, rev)!.tree).toBe('B'); // the opening close-up follows the earlier starter
    expect(loupeAt(16.5, rev)).toMatchObject({ tree: 'A', target: 'roots' });
  });
  it('has no second-tree loupe when starts are equal', () => {
    const eq = { ...i, startAgeA: 30, startAgeB: 30 };
    expect(loupeAt(16.5, eq)).toBeUndefined();
  });
});

describe('captions use live values', () => {
  const sc = buildScenario(DEFAULT_INPUTS);
  it('planting', () => {
    expect(storyCaption(3, sc)).toMatchObject({
      primary: 'Same monthly contribution. Different starting ages.',
      secondary: 'Tree A starts at 25. Tree B starts at 35.',
    });
  });
  it('contribution amount follows inputs', () => {
    expect(storyCaption(10, sc).primary).toBe('Each month, $200 goes in.');
    const sc300 = buildScenario({ ...DEFAULT_INPUTS, monthlyContribution: 300 });
    expect(storyCaption(10, sc300).primary).toBe('Each month, $300 goes in.');
  });
  it('B begins', () => {
    expect(storyCaption(16, sc).primary).toBe('At 35, Tree B begins.');
  });
  it('difference split matches the engine', () => {
    const c = storyCaption(40, sc);
    expect(c.primary).toBe('Time gives growth room to branch.');
    expect(c.secondary).toMatch(/^\$24,000 of the gap is extra contributions\. \$162,\d{3} is growth that had ten more years to compound\.$/);
    const gap = sc.a.balance[sc.a.months] - sc.b.balance[sc.b.months];
    const growth = gap - 24000;
    expect(c.secondary).toContain(`$${Math.round(growth).toLocaleString('en-US')}`);
  });
  it('handoff', () => {
    expect(storyCaption(52, sc).primary).toBe('Explore your own timeline');
  });
  it('labels by letter when B starts earlier', () => {
    const rev = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 35, startAgeB: 25 });
    expect(storyCaption(3, rev).secondary).toBe('Tree A starts at 35. Tree B starts at 25.');
    expect(storyCaption(16, rev).primary).toBe('At 35, Tree A begins.');
    expect(storyCamera(10, rev.inputs)!.tree).toBe('B');
    expect(storyCaption(40, rev).secondary).toMatch(/ten more years/);
  });
  it('skips the begins beat and tells the truth when starts are equal', () => {
    const eq = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 30, startAgeB: 30 });
    for (let t = 0; t < 54; t += 0.25) expect(storyBeat(t, eq.inputs)).not.toBe('bBegins');
    expect(storyCaption(3, eq).secondary).toBe('Both trees start at 30.');
    expect(storyCaption(40, eq).primary).toBe('Starting together, the two trees grow together.');
  });
  it('handles start == end without nonsense', () => {
    const z = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 65, startAgeB: 65 });
    expect(storyCaption(3, z).primary).toMatch(/No time to grow/);
    expect(storyBeat(20, z.inputs)).toBe('planting');
    expect(loupeAt(10, z.inputs)).toBeUndefined();
  });
});

describe('reduced-motion story', () => {
  const i = DEFAULT_INPUTS;
  it('visits the discrete holds 25, 25 1/4, 35, 45, 55, 65 with flat dwell', () => {
    const dur = storyDuration(i, true);
    const seen = new Set<number>();
    for (let t = 0; t <= dur; t += 0.05) {
      const a = storyAge(t, i, true);
      for (const h of [300, 303, 420, 540, 660, 780]) if (Math.abs(a - h) < 1e-9) seen.add(h);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([300, 303, 420, 540, 660, 780]);
  });
  it('tweens in about 400 ms', () => {
    // hold 0 ends at 4.5 s; the next hold starts at 4.9 s.
    expect(storyAge(4.5, i, true)).toBe(300);
    expect(storyAge(4.9, i, true)).toBe(303);
    const mid = storyAge(4.7, i, true);
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(303);
  });
});
