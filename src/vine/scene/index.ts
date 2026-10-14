/**
 * STUB (coordinator): a placeholder scene that honours VineSceneAPI so the app can be built and tested before
 * the real painting exists. The scene worker replaces this file entirely (keeping the API).
 */
import type { PlanId, VineFrame, VineSceneAPI, VineScreenPoint } from '../types';
import { PLANS } from '../types';
import { createGardener } from './gardener';
import type { Gardener } from './gardenerApi';
import { COTTAGE, PILE, WORLD, fitCamera, zoomTransform, type Camera, type Insets, type ZoomXf } from './geom';

export function createVineScene(canvas: HTMLCanvasElement): VineSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let cam: Camera = fitCamera(1, 1, 1, insets);
  let size = { w: 0, h: 0, ratio: 1 };
  let lastZ: ZoomXf = { a: 1, bx: 0, by: 0 };
  let lastT = -1;
  const gardeners: Record<PlanId, Gardener> = { minimum: createGardener('minimum', 2), fixed: createGardener('fixed', 2) };
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));

  const layout = () => {
    if (size.w <= 0 || size.h <= 0) return;
    cam = fitCamera(size.w, size.h, size.ratio, insets);
    canvas.width = Math.round(cam.cssW * cam.dpr);
    canvas.height = Math.round(cam.cssH * cam.dpr);
    canvas.style.width = `${cam.cssW}px`;
    canvas.style.height = `${cam.cssH}px`;
    resolveReady();
  };

  const toScreen = (x: number, y: number): VineScreenPoint => {
    const sx = cam.ox + x * cam.s;
    const sy = cam.oy + y * cam.s;
    return { x: lastZ.a * sx + lastZ.bx, y: lastZ.a * sy + lastZ.by };
  };

  return {
    ready,
    resize(w, h, ratio) {
      size = { w, h, ratio };
      layout();
    },
    setInsets(i) {
      insets = { top: Math.max(0, i.top), bottom: Math.max(0, i.bottom), side: Math.max(0, i.side ?? 0) };
      layout();
    },
    render(frame: VineFrame) {
      const c = cam;
      const z = zoomTransform(c, insets, frame.camera?.zoom ?? 1, frame.camera?.focus ?? 'both');
      lastZ = z;
      const t = frame.timeMs / 1000;
      const dt = lastT < 0 || t < lastT ? 0 : Math.min(0.1, t - lastT);
      lastT = t;
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
      ctx.clearRect(0, 0, c.cssW, c.cssH);
      ctx.fillStyle = '#FBF6EA';
      ctx.fillRect(0, 0, c.cssW, c.cssH);
      const A = c.dpr * z.a * c.s;
      ctx.setTransform(A, 0, 0, A, c.dpr * (z.a * c.ox + z.bx), c.dpr * (z.a * c.oy + z.by));
      ctx.fillStyle = '#BFDDF2';
      ctx.fillRect(0, 0, WORLD.width, WORLD.horizon);
      ctx.fillStyle = '#C9B98A';
      ctx.fillRect(0, WORLD.horizon, WORLD.width, WORLD.height - WORLD.horizon);
      for (const cv of frame.cottages) {
        const g = COTTAGE[cv.id];
        ctx.fillStyle = '#D9CDB4';
        ctx.fillRect(g.wall.x0, g.wall.y0, g.wall.x1 - g.wall.x0, g.wall.y1 - g.wall.y0);
        ctx.fillStyle = 'rgba(160,40,40,0.8)';
        const h = (g.vine.y1 - g.vine.y0) * cv.vine;
        ctx.fillRect(g.vine.x0, g.vine.y1 - h, g.vine.x1 - g.vine.x0, h);
        ctx.fillStyle = 'rgba(200,110,40,0.9)';
        const r = 14 * Math.sqrt(cv.pile);
        ctx.beginPath();
        ctx.arc(PILE[cv.id].x, PILE[cv.id].y, r, Math.PI, 0);
        ctx.fill();
        const gd = gardeners[cv.id];
        const target = { x: (g.vine.x0 + g.vine.x1) / 2, y: g.vine.y1 - h };
        gd.update(dt, { activity: cv.paidOff ? 'rest' : frame.monthsPerSecond > 0 ? 'prune' : 'idle', target, pace: 1 }, t, frame.reducedMotion);
        gd.draw(ctx);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    labelAnchor(id) {
      const r = COTTAGE[id].ridge;
      return toScreen(r.x, r.y - 14);
    },
    pileAnchor(id) {
      return toScreen(PILE[id].x, PILE[id].y - 40);
    },
    cameraTransform() {
      return lastZ;
    },
    destroy() {
      for (const id of PLANS) void id;
    },
  };
}
