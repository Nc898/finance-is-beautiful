/**
 * Per-frame tree painting onto a TRANSPARENT canvas (paper/ground/soil are a separate static backdrop).
 * Pure function of (model, maturity, months, pulse, wind time). Only skeleton paths + drawImage of pre-rendered
 * watercolor sprites happen here; no PRNG, no scratch-array allocation in the hot path.
 *
 * Layer order: ground contact -> roots (soil band) -> back masses -> back clumps -> skeleton
 * -> pulse droplet -> mid clumps -> front lit clumps (with soft under-shadows) -> splatter -> cotyledons.
 */
import { clamp, smoothstep } from './prng';
import {
  H, WE, createState, crownMap, evalState, mapY, rootG,
  type Branch, type CrownMap, type TreeModel, type TreeState,
} from './treeModel';
import { PAL, makeBarkTile, mixHex, rgba } from './watercolor';
import type { Sprites, Spr } from './sprites';

export interface View {
  /** screen px of world (0,0) = trunk base */
  ox: number;
  oy: number;
  /** css px per world unit */
  s: number;
  /** device pixel ratio of the destination context transform (default 1) */
  dpr?: number;
}

export interface PaintParams {
  maturity: number;
  months: number;
  timeMs: number;
  wind: boolean;
  /** 0..1 contribution pulse (0 = root tip, 1 = trunk base), or -1 for none */
  pulse?: number;
  /** screen rect (css px): anything entirely outside is skipped (loupe) */
  cull?: { x0: number; y0: number; x1: number; y1: number };
  /** planting spot instead of a tree */
  unplanted?: boolean;
  /** 0..1 planting transition (stake fades, mound settles); 1 = fully planted */
  plantK?: number;
}

const MAXP = 256;
const RX = new Float32Array(700);
const RY = new Float32Array(700);
const RR = new Float32Array(700);
const RNX = new Float32Array(700);
const RNY = new Float32Array(700);
const PIVOT = 0.82;
const BARK_BLOOM = ['rgba(176,104,52,0.12)', 'rgba(104,66,98,0.1)', 'rgba(214,168,86,0.13)'];

let barkTile: HTMLCanvasElement | null = null;
const barkPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
function barkPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  let p = barkPatterns.get(ctx);
  if (!p) {
    barkTile ??= makeBarkTile();
    p = ctx.createPattern(barkTile, 'repeat')!;
    barkPatterns.set(ctx, p);
  }
  return p;
}

export class TreePainter {
  readonly model: TreeModel;
  readonly state: TreeState;
  private X = new Float32Array(MAXP + 2);
  private Y = new Float32Array(MAXP + 2);
  private R = new Float32Array(MAXP + 2);
  private NX = new Float32Array(MAXP + 2);
  private NY = new Float32Array(MAXP + 2);
  private IM = new Int16Array(MAXP + 2);
  private step = 1;
  private shadowCol: string[] = [];
  private litCol: string[] = [];
  private baseCol: string[] = [];
  private order: number[] = [];
  private windT1 = 0;
  private windT2 = 0;
  private windOn = false;
  private cm: CrownMap;
  private cull: PaintParams['cull'] | undefined;
  private dprV = 1;
  mEff = 0;

  constructor(model: TreeModel) {
    this.model = model;
    this.state = createState(model);
    this.cm = crownMap(0.05, model.tanLean);
    for (const b of model.branches) {
      const t = b.tone;
      this.shadowCol.push(b.isRoot ? mixHex('#33241A', '#47321F', t) : mixHex('#3E2A22', '#56392C', t));
      this.litCol.push(b.isRoot ? mixHex('#8F6D48', '#A07C52', t) : mixHex('#B88F5E', '#CFA56E', t));
      this.baseCol.push(mixHex('#9C6A44', '#B07E52', t));
    }
    // draw order: laterals first, then the branch, then fork children (tAttach ~ 1) so the trunk top never hides them
    const lat: number[][] = model.branches.map(() => []);
    const fork: number[][] = model.branches.map(() => []);
    for (const br of model.branches) {
      if (br.parent < 0) continue;
      (br.tAttach >= 2 ? fork : lat)[br.parent]!.push(br.idx);
    }
    const visit = (i: number) => {
      for (const c of lat[i]!) visit(c);
      this.order.push(i);
      for (const c of fork[i]!) visit(c);
    };
    visit(0);
  }

  /** visible root extent (world units, relative to the trunk base) at maturity m: used to frame the roots loupe */
  rootExtent(m: number): { depth: number; spread: number } {
    let depth = 0;
    let spread = 0;
    for (const r of this.model.roots) {
      const g = rootG(r, m);
      if (g <= 0.001) continue;
      const lv = g * r.len;
      for (let i = 0; i < r.n; i++) {
        if (r.cum[i]! > lv) break;
        depth = Math.max(depth, -r.py[i]!);
        spread = Math.max(spread, Math.abs(r.px[i]!));
      }
    }
    return { depth, spread };
  }

