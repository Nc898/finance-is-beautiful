import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INPUTS,
  LIMITS,
  buildScenario,
  formatCurrency,
  formatPercent,
  monthlyRateFromAnnual,
  simulateTree,
  snapshotAt,
  validateInputs,
  type Inputs,
} from '../src/engine';

/** Independent oracle: future value of an ordinary annuity, FV = PMT·((1+i)^n − 1)/i. */
function annuityFV(pmt: number, annual: number, n: number): number {
  const i = Math.pow(1 + annual, 1 / 12) - 1;
  if (i === 0) return pmt * n;
  return (pmt * (Math.pow(1 + i, n) - 1)) / i;
}

/** Relative closeness (absolute fallback near zero). */
function relClose(actual: number, expected: number, tol = 1e-9): void {
  const scale = Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected) / scale).toBeLessThan(tol);
}

const withInputs = (over: Partial<Inputs>): Inputs => ({ ...DEFAULT_INPUTS, ...over });

describe('monthlyRateFromAnnual', () => {
  it('compounds 12 times back to the annual rate', () => {
    const i = monthlyRateFromAnnual(0.06);
    expect(Math.abs(Math.pow(1 + i, 12) - 1.06)).toBeLessThan(1e-12);
  });
  it('is 0 for 0%', () => {
    expect(monthlyRateFromAnnual(0)).toBe(0);
  });
  it('is negative for a negative return', () => {
    expect(monthlyRateFromAnnual(-0.05)).toBeLessThan(0);
  });
});

describe('zero return', () => {
  it('balance == contributed == 200 × k at every month', () => {
    const s = simulateTree('A', 25, 65, 200, 0);
    expect(s.months).toBe(480);
    for (let k = 0; k <= s.months; k++) {
      expect(s.balance[k]).toBe(200 * k);
      expect(s.contributed[k]).toBe(200 * k);
    }
  });
});

describe('identical starting ages', () => {
  it('produces identical A and B series', () => {
    const sc = buildScenario(withInputs({ startAgeA: 30, startAgeB: 30 }));
    expect(sc.a.months).toBe(sc.b.months);
    expect(Array.from(sc.a.balance)).toEqual(Array.from(sc.b.balance));
    expect(Array.from(sc.a.contributed)).toEqual(Array.from(sc.b.contributed));
  });
});

describe('zero contributions', () => {
  it.each([-0.05, 0, 0.06, 0.12])('all balances are 0 at return %s', (r) => {
    const s = simulateTree('A', 25, 65, 0, r);
    expect(s.balance.every((v) => v === 0)).toBe(true);
    expect(s.contributed.every((v) => v === 0)).toBe(true);
  });
});

describe('no investment duration (start == end)', () => {
  const sc = buildScenario(withInputs({ startAgeA: 65, startAgeB: 65, endAge: 65 }));
  it('has zero months and a zero final balance', () => {
    expect(sc.a.months).toBe(0);
    expect(sc.b.months).toBe(0);
    expect(sc.a.balance.length).toBe(1);
    expect(sc.a.balance[0]).toBe(0);
  });
  it('is never planted', () => {
    for (const age of [0, 600, 780, 781, 5000]) {
      for (const mode of ['exact', 'smooth'] as const) {
        const snap = snapshotAt(sc.a, age, mode);
        expect(snap.planted).toBe(false);
        expect(snap.balance).toBe(0);
        expect(snap.contributionsMade).toBe(0);
      }
    }
  });
  it('validates ok', () => {
    expect(validateInputs(withInputs({ startAgeA: 65, startAgeB: 65, endAge: 65 })).ok).toBe(true);
  });
});

describe('known nonzero example: $100/month at 12% effective for 12 months', () => {
  const s = simulateTree('A', 30, 31, 100, 0.12);
  const i = Math.pow(1.12, 1 / 12) - 1;

  it('has 12 months and (1+i)^12 = 1.12', () => {
    expect(s.months).toBe(12);
    expect(Math.abs(Math.pow(1 + i, 12) - 1.12)).toBeLessThan(1e-12);
  });
  it('final balance = 100 × 0.12 / i ≈ 1264.65', () => {
    relClose(s.balance[12], (100 * 0.12) / i);
    expect(s.balance[12]).toBeCloseTo(1264.65, 1);
    expect(s.contributed[12]).toBe(1200);
  });
  it('first three months match hand computation', () => {
    expect(s.balance[0]).toBe(0);
    expect(s.balance[1]).toBe(100);
    relClose(s.balance[2], 100 * (1 + i) + 100, 1e-12);
    relClose(s.balance[3], 100 * (1 + i) * (1 + i) + 100 * (1 + i) + 100, 1e-12);
  });
});

