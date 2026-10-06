import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, SCALE_FLOOR, buildScenario, maturityFor, visualScaleFor } from '../src/engine';

describe('visualScaleFor', () => {
  it('equals the larger final balance for the default scenario', () => {
    const sc = buildScenario(DEFAULT_INPUTS);
    const finalA = sc.a.balance[sc.a.months];
    const finalB = sc.b.balance[sc.b.months];
    expect(finalA).toBeGreaterThan(finalB);
    expect(visualScaleFor(sc)).toBe(finalA);
  });
  it('applies the floor when balances are tiny', () => {
    const sc = buildScenario({ ...DEFAULT_INPUTS, monthlyContribution: 25, startAgeA: 60, startAgeB: 62 });
    expect(sc.a.balance[sc.a.months]).toBeLessThan(SCALE_FLOOR);
    expect(visualScaleFor(sc)).toBe(SCALE_FLOOR);
  });
  it('is the floor when there is no investment at all', () => {
    const sc = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 65, startAgeB: 65 });
    expect(visualScaleFor(sc)).toBe(SCALE_FLOOR);
  });
  it('uses B when B is larger than A', () => {
    // A starts later than B here (inputs allow either order).
    const sc = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 40, startAgeB: 25 });
    expect(visualScaleFor(sc)).toBe(sc.b.balance[sc.b.months]);
  });
  it('is 25,000', () => {
    expect(SCALE_FLOOR).toBe(25_000);
  });
});

describe('maturityFor', () => {
  const scale = 100_000;

  it('is monotonic non-decreasing over a sweep of balances', () => {
    let prev = -1;
    for (let b = -1000; b <= 300_000; b += 250) {
      const m = maturityFor(b, scale);
      expect(m).toBeGreaterThanOrEqual(prev);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
      prev = m;
    }
  });
  it('strictly increases below the scale', () => {
    expect(maturityFor(20_000, scale)).toBeLessThan(maturityFor(30_000, scale));
  });
  it('is 1 at and above the scale, and area-proportional below it', () => {
    expect(maturityFor(scale, scale)).toBe(1);
    expect(maturityFor(scale * 5, scale)).toBe(1);
    expect(maturityFor(scale / 4, scale)).toBeCloseTo(0.5, 12);
    // size² ∝ balance
    expect(maturityFor(40_000, scale) ** 2).toBeCloseTo(0.4, 12);
  });
  it('is 0 for zero or negative balance', () => {
    expect(maturityFor(0, scale)).toBe(0);
    expect(maturityFor(-500, scale)).toBe(0);
  });
  it('is 0 for an invalid scale', () => {
    expect(maturityFor(1000, 0)).toBe(0);
    expect(maturityFor(1000, -5)).toBe(0);
    expect(maturityFor(1000, NaN)).toBe(0);
    expect(maturityFor(1000, Infinity)).toBe(0);
  });
  it('gives the larger final balance maturity 1 in a scenario', () => {
    const sc = buildScenario(DEFAULT_INPUTS);
    const scaleS = visualScaleFor(sc);
    expect(maturityFor(sc.a.balance[sc.a.months], scaleS)).toBe(1);
    const mB = maturityFor(sc.b.balance[sc.b.months], scaleS);
    expect(mB).toBeGreaterThan(0);
    expect(mB).toBeLessThan(1);
  });
  it('uses the same scale for both trees (same balance => same maturity)', () => {
    const sc = buildScenario({ ...DEFAULT_INPUTS, startAgeA: 30, startAgeB: 30 });
    const s = visualScaleFor(sc);
    expect(maturityFor(sc.a.balance[sc.a.months], s)).toBe(maturityFor(sc.b.balance[sc.b.months], s));
  });
  it('floors small scenarios below full maturity', () => {
    const sc = buildScenario({ ...DEFAULT_INPUTS, monthlyContribution: 25, startAgeA: 60, startAgeB: 62 });
    const s = visualScaleFor(sc);
    expect(maturityFor(sc.a.balance[sc.a.months], s)).toBeLessThan(1);
  });
});
