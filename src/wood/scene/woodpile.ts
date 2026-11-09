/**
 * The woodpile beside each tree: the fees paid. Cordwood stacked between two pairs of stakes on two bearers; every
 * log is the same dollars on both piles (logDollars), so the piles compare directly. Logs are laid row by row from
 * the bottom, left to right on A's pile and right to left on B's (toward the tree), and the log being cut grows into
 * its place (never pops in). Each cut end is painted once into a small sprite: a dark bark rim, a pale face, growth
 * rings and a check; the stack's gaps are shadow.
 */
import { Rand } from '../../scene/prng';
import { makeCanvas, rgba } from '../../scene/watercolor';
import type { FundId } from '../types';
import { PILE, PILES } from './geom';

type Ctx = CanvasRenderingContext2D;
const VARIANTS = 7;

/** one cut log end, r world units, painted at q px per world unit */
function logEnd(seed: number, r: number, q: number): HTMLCanvasElement {
  const pad = 2;
  const S = Math.ceil((r * 2 + pad * 2) * q);
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d')!;
  ctx.scale(q, q);
  const rnd = new Rand(seed);
  const cx = r + pad;
  const cy = r + pad;
  const rr = r * rnd.range(0.86, 1.04);
  const wob = (a: number) => 1 + Math.sin(a * 3 + seed) * 0.04 + Math.sin(a * 5 + seed * 0.3) * 0.03;
  const ring = (k: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const R = rr * k * wob(a);
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R * 0.96;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  // bark rim
  ctx.fillStyle = rgba(rnd.pick(['#5E4630', '#6B4F35', '#56402C']), 0.92);
  ring(1);
  ctx.fill();
  // the pale cut face, lit from the upper left
  const g = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.35, rr * 0.1, cx, cy, rr * 0.9);
  g.addColorStop(0, '#F3E3BE');
  g.addColorStop(0.6, rnd.pick(['#E2C894', '#DEC08A', '#E6CE9C']));
  g.addColorStop(1, '#BE9664');
  ctx.fillStyle = g;
  ring(0.84);
  ctx.fill();
  // growth rings, off-centre a little (the pith is rarely central)
  ctx.strokeStyle = 'rgba(150,108,64,0.38)';
  ctx.lineWidth = Math.max(0.12, r * 0.035);
  const ox = rnd.range(-0.12, 0.12) * rr;
  const oy = rnd.range(-0.12, 0.12) * rr;
  ctx.save();
  ctx.translate(ox, oy);
  for (let k = 0.18; k < 0.78; k += rnd.range(0.12, 0.17)) {
    ring(k);
    ctx.stroke();
  }
  ctx.restore();
  // a radial check (drying crack) and the pith
  ctx.strokeStyle = 'rgba(90,60,36,0.5)';
  ctx.lineWidth = Math.max(0.15, r * 0.05);
  const a = rnd.range(0, Math.PI * 2);
  ctx.beginPath();
  ctx.moveTo(cx + ox, cy + oy);
  ctx.lineTo(cx + Math.cos(a) * rr * 0.8, cy + Math.sin(a) * rr * 0.8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(110,74,44,0.6)';
  ctx.beginPath();
  ctx.arc(cx + ox, cy + oy, r * 0.06, 0, Math.PI * 2);
  ctx.fill();
  // ink: a broken contour round the bark
  ctx.strokeStyle = 'rgba(47,42,34,0.55)';
  ctx.lineWidth = Math.max(0.15, r * 0.06);
  ctx.setLineDash([r * 0.9, r * 0.25]);
  ring(1);
  ctx.stroke();
  ctx.setLineDash([]);
  return cv;
}

export class Woodpile {
  private ends: HTMLCanvasElement[] = [];
  private frame: HTMLCanvasElement;
  private readonly slots: Array<{ x: number; y: number; v: number }> = [];
  private readonly x0: number;
  private readonly q: number;

  constructor(
    readonly id: FundId,
    q: number,
  ) {
    this.q = q;
    const { cols, rows, r } = PILE;
    const P = PILES[id];
    const w = cols * r * 2;
    this.x0 = P.x - w / 2;
    for (let v = 0; v < VARIANTS; v++) this.ends.push(logEnd(3301 + v * 97 + (id === 'a' ? 0 : 7), r, q));
    // slots: bottom row first; A fills toward its tree (left to right), B too (right to left); odd rows sit half a
    // log across and a little lower (logs settle into the gaps)
    const rnd = new Rand(id === 'a' ? 811 : 823);
    for (let row = 0; row < rows; row++) {
      for (let k = 0; k < cols; k++) {
        const col = id === 'a' ? k : cols - 1 - k;
        const shift = row % 2 ? r * 0.5 * (id === 'a' ? 1 : -1) : 0;
        const x = this.x0 + r + col * r * 2 + shift + rnd.range(-0.5, 0.5);
        const y = P.y - 6 - r - row * r * 1.78 + rnd.range(-0.4, 0.4);
        this.slots.push({ x: Math.max(this.x0 + r * 0.8, Math.min(this.x0 + w - r * 0.8, x)), y, v: rnd.int(0, VARIANTS - 1) });
      }
    }
    this.frame = this.paintFrame();
  }

  /** the bearers and the stakes (painted once) */
  private paintFrame(): HTMLCanvasElement {
    const { cols, rows, r } = PILE;
    const P = PILES[this.id];
    const w = cols * r * 2;
    const h = rows * r * 1.78 + 20;
    const pad = 10;
    const cv = makeCanvas(Math.ceil((w + pad * 2) * this.q), Math.ceil((h + pad * 2) * this.q));
    const ctx = cv.getContext('2d')!;
    ctx.scale(this.q, this.q);
    ctx.translate(-(this.x0 - pad), -(P.y - h - pad + 6));
    const rnd = new Rand(this.id === 'a' ? 901 : 907);
    ctx.lineCap = 'round';
    // the shadow it casts to the lower right
    ctx.fillStyle = 'rgba(52,70,50,0.18)';
    ctx.beginPath();
    ctx.ellipse(P.x + 8, P.y + 2, w * 0.56, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // two bearers (poles laid on the ground under the stack)
    for (const yy of [P.y - 2, P.y + 1]) {
      ctx.strokeStyle = rgba('#6E5238', 0.85);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x0 - 5, yy);
      ctx.lineTo(this.x0 + w + 5, yy + rnd.range(-0.6, 0.6));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(47,42,34,0.4)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    // stakes at each end, a pair, leaning in a touch
    for (const [sx, lean] of [
      [this.x0 - 2, 1.2],
      [this.x0 + w + 2, -1.2],
    ] as const) {
      for (const dx of [-1.8, 1.8]) {
        ctx.strokeStyle = rgba('#7A5C3E', 0.9);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(sx + dx, P.y + 2);
        ctx.lineTo(sx + dx + lean, P.y - rows * r * 1.78 - 8);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(47,42,34,0.55)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(244,226,190,0.4)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx + dx - 0.7, P.y);
        ctx.lineTo(sx + dx - 0.7 + lean, P.y - rows * r * 1.78 - 6);
        ctx.stroke();
      }
    }
    this.frameOrigin = { x: this.x0 - pad, y: P.y - h - pad + 6, w: w + pad * 2, h: h + pad * 2 };
    return cv;
  }
  private frameOrigin = { x: 0, y: 0, w: 0, h: 0 };

  /** draw the pile holding `logs` logs (a fraction grows the next one in); ctx maps world units */
  draw(ctx: Ctx, logs: number): void {
    const o = this.frameOrigin;
    ctx.drawImage(this.frame, o.x, o.y, o.w, o.h);
    const n = Math.max(0, Math.min(this.slots.length, logs));
    const full = Math.floor(n + 1e-9);
    const part = n - full;
    const { r } = PILE;
    // the dark of the stack behind the log ends (the gaps between round logs), row by row as rows fill
    if (full > 0) {
      ctx.fillStyle = 'rgba(58,40,26,0.55)';
      const rowsFull = Math.ceil(full / PILE.cols);
      for (let row = 0; row < rowsFull; row++) {
        const inRow = Math.min(PILE.cols, full - row * PILE.cols);
        const first = this.slots[row * PILE.cols]!;
        const last = this.slots[row * PILE.cols + inRow - 1]!;
        const xa = Math.min(first.x, last.x);
        const xb = Math.max(first.x, last.x);
        ctx.fillRect(xa - r * 0.6, first.y - r * 0.7, xb - xa + r * 1.2, r * 1.4);
      }
    }
    const S = this.ends[0]!;
    const size = S.width / this.q;
    for (let i = 0; i < full; i++) {
      const s = this.slots[i]!;
      ctx.drawImage(this.ends[s.v]!, s.x - size / 2, s.y - size / 2, size, size);
    }
    if (part > 0.01 && full < this.slots.length) {
      const s = this.slots[full]!;
      const k = 0.35 + 0.65 * part;
      ctx.save();
      ctx.globalAlpha = Math.min(1, part * 1.6);
      ctx.drawImage(this.ends[s.v]!, s.x - (size * k) / 2, s.y - (size * k) / 2, size * k, size * k);
      ctx.restore();
    }
  }

  /** the top of the pile (world), for the falling twigs to land near */
  top(logs: number): { x: number; y: number } {
    const i = Math.max(0, Math.min(this.slots.length - 1, Math.floor(logs)));
    return this.slots[i]!;
  }
}