  /** screen-space crown apex (for anchorsFor): world coordinates of the crown top at maturity m */
  apexWorld(m: number): { x: number; y: number } {
    const cm = crownMap(Math.max(m, 0.004), this.model.tanLean);
    const c = this.model.clumps[this.model.apex]!;
    const wy = mapY(c.y0, cm);
    return { x: c.x0 * cm.kx + wy * cm.tanLean, y: cm.h };
  }

  private windDX(x: number, y: number): number {
    if (!this.windOn) return 0;
    const h = y / H;
    if (h <= 0) return 0;
    return 7.5 * h * Math.sqrt(h) * (Math.sin(this.windT1 + x * 0.006) + 0.45 * Math.sin(this.windT2 + y * 0.01 + 1.3));
  }

  private outside(k: number): boolean {
    const c = this.cull;
    if (!c) return false;
    const X = this.X, Y = this.Y;
    const m = 40;
    let l = true, r = true, t = true, bt = true;
    for (const i of [0, k >> 1, k - 1]) {
      if (X[i]! > c.x0 - m) l = false;
      if (X[i]! < c.x1 + m) r = false;
      if (Y[i]! > c.y0 - m) t = false;
      if (Y[i]! < c.y1 + m) bt = false;
    }
    return l || r || t || bt;
  }

  private prep(b: Branch, g: number, kappa: number, v: View, full: boolean): number {
    const cm = this.cm;
    const lv = g * b.len;
    let k = 0;
    const X = this.X, Y = this.Y, R = this.R, IM = this.IM;
    const rs = Math.pow(cm.m, 0.9) * kappa;
    const tl = Math.min(15, lv * 0.55);
    const step = b.n > 20 ? 2 : 1;
    this.step = step;
    let prev = 0;
    for (let i = 0; i < b.n && k < MAXP; i = i === b.n - 1 ? b.n : Math.min(i + step, b.n - 1)) {
      let px = b.px[i]!;
      let py = b.py[i]!;
      let rr = b.rad[i]!;
      const c = b.cum[i]!;
      let last = false;
      if (c > lv) {
        const a = (lv - b.cum[prev]!) / (c - b.cum[prev]!);
        px = b.px[prev]! + (px - b.px[prev]!) * a;
        py = b.py[prev]! + (py - b.py[prev]!) * a;
        rr = b.rad[prev]! + (rr - b.rad[prev]!) * a;
        last = true;
      }
      const u = lv - Math.min(c, lv);
      const tp = full ? 1 : u < tl ? 0.28 + 0.72 * smoothstep(u / tl) : 1;
      const wy = mapY(py, cm);
      let wx = px * cm.kx + wy * cm.tanLean;
      wx += this.windDX(wx, wy);
      X[k] = v.ox + wx * v.s;
      Y[k] = v.oy - wy * v.s;
      R[k] = Math.max(0.12, rr * rs * tp) * v.s;
      IM[k] = i;
      k++;
      prev = i;
      if (last) break;
    }
    const NX = this.NX, NY = this.NY;
    for (let i = 0; i < k; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i1 = i < k - 1 ? i + 1 : k - 1;
      let tx = X[i1]! - X[i0]!;
      let ty = Y[i1]! - Y[i0]!;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      NX[i] = -ty;
      NY[i] = tx;
    }
    return k;
  }

  /** polygon between two offsets (as fractions of the radius toward the lit edge) along the visible ribbon */
  private band(b: Branch, k: number, litS: number, f0: number, f1: number, jit: number): Path2D {
    const X = this.X, Y = this.Y, R = this.R, NX = this.NX, NY = this.NY, IM = this.IM;
    const p = new Path2D();
    for (let i = 0; i < k; i++) {
      const f = f0 + (jit ? b.jitA[IM[i]!]! * jit : 0);
      p.lineTo(X[i]! + NX[i]! * R[i]! * litS * f, Y[i]! + NY[i]! * R[i]! * litS * f);
    }
    for (let i = k - 1; i >= 0; i--) {
      const f = f1 + (jit ? b.jitB[IM[i]!]! * jit * 1.4 : 0);
      p.lineTo(X[i]! + NX[i]! * R[i]! * litS * f, Y[i]! + NY[i]! * R[i]! * litS * f);
    }
    return p;
  }

