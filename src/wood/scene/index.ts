/**
 * "A Little Off the Top" scene (Canvas 2D). Implements WoodSceneAPI from ../types.
 *
 * Painted once per size: the paper, the sky, the downs, the wood's edge and the clearing of bluebells (backdrop.ts),
 * the bluebells in front of the woodpiles and the trees' feet (the fringe), each woodpile's stakes and log ends.
 * Per frame: the backdrop; the ghost crown (the no-fee tree, the same for both funds, painted pale into its own
 * canvas only when its size has moved); each fund's tree, live (Time to Grow's painter in Brick's spring leaf, the
 * same seed for both, so the same money is the same tree); each woodpile; the fringe; the falling sprigs.
 */
import type { FundId, WoodFrame, WoodSceneAPI, WoodScreenPoint } from '../types';
import { FUNDS } from '../types';
import { ensurePaperTile, bucketFor, type Sprites } from '../../scene/sprites';
import { TreePainter } from '../../scene/treePainter';
import { getModel } from '../../scene/treeView';
import { H as TREE_H } from '../../scene/treeModel';
import { makeCanvas, rgba } from '../../scene/watercolor';
import { springSprites } from '../../brick/scene/springArt';
import { PAPER } from '../../brick/scene/housePaint';
import { buildBackdrop, buildFringe } from './backdrop';
import { PILES, TREE_K, TREE_SEED, TREES, VIEW } from './geom';
import { fitCamera, type Camera, type Insets } from './layout';
import { Twigs } from './twigs';
import { Woodpile } from './woodpile';

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/** the ghost is repainted when its size moves this much (about 1% of its height; never visible as a step) */
const GHOST_STEP = 0.0025;
/** tree units either side of the trunk a crown can reach, and above the top */
const HALF = 300;
const PAD_TOP = 70;

