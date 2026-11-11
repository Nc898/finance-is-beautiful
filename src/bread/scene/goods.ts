/**
 * The things on the shelves: tins, jars, packets, sacks, bottles and small crates, each painted as ink under a few
 * washes (a pen outline first, the colour glazed over it, a lit stripe on the left and a shaded one on the right,
 * the label stated with a few strokes and not read). Every one is its own: sizes, colours, liveries, tilt and gaps are
 * drawn from the generator. Solid things are opaque (only the glass lets the shelf show through); the room's glaze
 * (light.ts) keeps the shelves a value or two quieter than the counter and the board. Also used by the foreground
 * crates' produce (apples, potatoes, greens).
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

/** a solid body: one opaque fill first (a tin or a packet is not glass), then the washes over it for the edge */
function solid(ctx: CanvasRenderingContext2D, poly: number[], col: string, rnd: Rand, layers = 2): void {
  ctx.fillStyle = col;
  tracePoly(ctx, poly);
  ctx.fill();
  wash(ctx, poly, col, 0.6, rnd, layers, 0.012);
}

/** printed stripes across a label (a maker's livery), clipped by the caller */
function stripes(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, n: number, rnd: Rand): void {
  const h = (y1 - y0) / (n * 2 + 1);
  for (let i = 0; i < n; i++) {
    const y = y0 + h * (1 + i * 2);
    ctx.fillStyle = rgba(col, rnd.range(0.75, 0.95));
    ctx.fillRect(x0, y, x1 - x0, h * rnd.range(0.7, 1.1));
  }
}

/**
 * A tin, one of several liveries: a paper band round a coloured tin with an emblem; a full printed wrap with a band at
 * top and foot and a white oval (a fruit or a fish on it, as a dab); bare tinplate with a paper slip; or stripes.
 * Ink first at the sides and the foot, the rim's ellipse silvered, lit on the left and shaded on the right.
 */
