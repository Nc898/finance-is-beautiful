import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VINE_INPUTS,
  MAX_MONTHS,
  PLANS,
  VINE_LIMITS,
  allPlans,
  firstInterest,
  formatCents,
  formatCurrency,
  formatDuration,
  formatMoney,
  horizonMonths,
  INTEREST_AT,
  PAYMENT_AT,
  minimumDue,
  planName,
  planSchedule,
  planShortName,
  planSnapshot,
  plansMatch,
  validateVineInputs,
  wholeMonths,
  yearLabel,
  yearMonthLabel,
} from '../../src/vine/engine';
import type { PlanId, VineInputs } from '../../src/vine/engine';

const D = DEFAULT_VINE_INPUTS;

const scenarios: Array<[string, VineInputs]> = [
  ['defaults', D],
  ['no interest', { ...D, apr: 0 }],
  ['high rate, small share', { ...D, apr: 0.36, minPercent: 0.005, balance: 20_000 }],
  ['big fixed payment', { ...D, fixedPayment: 1_000 }],
  ['fixed below the minimum', { ...D, fixedPayment: 10 }],
  ['no floor', { ...D, minFloor: 0 }],
  ['small balance', { ...D, balance: 300 }],
  ['never clears in 60 years', { ...D, balance: 100_000, apr: 0.4, minPercent: 0.005, minFloor: 0 }],
];

describe('minimumDue', () => {
  it('is interest plus the share of the balance at the defaults', () => {
    // 5,000 at 22%: interest 91.67, 1% of the balance 50
    expect(minimumDue(5000, D)).toBeCloseTo(141.6667, 3);
  });

  it('never drops below the floor', () => {
    expect(minimumDue(500, D)).toBe(25); // 9.17 interest + 5 = 14.17, so the floor wins
    expect(minimumDue(500, { ...D, minFloor: 60 })).toBe(60);
  });

  it('never exceeds what is owed (balance plus this month\'s interest)', () => {
    expect(minimumDue(20, D)).toBeCloseTo(20 + (20 * 0.22) / 12, 12);
    expect(minimumDue(1, { ...D, minFloor: 500 })).toBeCloseTo(1 + 0.22 / 12, 12);
  });

  it('is nothing when nothing is owed', () => {
    expect(minimumDue(0, D)).toBe(0);
    expect(minimumDue(-5, D)).toBe(0);
  });

  it('follows the rule at several balances', () => {
    for (const b of [100, 882, 1500, 5000, 40_000]) {
      const interest = (b * D.apr) / 12;
      const want = Math.min(b + interest, Math.max(D.minFloor, interest + D.minPercent * b));
      expect(minimumDue(b, D)).toBeCloseTo(want, 12);
    }
  });
});

describe('the documented defaults ($5,000 at 22%, minimum 1% + interest with a $25 floor, fixed $200)', () => {
  const min = planSchedule(D, 'minimum');
  const fixed = planSchedule(D, 'fixed');

  it('minimum payments take 230 months (19 years, 2 months) and about $8,100 in interest', () => {
    expect(min.cleared).toBe(true);
    expect(min.payoffMonth).toBe(230);
    expect(min.rows).toHaveLength(230);
    expect(formatCurrency(min.totalInterest)).toBe('$8,100');
    expect(formatDuration(min.payoffMonth)).toBe('19 years, 2 months');
  });

  it('the first month: $91.67 of interest, a $141.67 payment', () => {
    expect(min.rows[0].interest).toBeCloseTo(91.67, 2);
    expect(min.rows[0].payment).toBeCloseTo(141.67, 2);
    expect(firstInterest(D)).toBeCloseTo(91.67, 2);
    expect(min.rows[0].balance).toBeCloseTo(5000 + 91.6667 - 141.6667, 3);
  });

  it('what is still owed at years 5, 10, 12 and 15', () => {
    const owed = (month: number) => Math.round(planSnapshot(D, 'minimum', month).balance);
    expect(owed(60)).toBe(2736);
    expect(owed(120)).toBe(1497);
    expect(owed(144)).toBe(1176);
    expect(owed(180)).toBe(813);
  });

  it('the fixed $200 takes 34 months (2 years, 10 months) and about $1,750 in interest', () => {
    expect(fixed.cleared).toBe(true);
    expect(fixed.payoffMonth).toBe(34);
    expect(formatCurrency(fixed.totalInterest)).toBe('$1,750');
    expect(formatDuration(fixed.payoffMonth)).toBe('2 years, 10 months');
    expect(fixed.rows[0].payment).toBe(200);
  });

  it('the timeline runs to the later payoff', () => {
    expect(horizonMonths(D)).toBe(230);
  });

  it('the final payment is smaller and clears the balance to exactly zero', () => {
    for (const s of [min, fixed]) {
      const last = s.rows[s.rows.length - 1];
      expect(last.balance).toBe(0);
      expect(last.payment).toBeLessThanOrEqual(s.rows[0].payment + 1e-9);
      expect(last.payment).toBeCloseTo(s.rows[s.rows.length - 2].balance + last.interest, 9);
    }
  });
});

