import { describe, expect, it } from 'vitest';
import {
  CLEARED_BELOW,
  DEBTS,
  DEFAULT_SNOW_INPUTS,
  INTEREST_AT,
  MAX_MONTHS,
  PAYMENT_AT,
  SNOW_FIELDS,
  SNOW_LIMITS,
  allStrategies,
  ballTag,
  extraAboveMinimums,
  formatDuration,
  hillsMatch,
  horizonMonths,
  statementMonth,
  strategyOrder,
  strategySchedule,
  strategySnapshot,
  sumMinimums,
  validateSnowInputs,
  wholeMonths,
  yearMonthLabel,
} from '../../src/snow/engine';
import type { DebtId, SnowInputs, StrategyId } from '../../src/snow/engine';

const D = DEFAULT_SNOW_INPUTS;
const clone = (i: SnowInputs): SnowInputs => JSON.parse(JSON.stringify(i));
const withDebt = (debt: DebtId, patch: Partial<SnowInputs['debts'][DebtId]>, base: SnowInputs = D): SnowInputs => {
  const c = clone(base);
  c.debts[debt] = { ...c.debts[debt], ...patch };
  return c;
};

/**
 * An independent copy of the monthly rule, written a different way from the engine: one pot of money poured
 * into the debts by priority, with plain arrays and no shared code.
 */
function reference(inputs: SnowInputs, id: StrategyId) {
  const names: DebtId[] = ['medical', 'car', 'card'];
  const bal = names.map((n) => inputs.debts[n].balance);
  const apr = names.map((n) => inputs.debts[n].apr);
  const min = names.map((n) => inputs.debts[n].minPayment);
  const prio = [0, 1, 2].sort((a, b) =>
    id === 'snowball'
      ? bal[a] - bal[b] || apr[b] - apr[a] || a - b
      : apr[b] - apr[a] || bal[a] - bal[b] || a - b,
  );
  const owedAfter: number[][] = [];
  const cleared: Array<number | null> = [null, null, null];
  let interestTotal = 0;
  let month = 0;
  while (bal.some((b) => b > 0.005) && month < MAX_MONTHS) {
    month++;
    for (let i = 0; i < 3; i++) {
      if (bal[i] <= 0) continue;
      const add = (bal[i] * apr[i]) / 12;
      interestTotal += add;
      bal[i] += add;
    }
    let pot = inputs.budget;
    for (let i = 0; i < 3; i++) {
      if (bal[i] <= 0) continue;
      const pay = Math.min(min[i], bal[i]);
      bal[i] -= pay;
      pot -= pay;
    }
    for (const i of prio) {
      if (pot <= 0) break;
      const pay = Math.min(pot, bal[i]);
      bal[i] -= pay;
      pot -= pay;
    }
    for (let i = 0; i < 3; i++) {
      if (bal[i] < 0.005 && bal[i] !== 0) bal[i] = 0;
      if (bal[i] === 0 && cleared[i] === null) cleared[i] = month;
    }
    owedAfter.push([...bal]);
  }
  return { months: month, cleared, interestTotal, owedAfter, prio: prio.map((i) => names[i]) };
}

const total = (a: number[]) => a.reduce((s, v) => s + v, 0);

