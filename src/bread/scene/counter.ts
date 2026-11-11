/**
 * The counter and what is fixed on it (layer 3 in geom.ts), and the foreground crates (layer 5), each painted once per
 * size as a sprite on transparent paper: the long counter with its worn top and panelled front, the old brass till
 * at the left end, the scale at the right, paper bags and a ball of twine with its loose end. Ink first, then the
 * washes, as the shelves; lit from the upper left (the window) and warmed from above (the lamps).
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { COUNTER, CRATES, SCALE, TILL } from './geom';
import { INK, LIGHT, SHADE, blobPoly, grain, lit, lightAt, mix, mottle, patchWash, pen, plank, rectPoly, ribbon, spriteCtx, wash, washField } from './paint';
import { apple, greens, potato } from './goods';
import { glazeSprite } from './light';

export interface Sprite {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

const BRASS = '#C9A24A';
const BRASS_D = '#8C6A26';
const BRASS_L = '#F1D88A';
const COUNTER_WOOD = '#A8733E';

export function paintCounter(q: number): Sprite {
  const box = { x: COUNTER.x0 - 16, y: 366, w: COUNTER.x1 - COUNTER.x0 + 32, h: COUNTER.floorFront - 366 + 14 };
  const { cv, ctx } = spriteCtx(box, q);
  const rnd = new Rand(55021);
  const { x0, x1, topBack, topFront, floorFront } = COUNTER;
  const lip = topFront + 10;

  // the counter's shadow on the floor
  {
    const sh = ctx.createLinearGradient(0, floorFront - 2, 0, floorFront + 14);
    sh.addColorStop(0, 'rgba(26,16,8,0.42)');
    sh.addColorStop(1, 'rgba(26,16,8,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(x0 - 10, floorFront - 2, x1 - x0 + 20, 16);
  }
  // the front: unequal bays between stiles and rails, no two alike: a cupboard door, one standing a little ajar, a pair
  // of drawers, a door, a bay of plain boards, a door. The doors are raised and fielded: the bevels catch the light on
  // their upper left and fall into shade below right, the field carries the wood's figure. The lip above throws a deep
  // shadow across the top of it all (the strongest dark against the lit top).
  const widths = [96, 108, 84, 112, 90, 84];
  const kinds = ['door', 'ajar', 'drawers', 'door', 'board', 'door'] as const;
  const tones = ['#8A5632', '#7C4C2C', '#946038', '#80502E', '#8E5A34', '#76462A'];
  const stile = 10;
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = (x1 - x0 - stile) / (total + stile * (widths.length - 1));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 1, lip - 1, x1 - x0 + 2, floorFront - lip + 2);
  ctx.clip();
  // the carcass: rails and stiles washed in drifting wood tones, the grain running along each
  ctx.fillStyle = rgba('#7E4E2E', 0.8);
  ctx.fillRect(x0, lip, x1 - x0, floorFront - lip);
  const wf = washField(8101, ['#7A4A2A', '#8C5A34', '#6E4226', '#9A6A3E', '#764830'], 0.02, 0.03);
  patchWash(ctx, x0, lip, x1, floorFront, (x, y) => lit(wf(x, y), x, y), rnd, 12, 0.5, 2);
  for (let i = 0; i < 26; i++) {
    const gy = rnd.range(lip + 1, lip + 9);
    const gx = rnd.range(x0, x1 - 40);
    ctx.fillStyle = rgba('#2A1608', rnd.range(0.1, 0.22));
    ribbon(ctx, [gx, gy, gx + rnd.range(30, 90), gy + rnd.range(-0.4, 0.4)], rnd.range(0.3, 0.7), 0.9);
  }
  let cursor = x0 + stile * scale;
  for (let i = 0; i <= widths.length; i++) {
    // the stile to the left of this bay: vertical grain, a lit left arris
    const sx0 = cursor - stile * scale;
    for (let g = 0; g < 3; g++) {
      const gx = rnd.range(sx0 + 1.5, cursor - 1.5);
      ctx.fillStyle = rgba('#2A1608', rnd.range(0.1, 0.2));
      ribbon(ctx, [gx, lip + 2, gx + rnd.range(-0.6, 0.6), (lip + floorFront) / 2, gx + rnd.range(-0.6, 0.6), floorFront - 22], rnd.range(0.3, 0.6), 0.9);
    }
    ctx.fillStyle = rgba('#F0C890', 0.18);
    ribbon(ctx, [sx0 + 0.8, lip + 10, sx0 + 0.8, floorFront - 24], 0.7, 0.9);
    if (i === widths.length) break;
    const px0 = cursor + 1.5;
    const px1 = cursor + widths[i]! * scale - 1.5;
    cursor += (widths[i]! + stile) * scale;
    const py0 = lip + 10 + rnd.range(-0.6, 0.6);
    const py1 = floorFront - 26 + rnd.range(-0.8, 0.8);
    const kind = kinds[i]!;
    const tone = lit(tones[i]!, (px0 + px1) / 2, (py0 + py1) / 2);
    if (kind === 'drawers') {
      const mid = (py0 + py1) / 2;
      for (const [a, b] of [
        [py0, mid - 2.5],
        [mid + 2.5, py1],
      ] as const) {
        fieldPanel(ctx, px0, a, px1, b, mix(tone, '#B07C48', 0.12), rnd, 3.2, 0.5);
        // a brass cup pull
        const cx = (px0 + px1) / 2;
        const cy = (a + b) / 2;
        ctx.fillStyle = rgba('#1E1008', 0.4);
        ctx.beginPath();
        ctx.ellipse(cx + 0.8, cy + 1.6, 7.5, 2.6, 0, 0, Math.PI);
        ctx.fill();
        wash(ctx, [cx - 7, cy - 1.4, cx + 7, cy - 1.4, cx + 6, cy + 1.2, cx + 3, cy + 2.6, cx - 3, cy + 2.6, cx - 6, cy + 1.2], BRASS, 0.97, rnd, 2, 0.01);
        ctx.fillStyle = rgba(BRASS_L, 0.75);
        ribbon(ctx, [cx - 6, cy - 0.9, cx - 1, cy - 1], 0.7, 0.9);
        ctx.fillStyle = rgba(BRASS_D, 0.6);
        ribbon(ctx, [cx - 3, cy + 2, cx + 5, cy + 1], 0.9, 0.9);
      }
    } else if (kind === 'board') {
      // tongue-and-groove boards, each its own tone, the groove dark and the board's edge beside it lit
      const n = 5;
      for (let k = 0; k < n; k++) {
        const bx0 = px0 + ((px1 - px0) * k) / n;
        const bx1 = px0 + ((px1 - px0) * (k + 1)) / n;
        wash(ctx, rectPoly(bx0, py0, bx1, py1, rnd, 0.2), mix(tone, rnd.pick(['#A87448', '#5E3820', '#8A6040']), rnd.range(0.1, 0.35)), 0.9, rnd, 2, 0.004);
        for (let g = 0; g < 3; g++) {
          const gx = rnd.range(bx0 + 2, bx1 - 2);
          ctx.fillStyle = rgba('#2A1608', rnd.range(0.1, 0.22));
          ribbon(ctx, [gx, py0 + 2, gx + rnd.range(-1, 1), (py0 + py1) / 2, gx + rnd.range(-1, 1), py1 - 2], rnd.range(0.3, 0.8), 0.9);
        }
        pen(ctx, bx0, py0, bx0, py1, 0.6, '#1E0E06', 0.6, rnd, 0.2);
        ctx.fillStyle = rgba('#F0C890', 0.22);
        ribbon(ctx, [bx0 + 1, py0 + 1, bx0 + 1, py1 - 1], 0.7, 0.9);
      }
      pen(ctx, px0, py0, px1, py0, 0.7, INK, 0.55, rnd, 0.2);
    } else {
      fieldPanel(ctx, px0, py0, px1, py1, tone, rnd, 5.5, 1);
      if (kind === 'ajar') {
        // the right edge swung out: a dark gap showing the inside, a sliver of shelf, the door's thickness lit
        wash(ctx, [px1 - 7, py0 - 1, px1 + 2, py0 + 1, px1 + 2, py1 - 1, px1 - 7, py1 + 1], '#140A04', 0.95, rnd, 2, 0.01);
        ctx.fillStyle = rgba('#6A4A2C', 0.7);
        ctx.fillRect(px1 - 6, (py0 + py1) / 2 + 4, 7, 1.8);
        wash(ctx, [px1 - 10, py0 - 1, px1 - 7, py0 - 1, px1 - 6.5, py1 + 1, px1 - 10, py1 + 1], '#C9905A', 0.85, rnd, 2, 0.01);
        ctx.fillStyle = rgba('#F2D4A0', 0.4);
        ribbon(ctx, [px1 - 9, py0, px1 - 9, py1], 0.6, 0.9);
      }
      // a brass knob, its shadow, its glint
      const kx = kind === 'ajar' ? px1 - 15 : px1 - 11;
      const ky = (py0 + py1) / 2 + 6;
      ctx.fillStyle = rgba('#1E1008', 0.45);
      ctx.beginPath();
      ctx.ellipse(kx + 1.2, ky + 1.4, 2.2, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(BRASS, 0.97);
      ctx.beginPath();
      ctx.arc(kx, ky, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(BRASS_L, 0.85);
      ctx.beginPath();
      ctx.arc(kx - 0.7, ky - 0.7, 0.6, 0, Math.PI * 2);
      ctx.fill();
      // a keyhole escutcheon on the larger doors
      if (px1 - px0 > 70) {
        ctx.fillStyle = rgba(BRASS_D, 0.8);
        ctx.fillRect(kx - 0.9, ky + 6, 1.8, 3.2);
        ctx.fillStyle = rgba('#120804', 0.8);
        ctx.fillRect(kx - 0.35, ky + 6.6, 0.7, 2);
      }
    }
  }
  // the toe-kick: a darker board, scuffed by boots
  plank(ctx, x0, floorFront - 20, x1, floorFront, '#4A2E1A', rnd, { grain: 0.8 });
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rgba(rnd.chance(0.6) ? '#C9905A' : '#1A0C06', rnd.range(0.08, 0.22));
    const sx = rnd.range(x0, x1);
    const sy = floorFront - rnd.range(3, 17);
    ribbon(ctx, [sx, sy, sx + rnd.range(6, 24), sy + rnd.range(-1.5, 1.5)], rnd.range(0.4, 1.4), 0.9);
  }
  // grime gathered low on the face, where mops and boots reach
  {
    const gm = ctx.createLinearGradient(0, floorFront - 60, 0, floorFront - 20);
    gm.addColorStop(0, 'rgba(30,16,8,0)');
    gm.addColorStop(1, 'rgba(30,16,8,0.25)');
    ctx.fillStyle = gm;
    ctx.fillRect(x0, floorFront - 60, x1 - x0, 40);
  }
  // the lip's shadow across the top of the face: deep under the overhang, its lower edge broken
  {
    const pts: number[] = [x0 - 2, lip - 1, x1 + 2, lip - 1];
    for (let x = x1 + 2; x >= x0 - 2; x -= 6) pts.push(x, lip + 5 + Math.sin(x * 0.05) * 0.8 + rnd.range(-0.6, 0.6));
    ctx.fillStyle = 'rgba(18,8,4,0.5)';
    tracePoly(ctx, pts);
    ctx.fill();
    const ls = ctx.createLinearGradient(0, lip, 0, lip + 16);
    ls.addColorStop(0, 'rgba(18,8,4,0.3)');
    ls.addColorStop(1, 'rgba(18,8,4,0)');
    ctx.fillStyle = ls;
    ctx.fillRect(x0, lip, x1 - x0, 16);
  }
  ctx.restore();

  // worn patches on the panels, where knees and baskets knock
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = rgba('#D9A56A', rnd.range(0.04, 0.09));
    tracePoly(ctx, deform(blobPoly(rnd.range(x0 + 20, x1 - 20), rnd.range(lip + 30, floorFront - 40), rnd.range(10, 30), rnd.range(4, 14), rnd, 10, 0.3), rnd, 2, 0.1));
    ctx.fill();
  }
  // a brass foot rail on its brackets along the toe-kick: a tube, lit along its top, its shadow on the kick
  {
    const ry = floorFront - 24;
    ctx.fillStyle = 'rgba(18,8,4,0.4)';
    ribbon(ctx, [x0 + 10, ry + 4.5, x1 - 10, ry + 4.5], 2.4, 0.95);
    for (let bx = x0 + 26; bx < x1 - 10; bx += rnd.range(118, 136)) {
      wash(ctx, [bx - 1.6, ry, bx + 1.6, ry, bx + 2.4, ry + 9, bx - 2.4, ry + 9], BRASS_D, 0.95, rnd, 2, 0.02);
      ctx.fillStyle = rgba(BRASS_L, 0.5);
      ctx.fillRect(bx - 1.2, ry + 1, 0.6, 7);
    }
    wash(ctx, rectPoly(x0 + 8, ry - 1.8, x1 - 8, ry + 2, rnd, 0.15), BRASS, 0.97, rnd, 2, 0.003);
    ctx.fillStyle = rgba(BRASS_D, 0.7);
    ribbon(ctx, [x0 + 9, ry + 1.4, x1 - 9, ry + 1.4], 0.9, 0.95);
    // the polish: bright where feet rest it, dull between
    for (let i = 0; i < 7; i++) {
      const sx = rnd.range(x0 + 12, x1 - 60);
      ctx.fillStyle = rgba('#FFF2C0', rnd.range(0.4, 0.75));
      ribbon(ctx, [sx, ry - 0.9, sx + rnd.range(20, 60), ry - 0.9], 0.7, 0.8);
    }
  }
  // a polished band along the front where hands rest, warmer and lighter, patchy
  for (let i = 0; i < 5; i++) {
    const sx = rnd.range(x0 + 10, x1 - 150);
    const g = ctx.createLinearGradient(0, topFront - 9, 0, topFront + 1);
    g.addColorStop(0, 'rgba(255,226,160,0)');
    g.addColorStop(0.6, 'rgba(255,226,160,0.22)');
    g.addColorStop(1, 'rgba(255,226,160,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, topFront - 9, rnd.range(70, 170), 10);
  }
  // the top's front lip: a rounded edge worn pale where hands slide goods across
  plank(ctx, x0 - 6, topFront, x1 + 6, lip, mix(COUNTER_WOOD, '#C9955A', 0.3), rnd, { grain: 0.4, edge: 1 });
  for (let i = 0; i < 9; i++) {
    const sx = rnd.range(x0 + 20, x1 - 40);
    ctx.fillStyle = rgba('#F2D4A0', rnd.range(0.18, 0.34));
    ribbon(ctx, [sx, topFront + 1.6, sx + rnd.range(24, 90), topFront + 1.8], rnd.range(1, 2.2), 0.9, 0.1);
  }
  ctx.fillStyle = rgba('#1E1008', 0.3);
  ribbon(ctx, [x0 - 4, lip - 0.6, x1 + 4, lip - 0.6], 1.2, 1);

  // the top: three long boards, the seams a little off true, rings and scratches
  const rows = [topBack, topBack + 10, topBack + 20, topFront + 0.4];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 6, topBack, x1 - x0 + 12, topFront - topBack + 0.4);
  ctx.clip();
  ctx.fillStyle = rgba('#B07E48', 0.7);
  ctx.fillRect(x0 - 6, topBack, x1 - x0 + 12, topFront - topBack);
  const tf = washField(8202, ['#B07A44', '#C48A50', '#A8733E', '#CE9A5E', '#9A6A3C'], 0.015, 0.2);
  patchWash(ctx, x0 - 6, topBack, x1 + 6, topFront, (x, y) => lit(tf(x, y), x, y), rnd, 11, 0.5, 2);
  for (let r = 1; r < 3; r++) pen(ctx, x0 - 6, rows[r]!, x1 + 6, rows[r]!, 0.6, '#3A2010', 0.45, rnd, 0.25);
  // grain stated only where the light is
  for (let i = 0; i < 70; i++) {
    const gx = rnd.range(x0, x1);
    const gy = rnd.range(topBack + 1, topFront - 1);
    const lg = lightAt(gx, gy - 30);
    if (rnd.next() > lg.warm * 1.3 + lg.cool * 0.8) continue;
    ctx.fillStyle = rgba('#3A2010', rnd.range(0.1, 0.22));
    ribbon(ctx, [gx, gy, gx + rnd.range(14, 50), gy + rnd.range(-0.5, 0.5)], rnd.range(0.3, 0.8), 0.9);
  }
  ctx.restore();
  pen(ctx, x0 - 6, topFront + 0.4, x1 + 6, topFront + 0.4, 0.8, INK, 0.5, rnd, 0.25);
  for (let i = 0; i < 7; i++) {
    const sx = rnd.range(x0 + 30, x1 - 30);
    const sy = rnd.range(topBack + 4, topFront - 3);
    ctx.strokeStyle = rgba('#3A2010', rnd.range(0.1, 0.2));
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rnd.range(3.5, 6), rnd.range(0.9, 1.4), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const sx = rnd.range(x0, x1);
    const sy = rnd.range(topBack + 2, topFront - 2);
    ctx.strokeStyle = rgba(rnd.chance(0.5) ? '#2A1608' : '#F2D4A0', rnd.range(0.08, 0.2));
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + rnd.range(-9, 9), sy + rnd.range(-1, 1));
    ctx.stroke();
  }
  pen(ctx, x0 - 6, topBack, x1 + 6, topBack, 0.7, INK, 0.5, rnd, 0.25);
  // the end of the counter at the left, a hair of end grain
  wash(ctx, [x0 - 6, topBack, x0 - 11, topBack + 4, x0 - 11, lip, x0 - 6, lip], '#8A5A30', 0.9, rnd, 2, 0.01);

  paintTill(ctx, rnd);
  paintScale(ctx, rnd);
  paintBags(ctx, rnd);
  grain(ctx, '#3A2616', box.x, box.y, box.w, box.h, 0, 0.18, 611);
  // the room's light: the top faces the lamps, the front turns away from them; what stands on the top catches them
  glazeSprite(cv, box, q, (_x, y) => (y < topBack - 1 ? 'wall' : y < lip + 1 ? 'top' : 'front'), 21, (x, y) => (y < topBack - 1 ? 0.35 * Math.exp(-(((x - 420) / 300) ** 2)) : 0), 0.26);
  return { cv, x: box.x, y: box.y, w: box.w, h: box.h };
}

/**
 * A raised and fielded panel in its frame: the recess dark where the frame shades it, the four bevels (lit on the upper
 * left, in shade below right), and the field in its own wash with the wood's figure (the cathedral arcs of a plain-sawn
 * board) and the pigment pooled low. `strength` scales the figure (small drawer fronts carry less).
 */
