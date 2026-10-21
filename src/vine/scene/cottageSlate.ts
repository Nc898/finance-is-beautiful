/**
 * The slate roof, painted as a watercolor first and a slate pattern second: a few big variegated glazes across
 * the whole roof (warm and pale toward the upper-left light, cool and dark toward the lower right and under the
 * ridge), then wide thin slates as soft lifted and darker patches with staggered, barely-there joints and one
 * thin shadow line under each course. Hip tiles, ridge tiles, the eave lip, a gutter and a downpipe finish it
 * with wandering edges, broken ink and paper showing through on the lit side.
 */
import { clamp, makeNoise2D } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { brokenLine, edgeInk, fillPoly, lerp, lump, paperLift, rrPoly, softWash, wander, type Paint } from './cottagePaint';
import { leftEdge, rightEdge, roofCorners, roofPoly } from './cottageRoof';
import type { EaveFn } from './cottageWall';
import { GROUND_Y } from './geom';
import { backrun, detailAt, dryBrush } from './cottageWash';

const EAVE = 332;
const RIDGE = 206;

export const slateEave: EaveFn = () => 338.2;

const INKB = '#1A2038';

export function paintSlateRoof(P: Paint): void {
  const { ctx, rnd } = P;
  const r = roofCorners(P);
  const nz = makeNoise2D(2207);
  const poly = roofPoly(P, slateEave);
  const W = r.dx - r.ax;
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();

  const vis = detailAt(P, true);
  // ---- 1. the watercolor underpainting: one big graded wash (pale warm grey where the sun is, deep indigo lower
  // right), then colours dropped in while it is wet (blue, violet, a warm grey, a little green of lichen), a few
  // backruns where it dried unevenly
  ctx.fillStyle = '#6E7C94';
  ctx.fillRect(r.ax - 4, RIDGE - 6, W + 8, 140);
  const g1 = ctx.createLinearGradient(r.ax, RIDGE, r.dx, EAVE + 6);
  g1.addColorStop(0, 'rgba(196,192,196,0.7)');
  g1.addColorStop(0.4, 'rgba(120,132,160,0.18)');
  g1.addColorStop(1, 'rgba(34,40,74,0.6)');
  ctx.fillStyle = g1;
  ctx.fillRect(r.ax - 4, RIDGE - 6, W + 8, 140);
  for (let i = 0; i < 40; i++) {
    const cx = rnd.range(r.ax, r.dx);
    const cy = rnd.range(RIDGE - 2, EAVE + 4);
    const t = clamp(((cx - r.ax) / W) * 0.55 + ((cy - RIDGE) / 126) * 0.45, 0, 1);
    const col = rnd.chance(1 - t * 1.1)
      ? rnd.pick(['#A8A4B0', '#9AA2B8', '#B4A8AC', '#8E9CB4'])
      : rnd.pick(['#46567E', '#3E4A72', '#5A5A86', '#2E3A60', '#4C6070']);
    softWash(ctx, lump(cx, cy, rnd.range(40, 110), rnd.range(14, 34), rnd, 14, 0.3, rnd.range(-0.1, 0.1)), col, 0.32, rnd, 4, 0.55);
  }
  for (let i = 0; i < 6; i++) softWash(ctx, lump(rnd.range(r.ax + 20, r.dx - 20), rnd.range(250, 330), rnd.range(10, 26), rnd.range(4, 9), rnd, 12, 0.3), rnd.pick(['#6E7E68', '#76846C', '#62705E']), 0.14, rnd, 3, 0.6);
  for (let i = 0; i < 4; i++) backrun(ctx, rnd.range(r.ax + 40, r.dx - 40), rnd.range(RIDGE + 20, EAVE - 16), rnd.range(20, 46), rnd.range(7, 14), rnd.pick(['#8A94AC', '#5A6688']), 0.32, rnd);
  // a darker pool under the ridge
  const rs = ctx.createLinearGradient(0, RIDGE, 0, RIDGE + 22);
  rs.addColorStop(0, 'rgba(28,34,62,0.3)');
  rs.addColorStop(1, 'rgba(28,34,62,0)');
  ctx.fillStyle = rs;
  ctx.fillRect(r.ax, RIDGE, W, 22);

  // ---- 2. the slates, suggested: each course a dry-brush line under its lip that breaks up and fades into the
  // light; slates picked out one by one only here and there, where the roof is stated
  let yb = 339;
  while (yb > RIDGE - 4) {
    const t = clamp((EAVE - yb) / (EAVE - RIDGE), 0, 1);
    const rh = lerp(10.2, 6.9, t) * rnd.range(0.94, 1.06);
    const left = leftEdge(P, yb - rh) - 18;
    const right = rightEdge(P, yb - rh) + 18;
    const sagA = rnd.range(0.3, 0.9);
    const sagP = rnd.range(0, 6);
    const sag = (x: number) => Math.sin(x * 0.03 + sagP) * sagA;
    // the course line, in runs whose strength follows the detail
    let x = left;
    while (x < right) {
      const run = rnd.range(40, 110);
      const v = vis(x + run / 2, yb);
      if (rnd.chance(0.5 + 0.5 * v)) {
        const pts: number[] = [];
        for (let xx = x; xx <= Math.min(right, x + run); xx += 4) pts.push(xx, yb + sag(xx) + 0.6);
        dryBrush(ctx, pts, 0.6 + 0.8 * v, INKB, 0.16 + 0.3 * v, rnd, 0.22 - 0.15 * v);
        // and a soft shadow band under it, the next course's face darkening into the lap
        dryBrush(ctx, pts.map((q, i) => (i % 2 === 1 ? q + 1.6 : q)), 2.6, INKB, 0.05 + 0.08 * v, rnd, 0.3);
        // the lit lip just above, only where stated
        if (v > 0.5 && rnd.chance(0.6)) dryBrush(ctx, pts.map((q, i) => (i % 2 === 1 ? q - 1.3 : q)), 0.45, '#E4ECF8', 0.16 + 0.12 * v, rnd, 0.6);
      }
      x += run;
    }
    // single slates: a glaze lighter or darker than its neighbours, with its joint, in small clusters
    let sx = left - rnd.range(0, 18);
    while (sx < right) {
      const w = rnd.range(15, 28);
      const v = vis(sx + w / 2, yb - rh / 2);
      if (rnd.chance(v * v * 0.6)) {
        const y1 = yb + sag(sx);
        const patch = deform([sx, y1 - rh + 0.4, sx + w, y1 - rh + 0.4, sx + w, y1, sx, y1], rnd, 2, 0.03);
        const n = nz((sx + w / 2) * 0.018, yb * 0.035);
        const col = rnd.chance(0.3) ? mix('#7C8AA4', '#A8B2C6', n) : mix('#3A4668', '#28304E', n);
        ctx.fillStyle = rgba(col, rnd.range(0.1, 0.22) * (0.5 + v));
        tracePoly(ctx, patch);
        ctx.fill();
        ctx.fillStyle = rgba(INKB, rnd.range(0.14, 0.3) * v);
        ribbon(ctx, [sx + w + rnd.range(-0.2, 0.2), y1 - rh + 0.6, sx + w + rnd.range(-0.3, 0.3), y1 - rh * 0.5, sx + w, y1 - 0.3], 0.38, 0.95);
      }
      sx += w;
    }
    yb -= rh;
  }

  // ---- 3. light over the whole roof: warm and pale upper left, deeper cool lower right
  const rg = ctx.createLinearGradient(r.ax, RIDGE, r.dx, EAVE);
  rg.addColorStop(0, 'rgba(255,238,204,0.3)');
  rg.addColorStop(0.45, 'rgba(255,238,204,0)');
  rg.addColorStop(1, 'rgba(22,24,58,0.26)');
  ctx.fillStyle = rg;
  ctx.fillRect(r.ax - 4, RIDGE - 6, W + 8, 140);
  for (let i = 0; i < 6; i++) {
    const y = rnd.range(RIDGE + 12, EAVE - 14);
    softWash(ctx, lump((r.ax + r.dx) / 2 + rnd.range(-50, 50), y, rnd.range(90, 160), rnd.range(2.5, 5), rnd, 14, 0.2), rnd.chance(0.5) ? '#C8D4E8' : '#2A3050', 0.1, rnd, 3, 0.5);
  }
  ctx.restore();

  // ---- the eave lip: a thick doubled course with a wavering edge, its underside in shadow
  {
    const top = 334.4;
    const pts: number[] = [];
    for (let x = r.ax; x <= r.dx; x += 4) pts.push(x, top + Math.sin(x * 0.05) * 0.25 + rnd.range(-0.3, 0.3));
    for (let x = r.dx; x >= r.ax; x -= 4) pts.push(x, 339 + rnd.range(-0.3, 0.4));
    const lip = pts;
    fillPoly(ctx, lip, '#3C4860', 0.95);
    const lg = ctx.createLinearGradient(0, top, 0, 339.4);
    lg.addColorStop(0, 'rgba(200,214,238,0.36)');
    lg.addColorStop(0.5, 'rgba(200,214,238,0)');
    lg.addColorStop(1, 'rgba(10,12,30,0.4)');
    ctx.fillStyle = lg;
    tracePoly(ctx, lip);
    ctx.fill();
    const topLine: number[] = [];
    for (let x = r.ax + 2; x < r.dx - 2; x += 8) topLine.push(x, top + 0.5);
    paperLift(P, topLine, 0.4, 0.6);
    brokenLine(P, topLine, 0.55, '#DCE6F6', 0.3, { seg: [8, 24], gap: [1, 5] });
    const botLine: number[] = [];
    for (let x = r.ax; x < r.dx; x += 8) botLine.push(x, 339.2);
    brokenLine(P, botLine, 0.8, INKB, 0.55, { seg: [10, 30], gap: [0.6, 3] });
    for (let x = r.ax + 8; x < r.dx - 4; x += rnd.range(14, 26)) {
      ctx.fillStyle = rgba(INKB, 0.26);
      ribbon(ctx, [x, top + 0.8, x + rnd.range(-0.3, 0.3), top + 2.6, x + rnd.range(-0.3, 0.3), 338.8], 0.4, 0.9);
    }
    fillPoly(ctx, wander([r.ax, 338.6, r.ax + 3, 337.5, r.ax + 3, 340.2, r.ax, 340.6], rnd, 2, 0.2), '#2C2438', 0.55);
  }

  // ---- hip tiles along both slanted edges: rounded half-tiles, irregular, lit on top, broken ink
  for (const side of [0, 1]) {
    const ax = side === 0 ? r.ax : r.dx;
    const bx = side === 0 ? r.bx : r.cx;
    const len = Math.hypot(bx - ax, RIDGE - EAVE);
    const n = Math.round(len / 7.4);
    const ang = Math.atan2(RIDGE - EAVE, bx - ax);
    for (let k = 0; k < n; k++) {
      const tt = (k + 0.5) / n;
      const px = lerp(ax, bx, tt) + rnd.range(-0.3, 0.3);
      const py = lerp(EAVE + 0.5, RIDGE, tt) + rnd.range(-0.3, 0.3);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      const L = (len / n) * rnd.range(1.0, 1.25);
      const Wd = 6.4 * lerp(1.08, 0.86, tt) * rnd.range(0.94, 1.06);
      const tile = wander(deform(rrPoly(-L / 2, -Wd / 2, L, Wd, 1.9, rnd, 0.5), rnd, 1, 0.03), rnd, 2, 0.14);
      fillPoly(ctx, tile.map((v, i) => v + (i % 2 === 0 ? 0.4 : 0.9)), INKB, 0.22);
      fillPoly(ctx, tile, mix(rnd.pick(['#56668A', '#4C5C80', '#5E6E94']), '#2E3A56', rnd.range(0, 0.15)), 0.94);
      const gg = ctx.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
      gg.addColorStop(0, 'rgba(214,226,246,0.46)');
      gg.addColorStop(0.45, 'rgba(214,226,246,0)');
      gg.addColorStop(1, 'rgba(18,20,44,0.4)');
      ctx.fillStyle = gg;
      tracePoly(ctx, tile);
      ctx.fill();
      if (rnd.chance(0.7)) {
        ctx.fillStyle = rgba(INKB, rnd.range(0.2, 0.4));
        ribbon(ctx, [L / 2, -Wd / 2 + 0.8, L / 2 - 0.3, 0, L / 2, Wd / 2 - 0.6], 0.4, 0.9);
      }
      ctx.restore();
    }
    const sgn = side === 0 ? -1 : 1;
    const nx = Math.sin(ang) * sgn * -1;
    const ny = -Math.cos(ang) * sgn * -1;
    const o = 3.4;
    const mid = (a: number, b: number, t: number) => lerp(a, b, t);
    const outer = [ax + nx * o * -1, EAVE + 1 + ny * o * -1, mid(ax, bx, 0.5) + nx * o * -1, mid(EAVE + 1, RIDGE, 0.5) + ny * o * -1, bx + nx * o * -1, RIDGE + ny * o * -1];
    brokenLine(P, outer, side === 0 ? 0.55 : 0.8, INKB, side === 0 ? 0.45 : 0.62, { seg: [8, 24], gap: [0.6, 3.4] });
    const lit = [ax + nx * o, EAVE + 1 + ny * o, mid(ax, bx, 0.5) + nx * o, mid(EAVE + 1, RIDGE, 0.5) + ny * o, bx + nx * o, RIDGE + ny * o];
    brokenLine(P, lit, 0.4, '#DCE6F6', 0.3, { seg: [4, 14], gap: [1, 6] });
    if (side === 0) paperLift(P, lit, 0.35, 0.5);
  }

  // ---- ridge tiles: overlapping half-rounds of uneven length, scalloped underside, broken ink
  {
    const ya = RIDGE - 3.6;
    const hgt = 8.2;
    let x = r.bx - 5;
    while (x < r.cx + 5) {
      const L = rnd.range(9, 12.5);
      const yy = ya + rnd.range(-0.4, 0.4);
      const tile = wander(deform(rrPoly(x, yy, L + 1.4, hgt + rnd.range(-0.4, 0.5), 3, rnd, 0.5), rnd, 1, 0.03), rnd, 2, 0.14);
      fillPoly(ctx, tile.map((v, i) => v + (i % 2 === 0 ? 0.6 : 1.1)), INKB, 0.26);
      fillPoly(ctx, tile, mix(rnd.pick(['#5C6C92', '#526290', '#667698']), '#2E3A56', rnd.range(0, 0.12)), 0.95);
      const gg = ctx.createLinearGradient(0, yy, 0, yy + hgt);
      gg.addColorStop(0, 'rgba(226,236,252,0.5)');
      gg.addColorStop(0.4, 'rgba(226,236,252,0)');
      gg.addColorStop(1, 'rgba(18,20,44,0.46)');
      ctx.fillStyle = gg;
      tracePoly(ctx, tile);
      ctx.fill();
      if (rnd.chance(0.7)) {
        ctx.fillStyle = rgba(INKB, rnd.range(0.2, 0.42));
        ribbon(ctx, [x + L, yy + 0.8, x + L + 0.3, yy + hgt * 0.5, x + L - 0.2, yy + hgt - 0.4], 0.45, 0.9);
      }
      x += L;
    }
    brokenLine(P, [r.bx - 5, ya + hgt + 0.2, (r.bx + r.cx) / 2, ya + hgt + 0.4, r.cx + 5, ya + hgt + 0.2], 0.7, INKB, 0.52, { seg: [8, 26], gap: [0.8, 4] });
    const topLine = [r.bx - 5, ya + 0.3, (r.bx + r.cx) / 2, ya + 0.1, r.cx + 5, ya + 0.3];
    brokenLine(P, topLine, 0.4, INKB, 0.3, { seg: [4, 14], gap: [1, 5] });
    brokenLine(P, [r.bx - 5, ya + 1.3, r.cx + 5, ya + 1.3], 0.45, '#E6EEFC', 0.34, { seg: [5, 16], gap: [1, 6] });
    paperLift(P, [r.bx - 3, ya + 1.1, r.cx + 3, ya + 1.1], 0.4, 0.4);
  }
  void edgeInk;
}

