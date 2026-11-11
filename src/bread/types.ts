/**
 * "Bread and Butter" (real grocery prices vs real pay, January 1980 to the latest published month): the shared
 * contract (coordinator-owned; builders must not change these shapes without escalating). See docs/BREAD_SPEC.md.
 *
 * The idea: one week's groceries at real U.S. average prices, and one median week's pay, month by month. The
 * headline is how many minutes of that pay the basket takes. In a corner grocery the grocer re-chalks the prices on
 * his board by hand as the years pass; the basket lies on his counter.
 */

export type ItemKey = 'bread' | 'eggs' | 'coffee' | 'bananas' | 'chicken' | 'flour';
export const ITEM_KEYS: readonly ItemKey[] = ['bread', 'eggs', 'coffee', 'bananas', 'chicken', 'flour'] as const;

export interface ItemInfo {
  key: ItemKey;
  /** the board's and the panel's name ("Bread") */
  label: string;
  /** what one quantity is ("lb", "dozen"), and how the panel names the stepper's unit */
  unit: string;
  panelUnit: string;
}

export const ITEMS: Record<ItemKey, ItemInfo> = {
  bread: { key: 'bread', label: 'Bread', unit: 'lb', panelUnit: 'loaves (1 lb each)' },
  eggs: { key: 'eggs', label: 'Eggs', unit: 'dozen', panelUnit: 'dozens' },
  coffee: { key: 'coffee', label: 'Coffee', unit: 'lb', panelUnit: 'lb' },
  bananas: { key: 'bananas', label: 'Bananas', unit: 'lb', panelUnit: 'lb' },
  chicken: { key: 'chicken', label: 'Chicken', unit: 'lb', panelUnit: 'lb (whole)' },
  flour: { key: 'flour', label: 'Flour', unit: 'lb', panelUnit: 'lb' },
};

/** How many of each unit the week's basket holds. Whole numbers. */
export interface BasketInputs {
  qty: Record<ItemKey, number>;
}

/** One week's shop: two loaves, a dozen eggs, a pound of coffee, 3 lb of bananas, a 3 lb chicken, a 5 lb bag of flour. */
export const DEFAULT_BASKET: BasketInputs = {
  qty: { bread: 2, eggs: 1, coffee: 1, bananas: 3, chicken: 3, flour: 5 },
};

/** Per item: 0 … max, whole steps. The counter has room for this many of each (BASKET_SLOTS in scene/geom.ts). */
export const BASKET_LIMITS: Record<ItemKey, { min: 0; max: number; step: 1 }> = {
  bread: { min: 0, max: 4, step: 1 },
  eggs: { min: 0, max: 3, step: 1 },
  coffee: { min: 0, max: 3, step: 1 },
  bananas: { min: 0, max: 6, step: 1 },
  chicken: { min: 0, max: 6, step: 1 },
  flour: { min: 0, max: 10, step: 1 },
};

/** Hours in a full-time week: hourly pay = weekly pay / WORK_HOURS. */
export const WORK_HOURS = 40;

/** A price, pay or index figure, and whether the BLS published it or the engine filled it by interpolation. */
export interface Figure {
  value: number;
  /** true = not published that month; a straight line between the nearest published months ("estimated" on screen) */
  estimated: boolean;
}

/** The three price indexes' 12-month rates (decimals: 0.148 = 14.8%). */
export interface InflationRates {
  /** all items: prices overall (the rate the notes quote) */
  overall: Figure;
  /** food at home: all groceries (the benchmark for the basket) */
  groceries: Figure;
  /** all items less food and energy (one explanatory line in the panel only) */
  core: Figure;
}

/** One whole month (index m: 0 = January 1980), at the reader's basket. Dollars, full precision. */
export interface MonthRow {
  month: number;
  /** "January 1980" and "Jan 1980" */
  label: string;
  shortLabel: string;
  year: number;
  /** price per unit of each item */
  prices: Record<ItemKey, Figure>;
  /** Σ qty × price */
  basket: number;
  /** median usual weekly pay, full time, before tax (the quarter's figure) */
  weeklyPay: Figure;
  /** basket ÷ (weeklyPay ÷ WORK_HOURS) × 60 */
  minutes: number;
  inflation: InflationRates;
}

