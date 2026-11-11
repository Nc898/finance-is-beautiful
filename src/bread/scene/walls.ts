/**
 * The lived-in clutter of a neighbourhood grocer's walls, painted into the room's sheet before the light is glazed over
 * it, so it falls into the lamps' shade and sits a value or two under the counter and the board:
 * - above the shelves, on the wall under the beam: two enamel signs (invented names), and on the shelves' cornice a
 *   biscuit tin, a wicker basket and a stoneware crock;
 * - above the board, the clock; beside it, a mustard sign;
 * - between the window and the shelves: a string of onions and, under it, a plait of garlic;
 * - between the door and the window: an enamel thermometer;
 * - the right wall: an oval soap sign, a cork board with a few pinned cards, a small shelf of jars, a bunch of dried
 *   herbs hung to dry, the brown-paper roll with the twine on its bracket, a bundle of paper bags on a nail;
 * - by the door (wide screens): the grocer's coat and cap on the pegs; and on the floor (paintFloorClutter) his
 *   umbrella dripping in its stand, sacks against the right wall and a broom.
 * Nothing dates the room (the same shop from 1980 to 2026): no prices, no calendars, no readable words but the signs'
 * invented names. Each thing is ink under washes, lit from the upper left, and no two alike.
 */
import { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { BOARD } from './geom';
import { INK, LIGHT, SHADE, blobPoly, mix, mottle, pen, penPath, plank, rectPoly, ribbon, wash } from './paint';

const TAU = Math.PI * 2;
const RUST = '#8A4A24';
const IRON = '#2A2622';

/* ------------------------------------------------------------------ helpers */

/** a rounded rectangle as a polygon (a hand's corners: the radius a little uneven) */
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, rnd: Rand, jit = 0.25): number[] {
  const out: number[] = [];
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -Math.PI / 2],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, Math.PI / 2],
    [x0 + r, y0 + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    const rr = r * rnd.range(0.85, 1.15);
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * rr + rnd.range(-jit, jit) * 0.4, cy + Math.sin(a) * rr + rnd.range(-jit, jit) * 0.4);
    }
  }
  return out;
}

function ellipsePoly(cx: number, cy: number, rx: number, ry: number, n = 36): number[] {
  const o: number[] = [];
  for (let k = 0; k < n; k++) o.push(cx + Math.cos((k / n) * TAU) * rx, cy + Math.sin((k / n) * TAU) * ry);
  return o;
}

/** a thing's shadow on the wall: down and to the right of it (the light is upper left), soft */
function wallShadow(ctx: CanvasRenderingContext2D, poly: number[], dx: number, dy: number, a: number, blur = 1.8): void {
  const S = ctx.getTransform().a;
  ctx.save();
  ctx.filter = `blur(${Math.max(0.8, blur * S)}px)`;
  ctx.fillStyle = `rgba(40,24,14,${a})`;
  tracePoly(
    ctx,
    poly.map((v, i) => v + (i % 2 === 0 ? dx : dy)),
  );
  ctx.fill();
  ctx.restore();
}

/** a nail or a tack in the wall, with its tiny shadow */
function nail(ctx: CanvasRenderingContext2D, x: number, y: number, r = 1.1): void {
  ctx.fillStyle = 'rgba(40,24,14,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 0.9, y + 1.2, r * 1.1, r * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(IRON, 0.9);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba('#B8AE9C', 0.6);
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, TAU);
  ctx.fill();
}

/** letters laid by hand along a baseline, centred on cx, tracked out */
function letters(ctx: CanvasRenderingContext2D, txt: string, cx: number, y: number, px: number, track: number, font: string, col: string, key: string | null, squash = 1): void {
  ctx.save();
  ctx.font = `${font.replace('{px}', String(px))}`;
  ctx.textBaseline = 'alphabetic';
  const ws = Array.from(txt, (ch) => ctx.measureText(ch).width * squash);
  const total = ws.reduce((a, b) => a + b, 0) + track * (txt.length - 1);
  let x = cx - total / 2;
  Array.from(txt).forEach((ch, i) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, 1);
    if (key) {
      ctx.fillStyle = key;
      ctx.fillText(ch, 0.45, 0.45);
    }
    ctx.fillStyle = col;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    x += ws[i]! + track;
  });
  ctx.restore();
}

/* ------------------------------------------------------------------ enamel signs */

interface Sign {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ground: string;
  ink: string;
  border: string;
  /** each line: text, cap height as a fraction of the sign's height, the baseline's place (0 top … 1 bottom) */
  lines: [string, number, number][];
  font: string;
  tilt: number;
  oval?: boolean;
  seed: number;
  squash?: number;
}

const SANS = '800 {px}px "Figtree Variable","Figtree","Trebuchet MS",Arial,sans-serif';
const SERIF = '700 {px}px "Libre Caslon Display","Libre Caslon Text",Georgia,serif';

/**
 * A vitreous-enamel sign on its nails: the ground fired glossy but faded and grimed with years, a border, the lettering,
 * the lamp's sheen across the upper left, the rolled edge lit on top and dark below, chips knocked out to the black
 * iron (rust weeping from them and from the nail holes), and its shadow on the wall.
 */
