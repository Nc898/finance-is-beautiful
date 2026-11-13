/**
 * The static world, painted once per size into one cached layer: hazy blue-violet hills, nearer hills of spring
 * fields and hedgerows with copses in fresh leaf and white blossom trees dotted about, the village behind the plots
 * (red tile and grey slate roofs, chimneys, a church tower with a weathervane), the hedge along the back of the
 * gardens with a gap where the road comes through; then the ground (ground.ts: the grass, the trodden yards and the
 * garden paths, the road down from the village, the lane with its ruts and puddles), the blossom trees beside the
 * houses, and the flower beds and the verges (flowers.ts).
 * Translucent washes lit from the upper left, paper tooth, a few broken ink lines. The two houses are reserved
 * (left as paper) so their pencil drawings sit on clean paper.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, bloom, flowerDab } from '../../river/scene/paint';
import { mix } from '../../river/scene/boatInk';
import { FENCE_Y, GROUND_Y, HEDGE_Y, HOUSE, JUNCTION, LANE, ROAD_FAR, SIDE_BLOSSOMS } from './geom';
import { silhouette, PAPER } from './housePaint';
import { drawClump, laySpringTree, renderSpringTree, springSprites, type SpringTree } from './springArt';
import { daffodil, paintBeds, paintForeground } from './flowers';
import { paintGrass, paintLane, paintRoad, paintYards, roadHalf } from './ground';
import type { Camera } from './layout';
import { LOANS } from '../types';
import type { Sprites } from '../../scene/sprites';
import type { SpriteKind } from '../../scene/watercolor';
import { yieldTask } from '../../shared/yieldTask';

export interface WorldLayer {
  cv: HTMLCanvasElement;
  /** device px per css px of the layer */
  gd: number;
}

interface View {
  x0: number;
  x1: number;
  y1: number;
}

const tick = (): Promise<void> => yieldTask();

/** the blossom trees beside the houses (behind the houses' fronts: a house's outline hides any crown it overlaps) */
const SIDE_TREES: SpringTree[] = SIDE_BLOSSOMS.map((p, i) => ({ seed: [5203, 5309][i]!, x: p.x, y: p.y, k: 0.33, m: 1, kit: 'blossom' as const, haze: 0, flip: i === 1 }));

export const ridgeFar = (x: number): number => 246 + 14 * Math.sin(x / 160 + 0.8) + 7 * Math.sin(x / 67 + 2.1) + 3 * Math.sin(x / 31);
export const ridgeMid = (x: number): number => 276 + 9 * Math.sin(x / 120 + 2.4) + 5 * Math.sin(x / 53 + 0.4) + 2 * Math.sin(x / 26);
export const ridgeNear = (x: number): number => 312 + 7 * Math.sin(x / 105 + 0.6) + 4 * Math.sin(x / 44 + 1.8) + 2 * Math.sin(x / 21);

const xs = (a: number, b: number, step: number): number[] => {
  const o: number[] = [];
  for (let x = a; x <= b + step; x += step) o.push(x);
  return o;
};

function haze(ctx: CanvasRenderingContext2D, v: View, y0: number, y1: number, a: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(PAPER, 0));
  g.addColorStop(1, rgba(PAPER, a));
  ctx.fillStyle = g;
  ctx.fillRect(v.x0, y0, v.x1 - v.x0, y1 - y0);
  ctx.restore();
}

