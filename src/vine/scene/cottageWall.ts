/**
 * The cottage wall: pale lime mortar, then random-rubble fieldstone laid course by course (every stone its own
 * wash of warm grey, ochre, buff or blue-grey), pinnings in the gaps, dressed quoins at both corners, a dark
 * plinth, rising damp and moss at the foot, and the roof's shadow under the eaves.
 */
import { makeNoise2D } from '../../scene/prng';
import { rgba, tracePoly } from '../../scene/watercolor';
import { mix } from '../../river/scene/boatInk';
import { GROUND_Y } from './geom';
import { edgeInk, lump, softWash, type Paint } from './cottagePaint';
import { backrun, detailAt, wcStone } from './cottageWash';

const STONES_L = ['#C9B592', '#B8A383', '#D2BF9C', '#A99A80', '#C4AB84', '#B39C7A', '#CDBFA2', '#9C968C', '#A3A7A4', '#C6A678', '#BCAE98', '#B5A58C'];
const STONES_R = ['#D4B988', '#C6A877', '#DCC393', '#B8996B', '#CCAE7C', '#C4A078', '#D6BF92', '#AFA896', '#A4A9A6', '#CE9F62', '#C2AE8E', '#BFA17A'];
const QUOINS = ['#EBD6AA', '#E2CCA0', '#F0DFBC', '#DCC59A'];

/** the bottom of the roof's eave at x (the wall shows below it) */
export type EaveFn = (x: number) => number;

