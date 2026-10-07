/**
 * Contribution bills: small watercolor-and-ink banknotes that travel from a root tip, along the root,
 * up the trunk and out along a limb into the canopy, where they dissolve into leaf-green dabs —
 * money going in at the roots and becoming growth.
 *
 * Decorative only: flights are timed by wall-clock (like wind), never change growth state, and are
 * off in reduced motion. Paths are rebuilt every frame from the tree as drawn, so bills stay on the
 * wood as it sways and grows.
 */
import { Rand, clamp, smoothstep } from './prng';
import { deform, makeCanvas, rgba, tracePoly } from './watercolor';

/* ------------------------------------------------------------------ sprites */

const SW = 120;
const SH = 54;
let sprites: HTMLCanvasElement[] | null = null;

/** Three painted bill variants (front faces), generated once. */
export function billSprites(): HTMLCanvasElement[] {
  if (sprites) return sprites;
  sprites = [0, 1, 2].map((i) => paintBill(31 + i * 17, i));
  return sprites;
}

function paintBill(seed: number, variant: number): HTMLCanvasElement {
  const cv = makeCanvas(SW, SH);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const m = 4;
  const W = SW - 2 * m;
  const H = SH - 2 * m;
  const rect = [m, m, m + W, m, m + W, m + H, m, m + H];
  // dense outline so deformation gives soft, slightly irregular paper edges
  const poly: number[] = [];
  for (let e = 0; e < 4; e++) {
    const ax = rect[e * 2]!, ay = rect[e * 2 + 1]!;
    const bx = rect[((e + 1) % 4) * 2]!, by = rect[((e + 1) % 4) * 2 + 1]!;
    for (let t = 0; t < 8; t++) poly.push(ax + ((bx - ax) * t) / 8, ay + ((by - ay) * t) / 8);
  }
  const hue = ['#CFDDB3', '#C8D9B0', '#D3DEB8'][variant]!;
  const deep = ['#9DBB86', '#94B482', '#A3BE8A'][variant]!;
  // layered sage washes
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = rgba(hue, 0.55);
    tracePoly(ctx, deform(poly, rnd, 2, 0.012));
    ctx.fill();
  }
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = rgba(deep, 0.22);
    tracePoly(ctx, deform(poly, rnd, 2, 0.02));
    ctx.fill();
  }
  // a cooler bloom on one side, warmer paper on the other
  const g = ctx.createLinearGradient(m, 0, m + W, 0);
  g.addColorStop(0, 'rgba(120,160,120,0.18)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(214,196,140,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(m, m, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // pale portrait oval in the middle with a suggested engraving
  const cx = SW / 2, cy = SH / 2;
  ctx.fillStyle = 'rgba(244,244,226,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.15, H * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(52,80,56,0.55)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(52,80,56,0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, W * 0.06, H * 0.16, 0, 0, Math.PI * 2);
  ctx.moveTo(cx - W * 0.09, cy + H * 0.3);
  ctx.quadraticCurveTo(cx, cy + H * 0.12, cx + W * 0.09, cy + H * 0.3);
  ctx.stroke();
  // corner denomination rosettes
  for (const [x, y] of [[m + 11, m + 10], [m + W - 11, m + H - 10]] as const) {
    ctx.strokeStyle = 'rgba(52,80,56,0.5)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  // engraved guilloche lines
  ctx.strokeStyle = 'rgba(60,92,62,0.22)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 4; i++) {
    const y = m + 6 + i * 2.2;
    ctx.beginPath();
    for (let x = m + 22; x <= m + W - 22; x += 3) ctx.lineTo(x, y + Math.sin(x * 0.35 + i) * 0.8);
    ctx.stroke();
    const y2 = m + H - 6 - i * 2.2;
    ctx.beginPath();
    for (let x = m + 22; x <= m + W - 22; x += 3) ctx.lineTo(x, y2 + Math.sin(x * 0.35 + i + 1) * 0.8);
    ctx.stroke();
  }
  // inked border, inset, slightly broken; wet edge on the outside
  ctx.strokeStyle = 'rgba(122,156,106,0.45)';
  ctx.lineWidth = 1.6;
  tracePoly(ctx, deform(poly, rnd, 2, 0.01));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(44,66,46,0.7)';
  ctx.lineWidth = 1.1;
  ctx.setLineDash([22, 2, 9, 2]);
  ctx.strokeRect(m + 4, m + 4, W - 8, H - 8);
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(44,66,46,0.3)';
  ctx.lineWidth = 0.7;
  ctx.strokeRect(m + 6.5, m + 6.5, W - 13, H - 13);
  // granulation
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = rgba('#6F8F62', rnd.range(0.05, 0.14));
    ctx.fillRect(rnd.range(m, m + W), rnd.range(m, m + H), 1, 1);
  }
  return cv;
}

/* ------------------------------------------------------------------ flights */

export interface BillFlight {
  id: number;
  t0: number;
  dur: number;
  /** which main root to start from (index into the painter's root list) */
  root: number;
  /** −1 = up the leader into the crown top; otherwise index into the scaffold list */
  route: number;
  variant: number;
}

