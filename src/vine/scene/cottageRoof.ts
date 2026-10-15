/**
 * The two roofs, painted as washes: slate (left) with staggered slates of varying width and tone laid course by
 * course over the eaves, hip tiles, ridge tiles, lichen and a gutter; and thatch (right), a golden mass of
 * layered straw with a thick rolled ridge and hips carrying a scalloped pattern, and a deep shaggy eave that
 * sweeps down over the windows. Both overhang the wall and cast their shadow on it (see cottageWall).
 */
import { clamp, makeNoise2D } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { brokenLine, edgeInk, fillPoly, lerp, lump, paperLift, rrPoly, shift, softWash, wander, type Paint } from './cottagePaint';
import type { EaveFn } from './cottageWall';

const EAVE = 332;
const RIDGE = 206;

/** the roof plane's corners (front slope: a hipped trapezoid) */
export function roofCorners(P: Paint): { ax: number; bx: number; cx: number; dx: number } {
  const w = P.c.wall;
  return { ax: w.x0 - 18, bx: w.x0 + 52, cx: w.x1 - 52, dx: w.x1 + 18 };
}
export const leftEdge = (P: Paint, y: number): number => {
  const r = roofCorners(P);
  return lerp(r.ax, r.bx, (EAVE - y) / (EAVE - RIDGE));
};
export const rightEdge = (P: Paint, y: number): number => {
  const r = roofCorners(P);
  return lerp(r.dx, r.cx, (EAVE - y) / (EAVE - RIDGE));
};

export function roofPoly(P: Paint, bottom: EaveFn): number[] {
  const r = roofCorners(P);
  const pts: number[] = [r.ax, EAVE - 2, r.bx, RIDGE, r.cx, RIDGE, r.dx, EAVE - 2];
  for (let x = r.dx; x >= r.ax; x -= 6) pts.push(x, bottom(x));
  pts.push(r.ax, bottom(r.ax));
  return pts;
}

/* ================================================================== thatch */

/** the bottom edge of the thatch: thick and uneven, sweeping low in a bell over each window ("eyebrow" eaves) */
export function thatchEaveFn(P: Paint): EaveFn {
  const wins = P.c.windows;
  return (x: number) => {
    let dip = 0;
    for (const w of wins) {
      const m = (w.x0 + w.x1) / 2;
      const half = (w.x1 - w.x0) / 2 + 22;
      const u = (x - m) / half;
      if (Math.abs(u) < 1) dip = Math.max(dip, Math.pow(Math.cos((u * Math.PI) / 2), 2) * 5.6);
    }
    return 345.4 + dip + Math.sin(x * 0.13) * 0.7 + Math.sin(x * 0.047 + 1) * 0.9;
  };
}

const STRAW = ['#D6B063', '#C79A52', '#E0BE72', '#B88A45', '#CFA45A', '#E6C982', '#BC8E48', '#D2AA5E'];
const STRAW_DK = ['#8C6430', '#A07038', '#7A5628', '#94683A'];

