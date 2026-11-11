/**
 * The chalkboard (the Board contract in partsApi.ts): a dark slate in a worn oak frame on a chalk ledge, painted once
 * per size; the title, the six item names, the leaders and the ruled line chalked on it once; and the lines the grocer
 * re-chalks (the year, six prices, the total), each kept on a small canvas of its own and repainted only while it is
 * wiped or written (the chalk is a list of dabs along the hand-made strokes in hand.ts: writing shows the dabs up to
 * the progress, wiping fades them under the cloth, left to right, and leaves a smear of dust that settles back as the
 * new text is written). Nothing here animates by itself: every change is the grocer's hand's progress.
 */
import type { BoardContent, ItemKey } from '../types';
import { ITEMS, ITEM_KEYS } from '../types';
import { BOARD, BOARD_COLUMNS, BOARD_LINES, CHALK_SIZE, type Pt } from './geom';
import { BOARD_LINE_ORDER, type Board, type BoardLine } from './partsApi';
import { Rand, clamp } from '../../scene/prng';
import { makeCanvas, rgba } from '../../scene/watercolor';
import { chalkStroke, layoutText, tipAt, type LayoutSpec, type Laid } from './hand';
import { INK, LIGHT, grain, mottle, pen, plank, rectPoly, ribbon, spriteCtx, wash } from './paint';

const CHALK = '#F3EFE2';
const TAU = Math.PI * 2;
/** the frame's width, and the ledge under it */
const FRAME = 13;

const LINE_INDEX: Record<BoardLine, number> = { year: 0, bread: 1, eggs: 2, coffee: 3, bananas: 4, chicken: 5, flour: 6, total: 7 };
const CX = (BOARD.x0 + BOARD.x1) / 2;

function specFor(line: BoardLine, text: string): LayoutSpec {
  const seed = 4100 + LINE_INDEX[line] * 17;
  if (line === 'year') return { text, x: CX, y: BOARD_LINES.year, size: CHALK_SIZE.year, align: 'center', seed, weight: 1.12 };
  if (line === 'total') return { text, x: BOARD_COLUMNS.priceX, y: BOARD_LINES.total, size: CHALK_SIZE.total, align: 'right', seed, weight: 1.08 };
  return { text, x: BOARD_COLUMNS.priceX, y: BOARD_LINES[line], size: CHALK_SIZE.line, align: 'right', seed };
}

/** the world rect a re-chalked line lives in */
function boxFor(line: BoardLine): { x: number; y: number; w: number; h: number } {
  const spec = specFor(line, '');
  const x0 = line === 'year' ? CX - 88 : 822;
  const x1 = line === 'year' ? CX + 88 : BOARD.x1 - 4;
  return { x: x0, y: spec.y - spec.size * 1.35, w: x1 - x0, h: spec.size * 2.05 };
}

