import { describe, expect, it } from 'vitest';
import {
  BASKET_LIMITS,
  DATA_MONTHS,
  DEFAULT_BASKET,
  ITEM_KEYS,
  basketIsEmpty,
  estimatedMonths,
  formatCents,
  formatMinutes,
  formatMinutesTenth,
  formatMultiple,
  formatRate,
  landmarks,
  monthCount,
  monthIndex,
  monthLabel,
  monthRow,
  monthRuns,
  monthShortLabel,
  priceOf,
  rowEstimates,
  snapshot,
  statementMonth,
  validateBasket,
  yearTable,
} from '../../src/bread/engine';
import type { BasketInputs } from '../../src/bread/engine';
import { PRICES, WEEKLY_PAY } from '../../src/bread/engine/data';

const B = DEFAULT_BASKET;
const EMPTY: BasketInputs = { qty: { bread: 0, eggs: 0, coffee: 0, bananas: 0, chicken: 0, flour: 0 } };
const at = (year: number, month: number) => monthIndex(year, month - 1);

describe('the spec table (default basket)', () => {
  // [year, month, basket $, weekly pay $, minutes, overall %, groceries %, core %]
  const rows: [number, number, number, number, number, number, number, number][] = [
    [1980, 1, 9.16, 254, 86.5, 13.9, 7.8, 12.0],
    [1985, 1, 8.86, 334, 63.7, 3.5, 2.1, 4.5],
    [2000, 1, 12.41, 568, 52.4, 2.7, 1.2, 2.0],
    [2021, 1, 17.96, 984, 43.8, 1.4, 3.7, 1.4],
    [2025, 1, 26.67, 1192, 53.7, 3.0, 1.9, 3.3],
    [2026, 9, 26.15, 1239, 50.7, 3.7, 1.8, 2.6],
  ];
  for (const [y, mo, basket, pay, minutes, overall, groceries, core] of rows) {
    it(`${y}-${String(mo).padStart(2, '0')}`, () => {
      const r = monthRow(B, at(y, mo));
      expect(formatCents(r.basket)).toBe(formatCents(basket));
      expect(r.weeklyPay.value).toBe(pay);
      expect(Math.round(r.minutes * 10) / 10).toBe(minutes);
      expect(Math.round(r.inflation.overall.value * 1000) / 10).toBe(overall);
      expect(Math.round(r.inflation.groceries.value * 1000) / 10).toBe(groceries);
      expect(Math.round(r.inflation.core.value * 1000) / 10).toBe(core);
      expect([r.prices, r.weeklyPay].flatMap((x) => (x === r.prices ? Object.values(r.prices) : [r.weeklyPay])).every((f) => !f.estimated)).toBe(true);
    });
  }

  it('minutes = basket ÷ (weekly pay ÷ 40) × 60, exactly', () => {
    for (const m of [0, 100, 300, 500, 560]) {
      const r = monthRow(B, m);
      expect(r.minutes).toBeCloseTo((r.basket / (r.weeklyPay.value / 40)) * 60, 10);
    }
  });

  it('the basket is the sum of quantity × price', () => {
    const r = monthRow(B, 0);
    const sum = ITEM_KEYS.reduce((t, k) => t + B.qty[k] * r.prices[k].value, 0);
    expect(r.basket).toBeCloseTo(sum, 12);
  });

  it('a quarter\'s pay covers its three months', () => {
    expect(monthRow(B, 0).weeklyPay.value).toBe(monthRow(B, 2).weeklyPay.value);
    expect(monthRow(B, 3).weeklyPay.value).toBe(WEEKLY_PAY[1]);
  });
});

describe('landmarks (default basket)', () => {
  const L = landmarks(B);
  it('most and fewest minutes', () => {
    expect(L.mostMinutes.month).toBe(at(1980, 1));
    expect(Math.round(L.mostMinutes.minutes * 10) / 10).toBe(86.5);
    expect(monthLabel(L.fewestMinutes.month)).toBe('July 2021');
    expect(Math.round(L.fewestMinutes.minutes * 10) / 10).toBe(41.0);
  });
  it('the peaks of the 12-month rates', () => {
    expect(monthLabel(L.overallPeak.month)).toBe('March 1980');
    expect(Math.round(L.overallPeak.rate * 1000) / 10).toBe(14.8);
    expect(monthLabel(L.overallPeakSince2010.month)).toBe('June 2022');
    expect(Math.round(L.overallPeakSince2010.rate * 1000) / 10).toBe(9.1);
    expect(monthLabel(L.groceriesPeak.month)).toBe('August 2022');
    expect(Math.round(L.groceriesPeak.rate * 1000) / 10).toBe(13.5);
  });
  it('growth since January 1980', () => {
    const g = L.growth;
    expect(g.basket).toBeCloseTo(2.86, 2);
    expect(g.groceries).toBeCloseTo(3.81, 2);
    expect(g.overall).toBeCloseTo(4.33, 2);
    expect(g.core).toBeCloseTo(4.43, 2);
    expect(g.pay).toBeCloseTo(4.88, 2);
    expect(formatMultiple(g.basket)).toBe('×2.9');
  });
  it('groceries peaked in 2022, faster than in 1980', () => {
    expect(L.groceriesPeak.rate).toBeGreaterThan(monthRow(B, 0).inflation.groceries.value);
  });
  it('eggs: $1.47 in January 2021, a record $6.23 in March 2025, $2.27 in September 2026', () => {
    expect(formatCents(priceOf('eggs', at(2021, 1)).value)).toBe('$1.47');
    expect(formatCents(priceOf('eggs', at(2025, 3)).value)).toBe('$6.23');
    expect(formatCents(priceOf('eggs', at(2026, 9)).value)).toBe('$2.27');
    const max = Math.max(...PRICES.eggs.filter((v): v is number => v !== null));
    expect(formatCents(max)).toBe('$6.23');
    expect(PRICES.eggs.indexOf(max)).toBe(at(2025, 3));
  });
});

