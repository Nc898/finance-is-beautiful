/**
 * Static backdrop: paper and sky, and the ground (far meadow, grass, fence, soil cut-away; see meadow.ts).
 * Rendered once per size into an offscreen canvas and handed to the visible canvas as its CSS background,
 * so the dynamic canvas only ever draws trees (transparent).
 */
import { WORLD } from './types';
import { ensurePaperTile } from './sprites';
import { makeCanvas, paintPaperBackdrop, paintSky } from './watercolor';
import { makeTooth, paintMeadowGround, type MeadowGeom, type Tooth } from './meadow';

export interface Insets {
  top: number;
  bottom: number;
  /** Width reserved for a side panel when choosing the scale; centring is unaffected. */
  side?: number;
}
export interface Camera {
  cssW: number;
  cssH: number;
  dpr: number;
  /** css px per world unit */
  s: number;
  /** screen y of the ground line (css px) */
  oyGround: number;
  /** screen x of world x = 0 */
  ox0: number;
}

export function fitCamera(cssW: number, cssH: number, dpr: number, viewWidth: number, insets: Insets = { top: 0, bottom: 0 }): Camera {
  const band = WORLD.viewTop - WORLD.viewBottom;
  const availH = Math.max(40, cssH - insets.top - insets.bottom);
  const s = Math.min(Math.max(40, cssW - (insets.side ?? 0)) / viewWidth, availH / band);
  const oyGround = insets.top + (availH - band * s) / 2 + WORLD.viewTop * s;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, oyGround, ox0: (cssW - viewWidth * s) / 2 };
}

/** A high-density copy of the ground for the opening close-up: it covers the camera's view for zoom >= CLOSE_MIN_ZOOM. */
export interface CloseGround {
  canvas: HTMLCanvasElement;
  /** its place in the ground canvas, css px (the ground canvas's top-left is 0, 0) */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** css x of the camera focus it was built for */
  focusX: number;
}
export const CLOSE_MIN_ZOOM = 2.6;
const CLOSE_MAX_ZOOM = 3.7;

/**
 * The backdrop in two layers: the paper (the page itself, never zoomed) and the ground (far meadow, grass, fence
 * and soil cut-away, part of the world, so it zooms with the camera). The ground is cached at 1.5x density; the
 * window the opening close-up looks at is painted again at a higher density (`closeFor`), so the zoomed start stays
 * crisp rather than blurry.
 */
export interface Backdrop {
  paper: HTMLCanvasElement;
  ground: HTMLCanvasElement;
  /** css y of the ground canvas's top edge; it spans to the bottom of the canvas */
  groundTop: number;
  /** the close-up window for a camera focus at css x (null while it is still being painted) */
  closeFor(focusX: number): CloseGround | null;
}

let toothFor: { tile: CanvasImageSource; tooth: Tooth } | null = null;

export async function applyBackdrop(canvas: HTMLCanvasElement, cam: Camera, insets: Insets = { top: 0, bottom: 0 }, closeFocusX?: number): Promise<Backdrop> {
  const t0 = performance.now();
  const tile = await ensurePaperTile();
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const paper = makeCanvas(Wd, Hd);
  const pctx = paper.getContext('2d')!;
  paintPaperBackdrop(pctx, Wd, Hd, tile, cam.dpr);
  // distant sky and clouds stay in the paper layer, so they hold still while the world zooms
  paintSky(pctx, Wd, Hd, cam.oyGround - 20 * cam.s, cam.dpr);

  const gd = cam.dpr * 1.5;
  const groundTop = Math.max(0, cam.oyGround - 72 * cam.s); // room for the fence above the meadow
  const cssH = Math.max(2 / gd, cam.cssH - groundTop);
  const GW = Math.round(cam.cssW * gd);
  const GH = Math.max(2, Math.round(cssH * gd));
  const ground = makeCanvas(GW, GH);
  const ctx = ground.getContext('2d')!;
  if (!toothFor || toothFor.tile !== tile) toothFor = { tile, tooth: makeTooth(tile) };
  const tooth = toothFor.tooth;
  const geom: MeadowGeom = {
    W: cam.cssW,
    H: cssH,
    gy: cam.oyGround - groundTop,
    s: cam.s,
    dpr: cam.dpr,
    trees: [WORLD.treeX.A, WORLD.treeX.B].map((x) => cam.ox0 + x * cam.s),
  };
  // the whole ground: soil cut-away, far meadow, grass band, weathered fence, wildflowers, turf edge
  paintMeadowGround(ctx, geom, { scale: gd, x0: 0, y0: 0, x1: geom.W, y1: geom.H }, tooth);

  // the close-up window: what the camera sees from CLOSE_MIN_ZOOM up, at a higher density
  const closeCache = new Map<number, CloseGround>();
  const buildClose = (fx: number): CloseGround => {
    let xa = Infinity;
    let xb = -Infinity;
    let ya = Infinity;
    let yb = -Infinity;
    const Cx = cam.cssW / 2;
    const Cy = insets.top + (cam.cssH - insets.top - insets.bottom) * 0.6;
    for (const z of [CLOSE_MIN_ZOOM, 3, 3.4, CLOSE_MAX_ZOOM]) {
      const k = 1 - 1 / z;
      for (const fyw of [14, 44, 74]) {
        const Fy = cam.oyGround - fyw * cam.s;
        for (const sx of [0, cam.cssW]) {
          const x = fx + (sx - fx - (Cx - fx) * k) / z;
          xa = Math.min(xa, x);
          xb = Math.max(xb, x);
        }
        for (const sy of [0, cam.cssH]) {
          const y = Fy + (sy - Fy - (Cy - Fy) * k) / z;
          ya = Math.min(ya, y);
          yb = Math.max(yb, y);
        }
      }
    }
    const x0 = Math.max(0, Math.floor(xa - 6));
    const x1 = Math.min(geom.W, Math.ceil(xb + 6));
    const y0 = Math.max(0, Math.floor(ya - groundTop - 6));
    const y1 = Math.min(geom.H, Math.ceil(yb - groundTop + 6));
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const scale = Math.min(cam.dpr * 2.2, Math.sqrt(8e6 / (w * h)));
    const cv = makeCanvas(w * scale, h * scale);
    const cx = cv.getContext('2d')!;
    paintMeadowGround(cx, geom, { scale, x0, y0, x1, y1 }, tooth);
    return { canvas: cv, x0, y0, w, h, focusX: fx };
  };
  const closeFor = (fx: number): CloseGround | null => {
    const key = Math.round(fx);
    const have = closeCache.get(key);
    if (have) return have;
    // painted off the frame: the base ground stands in until it is ready
    if (!pending.has(key)) {
      pending.add(key);
      setTimeout(() => closeCache.set(key, buildClose(fx)), 0);
    }
    return null;
  };
  const pending = new Set<number>();
  if (closeFocusX !== undefined) {
    closeCache.set(Math.round(closeFocusX), buildClose(closeFocusX));
    pending.add(Math.round(closeFocusX));
  }

  // Both are drawn into the visible canvas each frame (GPU texture copies): no CSS image, no readback.
  canvas.style.backgroundColor = '#FBF6EA';
  // finish the queued GPU painting now (before the scene is revealed), not on its first visible frame
  pctx.getImageData(0, 0, 1, 1);
  ctx.getImageData(0, 0, 1, 1);
  for (const c of closeCache.values()) c.canvas.getContext('2d')!.getImageData(0, 0, 1, 1);
  try {
    performance.measure('ttg-ground-paint', { start: t0, end: performance.now() });
  } catch {
    /* timing is only a convenience */
  }
  return { paper, ground, groundTop, closeFor };
}