export function paintWall(P: Paint): void {
  const { ctx, rnd, c, id } = P;
  const wall = c.wall;
  const warm = id === 'fixed';
  const pal = warm ? STONES_R : STONES_L;
  const nz = makeNoise2D(warm ? 311 : 173);
  const top = 326;
  const W = wall.x1 - wall.x0;

  const vis = detailAt(P);
  ctx.save();
  ctx.beginPath();
  ctx.rect(wall.x0, top - 4, W, GROUND_Y - top + 8);
  ctx.clip();
  // ---- the wall as one wet wash first: pale warm stone, the colours run into each other while wet (sienna, a cool
  // grey, a rose-grey, a little green near the ground), lighter where the sun is, cooler and deeper lower right
  ctx.fillStyle = warm ? '#E2D4B4' : '#DDD2BA';
  ctx.fillRect(wall.x0, top, W, GROUND_Y - top + 1);
  const wet = (n: number, cols: string[], a: number, rx: [number, number], ry: [number, number], yb: [number, number] = [top, GROUND_Y]) => {
    for (let i = 0; i < n; i++) {
      softWash(ctx, lump(wall.x0 + rnd.range(-10, W + 10), rnd.range(yb[0], yb[1]), rnd.range(rx[0], rx[1]), rnd.range(ry[0], ry[1]), rnd, 12, 0.3), rnd.pick(cols), a, rnd, 4, 0.5);
    }
  };
  wet(16, warm ? ['#D2B07A', '#C9A06C', '#DCC08C'] : ['#C9AE84', '#BFA27A', '#D4BC94'], 0.34, [30, 70], [14, 30]);
  wet(12, ['#A9A8A6', '#9EA3AA', '#B4AFA8'], 0.26, [26, 60], [12, 26]);
  wet(8, ['#BC9E92', '#B3968E', '#C6A89A'], 0.2, [24, 50], [10, 22]);
  wet(8, ['#8E9874', '#7E8C6C'], 0.2, [20, 50], [6, 14], [GROUND_Y - 34, GROUND_Y]);
  const sg = ctx.createLinearGradient(wall.x0, top, wall.x1, GROUND_Y);
  sg.addColorStop(0, 'rgba(255,246,222,0.32)');
  sg.addColorStop(0.42, 'rgba(255,246,222,0)');
  sg.addColorStop(1, 'rgba(70,58,90,0.3)');
  ctx.fillStyle = sg;
  ctx.fillRect(wall.x0, top, W, GROUND_Y - top);
  // a couple of drying backruns (the wash ran back into itself)
  for (let i = 0; i < 3; i++) backrun(ctx, wall.x0 + rnd.range(20, W - 20), rnd.range(top + 30, GROUND_Y - 30), rnd.range(14, 30), rnd.range(8, 16), rnd.pick(['#B8A27E', '#A6A2A0']), 0.3, rnd);

  // ---- the rubble, plinth first then course by course: stated where the eye goes, lost in the sunlit middle
  const plinthH = 11;
  let yb = GROUND_Y;
  {
    let x = wall.x0;
    while (x < wall.x1) {
      const w = Math.min(rnd.range(22, 40), wall.x1 - x);
      const col = mix(rnd.pick(pal), '#6F6A62', 0.32);
      wcStone(P, x, yb - plinthH + rnd.range(-0.3, 0.3), w - 1.2, plinthH, col, { vis: Math.max(0.55, vis(x + w / 2, yb - 5)), round: 2.2 });
      x += w;
    }
    yb -= plinthH;
  }
  while (yb > top - 6) {
    const ch = rnd.range(9, 15.5);
    let x = wall.x0 - rnd.range(0, 8);
    while (x < wall.x1) {
      let w = rnd.range(12, 36);
      if (rnd.chance(0.14)) w = rnd.range(8, 12);
      if (wall.x1 - (x + w) < 9) w = wall.x1 - x + 6;
      const hh = ch * rnd.range(0.8, 1.0);
      const by = yb + rnd.range(-0.5, 0.5);
      // tone follows slow noise over the wall and gets damper and darker toward the ground
      const n = nz((x + w / 2) * 0.017, by * 0.03);
      const damp = Math.max(0, Math.min(1, (by - (GROUND_Y - 44)) / 44));
      let col = rnd.pick(pal);
      col = mix(col, n > 0.55 ? '#F2E3C2' : '#8C8478', Math.abs(n - 0.5) * 0.7);
      col = mix(col, rnd.pick(['#C7A163', '#8E8A86', '#B98A5E', '#A2A8A4']), rnd.range(0, 0.22));
      col = mix(col, '#5E645C', damp * 0.34);
      const gap = rnd.range(1.0, 1.7);
      const v = vis(x + w / 2, by - hh / 2) * rnd.range(0.75, 1.15);
      wcStone(P, x + gap / 2, by - hh, w - gap, hh - 0.2, col, { vis: v });
      x += w;
    }
    yb -= ch;
  }

  // ---- quoins: dressed corner stones, long and short alternating, pale and squarely cut (the corners are stated)
  const qh0 = 14;
  for (const side of [0, 1]) {
    let y = GROUND_Y - plinthH;
    let k = side;
    while (y > top - 4) {
      const hh = qh0 + rnd.range(-1.3, 1.5);
      const long = k % 2 === 0;
      const w = long ? rnd.range(24, 29) : rnd.range(14, 17);
      const x = side === 0 ? wall.x0 - 0.4 : wall.x1 - w + 0.4;
      softWash(ctx, [x, y - hh, x + w, y - hh, x + w, y, x, y], '#EFE4CC', 0.5, rnd, 2, 0.9, 0.02);
      const col = mix(rnd.pick(QUOINS), '#A89A80', Math.max(0, (y - (GROUND_Y - 40)) / 40) * 0.25);
      wcStone(P, x + 0.5, y - hh + 0.5, w - 1, hh - 1, col, { vis: 0.55 + 0.4 * vis(x + w / 2, y - hh / 2), dressed: true, lit: 0.5 });
      y -= hh;
      k++;
    }
  }

  // ---- the wall is darker and damper near the ground: a ragged rising-damp line, soil splash, moss
  for (let i = 0; i < 52; i++) {
    const cx = wall.x0 + rnd.range(0, W);
    const hgt = rnd.range(6, 30);
    softWash(ctx, lump(cx, GROUND_Y - hgt * 0.4, rnd.range(10, 26), hgt * 0.8, rnd, 10, 0.3), rnd.pick(['#56604E', '#5C6458', '#4F5648']), 0.12, rnd, 3, 0.55);
  }
  const dg = ctx.createLinearGradient(0, GROUND_Y - 22, 0, GROUND_Y);
  dg.addColorStop(0, 'rgba(70,56,52,0)');
  dg.addColorStop(1, 'rgba(70,56,52,0.34)');
  ctx.fillStyle = dg;
  ctx.fillRect(wall.x0, GROUND_Y - 22, W, 22);
  for (let i = 0; i < 70; i++) {
    const x = wall.x0 + rnd.range(0, W);
    const y = GROUND_Y - rnd.range(0, 16) * rnd.next();
    ctx.fillStyle = rgba(rnd.pick(['#7C8A46', '#93A04C', '#6C7C42', '#A6AE5C']), rnd.range(0.2, 0.42));
    ctx.beginPath();
    ctx.ellipse(x, y, rnd.range(1.2, 4.2), rnd.range(0.7, 1.9), rnd.range(-0.3, 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  // ---- light across the whole wall: warm upper left, cooler and deeper lower right
  const lg = ctx.createLinearGradient(wall.x0, top, wall.x1, GROUND_Y);
  lg.addColorStop(0, 'rgba(255,238,196,0.12)');
  lg.addColorStop(0.5, 'rgba(255,238,196,0)');
  lg.addColorStop(1, 'rgba(84,70,100,0.12)');
  ctx.fillStyle = lg;
  ctx.fillRect(wall.x0, top, W, GROUND_Y - top);
  // the far (right) corner turns a little into shade
  const eg = ctx.createLinearGradient(wall.x1 - 26, 0, wall.x1, 0);
  eg.addColorStop(0, 'rgba(70,56,86,0)');
  eg.addColorStop(1, 'rgba(70,56,86,0.18)');
  ctx.fillStyle = eg;
  ctx.fillRect(wall.x1 - 26, top, 26, GROUND_Y - top);

  ctx.restore();
  // ---- the wall's edges: broken ink, heavier on the shaded right side
  edgeInk(P, [wall.x0 - 0.4, 340, wall.x0, 380, wall.x0 - 0.2, 430, wall.x0, GROUND_Y - 1], 0.5, 0.42, { dash: [5, 16], gap: [0.6, 3] });
  edgeInk(P, [wall.x1 + 0.4, 340, wall.x1, 385, wall.x1 + 0.2, 435, wall.x1, GROUND_Y - 1], 0.7, 0.6, { dash: [6, 18], gap: [0.6, 2.4] });
}

/** the roof's shadow on the wall: dark and warm-violet under the eave, feathering down and out of sight */
export function eaveShadow(P: Paint, eave: EaveFn): void {
  const { ctx, rnd, c } = P;
  const wall = c.wall;
  const x0 = wall.x0 - 2;
  const x1 = wall.x1 + 2;
  // one soft wash, densest under the eave and feathering out down the wall (a wet edge, not stacked bands)
  for (let k = 0; k < 7; k++) {
    const depth = 6 + k * 5.5;
    const pts: number[] = [];
    for (let x = x0; x <= x1; x += 6) pts.push(x, eave(x) - 3);
    for (let x = x1; x >= x0; x -= 6) pts.push(x, eave(x) + depth + rnd.range(-2.4, 2.4) + Math.sin(x * 0.05 + k * 1.3) * 2.2);
    softWash(ctx, pts, '#3A2A44', k === 0 ? 0.3 : 0.15, rnd, 3, 0.97, 0.02);
  }
  // a hard, dark line right where the roof edge ends (the underside of the overhang)
  ctx.fillStyle = rgba('#2A1E2C', 0.5);
  const pts: number[] = [];
  for (let x = x0; x <= x1; x += 5) pts.push(x, eave(x) - 1);
  for (let x = x1; x >= x0; x -= 5) pts.push(x, eave(x) + 3.2 + rnd.range(-0.5, 0.7));
  tracePoly(ctx, pts);
  ctx.fill();
}
