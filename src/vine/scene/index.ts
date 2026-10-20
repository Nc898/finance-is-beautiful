/**
 * "Nip It in the Bud" scene (Canvas 2D). Implements VineSceneAPI from ../types.
 *
 * Painted once per size: the paper and clear autumn sky with the sun, the world layer (hills, woods, fields,
 * lawn, paths, fence, the big trees), the two cottages, the vine's leaf sprites, the small loose leaves, and the
 * props. Per frame: the geese, the world, the cottages and their chimney smoke, the two vines, the clippings
 * falling from the shears and lying at the wall foot, then (sorted by depth) the piles, benches, props and the
 * gardeners; leaves fall from the trees' painted foliage (behind the cottages for the side-yard trees).
 *
 * How the vine and the gardener work together (the scene decides WHAT, the gardener decides HOW):
 * - Every month the vine grows back by the month's interest: new shoots unfurl at its tips.
 * - The drawn vine must follow the frame's `vine` (balance / starting balance). When there is more on the wall
 *   than that, the scene points its gardener at the outermost growth within reach, and asks for a pace that
 *   keeps up. The vine only ever shrinks at a snip: each time the gardener's `snips` counter goes up, the
 *   branch nearest the shears is cut (sized so the vine stays within a few percent of its target) and its
 *   leaves and stem bits tumble from there to the wall foot.
 * - Once the wall is clear the gardener rakes the clippings toward the pile, then rests on the bench.
 * - The pile's volume follows `pile` (interest paid / starting balance) on one scale for both gardens.
 * - A jump of the timeline (scrubbing, a new input, replay) sets the vine directly, with no gardener.
 */
import type { PlanId, VineFrame, VineSceneAPI, VineScreenPoint } from '../types';
import { PLANS } from '../types';
import { ensurePaperTile } from '../../scene/sprites';
import { makeCanvas } from '../../scene/watercolor';
import { BENCH, COTTAGE, PILE, REACH_TOP, fitCamera, zoomTransform, type Camera, type Insets, type ZoomXf } from './geom';
import { drawGeese, paintPaperAndSky } from './sky';
import { buildWorld, type WorldLayer } from './landscape';
import { buildCottage, type CottageInfo } from './cottage';
import { VineState, vineModel } from './vineModel';
import { VineView, buildLeafSprites, toWorldX, toWorldY, wallXf, type LeafSprites, type WallXf } from './vineArt';
import { buildLeafSet, type LeafSet } from './leaves';
import { PileView } from './pile';
import { makeBench, makeGardenWall, makeHayBale, makePumpkins, makeWheelbarrow } from './props';
import { FENCE, WALL_STUB } from './layout';
import { buildFenceSprite } from './groundFence';
import { wind, type Sprite } from './art';
import { Clippings, Drifting } from './fall';
import { createGardener, SEAT_TOP } from './gardener';
import type { Gardener, GardenerIntent } from './gardenerApi';

/** how close (world units) to the shears a branch must be to be the one a snip cuts */
const SNIP_RADIUS = 30;
/** a snip only takes a branch that lies wholly within arm's reach of the shears (world units, each way) */
const ARM_BOX = { x: 80, up: 160, down: 160 };

interface Garden {
  id: PlanId;
  st: VineState;
  view: VineView;
  tf: WallXf;
  clip: Clippings;
  pile: PileView | null;
  g: Gardener | null;
  /** the node the gardener is aiming at (null: choose one) */
  aim: number | null;
  lastSnips: number;
  lastStrokes: number;
  raking: boolean;
  /** the vine target last frame (to recognise jumps) */
  lastTarget: number;
  /** seconds left of "the timeline is being scrubbed": the scene shows the moment directly */
  scrub: number;
  /** where the rake's tines land for the next pull, and the tines last frame */
  rakeAt: { x: number; y: number } | null;
  lastHead: { x: number; y: number } | null;
  /** pieces the tines have carried in the pull under way (a heap to follow up with the next pull) */
  carried: number;
  /** the month raking began: the clippings stop rotting while they are being raked */
  rakeMonth: number;
}

