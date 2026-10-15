/**
 * Windows and window boxes: a stone lintel and projecting sill, dressed jamb stones, a deep reveal (shadowed on
 * the left and top, lit on the right, the sun being upper left), a painted cream frame with glazing bars, panes
 * with a warm lamp glow, a cool sky reflection and curtains, and a flower box of autumn colour on one of them.
 */
import { almond, deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import type { Rect } from './geom';
import { edgeInk, fillPoly, lump, paintStone, softWash, type Paint } from './cottagePaint';

const JAMB = ['#E0D2B2', '#D6C8A8', '#E6DAC0', '#D2C3A2'];
const LINTEL = ['#DCCEAE', '#E2D6BA', '#D4C6A6'];

export interface WindowOpts {
  /** lintel height (the thatch hangs low) */
  lintelH: number;
  curtain: string;
  box?: 'terracotta' | 'wood';
}

export function paintWindow(P: Paint, win: Rect, idx: number, o: WindowOpts): void {
  const { ctx, rnd } = P;
  const wx0 = win.x0;
  const wx1 = win.x1;
  const wy0 = win.y0;
  const wy1 = win.y1;
  const ww = wx1 - wx0;
  const wh = wy1 - wy0;
  const rev = { l: 3.2, t: 3.6, r: 2.2 };

  // ---- the dark recess behind everything, with its own cast shadow on the wall to the lower right
  fillPoly(ctx, [wx0 - rev.l, wy0 - rev.t, wx1 + rev.r, wy0 - rev.t, wx1 + rev.r, wy1 + 1, wx0 - rev.l, wy1 + 1], '#34262A', 0.98);

  // ---- jamb stones: long and short alternating, dressed
  for (const side of [0, 1]) {
    let y = wy0 - rev.t;
    let k = (idx + side) % 2;
    while (y < wy1 + 1) {
      const hh = Math.min(rnd.range(12, 15.5), wy1 + 1 - y + 0.4);
      const w = k % 2 === 0 ? rnd.range(8.6, 10.2) : rnd.range(5.4, 6.6);
      const x = side === 0 ? wx0 - rev.l - w : wx1 + rev.r;
      paintStone(P, x, y, w, hh - 0.5, mix(rnd.pick(JAMB), '#A89A80', 0.12), { dressed: true, lit: 0.5, shadow: 0.9, ink: 0.85, speck: 0.2 });
      y += hh;
      k++;
    }
  }
  // ---- the reveal: the opening's inner faces (left and top in shade, right lit)
  fillPoly(ctx, [wx0 - rev.l, wy0 - rev.t, wx0, wy0, wx0, wy1, wx0 - rev.l, wy1], '#4A3A38', 0.98);
  fillPoly(ctx, [wx0 - rev.l, wy0 - rev.t, wx1 + rev.r, wy0 - rev.t, wx1, wy0, wx0, wy0], '#2C2024', 0.98);
  fillPoly(ctx, [wx1, wy0, wx1 + rev.r, wy0 - rev.t, wx1 + rev.r, wy1, wx1, wy1], '#CDBB9A', 0.98);
  ctx.fillStyle = rgba('#FFF2D4', 0.3);
  ctx.fillRect(wx1 + 0.2, wy0, 0.9, wh);

  // ---- the sash: cream frame, glass and bars
  const fw = 1.9;
  const gx0 = wx0 + fw;
  const gx1 = wx1 - fw;
  const gy0 = wy0 + fw;
  const gy1 = wy1 - fw;
  const gw = gx1 - gx0;
  const gh = gy1 - gy0;
  const cols = ww > 60 ? 3 : 2;
  const rows = 3;
  const bar = 1.15;
  // glass: a warm room lit by a lamp, deeper toward the edges
  const gl = ctx.createRadialGradient(gx0 + gw * 0.46, gy0 + gh * 0.55, 1.5, gx0 + gw * 0.5, gy0 + gh * 0.5, Math.max(gw, gh) * 0.78);
  gl.addColorStop(0, '#FFE8A4');
  gl.addColorStop(0.45, '#F8BC58');
  gl.addColorStop(1, '#B9682A');
  ctx.fillStyle = gl;
  ctx.fillRect(gx0, gy0, gw, gh);
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx0, gy0, gw, gh);
  ctx.clip();
  // furnishings seen through: curtains at both sides (gathered, with folds), a shelf with a jug and a plant
  const ca = o.curtain;
  for (const s of [0, 1]) {
    const cw = gw * (s === 0 ? 0.22 : 0.19);
    const cx = s === 0 ? gx0 : gx1 - cw;
    const poly = [cx, gy0, cx + cw, gy0, cx + cw * (s === 0 ? 0.8 : 1), gy0 + gh * 0.55, cx + cw * (s === 0 ? 0.55 : 0.9), gy0 + gh * 0.7, cx + cw * (s === 0 ? 0.62 : 1), gy1, cx, gy1];
    fillPoly(ctx, poly, ca, 0.78);
    fillPoly(ctx, deform(poly, rnd, 1, 0.02), mix(ca, '#2E1E22', 0.3), 0.24);
    for (let k = 1; k < 4; k++) {
      ctx.fillStyle = rgba('#2A1A20', 0.32);
      ribbon(ctx, [cx + (cw * k) / 4.4, gy0 + 0.6, cx + (cw * k) / 4.2 + 0.4, gy0 + gh * 0.45, cx + (cw * k) / 4.6, gy1 - 1], 0.6, 0.9);
      ctx.fillStyle = rgba('#FFE6C8', 0.22);
      ribbon(ctx, [cx + (cw * k) / 4.4 - 0.7, gy0 + 0.6, cx + (cw * k) / 4.2 - 0.3, gy0 + gh * 0.45, cx + (cw * k) / 4.6 - 0.7, gy1 - 1], 0.45, 0.9);
    }
  }
  // the shelf and the things on it
  const shy = gy0 + gh * 0.74;
  ctx.fillStyle = rgba('#4A2C1C', 0.62);
  ctx.fillRect(gx0 + gw * 0.2, shy, gw * 0.6, 1.6);
  ctx.fillStyle = rgba('#3A2218', 0.6);
  fillPoly(ctx, lump(gx0 + gw * 0.38, shy - 3.2, 1.9, 3.2, rnd, 9, 0.1), '#3A2218', 0.62);
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = rgba('#3F5A32', 0.6);
    ctx.beginPath();
    ctx.ellipse(gx0 + gw * 0.62 + rnd.range(-2.4, 2.4), shy - 3.6 - rnd.range(0, 3.6), 1.6, 0.8, rnd.range(-1, 1), 0, Math.PI * 2);
    ctx.fill();
  }
  // the reveal's shadow falls over the glass at the left and top; the right side catches light
  const sgx = ctx.createLinearGradient(gx0, 0, gx0 + 5.5, 0);
  sgx.addColorStop(0, 'rgba(36,24,28,0.5)');
  sgx.addColorStop(1, 'rgba(36,24,28,0)');
  ctx.fillStyle = sgx;
  ctx.fillRect(gx0, gy0, 5.5, gh);
  const sgy = ctx.createLinearGradient(0, gy0, 0, gy0 + 6);
  sgy.addColorStop(0, 'rgba(36,24,28,0.5)');
  sgy.addColorStop(1, 'rgba(36,24,28,0)');
  ctx.fillStyle = sgy;
  ctx.fillRect(gx0, gy0, gw, 6);
  // cool sky reflected in each pane: a pale slanting wash and a streak (light from the upper left)
  for (let cI = 0; cI < cols; cI++) {
    for (let rI = 0; rI < rows; rI++) {
      const px = gx0 + (gw * cI) / cols;
      const py = gy0 + (gh * rI) / rows;
      const pw = gw / cols;
      const ph = gh / rows;
      const a = 0.17 + rnd.range(-0.04, 0.05) + (cI === 0 && rI === 0 ? 0.06 : 0);
      fillPoly(ctx, [px, py, px + pw * 0.78, py, px, py + ph * 0.8], '#D4ECFA', a);
      ctx.fillStyle = rgba('#F2FAFF', 0.28);
      ribbon(ctx, [px + pw * 0.14, py + ph * 0.68, px + pw * 0.4, py + ph * 0.34, px + pw * 0.62, py + ph * 0.1], 0.9, 0.9);
    }
  }
  ctx.restore();
  // glazing bars, painted cream with a shaded right edge and a lit left edge
  const barLine = (x0: number, y0: number, x1: number, y1: number) => {
    const bx = rnd.range(-0.15, 0.15);
    const by = rnd.range(-0.15, 0.15);
    ctx.fillStyle = rgba('#8C7A66', 0.5);
    ribbon(ctx, [x0 + 0.5 + bx, y0 + 0.5, (x0 + x1) / 2 + 0.5 + by, (y0 + y1) / 2 + 0.5, x1 + 0.5, y1 + 0.5], bar, 0.3);
    ctx.fillStyle = rgba('#F2E8D0', 0.97);
    ribbon(ctx, [x0 + bx, y0, (x0 + x1) / 2 + by, (y0 + y1) / 2, x1, y1], bar, 0.3);
    ctx.fillStyle = rgba('#FFFDF4', 0.6);
    ribbon(ctx, [x0 - 0.3 + bx, y0, (x0 + x1) / 2 - 0.3, (y0 + y1) / 2, x1 - 0.3, y1], bar * 0.4, 0.3);
  };
  for (let k = 1; k < cols; k++) barLine(gx0 + (gw * k) / cols, gy0, gx0 + (gw * k) / cols, gy1);
  for (let k = 1; k < rows; k++) barLine(gx0, gy0 + (gh * k) / rows, gx1, gy0 + (gh * k) / rows);
  // the frame
  ctx.fillStyle = rgba('#8C7A66', 0.5);
  ctx.fillRect(wx0, wy1 - fw, ww, fw);
  ctx.fillRect(wx1 - fw, wy0, fw, wh);
  ctx.fillStyle = rgba('#F0E6CC', 0.98);
  ctx.fillRect(wx0, wy0, ww, fw);
  ctx.fillRect(wx0, wy0, fw, wh);
  ctx.fillStyle = rgba('#E2D6B8', 0.98);
  ctx.fillRect(wx0, wy1 - fw, ww, fw * 0.78);
  ctx.fillRect(wx1 - fw, wy0, fw * 0.78, wh);
  ctx.fillStyle = rgba('#FFFDF2', 0.5);
  ctx.fillRect(wx0, wy0, ww, 0.55);
  ctx.fillRect(wx0, wy0, 0.55, wh);
  edgeInk(P, [wx0, wy1, wx1 - 0.3, wy1 - 0.2, wx1, wy0 + 6, wx1 - 0.2, wy0], 0.4, 0.46, { dash: [8, 22], gap: [0.5, 2.4], color: '#4A3A32' });
  edgeInk(P, [wx0 + 0.3, wy1 - 3, wx0 + 0.2, wy0 + 2, wx0 + 6, wy0 + 0.2], 0.3, 0.34, { dash: [6, 18], gap: [0.6, 3.6], color: '#4A3A32' });

  // ---- the lintel: a flat stone slab in three pieces, thick at the front, with its underside in shade
  {
    const lh = o.lintelH;
    const lx0 = wx0 - rev.l - 10.4;
    const lx1 = wx1 + rev.r + 10.4;
    const ly = wy0 - rev.t - lh + 0.5;
    const parts = [0.34, 0.66];
    let xa = lx0;
    for (let k = 0; k <= parts.length; k++) {
      const xb = k < parts.length ? lx0 + (lx1 - lx0) * parts[k]! + rnd.range(-2, 2) : lx1;
      paintStone(P, xa, ly, xb - xa - 0.5, lh, mix(rnd.pick(LINTEL), '#B3A488', 0.08), { dressed: true, lit: 0.7, shadow: 1.1, ink: 0.95, speck: 0.2 });
      xa = xb;
    }
    // shadow under the lintel falls into the reveal
    ctx.fillStyle = rgba('#241A20', 0.38);
    ctx.fillRect(lx0 + 6, ly + lh - 0.2, lx1 - lx0 - 10, 1.4);
  }

  // ---- the sill: a stone slab sticking out, its lit top face and darker front, and the shadow beneath
  {
    const sx0 = wx0 - rev.l - 11.5;
    const sx1 = wx1 + rev.r + 11.5;
    const sy = wy1 + 0.4;
    fillPoly(ctx, [sx0 + 3, sy + 6, sx1 + 5, sy + 6, sx1 + 7, sy + 13, sx0 + 6, sy + 13], '#2E2230', 0.2);
    softWash(ctx, [sx0 + 4, sy + 5, sx1 + 6, sy + 5, sx1 + 6, sy + 16, sx0 + 8, sy + 16], '#2E2230', 0.22, rnd, 3, 0.7);
    const top = paintStone(P, sx0, sy, sx1 - sx0, 2.9, mix('#E8DCC2', '#B3A488', 0.05), { dressed: true, round: 0.8, lit: 0.9, shadow: 0.2, ink: 0.2, speck: 0.15 });
    void top;
    const front = paintStone(P, sx0 + 0.7, sy + 2.7, sx1 - sx0 - 1.4, 3.6, '#CDBF9F', { dressed: true, round: 0.9, lit: 0.1, shadow: 1.2, ink: 0.95, speck: 0.2 });
    void front;
    // weather stains running down from the sill ends
    for (const sx of [sx0 + 4, sx1 - 4]) {
      ctx.fillStyle = rgba('#6A6A58', 0.12);
      ribbon(ctx, [sx, sy + 6.4, sx + rnd.range(-0.6, 0.6), sy + 11, sx + rnd.range(-0.8, 0.8), sy + 18 + rnd.range(0, 8)], 1.8, 0.9);
    }
  }

  if (o.box) paintBox(P, wx0 - rev.l - 6, wx1 + rev.r + 6, wy1 + 6.2, o.box);
}