/** a half-round iron gutter along the eave, on brackets, with a downpipe at the left end */
export function paintGutter(P: Paint): void {
  const { ctx, rnd, c } = P;
  const r = roofCorners(P);
  const gx0 = r.ax + 6;
  const gx1 = r.dx - 6;
  const gy = 342.2;
  // its shadow on the wall
  softWash(ctx, [gx0, gy + 1, gx1, gy + 1, gx1 + 2, gy + 5, gx0 + 2, gy + 5], '#2A2030', 0.26, rnd, 3, 0.7, 0.02);
  for (let x = gx0 + 14; x < gx1 - 6; x += 38 + rnd.range(-3, 3)) {
    ctx.fillStyle = rgba('#20242E', 0.75);
    ribbon(ctx, [x, 338.8, x + 0.2, 341.4, x - 0.2, 343.6], 0.9, 0.7);
  }
  const body: number[] = [];
  for (let x = gx0; x <= gx1; x += 5) body.push(x, gy - 1.6 + rnd.range(-0.25, 0.25));
  body.push(gx1 + 0.4, gy + 0.2);
  for (let x = gx1; x >= gx0; x -= 5) body.push(x, gy + 2.6 + rnd.range(-0.25, 0.3));
  body.push(gx0 - 0.4, gy + 0.2);
  fillPoly(ctx, body, '#323846', 0.95);
  const g = ctx.createLinearGradient(0, gy - 1.6, 0, gy + 2.6);
  g.addColorStop(0, 'rgba(190,204,226,0.34)');
  g.addColorStop(0.45, 'rgba(190,204,226,0)');
  g.addColorStop(1, 'rgba(8,8,20,0.34)');
  ctx.fillStyle = g;
  tracePoly(ctx, body);
  ctx.fill();
  const hl: number[] = [];
  for (let x = gx0; x <= gx1; x += 8) hl.push(x, gy - 0.9);
  brokenLine(P, hl, 0.6, '#C8D4EA', 0.5, { seg: [6, 22], gap: [1, 6] });
  paperLift(P, hl, 0.3, 0.3);
  const lo: number[] = [];
  for (let x = gx0; x <= gx1; x += 8) lo.push(x, gy + 2.7);
  brokenLine(P, lo, 0.7, INKB, 0.55, { seg: [8, 28], gap: [0.8, 4] });
  // the downpipe from the outlet at the left end to a splash stone
  const px = c.wall.x0 + 12;
  const top = gy + 2;
  const bot = 476;
  softWash(ctx, [px + 2.2, top, px + 6, top + 1, px + 7.6, bot, px + 3, bot], '#2A2030', 0.24, rnd, 3, 0.7, 0.01);
  const pipe: number[] = [];
  for (let y = top; y <= bot - 3; y += 8) pipe.push(px - 2.3 + rnd.range(-0.2, 0.2), y);
  for (let y = bot - 3; y >= top; y -= 8) pipe.push(px + 2.3 + rnd.range(-0.2, 0.2), y);
  fillPoly(ctx, pipe, '#323846', 0.96);
  const pg = ctx.createLinearGradient(px - 2.3, 0, px + 2.3, 0);
  pg.addColorStop(0, 'rgba(190,204,226,0.4)');
  pg.addColorStop(0.35, 'rgba(190,204,226,0)');
  pg.addColorStop(1, 'rgba(8,8,20,0.4)');
  ctx.fillStyle = pg;
  tracePoly(ctx, pipe);
  ctx.fill();
  brokenLine(P, [px - 1.2, top + 1, px - 1.2, bot - 4], 0.5, '#C8D4EA', 0.46, { seg: [8, 22], gap: [1, 7] });
  paperLift(P, [px - 1.3, top + 3, px - 1.3, bot - 6], 0.3, 0.3);
  for (let y = top + 20; y < bot - 6; y += rnd.range(28, 38)) {
    ctx.fillStyle = rgba('#14161E', 0.55);
    ribbon(ctx, [px - 3, y, px, y + 0.2, px + 3.2, y], 1.3, 0.8);
    ctx.fillStyle = rgba('#B8C6DE', 0.3);
    ribbon(ctx, [px - 2.8, y - 0.4, px - 0.8, y - 0.4], 0.5, 0.8);
  }
  brokenLine(P, [px + 2.4, top, px + 2.5, (top + bot) / 2, px + 2.4, bot - 3], 0.5, INKB, 0.55, { seg: [8, 26], gap: [1, 5] });
  // the shoe, and a darker splash of damp stone beneath it
  fillPoly(ctx, wander([px - 3, bot - 4, px + 3, bot - 4, px + 5.4, bot, px - 5, bot + 0.2], rnd, 1.5, 0.2), '#323846', 0.94);
  brokenLine(P, [px - 5, bot + 0.3, px + 5.4, bot + 0.1], 0.5, INKB, 0.5, { seg: [3, 8], gap: [0.5, 2] });
  softWash(ctx, lump(px + 3, GROUND_Y - 4, 11, 7, rnd, 10, 0.3), '#4A5648', 0.28, rnd, 3, 0.6);
}