/** The moment the scene and the labels show. Within month k … k + 1 the smooth figures move linearly from month k to
 *  month k + 1; the shown figures are whole month `statementMonth`. */
export interface BreadSnapshot {
  /** smooth month (0 … DATA_MONTHS − 1) */
  month: number;
  statementMonth: number;
  /** smooth (what the picture follows) */
  basket: number;
  minutes: number;
  /** shown (the labels and the board's target) */
  row: MonthRow;
}

/** The turning points the notes are written from, at the reader's basket. Months are whole month indexes. */
export interface Landmarks {
  mostMinutes: { month: number; minutes: number };
  fewestMinutes: { month: number; minutes: number };
  /** each index's highest 12-month rate in the data, and since January 2010 */
  overallPeak: { month: number; rate: number };
  overallPeakSince2010: { month: number; rate: number };
  groceriesPeak: { month: number; rate: number };
  /** from the first month to the last, as multiples: this basket, all groceries, prices overall, core, pay */
  growth: { basket: number; groceries: number; overall: number; core: number; pay: number };
}

/**
 * Engine (src/bread/engine/index.ts), pure and unit-tested (the figures in the spec, to the cent and the tenth of a
 * minute; updated when the data is re-fetched):
 *   monthCount(): number                                   // DATA_MONTHS
 *   monthRow(basket, m: number): MonthRow                  // whole month; memoised per basket
 *   snapshot(basket, month: number): BreadSnapshot         // smooth
 *   landmarks(basket): Landmarks
 *   yearTable(basket): MonthRow[]                          // each year's averages (label "1980"), for the panel
 *   estimatedMonths(): { series: ItemKey | 'pay' | 'overall' | 'groceries' | 'core'; months: number[] }[]
 *   statementMonth(month: number): number                  // the whole month the clock shows
 *   validateBasket(raw): { ok: boolean; errors: Partial<Record<ItemKey, string>> }
 * Data: src/bread/engine/data.ts (generated by scripts/fetch-bread-data.mjs; never edit by hand).
 */

/* ---------------------------------------------------------------- scene contract */

/** What the board should say for the shown month (the grocer works toward it; it is never set directly while he
 *  works). Prices are written as he writes them: "$0.51", "$4.25"; the year as "1980". A price the BLS did not
 *  publish that month is chalked "~$3.47" (about), and so is the total while any price is. */
export interface BoardContent {
  year: string;
  /** each item's price per unit, as text; an item not in the basket still has its price on the board */
  prices: Record<ItemKey, string>;
  /** the basket's total, "$9.16" */
  total: string;
}

export interface BreadFrame {
  /** Wall-clock ms: decorative motion (rain, steam, the grocer's idle life). */
  timeMs: number;
  /** Months passing per second right now (0 when paused or scrubbing). */
  monthsPerSecond: number;
  /** Playback speed while playing (1 when paused): the grocer works at it. */
  speed: number;
  /** The smooth month shown, and the whole month on the labels. */
  month: number;
  statementMonth: number;
  /** what the board should say (for statementMonth) */
  board: BoardContent;
  /** what the counter should hold */
  basket: BasketInputs;
  /** the timeline was dragged or jumped this frame: the scene places everything settled, nothing animates */
  scrubbed: boolean;
  reducedMotion: boolean;
}

export interface BreadScreenPoint {
  x: number;
  y: number;
}

export type BreadLabel = 'basket' | 'pay' | 'minutes';

export interface BreadSceneAPI {
  ready: Promise<void>;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  /** CSS-px bands reserved for the header and notes (top), the labels (bottom) and the side panel (side). */
  setInsets(insets: { top: number; bottom: number; side?: number }): void;
  render(frame: BreadFrame): void;
  /** Top centre of a label's place in the bottom band, as of the last frame (CSS px). */
  labelAnchor(label: BreadLabel): BreadScreenPoint;
  destroy(): void;
}

/** Implemented in src/bread/scene/index.ts: createBreadScene(canvas: HTMLCanvasElement): BreadSceneAPI */
