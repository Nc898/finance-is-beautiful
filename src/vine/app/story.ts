/**
 * The guided story as PURE functions of (storyTime, inputs). No DOM, no clock.
 *
 * Story time drives the shared clock, in MONTHS. Normal motion runs 52 s at 1x:
 *   0-6    intro      month 0              two cottages, the same vine (camera close on both)
 *   6-12   interest   month 0 -> 3         the camera eases out; both gardeners start pruning
 *   12-25  fixed      month 3 -> payoff    the fixed plan clears (at t = 21.5), its gardener finishes and rests
 *   25-40  minimum    -> the later payoff  months speed up through the long minimum stretch
 *   40-48  results    the later payoff     live numbers
 *   48-52  handoff    the later payoff     "Explore your own garden"
 * The month marks come from the engine, so they follow the inputs. If the fixed payment is no more than the
 * minimum the two plans are identical and the clock simply runs on through (nothing to wait for).
 * Reduced motion uses discrete holds with short eased tweens between them.
 */
import {
  firstInterest,
  formatCurrency,
  formatDuration,
  formatMoney,
  formatPercent,
  horizonMonths,
  minimumDue,
  planSchedule,
  planSnapshot,
  plansMatch,
  yearLabel,
} from '../engine';
import type { VineInputs } from '../engine';

/** Story length in seconds at 1x (normal motion). */
export const STORY_DURATION = 52;

export type StoryBeat = 'intro' | 'interest' | 'fixed' | 'minimum' | 'results' | 'handoff';

/** Every beat, in story order. */
export const BEATS: readonly StoryBeat[] = ['intro', 'interest', 'fixed', 'minimum', 'results', 'handoff'];

/** Story second at which each beat starts (normal motion). */
export const BEAT_STARTS: Record<StoryBeat, number> = { intro: 0, interest: 6, fixed: 12, minimum: 25, results: 40, handoff: 48 };
/** The story second by which the fixed plan has cleared (a little before the "minimum" beat opens up). */
/** the fixed balance reaches zero here; the beat runs on a few seconds so its gardener can snip the last tendrils */
export const FIXED_DONE_AT = 21.5;

interface Knot {
  t: number;
  months: number;
}
interface BeatStart {
  t: number;
  beat: StoryBeat;
}
interface Plan {
  duration: number;
  knots: Knot[];
  tangents: number[];
  beats: BeatStart[];
  end: number;
}

/** Fritsch-Butland monotone tangents: smooth joins, flat holds, never overshoots. */
function tangentsFor(knots: Knot[]): number[] {
  const n = knots.length;
  const m = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const h0 = knots[k].t - knots[k - 1].t;
    const h1 = knots[k + 1].t - knots[k].t;
    const d0 = (knots[k].months - knots[k - 1].months) / h0;
    const d1 = (knots[k + 1].months - knots[k].months) / h1;
    if (d0 * d1 <= 0) continue;
    const w1 = 2 * h1 + h0;
    const w2 = h1 + 2 * h0;
    m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
  }
  return m;
}

export interface StoryMarks {
  /** End of the "interest" beat: the first few months, so the regrowth can be seen. */
  interest: number;
  /** The fixed plan's payoff month (its beat ends here). */
  fixed: number;
  /** A calm month in the long minimum stretch, on a whole year (the reduced-motion hold and the default live caption). */
  hold: number;
  /** The later payoff month: the whole timeline. */
  end: number;
}

/** The month marks the story pauses its commentary at, from the engine. */
export function storyMonthMarks(inputs: VineInputs): StoryMarks {
  const end = horizonMonths(inputs);
  const fixed = Math.min(end, planSchedule(inputs, 'fixed').payoffMonth);
  const interest = Math.min(3, fixed);
  const year = Math.round((fixed + 0.55 * (end - fixed)) / 12) * 12;
  const hold = Math.min(end, Math.max(fixed, year));
  return { interest, fixed, hold, end };
}

let planCache: { key: string; plan: Plan } | null = null;

function planFor(inputs: VineInputs, reduced: boolean): Plan {
  const key = `${inputs.balance}|${inputs.apr}|${inputs.fixedPayment}|${inputs.minPercent}|${inputs.minFloor}|${reduced ? 1 : 0}`;
  if (planCache && planCache.key === key) return planCache.plan;
  const plan = reduced ? buildReducedPlan(inputs) : buildPlan(inputs);
  planCache = { key, plan };
  return plan;
}

