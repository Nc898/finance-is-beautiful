/**
 * "Brick by Brick" (a 15-year vs. a 30-year mortgage) — shared contract (coordinator-owned; workers must not change
 * these shapes without escalating). See docs/BRICK_SPEC.md.
 *
 * The idea: the same home is bought twice, with two loans for the same amount. Each house stands on its plot as a
 * pencil drawing (the part the lender still owns); every month's payment is a barrow of bricks: the interest part is
 * tipped into the lender's cart, which fills and trundles away, and the rest is laid on the walls. The painted
 * bricks are the part you own (the principal paid). Loan A (left, default 30 years) and loan B (right, default 15
 * years) differ only in their term and rate.
 */

export type LoanId = 'a' | 'b';
export const LOANS: readonly LoanId[] = ['a', 'b'] as const;

export interface LoanTerms {
  /** The term in whole years (1 … 40). */
  years: number;
  /** Annual rate (decimal: 0.065 = 6.5%). Interest each month = balance × apr / 12. */
  apr: number;
}

export interface BrickInputs {
  /** The amount borrowed in dollars, the same for both loans. */
  amount: number;
  loans: Record<LoanId, LoanTerms>;
}

export const DEFAULT_BRICK_INPUTS: BrickInputs = {
  amount: 300_000,
  loans: {
    a: { years: 30, apr: 0.065 },
    b: { years: 15, apr: 0.0575 },
  },
};

export const BRICK_LIMITS = {
  amount: { min: 10_000, max: 3_000_000, step: 5_000 },
  years: { min: 1, max: 40, step: 1 },
  apr: { min: 0, max: 0.15, step: 0.00125 },
} as const;

/** A lender's cart carries this share of the amount borrowed in interest ($100,000 on $300,000). */
export const CARTS_PER_AMOUNT = 3;

/** One month of a loan, as the month ends (dollars, full precision). */
export interface LoanRow {
  /** 1-based month number. */
  month: number;
  interest: number;
  /** The part of the payment that pays the loan down (builds the house). */
  principal: number;
  /** interest + principal (the fixed monthly payment; the last month's may be a little less). */
  payment: number;
  /** Still owed at the end of the month. */
  balance: number;
  interestToDate: number;
  principalToDate: number;
}

export interface LoanSchedule {
  id: LoanId;
  /** years × 12 */
  months: number;
  /** The fixed monthly payment (full precision): amount × r / (1 − (1 + r)^−n), r = apr / 12; amount / n at 0%. */
  payment: number;
  rows: LoanRow[];
  totalInterest: number;
  totalPaid: number;
  /** The first month whose principal is at least its interest (most of the payment builds the house), or null. */
  crossoverMonth: number | null;
  /** The first month the balance is at most half the amount (the house half built). */
  halfOwnedMonth: number;
}

/** One loan at one moment. Within month k (k … k+1) the smooth figures move linearly from the end of month k to
 *  the end of month k + 1; the statement figures step as a statement does (the engine's INTEREST_AT, PAYMENT_AT,
 *  as the vine). */
export interface LoanSnapshot {
  id: LoanId;
  month: number;
  /** Still owed, moving smoothly (what the house follows). */
  balance: number;
  /** Still owed as a statement shows it (the numbers on screen). */
  owed: number;
  /** Paid down so far, smooth: amount − balance. */
  principalPaid: number;
  /** Interest paid so far, smooth (what the carts follow). */
  interestPaid: number;
  /** Interest charged so far, statement (stepping). */
  interestCharged: number;
  /** This month's payment, interest and principal (0 once paid off). */
  payment: number;
  interest: number;
  principal: number;
  /** principalPaid / amount (0 … 1), smooth: how much of the house is built. */
  built: number;
  paidOff: boolean;
  /** For the whole schedule. */
  payoffMonth: number;
  totalInterest: number;
}

/**
 * Engine (src/brick/engine/index.ts), pure and unit-tested:
 *   loanSchedule(inputs, id): LoanSchedule          // memoised per inputs
 *   loanSnapshot(inputs, id, months: number): LoanSnapshot
 *   horizonMonths(inputs): number                   // the longer term, in months
 *   cartDollars(inputs): number                     // amount / CARTS_PER_AMOUNT
 *   statementMonth(months): number                  // the whole month the clock shows (as the vine)
 *   validateBrickInputs(raw): { ok; errors: Partial<Record<string, string>> }
 * Each month: interest = balance × apr / 12; principal = payment − interest (the last month: whatever is left, so
 * the balance ends at exactly 0); the loan is paid off after `months` payments.
 */

/* ---------------------------------------------------------------- scene contract */

/** What the scene needs to paint one house and its lender's carts. Both houses are the same house at the same
 *  scale (the same amount borrowed), so the same `built` looks the same on both plots. */
export interface HouseVisual {
  id: LoanId;
  /** principal paid / amount (0 … 1), smooth: the share of the house painted in (walls course by course, then the
   *  roof, then the chimney; see BUILD in scene/geom.ts). Painted area is proportional to it. */
  built: number;
  /** Interest paid so far (smooth) / cartDollars: 3.42 = three full carts gone to the lender and the fourth 42% full. */
  carts: number;
  /** This month's interest / this month's payment (0 … 1): the share of each barrow load tipped into the cart.
   *  0 once paid off. */
  split: number;
  /** Every payment made: the house is finished, the scaffold comes down, the crew rests, the carter leaves. */
  paidOff: boolean;
}

export interface BrickFrame {
  /** Wall-clock ms: decorative motion (petals, the crew's and the carters' movement). */
  timeMs: number;
  /** Months passing per second right now (0 when paused or scrubbing). */
  monthsPerSecond: number;
  /** Playback speed while playing (1 when paused): the crew's work runs at it (as the vine's gardeners). */
  speed?: number;
  houses: [HouseVisual, HouseVisual];
  reducedMotion: boolean;
}

export interface BrickScreenPoint {
  x: number;
  y: number;
}

export interface BrickSceneAPI {
  ready: Promise<void>;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  /** CSS-px bands reserved for header/notes (top), the labels (bottom) and the side panel (side). */
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: BrickFrame): void;
  /** Top centre of a house's label, in the bottom band under its plot, as of the last frame (CSS px). */
  labelAnchor(id: LoanId): BrickScreenPoint;
  destroy(): void;
}

/** Implemented in src/brick/scene/index.ts: createBrickScene(canvas: HTMLCanvasElement): BrickSceneAPI */
