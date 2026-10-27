import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, buildScenario } from '../../src/engine';
import type { Inputs } from '../../src/engine';
import { CAMERA_ZOOM, NOTE_KINDS, cameraAt, loupeAt, noteAt, noteFor, noteKindAt } from '../../src/app/notes';

const cases: Array<[string, Inputs]> = [
  ['default', DEFAULT_INPUTS],
  ['reversed starts', { ...DEFAULT_INPUTS, startAgeA: 35, startAgeB: 25 }],
  ['equal starts', { ...DEFAULT_INPUTS, startAgeA: 30, startAgeB: 30 }],
  ['start == end (both)', { ...DEFAULT_INPUTS, startAgeA: 65, startAgeB: 65 }],
  ['later tree starts at end', { ...DEFAULT_INPUTS, startAgeA: 25, startAgeB: 65 }],
  ['short timeline', { ...DEFAULT_INPUTS, startAgeA: 60, startAgeB: 62, endAge: 63 }],
];

describe.each(cases)('notes: %s', (_name, inputs) => {
  const start = Math.min(inputs.startAgeA, inputs.startAgeB) * 12;
  const end = inputs.endAge * 12;
  const sc = buildScenario(inputs);

  it('go in timeline order as the age passes, from the planting to the difference', () => {
    const seen: string[] = [];
    for (let m = start; m <= end; m += 0.25) {
      const k = noteKindAt(m, inputs);
      if (seen[seen.length - 1] !== k) seen.push(k);
    }
    const idx = seen.map((k) => NOTE_KINDS.indexOf(k as (typeof NOTE_KINDS)[number]));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    expect(noteKindAt(end, inputs)).toBe('difference');
    if (end > start) expect(noteKindAt(start, inputs)).toBe('planting');
  });

  it('are non-empty, with real numbers and no dashes', () => {
    for (const kind of NOTE_KINDS) {
      const c = noteFor(kind, sc);
      expect(c.kind).toBe(kind);
      expect(c.primary.length).toBeGreaterThan(5);
      const text = `${c.primary} ${c.secondary ?? ''}`;
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      expect(text).not.toMatch(/[—–]/);
    }
  });

  it('the view is never zoomed below 1 and pulls back steadily as the age passes', () => {
    let prev = Infinity;
    for (let m = start; m <= end; m += 0.5) {
      const z = cameraAt(m, inputs)?.zoom ?? 1;
      expect(z).toBeGreaterThanOrEqual(1);
      expect(z).toBeLessThanOrEqual(prev + 1e-9);
      prev = z;
    }
  });
});

describe('which note the age shows (defaults)', () => {
  const i = DEFAULT_INPUTS;
  const sc = buildScenario(i);
  it('planting, then the contributions, the later tree, reinvestment and the difference', () => {
    expect(noteKindAt(300, i)).toBe('planting');
    expect(noteKindAt(302.9, i)).toBe('planting');
    expect(noteKindAt(303, i)).toBe('contribute');
    expect(noteKindAt(419.9, i)).toBe('contribute');
    expect(noteKindAt(420, i)).toBe('bBegins');
    expect(noteKindAt(431.9, i)).toBe('bBegins');
    expect(noteKindAt(432, i)).toBe('reinvest');
    expect(noteKindAt(779.9, i)).toBe('reinvest');
    expect(noteKindAt(780, i)).toBe('difference');
    expect(noteAt(780, sc).primary).toBe('Time gives growth room to branch.');
  });
});