export function createWoodScene(canvas: HTMLCanvasElement): WoodSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let size = { w: 0, h: 0, ratio: 1 };
  let cam: Camera | null = null;
  let back: HTMLCanvasElement | null = null;
  let fringe: HTMLCanvasElement | null = null;
  let piles: Record<FundId, Woodpile> | null = null;
  let sprites: Sprites | null = null;
  let ghost: { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; m: number; px: number } | null = null;
  const painters: Record<FundId, TreePainter> = { a: new TreePainter(getModel(TREE_SEED)), b: new TreePainter(getModel(TREE_SEED)) };
  const ghostPainter = new TreePainter(getModel(TREE_SEED));
  const twigs: Record<FundId, Twigs> = { a: new Twigs(311), b: new Twigs(313) };
  let last: WoodFrame | null = null;
  let lastMs = -1;
  let destroyed = false;
  let gen = 0;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let readyDone = false;

  const layout = () => {
    if (size.w <= 0 || size.h <= 0) return;
    const c = fitCamera(size.w, size.h, size.ratio, insets);
    const my = ++gen;
    const alive = () => !destroyed && my === gen;
    void (async () => {
      const tile = await ensurePaperTile();
      if (!alive()) return;
      const bd = await buildBackdrop(c, tile, alive);
      if (!bd || !alive()) return;
      const fr = buildFringe(c);
      const pq = Math.min(3, c.s * c.dpr * 1.6);
      const pl = { a: new Woodpile('a', pq), b: new Woodpile('b', pq) };
      await tick();
      if (!alive()) return;
      // the clumps are painted at about the density they are drawn at
      const px = c.s * c.dpr * TREE_K;
      const sd = bucketFor(px);
      const sp0 = await springSprites('leaf', sd, tick, alive);
      if (!alive()) return;
      // a beech in new leaf: Brick's creamy accent clumps (a hint of blossom there) read as white patches here, so
      // the accents are sunlit leaf instead
      const sp: Sprites = { ...sp0, kinds: { ...sp0.kinds, coral: sp0.kinds.lit } };
      cam = c;
      canvas.width = Math.round(c.cssW * c.dpr);
      canvas.height = Math.round(c.cssH * c.dpr);
      canvas.style.width = `${c.cssW}px`;
      canvas.style.height = `${c.cssH}px`;
      back = bd;
      fringe = fr;
      piles = pl;
      sprites = sp;
      // the ghost's own canvas: big enough for the full no-fee tree at this scale
      const gw = Math.ceil(2 * HALF * TREE_K * c.s * c.dpr);
      const gh = Math.ceil((TREE_H + PAD_TOP) * TREE_K * c.s * c.dpr);
      const gcv = makeCanvas(gw, gh);
      ghost = { cv: gcv, ctx: gcv.getContext('2d')!, m: -1, px: c.s * c.dpr * TREE_K };
      if (!readyDone) {
        readyDone = true;
        resolveReady();
      }
      if (last) api.render(last);
    })().catch((e) => console.error('wood scene build failed', e));
  };

  /** paint the no-fee tree, pale, into its canvas (only when its size has moved) */
  const paintGhost = (m: number, months: number) => {
    if (!ghost || !sprites || !cam) return;
    if (Math.abs(m - ghost.m) < GHOST_STEP && ghost.m >= 0) return;
    ghost.m = m;
    const g = ghost.ctx;
    const { cv } = ghost;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const s = ghost.px / cam.dpr;
    g.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    g.save();
    g.beginPath();
    g.rect(0, 0, cv.width, cv.height / cam.dpr - 4 + 1.6 * s);
    g.clip();
    ghostPainter.paint(g, { ox: cv.width / 2 / cam.dpr, oy: cv.height / cam.dpr - 4, s, dpr: cam.dpr }, { maturity: m, months, timeMs: 0, wind: false, pulse: -1, bills: 0, noBills: true }, sprites);
    g.restore();
    // wash it back toward the paper: a pale, cool memory of the tree it would have been
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(PAPER, 0.62);
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(140,150,190,0.16)';
    g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'source-over';
  };

  const toScreen = (x: number, y: number): WoodScreenPoint => {
    const c = cam ?? fitCamera(Math.max(1, size.w), Math.max(1, size.h), 1, insets);
    return { x: c.ox + x * c.s, y: c.oy + y * c.s };
  };

  const api: WoodSceneAPI = {
    get ready() {
      return ready;
    },
    resize(w, h, ratio) {
      size = { w, h, ratio };
      layout();
    },
    setInsets(i) {
      insets = { top: Math.max(0, i.top), bottom: Math.max(0, i.bottom), side: Math.max(0, i.side ?? 0) };
      layout();
    },
    render(frame) {
      last = frame;
      if (destroyed || !cam || !back || !fringe || !piles || !sprites || !ghost) return;
      const c = cam;
      const dt = lastMs < 0 ? 0 : Math.min(0.1, Math.max(0, (frame.timeMs - lastMs) / 1000));
      lastMs = frame.timeMs;
      const playing = frame.monthsPerSecond > 0 && !frame.reducedMotion;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(back, 0, 0);

      // the ghost: one painting (both funds hold the same savings, so the no-fee tree is the same), behind each tree
      paintGhost(frame.trees[0].ghost, frame.months);
      const gs = ghost.cv.width / c.dpr;
      const ghs = ghost.cv.height / c.dpr;
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      for (const id of FUNDS) {
        const p = toScreen(TREES[id].x, TREES[id].y);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(ghost.cv, p.x - gs / 2, p.y - ghs + 4, gs, ghs);
      }
      ctx.globalAlpha = 1;

      // the trees, live
      for (const tv of frame.trees) {
        const p = toScreen(TREES[tv.id].x, TREES[tv.id].y);
        // the painter draws a cut-away of the roots under the ground: here the grass hides them
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x - c.cssW, 0, c.cssW * 2, p.y + 1.6 * c.s * TREE_K);
        ctx.clip();
        painters[tv.id].paint(
          ctx,
          { ox: p.x, oy: p.y, s: c.s * TREE_K, dpr: c.dpr },
          { maturity: Math.max(0.02, tv.maturity), months: frame.months, timeMs: frame.timeMs, wind: !frame.reducedMotion, pulse: -1, bills: 0, noBills: true },
          sprites,
        );
        ctx.restore();
      }

      // the woodpiles, then the fringe of bluebells over their feet and the trees' feet
      ctx.setTransform(c.dpr * c.s, 0, 0, c.dpr * c.s, c.dpr * c.ox, c.dpr * c.oy);
      for (const tv of frame.trees) piles[tv.id].draw(ctx, tv.logs);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(fringe, 0, 0);

      // the sprigs taken off the top while it plays
      ctx.setTransform(c.dpr * c.s, 0, 0, c.dpr * c.s, c.dpr * c.ox, c.dpr * c.oy);
      for (const tv of frame.trees) {
        const T = TREES[tv.id];
        const m = Math.max(0.02, tv.maturity);
        const top = T.y - TREE_H * TREE_K * m * 0.9;
        const half = 0.95 * 200 * TREE_K * m * 0.55;
        const rate = playing ? tv.trim * frame.monthsPerSecond * 0.45 : 0;
        if (frame.reducedMotion) twigs[tv.id].clear();
        else twigs[tv.id].update(dt, rate, T.x, top, half, Math.min(T.y + 10, PILES[tv.id].y));
        twigs[tv.id].draw(ctx);
      }
      ctx.globalAlpha = 1;
    },
    labelAnchor(id) {
      const c = cam ?? fitCamera(Math.max(1, size.w), Math.max(1, size.h), 1, insets);
      return { x: c.ox + TREES[id].x * c.s, y: c.oy + VIEW.y1 * c.s + 6 };
    },
    destroy() {
      destroyed = true;
    },
  };
  return api;
}