/** Screen-space polyline. */
export interface Line {
  x: number[];
  y: number[];
}

const PX: number[] = [];
const PY: number[] = [];
const PC: number[] = [];

/** Concatenate path pieces into the scratch polyline; returns total length in px. */
export function buildPath(pieces: Line[]): number {
  PX.length = PY.length = PC.length = 0;
  for (const p of pieces) {
    for (let i = 0; i < p.x.length; i++) {
      const x = p.x[i]!, y = p.y[i]!;
      const n = PX.length;
      if (n && Math.abs(PX[n - 1]! - x) < 0.01 && Math.abs(PY[n - 1]! - y) < 0.01) continue;
      PC.push(n ? PC[n - 1]! + Math.hypot(x - PX[n - 1]!, y - PY[n - 1]!) : 0);
      PX.push(x);
      PY.push(y);
    }
  }
  return PC.length ? PC[PC.length - 1]! : 0;
}

/** Position and tangent at arc length s on the scratch polyline. */
function at(s: number): { x: number; y: number; tx: number; ty: number } {
  const n = PX.length;
  let i = 1;
  while (i < n - 1 && PC[i]! < s) i++;
  const f = clamp((s - PC[i - 1]!) / Math.max(1e-6, PC[i]! - PC[i - 1]!), 0, 1);
  const tx = PX[i]! - PX[i - 1]!;
  const ty = PY[i]! - PY[i - 1]!;
  const l = Math.hypot(tx, ty) || 1;
  return { x: PX[i - 1]! + tx * f, y: PY[i - 1]! + ty * f, tx: tx / l, ty: ty / l };
}

/**
 * Distance travelled (0…1) at time t (0…1) with a trapezoidal speed profile: a gentle start,
 * steady travel, then a long easing into the crown. Continuous position and speed throughout.
 */
const ACC = 0.12;
const DEC = 0.3;
const VMAX = 1 / (1 - ACC / 2 - DEC / 2);
function travel(t: number): number {
  if (t < ACC) return (VMAX * t * t) / (2 * ACC);
  if (t <= 1 - DEC) return VMAX * (ACC / 2 + (t - ACC));
  const tt = t - (1 - DEC);
  return VMAX * (ACC / 2 + (1 - DEC - ACC) + tt - (tt * tt) / (2 * DEC));
}

/**
 * Draw one bill along the current scratch path. `now` is wall-clock ms, `size` the bill's on-screen
 * width, `groundY` the screen y of the ground line (bills don't sway while in the soil).
 */
export function drawBill(ctx: CanvasRenderingContext2D, f: BillFlight, now: number, total: number, size: number, groundY: number): void {
  const t = clamp((now - f.t0) / f.dur, 0, 1);
  if (t >= 1 || total <= 1 || PX.length < 2) return;
  const s = clamp(travel(t), 0, 1) * total;
  const p = at(s);
  const above = p.y < groundY - 2;
  // perpendicular sway above ground only, swelling and settling smoothly
  const sway = above ? Math.sin(now * 0.0021 + f.id * 1.9) * size * 0.18 * Math.sin(Math.PI * t) : 0;
  const x = p.x - p.ty * sway;
  const y = p.y + p.tx * sway;
  const fadeIn = smoothstep(t / 0.08);
  const dissolve = smoothstep((t - 0.8) / 0.2);
  const alpha = fadeIn * (1 - dissolve);
  // orientation: partly follows the path, with a slow flutter; a gentle 3D flip by squashing width
  const ang = Math.atan2(p.ty, p.tx) * 0.3 + Math.sin(now * 0.0017 + f.id) * 0.32;
  const flip = 0.62 + 0.38 * Math.cos(now * 0.0029 + f.id * 2.3);
  const sc = 1 - 0.35 * dissolve;
  if (alpha > 0.01) {
    const img = billSprites()[f.variant % 3]!;
    const w = size * sc;
    const h = w * (SH / SW);
    ctx.save();
    ctx.globalAlpha = alpha * 0.96;
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(flip, 1);
    // soft cast shadow so the bill sits in the scene rather than on top of it
    ctx.fillStyle = 'rgba(40,52,34,0.12)';
    ctx.beginPath();
    ctx.ellipse(w * 0.06, h * 0.32, w * 0.5, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // dissolving into the canopy: a small bloom of leaf-green dabs spreading out and fading
  if (dissolve > 0.01) {
    const k = dissolve;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + f.id * 0.7;
      const r = size * (0.15 + 0.55 * k) * (0.7 + 0.3 * Math.sin(i * 2.1 + f.id));
      const lx = p.x + Math.cos(a) * r;
      const ly = p.y + Math.sin(a) * r * 0.75 - size * 0.12 * k;
      const la = Math.sin(Math.PI * k) * 0.75;
      ctx.fillStyle = i % 3 === 0 ? `rgba(240,180,41,${la * 0.7})` : i % 2 === 0 ? `rgba(125,179,67,${la})` : `rgba(76,150,84,${la})`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, size * 0.13, size * 0.065, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
