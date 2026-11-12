/**
 * The counter's moving parts, painted as sprites of their own in the counter's style (ink under watercolor, the same
 * lamplight over them) and driven by the grocer's hands: the brass scale's pan and needle; the till's keys, its price
 * flags, its crank and its cash drawer. The baked counter (counter.ts) leaves them out and shows what stays put: the
 * scale's column and dial face, the till's body, the wells under the keys, the window behind the flags, the dark
 * opening the drawer runs out of. At rest these sprites lie exactly where the baked painting used to have them.
 *
 * Nothing here moves by itself. A spring moves only when something pushed it: the pan dips and the needle swings when
 * a weight is set on the pan (and the needle goes back when it is lifted off), a key goes down under a finger, the
 * flags pop up when a key has been struck, the crank turns in a hand, the drawer runs out when the crank has been
 * turned and goes back when it is pushed. The springs run on the wall clock (a mechanism has its own pace).
 */
import { Rand, clamp } from '../../scene/prng';
import { rgba } from '../../scene/watercolor';
import { COUNTER, SCALE, TILL } from './geom';
import { INK, SHADE, grain, mix, pen, rectPoly, ribbon, spriteCtx, wash } from './paint';
import { glazeSprite } from './light';

export const BRASS = '#C9A24A';
export const BRASS_D = '#8C6A26';
export const BRASS_L = '#F1D88A';

/* ------------------------------------------------------------------ the till's geometry (world units) */

export const TILL_BASE = TILL.y + 7;
export const TILL_W = 56;
export const TILL_X0 = TILL.x - TILL_W / 2;
export const TILL_X1 = TILL.x + TILL_W / 2;
/** the keys: four rows of six, each a little off its place */
export const KEY_ROWS = 4;
export const KEY_COLS = 6;
const keyJit = (() => {
  const r = new Rand(4417);
  return Array.from({ length: KEY_ROWS * KEY_COLS }, () => r.range(-0.3, 0.3));
})();
export function keyPos(r: number, k: number): { x: number; y: number } {
  return { x: TILL_X0 + 7 + k * 8.4 + keyJit[r * KEY_COLS + k]! + (r % 2) * 0.8, y: TILL_BASE - 23.5 - r * 4.1 };
}
/** the four price flags in the tablet's window */
export const FLAG = { y: TILL_BASE - 51, w: 3.6, h: 7 } as const;
export const flagX = (i: number): number => TILL_X0 + 16 + i * 6.8;
/** the drawer's front, and how far it runs out (world units, toward the viewer) */
export const DRAWER = { x0: TILL_X0, x1: TILL_X1, top: TILL_BASE - 20, bottom: TILL_BASE, out: 6 } as const;
/** the crank's hub on the till's right side, and its arm's reach */
export const CRANK = { x: TILL_X1 + 1.5, y: TILL_BASE - 28, arm: 9, kx: 3.4, rest: 0.9 } as const;

/* ------------------------------------------------------------------ the scale's geometry */

const SC_BASE = SCALE.y + 6;
export const DIAL = { x: SCALE.x, y: SC_BASE - 52, R: 20 } as const;
/** the needle's zero (a little over the dial's start) and how far it sweeps for a pound */
export const NEEDLE_ZERO = -Math.PI * 0.85 + 0.12;
const NEEDLE_PER_LB = (Math.PI * 1.7 * 0.93) / 6;
/** where a piece's base stands on the pan when it is at rest, and the pan's top, so a hand can find them */
export const PAN = { x: SCALE.x, top: DIAL.y - DIAL.R - 13 - 1, restBase: DIAL.y - DIAL.R - 13 + 0.5 } as const;

/* ------------------------------------------------------------------ painting */