describe('the monthly recurrence', () => {
  describe.each(scenarios)('%s', (_name, inputs) => {
    for (const id of PLANS) {
      it(`${id}: interest = balance × apr / 12, then balance' = balance + interest − payment`, () => {
        const { rows } = planSchedule(inputs, id);
        let balance = inputs.balance;
        for (const r of rows) {
          expect(r.interest).toBeCloseTo((balance * inputs.apr) / 12, 9);
          if (r.balance !== 0) expect(r.balance).toBeCloseTo(balance + r.interest - r.payment, 7);
          balance = r.balance;
        }
      });

      it(`${id}: balances only ever fall, and every payment covers at least the month's interest`, () => {
        const { rows } = planSchedule(inputs, id);
        let prev = inputs.balance;
        for (const r of rows) {
          expect(r.balance).toBeLessThan(prev);
          expect(r.payment).toBeGreaterThanOrEqual(r.interest - 1e-9);
          expect(r.payment).toBeGreaterThan(0);
          prev = r.balance;
        }
      });

      it(`${id}: principal paid plus interest paid is total paid, and a cleared plan repaid the whole balance`, () => {
        const s = planSchedule(inputs, id);
        const interest = s.rows.reduce((a, r) => a + r.interest, 0);
        const paid = s.rows.reduce((a, r) => a + r.payment, 0);
        expect(s.totalInterest).toBeCloseTo(interest, 6);
        expect(s.totalPaid).toBeCloseTo(paid, 6);
        const principal = s.totalPaid - s.totalInterest;
        if (s.cleared) expect(principal).toBeCloseTo(inputs.balance, 6);
        else expect(principal).toBeCloseTo(inputs.balance - s.rows[s.rows.length - 1].balance, 6);
      });
    }

    it('the fixed plan never pays less than the minimum plan in the same month, so it never finishes later', () => {
      const a = planSchedule(inputs, 'minimum');
      const b = planSchedule(inputs, 'fixed');
      expect(b.payoffMonth).toBeLessThanOrEqual(a.payoffMonth);
      expect(b.totalInterest).toBeLessThanOrEqual(a.totalInterest + 1e-6);
      for (let i = 0; i < b.rows.length - 1; i++) expect(b.rows[i].payment).toBeGreaterThanOrEqual(a.rows[i].payment - 1e-9);
    });
  });
});

