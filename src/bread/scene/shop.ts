/**
 * The room: everything behind the grocer and the floor in front, painted once per size on a sheet of washes laid over
 * the paper (so the paper's tooth lifts through the pigment, as in the sister demos): the plaster and the oak beam, the
 * dado, the window with its frame, bars and sill (the street is street.ts), the shelves and everything on them
 * (goods.ts), the pendant lamps, the door and the right wall, the floor boards, and last the light: cool daylight
 * from the window across the left, warm pools under the lamps, the corners falling away. Light from the upper left.
 *
 * Geometry is geom.ts's; the few places it leaves to the shop are here (FLOOR_Y: where the back wall meets the floor
 * the grocer stands on; WALL_FOOT_Y in geom.ts is 548, a touch below his feet at 540, so the wall's foot is painted
 * at 534 and he stands on boards).
 */
import { Rand } from '../../scene/prng';
import { makeCanvas, paintPaperBackdrop, rgba, tracePoly, deform } from '../../scene/watercolor';
import { LAMPS, SHELVES, WINDOW, type Pt } from './geom';
import { fitCamera, viewX, viewY, type Camera } from './layout';
import { INK, LIGHT, SHADE, blobPoly, face, grain, lit, mix, mottle, outline, patchWash, pen, plank, rectPoly, ribbon, wash, washEdge, washField } from './paint';
import { bottle, crateOfThings, jar, packet, sack, tin } from './goods';
import { GLASS, PANES, paintGlass, paintStreet } from './street';

export const FLOOR_Y = 534;
/** the cup on the shelf behind the counter (the steam rises from here) */
export const CUP: Pt = { x: 642, y: 281 };

const WOOD_GREEN = '#52695C';
const OAK = '#6A4529';

export interface BackLayer {
  cv: HTMLCanvasElement;
}

export async function paintBack(c: Camera, tile: CanvasImageSource, tick: () => Promise<void>, alive: () => boolean): Promise<BackLayer | null> {
  const d = c.dpr;
  const Wd = Math.round(c.cssW * d);
  const Hd = Math.round(c.cssH * d);
  const paper = makeCanvas(Wd, Hd);
  const pctx = paper.getContext('2d')!;
  paintPaperBackdrop(pctx, Wd, Hd, tile, d);
  const sheet = makeCanvas(Wd, Hd);
  const ctx = sheet.getContext('2d')!;
  const S = c.s * d;
  ctx.setTransform(S, 0, 0, S, c.ox * d, c.oy * d);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const vx = viewX(c, 70);
  const vy = viewY(c, 50);
  const rnd = new Rand(24681);

  paintWall(ctx, vx, vy, rnd);
  await tick();
  if (!alive()) return null;
  paintWindowAndDoor(ctx, S, vx, rnd);
  await tick();
  if (!alive()) return null;
  paintShelves(ctx, rnd);
  await tick();
  if (!alive()) return null;
  paintLamps(ctx, rnd, vy.y0);
  paintRightWall(ctx, vx, rnd);
  paintFloor(ctx, vx, vy, rnd);
  await tick();
  if (!alive()) return null;
  paintLight(ctx, vx, vy);
  finishSheet(sheet, ctx, S);
  // the paper's grain lifts the wash on its peaks and pools pigment in its valleys, over the whole room
  grain(ctx, '#4A3826', vx.x0, vy.y0, vx.x1 - vx.x0, vy.y1 - vy.y0, 0.07, 0.16, 733);
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.drawImage(sheet, 0, 0);
  return { cv: paper };
}

/* ------------------------------------------------------------------ the walls */

function paintWall(ctx: CanvasRenderingContext2D, vx: { x0: number; x1: number }, vy: { y0: number; y1: number }, rnd: Rand): void {
  const x0 = vx.x0;
  const x1 = vx.x1;
  const top = vy.y0;
  // plaster, warmed by the lamps: a wash with the colours drifting into each other
  ctx.fillStyle = rgba('#E8DDBE', 0.75);
  ctx.fillRect(x0, top, x1 - x0, FLOOR_Y - top);
  const plaster = washField(3301, ['#E6DAB4', '#DCD0AA', '#D2CDB0', '#CBD0C6', '#E2D2A8'], 0.007, 0.01);
  patchWash(ctx, x0, top, x1, FLOOR_Y, (x, y) => lit(plaster(x, y), x, y), rnd, 26, 0.36, 2);
  // trowel marks, a hairline crack or two, a damp stain under the beam
  for (let i = 0; i < 70; i++) {
    const x = rnd.range(x0, x1);
    const y = rnd.range(top, FLOOR_Y - 60);
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#FFF4D2' : '#9B8456', rnd.range(0.05, 0.1));
    ribbon(ctx, [x, y, x + rnd.range(20, 60), y + rnd.range(-3, 3)], rnd.range(1.5, 3.5), 0.9, 0.2);
  }
  for (let i = 0; i < 4; i++) {
    const x = rnd.range(x0 + 20, x1 - 20);
    const y = rnd.range(60, 300);
    const pts: number[] = [];
    for (let k = 0; k < 6; k++) pts.push(x + rnd.range(-6, 6) + k * rnd.range(-1, 1), y + k * rnd.range(6, 11));
    ctx.fillStyle = rgba('#5A4630', 0.2);
    ribbon(ctx, pts, 0.5, 0.9);
  }
  for (let i = 0; i < 5; i++) {
    const sx = rnd.range(x0, x1);
    ctx.fillStyle = rgba('#8A7048', 0.07);
    tracePoly(ctx, deform(blobPoly(sx, 52, rnd.range(30, 70), rnd.range(14, 26), rnd, 12, 0.3), rnd, 2, 0.1));
    ctx.fill();
  }
  // the ceiling, and the oak beam across the top with its shadow
  const ceil = ctx.createLinearGradient(0, top, 0, 28);
  ceil.addColorStop(0, '#A8936B');
  ceil.addColorStop(1, '#BFAA80');
  ctx.fillStyle = ceil;
  ctx.fillRect(x0, top, x1 - x0, 28 - top);
  plank(ctx, x0, 26, x1, 48, '#5E3F28', rnd, { grain: 1.4, knots: 2 });
  ctx.fillStyle = rgba('#2A1A10', 0.35);
  ribbon(ctx, [x0, 47, x1, 47], 2.2, 1);
  const sh = ctx.createLinearGradient(0, 48, 0, 76);
  sh.addColorStop(0, 'rgba(58,40,24,0.32)');
  sh.addColorStop(1, 'rgba(58,40,24,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(x0, 48, x1 - x0, 28);
  // the dado: green tongue-and-groove, a cream rail, a dark skirting
  const rail = 478;
  {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, rail + 6, x1 - x0, FLOOR_Y - 10 - rail - 6);
    ctx.clip();
    ctx.fillStyle = rgba('#5E7266', 0.55);
    ctx.fillRect(x0, rail + 6, x1 - x0, FLOOR_Y - rail);
    const gf = washField(7001, ['#4E6A5E', '#5E7664', '#46605A', '#6E8068', '#58705E'], 0.02, 0.05);
    patchWash(ctx, x0, rail + 6, x1, FLOOR_Y - 10, (x, y) => lit(gf(x, y), x, y), rnd, 13, 0.5, 2);
    for (let x = x0 - 6; x < x1; x += rnd.range(10.5, 12.5)) {
      pen(ctx, x, rail + 7, x + rnd.range(-0.3, 0.3), FLOOR_Y - 10, 0.5, '#24342C', 0.4, rnd, 0.3);
      ctx.fillStyle = rgba(LIGHT, 0.14);
      ribbon(ctx, [x + 1, rail + 8, x + 1, FLOOR_Y - 12], 0.7, 0.9);
    }
    ctx.restore();
  }
  plank(ctx, x0, rail, x1, rail + 7, '#C9B07A', rnd, { grain: 0.5 });
  plank(ctx, x0, FLOOR_Y - 11, x1, FLOOR_Y, '#3F4A42', rnd, { grain: 0.6 });
  const rs = ctx.createLinearGradient(0, rail + 7, 0, rail + 22);
  rs.addColorStop(0, 'rgba(24,34,28,0.28)');
  rs.addColorStop(1, 'rgba(24,34,28,0)');
  ctx.fillStyle = rs;
  ctx.fillRect(x0, rail + 7, x1 - x0, 15);
}

