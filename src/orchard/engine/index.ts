/**
 * Low-Hanging Fruit: the engine. Pure, deterministic, full float64 precision. Nothing in here rounds; display
 * formatting lives in ./format.ts.
 *
 * Two pickers on the same pay, with the same match from work (see docs/ORCHARD_SPEC.md). Each month:
 *   own    = pay / 12 × save
 *   match  = pay / 12 × rate × min(save, limit)
 *   offer  = pay / 12 × rate × limit           missed = offer − match
 *   value' = value × (1 + growth / 12) + own + match     (growth first, then the month's money at the month's end)
 * The own part, the match part and the missed match (what it would be worth, had it been taken) grow alike, and
 * value = ownValue + matchValue exactly.
 *
 * The trees: each month's own money, then its match money, is dealt into trees of `treeDollars` each, one variety at
 * a time; every piece grows from its month, so the trees' values add up to the picker's value.
 */
import { ORCHARD_LIMITS, PICKERS, TREES_AT_END } from '../types';
import type { OrchardInputs, PickerId, SaveRow, SaveSchedule, SaveSnapshot, TreePlan, Variety, YoungTree } from '../types';

export { DEFAULT_ORCHARD_INPUTS, ORCHARD_LIMITS, PICKERS, TREES_AT_END } from '../types';
export type {
  MatchTerms,
  OrchardInputs,
  PickerId,
  PickerVisual,
  SaveRow,
  SaveSchedule,
  SaveSnapshot,
  TreePlan,
  Variety,
  YoungTree,
} from '../types';
export * from './format';

/** Within a month, the share of it at which the month's money (and its growth) lands: the statement figures step. */
export const CREDIT_AT = 0.62;

/**
 * The whole month the clock shows: a month counts once its money has landed, so the readouts never trail the
 * statement figures (at 0.7 months the first month's money is in, and the clock says month 1).
 */
export function statementMonth(months: number): number {
  return Math.max(0, Math.floor(months + 1 - CREDIT_AT + 1e-9));
}

/** How many slots each orchard has (ROWS × COLS in scene/geom.ts). */
export const SLOT_COUNT = TREES_AT_END;

/** Money under this share of a tree is float dust: it stays with the tree before it, never starting a new one. */
const DUST = 1e-9;

/** The month's money of one picker (full precision). */
export function monthlyMoney(inputs: OrchardInputs, id: PickerId): { own: number; match: number; offer: number; missed: number } {
  const per = inputs.salary / 12;
  const save = inputs.save[id];
  const { rate, limit } = inputs.match;
  const own = per * save;
  const match = per * rate * Math.min(save, limit);
  const offer = per * rate * limit;
  return { own, match, offer, missed: Math.max(0, offer - match) };
}

/** years × 12: the length of the timeline. */
export function horizonMonths(inputs: OrchardInputs): number {
  return Math.max(0, Math.round(inputs.years * 12));
}

/** What a picker puts in over the whole time (own + match), before growth. */
function totalPutIn(inputs: OrchardInputs, id: PickerId): { own: number; match: number } {
  const n = horizonMonths(inputs);
  const m = monthlyMoney(inputs, id);
  return { own: m.own * n, match: m.match * n };
}

/** How many trees `amount` fills at `per` dollars a tree (the last one may be part full; float dust is no tree). */
const treesFor = (amount: number, per: number): number => (amount <= per * DUST ? 0 : Math.ceil(amount / per - DUST));

/**
 * Dollars a tree holds before growth: the larger total put in (own + match) / TREES_AT_END, so that orchard ends with
 * exactly TREES_AT_END trees ($4,500 at the defaults). When both varieties end part full the count would be one over
 * the slots; then the larger total is shared by one tree fewer, so no orchard ever needs more slots than it has.
 * 1 when nothing is put in at all.
 */
export function treeDollars(inputs: OrchardInputs): number {
  const totals = PICKERS.map((id) => totalPutIn(inputs, id));
  const larger = Math.max(...totals.map((t) => t.own + t.match));
  if (!(larger > 0)) return 1;
  const fits = (per: number) => totals.every((t) => treesFor(t.own, per) + treesFor(t.match, per) <= SLOT_COUNT);
  const per = larger / TREES_AT_END;
  return fits(per) ? per : larger / (TREES_AT_END - 1);
}

/* ---------------------------------------------------------------- schedules (memoised) */

/** A tree's money, month by month: what was put in during month j (adds[j]), its value and its put-in at the end of
 *  month j (index 0 = before the first month). */
