/**
 * The guided story as PURE functions of (storyTime, inputs). No DOM, no clock.
 *
 * Ages are expressed relative to the scenario: T0 = the earlier start, T1 = the later start, E = the ending age.
 * Trees are always labelled by letter, so reversed starts (B earlier than A) keep correct copy.
 */
import { formatCurrency } from '../engine';
import type { Inputs, Scenario, TreeId } from '../engine';
import { numberWord, plural } from './text';

/** Story length in seconds at 1x (normal motion). */
export const STORY_DURATION = 54;

export type StoryChapter = 'planting' | 'growing' | 'difference' | 'handoff';
export type StoryBeat = 'planting' | 'contribute' | 'bBegins' | 'reinvest' | 'difference' | 'handoff';

interface Knot {
  t: number;
  age: number;
}
interface BeatStart {
  t: number;
  beat: StoryBeat;
}
interface LoupeWindow {
  who: 'first' | 'second';
  t0: number;
  t1: number;
  target: 'roots' | 'branches' | 'canopy';
}
interface Plan {
  duration: number;
  knots: Knot[];
  tangents: number[];
  beats: BeatStart[];
  loupes: LoupeWindow[];
  fade: number;
  first: TreeId;
  second: TreeId;
  /** Earlier start, later start, end: all in months. */
  t0: number;
  t1: number;
  end: number;
}

const BEAT_CHAPTER: Record<StoryBeat, StoryChapter> = {
  planting: 'planting',
  contribute: 'growing',
  bBegins: 'growing',
  reinvest: 'growing',
  difference: 'difference',
  handoff: 'handoff',
};

/** Fritsch-Butland monotone tangents: smooth joins, flat holds, never overshoots. */
function tangentsFor(knots: Knot[]): number[] {
  const n = knots.length;
  const m = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const h0 = knots[k].t - knots[k - 1].t;
    const h1 = knots[k + 1].t - knots[k].t;
    const d0 = (knots[k].age - knots[k - 1].age) / h0;
    const d1 = (knots[k + 1].age - knots[k].age) / h1;
    if (d0 * d1 <= 0) continue;
    const w1 = 2 * h1 + h0;
    const w2 = h1 + 2 * h0;
    m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
  }
  return m;
}

let planCache: { key: string; plan: Plan } | null = null;

function planFor(inputs: Inputs, reduced: boolean): Plan {
  const key = `${inputs.startAgeA}|${inputs.startAgeB}|${inputs.endAge}|${reduced ? 1 : 0}`;
  if (planCache && planCache.key === key) return planCache.plan;
  const plan = reduced ? buildReducedPlan(inputs) : buildPlan(inputs);
  planCache = { key, plan };
  return plan;
}

function common(inputs: Inputs) {
  const sA = inputs.startAgeA * 12;
  const sB = inputs.startAgeB * 12;
  const end = inputs.endAge * 12;
  const first: TreeId = sA <= sB ? 'A' : 'B';
  const second: TreeId = first === 'A' ? 'B' : 'A';
  const t0 = Math.min(sA, sB);
  const t1 = Math.max(sA, sB);
  const hasLate = t1 > t0;
  const grows = end > t0;
  return { first, second, t0, t1, end, hasLate, grows };
}

function finish(partial: Omit<Plan, 'tangents'>): Plan {
  return { ...partial, tangents: tangentsFor(partial.knots) };
}

function buildPlan(inputs: Inputs): Plan {
  const { first, second, t0, t1, end, hasLate, grows } = common(inputs);
  const knots: Knot[] = [
    { t: 0, age: t0 },
    { t: 7, age: Math.min(end, t0 + 3) },
  ];
  const beats: BeatStart[] = [{ t: 0, beat: 'planting' }];
  if (grows) {
    beats.push({ t: 7, beat: 'contribute' });
    if (hasLate) {
      knots.push({ t: 15, age: t1 }, { t: 18, age: Math.min(end, t1 + 4.8) });
      beats.push({ t: 15, beat: 'bBegins' });
    }
    beats.push({ t: 18, beat: 'reinvest' });
  }
  knots.push({ t: 37, age: end }, { t: STORY_DURATION, age: end });
  beats.push({ t: 37, beat: 'difference' }, { t: 50, beat: 'handoff' });
  const loupes: LoupeWindow[] = [];
  if (grows) {
    loupes.push({ who: 'first', t0: 1.5, t1: 6.5, target: 'roots' }, { who: 'first', t0: 8, t1: 12, target: 'roots' });
    if (hasLate && t1 < end) loupes.push({ who: 'second', t0: 15.3, t1: 18, target: 'roots' });
    loupes.push({ who: 'first', t0: 25, t1: 30, target: 'branches' });
  }
  return finish({ duration: STORY_DURATION, knots, beats, loupes, fade: 0.6, first, second, t0, t1, end });
}