/* ------------------------------------------------------------------ the window and the door */

function paintWindowAndDoor(ctx: CanvasRenderingContext2D, S: number, vx: { x0: number; x1: number }, rnd: Rand): void {
  const W = WINDOW;
  // the view first, then the glass, then the frame over both
  paintStreet(ctx, S);
  paintGlass(ctx);
  const f = WOOD_GREEN;
  const g = GLASS;
  ctx.save();
  // the frame's shadow on the wall
  ctx.fillStyle = 'rgba(46,34,22,0.2)';
  ctx.filter = `blur(${Math.max(1, 2.4 * S)}px)`;
  ctx.fillRect(W.x0 + 3, W.y0 + 4, W.x1 - W.x0, W.y1 - W.y0);
  ctx.restore();
  // the sash bars and the mullion
  plank(ctx, g.x0 - 2, 128, g.x1 + 2, 136, f, rnd, { grain: 0.5 });
  plank(ctx, g.x0 - 2, 262, g.x1 + 2, 268, f, rnd, { grain: 0.5 });
  plank(ctx, 132, 136, 146, g.y1 + 2, f, rnd, { vertical: true, grain: 0.5 });
  // the architrave: head, jambs
  plank(ctx, W.x0, W.y0, W.x1, GLASS.y0, f, rnd, { grain: 0.6 });
  plank(ctx, W.x0, GLASS.y0, GLASS.x0, g.y1 + 2, f, rnd, { vertical: true, grain: 0.6 });
  plank(ctx, GLASS.x1, GLASS.y0, W.x1, g.y1 + 2, f, rnd, { vertical: true, grain: 0.6 });
  // a cornice cap on the head
  plank(ctx, W.x0 - 6, W.y0 - 7, W.x1 + 6, W.y0, mix(f, '#C9B07A', 0.25), rnd, { grain: 0.4 });
  // the bulkhead: two recessed panels under a sill
  plank(ctx, W.x0, g.y1 + 2, W.x1, W.y1, f, rnd, { grain: 0.7 });
  for (const [px0, px1] of [
    [38, 130],
    [148, 240],
  ] as const) {
    const poly = rectPoly(px0, 408, px1, 462, rnd, 0.3);
    wash(ctx, poly, mix(f, '#1C2A24', 0.35), 0.6, rnd, 2, 0.01);
    pen(ctx, px0, 408, px1, 408, 0.7, INK, 0.5, rnd, 0.2);
    pen(ctx, px0, 408, px0, 462, 0.7, INK, 0.5, rnd, 0.2);
    ctx.fillStyle = rgba(LIGHT, 0.2);
    ribbon(ctx, [px0 + 0.5, 462, px1, 462], 0.9, 0.9);
    ribbon(ctx, [px1 - 0.5, 408, px1 - 0.5, 462], 0.9, 0.9);
  }
  // the sill: a board projecting, catching the light on its top edge, with a pale wet line of the rain's overflow
  plank(ctx, W.x0 - 8, g.y1 + 2, W.x1 + 8, g.y1 + 12, '#B79C6A', rnd, { grain: 1 });
  ctx.fillStyle = rgba('#F6E8C4', 0.45);
  ribbon(ctx, [W.x0 - 6, g.y1 + 3, W.x1 + 6, g.y1 + 3], 1, 0.9);
  ctx.fillStyle = rgba('#2A1A10', 0.25);
  ctx.fillRect(W.x0 - 8, g.y1 + 12, W.x1 - W.x0 + 16, 2);
  // water that has run onto the sill, a puddle of it, and a jar of flowers? only the water: the weather is the subject
  for (let i = 0; i < 4; i++) {
    const px = rnd.range(W.x0 + 10, W.x1 - 10);
    ctx.fillStyle = rgba('#C6D6DD', 0.4);
    ctx.beginPath();
    ctx.ellipse(px, g.y1 + 5.5, rnd.range(4, 12), 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the frame's inner edge: a dark line where the glass sits, a light one where the moulding catches the sky
  for (const p of PANES) {
    pen(ctx, p.x0, p.y0, p.x1, p.y0, 0.7, INK, 0.5, rnd, 0.15);
    pen(ctx, p.x0, p.y0, p.x0, p.y1, 0.7, INK, 0.5, rnd, 0.15);
    pen(ctx, p.x1, p.y0, p.x1, p.y1, 0.6, INK, 0.45, rnd, 0.15);
    pen(ctx, p.x0, p.y1, p.x1, p.y1, 0.6, INK, 0.45, rnd, 0.15);
    // the frame's shadow on the glass (top and left)
    const gs = ctx.createLinearGradient(0, p.y0, 0, p.y0 + 5);
    gs.addColorStop(0, 'rgba(24,34,40,0.35)');
    gs.addColorStop(1, 'rgba(24,34,40,0)');
    ctx.fillStyle = gs;
    ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, 5);
    const gl = ctx.createLinearGradient(p.x0, 0, p.x0 + 4, 0);
    gl.addColorStop(0, 'rgba(24,34,40,0.28)');
    gl.addColorStop(1, 'rgba(24,34,40,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(p.x0, p.y0, 4, p.y1 - p.y0);
  }
  // the frame stated in ink: its outer edge, the bars, the sill, broken and of varying weight
  outline(ctx, W.x0, W.y0, W.x1, W.y1, rnd, 0.55, 0.8);
  outline(ctx, 132, 136, 146, g.y1, rnd, 0.45, 0.6);
  pen(ctx, g.x0, 128, g.x1, 128, 0.7, INK, 0.5, rnd, 0.2);
  pen(ctx, g.x0, 136, g.x1, 136, 0.6, INK, 0.45, rnd, 0.2);
  pen(ctx, W.x0 - 8, g.y1 + 12, W.x1 + 8, g.y1 + 12, 0.8, INK, 0.5, rnd, 0.2);
  paintDoor(ctx, vx, rnd);
}

/** the shop door at the left, past the window (seen on wider screens): a green leaf with a glazed top, brass, a bell */
function paintDoor(ctx: CanvasRenderingContext2D, vx: { x0: number; x1: number }, rnd: Rand): void {
  const x0 = -104;
  const x1 = 6;
  if (vx.x0 > x1 + 4) return;
  const top = 70;
  plank(ctx, x0 - 8, top - 12, x1 + 4, top + 8, mix(WOOD_GREEN, '#C9B07A', 0.15), rnd, { grain: 0.5 });
  plank(ctx, x0 - 8, top + 8, x0, FLOOR_Y - 10, WOOD_GREEN, rnd, { vertical: true, grain: 0.6 });
  plank(ctx, x1 - 4, top + 8, x1 + 4, FLOOR_Y - 10, WOOD_GREEN, rnd, { vertical: true, grain: 0.6 });
  // the leaf: a wash of green, glazed above, two panels below
  wash(ctx, rectPoly(x0, top + 8, x1 - 4, FLOOR_Y - 10, rnd, 0.4), WOOD_GREEN, 0.95, rnd, 3, 0.01);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top + 8, x1 - 4 - x0, FLOOR_Y - 10 - top - 8);
  ctx.clip();
  mottle(ctx, x0, top + 8, x1 - 4, FLOOR_Y - 10, ['#3F5F58', '#6A8070', '#4A6A5A', '#7A8A6A', '#35524C'], 5151, 0.4, 26, 0.6);
  // weather: paint worn to the oak where hands and rain have been, pale blisters
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#A8946A' : '#C9C0A0', rnd.range(0.12, 0.3));
    tracePoly(ctx, deform(blobPoly(rnd.range(x0 + 4, x1 - 8), rnd.range(top + 20, FLOOR_Y - 20), rnd.range(1.5, 5), rnd.range(2, 9), rnd, 8, 0.3), rnd, 1, 0.12));
    ctx.fill();
  }
  for (let i = 0; i < 12; i++) {
    const gx = rnd.range(x0 + 3, x1 - 7);
    ctx.fillStyle = rgba('#1E3228', rnd.range(0.08, 0.18));
    ribbon(ctx, [gx, top + 20, gx + rnd.range(-1, 1), FLOOR_Y - 30], rnd.range(0.4, 1), 0.9);
  }
  ctx.restore();
  const gx0 = x0 + 12;
  const gx1 = x1 - 16;
  // the glass: the street's cool grey, an old streaky reflection
  const gg = ctx.createLinearGradient(0, top + 22, 0, 330);
  gg.addColorStop(0, '#9FB2BF');
  gg.addColorStop(1, '#C3D0D4');
  ctx.fillStyle = gg;
  ctx.fillRect(gx0, top + 22, gx1 - gx0, 330 - top - 22);
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx0, top + 22, gx1 - gx0, 330 - top - 22);
  ctx.clip();
  mottle(ctx, gx0, top + 22, gx1, 330, ['#7C92A4', '#C4D2D8', '#98ACBA', '#B0BEA8'], 3131, 0.3, 30, 0.7);
  ctx.restore();
  for (let i = 0; i < 14; i++) {
    const x = rnd.range(gx0 + 3, gx1 - 3);
    const y = rnd.range(top + 30, 300);
    ctx.fillStyle = rgba('#EAF1F2', rnd.range(0.14, 0.28));
    ribbon(ctx, [x, y, x + 0.4, y + rnd.range(14, 44)], 0.8, 0.9);
  }
  ctx.fillStyle = rgba('#F4F8F8', 0.08);
  ctx.beginPath();
  ctx.moveTo(gx0 + 18, top + 22);
  ctx.lineTo(gx0 + 34, top + 22);
  ctx.lineTo(gx0 - 6, 330);
  ctx.lineTo(gx0 - 22, 330);
  ctx.closePath();
  ctx.fill();
  plank(ctx, gx0 - 4, top + 16, gx1 + 4, top + 22, WOOD_GREEN, rnd, { grain: 0.4 });
  plank(ctx, gx0 - 4, 330, gx1 + 4, 340, WOOD_GREEN, rnd, { grain: 0.4 });
  plank(ctx, gx0 - 4, top + 22, gx0, 330, WOOD_GREEN, rnd, { vertical: true, grain: 0.4 });
  plank(ctx, gx1, top + 22, gx1 + 4, 330, WOOD_GREEN, rnd, { vertical: true, grain: 0.4 });
  // the lower panels
  for (const [py0, py1] of [
    [350, 432],
    [444, 516],
  ] as const) {
    wash(ctx, rectPoly(gx0, py0, gx1, py1, rnd, 0.3), mix(WOOD_GREEN, '#1C2A24', 0.3), 0.7, rnd, 2, 0.01);
    pen(ctx, gx0, py0, gx1, py0, 0.7, INK, 0.5, rnd, 0.2);
    pen(ctx, gx0, py0, gx0, py1, 0.7, INK, 0.5, rnd, 0.2);
    ctx.fillStyle = rgba(LIGHT, 0.2);
    ribbon(ctx, [gx0, py1, gx1, py1], 0.9, 0.9);
  }
  outline(ctx, x0 - 8, top - 12, x1 + 4, FLOOR_Y - 10, rnd, 0.55, 0.85);
  outline(ctx, x0, top + 8, x1 - 4, FLOOR_Y - 10, rnd, 0.45, 0.7);
  // the brass handle and a plate; the bell on its spring over the door
  wash(ctx, rectPoly(x1 - 14, 300, x1 - 9, 332, rnd, 0.2), '#C9A24A', 0.95, rnd, 2, 0.01);
  ctx.fillStyle = rgba('#FFF0B8', 0.6);
  ctx.fillRect(x1 - 13.4, 304, 0.8, 22);
  pen(ctx, x1 - 14, 300, x1 - 14, 332, 0.5, INK, 0.5, rnd, 0.1);
  const bx = (x0 + x1) / 2;
  ctx.strokeStyle = rgba('#3A2C22', 0.8);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(bx - 20, top + 10);
  ctx.bezierCurveTo(bx - 20, top + 26, bx - 4, top + 26, bx, top + 38);
  ctx.stroke();
  wash(ctx, [bx - 6, top + 38, bx + 6, top + 38, bx + 8, top + 50, bx + 10, top + 52, bx - 10, top + 52, bx - 8, top + 50], '#C9A24A', 0.97, rnd, 3, 0.02);
  ctx.fillStyle = rgba('#FFF0B8', 0.6);
  ribbon(ctx, [bx - 4, top + 40, bx - 6, top + 50], 1.4, 0.8);
  ctx.fillStyle = rgba('#3A2C22', 0.85);
  ctx.beginPath();
  ctx.arc(bx, top + 53, 1.3, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------------ the shelves */

const BOARDS = [140, 212, 284, 356, 414];
const BAYS: [number, number][] = [
  [292, 421],
  [427, 561],
  [567, 690],
];

function paintShelves(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const R = SHELVES;
  // each bay's back: a dark, warm board wall, lamplit from the front
  for (const [bx0, bx1] of BAYS) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx0, 68, bx1 - bx0, R.y1 - 68);
    ctx.clip();
    ctx.fillStyle = '#755838';
    ctx.fillRect(bx0, 68, bx1 - bx0, R.y1 - 68);
    mottle(ctx, bx0, 68, bx1, R.y1, ['#664A2E', '#8A6C48', '#745634', '#92744A', '#7A6848'], 4411 + bx0, 0.38, 30, 1.2);
    for (let x = bx0 + rnd.range(2, 6); x < bx1; x += rnd.range(11, 16)) pen(ctx, x, 68, x + rnd.range(-0.4, 0.4), R.y1, 0.5, '#4A3420', 0.3, rnd, 0.4);
    // each shelf's shadow on the back
    for (const by of BOARDS) {
      const sh = ctx.createLinearGradient(0, by - 4, 0, by + 14);
      sh.addColorStop(0, 'rgba(24,14,8,0)');
      sh.addColorStop(1, 'rgba(24,14,8,0.0)');
      ctx.fillStyle = sh;
      ctx.fillRect(bx0, by - 4, bx1 - bx0, 18);
    }
    // the top of each bay is darkest (the lamp shades the cornice's underside)
    const top = ctx.createLinearGradient(0, 68, 0, 140);
    top.addColorStop(0, 'rgba(40,24,10,0.28)');
    top.addColorStop(1, 'rgba(20,12,6,0)');
    ctx.fillStyle = top;
    ctx.fillRect(bx0, 68, bx1 - bx0, 72);
    ctx.restore();
  }
  // boards, then goods on them
  BOARDS.forEach((by) => {
    for (const [bx0, bx1] of BAYS) {
      plank(ctx, bx0 - 2, by, bx1 + 2, by + 7, '#A07048', rnd, { grain: 1, edge: 1 });
      ctx.fillStyle = rgba('#F2D8A8', 0.28);
      ribbon(ctx, [bx0, by + 0.6, bx1, by + 0.6], 0.9, 0.9);
      // the shadow below the board, on whatever stands under it
      const sh = ctx.createLinearGradient(0, by + 7, 0, by + 20);
      sh.addColorStop(0, 'rgba(20,12,6,0.4)');
      sh.addColorStop(1, 'rgba(20,12,6,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(bx0, by + 7, bx1 - bx0, 13);
    }
  });
  BOARDS.forEach((by, row) => {
    const clear = (row === 0 ? by - 68 : by - BOARDS[row - 1]! - 7) - 3;
    BAYS.forEach(([bx0, bx1], bi) => {
      // a second rank behind the first, standing a little higher on the board and in shade, so the shelf is full
      stockRow(ctx, bx0 + 5, bx1 - 5, by - 5, clear - 3, row, rnd, bi);
      const sh = ctx.createLinearGradient(0, by - clear, 0, by);
      sh.addColorStop(0, 'rgba(50,32,16,0.1)');
      sh.addColorStop(1, 'rgba(50,32,16,0.3)');
      ctx.fillStyle = sh;
      ctx.fillRect(bx0, by - clear, bx1 - bx0, clear);
      stockRow(ctx, bx0 + 3, bx1 - 3, by, clear, row, rnd, bi);
    });
  });
  // price tags hung at the boards' front edges: a paper tag, a scrawl
  BOARDS.forEach((by) => {
    for (let i = 0; i < 6; i++) {
      const tx = rnd.range(298, 682);
      if ((tx > 417 && tx < 431) || (tx > 557 && tx < 571)) continue;
      const w = rnd.range(5, 8);
      wash(ctx, rectPoly(tx, by + 2, tx + w, by + 6.4, rnd, 0.15), rnd.pick(['#F0E6CB', '#E8DDBD', '#F5EEDA']), 0.95, rnd, 2, 0.01);
      pen(ctx, tx + 1, by + 4.2, tx + w - 1, by + 4.2, 0.45, INK, 0.55, rnd, 0.1);
    }
  });
  // the frame: uprights, the cornice, a plinth
  plank(ctx, R.x0, R.y0, R.x0 + 10, R.y1, OAK, rnd, { vertical: true, grain: 1.2 });
  plank(ctx, R.x1 - 10, R.y0, R.x1, R.y1, mix(OAK, '#3A2414', 0.25), rnd, { vertical: true, grain: 1.2 });
  for (const [bx0, bx1] of [[421, 427], [561, 567]] as const) plank(ctx, bx0, 68, bx1, R.y1, mix(OAK, '#3A2414', 0.15), rnd, { vertical: true, grain: 1 });
  plank(ctx, R.x0 - 6, R.y0, R.x1 + 6, 62, OAK, rnd, { grain: 1.4, knots: 1 });
  plank(ctx, R.x0 - 2, 62, R.x1 + 2, 69, mix(OAK, '#C9A070', 0.18), rnd, { grain: 0.8 });
  ctx.fillStyle = rgba('#2A1A10', 0.3);
  ctx.fillRect(R.x0 - 2, 69, R.x1 - R.x0 + 4, 2);
  outline(ctx, R.x0, R.y0, R.x1, R.y1, rnd, 0.55, 0.9);
  pen(ctx, R.x0 - 6, 62, R.x1 + 6, 62, 0.8, INK, 0.5, rnd, 0.2);
  // the cup, last of all on its shelf: white enamel, a blue rim, a handle
  paintCup(ctx, CUP.x, CUP.y, rnd);
}