describe('default comparison (25 / 35 / 65, $200, 6%)', () => {
  const sc = buildScenario(DEFAULT_INPUTS);
  const finalA = sc.a.balance[sc.a.months];
  const finalB = sc.b.balance[sc.b.months];

  it('has the right number of contributions and totals', () => {
    expect(sc.a.months).toBe(480);
    expect(sc.b.months).toBe(360);
    expect(sc.a.contributed[480]).toBe(96_000);
    expect(sc.b.contributed[360]).toBe(72_000);
  });
  it('matches the closed form', () => {
    relClose(finalA, annuityFV(200, 0.06, 480));
    relClose(finalB, annuityFV(200, 0.06, 360));
  });
  it('matches the closed form at every month', () => {
    for (let k = 0; k <= 480; k += 17) relClose(sc.a.balance[k], annuityFV(200, 0.06, k));
  });
  it('difference, extra contributions, and growth', () => {
    const diff = finalA - finalB;
    const growthA = finalA - 96_000;
    const growthB = finalB - 72_000;
    // eslint-disable-next-line no-console
    console.log(
      'DEFAULT CASE',
      JSON.stringify({
        finalA,
        finalB,
        difference: diff,
        contributedA: 96_000,
        contributedB: 72_000,
        extraContributions: 24_000,
        growthA,
        growthB,
        formatted: {
          A: formatCurrency(finalA),
          B: formatCurrency(finalB),
          difference: formatCurrency(diff),
          growthA: formatCurrency(growthA),
          growthB: formatCurrency(growthB),
        },
      }),
    );
    relClose(diff, annuityFV(200, 0.06, 480) - annuityFV(200, 0.06, 360));
    expect(sc.a.contributed[480] - sc.b.contributed[360]).toBe(24_000);
    expect(growthA).toBeGreaterThan(growthB);
    expect(growthA).toBeGreaterThan(0);
  });
  it('sets timeline bounds and monthly rate', () => {
    expect(sc.timelineStartMonths).toBe(300);
    expect(sc.timelineEndMonths).toBe(780);
    expect(sc.monthlyRate).toBe(monthlyRateFromAnnual(0.06));
  });
  it('does not mutate or alias the inputs', () => {
    const inputs = { ...DEFAULT_INPUTS };
    const built = buildScenario(inputs);
    expect(inputs).toEqual(DEFAULT_INPUTS);
    expect(built.inputs).not.toBe(inputs);
    expect(built.inputs).toEqual(inputs);
  });
});

describe('negative return (−5%)', () => {
  const sc = buildScenario(withInputs({ annualReturn: -0.05 }));
  it('balance is below contributed but positive', () => {
    const k = 480;
    expect(sc.a.balance[k]).toBeLessThan(sc.a.contributed[k]);
    expect(sc.a.balance[k]).toBeGreaterThan(0);
    relClose(sc.a.balance[k], annuityFV(200, -0.05, 480));
    const snap = snapshotAt(sc.a, 65 * 12, 'exact');
    expect(snap.growth).toBeLessThan(0);
    expect(snap.growth).toBeCloseTo(snap.balance - snap.contributed, 9);
  });
});

