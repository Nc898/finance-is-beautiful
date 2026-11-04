/**
 * The pickers' young orchards (OrchardView in partsApi.ts): an apple tree at SLOTS[id][tree.index] for every tree
 * planted so far, from a seedling to a tree in its prime.
 *
 * The trees are Time to Grow's (src/scene/treeModel.ts and treePainter.ts, as Brick's spring trees), dressed in the
 * late-summer leaf of appleArt.ts. A tree's maturity m is set by its money: Time to Grow's tree is m × 560 tall with a
 * crown m × 560 × crownRatio(m) wide (widened here by spread(m): an apple tree spreads), so m is solved from
 * m² × crownRatio(m) × spread(m) ∝ size, and the crown's painted area is proportional to YoungTree.size (TREE_MAX is
 * size 1). Under m = 0.045 it is a seedling (drawn here, not painted).
 *
 * Painting a crown takes a couple of milliseconds, so each tree is painted to its own sprite at a step of its
 * maturity (steps 3% apart), and that sprite is drawn scaled to the exact size every frame, so the size never steps.
 * No painting happens in a frame: it is done in the browser's idle time between frames (requestIdleCallback), the
 * trees furthest from what they should show first, then the next step ahead for every tree growing toward it, so
 * that while the timeline plays a tree's next step is usually ready when it is reached and is simply swapped in. A
 * new sprite cross-fades in over the old (an exact blend, in a scratch canvas). A tree whose step has not changed is
 * never repainted. Until a tree has a sprite near its size (a jump along the timeline, the first frames), it shows
 * a stand-in: one of a ladder of shared trees of each variety painted in prepare(), scaled to its exact size.
 *
 * Stages, by age (months since its first dollar) and size: the seedling comes up over the first three months; from
 * then the tree catches up with its money within a few months; the stake and its tie come in once the young tree is
 * taller than the tie; fruit from about two years, more as it grows. Each slot has its own seed, so the same frame
 * inputs give the same orchard (once the idle painting has caught up).
 */
import { H as TREE_H, WE, crownMap, crownRatio, mapY } from '../../scene/treeModel';
import { TreePainter } from '../../scene/treePainter';
import { getModel } from '../../scene/treeView';
import { clamp, hashSeed, smoothstep } from '../../scene/prng';
import { makeCanvas } from '../../scene/watercolor';
import type { Sprites } from '../../scene/sprites';
import type { PickerId, Variety, YoungTree } from '../types';
import { FIGURE_REF_Y, SLOTS, TREE_MAX, depthScale } from './geom';
import type { CreateOrchardView, Item, OrchardView } from './partsApi';
import {
  APPLE_D, STAKE, drawSeedling, drawTie, leafSprites, leafTone, makeApples, makeLabel, makeStake, makeTreeShadow,
  stampApple, tuckLeaf, type AppleSpr, type Anchored,
} from './appleArt';

/** below this maturity a tree is a seedling; the first painted step */
const M0 = 0.045;
/** each painted step is 3% larger than the last */
const LN_STEP = Math.log(1.03);
const R1 = crownRatio(1);
/** Time to Grow's mature crown is WE wide and H tall; ours is TREE_MAX.w by TREE_MAX.h, so widen it a little */
const XS1 = TREE_MAX.w / ((WE / TREE_H) * TREE_MAX.h);
/** and a young Time to Grow tree is an upright oval: an apple tree spreads from the start, so widen it more */
const spread = (m: number): number => XS1 * Math.pow(R1 / crownRatio(m), 0.8);
const FADE_MS = 280;
const FADE_LEVELS = 6;
const FRUIT_Q = 0.02;
const PARAMS = { months: 12, timeMs: 0, wind: false, pulse: -1, bills: 0, noBills: true } as const;
/** the stand-ins: maturities 22% apart from the first step to the largest */
const STAND_RATIO = 1.22;
/** a tree whose own sprite is further than this (ratio of maturity) from its size shows a nearer stand-in */
const FAR = Math.log(1.3);
/** a tree's own sprite enlarged by more than this (log ratio) would look soft: it is painted in the frame */
const BLUR = Math.log(1.2);
/** a look-ahead is painted once a tree is this far through its current step */
const AHEAD_AT = 0.3;
/** at least this much idle time is wanted to paint one tree (unless the idle callback timed out) */
const PAINT_MS = 1.5;