function paintCup(ctx: CanvasRenderingContext2D, x: number, y: number, rnd: Rand): void {
  // y is the rim; the base stands on the board at y + 12
  const bw = 11;
  const h = 12;
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x + bw + 0.5, y + 3);
  ctx.bezierCurveTo(x + bw + 7, y + 2, x + bw + 7, y + 9, x + bw - 0.5, y + 9);
  ctx.stroke();
  wash(ctx, [x - bw / 2 - 1, y, x + bw / 2 + 1, y, x + bw / 2 - 0.5, y + h, x - bw / 2 + 0.5, y + h], '#E8E2D0', 0.97, rnd, 2, 0.01);
  ctx.fillStyle = rgba('#3F6A9A', 0.9);
  ctx.fillRect(x - bw / 2 - 1, y, bw + 2, 1.4);
  ctx.fillStyle = rgba('#5A3A22', 0.9);
  ctx.beginPath();
  ctx.ellipse(x, y + 0.5, bw / 2 + 0.6, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(LIGHT, 0.5);
  ribbon(ctx, [x - bw / 2 + 1, y + 2, x - bw / 2 + 1.4, y + h - 1.5], 1.3, 0.8);
  ctx.fillStyle = rgba(SHADE, 0.25);
  ribbon(ctx, [x + bw / 2 - 1.4, y + 2, x + bw / 2 - 1.2, y + h - 1], 2.2, 0.8);
  pen(ctx, x - bw / 2 - 1, y, x - bw / 2 + 0.5, y + h, 0.5, INK, 0.5, rnd, 0.1);
  pen(ctx, x - bw / 2 + 0.5, y + h, x + bw / 2 - 0.5, y + h, 0.5, INK, 0.55, rnd, 0.1);
}

