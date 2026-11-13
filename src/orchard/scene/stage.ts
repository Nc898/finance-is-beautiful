/**
 * The orchestrator proper, with its two big parts passed in (index.ts passes the real ones; a harness can pass
 * stand-ins). Implements OrchardSceneAPI from ../types.
 *
 * Painted once per size: the paper and the late-summer sky, the world layer (the distance, the farm, the fields,
 * the ground, the path, the track, the verges; world.ts), the farmer's tree with its front parts (farmTree.ts), the
 * props (props.ts); and each part prepares its own paintings (the young trees' size steps, the pickers' costumes).
 * Per frame: the paper and the world, the swallows high in the sky, then everything standing on the ground in depth
 * order (far to near): the young trees of both orchards, the farmer's tree, the low fruit and the bough's leaf over
 * it, the ladder and the leaves over its top, the pickers with their baskets, the windfalls, the crates and the
 * seats, the leaves and the apple drifting down, the wasps and the butterflies.
 *
 * The orchestrator decides what happens from the money (the picker's intent each frame) and never sets a pose, a
 * position or an apple directly: while playing the pickers are advanced toward their intent; when the timeline is
 * scrubbed or jumped, or in reduced motion, they are placed straight into the settled state for it.
 */
import type { OrchardFrame, OrchardSceneAPI, OrchardScreenPoint, PickerId, PickerVisual } from '../types';
import { PICKERS } from '../types';
import { ensurePaperTile } from '../../scene/sprites';
import { BOUGH, CRATES, FARM_TREE, LADDER, SEAT } from './geom';
import { fitCamera, plotX, viewX, type Camera, type Insets } from './layout';
import { paintPaperAndSky } from './sky';
import { buildWorld, type WorldLayer } from './world';
import { renderFarmTree, type FarmTreeArt, type TreeSprite } from './farmTree';
import { blit, makeCrates, makeLadder, makeSeat, type Sprite } from './props';
import { Ambient } from './ambient';
import type { CreateOrchardView, CreatePicker, Item, OrchardView, Picker, PickerIntent } from './partsApi';
import { yieldTask } from '../../shared/yieldTask';

export interface OrchardParts {
  createOrchardView: CreateOrchardView;
  createPicker: CreatePicker;
}

const tick = (): Promise<void> => yieldTask();

/** the picker's round at 1x: rounds per second (about 8 s a round), times the playback speed */
const PACE_1X = 0.12;

interface Props {
  crates: Record<PickerId, Sprite>;
  seats: Record<PickerId, Sprite>;
  ladder: Sprite;
}

const lay = (ctx: CanvasRenderingContext2D, s: TreeSprite | Sprite): void => blit(ctx, s);