/** Reduced motion: discrete holds with short eased tweens between them. */
const HOLD = 4.5;
const TWEEN = 0.4;
function buildReducedPlan(inputs: Inputs): Plan {
  const { first, second, t0, t1, end, hasLate, grows } = common(inputs);
  const holds: Array<{ age: number; beat: StoryBeat }> = [{ age: t0, beat: 'planting' }];
  if (grows) {
    holds.push({ age: Math.min(end, t0 + 3), beat: 'contribute' });
    let from = t0 + 3;
    if (hasLate) {
      holds.push({ age: t1, beat: 'bBegins' });
      from = t1;
    }
    // Three even steps from `from` to the end, snapped to whole years; the last is the end itself.
    const span = end - from;
    let prev = from;
    for (let k = 1; k <= 3; k++) {
      let age = k === 3 ? end : from + Math.round((span * k) / 3 / 12) * 12;
      age = Math.min(end, Math.max(prev, age));
      if (age > prev + 1e-9) {
        holds.push({ age, beat: age >= end ? 'difference' : 'reinvest' });
        prev = age;
      }
    }
    if (holds[holds.length - 1].beat !== 'difference') holds.push({ age: end, beat: 'difference' });
  } else {
    holds.push({ age: end, beat: 'difference' });
  }
  const knots: Knot[] = [];
  const beats: BeatStart[] = [];
  const holdStart: number[] = [];
  let t = 0;
  holds.forEach((h, i) => {
    const len = h.beat === 'difference' ? 7 : HOLD;
    holdStart.push(t);
    beats.push({ t, beat: h.beat });
    knots.push({ t, age: h.age }, { t: t + len, age: h.age });
    t += len + (i < holds.length - 1 ? TWEEN : 0);
  });
  beats.push({ t, beat: 'handoff' });
  knots.push({ t: t + 3, age: end });
  // Static loupes: roots at the "contribute" hold, branches at a middle "reinvest" hold.
  const loupes: LoupeWindow[] = [];
  if (grows) {
    loupes.push({ who: 'first', t0: holdStart[0], t1: holdStart[0] + HOLD, target: 'roots' });
    const bi = holds.findIndex((h) => h.beat === 'bBegins');
    if (bi >= 0 && t1 < end) loupes.push({ who: 'second', t0: holdStart[bi], t1: holdStart[bi] + HOLD, target: 'roots' });
    const ci = holds.findIndex((h) => h.beat === 'contribute');
    if (ci >= 0) loupes.push({ who: 'first', t0: holdStart[ci], t1: holdStart[ci] + HOLD, target: 'roots' });
    const rs = holds.map((h, i) => (h.beat === 'reinvest' ? i : -1)).filter((i) => i >= 0);
    if (rs.length) {
      const i = rs[Math.floor((rs.length - 1) / 2)];
      loupes.push({ who: 'first', t0: holdStart[i], t1: holdStart[i] + HOLD, target: 'branches' });
    }
  }
  return finish({ duration: t + 3, knots, beats, loupes, fade: TWEEN, first, second, t0, t1, end });
}

function evalKnots(plan: Plan, t: number): number {
  const { knots, tangents } = plan;
  if (t <= knots[0].t) return knots[0].age;
  const last = knots[knots.length - 1];
  if (t >= last.t) return last.age;
  let i = 0;
  while (i < knots.length - 2 && t >= knots[i + 1].t) i++;
  const a = knots[i];
  const b = knots[i + 1];
  const h = b.t - a.t;
  const u = (t - a.t) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const age =
    (2 * u3 - 3 * u2 + 1) * a.age +
    (u3 - 2 * u2 + u) * h * tangents[i] +
    (-2 * u3 + 3 * u2) * b.age +
    (u3 - u2) * h * tangents[i + 1];
  return Math.min(plan.end, Math.max(plan.t0, age));
}

/** Total story length in seconds for these inputs (54 in normal motion). */
export function storyDuration(inputs: Inputs, reduced = false): number {
  return planFor(inputs, reduced).duration;
}

/** Shared-clock age (months, float) at a point in the story. Monotonic non-decreasing; ends exactly at endAge. */
export function storyAge(storyTime: number, inputs: Inputs, reduced = false): number {
  return evalKnots(planFor(inputs, reduced), storyTime);
}

export function storyBeat(storyTime: number, inputs: Inputs, reduced = false): StoryBeat {
  const { beats } = planFor(inputs, reduced);
  let beat = beats[0].beat;
  for (const b of beats) {
    if (storyTime >= b.t) beat = b.beat;
    else break;
  }
  return beat;
}

export function storyChapter(storyTime: number, inputs: Inputs, reduced = false): StoryChapter {
  return BEAT_CHAPTER[storyBeat(storyTime, inputs, reduced)];
}

export interface Loupe {
  tree: TreeId;
  target: 'roots' | 'branches' | 'canopy';
  strength: number;
}

/**
 * Loupe windows: first tree roots 1.5-6.5 s (seedling) and 8-12 s, second tree roots 15.3-18 s (its planting beat),
 * first tree branches 25-30 s. Faded in and out.
 */
