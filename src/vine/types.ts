/**
 * "Nip It in the Bud" (the vine) — shared contract (coordinator-owned; workers must not change these shapes
 * without escalating).
 *
 * The idea: a credit card balance is a vine on a cottage wall. Every month interest grows it back a little,
 * and every payment is a gardener pruning it. Two cottages start with the same vine (the same balance at the
 * same rate). The left gardener pays only the card's minimum each month; the right one pays a fixed amount.
 * The vine left on the wall is the balance still owed; the pile of raked clippings beside each cottage is the
 * interest paid so far (the regrowth that had to be cut again).
 */

export type PlanId = 'minimum' | 'fixed';
export const PLANS: readonly PlanId[] = ['minimum', 'fixed'] as const;

export interface VineInputs {
  /** Starting card balance in dollars (> 0), shared by both cottages. */
  balance: number;
  /** Annual percentage rate (decimal: 0.22 = 22%). Interest each month = balance × apr / 12. */
  apr: number;
  /** The right cottage's fixed monthly payment in dollars (never less than the minimum due; see engine). */
  fixedPayment: number;
  /** Minimum payment rule: interest + minPercent × balance (decimal: 0.01 = 1%) ... */
  minPercent: number;
  /** ... but never less than this many dollars (or the whole remaining balance, if that is smaller). */
  minFloor: number;
}

export const DEFAULT_VINE_INPUTS: VineInputs = {
  balance: 5_000,
  apr: 0.22,
  fixedPayment: 200,
  minPercent: 0.01,
  minFloor: 25,
};

export const VINE_LIMITS = {
  balance: { min: 100, max: 100_000, step: 100 },
  apr: { min: 0, max: 0.4, step: 0.005 },
  fixedPayment: { min: 10, max: 20_000, step: 10 },
  minPercent: { min: 0.005, max: 0.05, step: 0.005 },
  minFloor: { min: 0, max: 500, step: 5 },
} as const;

/** Simulations stop here even if a balance is not cleared (60 years). */
export const MAX_MONTHS = 720;

/** One month of a plan, as it ends (dollars, full precision). */
export interface MonthRow {
  /** 1-based month number. */
  month: number;
  /** Interest charged this month: balance at the start × apr / 12. */
  interest: number;
  /** Paid this month: the plan's rule, capped at what is owed (the last payment is usually smaller). */
  payment: number;
  /** Owed at the end of the month: start + interest − payment. */
  balance: number;
}

export interface PlanSchedule {
  id: PlanId;
  rows: MonthRow[];
  /** Months until the balance is cleared (rows.length), or MAX_MONTHS if it never is. */
  payoffMonth: number;
  /** False only if MAX_MONTHS passed with money still owed. */
  cleared: boolean;
  totalInterest: number;
  totalPaid: number;
}

/**
 * One plan at one moment. `month` may be fractional: within month k (from k to k+1) every running total moves
 * linearly from its value at the end of month k to its value at the end of month k+1, so the vine and the pile
 * change smoothly. Round only for display.
 */
export interface PlanSnapshot {
  id: PlanId;
  month: number;
  /** Still owed, moving smoothly across the month (what the vine follows). */
  balance: number;
  /**
   * Still owed as a statement shows it, for the numbers on screen: it steps up when the month's interest is charged
   * and down when the payment lands (never a steady slide).
   */
  owed: number;
  /** Interest paid so far, moving smoothly (the pile follows it). */
  interestPaid: number;
  /** Interest charged so far, stepping up as each month's interest is charged (for the numbers on screen). */
  interestCharged: number;
  /** Principal paid so far (balance cleared). */
  principalPaid: number;
  /** All payments so far (principal + interest). */
  totalPaid: number;
  /** The payment of the month in progress (0 once cleared). */
  payment: number;
  /** The interest of the month in progress (0 once cleared). */
  interest: number;
  paidOff: boolean;
  /** For the whole schedule (the same at every month). */
  payoffMonth: number;
  totalInterest: number;
}

/**
 * Engine (src/vine/engine/index.ts), pure and unit-tested:
 *   minimumDue(balance, inputs): number            // max(minFloor, interest + minPercent × balance), ≤ owed + interest
 *   planSchedule(inputs, id): PlanSchedule           // memoised per inputs
 *   planSnapshot(inputs, id, month: number): PlanSnapshot
 *   horizonMonths(inputs): number                    // the later payoff month of the two plans
 *   validateVineInputs(raw): { ok; errors: Partial<Record<keyof VineInputs, string>> }
 * The fixed plan pays max(fixedPayment, minimum due) each month, as a card would require.
 */

/* ---------------------------------------------------------------- scene contract */

/** What the scene needs to paint one cottage. All amounts are fractions of the STARTING balance, so both
 *  cottages share one scale and the comparison stays honest. */
export interface CottageVisual {
  id: PlanId;
  /** The vine still on the wall: balance / starting balance, 0…1. */
  vine: number;
  /** How fast the vine grows back right now: this month's interest / starting balance (per month). */
  regrowth: number;
  /** How fast it is being cut: this month's payment / starting balance (per month). Paces the gardener. */
  pruning: number;
  /** The pile of raked clippings: interest paid so far / starting balance (may exceed 1, e.g. 1.62). */
  pile: number;
  /** Cleared: the gardener puts the shears away and rests. */
  paidOff: boolean;
}

export interface VineFrame {
  /** Wall-clock ms: decorative motion only (wind, falling leaves, smoke, the gardeners' movement). */
  timeMs: number;
  /** Months passing per second right now (0 when paused or scrubbing). The scene paces the work from it. */
  monthsPerSecond: number;
  cottages: [CottageVisual, CottageVisual];
  reducedMotion: boolean;
  /** Optional opening camera move: zoom ≥ 1 about a focus (a cottage's vine, or the middle of both). */
  camera?: { zoom: number; focus: PlanId | 'both' };
}

export interface VineScreenPoint {
  x: number;
  y: number;
}

export interface VineSceneAPI {
  ready: Promise<void>;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  /** CSS-px bands reserved for header/caption (top), labels (bottom) and the side panel (side, as in the river). */
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: VineFrame): void;
  /** Screen point just above a cottage's roof ridge (for its label), as of the last frame (camera applied). */
  labelAnchor(id: PlanId): VineScreenPoint;
  /** Screen point just above a cottage's clippings pile (for its "in interest" tag), as of the last frame. */
  pileAnchor(id: PlanId): VineScreenPoint;
  /** The last frame's camera move as screen' = a * screen + (bx, by) (identity when not zoomed). */
  cameraTransform(): { a: number; bx: number; by: number };
  destroy(): void;
}

/** Implemented in src/vine/scene/index.ts: createVineScene(canvas: HTMLCanvasElement): VineSceneAPI */
