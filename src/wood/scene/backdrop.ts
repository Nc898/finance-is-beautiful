/**
 * Everything that never moves, painted once per size into one canvas: the paper, a spring sky (a clear morning
 * blue going to primrose at the horizon, a few soft clouds), the far downs in atmospheric blue, the wood's edge
 * behind the clearing (hazy beeches in fresh leaf over a dark understorey), and the clearing itself: new grass
 * under the trees, the trees' pools of shade, and drifts of bluebells thickening toward the front.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, paintPaperBackdrop, rgba, tracePoly } from '../../scene/watercolor';
import { bloom, blobPoly, grassTuft } from '../../river/scene/paint';
import { laySpringTree, renderSpringTree, type SpringTree } from '../../brick/scene/springArt';
import { HORIZON, PILES, TREES, WOOD_EDGE } from './geom';
import { viewX, viewY, type Camera } from './layout';

type Ctx = CanvasRenderingContext2D;
const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

const BLUEBELL = ['#5F63B8', '#6E6FC6', '#7C78D0', '#5458A6', '#8B86D8'] as const;
const GRASS = ['#9DBF5C', '#5E8A3E', '#7EA64C', '#B4CE6E'] as const;

/** a world-space wash: a deformed polygon filled a few times at low alpha (watercolor build-up) */
function wash(ctx: Ctx, poly: number[], color: string, alpha: number, rnd: Rand, layers = 3, amp = 0.02): void {
  ctx.fillStyle = rgba(color, alpha / layers);
  for (let i = 0; i < layers; i++) {
    tracePoly(ctx, deform(poly, rnd, 3, amp));
    ctx.fill();
  }
}

/** a ridge line across the view: y(x) = base + sum of soft bumps */
function ridge(x0: number, x1: number, base: number, rnd: Rand, amp: number, n = 6): (x: number) => number {
  // spread evenly with jitter, so bumps never pile into one peak
  const bumps = Array.from({ length: n }, (_, i) => ({ c: x0 + ((i + rnd.range(0.2, 0.8)) / n) * (x1 - x0), w: rnd.range(110, 240), h: rnd.range(0.4, 1) * amp }));
  return (x) => base - bumps.reduce((s, b) => s + b.h * Math.exp(-(((x - b.c) / b.w) ** 2)), 0);
}

function paintSky(ctx: Ctx, rnd: Rand, x0: number, x1: number, y0: number): void {
  const g = ctx.createLinearGradient(0, y0, 0, HORIZON + 10);
  g.addColorStop(0, 'rgba(98,150,206,0.42)');
  g.addColorStop(0.5, 'rgba(146,186,222,0.26)');
  g.addColorStop(0.85, 'rgba(236,226,176,0.22)');
  g.addColorStop(1, 'rgba(246,230,170,0.28)');
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, HORIZON + 10 - y0);
  ctx.restore();
  // variegation: broad blooms of slightly different blues, paler near the sun (upper left)
  for (let i = 0; i < 14; i++) {
    const x = rnd.range(x0, x1);
    const y = rnd.range(y0, HORIZON - 60);
    bloom(ctx, x, y, rnd.range(80, 200), rnd.range(30, 70), rnd.pick(['#6E9ED2', '#88B0DA', '#A4C2E2']), 0.07, rnd, 4);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  bloom(ctx, x0 + 60, y0 + 30, 260, 160, '#3A3418', 0.12, rnd, 5);
  ctx.restore();
  // soft spring clouds: paper lifted out of the blue, with lilac-grey bellies
  for (let i = 0; i < 6; i++) {
    const cx = rnd.range(x0 + 40, x1 - 40);
    const cy = rnd.range(Math.max(y0 + 30, 120), HORIZON - 90);
    const w = rnd.range(60, 130);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 5; k++) bloom(ctx, cx + rnd.range(-0.6, 0.6) * w, cy + rnd.range(-0.15, 0.1) * w, w * rnd.range(0.3, 0.55), w * rnd.range(0.14, 0.24), '#000000', 0.16, rnd, 3);
    ctx.restore();
    for (let k = 0; k < 3; k++) bloom(ctx, cx + rnd.range(-0.4, 0.4) * w, cy + w * 0.12, w * rnd.range(0.3, 0.5), w * 0.08, '#9C94B4', 0.06, rnd, 3);
  }
}

