/** Pure text helpers shared by the story, UI and tests. No DOM access. */
import { formatCurrency, formatPercent, snapshotAt } from '../engine';
import type { Scenario, TreeSnapshot } from '../engine';

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

/** 0-20 as words, otherwise digits. */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

export function plural(n: number, one: string, many = one + 's'): string {
  return n === 1 ? one : many;
}

/** Whole years and remaining whole months for a float month count. */
export function splitAge(ageMonths: number): { years: number; months: number } {
  const total = Math.max(0, Math.floor(ageMonths + 1e-9));
  return { years: Math.floor(total / 12), months: total % 12 };
}

/** "Age 45 years, 3 months" (for aria-valuetext and announcements). */
export function ageSpoken(ageMonths: number): string {
  const { years, months } = splitAge(ageMonths);
  const y = `${years} ${plural(years, 'year')}`;
  return months === 0 ? `Age ${y}` : `Age ${y}, ${months} ${plural(months, 'month')}`;
}

/** Compact visual readout: "45 y 3 mo". */
export function ageShort(ageMonths: number): string {
  const { years, months } = splitAge(ageMonths);
  return months === 0 ? `${years} y` : `${years} y ${months} mo`;
}

export interface TreePair {
  a: TreeSnapshot;
  b: TreeSnapshot;
}

export function exactPair(sc: Scenario, ageMonths: number): TreePair {
  return { a: snapshotAt(sc.a, ageMonths, 'exact'), b: snapshotAt(sc.b, ageMonths, 'exact') };
}

export interface Gap {
  /** The tree with the larger balance (A on a tie). */
  leader: 'A' | 'B';
  balance: number;
  contributions: number;
  growth: number;
}

/** Difference between the trees, expressed relative to whichever is ahead. */
export function gapOf(pair: TreePair): Gap {
  const leadA = pair.a.balance >= pair.b.balance;
  const [l, o] = leadA ? [pair.a, pair.b] : [pair.b, pair.a];
  return {
    leader: leadA ? 'A' : 'B',
    balance: l.balance - o.balance,
    contributions: l.contributed - o.contributed,
    growth: l.growth - o.growth,
  };
}

/** One-line description of a tree, used by the canvas label and the hidden summary. */
function treeSummary(id: 'A' | 'B', startAge: number, snap: TreeSnapshot, endAge: number): string {
  if (startAge >= endAge) return `Tree ${id} starts at ${startAge}, the ending age, so it has no growing time.`;
  if (!snap.planted) return `Tree ${id} is not planted yet; it plants at age ${startAge}.`;
  return `Tree ${id}, started at ${startAge}, holds ${formatCurrency(snap.balance)}: ${formatCurrency(snap.contributed)} contributed and ${formatCurrency(snap.growth)} modeled growth.`;
}

/** Text alternative for the whole scene at the current age. Updated on discrete changes only. */
export function sceneSummary(sc: Scenario, ageMonths: number): string {
  const { inputs } = sc;
  const pair = exactPair(sc, ageMonths);
  const parts = [
    `Two trees grown from ${formatCurrency(inputs.monthlyContribution)} a month at a hypothetical ${formatPercent(inputs.annualReturn)} a year.`,
    `${ageSpoken(ageMonths)}.`,
    treeSummary('A', inputs.startAgeA, pair.a, inputs.endAge),
    treeSummary('B', inputs.startAgeB, pair.b, inputs.endAge),
  ];
  if (pair.a.planted && pair.b.planted) {
    const g = gapOf(pair);
    parts.push(
      `Tree ${g.leader} is ahead by ${formatCurrency(g.balance)}: ${formatCurrency(g.contributions)} from extra contributions and ${formatCurrency(g.growth)} from extra modeled growth.`,
    );
  }
  return parts.join(' ');
}

/** "480 monthly contributions from 25 to 65", or a sentence for the zero case. */
export function contributionCount(startAge: number, endAge: number, months: number): string {
  if (months <= 0) return `No monthly contributions (starts at ${startAge}, the ending age)`;
  return `${months} monthly ${plural(months, 'contribution')} from ${startAge} to ${endAge}`;
}