export function paintThatchRoof(P: Paint, eave: EaveFn): void {
  const { ctx, rnd } = P;
  const r = roofCorners(P);
  const nz = makeNoise2D(5113);
  const poly = roofPoly(P, eave);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  const y0 = RIDGE - 8;
  const width = r.dx - r.ax + 8;
  ctx.fillStyle = '#B98A46';
  ctx.fillRect(r.ax - 4, y0, width, 150);
  // soft pools of colour: new pale straw high up, weathered brown and moss low down
  for (let i = 0; i < 46; i++) {
    const cy = rnd.range(RIDGE, 340);
    const t = (cy - RIDGE) / 134;
    const col = t < 0.4 ? rnd.pick(['#E3C47C', '#D9B466', '#EAD08C']) : rnd.pick(['#A8783A', '#C09048', '#8E6A36', '#8A8644']);
    softWash(ctx, lump(rnd.range(r.ax, r.dx), cy, rnd.range(24, 70), rnd.range(8, 22), rnd, 12, 0.3), col, 0.3, rnd, 3, 0.6);
  }
  // straw: courses of bundles with rounded butt ends laid from the eave up, each course overlapping the one below
  // (like the slates, but soft): every bundle a wash of its own, lit on the left, with straw strokes running down it
  const bands: number[] = [];
  let yy = 348;
  while (yy > RIDGE - 16) {
    bands.push(yy);
    yy -= rnd.range(12, 21);
  }
  for (let b = 0; b < bands.length; b++) {
    const yb = bands[b]!;
    const t = clamp((EAVE - yb) / (EAVE - RIDGE), 0, 1);
    const ch = rnd.range(15, 20);
    const left = leftEdge(P, yb - ch) - 16;
    const right = rightEdge(P, yb - ch) + 16;
    let x = left - rnd.range(0, 8);
    while (x < right) {
      const bw = rnd.range(15, 28);
      const ov = bw * 0.35;
      const xa = x - ov;
      const wd = bw + ov * 2;
      const xm = x + bw / 2;
      const sagB = rnd.chance(0.14) ? rnd.range(1.5, 3.6) : 0;
      const bot = b === 0 ? eave(xm) + 0.5 : yb + Math.sin(xm * 0.05 + b * 1.7) * 1.8 + Math.sin(xm * 0.13 + b) * 0.9 + rnd.range(-1.6, 1.6) + sagB;
      const top = bot - ch - 4;
      const n = nz(xm * 0.012, bot * 0.03);
      let col = mix(mix(rnd.pick(STRAW), '#C9A055', 0.6), n > 0.5 ? '#F2DC9C' : '#9A7438', Math.abs(n - 0.5) * 0.8);
      col = mix(col, t > 0.55 ? '#F2DC9C' : '#8E7A3E', clamp(Math.abs(t - 0.55) * 0.4, 0, 0.25));
      const poly = [xa, top + 5, xa + wd * 0.2, top + 1.5, xa + wd * 0.5, top, xa + wd * 0.8, top + 1.5, xa + wd, top + 5, xa + wd, bot - 1.2, xa + wd * 0.8, bot + rnd.range(-0.8, 0.8), xa + wd * 0.55, bot + rnd.range(-0.4, 1), xa + wd * 0.3, bot + rnd.range(-0.8, 0.6), xa, bot - 1.2];
      // the shadow its thick butt casts on the course below
      fillPoly(ctx, [xa + 3, bot - 1, xa + wd + 1, bot - 1, xa + wd + 1, bot + 3.2, xm + 1.4, bot + 3.6, xa + 3, bot + 3], '#4A2C14', 0.12);
      // soft-sided: opaque in the middle, fading out sideways so neighbouring bundles melt into each other
      const sg = ctx.createLinearGradient(xa, 0, xa + wd, 0);
      sg.addColorStop(0, rgba(col, 0));
      sg.addColorStop(0.28, rgba(col, 0.9));
      sg.addColorStop(0.72, rgba(col, 0.9));
      sg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = sg;
      tracePoly(ctx, poly);
      ctx.fill();
      const g = ctx.createLinearGradient(xa, 0, xa + wd, 0);
      g.addColorStop(0, 'rgba(255,240,180,0.2)');
      g.addColorStop(0.4, 'rgba(255,240,180,0)');
      g.addColorStop(1, 'rgba(70,40,18,0.26)');
      ctx.fillStyle = g;
      tracePoly(ctx, poly);
      ctx.fill();
      const g2 = ctx.createLinearGradient(0, bot - 7, 0, bot + 0.6);
      g2.addColorStop(0, 'rgba(255,238,170,0)');
      g2.addColorStop(1, 'rgba(255,238,170,0.18)');
      ctx.fillStyle = g2;
      tracePoly(ctx, poly);
      ctx.fill();
      // straw: long strokes down the bundle, dark and pale
      const ns = Math.round(bw * 2.6);
      for (let i = 0; i < ns; i++) {
        const sx = x + rnd.range(-ov * 0.5, bw + ov * 0.5);
        const sy = rnd.range(top + 2, bot - 8);
        const len = rnd.range(6, 15);
        const dark = rnd.chance(0.45);
        ctx.fillStyle = dark ? rgba(rnd.pick(STRAW_DK), rnd.range(0.22, 0.5)) : rgba(rnd.pick(['#F6E6B0', '#F0D890', '#E6C878']), rnd.range(0.32, 0.64));
        const lean = rnd.range(-0.16, 0.16);
        ribbon(ctx, [sx, sy, sx + lean * len * 0.5 + rnd.range(-0.4, 0.4), sy + len * 0.5, sx + lean * len, Math.min(bot - 0.6, sy + len)], rnd.range(0.35, 0.8), 0.92);
      }
      // the lip: a pale rim along the butt, then a thin dark seam under it
      ctx.fillStyle = rgba('#F6E6B0', 0.3);
      ribbon(ctx, [x - 2, bot - 1.8, xm, bot - 0.4, x + bw + 2, bot - 1.8], 0.7, 0.9);
      x += bw * (rnd.chance(0.12) ? 0.62 : 1);
    }
  }
  // the relief: broad soft crests and hollows over the slope (light from the upper left)
  for (let i = 0; i < 110; i++) {
    const cx = rnd.range(r.ax, r.dx);
    const cy = rnd.range(RIDGE - 4, 346);
    const rx = rnd.range(16, 44);
    const ry = rnd.range(5, 10);
    softWash(ctx, lump(cx - 2, cy - 2, rx, ry, rnd, 12, 0.22), '#F6E4A6', 0.2, rnd, 3, 0.55);
    softWash(ctx, lump(cx + 4, cy + ry * 0.8, rx * 0.9, ry * 0.7, rnd, 12, 0.22), '#5A3A1C', 0.14, rnd, 3, 0.55);
  }
  // liggers: hazel rods pegged across the thatch, with their stub ends
  for (let y = 250; y < 330; y += rnd.range(44, 60)) {
    const pts: number[] = [];
    const lx = leftEdge(P, y) + 3;
    const rx = rightEdge(P, y) - 3;
    for (let x = lx; x <= rx; x += 6) pts.push(x, y + Math.sin(x * 0.05 + y) * 1.6);
    ctx.fillStyle = rgba('#5A3C1E', 0.16);
    ribbon(ctx, pts, 0.7, 0.95);
    ctx.fillStyle = rgba('#F0D890', 0.2);
    ribbon(ctx, shiftPts(pts, 0, -0.8), 0.4, 0.95);
    for (let x = lx + 8; x < rx - 6; x += rnd.range(30, 52)) {
      ctx.fillStyle = rgba('#5A3C1E', 0.3);
      ribbon(ctx, [x, y - 1.4, x + 0.3, y + 0.4, x - 0.2, y + 1.8], 0.65, 0.8);
    }
  }
  // weathering: moss on the shaded lower slope, dark runs of stain, a patch of fresh straw
  for (let i = 0; i < 22; i++) {
    const cy = rnd.range(262, 334);
    softWash(ctx, lump(rnd.range(r.ax + 10, r.dx - 10), cy, rnd.range(5, 16), rnd.range(2, 4.4), rnd, 10, 0.3), rnd.pick(['#7C8A40', '#8A8644', '#6C7C3C', '#9A9A4A']), 0.26, rnd, 3, 0.6);
  }
  const fx = rnd.range(r.ax + 120, r.cx - 100);
  softWash(ctx, lump(fx, 262, 38, 14, rnd, 12, 0.2), '#EBD18A', 0.3, rnd, 3, 0.7);
  // the sun on the upper left, a warm brown shade toward the lower right
  const rg = ctx.createLinearGradient(r.ax, RIDGE, r.dx, EAVE);
  rg.addColorStop(0, 'rgba(255,238,176,0.34)');
  rg.addColorStop(0.45, 'rgba(255,236,170,0)');
  rg.addColorStop(1, 'rgba(64,36,22,0.34)');
  ctx.fillStyle = rg;
  ctx.fillRect(r.ax - 4, y0, width, 150);
  // the thatch is deepest and darkest where it hangs over the wall
  const eg = ctx.createLinearGradient(0, 316, 0, 346);
  eg.addColorStop(0, 'rgba(58,34,20,0)');
  eg.addColorStop(1, 'rgba(58,34,20,0.34)');
  ctx.fillStyle = eg;
  ctx.fillRect(r.ax - 4, 316, width, 34);
  ctx.restore();

  // ---- the thick shaggy eave edge: the underside in shadow, ragged straws hanging below the cut line
  {
    const ex: number[] = [];
    for (let x = r.ax; x <= r.dx; x += 3) ex.push(x, eave(x));
    ctx.save();
    tracePoly(ctx, roofPoly(P, eave));
    ctx.clip();
    const g = ctx.createLinearGradient(0, 334, 0, 352);
    g.addColorStop(0, 'rgba(48,26,18,0)');
    g.addColorStop(1, 'rgba(48,26,18,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(r.ax, 334, r.dx - r.ax, 20);
    ctx.restore();
    for (let x = r.ax + 1; x < r.dx; x += rnd.range(1.2, 2.8)) {
      const bt = eave(x);
      ctx.fillStyle = rgba(rnd.pick(['#C7A050', '#A87C3C', '#D8B462', '#8C6430']), rnd.range(0.4, 0.85));
      ribbon(ctx, [x, bt - 3, x + rnd.range(-0.6, 0.6), bt + 0.4, x + rnd.range(-0.8, 1.1), bt + rnd.range(1.2, 3.4)], rnd.range(0.45, 0.9), 0.9);
    }
    ctx.fillStyle = rgba('#3A2412', 0.4);
    ribbon(ctx, ex.map((v, i) => (i % 2 === 1 ? v + 0.9 : v)), 0.9, 0.9);
    edgeInk(P, ex.map((v, i) => (i % 2 === 1 ? v + 1.4 : v)), 0.5, 0.5, { dash: [4, 14], gap: [0.5, 2.4], color: '#4A3018' });
  }

  // ---- thick rolled hips along both slanted edges: layered straw with pegged cross-ties
  for (const side of [0, 1]) {
    const ax = side === 0 ? r.ax : r.dx;
    const bx = side === 0 ? r.bx : r.cx;
    const rollW = 8.6;
    const len = Math.hypot(bx - ax, RIDGE - EAVE);
    const ang = Math.atan2(RIDGE - EAVE, bx - ax);
    ctx.save();
    ctx.translate(ax, EAVE + 1);
    ctx.rotate(ang);
    const body = wander(deform(rrPoly(-2, -rollW / 2, len + 6, rollW, 3.6, rnd, 0.5), rnd, 2, 0.03), rnd, 2.5, 0.22);
    fillPoly(ctx, shift(body, 0.8, 1.4), '#4A2E16', 0.28);
    fillPoly(ctx, body, '#C69A50', 0.98);
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    const gg = ctx.createLinearGradient(0, -rollW / 2, 0, rollW / 2);
    gg.addColorStop(0, 'rgba(255,240,180,0.55)');
    gg.addColorStop(0.5, 'rgba(255,240,180,0)');
    gg.addColorStop(1, 'rgba(70,40,18,0.5)');
    ctx.fillStyle = gg;
    ctx.fillRect(-4, -rollW / 2, len + 10, rollW);
    for (let k = 0; k < Math.round(len * 1.3); k++) {
      const sx = rnd.range(-2, len + 4);
      ctx.fillStyle = rgba(rnd.pick(STRAW.concat(STRAW_DK)), rnd.range(0.2, 0.5));
      ribbon(ctx, [sx, rnd.range(-3.4, 2), sx + rnd.range(2, 6), rnd.range(-2, 3.4)], rnd.range(0.35, 0.8), 0.9);
    }
    // hand-tied diagonal plaiting: each tie its own slightly bowed, tapering stroke, a few missing
    for (let x = 2; x < len; x += rnd.range(4.2, 5.2)) {
      if (rnd.chance(0.1)) continue;
      const bow = rnd.range(-0.5, 0.5);
      ctx.fillStyle = rgba('#5C3C1C', rnd.range(0.26, 0.5));
      ribbon(ctx, [x, -rollW / 2 + 0.8, x + 1.6 + bow, 0, x + 3.2, rollW / 2 - 0.8], rnd.range(0.4, 0.7), 0.85);
      ctx.fillStyle = rgba('#5C3C1C', rnd.range(0.2, 0.44));
      ribbon(ctx, [x + 3.2, -rollW / 2 + 0.8, x + 1.6 - bow, 0, x, rollW / 2 - 0.8], rnd.range(0.4, 0.7), 0.85);
      if (rnd.chance(0.5)) {
        ctx.fillStyle = rgba('#F6E6B0', 0.3);
        ribbon(ctx, [x + 0.7, -rollW / 2 + 0.8, x + 2.4, 0, x + 3.9, rollW / 2 - 0.8], 0.35, 0.85);
      }
    }
    ctx.restore();
    ctx.restore();
    const he = hipEdge(ax, bx, ang, rollW / 2, side);
    brokenLine(P, he, 0.6, '#4A3018', 0.5, { seg: [5, 16], gap: [0.8, 4] });
    if (side === 0) paperLift(P, hipEdge(ax, bx, ang, rollW / 2, 1 - side), 0.3, 0.4);
  }
  // ---- the ridge: a thick roll with a decorative scalloped lower edge and diagonal plaiting
  {
    const x0 = r.bx - 5;
    const x1 = r.cx + 5;
    const top = RIDGE - 6.5;
    const hgt = 14;
    const body: number[] = [];
    for (let x = x0; x <= x1; x += 5) body.push(x, top + Math.sin(x * 0.11) * 0.5 + rnd.range(-0.4, 0.4));
    // scalloped lower edge
    const sc = 6.4;
    const bot: number[] = [];
    for (let x = x1; x >= x0; x -= 1.6) {
      const ph = ((x - x0) % sc) / sc;
      bot.push(x, top + hgt - 1.6 + Math.sin(ph * Math.PI) * 3.2);
    }
    const ridge = wander([...body, ...bot], rnd, 2.5, 0.2);
    fillPoly(ctx, shift(ridge, 0.9, 1.7), '#3E2612', 0.3);
    fillPoly(ctx, ridge, '#D2A858', 0.98);
    ctx.save();
    tracePoly(ctx, ridge);
    ctx.clip();
    const gg = ctx.createLinearGradient(0, top, 0, top + hgt + 3);
    gg.addColorStop(0, 'rgba(255,242,186,0.62)');
    gg.addColorStop(0.42, 'rgba(255,242,186,0)');
    gg.addColorStop(1, 'rgba(70,40,18,0.52)');
    ctx.fillStyle = gg;
    ctx.fillRect(x0, top, x1 - x0, hgt + 4);
    for (let k = 0; k < Math.round((x1 - x0) * 2); k++) {
      const sx = rnd.range(x0, x1);
      ctx.fillStyle = rgba(rnd.pick(STRAW.concat(STRAW_DK)), rnd.range(0.2, 0.5));
      ribbon(ctx, [sx, top + rnd.range(0, 9), sx + rnd.range(3, 8), top + rnd.range(4, 14)], rnd.range(0.4, 0.9), 0.9);
    }
    // the plaited band: hand-tied diagonal ties, a few missing, each a little different
    for (let x = x0 + 2; x < x1 - 2; x += rnd.range(4.7, 5.7)) {
      if (rnd.chance(0.08)) continue;
      const bow = rnd.range(-0.5, 0.5);
      ctx.fillStyle = rgba('#5C3C1C', rnd.range(0.28, 0.52));
      ribbon(ctx, [x, top + 2.8, x + 1.9 + bow, top + 5.6, x + 3.8, top + 8.4], rnd.range(0.4, 0.7), 0.85);
      ctx.fillStyle = rgba('#5C3C1C', rnd.range(0.22, 0.46));
      ribbon(ctx, [x + 3.8, top + 2.8, x + 1.9 - bow, top + 5.6, x, top + 8.4], rnd.range(0.4, 0.7), 0.85);
      if (rnd.chance(0.5)) {
        ctx.fillStyle = rgba('#F6E6B0', 0.34);
        ribbon(ctx, [x + 0.8, top + 2.8, x + 2.7, top + 5.6, x + 4.6, top + 8.4], 0.35, 0.85);
      }
    }
    // pale bands above and below the plaiting, broken
    brokenLine(P, [x0, top + 2.4, x1, top + 2.4], 0.5, '#6E4C28', 0.4, { seg: [10, 30], gap: [1, 5] });
    brokenLine(P, [x0, top + 8.9, x1, top + 8.9], 0.5, '#6E4C28', 0.4, { seg: [10, 30], gap: [1, 5] });
    ctx.restore();
    // scallop arcs along the lower edge, each inked, with a lit scoop inside
    for (let x = x0 + sc / 2; x < x1 - sc / 2; x += sc) {
      if (rnd.chance(0.15)) continue;
      const arc: number[] = [];
      const a0 = rnd.range(0.02, 0.12);
      const a1 = rnd.range(0.88, 0.98);
      for (let k = 0; k <= 6; k++) {
        const aa = (a0 + ((a1 - a0) * k) / 6) * Math.PI;
        arc.push(x + Math.cos(aa) * (sc / 2 - 0.5), top + hgt - 2.2 + Math.sin(aa) * (sc / 2 - 0.5) + rnd.range(-0.12, 0.12));
      }
      ctx.fillStyle = rgba('#4A3018', rnd.range(0.3, 0.52));
      ribbon(ctx, arc, 0.55, 0.85);
    }
    // shaggy fringe hanging below
    for (let x = x0; x < x1; x += rnd.range(1.4, 2.8)) {
      const ph = ((x - x0) % sc) / sc;
      const by = top + hgt - 1.6 + Math.sin(ph * Math.PI) * 3.2;
      ctx.fillStyle = rgba(rnd.pick(['#C7A050', '#A87C3C', '#8C6430']), rnd.range(0.4, 0.75));
      ribbon(ctx, [x, by - 1.6, x + rnd.range(-0.5, 0.5), by + 0.4, x + rnd.range(-0.6, 0.8), by + rnd.range(1, 2.6)], rnd.range(0.4, 0.8), 0.9);
    }
    brokenLine(P, [x0, top + 0.3, (x0 + x1) / 2, top - 0.2, x1, top + 0.3], 0.5, '#4A3018', 0.4, { seg: [5, 18], gap: [1, 5] });
    paperLift(P, [x0 + 2, top + 1.4, x1 - 2, top + 1.4], 0.4, 0.4);
    // rounded block ends
    for (const ex of [x0, x1]) {
      const dir = ex === x0 ? -1 : 1;
      fillPoly(ctx, lump(ex + dir * 0.6, top + hgt / 2, 2.8, hgt / 2 - 0.2, rnd, 12, 0.16), '#B88A44', 0.95);
      brokenLine(P, [ex + dir * 1.2, top + 1, ex + dir * 2.4, top + hgt / 2, ex + dir * 1.2, top + hgt - 1], 0.45, '#4A3018', 0.4, { seg: [3, 8], gap: [0.8, 2] });
    }
  }
  // thatch silhouette ink on the roof's outer edge (the slopes' upper sides)
}

function shiftPts(a: number[], dx: number, dy: number): number[] {
  return a.map((v, i) => v + (i % 2 === 0 ? dx : dy));
}
/** the outer edge of a hip roll, in world coordinates, offset to the outer (away from the roof) side */
function hipEdge(ax: number, bx: number, ang: number, half: number, side: number): number[] {
  const x0 = ax;
  const y0 = EAVE + 1;
  const x1 = bx;
  const y1 = RIDGE;
  // the normal pointing away from the roof (to the left of the left hip, to the right of the right hip)
  const sgn = side === 0 ? 1 : -1;
  const ox = Math.sin(ang) * half * -sgn;
  const oy = -Math.cos(ang) * half * -sgn;
  return [x0 + ox, y0 + oy, lerp(x0, x1, 0.5) + ox, lerp(y0, y1, 0.5) + oy, x1 + ox, y1 + oy];
}
