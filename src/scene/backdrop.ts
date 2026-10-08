/**
 * Static backdrop: paper, soft meadow wash along the ground line, warm soil cut-away band beneath it.
 * Rendered once per size into an offscreen canvas and handed to the visible canvas as its CSS background,
 * so the dynamic canvas only ever draws trees (transparent).
 */
import { WORLD } from './types';
import { ensurePaperTile } from './sprites';
import { makeCanvas, makeDeepSoil, makeGroundSprite, paintFence, paintPaperBackdrop, paintSky } from './watercolor';
import { SOIL_DEPTH } from './treeModel';

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

/**
 * The backdrop in two layers: the paper (the page itself, never zoomed) and the ground (meadow wash and
 * soil cut-away, part of the world, so it zooms with the camera). The ground is cached at 1.5x density
 * so the opening close-up stays soft rather than blurry.
 */
export interface Backdrop {
  paper: HTMLCanvasElement;
  ground: HTMLCanvasElement;
  /** css y of the ground canvas's top edge; it spans to the bottom of the canvas */
  groundTop: number;
}

export async function applyBackdrop(canvas: HTMLCanvasElement, cam: Camera): Promise<Backdrop> {
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
  const GW = Math.round(cam.cssW * gd);
  const GH = Math.max(2, Math.round((cam.cssH - groundTop) * gd));
  const ground = makeCanvas(GW, GH);
  const ctx = ground.getContext('2d')!;
  const gy = (cam.oyGround - groundTop) * gd;
  // soil cut-away from just under the meadow to the bottom of the page, edge to edge
  const soilH = Math.round(SOIL_DEPTH * 1.2 * cam.s * gd);
  const soilTop = Math.round(gy - 6 * cam.s * gd); // tucked under the meadow so no paper shows between them
  const soil = makeDeepSoil(53, GW, Math.max(soilH, GH - soilTop), (cam.s * gd) / 1.2, soilH);
  ctx.drawImage(soil, 0, soilTop);
  // meadow wash across the whole width
  const gh = Math.round(78 * cam.s * gd);
  const meadow = makeGroundSprite(31, GW, gh, (cam.s * gd) / 1.2);
  ctx.drawImage(meadow, 0, Math.round(gy - gh * 0.42));
  // a weathered split-rail fence along the back of the meadow
  paintFence(ctx, GW, gy, cam.s * gd, 61, [WORLD.treeX.A, WORLD.treeX.B].map((x) => (cam.ox0 + x * cam.s) * gd));

  // Both are drawn into the visible canvas each frame (GPU texture copies): no CSS image, no readback.
  canvas.style.backgroundColor = '#FBF6EA';
  // finish the queued GPU painting now (before the scene is revealed), not on its first visible frame
  pctx.getImageData(0, 0, 1, 1);
  ctx.getImageData(0, 0, 1, 1);
  return { paper, ground, groundTop };
}
