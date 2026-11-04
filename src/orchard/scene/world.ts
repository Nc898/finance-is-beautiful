/**
 * The static world, painted once per size into one cached layer, as Brick's (brick/scene/world.ts), with the
 * atmospheric perspective of a hazy late-summer afternoon (paler, warmer and bluer with distance):
 * - the far range, a lilac-blue haze with the church spire on it;
 * - the middle range, dusty olive and gold: fields with their hedgerows, the farmer's old orchard in rows on its
 *   slope (round crowns dotted red), and on its crest to the right the farm among its trees (farm.ts);
 * - the near slope: golden stubble with round bales, a field of late wheat, a pasture, hedgerows with oaks;
 * - the farm's boundary hedge behind the orchards, a big oak at each end;
 * - the ground (ground.ts): the meadow, the pickers' mown plots, the old tree's shade, the worn path, the track;
 * - the long grass and the verges' flowers (flowers.ts).
 * Translucent washes lit from the upper left, paper tooth, a few broken ink lines.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly, type SpriteKind } from '../../scene/watercolor';
import { SoftLayer, bloom } from '../../river/scene/paint';
import { mix, PAPER } from '../../river/scene/boatInk';
import type { Sprites } from '../../scene/sprites';
import { TRACK } from './geom';
import { drawClump, summerSprites } from './summerArt';
import { barn, church, farmhouse, oast } from './farm';
import { HEDGE_Y, paintLongGrass, paintMeadow, paintPath, paintPlots, paintTrack, paintTreeShade } from './ground';
import { paintVerges } from './flowers';
import type { Camera } from './layout';

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

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

export const ridgeFar = (x: number): number => 222 + 9 * Math.sin(x / 170 + 0.4) + 6 * Math.sin(x / 71 + 2.3) + 2.5 * Math.sin(x / 29);
/** the middle range rises to a low crest on the right, where the farm stands */
export const ridgeMid = (x: number): number => 254 + 7 * Math.sin(x / 130 + 2.0) + 4 * Math.sin(x / 57 + 0.9) + 2 * Math.sin(x / 24) - 10 * Math.exp(-(((x - 790) / 120) ** 2));
export const ridgeNear = (x: number): number => 286 + 6 * Math.sin(x / 110 + 0.3) + 4 * Math.sin(x / 47 + 1.6) + 2 * Math.sin(x / 22);

const xs = (a: number, b: number, step: number): number[] => {
  const o: number[] = [];
  for (let x = a; x <= b + step; x += step) o.push(x);
  return o;
};

function haze(ctx: CanvasRenderingContext2D, v: View, y0: number, y1: number, a: number, col = PAPER): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(1, rgba(col, a));
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
  const rnd = new Rand(40457);
  const leaf = await summerSprites(A > 1.6 ? 1 : 0.7, tick, check);
  if (!check()) return null;

  paintHills(ctx, rnd, v);
  await tick();
  if (!check()) return null;
  // the far things have their own seeds, so painting anything before them differently never moves them
  paintMidFields(ctx, new Rand(41011), v);
  paintOldOrchard(ctx, new Rand(41023), v);
  paintFarm(ctx, new Rand(70117), v, leaf);
  await tick();
  if (!check()) return null;
  paintNearFields(ctx, new Rand(41047), v, leaf);
  paintHedge(ctx, new Rand(41057), v, leaf);
  await tick();
  if (!check()) return null;
  paintMeadow(ctx, rnd, v, gd);
  paintPlots(ctx, new Rand(51521));
  paintTreeShade(ctx, new Rand(51539));
  paintPath(ctx, new Rand(51551));
  paintLongGrass(ctx, new Rand(51563), v, HEDGE_Y + 2, TRACK.y0 - 2);
  await tick();
  if (!check()) return null;
  paintTrack(ctx, new Rand(51577), v);
  paintVerges(ctx, new Rand(61627), v.x0, v.x1, v.y1);
  return { cv, gd };
}

/* ------------------------------------------------------------------ hills */

const LIT = '#FFEFC8';

