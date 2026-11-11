import { describe, expect, it } from 'vitest';
import { DATA_MONTHS, DEFAULT_BASKET, monthIndex } from '../../src/bread/engine';
import type { BasketInputs } from '../../src/bread/engine';
import { NOTE_KINDS, noteAt, noteFor, noteKindAt } from '../../src/bread/app/notes';
import { boardFor, labelText, timelineTicks } from '../../src/bread/app/text';
import { monthRow } from '../../src/bread/engine';

const B = DEFAULT_BASKET;
const m = (y: number, mo = 1) => monthIndex(y, mo - 1);
const lines = (month: number, basket = B) => {
  const n = noteAt(month, basket);
  return [n.primary, n.secondary];
};

describe('the notes, by era, as the spec has them (default basket)', () => {
  it('1980', () => {
    expect(lines(m(1980))).toEqual(['1980: prices rising 14.8% a year.', 'The fastest since 1947, and pay had fallen behind.']);
    expect(noteKindAt(m(1980, 12))).toBe('start');
  });
  it('1981 to 1985: the minutes are live', () => {
    expect(lines(m(1985))).toEqual(['The 1980s: inflation cools and pay catches up.', 'This basket now takes 64 minutes of work.']);
    expect(noteAt(m(1981), B).secondary).toBe(`This basket now takes ${Math.round(monthRow(B, m(1981)).minutes)} minutes of work.`);
    expect(noteKindAt(m(1981))).toBe('cooling');
  });
  it('1986 to 2006', () => {
    expect(lines(m(1990))).toEqual(['Two calm decades: prices creep up a little each year.', 'Pay rises a little faster.']);
    expect(noteKindAt(m(2006, 12))).toBe('calm');
  });
  it('2007 to 2009', () => {
    expect(lines(m(2008))).toEqual(['2008: food prices jump, then the recession.', 'Flour and eggs leap in a year.']);
    expect(noteKindAt(m(2009, 12))).toBe('spike');
  });
  it('2010 to 2020', () => {
    expect(lines(m(2015))).toEqual(['Groceries stay steady while pay keeps rising.', `${Math.round(monthRow(B, m(2015)).minutes)} minutes of work.`]);
    expect(noteKindAt(m(2020, 12))).toBe('steady');
  });
  it('2021', () => {
    expect(lines(m(2021, 3))).toEqual(['2021: the basket at its cheapest, 41 minutes of work.', 'Then prices start to climb.']);
  });
  it('2022 to 2025: eggs from 2023', () => {
    expect(lines(m(2022, 6))).toEqual(['2022: grocery prices up 13.5% in a year.', 'Faster than at any point since 1980.']);
    expect(lines(m(2025, 3))).toEqual(['2022: grocery prices up 13.5% in a year.', 'Eggs: $6.23 a dozen.']);
    expect(noteKindAt(m(2025, 9))).toBe('surge');
  });
  it('the latest months, and the end', () => {
    expect(noteKindAt(m(2025, 10))).toBe('latest');
    const latest = noteAt(m(2026, 5), B);
    expect(latest.primary).toMatch(/^May 2026: \$\d+\.\d\d for the basket, \d+ minutes of work\.$/);
    expect(latest.secondary).toBe('Since 1980, the basket ×2.9, pay ×4.9.');
    expect(lines(DATA_MONTHS - 1)).toEqual(['Since 1980: this basket ×2.9, all groceries ×3.8, pay ×4.9.', 'Today: $26.15 for the basket, 51 minutes of work.']);
  });
  it('an estimated month says so', () => {
    expect(noteAt(m(2025, 10), B).primary).toMatch(/\(estimated\)\.?$/);
  });
});