describe('the defaults, checked against an independent simulation', () => {
  it('snowball: medical month 4, car 15, card 32; $6,295.45 of interest', () => {
    const s = strategySchedule(D, 'snowball');
    expect(s.order).toEqual(['medical', 'car', 'card']);
    expect(s.clearedAt).toEqual({ medical: 4, car: 15, card: 32 });
    expect(s.payoffMonth).toBe(32);
    expect(s.cleared).toBe(true);
    expect(s.firstWin).toBe(4);
    expect(s.totalInterest.toFixed(2)).toBe('6295.45');
    const r = reference(D, 'snowball');
    expect(r.cleared).toEqual([4, 15, 32]);
    expect(r.interestTotal).toBeCloseTo(s.totalInterest, 9);
  });

  it('avalanche: card month 28, medical 25 (on its minimums), car 30; $4,642.46 of interest', () => {
    const s = strategySchedule(D, 'avalanche');
    expect(s.order).toEqual(['card', 'car', 'medical']);
    expect(s.clearedAt).toEqual({ medical: 25, car: 30, card: 28 });
    expect(s.payoffMonth).toBe(30);
    expect(s.firstWin).toBe(25);
    expect(s.totalInterest.toFixed(2)).toBe('4642.46');
    const r = reference(D, 'avalanche');
    expect(r.cleared).toEqual([25, 30, 28]);
    expect(r.interestTotal).toBeCloseTo(s.totalInterest, 9);
  });

  it('owed after month 12 matches the spec to the dollar', () => {
    const snow = strategySnapshot(D, 'snowball', 12);
    expect(Math.round(snow.debts.medical.balance)).toBe(0);
    expect(Math.round(snow.debts.car.balance)).toBe(1253);
    expect(Math.round(snow.debts.card.balance)).toBe(11458);
    const av = strategySnapshot(D, 'avalanche', 12);
    expect(Math.round(av.debts.medical.balance)).toBe(520);
    expect(Math.round(av.debts.car.balance)).toBe(4150);
    expect(Math.round(av.debts.card.balance)).toBe(7668);
    expect(Math.round(snow.interestCharged)).toBe(3311);
    expect(Math.round(av.interestCharged)).toBe(2937);
  });

  it('the avalanche saves $1,653 and 2 months; the snowball gets its first win 21 months sooner', () => {
    const s = strategySchedule(D, 'snowball');
    const a = strategySchedule(D, 'avalanche');
    expect(Math.round(s.totalInterest) - Math.round(a.totalInterest)).toBe(1653);
    expect(s.payoffMonth - a.payoffMonth).toBe(2);
    expect(a.firstWin! - s.firstWin!).toBe(21);
    expect(horizonMonths(D)).toBe(32);
  });

  it('every month agrees with the independent simulation, debt by debt', () => {
    for (const id of ['snowball', 'avalanche'] as StrategyId[]) {
      const s = strategySchedule(D, id);
      const r = reference(D, id);
      expect(s.rows.length).toBe(r.months);
      s.rows.forEach((row, i) => {
        DEBTS.forEach((d, j) => expect(row.debts[d].balance).toBeCloseTo(r.owedAfter[i][j], 9));
      });
    }
  });

  it('totals add up: total paid = starting debt + interest', () => {
    for (const id of ['snowball', 'avalanche'] as StrategyId[]) {
      const s = strategySchedule(D, id);
      expect(s.totalPaid).toBeCloseTo(19_000 + s.totalInterest, 9);
    }
  });
});

