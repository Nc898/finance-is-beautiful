import { describe, expect, it } from 'vitest';
import {
  BOATS,
  DEFAULT_RIVER_INPUTS,
  RIVER_LIMITS,
  SCALE_FLOOR,
  allBoats,
  boatLabel,
  boatSnapshot,
  buyingPowerChange,
  buysToday,
  effortOf,
  formatChange,
  milepostLabel,
  mileposts,
  riverScale,
  uOfReal,
  validateRiverInputs,
  wholeYears,
  yearLabel,
  yearSpoken,
} from '../../src/river/engine';
import type { BoatId, RiverInputs } from '../../src/river/engine';

const D = DEFAULT_RIVER_INPUTS;
const rateOf = (inp: RiverInputs, id: BoatId) => (id === 'cash' ? 0 : id === 'savings' ? inp.savingsRate : inp.investRate);

describe('boatSnapshot: closed form', () => {
  const inputsList: Array<[string, RiverInputs]> = [
    ['defaults', D],
    ['high inflation', { ...D, inflation: 0.1, savingsRate: 0.04, investRate: 0.09 }],
    ['negative investing', { ...D, investRate: -0.04 }],
    ['other start', { ...D, start: 250_000, years: 12 }],
  ];
  const times = [0, 0.25, 1, 2.5, 7.75, 12, 30, 59.9];
  for (const [name, inp] of inputsList) {
    for (const id of BOATS) {
      it(`${name} / ${id}: nominal, real and logReal match the formulas at several t`, () => {
        const r = rateOf(inp, id);
        for (const t of times) {
          const s = boatSnapshot(inp, id, t);
          const nominal = inp.start * Math.pow(1 + r, t);
          const real = (inp.start * Math.pow(1 + r, t)) / Math.pow(1 + inp.inflation, t);
          expect(s.id).toBe(id);
          expect(s.rate).toBe(r);
          expect(s.nominal).toBeCloseTo(nominal, 8);
          expect(s.real).toBeCloseTo(real, 8);
          expect(s.logReal).toBeCloseTo(Math.log(real / inp.start), 10);
        }
      });
    }
  }

  it('starts at the dock: nominal = real = start, logReal = 0 for every boat', () => {
    for (const id of BOATS) {
      const s = boatSnapshot(D, id, 0);
      expect(s.nominal).toBe(D.start);
      expect(s.real).toBe(D.start);
      expect(s.logReal).toBe(0);
    }
  });

  it('matches the documented defaults at 30 years (3% inflation)', () => {
    const [cash, savings, invest] = allBoats(D, 30);
    expect(cash.nominal).toBe(10_000);
    expect(Math.round(cash.real)).toBe(4120);
    expect(Math.round(savings.nominal)).toBe(18_114);
    expect(Math.round(savings.real)).toBe(7463);
    expect(Math.round(invest.nominal)).toBe(57_435);
    expect(Math.round(invest.real)).toBe(23_662);
  });

  it('keeps full precision (no rounding in the engine)', () => {
    const s = boatSnapshot(D, 'invest', 7.3);
    expect(s.nominal).not.toBe(Math.round(s.nominal));
    expect(s.real).not.toBe(Math.round(s.real));
  });

  it('fractional years interpolate the compound formula exactly', () => {
    const half = boatSnapshot(D, 'savings', 0.5);
    expect(half.nominal).toBeCloseTo(10_000 * Math.sqrt(1.02), 8);
    // Two half-years compose to one year
    expect(boatSnapshot(D, 'savings', 1).nominal).toBeCloseTo(half.nominal * Math.sqrt(1.02), 8);
  });
});

describe('boat behaviour', () => {
  it('zero inflation: real equals nominal and cash stays at the dock', () => {
    const inp = { ...D, inflation: 0 };
    for (const t of [0, 3, 17.5, 30]) {
      for (const id of BOATS) {
        const s = boatSnapshot(inp, id, t);
        expect(s.real).toBeCloseTo(s.nominal, 9);
      }
      expect(boatSnapshot(inp, 'cash', t).logReal).toBeCloseTo(0, 12);
    }
  });

  it('rate equal to inflation stays at the dock', () => {
    const inp = { ...D, inflation: 0.03, savingsRate: 0.03, investRate: 0.03 };
    for (const t of [0, 1, 12.5, 30]) {
      for (const id of ['savings', 'invest'] as const) {
        const s = boatSnapshot(inp, id, t);
        expect(s.logReal).toBeCloseTo(0, 12);
        expect(s.real).toBeCloseTo(inp.start, 8);
      }
    }
  });

  it('negative investment return drifts faster downstream than cash', () => {
    const inp = { ...D, investRate: -0.03 };
    const cash = boatSnapshot(inp, 'cash', 30);
    const invest = boatSnapshot(inp, 'invest', 30);
    expect(invest.nominal).toBeLessThan(inp.start);
    expect(invest.logReal).toBeLessThan(cash.logReal);
    expect(invest.logReal).toBeLessThan(0);
    expect(invest.real).toBeLessThan(cash.real);
  });

  it('logReal is linear in t: constant speed for every boat', () => {
    for (const id of BOATS) {
      const v = boatSnapshot(D, id, 1).logReal;
      for (const t of [0.5, 3, 7.25, 22, 30, 41.5]) {
        expect(boatSnapshot(D, id, t).logReal).toBeCloseTo(v * t, 10);
      }
      const a = boatSnapshot(D, id, 4).logReal;
      const b = boatSnapshot(D, id, 8).logReal;
      const c = boatSnapshot(D, id, 12).logReal;
      expect(b - a).toBeCloseTo(c - b, 12);
    }
  });

  it('investing moves upstream, savings and cash downstream, with the defaults', () => {
    const [cash, savings, invest] = allBoats(D, 30);
    expect(invest.logReal).toBeGreaterThan(0);
    expect(savings.logReal).toBeLessThan(0);
    expect(cash.logReal).toBeLessThan(savings.logReal);
  });

  it('buyingPowerChange is real / start − 1', () => {
    const [cash] = allBoats(D, 30);
    expect(buyingPowerChange(cash, D.start)).toBeCloseTo(0.412 - 1, 3);
    expect(buyingPowerChange(boatSnapshot(D, 'cash', 0), D.start)).toBe(0);
  });
});

