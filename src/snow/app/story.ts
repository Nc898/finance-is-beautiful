/**
 * The guided story as PURE functions of (storyTime, inputs). No DOM, no clock.
 *
 * Story time drives the shared clock, in MONTHS. Normal motion runs 52 s at 1x:
 *   0-6    intro      month 0              three debts on each hill, the same budget (camera close on the lanes)
 *   6-12   interest   month 0 -> 3         the camera eases out; both climbers start pushing
 *   12-18  win        3 -> the first clear on either hill (the ball breaks up a moment before the beat ends)
 *   18-30  push       -> the other hill's first clear (months speed up; the interest so far follows the clock)
 *   30-36  top        -> the avalanche's highest-rate debt is cleared
 *   36-42  clear      -> the later payoff (climbers rest as each finishes)
 *   42-48  results    the later payoff     live numbers
 *   48-52  handoff    the later payoff     "Explore your own debts"
 * The month marks come from the engine, so they follow the inputs. When the two hills do exactly the same thing
 * the story says so plainly and the clock simply runs on. Reduced motion uses discrete holds with short eased
 * tweens between them.
 */
import {
  DEBTS,
  DEBT_NAME,
  MAX_MONTHS,
  STRATEGIES,
  STRATEGY_NAME,
  allStrategies,
  firstInterest,
  formatCurrency,
  formatDuration,
  formatMoney,
  formatPercent,
  hillsMatch,
  horizonMonths,
  strategySchedule,
  strategySnapshot,
} from '../engine';
import type { DebtId, SnowInputs, StrategyId } from '../engine';

/** Story length in seconds at 1x (normal motion). */
export const STORY_DURATION = 52;

export type StoryBeat = 'intro' | 'interest' | 'win' | 'push' | 'top' | 'clear' | 'results' | 'handoff';

/** Every beat, in story order. */
export const BEATS: readonly StoryBeat[] = ['intro', 'interest', 'win', 'push', 'top', 'clear', 'results', 'handoff'];

/** Story second at which each beat starts (normal motion). */
export const BEAT_STARTS: Record<StoryBeat, number> = {
  intro: 0,
  interest: 6,
  win: 12,
  push: 18,
  top: 30,
  clear: 36,
  results: 42,
  handoff: 48,
};

/** A ball breaks up this long before its beat ends, so there is a moment to cheer before the caption moves on. */
export const SETTLE = 1.4;

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
  /** End of the "interest" beat: the first few months, so the snow settling can be seen. */
  interest: number;
  /** The first clear on either hill (the first win). */
  win: number;
  /** The other hill's first clear (the later of the two first wins). */
  other: number;
  /** The avalanche's highest-rate debt is cleared. */
  top: number;
  /** The later payoff month: the whole timeline. */
  end: number;
  /** A calm month in the long stretch, on a whole year (the reduced-motion hold and the default live caption). */
  hold: number;
}

/** The month marks the story pauses its commentary at, from the engine. */
export function storyMonthMarks(inputs: SnowInputs): StoryMarks {
  const snow = strategySchedule(inputs, 'snowball');
  const av = strategySchedule(inputs, 'avalanche');
  const end = horizonMonths(inputs);
  const winS = snow.firstWin ?? end;
  const winA = av.firstWin ?? end;
  const win = Math.min(winS, winA);
  const other = Math.max(winS, winA);
  const topAt = av.clearedAt[av.order[0]] ?? end;
  const top = Math.min(end, Math.max(other, topAt));
  const interest = Math.min(3, win);
  const year = Math.round((win + other) / 2 / 12) * 12;
  const hold = Math.min(other, Math.max(win, year || Math.round((win + other) / 2)));
  return { interest, win, other, top, end, hold };
}

let planCache: { key: string; plan: Plan } | null = null;

const keyOf = (inputs: SnowInputs, reduced: boolean): string =>
  `${inputs.budget}|${DEBTS.map((d) => `${inputs.debts[d].balance},${inputs.debts[d].apr},${inputs.debts[d].minPayment}`).join('|')}|${reduced ? 1 : 0}`;

function planFor(inputs: SnowInputs, reduced: boolean): Plan {
  const key = keyOf(inputs, reduced);
  if (planCache && planCache.key === key) return planCache.plan;
  const plan = reduced ? buildReducedPlan(inputs) : buildPlan(inputs);
  planCache = { key, plan };
  return plan;
}

function finish(partial: Omit<Plan, 'tangents'>): Plan {
  return { ...partial, tangents: tangentsFor(partial.knots) };
}