function paintDowns(ctx: Ctx, rnd: Rand, x0: number, x1: number): void {
  // the far downs: two ranges, bluer and paler the further they are
  const far = ridge(x0, x1, HORIZON - 4, rnd, 30, 8);
  const near = ridge(x0, x1, HORIZON + 6, rnd, 18, 9);
  for (const [line, col, a] of [
    [far, '#8EA2C6', 0.42],
    [near, '#7D9C9A', 0.46],
  ] as const) {
    const poly: number[] = [];
    for (let x = x0; x <= x1; x += 12) poly.push(x, line(x));
    poly.push(x1, HORIZON + 40, x0, HORIZON + 40);
    wash(ctx, poly, col, a, rnd, 3, 0.006);
    // hedgerows and copses on the nearer range: small dabs along contour lines
    if (line === near) {
      for (let k = 0; k < 4; k++) {
        const yOff = 8 + k * 9;
        for (let x = x0; x < x1; x += rnd.range(5, 12)) {
          if (rnd.chance(0.45)) continue;
          ctx.fillStyle = rgba(rnd.pick(['#5E7E78', '#6A8A80', '#56746E']), rnd.range(0.18, 0.32));
          tracePoly(ctx, blobPoly(x, line(x) + yOff + rnd.range(-2, 2), rnd.range(3, 7), rnd.range(2, 3.5), rnd, 8, 0.25));
          ctx.fill();
        }
      }
    }
  }
}

/** the wood's edge: a dark understorey mass, then hazy beeches in fresh leaf standing in it */
async function paintWoodEdge(ctx: Ctx, rnd: Rand, x0: number, x1: number, A: number, alive: () => boolean): Promise<boolean> {
  const top = ridge(x0, x1, WOOD_EDGE - 40, rnd, 26, 10);
  const poly: number[] = [];
  for (let x = x0; x <= x1; x += 8) poly.push(x, top(x) + Math.sin(x * 0.11) * 3);
  poly.push(x1, WOOD_EDGE + 26, x0, WOOD_EDGE + 26);
  wash(ctx, poly, '#5E7F5A', 0.5, rnd, 4, 0.01);
  // canopy texture: rounded dabs in three values (lit tops, mid, shade underneath)
  for (let x = x0; x < x1; x += rnd.range(6, 11)) {
    const y = top(x) + rnd.range(0, 30);
    const lit = y < top(x) + 10;
    ctx.fillStyle = rgba(lit ? rnd.pick(['#A9C674', '#B8D282', '#9CBC66']) : rnd.pick(['#6E9452', '#5E8248', '#4E6E42']), rnd.range(0.22, 0.4));
    tracePoly(ctx, blobPoly(x, y, rnd.range(6, 13), rnd.range(4, 8), rnd, 9, 0.22));
    ctx.fill();
  }
  // the shadowed understorey and a few grey trunks in it
  const g = ctx.createLinearGradient(0, WOOD_EDGE - 10, 0, WOOD_EDGE + 24);
  g.addColorStop(0, 'rgba(46,64,52,0)');
  g.addColorStop(0.6, 'rgba(46,64,52,0.28)');
  g.addColorStop(1, 'rgba(46,64,52,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, WOOD_EDGE - 10, x1 - x0, 34);
  ctx.lineCap = 'round';
  for (let x = x0; x < x1; x += rnd.range(14, 34)) {
    ctx.strokeStyle = rgba(rnd.pick(['#6C6A62', '#7E7A6E', '#5C5A54']), rnd.range(0.25, 0.45));
    ctx.lineWidth = rnd.range(1, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, WOOD_EDGE + 18);
    ctx.lineTo(x + rnd.range(-2, 2), WOOD_EDGE - rnd.range(8, 22));
    ctx.stroke();
  }
  // standing beeches along the edge, hazy with distance (Time to Grow's tree in Brick's spring leaf)
  const xs: number[] = [];
  for (let x = x0 + rnd.range(10, 50); x < x1; x += rnd.range(110, 190)) xs.push(x);
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    // keep the clearing's two trees clear of a tree right behind them
    if (Math.abs(x - TREES.a.x) < 60 || Math.abs(x - TREES.b.x) < 60) continue;
    const plan: SpringTree = { seed: 5100 + i * 37, x, y: WOOD_EDGE + rnd.range(4, 14), k: rnd.range(0.2, 0.27), m: rnd.range(0.8, 1), kit: 'leaf', haze: rnd.range(0.38, 0.5), flip: rnd.chance(0.5) };
    const r = await renderSpringTree(plan, A, A > 1.6 ? 1.4 : 1, tick, alive);
    if (!r || !alive()) return false;
    laySpringTree(ctx, plan, r, A);
  }
  return true;
}

