/**
 * "On a Roll" (snowball vs. avalanche) — shared contract (coordinator-owned; workers must not change these shapes
 * without escalating). See docs/SNOW_SPEC.md.
 *
 * The idea: each debt is a snowball on a winter hillside. Interest is snow settling on it every month, so it grows;
 * every payment shrinks it. The balls wait at the top of the hill; the climber pushes the debt getting the extra off
 * the top, and it rolls down its lane as it is paid off, shedding snow as it goes. Two hillsides start with the same three
 * debts and the same monthly budget. Both pay every minimum and put everything left over on one target debt, and
 * when a debt is cleared its payment rolls on to the next. The left hill ("Snowball") targets the smallest balance
 * first; the right hill ("Avalanche") the highest interest rate first.
 */

export type StrategyId = 'snowball' | 'avalanche';
export const STRATEGIES: readonly StrategyId[] = ['snowball', 'avalanche'] as const;

/** The three debts, in lane order on both hills (lane 0 is the outermost, nearest the edge of the picture). */
export type DebtId = 'medical' | 'car' | 'card';
export const DEBTS: readonly DebtId[] = ['medical', 'car', 'card'] as const;

export interface Debt {
  /** Starting balance in dollars (> 0). */
  balance: number;
  /** Annual percentage rate (decimal: 0.26 = 26%). Interest each month = balance × apr / 12. */
  apr: number;
  /** The fixed minimum payment each month in dollars (must cover the first month's interest). */
  minPayment: number;
}

export interface SnowInputs {
  debts: Record<DebtId, Debt>;
  /** The whole monthly budget in dollars, the same for both strategies; at least the sum of the minimums. */
  budget: number;
}

export const DEFAULT_SNOW_INPUTS: SnowInputs = {
  debts: {
    medical: { balance: 1_000, apr: 0, minPayment: 40 },
    car: { balance: 6_000, apr: 0.06, minPayment: 180 },
    card: { balance: 12_000, apr: 0.26, minPayment: 300 },
  },
  budget: 800,
};

export const SNOW_LIMITS = {
  balance: { min: 100, max: 100_000, step: 100 },
  apr: { min: 0, max: 0.4, step: 0.005 },
  minPayment: { min: 10, max: 5_000, step: 5 },
  budget: { min: 30, max: 20_000, step: 10 },
} as const;

/** Simulations stop here even if a debt is not cleared (60 years). */
export const MAX_MONTHS = 720;

/** One debt in one month, as the month ends (dollars, full precision). */
export interface DebtMonth {
  interest: number;
  /** Paid on this debt this month: its minimum, plus any of the extra it received, capped at what is owed. */
  payment: number;
  /** Owed at the end of the month: start + interest − payment. */
  balance: number;
}

export interface MonthRow {
  /** 1-based month number. */
  month: number;
  debts: Record<DebtId, DebtMonth>;
  /** The debt that received the extra this month (the first in the order still owed at the start), or null. */
  target: DebtId | null;
}

export interface StrategySchedule {
  id: StrategyId;
  /** The order the extra goes in, fixed at the start (snowball: smallest starting balance first, ties by higher
   *  rate; avalanche: highest rate first, ties by smaller balance). */
  order: DebtId[];
  rows: MonthRow[];
  /** The month each debt is cleared (its balance under half a cent), or null if never within MAX_MONTHS. */
  clearedAt: Record<DebtId, number | null>;
  /** Months until every debt is cleared (rows.length), or MAX_MONTHS if one never is. */
  payoffMonth: number;
  cleared: boolean;
  /** The first month any debt is cleared (the first win), or null. */
  firstWin: number | null;
  totalInterest: number;
  totalPaid: number;
}

/** One debt at one moment. Within month k (k … k+1) the smooth figures move linearly from the end of month k to
 *  the end of month k + 1; the statement figures step as a statement does (see the engine's INTEREST_AT, PAYMENT_AT). */
export interface DebtSnapshot {
  id: DebtId;
  /** Still owed, moving smoothly (what the ball's size and place follow). */
  balance: number;
  /** Still owed as a statement shows it (the numbers on screen). */
  owed: number;
  /** Interest charged on this debt so far (statement, stepping). */
  interestCharged: number;
  /** This month's interest and payment on this debt (0 once cleared). */
  interest: number;
  payment: number;
  paidOff: boolean;
}

