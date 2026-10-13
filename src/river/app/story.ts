/**
 * The guided story as PURE functions of (storyTime, inputs). No DOM, no clock.
 *
 * Story time drives the shared clock (years elapsed). Normal motion runs ~52 s at 1x:
 *   0-6    intro      years 0          three boats tied at the dock (camera close)
 *   6-12   current    years 0 -> 1     the camera eases out; the water starts to flow
 *   12-20  cash       years 1 -> ~1/5  cash drifts
 *   20-28  savings    -> ~1/2          the savings account rows, slower than the current
 *   28-38  invest     -> all years     investing rows harder than the current
 *   38-48  results    all years        live numbers
 *   48-52  handoff    all years        "Explore your own river"
 * Reduced motion uses discrete holds with short eased tweens between them.
 */
import { allBoats, buysToday, formatCurrency, formatPercent } from '../engine';
import type { RiverInputs } from '../engine';

/** Story length in seconds at 1x (normal motion). */
export const STORY_DURATION = 52;

export type StoryBeat = 'intro' | 'current' | 'cash' | 'savings' | 'invest' | 'results' | 'handoff';
export type StoryChapter = 'intro' | 'current' | 'rowing' | 'results' | 'handoff';

const BEAT_CHAPTER: Record<StoryBeat, StoryChapter> = {
  intro: 'intro',
  current: 'current',
  cash: 'rowing',
  savings: 'rowing',
  invest: 'rowing',
  results: 'results',
  handoff: 'handoff',
};

interface Knot {
  t: number;
  years: number;
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
    const d0 = (knots[k].years - knots[k - 1].years) / h0;
    const d1 = (knots[k + 1].years - knots[k].years) / h1;
    if (d0 * d1 <= 0) continue;
    const w1 = 2 * h1 + h0;
    const w2 = h1 + 2 * h0;
    m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
  }
  return m;
}

/** The whole-year marks the story pauses its commentary at: end of the "current", "cash" and "savings" beats. */
export function storyYearMarks(inputs: RiverInputs): { current: number; cash: number; savings: number; end: number } {
  const end = inputs.years;
  const current = Math.min(1, end);
  const cash = Math.min(end, Math.max(current, Math.round(end * 0.2)));
  const savings = Math.min(end, Math.max(cash, Math.round(end * (14 / 30))));
  return { current, cash, savings, end };
}

let planCache: { key: string; plan: Plan } | null = null;

function planFor(inputs: RiverInputs, reduced: boolean): Plan {
  const key = `${inputs.years}|${reduced ? 1 : 0}`;
  if (planCache && planCache.key === key) return planCache.plan;
  const plan = reduced ? buildReducedPlan(inputs) : buildPlan(inputs);
  planCache = { key, plan };
  return plan;
}

function finish(partial: Omit<Plan, 'tangents'>): Plan {
  return { ...partial, tangents: tangentsFor(partial.knots) };
}

function buildPlan(inputs: RiverInputs): Plan {
  const m = storyYearMarks(inputs);
  const knots: Knot[] = [
    { t: 0, years: 0 },
    { t: 6, years: 0 },
    { t: 12, years: m.current },
    { t: 20, years: m.cash },
    { t: 28, years: m.savings },
    { t: 38, years: m.end },
    { t: STORY_DURATION, years: m.end },
  ];
  const beats: BeatStart[] = [
    { t: 0, beat: 'intro' },
    { t: 6, beat: 'current' },
    { t: 12, beat: 'cash' },
    { t: 20, beat: 'savings' },
    { t: 28, beat: 'invest' },
    { t: 38, beat: 'results' },
    { t: 48, beat: 'handoff' },
  ];
  return finish({ duration: STORY_DURATION, knots, beats, end: m.end });
}

