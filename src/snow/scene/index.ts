/**
 * "On a Roll" scene (Canvas 2D). Implements SnowSceneAPI from ../types.
 *
 * Painted once per size: the paper and winter sky with its hazy sun (screen space), then the world layer (mountains,
 * ridge, hillsides with their light and shade, the frozen creek and bridge, the snowbank, rocks and grass, and the
 * pines: a wood along each crest, a stand in the valley, big pines at the edges), the ball bodies, the sledges.
 * Per frame: the pressed tracks and the clumps lying in them, then (sorted by depth) the valley and edge pines, the
 * birds in them, the balls, climbers, sledges and the mounds with their flags, then the falling snow.
 *
 * The scene decides WHAT each climber does (as the vine's tend()); the climber decides HOW. Balls move only by the
 * frame's data. The climbers work from the top of their hill: each pushes its target ball off the top and, once it is
 * rolling, goes to wait behind the next one, watching it go (cheering when one breaks up); when the hill is clear it
 * walks down to its sledge. A jump of the timeline (scrubbing) shows the moment directly: tracks and clumps are functions of
 * progress, the climbers are placed, breakups are instant; while playing, clumps are seen falling and a cleared ball
 * crumbles into the bank.
 */
import type { DebtId, SnowFrame, SnowSceneAPI, SnowScreenPoint, StrategyId } from '../types';
import { DEBTS, STRATEGIES } from '../types';
import { ensurePaperTile } from '../../scene/sprites';
import { HILL, LANES, REST, depthScale, fitCamera, laneDir, zoomTransform, type Camera, type Insets, type ZoomXf } from './geom';
import { paintPaperAndSky } from './sky';
import { buildWorld, type WorldLayer } from './world';
import { BallView, buildBallArt, type BallArt } from './balls';
import { makeSledge } from './snowArt';
import { Snowfall } from './snowfall';
import { Birds } from './birds';
import { makeBirdArt } from './birdArt';
import { createClimber } from './climber';
import type { Climber, ClimberIntent } from './climberApi';
import { SLEDGE_K } from './climberDims';
import { KAPPA } from '../../vine/scene/gardenerDims';

/** the longest step of climber work per update, seconds (a fast playback speed works in several such steps a frame) */
const WORK_STEP = 1 / 45;
/** how long a climber cheers when a ball breaks up (seconds of its own time) */
const CHEER_TIME = 1.25;
/** a climber pushes its ball this far down the lane (its share paid since it started rolling), then lets it roll */
const PUSH_UNTIL = 0.12;
/** how far beyond a waiting ball's edge the climber stands behind it (ground units) */
const WAIT_BACK = 16;

type Sledge = ReturnType<typeof makeSledge>;