export function loupeAt(storyTime: number, inputs: Inputs, reduced = false): Loupe | undefined {
  const plan = planFor(inputs, reduced);
  for (const w of plan.loupes) {
    if (storyTime < w.t0 || storyTime > w.t1) continue;
    const inn = Math.min(1, (storyTime - w.t0) / plan.fade);
    const out = Math.min(1, (w.t1 - storyTime) / plan.fade);
    const strength = Math.min(inn, out);
    const e = strength * strength * (3 - 2 * strength);
    if (e > 0) return { tree: w.who === 'first' ? plan.first : plan.second, target: w.target, strength: e };
  }
  return undefined;
}

export interface StoryCaption {
  beat: StoryBeat;
  primary: string;
  secondary?: string;
}

/** Caption text for a beat, using live values from the scenario (never hard-coded dollars). */
export function captionForBeat(beat: StoryBeat, sc: Scenario): StoryCaption {
  const { inputs } = sc;
  const c = common(inputs);
  switch (beat) {
    case 'planting': {
      if (!c.grows) {
        return {
          beat,
          primary: 'Same monthly contribution. No time to grow.',
          secondary: `Both trees start at ${inputs.startAgeA}, the age the timeline ends.`,
        };
      }
      if (!c.hasLate) {
        return {
          beat,
          primary: 'Same monthly contribution. Same starting age.',
          secondary: `Both trees start at ${inputs.startAgeA}.`,
        };
      }
      return {
        beat,
        primary: 'Same monthly contribution. Different starting ages.',
        secondary: `Tree A starts at ${inputs.startAgeA}. Tree B starts at ${inputs.startAgeB}.`,
      };
    }
    case 'contribute':
      return {
        beat,
        primary:
          inputs.monthlyContribution > 0
            ? `Each month, ${formatCurrency(inputs.monthlyContribution)} goes in.`
            : 'In this scenario, nothing goes in each month.',
        secondary: c.hasLate ? `Tree ${c.second} waits until ${c.t1 / 12}.` : undefined,
      };
    case 'bBegins':
      return {
        beat,
        primary:
          c.t1 >= c.end
            ? `Tree ${c.second} starts at ${c.t1 / 12}, so it has no growing time.`
            : `At ${c.t1 / 12}, Tree ${c.second} begins.`,
      };
    case 'reinvest':
      return {
        beat,
        primary:
          inputs.annualReturn > 0
            ? 'Growth is reinvested, so branches grow new branches.'
            : 'With no positive return, growth comes only from contributions.',
      };
    case 'difference':
      return differenceCaption(sc);
    case 'handoff':
      return { beat, primary: 'Explore your own timeline' };
  }
}

function differenceCaption(sc: Scenario): StoryCaption {
  const { inputs } = sc;
  const c = common(inputs);
  const finalA = sc.a.balance[sc.a.months] ?? 0;
  const finalB = sc.b.balance[sc.b.months] ?? 0;
  const contribA = sc.a.contributed[sc.a.months] ?? 0;
  const contribB = sc.b.contributed[sc.b.months] ?? 0;
  if (!c.hasLate) {
    return {
      beat: 'difference',
      primary: 'Starting together, the two trees grow together.',
      secondary: c.grows
        ? `Each ends at ${formatCurrency(finalA)}.`
        : `With no growing time before ${inputs.endAge}, each stays at ${formatCurrency(finalA)}.`,
    };
  }
  if (inputs.monthlyContribution <= 0) {
    return {
      beat: 'difference',
      primary: 'Time gives growth room to branch.',
      secondary: 'With nothing going in each month, there is nothing yet to compound.',
    };
  }
  // Reference = the earlier-starting tree, so the copy stays correct for reversed starts.
  const early = c.first === 'A' ? { bal: finalA, con: contribA } : { bal: finalB, con: contribB };
  const late = c.first === 'A' ? { bal: finalB, con: contribB } : { bal: finalA, con: contribA };
  const gapContrib = early.con - late.con;
  const gapGrowth = early.bal - late.bal - gapContrib;
  const years = Math.round((c.t1 - c.t0) / 12);
  const yearsText = `${numberWord(years)} more ${plural(years, 'year')}`;
  const secondary =
    gapGrowth >= 0
      ? `${formatCurrency(gapContrib)} of the gap is extra contributions. ${formatCurrency(gapGrowth)} is growth that had ${yearsText} to compound.`
      : `${formatCurrency(gapContrib)} is extra contributions. With a negative return, the earlier start adds ${formatCurrency(gapGrowth)} of modeled growth.`;
  return { beat: 'difference', primary: 'Time gives growth room to branch.', secondary };
}

export function storyCaption(storyTime: number, sc: Scenario, reduced = false): StoryCaption {
  return captionForBeat(storyBeat(storyTime, sc.inputs, reduced), sc);
}
