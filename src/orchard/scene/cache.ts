/**
 * A small offscreen picture of something that is mostly still (a figure standing at ease, a parked cart). While it
 * keeps changing (a walk, a lift of the shafts) it is drawn straight onto the scene, since repainting a separate
 * canvas every frame costs more than drawing in place; once its signature (a string of rounded pose values) has held
 * for a frame it is painted into its own canvas once and from then on laid down with one drawImage, until it changes
 * again. The many figures that stand about cost almost nothing.
 */
import { makeCanvas } from '../../scene/watercolor';

export class Cached {
  private cv: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** the signature the cached picture shows ('' when it is stale) */
  private key = '';
  /** the signature seen last frame */
  private seen = '';
  private box = { x: 0, y: 0, w: 0, h: 0 };

  /**
   * Draw through the cache. `box` is the world rect the thing fits in; `sig` its signature; `paint` draws it in world
   * units (the context's transform is set for that).
   */
  draw(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, sig: string, paint: (c: CanvasRenderingContext2D) => void): void {
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b);
    const key = `${sig}|${sc.toFixed(3)}|${Math.round(box.x * 4)},${Math.round(box.y * 4)}`;
    if (key === this.key && this.cv) {
      this.seen = key;
      ctx.drawImage(this.cv, this.box.x, this.box.y, this.box.w, this.box.h);
      return;
    }
    const settled = key === this.seen;
    this.seen = key;
    if (!settled) {
      // still changing: draw in place
      paint(ctx);
      return;
    }
    this.key = key;
    const W = Math.max(2, Math.ceil(box.w * sc) + 2);
    const H = Math.max(2, Math.ceil(box.h * sc) + 2);
    if (!this.cv || this.cv.width < W || this.cv.height < H || this.cv.width > W * 2 || this.cv.height > H * 2) {
      this.cv = makeCanvas(W, H);
      this.ctx = this.cv.getContext('2d')!;
    }
    const c = this.ctx!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.setTransform(sc, 0, 0, sc, -box.x * sc, -box.y * sc);
    c.imageSmoothingQuality = 'low';
    paint(c);
    this.box = { x: box.x, y: box.y, w: this.cv.width / sc, h: this.cv.height / sc };
    ctx.drawImage(this.cv, this.box.x, this.box.y, this.box.w, this.box.h);
  }
}

/** a number rounded for a signature */
export const r4 = (v: number, q = 0.25): string => Math.round(v / q).toString(36);