  private drawRibbon(ctx: CanvasRenderingContext2D, b: Branch, k: number, litS: number, v: View): void {
    const X = this.X, Y = this.Y, R = this.R, NX = this.NX, NY = this.NY, IM = this.IM;
    const bi = b.idx;
    const rMax = R[0]!;
    const big = rMax > 3.2;
    const sil = new Path2D();
    for (let i = 0; i < k; i++) sil.lineTo(X[i]! + NX[i]! * R[i]! * litS, Y[i]! + NY[i]! * R[i]! * litS);
    for (let i = k - 1; i >= 0; i--) sil.lineTo(X[i]! - NX[i]! * R[i]! * litS, Y[i]! - NY[i]! * R[i]! * litS);
    if (big) {
      // layered watercolor wash (no hard gradient seams): sienna base, tan on the lit side, umber -> violet-brown on the shadow side
      ctx.fillStyle = this.baseCol[bi]!;
      ctx.fill(sil);
      ctx.fillStyle = 'rgba(230,196,140,0.13)';
      for (const f of [0.82, 0.62, 0.42, 0.22, 0.02]) ctx.fill(this.band(b, k, litS, 0.98, f, 0.07));
      ctx.fillStyle = 'rgba(86,52,40,0.13)';
      for (const f of [0.0, -0.2, -0.4, -0.58, -0.76]) ctx.fill(this.band(b, k, litS, -0.98, f, 0.07));
      ctx.fillStyle = 'rgba(66,46,78,0.14)';
      for (const f of [-0.5, -0.7]) ctx.fill(this.band(b, k, litS, -0.98, f, 0.06));
      // granulation / striated paper-tooth texture
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = barkPattern(ctx);
      ctx.fill(sil);
      ctx.restore();
      // wet edge: darker contour pooled on the shadow side
      ctx.strokeStyle = 'rgba(58,34,36,0.32)';
      ctx.lineWidth = Math.max(0.8, rMax * 0.12);
      ctx.lineCap = 'round';
      const we = new Path2D();
      for (let i = 0; i < k; i++) {
        const f = -0.88 + b.jitB[IM[i]!]! * 0.5;
        const x = X[i]! + NX[i]! * R[i]! * litS * f;
        const y = Y[i]! + NY[i]! * R[i]! * litS * f;
        if (i === 0) we.moveTo(x, y);
        else we.lineTo(x, y);
      }
      ctx.stroke(we);
      // soft hue blooms
      if (b.blooms.length) {
        const bn = b.blooms.length / 4;
        for (let q = 0; q < bn; q++) {
          const ii = Math.floor((b.blooms[4 * q]! * (b.n - 1)) / this.step);
          if (ii < 1 || ii >= k - 1) continue;
          const off = b.blooms[4 * q + 1]!;
          const sz = b.blooms[4 * q + 2]! * v.s * Math.min(1, R[ii]! / 4);
          const cx = X[ii]! - NX[ii]! * R[ii]! * litS * off * 0.7;
          const cy = Y[ii]! - NY[ii]! * R[ii]! * litS * off * 0.7;
          ctx.fillStyle = BARK_BLOOM[b.blooms[4 * q + 3]!]!;
          this.almondPath(ctx, cx, cy, Math.atan2(-NX[ii]!, NY[ii]!), sz * 2.6, sz * 0.8);
          ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = this.shadowCol[bi]!;
      ctx.fill(sil);
      const lit = new Path2D();
      for (let i = 0; i < k; i++) lit.lineTo(X[i]! + NX[i]! * R[i]! * litS * 0.92, Y[i]! + NY[i]! * R[i]! * litS * 0.92);
      for (let i = k - 1; i >= 0; i--) {
        const f = -0.05 + b.jitB[IM[i]!]! * 2.2;
        lit.lineTo(X[i]! + NX[i]! * R[i]! * litS * f, Y[i]! + NY[i]! * R[i]! * litS * f);
      }
      ctx.fillStyle = this.litCol[bi]!;
      ctx.fill(lit);
    }
    // pale highlight stripe on the lit side (refs 1, 3)
    if (rMax > 2.4 && !b.isRoot) {
      ctx.strokeStyle = big ? 'rgba(246,234,198,0.6)' : 'rgba(246,234,198,0.5)';
      ctx.lineWidth = clamp(rMax * 0.09, 0.5, 1.8);
      ctx.lineCap = 'round';
      const hl = new Path2D();
      for (let i = 0; i < k; i++) {
        const f = 0.6 + b.jitA[IM[i]!]! * 0.6;
        const x = X[i]! + NX[i]! * R[i]! * litS * f;
        const y = Y[i]! + NY[i]! * R[i]! * litS * f;
        if (i === 0) hl.moveTo(x, y);
        else hl.lineTo(x, y);
      }
      ctx.stroke(hl);
    }
    // striations: umber strokes of varied length/weight concentrated in the shadow half; tan streaks on the lit side
    if (big && b.hatch.length) {
      const dark1 = new Path2D();
      const dark2 = new Path2D();
      const light = new Path2D();
      const hn = b.hatch.length / 5;
      for (let h = 0; h < hn; h++) {
        const ii = Math.floor((b.hatch[5 * h]! * (b.n - 1)) / this.step);
        if (ii >= k - 1 || ii < 0) continue;
        const off = b.hatch[5 * h + 1]!;
        const ln = b.hatch[5 * h + 2]! * v.s;
        const ang = b.hatch[5 * h + 3]!;
        const cx = X[ii]! - NX[ii]! * R[ii]! * litS * off * 0.9;
        const cy = Y[ii]! - NY[ii]! * R[ii]! * litS * off * 0.9;
        const tx = NY[ii]!;
        const ty = -NX[ii]!;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const dx = tx * ca - ty * sa;
        const dy = tx * sa + ty * ca;
        const p = b.hatch[5 * h + 4] ? light : h % 3 === 0 ? dark2 : dark1;
        p.moveTo(cx - dx * ln * 0.5, cy - dy * ln * 0.5);
        p.lineTo(cx + dx * ln * 0.5, cy + dy * ln * 0.5);
      }
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = 'rgba(70,38,30,0.34)';
      ctx.stroke(dark1);
      ctx.lineWidth = 0.95;
      ctx.strokeStyle = 'rgba(58,32,28,0.26)';
      ctx.stroke(dark2);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(244,222,176,0.4)';
      ctx.stroke(light);
      // knots: small ink ellipse-ish marks
      for (let q = 0; q < b.knots.length / 3; q++) {
        const ii = Math.floor((b.knots[3 * q]! * (b.n - 1)) / this.step);
        if (ii >= k - 1 || ii < 1) continue;
        const off = b.knots[3 * q + 1]!;
        const sz = b.knots[3 * q + 2]! * v.s * 0.7;
        const cx = X[ii]! - NX[ii]! * R[ii]! * litS * off * 0.5;
        const cy = Y[ii]! - NY[ii]! * R[ii]! * litS * off * 0.5;
        const a = Math.atan2(-NX[ii]!, NY[ii]!) + Math.PI / 2 + 0.25;
        this.almondPath(ctx, cx, cy, a, sz * 1.5, sz * 0.62);
        ctx.fillStyle = 'rgba(64,38,30,0.38)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(47,42,34,0.62)';
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }
    }
    // broken dry-brush sepia contour: runs of varying width separated by gaps (lit side lighter than shadow side)
    const sc = clamp(0.7 + rMax * 0.07, 0.7, 1.45);
    ctx.lineCap = 'round';
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? litS : -litS;
      const paths = [null, new Path2D(), new Path2D(), new Path2D()] as Array<Path2D | null>;
      let prevC = 0;
      let px = 0;
      let py = 0;
      for (let i = 0; i < k; i++) {
        const c = b.ink[side * b.n + IM[i]!]!;
        if (c === 0) {
          prevC = 0;
          continue;
        }
        const x = X[i]! + NX[i]! * R[i]! * sg;
        const y = Y[i]! + NY[i]! * R[i]! * sg;
        const pc = paths[c]!;
        if (prevC === 0) pc.moveTo(x, y);
        else if (c === prevC) pc.lineTo(x, y);
        else {
          pc.moveTo(px, py);
          pc.lineTo(x, y);
        }
        px = x;
        py = y;
        prevC = c;
      }
      ctx.strokeStyle = side === 0 ? 'rgba(47,42,34,0.5)' : 'rgba(47,42,34,0.88)';
      for (let c = 1; c <= 3; c++) {
        ctx.lineWidth = [0, 0.5, 0.8, 1.1][c]! * sc * (side === 0 ? 0.7 : 1);
        ctx.stroke(paths[c]!);
      }
    }
  }

  private almondPath(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number): void {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const hx = (c * len) / 2;
    const hy = (s * len) / 2;
    ctx.beginPath();
    ctx.moveTo(x - hx, y - hy);
    ctx.quadraticCurveTo(x - s * wid * 1.1, y + c * wid * 1.1, x + hx, y + hy);
    ctx.quadraticCurveTo(x + s * wid * 0.9, y - c * wid * 0.9, x - hx, y - hy);
    ctx.closePath();
  }

  paint(ctx: CanvasRenderingContext2D, v: View, p: PaintParams, sp: Sprites): void {
    const model = this.model;
    const st = this.state;
    const plantK = p.plantK ?? 1;
    this.cull = p.cull;
    this.dprV = v.dpr ?? 1;
    ctx.save();
    ctx.lineJoin = 'round';
    if (p.unplanted) {
      this.mEff = 0;
      this.drawPlantingSpot(ctx, v, sp, 1, 0);
      ctx.restore();
      return;
    }
    const mSprout = 0.04 * smoothstep(p.months / 3.5);
    const mEff = Math.max(p.maturity, p.months > 0 ? mSprout : 0);
    this.mEff = mEff;
    this.windOn = p.wind;
    this.windT1 = p.timeMs * 0.0011;
    this.windT2 = p.timeMs * 0.0027;
    this.drawGroundDetail(ctx, v, p, sp, mEff, plantK);
    if (plantK < 1) this.drawPlantingSpot(ctx, v, sp, 1 - plantK, 1);
    const cm = crownMap(Math.max(mEff, 0.004), model.tanLean);
    this.cm = cm;
    evalState(model, mEff, st);
    if (mEff <= 0) {
      ctx.restore();
      return;
    }
    const L = model.layers;

    this.drawRoots(ctx, v, mEff);

    for (let i = 0; i < L[0].length; i++) this.drawClump(ctx, v, L[0][i]!, sp);
    for (let i = 0; i < L[1].length; i++) this.drawClump(ctx, v, L[1][i]!, sp);

    // skeleton: surface roots, then fine twigs in one batched fill, then limbs/trunk children-first
    const br = model.branches;
    const twig = new Path2D();
    let anyTwig = false;
    const X = this.X, Y = this.Y, R = this.R, NX = this.NX, NY = this.NY;
    for (let oi = 0; oi < this.order.length; oi++) {
      const b = br[this.order[oi]!]!;
      if (b.isRoot) continue;
      const g = st.g[b.idx]!;
      if (g <= 0.0005) continue;
      if (b.rad[0]! * Math.pow(cm.m, 0.9) * st.kappa[b.idx]! * v.s >= 1.6) continue;
      const k = this.prep(b, g, st.kappa[b.idx]!, v, g >= 0.999);
      if (k < 2 || this.outside(k)) continue;
      for (let i = 0; i < k; i++) {
        const r = Math.max(R[i]!, 0.3);
        const x = X[i]! + NX[i]! * r;
        const y = Y[i]! + NY[i]! * r;
        if (i === 0) twig.moveTo(x, y);
        else twig.lineTo(x, y);
      }
      for (let i = k - 1; i >= 0; i--) {
        const r = Math.max(R[i]!, 0.3);
        twig.lineTo(X[i]! - NX[i]! * r, Y[i]! - NY[i]! * r);
      }
      twig.closePath();
      anyTwig = true;
    }
    for (let oi = 0; oi < this.order.length; oi++) {
      const b = br[this.order[oi]!]!;
      if (!b.isRoot) continue;
      const g = st.g[b.idx]!;
      if (g <= 0.0005) continue;
      const k = this.prep(b, g, st.kappa[b.idx]!, v, g >= 0.999);
      if (k < 2 || this.outside(k)) continue;
      ctx.globalAlpha = 0.92;
      this.drawRibbon(ctx, b, k, -b.lightSign, v);
      ctx.globalAlpha = 1;
      // melt the tip into the ground wash
      ctx.fillStyle = 'rgba(150,178,96,0.5)';
      const j0 = Math.floor(k * 0.55);
      for (let j = j0; j < k; j += 1) {
        this.almondPath(ctx, X[j]!, Y[j]!, 0, R[j]! * 3.4 + 1.5, R[j]! * 1.2 + 0.6);
        ctx.fill();
      }
    }
    if (anyTwig) {
      ctx.fillStyle = 'rgba(66,48,36,0.95)';
      ctx.fill(twig);
    }
    for (let oi = 0; oi < this.order.length; oi++) {
      const b = br[this.order[oi]!]!;
      if (b.isRoot) continue;
      const g = st.g[b.idx]!;
      if (g <= 0.0005) continue;
      if (b.rad[0]! * Math.pow(cm.m, 0.9) * st.kappa[b.idx]! * v.s < 1.6) continue;
      const k = this.prep(b, g, st.kappa[b.idx]!, v, g >= 0.999);
      if (k < 2 || this.outside(k)) continue;
      this.drawRibbon(ctx, b, k, -b.lightSign, v);
    }

    if (p.pulse !== undefined && p.pulse >= 0) this.drawPulse(ctx, v, p.pulse, mEff);

    for (let i = 0; i < L[2].length; i++) this.drawClump(ctx, v, L[2][i]!, sp);
    for (let i = 0; i < L[3].length; i++) this.drawClump(ctx, v, L[3][i]!, sp);

    // restrained pigment splatter, anchored to clumps so it scales with the crown
    for (const sk of model.specks) {
      const a = smoothstep((mEff - sk.birth) / 0.05);
      if (a <= 0) continue;
      const c = model.clumps[sk.clump]!;
      const w = Math.min(c.w0 * cm.sf, 0.95 * cm.wc);
      const wy = mapY(c.y0, cm) + sk.dy * w;
      let wx = c.x0 * cm.kx + wy * cm.tanLean + sk.dx * w;
      wx += this.windDX(wx, wy);
      ctx.fillStyle = rgba(sk.color, sk.alpha * a);
      ctx.beginPath();
      ctx.ellipse(v.ox + wx * v.s, v.oy - wy * v.s, Math.max(0.5, sk.len * v.s * 0.5), Math.max(0.4, sk.len * v.s * 0.28), -sk.ang, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawCotyledons(ctx, v, p, mEff);
    ctx.restore();
  }

  /** Fine ink + umber-wash roots in the soil band; extent leads the canopy (clock m^0.6). */
  private drawRoots(ctx: CanvasRenderingContext2D, v: View, m: number): void {
    const roots = this.model.roots;
    const st = this.state;
    const rs = Math.pow(Math.max(m, 0.02), 0.78);
    const fill = new Path2D();
    const line = new Path2D();
    const edge = new Path2D();
    let any = false;
    for (let ri = 0; ri < roots.length; ri++) {
      const r = roots[ri]!;
      const g = st.rootG[ri]!;
      if (g <= 0.001) continue;
      const lv = g * r.len;
      let k = 0;
      for (let i = 0; i < r.n && k < 690; i++) {
        let px = r.px[i]!;
        let py = r.py[i]!;
        let rd = r.rad[i]!;
        if (r.cum[i]! > lv) {
          const a = (lv - r.cum[i - 1]!) / (r.cum[i]! - r.cum[i - 1]!);
          px = r.px[i - 1]! + (px - r.px[i - 1]!) * a;
          py = r.py[i - 1]! + (py - r.py[i - 1]!) * a;
          rd = r.rad[i - 1]! + (rd - r.rad[i - 1]!) * a;
          RX[k] = v.ox + px * v.s;
          RY[k] = v.oy - py * v.s;
          RR[k] = Math.max(0.25, rd * rs * 0.45) * v.s;
          k++;
          break;
        }
        RX[k] = v.ox + px * v.s;
        RY[k] = v.oy - py * v.s;
        RR[k] = Math.max(0.25, rd * rs) * v.s * (r.cum[i]! > lv - 12 ? 0.6 : 1);
        k++;
      }
      if (k < 2) continue;
      any = true;
      for (let i = 0; i < k; i++) {
        const i0 = i > 0 ? i - 1 : 0;
        const i1 = i < k - 1 ? i + 1 : k - 1;
        let tx = RX[i1]! - RX[i0]!;
        let ty = RY[i1]! - RY[i0]!;
        const l = Math.hypot(tx, ty) || 1;
        tx /= l;
        ty /= l;
        RNX[i] = -ty;
        RNY[i] = tx;
      }
      if (RR[0]! >= 1.2) {
        for (let i = 0; i < k; i++) {
          const px2 = RX[i]! + RNX[i]! * RR[i]!;
          const py2 = RY[i]! + RNY[i]! * RR[i]!;
          if (i === 0) fill.moveTo(px2, py2);
          else fill.lineTo(px2, py2);
        }
        for (let i = k - 1; i >= 0; i--) fill.lineTo(RX[i]! - RNX[i]! * RR[i]!, RY[i]! - RNY[i]! * RR[i]!);
        fill.closePath();
        for (let i = 0; i < k; i++) {
          const x = RX[i]! - RNX[i]! * RR[i]!;
          const y = RY[i]! - RNY[i]! * RR[i]!;
          if (i === 0) edge.moveTo(x, y);
          else edge.lineTo(x, y);
        }
      }
      for (let i = 0; i < k; i++) {
        if (i === 0) line.moveTo(RX[i]!, RY[i]!);
        else line.lineTo(RX[i]!, RY[i]!);
      }
    }
    if (!any) return;
    ctx.fillStyle = 'rgba(128,92,60,0.62)';
    ctx.fill(fill);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(70,46,32,0.5)';
    ctx.lineWidth = 0.7;
    ctx.stroke(edge);
    ctx.strokeStyle = 'rgba(47,42,34,0.55)';
    ctx.lineWidth = 0.5;
    ctx.stroke(line);
  }

  /** Luminous golden droplet travelling from the pulse root's tip to the trunk base, fading as it enters. */
  private drawPulse(ctx: CanvasRenderingContext2D, v: View, pulse: number, m: number): void {
    const r = this.model.roots[this.model.pulseRoot]!;
    const g = this.state.rootG[this.model.pulseRoot]!;
    const lv = Math.max(2, g * r.len);
    const s = lv * (1 - clamp(pulse, 0, 1));
    let i = 1;
    while (i < r.n - 1 && r.cum[i]! < s) i++;
    const f = clamp((s - r.cum[i - 1]!) / Math.max(1e-6, r.cum[i]! - r.cum[i - 1]!), 0, 1);
    const wx = r.px[i - 1]! + (r.px[i]! - r.px[i - 1]!) * f;
    const wy = r.py[i - 1]! + (r.py[i]! - r.py[i - 1]!) * f;
    const x = v.ox + wx * v.s;
    const y = v.oy - wy * v.s;
    const fade = pulse > 0.85 ? clamp((1 - pulse) / 0.15, 0, 1) : 1;
    const rad = Math.min(6, 4.6 + 2 * Math.min(1, m * 3)) * v.s;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,236,160,${0.95 * fade})`);
    gr.addColorStop(0.35, `rgba(244,190,60,${0.55 * fade})`);
    gr.addColorStop(1, 'rgba(240,180,41,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,248,214,${0.9 * fade})`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, rad * 0.32), 0, Math.PI * 2);
    ctx.fill();
  }

