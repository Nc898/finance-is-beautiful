/**
 * Static backdrop: paper, soft meadow wash along the ground line, warm soil cut-away band beneath it.
 * Rendered once per size into an offscreen canvas and handed to the visible canvas as its CSS background,
 * so the dynamic canvas only ever draws trees (transparent).
 */
import { WORLD } from './types';
import { ensurePaperTile } from './sprites';
import { makeCanvas, makeDeepSoil, makeGroundSprite, paintPaperBackdrop } from './watercolor';
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

const bgUrls = new WeakMap<HTMLCanvasElement, string>();
const bgToken = new WeakMap<HTMLCanvasElement, number>();

/**
 * Use a painted backdrop as the canvas's CSS background. The JPEG is encoded with toBlob (off the main
 * thread in Chromium) and decoded before it is swapped in, so nothing blocks or flashes; a newer call
 * for the same canvas (e.g. after a resize) wins and older results are dropped.
 */
export async function setCanvasBackground(canvas: HTMLCanvasElement, bg: HTMLCanvasElement, cssW: number, cssH: number): Promise<void> {
  const token = (bgToken.get(canvas) ?? 0) + 1;
  bgToken.set(canvas, token);
  const blob = await new Promise<Blob | null>((r) => bg.toBlob(r, 'image/jpeg', 0.94));
  const url = blob ? URL.createObjectURL(blob) : bg.toDataURL('image/jpeg', 0.94);
  if (blob) {
    const im = new Image();
    im.src = url;
    try {
      await im.decode();
    } catch {
      /* swap anyway */
    }
  }
  if (bgToken.get(canvas) !== token) {
    if (blob) URL.revokeObjectURL(url);
    return;
  }
  const st = canvas.style;
  st.backgroundImage = `url(${url})`;
  st.backgroundSize = `${cssW}px ${cssH}px`;
  st.backgroundRepeat = 'no-repeat';
  st.backgroundColor = '#FBF6EA';
  const old = bgUrls.get(canvas);
  if (old) URL.revokeObjectURL(old);
  if (blob) bgUrls.set(canvas, url);
}

export function fitCamera(cssW: number, cssH: number, dpr: number, viewWidth: number, insets: Insets = { top: 0, bottom: 0 }): Camera {
  const band = WORLD.viewTop - WORLD.viewBottom;
  const availH = Math.max(40, cssH - insets.top - insets.bottom);
  const s = Math.min(Math.max(40, cssW - (insets.side ?? 0)) / viewWidth, availH / band);
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
  const soilW = Wd; // the soil fills the whole underground, edge to edge
  const gy = cam.oyGround * d;
  const soilTop = Math.round(gy - 6 * cam.s * d); // tucked under the meadow so no paper shows between them
  // the soil runs from just under the meadow to the bottom of the page
  const soil = makeDeepSoil(53, soilW, Math.max(soilH, Hd - soilTop), (cam.s * d) / 1.2, soilH);
  ctx.drawImage(soil, Math.round((Wd - soilW) / 2), soilTop);
  // meadow wash across the whole width
  const gh = Math.round(78 * cam.s * d);
  const ground = makeGroundSprite(31, Wd, gh, (cam.s * d) / 1.2);
  ctx.drawImage(ground, 0, Math.round(gy - gh * 0.42));
  await setCanvasBackground(canvas, bg, cam.cssW, cam.cssH);
  return bg;
}
