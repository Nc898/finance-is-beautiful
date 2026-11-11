/**
 * The small life of the room and the street, each with its cause and none of it kept as state (everything is a function
 * of the wall clock, so the same time gives the same picture, and reduced motion draws none of it):
 * - a passer-by under an umbrella who walks in at one edge of the window and out at the other, now and then (a few
 *   pre-painted walking frames, a touch out of focus like the street, hidden behind the sash bars as they pass);
 * - drips from the opposite awning's scalloped edge: a bead swells, lets go, falls to the pavement and rings it;
 * - steam from the cup on the shelf behind the counter, curling up and thinning out;
 * - dust turning slowly in the lamplight.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { LAMPS, type Pt } from './geom';
import { EAVES, PANES, PAVEMENT_Y, clipPanes } from './street';
import { INK, SHADE, blobPoly, mix, ribbon, wash } from './paint';
import { Rand as R2 } from '../../scene/prng';

const WALK_FRAMES = 8;
const FIG = { w: 64, h: 170 };
/** where the passer-by's feet are (world y) and how fast he walks */
const FEET_Y = 386;
const WALK_SPEED = 32;
const CYCLE = 31;
const STREET = { x0: 20, x1: 258 };

interface Variant {
  coat: string;
  brolly: string;
  trim: string;
  trousers: string;
}
const VARIANTS: Variant[] = [
  { coat: '#4A5864', brolly: '#2F4A6E', trim: '#1F2F46', trousers: '#2F3640' },
  { coat: '#6D4A3C', brolly: '#8A3A3A', trim: '#4F2424', trousers: '#3A332E' },
  { coat: '#3F5A4C', brolly: '#C9A24A', trim: '#6A5222', trousers: '#2D3A36' },
];

