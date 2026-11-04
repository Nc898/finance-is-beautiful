import { describe, expect, it } from 'vitest';
import { DEFAULT_ORCHARD_INPUTS, saveSnapshot } from '../../src/orchard/engine';
import type { OrchardInputs } from '../../src/orchard/engine';
import { NOTE_KINDS, noteAt, noteFor, noteKindAt, noteMarks } from '../../src/orchard/app/notes';
import type { NoteKind } from '../../src/orchard/app/notes';
import { diffText, missedText, savesText, termsLine, worthText } from '../../src/orchard/app/text';

const D = DEFAULT_ORCHARD_INPUTS;
const saves = (a: number, b: number, base: OrchardInputs = D): OrchardInputs => ({ ...base, save: { a, b } });
const noMatch: OrchardInputs = { ...D, match: { rate: 0, limit: 0.06 } };

/** Every input set the edge-case tests walk through. */
const CASES: OrchardInputs[] = [
  D,
  saves(0.06, 0.03),
  saves(0, 0.06),
  saves(0.06, 0),
  saves(0.08, 0.12),
  saves(0.02, 0.04),
  saves(0.05, 0.05),
  saves(0, 0),
  noMatch,
  { ...D, match: { rate: 0.5, limit: 0 } },
  { ...D, growth: 0 },
  { ...D, years: 1 },
  { ...D, years: 2 },
  { ...D, years: 6 },
  { ...D, years: 45 },
  { ...D, match: { rate: 1, limit: 0.04 } },
];

describe('the notes, by month (defaults)', () => {
  it('come in the spec order at the spec months', () => {
    expect(noteMarks(D)).toEqual({ year: 12, branch: 60, pass: 217, results: 348, end: 360 });
    expect(noteKindAt(0, D)).toBe('intro');
    expect(noteKindAt(0.5, D)).toBe('intro');
    expect(noteKindAt(1, D)).toBe('first');
    expect(noteKindAt(30, D)).toBe('branch');
    expect(noteKindAt(100, D)).toBe('growing');
    expect(noteKindAt(250, D)).toBe('outweigh');
    expect(noteKindAt(350, D)).toBe('results');
    expect(noteKindAt(360, D)).toBe('results');
  });

  it('say what the spec says, every number live', () => {
    expect(noteFor('intro', D)).toMatchObject({ primary: 'The same pay. The same match.', secondary: 'Work adds 50¢ for every $1 saved, up to 6% of pay.' });
    expect(noteFor('first', D)).toMatchObject({ primary: 'A saves 3% of pay. B saves 6%.', secondary: 'A: $150 a month, plus $75 free. B: $300, plus $150 free.' });
    expect(noteFor('branch', D)).toMatchObject({
      primary: 'A leaves $75 a month of free money on the branch.',
      secondary: 'B takes home $150 less a month, and gets $75 more free.',
    });
    expect(noteFor('growing', D).primary).toBe('Every tree keeps growing.');
    expect(noteAt(60, D).secondary).toBe('So far: A $16,108, B $32,217.');
    expect(noteFor('outweigh', D).primary).toBe('Now the growth outweighs everything put in.');
    // (the missed match grows exactly as A's match part: a third of A's $117,208)
    expect(noteAt(240, D).secondary).toBe('Left on the branch so far: $18,000. Grown, it would be $39,069.');
    expect(noteFor('results', D)).toMatchObject({ primary: 'A: $274,493. B: $548,987.', secondary: 'The match alone grew to $91,498 for A and $182,996 for B.' });
  });

  it('the live lines follow the clock (statement figures)', () => {
    expect(noteAt(120, D).secondary).toBe('So far: A $38,944, B $77,888.');
    const a = saveSnapshot(D, 'a', 300.7);
    expect(noteAt(300.7, D).secondary).toBe(
      `Left on the branch so far: $${Math.round(a.missedShown).toLocaleString('en-US')}. Grown, it would be $${Math.round(a.missedValueShown).toLocaleString('en-US')}.`,
    );
  });
});

