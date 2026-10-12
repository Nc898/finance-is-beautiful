/**
 * "Against the Current" river scene (Canvas 2D). Implements RiverSceneAPI from ../types.
 *
 * Pre-rendered once per size: paper + sky, the world layer (hills, far bank, layered water, near bank, stones),
 * the dock, far trees, reed clumps, mileposts, the water-motion sprite pool and the boat/rower sprite sets.
 * Per frame: the world layer, swaying trees and reeds, the flowing water layer, then for each boat (far lane
 * first) its reflection, wake, body and oars and ripple rings, and finally the foreground reeds, posts and a
 * rare bird. All decorative motion is wall-clock; positions come only from the frame.
 */
import type { BoatId, RiverFrame, RiverSceneAPI, RiverScreenPoint } from '../types';
import { ensurePaperTile } from '../../scene/sprites';
import { clamp } from '../../scene/prng';
import { BOAT_SCALE, LANE_Y, MOOR_UP, MOOR_X, PLAQUE, POST_H, WORLD, mooringY, farEdge, fitCamera, nearEdge, postFootY, uOfX, xOfU, zoomTransform, type Camera, type Insets } from './geom';
import { buildStatic, visibleX, waterPolyPath, type StaticLayers } from './world';
import { buildFarTrees, type TreeSprite } from './farTrees';
import { Boats } from './boats';
import { FLOW_K, WaterLayer } from './water';
import { Bird, makeMilepost, makeMooringPost, makeReedClump, reedSpecs, type Sprite } from './props';

/** Extra (non-contract) methods the app can use. */
export interface RiverSceneExtras {
  /** where mileposts stand (u values); defaults to every 0.5 */
  setPosts(us: number[]): void;
  /** the plaque on each milepost, in CSS px (unzoomed): the app letters the value inside it */
  postPlaque(): { w: number; h: number };
  /** the last frame's camera move as screen' = a * screen + (bx, by) (identity when not zoomed) */
  cameraTransform(): { a: number; bx: number; by: number };
}

interface Reed {
  x: number;
  y: number;
  k: number;
  ph: number;
  spr: Sprite;
}