const MIX: Record<number, [number, number, number, number, number, number]> = {
  // jars, bottles, packets, tins, sacks, crates
  0: [0.3, 0.2, 0.15, 0.25, 0.1, 0],
  1: [0.2, 0.15, 0.3, 0.35, 0, 0],
  2: [0.25, 0.15, 0.3, 0.3, 0, 0],
  3: [0.2, 0.05, 0.25, 0.3, 0.1, 0.1],
  4: [0.15, 0, 0.1, 0.15, 0.32, 0.28],
};

function stockRow(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, clear: number, row: number, rnd: Rand, bay: number): void {
  const w = MIX[row]!;
  let x = x0 + rnd.range(0, 4);
  // a gap now and then, and one bay's row only half stocked
  const sparse = rnd.chance(0.14);
  while (x < x1 - 6) {
    if (rnd.chance(sparse ? 0.3 : 0.06)) {
      x += rnd.range(6, 16);
      continue;
    }
    let u = rnd.next();
    let kind = 0;
    for (; kind < 5; kind++) {
      u -= w[kind]!;
      if (u <= 0) break;
    }
    const room = x1 - x;
    const hMax = clear;
    let used = 0;
    switch (kind) {
      case 0: {
        const jw = rnd.range(12, 21);
        if (jw > room) return;
        jar(ctx, x, base, jw * 1.1, Math.min(hMax, rnd.range(30, 56)), rnd);
        used = jw * 1.1;
        break;
      }
      case 1: {
        const bw = rnd.range(8, 13);
        if (bw > room) return;
        bottle(ctx, x, base, bw, Math.min(hMax, rnd.range(36, 62)), rnd);
        used = bw;
        break;
      }
      case 2: {
        const pw = rnd.range(10, 21);
        if (pw > room) return;
        packet(ctx, x, base, pw * 1.1, Math.min(hMax, rnd.range(22, 46)), rnd);
        used = pw * 1.1;
        break;
      }
      case 3: {
        const tw = rnd.range(11, 20);
        const th = rnd.range(14, 30);
        if (tw * (rnd.chance(0.14) ? 2.1 : 1) > room) return;
        if (rnd.chance(0.14) && th * 2 + 2 < clear) {
          // a pyramid of tins: two below, one on top
          tin(ctx, x, base, tw, th, rnd);
          tin(ctx, x + tw + 0.6, base, tw, th, rnd);
          tin(ctx, x + tw * 0.5 + 0.3, base - th, tw, th, rnd);
          used = tw * 2 + 0.6;
        } else {
          tin(ctx, x, base, tw, th, rnd);
          used = tw;
          if (rnd.chance(0.25) && th * 2 < clear) tin(ctx, x + rnd.range(-0.4, 0.4), base - th, tw, rnd.range(10, th), rnd);
        }
        break;
      }
      case 4: {
        const sw = rnd.range(22, 34);
        if (sw > room) return;
        sack(ctx, x, base, sw, Math.min(hMax, rnd.range(26, 46)), rnd);
        used = sw;
        break;
      }
      default: {
        const cw = rnd.range(28, 42);
        if (cw > room) return;
        crateOfThings(ctx, x, base, cw, Math.min(hMax, rnd.range(20, 30)), rnd);
        used = cw;
      }
    }
    x += used + rnd.range(0.4, 4.2);
  }
  void bay;
}

