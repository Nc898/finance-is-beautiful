/**
 * The static world, painted once per size into one cached layer (zoomed with the camera): the far mountains, the
 * distant wooded ridge, the snowy plain and the two hillsides (light and shade, pencil, ripples, faint lanes), the
 * frozen creek, the snowbank at the foot, rocks and dry grass, the pines (a wood along each crest, a stand in the
 * valley, big pines framing both edges) and the footbridge. The balls, tracks, sledges, climbers and the falling snow
 * are drawn over it per frame, and so are the valley stand and the big edge pines (`standing`): they are drawn sorted
 * by depth with everything that moves, so a bird flying behind one of them is hidden by it.
 */
import { Rand } from '../../scene/prng';
import { makeCanvas } from '../../scene/watercolor';
import type { Camera } from './geom';
import { HILL } from './geom';
import { crestLine, planPines, ridgeBack, woodTop, type PinePlan } from './layout';
import { hazeSprite, layPine, makePine, type PineKind, type PineSprite } from './pines';
import { paintMountains, type View } from './mountains';
import { paintBank, paintLanes, paintScatter, paintSnowfield } from './ground';
import { paintBridge, paintCreek } from './creek';

export interface WorldLayer {
  cv: HTMLCanvasElement;
  /** device px per css px of the layer */
  gd: number;
  xmin: number;
  xmax: number;
  ymax: number;
  /** the top of the crest woods over each hill (world y): labels sit above it */
  woodTop: { snowball: number; avalanche: number };
  /** places on big pines where a bough can let go a puff of snow (world units) */
  puffSpots: Array<{ x: number; y: number }>;
  /** the pines drawn per frame (the valley stand and the edges), far to near */
  standing: StandingPine[];
  /** where a bird can perch: the spire tops and the front bough tips of the pines in view */
  perches: Perch[];
}

export interface StandingPine {
  /** the tree painted once at its size on screen (so drawing it each frame is a straight copy) */
  cv: HTMLCanvasElement;
  /** its place in world units: the top left corner and size */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** the trunk foot (its depth) */
  y: number;
}

export interface Perch {
  /** where the bird's feet go (world units) */
  x: number;
  y: number;
  /** the depth of its tree (the trunk foot's y): a bird there is drawn just in front of it, at its scale */
  depth: number;
  /** the tree it is on (an index into the plan), so a bird can hop along the same tree */
  tree: number;
  top: boolean;
}

export function viewOf(c: Camera, margin = 50): View {
  return { xmin: -c.ox / c.s - margin, xmax: (c.cssW - c.ox) / c.s + margin, ymax: (c.cssH - c.oy) / c.s + margin * 0.4 };
}

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

type Pool = Record<PineKind, PineSprite[]>;

async function makePool(seedBase: number, H: number, q: number, per: number, check: () => boolean, haze?: [number, number]): Promise<Pool | null> {
  const pool: Pool = { spruce: [], fir: [], young: [] };
  let n = 0;
  for (const kind of ['spruce', 'fir', 'young'] as PineKind[]) {
    for (let i = 0; i < per; i++) {
      const s = makePine(seedBase + n * 31 + i * 7, kind, H * (kind === 'young' ? 0.8 : 1), q);
      if (haze) hazeSprite(s.cv, haze[0], haze[1]);
      pool[kind].push(s);
      n++;
      await tick();
      if (!check()) return null;
    }
  }
  return pool;
}

/** the same trees, veiled toward the paper (distance): copies, not new paintings */
function hazed(pool: Pool, paper: number, blue: number): Pool {
  const out: Pool = { spruce: [], fir: [], young: [] };
  for (const kind of ['spruce', 'fir', 'young'] as PineKind[]) {
    for (const s of pool[kind]) {
      const cv = makeCanvas(s.cv.width, s.cv.height);
      cv.getContext('2d')!.drawImage(s.cv, 0, 0);
      hazeSprite(cv, paper, blue);
      out[kind].push({ ...s, cv });
    }
  }
  return out;
}

const pickSprite = (pool: Pool, p: PinePlan): PineSprite => {
  const arr = pool[p.kind];
  return arr[p.pick % arr.length]!;
};

