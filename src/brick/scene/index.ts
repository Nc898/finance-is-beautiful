/**
 * "Brick by Brick" scene (Canvas 2D). Implements BrickSceneAPI from ../types.
 *
 * Painted once per size: the paper and spring sky (the houses reserved as paper), the world layer (hills, village,
 * fields, hedge, plots, road, lane, verges), each house three ways (pencil, wall, finished; housePaint.ts), the
 * blossom tree, the scaffolds and the props. Per frame: the paper and the world, then everything standing on the
 * ground in depth order (far to near): the carts on the road, the houses, the blossom tree, each scaffold's back,
 * its bricklayer, its front, the builders and their barrows, the pallets and benches, the fence and the gates, the
 * carts in the lane; then the drifting petals over all.
 */
import type { BrickFrame, BrickSceneAPI, BrickScreenPoint, LoanId } from '../types';
import { LOANS } from '../types';
import { ensurePaperTile } from '../../scene/sprites';
import { BLOSSOM } from './geom';
import { fitCamera, plotX, type Camera, type Insets } from './layout';
import { HouseView } from './houseView';
import { paintPaperAndSky } from './sky';
import { buildWorld, type WorldLayer } from './world';
import { renderSpringTree, laySpringTree, type SpringTree } from './springArt';
import { ScaffoldView, drawWorkingStock } from './scaffold';
import { blit, drawTally, makeBench, makeFence, makePallet, makeSand, makeSlate, type Sprite } from './props';
import { BENCH, FENCE_Y, GROUND_Y, STACK, TALLY } from './geom';
import { viewX } from './layout';
import { CartQueue, Road } from './carts';
import { Petals, drawSmoke, drawSprig, drawTulips } from './finish';
import { createBuilder } from './builder';
import { createBricklayer } from './bricklayer';
import type { Bricklayer, BricklayerIntent, Builder, BuilderIntent } from './crewApi';
import { SCAFFOLD } from './geom';

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/** something drawn in depth order: its depth (the ground y it stands on) and how to draw it */
interface Item {
  depth: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

/** the crew work briskly: their clock runs this much faster than the wall clock (times the playback speed) */
const CREW_TIME = 1.4;

/** how long the scaffold takes to strike once a house is paid off (seconds, while playing) */
const STRIKE_S = 3.2;

interface HouseProps {
  scaffold: ScaffoldView;
  pallet: Sprite;
  bench: Sprite;
  sand: Sprite;
  slate: Sprite;
}

const TREE: SpringTree = { seed: 4471, x: BLOSSOM.x, y: BLOSSOM.y, k: 0.36, m: 1, kit: 'blossom', haze: 0 };

export function createBrickScene(canvas: HTMLCanvasElement): BrickSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let size = { w: 0, h: 0, ratio: 1 };
  let cam: Camera | null = null;
  let paper: HTMLCanvasElement | null = null;
  let world: WorldLayer | null = null;
  let houses: Record<LoanId, HouseView> | null = null;
  let tree: { cv: HTMLCanvasElement; fx: number; fy: number; A: number } | null = null;
  let props: Record<LoanId, HouseProps> | null = null;
  let fence: Sprite | null = null;
  /** each scaffold's strike, 0 standing … 1 struck */
  const strike: Record<LoanId, number> = { a: 0, b: 0 };
  let lastMs = -1;
  const petals = new Petals();
  let queues: Record<LoanId, CartQueue> | null = null;
  let builders: Record<LoanId, Builder> | null = null;
  let layers: Record<LoanId, Bricklayer> | null = null;
  const lastBuilt: Record<LoanId, number> = { a: -1, b: -1 };
  let last: BrickFrame | null = null;
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
      const pp = paintPaperAndSky(c, tile);
      await tick();
      if (!alive()) return;
      const W = await buildWorld(c, alive);
      if (!W || !alive()) return;
      const hq = Math.min(4, c.s * c.dpr * 2.2);
      const hv = { a: new HouseView('a', hq), b: new HouseView('b', hq) };
      await tick();
      if (!alive()) return;
      const A = Math.min(4, c.s * c.dpr * 1.6);
      const tr = await renderSpringTree(TREE, A, A > 1.6 ? 1.4 : 1, tick, alive);
      if (!tr || !alive()) return;
      const pq = Math.min(4, c.s * c.dpr * 2.4);
      const mk = (id: LoanId): HouseProps => ({
        scaffold: new ScaffoldView(id, Math.min(3.5, c.s * c.dpr * 2)),
        pallet: makePallet(id, pq),
        bench: makeBench(id, pq),
        sand: makeSand(id, pq),
        slate: makeSlate(id, pq),
      });
      const pr = { a: mk('a'), b: mk('b') };
      const vx = viewX(c, 30);
      const fn = makeFence(pq, vx.x0, vx.x1);
      await tick();
      if (!alive()) return;
      // keep what is laid across a resize: the new views start empty and are brought up to the last frame
      cam = c;
      canvas.width = Math.round(c.cssW * c.dpr);
      canvas.height = Math.round(c.cssH * c.dpr);
      canvas.style.width = `${c.cssW}px`;
      canvas.style.height = `${c.cssH}px`;
      paper = pp;
      world = W;
      houses = hv;
      tree = { ...tr, A };
      props = pr;
      if (!queues) {
        const road = new Road();
        const cq = Math.min(5, c.s * c.dpr * 3);
        queues = { a: new CartQueue('a', cq, road), b: new CartQueue('b', cq, road) };
      }
      if (import.meta.env.DEV) (window as unknown as { __brickScene: unknown }).__brickScene = { get builders() { return builders; }, get queues() { return queues; }, get layers() { return layers; } };
      layers ??= { a: createBricklayer('a', Math.min(5, c.s * c.dpr * 3)), b: createBricklayer('b', Math.min(5, c.s * c.dpr * 3)) };
      builders ??= { a: createBuilder('a', Math.min(5, c.s * c.dpr * 3)), b: createBuilder('b', Math.min(5, c.s * c.dpr * 3)) };
      fence = fn;
      if (!readyDone) {
        readyDone = true;
        resolveReady();
      }
      if (last) api.render(last);
    })().catch((e) => console.error('brick scene build failed', e));
  };

  const toScreen = (x: number, y: number): BrickScreenPoint => {
    const c = cam ?? fitCamera(Math.max(1, size.w), Math.max(1, size.h), 1, insets);
    return { x: c.ox + x * c.s, y: c.oy + y * c.s };
  };

  const api: BrickSceneAPI = {
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
      if (destroyed || !cam || !paper || !world || !houses || !tree || !props || !fence || !queues || !builders || !layers) return;
      const dt = lastMs < 0 ? 0 : Math.min(0.1, Math.max(0, (frame.timeMs - lastMs) / 1000));
      lastMs = frame.timeMs;
      const c = cam;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(paper, 0, 0);
      ctx.drawImage(world.cv, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(c.dpr * c.s, 0, 0, c.dpr * c.s, c.dpr * c.ox, c.dpr * c.oy);
      // (medium, not high: high quality filtering of the figures' downscaled parts costs the GPU dearly)
      ctx.imageSmoothingQuality = 'medium';

      const items: Item[] = [];
      const playing = frame.monthsPerSecond > 0 && !frame.reducedMotion;
      for (const hv of frame.houses) {
        const id = hv.id;
        const v = houses[id];
        const P = props[id];
        v.set(hv.built);
        // the scaffold comes down once the house is paid off: over a few seconds while playing, at once otherwise
        // (not before the bricklayer is down on the ground)
        const down = layers[id].feet().h < 0.5;
        if (!hv.paidOff) strike[id] = 0;
        else strike[id] = playing ? (down ? Math.min(1, strike[id] + dt / STRIKE_S) : strike[id]) : 1;
        const st = strike[id];
        const lift = ScaffoldView.liftFor(v.next().h);
        const tSec = frame.timeMs / 1000;
        items.push({
          depth: GROUND_Y,
          draw: (g) => {
            v.draw(g);
            if (hv.paidOff) {
              drawTulips(g, id);
              drawSprig(g, v, frame.reducedMotion ? 0 : tSec);
              drawSmoke(g, v, tSec, frame.reducedMotion);
            }
          },
        });
        items.push({
          depth: 471,
          draw: (g) => {
            P.scaffold.drawBack(g, st);
            if (st === 0 && hv.built < 1) drawWorkingStock(g, id, lift, id === 'a' ? 91 : 97);
          },
        });
        items.push({ depth: 478, draw: (g) => P.scaffold.drawFront(g, st) });
        if (st > 0) items.push({ depth: GROUND_Y + 30, draw: (g) => P.scaffold.drawStack(g, st) });
        items.push({ depth: 504, draw: (g) => blit(g, P.sand) });
        items.push({ depth: STACK[id].y, draw: (g) => blit(g, P.pallet) });
        items.push({ depth: BENCH[id].y, draw: (g) => blit(g, P.bench) });
        const full = Math.floor(hv.carts + 1e-9);
        const part = hv.paidOff && hv.carts - full > 0.02;
        items.push({
          depth: FENCE_Y + 0.5,
          draw: (g) => {
            blit(g, P.slate);
            drawTally(g, id, full, part);
          },
        });
        void TALLY;
        const Q = queues[id];
        Q.update(dt * (frame.speed ?? 1) * CREW_TIME, frame.timeMs / 1000, hv.carts, hv.paidOff, playing, frame.reducedMotion);
        for (const c of Q.all()) items.push({ depth: c.feet().y, draw: (g) => c.draw(g) });
        // the builder: at work while playing; set straight to the moment after a jump of the timeline
        const bl = builders[id];
        const filling = Q.filling();
        const intent: BuilderIntent = {
          activity: hv.paidOff ? 'rest' : playing ? 'haul' : 'idle',
          split: hv.split,
          pace: 1,
          cart: filling ? filling.tipPoint() : null,
          lift: SCAFFOLD.lifts[lift]!,
        };
        const jumped = Math.abs(hv.built - lastBuilt[id]) > 0.02 || (!playing && hv.built !== lastBuilt[id]);
        lastBuilt[id] = hv.built;
        const br = layers[id];
        const nx = v.next();
        const lint: BricklayerIntent = {
          activity: hv.paidOff ? 'rest' : 'lay',
          target: { x: nx.x, h: nx.h },
          pace: playing ? 1 : 0,
        };
        if (jumped || frame.reducedMotion) {
          bl.place(intent);
          br.place(lint);
        } else if (playing) {
          bl.update(dt * (frame.speed ?? 1) * CREW_TIME, intent, frame.timeMs / 1000, false);
          br.update(dt * (frame.speed ?? 1) * CREW_TIME, lint, frame.timeMs / 1000, false);
        }
        items.push({ depth: br.feet().y, draw: (g) => br.draw(g) });
        items.push({ depth: bl.feet().y, draw: (g) => bl.draw(g) });
      }
      const fn = fence;
      items.push({ depth: FENCE_Y, draw: (g) => blit(g, fn) });
      const t = tree;
      items.push({ depth: TREE.y, draw: (g) => laySpringTree(g, TREE, t, t.A) });
      items.sort((p, q) => p.depth - q.depth);
      for (const it of items) it.draw(ctx);
      // the petals drift over everything (the spring air keeps moving while paused, but not in reduced motion)
      petals.update(dt, frame.timeMs / 1000, !frame.reducedMotion);
      if (!frame.reducedMotion) petals.draw(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    labelAnchor(id: LoanId) {
      const c = cam;
      const p = toScreen(plotX(id), 0);
      const y = c ? c.cssH - insets.bottom + 6 : p.y;
      return { x: p.x, y };
    },
    destroy() {
      destroyed = true;
    },
  };
  void LOANS;
  return api;
}