/** a window box under the sill, planted with autumn flowers that spill over the front */
function paintBox(P: Paint, x0: number, x1: number, y: number, kind: 'terracotta' | 'wood'): void {
  const { ctx, rnd } = P;
  const h = 10;
  const w = x1 - x0;
  const base = kind === 'terracotta' ? '#B8643C' : '#5E7A58';
  // the cast shadow on the wall
  softWash(ctx, [x0 + 3, y + 3, x1 + 5, y + 3, x1 + 5, y + h + 8, x0 + 6, y + h + 8], '#2E2230', 0.3, rnd, 3, 0.7);
  // foliage behind and spilling over
  const greens = ['#5E7A3A', '#7C9448', '#4E6A34', '#8EA054', '#A8A648'];
  for (let i = 0; i < Math.round(w * 0.9); i++) {
    const gx = x0 + rnd.range(1, w - 1);
    const gy = y - rnd.range(0, 6.5) * rnd.next();
    ctx.fillStyle = rgba(rnd.pick(greens), rnd.range(0.55, 0.9));
    almond(ctx, gx, gy, rnd.range(-2.6, -0.5), rnd.range(3.2, 6), rnd.range(0.9, 1.5));
    ctx.fill();
  }
  const bx = [x0, y, x1, y, x1 - 1.4, y + h, x0 + 1.4, y + h];
  fillPoly(ctx, [x0 + 1, y + 0.5, x1 + 1, y + 0.5, x1, y + h + 1, x0 + 2, y + h + 1], '#2A2030', 0.22);
  fillPoly(ctx, deform(bx, rnd, 1, 0.01), base, 0.96);
  ctx.save();
  tracePoly(ctx, bx);
  ctx.clip();
  const g = ctx.createLinearGradient(x0, y, x1, y + h);
  g.addColorStop(0, 'rgba(255,238,200,0.4)');
  g.addColorStop(0.5, 'rgba(255,238,200,0)');
  g.addColorStop(1, 'rgba(40,20,20,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = rgba('#FFF0D0', 0.4);
  ctx.fillRect(x0, y, w, 1.5);
  if (kind === 'wood') {
    for (let k = 1; k < 4; k++) {
      ctx.fillStyle = rgba('#2E3E2C', 0.4);
      ctx.fillRect(x0 + (w * k) / 4 - 0.3, y, 0.7, h);
    }
    ctx.fillStyle = rgba('#2E3E2C', 0.3);
    ctx.fillRect(x0, y + h * 0.5, w, 0.6);
  } else {
    ctx.fillStyle = rgba('#7A3A22', 0.3);
    ctx.fillRect(x0, y + h * 0.72, w, 0.8);
    ctx.fillStyle = rgba('#A0542E', 0.9);
    ctx.fillRect(x0 - 1, y - 0.4, w + 2, 2.4);
  }
  ctx.restore();
  edgeInk(P, [x0 + 1.4, y + h, (x0 + x1) / 2, y + h + 0.2, x1 - 1.4, y + h, x1, y + 0.6], 0.5, 0.55, { dash: [6, 16] });
  // flowers
  const heads = kind === 'terracotta' ? ['#E8B03A', '#D8602E', '#F0C84E', '#C9502E', '#B83A3A'] : ['#9A6CB4', '#C48AB8', '#E6A83A', '#B4503C', '#D8D0E8'];
  const n = Math.round(w / 3.6);
  for (let i = 0; i < n; i++) {
    const fx = x0 + 2.4 + ((w - 4.8) * (i + rnd.range(0.1, 0.9))) / n;
    const fy = y - 2.4 - rnd.range(0, 5.6);
    bloomHead(ctx, fx, fy, rnd.range(1.9, 2.8), rnd.pick(heads), rnd);
  }
  for (let i = 0; i < 4; i++) {
    const fx = x0 + rnd.range(2, w - 2);
    bloomHead(ctx, fx, y + rnd.range(2, 5), rnd.range(1.5, 2.1), rnd.pick(heads), rnd);
  }
}

export function bloomHead(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, rnd: { range: (a: number, b: number) => number }, petals = 8): void {
  ctx.fillStyle = rgba(col, 0.82);
  const rot = rnd.range(0, 3);
  for (let k = 0; k < petals; k++) {
    const a = rot + (k / petals) * Math.PI * 2;
    almond(ctx, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, a, r * 1.15, r * 0.4);
    ctx.fill();
  }
  ctx.fillStyle = rgba(mix(col, '#FFF4D0', 0.5), 0.5);
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#6E3A1C', 0.8);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
}