function fieldPanel(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, tone: string, rnd: Rand, bev: number, strength: number): void {
  const fx0 = x0 + bev;
  const fy0 = y0 + bev;
  const fx1 = x1 - bev;
  const fy1 = y1 - bev;
  wash(ctx, rectPoly(x0, y0, x1, y1, rnd, 0.25), mix(tone, '#2A160A', 0.3), 0.95, rnd, 2, 0.004);
  const bevel = (pts: number[], col: string, a: number) => {
    ctx.fillStyle = rgba(col, a);
    tracePoly(ctx, deform(pts, rnd, 1, 0.004));
    ctx.fill();
  };
  bevel([x0, y0, x1, y0, fx1, fy0, fx0, fy0], mix(tone, '#F0B878', 0.38), 0.92);
  bevel([x0, y0, fx0, fy0, fx0, fy1, x0, y1], mix(tone, '#E0A868', 0.24), 0.92);
  bevel([x0, y1, fx0, fy1, fx1, fy1, x1, y1], mix(tone, '#1E0E06', 0.45), 0.92);
  bevel([x1, y0, x1, y1, fx1, fy1, fx1, fy0], mix(tone, '#1E0E06', 0.32), 0.92);
  // the field
  wash(ctx, rectPoly(fx0, fy0, fx1, fy1, rnd, 0.25), tone, 0.95, rnd, 3, 0.004);
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  ctx.clip();
  const pf = washField(rnd.int(1, 9999), [mix(tone, '#B07C48', 0.22), tone, mix(tone, '#3A2010', 0.25), mix(tone, '#8A6A58', 0.18)], 0.06, 0.04);
  patchWash(ctx, fx0, fy0, fx1, fy1, pf, rnd, 7, 0.32, 1);
  // the figure: nested arcs climbing the board, straight grain down its sides
  const cx = (fx0 + fx1) / 2 + rnd.range(-0.15, 0.15) * (fx1 - fx0);
  const fw = fx1 - fx0;
  const fh = fy1 - fy0;
  for (let k = 0; k < 6; k++) {
    const ay = fy0 + fh * (0.12 + k * 0.1) + rnd.range(-2, 2);
    const spread = fw * (0.14 + k * 0.07);
    const pts: number[] = [];
    for (let j = -6; j <= 6; j++) {
      const t = j / 6;
      pts.push(cx + t * spread + Math.sin(k + j) * 0.3, ay + t * t * fh * (0.22 + k * 0.03));
    }
    ctx.fillStyle = rgba('#2A1406', (0.06 + rnd.range(0, 0.06)) * strength);
    ribbon(ctx, pts, rnd.range(0.6, 1.4), 0.85);
  }
  for (const side of [-1, 1]) {
    for (let g = 0; g < 3; g++) {
      const gx = cx + side * fw * rnd.range(0.32, 0.47);
      ctx.fillStyle = rgba('#2A1406', rnd.range(0.08, 0.16) * strength);
      ribbon(ctx, [gx, fy0 + 1, gx + rnd.range(-0.6, 0.6), (fy0 + fy1) / 2, gx + rnd.range(-0.6, 0.6), fy1 - 1], rnd.range(0.3, 0.7), 0.9);
    }
  }
  const pool = ctx.createLinearGradient(0, fy0, 0, fy1);
  pool.addColorStop(0, 'rgba(255,214,160,0.08)');
  pool.addColorStop(0.5, 'rgba(30,16,8,0)');
  pool.addColorStop(1, 'rgba(30,16,8,0.22)');
  ctx.fillStyle = pool;
  ctx.fillRect(fx0, fy0, fw, fh);
  ctx.restore();
  // ink: the frame's inner edge above and left (where the recess's shadow starts), the field's edge below and right
  pen(ctx, x0, y0, x1, y0, 0.65, INK, 0.6, rnd, 0.15);
  pen(ctx, x0, y0, x0, y1, 0.6, INK, 0.5, rnd, 0.15);
  pen(ctx, fx0, fy1, fx1, fy1, 0.5, INK, 0.45, rnd, 0.15);
  pen(ctx, fx1, fy0, fx1, fy1, 0.5, INK, 0.45, rnd, 0.15);
  ctx.fillStyle = rgba('#FFE2B0', 0.3);
  ribbon(ctx, [fx0 + 0.5, fy1 - 2, fx0 + 0.5, fy0 + 0.5, fx1 - 2, fy0 + 0.5], 0.6, 0.9);
}

