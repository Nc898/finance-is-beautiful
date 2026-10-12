/**
 * "Against the Current" — shared contract (coordinator-owned; workers must not change these shapes
 * without escalating).
 *
 * The idea: the river current is inflation. Three rowboats leave the same dock with the same money.
 * A boat's position along the river is its REAL value (what its money buys in today's dollars), on a
 * logarithmic scale: x = ln(real / start). With a constant return r and inflation i, real value grows by
 * the constant factor (1+r)/(1+i) each year, so every boat moves at a CONSTANT speed — exactly what
 * rowing against a steady current looks like. Upstream (left) = more buying power, downstream (right) = less.
 */

export type BoatId = 'cash' | 'savings' | 'invest';
export const BOATS: readonly BoatId[] = ['cash', 'savings', 'invest'] as const;

export interface RiverInputs {
  /** Starting amount in dollars, shared by all three boats (> 0). */
  start: number;
  /** Whole years on the timeline. */
  years: number;
  /** Assumed annual inflation (effective, decimal: 0.03 = 3%). Shared. */
  inflation: number;
  /** Savings account annual return (effective, decimal). */
  savingsRate: number;
  /** Investment annual return (effective, decimal). */
  investRate: number;
}

export const DEFAULT_RIVER_INPUTS: RiverInputs = {
  start: 10_000,
  years: 30,
  inflation: 0.03,
  savingsRate: 0.02,
  investRate: 0.06,
};

export const RIVER_LIMITS = {
  start: { min: 100, max: 1_000_000, step: 100 },
  years: { min: 1, max: 60, step: 1 },
  inflation: { min: 0, max: 0.12, step: 0.005 },
  savingsRate: { min: 0, max: 0.1, step: 0.005 },
  investRate: { min: -0.05, max: 0.15, step: 0.005 },
} as const;

/** One boat at one moment (all values at full precision; round only for display). */
export interface BoatSnapshot {
  id: BoatId;
  /** Annual nominal return used for this boat (0 for cash). */
  rate: number;
  /** Dollars in the boat: start × (1 + rate)^t. Cash never changes. */
  nominal: number;
  /** What those dollars buy in today's money: nominal / (1 + inflation)^t. */
  real: number;
  /** ln(real / start): 0 at the dock, < 0 downstream, > 0 upstream. */
  logReal: number;
}

/**
 * Engine (src/river/engine/index.ts):
 *   boatSnapshot(inputs, id, years: number): BoatSnapshot      // years may be fractional
 *   riverScale(inputs): number   // max(|logReal at the end| over boats, ln(1.6)): the shared span ±1 maps to
 *   validateRiverInputs(raw): { ok; errors: Partial<Record<keyof RiverInputs, string>> }
 */

/* ---------------------------------------------------------------- scene contract */

export interface BoatVisual {
  id: BoatId;
  /** Position along the river as a fraction of the shared scale: logReal / riverScale, in [-1.1, 1.1]. 0 = dock. */
  u: number;
  /**
   * How hard the rower pulls, 0…1 (from the boat's return relative to the strongest; cash is 0: oars shipped,
   * the rower rests). Drives stroke rate and amplitude only — never position.
   */
  effort: number;
  /** Boat's speed through the WATER in u per second this frame (for the wake); 0 when paused. */
  waterSpeed: number;
}

export interface RiverFrame {
  /** Wall-clock ms: decorative motion only (water flow, ripples, strokes, reflections, wind). */
  timeMs: number;
  /** Inflation (decimal). The visible current runs faster with higher inflation. 0 = still water. */
  current: number;
  /** True while the timeline is running: water flows and rowers row only then (water idles gently when paused). */
  flowing: boolean;
  boats: [BoatVisual, BoatVisual, BoatVisual];
  reducedMotion: boolean;
  /** Optional opening camera move, as in Time to Grow: zoom ≥ 1 about a point given in u along the river. */
  camera?: { zoom: number; focusU: number };
}

export interface RiverScreenPoint {
  x: number;
  y: number;
}

export interface RiverSceneAPI {
  ready: Promise<void>;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  /** CSS-px bands reserved for header/caption (top) and labels (bottom); the river is framed inside them. */
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: RiverFrame): void;
  /** Screen point just above a boat's bow (for its label), as of the last frame. */
  boatAnchor(id: BoatId): RiverScreenPoint;
  /**
   * Screen point at the top of a milepost on the near bank for a given u (labels "$5,000 today" etc. are DOM
   * text placed here). Unzoomed camera.
   */
  postAnchor(u: number): RiverScreenPoint;
  /** Horizontal extent of the river in u that is visible (for choosing which mileposts to label). */
  visibleU(): { min: number; max: number };
  destroy(): void;
}

/** Implemented in src/river/scene/index.ts: createRiverScene(canvas: HTMLCanvasElement): RiverSceneAPI */