export async function buildWorld(cam: Camera, check: () => boolean): Promise<WorldLayer | null> {
  const v: View = { x0: -cam.ox / cam.s - 40, x1: (cam.cssW - cam.ox) / cam.s + 40, y1: (cam.cssH - cam.oy) / cam.s + 20 };
  const gd = Math.max(0.75, cam.dpr * Math.min(1.5, Math.sqrt(11e6 / (cam.cssW * cam.cssH * cam.dpr * cam.dpr))));
  const cv = makeCanvas(cam.cssW * gd, cam.cssH * gd);
  const ctx = cv.getContext('2d')!;
  const A = gd * cam.s;
  ctx.setTransform(A, 0, 0, A, gd * cam.ox, gd * cam.oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const rnd = new Rand(40441);
  const sd = A > 1.6 ? 1 : 0.7;
  const leaf = await springSprites('leaf', sd, tick, check);
  if (!check()) return null;
  const blossom = await springSprites('blossom', sd, tick, check);
  if (!check()) return null;

  paintHills(ctx, rnd, v);
  await tick();
  if (!check()) return null;
  paintFields(ctx, rnd, v);
  paintCopses(ctx, rnd, v, leaf, blossom);
  await tick();
  if (!check()) return null;
  // the village has its own seed, so painting anything before it differently never moves a house
  paintVillage(ctx, new Rand(70111));
  paintHedge(ctx, rnd, v, leaf, blossom);
  await tick();
  if (!check()) return null;
  paintGrass(ctx, rnd, v, gd);
  paintYards(ctx, rnd);
  // a blossom tree beside each house, framing the street (behind the houses: their outlines are reserved)
  for (const t of SIDE_TREES) {
    const r = await renderSpringTree(t, A, A > 1.6 ? 1.4 : 1, tick, check);
    if (!r || !check()) return null;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(80,80,70,0.2)';
    ctx.beginPath();
    ctx.ellipse(t.x + 10, t.y + 2, 34, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    laySpringTree(ctx, t, r, A);
  }
  paintBeds(ctx, new Rand(51515));
  paintRoad(ctx, rnd);
  paintLane(ctx, rnd, v);
  await tick();
  if (!check()) return null;
  paintVerges(ctx, rnd, v);
  paintForeground(ctx, new Rand(61616), v.x0, v.x1, v.y1);
  paintShadows(ctx);

  // the houses are reserved: their outlines are left as paper for the pencil drawings
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const id of LOANS) for (const poly of silhouette(id)) {
    tracePoly(ctx, poly);
    ctx.fill();
  }
  ctx.restore();
  return { cv, gd };
}

/* ------------------------------------------------------------------ hills */

function paintHills(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = 200;
  const y1 = HEDGE_Y + 10;
  const X = xs(v.x0, v.x1, 16);
  const soft = new SoftLayer(v.x0, y0, v.x1 - v.x0, y1 - y0, 0.45);
  const range = (ridge: (x: number) => number, color: string, a: number, crisp: number, pool: number) => {
    const pts: number[] = [];
    for (const x of X) pts.push(x, ridge(x));
    for (let i = X.length - 1; i >= 0; i--) pts.push(X[i]!, y1);
    const top = Math.min(...X.map(ridge));
    soft.ctx.clearRect(v.x0, y0, v.x1 - v.x0, y1 - y0);
    const g = soft.ctx.createLinearGradient(0, top, 0, y1);
    g.addColorStop(0, rgba(color, a * 0.95));
    g.addColorStop(0.45, rgba(color, a * 0.75));
    g.addColorStop(1, rgba(color, a * 0.3));
    soft.ctx.fillStyle = g;
    for (let i = 0; i < 2; i++) {
      tracePoly(soft.ctx, deform(pts, rnd, 2, 0.012));
      soft.ctx.fill();
    }
    soft.draw(ctx, 1, 'multiply');
    // a second, crisper pass that is strongest at the ridge (the edge a painter leaves where the wash dried)
    ctx.globalCompositeOperation = 'multiply';
    const g2 = ctx.createLinearGradient(0, top, 0, top + 40);
    g2.addColorStop(0, rgba(color, a * crisp));
    g2.addColorStop(1, rgba(color, a * crisp * 0.25));
    ctx.fillStyle = g2;
    tracePoly(ctx, deform(pts, rnd, 3, 0.02));
    ctx.fill();
    // the pigment pooled along the ridge, broken
    ctx.strokeStyle = rgba(mix(color, '#4A4A6A', 0.3), pool);
    ctx.lineWidth = 0.8;
    ctx.setLineDash([40, 8, 16, 6]);
    ctx.beginPath();
    X.forEach((x, i) => (i ? ctx.lineTo(x, ridge(x) + 0.7 + rnd.range(-0.3, 0.3)) : ctx.moveTo(x, ridge(x) + 0.7)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
  };
  // the light and the shade on the slopes: the sun is upper left, so a slope rising to the right faces it (lit,
  // warm) and one falling to the right faces away (shaded, cool), softest in the far range
  const slopes = (ridge: (x: number) => number, shade: string, a: number, depth: number, sun: number) => {
    for (const lit of [false, true]) {
      soft.ctx.clearRect(v.x0, y0, v.x1 - v.x0, y1 - y0);
      for (let x = v.x0; x < v.x1; x += rnd.range(14, 24)) {
        const d = ridge(x + 12) - ridge(x - 12);
        if (Math.abs(d) < 0.8 || d < 0 !== lit) continue;
        const k = clamp(Math.abs(d) / 6, 0.3, 1);
        bloom(soft.ctx, x, ridge(x) + depth * 0.45, rnd.range(16, 30), depth * 0.5, lit ? LIT : shade, (lit ? sun : a) * k, rnd, 3);
      }
      soft.draw(ctx, 1, lit ? 'source-over' : 'multiply');
    }
  };
  const blooms = (ridge: (x: number) => number, n: number, cols: string[], a: number, rx: [number, number], ry: [number, number], dy: [number, number]) => {
    soft.ctx.clearRect(v.x0, y0, v.x1 - v.x0, y1 - y0);
    for (let i = 0; i < n; i++) {
      const x = rnd.range(v.x0, v.x1);
      bloom(soft.ctx, x, ridge(x) + rnd.range(dy[0], dy[1]), rnd.range(rx[0], rx[1]), rnd.range(ry[0], ry[1]), rnd.pick(cols), a, rnd, 4);
    }
    soft.draw(ctx, 1, 'multiply');
  };
  // farthest: hazy blue-violet with a touch of rose, bleeding into the sky
  range(ridgeFar, '#A8AAD6', 0.3, 0.5, 0.08);
  blooms(ridgeFar, 12, ['#C0AED8', '#9DB0DA', '#B6B6DA', '#CFB0C6'], 0.14, [50, 140], [7, 15], [6, 26]);
  slopes(ridgeFar, '#8A88B8', 0.12, 30, 0.1);
  haze(ctx, v, y0 + 60, y1, 0.3);
  // middle: a cooler blue-green, the first fields and woods just showing
  range(ridgeMid, '#9CB2B8', 0.3, 0.55, 0.09);
  blooms(ridgeMid, 16, ['#A8C08C', '#B4C894', '#9CB4B8', '#C2CC96', '#A4AEC8'], 0.15, [40, 110], [6, 12], [6, 20]);
  slopes(ridgeMid, '#7E9AA4', 0.14, 26, 0.12);
  patchwork(ctx, rnd, v, ridgeMid, [8, 16, 26], ['#B4CA8E', '#C4D29A', '#A8C084', '#C8C0A0'], 0.2, '#7C9A7A', 0.3, 0.9);
  haze(ctx, v, y0 + 80, y1, 0.24);
  // nearer: fresh spring green, sun on the slopes facing it
  range(ridgeNear, '#A6C080', 0.34, 0.62, 0.1);
  blooms(ridgeNear, 18, ['#B8D284', '#9CBA6E', '#C8D88E', '#A8C27A', '#D2D68C'], 0.16, [36, 110], [5, 11], [4, 18]);
  slopes(ridgeNear, '#6E9060', 0.16, 30, 0.2);
}

const LIT = '#FFF6D8';

/**
 * Fields on a slope, in rows following the ridge (`offs`: each row's top below the ridge, the last is the bottom):
 * each field its own wash (fresh grass, young corn, pale meadow, ploughed earth with its furrows, now and then a
 * blaze of rapeseed), the hedgerows between them dotted in with small dabs, and a hedgerow tree here and there.
 */
function patchwork(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, ridge: (x: number) => number, offs: number[], cols: string[], a: number, hedge: string, hedgeA: number, dab: number): void {
  for (let r = 0; r < offs.length - 1; r++) {
    let x = v.x0 - rnd.range(0, 60);
    while (x < v.x1) {
      const w = rnd.range(46, 110) * (0.8 + r * 0.2);
      const t0 = rnd.range(-0.05, 0.05);
      const t1 = t0 + rnd.range(-0.03, 0.03);
      const top = (xx: number) => ridge(xx) + offs[r]! + (xx - x) * t0;
      const bot = (xx: number) => ridge(xx) + offs[r + 1]! + (xx - x) * t1;
      const poly: number[] = [];
      for (let xx = x; xx <= x + w; xx += 8) poly.push(xx, top(xx));
      poly.push(x + w, top(x + w));
      poly.push(x + w, bot(x + w));
      for (let xx = x + w; xx >= x; xx -= 8) poly.push(xx, bot(xx));
      const kind = rnd.next();
      const col = kind < 0.06 ? '#F0D648' : kind < 0.16 ? '#C4A07A' : rnd.pick(cols);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(col, a * (kind < 0.06 ? 2.4 : rnd.range(0.8, 1.3)));
      tracePoly(ctx, deform(poly, rnd, 2, 0.03));
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // ploughed: the furrows, following the field's top edge
      if (kind >= 0.06 && kind < 0.16) {
        ctx.strokeStyle = rgba('#8A6A4A', a * 1.2);
        ctx.lineWidth = 0.35;
        const h = bot(x + w / 2) - top(x + w / 2);
        for (let f = 1; f < 5; f++) {
          ctx.beginPath();
          for (let xx = x + 2; xx <= x + w - 2; xx += 6) {
            const y = top(xx) + (h * f) / 5;
            if (xx === x + 2) ctx.moveTo(xx, y);
            else ctx.lineTo(xx, y);
          }
          ctx.stroke();
        }
      }
      // the hedgerows: along the field's bottom and down its left side, dotted in
      const dabs = (pts: Array<[number, number]>) => {
        for (const [hx, hy] of pts) {
          if (rnd.chance(0.12)) continue;
          ctx.fillStyle = rgba(rnd.pick([hedge, mix(hedge, '#3E5A3A', 0.3), mix(hedge, '#A8C080', 0.3)]), hedgeA * rnd.range(0.7, 1.2));
          ctx.beginPath();
          ctx.ellipse(hx, hy, dab * rnd.range(0.8, 1.4), dab * rnd.range(0.5, 0.9), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      const along: Array<[number, number]> = [];
      for (let xx = x; xx <= x + w; xx += dab * 2.2) along.push([xx, bot(xx)]);
      dabs(along);
      const down: Array<[number, number]> = [];
      for (let yy = top(x); yy <= bot(x); yy += dab * 1.6) down.push([x, yy]);
      dabs(down);
      // a hedgerow tree: a round crown, lit on its upper left
      if (rnd.chance(0.3)) {
        const tx = x + rnd.range(0, w);
        const ty = bot(tx);
        const tr = dab * rnd.range(2.4, 3.6);
        ctx.fillStyle = rgba(mix(hedge, '#3E5A3A', 0.35), hedgeA * 1.6);
        ctx.beginPath();
        ctx.ellipse(tx, ty - tr * 0.8, tr, tr * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba('#DCE8A8', hedgeA * 1.1);
        ctx.beginPath();
        ctx.ellipse(tx - tr * 0.3, ty - tr * 1.1, tr * 0.5, tr * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      x += w;
    }
  }
}

/* ------------------------------------------------------------------ fields and copses */

function paintFields(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  // the near slope: rows of fields from the ridge down to the hedge, bigger as they come nearer
  patchwork(ctx, rnd, v, ridgeNear, [10, 24, 42, 66, 96], ['#C8DC8C', '#B2CE78', '#D8E2A0', '#A6C474', '#BEC88A', '#D4DC9C'], 0.3, '#5E7E46', 0.5, 1.3);
  haze(ctx, v, ridgeNear(500) - 10, HEDGE_Y, 0.06);
}

function pick(sp: Sprites, rnd: Rand, tones: SpriteKind[]) {
  const list = sp.kinds[rnd.pick(tones)]!;
  return list[rnd.int(0, list.length - 1)]!;
}

function paintCopses(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, leaf: Sprites, blossom: Sprites): void {
  // far: small woods on the middle range, in clusters spilling down its slopes, veiled
  const band = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const b = band.getContext('2d')!;
  b.setTransform(ctx.getTransform());
  const wood = (ridge: (x: number) => number, n: [number, number], size: [number, number], down: number, blossomChance: number, tones: SpriteKind[]) => {
    for (let x = v.x0 + rnd.range(-30, 30); x < v.x1 + 40; x += rnd.range(60, 150)) {
      const k = rnd.int(n[0], n[1]);
      const spread = rnd.range(14, 40);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < k; i++) {
        const cx = x + rnd.gauss() * spread;
        pts.push([cx, ridge(cx) + Math.abs(rnd.gauss()) * down + rnd.range(1, 5)]);
      }
      pts.sort((p, q) => p[1] - q[1]);
      for (const [cx, cy] of pts) {
        const bl = rnd.chance(blossomChance);
        drawClump(b, pick(bl ? blossom : leaf, rnd, bl ? ['lit', 'gold', 'mid'] : tones), cx, cy, rnd.range(size[0], size[1]) * (0.85 + (cy - ridge(cx)) / 60), rnd.chance(0.5));
      }
    }
  };
  wood(ridgeMid, [3, 9], [12, 20], 10, 0.1, ['lit', 'mid', 'gold', 'shade']);
  b.save();
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = rgba(PAPER, 0.48);
  b.fillRect(0, 0, band.width, band.height);
  b.fillStyle = 'rgba(152,168,214,0.18)';
  b.fillRect(0, 0, band.width, band.height);
  b.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(band, 0, 0);
  ctx.restore();
  // near: copses along the front ridge and down its slopes, a white blossom tree here and there
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, band.width, band.height);
  b.setTransform(ctx.getTransform());
  wood(ridgeNear, [4, 12], [18, 30], 16, 0.16, ['lit', 'mid', 'shade', 'gold']);
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = rgba(PAPER, 0.2);
  b.fillRect(0, 0, band.width, band.height);
  b.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(band, 0, 0);
  ctx.restore();
}

/* ------------------------------------------------------------------ the village */

interface Cottage {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: number;
  slate: boolean;
}

function paintVillage(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  // a cluster of roofs on the rising ground behind the plots, the church tower among them; farther = smaller, paler
  const homes: Cottage[] = [];
  for (let i = 0; i < 14; i++) {
    const y = rnd.range(338, 392);
    const k = 0.5 + (y - 338) / 120;
    // between the blossom tree and the right-hand house, where it can be seen
    const x = rnd.range(508, 640);
    homes.push({ x, y, w: rnd.range(26, 44) * k, h: rnd.range(10, 16) * k, roof: rnd.range(9, 15) * k, slate: rnd.chance(0.35) });
  }
  homes.sort((a, b) => a.y - b.y);
  // the church: a squat stone tower with a pyramid cap and a weathervane, set a little back
  const church = { x: 586, y: 352 };
  let churchDone = false;
  for (const h of homes) {
    if (!churchDone && h.y > church.y) {
      paintChurch(ctx, rnd, church.x, church.y);
      churchDone = true;
    }
    const fade = 0.35 - (h.y - 338) / 260;
    const wall = mix(rnd.pick(['#E8DCC4', '#E2D2B6', '#D9C6A6', '#EAE0CC']), PAPER, fade);
    const roofC = mix(h.slate ? rnd.pick(['#8A90A2', '#7E8496', '#9498AA']) : rnd.pick(['#C27A5C', '#B86E52', '#CC8664', '#B07458']), PAPER, fade);
    const x0 = h.x - h.w / 2;
    const x1 = h.x + h.w / 2;
    // the wall in light, its right end in shade
    ctx.fillStyle = rgba(wall, 0.9);
    tracePoly(ctx, deform([x0, h.y, x0, h.y - h.h, x1, h.y - h.h, x1, h.y], rnd, 1, 0.02));
    ctx.fill();
    ctx.fillStyle = rgba('#6A5A70', 0.16);
    ctx.fillRect(x1 - h.w * 0.22, h.y - h.h, h.w * 0.22, h.h);
    // a window or two, a door
    ctx.fillStyle = rgba('#5A5468', 0.45 - fade * 0.5);
    for (let k = 0; k < 2; k++) ctx.fillRect(x0 + h.w * (0.18 + k * 0.42), h.y - h.h * 0.72, h.w * 0.1, h.h * 0.3);
    // the roof: a hipped or gabled shape, lit on the left
    const rp = [x0 - 1.2, h.y - h.h, x0 + h.w * 0.16, h.y - h.h - h.roof, x1 - h.w * 0.16, h.y - h.h - h.roof, x1 + 1.2, h.y - h.h];
    ctx.fillStyle = rgba(roofC, 0.92);
    tracePoly(ctx, deform(rp, rnd, 1, 0.02));
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,214,0.18)';
    tracePoly(ctx, [rp[0]!, rp[1]!, rp[2]!, rp[3]!, rp[2]! + h.w * 0.25, rp[3]!, x0 + h.w * 0.2, h.y - h.h]);
    ctx.fill();
    ctx.strokeStyle = rgba('#3E3440', 0.3 - fade * 0.3);
    ctx.lineWidth = 0.4;
    tracePoly(ctx, rp);
    ctx.stroke();
    // a chimney
    if (rnd.chance(0.75)) {
      const cx = rnd.chance(0.5) ? x0 + h.w * 0.25 : x1 - h.w * 0.25;
      ctx.fillStyle = rgba(mix('#A65A44', PAPER, fade), 0.9);
      ctx.fillRect(cx - 1.4, h.y - h.h - h.roof - 3.5, 2.8, 5);
    }
  }
  if (!churchDone) paintChurch(ctx, rnd, church.x, church.y);
  // the village sits in the haze: a soft veil at its feet where the hedge will be
  const g = ctx.createLinearGradient(0, 360, 0, HEDGE_Y);
  g.addColorStop(0, rgba(PAPER, 0));
  g.addColorStop(1, rgba(PAPER, 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(300, 360, 440, HEDGE_Y - 360);
}

function paintChurch(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number): void {
  const w = 22;
  const h = 46;
  const stone = mix('#C9BEA6', PAPER, 0.25);
  ctx.fillStyle = rgba(stone, 0.95);
  tracePoly(ctx, deform([x - w / 2, y, x - w / 2, y - h, x + w / 2, y - h, x + w / 2, y], rnd, 1, 0.015));
  ctx.fill();
  ctx.fillStyle = 'rgba(96,86,110,0.2)';
  ctx.fillRect(x + w * 0.18, y - h, w * 0.32, h);
  // the coursed stone, a belfry louvre, the battlement-less pyramid cap, the vane
  ctx.strokeStyle = 'rgba(110,100,96,0.2)';
  ctx.lineWidth = 0.3;
  for (let yy = y - 4; yy > y - h; yy -= 4) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, yy);
    ctx.lineTo(x + w / 2, yy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(70,62,80,0.5)';
  tracePoly(ctx, [x - 3, y - h + 16, x - 3, y - h + 8, x, y - h + 5, x + 3, y - h + 8, x + 3, y - h + 16]);
  ctx.fill();
  ctx.fillStyle = rgba(mix('#7E8494', PAPER, 0.2), 0.95);
  tracePoly(ctx, [x - w / 2 - 1, y - h, x, y - h - 14, x + w / 2 + 1, y - h]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,244,220,0.2)';
  tracePoly(ctx, [x - w / 2 - 1, y - h, x, y - h - 14, x - 2, y - h]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(58,50,56,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y - h - 14);
  ctx.lineTo(x, y - h - 22);
  ctx.moveTo(x - 3.5, y - h - 19);
  ctx.lineTo(x + 3.5, y - h - 19);
  ctx.stroke();
  // the cockerel on the vane
  ctx.fillStyle = 'rgba(58,50,56,0.7)';
  tracePoly(ctx, [x - 2.4, y - h - 22, x + 0.5, y - h - 24.6, x + 2.6, y - h - 22.4, x + 0.6, y - h - 21.6]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(58,50,56,0.5)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x - w / 2, y - h, w, h);
}

/* ------------------------------------------------------------------ the back hedge */

function paintHedge(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, leaf: Sprites, blossom: Sprites): void {
  const gap0 = ROAD_FAR.x - roadHalf(ROAD_FAR.y) - 7;
  const gap1 = ROAD_FAR.x + roadHalf(ROAD_FAR.y) + 7;
  const strip = (x0: number, x1: number) => {
    const top: number[] = [];
    const bot: number[] = [];
    for (let x = x0; x <= x1 + 2; x += 3) {
      const bump = 4 + 2.4 * Math.abs(Math.sin(x / 4.1 + 1)) + 1.6 * Math.abs(Math.sin(x / 7.7));
      top.push(x, HEDGE_Y - bump);
      bot.unshift(x, HEDGE_Y + 5);
    }
    const poly = [...top, ...bot];
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a] of [['#8EB25A', 0.3], ['#5E8A44', 0.24], ['#3E6638', 0.16]] as const) {
      ctx.fillStyle = rgba(c, a);
      tracePoly(ctx, deform(poly, rnd, 2, 0.012));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let x = x0 + 6; x < x1 - 4; x += rnd.range(14, 26)) {
      const bl = rnd.chance(0.1);
      drawClump(ctx, pick(bl ? blossom : leaf, rnd, ['mid', 'shade', 'back', 'lit']), x, HEDGE_Y + rnd.range(0, 4), rnd.range(22, 34), rnd.chance(0.5));
    }
  };
  strip(v.x0, gap0);
  strip(gap1, v.x1);
}

/* ------------------------------------------------------------------ the plots, the road, the lane */

function paintVerges(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const ny0 = LANE.y1;
  void v;
  // daffodils in drifts along both verges (never where the road comes through), primroses among them
  const drift = (cx: number, cy: number, n: number, spread: number, h: number) => {
    for (let k = 0; k < n; k++) {
      const x = cx + rnd.gauss() * spread;
      if (Math.abs(x - JUNCTION.x) < 34) continue;
      daffodil(ctx, rnd, x, cy + rnd.range(-3, 3), h * rnd.range(0.8, 1.15));
    }
    for (let k = 0; k < n * 0.6; k++) {
      const x = cx + rnd.gauss() * spread * 1.2;
      if (Math.abs(x - JUNCTION.x) < 34) continue;
      flowerDab(ctx, x, cy + rnd.range(-2, 4), h * 0.12, rnd.pick(['#F4EAA0', '#F0E08C', '#FAF2C0']), rnd, false);
    }
  };
  for (const [x, n] of [[40, 7], [250, 6], [430, 8], [640, 6], [860, 7], [1000, 5]] as const) drift(x, ny0 + 16, n, 18, 13);
  for (const [x, n] of [[60, 4], [300, 5], [410, 4], [600, 5], [720, 4], [940, 4]] as const) drift(x, FENCE_Y + 10, n, 12, 9);
}

function paintShadows(ctx: CanvasRenderingContext2D): void {
  // each house throws a soft shadow onto the earth at its foot, toward the right (the sun is upper left)
  ctx.globalCompositeOperation = 'multiply';
  for (const id of LOANS) {
    const W = HOUSE[id].wall;
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 12);
    g.addColorStop(0, 'rgba(90,80,96,0.3)');
    g.addColorStop(1, 'rgba(90,80,96,0)');
    ctx.fillStyle = g;
    tracePoly(ctx, [W.x0, GROUND_Y, W.x1, GROUND_Y, W.x1 + 18, GROUND_Y + 12, W.x0 + 10, GROUND_Y + 10]);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