function paintHills(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = 180;
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
    // a second, crisper pass strongest at the ridge (the edge a painter leaves where the wash dried)
    ctx.globalCompositeOperation = 'multiply';
    const g2 = ctx.createLinearGradient(0, top, 0, top + 36);
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
  // the light and the shade on the slopes: the sun is upper left and low, so a slope rising to the right faces it
  // (lit, warm gold) and one falling to the right faces away (shaded, cool)
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
  // farthest: a lilac-blue haze with a touch of rose, bleeding into the warm sky
  range(ridgeFar, '#ACA6CE', 0.3, 0.5, 0.08);
  blooms(ridgeFar, 12, ['#C2AED2', '#A6AED6', '#BAB2D2', '#D4B6C2'], 0.14, [50, 140], [7, 15], [6, 26]);
  slopes(ridgeFar, '#8C86B4', 0.12, 30, 0.12);
  haze(ctx, v, y0 + 50, y1, 0.3, '#FBF0DE');
  // middle: dusty blue-olive, warming as it comes nearer
  range(ridgeMid, '#A8AE9C', 0.32, 0.55, 0.09);
  blooms(ridgeMid, 16, ['#C4BE8E', '#B6B68C', '#A4AEA8', '#D2C694', '#AAAEC0'], 0.15, [40, 110], [6, 12], [6, 20]);
  slopes(ridgeMid, '#7E8EA0', 0.14, 26, 0.16);
  haze(ctx, v, y0 + 70, y1, 0.2, '#FBF0DE');
  // nearer: olive and straw in the low sun
  range(ridgeNear, '#B4B278', 0.34, 0.6, 0.1);
  blooms(ridgeNear, 18, ['#D2C682', '#A8AA68', '#DCCC8A', '#B4B474', '#E0CC86'], 0.16, [36, 110], [5, 11], [4, 18]);
  slopes(ridgeNear, '#7A8460', 0.16, 30, 0.24);
}

/* ------------------------------------------------------------------ fields */

type FieldKind = 'stubble' | 'wheat' | 'pasture' | 'hay' | 'plough';

/**
 * Fields on a slope, in rows following the ridge (`offs`: each row's top below the ridge, the last is the bottom):
 * each field its own wash, the hedgerows between them dotted in with small dabs, a hedgerow tree here and there.
 * Stubble shows the combine's lines and its round bales; wheat stands deeper gold with a little texture.
 */
