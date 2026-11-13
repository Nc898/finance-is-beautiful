/**
 * The produce stands on the shop floor (PRODUCE_STANDS in geom.ts), one at each side of the counter: wooden stepped
 * stands, three slightly tilted trays facing us on short legs, each tray holding heaps, a wicker basket or an open
 * crate of fresh produce, with price cards on sticks and tucked into the lips. Painted once per size as sprites on
 * transparent paper, as the foreground crates are: ink first, then the washes, lit from the upper left and glazed
 * with the room's light (light.ts) a little quieter than the counter, so the eye still goes to the basket and the
 * board. Every fruit is shaped and coloured on its own (seeded); heaps are built row on row, narrowing as they rise,
 * never laid on a grid.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { PRODUCE_STANDS, type ProduceStand } from './geom';
import { INK, LIGHT, SHADE, blobPoly, grain, mix, pen, plank, rectPoly, ribbon, spriteCtx, wash } from './paint';
import { potato } from './goods';
import { glazeSprite } from './light';
import type { Sprite } from './counter';

/** the tone the produce is pulled toward, as the shelf goods are (a value or two quieter than the counter's) */
const QUIET = '#A8926C';
const quiet = (hex: string, t = 0.1): string => mix(hex, QUIET, t);

type Draw = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: Rand) => void;

/* ------------------------------------------------------------------ fruit and veg */

/** a closed shape from a radius profile: scale(theta) multiplies the radius, a hand's wobble is added */
function shapePoly(rx: number, ry: number, rnd: Rand, scale: (a: number) => number, n = 20): number[] {
  const out: number[] = [];
  const lobe = rnd.range(0, 0.05);
  const ph = rnd.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = scale(a) * (1 + lobe * Math.sin(2 * a + ph) + rnd.range(-0.02, 0.02));
    out.push(Math.cos(a) * rx * s, Math.sin(a) * ry * s);
  }
  return deform(out, rnd, 1, 0.012);
}

const bump = (a: number, at: number, w: number): number => {
  let d = a - at;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.exp(-((d / w) ** 2));
};

/**
 * The body of a round thing in the local frame (origin at its centre): an opaque fill, a wash over it, a second colour
 * drifting in, light on the upper left and shade on the lower right, then the ink (a broken outline, firmer below).
 */
function body(ctx: CanvasRenderingContext2D, poly: number[], rx: number, ry: number, base: string, alt: string, rnd: Rand, o: { lit?: number; shade?: number; ink?: number } = {}): void {
  const b = quiet(base);
  ctx.fillStyle = b;
  tracePoly(ctx, poly);
  ctx.fill();
  wash(ctx, poly, b, 0.7, rnd, 2, 0.01);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = rgba(quiet(alt), rnd.range(0.2, 0.42));
    tracePoly(ctx, deform(blobPoly(rnd.range(-rx, rx) * 0.5, rnd.range(-ry, ry) * 0.5, rx * rnd.range(0.4, 0.7), ry * rnd.range(0.35, 0.6), rnd, 9, 0.2), rnd, 1, 0.08));
    ctx.fill();
  }
  const lg = ctx.createRadialGradient(-rx * 0.4, -ry * 0.45, 0, -rx * 0.4, -ry * 0.45, Math.max(rx, ry) * 1.1);
  lg.addColorStop(0, rgba(LIGHT, o.lit ?? 0.42));
  lg.addColorStop(1, rgba(LIGHT, 0));
  ctx.fillStyle = lg;
  ctx.fillRect(-rx * 1.5, -ry * 1.5, rx * 3, ry * 3);
  const sg = ctx.createRadialGradient(-rx * 0.3, -ry * 0.35, 0, -rx * 0.3, -ry * 0.35, Math.max(rx, ry) * 1.55);
  sg.addColorStop(0, rgba(SHADE, 0));
  sg.addColorStop(0.55, rgba(SHADE, 0));
  sg.addColorStop(1, rgba(mix(base, SHADE, 0.55), o.shade ?? 0.5));
  ctx.fillStyle = sg;
  ctx.fillRect(-rx * 1.5, -ry * 1.5, rx * 3, ry * 3);
  ctx.restore();
  ctx.strokeStyle = rgba(INK, (o.ink ?? 0.5) * 0.7);
  ctx.lineWidth = 0.5;
  tracePoly(ctx, poly);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, (o.ink ?? 0.5) * 0.85);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.98, ry * 0.98, 0, -0.15, Math.PI * 0.92);
  ctx.stroke();
}

/** draw in a frame at (x, y) turned by rot */
function placed(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, fn: () => void): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  fn();
  ctx.restore();
}

const glint = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.7): void => {
  ctx.fillStyle = rgba('#FFF6E0', a);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.6, 0, Math.PI * 2);
  ctx.fill();
};

function leafDab(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, col: string, rnd: Rand): void {
  const poly = deform(blobPoly(0, 0, len, len * 0.38, rnd, 8, 0.1), rnd, 1, 0.03);
  placed(ctx, x, y, ang, () => {
    ctx.strokeStyle = rgba(INK, 0.4);
    ctx.lineWidth = 0.4;
    tracePoly(ctx, poly);
    ctx.stroke();
    ctx.fillStyle = col;
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.strokeStyle = rgba('#DDEBB0', 0.55);
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-len * 0.8, 0);
    ctx.lineTo(len * 0.8, 0);
    ctx.stroke();
  });
}

const RED_APPLES = ['#BE3B2C', '#B2392E', '#C94A34', '#A93028', '#CF5538'];
const GREEN_APPLES = ['#97AE4A', '#A6B84E', '#8AA444', '#B4B95A', '#9CB052'];