interface TreeData {
  plan: TreePlan;
  values: Float64Array;
  putIn: Float64Array;
}

interface Built {
  schedule: SaveSchedule;
  trees: TreeData[];
  treeDollars: number;
}

const CACHE_LIMIT = 24;
const cache = new Map<string, Built>();

const keyOf = (i: OrchardInputs, id: PickerId): string =>
  `${id}|${i.salary}|${i.years}|${i.growth}|${i.match.rate}|${i.match.limit}|${i.save.a}|${i.save.b}`;

function simulate(inputs: OrchardInputs, id: PickerId): Built {
  const months = horizonMonths(inputs);
  const g = 1 + inputs.growth / 12;
  const { own, match, offer, missed } = monthlyMoney(inputs, id);
  const per = treeDollars(inputs);

  // the trees: each variety fills its current tree, then starts the next
  const trees: TreeData[] = [];
  const adds: Float64Array[] = [];
  const state: Record<Variety, { tree: number; fill: number }> = { own: { tree: -1, fill: 0 }, match: { tree: -1, fill: 0 } };
  const deal = (variety: Variety, amount: number, month: number) => {
    const st = state[variety];
    let rem = amount;
    while (rem > per * DUST) {
      if (st.tree < 0 || st.fill >= per * (1 - DUST)) {
        st.tree = trees.length;
        st.fill = 0;
        trees.push({
          plan: { index: st.tree, variety, startMonth: month, fullMonth: Number.POSITIVE_INFINITY },
          values: new Float64Array(months + 1),
          putIn: new Float64Array(months + 1),
        });
        adds.push(new Float64Array(months + 1));
      }
      const take = Math.min(rem, per - st.fill);
      adds[st.tree][month] += take;
      st.fill += take;
      rem -= take;
      // float dust left over stays with this tree
      if (rem > 0 && rem <= per * DUST) {
        adds[st.tree][month] += rem;
        st.fill += rem;
        rem = 0;
      }
      const t = trees[st.tree].plan;
      if (st.fill >= per * (1 - DUST) && !Number.isFinite(t.fullMonth)) t.fullMonth = month;
    }
  };

  const rows: SaveRow[] = [];
  let ownValue = 0;
  let matchValue = 0;
  let missedValue = 0;
  let ownToDate = 0;
  let matchToDate = 0;
  let missedToDate = 0;
  let growthPassesMonth: number | null = null;
  for (let month = 1; month <= months; month++) {
    ownValue = ownValue * g + own;
    matchValue = matchValue * g + match;
    missedValue = missedValue * g + missed;
    ownToDate += own;
    matchToDate += match;
    missedToDate += missed;
    const value = ownValue + matchValue;
    const putIn = ownToDate + matchToDate;
    if (growthPassesMonth === null && putIn > 0 && value - putIn >= putIn) growthPassesMonth = month;
    rows.push({ month, own, match, missed, ownToDate, matchToDate, missedToDate, ownValue, matchValue, value, missedValue });
    deal('own', own, month);
    deal('match', match, month);
  }

  // each tree's value grows exactly as the picker's does, from the month of each piece
  for (let t = 0; t < trees.length; t++) {
    const { values, putIn } = trees[t];
    const add = adds[t];
    for (let j = 1; j <= months; j++) {
      values[j] = values[j - 1] * g + add[j];
      putIn[j] = putIn[j - 1] + add[j];
    }
  }

  const last = rows[rows.length - 1];
  const schedule: SaveSchedule = {
    id,
    months,
    ownMonthly: own,
    matchMonthly: match,
    offerMonthly: offer,
    missedMonthly: missed,
    rows,
    finalValue: last ? last.value : 0,
    ownTotal: ownToDate,
    matchTotal: matchToDate,
    missedTotal: missedToDate,
    growthPassesMonth,
    trees: trees.map((t) => t.plan),
  };
  return { schedule, trees, treeDollars: per };
}

