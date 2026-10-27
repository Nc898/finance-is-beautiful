/**
 * The milestone notes, and the moments the view comes in close, as PURE functions of (the age on the clock, inputs).
 * No story: whether the timeline is played or dragged, the note and the view are the ones for that moment.
 *
 *   just planted                       planting    the same monthly contribution, the two starting ages
 *   until the later tree is planted    contribute  each month this much goes in; the later tree waits
 *   the year after it is planted       bBegins     the later tree begins
 *   until the end                      reinvest    growth is reinvested, so branches grow new branches
 *   the end                            difference  how much of the gap is contributions, and how much growth
 * The close view: the first seedling, close, at its planting, pulling back over its first years (cameraAt), and a
 * loupe on the second seedling's roots as it is planted (loupeAt). Neither in reduced motion.
 *
 * Ages are relative to the scenario: T0 = the earlier start, T1 = the later start, E = the ending age (all months).
 * Trees are always labelled by letter, so reversed starts (B earlier than A) keep correct copy.
 */
import { formatCurrency } from '../engine';
import { WORLD } from '../scene/types';
import type { Inputs, Scenario, TreeId } from '../engine';
import { numberWord, plural } from './text';

export type NoteKind = 'planting' | 'contribute' | 'bBegins' | 'reinvest' | 'difference';

/** Every note, in timeline order (for measuring the tallest caption). */
export const NOTE_KINDS: readonly NoteKind[] = ['planting', 'contribute', 'bBegins', 'reinvest', 'difference'];

/** The planting note shows for the first few months; the later tree's note for its first year. */
const PLANTING_MONTHS = 3;
const BEGINS_MONTHS = 12;

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

/** Which note the age on the clock calls for. */
export function noteKindAt(ageMonths: number, inputs: Inputs): NoteKind {
  const c = common(inputs);
  if (ageMonths >= c.end - 1e-6) return 'difference';
  if (ageMonths < c.t0 + PLANTING_MONTHS) return 'planting';
  if (c.hasLate && ageMonths < c.t1) return 'contribute';
  if (c.hasLate && ageMonths < c.t1 + BEGINS_MONTHS) return 'bBegins';
  if (!c.hasLate && ageMonths < c.t0 + PLANTING_MONTHS + BEGINS_MONTHS) return 'contribute';
  return 'reinvest';
}

/** The note for the age on the clock. */
export function noteAt(ageMonths: number, sc: Scenario): Note {
  return noteFor(noteKindAt(ageMonths, sc.inputs), sc);
}

/* ---------------------------------------------------------------- the close view */

export interface Loupe {
  tree: TreeId;
  target: 'roots' | 'branches' | 'canopy';
  strength: number;
}

/** The loupe on the second seedling's roots: from its planting for this many months, faded in and out over FADE. */
const LOUPE_MONTHS = 5;
const LOUPE_FADE = 1;

/** The loupe at this age: the second tree's roots as it is planted (when there is a later tree with time to grow). */
export function loupeAt(ageMonths: number, inputs: Inputs, reduced = false): Loupe | undefined {
  if (reduced) return undefined;
  const c = common(inputs);
  if (!c.hasLate || c.t1 >= c.end) return undefined;
  const t = ageMonths - c.t1;
  if (t < 0 || t > LOUPE_MONTHS) return undefined;
  const strength = Math.min(1, t / LOUPE_FADE, (LOUPE_MONTHS - t) / LOUPE_FADE);
  const e = strength * strength * (3 - 2 * strength);
  return e > 0 ? { tree: c.second, target: 'roots', strength: e } : undefined;
}

/** Close-up zoom on the first seedling. */
export const CAMERA_ZOOM = 3.4;
/** It holds close for the first months, then pulls back over this share of the time to the later planting. */
const CAMERA_HOLD_MONTHS = 3;
const CAMERA_OUT_SHARE = 0.92;
/** (with one tree, or both planted together: the pull back takes the first years) */
const CAMERA_OUT_ALONE = 96;