/* ------------------------------------------------------------------ the lamps */

function paintLamps(ctx: CanvasRenderingContext2D, rnd: Rand, topY: number): void {
  for (const L of LAMPS) {
    const top = L.shadeY;
    // its shadow falls on the goods behind it
    ctx.fillStyle = 'rgba(30,18,8,0.22)';
    ctx.beginPath();
    ctx.ellipse(L.x + 9, top + 52, 38, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // the flex and its ceiling rose
    ctx.strokeStyle = rgba('#2A1F18', 0.85);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(L.x, topY);
    ctx.lineTo(L.x + 0.3, top - 6);
    ctx.stroke();
    // a brass collar where the flex enters the shade
    wash(ctx, [L.x - 4, top - 8, L.x + 4, top - 8, L.x + 3, top + 1, L.x - 3, top + 1], '#B88A3A', 0.95, rnd, 2, 0.02);
    // the shade: a deep green enamel dome, flared, lit on the left; the lamp's own warm light under it
    const dome: number[] = [];
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI + (k / 14) * Math.PI;
      dome.push(L.x + Math.cos(a) * 29, top + 24 + Math.sin(a) * 24);
    }
    dome.push(L.x + 35, top + 28, L.x - 35, top + 28);
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 0.7;
    tracePoly(ctx, dome);
    ctx.stroke();
    wash(ctx, dome, '#3F6350', 0.96, rnd, 3, 0.01);
    ctx.fillStyle = rgba('#B6D6B8', 0.5);
    ribbon(ctx, [L.x - 22, top + 18, L.x - 15, top + 8, L.x - 4, top + 3], 3, 0.8);
    ctx.fillStyle = rgba('#1E3228', 0.4);
    ribbon(ctx, [L.x + 14, top + 6, L.x + 25, top + 18, L.x + 31, top + 26], 5, 0.8);
    // the rim and the bright underside
    ctx.fillStyle = rgba('#F7E3A0', 0.95);
    ctx.beginPath();
    ctx.ellipse(L.x, top + 28, 35, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.6;
    ctx.stroke();
    const bulb = ctx.createRadialGradient(L.x, top + 31, 0, L.x, top + 31, 12);
    bulb.addColorStop(0, 'rgba(255,250,214,1)');
    bulb.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = bulb;
    ctx.fillRect(L.x - 14, top + 24, 28, 18);
    pen(ctx, L.x - 6, top + 1, L.x + 6, top + 1, 0.7, INK, 0.5, rnd, 0.1);
  }
}

/* ------------------------------------------------------------------ the right wall (past the board) */

function paintRightWall(ctx: CanvasRenderingContext2D, vx: { x0: number; x1: number }, rnd: Rand): void {
  if (vx.x1 < 980) return;
  // a wall clock, and a rail with two hanging baskets: few things, each painted properly
  const cx = 1060;
  const cy = 160;
  const ring = (r: number): number[] => Array.from({ length: 28 }, (_, k) => [cx + Math.cos((k / 28) * Math.PI * 2) * r, cy + Math.sin((k / 28) * Math.PI * 2) * r]).flat();
  ctx.fillStyle = 'rgba(46,30,16,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy + 5, 27, 27, 0, 0, Math.PI * 2);
  ctx.fill();
  wash(ctx, ring(26), '#6A4529', 0.95, rnd, 3, 0.01);
  wash(ctx, ring(21), '#EDE4C8', 0.95, rnd, 3, 0.01);
  ctx.fillStyle = rgba('#FFF6DC', 0.4);
  ribbon(ctx, [cx - 16, cy - 8, cx - 8, cy - 15, cx + 2, cy - 17], 3, 0.8);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0.2, Math.PI * 1.9);
  ctx.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    pen(ctx, cx + Math.cos(a) * 17.5, cy + Math.sin(a) * 17.5, cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, k % 3 === 0 ? 1 : 0.6, INK, 0.65, rnd, 0.05);
  }
  pen(ctx, cx, cy, cx + 5, cy - 10, 0.9, INK, 0.8, rnd, 0.05);
  pen(ctx, cx, cy, cx - 12, cy + 3, 0.7, INK, 0.8, rnd, 0.05);
  plank(ctx, 1000, 250, 1170, 258, OAK, rnd, { grain: 1 });
  for (const [hx, r] of [
    [1034, 17],
    [1100, 14],
  ] as const) {
    ctx.fillStyle = 'rgba(46,30,16,0.2)';
    ctx.beginPath();
    ctx.ellipse(hx + 5, 304, r, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba('#6A4A22', 0.8);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(hx, 266, 8, Math.PI, Math.PI * 2);
    ctx.stroke();
    pen(ctx, hx, 258, hx, 262, 1, '#2A1F18', 0.8, rnd, 0.1);
    wash(ctx, [hx - r, 274, hx + r, 274, hx + r - 4, 302, hx - r + 4, 302], '#B68F52', 0.95, rnd, 3, 0.03);
    for (let b = 0; b < 6; b++) pen(ctx, hx - r + 2, 278 + b * 4.5, hx + r - 2, 278 + b * 4.5 + rnd.range(-1, 1), 0.6, '#5A3A1A', 0.45, rnd, 0.3);
    for (let b = 0; b < 7; b++) pen(ctx, hx - r + 2 + b * ((2 * r - 4) / 6), 274, hx - r + 4 + b * ((2 * r - 8) / 6), 302, 0.5, '#5A3A1A', 0.35, rnd, 0.2);
    ctx.fillStyle = rgba(LIGHT, 0.3);
    ribbon(ctx, [hx - r + 3, 276, hx - r + 5, 300], 2, 0.8);
  }
  void washEdge;
}