/** the maturity whose crown area is `size` of the largest (area ∝ m² × crownRatio(m) × spread(m)) */
function maturityFor(size: number): number {
  if (size <= 0) return 0;
  if (size >= 1) return 1;
  const want = size * R1 * XS1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (m * m * crownRatio(m) * spread(m) < want) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** how far a tree has come up by its age: a seedling over three months, then catching up with its money */
const maturityByAge = (age: number): number => (age <= 0 ? 0 : 0.05 * smoothstep(age / 3) + 0.075 * Math.max(0, age - 3));

/** fruit: none before about two years, then more with age and size (the share of the places an apple can hang) */
const fruitShare = (age: number, m: number): number => smoothstep((age - 22) / 36) * (0.03 + 0.09 * m);

const stepOf = (m: number): number => (m >= M0 ? Math.floor(Math.log(m / M0) / LN_STEP) : -1);
const stepM = (step: number): number => M0 * Math.exp((step + 0.5) * LN_STEP);

/** one painted step of one tree */
interface Paint {
  /** a canvas while it is painted, then a bitmap (drawn without the canvas's deferred painting landing in a frame) */
  cv: HTMLCanvasElement | ImageBitmap;
  /** the trunk foot in the canvas (px) */
  fx: number;
  fy: number;
  /** px per world unit it was painted at, the depth scale, its maturity, step and fruit level */
  A: number;
  ds: number;
  m: number;
  step: number;
  fruit: number;
  /** a stand-in (shared by many slots, never recycled) */
  shared: boolean;
}

/** a place an apple can hang: on clump `ci`, at a fraction of its body, shown once the fruit share passes `t` */
interface Hang {
  ci: number;
  fx: number;
  fy: number;
  t: number;
  v: number;
  tuck: number;
}

/** what a tree is painted from */
interface Source {
  painter: TreePainter;
  hangs: Hang[];
  ds: number;
  variety: Variety;
}

interface Slot extends Source {
  index: number;
  x: number;
  y: number;
  /** the trunk's lean (world x per unit of height) */
  lean: number;
  /** showing (with the one fading out), and the next step painted ahead */
  cur: Paint | null;
  prev: Paint | null;
  next: Paint | null;
  fadeAt: number;
  /** a painting is being baked for it */
  pending: boolean;
  /** the cross-fade as last blended: its canvas, its level and its bounds in the new sprite's pixels */
  blend: { cv: HTMLCanvasElement; level: number; x0: number; y0: number; w: number; h: number } | null;
  /** wanted this frame: maturity, step, how far through the step (0…1), fruit level */
  m: number;
  step: number;
  frac: number;
  fruit: number;
}

interface Art {
  A: number;
  kit: Sprites;
  apples: Record<Variety, AppleSpr[]>;
  stake: Anchored;
  label: Anchored;
  shadow: Anchored;
  /** the stand-ins of each variety, smallest first */
  stand: Record<Variety, Paint[]>;
}

/** canvases of steps no longer shown, kept for the next painting (making a canvas costs more than resizing one) */
const pool: HTMLCanvasElement[] = [];
function canvasOf(w: number, h: number): HTMLCanvasElement {
  const cv = pool.pop();
  if (!cv) return makeCanvas(w, h);
  // setting the size clears the canvas and its state
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  return cv;
}
function recycle(cv: HTMLCanvasElement): void {
  if (pool.length < 12) pool.push(cv);
}
function release(p: Paint | null): void {
  if (!p || p.shared) return;
  if (p.cv instanceof HTMLCanvasElement) recycle(p.cv);
  else p.cv.close();
}

/** turn a freshly painted sprite into a bitmap: the painting is rasterised off the main thread, and the canvas
 *  goes back to the pool */
async function bake(p: Paint): Promise<Paint> {
  const cv = p.cv;
  if (!(cv instanceof HTMLCanvasElement) || typeof createImageBitmap !== 'function') return p;
  p.cv = await createImageBitmap(cv);
  recycle(cv);
  return p;
}

/** Time to Grow's painter, without the roots: here they are under the grass (clipped away), and they cost a
 *  sixth of the painting */
function makePainter(seed: number): TreePainter {
  const painter = new TreePainter(getModel(seed));
  (painter as unknown as { drawRoots: () => void }).drawRoots = () => {};
  return painter;
}

const hash01 = (...n: number[]): number => hashSeed(...n) / 4294967296;

/** where apples can hang on a tree: the lower part of the mid and front clumps, fewer toward the top of the crown */
function hangsOf(painter: TreePainter, seed: number): Hang[] {
  const hangs: Hang[] = [];
  painter.model.clumps.forEach((c, ci) => {
    if (c.layer < 2 || c.mass) return;
    for (let k = 0; k < 2; k++) {
      const h = (q: number) => hash01(seed, ci, k, q);
      hangs.push({ ci, fx: (h(1) - 0.5) * 0.56, fy: h(2), t: h(3) * (0.55 + 1.1 * c.v), v: Math.floor(h(4) * 4), tuck: h(5) });
    }
  });
  return hangs.sort((a, b) => a.t - b.t);
}

/** the next idle slice of time (Safari has no requestIdleCallback: a short timeout instead) */
function idle(run: (ms: number, forced: boolean) => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback((d) => run(d.timeRemaining(), d.didTimeout), { timeout: 150 });
  else setTimeout(() => run(4, false), 8);
}

class Orchard implements OrchardView {
  readonly id: PickerId;
  private slots = new Map<number, Slot>();
  private art: Art | null = null;
  private last: readonly YoungTree[] = [];
  /** the slots shown in the last frame */
  private live: Slot[] = [];
  private queued = false;

  constructor(id: PickerId) {
    this.id = id;
  }

  private slot(index: number): Slot | null {
    let s = this.slots.get(index);
    if (s) return s;
    const p = SLOTS[this.id][index];
    if (!p) return null;
    const seed = hashSeed(this.id === 'a' ? 401 : 809, index, 0x0a44);
    const painter = makePainter(seed);
    s = {
      index, x: p.x, y: p.y, ds: depthScale(p.y), painter, hangs: hangsOf(painter, seed), lean: painter.model.tanLean,
      variety: 'own', cur: null, prev: null, next: null, fadeAt: -1e9, pending: false, blend: null, m: 0, step: -1, frac: 0, fruit: 0,
    };
    this.slots.set(index, s);
    return s;
  }

  async prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void> {
    // painted at the density they are drawn at (no oversampling: it would cost fill rate every frame)
    const A = Math.min(3, pxPerUnit);
    const kit = await leafSprites(A > 2 ? 0.9 : 0.6, tick, check);
    if (!check()) return;
    const art: Art = {
      A, kit, apples: makeApples(Math.max(6, APPLE_D * A * 1.5)), stake: makeStake(A * 1.25), label: makeLabel(A * 1.5),
      shadow: makeTreeShadow(Math.max(40, TREE_MAX.h * A)), stand: { own: [], match: [] },
    };
    // the stand-ins first, so that any tree can be shown at once, then the trees as last seen, largest first
    for (const v of ['own', 'match'] as const) {
      const seed = v === 'own' ? 3301 : 3307;
      const painter = makePainter(seed);
      const src: Source = { painter, hangs: hangsOf(painter, seed), ds: depthScale(FIGURE_REF_Y - 90), variety: v };
      for (let m = stepM(0), i = 0; m < 1.1; m *= STAND_RATIO, i++) {
        const mm = Math.min(1, m);
        const p = await bake(this.paintTree(art, src, mm, -1, m < 0.45 ? 0 : Math.floor((0.03 + 0.09 * mm) / FRUIT_Q)));
        p.shared = true;
        art.stand[v].push(p);
        if (i % 3 === 2) {
          await tick();
          if (!check()) return;
        }
      }
    }
    this.art = art;
    for (let i = 0; i < SLOTS[this.id].length; i++) {
      this.slot(i);
      if (i % 6 === 5) {
        await tick();
        if (!check()) return;
      }
    }
    const todo = this.last.map((t) => this.want(t)).filter((s): s is Slot => !!s && s.step >= 0);
    todo.sort((a, b) => b.m - a.m);
    for (const s of todo) {
      if (this.fresh(s)) continue;
      this.show(s, await bake(this.paintTree(art, s, stepM(s.step), s.step, s.fruit)), false);
      await tick();
      if (!check()) return;
    }
  }

  /** what a tree should look like this frame (sets the slot's wanted maturity, step and fruit) */
  private want(t: YoungTree): Slot | null {
    const s = this.slot(t.index);
    if (!s) return null;
    const m = Math.min(maturityFor(t.size), maturityByAge(t.age));
    s.m = m;
    s.step = stepOf(m);
    s.frac = m >= M0 ? Math.log(m / M0) / LN_STEP - s.step : 0;
    s.fruit = s.step >= 0 ? Math.floor(fruitShare(t.age, m) / FRUIT_Q + 1e-9) : 0;
    s.variety = t.variety;
    return s;
  }

  private fresh(s: Slot): boolean {
    const c = s.cur;
    return !!c && !c.shared && c.step === s.step && c.fruit === s.fruit && c.A === this.art!.A;
  }

  /** show a new sprite, cross-fading from what was showing (or at once) */
  private show(s: Slot, p: Paint, fade: boolean): void {
    const now = performance.now();
    if (s.blend) s.blend.level = -1;
    if (s.cur && fade) {
      // mid-fade: keep whichever of the two is showing more
      if (s.prev && now - s.fadeAt < FADE_MS / 2) release(s.cur);
      else {
        release(s.prev);
        s.prev = s.cur;
      }
      s.fadeAt = now;
    } else {
      release(s.prev);
      release(s.cur);
      s.prev = null;
      s.fadeAt = -1e9;
    }
    s.cur = p;
  }

  /** the nearest stand-in to maturity m */
  private standIn(v: Variety, m: number): Paint | null {
    let best: Paint | null = null;
    let bd = Infinity;
    for (const p of this.art!.stand[v]) {
      const d = Math.abs(Math.log(p.m / m));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** paint in idle time: trees showing something else than they should first (largest gap, largest tree), then the
   *  next steps ahead */
  private schedule(): void {
    if (this.queued) return;
    this.queued = true;
    idle((ms, forced) => {
      this.queued = false;
      const art = this.art;
      if (!art) return;
      const t0 = performance.now();
      let done = 0;
      for (;;) {
        if (performance.now() - t0 + PAINT_MS > ms && !(forced && done === 0)) break;
        let best: Slot | null = null;
        let bp = 0;
        let ahead = false;
        for (const s of this.live) {
          if (s.step < 0 || s.pending) continue;
          if (!this.fresh(s)) {
            const c = s.cur;
            const pri = 1000 + (!c || c.shared || c.A !== art.A ? 500 : Math.abs(c.step - s.step) * 10 + (c.step === s.step ? 0 : 50) + Math.abs(c.fruit - s.fruit)) + s.m;
            if (pri > bp) {
              bp = pri;
              best = s;
              ahead = false;
            }
          } else if (s.frac > AHEAD_AT && !(s.next && s.next.step === s.step + 1 && s.next.A === art.A)) {
            const pri = s.frac;
            if (pri > bp) {
              bp = pri;
              best = s;
              ahead = true;
            }
          }
        }
        if (!best) return;
        const s = best;
        const step = ahead ? s.step + 1 : s.step;
        s.pending = true;
        void bake(this.paintTree(art, s, stepM(step), step, s.fruit)).then((p) => {
          s.pending = false;
          if (this.art !== art) return release(p);
          if (ahead) {
            release(s.next);
            s.next = p;
          } else {
            const c = s.cur;
            this.show(s, p, !!c && !c.shared && Math.abs(Math.log(c.m / s.m)) < FAR);
          }
        });
        done++;
      }
      this.schedule();
    });
  }

  private paintTree(art: Art, s: Source, m: number, step: number, fruit: number): Paint {
    const A = art.A;
    const model = s.painter.model;
    const k = (TREE_MAX.h * s.ds) / TREE_H;
    const sc = A * k;
    const h = m * TREE_H;
    const cm = crownMap(m, model.tanLean);
    const half = Math.max(30, cm.wc * 0.62 + 16);
    const lx = -half + Math.min(0, model.tanLean * h);
    const rx = half + Math.max(0, model.tanLean * h);
    const top = h * 1.05 + 14;
    const cv = canvasOf((rx - lx) * sc, (top + 4) * sc);
    const ctx = cv.getContext('2d')!;
    const ox = -lx * sc;
    const oy = top * sc;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cv.width, oy + 1.6 * sc);
    ctx.clip();
    s.painter.paint(ctx, { ox, oy, s: sc, dpr: 1 }, { ...PARAMS, maturity: m }, art.kit);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // the low sun: a warm glaze over the crown's upper left, a cool one over its lower right (only on paint)
    const ccx = ox + model.tanLean * 0.68 * h * sc;
    const ctop = oy - h * sc;
    const ch = 0.65 * h * sc;
    const cw = cm.wc * sc;
    ctx.globalCompositeOperation = 'source-atop';
    const warm = ctx.createRadialGradient(ccx - 0.32 * cw, ctop + 0.22 * ch, 0, ccx - 0.32 * cw, ctop + 0.22 * ch, 0.85 * cw);
    warm.addColorStop(0, 'rgba(246,222,140,0.2)');
    warm.addColorStop(0.5, 'rgba(240,210,130,0.08)');
    warm.addColorStop(1, 'rgba(240,210,130,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, cv.width, oy);
    const cool = ctx.createRadialGradient(ccx + 0.34 * cw, ctop + 0.92 * ch, 0, ccx + 0.34 * cw, ctop + 0.92 * ch, 0.75 * cw);
    cool.addColorStop(0, 'rgba(34,54,62,0.24)');
    cool.addColorStop(0.55, 'rgba(34,54,62,0.1)');
    cool.addColorStop(1, 'rgba(34,54,62,0)');
    ctx.fillStyle = cool;
    ctx.fillRect(0, 0, cv.width, oy);
    // apple bark: a cool grey glaze over the stem below the crown (Time to Grow's bark is a warm oak brown)
    const cb = 0.36 * h * sc;
    const bw = (cm.wc * 0.14 + 6) * sc;
    const bark = ctx.createLinearGradient(0, oy, 0, oy - cb);
    bark.addColorStop(0, 'rgba(112,112,118,0.34)');
    bark.addColorStop(0.75, 'rgba(112,112,118,0.22)');
    bark.addColorStop(1, 'rgba(112,112,118,0)');
    ctx.fillStyle = bark;
    ctx.fillRect(ox - bw + model.tanLean * cb * 0.5, oy - cb, bw * 2, cb + 2 * sc);
    ctx.globalCompositeOperation = 'source-over';
    // the fruit, hanging in the lower part of the clumps (the clumps' poses as the painter lays them, without wind)
    const share = fruit * FRUIT_Q;
    if (share > 0) {
      const st = s.painter.state;
      const d = APPLE_D * s.ds * A;
      const kinds = art.apples[s.variety];
      // the sprite is widened as it is drawn (spread), so the apples are painted narrower to come out round
      const xs = spread(m);
      for (const hg of s.hangs) {
        if (hg.t >= share) break;
        const c = model.clumps[hg.ci]!;
        const a = st.clumpA[hg.ci]!;
        if (a < 0.6) continue;
        const wcl = Math.min(c.w0 * cm.sf, 0.95 * cm.wc);
        const g = 0.75 + 0.25 * a;
        const dw = (wcl * g * sc) / 0.72;
        const dh = (wcl * c.hr * g * sc) / 0.84;
        const wy = mapY(c.y0, cm);
        const X = ox + (c.x0 * cm.kx + wy * cm.tanLean) * sc + hg.fx * dw;
        const Y = oy - wy * sc - dh * (0.04 + 0.26 * hg.fy);
        stampApple(ctx, kinds[hg.v]!, X, Y, d * (0.92 + 0.16 * hg.tuck), xs);
        if (hg.tuck < 0.4) {
          const lit = c.kind === 'lit' || c.kind === 'gold';
          tuckLeaf(ctx, leafTone(c.kind, c.variant), X + ((hg.tuck - 0.2) * d * 2) / xs, Y - d * 0.42, d, -0.5 + hg.tuck * 2.5, lit, xs);
        }
      }
    }
    return { cv, fx: ox, fy: oy, A, ds: s.ds, m, step, fruit, shared: false };
  }

  items(trees: readonly YoungTree[], windMs: number): Item[] {
    this.last = trees;
    const art = this.art;
    if (!art) return [];
    const now = performance.now();
    const live: Slot[] = [];
    let work = false;
    for (const t of trees) {
      const s = this.want(t);
      if (!s) continue;
      live.push(s);
      if (s.step < 0 || this.fresh(s)) continue;
      work = true;
      // the step painted ahead has been reached: swap it in (no painting in the frame)
      const nx = s.next;
      if (nx && nx.step === s.step && nx.A === art.A && Math.abs(nx.fruit - s.fruit) <= 1) {
        s.next = null;
        this.show(s, nx, true);
        continue;
      }
      if (nx && (nx.step < s.step || nx.step > s.step + 1)) {
        release(nx);
        s.next = null;
      }
      // nothing near its size yet (a jump along the timeline): a stand-in until its own is painted
      const c = s.cur;
      if (!c || Math.abs(Math.log(c.m / s.m)) > FAR) {
        const si = this.standIn(s.variety, s.m);
        if (si && si !== c && (!c || Math.abs(Math.log(si.m / s.m)) < Math.abs(Math.log(c.m / s.m)))) this.show(s, si, false);
      }
    }
    // the one exception to painting only in idle time: when the idle time has not kept up and a tree's sprite would
    // be enlarged enough to blur, the worst such tree is painted now (one a frame at most)
    let worst: Slot | null = null;
    let wl = BLUR;
    for (const s of live) {
      const c = s.cur;
      if (!c || c.shared || s.pending || s.step < 0) continue;
      const l = Math.log(s.m / c.m) + Math.log(art.A / c.A);
      if (l > wl) {
        wl = l;
        worst = s;
      }
    }
    if (worst) this.show(worst, this.paintTree(art, worst, stepM(worst.step), worst.step, worst.fruit), true);
    this.live = live;
    if (work || live.some((s) => s.step >= 0 && s.frac > AHEAD_AT && !s.next)) this.schedule();
    const tw = windMs / 1000;
    return live.map((s) => ({ depth: s.y, draw: (ctx: CanvasRenderingContext2D) => this.drawTree(ctx, s, art, tw, now) }));
  }

  private drawTree(ctx: CanvasRenderingContext2D, s: Slot, art: Art, tw: number, now: number): void {
    const { x, y, ds, m } = s;
    // the painted tree comes in over the seedling
    const treeA = s.cur ? smoothstep((m - M0) / 0.02) : 0;
    const hW = m * TREE_MAX.h * ds;
    const sway = tw ? 0.6 * Math.sin(tw * 1.1 + x * 0.013 + s.index) + 0.4 * Math.sin(tw * 2.3 + x * 0.021) : 0;
    // the cast shadow, to the lower right
    if (treeA > 0 && hW > 3) {
      const sh = art.shadow;
      const k = hW / sh.A;
      ctx.globalAlpha = 0.85 * treeA;
      ctx.drawImage(sh.cv, x - sh.ax * k, y - sh.ay * k, sh.cv.width * k, sh.cv.height * k);
      ctx.globalAlpha = 1;
    }
    // the stake, behind the trunk, once the young tree is taller than the tie
    const stakeA = smoothstep((m * TREE_MAX.h - STAKE.tie + 2) / 8);
    const XS = spread(m);
    const sx = x + (STAKE.dx + XS * s.lean * STAKE.tie) * ds;
    if (stakeA > 0) {
      const st = art.stake;
      const k = ds / st.A;
      ctx.globalAlpha = stakeA;
      ctx.drawImage(st.cv, sx - st.ax * k, y - st.ay * k, st.cv.width * k, st.cv.height * k);
      ctx.globalAlpha = 1;
    }
    if (treeA < 1) drawSeedling(ctx, x, y, ds, clamp(m / M0, 0, 1), sway, 1 - treeA);
    if (treeA > 0 && s.cur) {
      ctx.save();
      ctx.translate(x, y);
      // a gentle stir: the crown leans with the breeze, the foot stays put
      if (sway) ctx.transform(1, 0, -0.008 * sway, 1, 0, 0);
      ctx.globalAlpha = treeA;
      this.drawPaints(ctx, s, XS, now);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (stakeA > 0) {
      const ty = y - STAKE.tie * ds;
      drawTie(ctx, x + XS * s.lean * STAKE.tie * ds - 0.4 * ds, sx, ty, ds, stakeA);
      if (s.variety === 'match') {
        const lb = art.label;
        const k = ds / lb.A;
        const lh = 15;
        ctx.globalAlpha = stakeA;
        ctx.drawImage(lb.cv, sx + 0.02 * lh * ds - lb.ax * k, y - lh * ds - lb.ay * k, lb.cv.width * k, lb.cv.height * k);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** the tree's sprite at the foot (0, 0), scaled to its exact maturity; cross-faded from the last one */
  private drawPaints(ctx: CanvasRenderingContext2D, s: Slot, XS: number, now: number): void {
    const cur = s.cur!;
    const t = s.prev ? (now - s.fadeAt) / FADE_MS : 1;
    const kc = ((s.m / cur.m) * (s.ds / cur.ds)) / cur.A;
    if (t >= 1) {
      release(s.prev);
      s.prev = null;
      if (s.blend) {
        recycle(s.blend.cv);
        s.blend = null;
      }
      ctx.drawImage(cur.cv, -cur.fx * kc * XS, -cur.fy * kc, cur.cv.width * kc * XS, cur.cv.height * kc);
      return;
    }
    // an exact blend, (1 − t) of the old plus t of the new, summed in the slot's own canvas in the new sprite's
    // pixels; re-blended in six steps over the fade, not every frame
    const prev = s.prev!;
    const level = Math.min(FADE_LEVELS - 1, Math.floor(t * FADE_LEVELS));
    if (level === 0) {
      const kp = ((s.m / prev.m) * (s.ds / prev.ds)) / prev.A;
      ctx.drawImage(prev.cv, -prev.fx * kp * XS, -prev.fy * kp, prev.cv.width * kp * XS, prev.cv.height * kp);
      return;
    }
    let b = s.blend;
    if (!b || b.level !== level) {
      const tb = level / FADE_LEVELS;
      const r = (cur.m / prev.m) * (cur.ds / prev.ds) * (cur.A / prev.A);
      const x0 = Math.min(-cur.fx, -prev.fx * r);
      const y0 = Math.min(-cur.fy, -prev.fy * r);
      const w = Math.ceil(Math.max(cur.cv.width - cur.fx, (prev.cv.width - prev.fx) * r) - x0);
      const h = Math.ceil(Math.max(cur.cv.height - cur.fy, (prev.cv.height - prev.fy) * r) - y0);
      const cv = b ? b.cv : canvasOf(w, h);
      if (b && (cv.width !== w || cv.height !== h)) {
        cv.width = w;
        cv.height = h;
      }
      const g = cv.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, w, h);
      g.globalAlpha = 1 - tb;
      g.drawImage(prev.cv, -prev.fx * r - x0, -prev.fy * r - y0, prev.cv.width * r, prev.cv.height * r);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = tb;
      g.drawImage(cur.cv, -cur.fx - x0, -cur.fy - y0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      b = s.blend = { cv, level, x0, y0, w, h };
    }
    ctx.drawImage(b.cv, 0, 0, b.w, b.h, b.x0 * kc * XS, b.y0 * kc, b.w * kc * XS, b.h * kc);
  }
}

export const createOrchardView: CreateOrchardView = (id) => new Orchard(id);