export function createSnowScene(canvas: HTMLCanvasElement): SnowSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let size = { w: 0, h: 0, ratio: 1 };
  let cam: Camera | null = null;
  let paper: HTMLCanvasElement | null = null;
  let world: WorldLayer | null = null;
  let art: BallArt | null = null;
  let sledges: Record<StrategyId, Sledge> | null = null;
  let snow: Snowfall | null = null;
  let birds: Birds | null = null;
  let lastZ: ZoomXf = { a: 1, bx: 0, by: 0 };
  let lastT = -1;
  let gen = 0;
  let destroyed = false;
  let last: SnowFrame | null = null;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let readyDone = false;
  let scrub = 0;
  const climbers: Partial<Record<StrategyId, Climber>> = {};
  const views = new Map<string, BallView>();
  const cheer: Record<StrategyId, number> = { snowball: 0, avalanche: 0 };
  /** a climber's way up to a waiting spot: first straight up to this point, then across (kept until reached) */
  const routes: Record<StrategyId, { key: string; wp: { x: number; y: number }; done: boolean } | null> = { snowball: null, avalanche: null };
  const prevPaid = new Map<string, boolean>();
  const key = (h: StrategyId, d: DebtId) => `${h}/${d}`;

  const layout = () => {
    if (size.w <= 0 || size.h <= 0) return;
    const c = fitCamera(size.w, size.h, size.ratio, insets);
    const my = ++gen;
    const alive = () => !destroyed && my === gen;
    void (async () => {
      const tile = await ensurePaperTile();
      if (!alive()) return;
      const pp = paintPaperAndSky(c, tile);
      const W = await buildWorld(c, alive);
      if (!W || !alive()) return;
      const q = c.s * c.dpr;
      const ba = buildBallArt(Math.min(4.5, q * 1.9));
      const sq = Math.min(5, q * 2.4);
      const sl = { snowball: makeSledge(false, sq), avalanche: makeSledge(true, sq) };
      const fl = new Snowfall(ba.flake, W.puffSpots, W.xmin, W.xmax, W.ymax, -c.oy / c.s);
      // the birds' sprites, sharp enough for the nearest bird at the opening zoom
      const bl = Math.round(Math.min(120, Math.max(28, 16 * 1.25 * q * 1.4)));
      const bd = new Birds(W.perches, { chickadee: makeBirdArt('chickadee', bl), cardinal: makeBirdArt('cardinal', bl) }, ba.flake);
      for (const id of STRATEGIES) if (!climbers[id]) climbers[id] = createClimber(id, Math.min(6, q * 3));
      // swap everything in together: the previous size keeps rendering until the new caches are complete
      cam = c;
      canvas.width = Math.round(c.cssW * c.dpr);
      canvas.height = Math.round(c.cssH * c.dpr);
      canvas.style.width = `${c.cssW}px`;
      canvas.style.height = `${c.cssH}px`;
      paper = pp;
      world = W;
      art = ba;
      sledges = sl;
      snow = fl;
      birds = bd;
      for (const v of views.values()) v.art = ba;
      if (!readyDone) {
        readyDone = true;
        resolveReady();
      }
      if (last) api.render(last);
    })().catch((e) => console.error('snow scene build failed', e));
  };

  const toScreen = (x: number, y: number): SnowScreenPoint => {
    const c = cam ?? fitCamera(1000, 640, 1, insets);
    return { x: lastZ.a * (c.ox + x * c.s) + lastZ.bx, y: lastZ.a * (c.oy + y * c.s) + lastZ.by };
  };

  const viewFor = (h: StrategyId, d: DebtId): BallView => {
    const k = key(h, d);
    let v = views.get(k);
    if (!v) {
      v = new BallView(h, d, art!);
      views.set(k, v);
    }
    return v;
  };

  /**
   * Stand behind (uphill of) a ball at the top of its lane, facing down it. A climber below that spot first walks
   * straight up its own lane (empty above the ball it has just pushed), then across behind the waiting balls, so it
   * never walks through one.
   */
  const waitBehind = (id: StrategyId, debt: DebtId, topOfLane = false): ClimberIntent => {
    const v = viewFor(id, debt);
    const dir = laneDir(id, debt);
    const gx = dir.x;
    const gd = dir.y / KAPPA;
    const gl = Math.hypot(gx, gd) || 1;
    // (watching the last ball go: from where it started, at the top of its lane)
    const from = topOfLane ? LANES[id][debt].start : v.contact;
    const back = (topOfLane ? 6 : v.r) + WAIT_BACK;
    const at = { x: from.x - (gx / gl) * back, y: from.y - (gd / gl) * back * KAPPA };
    // the way up is fixed when the climb starts (a goal that moved with the feet would drag the stride out of shape)
    const key = `${debt}|${topOfLane ? 1 : 0}`;
    const g = climbers[id];
    let r = routes[id];
    if (r && r.key !== key) r = routes[id] = null;
    if (!r && g) {
      const f = g.feet();
      if (f.y > at.y + 10 && Math.abs(f.x - at.x) > 30) r = routes[id] = { key, wp: { x: f.x, y: at.y }, done: false };
    }
    if (r && !r.done && g) {
      const f = g.feet();
      if (Math.hypot(f.x - r.wp.x, f.y - r.wp.y) < 8) r.done = true;
      else return { activity: 'wait', target: r.wp, dir, radius: 0 };
    }
    return { activity: 'wait', target: at, dir, radius: 0 };
  };

  /** what a climber is doing at this moment */
  const intentFor = (id: StrategyId, hv: SnowFrame['hills'][number], mps: number, cheering: boolean): ClimberIntent => {
    if (cheering) return { activity: 'cheer', target: null, dir: null, radius: 0 };
    if (hv.paidOff) return { activity: 'rest', target: null, dir: null, radius: 0 };
    const tb = hv.balls.find((b) => b.queue === 0);
    const nb = hv.balls.find((b) => b.queue === 1);
    if (!tb) return { activity: 'idle', target: null, dir: null, radius: 0 };
    // the opening, before anything rolls: ready behind the first ball
    if (mps === 0 && tb.progress < 0.002) return waitBehind(id, tb.id);
    // pushing it off the top
    if (tb.progress < PUSH_UNTIL) {
      routes[id] = null;
      const v = viewFor(id, tb.id);
      return { activity: 'push', target: { x: v.contact.x, y: v.contact.y }, dir: laneDir(id, tb.id), radius: v.r };
    }
    // it rolls on alone: wait behind the next one, ready for it; with none left, watch this one from the top
    return nb ? waitBehind(id, nb.id) : waitBehind(id, tb.id, true);
  };

  const api: SnowSceneAPI = {
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
      if (destroyed || !cam || !paper || !world || !art || !sledges || !snow || !birds) return;
      const c = cam;
      const z = zoomTransform(c, insets, frame.camera?.zoom ?? 1, frame.camera?.focus ?? 'both');
      lastZ = z;
      const reduced = frame.reducedMotion;
      const t = frame.timeMs / 1000;
      const dt = lastT < 0 || t < lastT ? 0 : Math.min(0.1, t - lastT);
      lastT = t;
      const mps = Math.max(0, frame.monthsPerSecond);
      const playing = mps > 0 && dt > 0;
      // ---- screen space: paper and sky
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, c.cssW, c.cssH);
      ctx.drawImage(paper, 0, 0, c.cssW, c.cssH);
      // ---- the world, zoomed with the camera
      ctx.setTransform(c.dpr * z.a, 0, 0, c.dpr * z.a, c.dpr * z.bx, c.dpr * z.by);
      ctx.drawImage(world.cv, 0, 0, c.cssW, c.cssH);
      const A = c.dpr * z.a * c.s;
      ctx.setTransform(A, 0, 0, A, c.dpr * (z.a * c.ox + z.bx), c.dpr * (z.a * c.oy + z.by));
      // ---- is the timeline being scrubbed? (a ball's place jumped while paused, or a big jump while playing)
      let moved = 0;
      let flipped = false;
      for (const hv of frame.hills) {
        for (const b of hv.balls) {
          const v = views.get(key(hv.id, b.id));
          if (v) moved = Math.max(moved, Math.abs(Math.min(1, Math.max(0, b.progress)) - v.progress));
          const pp = prevPaid.get(key(hv.id, b.id));
          if (pp !== undefined && pp !== b.paidOff && mps === 0) flipped = true;
        }
      }
      if ((mps === 0 && (moved > 0.008 || flipped)) || moved > 0.06) scrub = 0.3;
      else scrub = Math.max(0, scrub - dt);
      const isScrub = scrub > 0;
      // the work (climbers) runs at the playback speed, in short steps; small effects (lumps, flakes) a little quicker
      const speed = mps > 0 ? Math.max(0.1, frame.speed ?? 1) : 1;
      const work = dt * speed;
      const steps = Math.max(1, Math.ceil(work / WORK_STEP - 1e-9));
      const dtFx = dt * (mps > 0 ? Math.min(2.5, Math.max(1, speed)) : 1);
      // ---- the balls
      for (const hv of frame.hills) {
        for (const b of hv.balls) {
          const v = viewFor(hv.id, b.id);
          const k = key(hv.id, b.id);
          const wasPaid = prevPaid.get(k);
          if (wasPaid === false && b.paidOff && !isScrub && playing && !reduced) cheer[hv.id] = CHEER_TIME;
          prevPaid.set(k, b.paidOff);
          v.update(dtFx, b, { scrub: isScrub, playing, reduced, t, mps });
        }
      }
      // ---- the climbers: decide what each does, then let it do it
      for (const hv of frame.hills) {
        const g = climbers[hv.id];
        if (!g) continue;
        if (reduced || isScrub) {
          cheer[hv.id] = 0;
          const it = intentFor(hv.id, hv, mps, false);
          if (isScrub && !reduced) g.place(it);
          else g.update(dt, it, t, true);
          continue;
        }
        for (let i = 0; i < steps; i++) {
          const cheering = cheer[hv.id] > 0;
          const it = intentFor(hv.id, hv, mps, cheering);
          g.update(work / steps, it, t, false);
          if (cheering) cheer[hv.id] = Math.max(0, cheer[hv.id] - work / steps);
        }
      }
      // ---- the ground layer: the pressed tracks, the clumps lying in them
      for (const v of views.values()) v.drawGround(ctx);
      // ---- everything that stands, nearest last: the near pines and the birds in them among the rest
      const items: Array<{ y: number; draw: () => void }> = [];
      for (const p of world.standing) items.push({ y: p.y, draw: () => ctx.drawImage(p.cv, p.x0, p.y0, p.w, p.h) });
      if (reduced) birds.still();
      else birds.update(dt);
      items.push(...birds.items(ctx));
      for (const id of STRATEGIES) {
        const s = sledges[id];
        const r = REST[id];
        const ds = depthScale(r.y) * SLEDGE_K;
        items.push({ y: r.y - 4, draw: () => ctx.drawImage(s.cv, r.x - s.px * ds, r.y - s.py * ds, s.w * ds, s.h * ds) });
        const g = climbers[id];
        if (g) {
          const f = g.feet();
          items.push({
            y: f.y + 0.5,
            draw: () => {
              const S = depthScale(f.y);
              ctx.fillStyle = 'rgba(76,84,160,0.26)';
              ctx.beginPath();
              ctx.ellipse(f.x + 4 * S, f.y + 1, 21 * S, 3.8 * S, 0, 0, Math.PI * 2);
              ctx.fill();
              g.draw(ctx);
            },
          });
        }
        for (const d of DEBTS) {
          const v = views.get(key(id, d));
          if (!v) continue;
          if (!v.paidOff) items.push({ y: v.contact.y, draw: () => v.drawBall(ctx, t) });
          if (v.hasMound) items.push({ y: v.moundY, draw: () => v.drawMound(ctx, t) });
        }
      }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.draw();
      // ---- the falling snow
      if (!reduced) {
        const wx = (sx: number) => ((sx - z.bx) / z.a - c.ox) / c.s;
        snow.draw(ctx, t, wx(0), wx(c.cssW), ((c.cssH - z.by) / z.a - c.oy) / c.s);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    labelAnchor(id: StrategyId) {
      return toScreen(HILL[id].crest.x, (world ? world.woodTop[id] : 180) - 18);
    },
    ballAnchor(id: StrategyId, debt: DebtId) {
      const v = views.get(key(id, debt));
      if (!v) {
        const p = HILL[id].crest;
        return toScreen(p.x, p.y - 60);
      }
      const p = v.anchorPoint();
      return toScreen(p.x, p.y);
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