describe('the notes follow the reader\'s basket', () => {
  const noEggs: BasketInputs = { qty: { ...B.qty, eggs: 0 } };
  const empty: BasketInputs = { qty: { bread: 0, eggs: 0, coffee: 0, bananas: 0, chicken: 0, flour: 0 } };
  it('the minutes change with the basket', () => {
    expect(noteAt(m(1985), noEggs).secondary).not.toBe(noteAt(m(1985), B).secondary);
    const big: BasketInputs = { qty: { ...B.qty, flour: 10, chicken: 6 } };
    expect(noteAt(m(1985), big).secondary).toMatch(/^This basket now takes \d+ minutes of work\.$/);
  });
  it('without eggs the eggs line falls back to the minutes', () => {
    expect(noteAt(m(2025, 3), noEggs).secondary).toMatch(/^\d+ minutes of work\.$/);
  });
  it('an empty basket costs nothing', () => {
    expect(noteAt(m(1985), empty).secondary).toBe('An empty basket costs nothing.');
    expect(noteAt(m(2015), empty).secondary).toBe('An empty basket costs nothing.');
    expect(noteAt(m(2021, 3), empty).primary).toBe('2021: prices start to climb.');
    expect(noteAt(m(2026, 5), empty).primary).toBe('May 2026: An empty basket costs nothing.');
    expect(noteAt(DATA_MONTHS - 1, empty).primary).toBe('Since 1980: all groceries ×3.8, pay ×4.9.');
  });
  it('the notes that do not depend on the basket do not change', () => {
    expect(noteAt(m(1980), empty).primary).toBe('1980: prices rising 14.8% a year.');
    expect(noteAt(m(2022, 6), empty).primary).toBe('2022: grocery prices up 13.5% in a year.');
  });
});

describe('every note is plain', () => {
  it('has no em-dashes and stays short, at every month and several baskets', () => {
    const baskets: BasketInputs[] = [B, { qty: { bread: 0, eggs: 0, coffee: 0, bananas: 0, chicken: 0, flour: 0 } }, { qty: { bread: 4, eggs: 3, coffee: 3, bananas: 6, chicken: 6, flour: 10 } }];
    for (const b of baskets) {
      for (let month = 0; month < DATA_MONTHS; month += 7) {
        const n = noteAt(month, b);
        for (const text of [n.primary, n.secondary ?? '']) {
          expect(text).not.toMatch(/[—–]/);
          expect(text.length).toBeLessThan(80);
        }
      }
      for (const kind of NOTE_KINDS) expect(noteFor(kind, b).primary.length).toBeGreaterThan(0);
    }
  });
  it('the kinds come in timeline order', () => {
    let last = -1;
    for (let month = 0; month < DATA_MONTHS; month++) {
      const i = NOTE_KINDS.indexOf(noteKindAt(month));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
    expect(last).toBe(NOTE_KINDS.length - 1);
  });
});

describe('the board and the labels', () => {
  it('the board says what the grocer chalks', () => {
    expect(boardFor(monthRow(B, 0))).toEqual({
      year: '1980',
      prices: { bread: '$0.50', eggs: '$0.88', coffee: '$3.21', bananas: '$0.32', chicken: '$0.70', flour: '$0.20' },
      total: '$9.16',
    });
  });
  it('labels: statement figures', () => {
    const t = labelText(B, monthRow(B, 0));
    expect(t).toMatchObject({ receiptTotal: '$9.16', receiptDate: 'Jan 1980', payAmount: '$254', paySub: 'median, full time, before tax', minutes: '87', minutesUnit: 'minutes of work', minutesSub: 'to buy the basket' });
  });
  it('labels: a filled-in month is called estimated', () => {
    const t = labelText(B, monthRow(B, m(2025, 10)));
    expect(t.receiptDate).toBe('Oct 2025, estimated');
    expect(t.paySub).toBe('estimated: not published');
    expect(t.minutesSub).toBe('to buy the basket (estimated)');
  });
  it('labels: an empty basket is 0 minutes', () => {
    const empty: BasketInputs = { qty: { bread: 0, eggs: 0, coffee: 0, bananas: 0, chicken: 0, flour: 0 } };
    const t = labelText(empty, monthRow(empty, 0));
    expect(t.receiptTotal).toBe('$0.00');
    expect(t.minutes).toBe('0');
  });
  it('the timeline has a tick a year, labelled every five', () => {
    const ticks = timelineTicks();
    expect(ticks).toHaveLength(47);
    expect(ticks[0]).toMatchObject({ month: 0, label: '1980', major: true });
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toEqual(['1980', '1985', '1990', '1995', '2000', '2005', '2010', '2015', '2020', '2025']);
  });
});