/** Reduced motion: discrete holds with short eased tweens between them. */
const HOLD = 4.5;
const TWEEN = 0.4;
function buildReducedPlan(inputs: RiverInputs): Plan {
  const m = storyYearMarks(inputs);
  const holds: Array<{ years: number; beat: StoryBeat }> = [
    { years: 0, beat: 'intro' },
    { years: m.current, beat: 'current' },
    { years: m.cash, beat: 'cash' },
    { years: m.savings, beat: 'savings' },
    { years: m.end, beat: 'invest' },
    { years: m.end, beat: 'results' },
  ];
  const knots: Knot[] = [];
  const beats: BeatStart[] = [];
  let t = 0;
  holds.forEach((h, i) => {
    const len = h.beat === 'results' ? 7 : HOLD;
    beats.push({ t, beat: h.beat });
    knots.push({ t, years: h.years }, { t: t + len, years: h.years });
    t += len + (i < holds.length - 1 ? TWEEN : 0);
  });
  beats.push({ t, beat: 'handoff' });
  knots.push({ t: t + 3, years: m.end });
  return finish({ duration: t + 3, knots, beats, end: m.end });
}

function evalKnots(plan: Plan, t: number): number {
  const { knots, tangents } = plan;
  if (t <= knots[0].t) return knots[0].years;
  const last = knots[knots.length - 1];
  if (t >= last.t) return last.years;
  let i = 0;
  while (i < knots.length - 2 && t >= knots[i + 1].t) i++;
  const a = knots[i];
  const b = knots[i + 1];
  const h = b.t - a.t;
  const u = (t - a.t) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const years =
    (2 * u3 - 3 * u2 + 1) * a.years +
    (u3 - 2 * u2 + u) * h * tangents[i] +
    (-2 * u3 + 3 * u2) * b.years +
    (u3 - u2) * h * tangents[i + 1];
  return Math.min(plan.end, Math.max(0, years));
}

/** Total story length in seconds for these inputs (52 in normal motion). */
export function storyDuration(inputs: RiverInputs, reduced = false): number {
  return planFor(inputs, reduced).duration;
}

/** Shared-clock years at a point in the story. Monotonic non-decreasing; ends exactly at `years`. */
export function storyYears(storyTime: number, inputs: RiverInputs, reduced = false): number {
  return evalKnots(planFor(inputs, reduced), storyTime);
}

export function storyBeat(storyTime: number, inputs: RiverInputs, reduced = false): StoryBeat {
  const { beats } = planFor(inputs, reduced);
  let beat = beats[0].beat;
  for (const b of beats) {
    if (storyTime >= b.t) beat = b.beat;
    else break;
  }
  return beat;
}

export function storyChapter(storyTime: number, inputs: RiverInputs, reduced = false): StoryChapter {
  return BEAT_CHAPTER[storyBeat(storyTime, inputs, reduced)];
}

/** Opening zoom on the dock, and the story second by which the camera is back to the full river. */
export const CAMERA_ZOOM = 2.5;
const CAMERA_HOLD = 6;
const CAMERA_OUT = 12;

/**
 * The opening camera move: close on the dock with all three boats tied, held through the intro, then easing
 * out to the full river as the water starts to flow. Undefined (no move) in reduced motion and once the move
 * ends, so the boats are only ever compared at the same, full view.
 */
export function storyCamera(storyTime: number, _inputs: RiverInputs, reduced = false): { zoom: number; focusU: number } | undefined {
  if (reduced || storyTime >= CAMERA_OUT) return undefined;
  const u = Math.max(0, (storyTime - CAMERA_HOLD) / (CAMERA_OUT - CAMERA_HOLD));
  const e = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
  // a slow push-in while held, then the long ease out
  const hold = 1 + 0.05 * Math.min(1, storyTime / CAMERA_HOLD);
  return { zoom: 1 + (CAMERA_ZOOM * hold - 1) * (1 - e), focusU: 0 };
}

export interface StoryCaption {
  beat: StoryBeat;
  primary: string;
  secondary?: string;
}

