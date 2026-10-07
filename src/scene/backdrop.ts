/**
 * Static backdrop: paper, soft meadow wash along the ground line, warm soil cut-away band beneath it.
 * Rendered once per size into an offscreen canvas and handed to the visible canvas as its CSS background,
 * so the dynamic canvas only ever draws trees (transparent).
 */
import { WORLD } from './types';
import { ensurePaperTile } from './sprites';
import { makeCanvas, makeGroundSprite, makeSoilSprite, paintPaperBackdrop } from './watercolor';
import { SOIL_DEPTH } from './treeModel';

export interface Insets {
  top: number;
  bottom: number;
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
  const s = Math.min(cssW / viewWidth, availH / band);
  const oyGround = insets.top + (availH - band * s) / 2 + WORLD.viewTop * s;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, oyGround, ox0: (cssW - viewWidth * s) / 2 };
}

export async function applyBackdrop(canvas: HTMLCanvasElement, cam: Camera): Promise<HTMLCanvasElement> {
  const tile = await ensurePaperTile();
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const bg = makeCanvas(Wd, Hd);
  const ctx = bg.getContext('2d')!;
  paintPaperBackdrop(ctx, Wd, Hd, tile, cam.dpr);
  const d = cam.dpr;
  // soil cut-away (under the ground line, fading downward and at the ends)
  const soilH = Math.round(SOIL_DEPTH * 1.2 * cam.s * d);
  const soilW = Math.round(Math.min(cam.cssW, WORLD.width * cam.s * 0.97) * d);
  const soil = makeSoilSprite(53, soilW, soilH, (cam.s * d) / 1.2);
  const gy = cam.oyGround * d;
  ctx.drawImage(soil, Math.round((Wd - soilW) / 2), Math.round(gy + 2 * cam.s * d));
  // meadow wash across the whole width
  const gh = Math.round(78 * cam.s * d);
  const ground = makeGroundSprite(31, Wd, gh, (cam.s * d) / 1.2);
  ctx.drawImage(ground, 0, Math.round(gy - gh * 0.42));
  const st = canvas.style;
  st.backgroundImage = `url(${bg.toDataURL('image/jpeg', 0.94)})`;
  st.backgroundSize = `${cam.cssW}px ${cam.cssH}px`;
  st.backgroundRepeat = 'no-repeat';
  st.backgroundColor = '#FBF6EA';
  return bg;
}