export async function buildWorld(cam: Camera, check: () => boolean): Promise<WorldLayer | null> {
  const v = viewOf(cam);
  // the layer's resolution: sharp enough for the opening zoom, within a budget of pixels
  const budget = Math.sqrt(15e6 / (cam.cssW * cam.cssH));
  const gd = Math.max(0.75, Math.min(cam.dpr * 1.5, 2, budget));
  const cv = makeCanvas(cam.cssW * gd, cam.cssH * gd);
  const ctx = cv.getContext('2d')!;
  const A = gd * cam.s;
  ctx.setTransform(A, 0, 0, A, gd * cam.ox, gd * cam.oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const rnd = new Rand(31337);
  const T0 = performance.now();
  const lg = (m: string) => console.log('[snow world]', m, Math.round(performance.now() - T0));
  // ---- the pine sprites (a pool of each kind and size class)
  const mini = await makePool(300, 24, A * 1.3, 2, check);
  if (!mini || !check()) return null;
  const miniFar = hazed(mini, 0.5, 0.22);
  const miniNear = hazed(mini, 0.32, 0.14);
  const wood = await makePool(400, 100, A * 1.15, 2, check);
  if (!wood || !check()) return null;
  const woodBack = hazed(wood, 0.22, 0.1);
  const big = await makePool(520, 300, A * 1.1, 2, check);
  if (!big || !check()) return null;
  lg('pine sprites');
  const plans = planPines(v.xmin, v.xmax);

  // ---- the sky's mountains, then the wooded ridge in front of them
  paintMountains(ctx, rnd, v);
  lg('mountains');
  await tick();
  if (!check()) return null;
  const lay = (p: PinePlan, s: PineSprite) => layPine(ctx, s, p.x, p.y, p.H / s.H, p.flip);
  for (const p of plans) {
    if (p.layer !== 'ridge') continue;
    const near = p.y - ridgeBack(p.x) > 4.5;
    lay(p, pickSprite(near ? miniNear : miniFar, p));
  }
  // ---- the snow
  paintSnowfield(ctx, rnd, v);
  lg('snowfield');
  await tick();
  if (!check()) return null;
  paintLanes(ctx, rnd);
  paintCreek(ctx, rnd, v);
  lg('creek');
  await tick();
  if (!check()) return null;
  paintBank(ctx, rnd, v);
  paintScatter(ctx, rnd, v);
  lg('bank, rocks');
  await tick();
  if (!check()) return null;
  // ---- the pines, far to near
  const puffSpots: Array<{ x: number; y: number }> = [];
  const standing: StandingPine[] = [];
  // the part of the world on screen (the layer itself reaches a margin further, for the camera's zoom)
  const sx0 = -cam.ox / cam.s;
  const sx1 = (cam.cssW - cam.ox) / cam.s;
  const sy0 = -cam.oy / cam.s;
  const perches: Perch[] = [];
  plans.forEach((p, ti) => {
    if (p.layer === 'ridge') return;
    let s: PineSprite;
    const back = p.layer === 'crest' && p.y < crestLine(p.x) + 1;
    if (p.layer === 'crest') s = pickSprite(back ? woodBack : wood, p);
    else if (p.layer === 'valley') s = pickSprite(wood, p);
    else s = pickSprite(big, p);
    const k = p.H / s.H;
    if (p.layer === 'crest') lay(p, s);
    else if (p.x + s.w * k > v.xmin && p.x - s.w * k < v.xmax) {
      // painted once at the layer's resolution, the trunk foot where the sprite has it
      const w = s.w * k;
      const h = s.h * k;
      const x0 = p.x - (p.flip ? s.w - s.px : s.px) * k;
      const y0 = p.y - s.py * k;
      const pc = makeCanvas(Math.max(1, Math.ceil(w * A)), Math.max(1, Math.ceil(h * A)));
      const pctx = pc.getContext('2d')!;
      pctx.setTransform(A, 0, 0, A, -x0 * A, -y0 * A);
      layPine(pctx, s, p.x, p.y, k, p.flip);
      standing.push({ cv: pc, x0, y0, w, h, y: p.y });
    }
    // perches: the spire top and the front bough tips (not the back row of the wood, half hidden in it), on screen
    if (!back && p.H > 40) {
      const onScreen = (x: number, y: number) => x > sx0 + 8 && x < sx1 - 8 && y > sy0 + 30;
      const top = { x: p.x, y: p.y - p.H * 0.985 };
      if (onScreen(top.x, top.y)) perches.push({ ...top, depth: p.y, tree: ti, top: true });
      for (const t of s.tips) {
        const x = p.x + (p.flip ? -t.x : t.x) * k;
        const y = p.y + t.y * k - 1.2 * k;
        if (onScreen(x, y)) perches.push({ x, y, depth: p.y, tree: ti, top: false });
      }
    }
    if ((p.layer === 'edge' || p.layer === 'valley') && p.H > 100 && s.tips.length) {
      const t = s.tips[(p.seed * 7) % s.tips.length]!;
      puffSpots.push({ x: p.x + (p.flip ? -t.x : t.x) * k, y: p.y + t.y * k });
    }
  });
  // a perch inside the crown of a nearer pine would be hidden by it: a bird there could not be seen
  const covered = (q: Perch) =>
    plans.some((u, ui) => {
      if (ui === q.tree || u.layer === 'ridge' || u.y <= q.depth + 1) return false;
      const up = u.y - q.y;
      if (up < 0 || up > u.H) return false;
      // the crown is roughly a cone: widest low down, a point at the top
      const half = u.H * 0.26 * (1 - up / u.H) + 2;
      return Math.abs(q.x - u.x) < half;
    });
  for (let i = perches.length - 1; i >= 0; i--) if (covered(perches[i]!)) perches.splice(i, 1);
  lg('pines');
  await tick();
  if (!check()) return null;
  paintBridge(ctx, new Rand(8181));
  lg('done');
  return { cv, gd, xmin: v.xmin, xmax: v.xmax, ymax: v.ymax, woodTop: { snowball: woodTop(plans, 'snowball'), avalanche: woodTop(plans, 'avalanche') }, puffSpots, standing, perches };
}

void HILL;