/* ------------------------------------------------------------------ the floor */

function paintFloor(ctx: CanvasRenderingContext2D, vx: { x0: number; x1: number }, vy: { y0: number; y1: number }, rnd: Rand): void {
  const x0 = vx.x0 - 80;
  const x1 = vx.x1 + 80;
  const bottom = vy.y1 + 30;
  // boards run away from us toward a vanishing point near the counter's middle, at the height of the eye
  const VP = { x: 420, y: 430 };
  const proj = (xf: number, y: number): number => VP.x + (xf - VP.x) * ((y - VP.y) / (FLOOR_Y - VP.y));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, FLOOR_Y, x1 - x0, bottom - FLOOR_Y);
  ctx.clip();
  ctx.fillStyle = '#6A4A2C';
  ctx.fillRect(x0, FLOOR_Y, x1 - x0, bottom - FLOOR_Y);
  // strips of unequal width (as laid at the wall), each cut into boards of unequal length by the cross joints
  let xf = VP.x - 2600;
  while (xf < VP.x + 2600) {
    const sw = rnd.range(26, 64);
    const strip = mix(rnd.pick(['#9A6E42', '#A8794A', '#8E6338', '#B08454', '#94693E']), '#4A3018', rnd.range(0.0, 0.3));
    let ya = FLOOR_Y;
    while (ya < bottom) {
      const len = rnd.range(26, 120) * (1 + (ya - FLOOR_Y) / 140);
      const yb = Math.min(bottom + 4, ya + len);
      const ax0 = proj(xf, ya);
      const ax1 = proj(xf + sw - 1.2, ya);
      const bx0 = proj(xf, yb);
      const bx1 = proj(xf + sw - 1.2, yb);
      if (Math.max(bx1, ax1) >= x0 && Math.min(ax0, bx0) <= x1) {
        const tone = mix(strip, rnd.pick(['#A07848', '#6A4426', '#8A5E36']), rnd.range(0.05, 0.3));
        const quad = [ax0, ya, ax1, ya, bx1, yb - 0.8, bx0, yb - 0.8];
        const mx = (ax0 + bx1) / 2;
        const my = (ya + yb) / 2;
        const lt = lit(tone, mx, my);
        face(ctx, rnd, quad, lt, 0.86, '#2E1C10', 0.36, [0.2, 1]);
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = rgba(lit(mix(tone, rnd.pick(['#B8884E', '#5A3A20', '#8A7A5A']), 0.4), mx, my), 0.28);
          tracePoly(ctx, deform(blobPoly(ax0 + (ax1 - ax0) * rnd.range(0.2, 0.8) + (bx0 - ax0) * 0.5, my + rnd.range(-0.3, 0.3) * (yb - ya), (ax1 - ax0) * 0.3, (yb - ya) * rnd.range(0.2, 0.4), rnd, 8, 0.2), rnd, 1, 0.1));
          ctx.fill();
        }
        // long grain, running with the board toward the vanishing point
        const gl = 2 + Math.round((ax1 - ax0) / 20);
        for (let g = 0; g < gl; g++) {
          const t = rnd.range(0.1, 0.9);
          const gx0 = ax0 + (ax1 - ax0) * t;
          const gx1 = bx0 + (bx1 - bx0) * t;
          ctx.fillStyle = rgba('#2E1A0C', rnd.range(0.05, 0.14));
          ribbon(ctx, [gx0, ya + 1, (gx0 + gx1) / 2 + rnd.range(-0.6, 0.6), (ya + yb) / 2, gx1, yb - 1], rnd.range(0.3, 0.9), 0.9);
        }
        // the lit edge of the board (light from the window), the joint dark
        ctx.fillStyle = rgba('#F2D8A8', 0.1);
        ribbon(ctx, [ax0 + 0.6, ya, bx0 + 0.6, yb], 0.8, 0.9);
        pen(ctx, bx0, yb - 0.4, bx1, yb - 0.4, 0.7, '#1E1008', 0.6, rnd, 0.3);
        pen(ctx, ax0, ya, bx0, yb, 0.6, '#1E1008', 0.5, rnd, 0.3);
        if (rnd.chance(0.5)) {
          for (const nx of [0.2, 0.8]) {
            ctx.fillStyle = rgba('#1E1008', 0.45);
            ctx.fillRect(ax0 + (ax1 - ax0) * nx, ya + 2.5, 0.9, 0.9);
          }
        }
      }
      ya = yb;
    }
    xf += sw;
  }
  // a worn path in front of the counter and on to the board: pale, soft-edged, broken
  for (let i = 0; i < 16; i++) {
    const wx = rnd.range(150, 800);
    const wy = rnd.range(556, 620);
    ctx.fillStyle = rgba('#D6A468', rnd.range(0.05, 0.1));
    tracePoly(ctx, deform(blobPoly(wx, wy, rnd.range(40, 110), rnd.range(5, 11), rnd, 12, 0.25), rnd, 2, 0.1));
    ctx.fill();
  }
  // the mat by the door
  const mx0 = -118;
  const mx1 = 4;
  wash(ctx, rectPoly(mx0, 548, mx1, 584, rnd, 0.8), '#7A5E3A', 0.95, rnd, 3, 0.02);
  wash(ctx, rectPoly(mx0 + 5, 553, mx1 - 5, 579, rnd, 0.6), '#9A7C4C', 0.9, rnd, 2, 0.02);
  for (let i = 0; i < 60; i++) pen(ctx, rnd.range(mx0 + 7, mx1 - 7), rnd.range(555, 577), rnd.range(mx0 + 7, mx1 - 7), rnd.range(555, 577), 0.4, '#4A3418', 0.25, rnd, 0.2);
  // under the label band the floor is quiet and dark: the foot of the room falls away into shadow
  const fall = ctx.createLinearGradient(0, 590, 0, bottom);
  fall.addColorStop(0, 'rgba(34,20,10,0)');
  fall.addColorStop(0.5, 'rgba(34,20,10,0.28)');
  fall.addColorStop(1, 'rgba(30,18,10,0.46)');
  ctx.fillStyle = fall;
  ctx.fillRect(x0, 590, x1 - x0, bottom - 590);
  ctx.restore();
}