describe('snapshotAt', () => {
  const sc = buildScenario(DEFAULT_INPUTS);
  const A = sc.a;
  const startM = 25 * 12;
  const endM = 65 * 12;

  it('before start: not planted, all zeros', () => {
    const s = snapshotAt(A, startM - 1, 'exact');
    expect(s).toEqual({
      id: 'A',
      planted: false,
      monthsElapsed: 0,
      contributionsMade: 0,
      balance: 0,
      contributed: 0,
      growth: 0,
    });
    expect(snapshotAt(A, startM - 0.5, 'smooth').planted).toBe(false);
  });
  it('exactly at start: planted with balance 0', () => {
    const s = snapshotAt(A, startM, 'exact');
    expect(s.planted).toBe(true);
    expect(s.balance).toBe(0);
    expect(s.contributionsMade).toBe(0);
    expect(s.monthsElapsed).toBe(0);
  });
  it('at start + 1 month: 200', () => {
    const s = snapshotAt(A, startM + 1, 'exact');
    expect(s.balance).toBe(200);
    expect(s.contributed).toBe(200);
    expect(s.growth).toBe(0);
    expect(s.contributionsMade).toBe(1);
  });
  it('at endAge: final values', () => {
    const s = snapshotAt(A, endM, 'exact');
    expect(s.balance).toBe(A.balance[480]);
    expect(s.contributionsMade).toBe(480);
    expect(s.monthsElapsed).toBe(480);
    relClose(s.balance, annuityFV(200, 0.06, 480));
  });
  it('past the end: clamped to final', () => {
    for (const mode of ['exact', 'smooth'] as const) {
      const s = snapshotAt(A, endM + 100, mode);
      expect(s.balance).toBe(A.balance[480]);
      expect(s.contributed).toBe(96_000);
      expect(s.monthsElapsed).toBe(480);
      expect(s.contributionsMade).toBe(480);
    }
  });
  it('tree B is not planted until its own start', () => {
    expect(snapshotAt(sc.b, 34 * 12 + 11, 'exact').planted).toBe(false);
    expect(snapshotAt(sc.b, 35 * 12, 'exact').planted).toBe(true);
    expect(snapshotAt(sc.b, 35 * 12 + 1, 'exact').balance).toBe(200);
  });
  it("mid-month: 'exact' floors, 'smooth' interpolates", () => {
    const exact = snapshotAt(A, startM + 2.5, 'exact');
    expect(exact.balance).toBe(A.balance[2]);
    expect(exact.contributionsMade).toBe(2);
    expect(exact.monthsElapsed).toBeCloseTo(2.5, 12);

    const smooth = snapshotAt(A, startM + 2.5, 'smooth');
    expect(smooth.contributionsMade).toBe(2);
    relClose(smooth.balance, (A.balance[2] + A.balance[3]) / 2, 1e-12);
    relClose(smooth.contributed, 500, 1e-12);
    expect(smooth.balance).toBeGreaterThan(exact.balance);
    expect(smooth.balance).toBeLessThan(A.balance[3]);
  });
  it('smooth equals exact at whole months', () => {
    for (const k of [0, 1, 100, 479, 480]) {
      expect(snapshotAt(A, startM + k, 'smooth').balance).toBe(snapshotAt(A, startM + k, 'exact').balance);
    }
  });
  it('float ages like (25 + 7/12) × 12 resolve to month 7', () => {
    const age = (25 + 7 / 12) * 12;
    const s = snapshotAt(A, age, 'exact');
    expect(s.contributionsMade).toBe(7);
    expect(s.balance).toBe(A.balance[7]);
    // Sweep: every month computed via float arithmetic lands on the right index.
    for (let k = 0; k <= 480; k++) {
      const ageMonths = (25 + k / 12) * 12;
      expect(snapshotAt(A, ageMonths, 'exact').contributionsMade).toBe(k);
    }
    // Explicit noise on either side of month 7 resolves to month 7.
    expect(snapshotAt(A, 307 - 1e-11, 'exact').contributionsMade).toBe(7);
    expect(snapshotAt(A, 307 + 1e-11, 'exact').contributionsMade).toBe(7);
    // Float-noisy age slightly below the start still counts as planted.
    expect(snapshotAt(A, (25 + 0 / 12) * 12 - 1e-12, 'exact').planted).toBe(true);
  });
  it('is deterministic', () => {
    const a = snapshotAt(A, 400.37, 'smooth');
    const b = snapshotAt(A, 400.37, 'smooth');
    expect(a).toEqual(b);
    expect(buildScenario(DEFAULT_INPUTS).a.balance).toEqual(A.balance);
  });
  it('growth = balance − contributed', () => {
    const s = snapshotAt(A, startM + 123, 'exact');
    expect(s.growth).toBe(s.balance - s.contributed);
    expect(s.growth).toBeGreaterThan(0);
  });
});