describe('the monthly rule', () => {
  it('first month: interest $290, minimums $520, extra $280 to the target', () => {
    const snow = strategySchedule(D, 'snowball').rows[0];
    expect(snow.target).toBe('medical');
    expect(snow.debts.medical).toMatchObject({ interest: 0, payment: 320 });
    expect(snow.debts.car.interest).toBeCloseTo(30, 12);
    expect(snow.debts.car.payment).toBe(180);
    expect(snow.debts.card.interest).toBeCloseTo(260, 12);
    expect(snow.debts.card.payment).toBe(300);
    const av = strategySchedule(D, 'avalanche').rows[0];
    expect(av.target).toBe('card');
    expect(av.debts.card.payment).toBe(580);
    expect(av.debts.medical.payment).toBe(40);
    expect(av.debts.car.payment).toBe(180);
  });

  it('pays exactly the budget every month until the last, when it pays what is left', () => {
    for (const id of ['snowball', 'avalanche'] as StrategyId[]) {
      const rows = strategySchedule(D, id).rows;
      rows.forEach((row, i) => {
        const paid = total(DEBTS.map((d) => row.debts[d].payment));
        if (i < rows.length - 1) expect(paid).toBeCloseTo(D.budget, 9);
        else expect(paid).toBeLessThanOrEqual(D.budget + 1e-9);
      });
    }
  });

  it('a debt that clears mid-month passes the rest of the extra on within the same month', () => {
    // with $900 the extra is $380: the medical bill is down to $160 in month 3, so $120 of the extra clears it
    // and the other $260 carries on to the car loan in the same month
    const inp = { ...D, budget: 900 };
    const row = strategySchedule(inp, 'snowball').rows[2];
    expect(row.debts.medical.balance).toBe(0);
    expect(row.debts.medical.payment).toBeCloseTo(160, 9);
    expect(row.debts.car.payment).toBeCloseTo(180 + 260, 9);
    expect(total(DEBTS.map((d) => row.debts[d].payment))).toBeCloseTo(900, 9);
    // from the next month the freed minimum rolls on too
    expect(strategySchedule(inp, 'snowball').rows[3].target).toBe('car');
    expect(strategySchedule(inp, 'snowball').rows[3].debts.car.payment).toBeCloseTo(180 + 380 + 40, 9);
  });

  it('when the target needs no more than its minimum, the whole extra goes to the next debt', () => {
    // the defaults, snowball month 4: the medical bill has $40 left, which is exactly its minimum
    const row = strategySchedule(D, 'snowball').rows[3];
    expect(row.debts.medical.payment).toBeCloseTo(40, 9);
    expect(row.debts.car.payment).toBeCloseTo(180 + 280, 9);
    expect(strategySchedule(D, 'snowball').rows[4].debts.car.payment).toBeCloseTo(180 + 280 + 40, 9);
  });

  it('a cleared debt stays at zero with no interest and no payment', () => {
    const rows = strategySchedule(D, 'snowball').rows;
    for (const row of rows.slice(4)) {
      expect(row.debts.medical).toEqual({ interest: 0, payment: 0, balance: 0 });
    }
  });

  it('the cascade can clear two debts in one month', () => {
    const inp = withDebt('car', { balance: 100, apr: 0, minPayment: 10 }, withDebt('medical', { balance: 100, apr: 0, minPayment: 10 }));
    const s = strategySchedule({ ...inp, budget: 4000 }, 'snowball');
    // medical 100 (min 10), car 100 (min 10) both cleared in month 1 by the extra, card gets the rest
    expect(s.clearedAt.medical).toBe(1);
    expect(s.clearedAt.car).toBe(1);
    expect(s.firstWin).toBe(1);
    expect(s.rows[0].debts.card.payment).toBeCloseTo(4000 - 200, 9);
  });

  it('a minimum is capped at what is owed', () => {
    const inp = { ...withDebt('medical', { balance: 100, minPayment: 400 }), budget: 800 };
    const s = strategySchedule(inp, 'snowball');
    expect(s.rows[0].debts.medical.payment).toBe(100);
    expect(s.clearedAt.medical).toBe(1);
    expect(s.rows[0].debts.medical.balance).toBe(0);
  });

  it('a 0% debt grows nothing', () => {
    const s = strategySchedule(D, 'snowball');
    expect(s.rows.every((r) => r.debts.medical.interest === 0)).toBe(true);
    const allZero = clone(D);
    for (const d of DEBTS) allZero.debts[d].apr = 0;
    expect(strategySchedule(allZero, 'snowball').totalInterest).toBe(0);
    expect(strategySchedule(allZero, 'avalanche').totalInterest).toBe(0);
    expect(strategySchedule(allZero, 'avalanche').totalPaid).toBeCloseTo(19_000, 9);
  });

  it('clears when the balance is under half a cent', () => {
    for (const id of ['snowball', 'avalanche'] as StrategyId[]) {
      const s = strategySchedule(D, id);
      const last = s.rows[s.rows.length - 1];
      expect(DEBTS.every((d) => last.debts[d].balance === 0)).toBe(true);
      s.rows.forEach((row) => DEBTS.forEach((d) => expect(row.debts[d].balance === 0 || row.debts[d].balance >= CLEARED_BELOW).toBe(true)));
    }
  });
});