/**
 * The close view: close on the first seedling at its planting, held for its first months, then pulling back to the
 * full shared view before the second tree is planted. Undefined (no zoom) in reduced motion, when nothing grows, and
 * once the view is back, so the trees are only ever compared at the same, full view.
 */
export function cameraAt(ageMonths: number, inputs: Inputs, reduced = false): { zoom: number; focus: { x: number; y: number }; tree: TreeId } | undefined {
  if (reduced) return undefined;
  const c = common(inputs);
  if (!c.grows) return undefined;
  const hold = c.t0 + CAMERA_HOLD_MONTHS;
  const out = c.hasLate ? c.t0 + Math.max(CAMERA_HOLD_MONTHS + 6, (c.t1 - c.t0) * CAMERA_OUT_SHARE) : c.t0 + CAMERA_OUT_ALONE;
  const done = Math.min(out, c.end);
  if (ageMonths >= done) return undefined;
  const u = Math.max(0, Math.min(1, (ageMonths - hold) / Math.max(1, done - hold)));
  const e = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
  const zoom = 1 + (CAMERA_ZOOM - 1) * (1 - e);
  // keep the young tree framed as it grows: the focus rises from the seedling toward its crown
  const focusY = 14 + 60 * e;
  return { zoom, focus: { x: WORLD.treeX[c.first], y: focusY }, tree: c.first };
}

/* ---------------------------------------------------------------- the note text */

export interface Note {
  kind: NoteKind;
  primary: string;
  secondary?: string;
}

/** The note text, using live values from the scenario (never hard-coded dollars). */
export function noteFor(kind: NoteKind, sc: Scenario): Note {
  const { inputs } = sc;
  const c = common(inputs);
  switch (kind) {
    case 'planting': {
      if (!c.grows) {
        return {
          kind,
          primary: 'Same monthly contribution. No time to grow.',
          secondary: `Both trees start at ${inputs.startAgeA}, the age the timeline ends.`,
        };
      }
      if (!c.hasLate) {
        return {
          kind,
          primary: 'Same monthly contribution. Same starting age.',
          secondary: `Both trees start at ${inputs.startAgeA}.`,
        };
      }
      return {
        kind,
        primary: 'Same monthly contribution. Different starting ages.',
        secondary: `Tree A starts at ${inputs.startAgeA}. Tree B starts at ${inputs.startAgeB}.`,
      };
    }
    case 'contribute':
      return {
        kind,
        primary:
          inputs.monthlyContribution > 0
            ? `Each month, ${formatCurrency(inputs.monthlyContribution)} goes in.`
            : 'In this scenario, nothing goes in each month.',
        secondary: c.hasLate ? `Tree ${c.second} waits until ${c.t1 / 12}.` : undefined,
      };
    case 'bBegins':
      return {
        kind,
        primary:
          c.t1 >= c.end
            ? `Tree ${c.second} starts at ${c.t1 / 12}, so it has no growing time.`
            : `At ${c.t1 / 12}, Tree ${c.second} begins.`,
      };
    case 'reinvest':
      return {
        kind,
        primary:
          inputs.annualReturn > 0
            ? 'Growth is reinvested, so branches grow new branches.'
            : 'With no positive return, growth comes only from contributions.',
      };
    case 'difference':
      return differenceCaption(sc);
  }
}

function differenceCaption(sc: Scenario): Note {
  const { inputs } = sc;
  const c = common(inputs);
  const finalA = sc.a.balance[sc.a.months] ?? 0;
  const finalB = sc.b.balance[sc.b.months] ?? 0;
  const contribA = sc.a.contributed[sc.a.months] ?? 0;
  const contribB = sc.b.contributed[sc.b.months] ?? 0;
  if (!c.hasLate) {
    return {
      kind: 'difference',
      primary: 'Starting together, the two trees grow together.',
      secondary: c.grows
        ? `Each ends at ${formatCurrency(finalA)}.`
        : `With no growing time before ${inputs.endAge}, each stays at ${formatCurrency(finalA)}.`,
    };
  }
  if (inputs.monthlyContribution <= 0) {
    return {
      kind: 'difference',
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
  return { kind: 'difference', primary: 'Time gives growth room to branch.', secondary };
}