function finish(partial: Omit<Plan, 'tangents'>): Plan {
  return { ...partial, tangents: tangentsFor(partial.knots) };
}

function buildPlan(inputs: VineInputs): Plan {
  const m = storyMonthMarks(inputs);
  const knots: Knot[] = [
    { t: 0, months: 0 },
    { t: BEAT_STARTS.interest, months: 0 },
    { t: BEAT_STARTS.fixed, months: m.interest },
  ];
  // the fixed plan clears on its own beat, unless the two plans are the same (then the clock just runs on)
  if (m.end - m.fixed >= 1) knots.push({ t: FIXED_DONE_AT, months: m.fixed });
  knots.push({ t: BEAT_STARTS.results, months: m.end }, { t: STORY_DURATION, months: m.end });
  const beats: BeatStart[] = BEATS.map((beat) => ({ t: BEAT_STARTS[beat], beat }));
  return finish({ duration: STORY_DURATION, knots, beats, end: m.end });
}

/** Reduced motion: discrete holds with short eased tweens between them. */
const HOLD = 4.5;
const TWEEN = 0.4;
function buildReducedPlan(inputs: VineInputs): Plan {
  const m = storyMonthMarks(inputs);
  const holds: Array<{ months: number; beat: StoryBeat }> = [
    { months: 0, beat: 'intro' },
    { months: m.interest, beat: 'interest' },
    { months: m.fixed, beat: 'fixed' },
    { months: m.hold, beat: 'minimum' },
    { months: m.end, beat: 'results' },
  ];
  const knots: Knot[] = [];
  const beats: BeatStart[] = [];
  let t = 0;
  holds.forEach((h, i) => {
    const len = h.beat === 'results' ? 7 : HOLD;
    beats.push({ t, beat: h.beat });
    knots.push({ t, months: h.months }, { t: t + len, months: h.months });
    t += len + (i < holds.length - 1 ? TWEEN : 0);
  });
  beats.push({ t, beat: 'handoff' });
  knots.push({ t: t + 3, months: m.end });
  return finish({ duration: t + 3, knots, beats, end: m.end });
}

function evalKnots(plan: Plan, t: number): number {
  const { knots, tangents } = plan;
  if (t <= knots[0].t) return knots[0].months;
  const last = knots[knots.length - 1];
  if (t >= last.t) return last.months;
  let i = 0;
  while (i < knots.length - 2 && t >= knots[i + 1].t) i++;
  const a = knots[i];
  const b = knots[i + 1];
  const h = b.t - a.t;
  const u = (t - a.t) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const months =
    (2 * u3 - 3 * u2 + 1) * a.months +
    (u3 - 2 * u2 + u) * h * tangents[i] +
    (-2 * u3 + 3 * u2) * b.months +
    (u3 - u2) * h * tangents[i + 1];
  return Math.min(plan.end, Math.max(0, months));
}

/** Total story length in seconds for these inputs (52 in normal motion). */
export function storyDuration(inputs: VineInputs, reduced = false): number {
  return planFor(inputs, reduced).duration;
}

/** Shared-clock months at a point in the story. Monotonic non-decreasing; ends exactly at the horizon. */
export function storyMonths(storyTime: number, inputs: VineInputs, reduced = false): number {
  return evalKnots(planFor(inputs, reduced), storyTime);
}

export function storyBeat(storyTime: number, inputs: VineInputs, reduced = false): StoryBeat {
  const { beats } = planFor(inputs, reduced);
  let beat = beats[0].beat;
  for (const b of beats) {
    if (storyTime >= b.t) beat = b.beat;
    else break;
  }
  return beat;
}

/** Opening zoom on both vines, and the story second by which the camera is back to the whole garden. */
export const CAMERA_ZOOM = 2.2;
const CAMERA_HOLD = 6;
const CAMERA_OUT = 12;

/**
 * The opening camera move: close on both vines at their roots, held through the intro (with a slow push-in),
 * then easing out to the whole garden as the first months pass. Undefined (no move) in reduced motion and once
 * the move ends, so the two cottages are only ever compared at the same, full view.
 */
