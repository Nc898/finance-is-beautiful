/**
 * The view through the shop window, and the rain on its glass.
 * Painted once (paintStreet): a grey morning in cool, soft washes laid on a sheet of its own and blurred a touch (it is
 * out of focus, seen through wet glass, so the shop's own things stay the sharpest): the sky, far roofs, the shopfronts
 * opposite with a baker's warm window, a lamp-post, the wet road with its reflections, the pavement on this side; then,
 * sharp on the glass, the sign painted in reverse, mist at the sills, wet beads and the tracks old drops left.
 * Moving (GlassRain): rain falling outside, and drops that gather on the glass and run down it in fits and starts.
 */
import { Rand, clamp, hashSeed } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { WINDOW, type Rect } from './geom';
import { INK, LIGHT, SHADE, blobPoly, face, grain, mix, mottle, pen, patchWash, penPath, rectPoly, ribbon, spriteCtx, wash, washField } from './paint';

/** the sheet of glass inside the frame, and its panes (the bars between them are the frame's) */
export const GLASS: Rect = { x0: WINDOW.x0 + 10, x1: WINDOW.x1 - 10, y0: WINDOW.y0 + 10, y1: 388 };
export const PANES: Rect[] = [
  { x0: 36, x1: 242, y0: 74, y1: 128 },
  { x0: 36, x1: 132, y0: 136, y1: 262 },
  { x0: 146, x1: 242, y0: 136, y1: 262 },
  { x0: 36, x1: 132, y0: 268, y1: 388 },
  { x0: 146, x1: 242, y0: 268, y1: 388 },
];

/** where the opposite awning's edge drips (world), and the pavement they fall to */
export const EAVES = [
  { x: 48, y: 292 },
  { x: 71, y: 292 },
  { x: 96, y: 292 },
  { x: 160, y: 296 },
] as const;
export const PAVEMENT_Y = 318;

export function clipPanes(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  for (const p of PANES) ctx.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  ctx.clip();
}

const HAZE = '#B9C7CE';

/** a building across the road, painted as a painter puts a building into a distance: a wash for its face with the pigment
 *  pooling low and to the right, a roof plane, windows as soft dabs (the lit ones warm, with a glow), everything veiled
 *  toward the rain haze and stated by almost nothing: one faint broken line at the eave */
