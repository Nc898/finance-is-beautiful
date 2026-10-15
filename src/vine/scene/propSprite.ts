/** Sprites for the props and leaves: painted on a CPU-backed canvas, then moved to an ordinary one for blitting. */
import { makeCanvas } from '../../scene/watercolor';
import { grain, type Sprite } from './art';

/**
 * A sprite painted on a CPU-backed canvas (reading its pixels back for the paper grain is slow on a GPU canvas);
 * `finishSprite` grains it and moves the result onto an ordinary canvas for fast blitting.
 */
export function cpuSprite(w: number, h: number, px: number, py: number, q: number): { sp: Sprite; ctx: CanvasRenderingContext2D } {
  const cv = makeCanvas(Math.ceil(w * q), Math.ceil(h * q));
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(q, 0, 0, q, px * q, py * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { sp: { cv, w: cv.width / q, h: cv.height / q, px, py }, ctx };
}

/** the CPU-backed original of a finished sprite, kept for sprites that other sprites are painted from (drawing a GPU canvas into a CPU one is slow) */
const twins = new WeakMap<Sprite, HTMLCanvasElement>();
export const cpuTwin = (sp: Sprite): HTMLCanvasElement => twins.get(sp) ?? sp.cv;

export function finishSprite(sp: Sprite, seed: number, q: number, amt = 0.6, keep = false): Sprite {
  grain(sp.cv, seed, amt, Math.max(1, Math.round(q * 0.55)));
  const out = makeCanvas(sp.cv.width, sp.cv.height);
  out.getContext('2d')!.drawImage(sp.cv, 0, 0);
  if (keep) twins.set(sp, sp.cv);
  sp.cv = out;
  return sp;
}
