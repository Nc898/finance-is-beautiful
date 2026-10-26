/**
 * "On a Roll" scene (Canvas 2D). Implements SnowSceneAPI from ../types.
 *
 * Painted once per size: the paper and winter sky with its hazy sun (screen space), then the world layer (mountains,
 * ridge, hillsides with their light and shade, the frozen creek and bridge, the snowbank, rocks and grass, and the
 * pines: a wood along each crest, a stand in the valley, big pines at the edges), the ball bodies, the sledges.
 * Per frame: the pressed tracks and the clumps lying in them, then (sorted by depth) the balls, climbers, sledges and
 * the mounds with their flags, then the falling snow.
 *
 * The scene decides WHAT each climber does (as the vine's tend()); the climber decides HOW. Balls move only by the
 * frame's data. A jump of the timeline (scrubbing) shows the moment directly: tracks and clumps are functions of
 * progress, the climbers are placed, breakups are instant; while playing, clumps are seen falling and a cleared ball
 * crumbles into the bank.
 */
import type { DebtId, SnowFrame, SnowSceneAPI, SnowScreenPoint, StrategyId } from '../types';
import { DEBTS, STRATEGIES } from '../types';
import { ensurePaperTile } from '../../scene/sprites';
import { HILL, REST, depthScale, fitCamera, laneDir, zoomTransform, type Camera, type Insets, type ZoomXf } from './geom';
import { paintPaperAndSky } from './sky';
import { buildWorld, type WorldLayer } from './world';
import { BallView, buildBallArt, type BallArt } from './balls';
import { makeSledge } from './snowArt';
import { Snowfall } from './snowfall';
import { createClimber } from './climber';
import type { Climber, ClimberIntent } from './climberApi';

/** the longest step of climber work per update, seconds (a fast playback speed works in several such steps a frame) */
const WORK_STEP = 1 / 45;
/** how long a climber cheers when a ball breaks up (seconds of its own time) */
const CHEER_TIME = 1.25;

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

  /** what a climber is doing at this moment */
  const intentFor = (id: StrategyId, hv: SnowFrame['hills'][number], mps: number, cheering: boolean): ClimberIntent => {
    if (cheering) return { activity: 'cheer', target: null, dir: null, radius: 0 };
    if (hv.paidOff) return { activity: 'rest', target: null, dir: null, radius: 0 };
    let maxProg = 0;
    for (const b of hv.balls) maxProg = Math.max(maxProg, b.progress);
    const tb = hv.balls.find((b) => b.target && !b.paidOff);
    if (!tb || (mps === 0 && maxProg < 0.003)) return { activity: 'idle', target: null, dir: null, radius: 0 };
    const v = viewFor(id, tb.id);
    return { activity: 'push', target: { x: v.contact.x, y: v.contact.y }, dir: laneDir(id, tb.id), radius: v.r };
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
      if (destroyed || !cam || !paper || !world || !art || !sledges || !snow) return;
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
      // ---- everything that stands, nearest last
      const items: Array<{ y: number; draw: () => void }> = [];
      for (const id of STRATEGIES) {
        const s = sledges[id];
        const r = REST[id];
        const ds = depthScale(r.y);
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
          if (v.hasMound) items.push({ y: v.lane.end.y, draw: () => v.drawMound(ctx, t) });
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