interface Placed {
  spr: Sprite;
  x: number;
  y: number;
  /** depth for sorting when it differs from the placement y (a sprite placed at the world origin) */
  depth?: number;
}

export function createVineScene(canvas: HTMLCanvasElement): VineSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let size = { w: 0, h: 0, ratio: 1 };
  let cam: Camera | null = null;
  let paper: HTMLCanvasElement | null = null;
  let world: WorldLayer | null = null;
  let cottages: Record<PlanId, CottageInfo> | null = null;
  let leafSpr: LeafSprites | null = null;
  let loose: LeafSet | null = null;
  let props: Placed[] = [];
  let drift: Drifting | null = null;
  let puff: HTMLCanvasElement | null = null;
  const model = vineModel();
  // each branch's extent as it is on the wall now (its node and whatever still grows beyond it), local
  // coordinates: a cut takes all of it. Refreshed whenever the vine has changed.
  const nN = model.nodes.length;
  const ext = { u0: new Float32Array(nN), u1: new Float32Array(nN), v0: new Float32Array(nN), v1: new Float32Array(nN) };
  const refreshExtent = (st: VineState) => {
    for (let i = nN - 1; i >= 0; i--) {
      const nd = model.nodes[i]!;
      const g = Math.min(1, st.g[i]!);
      const tu = nd.sx + (nd.ex - nd.sx) * g;
      const tv = nd.sy + (nd.ey - nd.sy) * g;
      let u0 = Math.min(nd.sx, tu);
      let u1 = Math.max(nd.sx, tu);
      let v0 = Math.min(nd.sy, tv);
      let v1 = Math.max(nd.sy, tv);
      for (const c of nd.children) {
        if (st.g[c]! <= 0) continue;
        u0 = Math.min(u0, ext.u0[c]!);
        u1 = Math.max(u1, ext.u1[c]!);
        v0 = Math.min(v0, ext.v0[c]!);
        v1 = Math.max(v1, ext.v1[c]!);
      }
      ext.u0[i] = u0;
      ext.u1[i] = u1;
      ext.v0[i] = v0;
      ext.v1[i] = v1;
    }
  };
  /** the branch at node i lies within arm's reach of the shears (so cutting it never drops vine elsewhere) */
  const withinArm = (gd: Garden, i: number, sh: { x: number; y: number }): boolean => {
    const xa = toWorldX(gd.tf, ext.u0[i]!);
    const xb = toWorldX(gd.tf, ext.u1[i]!);
    const yTop = toWorldY(gd.tf, ext.v1[i]!);
    const yBot = toWorldY(gd.tf, ext.v0[i]!);
    return Math.min(xa, xb) >= sh.x - ARM_BOX.x && Math.max(xa, xb) <= sh.x + ARM_BOX.x && yTop >= sh.y - ARM_BOX.up && yBot <= sh.y + ARM_BOX.down;
  };
  const gardens: Record<PlanId, Garden> = {
    minimum: newGarden('minimum'),
    fixed: newGarden('fixed'),
  };
  let lastZ: ZoomXf = { a: 1, bx: 0, by: 0 };
  let lastT = -1;
  /** the story clock in months, accumulated from the frames' rate (it only drives the rotting of clippings) */
  let monthClock = 0;
  let gen = 0;
  let destroyed = false;
  let last: VineFrame | null = null;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let readyDone = false;

  function newGarden(id: PlanId): Garden {
    return {
      id,
      st: new VineState(model),
      view: new VineView(model),
      tf: wallXf(id),
      clip: new Clippings(id, id === 'minimum' ? 811 : 823),
      pile: null,
      g: null,
      aim: null,
      lastSnips: 0,
      lastStrokes: 0,
      raking: false,
      lastTarget: 1,
      scrub: 0,
      rakeAt: null,
      lastHead: null,
      carried: 0,
      rakeMonth: 0,
    };
  }

  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  const layout = () => {
    if (size.w <= 0 || size.h <= 0) return;
    const c = fitCamera(size.w, size.h, size.ratio, insets);
    const my = ++gen;
    const alive = () => !destroyed && my === gen;
    void (async () => {
      const tile = await ensurePaperTile();
      if (!alive()) return;
      const pp = paintPaperAndSky(c, tile);
      const W = await buildWorld(c, tile, alive);
      if (!W || !alive()) return;
      const q = Math.min(4.8, c.s * c.dpr * 2.4);
      const cot = { minimum: buildCottage('minimum', q), fixed: buildCottage('fixed', q) };
      await tick();
      if (!alive()) return;
      const ls = await buildLeafSprites(Math.min(6, c.s * c.dpr * 2.6), alive);
      if (!ls || !alive()) return;
      const lq = Math.min(6, c.s * c.dpr * 2.6);
      const lo = await buildLeafSet(lq, alive);
      if (!lo || !alive()) return;
      const pq = Math.min(4, c.s * c.dpr * 2);
      const placed: Placed[] = [
        { spr: makeBench(301, pq, SEAT_TOP), x: BENCH.minimum.x, y: BENCH.minimum.y },
        { spr: makeBench(307, pq, SEAT_TOP), x: BENCH.fixed.x, y: BENCH.fixed.y },
        { spr: makeWheelbarrow(311, pq), x: 214, y: 632 },
        {
          spr: makePumpkins(313, pq, [
            { dx: 0, dy: 0, r: 9, col: '#E0782E' },
            { dx: 14, dy: 3, r: 6.5, col: '#EAA036', kind: 'flat' },
            { dx: -11, dy: 4, r: 5.5, col: '#C9662A', kind: 'squash' },
          ]),
          x: 760,
          y: 492,
        },
        { spr: makeHayBale(317, pq), x: 790, y: 628 },
        {
          spr: makePumpkins(331, pq, [
            { dx: 0, dy: 0, r: 7.5, col: '#E58A34' },
            { dx: 10, dy: 2, r: 5, col: '#D46C2C', kind: 'flat' },
          ]),
          x: 842,
          y: 640,
        },
        // the picket fence stands in front of the cottage corners, so it is drawn with the lawn's standing things
        { spr: buildFenceSprite(pq), x: 0, y: 0, depth: FENCE.y },
        { spr: makeGardenWall('minimum', pq), x: WALL_STUB.minimum.x0, y: WALL_STUB.minimum.yBase },
        { spr: makeGardenWall('fixed', pq), x: WALL_STUB.fixed.x0, y: WALL_STUB.fixed.yBase },
      ];
      await tick();
      if (!alive()) return;
      // the gardeners and their state persist across sizes, so a resize never resets anyone mid-stride
      for (const id of PLANS) {
        const gd = gardens[id];
        if (!gd.g) gd.g = createGardener(id, Math.min(6, c.s * c.dpr * 3));
        if (!gd.pile) gd.pile = new PileView(id, lq);
        gd.pile.setSprites(lo, lq);
      }
      // leaves fall from the painted foliage of the trees as they are at this size
      const dr = new Drifting(W.foliage, lo, 18);
      // swap everything in together: the previous size keeps rendering until the new caches are complete
      cam = c;
      canvas.width = Math.round(c.cssW * c.dpr);
      canvas.height = Math.round(c.cssH * c.dpr);
      canvas.style.width = `${c.cssW}px`;
      canvas.style.height = `${c.cssH}px`;
      paper = pp;
      world = W;
      cottages = cot;
      leafSpr = ls;
      loose = lo;
      props = placed;
      drift = dr;
      puff ??= makePuff();
      if (!readyDone) {
        readyDone = true;
        resolveReady();
      }
      if (last) api.render(last);
    })().catch((e) => console.error('vine scene build failed', e));
  };

  /* ---------------------------------------------------------------- the vine and its gardener */

  /** set the vine straight to a target (a jump of the timeline, or reduced motion): no gardener involved */
  const setDirect = (gd: Garden, target: number, dt: number, instant: boolean) => {
    const cur = gd.st.mass();
    const diff = target - cur;
    if (Math.abs(diff) < 1e-4) return;
    // a jump still eases over a fraction of a second, so the wall never flickers
    const step = instant ? Math.abs(diff) : Math.max(Math.abs(diff) * Math.min(1, dt * 6), 1.2 * dt);
    if (diff > 0) gd.st.grow(Math.min(diff, step), instant ? 1 : dt, instant ? 1e3 : 4);
    else gd.st.retract(Math.min(-diff, step), instant ? 1e3 : 6, instant ? 1 : dt);
  };

  /** world point of a candidate cut */
  const candWorld = (gd: Garden, u: number, v: number) => ({ x: toWorldX(gd.tf, u), y: toWorldY(gd.tf, v) });

  /**
   * choose the next growth to aim at: reachable and about the size of cut we need, and above all close to where
   * the gardener already stands, so they keep working in one spot instead of walking after every snip
   */
  const chooseAim = (gd: Garden, chunk: number, behind: boolean): number | null => {
    refreshExtent(gd.st);
    const feet = gd.g!.feet();
    const sh = gd.g!.shears();
    let best: number | null = null;
    let bs = Infinity;
    for (const c of gd.st.candidates()) {
      const w = candWorld(gd, c.u, c.v);
      if (w.y < REACH_TOP + 3) continue;
      const fit = Math.abs(Math.log(Math.max(c.mass, 1e-5) / chunk));
      const dx = Math.abs(w.x - feet.x);
      // within a side-step (about 28 units) the gardener keeps the shears up; further means arms down, a pivot,
      // a walk and a pivot back to the wall, so it is worth it only for growth that really needs cutting
      const move = dx > 28 ? (behind ? 50 : 70) : 0;
      // only growth that can be cut whole from where the shears will be
      if (!withinArm(gd, c.i, w)) continue;
      const ds = Math.hypot(w.x - sh.x, w.y - sh.y);
      // keeping up: the next stem is the one the hand reaches soonest (near the shears, without a walk);
      // behind: a branch big enough to make up the difference, even if it means a few steps to reach it
      const s = move + (behind ? fit * 12 + ds * 0.2 : ds * 0.45 + fit * 10) + (w.y < REACH_TOP + 30 ? 6 : 0);
      if (s < bs) {
        bs = s;
        best = c.i;
      }
    }
    return best;
  };

  /**
   * a snip: cut the branch nearest the shears (about `chunk` of the vine) and let it fall. When the gardener
   * is far behind, the same snip takes a cluster of neighbouring branches (up to twelve cuts, all within
   * reach of the shears), so the wall keeps pace with the balance without anything vanishing elsewhere.
   */
  const snip = (gd: Garden, chunk: number, target: number, finalCut: boolean) => {
    const sh = gd.g!.shears();
    if (finalCut) {
      dropPieces(gd, gd.st.cutNode(0, true).map((r) => r.i));
      gd.aim = null;
      return;
    }
    const before = gd.st.mass();
    for (let cuts = 0; cuts < 12; cuts++) {
      const now = gd.st.mass();
      const left = now - target;
      const taken = before - now;
      // one snip takes about `chunk`: keep cutting neighbouring branches until it has, or the wall is on target
      if (cuts > 0 && taken >= chunk * 0.7) break;
      if (left <= 0.0015) break;
      let pick: number | null = null;
      let bs = Infinity;
      const want = Math.max(0.004, Math.min(chunk - taken, left));
      refreshExtent(gd.st);
      for (const c of gd.st.candidates()) {
        const w = candWorld(gd, c.u, c.v);
        const d = Math.hypot(w.x - sh.x, w.y - sh.y);
        if (cuts === 0 && d > SNIP_RADIUS) continue;
        // never cut more than is due (the wall would drop below the balance and have to grow back)
        if (c.mass > left * 1.6 + 0.02) continue;
        if (!withinArm(gd, c.i, sh)) continue;
        const s = d * 0.06 + Math.abs(Math.log(Math.max(c.mass, 1e-5) / want));
        if (s < bs) {
          bs = s;
          pick = c.i;
        }
      }
      if (pick === null && cuts === 0) pick = gd.aim;
      if (pick === null) break;
      dropPieces(gd, gd.st.cutNode(pick).map((r) => r.i));
    }
    gd.aim = null;
  };

  /** the leaves and stem bits of removed nodes fall from where they hung */
  const dropPieces = (gd: Garden, nodes: number[]) => {
    if (!leafSpr) return;
    const view = gd.view;
    let leaves = 0;
    for (const i of nodes) leaves += model.nodes[i]!.leaves.length;
    // a big cut drops a representative handful, not every leaf (the rest is hidden in the tumble)
    const every = Math.max(1, Math.ceil(leaves / 5));
    let k = 0;
    let twigs = 0;
    for (const i of nodes) {
      const n = model.nodes[i]!;
      const x = toWorldX(gd.tf, view.tu[i]!);
      const y = toWorldY(gd.tf, view.tv[i]!);
      for (const li of n.leaves) {
        if (k++ % every !== 0) continue;
        const lf = model.leaves[li]!;
        const rot = Math.atan2(gd.tf.sign * lf.du, lf.dv);
        gd.clip.dropLeaf(leafSpr.leaf[lf.color]![lf.shape]!, x, y, rot, lf.size);
      }
      if (twigs < 4 && n.len > 6) {
        twigs++;
        const mx = toWorldX(gd.tf, (n.sx + n.ex) / 2);
        const my = toWorldY(gd.tf, (n.sy + n.ey) / 2);
        gd.clip.dropTwig(mx, my, Math.min(16, n.len * 0.8), Math.atan2(-(n.ey - n.sy), gd.tf.sign * (n.ex - n.sx)));
      }
    }
  };

  /** decide what the gardener does this frame, and advance the vine */
  /** a ready stance at the wall for this moment: the growth nearest the gardener, shears up, no cutting */
  const readyAt = (gd: Garden): GardenerIntent => {
    const a = chooseAim(gd, 0.02, false);
    if (a === null) return { activity: 'idle', target: null, pace: 0 };
    const n = model.nodes[a]!;
    return { activity: 'prune', target: candWorld(gd, n.sx + (n.ex - n.sx) * 0.35, n.sy + (n.ey - n.sy) * 0.35), pace: 0 };
  };

  /** the next place to rake from: just beyond the lying clipping farthest from the pile, so the pull gathers it */
  const nextRake = (gd: Garden): { x: number; y: number } | null => {
    const pile = PILE[gd.id];
    // what is left lies right by the pile: one last sweep and it all joins the heap
    gd.clip.gatherNear(pile, 60);
    // a pull that gathered a heap short of the pile is followed up: the next pull starts just behind that heap (a
    // step back, not a walk to the far end), so each heap travels to the pile stroke after stroke
    const end = gd.lastHead;
    const carried = gd.carried;
    gd.carried = 0;
    if (end && carried > 0) {
      const heap = gd.clip.heapNear(end, 26);
      if (heap.n > 0 && Math.hypot(heap.x - pile.x, heap.y - pile.y) > 30) {
        const hx = heap.x - pile.x;
        const hy = heap.y - pile.y;
        const hd = Math.hypot(hx, hy) || 1;
        return { x: heap.x + (hx / hd) * 7, y: heap.y + (hy / hd) * 7 };
      }
    }
    const far = gd.clip.farthestFrom(pile);
    if (!far) return null;
    const dx = far.x - pile.x;
    const dy = far.y - pile.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: far.x + (dx / d) * 5, y: far.y + (dy / d) * 5 };
  };

  /**
   * Decide what the gardener does this frame, and advance the vine.
   *
   * Two regimes. Scrubbing (the timeline moved while paused, or jumped): the scene shows that moment directly:
   * the vine and pile are set to it, loose clippings are cleared, and the gardener is placed where that moment
   * has them (at the wall ready to cut, or on the bench once paid off). Playing: the vine regrows by the month's
   * interest and shrinks only at the gardener's snips; once the wall is clear the clippings are raked to the pile
   * (only the ones the tines touch move) and the gardener rests.
   */
  const tend = (gd: Garden, cv: VineFrame['cottages'][number], mps: number, dt: number, t: number, reduced: boolean) => {
    const g = gd.g!;
    const target = Math.max(0, Math.min(1, cv.vine));
    const moved = Math.abs(target - gd.lastTarget);
    gd.lastTarget = target;
    if (reduced) {
      setDirect(gd, target, dt, true);
      gd.clip.clear();
      const still: GardenerIntent = cv.paidOff ? { activity: 'rest', target: null, pace: 0 } : { activity: 'idle', target: null, pace: 0 };
      g.update(dt, still, t, true);
      gd.lastSnips = g.snips;
      gd.lastStrokes = g.strokes;
      return;
    }
    // scrubbing: any change of the moment while paused, or a big jump while playing (replay, a new input)
    // (a few dollars' change in a frame where the clock reads stopped, such as the last payment as the story comes to
    // rest, is not a scrub: the gardener carries on and walks; only a real jump is shown at once)
    if ((mps === 0 && moved > 0.01) || moved > 0.06) gd.scrub = 0.3;
    else gd.scrub = Math.max(0, gd.scrub - dt);
    if (gd.scrub > 0) {
      setDirect(gd, target, dt, true);
      gd.clip.clear();
      gd.raking = false;
      gd.rakeAt = null;
      gd.lastHead = null;
      gd.aim = null;
      g.place(cv.paidOff ? { activity: 'rest', target: null, pace: 0 } : readyAt(gd));
      gd.lastSnips = g.snips;
      gd.lastStrokes = g.strokes;
      return;
    }
    // the month's interest grows the vine back at its tips
    if (!cv.paidOff && mps > 0 && dt > 0) gd.st.grow(cv.regrowth * mps * dt, dt, 1.4);
    let mass = gd.st.mass();
    // paused and out of step (shouldn't happen after a scrub) is set directly; a shortfall while playing regrows
    if (mps === 0 && Math.abs(mass - target) > 0.01) {
      setDirect(gd, target, dt, false);
      mass = gd.st.mass();
    } else if (target > mass + 0.002 && dt > 0) {
      gd.st.grow(Math.min(target - mass, 0.12 * dt), dt, 1.4);
      mass = gd.st.mass();
    }
    const clear = target <= 0.0005;
    // paid off with only a few stub ends left: they wither back on their own
    if (clear && mass > 1e-4 && mass < 0.03) {
      setDirect(gd, 0, dt, false);
      mass = gd.st.mass();
    }
    const excess = mass - target;
    // paid off with only scraps left: the last cut is at the root, and what remains comes down with it
    let finalCut = clear && mass >= 0.03 && mass < 0.15;
    // how much one snip should take: enough to keep up at this speed, never so much that a branch vanishes
    const rate = Math.max(0, cv.pruning * mps);
    // a working gardener manages a snip about every 0.6 s (hand to the next stem, open, close), so one snip takes
    // about a second's worth of payments plus half of any backlog (several neighbouring cuts if need be)
    const chunk = Math.min(0.6, Math.max(0.008, rate * 1.1 + excess * 0.5));
    // snips that happened since last frame
    while (gd.lastSnips < g.snips) {
      gd.lastSnips++;
      if (mass - target > 0.0015 || (clear && mass >= 0.03)) snip(gd, chunk, target, finalCut);
      mass = gd.st.mass();
    }
    // raking: only the clippings the tines pass over move, along with the tines; at the pile they join it
    const head = g.rakeHead();
    if (head && head.contact && gd.lastHead) gd.carried += gd.clip.drag(gd.lastHead, head, PILE[gd.id]);
    if (gd.lastStrokes < g.strokes) {
      gd.lastStrokes = g.strokes;
      gd.rakeAt = nextRake(gd);
    }
    // (after the stroke is counted, so the follow-up can start from where this pull ended)
    gd.lastHead = head && head.contact ? { x: head.x, y: head.y } : null;
    // what next
    const needCut = (excess > 0.004 || (clear && mass >= 0.03)) && (mps > 0 || clear);
    const lying = gd.clip.lying;
    // raking waits until the wall is clear (the clippings lie at the wall foot meanwhile)
    if (gd.raking && (lying === 0 || excess > 0.02)) gd.raking = false;
    if (!gd.raking && lying > 0 && cv.paidOff && mass <= 1e-4) {
      gd.raking = true;
      gd.rakeMonth = monthClock;
      gd.rakeAt = nextRake(gd);
    }
    let intent: GardenerIntent;
    if (gd.raking && gd.rakeAt) intent = { activity: 'rake', target: gd.rakeAt, pace: 1.3 };
    else if (needCut) {
      if (gd.aim === null || gd.st.g[gd.aim]! < 0.999) gd.aim = finalCut ? 0 : chooseAim(gd, chunk, excess > 0.08);
      // the wall is due to be clear and only stubs are left: the last cut is at the root
      if (gd.aim === null && clear) {
        finalCut = true;
        gd.aim = 0;
      }
      const a = gd.aim;
      let tp: { x: number; y: number } | null = null;
      if (a !== null) {
        const n = model.nodes[a]!;
        const k = a === 0 ? 0.5 : 0.35;
        tp = candWorld(gd, n.sx + (n.ex - n.sx) * k, n.sy + (n.ey - n.sy) * k);
      }
      // full pace when behind; otherwise just enough to keep up with the month's payments
      const pace = excess > 0.03 ? 3 : Math.max(0.7, Math.min(3, (rate + excess / 1.2) / chunk));
      intent = tp ? { activity: 'prune', target: tp, pace } : { activity: 'idle', target: null, pace: 0 };
    } else if (cv.paidOff && mass <= 1e-4) intent = { activity: 'rest', target: null, pace: 0 };
    else if (!cv.paidOff && gd.aim !== null && gd.st.g[gd.aim]! >= 0.999) {
      // waiting for the vine to grow back (or paused): keep the shears ready at the last spot, facing the wall
      const n = model.nodes[gd.aim]!;
      intent = { activity: 'prune', target: candWorld(gd, n.sx + (n.ex - n.sx) * 0.35, n.sy + (n.ey - n.sy) * 0.35), pace: 0 };
    } else if (!cv.paidOff) intent = readyAt(gd);
    else intent = { activity: 'idle', target: null, pace: 0 };
    g.update(dt, intent, t, false);
    gd.clip.update(dt, t, gd.raking ? gd.rakeMonth : monthClock);
  };

  /* ---------------------------------------------------------------- smoke */

  const makePuff = (): HTMLCanvasElement => {
    const cv = makeCanvas(64, 64);
    const c = cv.getContext('2d')!;
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(238,234,228,0.95)');
    gr.addColorStop(0.45, 'rgba(226,222,216,0.55)');
    gr.addColorStop(1, 'rgba(220,216,210,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    return cv;
  };

  const drawSmoke = (x: number, y: number, t: number, seed: number, reduced: boolean) => {
    if (!puff) return;
    const P = 7.5;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = reduced ? (i / n) * P * 0.7 : (t + seed + (i * P) / n) % P;
      const k = a / P;
      const w = reduced ? 0.6 : wind(t - a);
      const px = x + a * (3.2 + 2.2 * w) * (1 + k) + Math.sin(a * 1.1 + i * 2.3) * 2.2 * k;
      const py = y - a * 9.5 + a * a * 0.25;
      const r = 3.2 + a * 2.3;
      const al = 0.3 * Math.min(1, a / 0.7) * Math.pow(1 - k, 1.4);
      if (al < 0.01) continue;
      ctx.globalAlpha = al;
      ctx.drawImage(puff, px - r, py - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------------------------------------------------------- the API */

  const toScreen = (x: number, y: number): VineScreenPoint => {
    const c = cam ?? fitCamera(1000, 640, 1, insets);
    const sx = c.ox + x * c.s;
    const sy = c.oy + y * c.s;
    return { x: lastZ.a * sx + lastZ.bx, y: lastZ.a * sy + lastZ.by };
  };

  const api: VineSceneAPI = {
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
      if (destroyed || !cam || !paper || !world || !cottages || !leafSpr || !loose) return;
      const c = cam;
      const z = zoomTransform(c, insets, frame.camera?.zoom ?? 1, frame.camera?.focus ?? 'both');
      lastZ = z;
      const reduced = frame.reducedMotion;
      const t = frame.timeMs / 1000;
      const dt = lastT < 0 || t < lastT ? 0 : Math.min(0.1, t - lastT);
      lastT = t;
      const mps = Math.max(0, frame.monthsPerSecond);
      monthClock += mps * dt;
      // ---- screen space: paper and sky, the geese
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, c.cssW, c.cssH);
      ctx.drawImage(paper, 0, 0, c.cssW, c.cssH);
      if (!reduced) drawGeese(ctx, t, c);
      // ---- the world, zoomed with the camera
      ctx.setTransform(c.dpr * z.a, 0, 0, c.dpr * z.a, c.dpr * z.bx, c.dpr * z.by);
      ctx.drawImage(world.cv, 0, 0, c.cssW, c.cssH);
      const A = c.dpr * z.a * c.s;
      ctx.setTransform(A, 0, 0, A, c.dpr * (z.a * c.ox + z.bx), c.dpr * (z.a * c.oy + z.by));
      // ---- tend both gardens (vine growth, cuts, raking, the gardeners' intent)
      for (const cv of frame.cottages) {
        const gd = gardens[cv.id];
        if (!gd.g || !gd.pile) continue;
        tend(gd, cv, mps, dt, t, reduced);
        gd.pile.update(cv.pile, dt, reduced || gd.scrub > 0);
      }
      // ---- leaves falling from the trees in the side yard, behind the cottages
      if (drift && !reduced) {
        if (dt > 0) drift.update(dt, t);
        drift.draw(ctx, true);
      }
      // ---- cottages, smoke, vines, clippings
      for (const id of PLANS) {
        const s = cottages[id].sprite;
        ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
      }
      for (const id of PLANS) {
        const ch = cottages[id].chimney;
        drawSmoke(ch.x, ch.y, t, id === 'minimum' ? 0 : 3.1, reduced);
      }
      for (const id of PLANS) {
        const gd = gardens[id];
        gd.view.draw(ctx, gd.st, gd.tf, leafSpr, t, reduced);
        gd.clip.draw(ctx);
      }
      // ---- the lawn's standing things, nearest last
      const items: Array<{ y: number; draw: () => void }> = [];
      for (const p of props) items.push({ y: p.depth ?? p.y, draw: () => ctx.drawImage(p.spr.cv, p.x - p.spr.px, p.y - p.spr.py, p.spr.w, p.spr.h) });
      for (const id of PLANS) {
        const gd = gardens[id];
        const pile = gd.pile;
        if (pile) items.push({ y: PILE[id].y - 2, draw: () => pile.draw(ctx, PILE[id].x, PILE[id].y) });
        const g = gd.g;
        if (g) {
          const f = g.feet();
          items.push({
            y: f.y + 0.5,
            draw: () => {
              ctx.fillStyle = 'rgba(48,34,22,0.2)';
              ctx.beginPath();
              ctx.ellipse(f.x + 3, f.y + 1, 20, 3.6, 0, 0, Math.PI * 2);
              ctx.fill();
              g.draw(ctx);
            },
          });
        }
      }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.draw();
      // ---- leaves falling from the big trees, in front
      if (drift && !reduced) drift.draw(ctx, false);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    labelAnchor(id) {
      // above the chimney and its first wisps of smoke, so the label never sits on them
      const r = COTTAGE[id].ridge;
      const top = cottages ? Math.min(r.y, cottages[id].chimney.y) : r.y - 40;
      return toScreen(r.x, top - 26);
    },
    pileAnchor(id) {
      const h = gardens[id].pile?.dims().h ?? 10;
      return toScreen(PILE[id].x, PILE[id].y - Math.max(18, h) - 12);
    },
    cameraTransform() {
      return lastZ;
    },
    destroy() {
      destroyed = true;
    },
  };
  return api;
}