function enamelSign(ctx: CanvasRenderingContext2D, s: Sign): void {
  const rnd = new Rand(s.seed);
  const cx = (s.x0 + s.x1) / 2;
  const cy = (s.y0 + s.y1) / 2;
  const w = s.x1 - s.x0;
  const h = s.y1 - s.y0;
  const poly = s.oval ? ellipsePoly(cx, cy, w / 2, h / 2, 44) : roundRect(s.x0, s.y0, s.x1, s.y1, Math.min(w, h) * 0.09, rnd);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(s.tilt);
  ctx.translate(-cx, -cy);
  wallShadow(ctx, poly, 2.2, 3, 0.4);
  // the ground: glossy enamel, but a little uneven where it faded and where the grime settled low
  wash(ctx, poly, s.ground, 0.98, rnd, 3, 0.004);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  mottle(ctx, s.x0, s.y0, s.x1, s.y1, [mix(s.ground, '#FFF4DC', 0.14), mix(s.ground, '#3A2A20', 0.16), mix(s.ground, '#8A9AA8', 0.1), s.ground], s.seed + 1, 0.3, Math.max(8, h * 0.35), 1.6);
  const grime = ctx.createLinearGradient(0, s.y0, 0, s.y1);
  grime.addColorStop(0, 'rgba(255,244,220,0.08)');
  grime.addColorStop(0.6, 'rgba(60,40,24,0)');
  grime.addColorStop(1, 'rgba(60,40,24,0.22)');
  ctx.fillStyle = grime;
  ctx.fillRect(s.x0, s.y0, w, h);
  // the border: a band, and a hairline inside it
  const inset = Math.min(w, h) * 0.085;
  const band = s.oval ? ellipsePoly(cx, cy, w / 2 - inset, h / 2 - inset, 44) : roundRect(s.x0 + inset, s.y0 + inset, s.x1 - inset, s.y1 - inset, Math.min(w, h) * 0.06, rnd, 0.1);
  ctx.strokeStyle = rgba(s.border, 0.92);
  ctx.lineWidth = Math.max(1.1, Math.min(w, h) * 0.045);
  tracePoly(ctx, band);
  ctx.stroke();
  const hair = s.oval ? ellipsePoly(cx, cy, w / 2 - inset * 1.9, h / 2 - inset * 1.9, 44) : roundRect(s.x0 + inset * 1.75, s.y0 + inset * 1.75, s.x1 - inset * 1.75, s.y1 - inset * 1.75, Math.min(w, h) * 0.04, rnd, 0.1);
  ctx.strokeStyle = rgba(s.border, 0.6);
  ctx.lineWidth = 0.4;
  tracePoly(ctx, hair);
  ctx.stroke();
  // the lettering: the colour with a keyline offset below right (the sign-writer's shadow)
  for (const [txt, cap, base] of s.lines) {
    const px = h * cap * 1.38;
    letters(ctx, txt, cx, s.y0 + h * base, px, px * 0.08, s.font, rgba(s.ink, 0.96), rgba(mix(s.ground, '#100808', 0.55), 0.7), s.squash ?? 1);
  }
  // the lamp's sheen: a broad soft pale stroke across the upper left, and the gloss broken where the enamel crazed
  ctx.fillStyle = rgba('#FFF6E0', 0.16);
  ribbon(ctx, [s.x0 + w * 0.06, s.y0 + h * 0.62, s.x0 + w * 0.22, s.y0 + h * 0.3, s.x0 + w * 0.42, s.y0 + h * 0.1], h * 0.32, 0.85);
  ctx.fillStyle = rgba('#FFF6E0', 0.12);
  ribbon(ctx, [s.x0 + w * 0.5, s.y0 + h * 0.85, s.x0 + w * 0.62, s.y0 + h * 0.2], h * 0.1, 0.9);
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(s.x0, s.x1);
    const y = rnd.range(s.y0, s.y1);
    ctx.strokeStyle = rgba('#20140C', rnd.range(0.06, 0.12));
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rnd.range(-6, 6), y + rnd.range(-3, 3));
    ctx.stroke();
  }
  ctx.restore();
  // the rolled edge: lit on the top and the left, in shade below and right
  ctx.strokeStyle = rgba('#FFF2D8', 0.35);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  if (s.oval) ctx.ellipse(cx, cy, w / 2 - 0.5, h / 2 - 0.5, 0, Math.PI * 0.95, Math.PI * 1.7);
  else {
    ctx.moveTo(s.x0 + 2, s.y1 - h * 0.3);
    ctx.lineTo(s.x0 + 0.6, s.y0 + 2);
    ctx.lineTo(s.x0 + w * 0.7, s.y0 + 0.6);
  }
  ctx.stroke();
  // chips knocked out to the iron, mostly at the edges and round the nails, each with its rust halo
  const nails: [number, number][] = s.oval
    ? [
        [cx, s.y0 + inset * 0.55],
        [cx, s.y1 - inset * 0.55],
      ]
    : [
        [s.x0 + inset * 0.6, cy],
        [s.x1 - inset * 0.6, cy],
      ];
  const chips = rnd.int(4, 7);
  for (let i = 0; i < chips; i++) {
    let x: number;
    let y: number;
    if (i < 2) {
      const n = nails[i]!;
      x = n[0] + rnd.range(-2.5, 2.5);
      y = n[1] + rnd.range(-2, 2);
    } else {
      const t = rnd.next();
      const side = rnd.int(0, 3);
      x = side === 0 ? s.x0 + 1 + rnd.range(0, 3) : side === 1 ? s.x1 - 1 - rnd.range(0, 3) : s.x0 + w * t;
      y = side === 2 ? s.y0 + 1 + rnd.range(0, 3) : side === 3 ? s.y1 - 1 - rnd.range(0, 3) : s.y0 + h * t;
      if (s.oval) {
        const a = rnd.range(0, TAU);
        x = cx + Math.cos(a) * (w / 2 - rnd.range(1, 3));
        y = cy + Math.sin(a) * (h / 2 - rnd.range(1, 3));
      }
    }
    const r = rnd.range(0.9, 2.4);
    ctx.fillStyle = rgba(RUST, 0.45);
    tracePoly(ctx, deform(blobPoly(x, y, r * 1.7, r * 1.4, rnd, 9, 0.35), rnd, 1, 0.15));
    ctx.fill();
    ctx.fillStyle = rgba(IRON, 0.9);
    tracePoly(ctx, deform(blobPoly(x, y, r, r * 0.8, rnd, 8, 0.35), rnd, 1, 0.15));
    ctx.fill();
    ctx.fillStyle = rgba('#FFF0D0', 0.35);
    ribbon(ctx, [x - r * 0.8, y - r * 0.8, x + r * 0.5, y - r], 0.35, 0.8);
  }
  // the nails, and the rust they wept down the enamel
  for (const [nx, ny] of nails) {
    ctx.fillStyle = rgba(RUST, 0.3);
    ribbon(ctx, [nx, ny + 1, nx + rnd.range(-0.5, 0.5), ny + rnd.range(5, 11)], rnd.range(1, 1.8), 0.9);
    nail(ctx, nx, ny, 1);
  }
  // ink, broken, stated on the shaded edges
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  const n = poly.length / 2;
  for (let k = 0; k < n; k++) {
    const x = poly[k * 2]!;
    const y = poly[k * 2 + 1]!;
    const shaded = x - cx > -w * 0.2 && y - cy > -h * 0.6;
    if (shaded && rnd.chance(0.85)) {
      ctx.moveTo(x, y);
      const x2 = poly[((k + 1) % n) * 2]!;
      const y2 = poly[((k + 1) % n) * 2 + 1]!;
      ctx.lineTo(x2, y2);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ the clock */

/** a school clock on the wall: a mahogany case, a brass bezel, an aged face; it says a little after eight, the shop
 *  just open */
function clock(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const rnd = new Rand(6060);
  wallShadow(ctx, ellipsePoly(cx, cy, r, r), 2.6, 3.4, 0.42, 2.2);
  wash(ctx, ellipsePoly(cx, cy, r, r, 40), '#5A3020', 0.98, rnd, 3, 0.005);
  ctx.save();
  tracePoly(ctx, ellipsePoly(cx, cy, r, r));
  ctx.clip();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, 'rgba(214,140,90,0.45)');
  g.addColorStop(0.5, 'rgba(120,60,40,0)');
  g.addColorStop(1, 'rgba(20,8,6,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  // the bezel
  ctx.strokeStyle = rgba('#B8913E', 0.95);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba('#F6DA8A', 0.6);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.81, Math.PI * 0.95, Math.PI * 1.6);
  ctx.stroke();
  // the face: cream gone ivory, a tide-mark of damp low on it
  const fr = r * 0.76;
  wash(ctx, ellipsePoly(cx, cy, fr, fr, 36), '#E9DEC0', 0.98, rnd, 2, 0.004);
  ctx.save();
  tracePoly(ctx, ellipsePoly(cx, cy, fr, fr));
  ctx.clip();
  mottle(ctx, cx - fr, cy - fr, cx + fr, cy + fr, ['#E0D2AE', '#D6C8A4', '#EDE4CC'], 6061, 0.35, fr * 0.5, 1.2);
  ctx.fillStyle = rgba('#B49A6A', 0.18);
  tracePoly(ctx, deform(blobPoly(cx + fr * 0.2, cy + fr * 0.7, fr * 0.7, fr * 0.3, rnd, 12, 0.2), rnd, 2, 0.08));
  ctx.fill();
  ctx.restore();
  // minute ticks and the hour bars, a hair uneven
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * TAU + rnd.range(-0.006, 0.006);
    const hour = k % 5 === 0;
    const r0 = fr * (hour ? 0.72 : 0.86);
    pen(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * fr * 0.93, cy + Math.sin(a) * fr * 0.93, hour ? 1.05 : 0.3, '#1E1814', hour ? 0.85 : 0.5, rnd, 0.02);
  }
  // the hands: a little after eight
  const hand = (a: number, len: number, wid: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.fillStyle = rgba('#1A1410', 0.92);
    tracePoly(ctx, [cx - c * len * 0.15 - s * wid * 0.5, cy - s * len * 0.15 + c * wid * 0.5, cx + c * len * 0.7 - s * wid, cy + s * len * 0.7 + c * wid, cx + c * len, cy + s * len, cx + c * len * 0.7 + s * wid, cy + s * len * 0.7 - c * wid, cx - c * len * 0.15 + s * wid * 0.5, cy - s * len * 0.15 - c * wid * 0.5]);
    ctx.fill();
  };
  hand(((8 + 7 / 60) / 12) * TAU - Math.PI / 2, fr * 0.5, 1.4);
  hand((7 / 60) * TAU - Math.PI / 2, fr * 0.78, 1);
  ctx.fillStyle = rgba('#7A2A22', 0.9);
  ctx.beginPath();
  ctx.arc(cx, cy, 1.2, 0, TAU);
  ctx.fill();
  // the glass: a curved glint, and the shade of the case's rim on the face
  ctx.fillStyle = rgba('#FFFFFF', 0.28);
  ribbon(ctx, [cx - fr * 0.75, cy - fr * 0.05, cx - fr * 0.6, cy - fr * 0.55, cx - fr * 0.15, cy - fr * 0.8], 2, 0.85);
  ctx.fillStyle = rgba('#3A2010', 0.18);
  ribbon(ctx, [cx + fr * 0.3, cy + fr * 0.85, cx + fr * 0.85, cy + fr * 0.3], 3, 0.8);
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -0.4, Math.PI * 0.85);
  ctx.stroke();
}

/* ------------------------------------------------------------------ on the shelves' cornice */

/** a square biscuit tin: a lid with a lip, a faded picture panel (a pattern, no words), a band of tartan */
function biscuitTin(ctx: CanvasRenderingContext2D, x0: number, base: number, w: number, h: number): void {
  const rnd = new Rand(7301);
  const y0 = base - h;
  wallShadow(ctx, [x0, y0, x0 + w, y0, x0 + w, base, x0, base], 2, 1.5, 0.35);
  const body = '#6E2A2A';
  wash(ctx, rectPoly(x0, y0 + 4, x0 + w, base, rnd, 0.25), body, 0.97, rnd, 3, 0.01);
  // the picture panel: a cottage garden gone soft (shapes only)
  const px0 = x0 + 4;
  const px1 = x0 + w - 4;
  const py0 = y0 + 8;
  const py1 = base - 6;
  wash(ctx, rectPoly(px0, py0, px1, py1, rnd, 0.2), '#D8C79A', 0.95, rnd, 2, 0.01);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px0, py0, px1 - px0, py1 - py0);
  ctx.clip();
  ctx.fillStyle = rgba('#8FA6B8', 0.6);
  ctx.fillRect(px0, py0, px1 - px0, (py1 - py0) * 0.45);
  ctx.fillStyle = rgba('#6E8A4C', 0.75);
  tracePoly(ctx, deform([px0, py1, px0, py0 + (py1 - py0) * 0.5, px0 + 10, py0 + (py1 - py0) * 0.4, px1, py0 + (py1 - py0) * 0.55, px1, py1], rnd, 2, 0.06));
  ctx.fill();
  ctx.fillStyle = rgba('#E8DCC0', 0.9);
  ctx.fillRect(px0 + (px1 - px0) * 0.45, py0 + (py1 - py0) * 0.38, 9, 6);
  ctx.fillStyle = rgba('#9A4A34', 0.9);
  tracePoly(ctx, [px0 + (px1 - px0) * 0.45 - 1, py0 + (py1 - py0) * 0.38, px0 + (px1 - px0) * 0.45 + 4.5, py0 + (py1 - py0) * 0.24, px0 + (px1 - px0) * 0.45 + 10, py0 + (py1 - py0) * 0.38]);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#C9573E', '#E2B04A', '#E8D8E0']), 0.8);
    ctx.beginPath();
    ctx.arc(rnd.range(px0 + 2, px1 - 2), rnd.range(py1 - 6, py1 - 1.5), rnd.range(0.7, 1.3), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  pen(ctx, px0, py0, px1, py0, 0.4, '#C9A04A', 0.8, rnd, 0.05);
  pen(ctx, px0, py1, px1, py1, 0.4, '#C9A04A', 0.8, rnd, 0.05);
  // tartan band at the foot
  for (let x = x0 + 0.5; x < x0 + w - 1; x += 3.2) {
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#2E4A3A' : '#C9A04A', 0.5);
    ctx.fillRect(x, base - 4.5, 1.2, 4);
  }
  // the lid
  wash(ctx, rectPoly(x0 - 1, y0, x0 + w + 1, y0 + 5, rnd, 0.2), mix(body, '#C9A04A', 0.2), 0.97, rnd, 2, 0.01);
  ctx.fillStyle = rgba('#F2D8A0', 0.5);
  ribbon(ctx, [x0, y0 + 0.6, x0 + w, y0 + 0.6], 0.8, 0.9);
  ctx.fillStyle = rgba(LIGHT, 0.22);
  ribbon(ctx, [x0 + 1.5, y0 + 6, x0 + 1.5, base - 1], 1.6, 0.8);
  ctx.fillStyle = rgba(SHADE, 0.35);
  ribbon(ctx, [x0 + w - 1.6, y0 + 6, x0 + w - 1.6, base - 1], 2.4, 0.8);
  pen(ctx, x0 + w, y0 + 1, x0 + w, base, 0.6, INK, 0.6, rnd, 0.15);
  pen(ctx, x0, base, x0 + w, base, 0.6, INK, 0.6, rnd, 0.15);
  pen(ctx, x0 - 1, y0 + 5, x0 + w + 1, y0 + 5, 0.45, INK, 0.5, rnd, 0.1);
}