function built(inputs: OrchardInputs, id: PickerId): Built {
  const key = keyOf(inputs, id);
  const hit = cache.get(key);
  if (hit) {
    // keep recently used entries at the end
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = simulate(inputs, id);
  cache.set(key, made);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return made;
}

/** The whole month-by-month schedule of one picker, with its trees. Memoised per inputs. */
export function saveSchedule(inputs: OrchardInputs, id: PickerId): SaveSchedule {
  return built(inputs, id).schedule;
}

const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

/** The whole month k and the share f of the next one, clamped to the schedule. */
function monthAt(months: number, n: number): { m: number; k: number; f: number } {
  const m = Math.min(n, Math.max(0, Number.isFinite(months) ? months : 0));
  let k = Math.floor(m);
  let f = m - k;
  if (k >= n) {
    k = n;
    f = 0;
  }
  return { m, k, f };
}

const ZERO_ROW: SaveRow = {
  month: 0,
  own: 0,
  match: 0,
  missed: 0,
  ownToDate: 0,
  matchToDate: 0,
  missedToDate: 0,
  ownValue: 0,
  matchValue: 0,
  value: 0,
  missedValue: 0,
};

/**
 * One picker at one moment. `months` may be fractional: within month k (from k to k + 1) the smooth figures move
 * linearly from their values at the end of month k to those at the end of month k + 1; the statement figures step
 * when the month's money lands (CREDIT_AT). Clamped to the schedule. `ownShown`, `matchShown` and `missedShown` are
 * what was put in (and left untaken) so far; `valueShown` and `missedValueShown` what it is worth.
 */
export function saveSnapshot(inputs: OrchardInputs, id: PickerId, months: number): SaveSnapshot {
  const s = saveSchedule(inputs, id);
  const n = s.months;
  const { m, k, f } = monthAt(months, n);
  const at = (j: number): SaveRow => (j <= 0 ? ZERO_ROW : s.rows[Math.min(n, j) - 1]);
  const r0 = at(k);
  const r1 = f > 0 ? at(k + 1) : r0;
  const shown = f >= CREDIT_AT ? r1 : r0;
  return {
    id,
    month: m,
    value: lerp(r0.value, r1.value, f),
    ownValue: lerp(r0.ownValue, r1.ownValue, f),
    matchValue: lerp(r0.matchValue, r1.matchValue, f),
    ownToDate: lerp(r0.ownToDate, r1.ownToDate, f),
    matchToDate: lerp(r0.matchToDate, r1.matchToDate, f),
    missedToDate: lerp(r0.missedToDate, r1.missedToDate, f),
    missedValue: lerp(r0.missedValue, r1.missedValue, f),
    valueShown: shown.value,
    ownShown: shown.ownToDate,
    matchShown: shown.matchToDate,
    missedShown: shown.missedToDate,
    missedValueShown: shown.missedValue,
    saving: m < n - 1e-9,
  };
}

/** Both pickers at one moment, in PICKERS order (A, B). */
export function allPickers(inputs: OrchardInputs, months: number): [SaveSnapshot, SaveSnapshot] {
  return [saveSnapshot(inputs, 'a', months), saveSnapshot(inputs, 'b', months)];
}

/* ---------------------------------------------------------------- the trees */

const scaleCache = new WeakMap<SaveSchedule, number>();

/** The largest value any tree of either picker reaches (> 0): a tree of this value is size 1. */
export function treeScale(inputs: OrchardInputs): number {
  const a = built(inputs, 'a');
  const hit = scaleCache.get(a.schedule);
  if (hit !== undefined) return hit;
  let most = 0;
  for (const b of [a, built(inputs, 'b')]) for (const t of b.trees) for (const v of t.values) if (v > most) most = v;
  const scale = most > 0 ? most : 1;
  scaleCache.set(a.schedule, scale);
  return scale;
}

/**
 * The trees a picker has planted by `months` (smooth): a tree is there from the moment its first dollar starts to
 * arrive (within its start month). Its value moves linearly within a month as the picker's does, so the trees'
 * values add up to the picker's smooth value at any moment.
 */
export function treesAt(inputs: OrchardInputs, id: PickerId, months: number): YoungTree[] {
  const b = built(inputs, id);
  const { m, k, f } = monthAt(months, b.schedule.months);
  const scale = treeScale(inputs);
  const out: YoungTree[] = [];
  for (const t of b.trees) {
    const { plan, values, putIn } = t;
    if (!(plan.startMonth - 1 < m)) break; // planting order is month order
    const k1 = f > 0 ? k + 1 : k;
    const value = lerp(values[k], values[k1], f);
    const money = lerp(putIn[k], putIn[k1], f);
    out.push({
      index: plan.index,
      variety: plan.variety,
      value,
      size: Math.max(0, Math.min(1, value / scale)),
      filled: Math.max(0, Math.min(1, money / b.treeDollars)),
      age: Math.max(0, m - (plan.startMonth - 1)),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- comparisons */

/** The other picker. */
export const otherPicker = (id: PickerId): PickerId => (id === 'a' ? 'b' : 'a');

/** True when both pickers save the same share (both orchards grow alike). */
export function savesMatch(inputs: OrchardInputs): boolean {
  return Math.abs(inputs.save.a - inputs.save.b) < 1e-12;
}

/** True when work adds anything at all (a rate and a limit above 0). */
export function matchOffered(inputs: OrchardInputs): boolean {
  return inputs.match.rate > 0 && inputs.match.limit > 0;
}

/** The picker who saves less and the one who saves more. Never assumes A saves less. For equal savings: A, then B. */
export function lessAndMore(inputs: OrchardInputs): { less: PickerId; more: PickerId } {
  return inputs.save.b < inputs.save.a - 1e-12 ? { less: 'b', more: 'a' } : { less: 'a', more: 'b' };
}

/** The month the growth passes what was put in, for whichever picker gets there first (null if never). */
export function growthPassesMonth(inputs: OrchardInputs): number | null {
  const ms = PICKERS.map((id) => saveSchedule(inputs, id).growthPassesMonth).filter((m): m is number => m !== null);
  return ms.length ? Math.min(...ms) : null;
}

/** Each picker's value at the end of each whole year, year 0 … the end. */
export function yearlyValues(inputs: OrchardInputs): Array<{ year: number; a: number; b: number }> {
  const n = horizonMonths(inputs);
  const out: Array<{ year: number; a: number; b: number }> = [];
  const valueAt = (id: PickerId, month: number): number => {
    const rows = saveSchedule(inputs, id).rows;
    return month <= 0 ? 0 : rows[Math.min(month, rows.length) - 1].value;
  };
  for (let y = 0; y * 12 <= n; y++) out.push({ year: y, a: valueAt('a', y * 12), b: valueAt('b', y * 12) });
  return out;
}

/* ---------------------------------------------------------------- validation */

/** Every input field, in panel order: pay, years, growth, the match, then each picker's saving. */
export type OrchardField = 'salary' | 'years' | 'growth' | 'rate' | 'limit' | `${PickerId}.save`;
export const ORCHARD_FIELDS: readonly OrchardField[] = ['salary', 'years', 'growth', 'rate', 'limit', 'a.save', 'b.save'];

export interface OrchardValidation {
  ok: boolean;
  errors: Partial<Record<OrchardField, string>>;
}

/** Tolerance for step-size float noise on the share limits. */
const SHARE_EPS = 1e-12;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const pct = (decimal: number): string => `${Math.round(decimal * 1000) / 10}%`;
const dollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

/** Checks every field; one plain-language message per offending field. Accepts anything (unknown input is invalid). */
export function validateOrchardInputs(raw: unknown): OrchardValidation {
  const errors: Partial<Record<OrchardField, string>> = {};
  const r = (raw ?? {}) as {
    salary?: unknown;
    years?: unknown;
    growth?: unknown;
    match?: { rate?: unknown; limit?: unknown } | null;
    save?: Partial<Record<PickerId, unknown>> | null;
  };
  const L = ORCHARD_LIMITS;

  if (!isFiniteNumber(r.salary)) errors.salary = 'Pay must be a number.';
  else if (r.salary < L.salary.min || r.salary > L.salary.max) {
    errors.salary = `Pay must be between ${dollars(L.salary.min)} and ${dollars(L.salary.max)} a year.`;
  }

  if (!isFiniteNumber(r.years)) errors.years = 'Years must be a number.';
  else if (!Number.isInteger(r.years) || r.years < L.years.min || r.years > L.years.max) {
    errors.years = `Years must be a whole number, from ${L.years.min} to ${L.years.max}.`;
  }

  const share = (v: unknown, lim: { min: number; max: number }, name: string): string | undefined => {
    if (!isFiniteNumber(v)) return `${name} must be a number.`;
    if (v < lim.min - SHARE_EPS || v > lim.max + SHARE_EPS) return `${name} must be between ${pct(lim.min)} and ${pct(lim.max)}.`;
    return undefined;
  };
  const growth = share(r.growth, L.growth, 'Growth');
  if (growth) errors.growth = growth;
  const rate = share(r.match?.rate, L.rate, 'The match');
  if (rate) errors.rate = rate;
  const limit = share(r.match?.limit, L.limit, 'The match limit');
  if (limit) errors.limit = limit;
  for (const id of PICKERS) {
    const msg = share(r.save?.[id], L.save, `Picker ${id.toUpperCase()}'s saving`);
    if (msg) errors[`${id}.save`] = msg;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