function patchwork(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, ridge: (x: number) => number, offs: number[], a: number, hedge: string, hedgeA: number, dab: number, near: boolean, leaf?: Sprites, avoid?: (x: number) => boolean): void {
  const COL: Record<FieldKind, string[]> = {
    stubble: ['#ECD592', '#E6CC86', '#F0DCA0'],
    wheat: ['#E4BC5C', '#DEB252', '#E8C466'],
    pasture: ['#B6B672', '#A8AE68', '#C0BC7A'],
    hay: ['#D4CC8C', '#CCC888'],
    plough: ['#C4A27C', '#BC9A74'],
  };
  for (let r = 0; r < offs.length - 1; r++) {
    let x = v.x0 - rnd.range(0, 60);
    while (x < v.x1) {
      const w = rnd.range(50, 120) * (0.8 + r * 0.2);
      const t0 = rnd.range(-0.05, 0.05);
      const t1 = t0 + rnd.range(-0.03, 0.03);
      const top = (xx: number) => ridge(xx) + offs[r]! + (xx - x) * t0;
      const bot = (xx: number) => ridge(xx) + offs[r + 1]! + (xx - x) * t1;
      const poly: number[] = [];
      for (let xx = x; xx <= x + w; xx += 8) poly.push(xx, top(xx));
      poly.push(x + w, top(x + w));
      poly.push(x + w, bot(x + w));
      for (let xx = x + w; xx >= x; xx -= 8) poly.push(xx, bot(xx));
      const u = rnd.next();
      const kind: FieldKind = u < 0.36 ? 'stubble' : u < 0.52 ? 'wheat' : u < 0.8 ? 'pasture' : u < 0.94 ? 'hay' : 'plough';
      const skip = avoid?.(x + w / 2) ?? false;
      if (!skip) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = rgba(rnd.pick(COL[kind]), a * rnd.range(0.85, 1.25) * (kind === 'wheat' ? 1.3 : 1));
        tracePoly(ctx, deform(poly, rnd, 2, 0.03));
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // the lines of the combine (stubble) or the plough, following the field's top edge
        if (kind === 'stubble' || kind === 'plough') {
          ctx.strokeStyle = kind === 'stubble' ? rgba('#C8A866', a * 0.9) : rgba('#8A6A4A', a * 1.1);
          ctx.lineWidth = 0.35;
          const h = bot(x + w / 2) - top(x + w / 2);
          const lines = Math.max(3, Math.round(h / 2.2));
          for (let f = 1; f < lines; f++) {
            ctx.beginPath();
            for (let xx = x + 2; xx <= x + w - 2; xx += 6) {
              const y = top(xx) + (h * f) / lines;
              if (xx === x + 2) ctx.moveTo(xx, y);
              else ctx.lineTo(xx, y);
            }
            ctx.stroke();
          }
        }
        // standing wheat: a sunlit top edge and a few darker dabs of the ears
        if (kind === 'wheat') {
          ctx.fillStyle = rgba('#FFF0B8', 0.3);
          for (let xx = x + 2; xx < x + w - 2; xx += 2.4) {
            ctx.fillRect(xx, top(xx) + rnd.range(0, 1), 1.6, 0.6);
          }
          for (let i = 0; i < w * (near ? 1.4 : 0.6); i++) {
            const xx = rnd.range(x + 1, x + w - 1);
            const yy = rnd.range(top(xx) + 1, bot(xx) - 1);
            ctx.fillStyle = rgba(rnd.pick(['#C8963A', '#B88A36', '#D8A848']), 0.25);
            ctx.fillRect(xx, yy, 0.8, 0.5);
          }
        }
        // round bales on the stubble, in a loose line or two, each lit on its upper left, its shadow to the right
        if (kind === 'stubble' && rnd.chance(near ? 0.8 : 0.6)) {
          const n = rnd.int(3, near ? 9 : 6);
          const h = bot(x + w / 2) - top(x + w / 2);
          const br = clamp(h * 0.12, 0.9, near ? 2.6 : 1.6);
          for (let i = 0; i < n; i++) {
            const bx = rnd.range(x + 5, x + w - 5);
            const by = rnd.range(top(bx) + h * 0.3, bot(bx) - h * 0.15);
            ctx.fillStyle = rgba('#7A6A56', 0.3);
            ctx.beginPath();
            ctx.ellipse(bx + br * 0.9, by + br * 0.15, br * 1.3, br * 0.32, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = rgba(rnd.pick(['#D8B464', '#CCA858', '#E0BE70']), 0.95);
            ctx.beginPath();
            ctx.ellipse(bx, by - br * 0.6, br * 0.95, br * 0.72, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,240,200,0.45)';
            ctx.beginPath();
            ctx.ellipse(bx - br * 0.3, by - br * 0.85, br * 0.4, br * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(110,80,50,0.3)';
            ctx.beginPath();
            ctx.ellipse(bx + br * 0.45, by - br * 0.45, br * 0.4, br * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // the hedgerows: along the field's bottom and down its left side, dotted in
      const dabs = (pts: Array<[number, number]>) => {
        for (const [hx, hy] of pts) {
          if (rnd.chance(0.12)) continue;
          ctx.fillStyle = rgba(rnd.pick([hedge, mix(hedge, '#2E4030', 0.3), mix(hedge, '#B8B070', 0.3)]), hedgeA * rnd.range(0.7, 1.2));
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
      // a hedgerow oak: a round crown, lit on its upper left, its shadow thrown to the right
      if (rnd.chance(near ? 0.4 : 0.3)) {
        const tx = x + rnd.range(0, w);
        const ty = bot(tx);
        const tr = dab * rnd.range(2.4, 3.8);
        if (near && leaf) {
          ctx.fillStyle = rgba('#5A5A50', 0.18);
          ctx.beginPath();
          ctx.ellipse(tx + tr * 1.2, ty + 0.5, tr * 1.3, tr * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
          const kinds: SpriteKind[] = ['back', 'shade', 'mid', 'lit'];
          for (let i = 0; i < 4; i++) {
            const list = leaf.kinds[kinds[i]!]!;
            drawClump(ctx, list[rnd.int(0, list.length - 1)]!, tx + (i - 1.5) * tr * 0.25 - (i === 3 ? tr * 0.25 : 0), ty - tr * (0.25 + i * 0.12), tr * (1.9 - i * 0.25), rnd.chance(0.5));
          }
        } else {
          ctx.fillStyle = rgba(mix(hedge, '#2E4030', 0.35), hedgeA * 1.6);
          ctx.beginPath();
          ctx.ellipse(tx, ty - tr * 0.8, tr, tr * 0.85, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = rgba('#E6DCA0', hedgeA * 1.1);
          ctx.beginPath();
          ctx.ellipse(tx - tr * 0.3, ty - tr * 1.1, tr * 0.5, tr * 0.38, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      x += w;
    }
  }
}

function paintMidFields(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  // the old orchard's slope (left) is left out: it is painted on its own
  patchwork(ctx, rnd, v, ridgeMid, [6, 13, 22, 34], 0.22, '#7E8A6C', 0.32, 0.9, false, undefined, (x) => x > 70 && x < 330);
  haze(ctx, v, 240, HEDGE_Y, 0.08, '#FBF0DE');
}

function paintNearFields(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, leaf: Sprites): void {
  patchwork(ctx, rnd, v, ridgeNear, [5, 14, 25, 40], 0.3, '#5E6C40', 0.5, 1.25, true, leaf);
}

/* ------------------------------------------------------------------ the farmer's old orchard */

/** the old orchard in rows across its slope: round crowns lit on the upper left, dotted with red, a short dark trunk */
function paintOldOrchard(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  void v;
  const x0 = 76;
  const x1 = 326;
  // the grass under the trees, a little greener than the fields round it
  const soft = new SoftLayer(x0 - 20, 240, x1 - x0 + 40, 70, 0.6);
  const poly: number[] = [];
  for (let x = x0; x <= x1; x += 8) poly.push(x, ridgeMid(x) + 5);
  for (let x = x1; x >= x0; x -= 8) poly.push(x, ridgeMid(x) + 33);
  soft.ctx.fillStyle = rgba('#AAB070', 0.4);
  tracePoly(soft.ctx, deform(poly, rnd, 2, 0.02));
  soft.ctx.fill();
  soft.draw(ctx, 1, 'multiply');
  for (let r = 0; r < 5; r++) {
    const off = 8 + r * 5.6;
    const k = 0.7 + r * 0.08;
    const shift = r % 2 ? 5 : 0;
    for (let x = x0 + 4 + shift; x < x1 - 2; x += 10.5 * k + rnd.range(-0.6, 0.6)) {
      if (rnd.chance(0.06)) continue;
      const y = ridgeMid(x) + off + rnd.range(-0.4, 0.4);
      const cr = rnd.range(3.4, 4.2) * k;
      ctx.fillStyle = rgba('#5E5A4C', 0.5);
      ctx.fillRect(x - 0.35, y - cr * 0.5, 0.7, cr * 0.6);
      ctx.fillStyle = rgba('#6A6A48', 0.18);
      ctx.beginPath();
      ctx.ellipse(x + cr * 0.7, y + 0.2, cr * 1.1, cr * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(rnd.pick(['#7E8A56', '#74844E', '#86905C']), 0.85);
      ctx.beginPath();
      ctx.ellipse(x, y - cr * 1.05, cr, cr * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba('#4E5A40', 0.4);
      ctx.beginPath();
      ctx.ellipse(x + cr * 0.3, y - cr * 0.8, cr * 0.7, cr * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba('#E6DCA0', 0.42);
      ctx.beginPath();
      ctx.ellipse(x - cr * 0.35, y - cr * 1.35, cr * 0.45, cr * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = rnd.range(0, Math.PI * 2);
        const d = Math.sqrt(rnd.next()) * 0.8;
        ctx.fillStyle = rgba(rnd.pick(['#C8463A', '#B83C30', '#D8584A']), 0.8);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * cr * d, y - cr * 1.05 + Math.sin(a) * cr * 0.8 * d, 0.45 + r * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // the whole orchard sits back in the haze (a soft veil, no edge to it)
  const veil = new SoftLayer(x0 - 60, 220, x1 - x0 + 120, 100, 0.4);
  bloom(veil.ctx, (x0 + x1) / 2, ridgeMid((x0 + x1) / 2) + 18, (x1 - x0) * 0.62, 26, '#FBF0DE', 0.5, rnd, 5);
  veil.draw(ctx, 1, 'source-over');
}

/* ------------------------------------------------------------------ the farm */

function paintFarm(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, leaf: Sprites): void {
  // the trees round the farm, the far ones first, then the buildings among them, then a few nearer trees
  const band = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const b = band.getContext('2d')!;
  b.setTransform(ctx.getTransform());
  const clump = (x: number, y: number, w: number, kinds: SpriteKind[]) => {
    const list = leaf.kinds[rnd.pick(kinds)]!;
    drawClump(b, list[rnd.int(0, list.length - 1)]!, x, y, w, rnd.chance(0.5));
  };
  // small woods along the middle range and the far shoulder, veiled in the haze
  for (let x = v.x0 + rnd.range(-30, 30); x < v.x1 + 40; x += rnd.range(70, 170)) {
    if (x > 60 && x < 340) continue;
    const k = rnd.int(3, 8);
    const spread = rnd.range(12, 34);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < k; i++) {
      const cx = x + rnd.gauss() * spread;
      pts.push([cx, ridgeMid(cx) + Math.abs(rnd.gauss()) * 8 + rnd.range(1, 4)]);
    }
    pts.sort((p, q) => p[1] - q[1]);
    for (const [cx, cy] of pts) clump(cx, cy, rnd.range(11, 18), ['lit', 'mid', 'gold', 'shade']);
  }
  b.save();
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = rgba('#FBF0DE', 0.46);
  b.fillRect(0, 0, band.width, band.height);
  b.fillStyle = 'rgba(160,160,206,0.16)';
  b.fillRect(0, 0, band.width, band.height);
  b.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(band, 0, 0);
  ctx.restore();

  // the farmyard's own trees behind the buildings: a few big ones, less veiled
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, band.width, band.height);
  b.setTransform(ctx.getTransform());
  for (const [x, w] of [[712, 22], [758, 30], [802, 26], [880, 30], [918, 22], [852, 20]] as const) {
    const y = ridgeMid(x) + 4;
    for (let i = 0; i < 4; i++) clump(x + rnd.range(-6, 6), y - i * w * 0.22, w * (1 - i * 0.15), i < 2 ? ['shade', 'back', 'mid'] : ['mid', 'lit', 'gold']);
  }
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = rgba('#FBF0DE', 0.3);
  b.fillRect(0, 0, band.width, band.height);
  b.fillStyle = 'rgba(160,160,206,0.1)';
  b.fillRect(0, 0, band.width, band.height);
  b.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(band, 0, 0);
  ctx.restore();

  // the farmyard: a patch of pale earth in front of the buildings
  const yx = 800;
  const yy = ridgeMid(yx) + 13;
  const sl = new SoftLayer(yx - 90, yy - 12, 180, 24, 0.8);
  bloom(sl.ctx, yx, yy, 70, 5, '#E6D0A4', 0.55, rnd, 4);
  sl.draw(ctx, 1, 'source-over');
  // the buildings, far to near
  const fade = 0.22;
  oast(ctx, rnd, 734, ridgeMid(734) + 11, 0.95, fade);
  barn(ctx, rnd, 812, ridgeMid(812) + 13, 0.95, fade);
  farmhouse(ctx, rnd, 752, ridgeMid(752) + 16, 0.95, fade);
  // the church on the far ridge, to the left, nearly lost
  church(ctx, rnd, 186, ridgeFar(186) + 6);
  // a couple of trees in front of the farm, and a field gate's posts
  for (const [x, w] of [[724, 16], [884, 18]] as const) {
    const y = ridgeMid(x) + 20;
    for (let i = 0; i < 3; i++) {
      const list = leaf.kinds[i === 0 ? 'shade' : i === 1 ? 'mid' : 'lit']!;
      drawClump(ctx, list[rnd.int(0, list.length - 1)]!, x + (i - 1) * 2, y - i * w * 0.25, w * (1 - i * 0.18), rnd.chance(0.5));
    }
  }
  // the farm sits in the haze: a soft veil over it, thickest at its foot
  const veil = new SoftLayer(640, 200, 360, 110, 0.4);
  bloom(veil.ctx, 810, ridgeMid(810) + 16, 150, 18, '#FBF0DE', 0.36, rnd, 5);
  bloom(veil.ctx, 810, ridgeMid(810) - 6, 160, 26, '#FBF0DE', 0.14, rnd, 4);
  veil.draw(ctx, 1, 'source-over');
}

/* ------------------------------------------------------------------ the boundary hedge */

function paintHedge(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, leaf: Sprites): void {
  const top: number[] = [];
  const bot: number[] = [];
  for (let x = v.x0; x <= v.x1 + 2; x += 3) {
    const bump = 5 + 2.6 * Math.abs(Math.sin(x / 4.6 + 1)) + 1.8 * Math.abs(Math.sin(x / 8.3)) + 2 * Math.sin(x / 60);
    top.push(x, HEDGE_Y - bump);
    bot.unshift(x, HEDGE_Y + 4);
  }
  const poly = [...top, ...bot];
  ctx.globalCompositeOperation = 'multiply';
  for (const [c, a] of [['#9EA45C', 0.32], ['#6A7A44', 0.26], ['#3E5034', 0.16]] as const) {
    ctx.fillStyle = rgba(c, a);
    tracePoly(ctx, deform(poly, rnd, 2, 0.012));
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let x = v.x0 + 6; x < v.x1 - 4; x += rnd.range(14, 26)) {
    const list = leaf.kinds[rnd.pick(['mid', 'shade', 'back', 'lit'] as SpriteKind[])]!;
    drawClump(ctx, list[rnd.int(0, list.length - 1)]!, x, HEDGE_Y + rnd.range(0, 3), rnd.range(20, 30), rnd.chance(0.5));
  }
  // a big oak at each end of the hedge, framing the farm; its shadow thrown to the right across the grass
  for (const x of [v.x0 + 30, 22, 980, v.x1 - 24]) {
    if (x < v.x0 + 10 || x > v.x1 - 10) continue;
    oak(ctx, rnd, x, HEDGE_Y + 2, leaf);
  }
}

/** a hedgerow oak: a short stout trunk, a broad crown of clumps by where each sits against the light */
function oak(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, leaf: Sprites): void {
  const H = 78;
  const W = 70;
  ctx.fillStyle = rgba('#6A6A58', 0.2);
  ctx.beginPath();
  ctx.ellipse(x + 40, y + 2, 56, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // the trunk, lit on its left
  ctx.fillStyle = rgba('#7A6650', 0.9);
  tracePoly(ctx, [x - 4, y, x - 2.6, y - H * 0.4, x + 2.6, y - H * 0.4, x + 4.5, y]);
  ctx.fill();
  ctx.fillStyle = rgba('#3E3040', 0.3);
  tracePoly(ctx, [x + 0.5, y, x + 0.6, y - H * 0.4, x + 2.6, y - H * 0.4, x + 4.5, y]);
  ctx.fill();
  const pts: Array<{ x: number; y: number; w: number; kind: SpriteKind }> = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd.range(Math.PI, Math.PI * 2);
    const d = Math.sqrt(rnd.next());
    const px = x + Math.cos(a) * W * 0.5 * d;
    const py = y - H * 0.42 + Math.sin(a) * H * 0.55 * d;
    // the light falls from the upper left
    const nx = (px - x) / (W * 0.5);
    const ny = (py - (y - H * 0.6)) / (H * 0.4);
    const lit = -0.6 * nx - 0.8 * ny;
    const kind: SpriteKind = d < 0.45 ? 'back' : lit > 0.5 ? (rnd.chance(0.2) ? 'gold' : 'lit') : lit > -0.1 ? 'mid' : 'shade';
    pts.push({ x: px, y: py, w: rnd.range(22, 32), kind });
  }
  const order: Record<SpriteKind, number> = { back: 0, shade: 1, mid: 2, coral: 2, lit: 3, gold: 3 };
  pts.sort((p, q) => order[p.kind] - order[q.kind] || p.y - q.y);
  for (const p of pts) {
    const list = leaf.kinds[p.kind]!;
    drawClump(ctx, list[rnd.int(0, list.length - 1)]!, p.x, p.y + p.w * 0.3, p.w, rnd.chance(0.5));
  }
}