function building(ctx: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number, wall: string, rnd: Rand, o: { roof?: string; lit?: number[]; floors?: number }): void {
  const fade = 0.06 + 0.08 * rnd.next();
  const f = (c: string) => mix(mix(c, SHADE, 0.28), HAZE, fade);
  const w = x1 - x0;
  const lean = rnd.range(-2, 2);
  const faceRect = [x0, top + 2, x0 + w * 0.5, top, x1, top + 2 + lean, x1 + 0.5, (top + bottom) / 2, x1, bottom, x0 + w * 0.5, bottom + 0.5, x0, bottom, x0 - 0.5, (top + bottom) / 2];
  face(ctx, rnd, faceRect, f(wall), 0.96, '#4A4C78', 0.4, [0.55, 0.85]);
  // the wash varies across the wall: patches of nearby colours, wet in wet
  ctx.save();
  tracePoly(ctx, faceRect);
  ctx.clip();
  const field = washField(rnd.int(1, 9000), [f(mix(wall, '#FFFFFF', 0.15)), f(wall), f(mix(wall, SHADE, 0.2)), f(mix(wall, '#B89A7A', 0.2))], 0.05, 0.06);
  patchWash(ctx, x0, top, x1, bottom, field, rnd, 9, 0.22, 1);
  ctx.restore();
  // the roof: a slate wash across the top, a pale lit end, a chimney or two as small dabs
  const rf = f(o.roof ?? '#6F7F8C');
  const ridge = rnd.range(14, 24);
  face(ctx, rnd, [x0 - 2, top + 2, x0 + w * rnd.range(0.3, 0.7), top - ridge, x1 + 2, top + 2 + lean, x1, top + 6, x0, top + 6], rf, 0.88, '#4A4468', 0.3, [0.4, 0.9]);
  ctx.fillStyle = rgba('#F4EEDC', 0.18);
  tracePoly(ctx, [x0, top + 2, x0 + w * 0.4, top - ridge * 0.9, x0 + w * 0.2, top + 2]);
  ctx.fill();
  for (let c = 0; c < 2; c++) {
    if (!rnd.chance(0.7)) continue;
    const cx = rnd.range(x0 + 6, x1 - 10);
    face(ctx, rnd, [cx, top - ridge - 4, cx + 6, top - ridge - 4, cx + 6, top - ridge + 8, cx, top - ridge + 8], f(mix(wall, '#7A5A4A', 0.5)), 0.85, '#4A4468', 0.3, [1, 0.3]);
  }
  // windows: soft dabs, three storeys, the lit ones warm with their glow
  const floors = o.floors ?? 2;
  const fh = (bottom - 56 - top) / floors;
  const cols = Math.max(2, Math.round(w / 24));
  const ww = w / cols;
  for (let fl = 0; fl < floors; fl++) {
    for (let c = 0; c < cols; c++) {
      const wx = x0 + c * ww + ww * 0.5 + rnd.range(-1, 1);
      const wy = top + 14 + fl * fh + rnd.range(-1, 1);
      const lit = (o.lit ?? []).includes(fl * 10 + c);
      const dab = deform(rectPoly(wx - ww * 0.19, wy + fh * 0.2 - fh * 0.27, wx + ww * 0.19, wy + fh * 0.2 + fh * 0.27, rnd, 0.6), rnd, 1, 0.06);
      if (lit) {
        const gl = ctx.createRadialGradient(wx, wy + fh * 0.2, 0, wx, wy + fh * 0.2, ww * 0.9);
        gl.addColorStop(0, 'rgba(244,196,110,0.34)');
        gl.addColorStop(1, 'rgba(244,196,110,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(wx - ww, wy - ww * 0.7, ww * 2, ww * 2);
        ctx.fillStyle = rgba('#F0C070', 0.95);
      } else {
        ctx.fillStyle = rgba('#3E4E5E', 0.7);
      }
      tracePoly(ctx, dab);
      ctx.fill();
      if (!lit) {
        ctx.fillStyle = rgba('#DCE6EA', 0.3);
        ctx.fillRect(wx - ww * 0.16, wy + fh * 0.04, ww * 0.18, fh * 0.1);
      }
    }
  }
  // one faint broken line along the eave, and a corner
  penPath(ctx, [x0, top + 2, x1, top + 2 + lean], 0.5, INK, 0.16, rnd, 0.5);
  penPath(ctx, [x1, top + 2 + lean, x1, bottom], 0.5, INK, 0.12, rnd, 0.5);
}

function shopfront(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, awning: [string, string], rnd: Rand, warm: boolean): void {
  // the window glimpsed: a glow, not a pane
  const cx = (x0 + x1) / 2;
  const gl = ctx.createRadialGradient(cx, y0 + 26, 0, cx, y0 + 26, (x1 - x0) * 0.6);
  gl.addColorStop(0, warm ? 'rgba(240,190,104,0.85)' : 'rgba(150,170,180,0.5)');
  gl.addColorStop(1, warm ? 'rgba(240,190,104,0)' : 'rgba(150,170,180,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(x0, y0 + 6, x1 - x0, y1 - y0 - 4);
  face(ctx, rnd, [x0 + 3, y0 + 12, x1 - 3, y0 + 12, x1 - 3, y1, x0 + 3, y1], warm ? '#D8A860' : '#6A7C86', 0.5, '#3E4060', 0.3, [0.6, 0.8]);
  // goods in the window: dabs
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#9A5A3A', '#D9B25A', '#5A3F2A', '#E8D8A8']), 0.4);
    tracePoly(ctx, deform(blobPoly(rnd.range(x0 + 8, x1 - 8), rnd.range(y0 + 24, y1 - 6), rnd.range(1.5, 4), rnd.range(1, 2.5), rnd, 7, 0.2), rnd, 1, 0.1));
    ctx.fill();
  }
  // the awning: stripes in soft washes, a scalloped lower edge, the pigment pooled along it
  const n = Math.max(4, Math.round((x1 - x0) / 9));
  const sw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const c = mix(awning[i % 2]!, HAZE, 0.25);
    face(ctx, rnd, [x0 + i * sw, y0 - 2, x0 + (i + 1) * sw, y0 - 2, x0 + (i + 1) * sw + 1, y0 + 8, x0 + i * sw - 1, y0 + 8], c, 0.82, '#3E4060', 0.32, [0.2, 1]);
    ctx.fillStyle = rgba(c, 0.82);
    ctx.beginPath();
    ctx.ellipse(x0 + i * sw + sw / 2, y0 + 8, sw / 2, 2.2, 0, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = rgba(SHADE, 0.16);
  ctx.fillRect(x0, y0 + 9, x1 - x0, 6);
}

export function paintStreet(ctx: CanvasRenderingContext2D, S: number): void {
  const rnd = new Rand(40521);
  const pad = 9;
  const box = { x: GLASS.x0 - pad, y: GLASS.y0 - pad, w: GLASS.x1 - GLASS.x0 + pad * 2, h: GLASS.y1 - GLASS.y0 + pad * 2 };
  const sh = spriteCtx(box, S);
  const g = sh.ctx;
  const X0 = box.x;
  const X1 = box.x + box.w;
  const Y0 = box.y;
  const Y1 = box.y + box.h;

  // the sky: a grey-blue wash, lighter toward the roofs, heavy cloud smudged in above
  const sky = g.createLinearGradient(0, Y0, 0, 300);
  sky.addColorStop(0, '#8DA0AE');
  sky.addColorStop(0.55, '#B3C2CA');
  sky.addColorStop(1, '#D1D9D8');
  g.fillStyle = sky;
  g.fillRect(X0, Y0, X1 - X0, 320 - Y0);
  mottle(g, X0, Y0, X1, 240, ['#7E92A2', '#9AABB6', '#B7C5CC', '#8499A8', '#A5B4BD'], 5521, 0.26, 40, 1.8);
  // far roofs: a stepped line of paler shapes with a few chimneys
  {
    let x = X0 - 6;
    while (x < X1) {
      const w = rnd.range(14, 34);
      const top = rnd.range(200, 236);
      wash(g, rectPoly(x, top, x + w, 262, rnd, 0.8), mix('#9FB0BB', '#B9C6CC', rnd.next()), 0.85, rnd, 2, 0.04);
      if (rnd.chance(0.4)) wash(g, rectPoly(x + w * 0.3, top - 9, x + w * 0.3 + 4, top + 2, rnd, 0.3), '#8D9DA8', 0.85, rnd, 2, 0.04);
      x += w - rnd.range(0, 3);
    }
  }
  // the three fronts opposite
  building(g, X0 - 6, 108, 150, 318, '#8A7468', rnd, { roof: '#5F6F7C', lit: [1, 11], floors: 3 });
  building(g, 108, 183, 128, 318, '#C4BCA6', rnd, { roof: '#6C7C88', lit: [10], floors: 3 });
  building(g, 183, X1 + 6, 112, 318, '#7B8FA0', rnd, { roof: '#566674', lit: [2], floors: 3 });
  shopfront(g, X0 - 6, 108, 264, 318, ['#5E7F78', '#D8CDB2'], rnd, false);
  shopfront(g, 108, 183, 266, 318, ['#A65A48', '#E0D2B0'], rnd, true);
  shopfront(g, 183, X1 + 6, 268, 318, ['#47586A', '#CFCBBB'], rnd, false);
  // a sign band on the middle building
  wash(g, rectPoly(116, 252, 176, 262, rnd, 0.3), '#7E4A3A', 0.85, rnd, 2, 0.02);
  for (let i = 0; i < 7; i++) {
    ctx.save();
    ctx.restore();
    g.fillStyle = rgba('#E8D29A', 0.7);
    g.fillRect(121 + i * 7.3 + rnd.range(-0.5, 0.5), 255, rnd.range(2.5, 4.5), 3.2);
  }
  // the lamp-post on the near side: an iron pole, a lantern; its glow hangs in the wet air
  {
    const px = 203;
    g.fillStyle = rgba('#4B5560', 0.9);
    ribbon(g, [px, 388, px + 0.4, 250, px - 0.2, 150], 3.4, 0.5);
    wash(g, rectPoly(px - 5, 336, px + 5, 342, rnd, 0.3), '#404A55', 0.9, rnd, 2, 0.02);
    ctx.save();
    ctx.restore();
    const lg = g.createRadialGradient(px, 136, 0, px, 136, 46);
    lg.addColorStop(0, 'rgba(255,236,176,0.8)');
    lg.addColorStop(0.35, 'rgba(255,228,160,0.32)');
    lg.addColorStop(1, 'rgba(255,228,160,0)');
    g.fillStyle = lg;
    g.fillRect(px - 50, 86, 100, 100);
    wash(g, [px - 5, 146, px + 5, 146, px + 7, 130, px - 7, 130], '#F3E1A0', 0.95, rnd, 2, 0.02);
    wash(g, [px - 8, 130, px + 8, 130, px, 122], '#3C4650', 0.95, rnd, 2, 0.02);
  }
  // rain haze: the lower fronts dissolve into it
  {
    const hz = g.createLinearGradient(0, 200, 0, 322);
    hz.addColorStop(0, 'rgba(185,199,206,0)');
    hz.addColorStop(1, 'rgba(185,199,206,0.26)');
    g.fillStyle = hz;
    g.fillRect(X0, 200, X1 - X0, 122);
  }
  // the pavement opposite, the kerb, the wet road
  wash(g, rectPoly(X0 - 6, PAVEMENT_Y, X1 + 6, 334, rnd, 0.6), '#AAB6BC', 0.9, rnd, 3, 0.02);
  pen(g, X0, 334, X1, 334, 1.1, '#5C6870', 0.5, rnd, 0.3);
  wash(g, rectPoly(X0 - 6, 334, X1 + 6, 374, rnd, 0.6), '#56656F', 0.95, rnd, 3, 0.02);
  mottle(g, X0, 334, X1, 374, ['#47555F', '#66767F', '#5A6A74', '#7C8C94'], 7733, 0.3, 16, 2.2);
  // reflections: warm smears under the lit windows and the baker's, the lamp's long streak, sky in the puddles
  for (const [rx, w, col, a] of [
    [145, 26, '#F0C070', 0.45],
    [55, 8, '#E8B864', 0.2],
    [203, 5, '#FFF0C0', 0.5],
    [160, 8, '#E8B864', 0.28],
  ] as const) {
    g.fillStyle = rgba(col, a);
    ribbon(g, [rx + rnd.range(-1, 1), 334, rx + rnd.range(-2, 2), 352, rx + rnd.range(-2, 2), 372], w, 0.8, 0.15);
  }
  for (let i = 0; i < 6; i++) {
    const px = rnd.range(X0 + 10, X1 - 10);
    const py = rnd.range(342, 368);
    g.fillStyle = rgba('#C3D0D6', rnd.range(0.25, 0.45));
    tracePoly(g, deform(blobPoly(px, py, rnd.range(10, 26), rnd.range(1.4, 2.8), rnd, 12, 0.2), rnd, 2, 0.1));
    g.fill();
  }
  // a van parked at the kerb, its roof catching the sky
  {
    const vx = 52;
    wash(g, rectPoly(vx, 312, vx + 62, 342, rnd, 0.5), '#6E8090', 0.92, rnd, 3, 0.02);
    wash(g, [vx + 4, 313, vx + 40, 313, vx + 46, 324, vx + 4, 324], '#3F4D58', 0.9, rnd, 2, 0.02);
    g.fillStyle = rgba('#DDE6EA', 0.45);
    ribbon(g, [vx + 3, 314.2, vx + 30, 314, vx + 58, 314.6], 1.6, 0.8);
    for (const wx of [vx + 12, vx + 48]) {
      g.fillStyle = rgba('#1F2A32', 0.9);
      g.beginPath();
      g.arc(wx, 342, 5.2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = rgba('#233038', 0.35);
    g.fillRect(vx + 2, 344, 60, 3);
  }
  // the pavement on this side: wet slabs, strong reflections, a dark kerb line
  wash(g, rectPoly(X0 - 6, 374, X1 + 6, Y1 + 6, rnd, 0.6), '#9FAEB6', 0.95, rnd, 3, 0.02);
  pen(g, X0, 374, X1, 374, 1.3, '#4E5A63', 0.6, rnd, 0.3);
  for (let i = 0; i < 9; i++) {
    const x = X0 + 8 + i * 26 + rnd.range(-3, 3);
    pen(g, x, 376, x + (x - 140) * 0.18, Y1, 0.5, '#5C6870', 0.3, rnd, 0.3);
  }
  g.fillStyle = rgba('#E8F0F2', 0.3);
  ribbon(g, [X0 + 10, 380, X0 + 70, 381, X0 + 130, 380.5], 2.4, 0.8);
  ribbon(g, [X0 + 160, 384, X0 + 210, 384.5], 2, 0.8);
  // everything wet: one cool veil over the whole view
  g.fillStyle = 'rgba(96,120,144,0.07)';
  g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
  void HAZE;

  // laid on the wall's sheet, a touch out of focus
  ctx.save();
  ctx.filter = `blur(${Math.max(0.6, 1.1 * S)}px)`;
  ctx.drawImage(sh.cv, box.x, box.y, box.w, box.h);
  ctx.restore();
}

/** the glass itself, sharp: the sign painted in reverse, mist along the lower edges, beads, old tracks */
export function paintGlass(ctx: CanvasRenderingContext2D): void {
  const rnd = new Rand(40522);
  ctx.save();
  clipPanes(ctx);
  // a faint reflection of the room: diagonal pale bands, and the lamps' glints
  for (const [x, w, a] of [
    [60, 14, 0.07],
    [92, 5, 0.08],
    [176, 18, 0.06],
    [214, 6, 0.07],
  ] as const) {
    ctx.fillStyle = rgba('#F4F8F8', a);
    ctx.beginPath();
    ctx.moveTo(x, 74);
    ctx.lineTo(x + w, 74);
    ctx.lineTo(x + w - 60, 388);
    ctx.lineTo(x - 60, 388);
    ctx.closePath();
    ctx.fill();
  }
  // mist where the glass is coldest: along the lower edge of each pane
  for (const p of PANES) {
    const h = Math.min(40, (p.y1 - p.y0) * 0.5);
    const m = ctx.createLinearGradient(0, p.y1 - h, 0, p.y1);
    m.addColorStop(0, 'rgba(226,234,236,0)');
    m.addColorStop(1, 'rgba(226,234,236,0.3)');
    ctx.fillStyle = m;
    ctx.fillRect(p.x0, p.y1 - h, p.x1 - p.x0, h);
  }
  // the tracks old drops left: long thin pale lines, a little wavering
  for (let i = 0; i < 26; i++) {
    const x = rnd.range(38, 240);
    const y0 = rnd.range(80, 330);
    const len = rnd.range(14, 60);
    const pts: number[] = [];
    for (let k = 0; k <= 6; k++) pts.push(x + Math.sin(k * 1.3 + i) * 0.7, y0 + (len * k) / 6);
    ctx.fillStyle = rgba('#DDE6EA', rnd.range(0.06, 0.13));
    ribbon(ctx, pts, rnd.range(0.7, 1.4), 0.9);
  }
  // beads that stayed: each a little long (gravity), a darker refracting edge below, a soft crescent of light above
  for (let i = 0; i < 70; i++) {
    const x = rnd.range(38, 240);
    const y = rnd.range(78, 384);
    const r = rnd.range(0.5, 1.3);
    const ry = r * rnd.range(1.5, 2.4);
    // a bead is a lens: a touch darker than the glass where it bends the sky away, its lower edge holding a little
    // light, never a sparkle
    ctx.fillStyle = rgba('#7A8E9C', 0.16);
    ctx.beginPath();
    ctx.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#E4ECEE', 0.22);
    ctx.beginPath();
    ctx.ellipse(x + r * 0.1, y + ry * 0.45, r * 0.7, ry * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // the sign: gilt letters in reverse (we see the back of the painting), a pinstripe border, a swag under
  ctx.save();
  ctx.beginPath();
  ctx.rect(36, 74, 206, 54);
  ctx.clip();
  const cx = 139;
  ctx.strokeStyle = rgba('#D9B24A', 0.8);
  ctx.lineWidth = 0.9;
  ctx.strokeRect(41, 79, 196, 44);
  ctx.strokeStyle = rgba('#D9B24A', 0.5);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(43.5, 81.5, 191, 39);
  ctx.translate(cx, 0);
  ctx.scale(-1, 1);
  const font = (px: number, wt = 700) => `${wt} ${px}px "Libre Caslon Display","Libre Caslon Text",Georgia,"Times New Roman",serif`;
  const paintText = (txt: string, y: number, px: number, track: number) => {
    ctx.font = font(px);
    ctx.textBaseline = 'alphabetic';
    // letters laid out by hand so the spacing is even in the mirror
    const widths = Array.from(txt, (ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (txt.length - 1);
    let x = -total / 2;
    // each letter: a dark edge for the painter's outline, the gilt over it, a lit edge
    Array.from(txt).forEach((ch, i) => {
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = rgba('#2F2A22', 0.7);
      ctx.strokeText(ch, x + 0.7, y + 0.7);
      ctx.fillStyle = rgba('#E2BE62', 0.95);
      ctx.fillText(ch, x, y);
      ctx.fillStyle = rgba('#FFF0B8', 0.35);
      ctx.fillText(ch, x - 0.3, y - 0.4);
      x += widths[i]! + track;
    });
  };
  paintText('GROCER', 106, 25, 3.2);
  paintText('FRESH  DAILY', 119, 7.4, 2.4);
  ctx.restore();
  void LIGHT;
  void hashSeed;
  void clamp;
  void grain;
  void pen;
}

/* ------------------------------------------------------------------ the moving rain */

interface Drop {
  x: number;
  y0: number;
  travel: number;
  period: number;
  phase: number;
  r: number;
  pane: number;
}

export class GlassRain {
  private drops: Drop[] = [];
  /** falling rain outside: x, phase, speed, length */
  private falling: number[] = [];

  constructor() {
    const rnd = new Rand(40523);
    PANES.forEach((p, pane) => {
      const area = (p.x1 - p.x0) * (p.y1 - p.y0);
      const n = Math.max(2, Math.round(area / 900));
      for (let i = 0; i < n; i++) {
        const travel = rnd.range(30, (p.y1 - p.y0) * 0.9);
        this.drops.push({ x: rnd.range(p.x0 + 5, p.x1 - 5), y0: rnd.range(p.y0 + 2, Math.max(p.y0 + 3, p.y1 - travel - 2)), travel, period: rnd.range(9, 22), phase: rnd.next(), r: rnd.range(1, 1.9), pane });
      }
    });
    for (let i = 0; i < 80; i++) this.falling.push(rnd.range(34, 244), rnd.next(), rnd.range(150, 230), rnd.range(6, 13));
  }

  /** rain falling past the window, and the drops running on the glass: clipped to the panes */
  draw(ctx: CanvasRenderingContext2D, tSec: number, reduced: boolean): void {
    const t = reduced ? 4.2 : tSec;
    ctx.save();
    clipPanes(ctx);
    // falling rain: fine slanted streaks, lighter than the dull street
    const H = 330;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(214,226,234,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < (reduced ? 0 : this.falling.length); i += 4) {
      const x = this.falling[i]!;
      const u = (this.falling[i + 1]! + (reduced ? 0 : t * this.falling[i + 2]! / H)) % 1;
      const y = 70 + u * H;
      const l = this.falling[i + 3]!;
      ctx.moveTo(x - u * 4, y);
      ctx.lineTo(x - u * 4 - l * 0.16, y + l);
    }
    ctx.stroke();
    // drops on the glass: each runs in fits (slow, quick, slow), leaving a wet track, and gathers again at the top
    for (const d of this.drops) {
      const u = (t / d.period + d.phase) % 1;
      // speed 1 - 0.9 cos(6πu): near stops between the runs, so the drop hangs, then goes
      const f = u - (0.9 * Math.sin(6 * Math.PI * u)) / (6 * Math.PI);
      const y = d.y0 + f * d.travel;
      const a = Math.min(1, u / 0.05) * Math.min(1, (1 - u) / 0.1);
      const tl = Math.min(f * d.travel, 46);
      // the wet track it leaves: a faint clear runnel, a shade darker at its edge
      if (tl > 2) {
        ctx.fillStyle = `rgba(110,130,146,${0.1 * a})`;
        ribbon(ctx, [d.x, y - tl, d.x + 0.3, y - tl * 0.4, d.x, y], 1.1, 0.5);
        ctx.fillStyle = `rgba(226,236,240,${0.12 * a})`;
        ribbon(ctx, [d.x - 0.3, y - tl, d.x, y - tl * 0.4, d.x - 0.3, y], 0.5, 0.5);
      }
      // the drop: a lens, darker where it bends the sky away, light gathered in its lower half
      const r = d.r * 0.8 * (0.55 + 0.45 * Math.min(1, u / 0.12));
      const ry = r * 1.7;
      ctx.fillStyle = `rgba(96,114,130,${0.26 * a})`;
      ctx.beginPath();
      ctx.ellipse(d.x, y, r, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(232,240,242,${0.34 * a})`;
      ctx.beginPath();
      ctx.ellipse(d.x + r * 0.1, y + ry * 0.4, r * 0.62, ry * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    void SHADE;
  }
}

/**
 * The street seen through the door's glass, a little further along than the window shows: the same grey morning (a
 * pale sky, the end of a terrace across the road with one warm window, the kerb and the wet road catching the sky),
 * painted on its own sheet and laid down out of focus like the window's view.
 */
export function paintDoorView(ctx: CanvasRenderingContext2D, S: number, r: Rect): void {
  const rnd = new Rand(40531);
  const pad = 6;
  const box = { x: r.x0 - pad, y: r.y0 - pad, w: r.x1 - r.x0 + pad * 2, h: r.y1 - r.y0 + pad * 2 };
  const sh = spriteCtx(box, S);
  const g = sh.ctx;
  const X0 = box.x;
  const X1 = box.x + box.w;
  const Y0 = box.y;
  const Y1 = box.y + box.h;
  const sky = g.createLinearGradient(0, Y0, 0, 250);
  sky.addColorStop(0, '#93A6B4');
  sky.addColorStop(1, '#C9D3D4');
  g.fillStyle = sky;
  g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
  mottle(g, X0, Y0, X1, 220, ['#8296A6', '#A8B8C2', '#B9C6CC'], 5531, 0.26, 26, 1.6);
  // the end of the terrace opposite, a gable and its chimney, one lit window, one dark
  building(g, X0 - 4, X1 - 22, 150, 300, '#8C7A6C', rnd, { roof: '#5C6C78', lit: [1], floors: 3 });
  building(g, X1 - 22, X1 + 6, 176, 300, '#9AA8B2', rnd, { roof: '#66747F', lit: [], floors: 2 });
  // rain haze, the pavement opposite, the road and its reflections
  const hz = g.createLinearGradient(0, 220, 0, 300);
  hz.addColorStop(0, 'rgba(185,199,206,0)');
  hz.addColorStop(1, 'rgba(185,199,206,0.3)');
  g.fillStyle = hz;
  g.fillRect(X0, 220, X1 - X0, 80);
  wash(g, rectPoly(X0 - 4, 296, X1 + 4, 306, rnd, 0.4), '#A8B4BA', 0.9, rnd, 2, 0.02);
  wash(g, rectPoly(X0 - 4, 306, X1 + 4, Y1 + 4, rnd, 0.4), '#5C6A74', 0.95, rnd, 3, 0.02);
  g.fillStyle = rgba('#E8B864', 0.3);
  ribbon(g, [X0 + 22, 308, X0 + 21, 322, X0 + 22, Y1], 5, 0.8, 0.15);
  g.fillStyle = rgba('#C3D0D6', 0.35);
  ribbon(g, [X0 + 6, 316, X0 + 40, 317, X1 - 6, 316], 1.6, 0.8);
  g.fillStyle = 'rgba(96,120,144,0.08)';
  g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  ctx.clip();
  ctx.filter = `blur(${Math.max(0.6, 1.2 * S)}px)`;
  ctx.drawImage(sh.cv, box.x, box.y, box.w, box.h);
  ctx.filter = 'none';
  // the glass: old tracks of rain, beads, the mist along its foot
  for (let i = 0; i < 12; i++) {
    const x = rnd.range(r.x0 + 3, r.x1 - 3);
    const y = rnd.range(r.y0 + 6, r.y1 - 40);
    ctx.fillStyle = rgba('#DDE6EA', rnd.range(0.06, 0.12));
    ribbon(ctx, [x, y, x + 0.4, y + rnd.range(14, 44)], 1, 0.9);
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd.range(r.x0 + 2, r.x1 - 2);
    const y = rnd.range(r.y0 + 4, r.y1 - 4);
    const rr = rnd.range(0.5, 1.2);
    ctx.fillStyle = rgba('#7A8E9C', 0.16);
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#E4ECEE', 0.2);
    ctx.beginPath();
    ctx.ellipse(x, y + rr * 0.7, rr * 0.6, rr * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const m = ctx.createLinearGradient(0, r.y1 - 40, 0, r.y1);
  m.addColorStop(0, 'rgba(226,234,236,0)');
  m.addColorStop(1, 'rgba(226,234,236,0.28)');
  ctx.fillStyle = m;
  ctx.fillRect(r.x0, r.y1 - 40, r.x1 - r.x0, 40);
  ctx.restore();
}
