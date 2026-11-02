/**
 * "Low-Hanging Fruit" (an employer match: saving 3% of pay vs. 6%) — shared contract (coordinator-owned; workers
 * must not change these shapes without escalating). See docs/ORCHARD_SPEC.md.
 *
 * The idea: two apple pickers on the same pay, in the same orchard, with the same offer from the farmer (the
 * employer): for every basket of their own fruit they set aside, the farmer lets them pick half a basket more from
 * the low branches of his old tree, up to a limit. Picker A sets aside 3% of pay and picks only half the free fruit;
 * the rest falls and rots in the grass. Picker B sets aside 6% and picks it all. Every basket is planted in the
 * picker's own young orchard, and the trees grow over the years (the growth on the savings): golden-apple trees from
 * their own fruit, red-apple trees from the farmer's.
 */

export type PickerId = 'a' | 'b';
export const PICKERS: readonly PickerId[] = ['a', 'b'] as const;

export interface MatchTerms {
  /** The match per dollar saved (decimal: 0.5 = 50 cents on the dollar). */
  rate: number;
  /** The match stops at this share of pay saved (decimal: 0.06 = 6% of pay). */
  limit: number;
}

export interface OrchardInputs {
  /** Yearly pay in dollars, the same for both pickers and fixed for the whole time (today's dollars, no raises). */
  salary: number;
  /** How long both save, in whole years (1 … 45). */
  years: number;
  /** Yearly growth on the savings (decimal: 0.07 = 7%), credited monthly as growth / 12. */
  growth: number;
  match: MatchTerms;
  /** The share of pay each picker saves (decimal: 0.03 = 3%). */
  save: Record<PickerId, number>;
}

export const DEFAULT_ORCHARD_INPUTS: OrchardInputs = {
  salary: 60_000,
  years: 30,
  growth: 0.07,
  match: { rate: 0.5, limit: 0.06 },
  save: { a: 0.03, b: 0.06 },
};

export const ORCHARD_LIMITS = {
  salary: { min: 10_000, max: 500_000, step: 1_000 },
  years: { min: 1, max: 45, step: 1 },
  growth: { min: 0, max: 0.12, step: 0.0025 },
  rate: { min: 0, max: 1, step: 0.05 },
  limit: { min: 0, max: 0.1, step: 0.005 },
  save: { min: 0, max: 0.25, step: 0.005 },
} as const;

/** The orchard that ends with more put into it (own + match) has exactly this many trees at the end; a tree is
 *  planted for every `treeDollars` = (that orchard's total put in) / TREES_AT_END. ($4,500 at the defaults:
 *  A ends with 18 trees, 12 golden and 6 red; B with 36, 24 golden and 12 red.) */
export const TREES_AT_END = 36;

export type Variety = 'own' | 'match';

/** One month of a picker's saving, as the month ends (dollars, full precision). */
export interface SaveRow {
  /** 1-based month number. */
  month: number;
  /** Put in this month from pay, and added by the employer. */
  own: number;
  match: number;
  /** The match on offer this month that was not taken (the offer is rate × limit × pay / 12). */
  missed: number;
  /** Put in so far. */
  ownToDate: number;
  matchToDate: number;
  missedToDate: number;
  /** What each part is worth now (with its growth), and the whole. value = ownValue + matchValue. */
  ownValue: number;
  matchValue: number;
  value: number;
  /** What the missed match would be worth now, had it been taken and grown alike. */
  missedValue: number;
}

export interface SaveSchedule {
  id: PickerId;
  /** years × 12 */
  months: number;
  /** Each month: pay / 12 × save; pay / 12 × rate × min(save, limit); pay / 12 × rate × limit (the offer). */
  ownMonthly: number;
  matchMonthly: number;
  offerMonthly: number;
  missedMonthly: number;
  rows: SaveRow[];
  /** At the end. */
  finalValue: number;
  ownTotal: number;
  matchTotal: number;
  missedTotal: number;
  /** The first month the growth (value − own − match put in) is at least what was put in, or null. */
  growthPassesMonth: number | null;
  /** Every tree this picker plants, in planting order (= slot order, SLOTS in scene/geom.ts). */
  trees: TreePlan[];
}

/**
 * A tree of the picker's own orchard. Each month's own money and match money are dealt out in turn (own first) into
 * trees of `treeDollars` each, one variety at a time: own money fills the current golden tree until it holds
 * treeDollars, then starts the next golden tree; the match fills the red trees the same way. A tree is planted (its
 * slot taken) in the month its first dollar arrives; the order of first dollars is the planting order (own before
 * match in the same month). Every dollar grows from its month, so a tree's value is the sum of its pieces with their
 * growth, and the trees' values add up to exactly the picker's value.
 */