describe('orders and ties', () => {
  it('snowball is smallest balance first; avalanche is highest rate first', () => {
    expect(strategyOrder(D, 'snowball')).toEqual(['medical', 'car', 'card']);
    expect(strategyOrder(D, 'avalanche')).toEqual(['card', 'car', 'medical']);
  });

  it('snowball ties go to the higher rate; avalanche ties go to the smaller balance', () => {
    const tiedBalance = withDebt('car', { balance: 1000, apr: 0.1 }, withDebt('card', { balance: 1000, apr: 0.2, minPayment: 100 }));
    expect(strategyOrder(tiedBalance, 'snowball')[0]).toBe('card'); // 20% before 10% before the 0% medical bill
    expect(strategyOrder(tiedBalance, 'snowball')).toEqual(['card', 'car', 'medical']);
    const tiedRate = withDebt('medical', { balance: 3000, apr: 0.06 }, withDebt('car', { balance: 6000, apr: 0.06 }));
    expect(strategyOrder(tiedRate, 'avalanche').slice(0, 2)).toEqual(['card', 'medical']); // card 26% first, then the smaller 6%
    expect(strategyOrder(tiedRate, 'avalanche')).toEqual(['card', 'medical', 'car']);
  });

  it('full ties fall back to lane order, always the same answer', () => {
    const same = clone(D);
    for (const d of DEBTS) same.debts[d] = { balance: 1000, apr: 0.1, minPayment: 50 };
    expect(strategyOrder(same, 'snowball')).toEqual(['medical', 'car', 'card']);
    expect(strategyOrder(same, 'avalanche')).toEqual(['medical', 'car', 'card']);
    expect(hillsMatch(same)).toBe(true);
  });

  it('the order is fixed at the start (it does not reshuffle as balances change)', () => {
    // the card starts bigger than the car loan but ends smaller than it: the snowball still goes car first
    const s = strategySchedule(withDebt('card', { balance: 6500, apr: 0.3, minPayment: 250 }), 'snowball');
    expect(s.order).toEqual(['medical', 'car', 'card']);
  });

  it('the hills match only when they truly do the same thing', () => {
    expect(hillsMatch(D)).toBe(false);
    // the smallest debt is also the dearest, so both orders agree
    const agree = withDebt('medical', { apr: 0.3 }, withDebt('car', { apr: 0.2 }, withDebt('card', { apr: 0.1 })));
    expect(strategyOrder(agree, 'snowball')).toEqual(strategyOrder(agree, 'avalanche'));
    expect(hillsMatch(agree)).toBe(true);
    expect(strategySchedule(agree, 'snowball').totalInterest).toBeCloseTo(strategySchedule(agree, 'avalanche').totalInterest, 9);
  });

  it('with the budget equal to the minimums nothing is extra, yet freed-up payments still roll on', () => {
    const tight = { ...D, budget: 520 };
    expect(extraAboveMinimums(tight)).toBe(0);
    const s = strategySchedule(tight, 'snowball');
    expect(s.rows[0].debts.medical.payment).toBe(40);
    expect(s.clearedAt.medical).toBe(25); // 1000 / 40
    expect(s.rows[25].target).toBe('car'); // its $40 now rolls on
    const r = reference(tight, 'snowball');
    expect(s.clearedAt).toEqual({ medical: r.cleared[0], car: r.cleared[1], card: r.cleared[2] });
    expect(hillsMatch(tight)).toBe(false);
  });
});

