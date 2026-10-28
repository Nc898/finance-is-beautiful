import { describe, expect, it } from 'vitest';
import { DEFAULT_BRICK_INPUTS } from '../../src/brick/engine';
import type { BrickInputs } from '../../src/brick/engine';
import { NOTE_KINDS, noteAt, noteFor, noteKindAt, noteMarks } from '../../src/brick/app/notes';
import { diffText, owedText, termsLine } from '../../src/brick/app/text';
import { loanSnapshot } from '../../src/brick/engine';

const D = DEFAULT_BRICK_INPUTS;
const swap = (i: BrickInputs): BrickInputs => ({ ...i, loans: { a: i.loans.b, b: i.loans.a } });

describe('the notes, by month (defaults)', () => {
  it('come in the spec order at the spec months', () => {
    const m = noteMarks(D);
    expect(m).toEqual({ year: 12, shortCross: 36, shortPaid: 180, paidHold: 192, longCross: 233, end: 360 });
    expect(noteKindAt(0, D)).toBe('intro');
    expect(noteKindAt(5, D)).toBe('early');
    expect(noteKindAt(20, D)).toBe('more');
    expect(noteKindAt(100, D)).toBe('carts');
    expect(noteKindAt(185, D)).toBe('paid');
    expect(noteKindAt(200, D)).toBe('free');
    expect(noteKindAt(300, D)).toBe('late');
    expect(noteKindAt(360, D)).toBe('results');
  });

  it('say what the spec says, every number live', () => {
    expect(noteFor('intro', D)).toMatchObject({ primary: 'The same $300,000 home. Two loans.', secondary: '30 years at 6.5%, or 15 years at 5.75%.' });
    expect(noteFor('early', D)).toMatchObject({ primary: 'Early payments go mostly to interest.', secondary: 'Of the first $1,896 on the 30-year loan, $1,625 is interest.' });
    expect(noteFor('more', D)).toMatchObject({ primary: 'The 15-year loan costs $595 more a month.', secondary: 'So more of every payment builds the house.' });
    expect(noteFor('carts', D).primary).toBe('Each cart carries $100,000 of interest to the lender.');
    expect(noteAt(100, D).secondary).toMatch(/^Interest so far: 30-year \$[\d,]+, 15-year \$[\d,]+\.$/);
    expect(noteFor('paid', D)).toMatchObject({ primary: 'The 15-year house is paid off.', secondary: 'The 30-year house is 27% built, with 15 years to go.' });
    expect(noteFor('free', D)).toMatchObject({ primary: 'No more payments on the 15-year house.', secondary: 'That frees $2,491 a month.' });
    expect(noteFor('late', D).primary).toBe('Now most of each 30-year payment builds the house.');
    expect(noteFor('results', D)).toMatchObject({ primary: '30-year: $382,633 in interest. 15-year: $148,421.', secondary: 'The 15-year loan saved $234,212, for $595 more a month.' });
  });

  it('never use dashes, never show NaN', () => {
    for (const i of [D, swap(D), { ...D, loans: { a: { years: 20, apr: 0 }, b: { years: 10, apr: 0 } } }]) {
      for (const k of NOTE_KINDS) {
        const n = noteFor(k, i, 50);
        const t = `${n.primary} ${n.secondary ?? ''}`;
        expect(t).not.toMatch(/[—–]|NaN|undefined|Infinity/);
      }
    }
  });
});

describe('the notes follow the inputs', () => {
  it('never assume B is the shorter loan', () => {
    const s = swap(D);
    expect(noteFor('paid', s).primary).toBe('The 15-year house is paid off.');
    expect(noteFor('results', s).primary).toBe('15-year: $148,421 in interest. 30-year: $382,633.');
    expect(noteFor('results', s).secondary).toBe('The 15-year loan saved $234,212, for $595 more a month.');
  });

  it('name the loans by rate when the terms are equal', () => {
    const r = { ...D, loans: { a: { years: 30, apr: 0.065 }, b: { years: 30, apr: 0.055 } } };
    expect(noteFor('results', r).primary).toMatch(/^6\.5% loan: \$[\d,]+ in interest\. 5\.5% loan: \$[\d,]+\.$/);
    expect(noteFor('more', r).primary).toMatch(/^The 5\.5% loan costs \$\d+ less a month\.$/);
  });

  it('identical loans get one plain note', () => {
    const same = { ...D, loans: { a: D.loans.a, b: { ...D.loans.a } } };
    for (const m of [0, 50, 200, 360]) expect(noteKindAt(m, same)).toBe('same');
    expect(noteFor('same', same).primary).toBe('The same loan twice: both houses go up together.');
  });
});

describe('labels and the difference', () => {
  it('the label lines', () => {
    expect(termsLine('a', D)).toBe('6.5% · $1,896 a month');
    expect(owedText(loanSnapshot(D, 'a', 180))).toBe('$217,677 still owed');
    expect(owedText(loanSnapshot(D, 'b', 180))).toBe('Paid off in 15 years');
  });

  it('the difference: interest saved so far, then the whole saving at the end', () => {
    expect(diffText(D, 0).show).toBe(false);
    const mid = diffText(D, 100);
    expect(mid).toMatchObject({ show: true, label: 'Interest saved so far', sub: 'with the 15-year loan', final: false });
    expect(diffText(D, 360)).toMatchObject({ show: true, label: 'The 15-year loan saves', value: '$234,212', final: true });
  });
});