describe('edge cases', () => {
  it('APR 0: the vine never grows, interest is zero, and the fixed payment is a plain division', () => {
    const inp = { ...D, apr: 0, fixedPayment: 250 };
    const fixed = planSchedule(inp, 'fixed');
    expect(fixed.payoffMonth).toBe(20);
    expect(fixed.totalInterest).toBe(0);
    expect(fixed.totalPaid).toBeCloseTo(5000, 9);
    expect(fixed.rows.every((r) => r.interest === 0)).toBe(true);
    const min = planSchedule(inp, 'minimum');
    expect(min.cleared).toBe(true);
    expect(min.totalInterest).toBe(0);
    expect(min.rows[0].payment).toBe(50); // 1% of the balance, above the floor
    expect(firstInterest(inp)).toBe(0);
    expect(planSnapshot(inp, 'minimum', 10.5).interest).toBe(0);
  });

  it('a fixed payment below the minimum pays the minimum (a card requires it)', () => {
    // 20 is under both the first minimum (141.67) and the $25 floor, so the two plans are identical all the way
    const inp = { ...D, fixedPayment: 20 };
    const min = planSchedule(inp, 'minimum');
    const fixed = planSchedule(inp, 'fixed');
    expect(fixed.rows[0].payment).toBeCloseTo(141.67, 2);
    expect(fixed.payoffMonth).toBe(min.payoffMonth);
    expect(fixed.totalInterest).toBeCloseTo(min.totalInterest, 6);
    expect(plansMatch(inp)).toBe(true);
    expect(plansMatch(D)).toBe(false);
    expect(horizonMonths(inp)).toBe(230);
  });

  it('a fixed payment that starts below the minimum but is above it later pays the larger each month', () => {
    // minimum starts at 141.67 and falls toward the $25 floor; a fixed 100 pays the minimum at first, then 100
    const inp = { ...D, fixedPayment: 100 };
    const fixed = planSchedule(inp, 'fixed');
    expect(plansMatch(inp)).toBe(false);
    expect(fixed.rows[0].payment).toBeCloseTo(141.67, 2);
    const later = fixed.rows.find((r, i) => i > 0 && r.payment === 100);
    expect(later).toBeDefined();
    expect(fixed.payoffMonth).toBeLessThan(planSchedule(inp, 'minimum').payoffMonth);
  });

  it('a fixed payment bigger than what is owed clears in one month, paying only what is owed', () => {
    const inp = { ...D, balance: 100, fixedPayment: 20_000 };
    const fixed = planSchedule(inp, 'fixed');
    expect(fixed.payoffMonth).toBe(1);
    expect(fixed.rows).toHaveLength(1);
    expect(fixed.rows[0].payment).toBeCloseTo(100 + (100 * 0.22) / 12, 9);
    expect(fixed.rows[0].balance).toBe(0);
    expect(fixed.totalInterest).toBeCloseTo(1.8333, 3);
    expect(horizonMonths(inp)).toBe(planSchedule(inp, 'minimum').payoffMonth);
  });

  it('the $25 floor phase: once 1% + interest is under $25, the payment is $25 until the last one', () => {
    const { rows } = planSchedule(D, 'minimum');
    const floor = rows.filter((r) => r.payment === 25);
    expect(floor.length).toBeGreaterThan(20);
    // the floor stretch is contiguous and at the end, apart from the smaller last payment
    const first = rows.findIndex((r) => r.payment === 25);
    for (let i = first; i < rows.length - 1; i++) expect(rows[i].payment).toBe(25);
    expect(rows[rows.length - 1].payment).toBeLessThan(25 + 1e-9);
    // before that the payment falls with the balance
    expect(rows[first - 1].payment).toBeGreaterThan(25);
  });

  it('stops at MAX_MONTHS when the balance is never cleared', () => {
    const inp = { ...D, balance: 100_000, apr: 0.4, minPercent: 0.005, minFloor: 0 };
    const s = planSchedule(inp, 'minimum');
    expect(s.cleared).toBe(false);
    expect(s.payoffMonth).toBe(MAX_MONTHS);
    expect(s.rows).toHaveLength(MAX_MONTHS);
    expect(s.rows[MAX_MONTHS - 1].balance).toBeGreaterThan(0.005);
    const end = planSnapshot(inp, 'minimum', MAX_MONTHS);
    expect(end.paidOff).toBe(false);
    expect(end.balance).toBeGreaterThan(0);
    expect(horizonMonths(inp)).toBe(MAX_MONTHS);
    // a fixed payment of the maximum clears the same card
    expect(planSchedule({ ...inp, fixedPayment: 20_000 }, 'fixed').cleared).toBe(true);
  });

  it('memoises per inputs and plan, and recomputes for different inputs', () => {
    const inp = { ...D, balance: 7_000 };
    expect(planSchedule(inp, 'minimum')).toBe(planSchedule({ ...inp }, 'minimum'));
    expect(planSchedule(inp, 'minimum')).not.toBe(planSchedule(inp, 'fixed'));
    expect(planSchedule(inp, 'fixed')).not.toBe(planSchedule({ ...inp, fixedPayment: 300 }, 'fixed'));
    expect(planSchedule({ ...inp, apr: 0.2 }, 'minimum').totalInterest).toBeLessThan(planSchedule(inp, 'minimum').totalInterest);
  });
});

