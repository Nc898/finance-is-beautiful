/**
 * Per-frame tree painting onto a TRANSPARENT canvas (paper/ground are a separate static backdrop).
 * Pure function of (model, maturity, months, wind time). Only skeleton paths + drawImage of pre-rendered
 * watercolor sprites happen here; no PRNG, no allocation of scratch arrays in the hot path.
 *
 * Layer order: ground contact -> back masses -> back clumps -> skeleton (roots, twigs, limbs/trunk)
 * -> mid clumps -> front lit clumps -> splatter -> cotyledons.
 */
import { clamp, smoothstep } from './prng';
import {
  H, createState, crownMap, evalState, mapY,
  type Branch, type CrownMap, type TreeModel, type TreeState,
} from './treeModel';
import { PAL, mixHex, rgba } from './watercolor';
import type { Sprites, Spr } from './sprites';

export interface View {
  /** screen px of world (0,0) = trunk base */
  ox: number;
  oy: number;
  /** css px per world unit */
  s: number;
}

export interface PaintParams {
  maturity: number;
  months: number;
  timeMs: number;
  wind: boolean;
}

const MAXP = 256;
const PIVOT = 0.82;
const BARK_BLOOM = ['rgba(176,104,52,0.15)', 'rgba(104,66,98,0.13)', 'rgba(214,168,86,0.16)'];

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
  private order: number[] = [];
  private windT1 = 0;
  private windT2 = 0;
  private windOn = false;
  private cm: CrownMap;
  mEff = 0;

  constructor(model: TreeModel) {
    this.model = model;
    this.state = createState(model);
    this.cm = crownMap(0.05, model.tanLean);
    for (const b of model.branches) {
      const t = b.tone;
      this.shadowCol.push(b.isRoot ? mixHex('#33241A', '#47321F', t) : mixHex('#3E2A22', '#56392C', t));
      this.litCol.push(b.isRoot ? mixHex('#8F6D48', '#A07C52', t) : mixHex('#B88F5E', '#CFA56E', t));
    }
    // children first (deeper first), trunk last, so a parent's body covers its children's bases
    for (let i = model.branches.length - 1; i >= 0; i--) this.order.push(i);
  }

  private windDX(x: number, y: number): number {
    if (!this.windOn) return 0;
    const h = y / H;
    if (h <= 0) return 0;
    return 7.5 * h * Math.sqrt(h) * (Math.sin(this.windT1 + x * 0.006) + 0.45 * Math.sin(this.windT2 + y * 0.01 + 1.3));
  }

  /** Visible-point setup for a branch (mature coords -> screen). Returns point count. */
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

  private drawRibbon(ctx: CanvasRenderingContext2D, b: Branch, k: number, litS: number, v: View): void {
    const X = this.X, Y = this.Y, R = this.R, NX = this.NX, NY = this.NY, IM = this.IM;
    const bi = b.idx;
    const rMax = R[0]!;
    const big = rMax > 3.2;
    // silhouette
    const sil = new Path2D();
    for (let i = 0; i < k; i++) sil.lineTo(X[i]! + NX[i]! * R[i]! * litS, Y[i]! + NY[i]! * R[i]! * litS);
    for (let i = k - 1; i >= 0; i--) sil.lineTo(X[i]! - NX[i]! * R[i]! * litS, Y[i]! - NY[i]! * R[i]! * litS);
    if (big) {
      // wet-in-wet wash: tan lit side -> sienna -> umber -> violet-brown shadow side, one smooth gradient per
      // short segment (so it follows the local width of long limbs); segments overlap by one point
      const t = b.tone;
      const SEG = 7;
      for (let s0 = 0; s0 < k - 1; s0 += SEG) {
        const e = Math.min(k - 1, s0 + SEG);
        const e2 = Math.min(k - 1, e + 1);
        const seg = new Path2D();
        for (let i = s0; i <= e2; i++) seg.lineTo(X[i]! + NX[i]! * R[i]! * litS, Y[i]! + NY[i]! * R[i]! * litS);
        for (let i = e2; i >= s0; i--) seg.lineTo(X[i]! - NX[i]! * R[i]! * litS, Y[i]! - NY[i]! * R[i]! * litS);
        const mi = (s0 + e) >> 1;
        const gx = NX[mi]! * R[mi]! * litS;
        const gy = NY[mi]! * R[mi]! * litS;
        const gr = ctx.createLinearGradient(X[mi]! + gx, Y[mi]! + gy, X[mi]! - gx, Y[mi]! - gy);
        gr.addColorStop(0, t < 0.5 ? '#DDB57C' : '#D3AA72');
        gr.addColorStop(0.25, '#BC8D57');
        gr.addColorStop(0.55, '#8F5F3B');
        gr.addColorStop(0.82, '#5C3A2C');
        gr.addColorStop(1, '#46304A');
        ctx.fillStyle = gr;
        ctx.fill(seg);
      }
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
          this.almondPath(ctx, cx, cy, Math.atan2(NX[ii]!, -NY[ii]!) + Math.PI / 2, sz * 2.4, sz * 0.9);
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
      ctx.strokeStyle = big ? 'rgba(246,234,198,0.7)' : 'rgba(246,234,198,0.55)';
      ctx.lineWidth = clamp(rMax * 0.1, 0.5, 2);
      ctx.lineCap = 'round';
      const hl = new Path2D();
      for (let i = 0; i < k; i++) {
        const f = 0.6 + b.jitA[IM[i]!]! * 0.5;
        const x = X[i]! + NX[i]! * R[i]! * litS * f;
        const y = Y[i]! + NY[i]! * R[i]! * litS * f;
        if (i === 0) hl.moveTo(x, y);
        else hl.lineTo(x, y);
      }
      ctx.stroke(hl);
    }
    // vertical striation strokes: dark in the shadow, pale on the lit side
    if (big && b.hatch.length) {
      const dark = new Path2D();
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
        const p = b.hatch[5 * h + 4] ? light : dark;
        p.moveTo(cx - dx * ln * 0.5, cy - dy * ln * 0.5);
        p.lineTo(cx + dx * ln * 0.5, cy + dy * ln * 0.5);
      }
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = 'rgba(52,32,28,0.4)';
      ctx.stroke(dark);
      ctx.strokeStyle = 'rgba(248,232,196,0.34)';
      ctx.stroke(light);
      // knots
      for (let q = 0; q < b.knots.length / 3; q++) {
        const ii = Math.floor((b.knots[3 * q]! * (b.n - 1)) / this.step);
        if (ii >= k - 1 || ii < 1) continue;
        const off = b.knots[3 * q + 1]!;
        const sz = b.knots[3 * q + 2]! * v.s;
        const cx = X[ii]! - NX[ii]! * R[ii]! * litS * off * 0.5;
        const cy = Y[ii]! - NY[ii]! * R[ii]! * litS * off * 0.5;
        this.almondPath(ctx, cx, cy, Math.atan2(NX[ii]!, -NY[ii]!) + Math.PI / 2 + 0.2, sz * 1.5, sz * 0.7);
        ctx.fillStyle = 'rgba(58,36,30,0.55)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(47,42,34,0.7)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
    // broken dry-brush sepia contour: runs of varying width separated by gaps
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
      ctx.strokeStyle = side === 0 ? 'rgba(47,42,34,0.78)' : 'rgba(47,42,34,0.92)';
      for (let c = 1; c <= 3; c++) {
        ctx.lineWidth = [0, 0.5, 0.8, 1.15][c]! * sc * (side === 0 ? 0.7 : 1);
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
    const mSprout = 0.04 * smoothstep(p.months / 3.5);
    const mEff = Math.max(p.maturity, p.months > 0 ? mSprout : 0);
    this.mEff = mEff;
    this.windOn = p.wind;
    this.windT1 = p.timeMs * 0.0011;
    this.windT2 = p.timeMs * 0.0027;
    ctx.save();
    ctx.lineJoin = 'round';
    this.drawGroundDetail(ctx, v, p, sp, mEff);
    if (mEff <= 0) {
      ctx.restore();
      return;
    }
    const cm = crownMap(mEff, model.tanLean);
    this.cm = cm;
    evalState(model, mEff, st);
    const L = model.layers;

    // back washes and clumps that sit behind the limbs
    for (let i = 0; i < L[0].length; i++) this.drawClump(ctx, v, L[0][i]!, sp);
    for (let i = 0; i < L[1].length; i++) this.drawClump(ctx, v, L[1][i]!, sp);

    // skeleton: roots (earth), then fine twigs in one batched fill, then limbs/trunk children-first
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
      if (k < 2) continue;
      {
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
    }
    // roots first (under the trunk flare)
    for (let oi = 0; oi < this.order.length; oi++) {
      const b = br[this.order[oi]!]!;
      if (!b.isRoot) continue;
      const g = st.g[b.idx]!;
      if (g <= 0.0005) continue;
      const k = this.prep(b, g, st.kappa[b.idx]!, v, g >= 0.999);
      if (k < 2) continue;
      ctx.globalAlpha = 0.92;
      this.drawRibbon(ctx, b, k, -b.lightSign, v);
      // melt the tip into the ground wash
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(150,178,96,0.45)';
      const j0 = Math.floor(k * 0.7);
      for (let j = j0; j < k; j += 1) {
        this.almondPath(ctx, X[j]!, Y[j]!, 0, R[j]! * 3.2 + 1.5, R[j]! * 1.1 + 0.6);
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
      if (k < 2) continue;
      this.drawRibbon(ctx, b, k, -b.lightSign, v);
    }

    // mid, then front lit clumps
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

  private drawClump(ctx: CanvasRenderingContext2D, v: View, ci: number, sp: Sprites): void {
    const c = this.model.clumps[ci]!;
    const a = this.state.clumpA[ci]!;
    if (a <= 0.004) return;
    const cm = this.cm;
    const list = sp.kinds[c.kind];
    const spr: Spr = list[c.variant % list.length]!;
    const wcl = c.mass ? Math.min(c.w0 * (cm.wc / 400), 1.3 * cm.wc) : Math.min(c.w0 * cm.sf, 0.95 * cm.wc);
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
    ctx.globalAlpha = a * (c.mass ? 0.9 : 0.97);
    if (rot !== 0) {
      ctx.translate(X, Y);
      ctx.rotate(rot);
      ctx.drawImage(spr.src, spr.sx, spr.sy, spr.sw, spr.sh, -0.5 * dw, -PIVOT * dh, dw, dh);
      ctx.rotate(-rot);
      ctx.translate(-X, -Y);
    } else {
      ctx.drawImage(spr.src, spr.sx, spr.sy, spr.sw, spr.sh, X - 0.5 * dw, Y - PIVOT * dh, dw, dh);
    }
    ctx.globalAlpha = 1;
  }

  private drawGroundDetail(ctx: CanvasRenderingContext2D, v: View, p: PaintParams, sp: Sprites, mEff: number): void {
    // soft cast shadow to the right (light upper-left), scales with canopy width
    const cw = Math.max(0, mEff) * 400;
    if (cw > 4) {
      const w = cw * 0.8;
      const h = Math.max(5, w * 0.15);
      ctx.globalAlpha = clamp(mEff * 5, 0, 0.9);
      const s = sp.shadow;
      ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, v.ox - w * 0.3 * v.s, v.oy - h * 0.4 * v.s, w * v.s, h * v.s);
      ctx.globalAlpha = 1;
    }
    // soil mound: planted seed -> sprout, soft-fades into the root flare later
    const mt = clamp(p.months, 0, 12);
    const mound = smoothstep(0.02 + mt * 40) * (1 - 0.8 * smoothstep((mEff - 0.1) / 0.35));
    if (mound > 0.01 && (p.months > 0 || p.maturity > 0)) {
      const w = (28 + 10 * smoothstep(mt / 2)) * (1 + 0.5 * smoothstep((mEff - 0.05) / 0.4));
      const h = w * 0.4;
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