/* ------------------------------------------------------------------ the till */

function paintTill(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const cx = TILL.x;
  const base = TILL.y + 7;
  const w = 56;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  // a soft shadow on the counter
  ctx.fillStyle = 'rgba(26,14,6,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx + 3, base + 1, w * 0.58, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // the drawer box in dark oak with a brass front plate and pull
  pen(ctx, x0, base - 20, x0, base, 0.7, INK, 0.65, rnd, 0.15);
  pen(ctx, x1, base - 20, x1, base, 0.7, INK, 0.7, rnd, 0.15);
  wash(ctx, rectPoly(x0, base - 20, x1, base, rnd, 0.3), '#5E3A22', 0.95, rnd, 3, 0.01);
  wash(ctx, rectPoly(x0 + 4, base - 16, x1 - 4, base - 3, rnd, 0.3), BRASS, 0.92, rnd, 2, 0.01);
  ctx.fillStyle = rgba(BRASS_L, 0.55);
  ribbon(ctx, [x0 + 5, base - 15, x1 - 5, base - 15], 1, 0.9);
  ctx.fillStyle = rgba(BRASS_D, 0.5);
  ribbon(ctx, [x0 + 5, base - 4, x1 - 5, base - 4], 1.2, 0.9);
  wash(ctx, rectPoly(cx - 7, base - 11, cx + 7, base - 8, rnd, 0.2), BRASS_D, 0.95, rnd, 2, 0.01);
  // scrollwork stated in a few pen strokes on the plate
  for (const s of [-1, 1]) {
    ctx.strokeStyle = rgba(BRASS_D, 0.7);
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(cx + s * 12, base - 9);
    ctx.bezierCurveTo(cx + s * 16, base - 14, cx + s * 21, base - 6, cx + s * 18, base - 6);
    ctx.stroke();
  }
  // the keyboard: a sloped brass deck with four rows of keys
  wash(ctx, [x0 + 1, base - 20, x1 - 1, base - 20, x1 - 4, base - 38, x0 + 4, base - 38], '#B8923E', 0.95, rnd, 3, 0.01);
  pen(ctx, x0 + 4, base - 38, x0 + 1, base - 20, 0.6, INK, 0.55, rnd, 0.1);
  pen(ctx, x1 - 4, base - 38, x1 - 1, base - 20, 0.6, INK, 0.6, rnd, 0.1);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 6; k++) {
      const kx = x0 + 7 + k * 8.4 + rnd.range(-0.3, 0.3) + (r % 2) * 0.8;
      const ky = base - 23.5 - r * 4.1;
      ctx.fillStyle = rgba('#2E2418', 0.5);
      ctx.beginPath();
      ctx.ellipse(kx + 0.5, ky + 0.8, 2.4, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(rnd.chance(0.2) ? '#D9C79A' : '#EDE3C6', 0.95);
      ctx.beginPath();
      ctx.ellipse(kx, ky, 2.3, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(INK, 0.5);
      ctx.fillRect(kx - 0.5, ky - 0.4, rnd.range(0.7, 1.2), 0.7);
    }
  }
  // the tablet above: a window with the amount flags, a brass crest
  wash(ctx, rectPoly(x0 + 8, base - 56, x1 - 8, base - 38, rnd, 0.3), '#A8822E', 0.95, rnd, 3, 0.01);
  wash(ctx, rectPoly(x0 + 12, base - 53, x1 - 12, base - 42, rnd, 0.2), '#F0E8CC', 0.97, rnd, 2, 0.01);
  for (let i = 0; i < 4; i++) {
    const fx = x0 + 16 + i * 6.8;
    ctx.fillStyle = rgba(INK, 0.6);
    ctx.fillRect(fx, base - 51, 3.6, 7);
    ctx.fillStyle = rgba('#F0E8CC', 0.9);
    ctx.fillRect(fx + 0.6, base - 49.5, 2.4, 1.6);
  }
  ctx.fillStyle = rgba(BRASS_L, 0.6);
  ribbon(ctx, [x0 + 9, base - 55, x1 - 9, base - 55], 1, 0.9);
  pen(ctx, x0 + 8, base - 56, x1 - 8, base - 56, 0.6, INK, 0.55, rnd, 0.1);
  wash(ctx, [cx - 6, base - 56, cx + 6, base - 56, cx + 3, base - 63, cx - 3, base - 63], BRASS, 0.95, rnd, 2, 0.02);
  pen(ctx, cx - 6, base - 56, cx - 3, base - 63, 0.5, INK, 0.5, rnd, 0.1);
  pen(ctx, cx + 6, base - 56, cx + 3, base - 63, 0.5, INK, 0.5, rnd, 0.1);
  // the crank at the side
  ctx.strokeStyle = rgba(BRASS_D, 0.95);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, base - 28);
  ctx.lineTo(x1 + 6, base - 33);
  ctx.stroke();
  ctx.fillStyle = rgba('#5E3A22', 0.95);
  ctx.beginPath();
  ctx.arc(x1 + 6.5, base - 33.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // light on the left of every brass face
  ctx.fillStyle = rgba(BRASS_L, 0.4);
  ribbon(ctx, [x0 + 4.5, base - 37, x0 + 2.5, base - 21], 1.6, 0.8);
  ctx.fillStyle = rgba(SHADE, 0.2);
  ribbon(ctx, [x1 - 2, base - 37, x1 - 0.5, base - 21], 3, 0.8);
}