interface Spr {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

const counterSurface = (_x: number, y: number): 'wall' | 'top' | 'front' => (y < COUNTER.topBack - 1 ? 'wall' : y < COUNTER.topFront + 11 ? 'top' : 'front');
const counterLift = (x: number, y: number): number => (y < COUNTER.topBack - 1 ? 0.35 * Math.exp(-(((x - 420) / 300) ** 2)) : 0);

/** a small sprite in world coordinates: painted, given the paper's grain, then glazed by the lamps like the counter */
function sprite(box: { x: number; y: number; w: number; h: number }, q: number, seed: number, paint: (ctx: CanvasRenderingContext2D, rnd: Rand) => void): Spr {
  const { cv, ctx } = spriteCtx(box, q);
  paint(ctx, new Rand(seed));
  grain(ctx, '#3A2616', box.x, box.y, box.w, box.h, 0, 0.18, 611);
  glazeSprite(cv, box, q, counterSurface, 21, counterLift, 0.26);
  return { cv, ...box };
}

interface Sprites {
  pan: Spr;
  needle: Spr;
  keys: Spr;
  flags: Spr[];
  drawer: Spr;
  knob: Spr;
}

function paintAll(q: number): Sprites {
  const cx = SCALE.x;
  const dy = DIAL.y;
  const R = DIAL.R;
  const x0 = TILL_X0;
  const x1 = TILL_X1;
  const base = TILL_BASE;
  const cxT = TILL.x;

  // the pan: the stem rising from the dial's bezel, and the shallow brass tray on it
  const py = dy - R - 13;
  const pan = sprite({ x: cx - 34, y: py - 6, w: 68, h: dy - R + 1 - (py - 6) + 1 }, q, 91031, (ctx, rnd) => {
    wash(ctx, [cx - 3, dy - R + 1, cx + 3, dy - R + 1, cx + 3, dy - R - 12, cx - 3, dy - R - 12], BRASS_D, 0.95, rnd, 2, 0.02);
    wash(ctx, [cx - 31, py - 1, cx + 31, py - 1, cx + 26, py + 4, cx - 26, py + 4], BRASS, 0.97, rnd, 3, 0.015);
    ctx.fillStyle = rgba(BRASS_L, 0.7);
    ctx.beginPath();
    ctx.ellipse(cx, py - 1, 31, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = rgba(BRASS_D, 0.4);
    ctx.beginPath();
    ctx.ellipse(cx + 3, py - 0.4, 24, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(SHADE, 0.2);
    ribbon(ctx, [cx + 22, py, cx + 27, py + 3], 3, 0.8);
  });

  // the needle (pointing along +x from the hub) and its hub
  const needle = sprite({ x: cx - 5, y: dy - 3.4, w: R + 2, h: 6.8 }, q, 91032, (ctx) => {
    ctx.strokeStyle = rgba('#7A2E26', 0.95);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - 3, dy);
    ctx.lineTo(cx + R - 5, dy);
    ctx.stroke();
    ctx.fillStyle = rgba(BRASS_D, 0.95);
    ctx.beginPath();
    ctx.arc(cx, dy, 1.9, 0, Math.PI * 2);
    ctx.fill();
  });

  // the keys' caps, at their places on the deck
  const keys = sprite({ x: x0, y: base - 40, w: TILL_W, h: 24 }, q, 91033, (ctx, rnd) => {
    for (let r = 0; r < KEY_ROWS; r++) {
      for (let k = 0; k < KEY_COLS; k++) {
        const p = keyPos(r, k);
        ctx.fillStyle = rgba(rnd.chance(0.2) ? '#D9C79A' : '#EDE3C6', 0.95);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 2.3, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(INK, 0.5);
        ctx.fillRect(p.x - 0.5, p.y - 0.4, rnd.range(0.7, 1.2), 0.7);
      }
    }
  });

  // price flags: a card with two or three digits stated in ink, six different ones
  const flags: Spr[] = [];
  for (let v = 0; v < 6; v++) {
    flags.push(
      sprite({ x: flagX(0), y: FLAG.y, w: FLAG.w + 0.4, h: FLAG.h }, q, 91040 + v, (ctx, rnd) => {
        ctx.translate(flagX(0), FLAG.y);
        ctx.fillStyle = rgba(INK, 0.6);
        ctx.fillRect(0, 0, FLAG.w, FLAG.h);
        ctx.fillStyle = rgba('#F0E8CC', 0.97);
        ctx.fillRect(0.3, 0.3, FLAG.w - 0.6, FLAG.h - 0.6);
        // a numeral in a few strokes: not meant to be read
        ctx.strokeStyle = rgba(INK, 0.8);
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        const n = 2 + (v % 2);
        for (let i = 0; i < n; i++) {
          const yy = 1.2 + i * (FLAG.h - 2) / n;
          ctx.moveTo(0.9 + rnd.range(0, 0.4), yy);
          ctx.lineTo(FLAG.w - 0.9, yy + rnd.range(-0.3, 0.9));
          if (rnd.chance(0.6)) ctx.lineTo(0.9 + rnd.range(0, 0.6), yy + 1.4);
        }
        ctx.stroke();
      }),
    );
  }

  // the drawer: the box's front plate in dark oak with the brass plate, its pull and scrollwork; above it (clipped
  // at the till's body when it is shut) the tray's top with its coin wells
  const drawer = sprite({ x: x0 - 1, y: base - 30, w: TILL_W + 2, h: 31 }, q, 91034, (ctx, rnd) => {
    // the tray top, seen as the drawer runs out
    wash(ctx, [x0 + 1.5, base - 29, x1 - 1.5, base - 29, x1 - 1.5, base - 20, x0 + 1.5, base - 20], '#2B1A10', 0.97, rnd, 2, 0.01);
    for (let i = 0; i < 5; i++) {
      const wx = x0 + 3 + i * 10.4;
      wash(ctx, rectPoly(wx, base - 27.5, wx + 8.6, base - 21.5, rnd, 0.3), mix('#6C4A2A', '#B89A5A', 0.18 * (i % 3)), 0.9, rnd, 2, 0.01);
      ctx.fillStyle = rgba(BRASS_L, 0.55);
      ctx.beginPath();
      ctx.ellipse(wx + 2.5 + rnd.range(0, 3.5), base - 24.5, 1.1, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(INK, 0.5);
    ctx.fillRect(x0 + 1.5, base - 29, x1 - x0 - 3, 0.6);
    // the front
    pen(ctx, x0, base - 20, x0, base, 0.7, INK, 0.65, rnd, 0.15);
    pen(ctx, x1, base - 20, x1, base, 0.7, INK, 0.7, rnd, 0.15);
    wash(ctx, rectPoly(x0, base - 20, x1, base, rnd, 0.3), '#5E3A22', 0.95, rnd, 3, 0.01);
    wash(ctx, rectPoly(x0 + 4, base - 16, x1 - 4, base - 3, rnd, 0.3), BRASS, 0.92, rnd, 2, 0.01);
    ctx.fillStyle = rgba(BRASS_L, 0.55);
    ribbon(ctx, [x0 + 5, base - 15, x1 - 5, base - 15], 1, 0.9);
    ctx.fillStyle = rgba(BRASS_D, 0.5);
    ribbon(ctx, [x0 + 5, base - 4, x1 - 5, base - 4], 1.2, 0.9);
    wash(ctx, rectPoly(cxT - 7, base - 11, cxT + 7, base - 8, rnd, 0.2), BRASS_D, 0.95, rnd, 2, 0.01);
    for (const s of [-1, 1]) {
      ctx.strokeStyle = rgba(BRASS_D, 0.7);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(cxT + s * 12, base - 9);
      ctx.bezierCurveTo(cxT + s * 16, base - 14, cxT + s * 21, base - 6, cxT + s * 18, base - 6);
      ctx.stroke();
    }
  });

  // the crank's knob (a wooden ball on the end of the brass arm)
  const knob = sprite({ x: CRANK.x - 4, y: CRANK.y - 14, w: 8, h: 8 }, q, 91035, (ctx) => {
    ctx.translate(CRANK.x, CRANK.y - 10);
    ctx.fillStyle = rgba(INK, 0.5);
    ctx.beginPath();
    ctx.arc(0.2, 0.3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#5E3A22', 0.97);
    ctx.beginPath();
    ctx.arc(0, 0, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#A87A4A', 0.6);
    ctx.beginPath();
    ctx.arc(-0.9, -1, 1.1, 0, Math.PI * 2);
    ctx.fill();
  });
  return { pan, needle, keys, flags, drawer, knob };
}

/* ------------------------------------------------------------------ springs */

class Spring {
  x: number;
  v = 0;
  constructor(x = 0) {
    this.x = x;
  }
  /** a damped spring toward `to` (w: rad/s, z: damping ratio) */
  step(h: number, to: number, w: number, z: number): void {
    const n = Math.max(1, Math.ceil(h / (1 / 120)));
    const dt = h / n;
    for (let i = 0; i < n; i++) {
      this.v += (-w * w * (this.x - to) - 2 * z * w * this.v) * dt;
      this.x += this.v * dt;
    }
  }
  snap(x: number): void {
    this.x = x;
    this.v = 0;
  }
}

/* ------------------------------------------------------------------ the fixtures */

export class CounterFixtures {
  private s: Sprites | null = null;
  private q = 0;
  // the scale
  private readonly pan = new Spring(0);
  private readonly needle = new Spring(0);
  private panT = 0;
  private needleT = 0;
  /** the pounds on the pan (0: nothing) */
  loadLb = 0;
  // the till
  private readonly keyS: Spring[] = Array.from({ length: KEY_ROWS * KEY_COLS }, () => new Spring(0));
  private readonly keyT: number[] = new Array(KEY_ROWS * KEY_COLS).fill(0);
  private readonly flagS: Spring[] = [0, 1, 2, 3].map(() => new Spring(0));
  private readonly flagT: number[] = [0, 0, 0, 0];
  private readonly flagV: number[] = [0, 1, 2, 3];
  private flagDelay: number[] = [0, 0, 0, 0];
  private flagN = 0;
  /** the crank's angle (radians; 0 straight up) */
  theta: number = CRANK.rest;
  private readonly drawerS = new Spring(0);
  private drawerT = 0;
  /** the hand drives the drawer (pushing it shut): its offset, or null */
  private drawerHeld: number | null = null;

  prepare(q: number): void {
    if (this.s && Math.abs(q - this.q) / Math.max(1e-6, this.q) < 0.03) return;
    this.q = q;
    this.s = paintAll(q);
  }

  get ready(): boolean {
    return this.s !== null;
  }

  /** everything settled: nothing on the pan, the needle at zero, the keys up, the flags down, the drawer shut */
  reset(): void {
    this.pan.snap(0);
    this.needle.snap(0);
    this.panT = 0;
    this.needleT = 0;
    this.loadLb = 0;
    for (const k of this.keyS) k.snap(0);
    this.keyT.fill(0);
    for (const f of this.flagS) f.snap(0);
    this.flagT.fill(0);
    this.flagDelay.fill(0);
    this.theta = CRANK.rest;
    this.drawerS.snap(0);
    this.drawerT = 0;
    this.drawerHeld = null;
  }

  /* -------------------------------------------------------------- the scale */

  /** set a weight on the pan (pounds), or lift it off (0) */
  load(lb: number): void {
    this.loadLb = lb;
    this.panT = lb > 0 ? 0.9 + 0.45 * lb : 0;
    this.needleT = lb * NEEDLE_PER_LB;
  }

  /** how far the pan is down (world units) */
  get panDip(): number {
    return this.pan.x;
  }

  /** the needle's angle from zero, and where it is going, as a fraction of the sweep for the weight */
  get needleOff(): number {
    return Math.abs(this.needle.x - this.needleT);
  }

  /** the needle has come to rest within a few degrees of its reading */
  get needleSettled(): boolean {
    return this.needleOff < 0.05 && Math.abs(this.needle.v) < 0.35;
  }

  /** the needle has come round to within a quarter of its sweep (the first swing is over) */
  get needleNear(): boolean {
    return this.needleOff < 0.12 && Math.abs(this.needle.v) < 1.2;
  }

  /** the baseline of a piece standing on the pan now (world y) */
  get panBase(): number {
    return PAN.restBase + this.pan.x;
  }

  /* -------------------------------------------------------------- the till */

  /** a key held down by a finger (true) or let go */
  key(i: number, down: boolean): void {
    this.keyT[i] = down ? 1 : 0;
  }

  keyDown(i: number): number {
    return this.keyS[i]!.x;
  }

  /** the flags pop up with the next amount, one after another from the right (a number being rung) */
  showFlags(n = 4): void {
    for (let i = 0; i < 4; i++) {
      const on = i >= 4 - n;
      this.flagT[i] = on ? 1 : 0;
      this.flagDelay[i] = on ? 0.03 * (3 - i) : 0;
      if (on) this.flagV[i] = (this.flagN * 3 + i * 5 + 1) % 6;
    }
    this.flagN++;
  }

  hideFlags(): void {
    this.flagT.fill(0);
    this.flagDelay.fill(0);
  }

  get flagsUp(): boolean {
    return this.flagT.some((t) => t > 0);
  }

  /** the crank's knob on the screen for an angle */
  knobAt(theta = this.theta): { x: number; y: number } {
    return { x: CRANK.x + CRANK.kx * Math.sin(theta), y: CRANK.y - CRANK.arm * Math.cos(theta) };
  }

  /** the cash drawer runs out (a short slide, a little bounce) */
  ejectDrawer(): void {
    this.drawerHeld = null;
    this.drawerT = DRAWER.out;
    this.drawerS.v = 90;
  }

  /** a hand is pushing the drawer: it is at this offset (0 shut … DRAWER.out) */
  pushDrawer(d: number): void {
    this.drawerHeld = clamp(d, 0, DRAWER.out);
    this.drawerS.x = this.drawerHeld;
    this.drawerS.v = 0;
    this.drawerT = this.drawerHeld;
  }

  releaseDrawer(): void {
    this.drawerHeld = null;
    this.drawerT = this.drawerS.x < 0.15 ? 0 : this.drawerT;
  }

  get drawerOut(): number {
    return this.drawerS.x;
  }

  get drawerShut(): boolean {
    return this.drawerS.x < 0.05 && this.drawerT === 0;
  }

  /** the plate's top edge now (world y) */
  get drawerTop(): number {
    return DRAWER.top + this.drawerS.x;
  }

  /* -------------------------------------------------------------- stepping */

  update(dt: number): void {
    const h = clamp(dt, 0, 0.1);
    if (h <= 0) return;
    this.pan.step(h, this.panT, 20, 0.32);
    this.needle.step(h, this.needleT, 12, 0.3);
    // a stop at zero: the needle rests on its pin
    if (this.needle.x < 0) {
      this.needle.x = 0;
      if (this.needle.v < 0) this.needle.v = -this.needle.v * 0.25;
    }
    for (let i = 0; i < this.keyS.length; i++) {
      const s = this.keyS[i]!;
      if (this.keyT[i] === 0 && Math.abs(s.x) < 1e-4 && Math.abs(s.v) < 1e-3) continue;
      s.step(h, this.keyT[i]!, 46, 0.75);
      s.x = clamp(s.x, -0.05, 1.05);
    }
    for (let i = 0; i < 4; i++) {
      if (this.flagDelay[i]! > 0 && this.flagT[i]! > 0) {
        this.flagDelay[i] = this.flagDelay[i]! - h;
        continue;
      }
      this.flagS[i]!.step(h, this.flagT[i]!, 24, 0.42);
      if (this.flagT[i] === 0) this.flagS[i]!.x = clamp(this.flagS[i]!.x, 0, 1.4);
    }
    if (this.drawerHeld === null) {
      this.drawerS.step(h, this.drawerT, 34, 0.5);
      // runs out against its stop, shuts against its frame
      if (this.drawerS.x < 0) {
        this.drawerS.x = 0;
        this.drawerS.v = 0;
      }
      if (this.drawerS.x > DRAWER.out + 1.2) {
        this.drawerS.x = DRAWER.out + 1.2;
        this.drawerS.v = -Math.abs(this.drawerS.v) * 0.3;
      }
    }
  }

  /* -------------------------------------------------------------- drawing */

  /** the scale's pan and needle (the pan is drawn here; whatever lies on it is drawn by the grocer after this) */
  drawScale(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    if (!s) return;
    // the needle first (the pan stands above the dial, never over it)
    const a = NEEDLE_ZERO + this.needle.x;
    ctx.save();
    ctx.translate(DIAL.x, DIAL.y);
    ctx.rotate(a);
    ctx.drawImage(s.needle.cv, s.needle.x - DIAL.x, s.needle.y - DIAL.y, s.needle.w, s.needle.h);
    ctx.restore();
    // the pan, its stem going down into the bezel (cut there)
    const cut = DIAL.y - DIAL.R - s.pan.y - this.pan.x;
    const full = s.pan.h;
    const vis = clamp(cut, 0, full);
    if (vis > 0) ctx.drawImage(s.pan.cv, 0, 0, s.pan.cv.width, (vis / full) * s.pan.cv.height, s.pan.x, s.pan.y + this.pan.x, s.pan.w, vis);
  }

  /** the till: keys, flags, drawer */
  drawTill(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    if (!s) return;
    const k = s.keys;
    const sx = k.cv.width / k.w;
    const sy = k.cv.height / k.h;
    for (let r = 0; r < KEY_ROWS; r++) {
      for (let c = 0; c < KEY_COLS; c++) {
        const p = keyPos(r, c);
        const d = this.keyS[r * KEY_COLS + c]!.x * 1.25;
        const cx = p.x - 3.5;
        const cy = p.y - 2;
        ctx.drawImage(k.cv, (cx - k.x) * sx, (cy - k.y) * sy, 7 * sx, 4 * sy, cx, cy + d, 7, 4);
      }
    }
    // the flags rise from the bottom of their slots; a card is clipped to its slot (with a little room above)
    for (let i = 0; i < 4; i++) {
      const o = this.flagS[i]!.x;
      const off = 5.8 * (1 - o);
      if (off >= FLAG.h) continue;
      const f = s.flags[this.flagV[i]!]!;
      ctx.save();
      ctx.beginPath();
      ctx.rect(flagX(i), FLAG.y - 1.4, FLAG.w, FLAG.h + 1.4);
      ctx.clip();
      ctx.drawImage(f.cv, flagX(i), FLAG.y + off, FLAG.w, FLAG.h);
      ctx.restore();
    }
    // the drawer
    const d = this.drawerS.x;
    const dr = s.drawer;
    ctx.save();
    // (the tray's top shows only above the plate and below the body's own edge: never over the keyboard)
    ctx.beginPath();
    ctx.rect(dr.x - 1, DRAWER.top, dr.w + 2, 60);
    ctx.clip();
    ctx.drawImage(dr.cv, dr.x, dr.y + d, dr.w, dr.h);
    ctx.restore();
  }

  /** the crank's arm and knob (drawn before the hand that turns it) */
  drawCrank(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    if (!s) return;
    const kn = this.knobAt();
    ctx.strokeStyle = rgba(mix(BRASS_D, '#000000', 0.12), 0.97);
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CRANK.x, CRANK.y);
    ctx.lineTo(kn.x, kn.y);
    ctx.stroke();
    ctx.drawImage(s.knob.cv, kn.x - 4, kn.y - 4, s.knob.w, s.knob.h);
  }
}