export function createOrchardStage(canvas: HTMLCanvasElement, parts: OrchardParts): OrchardSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let size = { w: 0, h: 0, ratio: 1 };
  let cam: Camera | null = null;
  let paper: HTMLCanvasElement | null = null;
  let tree: FarmTreeArt | null = null;
  let props: Props | null = null;
  let ambient: Ambient | null = null;
  /** the parts are made once and kept across a resize (each repaints what it needs in prepare) */
  let views: Record<PickerId, OrchardView> | null = null;
  let pickers: Record<PickerId, Picker> | null = null;
  let lastMs = -1;
  let lastMonth = NaN;
  let last: OrchardFrame | null = null;
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
      const W: WorldLayer | null = await buildWorld(c, alive);
      if (!W || !alive()) return;
      // every painting is made at about the density it is drawn at (no oversampling: it costs fill rate every frame)
      const A = Math.min(3, c.s * c.dpr * 1.25);
      const T = await renderFarmTree(A, tick, alive);
      if (!T || !alive()) return;
      const pq = Math.min(3, c.s * c.dpr * 1.5);
      const pr: Props = {
        crates: { a: makeCrates('a', pq), b: makeCrates('b', pq) },
        seats: { a: makeSeat('a', pq), b: makeSeat('b', pq) },
        ladder: makeLadder(pq),
      };
      await tick();
      if (!alive()) return;
      views ??= { a: parts.createOrchardView('a'), b: parts.createOrchardView('b') };
      pickers ??= { a: parts.createPicker('a'), b: parts.createPicker('b') };
      const px = c.s * c.dpr;
      for (const id of PICKERS) {
        await views[id].prepare(px, tick, alive);
        if (!alive()) return;
        await pickers[id].prepare(px, tick, alive);
        if (!alive()) return;
      }
      // the paper, the sky and the world never change at this size: one picture, drawn once a frame
      {
        const g = pp.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(W.cv, 0, 0, pp.width, pp.height);
      }
      cam = c;
      canvas.width = Math.round(c.cssW * c.dpr);
      canvas.height = Math.round(c.cssH * c.dpr);
      canvas.style.width = `${c.cssW}px`;
      canvas.style.height = `${c.cssH}px`;
      paper = pp;
      tree = T;
      props = pr;
      ambient ??= new Ambient(T.dropFrom);
      if (import.meta.env.DEV) (window as unknown as { __orchardScene: unknown }).__orchardScene = { get views() { return views; }, get pickers() { return pickers; }, get ambient() { return ambient; } };
      if (!readyDone) {
        readyDone = true;
        resolveReady();
      }
      if (last) api.render(last);
    })().catch((e) => console.error('orchard scene build failed', e));
  };

  const toScreen = (x: number, y: number): OrchardScreenPoint => {
    const c = cam ?? fitCamera(Math.max(1, size.w), Math.max(1, size.h), 1, insets);
    return { x: c.ox + x * c.s, y: c.oy + y * c.s };
  };

  /** what the picker should be doing this frame, from the money */
  const intentFor = (pv: PickerVisual, frame: OrchardFrame, playing: boolean): PickerIntent => {
    const empty = pv.basket.own + pv.basket.match <= 0 && pv.offer <= 0;
    return {
      activity: pv.done ? 'rest' : (frame.month <= 0 && !playing) || empty ? 'idle' : 'work',
      basket: pv.basket,
      offer: pv.offer,
      picked: pv.picked,
      planting: pv.planting,
      pace: playing ? PACE_1X * (frame.speed ?? 1) : 0,
      monthsPerSecond: frame.monthsPerSecond,
    };
  };

  const api: OrchardSceneAPI = {
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
      if (destroyed || !cam || !paper || !tree || !props || !ambient || !views || !pickers) return;
      const dt = lastMs < 0 ? 0 : Math.min(0.1, Math.max(0, (frame.timeMs - lastMs) / 1000));
      lastMs = frame.timeMs;
      const c = cam;
      const reduced = frame.reducedMotion;
      const playing = frame.monthsPerSecond > 0 && !reduced;
      const tSec = frame.timeMs / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(paper, 0, 0);
      ctx.setTransform(c.dpr * c.s, 0, 0, c.dpr * c.s, c.dpr * c.ox, c.dpr * c.oy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';

      // the air: it keeps moving while paused, but not in reduced motion
      const vx = viewX(c, 20);
      if (!reduced) {
        const windfalls = {} as Record<PickerId, boolean>;
        for (const pv of frame.pickers) windfalls[pv.id] = pv.offer > 0 && pv.picked < 0.999 && frame.month > 3;
        ambient.update(dt, windfalls, vx.x0, vx.x1);
        ambient.drawSky(ctx);
      }

      const items: Item[] = [];
      const windMs = reduced ? 0 : frame.timeMs;
      // the timeline was dragged or jumped (or this is the first frame): the pickers are placed, not walked
      const jumped = !Number.isFinite(lastMonth) || (!playing && frame.month !== lastMonth) || Math.abs(frame.month - lastMonth) > Math.max(1.5, frame.monthsPerSecond * dt * 3 + 0.5);
      lastMonth = frame.month;
      for (const pv of frame.pickers) {
        const id = pv.id;
        for (const it of views[id].items(pv.trees, windMs)) items.push(it);
        const p = pickers[id];
        const intent = intentFor(pv, frame, playing);
        if (jumped || reduced) p.place(intent);
        else p.update(dt, intent, tSec, false);
        for (const it of p.items()) items.push(it);
        const cr = props.crates[id];
        const se = props.seats[id];
        items.push({ depth: CRATES[id].y, draw: (g) => lay(g, cr) });
        items.push({ depth: SEAT[id].y, draw: (g) => lay(g, se) });
        const bf = tree.boughFront[id];
        items.push({ depth: BOUGH[id].y + 0.5, draw: (g) => lay(g, bf) });
      }
      const T = tree;
      items.push({ depth: FARM_TREE.y, draw: (g) => lay(g, T.body) });
      const ld = props.ladder;
      items.push({ depth: LADDER.foot.y, draw: (g) => lay(g, ld) });
      items.push({ depth: LADDER.foot.y + 0.5, draw: (g) => lay(g, T.ladderFront) });
      if (!reduced) for (const it of ambient.items()) items.push(it);
      items.sort((p, q) => p.depth - q.depth);
      for (const it of items) it.draw(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    labelAnchor(id: PickerId) {
      const c = cam;
      const p = toScreen(plotX(id), 0);
      const y = c ? c.cssH - insets.bottom + 6 : p.y;
      return { x: p.x, y };
    },
    destroy() {
      destroyed = true;
    },
  };
  return api;
}