describe('the notes follow the inputs', () => {
  it('A saving more than B: the copy follows', () => {
    const s = saves(0.06, 0.03);
    expect(noteFor('first', s).primary).toBe('A saves 6% of pay. B saves 3%.');
    expect(noteFor('first', s).secondary).toBe('A: $300 a month, plus $150 free. B: $150, plus $75 free.');
    expect(noteFor('branch', s)).toMatchObject({
      primary: 'B leaves $75 a month of free money on the branch.',
      secondary: 'A takes home $150 less a month, and gets $75 more free.',
    });
    expect(noteFor('results', s).primary).toBe('A: $548,987. B: $274,493.');
  });

  it('both at or over the limit: the whole match each, then totals only', () => {
    const s = saves(0.06, 0.1);
    expect(noteFor('branch', s)).toMatchObject({ primary: 'Both save enough for the whole match.', secondary: 'B saves $200 more a month, so takes home $200 less.' });
    expect(noteAt(250, s).secondary).toMatch(/^So far: A \$[\d,]+, B \$[\d,]+\.$/);
  });

  it('both leaving some of the match: both amounts on the branch', () => {
    expect(noteAt(250, saves(0.02, 0.04)).secondary).toMatch(/^Left on the branch so far: A \$[\d,]+, B \$[\d,]+\.$/);
  });

  it('no match: said plainly, and only the saving differs', () => {
    expect(noteFor('intro', noMatch)).toMatchObject({ primary: 'The same pay.', secondary: 'No match here: only the saving differs.' });
    expect(noteFor('first', noMatch).secondary).toBe('A: $150 a month. B: $300.');
    expect(noteFor('branch', noMatch)).toMatchObject({ primary: 'No match here: only the saving differs.', secondary: 'B saves $150 more a month, so takes home $150 less.' });
    expect(noteFor('results', noMatch).secondary).toMatch(/^B ends \$[\d,]+ ahead, from saving \$150 more a month\.$/);
  });

  it('one saving nothing gets no match, and the note says so', () => {
    const s = saves(0, 0.06);
    expect(noteFor('first', s)).toMatchObject({ primary: 'A saves nothing, so A gets no match.', secondary: 'B saves 6% of pay: $300 a month, plus $150 free.' });
    expect(noteFor('branch', s).primary).toBe('A leaves $150 a month of free money on the branch.');
    expect(noteFor('results', s).secondary).toBe('The match alone grew to $182,996 for B. A got none.');
    expect(noteFor('first', saves(0.06, 0)).primary).toBe('B saves nothing, so B gets no match.');
  });

  it('no growth: no claim that the trees grow by themselves', () => {
    const z = { ...D, growth: 0 };
    expect(noteMarks(z).pass).toBe(noteMarks(z).results);
    expect(noteFor('growing', z).primary).toBe('With no growth, the trees hold only what is put in.');
    expect(noteKindAt(300, z)).toBe('growing');
  });

  it('identical savings get one plain note', () => {
    const same = saves(0.05, 0.05);
    for (const m of [0, 50, 200, 360]) expect(noteKindAt(m, same)).toBe('same');
    expect(noteFor('same', same)).toMatchObject({ primary: 'The same savings twice: both orchards grow alike.', secondary: 'Each saves $250 a month, plus $125 free.' });
    expect(noteFor('same', saves(0, 0)).secondary).toBe('Neither saves anything, so both orchards stay empty.');
  });

  it('short timelines keep the order: one year, then the results', () => {
    const one = { ...D, years: 1 };
    expect(noteMarks(one)).toEqual({ year: 12, branch: 12, pass: 12, results: 12, end: 12 });
    expect(noteKindAt(0, one)).toBe('intro');
    expect(noteKindAt(6, one)).toBe('first');
    expect(noteKindAt(12, one)).toBe('results');
  });

  it('come in time order for any inputs, and never use dashes or show NaN', () => {
    const order = (k: NoteKind) => NOTE_KINDS.indexOf(k);
    for (const i of CASES) {
      const end = noteMarks(i).end;
      let last = -1;
      for (let m = 0; m <= end; m += 0.25) {
        const k = noteKindAt(m, i);
        expect(order(k)).toBeGreaterThanOrEqual(last);
        last = order(k);
        const n = noteAt(m, i);
        expect(`${n.primary} ${n.secondary ?? ''}`).not.toMatch(/[—–]|NaN|undefined|Infinity/);
      }
      for (const k of NOTE_KINDS) {
        const n = noteFor(k, i, 50);
        expect(`${n.primary} ${n.secondary ?? ''}`).not.toMatch(/[—–]|NaN|undefined|Infinity/);
      }
    }
  });
});

describe('labels and the difference', () => {
  it('the label lines', () => {
    expect(savesText('a', D)).toBe('Saves 3%');
    expect(termsLine('a', D)).toBe('$150 a month + $75 match');
    expect(termsLine('b', D)).toBe('$300 a month + $150 match');
    expect(termsLine('a', noMatch)).toBe('$150 a month');
    expect(termsLine('a', saves(0, 0.06))).toBe('$0 a month, no match');
    expect(worthText(saveSnapshot(D, 'a', 240))).toBe('Worth $117,208');
    expect(missedText(saveSnapshot(D, 'a', 240), D)).toBe('$18,000 left on the branch');
    expect(missedText(saveSnapshot(D, 'b', 240), D)).toBe('');
  });

  it('the difference: who is ahead, then who ends ahead', () => {
    expect(diffText(D, 0).show).toBe(false);
    expect(diffText(D, 120)).toMatchObject({ show: true, label: 'B is ahead by', value: '$38,944', final: false });
    expect(diffText(D, 360)).toMatchObject({ show: true, label: 'B ends ahead by', value: '$274,494', final: true });
    expect(diffText(saves(0.06, 0.03), 360).label).toBe('A ends ahead by');
    expect(diffText(saves(0.05, 0.05), 200).show).toBe(false);
  });
});