function buildPlan(inputs: SnowInputs): Plan {
  const m = storyMonthMarks(inputs);
  const S = BEAT_STARTS;
  const knots: Knot[] = [
    { t: 0, months: 0 },
    { t: S.interest, months: 0 },
    { t: S.win, months: m.interest },
    // each ball breaks up a moment before its beat ends, then the clock rests so the climber can cheer
    { t: S.push - SETTLE, months: m.win },
    { t: S.push, months: m.win },
    { t: S.top - SETTLE, months: m.other },
    { t: S.top, months: m.other },
    { t: S.clear - SETTLE, months: m.top },
    { t: S.clear, months: m.top },
    { t: S.results - SETTLE, months: m.end },
    { t: S.results, months: m.end },
    { t: STORY_DURATION, months: m.end },
  ];
  const beats: BeatStart[] = BEATS.map((beat) => ({ t: S[beat], beat }));
  return finish({ duration: STORY_DURATION, knots, beats, end: m.end });
}

/** Reduced motion: discrete holds with short eased tweens between them. */
const HOLD = 4.5;
const TWEEN = 0.4;
function buildReducedPlan(inputs: SnowInputs): Plan {
  const m = storyMonthMarks(inputs);
  const holds: Array<{ months: number; beat: StoryBeat }> = [
    { months: 0, beat: 'intro' },
    { months: m.interest, beat: 'interest' },
    { months: m.win, beat: 'win' },
    { months: m.hold, beat: 'push' },
    { months: m.top, beat: 'top' },
    { months: m.end, beat: 'clear' },
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
export function storyDuration(inputs: SnowInputs, reduced = false): number {
  return planFor(inputs, reduced).duration;
}

/** Shared-clock months at a point in the story. Monotonic non-decreasing; ends exactly at the horizon. */
export function storyMonths(storyTime: number, inputs: SnowInputs, reduced = false): number {
  return evalKnots(planFor(inputs, reduced), storyTime);
}

export function storyBeat(storyTime: number, inputs: SnowInputs, reduced = false): StoryBeat {
  const { beats } = planFor(inputs, reduced);
  let beat = beats[0].beat;
  for (const b of beats) {
    if (storyTime >= b.t) beat = b.beat;
    else break;
  }
  return beat;
}

/**
 * Opening zoom on the tops of the lanes, and the story second by which the camera is back to the whole valley.
 * (Gentle: with the slow push-in it stays under 1.3, so the outer lanes, x 120 and 880, stay in view beside the panel.)
 */
export const CAMERA_ZOOM = 1.22;
const CAMERA_HOLD = 6;
const CAMERA_OUT = 12;

/**
 * The opening camera move: close on the tops of the lanes, held through the intro (with a slow push-in), then
 * easing out to the whole valley as the first months pass. Undefined (no move) in reduced motion and once the move
 * ends, so the two hills are only ever compared at the same, full view.
 */
export function storyCamera(storyTime: number, _inputs: SnowInputs, reduced = false): { zoom: number; focus: 'both' } | undefined {
  if (reduced || storyTime >= CAMERA_OUT) return undefined;
  const u = Math.max(0, (storyTime - CAMERA_HOLD) / (CAMERA_OUT - CAMERA_HOLD));
  const e = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
  const hold = 1 + 0.05 * Math.min(1, storyTime / CAMERA_HOLD);
  return { zoom: 1 + (CAMERA_ZOOM * hold - 1) * (1 - e), focus: 'both' };
}

/* ---------------------------------------------------------------- captions */

export interface StoryCaption {
  beat: StoryBeat;
  primary: string;
  secondary?: string;
  /** True when the secondary line follows the clock (it is rewritten in place, without a crossfade). */
  live?: boolean;
}

/** The sentence both hills share when they do exactly the same thing. */
export const SAME_ORDER = 'With these debts both orders are the same.';

const the = (d: DebtId): string => `the ${DEBT_NAME[d]}`;
const plainMonths = (n: number): string => `${n} ${n === 1 ? 'month' : 'months'}`;

/** The debts a strategy cleared in a given month, in lane order. */
function clearedIn(inputs: SnowInputs, id: StrategyId, month: number): DebtId[] {
  const s = strategySchedule(inputs, id);
  return DEBTS.filter((d) => s.clearedAt[d] === month);
}

/** The debt that gets the extra the month after `month` (where a freed payment rolls on), or null if none is left. */
function rollsOnTo(inputs: SnowInputs, id: StrategyId, month: number): DebtId | null {
  const s = strategySchedule(inputs, id);
  return s.rows[month]?.target ?? null;
}

/** The live line in the push beat: "Interest so far: snowball $3,311, avalanche $2,937." */
export function interestLiveLine(inputs: SnowInputs, months: number): string {
  const [snow, av] = allStrategies(inputs, months);
  if (hillsMatch(inputs)) return `Interest so far: ${formatCurrency(snow.interestCharged)} on each hill.`;
  return `Interest so far: snowball ${formatCurrency(snow.interestCharged)}, avalanche ${formatCurrency(av.interestCharged)}.`;
}

/** "The first win" caption: who clears what first, and where its payment goes. */
function winCaption(inputs: SnowInputs): StoryCaption {
  const m = storyMonthMarks(inputs);
  const snow = strategySchedule(inputs, 'snowball');
  const av = strategySchedule(inputs, 'avalanche');
  if (snow.firstWin === null && av.firstWin === null) {
    return { beat: 'win', primary: `No debt is cleared in ${formatDuration(MAX_MONTHS)}.`, secondary: 'A little more each month makes a big difference.' };
  }
  const winners = STRATEGIES.filter((id) => strategySchedule(inputs, id).firstWin === m.win);
  const cleared = winners.map((id) => clearedIn(inputs, id, m.win));
  const same = winners.length === 2 && cleared[0].join() === cleared[1].join();
  const subject = winners.length === 1 ? STRATEGY_NAME[winners[0]] : hillsMatch(inputs) || same ? 'Both hills' : 'Each hill';
  const verb = subject.endsWith('hills') ? 'clear' : 'clears';
  const what = winners.length === 1 || same ? cleared[0].map(the).join(' and ') : 'a debt';
  const when = formatDuration(m.win);
  const freed = cleared[0].reduce((sum, d) => sum + inputs.debts[d].minPayment, 0);
  const nexts = winners.map((id) => rollsOnTo(inputs, id, m.win));
  const nextSame = nexts.every((n) => n === nexts[0]);
  const its = (winners.length === 2 && !same) || cleared[0].length > 1 ? 'Their' : 'Its';
  let roll: string;
  if (nexts.every((n) => n === null)) roll = 'That is every debt.';
  else if (winners.length === 2 && !same) roll = 'The freed payments roll on to the next debts.';
  else if (nextSame && nexts[0]) roll = `${its} ${formatMoney(freed)} ${its === 'Their' ? 'roll' : 'rolls'} on to ${the(nexts[0])}.`;
  else roll = 'The freed payment rolls on to the next debt.';
  const lead = m.win <= 12 ? 'A quick win. ' : 'The first win. ';
  if (hillsMatch(inputs)) {
    return { beat: 'win', primary: SAME_ORDER, secondary: `Both clear ${what} in ${when}. ${roll}` };
  }
  return { beat: 'win', primary: `${subject} ${verb} ${what} in ${when}.`, secondary: `${lead}${roll}` };
}

/** Caption text for a beat, using live values from the engine (never hard-coded dollars). */
export function captionForBeat(beat: StoryBeat, inputs: SnowInputs, months?: number): StoryCaption {
  const m = storyMonthMarks(inputs);
  const snow = strategySchedule(inputs, 'snowball');
  const av = strategySchedule(inputs, 'avalanche');
  const match = hillsMatch(inputs);
  switch (beat) {
    case 'intro':
      return {
        beat,
        primary: `Three debts. The same ${formatMoney(inputs.budget)} a month.`,
        secondary: 'Snowball rolls the smallest away first. Avalanche, the highest rate.',
      };
    case 'interest': {
      if (DEBTS.every((d) => inputs.debts[d].apr === 0)) {
        return { beat, primary: 'With no interest, nothing settles on them.', secondary: 'Every payment goes straight to the balance.' };
      }
      const byInterest = [...DEBTS].sort((a, b) => firstInterest(inputs.debts[b]) - firstInterest(inputs.debts[a]));
      const most = byInterest[0];
      const least = byInterest[byInterest.length - 1];
      const mostText = `Most on the ${DEBT_NAME[most]} at ${formatPercent(inputs.debts[most].apr)}.`;
      const leastText =
        inputs.debts[least].apr === 0
          ? `None on the 0% ${DEBT_NAME[least]}.`
          : `Least on the ${DEBT_NAME[least]} at ${formatPercent(inputs.debts[least].apr)}.`;
      return { beat, primary: 'Interest settles on them every month.', secondary: `${mostText} ${leastText}` };
    }
    case 'win':
      return winCaption(inputs);
    case 'push': {
      const topDebt = av.order[0];
      const topApr = inputs.debts[topDebt].apr;
      const stillPushing = (av.clearedAt[topDebt] ?? m.end) > m.other;
      const live = interestLiveLine(inputs, months ?? m.hold);
      if (match) return { beat, primary: 'Both hills keep rolling the same way.', secondary: live, live: true };
      return {
        beat,
        primary: stillPushing
          ? `Avalanche keeps pushing ${the(topDebt)}${topApr > 0 ? ` at ${formatPercent(topApr)}` : ''}.`
          : 'Both hills keep rolling their snow down.',
        secondary: live,
        live: true,
      };
    }
    case 'top': {
      const topDebt = av.order[0];
      const at = av.clearedAt[topDebt];
      if (match) {
        const first = at === null ? 'a debt' : the(topDebt);
        return { beat, primary: at === null ? 'Both hills keep going.' : `Both hills clear ${first} in ${formatDuration(at)}.`, secondary: 'The same debts, in the same order.' };
      }
      if (at === null) return { beat, primary: `Avalanche is still working on ${the(topDebt)}.`, secondary: 'Every payment still counts.' };
      return {
        beat,
        primary: `Avalanche clears ${the(topDebt)} in ${formatDuration(at)}.`,
        secondary:
          inputs.debts[topDebt].apr > 0
            ? 'The costliest debt is gone, so every dollar goes further.'
            : 'With no interest on it, only the timing changes.',
      };
    }
    case 'clear': {
      if (!snow.cleared || !av.cleared) {
        const owed = (id: StrategyId) => formatCurrency(strategySnapshot(inputs, id, strategySchedule(inputs, id).payoffMonth).owed);
        return {
          beat,
          primary: `After ${formatDuration(m.end)}, some debt is still owed.`,
          secondary: `Snowball: ${owed('snowball')} owed. Avalanche: ${owed('avalanche')} owed.`,
        };
      }
      const diff = snow.payoffMonth - av.payoffMonth;
      if (diff === 0) return { beat, primary: 'Both hills are clear.', secondary: `Both in ${formatDuration(av.payoffMonth)}.` };
      const first: StrategyId = diff > 0 ? 'avalanche' : 'snowball';
      const second: StrategyId = diff > 0 ? 'snowball' : 'avalanche';
      return {
        beat,
        primary: 'Both hills are clear.',
        secondary: `${STRATEGY_NAME[first]} in ${formatDuration(strategySchedule(inputs, first).payoffMonth)}. ${STRATEGY_NAME[second]}, ${formatDuration(Math.abs(diff))} later.`,
      };
    }
    case 'results': {
      const sInt = formatCurrency(snow.totalInterest);
      const aInt = formatCurrency(av.totalInterest);
      if (match) return { beat, primary: `Both hills: ${sInt} in interest.`, secondary: SAME_ORDER };
      let primary: string;
      if (sInt === aInt) primary = `Both hills pay ${sInt} in interest.`;
      else if (av.totalInterest < snow.totalInterest) primary = `Avalanche: ${aInt} in interest. Snowball: ${sInt}.`;
      else primary = `Snowball: ${sInt} in interest. Avalanche: ${aInt}.`;
      let secondary: string;
      if (snow.firstWin !== null && av.firstWin !== null) {
        const d = av.firstWin - snow.firstWin;
        if (d > 0) secondary = `Snowball's first win came ${plainMonths(d)} sooner.`;
        else if (d < 0) secondary = `Avalanche's first win came ${plainMonths(-d)} sooner.`;
        else secondary = `Both had their first win in month ${snow.firstWin}.`;
      } else if (snow.firstWin !== null) secondary = `Snowball's first win came in month ${snow.firstWin}.`;
      else if (av.firstWin !== null) secondary = `Avalanche's first win came in month ${av.firstWin}.`;
      else secondary = 'Neither hill has had a first win yet.';
      return { beat, primary, secondary };
    }
    case 'handoff':
      return { beat, primary: 'Explore your own debts' };
  }
}

export function storyCaption(storyTime: number, inputs: SnowInputs, reduced = false): StoryCaption {
  return captionForBeat(storyBeat(storyTime, inputs, reduced), inputs, storyMonths(storyTime, inputs, reduced));
}