describe('a schedule that never clears', () => {
  it('stops at MAX_MONTHS and says so', () => {
    const stuck: SnowInputs = {
      // each minimum pays exactly the month's interest and the budget is only the minimums: nothing ever shrinks
      budget: 9000,
      debts: {
        medical: { balance: 90_000, apr: 0.4, minPayment: 3000 },
        car: { balance: 90_000, apr: 0.4, minPayment: 3000 },
        card: { balance: 90_000, apr: 0.4, minPayment: 3000 },
      },
    };
    expect(validateSnowInputs(stuck).ok).toBe(true);
    const s = strategySchedule(stuck, 'snowball');
    expect(s.cleared).toBe(false);
    expect(s.payoffMonth).toBe(MAX_MONTHS);
    expect(s.rows.length).toBe(MAX_MONTHS);
    expect(horizonMonths(stuck)).toBe(MAX_MONTHS);
    const snap = strategySnapshot(stuck, 'snowball', MAX_MONTHS);
    expect(snap.paidOff).toBe(false);
    expect(snap.target).toBe(null);
  });
});

describe('snapshots', () => {
  it('start: everything owed, nothing charged, the first target set', () => {
    const [snow, av] = allStrategies(D, 0);
    expect(snow.owed).toBe(19_000);
    expect(snow.interestCharged).toBe(0);
    expect(snow.target).toBe('medical');
    expect(av.target).toBe('card');
    expect(snow.clearedCount).toBe(0);
    expect(snow.paidOff).toBe(false);
    expect(snow.debts.card).toMatchObject({ balance: 12_000, owed: 12_000, interestCharged: 0, interest: 260, payment: 300, paidOff: false });
  });

  it('smooth balances move linearly through a month', () => {
    const a = strategySnapshot(D, 'snowball', 5);
    const b = strategySnapshot(D, 'snowball', 6);
    const mid = strategySnapshot(D, 'snowball', 5.5);
    for (const d of DEBTS) expect(mid.debts[d].balance).toBeCloseTo((a.debts[d].balance + b.debts[d].balance) / 2, 9);
  });

  it('statement figures step: opening balance, then interest charged, then the payment lands', () => {
    const open = strategySnapshot(D, 'snowball', 5);
    const next = strategySnapshot(D, 'snowball', 6);
    const before = strategySnapshot(D, 'snowball', 5 + INTEREST_AT - 0.01);
    const charged = strategySnapshot(D, 'snowball', 5 + INTEREST_AT);
    const stillCharged = strategySnapshot(D, 'snowball', 5 + PAYMENT_AT - 0.01);
    const paid = strategySnapshot(D, 'snowball', 5 + PAYMENT_AT);
    expect(before.owed).toBe(open.owed);
    expect(before.interestCharged).toBe(open.interestCharged);
    // interest charged: owed rises by this month's interest and the counter steps up
    const row = strategySchedule(D, 'snowball').rows[5];
    const interest = DEBTS.reduce((s, d) => s + row.debts[d].interest, 0);
    expect(charged.owed).toBeCloseTo(open.owed + interest, 9);
    expect(charged.interestCharged).toBeCloseTo(open.interestCharged + interest, 9);
    expect(stillCharged.owed).toBe(charged.owed);
    // the payment lands: owed drops to the month's close
    expect(paid.owed).toBeCloseTo(next.owed, 9);
    expect(paid.interestCharged).toBe(charged.interestCharged);
    expect(next.interestCharged).toBeCloseTo(charged.interestCharged, 9);
  });

  it('flags paidOff at the end of the clearing month, and zeroes this month\'s figures after', () => {
    const during = strategySnapshot(D, 'snowball', 3.5);
    expect(during.debts.medical.paidOff).toBe(false);
    expect(during.debts.medical.payment).toBeGreaterThan(0);
    expect(during.target).toBe('medical');
    const at = strategySnapshot(D, 'snowball', 4);
    expect(at.debts.medical).toMatchObject({ balance: 0, owed: 0, interest: 0, payment: 0, paidOff: true });
    expect(at.clearedCount).toBe(1);
    expect(at.target).toBe('car');
    const later = strategySnapshot(D, 'snowball', 20);
    expect(later.clearedCount).toBe(2);
  });

  it('is paid off at the horizon, with the target gone', () => {
    const end = strategySnapshot(D, 'snowball', 32);
    expect(end.paidOff).toBe(true);
    expect(end.owed).toBe(0);
    expect(end.target).toBe(null);
    expect(end.clearedCount).toBe(3);
    // the avalanche is done earlier and stays done
    const av = strategySnapshot(D, 'avalanche', 32);
    expect(av.paidOff).toBe(true);
    expect(av.month).toBe(30); // clamped to its own schedule
  });

  it('clamps and tolerates bad months', () => {
    expect(strategySnapshot(D, 'snowball', -5).month).toBe(0);
    expect(strategySnapshot(D, 'snowball', 9999).month).toBe(32);
    expect(strategySnapshot(D, 'snowball', NaN).month).toBe(0);
  });

  it('interest charged per debt adds up to the schedule total at the end', () => {
    const end = strategySnapshot(D, 'avalanche', 30);
    expect(end.interestCharged).toBeCloseTo(strategySchedule(D, 'avalanche').totalInterest, 9);
    expect(end.totalInterest).toBe(strategySchedule(D, 'avalanche').totalInterest);
    expect(end.payoffMonth).toBe(30);
  });

  it('a debt cleared in month 1 is paid off at month 1', () => {
    const inp = { ...withDebt('medical', { balance: 100, minPayment: 400 }), budget: 800 };
    const at0 = strategySnapshot(inp, 'snowball', 0);
    expect(at0.debts.medical.paidOff).toBe(false);
    const at1 = strategySnapshot(inp, 'snowball', 1);
    expect(at1.debts.medical.paidOff).toBe(true);
    expect(at1.clearedCount).toBe(1);
  });
});