  /** soil mound with a slim wooden stake and a tiny string tag (no text) */
  private drawPlantingSpot(ctx: CanvasRenderingContext2D, v: View, sp: Sprites, stakeAlpha: number, settle: number): void {
    const s = v.s;
    const mw = 32;
    const mh = mw * 0.4 * (1.25 - 0.25 * settle);
    const m = sp.mound;
    ctx.globalAlpha = 1;
    ctx.drawImage(m.src, m.sx, m.sy, m.sw, m.sh, v.ox - (mw / 2) * s, v.oy - mh * 0.86 * s, mw * s, mh * s);
    // small dark planting hole on top of the mound
    ctx.fillStyle = 'rgba(52,34,24,0.55)';
    this.almondPath(ctx, v.ox, v.oy - mh * 0.62 * s, 0, 7.5 * s, 1.5 * s);
    ctx.fill();
    ctx.globalAlpha = stakeAlpha;
    const bx = v.ox + 12 * s;
    const by = v.oy + 2 * s;
    const tilt = 0.06;
    const top = 50 * s;
    const pt = (x: number, y: number) => [bx + x * s + tilt * y * s, by - y * s] as const;
    // stake body: lit left half, shadow right half, pointed foot
    const lf = new Path2D();
    const rt = new Path2D();
    const [a0x, a0y] = pt(-1.5, top / s);
    const [a1x, a1y] = pt(0, top / s + 1.2);
    const [a2x, a2y] = pt(1.5, top / s);
    const [b0x, b0y] = pt(-1.5, 0);
    const [b1x, b1y] = pt(0, -5);
    const [b2x, b2y] = pt(1.5, 0);
    lf.moveTo(a0x, a0y); lf.lineTo(a1x, a1y); lf.lineTo(b1x, b1y); lf.lineTo(b0x, b0y); lf.closePath();
    rt.moveTo(a1x, a1y); rt.lineTo(a2x, a2y); rt.lineTo(b2x, b2y); rt.lineTo(b1x, b1y); rt.closePath();
    ctx.fillStyle = '#DDBE86';
    ctx.fill(lf);
    ctx.fillStyle = '#A9824E';
    ctx.fill(rt);
    ctx.strokeStyle = 'rgba(47,42,34,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(a0x, a0y); ctx.lineTo(a1x, a1y); ctx.lineTo(a2x, a2y); ctx.lineTo(b2x, b2y); ctx.lineTo(b1x, b1y); ctx.lineTo(b0x, b0y); ctx.closePath();
    ctx.stroke();
    // string tag
    const [sx, sy] = pt(0, 42);
    const tx = sx - 9 * s;
    const ty = sy + 8 * s;
    ctx.strokeStyle = 'rgba(70,52,38,0.85)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx - 3 * s, sy + 8 * s, tx + 2.2 * s, ty);
    ctx.stroke();
    ctx.save();
    ctx.translate(tx, ty + 3.5 * s);
    ctx.rotate(-0.16);
    ctx.fillStyle = '#F6EBD0';
    ctx.strokeStyle = 'rgba(47,42,34,0.85)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(-4.6 * s, -3.3 * s);
    ctx.lineTo(4.6 * s, -3.3 * s);
    ctx.lineTo(4.6 * s, 3.3 * s);
    ctx.lineTo(-4.6 * s, 3.3 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(214,190,140,0.55)';
    ctx.fillRect(-4.6 * s, 1.2 * s, 9.2 * s, 2.1 * s);
    ctx.fillStyle = 'rgba(47,42,34,0.7)';
    ctx.beginPath();
    ctx.arc(-3 * s, -1.9 * s, Math.max(0.5, 0.5 * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawClump(ctx: CanvasRenderingContext2D, v: View, ci: number, sp: Sprites): void {
    const c = this.model.clumps[ci]!;
    const a = this.state.clumpA[ci]!;
    if (a <= 0.004) return;
    const cm = this.cm;
    const list = sp.kinds[c.kind];
    const spr: Spr = list[c.variant % list.length]!;
    const wcl = c.mass ? Math.min(c.w0 * (cm.wc / WE), 1.3 * cm.wc) : Math.min(c.w0 * cm.sf, 0.95 * cm.wc);
    const s = 0.75 + 0.25 * a;
    const dw = (wcl * s * v.s) / 0.72;
    const dh = (wcl * c.hr * s * v.s) / 0.84;
    const wy = mapY(c.y0, cm);
    let wx = c.x0 * cm.kx + wy * cm.tanLean;
    wx += this.windDX(wx, wy);
    const X = v.ox + wx * v.s;
    const Y = v.oy - wy * v.s;
    let rot = c.rot;
    if (this.windOn) rot += 0.025 * Math.sin(this.windT2 * 1.6 + c.phase) * (wy / H);
    const cull = this.cull;
    if (cull && (X + dw < cull.x0 || X - dw > cull.x1 || Y + dh < cull.y0 || Y - dh > cull.y1)) return;
    const dp = this.dprV;
    const cr = Math.cos(rot) * dp;
    const sr = Math.sin(rot) * dp;
    ctx.setTransform(cr, sr, -sr, cr, X * dp, Y * dp);
    if (c.inner && c.layer === 3) {
      // soft emerald/blue-green under-shadow where a front clump overlaps what is behind it (only on existing pigment)
      const u = sp.under;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = a * 0.6;
      ctx.drawImage(u.src, u.sx, u.sy, u.sw, u.sh, -0.5 * dw * 1.06 + 0.06 * dw, -PIVOT * dh + 0.3 * dh, dw * 1.06, dh * 0.95);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = a * (c.mass ? 0.9 : 0.97);
    ctx.drawImage(spr.src, spr.sx, spr.sy, spr.sw, spr.sh, -0.5 * dw, -PIVOT * dh, dw, dh);
    ctx.globalAlpha = 1;
    ctx.setTransform(dp, 0, 0, dp, 0, 0);
  }

  private drawGroundDetail(ctx: CanvasRenderingContext2D, v: View, p: PaintParams, sp: Sprites, mEff: number, plantK: number): void {
    const cw = Math.max(0, mEff) * 400;
    if (cw > 4) {
      const w = cw * 0.8;
      const h = Math.max(5, w * 0.15);
      ctx.globalAlpha = clamp(mEff * 5, 0, 0.9);
      const s = sp.shadow;
      ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, v.ox - w * 0.3 * v.s, v.oy - h * 0.4 * v.s, w * v.s, h * v.s);
      ctx.globalAlpha = 1;
    }
    const mt = clamp(p.months, 0, 12);
    const mound = 1 - 0.8 * smoothstep((mEff - 0.1) / 0.35);
    if (mound > 0.01) {
      const w = (28 + 10 * smoothstep(mt / 2)) * (1 + 0.5 * smoothstep((mEff - 0.05) / 0.4));
      const h = w * 0.4 * (1 + 0.28 * (1 - plantK));
      ctx.globalAlpha = mound;
      const s = sp.mound;
      ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, v.ox - (w / 2) * v.s, v.oy - h * 0.86 * v.s, w * v.s, h * v.s);
      ctx.globalAlpha = 1;
    }
  }

  private drawCotyledons(ctx: CanvasRenderingContext2D, v: View, p: PaintParams, mEff: number): void {
    const t = p.months;
    if (t <= 0.12) return;
    const grow = smoothstep((t - 0.15) / 2.4);
    const unfurl = smoothstep((t - 0.35) / 3.2);
    const fade = 1 - smoothstep((t - 5.5) / 3.5);
    if (grow <= 0.01 || fade <= 0.01) return;
    const stemH = mEff * H * 0.35;
    const nodeY = Math.min(6.2, stemH * 0.8);
    if (nodeY < 0.8) return;
    const bx = v.ox + this.windDX(0, nodeY) * v.s;
    const by = v.oy - nodeY * v.s;
    const L = (4.4 + 8 * grow) * v.s;
    for (let side = -1; side <= 1; side += 2) {
      const ang = (8 + 62 * unfurl) * (Math.PI / 180);
      const droop = 6 * (Math.PI / 180) * unfurl;
      const dirx = Math.sin(ang) * side;
      const diry = -Math.cos(ang) + droop;
      const nx = -diry;
      const ny = dirx;
      const wd = L * (0.2 + 0.2 * unfurl);
      const tipx = bx + dirx * L;
      const tipy = by + diry * L;
      ctx.globalAlpha = fade;
      const gr = ctx.createLinearGradient(bx, by - L * 0.5, bx + dirx * L, by + diry * L);
      gr.addColorStop(0, 'rgba(168,208,96,0.95)');
      gr.addColorStop(1, 'rgba(78,154,60,0.95)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.bezierCurveTo(bx + dirx * L * 0.25 + nx * wd * 1.3, by + diry * L * 0.25 + ny * wd * 1.3, tipx * 0.62 + bx * 0.38 + nx * wd * 1.15, tipy * 0.62 + by * 0.38 + ny * wd * 1.15, tipx, tipy);
      ctx.bezierCurveTo(tipx * 0.62 + bx * 0.38 - nx * wd * 0.95, tipy * 0.62 + by * 0.38 - ny * wd * 0.95, bx + dirx * L * 0.25 - nx * wd * 1.1, by + diry * L * 0.25 - ny * wd * 1.1, bx, by);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(PAL.emerald, 0.22);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba(PAL.ink, 0.8 * fade);
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + dirx * L * 0.82, by + diry * L * 0.82);
      ctx.strokeStyle = rgba('#F2F0B0', 0.75 * fade);
      ctx.lineWidth = Math.max(0.4, L * 0.035);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