export interface StrategySnapshot {
  id: StrategyId;
  month: number;
  debts: Record<DebtId, DebtSnapshot>;
  /** The debt getting the extra right now, or null once all are cleared. */
  target: DebtId | null;
  /** All debts together, statement figures. */
  owed: number;
  interestCharged: number;
  /** How many debts are cleared so far. */
  clearedCount: number;
  paidOff: boolean;
  /** For the whole schedule. */
  payoffMonth: number;
  totalInterest: number;
}

/**
 * Engine (src/snow/engine/index.ts), pure and unit-tested:
 *   strategyOrder(inputs, id): DebtId[]
 *   strategySchedule(inputs, id): StrategySchedule     // memoised per inputs
 *   strategySnapshot(inputs, id, month: number): StrategySnapshot
 *   horizonMonths(inputs): number                       // the later payoff month of the two strategies
 *   statementMonth(months): number                      // the whole month the clock shows (as the vine)
 *   validateSnowInputs(raw): { ok; errors: Partial<Record<string, string>> }
 * Each month: interest on every debt still owed; then every minimum (capped at what is owed); then whatever is
 * left of the budget goes to the debts in `order`, cascading when one clears mid-month.
 */

/* ---------------------------------------------------------------- scene contract */

/** What the scene needs to paint one snowball. Sizes are fractions of the LARGEST starting balance of the three
 *  (the same scale on both hills), so the same debt looks the same on both hills at the same balance. */
export interface BallVisual {
  id: DebtId;
  /** balance / largest starting balance (0 … ~1.2). The ball's painted AREA is proportional to it. */
  size: number;
  /**
   * How far down its lane (0 = waiting at the top, 1 = at the foot). A ball waits at the top until it first gets the
   * extra (its minimums only shrink it there); from then it rolls: 1 − balance / its balance when it started to get
   * the extra, clamped 0 … 1. A debt cleared by its minimums alone is cleared at the top (progress 0).
   */
  progress: number;
  /** Its place in the hill's order among the debts still owed: 0 = the target (being rolled), 1 = next, …; −1 cleared. */
  queue: number;
  /** This month's interest on this debt / largest starting balance (per month): how thickly snow settles on it. */
  snowfall: number;
  /** This month's payment on this debt / largest starting balance (per month): how fast it is rolling. */
  rolling: number;
  /** The debt getting the extra: the climber pushes this one. */
  target: boolean;
  /** Cleared: the ball has broken up in the snowbank at the foot of its lane. */
  paidOff: boolean;
}

export interface HillVisual {
  id: StrategyId;
  balls: [BallVisual, BallVisual, BallVisual];
  /** Every debt cleared: the climber rests. */
  paidOff: boolean;
}

export interface SnowFrame {
  /** Wall-clock ms: decorative motion (snowfall, the climbers' movement). */
  timeMs: number;
  /** Months passing per second right now (0 when paused or scrubbing). */
  monthsPerSecond: number;
  /** Playback speed while playing (1 when paused): the climbers' work runs at it (as the vine's gardeners). */
  speed?: number;
  hills: [HillVisual, HillVisual];
  reducedMotion: boolean;
  /** Optional opening camera move: zoom ≥ 1 about a focus. */
  camera?: { zoom: number; focus: StrategyId | 'both' };
}

export interface SnowScreenPoint {
  x: number;
  y: number;
}

export interface SnowSceneAPI {
  ready: Promise<void>;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  /** CSS-px bands reserved for header/caption (top), the foot (bottom) and the side panel (side). */
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: SnowFrame): void;
  /** Screen point above a hill's crest (for its label), as of the last frame (camera applied). */
  labelAnchor(id: StrategyId): SnowScreenPoint;
  /** Screen point just above a ball (for its small name tag), as of the last frame. Follows the ball. */
  ballAnchor(id: StrategyId, debt: DebtId): SnowScreenPoint;
  /** The last frame's camera move as screen' = a * screen + (bx, by) (identity when not zoomed). */
  cameraTransform(): { a: number; bx: number; by: number };
  destroy(): void;
}

/** Implemented in src/snow/scene/index.ts: createSnowScene(canvas: HTMLCanvasElement): SnowSceneAPI */
