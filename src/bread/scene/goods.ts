/**
 * The things on the shelves: tins, jars, packets, sacks, bottles and small crates, each painted as ink under a few
 * washes (a pen outline first, the colour glazed over it, a lit stripe on the left and a shaded one on the right,
 * the label stated with a few strokes and not read). Every one is its own: sizes, colours, labels, tilt and gaps are
 * drawn from the generator, and the colours are pulled toward the wall's tone so the shelves stay a value or two
 * quieter than the counter and the board. Also used by the foreground crates' produce (apples, potatoes, greens).
 */
import { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { INK, LIGHT, SHADE, blobPoly, mix, pen, rectPoly, ribbon, wash } from './paint';

/** the tone the goods are pulled toward (the lamplit back of the shelf) */
const QUIET = '#A8926C';
const LABELS = ['#E8DAB6', '#E2CFA2', '#D9C493', '#EEE3C6', '#DCC9A0'];
const TIN_COLS = ['#B5483A', '#2E6C74', '#C8962E', '#3E5F8C', '#6E8A3C', '#A8693A', '#8C3A55', '#C46B3C', '#4F7A5A', '#7B5E8E', '#2F5F8A', '#B88A2A'];
const PACKET_COLS = ['#D8C79A', '#B5483A', '#3E5F8C', '#D9A93A', '#6E8A3C', '#E5D9BA', '#A8693A', '#5F8C8A', '#C9786A'];
const JAM = ['#8A2A3A', '#B04A2A', '#C79A2E', '#5A6A2C', '#6A2E4A', '#B8742E', '#7A3A22', '#D9B55A'];

export const quiet = (hex: string, t = 0.26): string => mix(hex, QUIET, t);

/** a vertical bar of light on a round thing (a tin, a jar, a bottle): lit left, shaded right */
function roundShading(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, rnd: Rand, lit = 0.34, shade = 0.3): void {
  ctx.fillStyle = rgba(LIGHT, lit);
  ribbon(ctx, [x0 + w * 0.2, y0 + h * 0.06, x0 + w * 0.2 + rnd.range(-0.3, 0.3), y0 + h * 0.5, x0 + w * 0.22, y0 + h * 0.94], Math.max(1.1, w * 0.13), 0.8);
  ctx.fillStyle = rgba(SHADE, shade);
  ribbon(ctx, [x0 + w * 0.86, y0 + h * 0.05, x0 + w * 0.87, y0 + h * 0.5, x0 + w * 0.86, y0 + h * 0.95], Math.max(1.4, w * 0.26), 0.8);
}

/** a few strokes standing for lettering on a label */
function scribble(ctx: CanvasRenderingContext2D, x0: number, y: number, w: number, rnd: Rand, a = 0.5, rows = 2): void {
  for (let r = 0; r < rows; r++) {
    let x = x0 + rnd.range(0, w * 0.15);
    const yy = y + r * 2.4;
    const end = x0 + w * rnd.range(0.72, 0.98);
    while (x < end - 1.5) {
      const l = rnd.range(1.4, Math.min(6, end - x));
      pen(ctx, x, yy + rnd.range(-0.2, 0.2), x + l, yy + rnd.range(-0.2, 0.2), 0.5, INK, a * rnd.range(0.6, 1), rnd, 0.1);
      x += l + rnd.range(0.8, 1.8);
    }
  }
}

export function tin(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const col = quiet(rnd.pick(TIN_COLS));
  const paper = quiet(rnd.pick(LABELS), 0.12);
  const lab = rnd.range(0.4, 0.62);
  // ink first: the two sides, the foot's curve, the rim's ellipse
  pen(ctx, x, y0 + 1.2, x + rnd.range(-0.2, 0.2), base, 0.6, INK, 0.6, rnd, 0.15);
  pen(ctx, x + w, y0 + 1.2, x + w + rnd.range(-0.2, 0.2), base, 0.6, INK, 0.7, rnd, 0.15);
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, base, w / 2, 1.7, 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
  // the body
  wash(ctx, rectPoly(x + 0.4, y0 + 1.5, x + w - 0.4, base - 0.3, rnd, 0.25), col, 0.88, rnd, 2, 0.015);
  // the label band: paper, a ruled edge, lettering and a little emblem
  const ly0 = y0 + h * (0.5 - lab / 2) + 1;
  const ly1 = ly0 + h * lab;
  wash(ctx, rectPoly(x + 0.5, ly0, x + w - 0.5, ly1, rnd, 0.2), paper, 0.85, rnd, 2, 0.012);
  pen(ctx, x + 0.5, ly0, x + w - 0.5, ly0, 0.4, INK, 0.4, rnd, 0.1);
  pen(ctx, x + 0.5, ly1, x + w - 0.5, ly1, 0.4, INK, 0.4, rnd, 0.1);
  if (w > 9) {
    scribble(ctx, x + w * 0.18, ly0 + (ly1 - ly0) * 0.5, w * 0.62, rnd, 0.5, rnd.chance(0.5) ? 2 : 1);
    if (rnd.chance(0.55)) {
      ctx.fillStyle = rgba(mix(col, INK, 0.2), 0.7);
      ctx.beginPath();
      ctx.arc(x + w * 0.5, ly0 + (ly1 - ly0) * 0.28, Math.min(2.2, w * 0.13), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the rim: silvered tin, lit on the left
  ctx.fillStyle = rgba('#BDB8AA', 0.8);
  ribbon(ctx, [x + 0.4, y0 + 1.6, x + w / 2, y0 + 1.8, x + w - 0.4, y0 + 1.6], 2.2, 0.8);
  ctx.fillStyle = rgba('#EEE8D4', 0.7);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y0 + 1.1, w / 2 - 0.3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  roundShading(ctx, x, y0, w, h, rnd);
}

export function jar(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const fill = quiet(rnd.pick(JAM), 0.2);
  const lidH = Math.max(3, h * 0.13);
  const level = rnd.range(0.62, 0.86);
  const neck = w * 0.08;
  // ink: the glass's outline
  const body: number[] = [x + neck, y0 + lidH, x, y0 + lidH + 2.5, x - 0.2, base - 3, x + 2, base, x + w - 2, base, x + w + 0.2, base - 3, x + w, y0 + lidH + 2.5, x + w - neck, y0 + lidH];
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.55;
  tracePoly(ctx, body);
  ctx.stroke();
  // the glass: a faint cool wash, then the contents
  wash(ctx, body, '#B9CCCF', 0.45, rnd, 2, 0.012);
  const top = base - (base - y0 - lidH) * level;
  const contents = [x + 0.5, top, x + w - 0.5, top, x + w + 0.1, base - 3, x + w - 2, base - 0.4, x + 2, base - 0.4, x - 0.1, base - 3];
  wash(ctx, deform(contents, rnd, 1, 0.01), fill, 0.9, rnd, 2, 0.012);
  ctx.fillStyle = rgba(mix(fill, '#FFFFFF', 0.45), 0.55);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, top, w / 2 - 0.4, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // a paper label, with its lettering
  if (rnd.chance(0.78)) {
    const lh = (base - top) * rnd.range(0.45, 0.7);
    const ly = base - 3.5 - lh;
    wash(ctx, rectPoly(x + w * 0.14, ly, x + w * 0.86, ly + lh, rnd, 0.2), quiet(rnd.pick(LABELS), 0.1), 0.9, rnd, 2, 0.01);
    pen(ctx, x + w * 0.14, ly, x + w * 0.86, ly, 0.4, INK, 0.45, rnd, 0.1);
    pen(ctx, x + w * 0.14, ly + lh, x + w * 0.86, ly + lh, 0.4, INK, 0.45, rnd, 0.1);
    scribble(ctx, x + w * 0.22, ly + lh * 0.4, w * 0.56, rnd, 0.5, lh > 8 ? 2 : 1);
  }
  // the lid: a ring of tin, or a cloth cap tied with string
  const cloth = rnd.chance(0.35);
  const lid = cloth ? mix('#D9C9A0', '#E8DFC4', rnd.next()) : quiet(rnd.pick(['#B88A2A', '#BDB8AA', '#8A8A80', '#A8693A']), 0.2);
  wash(ctx, rectPoly(x + neck - 0.4, y0, x + w - neck + 0.4, y0 + lidH + 0.6, rnd, 0.2), lid, 0.92, rnd, 2, 0.012);
  pen(ctx, x + neck - 0.4, y0 + lidH + 0.6, x + w - neck + 0.4, y0 + lidH + 0.6, 0.45, INK, 0.5, rnd, 0.1);
  pen(ctx, x + neck - 0.4, y0, x + w - neck + 0.4, y0, 0.45, INK, 0.45, rnd, 0.1);
  if (cloth) pen(ctx, x + neck, y0 + lidH * 0.8, x + w - neck, y0 + lidH * 0.8, 0.45, '#7A5A38', 0.7, rnd, 0.1);
  roundShading(ctx, x, y0 + lidH, w, h - lidH, rnd, 0.42, 0.22);
}

export function packet(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const col = quiet(rnd.pick(PACKET_COLS));
  const tilt = rnd.range(-0.025, 0.025);
  ctx.save();
  ctx.translate(x + w / 2, base);
  ctx.rotate(tilt);
  ctx.translate(-(x + w / 2), -base);
  const side = Math.min(3, w * 0.16);
  // ink: the box
  pen(ctx, x, y0, x + w, y0 + rnd.range(-0.3, 0.3), 0.55, INK, 0.55, rnd, 0.15);
  pen(ctx, x, y0, x, base, 0.55, INK, 0.55, rnd, 0.15);
  pen(ctx, x + w, y0, x + w, base, 0.6, INK, 0.65, rnd, 0.15);
  wash(ctx, rectPoly(x + 0.3, y0 + 0.3, x + w - side, base - 0.2, rnd, 0.25), col, 0.9, rnd, 2, 0.012);
  wash(ctx, rectPoly(x + w - side, y0 + 0.3, x + w - 0.3, base - 0.2, rnd, 0.2), mix(col, SHADE, 0.35), 0.9, rnd, 2, 0.01);
  // printed: a band across, a round picture, lettering
  const band = mix(col, rnd.chance(0.5) ? '#F2E8CE' : '#2E2A24', rnd.range(0.55, 0.8));
  const by = y0 + h * rnd.range(0.12, 0.34);
  wash(ctx, rectPoly(x + 0.6, by, x + w - side - 0.3, by + h * rnd.range(0.14, 0.24), rnd, 0.2), band, 0.85, rnd, 2, 0.01);
  if (w > 10) {
    const cy = y0 + h * rnd.range(0.52, 0.66);
    const r = Math.min((w - side) * 0.3, h * 0.16);
    ctx.fillStyle = rgba(rnd.pick(['#F2E8CE', '#E2B04A', '#C9573E', '#8AA05A']), 0.7);
    ctx.beginPath();
    ctx.ellipse(x + (w - side) / 2, cy, r, r * rnd.range(0.8, 1.1), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.4);
    ctx.lineWidth = 0.4;
    ctx.stroke();
    scribble(ctx, x + 1.6, y0 + h * 0.82, w - side - 3, rnd, 0.42, 1);
  }
  // a fold at the top and a crease down the front
  ctx.fillStyle = rgba(LIGHT, 0.32);
  ribbon(ctx, [x + 0.6, y0 + 0.7, x + w * 0.5, y0 + 0.8, x + w - side, y0 + 0.7], 0.9, 0.8);
  ctx.fillStyle = rgba(SHADE, 0.18);
  ribbon(ctx, [x + w * 0.35, y0 + 1, x + w * 0.37, base - 1], 0.6, 0.9);
  ctx.restore();
}

export function sack(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const cloth = quiet(rnd.pick(['#B79B6B', '#C4AE7E', '#A88A5A', '#D2C193']), 0.12);
  const mx = x + w / 2;
  const pinch = w * rnd.range(0.12, 0.2);
  const shoulder = h * rnd.range(0.26, 0.36);
  const poly = [mx - pinch, y0, mx - pinch * 0.8, y0 + shoulder * 0.5, x + w * 0.05, y0 + shoulder * 1.15, x - 0.5, y0 + h * 0.62, x + w * 0.04, base - 2, x + w * 0.2, base, x + w * 0.8, base, x + w * 0.96, base - 2, x + w + 0.5, y0 + h * 0.62, x + w * 0.95, y0 + shoulder * 1.15, mx + pinch * 0.8, y0 + shoulder * 0.5, mx + pinch, y0];
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.6;
  tracePoly(ctx, poly);
  ctx.stroke();
  wash(ctx, poly, cloth, 0.9, rnd, 3, 0.02);
  // weave: short strokes, and the folds that run down from the tie
  for (let i = 0; i < Math.round(w * h * 0.05); i++) {
    const px = rnd.range(x + 2, x + w - 2);
    const py = rnd.range(y0 + shoulder, base - 2);
    ctx.fillStyle = rgba(mix(cloth, '#5A3F20', 0.5), rnd.range(0.08, 0.2));
    ctx.fillRect(px, py, rnd.range(1, 2.6), 0.4);
  }
  ctx.fillStyle = rgba(SHADE, 0.2);
  ribbon(ctx, [mx - 1, y0 + shoulder * 0.7, mx - w * 0.1, y0 + h * 0.5, mx - w * 0.08, base - 2], 1.3, 0.9);
  ctx.fillStyle = rgba(LIGHT, 0.3);
  ribbon(ctx, [x + w * 0.2, y0 + shoulder * 1.2, x + w * 0.16, y0 + h * 0.6, x + w * 0.22, base - 3], 2, 0.9);
  ctx.fillStyle = rgba(SHADE, 0.3);
  ribbon(ctx, [x + w * 0.9, y0 + shoulder * 1.2, x + w * 0.94, y0 + h * 0.6, x + w * 0.88, base - 3], 2.6, 0.9);
  // a stamped mark
  if (rnd.chance(0.7)) {
    const sy = y0 + h * rnd.range(0.5, 0.66);
    ctx.fillStyle = rgba(rnd.pick(['#7A2E26', '#2E3F5A', '#3A3A2A']), 0.4);
    tracePoly(ctx, deform(rectPoly(mx - w * 0.22, sy, mx + w * 0.22, sy + h * 0.16, rnd, 0.2), rnd, 1, 0.05));
    ctx.fill();
  }
  // the tie
  pen(ctx, mx - pinch, y0 + 1.5, mx + pinch, y0 + 2.2, 0.8, '#6B4A2A', 0.75, rnd, 0.1);
  wash(ctx, [mx - pinch - 0.5, y0, mx - pinch * 2, y0 - 2.5, mx - pinch * 0.4, y0 - 1.6, mx, y0 - 3.4, mx + pinch * 0.6, y0 - 1.6, mx + pinch * 2, y0 - 2.8, mx + pinch + 0.5, y0], cloth, 0.9, rnd, 2, 0.04);
}

export function bottle(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const glass = rnd.pick(['#4C7A55', '#7A4A2A', '#5A7F8C', '#8A8A3A', '#6A4A5A']);
  const col = quiet(glass, 0.18);
  const mx = x + w / 2;
  const nw = w * rnd.range(0.26, 0.34);
  const sh = h * rnd.range(0.4, 0.5);
  const poly = [mx - nw / 2, y0 + 3, mx - nw / 2, y0 + sh * 0.55, x + w * 0.06, y0 + sh, x, y0 + sh + 3, x, base - 1.5, x + 1.5, base, x + w - 1.5, base, x + w, base - 1.5, x + w, y0 + sh + 3, x + w * 0.94, y0 + sh, mx + nw / 2, y0 + sh * 0.55, mx + nw / 2, y0 + 3];
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.55;
  tracePoly(ctx, poly);
  ctx.stroke();
  wash(ctx, poly, col, 0.82, rnd, 3, 0.012);
  // the liquid's line, and a label
  const lv = y0 + sh * rnd.range(0.35, 0.8);
  ctx.fillStyle = rgba(mix(col, INK, 0.3), 0.3);
  ctx.fillRect(x + 0.8, lv, w - 1.6, base - lv - 1);
  if (rnd.chance(0.8)) {
    const ly = y0 + sh + (base - y0 - sh) * 0.2;
    const lh = (base - y0 - sh) * rnd.range(0.4, 0.55);
    wash(ctx, rectPoly(x + 0.5, ly, x + w - 0.5, ly + lh, rnd, 0.2), quiet(rnd.pick(LABELS), 0.1), 0.9, rnd, 2, 0.01);
    scribble(ctx, x + w * 0.2, ly + lh * 0.4, w * 0.6, rnd, 0.5, 1);
  }
  // the cork or the cap
  wash(ctx, rectPoly(mx - nw / 2 - 0.2, y0, mx + nw / 2 + 0.2, y0 + 3.4, rnd, 0.15), rnd.chance(0.5) ? '#B08A58' : quiet('#B5483A', 0.1), 0.95, rnd, 2, 0.01);
  pen(ctx, mx - nw / 2, y0, mx + nw / 2, y0, 0.45, INK, 0.5, rnd, 0.08);
  roundShading(ctx, x, y0 + sh * 0.6, w, h - sh * 0.6, rnd, 0.5, 0.25);
}

/** a small open crate on a shelf (of onions, say), or a stack of three tins: bigger things that fill a gap */
export function crateOfThings(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h * 0.55;
  const wood = rnd.pick(['#A8794A', '#B58B58', '#98683C']);
  const kind = rnd.pick(['#C9A04A', '#A8693A', '#8A9A4A', '#B5483A']);
  // the produce, heaped
  for (let i = 0; i < Math.round(w / 4.2); i++) {
    const px = x + 2.5 + (i / Math.max(1, Math.round(w / 4.2) - 1)) * (w - 5) + rnd.range(-1, 1);
    const r = rnd.range(2.3, 3.6);
    const py = y0 - rnd.range(0.5, h * 0.4);
    ctx.fillStyle = rgba(quiet(mix(kind, '#FFFFFF', rnd.range(0, 0.15)), 0.18), 0.9);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.35);
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.fillStyle = rgba(LIGHT, 0.35);
    ctx.beginPath();
    ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  pen(ctx, x, y0, x, base, 0.55, INK, 0.6, rnd, 0.15);
  pen(ctx, x + w, y0, x + w, base, 0.55, INK, 0.65, rnd, 0.15);
  const slats = 2;
  for (let s = 0; s < slats; s++) {
    const sy0 = y0 + ((base - y0) / slats) * s;
    const sy1 = y0 + ((base - y0) / slats) * (s + 1) - 0.8;
    wash(ctx, rectPoly(x, sy0, x + w, sy1, rnd, 0.25), quiet(wood, 0.15), 0.9, rnd, 2, 0.012);
    pen(ctx, x, sy1, x + w, sy1, 0.5, INK, 0.5, rnd, 0.2);
    pen(ctx, x, sy0, x + w, sy0, 0.45, INK, 0.45, rnd, 0.2);
    ctx.fillStyle = rgba(LIGHT, 0.26);
    ribbon(ctx, [x + 0.8, sy0 + 0.6, x + w - 1, sy0 + 0.6], 0.7, 0.9);
  }
}

/** the pieces of a foreground crate's produce */
export function apple(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: Rand): void {
  const base = rnd.pick(['#C0392B', '#B8402F', '#CF4B34', '#9DB24A', '#D8A83A', '#B5493A']);
  const poly = deform(blobPoly(x, y, r, r * 0.92, rnd, 12, 0.06), rnd, 2, 0.02);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.6;
  tracePoly(ctx, poly);
  ctx.stroke();
  wash(ctx, poly, base, 0.9, rnd, 3, 0.012);
  ctx.fillStyle = rgba(mix(base, '#F2D8A0', 0.5), 0.5);
  tracePoly(ctx, deform(blobPoly(x - r * 0.2, y - r * 0.28, r * 0.55, r * 0.45, rnd, 8, 0.1), rnd, 1, 0.05));
  ctx.fill();
  ctx.fillStyle = rgba(mix(base, SHADE, 0.5), 0.45);
  ribbon(ctx, [x + r * 0.55, y - r * 0.5, x + r * 0.78, y, x + r * 0.5, y + r * 0.65], r * 0.42, 0.8);
  ctx.fillStyle = rgba('#FFF6E0', 0.75);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.42, y - r * 0.5, r * 0.14, r * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();
  pen(ctx, x, y - r * 0.82, x + r * 0.1, y - r * 1.25, 0.6, '#5A3A22', 0.8, rnd, 0.05);
}

export function potato(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: Rand): void {
  const base = rnd.pick(['#B89462', '#A8844F', '#C4A06A', '#AD8A5A']);
  const poly = deform(blobPoly(x, y, r * 1.25, r * 0.88, rnd, 11, 0.08), rnd, 2, 0.04);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.6;
  tracePoly(ctx, poly);
  ctx.stroke();
  wash(ctx, poly, base, 0.92, rnd, 3, 0.015);
  ctx.fillStyle = rgba('#F2DDB0', 0.4);
  tracePoly(ctx, deform(blobPoly(x - r * 0.35, y - r * 0.3, r * 0.6, r * 0.32, rnd, 8, 0.12), rnd, 1, 0.06));
  ctx.fill();
  ctx.fillStyle = rgba('#5A3A1E', 0.4);
  ribbon(ctx, [x + r * 0.6, y - r * 0.3, x + r * 0.85, y + r * 0.1, x + r * 0.5, y + r * 0.6], r * 0.4, 0.8);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = rgba('#4A3018', rnd.range(0.3, 0.55));
    ctx.beginPath();
    ctx.arc(x + rnd.range(-r, r), y + rnd.range(-r * 0.5, r * 0.6), rnd.range(0.3, 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** a head of greens: layered leaves with their ribs */
export function greens(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: Rand): void {
  const g0 = rnd.pick(['#5F8F3F', '#7AA64A', '#4E8A4A', '#8DB35A']);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55 + rnd.range(-0.12, 0.12);
    const len = r * rnd.range(0.95, 1.4);
    const cx = x + Math.cos(a) * len * 0.5;
    const cy = y + Math.sin(a) * len * 0.5 - r * 0.15;
    const poly = deform(blobPoly(cx, cy, len * 0.5, len * 0.32, rnd, 10, 0.06), rnd, 1, 0.03);
    // orient the leaf outward
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rot = poly.map((v, k) => (k % 2 === 0 ? cx + (v - cx) * c - (poly[k + 1]! - cy) * s : cy + (poly[k - 1]! - cx) * s + (v - cy) * c));
    ctx.strokeStyle = rgba(INK, 0.45);
    ctx.lineWidth = 0.55;
    tracePoly(ctx, rot);
    ctx.stroke();
    wash(ctx, rot, mix(g0, i % 2 ? '#C9D88A' : '#2E5F3A', rnd.range(0.05, 0.4)), 0.9, rnd, 2, 0.02);
    ctx.strokeStyle = rgba('#EAF2C8', 0.5);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len - r * 0.3);
    ctx.stroke();
  }
}