export interface TreePlan {
  /** Planting order, 0-based: also the slot index. */
  index: number;
  variety: Variety;
  /** The month its first dollar arrives (1-based), and the month it is full (holds treeDollars before growth). */
  startMonth: number;
  fullMonth: number;
}

/** One picker at one moment. Within month k (k … k+1) the smooth figures move linearly from the end of month k to
 *  the end of month k + 1; the statement figures step when the month's money lands (the engine's CREDIT_AT). */
export interface SaveSnapshot {
  id: PickerId;
  month: number;
  /** Smooth (what the picture follows). */
  value: number;
  ownValue: number;
  matchValue: number;
  ownToDate: number;
  matchToDate: number;
  missedToDate: number;
  missedValue: number;
  /** Statement (the numbers on screen, stepping). */
  valueShown: number;
  ownShown: number;
  matchShown: number;
  missedShown: number;
  missedValueShown: number;
  /** Saving still going on (month < months). */
  saving: boolean;
}

/**
 * Engine (src/orchard/engine/index.ts), pure and unit-tested:
 *   saveSchedule(inputs, id): SaveSchedule            // memoised per inputs
 *   saveSnapshot(inputs, id, months: number): SaveSnapshot
 *   horizonMonths(inputs): number                     // years × 12
 *   treeDollars(inputs): number                       // the larger total put in / TREES_AT_END (> 0; 1 if nothing is put in)
 *   treesAt(inputs, id, months: number): YoungTree[]  // the trees planted so far, smooth values
 *   treeScale(inputs): number                         // the largest value any tree reaches (> 0): size 1
 *   statementMonth(months): number                    // the whole month the clock shows (as the vine)
 *   validateOrchardInputs(raw): { ok; errors: Partial<Record<string, string>> }
 */

/* ---------------------------------------------------------------- scene contract */

/** One young tree as the scene paints it. */
export interface YoungTree {
  /** Planting order = slot index (SLOTS in scene/geom.ts). */
  index: number;
  variety: Variety;
  /** Its value now (smooth, dollars). */
  value: number;
  /** value / treeScale (0 … 1): the painted area of its crown is proportional to it, the same scale on both plots. */
  size: number;
  /** Money in it before growth / treeDollars (0 … 1): 1 once full. A tree still filling is the newest of its kind. */
  filled: number;
  /** Months since its first dollar (smooth): seedlings take a moment to come up, fruit comes with age. */
  age: number;
}

export interface PickerVisual {
  id: PickerId;
  trees: YoungTree[];
  /** This month's basket as shares of the larger picker's monthly own + match (0 … 1): the golden apples from pay,
   *  then the red apples picked from the farmer's tree. 0 when saving has stopped. */
  basket: { own: number; match: number };
  /** The match on offer each month on the same scale (what ripens on this side's low branches each round). */
  offer: number;
  /** The share of the offer picked (0 … 1): match / offer (1 when nothing is offered). The rest falls. */
  picked: number;
  /** The slot of the newest tree (where the picker tips the next basket), or −1 before the first. */
  planting: number;
  /** The whole time has run (month ≥ months): the picker rests. */
  done: boolean;
}

export interface OrchardFrame {
  /** Wall-clock ms: decorative motion (leaves, wasps, the pickers' movement, falling fruit). */
  timeMs: number;
  /** Months passing per second right now (0 when paused or scrubbing). */
  monthsPerSecond: number;
  /** Playback speed while playing (1 when paused): the pickers' work runs at it. */
  speed?: number;
  /** The month shown (smooth); 0 before the first payday. */
  month: number;
  pickers: [PickerVisual, PickerVisual];
  reducedMotion: boolean;
}

export interface OrchardScreenPoint {
  x: number;
  y: number;
}

export interface OrchardSceneAPI {
  ready: Promise<void>;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  /** CSS-px bands reserved for header/notes (top), the labels (bottom) and the side panel (side). */
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: OrchardFrame): void;
  /** Top centre of a picker's label, in the bottom band under its orchard, as of the last frame (CSS px). */
  labelAnchor(id: PickerId): OrchardScreenPoint;
  destroy(): void;
}

/** Implemented in src/orchard/scene/index.ts: createOrchardScene(canvas: HTMLCanvasElement): OrchardSceneAPI */
