/**
 * Static backdrop (paper + ground wash). Rendered once per size into an offscreen canvas and handed to the
 * visible canvas as its CSS background, so the dynamic canvas only ever draws trees (transparent).
 */
import { WORLD } from './types';
import { ensurePaperTile } from './sprites';
import { makeCanvas, makeGroundSprite, paintPaperBackdrop } from './watercolor';

export interface Camera {
  cssW: number;
  cssH: number;
  dpr: number;
  /** css px per world unit */
  s: number;
  /** screen y of the ground line (css px) */
  oyGround: number;
}

export function fitCamera(cssW: number, cssH: number, dpr: number, viewWidth: number): Camera {
  const band = WORLD.viewTop - WORLD.viewBottom;
  const s = Math.min(cssW / viewWidth, cssH / band);
  const oyGround = (cssH - band * s) / 2 + WORLD.viewTop * s;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, oyGround };
}

export async function applyBackdrop(canvas: HTMLCanvasElement, cam: Camera): Promise<void> {
  const tile = await ensurePaperTile();
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const bg = makeCanvas(Wd, Hd);
  const ctx = bg.getContext('2d')!;
  paintPaperBackdrop(ctx, Wd, Hd, tile, cam.dpr);
  const gh = Math.round(78 * cam.s * cam.dpr);
  const ground = makeGroundSprite(31, Wd, gh, (cam.s * cam.dpr) / 1.2);
  ctx.drawImage(ground, 0, Math.round(cam.oyGround * cam.dpr - gh * 0.42));
  const st = canvas.style;
  st.backgroundImage = `url(${bg.toDataURL('image/jpeg', 0.94)})`;
  st.backgroundSize = `${cam.cssW}px ${cam.cssH}px`;
  st.backgroundRepeat = 'no-repeat';
  st.backgroundColor = '#FBF6EA';
}