describe('planSnapshot', () => {
  const at = (id: PlanId, m: number) => planSnapshot(D, id, m);

  it('starts with the whole balance, nothing paid', () => {
    for (const id of PLANS) {
      const s = at(id, 0);
      expect(s.balance).toBe(5000);
      expect(s.interestPaid).toBe(0);
      expect(s.principalPaid).toBe(0);
      expect(s.totalPaid).toBe(0);
      expect(s.paidOff).toBe(false);
      expect(s.payment).toBeGreaterThan(0);
      expect(s.interest).toBeCloseTo(91.67, 2);
    }
  });

  it('matches the schedule at whole months', () => {
    const { rows } = planSchedule(D, 'minimum');
    let interest = 0;
    rows.forEach((r, i) => {
      interest += r.interest;
      const s = at('minimum', i + 1);
      expect(s.balance).toBeCloseTo(r.balance, 9);
      expect(s.interestPaid).toBeCloseTo(interest, 6);
    });
  });

  it('moves linearly within a month: the middle is the average of the two ends', () => {
    for (const id of PLANS) {
      for (const k of [0, 1, 7, 33]) {
        const a = at(id, k);
        const b = at(id, k + 1);
        const mid = at(id, k + 0.5);
        expect(mid.balance).toBeCloseTo((a.balance + b.balance) / 2, 9);
        expect(mid.interestPaid).toBeCloseTo((a.interestPaid + b.interestPaid) / 2, 9);
        expect(mid.totalPaid).toBeCloseTo((a.totalPaid + b.totalPaid) / 2, 9);
        // the payment and interest are those of the month in progress
        expect(mid.payment).toBe(planSchedule(D, id).rows[k].payment);
        expect(mid.interest).toBe(planSchedule(D, id).rows[k].interest);
      }
    }
  });

  it('shows what is owed as a statement does: up when the interest is charged, down when the payment lands', () => {
    for (const id of PLANS) {
      const { rows } = planSchedule(D, id);
      for (const k of [0, 1, 7, 33]) {
        const start = k === 0 ? 5000 : rows[k - 1].balance;
        const r = rows[k];
        // the balance stands at first, never sliding
        expect(at(id, k + INTEREST_AT * 0.5).owed).toBeCloseTo(start, 9);
        // the month's interest is charged: up by exactly that
        expect(at(id, k + (INTEREST_AT + PAYMENT_AT) / 2).owed).toBeCloseTo(start + r.interest, 9);
        // the payment lands: down to the month's closing balance
        expect(at(id, k + (PAYMENT_AT + 1) / 2).owed).toBeCloseTo(r.balance, 9);
        // the interest counter ticks up with the charge, not a slide
        expect(at(id, k + INTEREST_AT * 0.5).interestCharged).toBeCloseTo(at(id, k).interestPaid, 9);
        expect(at(id, k + INTEREST_AT + 0.01).interestCharged).toBeCloseTo(at(id, k + 1).interestPaid, 9);
      }
      // it matches the smooth balance at every whole month, and reads 0 once paid off
      for (const k of [1, 5, 20]) expect(at(id, k).owed).toBeCloseTo(at(id, k).balance, 9);
      expect(at(id, rows.length).owed).toBe(0);
    }
  });

  it('is continuous across month boundaries (no jump in balance, interest or total paid)', () => {
    for (const id of PLANS) {
      const end = planSchedule(D, id).payoffMonth;
      for (let k = 1; k <= end; k++) {
        const before = at(id, k - 1e-9);
        const after = at(id, k);
        expect(Math.abs(before.balance - after.balance)).toBeLessThan(1e-6);
        expect(Math.abs(before.interestPaid - after.interestPaid)).toBeLessThan(1e-6);
        expect(Math.abs(before.totalPaid - after.totalPaid)).toBeLessThan(1e-6);
      }
    }
  });

  it('balance falls and interest paid rises monotonically through fractional months', () => {
    for (const id of PLANS) {
      let prevB = Infinity;
      let prevI = -1;
      const end = planSchedule(D, id).payoffMonth;
      for (let m = 0; m <= end; m += 0.37) {
        const s = at(id, m);
        expect(s.balance).toBeLessThanOrEqual(prevB + 1e-9);
        expect(s.interestPaid).toBeGreaterThanOrEqual(prevI - 1e-9);
        prevB = s.balance;
        prevI = s.interestPaid;
      }
    }
  });

  it('totals add up at every moment: principal + interest = total paid, and principal = start − owed', () => {
    for (const [, inputs] of scenarios) {
      for (const id of PLANS) {
        const end = planSchedule(inputs, id).payoffMonth;
        for (let m = 0; m <= end; m += Math.max(0.25, end / 40)) {
          const s = planSnapshot(inputs, id, m);
          expect(s.totalPaid).toBeCloseTo(s.principalPaid + s.interestPaid, 9);
          expect(s.principalPaid).toBeCloseTo(inputs.balance - s.balance, 9);
        }
      }
    }
  });

  it('at the end of a cleared plan: paid off, owed 0, principal = the starting balance, totals match the schedule', () => {
    for (const [, inputs] of scenarios) {
      for (const id of PLANS) {
        const sched = planSchedule(inputs, id);
        if (!sched.cleared) continue;
        const s = planSnapshot(inputs, id, sched.payoffMonth);
        expect(s.paidOff).toBe(true);
        expect(s.balance).toBe(0);
        expect(s.principalPaid).toBeCloseTo(inputs.balance, 9);
        expect(s.interestPaid).toBeCloseTo(sched.totalInterest, 6);
        expect(s.totalPaid).toBeCloseTo(sched.totalPaid, 6);
        expect(s.payment).toBe(0);
        expect(s.interest).toBe(0);
        expect(s.payoffMonth).toBe(sched.payoffMonth);
        expect(s.totalInterest).toBe(sched.totalInterest);
      }
    }
  });

  it('is not paid off just before the last month ends', () => {
    expect(at('fixed', 33.999).paidOff).toBe(false);
    expect(at('fixed', 34).paidOff).toBe(true);
    expect(at('fixed', 34).month).toBe(34);
  });

  it('clamps months to the schedule', () => {
    expect(at('fixed', -5).month).toBe(0);
    expect(at('fixed', 1e6).month).toBe(34);
    expect(at('fixed', 1e6).balance).toBe(0);
    expect(at('minimum', Number.NaN).month).toBe(0);
  });

  it('allPlans gives the minimum then the fixed plan', () => {
    const [a, b] = allPlans(D, 12);
    expect(a.id).toBe('minimum');
    expect(b.id).toBe('fixed');
    expect(b.balance).toBeLessThan(a.balance);
  });
});

