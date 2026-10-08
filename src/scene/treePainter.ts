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
import { paintGroundJoin, paintRootCrown, paintRoots, rootCenterline } from './rootArt';
import { buildPath, drawBill, drawRestingBill, type BillFlight, type BillPose, type Line } from './bills';

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
  /** ≥ 0 while contributions are flowing (playing, motion allowed): bills are released each year of growth; −1 for none */
  pulse?: number;
  /** screen rect (css px): anything entirely outside is skipped (loupe) */
  cull?: { x0: number; y0: number; x1: number; y1: number };
  /** whole years of contributions = bills resting in the canopy */
  bills?: number;
  /** fade newly added canvas bills in even when wind is off (the landing sways trees as whole images) */
  fadeBills?: boolean;
  /** px per world unit used to size bills (the unzoomed scale), so camera zoom never magnifies them */
  billScale?: number;
  /** leave bills out entirely (the close-up insets show wood and leaves, not money) */
  noBills?: boolean;
  /** planting spot instead of a tree */
  unplanted?: boolean;
  /** 0..1 planting transition (stake fades, mound settles); 1 = fully planted */
  plantK?: number;
}

const MAXP = 256;
/** most bills a canopy can hold (years of contributions); the age range allows at most 74 */
const MAX_SLOTS = 80;
const PIVOT = 0.82;
const BARK_BLOOM = ['rgba(176,104,52,0.12)', 'rgba(104,66,98,0.1)', 'rgba(214,168,86,0.13)'];

