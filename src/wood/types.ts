/**
 * "A Little Off the Top" (what a yearly fund fee costs) — shared contract. See docs/WOOD_SPEC.md.
 *
 * The idea: the same savings go into two funds that grow alike; the only difference is the fee each charges, a
 * share of everything in the fund, every year. Each fund is a tree in a bluebell wood (its painted crown is the
 * money). Every month the forester takes the fee off the top: the cut wood is stacked in a woodpile beside the tree
 * (the fees paid). A pale ghost of the crown shows the tree it would have been with no fee at all. Fund A (left,
 * default 1% a year) and fund B (right, default 0.1%) differ only in their fee.
 */

export type FundId = 'a' | 'b';
export const FUNDS: readonly FundId[] = ['a', 'b'] as const;

export interface WoodInputs {
  /** Dollars in the fund at month 0 (the same for both). */
  start: number;
  /** Dollars saved at the end of every month (the same for both). */
  monthly: number;
  /** Whole years (1 … 50). */
  years: number;
  /** Yearly growth before fees (decimal, nominal: each month grows by growth / 12). */
  growth: number;
  /** Each fund's yearly fee as a share of the fund (decimal: 0.01 = 1%). Each month takes fee / 12 of the fund. */
  fees: Record<FundId, number>;
}

export const DEFAULT_WOOD_INPUTS: WoodInputs = {
  start: 10_000,
  monthly: 500,
  years: 40,
  growth: 0.07,
  fees: { a: 0.01, b: 0.001 },
};

export const WOOD_LIMITS = {
  start: { min: 0, max: 2_000_000, step: 1_000 },
  monthly: { min: 0, max: 20_000, step: 50 },
  years: { min: 1, max: 50, step: 1 },
  growth: { min: 0, max: 0.15, step: 0.0025 },
  fee: { min: 0, max: 0.03, step: 0.0005 },
} as const;

/** The larger woodpile ends with about this many logs (each log is the same dollars on both piles). */
export const LOGS_AT_END = 55;

/** One month of a fund, as the month ends (dollars, full precision). */
export interface FundRow {
  /** 1-based month number. */
  month: number;
  /** The fee taken this month. */
  fee: number;
  /** In the fund at the end of the month (after growth, fee and the month's saving). */
  value: number;
  /** What the same savings would hold with no fee. */
  ideal: number;
  feesToDate: number;
}

export interface FundSchedule {
  id: FundId;
  months: number;
  rows: FundRow[];
  /** Value at the end. */
  final: number;
  /** The no-fee value at the end (the same for both funds). */
  idealFinal: number;
  /** All fees paid. */
  totalFees: number;
  /** What the fees cost in all: idealFinal − final (the fees plus the growth they would have earned). */
  cost: number;
}

/** One fund at one moment. Smooth figures move linearly within a month; statement figures step at CREDIT_AT. */
export interface FundSnapshot {
  id: FundId;
  month: number;
  /** In the fund, smooth (the tree follows it). */
  value: number;
  /** As a statement shows it (the numbers on screen). */
  worth: number;
  /** Fees paid so far, smooth (the woodpile follows it). */
  fees: number;
  /** Fees paid so far, statement. */
  feesCharged: number;
  /** The no-fee value, smooth (the ghost crown follows it). */
  ideal: number;
  /** The no-fee value, statement. */
  idealWorth: number;
  /** idealWorth − worth: what the fee has cost so far, statement. */
  cost: number;
  /** Put in so far (start + savings), statement. */
  putIn: number;
  /** This month's fee (statement month), for the notes. */
  feeThisMonth: number;
}

/* ---------------------------------------------------------------- scene contract */

export interface TreeVisual {
  id: FundId;
  /** Tree size 0..1: √(value / scale), so the painted crown's area is proportional to the money. */
  maturity: number;
  /** The ghost (no-fee) tree's size on the same scale. */
  ghost: number;
  /** Logs in the woodpile: fees paid (smooth) / logDollars (3.4 = three logs and a fourth coming). */
  logs: number;
  /** This month's fee as a share of the fund ×1000, so the falling twigs follow the fee's size (0 for no fee). */
  trim: number;
}

export interface WoodFrame {
  timeMs: number;
  monthsPerSecond: number;
  /** The clock in months (the falling twigs are timed to the fee taken each month). */
  months: number;
  trees: [TreeVisual, TreeVisual];
  reducedMotion: boolean;
}

export interface WoodScreenPoint {
  x: number;
  y: number;
}

export interface WoodSceneAPI {
  ready: Promise<void>;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: WoodFrame): void;
  /** Top centre of a fund's label, in the bottom band under its tree (CSS px). */
  labelAnchor(id: FundId): WoodScreenPoint;
  destroy(): void;
}