function paintClearing(ctx: Ctx, rnd: Rand, x0: number, x1: number, y1: number): void {
  // new grass: a warm green wash, deeper toward the front
  const g = ctx.createLinearGradient(0, WOOD_EDGE, 0, y1);
  g.addColorStop(0, 'rgba(150,186,92,0.42)');
  g.addColorStop(0.5, 'rgba(126,168,78,0.46)');
  g.addColorStop(1, 'rgba(92,136,64,0.55)');
  const poly: number[] = [];
  for (let x = x0; x <= x1; x += 10) poly.push(x, WOOD_EDGE + 8 + Math.sin(x * 0.05) * 2);
  poly.push(x1, y1, x0, y1);
  ctx.fillStyle = g;
  for (let i = 0; i < 2; i++) {
    tracePoly(ctx, deform(poly, rnd, 2, 0.004));
    ctx.fill();
  }
  // variegation: lighter sunlit patches and cooler hollows
  for (let i = 0; i < 26; i++) {
    const y = rnd.range(WOOD_EDGE + 20, y1);
    bloom(ctx, rnd.range(x0, x1), y, rnd.range(50, 140), rnd.range(10, 26), rnd.chance(0.5) ? '#C6D884' : '#5E8A56', 0.08, rnd, 3);
  }
  // each tree's pool of shade, cast to the lower right (light from the upper left)
  for (const t of [TREES.a, TREES.b]) {
    for (let k = 0; k < 4; k++) bloom(ctx, t.x + 46 + k * 4, t.y + 6, 130 - k * 18, 16 - k * 2, '#40624E', 0.07, rnd, 4);
  }
  // a worn way across the clearing, between the trees and up to each woodpile
  ctx.strokeStyle = 'rgba(176,160,110,0.16)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.lineWidth = 9 - k * 2.5;
    ctx.beginPath();
    ctx.moveTo(PILES.a.x + 40, PILES.a.y + 12 + k);
    ctx.bezierCurveTo(TREES.a.x, 566 + k, TREES.b.x, 566 - k, PILES.b.x - 40, PILES.b.y + 12 + k);
    ctx.stroke();
  }
}