describe('riverScale', () => {
  it('is the largest end displacement of the three boats at the defaults', () => {
    const expected = Math.max(...BOATS.map((id) => Math.abs(boatSnapshot(D, id, D.years).logReal)));
    expect(riverScale(D)).toBeCloseTo(expected, 12);
    expect(riverScale(D)).toBeCloseTo(30 * Math.log(1.03), 10); // cash drifts farthest
  });

  it('never falls below ln 1.6 (the floor)', () => {
    expect(riverScale({ ...D, years: 1 })).toBe(SCALE_FLOOR);
    expect(riverScale({ ...D, inflation: 0, savingsRate: 0, investRate: 0 })).toBe(SCALE_FLOOR);
    expect(SCALE_FLOOR).toBeCloseTo(Math.log(1.6), 15);
  });

  it('grows with the horizon and keeps every boat inside +-1', () => {
    expect(riverScale({ ...D, years: 60 })).toBeGreaterThan(riverScale({ ...D, years: 30 }));
    for (const inp of [D, { ...D, investRate: 0.15, inflation: 0 }, { ...D, investRate: -0.05, inflation: 0.12, years: 60 }]) {
      const s = riverScale(inp);
      for (const id of BOATS) {
        for (const t of [0, 5, inp.years / 2, inp.years]) {
          expect(Math.abs(boatSnapshot(inp, id, t).logReal / s)).toBeLessThanOrEqual(1 + 1e-12);
        }
      }
    }
  });

  it('uOfReal maps the dock to 0 and a doubling to ln2 / scale', () => {
    expect(uOfReal(10_000, 10_000, 0.9)).toBe(0);
    expect(uOfReal(10_000, 20_000, 0.9)).toBeCloseTo(Math.LN2 / 0.9, 12);
    expect(uOfReal(10_000, 5_000, 0.9)).toBeCloseTo(-Math.LN2 / 0.9, 12);
  });
});

describe('effortOf', () => {
  it('is 0 for cash, 1 for the strongest, proportional otherwise', () => {
    expect(effortOf(D, 'cash')).toBe(0);
    expect(effortOf(D, 'invest')).toBe(1);
    expect(effortOf(D, 'savings')).toBeCloseTo(1 / 3, 12);
  });
  it('is 0 for non-positive returns and when nothing earns', () => {
    expect(effortOf({ ...D, investRate: -0.02 }, 'invest')).toBe(0);
    expect(effortOf({ ...D, investRate: -0.02 }, 'savings')).toBe(1);
    expect(effortOf({ ...D, savingsRate: 0, investRate: -0.02 }, 'savings')).toBe(0);
    expect(effortOf({ ...D, savingsRate: 0, investRate: 0 }, 'invest')).toBe(0);
  });
});

describe('mileposts', () => {
  it('uses start x 2^k and start x 1.5^+-1, inside the visible range, upstream first', () => {
    const scale = riverScale(D);
    const posts = mileposts(D.start, scale, { min: -1.15, max: 1.15 });
    const values = posts.map((p) => Math.round(p.value));
    expect(values).toEqual([20_000, 15_000, 10_000, 6667, 5000]);
    for (let i = 1; i < posts.length; i++) expect(posts[i].u).toBeLessThan(posts[i - 1].u);
    for (const p of posts) expect(Math.abs(p.u)).toBeLessThanOrEqual(1.15);
    expect(posts.find((p) => p.value === 10_000)?.u).toBe(0);
    expect(posts.find((p) => p.key === '2^1')?.u).toBeCloseTo(Math.LN2 / scale, 12);
  });

  it('marks majors (dock and doublings) apart from the half-steps', () => {
    const posts = mileposts(10_000, 0.9, { min: -1.15, max: 1.15 });
    expect(posts.filter((p) => !p.major).map((p) => p.key).sort()).toEqual(['1.5^-1', '1.5^1']);
  });

  it('drops posts outside the visible range or inside the margin', () => {
    const wide = mileposts(10_000, 0.5, { min: -1.15, max: 1.15 });
    const narrow = mileposts(10_000, 0.5, { min: -0.5, max: 0.5 });
    expect(narrow.length).toBeLessThan(wide.length);
    expect(mileposts(10_000, 0.9, { min: -1, max: 1 }, 0.6).map((p) => p.key)).toEqual(['2^0']);
  });

  it('a long horizon shows more doublings; a tiny scale shows the dock and 1.5 steps only', () => {
    const many = mileposts(1000, 4, { min: -1.1, max: 1.1 });
    expect(many.length).toBeGreaterThan(6);
    const few = mileposts(1000, SCALE_FLOOR, { min: -1.1, max: 1.1 });
    expect(few.map((p) => p.key)).toEqual(['1.5^1', '2^0', '1.5^-1']);
  });
});