describe('yearly averages', () => {
  const years = yearTable(B);
  const minutes = (y: number) => Math.round(years.find((r) => r.year === y)!.minutes);
  it('match the spec', () => {
    const want: Record<number, number> = { 1980: 84, 1981: 75, 1985: 62, 1990: 62, 2000: 52, 2008: 54, 2010: 52, 2019: 43, 2021: 43, 2022: 50, 2025: 54, 2026: 51 };
    for (const [y, m] of Object.entries(want)) expect(minutes(Number(y)), String(y)).toBe(m);
  });
  it('one row a year, the last one partial and says so', () => {
    expect(years).toHaveLength(47);
    expect(years[0].label).toBe('1980');
    expect(years[0].shortLabel).toBe('1980');
    expect(years[46].label).toBe('2026');
    expect(years[46].shortLabel).toBe('Jan to Sep');
  });
  it('a year with a filled-in month is flagged', () => {
    expect(years.find((r) => r.year === 2025)!.prices.eggs.estimated).toBe(true);
    expect(years.find((r) => r.year === 2024)!.prices.eggs.estimated).toBe(false);
  });
});

describe('gaps are filled by a straight line and flagged', () => {
  it('coffee from September 2007', () => {
    const first = at(2007, 9);
    expect(PRICES.coffee[first]).toBeNull();
    const before = priceOf('coffee', first - 1);
    const f = priceOf('coffee', first);
    expect(f.estimated).toBe(true);
    expect(before.estimated).toBe(false);
    // straight between August 2007 and the next published month
    let next = first;
    while (PRICES.coffee[next] === null) next++;
    const after = priceOf('coffee', next);
    expect(after.estimated).toBe(false);
    const t = (first - (first - 1)) / (next - (first - 1));
    expect(f.value).toBeCloseTo(before.value + (after.value - before.value) * t, 12);
    expect(monthLabel(first)).toBe('September 2007');
  });

  it('October 2025 is filled everywhere, and the pay of 2025 Q4', () => {
    const m = at(2025, 10);
    const r = monthRow(B, m);
    for (const k of ITEM_KEYS) expect(r.prices[k].estimated, k).toBe(true);
    expect(r.weeklyPay.estimated).toBe(true);
    expect(r.inflation.overall.estimated).toBe(true);
    expect(r.inflation.groceries.estimated).toBe(true);
    expect(r.inflation.core.estimated).toBe(true);
    const est = estimatedMonths();
    const pay = est.find((e) => e.series === 'pay')!;
    expect(pay.months).toEqual([at(2025, 10), at(2025, 11), at(2025, 12)]);
    // the pay is a line between the neighbouring quarters
    const a = WEEKLY_PAY[182]!;
    const b = WEEKLY_PAY[184]!;
    expect(r.weeklyPay.value).toBeCloseTo((a + b) / 2, 10);
    // the rate that month and a year on lean on the filled index: flagged; the months between are not
    expect(monthRow(B, at(2025, 9)).inflation.overall.estimated).toBe(false);
    expect(monthRow(B, at(2025, 11)).inflation.overall.estimated).toBe(false);
  });

  it('a filled value is never reported as published, and published ones never as estimated', () => {
    for (const e of estimatedMonths()) {
      if (e.series === 'pay' || e.series === 'overall' || e.series === 'groceries' || e.series === 'core') continue;
      for (const m of e.months) {
        expect(PRICES[e.series][m]).toBeNull();
        expect(priceOf(e.series, m).estimated).toBe(true);
      }
    }
    for (const k of ITEM_KEYS) {
      PRICES[k].forEach((v, m) => {
        if (v !== null) {
          expect(priceOf(k, m).estimated).toBe(false);
          expect(priceOf(k, m).value).toBe(v);
        }
      });
    }
  });

  it('rowEstimates counts only the items in the basket', () => {
    const m = at(2008, 6);
    const r = monthRow(B, m);
    expect(rowEstimates(B, r).basket).toBe(true);
    const noCoffee: BasketInputs = { qty: { ...B.qty, coffee: 0 } };
    expect(rowEstimates(noCoffee, monthRow(noCoffee, m)).basket).toBe(false);
  });

  it('every filled month shows up in estimatedMonths with runs', () => {
    expect(monthRuns([3, 4, 5, 9, 11, 12])).toEqual([[3, 5], [9, 9], [11, 12]]);
    const coffee = estimatedMonths().find((e) => e.series === 'coffee')!;
    expect(coffee.months).toContain(at(2007, 9));
    expect(coffee.months).toContain(at(2025, 10));
  });
});