export function tin(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const col = quiet(rnd.pick(TIN_COLS), 0.12);
  const style = rnd.pick(['band', 'band', 'wrap', 'wrap', 'bare', 'stripes'] as const);
  const body = rectPoly(x + 0.3, y0 + 1.5, x + w - 0.3, base - 0.3, rnd, 0.2);
  pen(ctx, x, y0 + 1.2, x + rnd.range(-0.2, 0.2), base, 0.55, INK, 0.5, rnd, 0.15);
  if (style === 'bare') solid(ctx, body, '#A8A498', rnd);
  else solid(ctx, body, col, rnd);
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  if (style === 'band') {
    const lab = rnd.range(0.4, 0.62);
    const ly0 = y0 + h * (0.5 - lab / 2) + 1;
    const ly1 = ly0 + h * lab;
    const paper = rnd.pick(LABELS);
    ctx.fillStyle = paper;
    ctx.fillRect(x, ly0, w, ly1 - ly0);
    pen(ctx, x, ly0, x + w, ly0, 0.35, mix(col, INK, 0.3), 0.6, rnd, 0.05);
    pen(ctx, x, ly1, x + w, ly1, 0.35, mix(col, INK, 0.3), 0.6, rnd, 0.05);
    if (w > 9) {
      ctx.fillStyle = rgba(mix(col, '#FFFFFF', 0.1), 0.85);
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, ly0 + (ly1 - ly0) * 0.36, Math.min(2.6, w * 0.16), Math.min(2.2, (ly1 - ly0) * 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      scribble(ctx, x + w * 0.2, ly0 + (ly1 - ly0) * 0.72, w * 0.6, rnd, 0.45, 1);
    }
  } else if (style === 'wrap') {
    const band = rnd.pick(['#F0E6CC', '#2A2A30', '#C9A04A', '#E8D8B0']);
    ctx.fillStyle = rgba(band, 0.92);
    ctx.fillRect(x, y0 + 1.5, w, h * 0.16);
    ctx.fillRect(x, base - h * 0.14, w, h * 0.14);
    if (w > 9) {
      ctx.fillStyle = rgba('#F4EEDC', 0.92);
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y0 + h * 0.55, w * 0.32, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(rnd.pick(['#C9402E', '#E0A030', '#6E9A3C', '#D86A3A', '#8A5A9A']), 0.85);
      ctx.beginPath();
      ctx.arc(x + w * 0.5 + rnd.range(-1, 1), y0 + h * 0.55, Math.min(w * 0.14, h * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'bare') {
    const slip = rnd.pick(LABELS);
    ctx.fillStyle = slip;
    ctx.fillRect(x + w * 0.15, y0 + h * 0.35, w * 0.7, h * 0.3);
    scribble(ctx, x + w * 0.22, y0 + h * 0.5, w * 0.56, rnd, 0.5, 1);
    for (let k = 1; k < 3; k++) {
      ctx.fillStyle = rgba('#5A5650', 0.3);
      ctx.fillRect(x, y0 + h * (k / 3), w, 0.5);
    }
  } else {
    stripes(ctx, x, y0 + 1.5, x + w, base, mix(col, rnd.chance(0.5) ? '#F2E8CE' : '#20181A', 0.7), rnd.int(2, 4), rnd);
  }
  ctx.restore();
  // the rim: silvered tin, lit on the left
  ctx.fillStyle = rgba('#B8B2A2', 0.95);
  ribbon(ctx, [x + 0.4, y0 + 1.6, x + w / 2, y0 + 1.8, x + w - 0.4, y0 + 1.6], 2.2, 0.8);
  ctx.fillStyle = rgba('#E8E2CE', 0.85);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y0 + 1.1, w / 2 - 0.3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.45;
  ctx.stroke();
  roundShading(ctx, x, y0, w, h, rnd);
  pen(ctx, x + w, y0 + 1.2, x + w + rnd.range(-0.2, 0.2), base, 0.6, INK, 0.65, rnd, 0.15);
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, base, w / 2, 1.5, 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
}

export function jar(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const fill = quiet(rnd.pick(JAM), 0.08);
  const lidH = Math.max(3, h * 0.13);
  const level = rnd.range(0.62, 0.9);
  const neck = w * 0.08;
  const body: number[] = [x + neck, y0 + lidH, x, y0 + lidH + 2.5, x - 0.2, base - 3, x + 2, base, x + w - 2, base, x + w + 0.2, base - 3, x + w, y0 + lidH + 2.5, x + w - neck, y0 + lidH];
  // the glass: barely there, a breath of cool over the shelf's back
  ctx.fillStyle = rgba('#C8D8DA', 0.14);
  tracePoly(ctx, body);
  ctx.fill();
  // the contents: opaque, the colour deepest at the sides where the glass is thickest
  const top = base - (base - y0 - lidH) * level;
  const contents = [x + 0.5, top, x + w - 0.5, top, x + w + 0.1, base - 3, x + w - 2, base - 0.4, x + 2, base - 0.4, x - 0.1, base - 3];
  solid(ctx, deform(contents, rnd, 1, 0.01), fill, rnd);
  ctx.save();
  tracePoly(ctx, contents);
  ctx.clip();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, rgba(mix(fill, '#FFFFFF', 0.25), 0.4));
  g.addColorStop(0.4, 'rgba(0,0,0,0)');
  g.addColorStop(1, rgba(mix(fill, '#100808', 0.5), 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(x, top, w, base - top);
  // seeds, fruit, a pickle's shape: a few darker dabs in the preserve
  for (let i = 0; i < Math.round(w * 0.5); i++) {
    ctx.fillStyle = rgba(mix(fill, '#100808', 0.4), rnd.range(0.2, 0.45));
    ctx.beginPath();
    ctx.ellipse(rnd.range(x + 1, x + w - 1), rnd.range(top + 2, base - 2), rnd.range(0.5, 1.6), rnd.range(0.5, 1.2), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = rgba(mix(fill, '#FFFFFF', 0.35), 0.6);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, top, w / 2 - 0.4, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // a paper label, with its lettering, or a printed one
  if (rnd.chance(0.7)) {
    const lh = (base - top) * rnd.range(0.4, 0.62);
    const ly = base - 3.5 - lh;
    const printed = rnd.chance(0.4);
    const paper = printed ? rnd.pick(['#F2E8CE', '#E8D8A8', '#D8E0D0']) : rnd.pick(LABELS);
    ctx.fillStyle = paper;
    tracePoly(ctx, rectPoly(x + w * 0.14, ly, x + w * 0.86, ly + lh, rnd, 0.15));
    ctx.fill();
    if (printed) {
      ctx.fillStyle = rgba(rnd.pick(['#B5483A', '#2E5A8A', '#3E6A3A']), 0.85);
      ctx.fillRect(x + w * 0.14, ly, w * 0.72, lh * 0.22);
    }
    scribble(ctx, x + w * 0.22, ly + lh * 0.55, w * 0.56, rnd, 0.5, lh > 8 ? 2 : 1);
  }
  // the lid: a ring of tin, or a cloth cap tied with string
  const cloth = rnd.chance(0.35);
  const lid = cloth ? rnd.pick(['#D9C9A0', '#E8DFC4', '#C9A0A0', '#B8C8D8']) : rnd.pick(['#B88A2A', '#BDB8AA', '#8A8A80', '#A8693A', '#C8C0A8']);
  solid(ctx, rectPoly(x + neck - 0.4, y0, x + w - neck + 0.4, y0 + lidH + 0.6, rnd, 0.2), lid, rnd);
  if (cloth) {
    // the cloth's skirt over the neck, a gingham check now and then
    ctx.fillStyle = rgba(lid, 0.95);
    tracePoly(ctx, [x + neck - 1.2, y0 + lidH * 0.4, x + w - neck + 1.2, y0 + lidH * 0.4, x + w - neck + 1.8, y0 + lidH + 2.2, x + neck - 1.8, y0 + lidH + 2.2]);
    ctx.fill();
    pen(ctx, x + neck - 0.5, y0 + lidH + 0.4, x + w - neck + 0.5, y0 + lidH + 0.4, 0.45, '#7A5A38', 0.8, rnd, 0.1);
  }
  pen(ctx, x + neck - 0.4, y0, x + w - neck + 0.4, y0, 0.4, INK, 0.45, rnd, 0.1);
  // the glass's own light: a bright streak on the left, a dark edge on the right, the outline stated where it turns
  ctx.fillStyle = rgba('#FFFFFF', 0.38);
  ribbon(ctx, [x + w * 0.2, y0 + lidH + 3, x + w * 0.18, base - 3], Math.max(0.8, w * 0.08), 0.8);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + w, y0 + lidH + 2.5);
  ctx.lineTo(x + w + 0.2, base - 3);
  ctx.lineTo(x + w - 2, base);
  ctx.lineTo(x + 2, base);
  ctx.stroke();
  ctx.fillStyle = rgba(SHADE, 0.22);
  ribbon(ctx, [x + w * 0.86, y0 + lidH + 3, x + w * 0.87, base - 2], Math.max(1.2, w * 0.2), 0.8);
}

/**
 * A packet: a carton in one of a few printed designs (a band and a round picture; a diagonal sash; a tall panel with a
 * window; a two-colour split), its side turned into shade, a fold lit at the top.
 */
export function packet(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const col = quiet(rnd.pick(PACKET_COLS), 0.1);
  const tilt = rnd.range(-0.025, 0.025);
  const style = rnd.pick(['band', 'sash', 'panel', 'split'] as const);
  ctx.save();
  ctx.translate(x + w / 2, base);
  ctx.rotate(tilt);
  ctx.translate(-(x + w / 2), -base);
  const side = Math.min(3, w * 0.16);
  const front = rectPoly(x + 0.3, y0 + 0.3, x + w - side, base - 0.2, rnd, 0.2);
  solid(ctx, front, col, rnd);
  solid(ctx, rectPoly(x + w - side, y0 + 0.3, x + w - 0.3, base - 0.2, rnd, 0.2), mix(col, SHADE, 0.4), rnd, 1);
  const fx1 = x + w - side;
  ctx.save();
  tracePoly(ctx, front);
  ctx.clip();
  const accent = rnd.pick(['#F2E8CE', '#2E2A24', '#C9A04A', '#B5483A', '#2E4A72']);
  if (style === 'band') {
    const by = y0 + h * rnd.range(0.12, 0.3);
    ctx.fillStyle = rgba(accent, 0.88);
    ctx.fillRect(x, by, w, h * rnd.range(0.14, 0.22));
    if (w > 10) {
      const cy = y0 + h * rnd.range(0.56, 0.68);
      const r = Math.min((w - side) * 0.3, h * 0.16);
      ctx.fillStyle = rgba(rnd.pick(['#F2E8CE', '#E2B04A', '#C9573E', '#8AA05A']), 0.85);
      ctx.beginPath();
      ctx.ellipse(x + (w - side) / 2, cy, r, r * rnd.range(0.8, 1.1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(INK, 0.35);
      ctx.lineWidth = 0.35;
      ctx.stroke();
    }
  } else if (style === 'sash') {
    ctx.fillStyle = rgba(accent, 0.85);
    tracePoly(ctx, [x - 2, y0 + h * 0.62, fx1 + 2, y0 + h * 0.3, fx1 + 2, y0 + h * 0.46, x - 2, y0 + h * 0.78]);
    ctx.fill();
  } else if (style === 'panel') {
    ctx.fillStyle = rgba(mix(accent, '#FFFFFF', 0.2), 0.85);
    ctx.fillRect(x + (fx1 - x) * 0.18, y0 + h * 0.2, (fx1 - x) * 0.64, h * 0.5);
    ctx.fillStyle = rgba(mix(col, '#FFFFFF', 0.5), 0.8);
    ctx.fillRect(x + (fx1 - x) * 0.3, y0 + h * 0.32, (fx1 - x) * 0.4, h * 0.2);
  } else {
    ctx.fillStyle = rgba(accent, 0.85);
    ctx.fillRect(x, y0 + h * 0.5, w, h * 0.5);
  }
  if (w > 10) scribble(ctx, x + 1.6, y0 + h * 0.86, w - side - 3, rnd, 0.42, 1);
  ctx.restore();
  // ink: the box, heavier on the shaded side
  pen(ctx, x, y0, x + w, y0 + rnd.range(-0.3, 0.3), 0.5, INK, 0.5, rnd, 0.15);
  pen(ctx, x, y0, x, base, 0.5, INK, 0.45, rnd, 0.15);
  pen(ctx, x + w, y0, x + w, base, 0.6, INK, 0.65, rnd, 0.15);
  pen(ctx, x + w - side, y0 + 0.5, x + w - side, base, 0.35, INK, 0.4, rnd, 0.1);
  // a fold at the top and a crease down the front
  ctx.fillStyle = rgba(LIGHT, 0.3);
  ribbon(ctx, [x + 0.6, y0 + 0.7, x + w * 0.5, y0 + 0.8, x + w - side, y0 + 0.7], 0.9, 0.8);
  ctx.fillStyle = rgba(SHADE, 0.16);
  ribbon(ctx, [x + w * 0.35, y0 + 1, x + w * 0.37, base - 1], 0.6, 0.9);
  ctx.restore();
}

export function sack(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const cloth = quiet(rnd.pick(['#A88A5A', '#B49866', '#98784C', '#C2A878']), 0.06);
  const mx = x + w / 2;
  const pinch = w * rnd.range(0.12, 0.2);
  const shoulder = h * rnd.range(0.26, 0.36);
  const poly = [mx - pinch, y0, mx - pinch * 0.8, y0 + shoulder * 0.5, x + w * 0.05, y0 + shoulder * 1.15, x - 0.5, y0 + h * 0.62, x + w * 0.04, base - 2, x + w * 0.2, base, x + w * 0.8, base, x + w * 0.96, base - 2, x + w + 0.5, y0 + h * 0.62, x + w * 0.95, y0 + shoulder * 1.15, mx + pinch * 0.8, y0 + shoulder * 0.5, mx + pinch, y0];
  solid(ctx, poly, cloth, rnd, 3);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // the weave: a fine cross-hatch, and the folds that run down from the tie
  for (let yy = y0; yy < base; yy += 1.3) {
    ctx.fillStyle = rgba('#4A3418', 0.12);
    ctx.fillRect(x - 1, yy, w + 2, 0.3);
  }
  for (let xx = x; xx < x + w; xx += 1.3) {
    ctx.fillStyle = rgba('#4A3418', 0.08);
    ctx.fillRect(xx, y0, 0.3, h);
  }
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(255,236,200,0.25)');
  g.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(40,24,20,0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y0, w, h);
  ctx.restore();
  ctx.fillStyle = rgba(SHADE, 0.24);
  ribbon(ctx, [mx - 1, y0 + shoulder * 0.7, mx - w * 0.1, y0 + h * 0.5, mx - w * 0.08, base - 2], 1.3, 0.9);
  // a stamped mark: a ring and a bar
  if (rnd.chance(0.75)) {
    const sy = y0 + h * rnd.range(0.52, 0.64);
    const mark = rnd.pick(['#7A2E26', '#2E3F5A', '#3A3A2A']);
    ctx.strokeStyle = rgba(mark, 0.45);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(mx, sy, w * 0.18, h * 0.09, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = rgba(mark, 0.4);
    ctx.fillRect(mx - w * 0.22, sy + h * 0.13, w * 0.44, 1);
  }
  // the tie
  pen(ctx, mx - pinch, y0 + 1.5, mx + pinch, y0 + 2.2, 0.8, '#6B4A2A', 0.75, rnd, 0.1);
  solid(ctx, [mx - pinch - 0.5, y0, mx - pinch * 2, y0 - 2.5, mx - pinch * 0.4, y0 - 1.6, mx, y0 - 3.4, mx + pinch * 0.6, y0 - 1.6, mx + pinch * 2, y0 - 2.8, mx + pinch + 0.5, y0], cloth, rnd);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(poly[18]!, poly[19]!);
  for (let k = 10; k <= 16; k++) ctx.lineTo(poly[(k * 2) % poly.length]!, poly[(k * 2 + 1) % poly.length]!);
  ctx.stroke();
}

export function bottle(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, rnd: Rand): void {
  const y0 = base - h;
  const glass = rnd.pick(['#3E6A48', '#6A3E22', '#4A6F7C', '#7A7A30', '#5A3A4A', '#2E4A3A']);
  const col = quiet(glass, 0.08);
  const mx = x + w / 2;
  const nw = w * rnd.range(0.26, 0.34);
  const sh = h * rnd.range(0.4, 0.5);
  const poly = [mx - nw / 2, y0 + 3, mx - nw / 2, y0 + sh * 0.55, x + w * 0.06, y0 + sh, x, y0 + sh + 3, x, base - 1.5, x + 1.5, base, x + w - 1.5, base, x + w, base - 1.5, x + w, y0 + sh + 3, x + w * 0.94, y0 + sh, mx + nw / 2, y0 + sh * 0.55, mx + nw / 2, y0 + 3];
  solid(ctx, poly, col, rnd, 3);
  // the liquid's line, and a label
  const lv = y0 + sh * rnd.range(0.35, 0.8);
  ctx.fillStyle = rgba(mix(col, INK, 0.4), 0.35);
  ctx.fillRect(x + 0.8, lv, w - 1.6, base - lv - 1);
  if (rnd.chance(0.8)) {
    const ly = y0 + sh + (base - y0 - sh) * 0.2;
    const lh = (base - y0 - sh) * rnd.range(0.4, 0.55);
    ctx.fillStyle = rnd.pick(LABELS);
    tracePoly(ctx, rectPoly(x + 0.5, ly, x + w - 0.5, ly + lh, rnd, 0.15));
    ctx.fill();
    if (rnd.chance(0.5)) {
      ctx.fillStyle = rgba(rnd.pick(['#B5483A', '#2E4A72', '#C9A04A']), 0.8);
      ctx.fillRect(x + 0.5, ly + lh * 0.7, w - 1, lh * 0.18);
    }
    scribble(ctx, x + w * 0.2, ly + lh * 0.4, w * 0.6, rnd, 0.5, 1);
  }
  // the cork or the cap
  solid(ctx, rectPoly(mx - nw / 2 - 0.2, y0, mx + nw / 2 + 0.2, y0 + 3.4, rnd, 0.15), rnd.chance(0.5) ? '#B08A58' : '#A84A3A', rnd);
  pen(ctx, mx - nw / 2, y0, mx + nw / 2, y0, 0.45, INK, 0.5, rnd, 0.08);
  // glass: a long bright streak on the left of the shoulder and body
  ctx.fillStyle = rgba('#FFFFFF', 0.42);
  ribbon(ctx, [x + w * 0.22, y0 + sh + 2, x + w * 0.2, base - 2], Math.max(0.7, w * 0.1), 0.8);
  ctx.fillStyle = rgba('#FFFFFF', 0.3);
  ribbon(ctx, [mx - nw * 0.25, y0 + 4, mx - nw * 0.25, y0 + sh * 0.5], 0.5, 0.8);
  ctx.fillStyle = rgba(SHADE, 0.3);
  ribbon(ctx, [x + w * 0.86, y0 + sh + 2, x + w * 0.87, base - 2], Math.max(1.2, w * 0.2), 0.8);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(poly[20]!, poly[21]!);
  ctx.lineTo(poly[16]!, poly[17]!);
  ctx.lineTo(poly[14]!, poly[15]!);
  ctx.lineTo(poly[12]!, poly[13]!);
  ctx.lineTo(poly[10]!, poly[11]!);
  ctx.stroke();
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