/** a wicker basket with a hoop handle, upturned bread-baskets nested in it */
function wickerBasket(ctx: CanvasRenderingContext2D, x0: number, base: number, w: number, h: number): void {
  const rnd = new Rand(7302);
  const x1 = x0 + w;
  const top = base - h;
  const cx = (x0 + x1) / 2;
  // the handle behind first: a hoop of cane
  ctx.strokeStyle = rgba('#8A6232', 0.95);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(cx, top + 1, w * 0.36, h * 1.45, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba('#D8B47A', 0.6);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, top + 1, w * 0.36 - 0.6, h * 1.45 - 0.6, 0, Math.PI * 1.05, Math.PI * 1.55);
  ctx.stroke();
  for (let a = Math.PI * 1.05; a < TAU - 0.05; a += 0.16) {
    const x = cx + Math.cos(a) * w * 0.36;
    const y = top + 1 + Math.sin(a) * h * 1.45;
    pen(ctx, x - 1, y - 0.6, x + 1, y + 0.6, 0.35, '#4A3018', 0.5, rnd, 0.02);
  }
  const body = [x0, top, x1, top, x1 - 4, base, x0 + 4, base];
  wallShadow(ctx, body, 2, 1.5, 0.3);
  wash(ctx, body, '#A87A44', 0.96, rnd, 3, 0.01);
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  // the weave: rows of short bowed strokes, alternate rows offset, lit on top of each
  for (let y = top + 2; y < base; y += 2.8) {
    const off = Math.round((y - top) / 2.8) % 2 ? 2.4 : 0;
    for (let x = x0 - 2 + off; x < x1 + 2; x += 4.8) {
      ctx.fillStyle = rgba('#5A3A1A', 0.32);
      ribbon(ctx, [x, y + 1.2, x + 2.4, y + 0.2, x + 4.6, y + 1.2], 0.6, 0.8);
      ctx.fillStyle = rgba('#E8C890', 0.28);
      ribbon(ctx, [x + 0.6, y - 0.3, x + 2.4, y - 0.8, x + 4, y - 0.3], 0.5, 0.8);
    }
  }
  const sh = ctx.createLinearGradient(x0, 0, x1, 0);
  sh.addColorStop(0, 'rgba(255,230,180,0.12)');
  sh.addColorStop(0.5, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(40,20,10,0.35)');
  ctx.fillStyle = sh;
  ctx.fillRect(x0, top, w, h);
  ctx.restore();
  // the rim: a thick rolled band
  wash(ctx, rectPoly(x0 - 1, top - 1.5, x1 + 1, top + 2, rnd, 0.3), '#8A6232', 0.97, rnd, 2, 0.02);
  for (let x = x0; x < x1; x += 2.2) pen(ctx, x, top - 1.3, x + 1.6, top + 1.8, 0.35, '#3A2410', 0.45, rnd, 0.02);
  pen(ctx, x1, top, x1 - 4, base, 0.6, INK, 0.55, rnd, 0.15);
  pen(ctx, x0 + 4, base, x1 - 4, base, 0.6, INK, 0.6, rnd, 0.15);
}

/** a stoneware crock: cream glaze below, the brown salt-glaze dipped round its shoulder, a lid with a knob */
function crock(ctx: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number): void {
  const rnd = new Rand(7303);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const top = base - h;
  const body: number[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const bulge = Math.sin(Math.PI * (0.15 + t * 0.75)) * 2.2;
    body.push(x1 - 2 + bulge, top + 4 + t * (h - 4));
  }
  for (let k = 12; k >= 0; k--) {
    const t = k / 12;
    const bulge = Math.sin(Math.PI * (0.15 + t * 0.75)) * 2.2;
    body.push(x0 + 2 - bulge, top + 4 + t * (h - 4));
  }
  wallShadow(ctx, body, 2.2, 1.2, 0.32);
  wash(ctx, body, '#DCCDA8', 0.97, rnd, 3, 0.008);
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  // the dip: the brown glaze, its lower edge drippy where it ran in the kiln
  const dip: number[] = [x0 - 4, top];
  for (let x = x0 - 4; x <= x1 + 4; x += 2) dip.push(x, top + h * 0.36 + Math.sin(x * 0.9) * 0.8 + (rnd.chance(0.2) ? rnd.range(1, 3.5) : 0));
  dip.push(x1 + 4, top);
  ctx.fillStyle = rgba('#7A4A26', 0.95);
  tracePoly(ctx, dip);
  ctx.fill();
  const rs = ctx.createLinearGradient(x0, 0, x1, 0);
  rs.addColorStop(0, 'rgba(255,240,210,0.3)');
  rs.addColorStop(0.35, 'rgba(255,240,210,0)');
  rs.addColorStop(1, 'rgba(40,24,30,0.4)');
  ctx.fillStyle = rs;
  ctx.fillRect(x0 - 4, top, w + 8, h);
  ctx.restore();
  // the lid, the knob
  wash(ctx, [x0 + 1, top + 4.5, x1 - 1, top + 4.5, x1 - 3, top + 1, x0 + 3, top + 1], '#6A3E20', 0.97, rnd, 2, 0.02);
  wash(ctx, ellipsePoly(cx, top - 0.5, 3.2, 2, 12), '#6A3E20', 0.97, rnd, 2, 0.02);
  ctx.fillStyle = rgba('#F6E8C8', 0.5);
  ribbon(ctx, [x0 + 3.5, top + 7, x0 + 2.6, top + h * 0.6, x0 + 3.5, base - 2], 1.6, 0.85);
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.55;
  tracePoly(ctx, body.slice(0, 26));
  ctx.stroke();
}

/* ------------------------------------------------------------------ strings of onions and garlic */

/** one dry bulb on its string: an onion (or a garlic head when `garlic`), its papery skin's meridians, lit upper left */
function bulb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, rnd: Rand, garlic: boolean): void {
  const pts: number[] = [];
  const n = 18;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU - Math.PI / 2;
    // a neck pulled up into the plait, the root end flattened
    const up = Math.max(0, -Math.sin(a));
    const neck = garlic ? Math.pow(up, 10) * 0.55 : Math.pow(up, 8) * 0.75;
    const flat = Math.max(0, Math.sin(a)) * (garlic ? 0.18 : 0.08);
    const rr = r * (1 + neck - flat) * rnd.range(0.96, 1.04);
    pts.push(x + Math.cos(a) * rr * (garlic ? 1.04 : 1), y + Math.sin(a) * rr * 0.94);
  }
  const p = deform(pts, rnd, 1, 0.02);
  wash(ctx, p, col, 0.96, rnd, 3, 0.01);
  ctx.save();
  tracePoly(ctx, p);
  ctx.clip();
  // the skin's lines from the neck to the root, curving round the bulb
  const lines = garlic ? 6 : 5;
  for (let i = 0; i < lines; i++) {
    const u = (i + 0.5) / lines - 0.5;
    const pts2: number[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const yy = y - r * 1.05 + t * r * 1.95;
      const wdt = Math.sin(Math.PI * Math.min(1, t * 1.05)) * r;
      pts2.push(x + u * 2 * wdt * 0.95, yy);
    }
    ctx.fillStyle = rgba(garlic ? '#8A6A8A' : mix(col, '#3A1C0C', 0.5), garlic ? 0.3 : 0.32);
    ribbon(ctx, pts2, garlic ? 0.55 : 0.4, 0.9);
  }
  // the light on the upper left, the shade on the lower right, papery flakes catching the lamp
  ctx.fillStyle = rgba(garlic ? '#FFFFFF' : '#FFE6B0', garlic ? 0.4 : 0.32);
  tracePoly(ctx, deform(blobPoly(x - r * 0.35, y - r * 0.3, r * 0.5, r * 0.42, rnd, 9, 0.2), rnd, 1, 0.08));
  ctx.fill();
  ctx.fillStyle = rgba(mix(col, SHADE, 0.6), 0.45);
  tracePoly(ctx, deform(blobPoly(x + r * 0.55, y + r * 0.45, r * 0.6, r * 0.55, rnd, 9, 0.2), rnd, 1, 0.08));
  ctx.fill();
  ctx.restore();
  // the root's dry whiskers
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + rnd.range(-0.7, 0.7);
    pen(ctx, x + rnd.range(-r * 0.2, r * 0.2), y + r * 0.86, x + Math.cos(a) * r * 0.55, y + r * 0.86 + Math.sin(a) * r * 0.45, 0.3, '#6A5038', 0.6, rnd, 0.05);
  }
  // ink on the shaded side
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  for (let k = 3; k <= 12; k++) {
    const xx = p[(k * 2) % p.length]!;
    const yy = p[(k * 2 + 1) % p.length]!;
    if (k === 3) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
}