describe('validateVineInputs', () => {
  it('accepts the defaults and the limits themselves', () => {
    expect(validateVineInputs(D)).toEqual({ ok: true, errors: {} });
    const lo = { balance: 100, apr: 0, fixedPayment: 10, minPercent: 0.005, minFloor: 0 };
    const hi = { balance: 100_000, apr: 0.4, fixedPayment: 20_000, minPercent: 0.05, minFloor: 500 };
    expect(validateVineInputs(lo).ok).toBe(true);
    expect(validateVineInputs(hi).ok).toBe(true);
    // limits and the engine agree
    expect(VINE_LIMITS.apr.min).toBe(0);
  });

  it('APR 0 is valid', () => {
    expect(validateVineInputs({ ...D, apr: 0 }).ok).toBe(true);
  });

  it('rejects out-of-range values with a message for the right field', () => {
    const bad: Array<[keyof VineInputs, number]> = [
      ['balance', 99],
      ['balance', 100_001],
      ['apr', -0.01],
      ['apr', 0.41],
      ['fixedPayment', 5],
      ['fixedPayment', 20_001],
      ['minPercent', 0.001],
      ['minPercent', 0.06],
      ['minFloor', -1],
      ['minFloor', 501],
    ];
    for (const [field, value] of bad) {
      const r = validateVineInputs({ ...D, [field]: value });
      expect(r.ok, `${field}=${value}`).toBe(false);
      expect(Object.keys(r.errors)).toEqual([field]);
    }
  });

  it('rejects anything that is not a finite number, one message per field', () => {
    const r = validateVineInputs({ balance: Number.NaN, apr: Infinity, fixedPayment: '200', minPercent: null, minFloor: undefined });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['apr', 'balance', 'fixedPayment', 'minFloor', 'minPercent']);
    expect(validateVineInputs(null).ok).toBe(false);
    expect(validateVineInputs('nope').ok).toBe(false);
  });

  it('messages are plain language with the allowed range, and use no em-dashes', () => {
    expect(validateVineInputs({ ...D, balance: 5 }).errors.balance).toBe('The card balance must be between $100 and $100,000.');
    expect(validateVineInputs({ ...D, apr: 0.5 }).errors.apr).toBe('The interest rate must be between 0% and 40%.');
    expect(validateVineInputs({ ...D, fixedPayment: Number.NaN }).errors.fixedPayment).toBe('The fixed payment must be a number.');
    expect(validateVineInputs({ ...D, minPercent: 0.2 }).errors.minPercent).toBe('The share of the balance must be between 0.5% and 5%.');
    expect(validateVineInputs({ ...D, minFloor: 900 }).errors.minFloor).toBe('The floor must be between $0 and $500.');
    for (const m of Object.values(validateVineInputs({ balance: 1, apr: 9, fixedPayment: 1, minPercent: 9, minFloor: 9 }).errors)) expect(m).not.toContain('—');
  });

  it('tolerates float noise on the rate limits', () => {
    expect(validateVineInputs({ ...D, apr: 0.4 + 1e-14 }).ok).toBe(true);
    expect(validateVineInputs({ ...D, minPercent: 0.005 - 1e-14 }).ok).toBe(true);
  });
});