/* ------------------------------------------------------------------ the light */

function paintLight(ctx: CanvasRenderingContext2D, vx: { x0: number; x1: number }, vy: { y0: number; y1: number }): void {
  const w = WINDOW;
  const x0 = vx.x0;
  const wide = vx.x1 - vx.x0;
  ctx.save();
  // only lights what is painted
  ctx.globalCompositeOperation = 'source-atop';
  // daylight: cool, from the window across the left wall and floor, falling off to the right
  {
    const g = ctx.createRadialGradient((w.x0 + w.x1) / 2, 250, 20, (w.x0 + w.x1) / 2, 250, 520);
    g.addColorStop(0, 'rgba(140,184,226,0.36)');
    g.addColorStop(0.5, 'rgba(140,184,226,0.14)');
    g.addColorStop(1, 'rgba(176,206,232,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, vy.y0, 760 - x0, vy.y1 - vy.y0);
  }
  // the window's light on the floor: a slanted patch, the bars' shadows across it
  {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, FLOOR_Y, wide, vy.y1 - FLOOR_Y);
    ctx.clip();
    const lg = ctx.createRadialGradient(170, 590, 0, 170, 590, 300);
    lg.addColorStop(0, 'rgba(200,222,240,0.16)');
    lg.addColorStop(1, 'rgba(200,222,240,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(x0, FLOOR_Y, 600, vy.y1 - FLOOR_Y + 60);
    ctx.restore();
  }
  // warm pools under each lamp, wide and soft, brightest on what is nearest below
  for (const L of LAMPS) {
    const g = ctx.createRadialGradient(L.x, L.shadeY + 40, 10, L.x, L.shadeY + 80, 330);
    g.addColorStop(0, 'rgba(255,206,120,0.34)');
    g.addColorStop(0.45, 'rgba(255,196,110,0.14)');
    g.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(L.x - 340, vy.y0, 680, vy.y1 - vy.y0);
  }
  // the room darkens toward its far corners and floor edge
  {
    const g = ctx.createRadialGradient(500, 330, 280, 500, 330, Math.max(520, wide * 0.62));
    g.addColorStop(0, 'rgba(40,24,12,0)');
    g.addColorStop(1, 'rgba(40,24,12,0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(vx.x0, vy.y0, wide, vy.y1 - vy.y0);
  }
  ctx.restore();
  void fitCamera;
  void bottle;
}

/** colour drifting through what is painted, soft edges, and paper left bare where the light is */
function finishSheet(sheet: HTMLCanvasElement, ctx: CanvasRenderingContext2D, S: number): void {
  const Wd = sheet.width;
  const Hd = sheet.height;
  const rnd = new Rand(99173);
  // 1. wet-in-wet drift: broad blooms of blue, ochre, rose and sage laid over what is painted (low resolution, scaled up)
  {
    const q = 6;
    const w = Math.ceil(Wd / q);
    const h = Math.ceil(Hd / q);
    const sm = makeCanvas(w, h);
    const g = sm.getContext('2d')!;
    const cols = ['70,110,170', '176,124,56', '160,80,70', '90,130,100', '100,90,140'];
    for (let i = 0; i < 22; i++) {
      const x = rnd.range(0, w);
      const y = rnd.range(0, h);
      const r = rnd.range(0.08, 0.26) * Math.max(w, h);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = rnd.pick(cols);
      gr.addColorStop(0, `rgba(${c},${rnd.range(0.04, 0.085)})`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sm, 0, 0, Wd, Hd);
    ctx.restore();
  }
  // 2. soft edges: a blurred copy over the crisp one, as a wet brush softens a drawn line
  {
    const t = makeCanvas(Wd, Hd);
    const tg = t.getContext('2d')!;
    tg.filter = `blur(${Math.max(0.6, 0.75 * S)}px)`;
    tg.drawImage(sheet, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.3;
    ctx.drawImage(t, 0, 0);
    ctx.restore();
  }
  // 3. paper left bare where the light is brightest: under each lamp and at the window's upper left
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const [lx, ly, r, a] of [
    [LAMPS[0]!.x, 250, 230, 0.07],
    [LAMPS[1]!.x, 250, 230, 0.07],
    [90, 160, 190, 0.06],
    [100, 200, 150, 0.07],
  ] as const) {
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
  }
  ctx.restore();
}