let barkTile: HTMLCanvasElement | null = null;
const barkPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
export function barkPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
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

  /* contribution bills */
  private bills: BillFlight[] = [];
  private billId = 0;
  private lastSpawn = -1e9;
  private rootRs = 1;
  private rootDrop = 0;
  /** main roots (long, depth 0) the bills start from, and scaffold limbs they can travel out along */
  private mainRoots: number[] = [];
  private scaffolds: number[] = [];
  private scaffoldSet = new Set<number>();
  /** screen polylines of the trunk and scaffolds, captured as they are drawn this frame */
  private cap = new Map<number, Line>();
  /** canopy slots: each bill rests on a fixed clump with a fixed offset/angle (generated once) */
  private slots: Array<{ clump: number; dx: number; dy: number; ang: number; size: number; mirror: number; variant: number }> = [];
  private slotsByClump = new Map<number, number[]>();
  /** wall-clock time each slot appeared (−Infinity = shown at once), −1 = not shown */
  private slotBorn = new Float64Array(MAX_SLOTS).fill(-1);
  private billCount = 0;
  private billNow = 0;
  private billSize = 20;
  private haveCount = false;
  /** last whole month of contributions seen (bills start flowing from the first one) */
  private lastMonth = -1;
  private hideBills = false;

  constructor(model: TreeModel) {
    this.model = model;
    this.state = createState(model);
    model.roots.forEach((r, i) => {
      if (r.depth === 0 && r.len > 70) this.mainRoots.push(i);
    });
    this.scaffolds = model.branches
      .filter((b) => b.parent === 0 && !b.isRoot)
      .sort((a, b) => b.r0 - a.r0)
      .slice(0, 3)
      .map((b) => b.idx);
    this.scaffoldSet = new Set(this.scaffolds);
    // canopy slots: mid/front clumps in birth order (which is spread over the dome), so early bills sit
    // on early clumps and are visible on a young tree; offsets and angles from an index hash
    const cand = model.clumps
      .map((c, i) => ({ c, i }))
      .filter((o) => o.c.layer >= 2 && !o.c.mass)
      .sort((a, b) => a.c.birth - b.c.birth)
      .map((o) => o.i);
    const hh = (a: number, b: number) => {
      const t = Math.sin(a * 12.9898 + b * 78.233 + model.seed * 0.137) * 43758.5453;
      return t - Math.floor(t);
    };
    for (let k = 0; k < MAX_SLOTS && cand.length; k++) {
      const clump = cand[(k * 3) % cand.length]!;
      this.slots.push({
        clump,
        dx: (hh(k, 1) - 0.5) * 0.55,
        dy: (hh(k, 2) - 0.6) * 0.45,
        ang: (hh(k, 3) - 0.5) * 1.9,
        size: 0.72 + hh(k, 4) * 0.22,
        mirror: hh(k, 5) < 0.5 ? -1 : 1,
        variant: k % 3,
      });
      const list = this.slotsByClump.get(clump) ?? [];
      list.push(k);
      this.slotsByClump.set(clump, list);
    }
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

  /** world point framed by the 'branches' loupe: the fork collar + ~40 % up the scaffold limbs (and their first clumps) */
  forkCenter(m: number): { x: number; y: number } {
    const cm = crownMap(Math.max(m, 0.004), this.model.tanLean);
    const br = this.model.branches;
    let sx = 0;
    let sy = 0;
    let n = 0;
    const take = (b: Branch, s: number) => {
      let i = 1;
      while (i < b.n - 1 && b.cum[i]! < s) i++;
      const wy = mapY(b.py[i]!, cm);
      sx += b.px[i]! * cm.kx + wy * cm.tanLean;
      sy += wy;
      n++;
    };
    const trunk = br[0]!;
    let sFork = 1e9;
    for (const b of br) if (b.depth === 1 && b.parent === 0) sFork = Math.min(sFork, b.tAttach * trunk.len);
    for (const b of br) if (b.depth === 1 && b.parent === 0 && b.tAttach * trunk.len < sFork + 10) take(b, 20);
    take(trunk, sFork + 20);
    return { x: sx / n, y: sy / n };
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
    const rs = Math.pow(cm.m, 0.9) * kappa * (b.depth <= 1 && !b.isRoot ? 1 + 0.35 * smoothstep((cm.m - 0.22) / 0.78) : 1);
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
      const trunkClass = rMax > 6;
      ctx.fillStyle = trunkClass ? 'rgba(230,196,140,0.13)' : 'rgba(230,196,140,0.2)';
      for (const f of trunkClass ? [0.82, 0.62, 0.42, 0.22, 0.02] : [0.7, 0.3]) ctx.fill(this.band(b, k, litS, 0.98, f, 0.07));
      ctx.fillStyle = trunkClass ? 'rgba(86,52,40,0.13)' : 'rgba(86,52,40,0.2)';
      for (const f of trunkClass ? [0.0, -0.2, -0.4, -0.58, -0.76] : [-0.05, -0.4, -0.7]) ctx.fill(this.band(b, k, litS, -0.98, f, 0.07));
      if (trunkClass) {
        ctx.fillStyle = 'rgba(66,46,78,0.14)';
        for (const f of [-0.5, -0.7]) ctx.fill(this.band(b, k, litS, -0.98, f, 0.06));
      }
      // granulation / striated paper-tooth texture
      if (rMax > 4.5) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = barkPattern(ctx);
        ctx.fill(sil);
        ctx.restore();
      }
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
        if (R[ii]! < 2.2) continue; // thin parts of a long chain carry no bark marks
        const ln = Math.min(b.hatch[5 * h + 2]! * v.s, R[ii]! * 5);
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
        // knots belong to established bark: none on a slender young stem, and never wider than the trunk allows
        if (R[ii]! < 3.2) continue;
        const off = b.knots[3 * q + 1]!;
        const sz = Math.min(b.knots[3 * q + 2]! * v.s * 0.7, R[ii]! * 0.45);
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
    this.cap.clear();

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
      if (b.rad[0]! * Math.pow(cm.m, 0.9) * st.kappa[b.idx]! * (b.depth <= 1 ? 1 + 0.35 * smoothstep((cm.m - 0.22) / 0.78) : 1) * v.s >= 1.6) continue;
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
      // surface roots flare out only once the trunk has some girth (not on a sapling)
      const g = st.g[b.idx]! * smoothstep((mEff - 0.2) / 0.3);
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
      if (b.rad[0]! * Math.pow(cm.m, 0.9) * st.kappa[b.idx]! * (b.depth <= 1 ? 1 + 0.35 * smoothstep((cm.m - 0.22) / 0.78) : 1) * v.s < 1.6) continue;
      const k = this.prep(b, g, st.kappa[b.idx]!, v, g >= 0.999);
      if (k >= 2 && (b.idx === 0 || this.scaffoldSet.has(b.idx))) {
        this.cap.set(b.idx, { x: Array.from(this.X.subarray(0, k)), y: Array.from(this.Y.subarray(0, k)) });
      }
      if (k < 2 || this.outside(k)) continue;
      this.drawRibbon(ctx, b, k, -b.lightSign, v);
    }

    this.drawBaseBlend(ctx, v, mEff);

    this.drawBills(ctx, v, p, mEff);

    for (let i = 0; i < L[2].length; i++) {
      this.drawClump(ctx, v, L[2][i]!, sp);
      this.drawSlotBills(ctx, v, L[2][i]!);
    }
    for (let i = 0; i < L[3].length; i++) {
      this.drawClump(ctx, v, L[3][i]!, sp);
      this.drawSlotBills(ctx, v, L[3][i]!);
    }

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

  /** Bark-painted root system in the soil, then the root crown that carries the trunk below ground. */
  private drawRoots(ctx: CanvasRenderingContext2D, v: View, m: number): void {
    const rs = Math.pow(Math.max(m, 0.02), 0.78);
    const bark = barkPattern(ctx);
    const w = this.trunkBaseR(m) * 1.1;
    const k = smoothstep((m - 0.05) / 0.12);
    // the collar first, then the roots over it so their flared bases visibly grow out of the trunk
    paintRootCrown(ctx, v, w * v.s, this.model.seed, k, bark);
    this.rootRs = rs;
    this.rootDrop = w * 0.45 * k;
    paintRoots(ctx, v, this.model.roots, this.state.rootG, rs, this.model.seed, bark, this.rootDrop);
  }

  /**
   * Contribution bills. One is released each year of growth while contributions are flowing
   * (at most one every 0.85 s and three in flight, so fast playback never floods the tree). Each
   * travels root tip → root → trunk → limb → canopy on the tree as drawn this frame, and is drawn
   * before the mid and front foliage so it disappears into the leaves.
   */
  private drawBills(ctx: CanvasRenderingContext2D, v: View, p: PaintParams, m: number): void {
    const now = p.timeMs;
    this.billNow = now;
    this.billSize = clamp(38 * (p.billScale ?? v.s), 24, 54) * (0.75 + 0.25 * Math.min(1, m * 2));
    this.hideBills = !!p.noBills;
    if (this.hideBills) return;
    const count = Math.min(this.slots.length, Math.max(0, Math.floor(p.bills ?? 0)));
    if (!p.cull) {
      // which slots are showing, and since when (fade in when they arrive without a flight)
      const instant = (!p.wind && !p.fadeBills) || !this.haveCount;
      for (let k = 0; k < this.slots.length; k++) {
        if (k >= count) this.slotBorn[k] = -1;
        else if (this.slotBorn[k]! === -1) this.slotBorn[k] = instant ? -Infinity : now;
      }
      if (!p.wind) this.bills.length = 0;
      const flowing = p.wind && p.pulse !== undefined && p.pulse >= 0;
      const month = Math.floor(p.months + 1e-6);
      const root = this.billRoot(this.billId);
      if (flowing && this.haveCount && root >= 0 && this.bills.length < 3 && now - this.lastSpawn > 850) {
        const newYear = count > this.billCount && m > 0.05;
        const newMonth = month > this.lastMonth && this.lastMonth >= 0;
        if (newYear || newMonth) {
          const id = this.billId++;
          // a new year's bill lands and stays in the canopy; the months in between are absorbed by the tree
          this.bills.push({
            id, slot: newYear ? count - 1 : -1, t0: now, dur: 0, root,
            route: -2, // chosen once the destination is known
            variant: newYear ? this.slots[count - 1]!.variant : id % 3,
          });
          this.lastSpawn = now;
        }
      }
      this.lastMonth = month;
      this.billCount = count;
      this.haveCount = true;
      this.bills = this.bills.filter((f) => f.slot < count && (f.dur === 0 || now - f.t0 < f.dur));
    } else {
      this.billCount = count;
    }
    if (!this.bills.length) return;
    // the trunk as drawn; a seedling's stem is too thin to be captured, so follow it straight up
    const trunk = this.cap.get(0) ?? this.stemLine(v, m);
    for (const f of this.bills) {
      const g = this.state.rootG[f.root]!;
      if (g <= 0.01) continue;
      const tt = trunk.x.length - 1;
      // absorbed bills end high on the trunk (into the young crown); canopy bills at their slot
      const rest: BillPose =
        f.slot >= 0
          ? this.slotPose(f.slot, v)
          : { x: trunk.x[tt]!, y: trunk.y[tt]!, ang: 0, size: this.billSize, mirror: 1 };
      if (f.route === -2) {
        // out along the scaffold whose tip is nearest the landing spot (or up the leader)
        let best = Infinity;
        f.route = -1;
        this.scaffolds.forEach((si, r) => {
          const sc = this.cap.get(si);
          if (!sc) return;
          const d = Math.hypot(sc.x[sc.x.length - 1]! - rest.x, sc.y[sc.y.length - 1]! - rest.y);
          if (d < best) {
            best = d;
            f.route = r;
          }
        });
        if (f.slot < 0 || Math.hypot(trunk.x[tt]! - rest.x, trunk.y[tt]! - rest.y) < best) f.route = -1;
      }
      const rl = rootCenterline(this.model.roots[f.root]!, g, this.rootRs, v, f.root, this.rootDrop);
      rl.x.reverse();
      rl.y.reverse();
      const pieces: Line[] = [rl];
      const sc = f.route >= 0 ? this.cap.get(this.scaffolds[f.route]!) : undefined;
      if (sc) {
        let j = 0;
        let best = Infinity;
        for (let i = 0; i < trunk.x.length; i++) {
          const d = Math.hypot(trunk.x[i]! - sc.x[0]!, trunk.y[i]! - sc.y[0]!);
          if (d < best) {
            best = d;
            j = i;
          }
        }
        pieces.push({ x: trunk.x.slice(0, j + 1), y: trunk.y.slice(0, j + 1) });
        const e = Math.max(2, Math.ceil(sc.x.length * 0.8));
        pieces.push({ x: sc.x.slice(0, e), y: sc.y.slice(0, e) });
      } else if (f.slot < 0) {
        pieces.push(trunk);
      } else {
        const e = Math.max(2, Math.ceil(trunk.x.length * 0.8));
        pieces.push({ x: trunk.x.slice(0, e), y: trunk.y.slice(0, e) });
      }
      // final leg: from the wood out to the resting spot among the leaves
      if (f.slot >= 0) pieces.push({ x: [rest.x], y: [rest.y] });
      const total = buildPath(pieces);
      if (f.dur === 0) {
        if (p.cull) continue;
        f.dur = clamp(2500 + (total / Math.max(0.2, v.s)) * 3.2, 2900, 4800);
      }
      drawBill(ctx, f, now, total, this.billSize, v.oy, rest);
    }
  }

  /**
   * Root for the next bill: a grown main root when there is one, otherwise the seedling's taproot or
   * side roots (so bills can flow from the very first month). −1 when no root is visible yet.
   */
  private billRoot(id: number): number {
    const g = this.state.rootG;
    const main = this.mainRoots.filter((ri) => g[ri]! > 0.3);
    if (main.length) return main[(id * 2 + 1) % main.length]!;
    const young: number[] = [];
    this.model.roots.forEach((r, i) => {
      if (r.depth <= 1 && g[i]! > 0.15 && r.len > 20) young.push(i);
    });
    return young.length ? young[id % young.length]! : -1;
  }

  /** Screen polyline up a seedling's stem (base to tip), for when the trunk is too thin to be captured. */
  private stemLine(v: View, m: number): Line {
    const h = Math.max(4, m * H * 0.85);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const y = (h * i) / 6;
      xs.push(v.ox + this.windDX(0, y) * v.s);
      ys.push(v.oy - y * v.s);
    }
    return { x: xs, y: ys };
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

  /** Screen pose of a clump this frame (position with wind, rotation, drawn size). */
  private clumpPose(ci: number, v: View): { X: number; Y: number; rot: number; dw: number; dh: number; wy: number } {
    const c = this.model.clumps[ci]!;
    const a = this.state.clumpA[ci]!;
    const cm = this.cm;
    const wcl = c.mass ? Math.min(c.w0 * (cm.wc / WE), 1.3 * cm.wc) : Math.min(c.w0 * cm.sf, 0.95 * cm.wc);
    const s = 0.75 + 0.25 * a;
    const dw = (wcl * s * v.s) / 0.72;
    const dh = (wcl * c.hr * s * v.s) / 0.84;
    const wy = mapY(c.y0, cm);
    let wx = c.x0 * cm.kx + wy * cm.tanLean;
    wx += this.windDX(wx, wy);
    let rot = c.rot;
    if (this.windOn) rot += 0.025 * Math.sin(this.windT2 * 1.6 + c.phase) * (wy / H);
    return { X: v.ox + wx * v.s, Y: v.oy - wy * v.s, rot, dw, dh, wy };
  }

  /** How many canopy bill slots this tree has. */
  get billSlots(): number {
    return this.slots.length;
  }

  /** Resting pose of canopy bill k as of the most recent paint, in that paint's view coordinates. */
  restingBillPose(k: number, v: View): BillPose {
    return this.slotPose(Math.min(k, this.slots.length - 1), v);
  }

  /** Resting pose of canopy slot k this frame: rides its clump (wind included) with a little flutter of its own. */
  private slotPose(k: number, v: View): BillPose {
    const sl = this.slots[k]!;
    const cp = this.clumpPose(sl.clump, v);
    const ox = sl.dx * cp.dw;
    const oy = sl.dy * cp.dh - PIVOT * cp.dh * 0.25;
    const cr = Math.cos(cp.rot), sr = Math.sin(cp.rot);
    const flutter = this.windOn ? 0.09 * Math.sin(this.windT2 * 1.4 + k * 1.7) + 0.04 * Math.sin(this.windT1 * 3.1 + k) : 0;
    return {
      x: cp.X + ox * cr - oy * sr,
      y: cp.Y + ox * sr + oy * cr,
      ang: sl.ang + cp.rot + flutter,
      size: this.billSize * sl.size,
      mirror: sl.mirror,
    };
  }

  /** Bills resting on clump ci, drawn right after it so later leaves tuck over them. */
  private drawSlotBills(ctx: CanvasRenderingContext2D, v: View, ci: number): void {
    const ks = this.slotsByClump.get(ci);
    if (!ks || this.hideBills) return;
    const ca = this.state.clumpA[ci]!;
    if (ca < 0.3) return;
    for (const k of ks) {
      if (k >= this.billCount) continue;
      if (this.bills.some((f) => f.slot === k)) continue; // still flying in
      const born = this.slotBorn[k]!;
      const appear = born === -Infinity ? 1 : born < 0 ? 0 : smoothstep((this.billNow - born) / 450);
      const dp = this.dprV;
      ctx.setTransform(dp, 0, 0, dp, 0, 0);
      drawRestingBill(ctx, this.slotPose(k, v), this.slots[k]!.variant, appear * smoothstep((ca - 0.3) / 0.5), k + this.model.seed);
    }
  }

  private drawClump(ctx: CanvasRenderingContext2D, v: View, ci: number, sp: Sprites): void {
    const c = this.model.clumps[ci]!;
    const a = this.state.clumpA[ci]!;
    if (a <= 0.004) return;
    const list = sp.kinds[c.kind];
    const spr: Spr = list[c.variant % list.length]!;
    const { X, Y, rot, dw, dh } = this.clumpPose(ci, v);
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

  /** Trunk radius at the ground (world units) at maturity m, matching the girth rule in prep(). */
  private trunkBaseR(m: number): number {
    const b = this.model.branches[0]!;
    return b.rad[0]! * Math.pow(m, 0.9) * this.state.kappa[0]! * (1 + 0.35 * smoothstep((m - 0.22) / 0.78));
  }

  /** Grass, crumbs and damp soil over the trunk foot, so it sits in the meadow. */
  private drawBaseBlend(ctx: CanvasRenderingContext2D, v: View, m: number): void {
    paintGroundJoin(ctx, v, this.trunkBaseR(m) * 1.15 * v.s, this.model.seed, smoothstep((m - 0.05) / 0.12));
  }

  private drawGroundDetail(ctx: CanvasRenderingContext2D, v: View, p: PaintParams, sp: Sprites, mEff: number, plantK: number): void {
    const cw = Math.max(0, mEff) * 400;
    if (cw > 4) {
      const w = cw * 0.8;
      const h = Math.max(5, w * 0.15);
      // the cast shadow falls on the grass band only (not the soil cut-away, not the paper above)
      ctx.save();
      ctx.beginPath();
      ctx.rect(v.ox - w * 2 * v.s, v.oy - 7 * v.s, w * 4 * v.s, 8 * v.s);
      ctx.clip();
      ctx.globalAlpha = clamp(mEff * 5, 0, 0.75);
      const s = sp.shadow;
      ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, v.ox - w * 0.3 * v.s, v.oy - h * 0.4 * v.s, w * v.s, h * v.s);
      ctx.restore();
    }
    const mt = clamp(p.months, 0, 12);
    // a low, soft hump of turned soil that settles back into the meadow as the seedling establishes
    const mound = 1 - smoothstep((mEff - 0.03) / 0.08);
    if (mound > 0.01) {
      // soft turned earth: a feathered wash, darkest at the stem, no hard silhouette
      const w = (10 + 5 * smoothstep(mt / 2)) * v.s;
      const h = w * 0.16 * (1 + 0.4 * (1 - plantK));
      const g = ctx.createRadialGradient(v.ox, v.oy, 0, v.ox, v.oy, w * 0.5);
      g.addColorStop(0, `rgba(120,86,54,${0.55 * mound})`);
      g.addColorStop(0.55, `rgba(150,112,72,${0.3 * mound})`);
      g.addColorStop(1, 'rgba(160,124,84,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(v.ox, v.oy - h * 0.25, w * 0.5, h, 0, Math.PI, 0);
      ctx.ellipse(v.ox, v.oy - h * 0.25, w * 0.5, h * 0.35, 0, 0, Math.PI);
      ctx.fill();
    }
  }

  private drawCotyledons(ctx: CanvasRenderingContext2D, v: View, p: PaintParams, mEff: number): void {
    const t = p.months;
    if (t <= 0.12) return;
    const grow = smoothstep((t - 0.15) / 2.4);
    const unfurl = smoothstep((t - 0.35) / 3.2);
    // seed leaves yield to the true leaves: they yellow and fall away as the first crown clumps appear
    const crownIn = smoothstep((mEff - 0.042) / 0.03);
    const fade = (1 - smoothstep((t - 5.5) / 3.5)) * (1 - crownIn);
    if (grow <= 0.01 || fade <= 0.01) return;
    const stemH = mEff * H * 0.35;
    const nodeY = Math.min(6.2, stemH * 0.8);
    if (nodeY < 0.8) return;
    const bx = v.ox + this.windDX(0, nodeY) * v.s;
    const by = v.oy - nodeY * v.s;
    const L = (2.4 + 3.8 * grow) * v.s;
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
      // fresh green, turning a little yellow as they are outgrown
      const y = crownIn;
      gr.addColorStop(0, `rgba(${Math.round(168 + 40 * y)},${Math.round(208 - 6 * y)},${Math.round(96 - 20 * y)},0.95)`);
      gr.addColorStop(1, `rgba(${Math.round(78 + 90 * y)},${Math.round(154 + 20 * y)},${Math.round(60 - 10 * y)},0.95)`);
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