export function createRiverScene(canvas: HTMLCanvasElement): RiverSceneAPI & RiverSceneExtras {
  const ctx = canvas.getContext('2d')!;
  let cam: Camera | null = null;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let size = { w: 0, h: 0, ratio: 1 };
  let layers: StaticLayers | null = null;
  let trees: TreeSprite[] = [];
  let nearReeds: Reed[] = [];
  let farReeds: Reed[] = [];
  let posts: Sprite[] = [];
  let moorPost: Sprite | null = null;
  let water: WaterLayer | null = null;
  let boats: Boats | null = null;
  let waterClip: Path2D | null = null;
  let maxQ = 4;
  const bird = new Bird();
  let gen = 0;
  let destroyed = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let readyDone = false;
  let last: RiverFrame | null = null;
  let lastZ = { a: 1, bx: 0, by: 0 };
  let postUs: number[] = [-1, -0.5, 0, 0.5, 1];

  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  const layout = () => {
    if (size.w <= 0 || size.h <= 0) return;
    const c = fitCamera(size.w, size.h, size.ratio, insets);
    const my = ++gen;
    void (async () => {
      const tile = await ensurePaperTile();
      const vis = visibleX(c);
      const gd = c.dpr * 1.5;
      const tr = await buildFarTrees(c.s * gd, vis.xmin, vis.xmax);
      if (destroyed || my !== gen) return;
      const L = await buildStatic(c, insets, tile, tr, () => destroyed || my !== gen);
      if (!L || destroyed || my !== gen) return;
      await tick();
      // reeds, posts, water sprites
      const q = c.s * c.dpr * 2;
      const rs = reedSpecs(vis.xmin, vis.xmax);
      const kinds = [0, 1, 2, 3].map((i) => makeReedClump(70 + i * 13, q, 40 + i * 5, i % 2 === 0));
      const nr: Reed[] = rs.near.map((r) => ({ x: r.x, y: r.y, k: r.k, ph: r.ph, spr: kinds[r.v]! }));
      const fr: Reed[] = rs.far.map((r) => ({ x: r.x, y: r.y, k: r.k, ph: r.ph, spr: kinds[r.v]! }));
      const ps = [0, 1, 2].map((i) => makeMilepost(900 + i * 31, q));
      const mp = makeMooringPost(611, q, MOOR_UP);
      const wl = new WaterLayer(c.s * gd, vis.xmin, vis.xmax);
      await tick();
      if (destroyed || my !== gen) return;
      const sprQ = Math.min(c.s * c.dpr * BOAT_SCALE * 2.2, 5.5);
      maxQ = Math.min(c.s * c.dpr * 3.5 * BOAT_SCALE, 7);
      const bt = new Boats(sprQ, maxQ);
      await tick();
      if (destroyed || my !== gen) return;
      // swap everything in together: the previous size keeps rendering until the new caches are complete
      cam = c;
      canvas.width = Math.round(c.cssW * c.dpr);
      canvas.height = Math.round(c.cssH * c.dpr);
      canvas.style.width = `${c.cssW}px`;
      canvas.style.height = `${c.cssH}px`;
      layers = L;
      trees = tr;
      nearReeds = nr;
      farReeds = fr;
      posts = ps;
      moorPost = mp;
      water = wl;
      boats = bt;
      waterClip = waterPolyPath(vis.xmin, vis.xmax);
      if (!readyDone) {
        readyDone = true;
        resolveReady();
      }
      if (last) api.render(last);
    })();
  };

  const drawReed = (r: Reed, t: number, reduced: boolean) => {
    const sway = reduced ? 0.03 : 0.045 * Math.sin(t * 0.9 + r.ph) + 0.02 * Math.sin(t * 2.3 + r.ph * 1.7) + 0.035;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.transform(1, 0, -sway, 1, 0, 0);
    const w = r.spr.w * r.k;
    const h = r.spr.h * r.k;
    ctx.drawImage(r.spr.cv, -r.spr.px * r.k, -r.spr.py * r.k, w, h);
    ctx.restore();
  };

  const api: RiverSceneAPI & RiverSceneExtras = {
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
      if (destroyed || !cam || !layers || !boats || !water || !waterClip) return;
      const c = cam;
      const L = layers;
      const z = zoomTransform(c, insets, frame.camera?.zoom ?? 1, frame.camera?.focusU ?? 0);
      lastZ = z;
      const reduced = frame.reducedMotion;
      const t = frame.timeMs / 1000;
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, c.cssW, c.cssH);
      ctx.drawImage(L.paper, 0, 0, c.cssW, c.cssH);
      // a rare bird crossing the sky (screen space: the sky does not zoom)
      if (!reduced) bird.draw(ctx, t, c.cssW, c.oy + 78 * c.s, c.s);
      // the world, zoomed with the camera
      ctx.setTransform(c.dpr * z.a, 0, 0, c.dpr * z.a, c.dpr * z.bx, c.dpr * z.by);
      ctx.drawImage(L.world, 0, 0, c.cssW, c.cssH);
      // world units from here on
      const A = c.dpr * z.a * c.s;
      ctx.setTransform(A, 0, 0, A, c.dpr * (z.a * c.ox + z.bx), c.dpr * (z.a * c.oy + z.by));
      ctx.imageSmoothingQuality = 'low';
      // far trees (swaying a hair) and far reeds
      ctx.globalAlpha = 0.86;
      for (const tr of trees) {
        const sw = reduced ? 0.004 : 0.012 * Math.sin(t * 0.8 + tr.phase) + 0.006 * Math.sin(t * 2.1 + tr.phase * 2) + 0.006;
        ctx.save();
        ctx.translate(tr.x, tr.y);
        ctx.transform(1, 0, -sw, 1, 0, 0);
        ctx.drawImage(tr.cv, -tr.ox, -tr.oy, tr.w, tr.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      for (const r of farReeds) drawReed(r, t, reduced);
      // the water's motion
      const flowSpeed = frame.flowing ? FLOW_K * frame.current : 0;
      water.step(frame.timeMs, flowSpeed, reduced);
      ctx.save();
      ctx.clip(waterClip);
      water.draw(ctx, frame.timeMs, reduced, frame.flowing);
      water.drawGlints(ctx, frame.timeMs, reduced);
      ctx.restore();
      // boats, far lane first
      const lane = (id: BoatId) => {
        const x = xOfU(frame.boats.find((b) => b.id === id)?.u ?? 0);
        const f = (LANE_Y[id] - farEdge(x)) / (nearEdge(x) - farEdge(x));
        return flowSpeed * (0.72 + 0.55 * f);
      };
      const qb = Math.min(c.s * c.dpr * BOAT_SCALE * clamp(z.a, 1, 3.5), maxQ);
      // mooring posts for the two outer boats stand just behind their lanes (boats pass in front of them)
      for (const id of ['invest', 'savings'] as const) {
        const sp = moorPost!;
        ctx.drawImage(sp.cv, MOOR_X - sp.px, mooringY(id) - sp.py, sp.w, sp.h);
      }
      boats.draw(ctx, frame.boats, { timeMs: frame.timeMs, flowing: frame.flowing, reduced, flow: flowSpeed, qb, waterClip, flowLane: lane });
      // the short jetty is nearer to us than every lane: a boat drifting past goes behind it
      ctx.drawImage(L.dock.cv, L.dock.x, L.dock.y, L.dock.w, L.dock.h);
      // foreground: near-bank reeds and the mileposts
      for (const r of nearReeds) drawReed(r, t, reduced);
      for (let i = 0; i < postUs.length; i++) {
        const x = xOfU(postUs[i]!);
        const sp = posts[i % posts.length]!;
        const y = postFootY(x);
        ctx.drawImage(sp.cv, x - sp.px, y - sp.py, sp.w, sp.h);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    boatAnchor(id: BoatId): RiverScreenPoint {
      const c = cam ?? fitCamera(WORLD.width, WORLD.height, 1, insets);
      const b = last?.boats.find((q) => q.id === id);
      const a = boats?.anchor(id);
      const wx = a && a.x ? a.x : xOfU(b ? b.u : 0);
      const wy = a && a.y ? a.y : LANE_Y[id] - 62;
      const x = c.ox + wx * c.s;
      const y = c.oy + wy * c.s;
      return { x: lastZ.a * x + lastZ.bx, y: lastZ.a * y + lastZ.by };
    },
    postAnchor(u: number): RiverScreenPoint {
      const c = cam ?? fitCamera(WORLD.width, WORLD.height, 1, insets);
      const x = xOfU(u);
      return { x: c.ox + x * c.s, y: c.oy + (postFootY(x) - POST_H) * c.s };
    },
    visibleU() {
      const c = cam ?? fitCamera(WORLD.width, WORLD.height, 1, insets);
      const v = visibleX(c, 0);
      return { min: uOfX(v.xmax), max: uOfX(v.xmin) };
    },
    setPosts(us: number[]) {
      postUs = us.slice();
    },
    cameraTransform() {
      return lastZ;
    },
    postPlaque() {
      const c = cam ?? fitCamera(WORLD.width, WORLD.height, 1, insets);
      return { w: PLAQUE.w * c.s, h: PLAQUE.h * c.s };
    },
    destroy() {
      destroyed = true;
    },
  };
  return api;
}