describe('the clock', () => {
  it('statementMonth turns over when the month\'s interest is charged', () => {
    expect(statementMonth(0)).toBe(0);
    expect(statementMonth(0.19)).toBe(0);
    expect(statementMonth(0.2)).toBe(1);
    expect(statementMonth(1.19)).toBe(1);
    expect(statementMonth(1.2)).toBe(2);
    expect(statementMonth(32)).toBe(32);
    expect(statementMonth(-3)).toBe(0);
  });

  it('formats time plainly', () => {
    expect(formatDuration(32)).toBe('2 years, 8 months');
    expect(formatDuration(30)).toBe('2 years, 6 months');
    expect(formatDuration(24)).toBe('2 years');
    expect(formatDuration(1)).toBe('1 month');
    expect(formatDuration(4)).toBe('4 months');
    expect(yearMonthLabel(15.9)).toBe('Year 1, month 3');
    expect(wholeMonths(2.9999999999)).toBe(3);
  });

  it('names a ball: debt and rate', () => {
    expect(ballTag('card', 0.26)).toBe('Card 26%');
    expect(ballTag('car', 0.06)).toBe('Car 6%');
    expect(ballTag('medical', 0)).toBe('Medical 0%');
    expect(ballTag('car', 0.065)).toBe('Car 6.5%');
  });
});