describe('validateInputs', () => {
  it('accepts the defaults', () => {
    expect(validateInputs(DEFAULT_INPUTS)).toEqual({ ok: true, errors: {} });
  });
  it('accepts the limit extremes', () => {
    expect(validateInputs(withInputs({ startAgeA: 16, startAgeB: 16, endAge: 90, monthlyContribution: 0, annualReturn: -0.05 })).ok).toBe(true);
    expect(validateInputs(withInputs({ startAgeA: 90, startAgeB: 90, endAge: 90, monthlyContribution: 5000, annualReturn: 0.12 })).ok).toBe(true);
  });
  it('tolerates float noise on the return limits', () => {
    expect(validateInputs(withInputs({ annualReturn: 0.12 + 1e-13 })).ok).toBe(true);
    expect(validateInputs(withInputs({ annualReturn: -0.05 - 1e-13 })).ok).toBe(true);
    expect(validateInputs(withInputs({ annualReturn: 0.12 + 1e-6 })).errors.annualReturn).toBeTruthy();
  });
  it('does not enforce the contribution step', () => {
    expect(validateInputs(withInputs({ monthlyContribution: 37.5 })).ok).toBe(true);
  });
  it('rejects NaN, Infinity and non-numbers on each field', () => {
    const fields = ['startAgeA', 'startAgeB', 'endAge', 'monthlyContribution', 'annualReturn'] as const;
    for (const f of fields) {
      for (const bad of [NaN, Infinity, -Infinity, '25', null, undefined]) {
        const r = validateInputs({ ...DEFAULT_INPUTS, [f]: bad } as any);
        expect(r.ok).toBe(false);
        expect(r.errors[f]).toMatch(/number/);
        expect(Object.keys(r.errors)).toEqual([f]);
      }
    }
  });
  it('rejects fractional and out-of-range ages', () => {
    expect(validateInputs(withInputs({ startAgeA: 25.5 })).errors.startAgeA).toMatch(/whole number/);
    expect(validateInputs(withInputs({ startAgeB: 15 })).errors.startAgeB).toMatch(/between 16 and 90/);
    expect(validateInputs(withInputs({ endAge: 91 })).errors.endAge).toMatch(/between 16 and 90/);
  });
  it('rejects a start age after the end age', () => {
    const r = validateInputs(withInputs({ startAgeA: 66 }));
    expect(r.ok).toBe(false);
    expect(r.errors.startAgeA).toBe("Tree A's starting age must be at or before the ending age (65).");
    expect(r.errors.startAgeB).toBeUndefined();
    const r2 = validateInputs(withInputs({ startAgeB: 70 }));
    expect(r2.errors.startAgeB).toBe("Tree B's starting age must be at or before the ending age (65).");
  });
  it('rejects out-of-range contribution and return', () => {
    expect(validateInputs(withInputs({ monthlyContribution: -1 })).errors.monthlyContribution).toBeTruthy();
    expect(validateInputs(withInputs({ monthlyContribution: LIMITS.contribution.max + 1 })).errors.monthlyContribution).toBeTruthy();
    expect(validateInputs(withInputs({ annualReturn: -0.06 })).errors.annualReturn).toBeTruthy();
    expect(validateInputs(withInputs({ annualReturn: 0.13 })).errors.annualReturn).toBeTruthy();
  });
  it('buildScenario throws RangeError with joined messages', () => {
    const bad = withInputs({ startAgeA: 70, monthlyContribution: -5 });
    expect(() => buildScenario(bad)).toThrow(RangeError);
    try {
      buildScenario(bad);
    } catch (e) {
      expect((e as Error).message).toContain("Tree A's starting age");
      expect((e as Error).message).toContain('monthly contribution');
    }
  });
});

describe('performance', () => {
  it('buildScenario over the max range averages under 5 ms', () => {
    const inputs = withInputs({ startAgeA: 16, startAgeB: 16, endAge: 90 });
    buildScenario(inputs); // warm up
    const runs = 100;
    const t0 = performance.now();
    for (let n = 0; n < runs; n++) buildScenario(inputs);
    const avg = (performance.now() - t0) / runs;
    expect(avg).toBeLessThan(5);
  });
});

describe('format', () => {
  it('formatCurrency rounds only at display time, no cents', () => {
    expect(formatCurrency(381534.4)).toBe('$381,534');
    expect(formatCurrency(381534.6)).toBe('$381,535');
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(1234567)).toBe('$1,234,567');
  });
  it('formatCurrency uses a true minus sign for negatives', () => {
    expect(formatCurrency(-1234)).toBe('−$1,234');
    expect(formatCurrency(-0.2)).toBe('$0');
  });
  it('formatPercent', () => {
    expect(formatPercent(0.06)).toBe('6%');
    expect(formatPercent(0.065)).toBe('6.5%');
    expect(formatPercent(-0.02)).toBe('−2%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.12)).toBe('12%');
    expect(formatPercent(-0.05)).toBe('−5%');
    expect(formatPercent(0.005)).toBe('0.5%');
  });
});