/** a bluebell: an arched stem with a one-sided row of nodding bells */
function bluebell(ctx: Ctx, rnd: Rand, x: number, y: number, h: number): void {
  const lean = rnd.range(0.12, 0.3) * rnd.sign();
  ctx.strokeStyle = 'rgba(74,110,60,0.65)';
  ctx.lineWidth = Math.max(0.25, h * 0.045);
  const tx = x + lean * h;
  const ty = y - h;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x, y - h * 0.7, tx, ty);
  ctx.stroke();
  const n = h > 8 ? rnd.int(3, 5) : 2;
  for (let i = 0; i < n; i++) {
    const t = 0.55 + (i / n) * 0.45;
    const bx = x + (tx - x) * t * t + lean * h * 0.18;
    const by = y - h * t + h * 0.08;
    ctx.fillStyle = rgba(rnd.pick(BLUEBELL), rnd.range(0.6, 0.85));
    ctx.beginPath();
    ctx.ellipse(bx, by, h * 0.07, h * 0.1, lean * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** drifts of bluebells: a haze of blue in the distance, single plants with their bells at the front */
function paintBluebells(ctx: Ctx, rnd: Rand, x0: number, x1: number, y1: number): void {
  const avoid = (x: number, y: number): boolean => {
    for (const p of [PILES.a, PILES.b]) if (Math.abs(x - p.x) < 86 && y < p.y + 10 && y > p.y - 50) return true;
    for (const t of [TREES.a, TREES.b]) if (Math.abs(x - t.x) < 18 && Math.abs(y - t.y) < 8) return true;
    return false;
  };
  // the haze: soft violet washes in drifts across the clearing, densest at the wood's edge and the front
  for (let i = 0; i < 70; i++) {
    const y = rnd.range(WOOD_EDGE + 10, y1);
    const x = rnd.range(x0, x1);
    if (avoid(x, y)) continue;
    const k = 0.4 + ((y - WOOD_EDGE) / (y1 - WOOD_EDGE)) * 1.2;
    bloom(ctx, x, y, rnd.range(30, 80) * k, rnd.range(4, 9) * k, rnd.pick(['#7A7CCB', '#8C88D6', '#6A6EBE']), 0.1, rnd, 3);
  }
  // dabs: a flower head is a dot far off, a bell spray near
  const N = Math.round((x1 - x0) * 3.2);
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < N; i++) {
    // clumped: pick a drift centre then scatter around it
    const cx = rnd.range(x0, x1);
    const cy = WOOD_EDGE + 14 + Math.pow(rnd.next(), 0.7) * (y1 - WOOD_EDGE - 14);
    const n = rnd.int(2, 5);
    for (let j = 0; j < n; j++) pts.push({ x: cx + rnd.gauss() * 10, y: cy + rnd.gauss() * 2.5 });
  }
  pts.sort((a, b) => a.y - b.y);
  for (const p of pts) {
    if (avoid(p.x, p.y) || p.y > y1 + 10) continue;
    const d = (p.y - WOOD_EDGE) / (600 - WOOD_EDGE);
    if (d < 0.45) {
      ctx.fillStyle = rgba(rnd.pick(BLUEBELL), 0.35 + d * 0.5);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 0.6 + d * 2.2, 0.5 + d * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      if (rnd.chance(0.35)) grassTuft(ctx, p.x + rnd.range(-3, 3), p.y + 1, 4 + d * 8, rnd, 0.5 + d * 0.5, GRASS);
      bluebell(ctx, rnd, p.x, p.y, 4 + d * 11 * rnd.range(0.8, 1.2));
    }
  }
  // a few white stitchwort stars and primroses among them
  for (let i = 0; i < 90; i++) {
    const x = rnd.range(x0, x1);
    const y = rnd.range(WOOD_EDGE + 60, y1);
    if (avoid(x, y)) continue;
    const r = 0.6 + ((y - WOOD_EDGE) / (600 - WOOD_EDGE)) * 1.6;
    ctx.fillStyle = rnd.chance(0.7) ? 'rgba(255,253,244,0.85)' : 'rgba(244,226,140,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The whole static picture at this camera (device px). Returns null if superseded. */
export async function buildBackdrop(c: Camera, tile: CanvasImageSource, alive: () => boolean): Promise<HTMLCanvasElement | null> {
  const W = Math.round(c.cssW * c.dpr);
  const H = Math.round(c.cssH * c.dpr);
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  paintPaperBackdrop(ctx, W, H, tile, c.dpr);
  ctx.setTransform(c.dpr * c.s, 0, 0, c.dpr * c.s, c.dpr * c.ox, c.dpr * c.oy);
  const { x0, x1 } = viewX(c, 30);
  const { y0, y1 } = viewY(c, 20);
  paintSky(ctx, new Rand(7101), x0, x1, y0);
  paintDowns(ctx, new Rand(7211), x0, x1);
  await tick();
  if (!alive()) return null;
  const A = Math.min(3, c.s * c.dpr * 1.25);
  const ok = await paintWoodEdge(ctx, new Rand(7307), x0, x1, A, alive);
  if (!ok || !alive()) return null;
  paintClearing(ctx, new Rand(7411), x0, x1, y1);
  await tick();
  if (!alive()) return null;
  paintBluebells(ctx, new Rand(7517), x0, x1, y1);
  return cv;
}

/** The front fringe: bluebells and grass painted over the foot of the woodpiles and the trees (drawn last). */
export function buildFringe(c: Camera): HTMLCanvasElement {
  const W = Math.round(c.cssW * c.dpr);
  const H = Math.round(c.cssH * c.dpr);
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(c.dpr * c.s, 0, 0, c.dpr * c.s, c.dpr * c.ox, c.dpr * c.oy);
  const rnd = new Rand(7621);
  for (const p of [PILES.a, PILES.b]) {
    for (let x = p.x - 84; x < p.x + 84; x += rnd.range(2.5, 6)) {
      const y = p.y + rnd.range(-1, 4);
      grassTuft(ctx, x, y, rnd.range(5, 9), rnd, 0.8, GRASS);
      if (rnd.chance(0.4)) bluebell(ctx, rnd, x + rnd.range(-2, 2), y + 1, rnd.range(7, 11));
    }
  }
  for (const t of [TREES.a, TREES.b]) {
    for (let x = t.x - 26; x < t.x + 26; x += rnd.range(2, 5)) {
      const y = t.y + rnd.range(0, 4);
      grassTuft(ctx, x, y, rnd.range(4, 8), rnd, 0.7, GRASS);
      if (rnd.chance(0.3)) bluebell(ctx, rnd, x, y + 1, rnd.range(6, 10));
    }
  }
  return cv;
}