/* ------------------------------------------------------------------ the scale */

function paintScale(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const cx = SCALE.x;
  const base = SCALE.y + 6;
  ctx.fillStyle = 'rgba(26,14,6,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx + 3, base + 0.5, 28, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // the iron foot and column, black enamel
  wash(ctx, [cx - 22, base, cx - 19, base - 7, cx + 19, base - 7, cx + 22, base], '#2D332F', 0.97, rnd, 3, 0.02);
  ctx.fillStyle = rgba('#6F7A72', 0.4);
  ribbon(ctx, [cx - 19, base - 6, cx + 17, base - 6], 1, 0.9);
  wash(ctx, [cx - 8, base - 7, cx + 8, base - 7, cx + 6, base - 34, cx - 6, base - 34], '#2D332F', 0.97, rnd, 3, 0.02);
  pen(ctx, cx - 8, base - 7, cx - 6, base - 34, 0.6, INK, 0.6, rnd, 0.1);
  pen(ctx, cx + 8, base - 7, cx + 6, base - 34, 0.6, INK, 0.6, rnd, 0.1);
  ctx.fillStyle = rgba('#8A958C', 0.35);
  ribbon(ctx, [cx - 5, base - 9, cx - 4, base - 32], 1.4, 0.8);
  // the dial: brass bezel, cream face, ticks that are not quite even, a needle
  const dy = base - 52;
  const R = 20;
  const circ = (r: number): number[] => Array.from({ length: 28 }, (_, k) => [cx + Math.cos((k / 28) * Math.PI * 2) * r, dy + Math.sin((k / 28) * Math.PI * 2) * r]).flat();
  ctx.strokeStyle = rgba(INK, 0.65);
  ctx.lineWidth = 0.7;
  tracePoly(ctx, circ(R));
  ctx.stroke();
  wash(ctx, circ(R), BRASS, 0.97, rnd, 3, 0.01);
  wash(ctx, circ(R - 3), '#F1E9CF', 0.98, rnd, 2, 0.01);
  ctx.fillStyle = rgba(BRASS_L, 0.5);
  ctx.beginPath();
  ctx.arc(cx - 7, dy - 14, 3.2, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 40; k++) {
    const a = -Math.PI * 0.85 + (k / 39) * Math.PI * 1.7 + rnd.range(-0.012, 0.012);
    const long = k % 5 === 0;
    pen(ctx, cx + Math.cos(a) * (R - 4), dy + Math.sin(a) * (R - 4), cx + Math.cos(a) * (R - (long ? 8.8 : 6.8)), dy + Math.sin(a) * (R - (long ? 8.8 : 6.8)), long ? 0.55 : 0.35, INK, long ? 0.75 : 0.5, rnd, 0.05);
  }
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI * 0.85 + (k / 7) * Math.PI * 1.7;
    ctx.fillStyle = rgba(INK, 0.55);
    ctx.fillRect(cx + Math.cos(a) * (R - 11.5) - 0.7, dy + Math.sin(a) * (R - 11.5) - 0.5, 1.4, 1);
  }
  // the needle at rest, a little over zero, and the hub
  const na = -Math.PI * 0.85 + 0.12;
  ctx.strokeStyle = rgba('#7A2E26', 0.95);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(na) * 3, dy - Math.sin(na) * 3);
  ctx.lineTo(cx + Math.cos(na) * (R - 5), dy + Math.sin(na) * (R - 5));
  ctx.stroke();
  ctx.fillStyle = rgba(BRASS_D, 0.95);
  ctx.beginPath();
  ctx.arc(cx, dy, 1.9, 0, Math.PI * 2);
  ctx.fill();
  // the glass's glint
  ctx.fillStyle = rgba('#FFFFFF', 0.35);
  ribbon(ctx, [cx - 12, dy - 10, cx - 6, dy - 15, cx + 1, dy - 16.5], 1.6, 0.8);
  // the stem and the platter above it: a shallow brass tray
  wash(ctx, [cx - 3, dy - R + 1, cx + 3, dy - R + 1, cx + 3, dy - R - 12, cx - 3, dy - R - 12], BRASS_D, 0.95, rnd, 2, 0.02);
  const py = dy - R - 13;
  wash(ctx, [cx - 31, py - 1, cx + 31, py - 1, cx + 26, py + 4, cx - 26, py + 4], BRASS, 0.97, rnd, 3, 0.015);
  ctx.fillStyle = rgba(BRASS_L, 0.7);
  ctx.beginPath();
  ctx.ellipse(cx, py - 1, 31, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = rgba(BRASS_D, 0.4);
  ctx.beginPath();
  ctx.ellipse(cx + 3, py - 0.4, 24, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(SHADE, 0.2);
  ribbon(ctx, [cx + 22, py, cx + 27, py + 3], 3, 0.8);
}

/* ------------------------------------------------------------------ bags and twine */

function paintBags(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const base = COUNTER.topFront - 8;
  // two paper bags standing at the left end, folded over at the top
  for (const [bx, bh, tone, lean] of [
    [111, 34, '#B98E5E', 0.02],
    [122, 30, '#C79E6A', -0.04],
  ] as const) {
    ctx.save();
    ctx.translate(bx, base);
    ctx.rotate(lean);
    ctx.translate(-bx, -base);
    const w = 18;
    pen(ctx, bx - w / 2, base - bh, bx - w / 2, base, 0.6, INK, 0.6, rnd, 0.15);
    pen(ctx, bx + w / 2, base - bh, bx + w / 2, base, 0.6, INK, 0.65, rnd, 0.15);
    wash(ctx, rectPoly(bx - w / 2, base - bh, bx + w / 2, base, rnd, 0.3), tone, 0.95, rnd, 3, 0.015);
    // the fold at the mouth, a flap, the gusset's crease
    wash(ctx, [bx - w / 2, base - bh, bx + w / 2, base - bh, bx + w / 2 + 0.6, base - bh + 6, bx - w / 2 - 0.6, base - bh + 6], mix(tone, '#E8D0A0', 0.3), 0.95, rnd, 2, 0.02);
    pen(ctx, bx - w / 2, base - bh + 6, bx + w / 2, base - bh + 6, 0.5, INK, 0.5, rnd, 0.2);
    ctx.fillStyle = rgba(SHADE, 0.2);
    ribbon(ctx, [bx + 2, base - bh + 8, bx + 2, base - 1], 0.7, 0.9);
    ctx.fillStyle = rgba(LIGHT, 0.32);
    ribbon(ctx, [bx - w / 2 + 2, base - bh + 8, bx - w / 2 + 2.3, base - 2], 2, 0.8);
    ctx.fillStyle = rgba(SHADE, 0.28);
    ribbon(ctx, [bx + w / 2 - 2, base - bh + 8, bx + w / 2 - 2, base - 2], 3, 0.8);
    ctx.restore();
  }
  // a stack of flat bags by the scale, and the twine on top
  const sx = 676;
  const sb = COUNTER.topFront - 4;
  for (let i = 0; i < 5; i++) {
    const y = sb - i * 2.2;
    wash(ctx, rectPoly(sx - 11 + rnd.range(-0.8, 0.8), y - 2.2, sx + 11 + rnd.range(-0.8, 0.8), y, rnd, 0.25), mix('#C79E6A', '#B98E5E', rnd.next()), 0.97, rnd, 2, 0.012);
    pen(ctx, sx - 11, y, sx + 11, y, 0.45, INK, 0.55, rnd, 0.2);
  }
  const ty = sb - 11 - 4;
  ctx.fillStyle = rgba('#2A1608', 0.22);
  ctx.beginPath();
  ctx.ellipse(sx + 1, sb - 10.5, 7, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(sx, ty, 5.6, 0, Math.PI * 2);
  ctx.stroke();
  wash(ctx, Array.from({ length: 16 }, (_, k) => [sx + Math.cos((k / 16) * Math.PI * 2) * 5.6, ty + Math.sin((k / 16) * Math.PI * 2) * 5.6]).flat(), '#D2B77E', 0.97, rnd, 3, 0.02);
  for (let i = 0; i < 9; i++) {
    const a = rnd.range(0, Math.PI);
    ctx.strokeStyle = rgba(rnd.chance(0.5) ? '#8A6A38' : '#EAD6A2', 0.55);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.ellipse(sx, ty, 5.2, rnd.range(1.5, 5), a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(LIGHT, 0.5);
  ctx.beginPath();
  ctx.arc(sx - 2, ty - 2.4, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // the loose end: hangs over the counter's edge in a soft curve
  ctx.strokeStyle = rgba('#B8985E', 0.95);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(sx + 4.5, ty + 3.5);
  ctx.bezierCurveTo(sx + 12, ty + 6, sx + 14, sb + 2, sx + 12, COUNTER.topFront + 6);
  ctx.bezierCurveTo(sx + 11, COUNTER.topFront + 12, sx + 13, COUNTER.topFront + 18, sx + 12.5, COUNTER.topFront + 24);
  ctx.stroke();
  void mottle;
  void deform;
  void blobPoly;
}

/* ------------------------------------------------------------------ the foreground crates */

export function paintCrates(q: number): { sprites: Sprite[] } {
  const sprites: Sprite[] = [];
  CRATES.forEach((cr, i) => {
    const w = 88 + (i % 3) * 8;
    const h = 46;
    const box = { x: cr.x - w / 2 - 6, y: cr.y - h - 34, w: w + 12, h: h + 44 };
    const { cv, ctx } = spriteCtx(box, q);
    const rnd = new Rand(6600 + i * 31);
    const x0 = cr.x - w / 2;
    const x1 = cr.x + w / 2;
    const top = cr.y - h;
    // shadow on the floor
    ctx.fillStyle = 'rgba(26,14,6,0.3)';
    ctx.beginPath();
    ctx.ellipse(cr.x + 4, cr.y + 1, w * 0.58, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // the dark inside, then the produce heaped above the rim
    wash(ctx, rectPoly(x0 + 2, top - 2, x1 - 2, top + 8, rnd, 0.3), '#3A2616', 0.9, rnd, 2, 0.01);
    const n = cr.kind === 'greens' ? 7 : cr.kind === 'apples' ? 18 : 20;
    const items: { x: number; y: number; r: number }[] = [];
    for (let k = 0; k < n; k++) {
      const row = k < n * 0.55 ? 0 : 1;
      const r = (cr.kind === 'greens' ? 11 : cr.kind === 'apples' ? 6.4 : 6) * rnd.range(0.85, 1.15);
      const px = x0 + 8 + ((k % Math.ceil(n * 0.55)) / Math.max(1, Math.ceil(n * 0.55) - 1)) * (w - 16) + rnd.range(-3, 3);
      items.push({ x: row === 0 ? px : x0 + 14 + rnd.range(0, w - 28), y: row === 0 ? top - 1 + rnd.range(-2, 2) : top - r * 1.15 + rnd.range(-2, 1), r });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (cr.kind === 'apples') apple(ctx, it.x, it.y, it.r, rnd);
      else if (cr.kind === 'potatoes') potato(ctx, it.x, it.y, it.r, rnd);
      else greens(ctx, it.x, it.y + 2, it.r, rnd);
    }
    // the slatted front: three boards with gaps that show the dark, a corner post at each end
    pen(ctx, x0, top + 6, x0, cr.y, 0.7, INK, 0.7, rnd, 0.2);
    pen(ctx, x1, top + 6, x1, cr.y, 0.7, INK, 0.75, rnd, 0.2);
    const slats = 3;
    const sh = (h - 6) / slats;
    for (let s = 0; s < slats; s++) {
      const sy0 = top + 6 + s * sh;
      plank(ctx, x0, sy0, x1, sy0 + sh - 2.2, mix('#B08254', '#8A5E36', rnd.next() * 0.7), rnd, { grain: 1.3, knots: rnd.chance(0.4) ? 1 : 0, edge: 1 });
      for (const nx of [x0 + 4, x1 - 4]) {
        ctx.fillStyle = rgba('#2A1A10', 0.6);
        ctx.beginPath();
        ctx.arc(nx, sy0 + (sh - 2.2) / 2, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba('#1E1008', 0.5);
      ctx.fillRect(x0 + 1, sy0 + sh - 2.2, w - 2, 2.2);
    }
    plank(ctx, x0 - 2, top + 3, x0 + 6, cr.y + 1, '#8A5E36', rnd, { vertical: true, grain: 1 });
    plank(ctx, x1 - 6, top + 3, x1 + 2, cr.y + 1, '#7A5230', rnd, { vertical: true, grain: 1 });
    // a stencilled mark on the middle board
    const mx = cr.x + rnd.range(-12, 12);
    ctx.fillStyle = rgba(rnd.pick(['#7A2E26', '#2E3F5A', '#2A2A22']), 0.45);
    for (let k = 0; k < 5; k++) ctx.fillRect(mx - 14 + k * 6.2 + rnd.range(-0.4, 0.4), top + 6 + sh + 4, rnd.range(2.4, 4.4), 6.4);
    grain(ctx, '#3A2616', box.x, box.y, box.w, box.h, 0, 0.16, 619 + i);
    // in the room's light: toward us and the frame's edge, so quiet (the produce keeps a little of the lamps)
    glazeSprite(cv, box, q, () => 'front', 31 + i, (_x, y) => 0.3 * clamp((cr.y - 20 - y) / 40, 0, 1), 0.28);
    sprites.push({ cv, x: box.x, y: box.y, w: box.w, h: box.h });
  });
  return { sprites };
}