describe('validation', () => {
  it('accepts the defaults', () => {
    expect(validateSnowInputs(D)).toEqual({ ok: true, errors: {} });
    expect(SNOW_FIELDS.length).toBe(10);
  });

  it('accepts a rate of 0 and the exact limits', () => {
    expect(validateSnowInputs(withDebt('card', { apr: 0 })).ok).toBe(true);
    const edge = clone(D);
    edge.debts.card = { balance: SNOW_LIMITS.balance.max, apr: SNOW_LIMITS.apr.max, minPayment: SNOW_LIMITS.minPayment.max };
    edge.budget = SNOW_LIMITS.budget.max;
    // 100,000 at 40% needs $3,334 a month just for the interest, and 5,000 covers it
    expect(validateSnowInputs(edge).ok).toBe(true);
  });

  it('rejects out-of-range and non-finite fields, one message each', () => {
    const r = validateSnowInputs({
      budget: 5,
      debts: {
        medical: { balance: 50, apr: 0, minPayment: 40 },
        car: { balance: 6000, apr: 0.9, minPayment: 180 },
        card: { balance: NaN, apr: 0.26, minPayment: 99999 },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors['budget']).toBe('The monthly budget must be between $30 and $20,000.');
    expect(r.errors['medical.balance']).toBe('The balance must be between $100 and $100,000.');
    expect(r.errors['car.apr']).toBe('The interest rate must be between 0% and 40%.');
    expect(r.errors['card.balance']).toBe('The balance must be a number.');
    expect(r.errors['card.minPayment']).toBe('The minimum payment must be between $10 and $5,000.');
    expect(r.errors['medical.apr']).toBeUndefined();
  });

  it('each minimum must cover its first month of interest', () => {
    const r = validateSnowInputs(withDebt('card', { minPayment: 250 }));
    expect(r.ok).toBe(false);
    expect(r.errors['card.minPayment']).toBe('The minimum payment must be at least $260 to cover the interest.');
    // exactly the interest is allowed
    expect(validateSnowInputs(withDebt('card', { minPayment: 260 })).ok).toBe(true);
    // rounded up to the whole dollar: $12,500 at 25% is $260.42 a month
    const odd = validateSnowInputs(withDebt('card', { balance: 12_500, apr: 0.25, minPayment: 260 }));
    expect(odd.errors['card.minPayment']).toBe('The minimum payment must be at least $261 to cover the interest.');
  });

  it('the budget must cover the three minimums', () => {
    const r = validateSnowInputs({ ...D, budget: 500 });
    expect(r.ok).toBe(false);
    expect(r.errors['budget']).toBe('The monthly budget must be at least $520, the three minimums.');
    expect(validateSnowInputs({ ...D, budget: 520 }).ok).toBe(true);
    // raising a minimum can push it over the budget
    const high = withDebt('car', { minPayment: 500 });
    expect(validateSnowInputs(high).errors['budget']).toBe('The monthly budget must be at least $840, the three minimums.');
    expect(sumMinimums(high)).toBe(840);
  });

  it('accepts anything without throwing', () => {
    for (const bad of [null, undefined, 3, 'x', {}, { budget: 800 }, { budget: 800, debts: {} }, { debts: { medical: null } }]) {
      const r = validateSnowInputs(bad);
      expect(r.ok).toBe(false);
      expect(Object.keys(r.errors).length).toBeGreaterThan(0);
    }
  });

  it('writes no em dashes or en dashes', () => {
    const r = validateSnowInputs({ budget: 1, debts: { medical: { balance: 1, apr: 2, minPayment: 3 } } });
    for (const msg of Object.values(r.errors)) {
      expect(msg).not.toMatch(/[—–]/);
    }
  });
});

describe('memoisation and determinism', () => {
  it('returns the same schedule object for the same inputs', () => {
    expect(strategySchedule(D, 'snowball')).toBe(strategySchedule(clone(D), 'snowball'));
  });

  it('is deterministic across many random valid inputs, and agrees with the reference simulation', () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let n = 0; n < 60; n++) {
      const inp = clone(D);
      for (const d of DEBTS) {
        const balance = 100 * Math.round(1 + rnd() * 200);
        const apr = Math.round(rnd() * 80) / 200;
        const minPayment = Math.ceil((balance * apr) / 12 + 10 + rnd() * 120);
        inp.debts[d] = { balance, apr, minPayment };
      }
      inp.budget = sumMinimums(inp) + Math.round(rnd() * 600);
      expect(validateSnowInputs(inp).ok).toBe(true);
      for (const id of ['snowball', 'avalanche'] as StrategyId[]) {
        const s = strategySchedule(inp, id);
        const r = reference(inp, id);
        expect(s.payoffMonth).toBe(r.months);
        expect(s.order).toEqual(r.prio);
        expect(s.totalInterest).toBeCloseTo(r.interestTotal, 6);
        DEBTS.forEach((d, j) => expect(s.clearedAt[d]).toBe(r.cleared[j]));
      }
    }
  });
});
