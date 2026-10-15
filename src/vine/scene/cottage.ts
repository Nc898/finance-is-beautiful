/**
 * The two single-storey stone cottages, each painted once into a hi-res sprite: stones painted one by one with
 * broken ink, a slate (left) or thatch (right) roof, a chimney, a wooden door (a different colour on each),
 * two paned windows with a warm glow, a stone step and the soil where the vine is rooted. The right cottage
 * is the mirror image in plan, but lit from the same side (the sun is upper left, so shading is never mirrored).
 */
import { Rand, clamp } from '../../scene/prng';
import { almond, deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { COTTAGE, GROUND_Y } from './geom';
import { INK, grain } from './art';
import type { PlanId } from '../types';

export interface CottageSprite {
  cv: HTMLCanvasElement;
  /** world rect the sprite covers */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CottageInfo {
  sprite: CottageSprite;
  /** top of the chimney (where the smoke starts), world */
  chimney: { x: number; y: number };
}

const R = (n: number) => n;

export function cottageRoofY(id: PlanId, x: number): number {
  const c = COTTAGE[id];
  const x0 = c.wall.x0;
  const x1 = c.wall.x1;
  const ridgeA = x0 + 52;
  const ridgeB = x1 - 52;
  if (x <= ridgeA) return 332 + ((x - (x0 - 18)) / (ridgeA - (x0 - 18))) * (206 - 332);
  if (x >= ridgeB) return 206 + ((x - ridgeB) / (x1 + 18 - ridgeB)) * (332 - 206);
  return 206;
}

export function buildCottage(id: PlanId, q: number): CottageInfo {
  const c = COTTAGE[id];
  const mirror = id === 'fixed';
  const rnd = new Rand(id === 'minimum' ? 9001 : 9107);
  const x0 = c.wall.x0;
  const x1 = c.wall.x1;
  const SX = x0 - 40;
  const SY = 146;
  const W = x1 - x0 + 80;
  const H = GROUND_Y + 22 - SY;
  const cv = makeCanvas(W * q, H * q);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, -SX * q, -SY * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const X = (dx: number) => (mirror ? x1 - dx : x0 + dx);
  const wall = c.wall;

  // ---------------------------------------------------------------- the wall: mortar, then stone by stone
  const mortar = id === 'minimum' ? '#A89A84' : '#AD9A80';
  ctx.fillStyle = mortar;
  ctx.fillRect(wall.x0, wall.y0 - 2, wall.x1 - wall.x0, wall.y1 - wall.y0 + 4);
  const stoneCols = id === 'minimum' ? ['#CBBA9E', '#BDAA8E', '#D4C4A6', '#B6A288', '#C6B294', '#C0A98A', '#CDBEA4'] : ['#D3BC96', '#C4AB86', '#DCC8A4', '#BCA27C', '#CBB38E', '#C8A988', '#D6C4A0'];
  const stone = (xa: number, ya: number, w: number, h: number) => {
    const pad = 0.55;
    const cx = xa + w / 2;
    const cy = ya + h / 2;
    const rr = Math.min(w, h) * 0.2;
    const pts: number[] = [];
    const corners: Array<[number, number, number, number]> = [
      [xa + pad, ya + pad, 1, 1],
      [xa + w - pad, ya + pad, -1, 1],
      [xa + w - pad, ya + h - pad, -1, -1],
      [xa + pad, ya + h - pad, 1, -1],
    ];
    for (const [px, py, sx, sy] of corners) {
      pts.push(px + sx * rr * rnd.range(0.2, 1), py + sy * rr * rnd.range(0.0, 0.3));
      pts.push(px + sx * rr * rnd.range(0.0, 0.3), py + sy * rr * rnd.range(0.2, 1));
    }
    // reorder around the shape: (the pairs above come as corner start/end; keep as is, it is a valid loop)
    const col = rnd.pick(stoneCols);
    ctx.fillStyle = rgba(col, 0.88);
    tracePoly(ctx, pts);
    ctx.fill();
    ctx.fillStyle = rgba(rnd.pick(stoneCols), 0.3);
    tracePoly(ctx, deform(pts, rnd, 1, 0.05));
    ctx.fill();
    // lit upper left, shaded lower right
    ctx.fillStyle = 'rgba(255,246,218,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.17, cy - h * 0.2, w * 0.36, h * 0.3, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(84,62,52,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.2, cy + h * 0.26, w * 0.36, h * 0.32, 0.08, 0, Math.PI * 2);
    ctx.fill();
    if (rnd.chance(0.08)) {
      ctx.fillStyle = rgba(rnd.pick(['#8FA050', '#B0A040', '#9AA85C']), 0.26);
      ctx.beginPath();
      ctx.ellipse(cx + rnd.range(-w, w) * 0.25, cy + h * 0.2, w * 0.2, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // broken ink: light on the lit top-left edges, heavier along the bottom and right
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.46;
    ctx.beginPath();
    ctx.moveTo(xa + w - pad, ya + pad + h * 0.15);
    ctx.lineTo(xa + w - pad, ya + h - pad - rr * 0.4);
    ctx.lineTo(xa + w * rnd.range(0.45, 0.65), ya + h - pad);
    ctx.lineTo(xa + pad + rr, ya + h - pad);
    ctx.stroke();
    if (rnd.chance(0.65)) {
      ctx.strokeStyle = rgba(INK, 0.22);
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(xa + pad + rr * 0.4, ya + h * 0.62);
      ctx.lineTo(xa + pad + rr * 0.4, ya + pad + rr * 0.6);
      ctx.lineTo(xa + w * 0.55, ya + pad);
      ctx.stroke();
    }
  };
  let y = GROUND_Y - 9;
  let course = 0;
  while (y > wall.y0 - 14) {
    const h = rnd.range(8.4, 12.6);
    const ya = y - h;
    // quoins: long and short stones alternating at each corner
    const qa = course % 2 === 0 ? 23 : 15;
    const qb = course % 2 === 0 ? 15 : 23;
    const put = (xa: number, w: number) => {
      if (ya + h > wall.y0 - 2 && ya < wall.y1) stone(xa, ya, w, h);
    };
    put(wall.x0, qa);
    let x = wall.x0 + qa;
    const xe = wall.x1 - qb;
    while (x < xe - 0.5) {
      let w = rnd.range(14, 30);
      if (xe - (x + w) < 11) w = xe - x;
      put(x, w);
      x += w;
    }
    put(xe, qb);
    y -= h;
    course++;
  }
  // a darker foundation course and a ground-level strip of earth
  const fg = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GROUND_Y + 1);
  fg.addColorStop(0, 'rgba(70,56,48,0)');
  fg.addColorStop(1, 'rgba(70,56,48,0.5)');
  ctx.fillStyle = fg;
  ctx.fillRect(wall.x0, GROUND_Y - 10, wall.x1 - wall.x0, 11);
  // overall light: warm upper left, cooler lower right; the roof's shadow under the eave
  const lg = ctx.createLinearGradient(wall.x0, wall.y0, wall.x1, wall.y1);
  lg.addColorStop(0, 'rgba(255,238,196,0.2)');
  lg.addColorStop(0.5, 'rgba(255,238,196,0)');
  lg.addColorStop(1, 'rgba(96,76,92,0.16)');
  ctx.fillStyle = lg;
  ctx.fillRect(wall.x0, wall.y0, wall.x1 - wall.x0, wall.y1 - wall.y0);
  const eg = ctx.createLinearGradient(0, wall.y0 + 8, 0, wall.y0 + 52);
  eg.addColorStop(0, 'rgba(64,46,58,0.5)');
  eg.addColorStop(0.45, 'rgba(64,46,58,0.16)');
  eg.addColorStop(1, 'rgba(64,46,58,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(wall.x0, wall.y0 + 8, wall.x1 - wall.x0, 44);
  // the wall's outline (broken ink) on the outer edges
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.7;
  ctx.setLineDash([22, 3, 9, 2]);
  ctx.beginPath();
  ctx.moveTo(wall.x0, wall.y0 + 8);
  ctx.lineTo(wall.x0, GROUND_Y);
  ctx.lineTo(wall.x1, GROUND_Y);
  ctx.lineTo(wall.x1, wall.y0 + 8);
  ctx.stroke();
  ctx.setLineDash([]);

  // ---------------------------------------------------------------- windows
  for (const [wi, win] of c.windows.entries()) {
    const wx0 = win.x0;
    const wx1 = win.x1;
    const wy0 = win.y0;
    const wy1 = win.y1;
    const ww = wx1 - wx0;
    const wh = wy1 - wy0;
    const cols = ww > 60 ? 3 : 2;
    // stone surround: lintel above, sill below (a slab that sticks out a little)
    ctx.fillStyle = rgba('#D9CBB0', 0.96);
    ctx.fillRect(wx0 - 5, wy0 - 8, ww + 10, 8);
    ctx.fillStyle = 'rgba(255,246,218,0.34)';
    ctx.fillRect(wx0 - 5, wy0 - 8, ww + 10, 2.6);
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(wx0 - 5, wy0 - 8, ww + 10, 8);
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(wx0 - 5 + ((ww + 10) * k) / 4 + rnd.range(-1, 1), wy0 - 8);
      ctx.lineTo(wx0 - 5 + ((ww + 10) * k) / 4 + rnd.range(-1, 1), wy0);
      ctx.stroke();
    }
    // the dark reveal
    ctx.fillStyle = '#3C2C2A';
    ctx.fillRect(wx0 - 2.4, wy0 - 2.4, ww + 4.8, wh + 4.8);
    // glass: warm lamp glow, brightest left of centre, a deeper room toward the edges
    const gl = ctx.createRadialGradient(wx0 + ww * 0.42, wy0 + wh * 0.5, 2, wx0 + ww * 0.5, wy0 + wh * 0.5, ww * 0.72);
    gl.addColorStop(0, '#FFE49A');
    gl.addColorStop(0.5, '#F6B64C');
    gl.addColorStop(1, '#C9762E');
    ctx.fillStyle = gl;
    ctx.fillRect(wx0, wy0, ww, wh);
    // a hint of the room: a curtain at each side and a shelf
    ctx.fillStyle = rgba(wi === 0 ? '#A8442E' : '#8A4A5E', 0.55);
    ctx.fillRect(wx0, wy0, ww * 0.17, wh);
    ctx.fillRect(wx1 - ww * 0.15, wy0, ww * 0.15, wh);
    ctx.fillStyle = 'rgba(96,52,28,0.5)';
    ctx.fillRect(wx0 + ww * 0.22, wy0 + wh * 0.72, ww * 0.56, 2.4);
    // sky reflection in the upper-left of each pane (light from the upper left)
    ctx.fillStyle = 'rgba(214,236,250,0.22)';
    tracePoly(ctx, [wx0, wy0, wx0 + ww * 0.55, wy0, wx0, wy0 + wh * 0.5]);
    ctx.fill();
    // frame and glazing bars in cream
    ctx.strokeStyle = '#EFE4CA';
    ctx.lineWidth = 1.9;
    ctx.strokeRect(wx0 + 0.9, wy0 + 0.9, ww - 1.8, wh - 1.8);
    ctx.lineWidth = 1.5;
    for (let k = 1; k < cols; k++) {
      ctx.beginPath();
      ctx.moveTo(wx0 + (ww * k) / cols, wy0);
      ctx.lineTo(wx0 + (ww * k) / cols, wy1);
      ctx.stroke();
    }
    for (let k = 1; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(wx0, wy0 + (wh * k) / 3);
      ctx.lineTo(wx1, wy0 + (wh * k) / 3);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba('#5A4638', 0.6);
    ctx.lineWidth = 0.4;
    ctx.strokeRect(wx0, wy0, ww, wh);
    // sill
    ctx.fillStyle = rgba('#D2C3A6', 0.98);
    ctx.fillRect(wx0 - 6, wy1 + 1, ww + 12, 5);
    ctx.fillStyle = 'rgba(255,246,218,0.34)';
    ctx.fillRect(wx0 - 6, wy1 + 1, ww + 12, 1.6);
    ctx.fillStyle = 'rgba(70,54,52,0.3)';
    ctx.fillRect(wx0 - 6, wy1 + 4.2, ww + 12, 1.4);
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.45;
    ctx.strokeRect(wx0 - 6, wy1 + 1, ww + 12, 5);
    // the window's shadow on the wall under the sill, to the lower right
    const sg = ctx.createLinearGradient(0, wy1 + 6, 0, wy1 + 16);
    sg.addColorStop(0, 'rgba(60,44,50,0.28)');
    sg.addColorStop(1, 'rgba(60,44,50,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(wx0 - 4, wy1 + 6, ww + 10, 10);
  }

  // ---------------------------------------------------------------- the door
  {
    const d = c.door;
    const dw = d.x1 - d.x0;
    const doorCol = id === 'minimum' ? '#3F7F88' : '#436B4B';
    const top = d.y0;
    // stone surround and lintel
    ctx.fillStyle = rgba('#D9CBB0', 0.96);
    ctx.fillRect(d.x0 - 6, top - 9, dw + 12, 9);
    ctx.fillStyle = 'rgba(255,246,218,0.34)';
    ctx.fillRect(d.x0 - 6, top - 9, dw + 12, 2.6);
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(d.x0 - 6, top - 9, dw + 12, 9);
    for (const k of [0.3, 0.55, 0.78]) {
      ctx.beginPath();
      ctx.moveTo(d.x0 - 6 + (dw + 12) * k, top - 9);
      ctx.lineTo(d.x0 - 6 + (dw + 12) * k + rnd.range(-1, 1), top);
      ctx.stroke();
    }
    ctx.fillStyle = '#3A2A28';
    ctx.fillRect(d.x0 - 2.6, top - 1.4, dw + 5.2, d.y1 - top + 1.4);
    // the leaf of the door: painted planks
    const grad = ctx.createLinearGradient(d.x0, top, d.x1, d.y1);
    grad.addColorStop(0, rgba(doorCol, 1));
    grad.addColorStop(1, rgba('#1E3A38', 0.4));
    ctx.fillStyle = doorCol;
    ctx.fillRect(d.x0, top, dw, d.y1 - top);
    ctx.fillStyle = 'rgba(255,244,214,0.18)';
    ctx.fillRect(d.x0, top, dw * 0.45, d.y1 - top);
    ctx.fillStyle = 'rgba(30,24,36,0.26)';
    ctx.fillRect(d.x0 + dw * 0.62, top, dw * 0.38, d.y1 - top);
    const planks = 5;
    ctx.strokeStyle = 'rgba(24,26,30,0.5)';
    ctx.lineWidth = 0.55;
    for (let k = 1; k < planks; k++) {
      const px = d.x0 + (dw * k) / planks;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, d.y1);
      ctx.stroke();
    }
    // wood grain flecks of paler paint
    ctx.strokeStyle = 'rgba(255,244,220,0.18)';
    ctx.lineWidth = 0.3;
    for (let k = 0; k < 26; k++) {
      const px = d.x0 + rnd.range(1, dw - 1);
      const py = top + rnd.range(2, d.y1 - top - 14);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + rnd.range(-0.4, 0.4), py + rnd.range(5, 16));
      ctx.stroke();
    }
    // a small light over the door and a pair of iron straps
    ctx.fillStyle = 'rgba(255,226,140,0.7)';
    ctx.fillRect(d.x0 + dw * 0.28, top + 7, dw * 0.44, 7);
    ctx.strokeStyle = '#EFE4CA';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(d.x0 + dw * 0.28, top + 7, dw * 0.44, 7);
    ctx.beginPath();
    ctx.moveTo(d.x0 + dw * 0.5, top + 7);
    ctx.lineTo(d.x0 + dw * 0.5, top + 14);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,28,30,0.7)';
    ctx.lineWidth = 1.2;
    for (const f of [0.28, 0.72]) {
      ctx.beginPath();
      ctx.moveTo(d.x0, top + (d.y1 - top) * f);
      ctx.lineTo(d.x0 + dw * 0.62, top + (d.y1 - top) * f);
      ctx.stroke();
    }
    // latch: toward the middle path side, a brass knob
    const knobX = mirror ? d.x0 + dw * 0.18 : d.x1 - dw * 0.18;
    ctx.fillStyle = '#E2B050';
    ctx.beginPath();
    ctx.arc(knobX, top + (d.y1 - top) * 0.52, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(d.x0, top, dw, d.y1 - top);
    void grad;
    // the step
    ctx.fillStyle = rgba('#CFC0A2', 0.98);
    ctx.fillRect(d.x0 - 5, GROUND_Y - 1, dw + 10, 7);
    ctx.fillStyle = 'rgba(255,246,218,0.36)';
    ctx.fillRect(d.x0 - 5, GROUND_Y - 1, dw + 10, 2);
    ctx.fillStyle = 'rgba(70,54,52,0.3)';
    ctx.fillRect(d.x0 - 5, GROUND_Y + 4, dw + 10, 2);
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(d.x0 - 5, GROUND_Y - 1, dw + 10, 7);
  }

  // ---------------------------------------------------------------- the roof
  const roofPoly = [x0 - 18, 332, x0 + 52, 206, x1 - 52, 206, x1 + 18, 332];
  const roof = id === 'minimum' ? 'slate' : 'thatch';
  ctx.save();
  tracePoly(ctx, roofPoly);
  ctx.clip();
  if (roof === 'slate') {
    ctx.fillStyle = '#566478';
    ctx.fillRect(x0 - 20, 204, x1 - x0 + 40, 132);
    const slateCols = ['#6C7C93', '#5D6E86', '#788AA0', '#67788F', '#5A6B82', '#7C8CA2'];
    let yy = 332;
    let row = 0;
    while (yy > 200) {
      const rh = 8.8;
      const w = 13.5;
      let xx = x0 - 22 - (row % 2 ? w / 2 : 0) - rnd.range(0, 2);
      while (xx < x1 + 22) {
        const ww = w * rnd.range(0.94, 1.08);
        const ya = yy - rh - rnd.range(0, 0.6);
        const pts = [xx + 0.4, ya, xx + ww - 0.4, ya, xx + ww - 0.2, yy + 0.8, xx + 0.2, yy + 0.8];
        ctx.fillStyle = rgba(rnd.pick(slateCols), 0.92);
        tracePoly(ctx, deform(pts, rnd, 1, 0.03));
        ctx.fill();
        ctx.fillStyle = 'rgba(214,226,244,0.2)';
        ctx.fillRect(xx + 0.6, ya + 0.4, ww * 0.5, rh * 0.38);
        ctx.fillStyle = 'rgba(26,30,52,0.2)';
        ctx.fillRect(xx + ww * 0.55, ya + rh * 0.45, ww * 0.42, rh * 0.5);
        ctx.strokeStyle = rgba('#222A3C', 0.55);
        ctx.lineWidth = 0.42;
        ctx.beginPath();
        ctx.moveTo(xx + 0.2, yy + 0.8);
        ctx.lineTo(xx + ww - 0.2, yy + 0.8);
        ctx.lineTo(xx + ww - 0.4, ya + 1);
        ctx.stroke();
        if (rnd.chance(0.05)) {
          ctx.fillStyle = rgba(rnd.pick(['#8FA050', '#B9A044']), 0.3);
          ctx.beginPath();
          ctx.ellipse(xx + ww * 0.5, ya + rh * 0.4, ww * 0.3, rh * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        xx += ww;
      }
      yy -= rh;
      row++;
    }
    // the sun-lit upper left of the roof, deeper shade toward the lower right
    const rg = ctx.createLinearGradient(x0, 206, x1, 332);
    rg.addColorStop(0, 'rgba(255,240,206,0.28)');
    rg.addColorStop(0.45, 'rgba(255,240,206,0)');
    rg.addColorStop(1, 'rgba(30,28,56,0.3)');
    ctx.fillStyle = rg;
    ctx.fillRect(x0 - 20, 204, x1 - x0 + 40, 132);
  } else {
    const thCols = ['#C79A52', '#B88A45', '#D0A860', '#A97C3C', '#BE9048', '#D6B26C', '#9C7038'];
    ctx.fillStyle = '#A97C3C';
    ctx.fillRect(x0 - 20, 204, x1 - x0 + 40, 132);
    // many long bundles of straw, following the pitch (dense horizontal strokes, slightly drooping)
    for (let i = 0; i < 2200; i++) {
      const yy = rnd.range(204, 334);
      const half = (x1 - x0 + 36) / 2;
      const xx = rnd.range(x0 - 20, x1 + 20);
      const len = rnd.range(14, 38);
      ctx.strokeStyle = rgba(rnd.pick(thCols), rnd.range(0.35, 0.8));
      ctx.lineWidth = rnd.range(0.5, 1.5);
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo(xx + len * 0.5, yy + rnd.range(-0.8, 1.1), xx + len, yy + rnd.range(0, 2.4));
      ctx.stroke();
      void half;
    }
    // courses: darker shaggy rows
    for (let yy = 330; yy > 204; yy -= rnd.range(10, 14)) {
      ctx.strokeStyle = rgba('#6E4C28', 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 - 20, yy);
      for (let xx = x0 - 20; xx <= x1 + 20; xx += 14) ctx.lineTo(xx, yy + rnd.range(-1.2, 1.6));
      ctx.stroke();
      ctx.strokeStyle = rgba('#F0D690', 0.22);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x0 - 20, yy - 2);
      for (let xx = x0 - 20; xx <= x1 + 20; xx += 14) ctx.lineTo(xx, yy - 2 + rnd.range(-1.2, 1.2));
      ctx.stroke();
    }
    const rg = ctx.createLinearGradient(x0, 206, x1, 332);
    rg.addColorStop(0, 'rgba(255,236,170,0.34)');
    rg.addColorStop(0.45, 'rgba(255,236,170,0)');
    rg.addColorStop(1, 'rgba(60,34,20,0.34)');
    ctx.fillStyle = rg;
    ctx.fillRect(x0 - 20, 204, x1 - x0 + 40, 132);
    // moss and weathering
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = rgba(rnd.pick(['#7C8A40', '#8A7A3A', '#6E7C3C']), 0.14);
      ctx.beginPath();
      ctx.ellipse(rnd.range(x0, x1), rnd.range(230, 320), rnd.range(8, 24), rnd.range(2, 6), rnd.range(-0.2, 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // a shadowed line where the roof's thick edge meets the wall
  const sg = ctx.createLinearGradient(0, 308, 0, 334);
  sg.addColorStop(0, 'rgba(46,32,40,0)');
  sg.addColorStop(1, 'rgba(46,32,40,0.5)');
  ctx.fillStyle = sg;
  ctx.fillRect(x0 - 20, 308, x1 - x0 + 40, 26);
  ctx.restore();
  // the roof's edges: a broken ink contour; the eave a thick shadowed lip
  ctx.strokeStyle = rgba(INK, 0.62);
  ctx.lineWidth = 0.9;
  ctx.setLineDash([26, 3, 10, 2]);
  tracePoly(ctx, roofPoly);
  ctx.stroke();
  ctx.setLineDash([]);
  if (roof === 'slate') {
    ctx.fillStyle = rgba('#3C4558', 0.95);
    tracePoly(ctx, [x0 - 18, 332, x1 + 18, 332, x1 + 17, 337, x0 - 17, 337]);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,222,244,0.22)';
    ctx.fillRect(x0 - 18, 332, x1 - x0 + 36, 1.4);
    // ridge tiles
    ctx.fillStyle = rgba('#44506A', 0.95);
    tracePoly(ctx, [x0 + 52, 203, x1 - 52, 203, x1 - 50, 209.4, x0 + 50, 209.4]);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let xx = x0 + 56; xx < x1 - 52; xx += 11) {
      ctx.moveTo(xx, 203);
      ctx.lineTo(xx - 0.4, 209.4);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(206,220,244,0.4)';
    ctx.fillRect(x0 + 52, 203, x1 - x0 - 104, 1.2);
  } else {
    // a thick, shaggy lower edge with tufts hanging, and a rolled ridge
    const edge: number[] = [];
    for (let xx = x0 - 18; xx <= x1 + 18; xx += 4) edge.push(xx, 332 + 4.5 + rnd.range(-1.4, 2.2) + Math.sin(xx * 0.18) * 0.8);
    const poly = [x0 - 18, 330, ...edge, x1 + 18, 330];
    ctx.fillStyle = rgba('#8A6030', 0.95);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba('#B9893F', 0.5);
    ctx.fillRect(x0 - 18, 330, x1 - x0 + 36, 2);
    ctx.strokeStyle = rgba('#5C3C1C', 0.6);
    ctx.lineWidth = 0.7;
    for (let xx = x0 - 16; xx < x1 + 16; xx += rnd.range(3, 6)) {
      ctx.beginPath();
      ctx.moveTo(xx, 331);
      ctx.lineTo(xx + rnd.range(-0.6, 0.6), 335 + rnd.range(0, 3.4));
      ctx.stroke();
    }
    // ridge roll: a lighter band with plaited cross-hatching
    ctx.fillStyle = rgba('#C9A050', 0.98);
    tracePoly(ctx, [x0 + 48, 201, x1 - 48, 201, x1 - 46, 211, x0 + 46, 211]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.35)';
    ctx.fillRect(x0 + 48, 201, x1 - x0 - 96, 2.4);
    ctx.strokeStyle = rgba('#6E4C28', 0.5);
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let xx = x0 + 50; xx < x1 - 48; xx += 5) {
      ctx.moveTo(xx, 201.5);
      ctx.lineTo(xx + 4, 210.5);
      ctx.moveTo(xx + 4, 201.5);
      ctx.lineTo(xx, 210.5);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.6;
    tracePoly(ctx, [x0 + 48, 201, x1 - 48, 201, x1 - 46, 211, x0 + 46, 211]);
    ctx.stroke();
  }

  // ---------------------------------------------------------------- the chimney
  const chDx = id === 'minimum' ? 280 : 70;
  const chX = X(chDx);
  const chW = 26;
  const chTop = 160;
  {
    const cx0 = chX - chW / 2;
    // stone shaft with a few courses
    ctx.fillStyle = id === 'minimum' ? '#B7A68C' : '#C0A888';
    ctx.fillRect(cx0, chTop + 8, chW, 213 - chTop - 8);
    for (let yy = chTop + 10; yy < 213; yy += 8.4) {
      let xx = cx0 - (yy % 2 ? 6 : 0);
      while (xx < cx0 + chW) {
        const w = rnd.range(8, 15);
        const a = Math.max(xx, cx0);
        const b = Math.min(xx + w, cx0 + chW);
        if (b - a > 2) {
          ctx.fillStyle = rgba(rnd.pick(stoneCols), 0.85);
          ctx.fillRect(a + 0.4, yy + 0.4, b - a - 0.8, 7.4);
          ctx.fillStyle = 'rgba(255,246,218,0.24)';
          ctx.fillRect(a + 0.4, yy + 0.4, (b - a) * 0.5, 2.4);
          ctx.strokeStyle = rgba(INK, 0.4);
          ctx.lineWidth = 0.38;
          ctx.strokeRect(a + 0.4, yy + 0.4, b - a - 0.8, 7.4);
        }
        xx += w;
      }
    }
    ctx.fillStyle = 'rgba(70,52,52,0.3)';
    ctx.fillRect(cx0 + chW * 0.66, chTop + 8, chW * 0.34, 213 - chTop - 8);
    // cap slab and two pots
    ctx.fillStyle = rgba('#CFC0A2', 0.98);
    ctx.fillRect(cx0 - 3, chTop + 2, chW + 6, 7);
    ctx.fillStyle = 'rgba(255,246,218,0.34)';
    ctx.fillRect(cx0 - 3, chTop + 2, chW + 6, 2);
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.55;
    ctx.strokeRect(cx0 - 3, chTop + 2, chW + 6, 7);
    for (const px of [chX - 5.5, chX + 5.5]) {
      ctx.fillStyle = rgba('#B8643C', 0.98);
      tracePoly(ctx, [px - 3.4, chTop + 2, px + 3.4, chTop + 2, px + 4.2, chTop - 10, px - 4.2, chTop - 10]);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,226,180,0.32)';
      ctx.fillRect(px - 3.4, chTop - 10, 2.2, 12);
      ctx.fillStyle = 'rgba(80,36,26,0.32)';
      ctx.fillRect(px + 1.2, chTop - 10, 3, 12);
      ctx.fillStyle = rgba('#A0542E', 0.98);
      ctx.fillRect(px - 5, chTop - 12.5, 10, 3.2);
      ctx.strokeStyle = rgba(INK, 0.5);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px - 5, chTop - 12.5, 10, 3.2);
    }
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(cx0, chTop + 8, chW, 213 - chTop - 8);
  }

  // ---------------------------------------------------------------- the foot of the wall: soil where the vine roots, autumn tufts
  {
    const rx = c.root.x;
    ctx.fillStyle = rgba('#5A4130', 0.7);
    tracePoly(ctx, deform([rx - 22, GROUND_Y - 1, rx - 12, GROUND_Y - 6, rx + 12, GROUND_Y - 6, rx + 22, GROUND_Y - 1, rx + 14, GROUND_Y + 5, rx - 14, GROUND_Y + 5], rnd, 2, 0.1));
    ctx.fill();
    ctx.fillStyle = rgba('#7A5A40', 0.5);
    ctx.beginPath();
    ctx.ellipse(rx - 5, GROUND_Y - 2, 11, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62'];
  for (let xx = wall.x0 - 4; xx < wall.x1 + 4; xx += rnd.range(3, 7)) {
    if (xx > c.door.x0 - 8 && xx < c.door.x1 + 8) continue;
    const h = rnd.range(3, 8);
    const n = rnd.int(3, 5);
    for (let j = 0; j < n; j++) {
      ctx.strokeStyle = rgba(rnd.pick(pal), rnd.range(0.6, 0.95));
      ctx.lineWidth = rnd.range(0.5, 1);
      ctx.beginPath();
      const bx = xx + rnd.range(-1.5, 1.5);
      ctx.moveTo(bx, GROUND_Y + 2);
      ctx.quadraticCurveTo(bx + rnd.range(-1, 1) * h * 0.3, GROUND_Y - h * 0.6, bx + rnd.range(-1, 1) * h * 0.6, GROUND_Y - h);
      ctx.stroke();
    }
  }
  // a pot of chrysanthemums by the left cottage's door; a little stack of split logs by the right one's
  if (id === 'minimum') {
    const px = c.door.x1 + 17;
    const py = GROUND_Y + 5;
    ctx.fillStyle = rgba('#B8643C', 0.98);
    tracePoly(ctx, [px - 7.4, py - 12, px + 7.4, py - 12, px + 5.4, py, px - 5.4, py]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,226,180,0.3)';
    ctx.fillRect(px - 7.4, py - 12, 3.4, 12);
    ctx.fillStyle = 'rgba(80,36,26,0.3)';
    ctx.fillRect(px + 3, py - 12, 4, 12);
    ctx.fillStyle = rgba('#A0542E', 0.98);
    ctx.fillRect(px - 8.6, py - 14.4, 17.2, 3.2);
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px - 8.6, py - 14.4, 17.2, 3.2);
    tracePoly(ctx, [px - 7.4, py - 11.2, px + 7.4, py - 11.2, px + 5.4, py, px - 5.4, py]);
    ctx.stroke();
    const mums = ['#E8B03A', '#D8602E', '#B83A3A', '#F0C84E', '#C9502E'];
    for (let i = 0; i < 12; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * 9.5;
      const mx = px + Math.cos(a) * r;
      const my = py - 21 - Math.abs(Math.sin(a)) * r * 0.5 + (Math.cos(a) * r) * 0.0;
      const col = rnd.pick(mums);
      ctx.fillStyle = rgba('#5E7A3A', 0.8);
      ctx.beginPath();
      ctx.ellipse(mx, my + 2, 3.4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 9; k++) {
        const aa = (k / 9) * Math.PI * 2;
        ctx.fillStyle = rgba(col, 0.78);
        almond(ctx, mx + Math.cos(aa) * 1.7, my + Math.sin(aa) * 1.4, aa, 3.2, 1.2);
        ctx.fill();
      }
      ctx.fillStyle = rgba('#7A3A1E', 0.7);
      ctx.beginPath();
      ctx.arc(mx, my, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const lx = c.door.x0 - 22;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4 - r; i++) {
        const cx = lx + i * 7.2 + r * 3.6;
        const cy = GROUND_Y + 4 - r * 6.4;
        ctx.fillStyle = rgba(rnd.pick(['#C79A62', '#B8864F', '#D1A870']), 0.96);
        ctx.beginPath();
        ctx.ellipse(cx, cy - 3, 3.6, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba('#EAD2A0', 0.9);
        ctx.beginPath();
        ctx.ellipse(cx - 0.4, cy - 3, 1.9, 1.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(INK, 0.55);
        ctx.lineWidth = 0.42;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 3, 3.6, 3.2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(110,70,40,0.5)';
        ctx.beginPath();
        ctx.arc(cx - 0.4, cy - 3, 1.1, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  grain(cv, id === 'minimum' ? 41 : 43, 0.8, Math.max(1, Math.round(q * 0.7)));
  return { sprite: { cv, x: SX, y: SY, w: W, h: H }, chimney: { x: chX, y: chTop - 12 } };
}

void R;
void clamp;