/** How a rate compares with inflation. */
function versus(rate: number, inflation: number): 'ahead' | 'level' | 'behind' {
  const d = Math.log1p(rate) - Math.log1p(inflation);
  if (Math.abs(d) < 1e-9) return 'level';
  return d > 0 ? 'ahead' : 'behind';
}

function nominalAndReal(inputs: RiverInputs, id: 'cash' | 'savings' | 'invest', years: number): string {
  const s = allBoats(inputs, years)[id === 'cash' ? 0 : id === 'savings' ? 1 : 2];
  return `${formatCurrency(s.nominal)} ${buysToday(s.real)}`;
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function captionForBeat(beat: StoryBeat, inputs: RiverInputs): StoryCaption {
  const m = storyYearMarks(inputs);
  const i = inputs.inflation;
  switch (beat) {
    case 'intro':
      return {
        beat,
        primary: `Three boats. The same ${formatCurrency(inputs.start)}.`,
        secondary: 'Cash, a savings account, and investing.',
      };
    case 'current':
      return i > 0
        ? { beat, primary: "Prices rise a little every year. That's the current.", secondary: `Here, about ${formatPercent(i)} a year.` }
        : { beat, primary: 'In this river, prices hold steady.', secondary: 'With no inflation there is no current: the water is still.' };
    case 'cash':
      return {
        beat,
        primary: i > 0 ? "Cash doesn't row. It drifts." : "Cash doesn't row, but still water keeps it in place.",
        secondary: `By year ${m.cash}, ${formatCurrency(inputs.start)} in cash ${buysToday(allBoats(inputs, m.cash)[0].real)}.`,
      };
    case 'savings': {
      const v = versus(inputs.savingsRate, i);
      const primary =
        inputs.savingsRate <= 0
          ? 'This savings account earns nothing, so it drifts like cash.'
          : v === 'ahead'
            ? 'A savings account rows faster than the current here, so it makes headway.'
            : v === 'level'
              ? 'A savings account rows exactly as fast as the current, so it holds its place.'
              : 'A savings account rows, but slower than the current.';
      return { beat, primary, secondary: `By year ${m.savings}, ${nominalAndReal(inputs, 'savings', m.savings)}.` };
    }
    case 'invest': {
      const v = versus(inputs.investRate, i);
      const primary =
        inputs.investRate < 0
          ? 'Here investing loses value each year, so it drifts faster than cash.'
          : inputs.investRate === 0
            ? 'With no return, investing drifts just like cash.'
            : v === 'ahead'
              ? 'Investing has to row harder than the current to make headway.'
              : v === 'level'
                ? 'Investing only matches the current here, so it holds its place.'
                : 'Even investing rows slower than the current here.';
      return { beat, primary, secondary: `By year ${m.end}, ${nominalAndReal(inputs, 'invest', m.end)}.` };
    }
    case 'results': {
      const [cash, savings, invest] = allBoats(inputs, m.end);
      const cashLine =
        i > 0
          ? `Still ${formatCurrency(cash.nominal)} in cash. It ${buysToday(cash.real)}.`
          : `Still ${formatCurrency(cash.nominal)} in cash. With no inflation, it buys just what it did.`;
      // the boat labels already carry each boat's dollars, so the caption keeps to buying power, on one short line
      return {
        beat,
        primary: cashLine,
        secondary: `In today's dollars, savings is worth ${formatCurrency(savings.real)} and investing ${formatCurrency(invest.real)}.`,
      };
    }
    case 'handoff':
      return { beat, primary: 'Explore your own river' };
  }
}

export function storyCaption(storyTime: number, inputs: RiverInputs, reduced = false): StoryCaption {
  return captionForBeat(storyBeat(storyTime, inputs, reduced), inputs);
}

/** Every beat, in story order (for measuring the tallest caption). */
export const BEATS: readonly StoryBeat[] = ['intro', 'current', 'cash', 'savings', 'invest', 'results', 'handoff'];