/** the part of a dab list that is drawn: up to progress umax, each dab dimmed by `fade(x)` (1 = gone) */
function drawDabs(ctx: CanvasRenderingContext2D, d: Float32Array, n: number, umax: number, fade?: (x: number) => number): void {
  ctx.fillStyle = CHALK;
  for (let i = 0; i < n; i++) {
    const o = i * 5;
    if (d[o + 4]! > umax) break;
    let a = d[o + 3]!;
    if (fade) a *= 1 - fade(d[o]!);
    if (a < 0.02) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(d[o]!, d[o + 1]!, d[o + 2]!, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** the chalk dust a cloth leaves: soft pale ellipses along the line */
function dustBlobs(ctx: CanvasRenderingContext2D, line: BoardLine, box: { x: number; y: number; w: number; h: number }, mult: (x: number) => number): void {
  const r = new Rand(9100 + LINE_INDEX[line]);
  const y0 = box.y + box.h * 0.62;
  for (let i = 0; i < 8; i++) {
    const bx = box.x + box.w * r.range(0.05, 0.95);
    const by = y0 + r.range(-0.2, 0.15) * box.h;
    const rx = r.range(12, 32);
    const ry = r.range(4, 9);
    const a = r.range(0.06, 0.1) * mult(bx);
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba('#D8DCD6', a));
    g.addColorStop(1, rgba('#D8DCD6', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

interface LineState {
  line: BoardLine;
  /** the text on the slate once settled ('' = clear) */
  text: string;
  laid: Laid | null;
  /** the extent the cloth works over (the last text's, or a default) */
  ref: { x0: number; x1: number };
  phase: 'rest' | 'wipe' | 'write';
  t: number;
  /** what is being written */
  wl: Laid | null;
  /** dust is still raised from a wipe (no text written since) */
  raised: boolean;
  cv: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  dirty: boolean;
}

export function createBoard(): Board {
  const lines = new Map<BoardLine, LineState>();
  for (const l of BOARD_LINE_ORDER) {
    const b = boxFor(l);
    lines.set(l, { line: l, text: '', laid: null, ref: { x0: b.x + b.w - 70, x1: b.x + b.w - 8 }, phase: 'rest', t: 0, wl: null, raised: false, cv: null, ctx: null, dirty: true });
  }
  const layouts = new Map<string, Laid>();
  const laidFor = (line: BoardLine, text: string): Laid => {
    const k = `${line}|${text}`;
    let v = layouts.get(k);
    if (!v) {
      v = layoutText(specFor(line, text));
      if (layouts.size > 96) layouts.delete(layouts.keys().next().value as string);
      layouts.set(k, v);
    }
    return v;
  };

  let q = 0;
  let statik: HTMLCanvasElement | null = null;
  const sbox = { x: BOARD.x0 - FRAME - 10, y: BOARD.y0 - FRAME - 10, w: BOARD.x1 - BOARD.x0 + FRAME * 2 + 20, h: BOARD.y1 - BOARD.y0 + FRAME * 2 + 44 };

  /* ------------------------------------------------------------------ one re-chalked line */

  const cover = (st: LineState): ((x: number) => number) => {
    const w = Math.max(1, st.ref.x1 - st.ref.x0);
    // the cloth works left to right; a little way behind it the chalk is gone
    return (x) => clamp((st.t * 1.32 - (x - st.ref.x0) / w) / 0.3, 0, 1);
  };

  const paintLine = (st: LineState): void => {
    const ctx = st.ctx;
    if (!ctx || !st.cv) return;
    const box = boxFor(st.line);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, st.cv.width, st.cv.height);
    ctx.setTransform(q, 0, 0, q, -box.x * q, -box.y * q);
    const cov = cover(st);
    let mult: (x: number) => number;
    if (st.phase === 'wipe') mult = (x) => 0.55 + 0.6 * cov(x);
    else if (st.phase === 'write') mult = () => 0.55 + 0.6 * (1 - st.t);
    else mult = () => (st.raised ? 1.15 : 0.55);
    dustBlobs(ctx, st.line, box, mult);
    if (st.phase === 'write' && st.wl) drawDabs(ctx, st.wl.dabs, st.wl.nDabs, st.t);
    else if (st.phase === 'wipe' && st.laid) drawDabs(ctx, st.laid.dabs, st.laid.nDabs, 1, cov);
    else if (st.laid) drawDabs(ctx, st.laid.dabs, st.laid.nDabs, 1);
    // the slate's tooth eats the chalk where it is high
    grain(ctx, CHALK, box.x, box.y, box.w, box.h, 0.34, 0, 911);
    st.dirty = false;
  };

  const settle = (st: LineState, text: string): void => {
    st.text = text;
    st.laid = text ? laidFor(st.line, text) : null;
    if (st.laid) st.ref = { x0: st.laid.x0, x1: st.laid.x1 };
    st.phase = 'rest';
    st.t = 0;
    st.wl = null;
    st.raised = false;
    st.dirty = true;
  };

  /* ------------------------------------------------------------------ the static slate */

  const paintStatic = async (tick: () => Promise<void>, check: () => boolean): Promise<HTMLCanvasElement | null> => {
    const { cv, ctx } = spriteCtx(sbox, q);
    const rnd = new Rand(7771);
    const fx0 = BOARD.x0 - FRAME;
    const fx1 = BOARD.x1 + FRAME;
    const fy0 = BOARD.y0 - FRAME;
    const fy1 = BOARD.y1 + FRAME;

    // the frame's shadow on the wall (soft, down and to the right: the light is upper left)
    {
      ctx.save();
      ctx.filter = `blur(${Math.max(1, 3.2 * q)}px)`;
      ctx.fillStyle = 'rgba(46,30,18,0.3)';
      ctx.fillRect(fx0 + 3, fy0 + 5, fx1 - fx0 + 1, fy1 - fy0 + 3);
      ctx.restore();
    }
    // the frame: four boards of oak, mitred, worn
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx0 - 1, fy0 - 1, fx1 - fx0 + 2, fy1 - fy0 + 2);
    ctx.clip();
    plank(ctx, fx0, fy0, fx1, BOARD.y0, '#9A6A40', rnd, { grain: 1.3, knots: 1 });
    plank(ctx, fx0, BOARD.y1, fx1, fy1, '#7C5232', rnd, { grain: 1.3, knots: 1 });
    plank(ctx, fx0, BOARD.y0, BOARD.x0, BOARD.y1, '#8E5F3A', rnd, { vertical: true, grain: 1.2 });
    plank(ctx, BOARD.x1, BOARD.y0, fx1, BOARD.y1, '#744D2F', rnd, { vertical: true, grain: 1.2 });
    // mitre joints
    for (const [ax, ay, bx, by] of [
      [fx0, fy0, BOARD.x0, BOARD.y0],
      [fx1, fy0, BOARD.x1, BOARD.y0],
      [fx0, fy1, BOARD.x0, BOARD.y1],
      [fx1, fy1, BOARD.x1, BOARD.y1],
    ] as const) pen(ctx, ax, ay, bx, by, 0.5, INK, 0.5, rnd, 0.2);
    // worn edges: a pale scuff along the outer lit corner, dark grime low on the right
    ctx.fillStyle = rgba('#E9C894', 0.3);
    ribbon(ctx, [fx0 + 2, fy0 + 1.2, fx0 + 40, fy0 + 1.5, fx0 + 90, fy0 + 1.2], 1.2, 0.9);
    ribbon(ctx, [fx0 + 1.2, fy0 + 2, fx0 + 1.4, fy0 + 40, fx0 + 1.1, fy0 + 120], 1.1, 0.9);
    ctx.fillStyle = rgba('#2A180C', 0.26);
    ribbon(ctx, [fx1 - 1.2, fy1 - 90, fx1 - 1.4, fy1 - 20], 1.2, 0.9);
    // nails at the corners
    for (const [nx, ny] of [
      [fx0 + 6, fy0 + 6],
      [fx1 - 6, fy0 + 6],
      [fx0 + 6, fy1 - 6],
      [fx1 - 6, fy1 - 6],
    ] as const) {
      ctx.fillStyle = rgba('#2A1A10', 0.6);
      ctx.beginPath();
      ctx.arc(nx, ny, 1.15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(LIGHT, 0.5);
      ctx.beginPath();
      ctx.arc(nx - 0.35, ny - 0.4, 0.4, 0, TAU);
      ctx.fill();
    }
    // the inner moulding: a bright line catching the light on the top and left, a dark one low
    ctx.fillStyle = rgba('#F4D9A8', 0.4);
    ribbon(ctx, [BOARD.x0 - 1, BOARD.y0 - 1, BOARD.x1 + 1, BOARD.y0 - 1], 1.1, 0.9);
    ribbon(ctx, [BOARD.x0 - 1, BOARD.y0 - 1, BOARD.x0 - 1, BOARD.y1 + 1], 1.1, 0.9);
    ctx.restore();
    pen(ctx, fx0, fy0, fx1, fy0, 0.6, INK, 0.55, rnd, 0.25);
    pen(ctx, fx0, fy0, fx0, fy1, 0.6, INK, 0.55, rnd, 0.25);
    pen(ctx, fx1, fy0, fx1, fy1, 0.6, INK, 0.6, rnd, 0.25);
    pen(ctx, fx0, fy1, fx1, fy1, 0.6, INK, 0.65, rnd, 0.25);
    await tick();
    if (!check()) return null;

    // the slate
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0);
    ctx.clip();
    ctx.fillStyle = '#2B3636';
    ctx.fillRect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0);
    mottle(ctx, BOARD.x0, BOARD.y0, BOARD.x1, BOARD.y1, ['#222C2D', '#33403F', '#28323A', '#3A4745', '#2A302E'], 6613, 0.3, 46, 1.4);
    // the cloth's old sweeps: broad pale smears, long and low
    for (let i = 0; i < 16; i++) {
      const cx = rnd.range(BOARD.x0, BOARD.x1);
      const cy = rnd.range(BOARD.y0 + 10, BOARD.y1 - 10);
      const len = rnd.range(50, 130);
      const a = rnd.range(-0.5, 0.35);
      const pts: number[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8 - 0.5;
        pts.push(cx + Math.cos(a) * len * t, cy + Math.sin(a) * len * t + Math.sin(t * 6 + i) * 3);
      }
      ctx.fillStyle = rgba('#CFD6D0', rnd.range(0.025, 0.06));
      ribbon(ctx, pts, rnd.range(6, 15), 0.9, 0.2);
    }
    // fine scratches
    for (let i = 0; i < 46; i++) {
      const x = rnd.range(BOARD.x0, BOARD.x1);
      const y = rnd.range(BOARD.y0, BOARD.y1);
      const a = rnd.range(0, Math.PI);
      const l = rnd.range(3, 14);
      ctx.strokeStyle = rgba('#DDE3DD', rnd.range(0.04, 0.12));
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    // the frame's shadow on the slate (top and left), a glare from the lamp over it, a bright lip low and right
    const top = ctx.createLinearGradient(0, BOARD.y0, 0, BOARD.y0 + 12);
    top.addColorStop(0, 'rgba(8,12,12,0.45)');
    top.addColorStop(1, 'rgba(8,12,12,0)');
    ctx.fillStyle = top;
    ctx.fillRect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, 12);
    const left = ctx.createLinearGradient(BOARD.x0, 0, BOARD.x0 + 10, 0);
    left.addColorStop(0, 'rgba(8,12,12,0.4)');
    left.addColorStop(1, 'rgba(8,12,12,0)');
    ctx.fillStyle = left;
    ctx.fillRect(BOARD.x0, BOARD.y0, 10, BOARD.y1 - BOARD.y0);
    const glare = ctx.createLinearGradient(BOARD.x0, BOARD.y0, BOARD.x1, BOARD.y1);
    glare.addColorStop(0, 'rgba(255,244,214,0.1)');
    glare.addColorStop(0.45, 'rgba(255,244,214,0.03)');
    glare.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = glare;
    ctx.fillRect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0);
    ctx.fillStyle = rgba('#C8D2CC', 0.3);
    ribbon(ctx, [BOARD.x0 + 2, BOARD.y1 - 0.8, BOARD.x1 - 2, BOARD.y1 - 0.8], 0.8, 0.9);
    ribbon(ctx, [BOARD.x1 - 0.8, BOARD.y0 + 2, BOARD.x1 - 0.8, BOARD.y1 - 2], 0.8, 0.9);
    ctx.restore();
    grain(ctx, '#10181A', BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, 0, 0.3);
    await tick();
    if (!check()) return null;

    // the chalk that is written once: the title, the item names, the leaders, the ruled line (on its own sheet, so the
    // slate's tooth can eat it as it eats the rest)
    const sh = spriteCtx(sbox, q);
    const c2 = sh.ctx;
    const title = layoutText({ text: "This week's basket", x: CX, y: BOARD_LINES.title, size: 20, align: 'center', seed: 31, weight: 1.12 });
    drawDabs(c2, title.dabs, title.nDabs, 1);
    // a flourish under the title: a swash that starts thick and runs out
    {
      const ty = BOARD_LINES.title + 9;
      const pts: number[] = [];
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        pts.push(CX - 70 + t * 140, ty + Math.sin(t * Math.PI * 2.2) * 0.9 + t * 0.8);
      }
      const fl = chalkStroke(pts, ty, 18, 77, 0.9);
      drawDabs(c2, fl.dabs, fl.nDabs, 1);
    }
    const nameOf = (k: ItemKey) => ITEMS[k].label;
    const names: [BoardLine, string][] = [...ITEM_KEYS.map((k) => [k, nameOf(k)] as [BoardLine, string]), ['total', 'Total']];
    for (const [ln, nm] of names) {
      const sz = ln === 'total' ? CHALK_SIZE.total : CHALK_SIZE.line;
      const l = layoutText({ text: nm, x: BOARD_COLUMNS.nameX, y: BOARD_LINES[ln], size: sz, align: 'left', seed: 500 + LINE_INDEX[ln] * 13, weight: ln === 'total' ? 1.08 : 1 });
      drawDabs(c2, l.dabs, l.nDabs, 1);
      // leader dots from the name to the price column
      const lr = new Rand(8800 + LINE_INDEX[ln]);
      const dots: number[] = [];
      for (let x = l.x1 + 8; x < 872; x += lr.range(3.6, 5.2)) dots.push(x, BOARD_LINES[ln] - 0.8 + lr.range(-0.5, 0.5), lr.range(0.38, 0.6), lr.range(0.3, 0.7), 0);
      drawDabs(c2, new Float32Array(dots), dots.length / 5, 1);
    }
    {
      // the ruled line above the total: one pull of the chalk along a straightedge, a little heavier at the start
      const y = BOARD_COLUMNS.ruleY;
      const pts: number[] = [];
      for (let k = 0; k <= 30; k++) pts.push(BOARD.x0 + 14 + (k / 30) * (BOARD.x1 - BOARD.x0 - 28), y + rnd.range(-0.25, 0.25) - (k / 30) * 0.9);
      const ru = chalkStroke(pts, y, 18, 91, 1.15);
      drawDabs(c2, ru.dabs, ru.nDabs, 1);
    }
    grain(c2, CHALK, sbox.x, sbox.y, sbox.w, sbox.h, 0.34, 0, 911);
    ctx.drawImage(sh.cv, sbox.x, sbox.y, sbox.w, sbox.h);

    // the ledge under the frame, with a stub of chalk and the felt rubber
    const ly = fy1 - 0.5;
    plank(ctx, BOARD.x0 + 6, ly, BOARD.x1 - 6, ly + 7.5, '#8A5C38', rnd, { grain: 1 });
    ctx.fillStyle = rgba('#F6DDB0', 0.35);
    ribbon(ctx, [BOARD.x0 + 8, ly + 0.7, BOARD.x1 - 8, ly + 0.7], 0.8, 0.9);
    ctx.fillStyle = rgba('#2A180C', 0.22);
    ctx.fillRect(BOARD.x0 + 8, ly + 7.5, BOARD.x1 - BOARD.x0 - 16, 2.2);
    // chalk dust along the ledge
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = rgba(CHALK, rnd.range(0.12, 0.4));
      ctx.beginPath();
      ctx.ellipse(rnd.range(BOARD.x0 + 40, BOARD.x0 + 150), ly + rnd.range(0.2, 2.2), rnd.range(0.4, 1.6), rnd.range(0.2, 0.5), 0, 0, TAU);
      ctx.fill();
    }
    // chalk: a stub, slightly broken, and a short end
    const stub = (x: number, w: number, tilt: number) => {
      ctx.save();
      ctx.translate(x, ly - 0.2);
      ctx.rotate(tilt);
      wash(ctx, rectPoly(0, -2.6, w, 0, rnd, 0.12), '#F4EFE0', 0.95, rnd, 2, 0.01);
      ctx.fillStyle = rgba('#B9B3A2', 0.35);
      ctx.fillRect(0.4, -0.9, w - 0.8, 0.9);
      pen(ctx, 0, 0, w, 0, 0.35, INK, 0.45, rnd, 0.1);
      ctx.restore();
    };
    stub(BOARD.x0 + 52, 13, -0.03);
    stub(BOARD.x0 + 76, 6, 0.05);
    // the rubber: a felt pad on a wooden back
    {
      const ex = BOARD.x1 - 62;
      wash(ctx, rectPoly(ex, ly - 6.5, ex + 26, ly - 0.2, rnd, 0.2), '#8A5C38', 0.95, rnd, 2, 0.01);
      wash(ctx, rectPoly(ex + 0.5, ly - 10, ex + 25.5, ly - 6, rnd, 0.2), '#4A4A48', 0.95, rnd, 2, 0.01);
      ctx.fillStyle = rgba(CHALK, 0.28);
      for (let i = 0; i < 18; i++) ctx.fillRect(ex + rnd.range(1, 24), ly - rnd.range(6.5, 9.5), rnd.range(0.6, 2.4), 0.5);
      pen(ctx, ex, ly - 6.4, ex + 26, ly - 6.4, 0.4, INK, 0.5, rnd, 0.1);
      pen(ctx, ex, ly - 0.2, ex + 26, ly - 0.2, 0.4, INK, 0.5, rnd, 0.1);
    }
    // a faint wash of the lamp's warmth on the frame and slate (the lamps hang to its left)
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const warm = ctx.createLinearGradient(fx0, 0, fx1, 0);
    warm.addColorStop(0, 'rgba(255,214,140,0.12)');
    warm.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(sbox.x, sbox.y, sbox.w, sbox.h);
    ctx.restore();
    return cv;
  };

  /* ------------------------------------------------------------------ the contract */

  const api: Board = {
    async prepare(pxPerUnit, tick, check) {
      const nq = Math.max(0.5, Math.min(4, pxPerUnit));
      if (statik && Math.abs(nq - q) / q < 0.03) return;
      q = nq;
      const s = await paintStatic(tick, check);
      if (!s || !check()) return;
      statik = s;
      for (const st of lines.values()) {
        const b = boxFor(st.line);
        st.cv = makeCanvas(Math.ceil(b.w * q), Math.ceil(b.h * q));
        st.ctx = st.cv.getContext('2d')!;
        st.dirty = true;
      }
    },
    shown() {
      const c: BoardContent = { year: lines.get('year')!.text, total: lines.get('total')!.text, prices: {} as Record<ItemKey, string> };
      for (const k of ITEM_KEYS) c.prices[k] = lines.get(k)!.text;
      return c;
    },
    wipeTip(line, t) {
      const st = lines.get(line)!;
      const spec = specFor(line, '');
      const f = clamp(t * 1.32, 0, 1);
      const x = st.ref.x0 - 4 + (st.ref.x1 - st.ref.x0 + 10) * f + Math.sin(t * 17) * 3;
      return { x, y: spec.y - spec.size * (0.42 + 0.18 * Math.sin(t * 23 + 1)) } as Pt;
    },
    wipe(line, t) {
      const st = lines.get(line)!;
      if (!st.laid && st.phase !== 'wipe') return;
      if (t <= 0) return;
      if (t >= 1) {
        st.text = '';
        st.laid = null;
        st.phase = 'rest';
        st.raised = true;
        st.t = 0;
        st.dirty = true;
        return;
      }
      st.phase = 'wipe';
      st.t = t;
      st.dirty = true;
    },
    writeTip(line, text, t) {
      const l = laidFor(line, text);
      const [x, y] = tipAt(l, t);
      return { x, y };
    },
    write(line, text, t) {
      const st = lines.get(line)!;
      if (st.laid) settle(st, '');
      if (!text) return;
      if (t >= 1) {
        settle(st, text);
        return;
      }
      if (t <= 0) return;
      st.phase = 'write';
      st.wl = laidFor(line, text);
      st.ref = { x0: st.wl.x0, x1: st.wl.x1 };
      st.t = t;
      st.dirty = true;
    },
    set(content) {
      for (const l of BOARD_LINE_ORDER) {
        const text = l === 'year' ? content.year : l === 'total' ? content.total : content.prices[l];
        const st = lines.get(l)!;
        // already true: leave it be (the stand-in grocer sets every frame, and a settled line must not repaint)
        if (st.phase === 'rest' && st.text === text && !st.raised) continue;
        settle(st, text);
      }
    },
    draw(ctx) {
      if (!statik) return;
      ctx.drawImage(statik, sbox.x, sbox.y, sbox.w, sbox.h);
      for (const st of lines.values()) {
        if (!st.cv) continue;
        if (st.dirty) paintLine(st);
        const b = boxFor(st.line);
        ctx.drawImage(st.cv, b.x, b.y, st.cv.width / q, st.cv.height / q);
      }
    },
  };
  return api;
}