/** a string of bulbs hung from a nail: a plait of their dry tops down the middle, the bulbs round it, biggest at the top */
function bulbString(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, garlic: boolean, seed: number): void {
  const rnd = new Rand(seed);
  nail(ctx, x, y0, 1.2);
  // the loop of twine over the nail
  ctx.strokeStyle = rgba('#B89A64', 0.9);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - 2.4, y0 + 7);
  ctx.quadraticCurveTo(x - 1.5, y0 - 1.6, x, y0 - 1.2);
  ctx.quadraticCurveTo(x + 1.6, y0 - 1.6, x + 2.4, y0 + 7);
  ctx.stroke();
  // the plait: three strands crossing down the string
  const top = y0 + 6;
  for (let s = 0; s < 3; s++) {
    const pts: number[] = [];
    for (let y = top; y <= y1 - 4; y += 2) pts.push(x + Math.sin((y - top) * 0.32 + (s * TAU) / 3) * 2.4, y);
    ctx.fillStyle = rgba(mix('#C8AA70', '#8A6A3A', s * 0.3), 0.9);
    ribbon(ctx, pts, 1.5, 0.3);
  }
  // the bulbs, spiralling round the plait; those behind first, a little darker
  const n = garlic ? 13 : 16;
  const items: { x: number; y: number; r: number; back: boolean; col: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ang = i * 2.35 + rnd.range(-0.3, 0.3);
    const spread = (garlic ? 5.5 : 7.5) * (1 - t * 0.45);
    const r = (garlic ? 5.4 - t * 1.4 : 7.6 - t * 2.6) * rnd.range(0.86, 1.12);
    const col = garlic ? rnd.pick(['#E6DCC8', '#DDD0BC', '#EAE0D0', '#D8C8C0']) : rnd.chance(0.16) ? rnd.pick(['#8A3448', '#7A2C42']) : rnd.pick(['#B8732E', '#C98A3E', '#A8602A', '#D29A50', '#B67A3A']);
    items.push({ x: x + Math.sin(ang) * spread, y: top + 6 + t * (y1 - top - 12) + rnd.range(-1.5, 1.5), r, back: Math.cos(ang) < -0.2, col });
  }
  for (const pass of [true, false]) {
    for (const it of items) {
      if (it.back !== pass) continue;
      bulb(ctx, it.x, it.y, it.r, pass ? mix(it.col, SHADE, 0.2) : it.col, rnd, garlic);
    }
  }
  // a few dry papery flakes caught in the plait
  for (let i = 0; i < 4; i++) {
    const fy = rnd.range(top + 8, y1 - 8);
    ctx.fillStyle = rgba(garlic ? '#EDE6D8' : '#D8A868', 0.7);
    tracePoly(ctx, deform(blobPoly(x + rnd.range(-6, 6), fy, rnd.range(1, 2), rnd.range(0.6, 1.2), rnd, 6, 0.3), rnd, 1, 0.1));
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ the thermometer */

/** an enamel thermometer between the door and the window: cream with a red border, the glass tube and its red column */
function thermometer(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const rnd = new Rand(7401);
  const poly = roundRect(x0, y0, x1, y1, 3, rnd);
  wallShadow(ctx, poly, 1.6, 2.4, 0.38);
  wash(ctx, poly, '#E6DCC0', 0.97, rnd, 3, 0.004);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  mottle(ctx, x0, y0, x1, y1, ['#DDD2B2', '#EAE2CA', '#D2C6A6'], 7402, 0.35, 8, 1);
  ctx.restore();
  ctx.strokeStyle = rgba('#9A2E26', 0.9);
  ctx.lineWidth = 1.3;
  tracePoly(ctx, roundRect(x0 + 1.6, y0 + 1.6, x1 - 1.6, y1 - 1.6, 2, rnd, 0.05));
  ctx.stroke();
  // a red cap at the top, a blue band at the foot (the maker's colours; no words)
  wash(ctx, roundRect(x0 + 2.6, y0 + 3, x1 - 2.6, y0 + 16, 1.5, rnd, 0.05), '#9A2E26', 0.95, rnd, 2, 0.01);
  wash(ctx, roundRect(x0 + 2.6, y1 - 18, x1 - 2.6, y1 - 3, 1.5, rnd, 0.05), '#2E4A72', 0.95, rnd, 2, 0.01);
  ctx.fillStyle = rgba('#F2E6C2', 0.85);
  ctx.beginPath();
  ctx.arc((x0 + x1) / 2, y1 - 10.5, 2.4, 0, TAU);
  ctx.fill();
  // the tube, the bulb at its foot, the column (a cool morning)
  const tx = (x0 + x1) / 2;
  wash(ctx, rectPoly(tx - 1.1, y0 + 20, tx + 1.1, y1 - 24, rnd, 0.05), '#F6F2EA', 0.9, rnd, 2, 0.01);
  ctx.fillStyle = rgba('#B8261E', 0.95);
  ctx.fillRect(tx - 0.45, y0 + (y1 - y0) * 0.52, 0.9, y1 - 24 - (y0 + (y1 - y0) * 0.52));
  ctx.beginPath();
  ctx.arc(tx, y1 - 24, 1.8, 0, TAU);
  ctx.fill();
  for (let y = y0 + 22; y < y1 - 26; y += 3.4) {
    const long = Math.round((y - y0) / 3.4) % 5 === 0;
    pen(ctx, tx + 1.8, y, tx + (long ? 4.6 : 3.2), y, 0.3, '#2A2018', 0.6, rnd, 0.02);
    pen(ctx, tx - 1.8, y, tx - (long ? 4.6 : 3.2), y, 0.3, '#2A2018', 0.6, rnd, 0.02);
  }
  ctx.fillStyle = rgba(LIGHT, 0.4);
  ribbon(ctx, [tx - 0.6, y0 + 21, tx - 0.6, y1 - 26], 0.4, 0.9);
  for (const ny of [y0 + 1.8, y1 - 1.8]) nail(ctx, tx, ny, 0.8);
  pen(ctx, x1, y0 + 3, x1, y1 - 2, 0.5, INK, 0.5, rnd, 0.1);
  pen(ctx, x0 + 2, y1, x1 - 2, y1, 0.5, INK, 0.5, rnd, 0.1);
}

/* ------------------------------------------------------------------ the right wall */

/** a cork board in a thin oak frame, a few cards pinned to it (a lost cat, a room to let, a knitting circle: their
 *  writing a scrawl, never words), a tear-off card with half its tabs taken */
function corkBoard(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const rnd = new Rand(8101);
  wallShadow(ctx, [x0, y0, x1, y0, x1, y1, x0, y1], 2.2, 3, 0.42);
  const f = 4.5;
  // the cork: a warm granular field
  wash(ctx, rectPoly(x0 + f, y0 + f, x1 - f, y1 - f, rnd, 0.2), '#B07E50', 0.97, rnd, 2, 0.006);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + f, y0 + f, x1 - x0 - 2 * f, y1 - y0 - 2 * f);
  ctx.clip();
  mottle(ctx, x0, y0, x1, y1, ['#A87448', '#BC8C5C', '#9A6A40', '#C49866'], 8102, 0.4, 12, 1.3);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = rgba(rnd.chance(0.55) ? '#5A3A1C' : '#E2BC8A', rnd.range(0.2, 0.5));
    ctx.fillRect(rnd.range(x0, x1), rnd.range(y0, y1), rnd.range(0.3, 0.8), rnd.range(0.3, 0.7));
  }
  // old pin holes and the pale ghosts of cards long gone
  for (let i = 0; i < 3; i++) {
    const gx = rnd.range(x0 + 8, x1 - 24);
    const gy = rnd.range(y0 + 8, y1 - 20);
    ctx.fillStyle = rgba('#D8B080', 0.22);
    ctx.fillRect(gx, gy, rnd.range(14, 22), rnd.range(10, 16));
  }
  ctx.restore();
  // the frame
  const oak = '#7A5234';
  plank(ctx, x0, y0, x1, y0 + f, oak, rnd, { grain: 0.5 });
  plank(ctx, x0, y1 - f, x1, y1, mix(oak, '#3A2414', 0.2), rnd, { grain: 0.5 });
  plank(ctx, x0, y0 + f, x0 + f, y1 - f, oak, rnd, { vertical: true, grain: 0.5 });
  plank(ctx, x1 - f, y0 + f, x1, y1 - f, mix(oak, '#3A2414', 0.2), rnd, { vertical: true, grain: 0.5 });
  pen(ctx, x0 + f, y0 + f, x1 - f, y0 + f, 0.45, INK, 0.5, rnd, 0.1);
  pen(ctx, x0 + f, y0 + f, x0 + f, y1 - f, 0.45, INK, 0.5, rnd, 0.1);
  // the cards
  interface Card {
    x: number;
    y: number;
    w: number;
    h: number;
    rot: number;
    col: string;
    pin: string;
    kind: 'note' | 'tabs' | 'receipt' | 'folded';
  }
  const cards: Card[] = [
    { x: x0 + 9, y: y0 + 9, w: 28, h: 19, rot: -0.06, col: '#EFE6CC', pin: '#B8261E', kind: 'note' },
    { x: x0 + 42, y: y0 + 7, w: 22, h: 30, rot: 0.05, col: '#D6E0E4', pin: '#2E5A9A', kind: 'tabs' },
    { x: x1 - 25, y: y0 + 10, w: 13, h: 34, rot: -0.03, col: '#F2EEE2', pin: '#D8A82E', kind: 'receipt' },
    { x: x0 + 11, y: y0 + 33, w: 25, h: 21, rot: 0.04, col: '#EADBA6', pin: '#3A7A4A', kind: 'folded' },
    { x: x0 + 40, y: y0 + 42, w: 27, h: 18, rot: -0.08, col: '#E8C8BA', pin: '#B8261E', kind: 'note' },
  ];
  for (const c of cards) {
    const cr = new Rand(8200 + Math.round(c.x * 3 + c.y));
    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y);
    ctx.rotate(c.rot);
    ctx.translate(-(c.x + c.w / 2), -c.y);
    const poly = rectPoly(c.x, c.y, c.x + c.w, c.y + c.h, cr, 0.25);
    wallShadow(ctx, poly, 0.9, 1.4, 0.4, 0.8);
    wash(ctx, poly, c.col, 0.97, cr, 2, 0.008);
    // the card curls a little at its free corners: a soft shade there, light on the curl
    ctx.fillStyle = rgba(SHADE, 0.16);
    ribbon(ctx, [c.x + c.w - 0.8, c.y + c.h * 0.4, c.x + c.w - 0.8, c.y + c.h - 0.8, c.x + c.w * 0.5, c.y + c.h - 0.8], 1.6, 0.8);
    if (c.kind === 'receipt') {
      for (let y = c.y + 4; y < c.y + c.h - 3; y += 2.4) pen(ctx, c.x + 2, y, c.x + c.w - cr.range(2, 5), y, 0.3, '#5A5048', 0.45, cr, 0.05);
      // its torn foot
      ctx.fillStyle = rgba(c.col, 1);
      const zig: number[] = [c.x, c.y + c.h - 1];
      for (let x = c.x; x <= c.x + c.w; x += 1.6) zig.push(x, c.y + c.h + (Math.round(x * 3) % 2 ? 0.8 : -0.3));
      zig.push(c.x + c.w, c.y + c.h - 1);
      tracePoly(ctx, zig);
      ctx.fill();
    } else {
      // a scrawl of writing, two or three lines, a heading heavier
      const rows = c.kind === 'tabs' ? 3 : 3;
      for (let r = 0; r < rows; r++) {
        let x = c.x + 2.5 + cr.range(0, 2);
        const yy = c.y + 5 + r * 3.6;
        const end = c.x + c.w - cr.range(2.5, 6);
        while (x < end) {
          const l = cr.range(1.5, 5);
          pen(ctx, x, yy + cr.range(-0.3, 0.3), Math.min(end, x + l), yy + cr.range(-0.3, 0.3), r === 0 ? 0.55 : 0.32, r === 0 ? '#2A3A5A' : '#3A3430', 0.6, cr, 0.25);
          x += l + cr.range(0.8, 1.8);
        }
      }
      if (c.kind === 'tabs') {
        // the tear-off tabs: cut strips along the foot, some already taken
        const ty = c.y + c.h * 0.62;
        for (let k = 0; k < 6; k++) {
          const tx = c.x + 1 + k * ((c.w - 2) / 6);
          if (k === 1 || k === 4) {
            ctx.fillStyle = rgba('#9A6A40', 0.9);
            ctx.fillRect(tx + 0.3, ty + 0.5, (c.w - 2) / 6 - 0.6, c.h - (ty - c.y) + 0.5);
            continue;
          }
          pen(ctx, tx, ty, tx, c.y + c.h, 0.25, '#5A5048', 0.6, cr, 0.03);
          pen(ctx, tx + 1.2, ty + 1.5, tx + 1.2, c.y + c.h - 1.5, 0.25, '#3A3430', 0.5, cr, 0.05);
        }
        pen(ctx, c.x, ty, c.x + c.w, ty, 0.25, '#5A5048', 0.5, cr, 0.05);
      }
      if (c.kind === 'folded') {
        ctx.fillStyle = rgba(SHADE, 0.2);
        ctx.fillRect(c.x, c.y + c.h * 0.5, c.w, 0.8);
        ctx.fillStyle = rgba(LIGHT, 0.4);
        ctx.fillRect(c.x, c.y + c.h * 0.5 + 0.8, c.w, 0.6);
      }
    }
    pen(ctx, c.x + c.w, c.y, c.x + c.w, c.y + c.h, 0.35, INK, 0.45, cr, 0.05);
    pen(ctx, c.x, c.y + c.h, c.x + c.w, c.y + c.h, 0.35, INK, 0.45, cr, 0.05);
    // the pin
    const px = c.x + c.w / 2 + cr.range(-2, 2);
    const py = c.y + 2.2;
    ctx.fillStyle = 'rgba(30,16,8,0.4)';
    ctx.beginPath();
    ctx.ellipse(px + 1.2, py + 1.4, 1.7, 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(c.pin, 0.95);
    ctx.beginPath();
    ctx.arc(px, py, 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', 0.55);
    ctx.beginPath();
    ctx.arc(px - 0.5, py - 0.55, 0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // a spare pin, and a torn corner left behind by a card someone took
  nail(ctx, x1 - 12, y1 - 12, 0.9);
  ctx.fillStyle = rgba('#EFE6CC', 0.95);
  tracePoly(ctx, [x1 - 30, y1 - 22, x1 - 24, y1 - 22.5, x1 - 26, y1 - 18]);
  ctx.fill();
  nail(ctx, x1 - 27, y1 - 21, 0.7);
}

/** big glass jars on a little bracket shelf: pickled cucumbers, lemons in brine, honey, and a stone pot with its lid */
function jarShelf(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  const rnd = new Rand(8301);
  // the brackets, then the board
  for (const bx of [x0 + 8, x1 - 8]) {
    ctx.strokeStyle = rgba(IRON, 0.9);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(bx, y + 4);
    ctx.lineTo(bx, y + 18);
    ctx.moveTo(bx, y + 16);
    ctx.quadraticCurveTo(bx + 2, y + 6, bx + 12, y + 4);
    ctx.stroke();
    nail(ctx, bx, y + 15, 0.8);
  }
  wallShadow(ctx, [x0, y, x1, y, x1, y + 5, x0, y + 5], 2, 3, 0.45);
  plank(ctx, x0, y, x1, y + 5, '#7A5232', rnd, { grain: 0.8 });
  const jar = (x: number, w: number, h: number, liquid: string, things: (cx: number, base: number) => void, lid: string) => {
    const base = y;
    const top = base - h;
    const body = [x + 1.5, top + 4, x, top + 6.5, x, base - 2, x + 1.8, base, x + w - 1.8, base, x + w, base - 2, x + w, top + 6.5, x + w - 1.5, top + 4];
    wallShadow(ctx, body, 1.8, 1, 0.3);
    // the brine, the things in it, the glass over them
    wash(ctx, rectPoly(x + 0.8, top + 8, x + w - 0.8, base - 0.8, rnd, 0.2), liquid, 0.7, rnd, 2, 0.01);
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    things(x + w / 2, base);
    ctx.fillStyle = rgba(mix(liquid, '#FFFFFF', 0.4), 0.5);
    ctx.fillRect(x, top + 7.2, w, 0.9);
    ctx.restore();
    ctx.fillStyle = rgba('#FFFFFF', 0.4);
    ribbon(ctx, [x + 2, top + 7, x + 1.8, base - 3], 1.3, 0.85);
    ctx.fillStyle = rgba('#FFFFFF', 0.2);
    ribbon(ctx, [x + w - 3, top + 9, x + w - 3, top + 14], 0.8, 0.8);
    ctx.fillStyle = rgba(SHADE, 0.25);
    ribbon(ctx, [x + w - 1.4, top + 8, x + w - 1.2, base - 2], 1.8, 0.85);
    wash(ctx, rectPoly(x + 1.4, top, x + w - 1.4, top + 4.2, rnd, 0.15), lid, 0.97, rnd, 2, 0.01);
    ctx.fillStyle = rgba(LIGHT, 0.4);
    ctx.fillRect(x + 2, top + 0.6, (w - 4) * 0.5, 0.7);
    ctx.strokeStyle = rgba(INK, 0.45);
    ctx.lineWidth = 0.45;
    tracePoly(ctx, body);
    ctx.stroke();
  };
  let x = x0 + 3;
  // pickles
  jar(x, 15, 30, '#9AA868', (cx, base) => {
    for (let i = 0; i < 9; i++) {
      const px = cx + rnd.range(-5, 5);
      const py = base - rnd.range(4, 22);
      ctx.fillStyle = rgba(rnd.pick(['#4E6A2E', '#5E7A36', '#3E5A28']), 0.85);
      tracePoly(ctx, deform(blobPoly(px, py, rnd.range(1.6, 2.4), rnd.range(4, 6), rnd, 10, 0.12), rnd, 1, 0.05));
      ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = rgba('#E8E0B0', 0.5);
      ctx.beginPath();
      ctx.arc(cx + rnd.range(-6, 6), base - rnd.range(3, 22), rnd.range(0.4, 0.8), 0, TAU);
      ctx.fill();
    }
  }, '#8A8A80');
  x += 18;
  // lemons in brine
  jar(x, 14, 24, '#D8CC88', (cx, base) => {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = rgba(rnd.pick(['#D8B030', '#E2BE40', '#C89A28']), 0.9);
      ctx.beginPath();
      ctx.ellipse(cx + rnd.range(-4, 4), base - 3 - i * 3 + rnd.range(-1, 1), rnd.range(3, 4), rnd.range(2.4, 3), rnd.range(-0.4, 0.4), 0, TAU);
      ctx.fill();
    }
  }, '#C9A04A');
  x += 16.5;
  // honey
  jar(x, 12, 18, '#C88A28', (cx, base) => {
    const g = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
    g.addColorStop(0, 'rgba(240,190,90,0.6)');
    g.addColorStop(1, 'rgba(120,60,10,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 6, base - 12, 12, 12);
  }, '#E8DCC0');
  x += 14;
  // a stone pot with its lid
  const pw = 13;
  const ph = 15;
  const pot = [x + 1, y - ph + 2, x + pw - 1, y - ph + 2, x + pw, y - 1, x + pw - 1.5, y, x + 1.5, y, x, y - 1];
  wallShadow(ctx, pot, 1.8, 1, 0.3);
  wash(ctx, pot, '#8C7A64', 0.97, rnd, 3, 0.01);
  ctx.fillStyle = rgba('#F2E6CC', 0.28);
  ribbon(ctx, [x + 2.2, y - ph + 4, x + 2, y - 2], 1.8, 0.8);
  ctx.fillStyle = rgba(SHADE, 0.3);
  ribbon(ctx, [x + pw - 2, y - ph + 4, x + pw - 1.8, y - 2], 2.4, 0.8);
  wash(ctx, rectPoly(x, y - ph, x + pw, y - ph + 2.6, rnd, 0.15), '#6A5A48', 0.97, rnd, 2, 0.01);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.45;
  tracePoly(ctx, pot);
  ctx.stroke();
}

/** a bunch of herbs hung head-down to dry: thyme, sage, a little lavender, tied with twine to a nail */
function herbBunch(ctx: CanvasRenderingContext2D, x: number, y: number, len: number): void {
  const rnd = new Rand(8401);
  nail(ctx, x, y, 1);
  ctx.strokeStyle = rgba('#B89A64', 0.9);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 0.8, y + 7);
  ctx.stroke();
  const tie = y + 8;
  // its shadow on the wall first
  wallShadow(ctx, blobPoly(x + 4, tie + len * 0.5, len * 0.3, len * 0.45, rnd, 12, 0.25), 2, 1, 0.2, 3);
  // stems: gathered at the tie, fanning down and out, each drooping
  const stems = 22;
  const tips: [number, number, string][] = [];
  for (let i = 0; i < stems; i++) {
    const a = Math.PI / 2 + (i / (stems - 1) - 0.5) * 0.9 + rnd.range(-0.06, 0.06);
    const l = len * rnd.range(0.7, 1.05);
    const pts: number[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(x + Math.cos(a) * l * t + Math.sin(t * 2 + i) * 0.4, tie + Math.sin(a) * l * t + t * t * 2);
    }
    const kind = rnd.pick(['sage', 'thyme', 'thyme', 'lav']);
    ctx.fillStyle = rgba('#6A5A3A', 0.7);
    ribbon(ctx, pts, 0.45, 0.2);
    tips.push([pts[pts.length - 2]!, pts[pts.length - 1]!, kind]);
    // leaves along it
    for (let k = 1; k < 6; k++) {
      const lx = pts[k * 2]!;
      const ly = pts[k * 2 + 1]!;
      for (const side of [-1, 1]) {
        if (rnd.chance(0.3)) continue;
        const la = a + side * rnd.range(0.5, 1.1) + 0.3;
        const ll = kind === 'sage' ? rnd.range(4, 6.5) : rnd.range(1.8, 3);
        const lw = kind === 'sage' ? ll * 0.36 : ll * 0.42;
        const col = kind === 'sage' ? rnd.pick(['#8A9A7A', '#7A8C6E', '#9AA48A']) : rnd.pick(['#6A7A4E', '#5E6E44', '#7A845A', '#8A8460']);
        const ex = lx + Math.cos(la) * ll;
        const ey = ly + Math.sin(la) * ll;
        ctx.fillStyle = rgba(col, 0.9);
        tracePoly(ctx, [lx, ly, (lx + ex) / 2 - Math.sin(la) * lw, (ly + ey) / 2 + Math.cos(la) * lw, ex, ey, (lx + ex) / 2 + Math.sin(la) * lw, (ly + ey) / 2 - Math.cos(la) * lw]);
        ctx.fill();
      }
    }
  }
  // the flower heads at the tips (lavender and thyme flowers, dried dull)
  for (const [tx, ty, kind] of tips) {
    if (kind === 'lav') {
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = rgba(rnd.pick(['#7A6A9A', '#8A7AA8', '#6A5A88']), 0.85);
        ctx.beginPath();
        ctx.ellipse(tx + rnd.range(-0.6, 0.6), ty - k * 1.3, 0.9, 0.7, 0, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 'thyme' && rnd.chance(0.5)) {
      ctx.fillStyle = rgba('#B8A0A8', 0.7);
      ctx.beginPath();
      ctx.arc(tx, ty, 0.9, 0, TAU);
      ctx.fill();
    }
  }
  // the twine tie, and the bunch's shade on its right
  wash(ctx, rectPoly(x - 3, tie - 1, x + 3, tie + 3, rnd, 0.15), '#C8AA70', 0.97, rnd, 2, 0.01);
  pen(ctx, x - 3, tie + 1, x + 3, tie + 1.4, 0.3, '#6A5030', 0.7, rnd, 0.05);
}

/** the brown-paper roll on its iron brackets with the cutter bar, a sheet hanging, and the twine cone on its spindle */
function paperRoll(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  const rnd = new Rand(8501);
  const r = 9;
  // the brackets: scrolled iron arms from the wall
  for (const bx of [x0, x1]) {
    ctx.strokeStyle = rgba(IRON, 0.92);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(bx, y - r - 5);
    ctx.lineTo(bx, y + r + 22);
    ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(bx + (bx === x0 ? 2.6 : -2.6), y + r + 20, 2.6, 0, TAU * 0.8);
    ctx.stroke();
    nail(ctx, bx, y - r - 3, 0.8);
    nail(ctx, bx, y + r + 14, 0.8);
  }
  wallShadow(ctx, [x0 + 3, y - r, x1 - 3, y - r, x1 - 3, y + r + 30, x0 + 3, y + r + 30], 2.4, 3, 0.4, 2.4);
  // the sheet hanging from the roll's front, its torn foot below the cutter
  const sy1 = y + r + 30;
  const sheet = [x0 + 5, y + r - 2, x1 - 5, y + r - 2, x1 - 5.5, sy1];
  for (let x = x1 - 5.5; x >= x0 + 5.5; x -= 1.5) sheet.push(x, sy1 + (Math.round(x * 2) % 2 ? 0.9 : -0.2) + rnd.range(-0.3, 0.3));
  sheet.push(x0 + 5.5, sy1);
  wash(ctx, sheet, '#B08452', 0.97, rnd, 3, 0.006);
  ctx.save();
  tracePoly(ctx, sheet);
  ctx.clip();
  for (let i = 0; i < 10; i++) {
    const fx = rnd.range(x0 + 5, x1 - 5);
    ctx.fillStyle = rgba('#7A5430', rnd.range(0.08, 0.16));
    ribbon(ctx, [fx, y + r, fx + rnd.range(-1, 1), sy1], rnd.range(0.4, 1.4), 0.9);
  }
  const sg = ctx.createLinearGradient(0, y + r, 0, sy1);
  sg.addColorStop(0, 'rgba(30,16,8,0.3)');
  sg.addColorStop(0.3, 'rgba(30,16,8,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x0, y + r, x1 - x0, sy1 - y - r);
  ctx.restore();
  // the cutter bar across the sheet
  wash(ctx, rectPoly(x0 + 1, sy1 - 7, x1 - 1, sy1 - 4.5, rnd, 0.15), '#3A3632', 0.97, rnd, 2, 0.01);
  ctx.fillStyle = rgba('#A8A49A', 0.5);
  ctx.fillRect(x0 + 2, sy1 - 6.8, x1 - x0 - 4, 0.5);
  // the roll: a cylinder of kraft lit along its top, the end discs with their layers and the core
  const rollPoly = [x0 + 3, y - r, x1 - 3, y - r, x1 - 3, y + r, x0 + 3, y + r];
  wash(ctx, rollPoly, '#B88A56', 0.97, rnd, 3, 0.006);
  ctx.save();
  tracePoly(ctx, rollPoly);
  ctx.clip();
  const cg = ctx.createLinearGradient(0, y - r, 0, y + r);
  cg.addColorStop(0, 'rgba(255,232,190,0.1)');
  cg.addColorStop(0.28, 'rgba(255,232,190,0.42)');
  cg.addColorStop(0.55, 'rgba(120,70,30,0)');
  cg.addColorStop(1, 'rgba(40,20,8,0.5)');
  ctx.fillStyle = cg;
  ctx.fillRect(x0, y - r, x1 - x0, 2 * r);
  for (let i = 0; i < 8; i++) {
    const fy = rnd.range(y - r, y + r);
    ctx.fillStyle = rgba('#6A4420', rnd.range(0.06, 0.14));
    ribbon(ctx, [x0 + 3, fy, x1 - 3, fy + rnd.range(-0.4, 0.4)], rnd.range(0.3, 0.8), 0.95);
  }
  ctx.restore();
  for (const ex of [x0 + 3, x1 - 3]) {
    wash(ctx, ellipsePoly(ex, y, 2.6, r, 20), '#C8A270', 0.97, rnd, 2, 0.01);
    for (let k = 1; k < 4; k++) {
      ctx.strokeStyle = rgba('#7A5430', 0.4);
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.ellipse(ex, y, 2.6 * (k / 4), r * (k / 4), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(IRON, 0.85);
    ctx.beginPath();
    ctx.ellipse(ex, y, 0.9, 2.4, 0, 0, TAU);
    ctx.fill();
  }
  pen(ctx, x0 + 3, y + r, x1 - 3, y + r, 0.55, INK, 0.55, rnd, 0.1);
  pen(ctx, x0 + 3, y - r, x1 - 3, y - r, 0.45, INK, 0.4, rnd, 0.1);
  // the twine: a cone on a spindle on the right bracket, its loose end looped down to the sheet
  const tx = x1 - 12;
  const ty = y - r - 6;
  ctx.strokeStyle = rgba(IRON, 0.9);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x1, ty + 4);
  ctx.lineTo(tx, ty + 4);
  ctx.lineTo(tx, ty - 14);
  ctx.stroke();
  const cone = [tx - 7, ty + 3, tx + 7, ty + 3, tx + 4, ty - 12, tx - 4, ty - 12];
  wallShadow(ctx, cone, 1.8, 1.6, 0.3);
  wash(ctx, cone, '#D8C08A', 0.97, rnd, 3, 0.01);
  for (let k = 0; k < 9; k++) {
    const yy = ty + 2 - k * 1.6;
    const hw = 7 - (k / 9) * 3;
    pen(ctx, tx - hw, yy, tx + hw, yy - 0.8, 0.3, '#8A6A3A', 0.6, rnd, 0.05);
  }
  ctx.fillStyle = rgba(LIGHT, 0.35);
  ribbon(ctx, [tx - 5.5, ty + 1, tx - 3.4, ty - 10], 1.5, 0.8);
  ctx.strokeStyle = rgba('#C8AA70', 0.9);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(tx + 5, ty - 4);
  ctx.bezierCurveTo(tx + 14, ty + 6, tx + 6, y + r + 6, tx - 6, y + r + 12);
  ctx.stroke();
  void penPath;
}

/** a bundle of flat paper bags threaded on a string and hung from a nail, fanned a little */
function bagBundle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const rnd = new Rand(8601);
  nail(ctx, x, y, 1);
  for (let i = 0; i < 7; i++) {
    const w = 22 + rnd.range(-2, 3);
    const h = 30 + rnd.range(-2, 3);
    const rot = (i - 3) * 0.035 + rnd.range(-0.02, 0.02);
    ctx.save();
    ctx.translate(x, y + 2);
    ctx.rotate(rot);
    const poly = rectPoly(-w / 2, 2, w / 2, 2 + h, rnd, 0.3);
    if (i === 0) wallShadow(ctx, poly, 2, 2.5, 0.38);
    wash(ctx, poly, mix('#B48A58', '#C9A06A', rnd.next()), 0.97, rnd, 2, 0.008);
    // the gusset fold and the serrated mouth at the bottom
    pen(ctx, -w / 2 + 3, 2, -w / 2 + 3, 2 + h, 0.3, '#7A5430', 0.5, rnd, 0.1);
    pen(ctx, -w / 2, 2 + h, w / 2, 2 + h, 0.4, INK, 0.45, rnd, 0.2);
    ctx.fillStyle = rgba(SHADE, 0.12);
    ctx.fillRect(w / 2 - 3, 2, 3, h);
    ctx.restore();
  }
  // the string through the corners
  ctx.strokeStyle = rgba('#B89A64', 0.9);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 6);
  ctx.stroke();
}

/** the grocer's coat and cap on the pegs by the door: a long brown coat hanging from its loop, the collar turned, the
 *  sleeves hanging along it, the folds; the flat cap on the next peg */
function coatAndCap(ctx: CanvasRenderingContext2D, x0: number, y: number): void {
  const rnd = new Rand(8701);
  plank(ctx, x0 - 34, y - 4, x0 + 40, y + 4, '#6A4529', rnd, { grain: 0.8 });
  const pegs = [x0 - 14, x0 + 18];
  for (const px of pegs) {
    wash(ctx, ellipsePoly(px, y, 2.6, 2.4, 12), '#5A3A22', 0.97, rnd, 2, 0.02);
    ctx.fillStyle = rgba('#E0B080', 0.4);
    ctx.beginPath();
    ctx.arc(px - 0.8, y - 0.8, 0.8, 0, TAU);
    ctx.fill();
  }
  // the coat
  const cx = pegs[0]!;
  const top = y + 1;
  const len = 230;
  const cloth = '#5C4A3A';
  const outlineL: number[] = [];
  const outlineR: number[] = [];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const shoulder = Math.min(1, t * 6);
    const wdt = 3 + shoulder * 19 + t * 5;
    outlineL.push(cx - wdt + Math.sin(t * 9) * 0.6, top + t * len);
    outlineR.push(cx + wdt + Math.sin(t * 7 + 1) * 0.6, top + t * len);
  }
  const coat = [...outlineL];
  // the hem, a little uneven
  coat.push(cx - 4, top + len + 2, cx + 6, top + len - 1);
  for (let k = outlineR.length / 2 - 1; k >= 0; k--) coat.push(outlineR[k * 2]!, outlineR[k * 2 + 1]!);
  wallShadow(ctx, coat, 3, 3, 0.4, 3);
  wash(ctx, coat, cloth, 0.97, rnd, 3, 0.006);
  ctx.save();
  tracePoly(ctx, coat);
  ctx.clip();
  mottle(ctx, cx - 40, top, cx + 40, top + len, ['#54443A', '#6A5646', '#4E3E32', '#625040'], 8702, 0.4, 14, 0.7);
  // tweed flecks
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#8A7A62', '#3A2C22', '#7A5A42']), rnd.range(0.2, 0.45));
    ctx.fillRect(rnd.range(cx - 30, cx + 30), rnd.range(top, top + len), rnd.range(0.3, 0.9), 0.35);
  }
  // the folds: long ribbons of shade, a lit ridge beside each
  for (let i = 0; i < 6; i++) {
    const fx = cx - 18 + i * 7 + rnd.range(-2, 2);
    const pts = [fx, top + 30 + rnd.range(0, 30), fx + rnd.range(-2, 2), top + len * 0.6, fx + rnd.range(-3, 3), top + len];
    ctx.fillStyle = rgba('#2A1E18', 0.32);
    ribbon(ctx, pts, rnd.range(1.6, 3), 0.7);
    ctx.fillStyle = rgba('#9A866A', 0.2);
    ribbon(ctx, pts.map((v, j) => (j % 2 === 0 ? v - 2 : v)), 1, 0.7);
  }
  // the sleeves hanging along the sides, their cuffs
  for (const side of [-1, 1]) {
    const sx = cx + side * 17;
    const sl = [sx - 5, top + 18, sx + 5, top + 18, sx + 4 + side * 2, top + 150, sx - 4 + side * 2, top + 150];
    ctx.fillStyle = rgba(mix(cloth, side < 0 ? '#8A7660' : '#2A2018', 0.25), 0.8);
    tracePoly(ctx, deform(sl, rnd, 1, 0.01));
    ctx.fill();
    ctx.fillStyle = rgba('#2A1E18', 0.4);
    ribbon(ctx, [sx + side * 4.5, top + 20, sx + side * 5 + side * 2, top + 148], 1.4, 0.6);
    wash(ctx, rectPoly(sx - 4 + side * 2, top + 142, sx + 4 + side * 2, top + 150, rnd, 0.2), mix(cloth, '#1E1612', 0.3), 0.9, rnd, 2, 0.01);
  }
  // the light from the window side, the shade on the right
  const lg = ctx.createLinearGradient(cx - 26, 0, cx + 26, 0);
  lg.addColorStop(0, 'rgba(200,214,224,0.16)');
  lg.addColorStop(0.5, 'rgba(0,0,0,0)');
  lg.addColorStop(1, 'rgba(24,14,10,0.36)');
  ctx.fillStyle = lg;
  ctx.fillRect(cx - 30, top, 60, len);
  ctx.restore();
  // the collar turned over at the hanging loop, the buttons
  const collar = [cx - 9, top + 2, cx + 9, top + 2, cx + 13, top + 18, cx, top + 26, cx - 13, top + 18];
  wash(ctx, collar, mix(cloth, '#3A2C22', 0.3), 0.97, rnd, 2, 0.01);
  pen(ctx, cx, top + 26, cx + 1, top + 110, 0.5, '#1E1612', 0.55, rnd, 0.3);
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = rgba('#1E1410', 0.85);
    ctx.beginPath();
    ctx.arc(cx + 3.5, top + 40 + k * 22, 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let k = 0; k < outlineR.length / 2; k++) {
    if (k === 0) ctx.moveTo(outlineR[0]!, outlineR[1]!);
    else ctx.lineTo(outlineR[k * 2]!, outlineR[k * 2 + 1]!);
  }
  ctx.stroke();
  // the cap on its peg: a flat cap seen from the side, its peak toward us a little, tweed with a lit crown
  const kx = pegs[1]!;
  const ky = y + 2;
  const cap = [kx - 13, ky + 8, kx - 12, ky + 2, kx - 6, ky - 2.5, kx + 6, ky - 3, kx + 12, ky + 1, kx + 14, ky + 6, kx + 11, ky + 9];
  wallShadow(ctx, cap, 2.4, 2.6, 0.4, 2);
  wash(ctx, cap, '#6E6052', 0.97, rnd, 3, 0.01);
  ctx.save();
  tracePoly(ctx, cap);
  ctx.clip();
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#9A8A70', '#3A3026', '#7A6A58']), 0.4);
    ctx.fillRect(rnd.range(kx - 14, kx + 14), rnd.range(ky - 4, ky + 10), rnd.range(0.3, 0.8), 0.3);
  }
  ctx.fillStyle = rgba('#C8BCA8', 0.25);
  ribbon(ctx, [kx - 11, ky + 2, kx - 4, ky - 1.5, kx + 6, ky - 2], 2, 0.8);
  ctx.restore();
  // the peak
  wash(ctx, [kx - 15, ky + 7, kx - 8, ky + 6, kx - 6, ky + 10, kx - 14, ky + 10.5], '#4E4236', 0.97, rnd, 2, 0.02);
  pen(ctx, kx - 15, ky + 10.5, kx + 11, ky + 9, 0.5, INK, 0.55, rnd, 0.2);
}

