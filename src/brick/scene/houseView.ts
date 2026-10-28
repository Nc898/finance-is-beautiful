/**
 * One house as it stands at a moment: the pencil drawing, and over it the part laid so far, copied unit by unit
 * (brick, sill, lintel, tile, ridge tile, chimney course, cap, pot; see housePlan.ts) out of the painted sprites into
 * its own canvas. A unit of the wall comes from the wall sprite; the roof and chimney, and an opening's frame and
 * glass once its lintel is set, from the finished sprite. Laying more only copies the new units; going back (a
 * scrub) clears and copies again. Nothing fades or sweeps: a brick is either laid or not.
 */
import { makeCanvas } from '../../scene/watercolor';
import { housePlan, laidCount, type HousePlan, type Unit } from './housePlan';
import { paintFinishedSprite, paintPencilSprite, paintWallSprite, spriteBox, type SpriteBox } from './housePaint';
import { GROUND_Y } from './geom';
import type { LoanId } from '../types';

export class HouseView {
  readonly id: LoanId;
  readonly plan: HousePlan;
  readonly box: SpriteBox;
  readonly q: number;
  private pencil: HTMLCanvasElement;
  private wall: HTMLCanvasElement;
  private finished: HTMLCanvasElement;
  private laid: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  /** how many units are on the laid canvas */
  private count = 0;
  /** openings whose frame is in */
  private open: boolean[];

  constructor(id: LoanId, q: number) {
    this.id = id;
    this.q = q;
    this.plan = housePlan(id);
    this.box = spriteBox(id);
    this.pencil = paintPencilSprite(id, q);
    this.wall = paintWallSprite(id, q);
    this.finished = paintFinishedSprite(id, q, this.wall);
    this.laid = makeCanvas(this.wall.width, this.wall.height);
    this.lctx = this.laid.getContext('2d')!;
    this.open = this.plan.openings.map(() => false);
  }

  /** units laid now */
  get laidUnits(): number {
    return this.count;
  }

  /** the unit the bricklayer sets next (or the last one, when all are laid) */
  next(): Unit {
    const u = this.plan.units;
    return u[Math.min(u.length - 1, this.count)]!;
  }

  private copy(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): void {
    const q = this.q;
    const b = this.box;
    const px0 = Math.max(0, Math.floor((x0 - b.x) * q));
    const py0 = Math.max(0, Math.floor((y0 - b.y) * q));
    const px1 = Math.min(this.laid.width, Math.ceil((x1 - b.x) * q));
    const py1 = Math.min(this.laid.height, Math.ceil((y1 - b.y) * q));
    const w = px1 - px0;
    const h = py1 - py0;
    if (w <= 0 || h <= 0) return;
    this.lctx.clearRect(px0, py0, w, h);
    this.lctx.drawImage(src, px0, py0, w, h, px0, py0, w, h);
  }

  private lay(i: number): void {
    const u = this.plan.units[i]!;
    const src = u.stage === 0 ? this.wall : this.finished;
    for (const r of u.rects) this.copy(src, r.x0, r.y0, r.x1, r.y1);
    if (u.opens !== undefined && !this.open[u.opens]) {
      this.open[u.opens] = true;
      for (const r of this.plan.openings[u.opens]!.show) this.copy(this.finished, r.x0, r.y0, r.x1, r.y1);
    }
  }

  /** bring the laid canvas to `built` (0 … 1) */
  set(built: number): void {
    const want = laidCount(this.plan, built);
    if (want === this.count) return;
    if (want < this.count) {
      this.lctx.clearRect(0, 0, this.laid.width, this.laid.height);
      this.open.fill(false);
      this.count = 0;
    }
    for (let i = this.count; i < want; i++) this.lay(i);
    this.count = want;
  }

  /** paint the house at its place (the caller's transform maps world units) */
  draw(ctx: CanvasRenderingContext2D): void {
    const b = this.box;
    ctx.drawImage(this.pencil, b.x, b.y, b.w, b.h);
    if (this.count > 0) ctx.drawImage(this.laid, b.x, b.y, b.w, b.h);
  }

  /** the top of the chimney pots (where smoke leaves), world */
  chimneyTop(): { x: number; y: number } {
    const c = this.plan.chim;
    return { x: (c.x0 + c.x1) / 2, y: c.potTop };
  }

  /** the ground under the wall's foot (for shadows, depth) */
  static readonly FOOT = GROUND_Y;
}