/** one frame of the walk: the umbrella, the head under it, the coat, two legs swinging */
function walkFrame(v: Variant, f: number, q: number): HTMLCanvasElement {
  const cv = makeCanvas(FIG.w * q, FIG.h * q);
  const ctx = cv.getContext('2d')!;
  ctx.scale(q, q);
  const rnd = new Rand(8100 + f);
  const ph = (f / WALK_FRAMES) * Math.PI * 2;
  const cx = FIG.w / 2;
  const bob = Math.abs(Math.sin(ph)) * 1.2;
  // legs: the leading one forward, the other back
  const hipY = 108 - bob;
  for (const side of [-1, 1]) {
    const sw = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 0.42;
    const lift = Math.max(0, Math.cos(ph + (side > 0 ? 0 : Math.PI))) * 3;
    const fx = cx + side * 2 + Math.sin(sw) * 22;
    const fy = FIG.h - 3 - lift;
    ctx.fillStyle = rgba(v.trousers, 0.92);
    ribbon(ctx, [cx + side * 2.4, hipY, (cx + fx) / 2 + side, (hipY + fy) / 2, fx, fy], 6.4, 0.3);
    ctx.fillStyle = rgba('#20252A', 0.95);
    ctx.beginPath();
    ctx.ellipse(fx + 2.5, fy + 1, 5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the coat in two values: the lit side toward the window, the shaded side violet; the hem swinging
  const sw2 = Math.sin(ph) * 1.6;
  const coatL = [cx - 11, 66 - bob, cx, 66 - bob, cx + 0.5 + sw2 * 0.5, 120 - bob, cx - 14 + sw2, 121 - bob];
  const coatR = [cx, 66 - bob, cx + 11, 66 - bob, cx + 15 + sw2, 120 - bob, cx + 0.5 + sw2 * 0.5, 120 - bob];
  wash(ctx, coatL, mix(v.coat, '#FFFFFF', 0.14), 0.92, rnd, 2, 0.03);
  wash(ctx, coatR, mix(v.coat, SHADE, 0.35), 0.94, rnd, 2, 0.03);
  ctx.fillStyle = rgba('#FFFFFF', 0.14);
  ribbon(ctx, [cx - 8, 70 - bob, cx - 10, 100 - bob], 3, 0.8);
  // the arm raised to the handle
  ctx.fillStyle = rgba(mix(v.coat, SHADE, 0.2), 0.92);
  ribbon(ctx, [cx + 9, 70 - bob, cx + 15, 56 - bob, cx + 4, 46 - bob], 5, 0.5);
  // the head, a hat
  ctx.fillStyle = rgba('#C9A88A', 0.95);
  ctx.beginPath();
  ctx.ellipse(cx, 58 - bob, 5.2, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();
  wash(ctx, [cx - 6.5, 56 - bob, cx + 6.5, 56 - bob, cx + 5, 49 - bob, cx - 5, 49 - bob], mix(v.coat, '#000000', 0.2), 0.95, rnd, 2, 0.04);
  // the umbrella: a dome with ribs and scalloped edge, tilted into the rain, a handle
  const ux = cx + 3;
  const uy = 40 - bob;
  const dome: number[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = Math.PI + (k / 16) * Math.PI;
    dome.push(ux + Math.cos(a) * 30, uy + Math.sin(a) * 17);
  }
  wash(ctx, dome, v.brolly, 0.97, rnd, 3, 0.012);
  ctx.strokeStyle = rgba(v.trim, 0.6);
  ctx.lineWidth = 0.6;
  for (let k = 1; k < 6; k++) {
    ctx.beginPath();
    ctx.moveTo(ux, uy - 17);
    ctx.quadraticCurveTo(ux + (k - 3) * 6, uy - 8, ux + (k - 3) * 11, uy);
    ctx.stroke();
  }
  ctx.fillStyle = rgba('#FFFFFF', 0.16);
  ribbon(ctx, [ux - 22, uy - 4, ux - 12, uy - 12, ux - 2, uy - 15], 2.4, 0.8);
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(ux, uy);
  ctx.lineTo(ux - 1, 50 - bob);
  ctx.stroke();
  // the legs are lost in the wet: the figure dissolves toward the pavement
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const lost = ctx.createLinearGradient(0, 118, 0, FIG.h);
  lost.addColorStop(0, 'rgba(0,0,0,0)');
  lost.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = lost;
  ctx.fillRect(0, 118, FIG.w, FIG.h - 118);
  ctx.restore();
  // a little out of focus, like the street it walks in
  const out = makeCanvas(FIG.w * q, FIG.h * q);
  const o = out.getContext('2d')!;
  o.filter = `blur(${Math.max(0.7, 1.3 * q)}px)`;
  o.drawImage(cv, 0, 0);
  return out;
}

export class Ambient {
  private frames: HTMLCanvasElement[][] = [];
  private puff: HTMLCanvasElement;
  private q: number;
  private motes: number[] = [];

  constructor(q: number) {
    this.q = Math.min(3, Math.max(1, q));
    this.frames = VARIANTS.map((v) => Array.from({ length: WALK_FRAMES }, (_, f) => walkFrame(v, f, this.q)));
    const p = makeCanvas(48, 48);
    const g = p.getContext('2d')!;
    const rg = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    rg.addColorStop(0, 'rgba(255,250,240,0.9)');
    rg.addColorStop(0.5, 'rgba(255,248,236,0.35)');
    rg.addColorStop(1, 'rgba(255,248,236,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 48, 48);
    this.puff = p;
    const rnd = new R2(61207);
    for (let i = 0; i < 34; i++) this.motes.push(rnd.range(250, 700), rnd.range(110, 420), rnd.next() * 6.28, rnd.range(0.5, 1.2), rnd.range(0.5, 1));
  }

  /** the street's life, clipped to the panes: the drips and, now and then, the passer-by */
  drawStreet(ctx: CanvasRenderingContext2D, tSec: number): void {
    ctx.save();
    clipPanes(ctx);
    // drips off the awning's edge
    EAVES.forEach((e, i) => {
      const period = 2.6 + (i % 3) * 0.9 + i * 0.13;
      const u = (tSec / period + i * 0.37) % 1;
      const fall = PAVEMENT_Y + 6 - e.y;
      if (u < 0.7) {
        const k = u / 0.7;
        const r = 0.35 + 0.8 * k;
        ctx.fillStyle = 'rgba(214,228,236,0.6)';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 1.5 + k * 0.8, r * 0.8, r * (1 + 0.4 * k), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (u < 0.8) {
        const k = (u - 0.7) / 0.1;
        const y = e.y + 2 + k * k * fall;
        ctx.strokeStyle = 'rgba(222,234,240,0.6)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(e.x, y - 3 * k);
        ctx.lineTo(e.x, y);
        ctx.stroke();
      } else {
        const k = (u - 0.8) / 0.2;
        ctx.strokeStyle = `rgba(222,234,240,${0.5 * (1 - k)})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(e.x, PAVEMENT_Y + 6, 1 + k * 4.5, 0.4 + k * 1.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    // the passer-by: one walk per cycle, from one edge to the other; direction and coat change every time
    const walk = (STREET.x1 - STREET.x0 + FIG.w) / WALK_SPEED;
    const idx = Math.floor(tSec / CYCLE);
    const local = tSec - idx * CYCLE - 5;
    if (local >= 0 && local <= walk && idx >= 0) {
      const r = new Rand(7700 + idx);
      const dir = idx % 2 === 0 ? 1 : -1;
      const v = Math.floor(r.next() * VARIANTS.length);
      const f = Math.floor((tSec * 1.6 * WALK_FRAMES) % WALK_FRAMES);
      const x = dir > 0 ? STREET.x0 - FIG.w / 2 + local * WALK_SPEED : STREET.x1 + FIG.w / 2 - local * WALK_SPEED;
      const img = this.frames[v]![f]!;
      ctx.save();
      ctx.translate(x, FEET_Y - FIG.h + 3);
      if (dir < 0) ctx.scale(-1, 1);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, -FIG.w / 2, 0, FIG.w, FIG.h);
      ctx.restore();
    }
    ctx.restore();
    void PANES;
  }

  /** steam from the cup and dust in the lamplight */
  drawRoom(ctx: CanvasRenderingContext2D, tSec: number, cup: Pt): void {
    // steam: five wisps at different heights, each curling a little, swelling and thinning as it rises
    for (let i = 0; i < 5; i++) {
      const u = (tSec * 0.12 + i / 5) % 1;
      const rise = u * 40;
      const sway = Math.sin(u * 5.2 + i * 1.9 + tSec * 0.4) * (1 + u * 4.5);
      const r = 3 + u * 8;
      ctx.globalAlpha = 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 1.3;
      ctx.drawImage(this.puff, cup.x + sway - r, cup.y - 4 - rise - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    // dust: slow, each its own way, only bright where the lamplight is
    const m = this.motes;
    for (let i = 0; i < m.length; i += 5) {
      const ph = m[i + 2]!;
      const x = m[i]! + Math.sin(tSec * 0.07 * m[i + 3]! + ph) * 14;
      const y = 110 + ((m[i + 1]! - 110 + tSec * (1.2 + m[i + 4]!) * 0.9) % 320);
      let lit = 0;
      for (const l of LAMPS) {
        const dx = (x - l.x) / 190;
        const dy = (y - l.shadeY - 20) / 280;
        lit = Math.max(lit, 1 - Math.hypot(dx, dy));
      }
      if (lit <= 0.02) continue;
      const tw = 0.6 + 0.4 * Math.sin(tSec * 0.9 + ph * 3);
      ctx.fillStyle = `rgba(255,236,190,${Math.min(0.75, lit * 0.8 * tw)})`;
      ctx.fillRect(x, y, 0.8 + m[i + 4]! * 0.5, 0.8 + m[i + 4]! * 0.5);
    }
  }
}

/** the pieces other modules draw with (kept here so the unused helpers stay out of the way) */
void deform;
void tracePoly;
void blobPoly;