function appleOf(cols: readonly string[], streak: string): Draw {
  return (ctx, x, y, r, rnd) => {
    const base = rnd.pick(cols);
    const rx = r * rnd.range(0.96, 1.06);
    const ry = r * rnd.range(0.86, 0.95);
    placed(ctx, x, y, rnd.range(-0.35, 0.35), () => {
      const poly = shapePoly(rx, ry, rnd, (a) => (1 - 0.15 * bump(a, -Math.PI / 2, 0.38) - 0.05 * bump(a, Math.PI / 2, 0.5)) * (1 - 0.07 * Math.max(0, Math.sin(a))));
      body(ctx, poly, rx, ry, base, rnd.chance(0.55) ? '#E0B84A' : '#7A1E22', rnd);
      // streaks: meridians of the other colour running from the stalk down
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      for (let k = 0; k < rnd.int(2, 4); k++) {
        const off = rnd.range(-0.7, 0.7) * rx;
        ctx.fillStyle = rgba(quiet(streak), rnd.range(0.14, 0.3));
        ribbon(ctx, [off * 0.5, -ry * 0.8, off, -ry * 0.1, off * 1.1, ry * 0.7], rnd.range(0.7, 1.5), 0.9);
      }
      ctx.restore();
      glint(ctx, -rx * 0.42, -ry * 0.5, rx * 0.16, ry * 0.1);
      if (rnd.chance(0.8)) {
        pen(ctx, 0, -ry * 0.62, rnd.range(-0.8, 1.6), -ry * 1.2, 0.55, '#5A3A22', 0.85, rnd, 0.05);
        if (rnd.chance(0.25)) leafDab(ctx, 2.2, -ry * 1.1, -0.5, r * 0.34, '#6F9A3E', rnd);
      } else {
        ctx.fillStyle = rgba('#3A2412', 0.5);
        ctx.beginPath();
        ctx.ellipse(0, -ry * 0.75, r * 0.12, r * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };
}
const redApple = appleOf(RED_APPLES, '#E0B84A');
const greenApple = appleOf(GREEN_APPLES, '#D8D27A');

const orange: Draw = (ctx, x, y, r, rnd) => {
  const base = rnd.pick(['#E3861E', '#EA9628', '#DB7A1C', '#E88F22']);
  const rx = r * rnd.range(0.97, 1.05);
  const ry = r * rnd.range(0.92, 1);
  placed(ctx, x, y, rnd.range(-0.5, 0.5), () => {
    body(ctx, shapePoly(rx, ry, rnd, () => 1), rx, ry, base, '#F2B24A', rnd, { lit: 0.4 });
    ctx.save();
    tracePoly(ctx, shapePoly(rx, ry, rnd, () => 1));
    ctx.clip();
    // the pores of the peel, pale and dark dabs that follow the curve
    for (let i = 0; i < 16; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const d = Math.sqrt(rnd.next()) * 0.92;
      ctx.fillStyle = rgba(rnd.chance(0.6) ? '#8A3E0E' : '#FFE3A0', rnd.range(0.14, 0.3));
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rx * d, Math.sin(a) * ry * d, rnd.range(0.2, 0.42), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (rnd.chance(0.5)) {
      ctx.fillStyle = rgba('#7A3A0E', 0.5);
      ctx.beginPath();
      ctx.ellipse(rnd.range(-0.3, 0.3) * rx, -ry * 0.62, r * 0.16, r * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    glint(ctx, -rx * 0.38, -ry * 0.5, rx * 0.17, ry * 0.1, 0.6);
  });
};

const lemon: Draw = (ctx, x, y, r, rnd) => {
  const base = rnd.pick(['#E4CB3A', '#DDBF30', '#EAD24A', '#D8B82E']);
  const rx = r * rnd.range(1.0, 1.12);
  const ry = r * rnd.range(0.68, 0.78);
  placed(ctx, x, y, rnd.range(-0.7, 0.7), () => {
    const poly = shapePoly(rx, ry, rnd, (a) => 1 + 0.17 * bump(a, 0, 0.3) + 0.12 * bump(a, Math.PI, 0.3), 24);
    body(ctx, poly, rx, ry, base, '#B8B438', rnd, { lit: 0.45 });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = rgba(rnd.chance(0.6) ? '#8A6A12' : '#FFF3B0', rnd.range(0.14, 0.28));
      ctx.beginPath();
      ctx.arc(rnd.range(-rx, rx) * 0.9, rnd.range(-ry, ry) * 0.8, rnd.range(0.18, 0.36), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    glint(ctx, -rx * 0.35, -ry * 0.45, rx * 0.2, ry * 0.12, 0.6);
  });
};

const pear: Draw = (ctx, x, y, r, rnd) => {
  const base = rnd.pick(['#B9B24A', '#C2B650', '#A9AA44', '#C9B04C']);
  const h = r * rnd.range(2.15, 2.45);
  const lean = rnd.range(-0.18, 0.2) * r;
  const prof = (u: number): number => {
    const s = clamp((u - 0.05) / 0.75, 0, 1);
    const bell = 0.3 + 0.7 * s * s * (3 - 2 * s);
    const cap = u > 0.8 ? Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)) : u < 0.07 ? Math.sqrt(u / 0.07) : 1;
    return r * bell * cap;
  };
  const pts: number[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    pts.push(prof(u) * (1 + rnd.range(-0.03, 0.03)) + lean * (1 - u), -h / 2 + u * h);
  }
  for (let i = N - 1; i >= 1; i--) {
    const u = i / N;
    pts.push(-prof(u) * (1 + rnd.range(-0.03, 0.03)) + lean * (1 - u), -h / 2 + u * h);
  }
  placed(ctx, x, y - h * 0.08, rnd.range(-0.4, 0.4), () => {
    const poly = deform(pts, rnd, 1, 0.012);
    body(ctx, poly, r, h / 2, base, rnd.chance(0.5) ? '#C98A3A' : '#7E9A3A', rnd, { lit: 0.4 });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = rgba('#5A4A1A', rnd.range(0.14, 0.3));
      ctx.beginPath();
      ctx.arc(rnd.range(-r, r) * 0.8, rnd.range(-h * 0.1, h * 0.45), rnd.range(0.2, 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    glint(ctx, -r * 0.4, h * 0.12, r * 0.14, r * 0.28, 0.5);
    pen(ctx, lean, -h / 2 + 0.5, lean + rnd.range(-1.2, 1.8), -h / 2 - 3.2, 0.6, '#5A3A22', 0.85, rnd, 0.05);
  });
};

const tomato: Draw = (ctx, x, y, r, rnd) => {
  const base = rnd.pick(['#C7382A', '#D0452E', '#BE3028', '#D9553A', '#C23C2C']);
  const rx = r * rnd.range(1.02, 1.12);
  const ry = r * rnd.range(0.86, 0.94);
  placed(ctx, x, y, rnd.range(-0.3, 0.3), () => {
    const poly = shapePoly(rx, ry, rnd, (a) => 1 + 0.035 * Math.sin(5 * a + 1) - 0.07 * bump(a, -Math.PI / 2, 0.4));
    body(ctx, poly, rx, ry, base, rnd.chance(0.4) ? '#E8803A' : '#7E1E22', rnd, { lit: 0.38 });
    glint(ctx, -rx * 0.4, -ry * 0.42, rx * 0.2, ry * 0.11, 0.8);
    // the green calyx: a little star of sepals and the stalk's stub
    const cy = -ry * 0.78;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.62 + rnd.range(-0.15, 0.15);
      ctx.fillStyle = rgba(mix('#5E8A3A', '#8DB35A', rnd.range(0, 0.5)), 0.95);
      ribbon(ctx, [0, cy, Math.cos(a) * rx * 0.3, cy + Math.sin(a) * ry * 0.22 + 0.6, Math.cos(a) * rx * 0.46, cy + Math.sin(a) * ry * 0.2 + 1.2], 0.95, 0.9);
    }
    pen(ctx, 0, cy, rnd.range(-0.5, 0.8), cy - 2.2, 0.7, '#4A6A2A', 0.9, rnd, 0.05);
  });
};

const onionOf =
  (red: boolean): Draw =>
  (ctx, x, y, r, rnd) => {
    const base = red ? rnd.pick(['#8E3A56', '#A04560', '#7E3250']) : rnd.pick(['#B8864A', '#C29550', '#A87440', '#BC8F4E']);
    const rx = r * rnd.range(0.95, 1.08);
    const ry = r * rnd.range(0.86, 0.98);
    placed(ctx, x, y, rnd.range(-0.5, 0.5), () => {
      const poly = shapePoly(rx, ry, rnd, (a) => 1 + 0.5 * bump(a, -Math.PI / 2, 0.24) - 0.06 * bump(a, -Math.PI / 2, 0.7) - 0.05 * bump(a, Math.PI / 2, 0.4), 24);
      body(ctx, poly, rx, ry, base, red ? '#C9788A' : '#E0BE78', rnd, { lit: 0.34 });
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      // the skin's meridians, papery
      for (let k = 0; k < 6; k++) {
        const off = (k / 5 - 0.5) * 1.7 * rx + rnd.range(-0.6, 0.6);
        ctx.fillStyle = rgba(red ? '#3E1426' : '#5A3A18', rnd.range(0.14, 0.3));
        ribbon(ctx, [off * 0.2, -ry * 1.3, off * 0.9, -ry * 0.2, off * 0.35, ry * 0.9], rnd.range(0.3, 0.7), 0.9);
      }
      ctx.restore();
      // the dry tip, and a tuft of roots below
      pen(ctx, 0, -ry * 1.28, rnd.range(-0.8, 0.8), -ry * 1.62, 0.7, red ? '#6A2A42' : '#8A6A38', 0.9, rnd, 0.05);
      for (let k = 0; k < 4; k++) pen(ctx, rnd.range(-1.2, 1.2), ry * 0.92, rnd.range(-2.2, 2.2), ry * 1.25, 0.3, '#EAD8B0', 0.6, rnd, 0.05);
      glint(ctx, -rx * 0.38, -ry * 0.35, rx * 0.12, ry * 0.18, 0.4);
    });
  };

const spud: Draw = (ctx, x, y, r, rnd) => potato(ctx, x, y, r, rnd);

/** a cabbage: its outer leaves flaring out from the heart, a firm head with the leaves' margins and ribs */
const cabbage: Draw = (ctx, x, y, r, rnd) => {
  const g0 = rnd.pick(['#6A9A48', '#5F8F46', '#78A24E', '#699A5A']);
  placed(ctx, x, y, rnd.range(-0.12, 0.12), () => {
    // the loose outer leaves under the head
    for (const s of [-1, 1]) {
      const rx = r * rnd.range(0.55, 0.7);
      const ry = r * rnd.range(0.4, 0.5);
      const cx = s * r * 0.72;
      const cy = r * 0.28;
      const poly = deform(blobPoly(cx, cy, rx, ry, rnd, 12, 0.07), rnd, 1, 0.03);
      ctx.fillStyle = quiet(mix(g0, '#2E5F3A', 0.35));
      tracePoly(ctx, poly);
      ctx.fill();
      wash(ctx, poly, quiet(mix(g0, '#2E5F3A', 0.35)), 0.7, rnd, 2, 0.02);
      ctx.strokeStyle = rgba(INK, 0.45);
      ctx.lineWidth = 0.5;
      tracePoly(ctx, poly);
      ctx.stroke();
    }
    const rx = r;
    const ry = r * rnd.range(0.9, 0.97);
    const poly = shapePoly(rx, ry, rnd, () => 1, 22);
    body(ctx, poly, rx, ry, g0, '#C6D88A', rnd, { lit: 0.36, shade: 0.55 });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // the margins of the wrapped leaves: arcs sweeping across the head, paler along their edge
    for (let k = 0; k < 5; k++) {
      const a0 = rnd.range(-2.6, -0.4);
      const rr = r * rnd.range(0.5, 1.05);
      ctx.strokeStyle = rgba(rnd.chance(0.5) ? '#E2EDB4' : '#2E5A34', rnd.range(0.3, 0.55));
      ctx.lineWidth = rnd.range(0.4, 0.8);
      ctx.beginPath();
      ctx.arc(rnd.range(-0.4, 0.4) * r, r * rnd.range(0.2, 0.9), rr, a0, a0 + rnd.range(0.7, 1.4));
      ctx.stroke();
    }
    // the ribs, radiating from the foot
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.34 + rnd.range(-0.06, 0.06);
      ctx.strokeStyle = rgba('#EEF4C6', rnd.range(0.3, 0.5));
      ctx.lineWidth = rnd.range(0.35, 0.7);
      ctx.beginPath();
      ctx.moveTo(rnd.range(-1, 1), ry * 0.95);
      ctx.quadraticCurveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.2, Math.cos(a) * r * rnd.range(0.7, 1), Math.sin(a) * r * rnd.range(0.7, 1));
      ctx.stroke();
    }
    ctx.restore();
    glint(ctx, -rx * 0.36, -ry * 0.45, rx * 0.2, ry * 0.1, 0.4);
  });
};

/* ------------------------------------------------------------------ bunches in their vessels */

/** a stalk of carrot top: a curved stem with leaflets alternating along it */
function topSpray(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, rnd: Rand): void {
  const bend = rnd.range(-0.5, 0.5);
  const pts: number[] = [];
  const marks: { x: number; y: number; a: number }[] = [];
  for (let k = 0; k <= 5; k++) {
    const t = k / 5;
    const a = ang + bend * t * t;
    const px = x + Math.sin(a) * len * t;
    const py = y - Math.cos(a) * len * t;
    pts.push(px, py);
    if (k > 0) marks.push({ x: px, y: py, a });
  }
  ctx.fillStyle = rgba(mix('#4E7A3A', '#7AA64A', rnd.range(0, 0.5)), 0.95);
  ribbon(ctx, pts, 0.9, 0.9);
  const col = mix('#5E8A3E', '#8DB35A', rnd.range(0, 0.6));
  for (const m of marks) {
    for (const s of [-1, 1]) leafDab(ctx, m.x + s * 0.8, m.y, m.a - Math.PI / 2 + s * rnd.range(0.5, 1.1), rnd.range(1.6, 2.6), col, rnd);
  }
}

/** carrots standing in a basket: orange shoulders at the rim, their feathery tops spilling up and out */
function carrotsIn(ctx: CanvasRenderingContext2D, x0: number, x1: number, rim: number, rnd: Rand): void {
  const n = Math.max(5, Math.round((x1 - x0) / 5.2));
  const tops: { x: number; a: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.5 : k / (n - 1);
    const px = x0 + 3 + t * (x1 - x0 - 6) + rnd.range(-1.6, 1.6);
    const a = (t - 0.5) * 1.1 + rnd.range(-0.28, 0.28);
    tops.push({ x: px, a });
  }
  // the tops behind first, then the carrots' shoulders over their roots
  for (const c of tops) {
    for (let s = 0; s < 2; s++) topSpray(ctx, c.x, rim - rnd.range(5, 9), c.a + rnd.range(-0.4, 0.4), rnd.range(11, 19), rnd);
  }
  for (const c of tops) {
    const len = rnd.range(7, 11);
    const w = rnd.range(2.6, 3.4);
    const col = rnd.pick(['#D9762A', '#E0842E', '#CF6A24', '#DC7A2A']);
    const bx = c.x + Math.sin(c.a) * len;
    const by = rim + 3 - Math.cos(c.a) * len;
    const poly = deform([c.x - w * 0.3, rim + 3, bx - w * 0.5, by, bx + w * 0.5, by, c.x + w * 0.3, rim + 3], rnd, 1, 0.01);
    ctx.fillStyle = quiet(col, 0.08);
    tracePoly(ctx, poly);
    ctx.fill();
    wash(ctx, poly, quiet(col, 0.08), 0.6, rnd, 2, 0.01);
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.45;
    tracePoly(ctx, poly);
    ctx.stroke();
    ctx.fillStyle = rgba('#8A3A0E', 0.35);
    ribbon(ctx, [c.x + w * 0.2, rim + 2, bx + w * 0.3, by + 1], 0.8, 0.8);
    ctx.fillStyle = rgba('#FFD9A0', 0.4);
    ribbon(ctx, [c.x - w * 0.2, rim + 2, bx - w * 0.3, by + 1], 0.6, 0.8);
    // the green crown where the tops spring
    ctx.fillStyle = rgba('#6A9A40', 0.95);
    ctx.beginPath();
    ctx.ellipse(bx, by, w * 0.5, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** leeks standing in a crate: white shafts shading to green, the flags of leaf opening above */
function leeksIn(ctx: CanvasRenderingContext2D, x0: number, x1: number, rim: number, rnd: Rand): void {
  const n = Math.max(5, Math.round((x1 - x0) / 5.5));
  const order = Array.from({ length: n }, (_, k) => k).sort(() => rnd.next() - 0.5);
  for (const k of order) {
    const t = n === 1 ? 0.5 : k / (n - 1);
    const px = x0 + 3 + t * (x1 - x0 - 6) + rnd.range(-1.2, 1.2);
    const lean = (t - 0.5) * 0.35 + rnd.range(-0.12, 0.12);
    const hs = rnd.range(13, 22);
    const w = rnd.range(3, 4);
    const tx = px + Math.sin(lean) * hs;
    const ty = rim - Math.cos(lean) * hs;
    // the shaft: pale, shading to green where the leaves begin
    const poly = [px - w / 2, rim + 4, tx - w * 0.42, ty, tx + w * 0.42, ty, px + w / 2, rim + 4];
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    const g = ctx.createLinearGradient(0, rim + 4, 0, ty);
    g.addColorStop(0, '#EDEBCF');
    g.addColorStop(0.55, '#D8DDB0');
    g.addColorStop(1, '#A9C081');
    ctx.fillStyle = g;
    ctx.fillRect(px - w, ty, w * 2 + hs, hs + 6);
    ctx.fillStyle = rgba(SHADE, 0.22);
    ribbon(ctx, [px + w * 0.28, rim + 4, tx + w * 0.28, ty], w * 0.35, 0.9);
    ctx.fillStyle = rgba('#FFFFFF', 0.4);
    ribbon(ctx, [px - w * 0.26, rim + 4, tx - w * 0.26, ty], 0.7, 0.9);
    ctx.restore();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.45;
    tracePoly(ctx, poly);
    ctx.stroke();
    // the flags: broad strap leaves, folded back and out, the greens deepening toward their tips
    const nf = rnd.int(3, 4);
    for (let f = 0; f < nf; f++) {
      const a = lean + (f - (nf - 1) / 2) * rnd.range(0.4, 0.6) + rnd.range(-0.12, 0.12);
      const ll = rnd.range(10, 16);
      const bend = (f - (nf - 1) / 2) * rnd.range(0.25, 0.5);
      const pts: number[] = [];
      for (let m = 0; m <= 5; m++) {
        const u = m / 5;
        const aa = a + bend * u * u;
        pts.push(tx + Math.sin(aa) * ll * u, ty - Math.cos(aa) * ll * u);
      }
      const col = mix(rnd.pick(['#5E8A4A', '#4E7E48', '#6A9650']), '#2E5A3A', rnd.range(0, 0.4));
      ctx.fillStyle = rgba(INK, 0.3);
      ribbon(ctx, pts.map((v, i) => (i % 2 === 0 ? v + 0.35 : v + 0.2)), w * 0.95, 0.6);
      ctx.fillStyle = rgba(quiet(col, 0.08), 0.97);
      ribbon(ctx, pts, w * 0.82, 0.6);
      ctx.fillStyle = rgba('#CFE0A0', 0.45);
      ribbon(ctx, pts.slice(0, 8).map((v, i) => (i % 2 === 0 ? v - 0.35 : v)), 0.6, 0.9);
    }
  }
}

/** a bunch of radishes in a shallow box: red bulbs along the rim, white tails, leaves up and out */
function radishesIn(ctx: CanvasRenderingContext2D, x0: number, x1: number, rim: number, rnd: Rand): void {
  const n = Math.max(5, Math.round((x1 - x0) / 5.5));
  const bulbs: { x: number; y: number; r: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.5 : k / (n - 1);
    bulbs.push({ x: x0 + 3 + t * (x1 - x0 - 6) + rnd.range(-1.2, 1.2), y: rim - rnd.range(0.5, 4.5), r: rnd.range(2.7, 3.6) });
  }
  for (const b of bulbs) {
    for (let l = 0; l < 3; l++) {
      const a = (b.x - (x0 + x1) / 2) / (x1 - x0) + rnd.range(-0.45, 0.45);
      const len = rnd.range(8, 14);
      const col = mix(rnd.pick(['#5E8A44', '#74A04C', '#4E7A40']), '#C9D88A', rnd.range(0, 0.2));
      const poly = deform(blobPoly(0, 0, len * 0.5, len * 0.28, rnd, 9, 0.12), rnd, 1, 0.04);
      placed(ctx, b.x + Math.sin(a) * len * 0.55, b.y - b.r - Math.cos(a) * len * 0.55 - 2, a + Math.PI / 2 + rnd.range(-0.2, 0.2), () => {
        ctx.fillStyle = rgba(INK, 0.35);
        tracePoly(ctx, poly.map((v, i) => v + (i % 2 === 0 ? 0.3 : 0.2)));
        ctx.fill();
        ctx.fillStyle = rgba(quiet(col, 0.06), 0.97);
        tracePoly(ctx, poly);
        ctx.fill();
        ctx.strokeStyle = rgba('#E6F0B8', 0.45);
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.moveTo(-len * 0.45, 0);
        ctx.lineTo(len * 0.45, 0);
        ctx.stroke();
      });
    }
  }
  for (const b of bulbs.sort((p, q) => p.y - q.y)) {
    const poly = deform(blobPoly(b.x, b.y, b.r, b.r * 0.92, rnd, 10, 0.05), rnd, 1, 0.02);
    const col = rnd.pick(['#C0284A', '#CC3A4E', '#B82446']);
    ctx.fillStyle = quiet(col, 0.06);
    tracePoly(ctx, poly);
    ctx.fill();
    wash(ctx, poly, quiet(col, 0.06), 0.6, rnd, 2, 0.01);
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    ctx.fillStyle = rgba('#F4E6DA', 0.8);
    ctx.fillRect(b.x - b.r, b.y + b.r * 0.35, b.r * 2, b.r);
    ctx.fillStyle = rgba(SHADE, 0.32);
    ribbon(ctx, [b.x + b.r * 0.6, b.y - b.r * 0.6, b.x + b.r * 0.7, b.y + b.r * 0.4], b.r * 0.5, 0.8);
    ctx.restore();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.45;
    tracePoly(ctx, poly);
    ctx.stroke();
    glint(ctx, b.x - b.r * 0.4, b.y - b.r * 0.4, b.r * 0.2, b.r * 0.12, 0.8);
    pen(ctx, b.x, b.y + b.r * 0.9, b.x + rnd.range(-0.5, 0.5), b.y + b.r * 1.5, 0.35, '#F0E4D0', 0.9, rnd, 0.05);
  }
}

/* ------------------------------------------------------------------ heaps and vessels */

/**
 * A heap on a tray: rows laid from the front, each narrower than the one before (the heap's sides slope, its two
 * flanks never alike), back rows drawn first so the front ones overlap them. `mix` lets a few of another kind in.
 */
function heap(ctx: CanvasRenderingContext2D, x0: number, x1: number, tray: number, r: number, draw: Draw, rnd: Rand, o: { rows?: number; also?: Draw; alsoP?: number } = {}): void {
  const rows = o.rows ?? 4;
  const items: { x: number; y: number; r: number; row: number }[] = [];
  let xl = x0 + r * 0.7;
  let xr = x1 - r * 0.7;
  for (let i = 0; i < rows; i++) {
    const width = xr - xl;
    if (width < r * 1.2) break;
    const n = Math.max(1, Math.round(width / (2 * r * rnd.range(0.86, 0.98))) + (i === 0 ? 1 : 0));
    const rowY = tray - r * 0.5 - i * r * rnd.range(0.78, 0.9);
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1);
      const ir = r * rnd.range(0.88, 1.1);
      items.push({ x: xl + t * width + rnd.range(-r * 0.22, r * 0.22), y: rowY + rnd.range(-r * 0.2, r * 0.2), r: ir, row: i });
    }
    xl += r * rnd.range(0.55, 1.2);
    xr -= r * rnd.range(0.55, 1.2);
  }
  items.sort((a, b) => b.row - a.row || a.x - b.x);
  for (const it of items) {
    const d = o.also && rnd.chance(o.alsoP ?? 0.12) ? o.also : draw;
    d(ctx, it.x, it.y, it.r, rnd);
  }
}

/** a wicker basket: woven bands, a rope rim, a handle arching up behind (the contents are painted by `fill`) */
function wicker(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, h: number, rnd: Rand, fill: (rim: number) => void): void {
  const rim = base - h;
  const inset = (x1 - x0) * 0.1;
  const tone = rnd.pick(['#B58A4E', '#A87C44', '#BE9558']);
  // the dark inside
  wash(ctx, [x0 + 1, rim - 1.5, x1 - 1, rim - 1.5, x1 - 1, rim + 3, x0 + 1, rim + 3], '#2E1C0E', 0.95, rnd, 2, 0.01);
  fill(rim);
  // the body: wider at the rim
  const poly = [x0, rim, x1, rim, x1 - inset, base, x0 + inset, base];
  ctx.fillStyle = quiet(tone, 0.06);
  tracePoly(ctx, deform(poly, rnd, 1, 0.01));
  ctx.fill();
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  const rows = Math.round(h / 2.6);
  for (let k = 0; k < rows; k++) {
    const yy = rim + 1.5 + (k / rows) * h;
    ctx.fillStyle = rgba(k % 2 ? mix(tone, '#F0D098', 0.35) : mix(tone, '#4A2E14', 0.4), 0.8);
    ribbon(ctx, [x0 - 1, yy, x1 + 1, yy + rnd.range(-0.2, 0.2)], 1.1, 0.95);
    ctx.fillStyle = rgba('#2A1608', 0.4);
    for (let x = x0 + (k % 2) * 2.2 + rnd.range(0, 1); x < x1; x += rnd.range(3.8, 4.8)) ctx.fillRect(x, yy - 1.2, 0.5, 2.4);
  }
  const sg = ctx.createLinearGradient(x0, 0, x1, 0);
  sg.addColorStop(0, 'rgba(255,236,190,0.25)');
  sg.addColorStop(0.5, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(30,16,8,0.42)');
  ctx.fillStyle = sg;
  ctx.fillRect(x0, rim, x1 - x0, h);
  ctx.restore();
  pen(ctx, x0, rim, x0 + inset, base, 0.6, INK, 0.6, rnd, 0.15);
  pen(ctx, x1, rim, x1 - inset, base, 0.65, INK, 0.7, rnd, 0.15);
  pen(ctx, x0 + inset, base, x1 - inset, base, 0.6, INK, 0.6, rnd, 0.15);
  // the rope rim
  ctx.fillStyle = quiet(mix(tone, '#D8B070', 0.4), 0.05);
  ribbon(ctx, [x0 - 0.6, rim, (x0 + x1) / 2, rim + 0.3, x1 + 0.6, rim], 2.4, 0.95);
  ctx.fillStyle = rgba('#FFE8B0', 0.4);
  ribbon(ctx, [x0 + 1, rim - 0.5, x1 - 1, rim - 0.5], 0.7, 0.9);
  pen(ctx, x0 - 0.5, rim + 1.2, x1 + 0.5, rim + 1.2, 0.45, INK, 0.5, rnd, 0.15);
}

/** a shallow open box, its front slats washed in their own tones, a corner post at each end */
function slatBox(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, h: number, rnd: Rand, fill: (rim: number) => void, wood: string): void {
  const rim = base - h;
  wash(ctx, [x0 + 1, rim - 1.5, x1 - 1, rim - 1.5, x1 - 1, rim + 3, x0 + 1, rim + 3], '#2E1C0E', 0.95, rnd, 2, 0.01);
  fill(rim);
  const n = h > 14 ? 3 : 2;
  const sh = h / n;
  for (let s = 0; s < n; s++) {
    plank(ctx, x0, rim + s * sh, x1, rim + (s + 1) * sh - 1.4, mix(wood, '#8A5E36', rnd.next() * 0.5), rnd, { grain: 1.2, knots: rnd.chance(0.3) ? 1 : 0, edge: 1 });
    ctx.fillStyle = rgba('#1E1008', 0.5);
    ctx.fillRect(x0 + 1, rim + (s + 1) * sh - 1.4, x1 - x0 - 2, 1.4);
    for (const nx of [x0 + 2.5, x1 - 2.5]) {
      ctx.fillStyle = rgba('#2A1A10', 0.6);
      ctx.beginPath();
      ctx.arc(nx, rim + s * sh + (sh - 1.4) / 2, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  plank(ctx, x0 - 1.4, rim - 1, x0 + 3.2, base + 0.5, mix(wood, '#7A5230', 0.4), rnd, { vertical: true, grain: 1 });
  plank(ctx, x1 - 3.2, rim - 1, x1 + 1.4, base + 0.5, mix(wood, '#6E4A2A', 0.4), rnd, { vertical: true, grain: 1 });
}

/** a price card on a stick, standing in the heap (the writing is a few strokes, never read) */
function stickCard(ctx: CanvasRenderingContext2D, x: number, y: number, rnd: Rand): void {
  const tilt = rnd.range(-0.22, 0.22);
  placed(ctx, x, y, tilt * 0.4, () => {
    pen(ctx, 0, 0, rnd.range(-0.4, 0.4), -13, 0.7, '#6A4A2A', 0.95, rnd, 0.08);
    placed(ctx, 0, -14.5, tilt, () => {
      ctx.fillStyle = 'rgba(26,14,6,0.25)';
      ctx.fillRect(-6.4, -3.8, 13, 8.8);
      wash(ctx, rectPoly(-6.6, -4.6, 6.6, 4.2, rnd, 0.3), rnd.pick(['#E4D6B0', '#E8DCBA', '#DDCDA4']), 0.97, rnd, 2, 0.008);
      pen(ctx, -6.6, -4.6, 6.6, -4.6, 0.4, INK, 0.5, rnd, 0.1);
      pen(ctx, 6.6, -4.6, 6.6, 4.2, 0.45, INK, 0.6, rnd, 0.1);
      pen(ctx, -6.6, 4.2, 6.6, 4.2, 0.45, INK, 0.55, rnd, 0.1);
      pen(ctx, -6.6, -4.6, -6.6, 4.2, 0.4, INK, 0.45, rnd, 0.1);
      let sx = -4.6;
      for (let k = 0; k < rnd.int(2, 3); k++) {
        const l = rnd.range(1.2, 3);
        pen(ctx, sx, -2, sx + l, -2 + rnd.range(-0.2, 0.2), 0.45, INK, 0.6, rnd, 0.08);
        sx += l + 0.9;
      }
      ctx.fillStyle = rgba(rnd.pick(['#9A2A24', '#2E3F5A']), 0.75);
      ctx.fillRect(-4.2, 0.6, rnd.range(2.4, 3.2), 2.2);
      ctx.fillRect(-0.4, 0.6, rnd.range(1.4, 2.2), 2.2);
      ctx.fillRect(2.6 + rnd.range(0, 0.5), 2.2, 0.9, 0.9);
    });
  });
}

/** a card tucked into the lip's face, a little askew, held by a tack */
function lipCard(ctx: CanvasRenderingContext2D, x: number, y: number, rnd: Rand): void {
  placed(ctx, x, y, rnd.range(-0.07, 0.07), () => {
    ctx.fillStyle = 'rgba(20,10,4,0.3)';
    ctx.fillRect(-9, -4.6, 19, 10);
    wash(ctx, rectPoly(-9.4, -5.2, 9.4, 4.8, rnd, 0.3), rnd.pick(['#E2D4AE', '#E8DCBA']), 0.98, rnd, 2, 0.008);
    pen(ctx, -9.4, -5.2, 9.4, -5.2, 0.4, INK, 0.5, rnd, 0.1);
    pen(ctx, 9.4, -5.2, 9.4, 4.8, 0.5, INK, 0.6, rnd, 0.1);
    pen(ctx, -9.4, 4.8, 9.4, 4.8, 0.5, INK, 0.6, rnd, 0.1);
    pen(ctx, -9.4, -5.2, -9.4, 4.8, 0.4, INK, 0.45, rnd, 0.1);
    let sx = -7.4;
    for (let k = 0; k < rnd.int(3, 4); k++) {
      const l = rnd.range(1.6, 4);
      pen(ctx, sx, -2.4, sx + l, -2.4 + rnd.range(-0.2, 0.2), 0.5, INK, 0.6, rnd, 0.08);
      sx += l + 1;
    }
    ctx.fillStyle = rgba(rnd.pick(['#9A2A24', '#2E3F5A', '#2A2A22']), 0.8);
    ctx.fillRect(-6.4, 0.2, rnd.range(3, 4.4), 3);
    ctx.fillRect(-1.8, 0.2, rnd.range(2, 3.2), 3);
    ctx.fillRect(2.8, 2.4, 1.1, 1.1);
    ctx.fillStyle = rgba('#8A8478', 0.95);
    ctx.beginPath();
    ctx.arc(0.5, -4.2, 0.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ------------------------------------------------------------------ the stands */

type Kind = 'redApples' | 'greenApples' | 'oranges' | 'lemons' | 'pears' | 'tomatoes' | 'onions' | 'potatoes' | 'cabbages' | 'carrots' | 'leeks' | 'radishes';

interface Bay {
  kind: Kind;
  share: number;
}

const RIGS: Record<'left' | 'right', { tiers: Bay[][]; wood: string; paint: string | null }> = {
  // the window's side: a stand painted a faded green, worn through to the wood at its edges
  left: {
    tiers: [
      [
        { kind: 'onions', share: 0.5 },
        { kind: 'leeks', share: 0.5 },
      ],
      [
        { kind: 'tomatoes', share: 0.58 },
        { kind: 'radishes', share: 0.42 },
      ],
      [
        { kind: 'pears', share: 0.54 },
        { kind: 'greenApples', share: 0.46 },
      ],
    ],
    wood: '#A67C4A',
    paint: '#6E8A70',
  },
  // the bigger one under the board: bare pine, worn pale where hands reach
  right: {
    tiers: [
      [
        { kind: 'cabbages', share: 0.52 },
        { kind: 'potatoes', share: 0.48 },
      ],
      [
        { kind: 'oranges', share: 0.55 },
        { kind: 'lemons', share: 0.45 },
      ],
      [
        { kind: 'redApples', share: 0.6 },
        { kind: 'carrots', share: 0.4 },
      ],
    ],
    wood: '#B58B58',
    paint: null,
  },
};

const LEG_H = 20;
const PITCH = 42;
const LIP_H = 11;
const TRAY_D = 15;

/** the faint wear of paint chipped off an edge, showing the wood */
function chips(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, wood: string, rnd: Rand, n: number): void {
  for (let i = 0; i < n; i++) {
    const onEdge = rnd.chance(0.6);
    const cx = onEdge ? (rnd.chance(0.5) ? x0 + rnd.range(0, 2) : x1 - rnd.range(0, 2)) : rnd.range(x0, x1);
    const cy = onEdge ? rnd.range(y0, y1) : rnd.chance(0.5) ? y0 + rnd.range(0, 2) : y1 - rnd.range(0, 2);
    ctx.fillStyle = rgba(mix(wood, '#D8B078', rnd.range(0, 0.4)), rnd.range(0.55, 0.9));
    tracePoly(ctx, deform(blobPoly(cx, cy, rnd.range(0.8, 2.6), rnd.range(0.5, 1.1), rnd, 7, 0.3), rnd, 1, 0.1));
    ctx.fill();
  }
}

function paintStand(st: ProduceStand, q: number, idx: number): Sprite {
  const rig = RIGS[st.side];
  const tiersN = rig.tiers.length;
  const X0 = st.x - st.w / 2;
  const X1 = st.x + st.w / 2;
  const feet = st.y;
  const inset = st.side === 'left' ? 8 : 9;
  const box = { x: X0 - 12, y: feet - st.h - 22, w: st.w + 36, h: st.h + 22 + 22 };
  const { cv, ctx } = spriteCtx(box, q);
  const rnd = new Rand(8800 + idx * 97);
  const painted = rig.paint;
  const woodOf = (): string => (painted ? mix(painted, rig.wood, rnd.range(0, 0.12)) : mix(rig.wood, rnd.pick(['#9A7040', '#C09A64', '#A88050']), rnd.range(0.1, 0.5)));

  const lipBottom = (k: number): number => feet - LEG_H - k * PITCH;
  const lipTop = (k: number): number => lipBottom(k) - LIP_H;
  const xl = (k: number): number => X0 + k * inset;
  const xr = (k: number): number => X1 - k * inset;

  // the shadow on the floor and the wall, soft, thrown to the right and toward us (the light is upper left)
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    ctx.fillStyle = `rgba(22,12,6,${0.075 - t * 0.02})`;
    ctx.beginPath();
    ctx.ellipse(st.x + 9, feet + 2.5, st.w * (0.62 - t * 0.12) + 6, 8 - t * 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  {
    // on the wall behind: a soft, tall shade to the right of the stand
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      ctx.fillStyle = `rgba(22,12,6,${0.05})`;
      tracePoly(ctx, deform(rectPoly(X0 + 12 + t * 4, feet - st.h * (0.9 - t * 0.2), X1 + 12 - t * 4, feet - 4, rnd, 3), rnd, 2, 0.05));
      ctx.fill();
    }
  }

  // the back: dark upright boards behind each tray, stepping in as the stand rises
  for (let k = 0; k < tiersN; k++) {
    const top = lipBottom(k) - PITCH - 4;
    const bx0 = xl(k) + 3;
    const bx1 = xr(k) - 3;
    const n = Math.max(3, Math.round((bx1 - bx0) / 11));
    for (let b = 0; b < n; b++) {
      const a = bx0 + ((bx1 - bx0) * b) / n;
      const c = bx0 + ((bx1 - bx0) * (b + 1)) / n;
      plank(ctx, a, top, c, lipBottom(k), mix(painted ? '#46584A' : '#5A402A', '#2E1C0E', rnd.next() * 0.5), rnd, { vertical: true, grain: 0.8 });
    }
    ctx.fillStyle = 'rgba(14,8,4,0.38)';
    ctx.fillRect(bx0, top, bx1 - bx0, lipBottom(k) - top);
  }
  // under the bottom tray: a dark gap, a low stretcher between the legs and a darker floor shadow
  {
    const g = ctx.createLinearGradient(0, feet - LEG_H, 0, feet);
    g.addColorStop(0, 'rgba(10,6,2,0.45)');
    g.addColorStop(1, 'rgba(10,6,2,0.15)');
    ctx.fillStyle = g;
    ctx.fillRect(X0 + 6, feet - LEG_H, st.w - 12, LEG_H);
    plank(ctx, X0 + 6, feet - 9, X1 - 6, feet - 4.6, woodOf(), rnd, { grain: 0.6, edge: 0.6 });
    ctx.fillStyle = 'rgba(14,8,4,0.35)';
    ctx.fillRect(X0 + 6, feet - 9, st.w - 12, 4.4);
  }
  // the legs
  for (const [lx, side] of [
    [X0 + 1, -1],
    [X1 - 5.4, 1],
  ] as const) {
    const w = 5.4;
    const lean = side * 0.5;
    plank(ctx, lx, lipBottom(0) - 1, lx + w, feet, woodOf(), rnd, { vertical: true, grain: 1.3 });
    // a foot shoe, scuffed
    ctx.fillStyle = rgba('#1A0E06', 0.4);
    ctx.fillRect(lx - 0.4 + lean * 0, feet - 2.6, w + 0.8, 2.6);
    if (painted) chips(ctx, lx, feet - LEG_H, lx + w, feet, rig.wood, rnd, 5);
  }

  for (let k = tiersN - 1; k >= 0; k--) {
    const ax = xl(k);
    const bx = xr(k);
    const lt = lipTop(k);
    const lb = lipBottom(k);
    // the tray, tilted toward us (its back edge higher): lit from above, its boards seen end-on across the front
    {
      const surf = [ax + 2, lt + 0.5, bx - 2, lt + 0.5, bx - 4, lt - TRAY_D, ax + 4, lt - TRAY_D];
      wash(ctx, surf, mix(woodOf(), '#C8A06A', 0.25), 0.97, rnd, 2, 0.008);
      ctx.save();
      tracePoly(ctx, surf);
      ctx.clip();
      for (let g = 0; g < 9; g++) {
        const gy = lt - rnd.range(1, TRAY_D - 1);
        ctx.fillStyle = rgba('#3A2012', rnd.range(0.1, 0.22));
        ribbon(ctx, [ax + rnd.range(2, 14), gy, bx - rnd.range(2, 14), gy + rnd.range(-0.4, 0.4)], rnd.range(0.3, 0.6), 0.9);
      }
      const dk = ctx.createLinearGradient(0, lt - TRAY_D, 0, lt);
      dk.addColorStop(0, 'rgba(14,8,4,0.38)');
      dk.addColorStop(1, 'rgba(14,8,4,0)');
      ctx.fillStyle = dk;
      ctx.fillRect(ax, lt - TRAY_D, bx - ax, TRAY_D);
      ctx.restore();
    }
    // the bays: the tray shared out unevenly
    const bays = rig.tiers[k]!;
    const span = bx - ax - 10;
    let cur = ax + 5;
    bays.forEach((bay, bi) => {
      const w = span * bay.share;
      const bx0 = cur + (bi > 0 ? 1.5 : 0);
      const bx1 = cur + w - (bi < bays.length - 1 ? 1.5 : 0);
      cur += w;
      paintBay(ctx, bay.kind, bx0, bx1, lt, rnd);
    });
    // the lip: two boards that meet off-centre, the seam dark, scuffed pale on the top edge
    const seam = ax + (bx - ax) * rnd.range(0.36, 0.64);
    plank(ctx, ax, lt, seam - 0.5, lb, woodOf(), rnd, { grain: 1.4, knots: rnd.chance(0.4) ? 1 : 0, edge: 1 });
    plank(ctx, seam + 0.5, lt, bx, lb, woodOf(), rnd, { grain: 1.4, knots: rnd.chance(0.4) ? 1 : 0, edge: 1 });
    ctx.fillStyle = rgba('#1A0C06', 0.55);
    ctx.fillRect(seam - 0.5, lt, 1, lb - lt);
    for (let i = 0; i < 4; i++) {
      const sx = rnd.range(ax + 4, bx - 20);
      ctx.fillStyle = rgba('#F2D4A0', rnd.range(0.14, 0.3));
      ribbon(ctx, [sx, lt + 1, sx + rnd.range(8, 26), lt + 1.1], rnd.range(0.7, 1.4), 0.9);
    }
    if (painted) chips(ctx, ax, lt, bx, lb, rig.wood, rnd, 7);
    // a shadow under the lip onto what is below it
    const ls = ctx.createLinearGradient(0, lb, 0, lb + 6);
    ls.addColorStop(0, 'rgba(14,8,4,0.34)');
    ls.addColorStop(1, 'rgba(14,8,4,0)');
    ctx.fillStyle = ls;
    ctx.fillRect(ax + 1, lb, bx - ax - 2, 6);
    // the cheeks: the ends of the tray, a little taller than its back edge, so the heap is held in
    for (const [cx0, cx1] of [
      [ax - 1.6, ax + 4.4],
      [bx - 4.4, bx + 1.6],
    ] as const) {
      plank(ctx, cx0, lt - TRAY_D - 2.5, cx1, lb, woodOf(), rnd, { vertical: true, grain: 1.2, edge: 1 });
      if (painted) chips(ctx, cx0, lt - TRAY_D, cx1, lb, rig.wood, rnd, 3);
    }
    // a price card tucked into the lip's face, now and then
    if (k === 0 || rnd.chance(0.35)) lipCard(ctx, ax + (bx - ax) * rnd.range(0.16, 0.84), (lt + lb) / 2 + 0.2, rnd);
  }

  grain(ctx, '#3A2616', box.x, box.y, box.w, box.h, 0, 0.16, 640 + idx);
  // the room's light: the stand takes the wall's (the window's cool at the left), the boards below it the floor's
  glazeSprite(cv, box, q, (_x, y) => (y > feet - 2 ? 'floor' : 'wall'), 41 + idx, (_x, y) => 0.04 * clamp((feet - 30 - y) / 90, 0, 1), 0.26);
  return { cv, x: box.x, y: box.y, w: box.w, h: box.h };
}

function paintBay(ctx: CanvasRenderingContext2D, kind: Kind, x0: number, x1: number, lt: number, rnd: Rand): void {
  const tray = lt - 1.5;
  const width = x1 - x0;
  switch (kind) {
    case 'redApples':
      heap(ctx, x0, x1, tray, rnd.range(5.8, 6.6), redApple, rnd, { rows: 4, also: greenApple, alsoP: 0.1 });
      stickCard(ctx, x0 + width * rnd.range(0.4, 0.7), tray - 3, rnd);
      break;
    case 'greenApples':
      heap(ctx, x0, x1, tray, rnd.range(5.8, 6.4), greenApple, rnd, { rows: 4, also: redApple, alsoP: 0.12 });
      break;
    case 'oranges':
      heap(ctx, x0, x1, tray, rnd.range(6.2, 6.9), orange, rnd, { rows: 4, also: lemon, alsoP: 0.06 });
      stickCard(ctx, x0 + width * rnd.range(0.55, 0.8), tray - 3, rnd);
      break;
    case 'lemons':
      heap(ctx, x0, x1, tray, rnd.range(5.4, 6), lemon, rnd, { rows: 4 });
      break;
    case 'pears':
      heap(ctx, x0, x1, tray, rnd.range(4.8, 5.4), pear, rnd, { rows: 4, also: greenApple, alsoP: 0.05 });
      stickCard(ctx, x0 + width * rnd.range(0.3, 0.5), tray - 3, rnd);
      break;
    case 'tomatoes':
      heap(ctx, x0, x1, tray, rnd.range(5.4, 6), tomato, rnd, { rows: 4 });
      break;
    case 'onions':
      heap(ctx, x0, x1, tray, rnd.range(5.2, 5.8), onionOf(false), rnd, { rows: 4, also: onionOf(true), alsoP: 0.22 });
      stickCard(ctx, x0 + width * rnd.range(0.55, 0.75), tray - 3, rnd);
      break;
    case 'potatoes':
      heap(ctx, x0, x1, tray, rnd.range(5.2, 5.8), spud, rnd, { rows: 4 });
      break;
    case 'cabbages':
      heap(ctx, x0, x1, tray, rnd.range(10, 11.5), cabbage, rnd, { rows: 2 });
      break;
    case 'carrots':
      wicker(ctx, x0, x1, tray - 2, 15, rnd, (rim) => carrotsIn(ctx, x0, x1, rim, rnd));
      break;
    case 'leeks':
      slatBox(ctx, x0, x1, tray - 1, 14, rnd, (rim) => leeksIn(ctx, x0, x1, rim, rnd), '#A8794A');
      break;
    case 'radishes':
      slatBox(ctx, x0, x1, tray - 1, 9, rnd, (rim) => radishesIn(ctx, x0, x1, rim, rnd), '#B58B58');
      break;
  }
}

export function paintProduce(q: number): { sprites: Sprite[] } {
  return { sprites: PRODUCE_STANDS.map((st, i) => paintStand(st, q, i)) };
}
