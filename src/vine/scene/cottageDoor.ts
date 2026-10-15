/**
 * The door and what lives around it: stone lintel and long-and-short jambs, the recessed leaf of painted planks
 * with strap hinges and a latch (the left one teal with a glazed light, the right one green with a wreath), the
 * stone step and mat, a lantern or a plaque on the wall, a boot scraper, a pot of chrysanthemums, a stack of logs.
 */
import { almond, deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { GROUND_Y } from './geom';
import { bloomHead } from './cottageWindow';
import { brokenLine, edgeInk, fillPoly, lump, paintStone, rrPoly, shift, softWash, type Paint } from './cottagePaint';

const JAMB = ['#E0D2B2', '#D6C8A8', '#E6DAC0', '#D2C3A2'];

export function paintDoor(P: Paint, lintelH: number): void {
  const { ctx, rnd, c, id } = P;
  const d = c.door;
  const dw = d.x1 - d.x0;
  const dh = d.y1 - d.y0;
  const teal = id === 'minimum';
  const doorCol = teal ? '#3E7F8A' : '#456F4C';
  const rev = { l: 3.4, t: 4.2, r: 1.8 };

  // ---- the recess
  fillPoly(ctx, [d.x0 - rev.l, d.y0 - rev.t, d.x1 + rev.r, d.y0 - rev.t, d.x1 + rev.r, GROUND_Y, d.x0 - rev.l, GROUND_Y], '#2E2224', 0.98);
  // jambs
  for (const side of [0, 1]) {
    let y = d.y0 - rev.t;
    let k = side;
    while (y < GROUND_Y - 1) {
      const hh = Math.min(rnd13(P), GROUND_Y - y + 0.2);
      const w = k % 2 === 0 ? rnd.range(10.4, 12) : rnd.range(6.4, 7.6);
      const x = side === 0 ? d.x0 - rev.l - w : d.x1 + rev.r;
      paintStone(P, x, y, w, hh - 0.5, mix(rnd.pick(JAMB), '#A89A80', Math.max(0, (y - 440) / 40) * 0.25), { dressed: true, lit: 0.5, shadow: 0.9, ink: 0.85, speck: 0.2 });
      y += hh;
      k++;
    }
  }
  // reveal faces
  fillPoly(ctx, [d.x0 - rev.l, d.y0 - rev.t, d.x0, d.y0, d.x0, GROUND_Y, d.x0 - rev.l, GROUND_Y], '#3E302E', 0.98);
  fillPoly(ctx, [d.x0 - rev.l, d.y0 - rev.t, d.x1 + rev.r, d.y0 - rev.t, d.x1, d.y0, d.x0, d.y0], '#261B20', 0.98);
  fillPoly(ctx, [d.x1, d.y0, d.x1 + rev.r, d.y0 - rev.t, d.x1 + rev.r, GROUND_Y, d.x1, GROUND_Y], '#C6B494', 0.98);

  // ---- the leaf: vertical planks, each a wash of its own, with a lit left edge and shaded right edge
  const planks = 5;
  const pw = dw / planks;
  fillPoly(ctx, [d.x0, d.y0, d.x1, d.y0, d.x1, GROUND_Y, d.x0, GROUND_Y], '#241C1C', 1);
  for (let k = 0; k < planks; k++) {
    const px = d.x0 + k * pw;
    const col = mix(doorCol, rnd.pick(['#2A5A66', '#5A9AA0', '#34666C', '#3A6A44', '#5C8A58', '#2E5638']), 0.22);
    const poly = [px + 0.5, d.y0, px + pw - 0.3, d.y0, px + pw - 0.3, GROUND_Y, px + 0.5, GROUND_Y];
    fillPoly(ctx, deform(poly, rnd, 1, 0.004), col, 0.97);
    fillPoly(ctx, deform(poly, rnd, 1, 0.006), mix(col, '#D8E8D8', 0.3), 0.18);
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    const g = ctx.createLinearGradient(px, 0, px + pw, 0);
    g.addColorStop(0, 'rgba(255,248,226,0.3)');
    g.addColorStop(0.25, 'rgba(255,248,226,0)');
    g.addColorStop(0.8, 'rgba(24,18,34,0)');
    g.addColorStop(1, 'rgba(24,18,34,0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(px, d.y0, pw, dh);
    // paint grain: long dry-brush streaks, and a few knots
    for (let i = 0; i < 7; i++) {
      const sx = px + rnd.range(0.8, pw - 0.8);
      const sy = d.y0 + rnd.range(0, dh * 0.6);
      ctx.fillStyle = rgba(rnd.chance(0.5) ? '#14262A' : '#F2F0DC', rnd.range(0.1, 0.22));
      ribbon(ctx, [sx, sy, sx + rnd.range(-0.5, 0.5), sy + rnd.range(8, 22), sx + rnd.range(-0.6, 0.6), sy + rnd.range(24, 44)], rnd.range(0.3, 0.7), 0.95);
    }
    if (rnd.chance(0.5)) {
      const kx = px + pw * rnd.range(0.3, 0.7);
      const ky = d.y0 + dh * rnd.range(0.25, 0.85);
      ctx.strokeStyle = rgba('#14262A', 0.34);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.ellipse(kx, ky, 1.2, 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(kx, ky, 0.5, 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // the gap between boards
    ctx.fillStyle = rgba('#120E12', 0.7);
    ribbon(ctx, [px + 0.15, d.y0, px + 0.25, (d.y0 + GROUND_Y) / 2, px + 0.15, GROUND_Y], 0.55, 0.95);
    ctx.fillStyle = rgba('#F4F0DC', 0.28);
    ribbon(ctx, [px + 1.1, d.y0 + 1, px + 1.2, (d.y0 + GROUND_Y) / 2, px + 1.1, GROUND_Y - 2], 0.4, 0.9);
  }
  // wear at the foot of the door (kicked and splashed)
  const wg = ctx.createLinearGradient(0, GROUND_Y - 20, 0, GROUND_Y);
  wg.addColorStop(0, 'rgba(30,22,26,0)');
  wg.addColorStop(1, 'rgba(30,22,26,0.4)');
  ctx.fillStyle = wg;
  ctx.fillRect(d.x0, GROUND_Y - 20, dw, 20);
  // cast shadow of the lintel and of the left reveal on the leaf
  const tg = ctx.createLinearGradient(0, d.y0, 0, d.y0 + 11);
  tg.addColorStop(0, 'rgba(20,14,22,0.62)');
  tg.addColorStop(1, 'rgba(20,14,22,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(d.x0, d.y0, dw, 11);
  const lgx = ctx.createLinearGradient(d.x0, 0, d.x0 + 6, 0);
  lgx.addColorStop(0, 'rgba(20,14,22,0.5)');
  lgx.addColorStop(1, 'rgba(20,14,22,0)');
  ctx.fillStyle = lgx;
  ctx.fillRect(d.x0, d.y0, 6, dh);

  // ---- a glazed light in the teal door; plain boards under a wreath on the green one
  if (teal) {
    const gx0 = d.x0 + 8.5;
    const gx1 = d.x1 - 8.5;
    const gy0 = d.y0 + 15;
    const gy1 = d.y0 + 38;
    ctx.fillStyle = '#EDE3CA';
    ctx.fillRect(gx0 - 2, gy0 - 2, gx1 - gx0 + 4, gy1 - gy0 + 4);
    const gl = ctx.createRadialGradient((gx0 + gx1) / 2 - 3, (gy0 + gy1) / 2, 1, (gx0 + gx1) / 2, (gy0 + gy1) / 2, 22);
    gl.addColorStop(0, '#FFE8A4');
    gl.addColorStop(0.5, '#F6B858');
    gl.addColorStop(1, '#C0702E');
    ctx.fillStyle = gl;
    ctx.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    fillPoly(ctx, [gx0, gy0, gx0 + (gx1 - gx0) * 0.7, gy0, gx0, gy0 + (gy1 - gy0) * 0.7], '#D4ECFA', 0.2);
    const sg = ctx.createLinearGradient(gx0, 0, gx0 + 4, 0);
    sg.addColorStop(0, 'rgba(36,24,28,0.45)');
    sg.addColorStop(1, 'rgba(36,24,28,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(gx0, gy0, 4, gy1 - gy0);
    ctx.fillStyle = '#F0E6CC';
    for (let k = 1; k < 3; k++) ctx.fillRect(gx0 + ((gx1 - gx0) * k) / 3 - 0.55, gy0, 1.1, gy1 - gy0);
    ctx.fillRect(gx0, (gy0 + gy1) / 2 - 0.55, gx1 - gx0, 1.1);
    ctx.fillStyle = rgba('#8C7A66', 0.5);
    ctx.fillRect(gx0 - 2, gy1, gx1 - gx0 + 4, 1.2);
    edgeInk(P, [gx0 - 2, gy1 + 2, gx1 + 2, gy1 + 2, gx1 + 2, gy0 - 2], 0.4, 0.5, { dash: [8, 20], color: '#1A2A2E' });
  } else {
    // a pair of recessed panel mouldings in the upper boards
    for (const px of [d.x0 + 8.4, d.x0 + dw * 0.54]) {
      ctx.strokeStyle = rgba('#14261A', 0.4);
      ctx.lineWidth = 0.55;
      ctx.strokeRect(px, d.y0 + 11, dw * 0.32 - 1, 24);
      ctx.strokeStyle = rgba('#E8F2DC', 0.22);
      ctx.strokeRect(px + 0.6, d.y0 + 11.6, dw * 0.32 - 1, 24);
    }
  }
  // ---- strap hinges from the left, an iron latch on the right
  for (const f of [0.115, 0.78]) {
    const hy = d.y0 + dh * f;
    const hp = [d.x0 + 0.5, hy - 2.1, d.x0 + dw * 0.62, hy - 0.9, d.x0 + dw * 0.64, hy + 0.9, d.x0 + 0.5, hy + 2.1];
    fillPoly(ctx, shift(hp, 0.5, 0.8), '#14101A', 0.3);
    fillPoly(ctx, deform(hp, rnd, 1, 0.01), '#26262E', 0.96);
    ctx.fillStyle = rgba('#9EA6B8', 0.4);
    ribbon(ctx, [d.x0 + 1.4, hy - 1.6, d.x0 + dw * 0.3, hy - 1.1, d.x0 + dw * 0.58, hy - 0.5], 0.5, 0.9);
    for (const k of [0.1, 0.34, 0.56]) {
      ctx.fillStyle = rgba('#0E0C12', 0.75);
      ctx.beginPath();
      ctx.arc(d.x0 + dw * k, hy, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const lx = d.x1 - 6.8;
  const ly = d.y0 + dh * 0.5;
  fillPoly(ctx, [lx - 1.6, ly - 5, lx + 1.6, ly - 5, lx + 1.8, ly + 5, lx - 1.8, ly + 5], '#26262E', 0.95);
  ctx.fillStyle = rgba('#9EA6B8', 0.4);
  ribbon(ctx, [lx - 1, ly - 4.6, lx - 1, ly, lx - 1, ly + 4.4], 0.5, 0.9);
  // thumb latch lever and a brass escutcheon with a keyhole
  ctx.fillStyle = rgba('#26262E', 0.95);
  ribbon(ctx, [lx - 7, ly - 5.4, lx - 3, ly - 5.6, lx + 1, ly - 5], 1.4, 0.7);
  fillPoly(ctx, lump(lx, ly + 5.4, 1.6, 2.2, rnd, 9, 0.06), '#C7983E', 0.95);
  ctx.fillStyle = rgba('#FFE8A0', 0.6);
  ctx.beginPath();
  ctx.arc(lx - 0.5, ly + 4.7, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#241A18', 0.9);
  ctx.beginPath();
  ctx.arc(lx, ly + 5.3, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(lx - 0.18, ly + 5.3, 0.36, 1.2);
  // a brass knob/ring higher on the green door's right: the knocker
  if (!teal) {
    const kx = d.x0 + dw * 0.5;
    const ky = d.y0 + dh * 0.17;
    fillPoly(ctx, lump(kx, ky + 3.4, 2.4, 2.8, rnd, 9, 0.06), '#C7983E', 0.5);
    ctx.strokeStyle = rgba('#C7983E', 0.95);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(kx, ky + 4, 2.3, 2.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba('#FFE8A0', 0.55);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(kx, ky + 4, 2.5, 3.4, 4.5);
    ctx.stroke();
  }
  // outer broken ink on the leaf, on its shaded right and its foot
  edgeInk(P, [d.x1 - 0.2, d.y0 + 2, d.x1 - 0.1, d.y0 + dh * 0.5, d.x1 - 0.2, GROUND_Y - 2], 0.5, 0.5, { dash: [8, 24], color: '#0E181A' });

  // ---- the lintel: three dressed stones; a slightly projecting top
  {
    const lh = lintelH + 3.4;
    const lx0 = d.x0 - rev.l - 13.2;
    const lx1 = d.x1 + rev.r + 11.2;
    const ly0 = d.y0 - rev.t - lh + 0.4;
    const cuts = [0.3, 0.7];
    let xa = lx0;
    for (let k = 0; k <= cuts.length; k++) {
      const xb = k < cuts.length ? lx0 + (lx1 - lx0) * cuts[k]! + rnd.range(-1.5, 1.5) : lx1;
      paintStone(P, xa, ly0, xb - xa - 0.5, lh, mix(rnd.pick(['#DCCEAE', '#E2D6BA', '#D4C6A6']), '#B3A488', 0.08), { dressed: true, lit: 0.7, shadow: 1.1, ink: 0.95, speck: 0.2 });
      xa = xb;
    }
    softWash(ctx, [lx0 + 6, ly0 + lh + 1, lx1 + 3, ly0 + lh + 1, lx1 + 3, ly0 + lh + 11, lx0 + 8, ly0 + lh + 11], '#2E2230', 0.22, rnd, 3, 0.7);
  }

  // ---- the step: a worn stone slab, lit on top, with its front face and cast shadow
  {
    const sx0 = d.x0 - 8;
    const sx1 = d.x1 + 8;
    fillPoly(ctx, [sx0 + 3, GROUND_Y + 6, sx1 + 6, GROUND_Y + 6, sx1 + 9, GROUND_Y + 10, sx0 + 5, GROUND_Y + 10], '#2E2230', 0.18);
    paintStone(P, sx0, GROUND_Y - 1.4, sx1 - sx0, 4, '#E4D8BE', { dressed: true, round: 1.2, lit: 0.9, shadow: 0.2, ink: 0.3, speck: 0.2 });
    paintStone(P, sx0 + 0.8, GROUND_Y + 2.4, sx1 - sx0 - 1.6, 4.4, '#CDBF9F', { dressed: true, round: 1.3, lit: 0.1, shadow: 1.2, ink: 0.95, speck: 0.2 });
    // a wide lower tread, worn and mossy at one end
    paintStone(P, sx0 - 6, GROUND_Y + 7, sx1 - sx0 + 12, 4.4, '#C4B596', { dressed: true, round: 1.4, lit: 0.3, shadow: 0.8, ink: 0.8, speck: 0.3, lichen: 0.6 });
  }
}

function rnd13(P: Paint): number {
  return P.rnd.range(12, 14.5);
}

/** a wall lantern on an iron bracket, softly lit */
export function paintLantern(P: Paint, x: number, y: number): void {
  const { ctx, rnd } = P;
  // a warm halo on the wall
  const g = ctx.createRadialGradient(x, y + 5, 1, x, y + 5, 24);
  g.addColorStop(0, 'rgba(255,214,120,0.34)');
  g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 26, y - 20, 52, 52);
  fillPoly(ctx, [x - 8, y - 1, x - 1.5, y - 1, x - 1.5, y + 0.8, x - 8, y + 0.8], '#2A2830', 0.95);
  ctx.strokeStyle = rgba('#2A2830', 0.95);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 0.2);
  ctx.quadraticCurveTo(x - 7, y - 7, x - 1, y - 6.5);
  ctx.stroke();
  // lantern: cap, glass, base
  fillPoly(ctx, [x - 1.5, y - 7, x + 4.5, y - 7, x + 5.4, y - 4.8, x - 2.4, y - 4.8], '#2A2830', 0.96);
  ctx.beginPath();
  ctx.arc(x + 1.5, y - 8.2, 1.1, 0, Math.PI * 2);
  ctx.stroke();
  const body = [x - 2.2, y - 4.8, x + 5.2, y - 4.8, x + 4.4, y + 5.2, x - 1.4, y + 5.2];
  const gl = ctx.createLinearGradient(x - 2, y - 5, x + 5, y + 5);
  gl.addColorStop(0, '#FFF0B0');
  gl.addColorStop(0.5, '#F8C860');
  gl.addColorStop(1, '#D08A3A');
  ctx.fillStyle = gl;
  tracePoly(ctx, body);
  ctx.fill();
  ctx.fillStyle = rgba('#2A2830', 0.9);
  ctx.fillRect(x - 2.3, y - 4.8, 0.8, 10);
  ctx.fillRect(x + 4.3, y - 4.8, 0.9, 10);
  ctx.fillRect(x + 1.1, y - 4.8, 0.6, 10);
  fillPoly(ctx, [x - 1.8, y + 5.2, x + 4.8, y + 5.2, x + 4, y + 7, x - 1, y + 7], '#2A2830', 0.95);
  ctx.fillStyle = rgba('#FFFBEA', 0.6);
  ctx.fillRect(x - 0.5, y - 3.6, 0.9, 4);
  void rnd;
}

/** a little painted plaque hung by the door: a leaf on a ground of weathered slate-blue */
export function paintPlaque(P: Paint, x: number, y: number): void {
  const { ctx, rnd } = P;
  const w = 15;
  const h = 10;
  fillPoly(ctx, [x + 1, y + 1, x + w + 1.4, y + 1, x + w + 1.4, y + h + 1.6, x + 1, y + h + 1.6], '#2E2230', 0.22);
  const poly = deform(rrPoly(x, y, w, h, 1.4, rnd, 0.3), rnd, 1, 0.02);
  fillPoly(ctx, poly, '#6A5238', 0.97);
  fillPoly(ctx, deform(rrPoly(x + 1.1, y + 1.1, w - 2.2, h - 2.2, 0.9, rnd, 0.3), rnd, 1, 0.02), '#D8D0A8', 0.96);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,244,214,0.3)');
  g.addColorStop(0.5, 'rgba(255,244,214,0)');
  g.addColorStop(1, 'rgba(40,24,30,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // an autumn leaf painted on it
  ctx.fillStyle = rgba('#C4502E', 0.9);
  almond(ctx, x + w / 2, y + h / 2, -0.6, 7, 2.4);
  ctx.fill();
  ctx.strokeStyle = rgba('#5A2A1A', 0.8);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 3, y + h / 2 + 2);
  ctx.lineTo(x + w / 2 + 3, y + h / 2 - 2);
  ctx.stroke();
  edgeInk(P, [x + w, y + 0.5, x + w, y + h, x + 0.5, y + h], 0.4, 0.5, { dash: [4, 10] });
  ctx.fillStyle = rgba('#2A2830', 0.9);
  ctx.beginPath();
  ctx.arc(x + 2, y - 0.4, 0.6, 0, Math.PI * 2);
  ctx.arc(x + w - 2, y - 0.4, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** a wreath of autumn leaves, berries and a ribbon on the door */
export function paintWreath(P: Paint, cx: number, cy: number): void {
  const { ctx, rnd } = P;
  const R = 8.2;
  ctx.strokeStyle = rgba('#5A3E22', 0.9);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  const cols = ['#C4502E', '#E0903A', '#D8B040', '#8E3A2E', '#9A7A34', '#B8632E'];
  for (let i = 0; i < 38; i++) {
    const a = (i / 38) * Math.PI * 2 + rnd.range(-0.06, 0.06);
    const rr = R + rnd.range(-1.5, 1.5);
    ctx.fillStyle = rgba(rnd.pick(cols), rnd.range(0.72, 0.95));
    almond(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + rnd.range(0.5, 1.2), rnd.range(3.4, 5), rnd.range(1, 1.5));
    ctx.fill();
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd.range(0, Math.PI * 2);
    ctx.fillStyle = rgba(rnd.pick(['#B83A3A', '#8E2A34', '#D85A3A']), 0.92);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (R + rnd.range(-1, 1)), cy + Math.sin(a) * (R + rnd.range(-1, 1)), 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // the ribbon and bow at the bottom
  ctx.fillStyle = rgba('#B8402E', 0.95);
  almond(ctx, cx - 3.2, cy + R + 0.6, 0.4, 6.4, 1.8);
  ctx.fill();
  almond(ctx, cx + 3.2, cy + R + 0.6, -0.4 + Math.PI, 6.4, 1.8);
  ctx.fill();
  ribbon(ctx, [cx - 1, cy + R, cx - 2.6, cy + R + 4.4, cx - 3.4, cy + R + 8], 1.8, 0.7);
  ribbon(ctx, [cx + 1, cy + R, cx + 2.6, cy + R + 4.4, cx + 3.4, cy + R + 8], 1.8, 0.7);
  ctx.fillStyle = rgba('#8A2A22', 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy + R + 0.8, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // a soft shadow cast to the lower right on the door
  softWash(ctx, lump(cx + 1.8, cy + 2.2, R + 2.6, R + 2.6, rnd, 14, 0.06), '#0E1A12', 0.2, rnd, 3, 0.8);
}

/** pot of chrysanthemums on the ground beside the door (centre bottom at x, ground y) */
export function paintMumsPot(P: Paint, px: number, py: number): void {
  const { ctx, rnd } = P;
  softWash(ctx, lump(px + 5, py + 0.4, 12, 2.8, rnd, 10, 0.12), '#2E2230', 0.34, rnd, 3, 0.7);
  const pot = [px - 7.6, py - 13, px + 7.6, py - 13, px + 5.4, py, px - 5.4, py];
  fillPoly(ctx, deform(pot, rnd, 1, 0.01), '#B8643C', 0.97);
  ctx.save();
  tracePoly(ctx, pot);
  ctx.clip();
  const g = ctx.createLinearGradient(px - 7, 0, px + 7, 0);
  g.addColorStop(0, 'rgba(255,230,190,0.42)');
  g.addColorStop(0.4, 'rgba(255,230,190,0)');
  g.addColorStop(1, 'rgba(70,28,20,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(px - 8, py - 13, 16, 13);
  ctx.fillStyle = rgba('#7A3A22', 0.28);
  ctx.fillRect(px - 8, py - 3.4, 16, 0.8);
  ctx.restore();
  fillPoly(ctx, [px - 8.8, py - 15.4, px + 8.8, py - 15.4, px + 8.4, py - 11.8, px - 8.4, py - 11.8], '#A5552E', 0.98);
  ctx.fillStyle = rgba('#FFE8C8', 0.4);
  ctx.fillRect(px - 8.4, py - 15.2, 16.4, 0.9);
  edgeInk(P, [px + 8.4, py - 11.4, px + 5.4, py, px - 5, py], 0.5, 0.55, { dash: [6, 16] });
  edgeInk(P, [px + 8.8, py - 15, px + 8.6, py - 12], 0.4, 0.5);
  // leaves and domed blooms
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#5E7A3A', '#7C9448', '#4E6A34']), 0.85);
    almond(ctx, px + rnd.range(-8, 8), py - 17 - rnd.range(0, 3), rnd.range(-2.8, -0.4), rnd.range(4, 6.4), rnd.range(1, 1.6));
    ctx.fill();
  }
  const mums = ['#E8B03A', '#D8602E', '#B83A3A', '#F0C84E', '#C9502E'];
  for (let i = 0; i < 12; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = Math.sqrt(rnd.next()) * 9.2;
    bloomHead(ctx, px + Math.cos(a) * r, py - 22 - Math.abs(Math.sin(a)) * r * 0.5, rnd.range(2.6, 3.4), rnd.pick(mums), rnd, 9);
  }
}

/** a stack of split logs by the door (left edge x, ground y) */
export function paintLogs(P: Paint, lx: number, gy: number): void {
  const { ctx, rnd } = P;
  softWash(ctx, lump(lx + 15, gy + 1, 20, 3.4, rnd, 10, 0.12), '#2E2230', 0.3, rnd, 3, 0.7);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 4 - r; i++) {
      const cx = lx + 3.8 + i * 7.6 + r * 3.8;
      const cy = gy - 3.4 - r * 6.2;
      const rx = 3.7 + rnd.range(-0.2, 0.3);
      const ry = 3.3 + rnd.range(-0.2, 0.3);
      fillPoly(ctx, lump(cx + 0.6, cy + 0.8, rx, ry, rnd, 10, 0.05), '#2E2230', 0.22);
      fillPoly(ctx, lump(cx, cy, rx, ry, rnd, 12, 0.06), rnd.pick(['#7A5634', '#6A4A2E', '#86603A']), 0.96);
      const inner = lump(cx - 0.2, cy, rx * 0.8, ry * 0.78, rnd, 12, 0.05);
      fillPoly(ctx, inner, rnd.pick(['#D9B880', '#CFAE76', '#E0C48E']), 0.95);
      ctx.save();
      tracePoly(ctx, inner);
      ctx.clip();
      const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
      g.addColorStop(0, 'rgba(255,244,214,0.36)');
      g.addColorStop(1, 'rgba(70,40,20,0.32)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      ctx.restore();
      ctx.strokeStyle = rgba('#7A5632', 0.55);
      ctx.lineWidth = 0.28;
      for (let k = 1; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(cx - 0.2, cy, rx * 0.8 * (k / 3), ry * 0.78 * (k / 3), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - 0.2, cy);
      ctx.lineTo(cx - 0.2 + rx * 0.7, cy + rnd.range(-1, 1));
      ctx.stroke();
      edgeInk(P, [cx + rx * 0.2, cy + ry, cx - rx * 0.6, cy + ry * 0.8, cx - rx, cy + 0.2], 0.4, 0.5, { dash: [4, 8] });
    }
  }
}

/** two pumpkins by the step: a big ribbed one and a small one, painted as washes with a stalk and curling vine */
export function paintPumpkins(P: Paint, x: number, gy: number): void {
  const { ctx, rnd } = P;
  const one = (cx: number, cy: number, rx: number, ry: number, col: string) => {
    softWash(ctx, lump(cx + rx * 0.5, cy + ry * 0.95, rx * 1.3, ry * 0.3, rnd, 10, 0.1), '#2E2230', 0.34, rnd, 3, 0.7);
    // a pumpkin is a few fat lobes side by side
    const lobes = [-0.55, -0.2, 0.2, 0.55];
    for (const [i, lx] of lobes.entries()) {
      const lw = rx * (i === 1 || i === 2 ? 0.62 : 0.5);
      const poly = lump(cx + lx * rx, cy, lw, ry * (i === 1 || i === 2 ? 1 : 0.9), rnd, 12, 0.05);
      fillPoly(ctx, poly, mix(col, rnd.pick(['#C44A1C', '#E8962E', '#D8741E']), 0.3), 0.93);
      const g = ctx.createLinearGradient(cx + lx * rx - lw, cy - ry, cx + lx * rx + lw, cy + ry);
      g.addColorStop(0, 'rgba(255,226,150,0.36)');
      g.addColorStop(0.5, 'rgba(255,226,150,0)');
      g.addColorStop(1, 'rgba(90,30,10,0.38)');
      ctx.fillStyle = g;
      tracePoly(ctx, poly);
      ctx.fill();
    }
    // rib grooves
    for (const gx of [-0.38, 0, 0.38]) {
      ctx.fillStyle = rgba('#7A2E10', rnd.range(0.3, 0.46));
      ribbon(ctx, [cx + gx * rx, cy - ry * 0.85, cx + gx * rx * 1.08, cy, cx + gx * rx, cy + ry * 0.85], 0.55, 0.9);
    }
    ctx.fillStyle = rgba('#FFF0C8', 0.4);
    ribbon(ctx, [cx - rx * 0.7, cy - ry * 0.3, cx - rx * 0.62, cy - ry * 0.6, cx - rx * 0.4, cy - ry * 0.8], 0.8, 0.9);
    // the stalk
    fillPoly(ctx, [cx - 1, cy - ry + 0.6, cx + 1.2, cy - ry + 0.6, cx + 1.8, cy - ry - 3.2, cx - 0.2, cy - ry - 3.6], '#6A5A2A', 0.95);
    ctx.fillStyle = rgba('#B8A04E', 0.5);
    ribbon(ctx, [cx - 0.6, cy - ry + 0.4, cx - 0.2, cy - ry - 3.4], 0.5, 0.8);
    brokenLine(P, [cx + rx * 0.9, cy + ry * 0.2, cx + rx * 0.95, cy + ry * 0.8, cx + rx * 0.5, cy + ry], 0.5, '#5A2410', 0.5, { seg: [4, 10], gap: [0.8, 2.4] });
  };
  one(x + 7.4, gy - 5.6, 7.6, 5.6, '#E07A24');
  one(x + 18.4, gy - 3.6, 4.6, 3.6, '#E8923A');
  // a curl of vine with a leaf
  ctx.strokeStyle = rgba('#5E7A3A', 0.8);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + 7.6, gy - 11);
  ctx.bezierCurveTo(x + 12, gy - 16, x + 15, gy - 12, x + 13, gy - 10);
  ctx.stroke();
  ctx.fillStyle = rgba('#6E8C3A', 0.85);
  almond(ctx, x + 11.6, gy - 13.4, -0.3, 5, 2);
  ctx.fill();
}

/** a coir doormat on the ground in front of the step */
export function paintMat(P: Paint, x0: number, x1: number, y: number): void {
  const { ctx, rnd } = P;
  const poly = [x0, y, x1, y, x1 + 1.6, y + 5, x0 - 1.6, y + 5];
  fillPoly(ctx, shift(poly, 0.8, 1.2), '#2E2230', 0.2);
  fillPoly(ctx, deform(poly, rnd, 1, 0.01), '#8E6A40', 0.97);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = rgba(rnd.pick(['#5E4228', '#B08A56', '#6E4E2C', '#C9A36A']), rnd.range(0.25, 0.55));
    ribbon(ctx, [rnd.range(x0, x1), y + rnd.range(0, 4.6), rnd.range(x0, x1)], 0.4, 0.8);
  }
  ctx.strokeStyle = rgba('#4A3220', 0.7);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x0 + 2.4, y + 1.2, x1 - x0 - 4.8, 2.6);
  ctx.restore();
  edgeInk(P, [x1 + 1.6, y + 5, x0 - 1.6, y + 5], 0.4, 0.5, { dash: [6, 14] });
}
