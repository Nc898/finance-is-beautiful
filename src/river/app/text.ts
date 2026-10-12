/** Pure text helpers shared by the UI and tests. No DOM access. */
import {
  BOAT_NAMES,
  allBoats,
  boatLabel,
  buyingPowerChange,
  buysToday,
  formatChange,
  formatCurrency,
  formatPercent,
  yearSpoken,
} from '../engine';
import type { BoatId, BoatSnapshot, RiverInputs } from '../engine';

/** One sentence about a boat, used by the canvas label and the hidden summary. */
export function boatSentence(inputs: RiverInputs, snap: BoatSnapshot): string {
  const name = BOAT_NAMES[snap.id];
  const kind =
    snap.id === 'cash'
      ? `${name} earns nothing`
      : `${name} earns ${formatPercent(snap.rate)} a year`;
  return `${kind}: ${formatCurrency(snap.nominal)} in the boat, which ${buysToday(snap.real)} (${formatChange(buyingPowerChange(snap, inputs.start))} in buying power).`;
}

/** Which boat is farthest upstream (largest buying power) at these inputs and time; cash wins ties last. */
export function leader(snaps: readonly BoatSnapshot[]): BoatId {
  let best = snaps[0];
  for (const s of snaps) if (s.logReal > best.logReal + 1e-12) best = s;
  return best.id;
}

/** Text alternative for the whole scene at the current year. Updated on discrete changes only. */
export function sceneSummary(inputs: RiverInputs, years: number): string {
  const snaps = allBoats(inputs, years);
  const inflation =
    inputs.inflation > 0
      ? `Prices rise ${formatPercent(inputs.inflation)} a year, a current that carries money downstream`
      : 'Prices hold steady, so the water is still';
  const parts = [
    `Three rowboats leave the same dock with ${formatCurrency(inputs.start)} each. ${inflation}.`,
    `${yearSpoken(years)} of ${inputs.years}.`,
    ...snaps.map((s) => boatSentence(inputs, s)),
  ];
  if (years > 0) {
    const lead = leader(snaps);
    const best = snaps.find((s) => s.id === lead)!;
    parts.push(
      best.logReal > 1e-9
        ? `${BOAT_NAMES[lead]} has made headway against the current.`
        : 'No boat has made headway against the current yet.',
    );
  }
  return parts.join(' ');
}

/** The short results sentence announced when inputs change. */
export function resultsSentence(inputs: RiverInputs): string {
  const [cash, savings, invest] = allBoats(inputs, inputs.years);
  return `After ${inputs.years} ${inputs.years === 1 ? 'year' : 'years'}: cash buys what ${formatCurrency(cash.real)} buys today, the savings account ${formatCurrency(savings.real)}, investing ${formatCurrency(invest.real)}.`;
}

/** Label text for a boat's DOM label. */
export interface BoatLabelText {
  name: string;
  amount: string;
  buys: string;
}

export function boatLabelText(inputs: RiverInputs, snap: BoatSnapshot): BoatLabelText {
  return { name: boatLabel(snap.id, inputs), amount: formatCurrency(snap.nominal), buys: buysToday(snap.real) };
}