export function storyCamera(storyTime: number, _inputs: VineInputs, reduced = false): { zoom: number; focus: 'both' } | undefined {
  if (reduced || storyTime >= CAMERA_OUT) return undefined;
  const u = Math.max(0, (storyTime - CAMERA_HOLD) / (CAMERA_OUT - CAMERA_HOLD));
  const e = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
  const hold = 1 + 0.05 * Math.min(1, storyTime / CAMERA_HOLD);
  return { zoom: 1 + (CAMERA_ZOOM * hold - 1) * (1 - e), focus: 'both' };
}

export interface StoryCaption {
  beat: StoryBeat;
  primary: string;
  secondary?: string;
  /** True when the secondary line follows the clock (it is rewritten in place, without a crossfade). */
  live?: boolean;
}

/** "2 years, 10 months", or for a plan that never clears "still $4,000 owed after 60 years". */
function payoffClause(inputs: VineInputs, id: 'minimum' | 'fixed'): string {
  const s = planSchedule(inputs, id);
  return s.cleared ? formatDuration(s.payoffMonth) : `still ${formatCurrency(planSnapshot(inputs, id, s.payoffMonth).balance)} owed after ${formatDuration(s.payoffMonth)}`;
}

/** The live line in the minimum beat: "Year 12: $1,176 still owed." */
export function minimumLiveLine(inputs: VineInputs, months: number): string {
  const snap = planSnapshot(inputs, 'minimum', months);
  return snap.paidOff ? `${yearLabel(months)}: paid off.` : `${yearLabel(months)}: ${formatCurrency(snap.owed)} still owed.`;
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function captionForBeat(beat: StoryBeat, inputs: VineInputs, months?: number): StoryCaption {
  const m = storyMonthMarks(inputs);
  switch (beat) {
    case 'intro':
      return {
        beat,
        primary: `Two cottages. The same ${formatCurrency(inputs.balance)} vine.`,
        secondary: inputs.apr > 0 ? `A credit card balance at ${formatPercent(inputs.apr)} a year.` : 'A credit card balance with no interest at all.',
      };
    case 'interest':
      return inputs.apr > 0
        ? { beat, primary: 'Interest grows it back every month.', secondary: `About ${formatCurrency(firstInterest(inputs))} a month to start.` }
        : { beat, primary: 'With no interest, nothing grows back.', secondary: 'Every payment goes straight to the balance.' };
    case 'fixed': {
      if (plansMatch(inputs)) {
        return {
          beat,
          primary: `A fixed ${formatMoney(inputs.fixedPayment)} is no more than the minimum, so both pay the minimum.`,
          secondary: `The card asks for at least ${formatMoney(minimumDue(inputs.balance, inputs))} to start.`,
        };
      }
      const fixed = planSchedule(inputs, 'fixed');
      return {
        beat,
        primary: fixed.cleared
          ? `A fixed ${formatMoney(inputs.fixedPayment)} a month clears it in ${formatDuration(fixed.payoffMonth)}.`
          : `A fixed ${formatMoney(inputs.fixedPayment)} a month: ${payoffClause(inputs, 'fixed')}.`,
      };
    }
    case 'minimum': {
      const at = months ?? m.hold;
      return {
        beat,
        primary: 'Minimum payments trim a little. The vine keeps coming back.',
        secondary: minimumLiveLine(inputs, at),
        live: true,
      };
    }
    case 'results': {
      const min = planSchedule(inputs, 'minimum');
      const fixed = planSchedule(inputs, 'fixed');
      return {
        beat,
        primary: `Minimum payments: ${payoffClause(inputs, 'minimum')} and ${formatCurrency(min.totalInterest)} in interest.`,
        secondary: `A fixed ${formatMoney(inputs.fixedPayment)}: ${formatCurrency(fixed.totalInterest)} in interest.`,
      };
    }
    case 'handoff':
      return { beat, primary: 'Explore your own garden' };
  }
}

export function storyCaption(storyTime: number, inputs: VineInputs, reduced = false): StoryCaption {
  return captionForBeat(storyBeat(storyTime, inputs, reduced), inputs, storyMonths(storyTime, inputs, reduced));
}