/* ------------------------------------------------------------------ the floor's clutter */

/** a big burlap sack slumped against the wall, its mouth rolled down on potatoes (or flour), a stencilled mark */
function bigSack(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, seed: number, full: 'potatoes' | 'flour'): void {
  const rnd = new Rand(seed);
  const top = base - h;
  const lean = rnd.range(-3, 3);
  const body = [x + 5 + lean, top + 6, x + w - 5 + lean, top + 5, x + w + 1, top + h * 0.45, x + w + 4, base - 6, x + w - 2, base, x + 2, base, x - 4, base - 5, x - 1, top + h * 0.5];
  ctx.fillStyle = 'rgba(30,16,8,0.4)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2 + 4, base, w * 0.6, 3.5, 0, 0, TAU);
  ctx.fill();
  const cloth = full === 'flour' ? '#A8926A' : '#8A6C44';
  ctx.fillStyle = cloth;
  tracePoly(ctx, body);
  ctx.fill();
  wash(ctx, body, cloth, 0.6, rnd, 3, 0.01);
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  mottle(ctx, x, top, x + w, base, [mix(cloth, '#FFF0D0', 0.1), mix(cloth, '#5A4020', 0.15), cloth], seed + 1, 0.4, 10, 1);
  // the weave: a fine cross-hatch
  for (let yy = top; yy < base; yy += 1.6) {
    ctx.fillStyle = rgba('#5A4020', 0.1);
    ctx.fillRect(x - 2, yy, w + 4, 0.35);
  }
  for (let xx = x; xx < x + w; xx += 1.6) {
    ctx.fillStyle = rgba('#5A4020', 0.07);
    ctx.fillRect(xx, top, 0.35, h);
  }
  // the stencil: a ring and bars (the mill's mark, no words)
  const mx = x + w / 2 + lean * 0.5;
  const my = top + h * 0.58;
  ctx.strokeStyle = rgba(full === 'flour' ? '#2E4A72' : '#7A2E26', 0.45);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(mx, my, w * 0.2, h * 0.14, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = rgba(full === 'flour' ? '#2E4A72' : '#7A2E26', 0.4);
  for (let k = 0; k < 3; k++) ctx.fillRect(mx - w * 0.28, my + h * 0.2 + k * 2.6, w * 0.56, 1.3);
  // the folds: shade down the slump, the light on its upper left
  const sh = ctx.createLinearGradient(x, top, x + w, base);
  sh.addColorStop(0, 'rgba(255,236,200,0.22)');
  sh.addColorStop(0.45, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(30,16,10,0.55)');
  ctx.fillStyle = sh;
  ctx.fillRect(x - 2, top, w + 4, h);
  for (let i = 0; i < 4; i++) {
    const fx = x + w * rnd.range(0.2, 0.85);
    ctx.fillStyle = rgba('#3A2814', 0.22);
    ribbon(ctx, [fx, top + 10, fx + rnd.range(-3, 3), top + h * 0.5, fx + rnd.range(-4, 4), base - 4], rnd.range(1.4, 2.6), 0.6);
  }
  ctx.restore();
  // the rolled-down mouth and what shows in it
  const rim = [x + 2 + lean, top + 2, x + w - 2 + lean, top + 1, x + w - 1 + lean, top + 9, x + 1 + lean, top + 10];
  if (full === 'potatoes') {
    for (let i = 0; i < 7; i++) {
      const px = x + 7 + lean + i * ((w - 14) / 6) + rnd.range(-1.5, 1.5);
      const py = top + rnd.range(-1, 3);
      ctx.fillStyle = rgba(rnd.pick(['#B89462', '#A8844F', '#C4A06A']), 0.95);
      tracePoly(ctx, deform(blobPoly(px, py, rnd.range(4, 5.5), rnd.range(3, 4), rnd, 10, 0.12), rnd, 1, 0.05));
      ctx.fill();
      ctx.fillStyle = rgba('#F2DDB0', 0.35);
      ctx.beginPath();
      ctx.arc(px - 1.4, py - 1.2, 1.4, 0, TAU);
      ctx.fill();
    }
  } else {
    wash(ctx, [x + 5 + lean, top + 3, x + w / 2 + lean, top - 3, x + w - 5 + lean, top + 3], '#F0E8D8', 0.95, rnd, 2, 0.04);
  }
  wash(ctx, rim, mix(cloth, '#7A5A34', 0.25), 0.97, rnd, 2, 0.01);
  for (let k = 0; k < 8; k++) pen(ctx, x + 3 + lean + k * ((w - 6) / 8), top + 3, x + 4 + lean + k * ((w - 6) / 8), top + 9, 0.3, '#4A3418', 0.4, rnd, 0.1);
  // ink on the shaded flank and the foot, a little on the lit side where it bellies out
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(body[2]!, body[3]!);
  for (let k = 2; k < 7; k++) ctx.lineTo(body[k * 2]!, body[k * 2 + 1]!);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(body[12]!, body[13]!);
  ctx.lineTo(body[14]!, body[15]!);
  ctx.stroke();
}

/** a broom leaning against the wall, its head on the floor: a long ash handle, a stitched straw head */
function broom(ctx: CanvasRenderingContext2D, footX: number, base: number, topX: number, topY: number): void {
  const rnd = new Rand(8801);
  const hx = footX + (topX - footX) * 0.18;
  const hy = base - 34;
  ctx.fillStyle = 'rgba(30,16,8,0.35)';
  ctx.beginPath();
  ctx.ellipse(footX + 3, base, 14, 2.6, 0, 0, TAU);
  ctx.fill();
  // the handle's shadow on the wall, then the handle
  ctx.fillStyle = 'rgba(40,24,14,0.25)';
  ribbon(ctx, [hx + 4, hy, topX + 5, topY + 3], 2.2, 0.3);
  ctx.fillStyle = rgba('#B08A5A', 0.97);
  ribbon(ctx, [hx, hy, topX, topY], 2.4, 0.1);
  ctx.fillStyle = rgba('#F2D8A8', 0.4);
  ribbon(ctx, [hx - 0.6, hy, topX - 0.6, topY], 0.7, 0.2);
  pen(ctx, hx + 1.2, hy, topX + 1.2, topY, 0.4, INK, 0.5, rnd, 0.1);
  // the head: a fan of straw, bound in three rows of stitching
  const head: number[] = [footX - 12, base, footX + 12, base, footX + 5, hy + 2, footX - 3, hy + 2];
  wash(ctx, head, '#C8A45A', 0.97, rnd, 3, 0.01);
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    ctx.fillStyle = rgba(rnd.pick(['#8A6A2A', '#E2C47A', '#A88440']), 0.5);
    ribbon(ctx, [footX - 3 + t * 8, hy + 3, footX - 12 + t * 24 + rnd.range(-1, 1), base - 0.5], rnd.range(0.4, 0.8), 0.4);
  }
  for (const by of [hy + 6, hy + 11, hy + 16]) pen(ctx, footX - 4 - (by - hy) * 0.2, by, footX + 5 + (by - hy) * 0.15, by, 0.6, '#5A2A1E', 0.75, rnd, 0.1);
  ctx.fillStyle = rgba(SHADE, 0.3);
  tracePoly(ctx, [footX + 3, hy + 3, footX + 12, base, footX + 6, base, footX + 1, hy + 3]);
  ctx.fill();
}

/** the umbrella stand by the door, the grocer's umbrella furled in it, still wet: a puddle spreading under the stand */
function umbrellaStand(ctx: CanvasRenderingContext2D, cx: number, base: number): void {
  const rnd = new Rand(8901);
  // the puddle on the boards
  ctx.fillStyle = rgba('#8AA0AE', 0.32);
  tracePoly(ctx, deform(blobPoly(cx + 6, base + 3, 26, 4.5, rnd, 16, 0.2), rnd, 2, 0.1));
  ctx.fill();
  ctx.fillStyle = rgba('#DCE8EE', 0.35);
  ribbon(ctx, [cx - 8, base + 2.4, cx + 4, base + 2], 1, 0.8);
  // the umbrella: a black canopy furled round its stick, the crook handle up out of the stand
  const top = base - 112;
  const furl = [cx - 1, top + 20, cx + 2, top + 20, cx + 7, base - 46, cx + 1, base - 30, cx - 6, base - 46];
  wash(ctx, furl, '#22262A', 0.97, rnd, 3, 0.01);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = rgba('#7A8A96', 0.35);
    ribbon(ctx, [cx - 3 + i * 1.6, top + 26 + i * 6, cx - 4 + i * 2.6, base - 50], 0.5, 0.6);
  }
  // wet: beads along it, catching the window
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rgba('#D8E6EE', 0.6);
    ctx.beginPath();
    ctx.ellipse(cx + rnd.range(-4, 4), rnd.range(top + 30, base - 50), 0.5, 0.9, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = rgba('#6A4A2A', 0.97);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, top + 21);
  ctx.lineTo(cx + 0.5, top + 6);
  ctx.arc(cx - 4.5, top + 6, 5, 0, Math.PI, true);
  ctx.stroke();
  ctx.strokeStyle = rgba('#E0B888', 0.45);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx - 4.5, top + 6, 5.6, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  // the stand: a stoneware cylinder, glazed dark green, lit from the window
  const sx0 = cx - 11;
  const sx1 = cx + 11;
  const sy0 = base - 52;
  const stand = [sx0, sy0, sx1, sy0, sx1, base - 2, sx1 - 2, base, sx0 + 2, base, sx0, base - 2];
  wash(ctx, stand, '#3A5A4A', 0.97, rnd, 3, 0.008);
  ctx.save();
  tracePoly(ctx, stand);
  ctx.clip();
  const g = ctx.createLinearGradient(sx0, 0, sx1, 0);
  g.addColorStop(0, 'rgba(190,220,214,0.45)');
  g.addColorStop(0.3, 'rgba(120,160,150,0.1)');
  g.addColorStop(1, 'rgba(10,20,16,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(sx0, sy0, sx1 - sx0, base - sy0);
  for (const by of [sy0 + 6, base - 8]) {
    ctx.fillStyle = rgba('#24382E', 0.6);
    ctx.fillRect(sx0, by, sx1 - sx0, 1.4);
  }
  ctx.restore();
  ctx.fillStyle = rgba('#1A2A22', 0.9);
  ctx.beginPath();
  ctx.ellipse(cx, sy0, 11, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#8AB0A2', 0.6);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, sy0, 11, 2.4, 0, Math.PI * 0.9, Math.PI * 1.9);
  ctx.stroke();
  pen(ctx, sx1, sy0, sx1, base - 2, 0.6, INK, 0.6, rnd, 0.1);
  pen(ctx, sx0 + 2, base, sx1 - 2, base, 0.6, INK, 0.6, rnd, 0.1);
}

/* ------------------------------------------------------------------ placing it all */

/** the clutter on the walls (painted after the shelves, before the floor and the light) */
export function paintClutter(ctx: CanvasRenderingContext2D, vx: { x0: number; x1: number }, rnd: Rand): void {
  void rnd;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // above the shelves, under the beam
  enamelSign(ctx, { x0: 352, y0: -12, x1: 470, y1: 33, ground: '#1F3C66', ink: '#EFE4C4', border: '#D8C49A', lines: [['WRENFIELD', 0.27, 0.5], ['TEA', 0.18, 0.82]], font: SERIF, tilt: -0.012, seed: 9101 });
  enamelSign(ctx, { x0: 604, y0: -16, x1: 700, y1: 38, ground: '#6A2230', ink: '#E8B84E', border: '#E8B84E', lines: [['MARCHBANK', 0.15, 0.42], ['COCOA', 0.24, 0.8]], font: SANS, tilt: 0.022, seed: 9102, squash: 0.9 });
  biscuitTin(ctx, 290, 52, 34, 25);
  wickerBasket(ctx, 474, 52, 56, 20);
  crock(ctx, 562, 52, 26, 31);
  // above the board: the clock, and the mustard sign beside it
  clock(ctx, (BOARD.x0 + BOARD.x1) / 2 - 20, 30, 25);
  enamelSign(ctx, { x0: 896, y0: -14, x1: 980, y1: 40, ground: '#D9A62E', ink: '#1E1A16', border: '#1E1A16', lines: [["PELLOW'S", 0.17, 0.44], ['MUSTARD', 0.2, 0.8]], font: SANS, tilt: -0.03, seed: 9103, squash: 0.86 });
  // the window's side: onions, then garlic, each on its nail
  bulbString(ctx, 267, 72, 236, false, 9201);
  bulbString(ctx, 268, 252, 352, true, 9202);
  // between the door and the window
  thermometer(ctx, 9, 150, 23, 292);
  // the right wall (wide screens)
  if (vx.x1 > 985) {
    enamelSign(ctx, { x0: 1008, y0: 12, x1: 1084, y1: 62, ground: '#2E5A44', ink: '#F0E6C8', border: '#F0E6C8', lines: [['CORRAN', 0.22, 0.5], ['SOAP', 0.17, 0.78]], font: SERIF, tilt: 0.01, oval: true, seed: 9104 });
    corkBoard(ctx, 998, 92, 1094, 178);
    jarShelf(ctx, 1106, 1170, 210);
    herbBunch(ctx, 1136, 236, 62);
    paperRoll(ctx, 1000, 1092, 262);
    bagBundle(ctx, 1030, 334);
  }
  // by the door (wide screens): the coat and the cap
  if (vx.x0 < -108) coatAndCap(ctx, -140, 160);
  ctx.restore();
}

/** what stands on the floor against the walls (painted after the floor) */
export function paintFloorClutter(ctx: CanvasRenderingContext2D, vx: { x0: number; x1: number }): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // a sack of flour waiting by the board's wall, behind where the crates stand
  bigSack(ctx, 930, 552, 46, 58, 9301, 'flour');
  if (vx.x1 > 1000) {
    bigSack(ctx, 1010, 550, 52, 62, 9302, 'potatoes');
    broom(ctx, 1086, 552, 1104, 330);
  }
  if (vx.x0 < -110) umbrellaStand(ctx, -136, 550);
  ctx.restore();
}