describe('an empty basket', () => {
  it('costs nothing and takes no minutes', () => {
    expect(basketIsEmpty(EMPTY)).toBe(true);
    for (const m of [0, 250, 560]) {
      const r = monthRow(EMPTY, m);
      expect(r.basket).toBe(0);
      expect(r.minutes).toBe(0);
    }
    const s = snapshot(EMPTY, 100.5);
    expect(s.basket).toBe(0);
    expect(s.minutes).toBe(0);
    const L = landmarks(EMPTY);
    expect(L.growth.basket).toBe(1);
    expect(L.growth.pay).toBeGreaterThan(4);
    expect(validateBasket(EMPTY).ok).toBe(true);
  });
});

describe('the clock', () => {
  it('counts whole months and clamps', () => {
    expect(monthCount()).toBe(DATA_MONTHS);
    expect(statementMonth(0)).toBe(0);
    expect(statementMonth(5.99)).toBe(5);
    expect(statementMonth(6 - 1e-12)).toBe(6);
    expect(statementMonth(-4)).toBe(0);
    expect(statementMonth(99999)).toBe(DATA_MONTHS - 1);
    expect(statementMonth(Number.NaN)).toBe(0);
  });
  it('the smooth figures run linearly between whole months; the shown row is the whole month', () => {
    const a = monthRow(B, 100);
    const b = monthRow(B, 101);
    const s = snapshot(B, 100.25);
    expect(s.statementMonth).toBe(100);
    expect(s.row).toBe(a);
    expect(s.basket).toBeCloseTo(a.basket * 0.75 + b.basket * 0.25, 12);
    expect(s.minutes).toBeCloseTo(a.minutes * 0.75 + b.minutes * 0.25, 12);
    expect(snapshot(B, 100).basket).toBeCloseTo(a.basket, 12);
    const end = snapshot(B, 9999);
    expect(end.statementMonth).toBe(DATA_MONTHS - 1);
    expect(end.basket).toBeCloseTo(monthRow(B, DATA_MONTHS - 1).basket, 12);
  });
  it('labels', () => {
    expect(monthLabel(0)).toBe('January 1980');
    expect(monthShortLabel(0)).toBe('Jan 1980');
    expect(monthShortLabel(DATA_MONTHS - 1)).toBe('Sep 2026');
    expect(monthRow(B, 13).year).toBe(1981);
  });
  it('is deterministic and memoised', () => {
    expect(monthRow(B, 77)).toBe(monthRow({ qty: { ...B.qty } }, 77));
  });
});

describe('validation', () => {
  it('accepts the defaults and every limit', () => {
    expect(validateBasket(DEFAULT_BASKET).ok).toBe(true);
    const max = { qty: Object.fromEntries(ITEM_KEYS.map((k) => [k, BASKET_LIMITS[k].max])) };
    expect(validateBasket(max).ok).toBe(true);
  });
  it('rejects fractions, negatives, too many, NaN and missing', () => {
    expect(validateBasket({ qty: { ...B.qty, bread: 1.5 } }).errors.bread).toMatch(/whole/i);
    expect(validateBasket({ qty: { ...B.qty, eggs: -1 } }).errors.eggs).toBeTruthy();
    expect(validateBasket({ qty: { ...B.qty, flour: 11 } }).errors.flour).toBeTruthy();
    expect(validateBasket({ qty: { ...B.qty, coffee: Number.NaN } }).errors.coffee).toBeTruthy();
    expect(validateBasket({ qty: { ...B.qty, bananas: Infinity } }).ok).toBe(false);
    expect(validateBasket({}).ok).toBe(false);
    expect(validateBasket(null).ok).toBe(false);
  });
});

describe('formatting', () => {
  it('rounds only for display', () => {
    expect(formatCents(9.156)).toBe('$9.16');
    expect(formatMinutes(50.65)).toBe('51');
    expect(formatMinutesTenth(86.532)).toBe('86.5');
    expect(formatRate(0.14756)).toBe('14.8%');
    expect(formatRate(-0.004)).toBe('−0.4%');
  });
});