describe('formatting', () => {
  it('durations read like people say them', () => {
    expect(formatDuration(34)).toBe('2 years, 10 months');
    expect(formatDuration(230)).toBe('19 years, 2 months');
    expect(formatDuration(12)).toBe('1 year');
    expect(formatDuration(13)).toBe('1 year, 1 month');
    expect(formatDuration(24)).toBe('2 years');
    expect(formatDuration(5)).toBe('5 months');
    expect(formatDuration(1)).toBe('1 month');
    expect(formatDuration(0)).toBe('0 months');
    expect(formatDuration(720)).toBe('60 years');
  });

  it('the clock reads "Year 5, month 3" with whole months', () => {
    expect(yearMonthLabel(0)).toBe('Year 0, month 0');
    expect(yearMonthLabel(63)).toBe('Year 5, month 3');
    expect(yearMonthLabel(63.9)).toBe('Year 5, month 3');
    expect(yearMonthLabel(60)).toBe('Year 5, month 0');
    expect(yearMonthLabel(60 - 1e-12)).toBe('Year 5, month 0');
    expect(yearMonthLabel(230)).toBe('Year 19, month 2');
    expect(yearLabel(144)).toBe('Year 12');
    expect(wholeMonths(-3)).toBe(0);
  });

  it('money shows whole dollars, and cents only when there are some', () => {
    expect(formatMoney(200)).toBe('$200');
    expect(formatMoney(187.5)).toBe('$187.50');
    expect(formatMoney(1750)).toBe('$1,750');
    expect(formatCents(141.6667)).toBe('$141.67');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCurrency(2735.78)).toBe('$2,736');
  });

  it('plan names follow the inputs', () => {
    expect(planName('minimum', D)).toBe('Minimum payments');
    expect(planName('fixed', D)).toBe('A fixed $200 a month');
    expect(planName('fixed', { ...D, fixedPayment: 1250 })).toBe('A fixed $1,250 a month');
    expect(planShortName('minimum', D)).toBe('Minimum');
    expect(planShortName('fixed', D)).toBe('Fixed $200');
  });
});