describe('the close view and the loupe', () => {
  const i = DEFAULT_INPUTS;
  it('opens close on the first seedling and is back at the full view before the second tree is planted', () => {
    const c0 = cameraAt(300, i)!;
    expect(c0.tree).toBe('A');
    expect(c0.zoom).toBeCloseTo(CAMERA_ZOOM, 9);
    expect(cameraAt(303, i)!.zoom).toBeCloseTo(CAMERA_ZOOM, 9); // held for the first months
    expect(cameraAt(360, i)!.zoom).toBeLessThan(CAMERA_ZOOM);
    expect(cameraAt(419, i)).toBeUndefined(); // the second tree is planted at the full shared view
    expect(cameraAt(300, i, true)).toBeUndefined(); // no close view in reduced motion
    expect(cameraAt(360, { ...i, startAgeA: 40, startAgeB: 30 })!.tree).toBe('B'); // follows the earlier starter
  });
  it('one tree alone (or both together): the close view still pulls back over its first years', () => {
    const eq = { ...i, startAgeA: 30, startAgeB: 30 };
    expect(cameraAt(360, eq)!.zoom).toBeCloseTo(CAMERA_ZOOM, 9);
    expect(cameraAt(360 + 96, eq)).toBeUndefined();
  });
  it('no close view when nothing grows', () => {
    expect(cameraAt(780, { ...i, startAgeA: 65, startAgeB: 65 })).toBeUndefined();
  });
  it('the loupe opens on the roots of the later tree as it is planted, faded in and out', () => {
    expect(loupeAt(419, i)).toBeUndefined();
    expect(loupeAt(422, i)).toMatchObject({ tree: 'B', target: 'roots' });
    expect(loupeAt(422, i)!.strength).toBeCloseTo(1, 9);
    expect(loupeAt(420.5, i)!.strength).toBeLessThan(1);
    expect(loupeAt(426, i)).toBeUndefined();
    expect(loupeAt(422, i, true)).toBeUndefined();
    expect(loupeAt(302, { ...i, startAgeA: 35, startAgeB: 25 })).toBeUndefined();
    expect(loupeAt(422, { ...i, startAgeA: 35, startAgeB: 25 })).toMatchObject({ tree: 'A', target: 'roots' });
    expect(loupeAt(362, { ...i, startAgeA: 30, startAgeB: 30 })).toBeUndefined();
  });
});

describe('notes use live values', () => {
  const sc = buildScenario(DEFAULT_INPUTS);
  it('planting', () => {
    expect(noteFor('planting', sc)).toMatchObject({
      primary: 'Same monthly contribution. Different starting ages.',
      secondary: 'Tree A starts at 25. Tree B starts at 35.',
    });
  });
  it('contribution amount follows inputs', () => {
    expect(noteFor('contribute', sc).primary).toBe('Each month, $200 goes in.');
    const sc300 = buildScenario({ ...DEFAULT_INPUTS, monthlyContribution: 300 });
    expect(noteFor('contribute', sc300).primary).toBe('Each month, $300 goes in.');
  });
  it('B begins', () => {
    expect(noteFor('bBegins', sc).primary).toBe('At 35, Tree B begins.');
  });
  it('difference split matches the engine', () => {
    const c = noteFor('difference', sc);
    expect(c.primary).toBe('Time gives growth room to branch.');
    expect(c.secondary).toMatch(/^\$24,000 of the gap is extra contributions\. \$162,\d{3} is growth that had ten more years to compound\.$/);
    const gap = sc.a.balance[sc.a.months] - sc.b.balance[sc.b.months];
    const growth = gap - 24000;
    expect(c.secondary).toContain(`$${Math.round(growth).toLocaleString('en-US')}`);
  });
  it('labels by letter when B starts earlier', () => {
    const rev = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 35, startAgeB: 25 });
    expect(noteFor('planting', rev).secondary).toBe('Tree A starts at 35. Tree B starts at 25.');
    expect(noteFor('bBegins', rev).primary).toBe('At 35, Tree A begins.');
    expect(noteFor('difference', rev).secondary).toMatch(/ten more years/);
  });
  it('skips the begins note and tells the truth when starts are equal', () => {
    const eq = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 30, startAgeB: 30 });
    for (let m = 360; m <= 780; m += 0.25) expect(noteKindAt(m, eq.inputs)).not.toBe('bBegins');
    expect(noteFor('planting', eq).secondary).toBe('Both trees start at 30.');
    expect(noteFor('difference', eq).primary).toBe('Starting together, the two trees grow together.');
  });
  it('handles start == end without nonsense', () => {
    const z = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 65, startAgeB: 65 });
    expect(noteFor('planting', z).primary).toMatch(/No time to grow/);
    expect(loupeAt(780, z.inputs)).toBeUndefined();
  });
});