describe('validateRiverInputs', () => {
  it('accepts the defaults and the exact limits', () => {
    expect(validateRiverInputs(D)).toEqual({ ok: true, errors: {} });
    const lo = { start: 100, years: 1, inflation: 0, savingsRate: 0, investRate: -0.05 };
    const hi = { start: 1_000_000, years: 60, inflation: 0.12, savingsRate: 0.1, investRate: 0.15 };
    expect(validateRiverInputs(lo).ok).toBe(true);
    expect(validateRiverInputs(hi).ok).toBe(true);
  });

  const fields = ['start', 'years', 'inflation', 'savingsRate', 'investRate'] as const;
  for (const f of fields) {
    it(`${f}: rejects NaN, Infinity, strings, undefined and null`, () => {
      for (const bad of [NaN, Infinity, -Infinity, '5', '', undefined, null, {}, true]) {
        const res = validateRiverInputs({ ...D, [f]: bad });
        expect(res.ok).toBe(false);
        expect(Object.keys(res.errors)).toEqual([f]);
        expect(res.errors[f]).toMatch(/must be a number/);
      }
    });
    it(`${f}: rejects values outside the limits (just beyond each end)`, () => {
      const { min, max } = RIVER_LIMITS[f];
      for (const bad of [min - (f === 'start' ? 1 : f === 'years' ? 1 : 0.001), max + (f === 'start' ? 1 : f === 'years' ? 1 : 0.001)]) {
        const res = validateRiverInputs({ ...D, [f]: bad });
        expect(res.ok).toBe(false);
        expect(res.errors[f]).toMatch(/must be between/);
      }
    });
  }

  it('years must be whole', () => {
    const res = validateRiverInputs({ ...D, years: 12.5 });
    expect(res.ok).toBe(false);
    expect(res.errors.years).toMatch(/whole/);
    expect(validateRiverInputs({ ...D, years: 0 }).errors.years).toMatch(/between 1 and 60/);
  });

  it('reports every bad field at once, with true minus signs in messages', () => {
    const res = validateRiverInputs({ start: 5, years: 99, inflation: -1, savingsRate: 2, investRate: -1 });
    expect(Object.keys(res.errors).sort()).toEqual(['inflation', 'investRate', 'savingsRate', 'start', 'years']);
    expect(res.errors.investRate).toBe('The investment return must be between −5% and 15%.');
    expect(res.errors.start).toBe('The starting amount must be between $100 and $1,000,000.');
  });

  it('tolerates float noise from percent stepping on the rate limits', () => {
    expect(validateRiverInputs({ ...D, inflation: 0.12 + 1e-14 }).ok).toBe(true);
    expect(validateRiverInputs({ ...D, investRate: -0.05 - 1e-14 }).ok).toBe(true);
  });

  it('treats null / non-objects as invalid', () => {
    expect(validateRiverInputs(null).ok).toBe(false);
    expect(validateRiverInputs(undefined).ok).toBe(false);
    expect(validateRiverInputs('x').ok).toBe(false);
  });
});

describe('display helpers', () => {
  it('formats labels, change and milepost text', () => {
    expect(boatLabel('cash', D)).toBe('Cash');
    expect(boatLabel('savings', D)).toBe('Savings account · 2%');
    expect(boatLabel('invest', { ...D, investRate: -0.015 })).toBe('Investing · −1.5%');
    expect(buysToday(4120.4)).toBe('buys what $4,120 buys today');
    expect(formatChange(-0.588)).toBe('−59%');
    expect(formatChange(1.366)).toBe('+137%');
    expect(formatChange(0)).toBe('0%');
    expect(formatChange(-0.001)).toBe('0%');
    expect(milepostLabel(5000)).toBe('$5,000 today');
  });

  it('year labels floor and forgive float noise', () => {
    expect(wholeYears(11.9999999999)).toBe(12);
    expect(wholeYears(11.9)).toBe(11);
    expect(wholeYears(-0.2)).toBe(0);
    expect(yearLabel(12)).toBe('Year 12');
    expect(yearSpoken(12)).toBe('Year 12');
    expect(yearSpoken(12.25)).toBe('Year 12, 3 months');
    expect(yearSpoken(12 + 1 / 12)).toBe('Year 12, 1 month');
  });
});
