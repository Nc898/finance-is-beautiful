/**
 * The grocer's head, painted per view (grocerArt.ts calls this for each of the views round the vertical axis). At his
 * size the house figures' head (a smooth oval with dots for features) reads as a peg doll, so his has a real head's
 * masses (a skull deeper than it is wide, the face flatter in front, the jaw narrowing to the chin), lit by one light
 * from the upper left in the world (so the lit side stays lit as he turns), its shadow side laid as two flat washes.
 * The face stays in the storybook register of the sister figures, never a portrait (the owner: "too realistic for the
 * art style"): small dark eye marks under a soft brow stroke, a small rounded nose with a warm shade on one side, a
 * full greying moustache as one soft shape with a few strokes, a hint of the lower lip, rose on the cheeks and the
 * nose, a cool wash on the shaved jaw. The ears have their inner shapes, and the greying hair is combed back from a
 * side parting with its own direction strokes, short at the back and sides.
 *
 * Head-local coordinates (rig units, before HS): f forward, s to his right (azimuth +pi/2, as the torso's b), h up
 * from the pivot where the head sits on the neck. A view psi turns f to the world azimuth psi; a point projects to
 * x = f cos psi - s sin psi, depth z = f sin psi + s cos psi (toward the viewer), screen y = -h + KA z.
 */
import { Rand } from '../../scene/prng';
import { makeCanvas, tracePoly } from '../../scene/watercolor';
import { brush, inkDashes, mix, paintForm, smoothPoly, type Pt } from '../../river/scene/boatInk';

type V = [number, number, number];

const KA = 0.15;
const TAU = Math.PI * 2;
/** the whole head's scale over the tables below */
const HS = 1.1;

export const HEAD_SKIN = { base: '#D9A07E', light: '#F6D6BC', shade: '#8A4E3A' };

/* ------------------------------------------------------------------ the head's masses */

// heights, then the front, back and half-width of the section at each (the jaw a narrow U at the bottom, the skull
// deeper than wide, the face flatter in front)
const HT = [3.0, 3.8, 4.8, 5.8, 6.8, 7.8, 8.8, 9.8, 10.8, 11.8, 12.8, 13.8, 14.8, 15.8, 16.8, 17.8, 18.8, 19.8, 20.6, 21.3, 21.8, 22.1];
const RF = [4.4, 6.5, 7.2, 7.3, 7.5, 7.8, 7.9, 7.7, 7.4, 7.2, 7.3, 7.9, 8.0, 7.9, 7.7, 7.4, 6.9, 6.2, 5.3, 4.1, 2.8, 1.2];
const RB = [0.6, 1.3, 1.9, 2.6, 3.4, 5.0, 7.0, 8.0, 8.5, 8.7, 8.8, 8.8, 8.7, 8.5, 8.2, 7.7, 7.0, 6.1, 5.2, 4.0, 2.7, 1.2];
const RW = [2.3, 3.5, 4.5, 5.2, 5.8, 6.1, 6.4, 6.6, 6.7, 6.7, 6.7, 6.8, 6.9, 7.0, 7.0, 6.8, 6.4, 5.8, 5.0, 3.9, 2.6, 1.1];
const NF = 2.1;
const NB = 2.2;
const H_TOP = 22.1;

const lin = (xs: number[], ys: number[], v: number): number => {
  if (v <= xs[0]!) return ys[0]!;
  for (let i = 1; i < xs.length; i++) {
    if (v <= xs[i]!) {
      const t = (v - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
      return ys[i - 1]! + (ys[i]! - ys[i - 1]!) * t;
    }
  }
  return ys[ys.length - 1]!;
};
const ss = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
const pw = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);

/** a point on the head's surface at section angle t (0 forward, +pi/2 his right) and height h, pushed out by off */
function surf(t: number, h: number, off = 0): V {
  const c = Math.cos(t);
  const sn = Math.sin(t);
  const n = c >= 0 ? NF : NB;
  const R = c >= 0 ? lin(HT, RF, h) : lin(HT, RB, h);
  const w = lin(HT, RW, h);
  let f = R * pw(c, 2 / n);
  let s = w * pw(sn, 2 / n);
  if (off) {
    const r = Math.hypot(f, s) || 1;
    f += (f / r) * off;
    s += (s / r) * off;
  }
  return [f, s, h];
}

/** the section angle of a point (f, s) at height h (the inverse of surf, for a point on the surface) */
function angleOf(f: number, s: number, h: number): number {
  const n = f >= 0 ? NF : NB;
  const R = f >= 0 ? lin(HT, RF, h) : lin(HT, RB, h);
  const w = lin(HT, RW, h);
  return Math.atan2(pw(s / w, n / 2), pw(f / R, n / 2));
}

/** the front of the face at lateral s and height h, pushed forward by df */
function face(s: number, h: number, df = 0): V {
  const w = lin(HT, RW, h);
  const rf = lin(HT, RF, h);
  const u = Math.min(0.999, Math.abs(s) / w);
  return [rf * Math.pow(1 - Math.pow(u, NF), 1 / NF) + df, s, h];
}

/** the surface's outward normal at (t, h) */
function normal(t: number, h: number): V {
  const e = 0.02;
  const a = surf(t - e, h);
  const b = surf(t + e, h);
  const c = surf(t, Math.max(HT[0]!, h - 0.15));
  const d = surf(t, Math.min(H_TOP, h + 0.15));
  const u: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: V = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
  let n: V = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const p = surf(t, h);
  if (n[0] * p[0] + n[1] * p[1] < 0) n = [-n[0], -n[1], -n[2]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** the normal of the face at lateral s, height h */
const faceNormal = (s: number, h: number): V => {
  const p = face(s, h);
  return normal(angleOf(p[0], p[1], h), h);
};

/** where his hair grows down to, by section angle: a front hairline going back at the temples, a short sideburn, round
 *  above the ear, and the nape at the back */
const hairline = (t: number): number => lin([0, 0.25, 0.5, 0.68, 0.9, 1.1, 1.3, 1.38, 1.46, 1.52, 1.6, 1.8, 2.0, 2.12, 2.3, 2.7, Math.PI], [18.5, 18.6, 19.3, 19.0, 17.2, 15.8, 13.0, 10.8, 10.6, 12.8, 14.2, 14.7, 14.3, 11.0, 8.4, 6.9, 6.3], Math.abs(t));
/** how far the hair stands off the scalp */
const hairOff = (h: number, t: number): number => 0.16 + 0.36 * ss((h - 14) / 6) + 0.1 * ss((Math.abs(t) - 2) / 1);

/* ------------------------------------------------------------------ the view */

const LIGHT: V = (() => {
  const l: V = [-0.55, 0.5, 0.67];
  const n = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

interface View {
  cp: number;
  sp: number;
}
interface SPt {
  x: number;
  y: number;
  z: number;
}
const proj = (v: View, p: V): SPt => {
  const f = p[0] * HS;
  const s = p[1] * HS;
  const z = f * v.sp + s * v.cp;
  return { x: f * v.cp - s * v.sp, y: -p[2] * HS + KA * z, z };
};
/** how squarely a normal faces the viewer (the camera looks a little down) */
const visOf = (v: View, n: V): number => (n[0] * v.sp + n[1] * v.cp) * 0.989 + n[2] * 0.148;
/** the light falling on a normal */
const lamOf = (v: View, n: V): number => (n[0] * v.cp - n[1] * v.sp) * LIGHT[0] + (n[0] * v.sp + n[1] * v.cp) * LIGHT[1] + n[2] * LIGHT[2];

function hull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbaHex = (hex: string, a: number): string => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** scratch canvases the size of the head sprite (reused view to view) */
let scratch: { w: number; h: number; a: HTMLCanvasElement; b: HTMLCanvasElement } | null = null;
function scratchOf(w: number, h: number): { a: HTMLCanvasElement; b: HTMLCanvasElement } {
  if (!scratch || scratch.w !== w || scratch.h !== h) scratch = { w, h, a: makeCanvas(w, h), b: makeCanvas(w, h) };
  return scratch;
}

/**
 * Paint the head for view psi into ctx (already scaled to rig units, q px per unit, the pivot at the origin; the
 * canvas is cw x ch px).
 */
export function paintHead(ctx: CanvasRenderingContext2D, psi: number, k: number, q: number, pivot: [number, number]): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const rnd = new Rand(7310 + k * 13);
  const V0: View = { cp: Math.cos(psi), sp: Math.sin(psi) };
  const SK = HEAD_SKIN;
  const P = (p: V): Pt => {
    const o = proj(V0, p);
    return [o.x, o.y];
  };
  const base = ctx.getTransform();
  const { a: cvA, b: cvB } = scratchOf(cw, ch);
  /** lay a scratch canvas over the sprite, softened (blur in units), with a composite mode */
  const lay = (cv: HTMLCanvasElement, blur: number, op: GlobalCompositeOperation = 'source-over', alpha = 1): void => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    if (blur > 0) ctx.filter = `blur(${Math.max(0.5, blur * q)}px)`;
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  };
  /** grow a layer a little past its edges (a copy of it, enlarged about the head, laid under it) so a blur leaves no
   *  pale rim at the silhouette */
  const dilate = (cv: HTMLCanvasElement): void => {
    const c = cv.getContext('2d')!;
    const cx = pivot[0] * q;
    const cy = (pivot[1] - 12) * q;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-over';
    for (const kk of [1.03, 1.07]) c.drawImage(cv, cx - cx * kk, cy - cy * kk, cw * kk, ch * kk);
    c.restore();
  };
  const begin = (cv: HTMLCanvasElement): CanvasRenderingContext2D => {
    const c = cv.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, cw, ch);
    c.setTransform(q, 0, 0, q, pivot[0] * q, pivot[1] * q);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    return c;
  };
  /** a soft patch on the face: an ellipse in (s, h) round (s0, h0), on the surface, blurred */
  const softPatch = (c: CanvasRenderingContext2D, s0: number, h0: number, rs: number, rh: number, color: string, alpha: number, df = 0.05): void => {
    const pts: Pt[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      pts.push(P(face(s0 + rs * Math.cos(a), h0 + rh * Math.sin(a), df)));
    }
    c.fillStyle = rgbaHex(color, alpha);
    tracePoly(c, smoothPoly(pts, 2, true));
    c.fill();
  };
  /** visibility of a spot on the face (0 hidden … 1 square on) */
  const faceVis = (s: number, h: number): number => ss((visOf(V0, faceNormal(s, h)) - 0.04) / 0.3);
  /** a stroke on the face along (s, h) points */
  const fStroke = (pts: Array<[number, number]>, df: number, w: number, color: string, alpha: number, taper = 0.85): void => {
    const vis = faceVis(pts[Math.floor(pts.length / 2)]![0], pts[Math.floor(pts.length / 2)]![1]);
    if (vis < 0.02) return;
    brush(ctx, pts.map(([s, h]) => P(face(s, h, df))), w, color, alpha * vis, taper);
  };

  /* ---- the grid over the head's surface: points, normals, light, visibility ---- */
  const NT = 44;
  const NH = 26;
  const ts: number[] = [];
  const hs: number[] = [];
  for (let i = 0; i <= NT; i++) ts.push(-Math.PI + (TAU * i) / NT);
  for (let j = 0; j < NH; j++) hs.push(HT[0]! + ((H_TOP - 0.05 - HT[0]!) * j) / (NH - 1));
  const G: Array<Array<{ p: Pt; ph: Pt; z: number; vis: number; lam: number; hair: number }>> = [];
  const skullPts: Pt[] = [];
  const hairPts: Pt[] = [];
  for (let i = 0; i <= NT; i++) {
    const row: (typeof G)[number] = [];
    for (let j = 0; j < NH; j++) {
      const t = ts[i]!;
      const h = hs[j]!;
      const s3 = surf(t, h);
      const n = normal(t, h);
      const o = proj(V0, s3);
      const hl = hairline(t);
      const hair = ss((h - hl + 0.35) / 0.7);
      const ph = hair > 0 ? P(surf(t, h, hairOff(h, t) * hair)) : ([o.x, o.y] as Pt);
      row.push({ p: [o.x, o.y], ph, z: o.z, vis: visOf(V0, n), lam: lamOf(V0, n), hair });
      if (i < NT) {
        skullPts.push([o.x, o.y]);
        if (hair > 0.5) hairPts.push(ph);
      }
    }
    G.push(row);
  }
  // the crown
  const crown = P([0, 0, H_TOP + 0.75]);
  hairPts.push(crown);
  const skull = smoothPoly(hull(skullPts), 2, true);
  const outer = smoothPoly(hull([...skullPts, ...hairPts]), 2, true);

  /* ---- the ears: a flat shape in a plane standing a little off the side of the head, turned a little forward ---- */
  const earOutline: Array<[number, number]> = [
    [0.95, 2.15], [0.45, 2.85], [-0.45, 2.95], [-1.2, 2.45], [-1.55, 1.3], [-1.45, -0.1], [-1.05, -1.3], [-0.65, -2.3],
    [-0.05, -2.75], [0.5, -2.45], [0.75, -1.6], [1.0, -0.55], [1.05, 0.7],
  ];
  const earPt = (sg: number, u: number, v: number, out = 0): V => {
    const h0 = 11.0;
    const w = lin(HT, RW, h0);
    // the ear's plane: back along the head and out (its back edge stands off), tilted back a little
    const eu: V = [0.88, -sg * 0.52, 0];
    const ev: V = [-0.22, 0, 0.975];
    const en: V = [0.36 * sg * sg, sg * 0.93, 0];
    return [-1.0 + eu[0] * u + ev[0] * v + en[0] * out, sg * (w + 0.3) + eu[1] * u + en[1] * out, h0 + ev[2] * v];
  };
  const earNormal = (sg: number): V => [0.38, sg * 0.92, 0.05];
  const paintEar = (sg: number): void => {
    const eVis = visOf(V0, earNormal(sg));
    const sideVis = visOf(V0, [0, sg, 0]);
    if (sideVis < -0.75) return;
    const poly = smoothPoly(earOutline.map(([u, v]) => P(earPt(sg, u, v))), 3, true);
    const lit = ss((lamOf(V0, earNormal(sg)) + 0.2) / 0.8);
    ctx.fillStyle = SK.base;
    tracePoly(ctx, poly);
    ctx.fill();
    paintForm(ctx, poly, mix(mix(SK.base, '#D27E68', 0.3), SK.shade, 0.25 * (1 - lit)), rnd, { flip: false, light: SK.light, shade: mix(SK.shade, '#5A2E30', 0.3), alpha: 0.97, layers: 2, lightA: 0.2 + 0.2 * lit, shadeA: 0.3, inkW: 0, ink0: true, speck: 4, pool: 0.6 });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    if (eVis > 0) {
      // the front of the ear: the rim of the helix and the dark groove inside it, the antihelix, the bowl of the
      // concha, the tragus, the lobe
      const a = ss(eVis / 0.35);
      const rim: Array<[number, number]> = [[0.7, 2.3], [0.1, 2.6], [-0.65, 2.5], [-1.15, 1.9], [-1.25, 0.8], [-1.1, -0.4], [-0.75, -1.4], [-0.45, -1.95]];
      brush(ctx, rim.map(([u, v]) => P(earPt(sg, u * 0.97, v * 0.97, 0.1))), 0.22, '#6A3428', 0.55 * a, 0.7);
      brush(ctx, rim.map(([u, v]) => P(earPt(sg, u * 1.12, v * 1.06, 0.1))), 0.3, SK.light, 0.4 * a * (0.5 + 0.5 * lit), 0.8);
      const anti: Array<[number, number]> = [[-0.35, 2.0], [-0.65, 1.1], [-0.6, 0.1], [-0.25, -0.7], [0.2, -1.15]];
      brush(ctx, anti.map(([u, v]) => P(earPt(sg, u, v, 0.15))), 0.42, SK.light, 0.32 * a * (0.4 + 0.6 * lit), 0.8);
      brush(ctx, anti.map(([u, v]) => P(earPt(sg, u + 0.35, v, 0.1))), 0.14, '#7A3E30', 0.4 * a, 0.8);
      brush(ctx, [P(earPt(sg, -0.35, 2.0)), P(earPt(sg, 0.45, 1.65))], 0.16, '#7A3E30', 0.35 * a, 0.8);
      const bowl: Pt[] = [];
      for (let i = 0; i < 10; i++) {
        const t = (i / 10) * TAU;
        bowl.push(P(earPt(sg, 0.3 + 0.48 * Math.cos(t), -0.35 + 0.8 * Math.sin(t), -0.1)));
      }
      ctx.fillStyle = rgbaHex('#6E3428', 0.5 * a);
      tracePoly(ctx, smoothPoly(bowl, 2, true));
      ctx.fill();
      ctx.fillStyle = rgbaHex(SK.light, 0.4 * a);
      const tr = P(earPt(sg, 0.85, -0.55, 0.15));
      ctx.beginPath();
      ctx.ellipse(tr[0], tr[1], 0.22, 0.35, 0, 0, TAU);
      ctx.fill();
      const lobe = P(earPt(sg, 0.05, -2.2, 0.1));
      ctx.fillStyle = rgbaHex('#D07060', 0.25 * a);
      ctx.beginPath();
      ctx.ellipse(lobe[0], lobe[1], 0.5, 0.45, 0, 0, TAU);
      ctx.fill();
    } else {
      // the back of the ear: in shade where it turns in to the head
      const a = ss(-eVis / 0.3);
      brush(ctx, [P(earPt(sg, 0.6, 2.0)), P(earPt(sg, 0.8, 0.4)), P(earPt(sg, 0.6, -1.6))], 0.9, '#6A3830', 0.4 * a, 0.6);
      brush(ctx, [P(earPt(sg, -1.1, 2.1)), P(earPt(sg, -1.35, 0.6)), P(earPt(sg, -0.9, -1.2))], 0.3, SK.light, 0.3 * a, 0.7);
    }
    ctx.restore();
    inkDashes(ctx, poly, rnd, { color: '#3A2620', alpha: 0.5, w: 0.26, dash: [1.5, 4], gap: [0.3, 1.0], center: P(earPt(sg, 0, 0)), flip: false });
  };

  /* ---- 1. the far ear, behind the head ---- */
  const farEar = (sg: number) => visOf(V0, [0, sg, 0]) < -0.12;
  for (const sg of [-1, 1]) if (farEar(sg)) paintEar(sg);

  /* ---- 2. the head's mass in skin ---- */
  // (a solid ground under the glazes: a head is not something the shelves show through)
  ctx.fillStyle = SK.base;
  tracePoly(ctx, skull);
  ctx.fill();
  paintForm(ctx, skull, SK.base, rnd, { flip: false, light: SK.light, shade: SK.shade, alpha: 0.98, layers: 4, amp: 0.018, lightA: 0.22, shadeA: 0.16, inkW: 0, ink0: true, speck: 1, pool: 0.7 });

  /* ---- 3. the light on the form: the shadow side and the turning planes as washes, the lights lifted ---- */
  {
    const c = begin(cvA);
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NH - 1; j++) {
        const a = G[i]![j]!;
        const b = G[i + 1]![j]!;
        const d = G[i]![j + 1]!;
        const e = G[i + 1]![j + 1]!;
        const vis = (a.vis + b.vis + d.vis + e.vis) / 4;
        if (vis < -0.05) continue;
        const lam = (a.lam + b.lam + d.lam + e.lam) / 4;
        // (a little wobble in where a wash stops, as a brush would leave it)
        const wob = 0.06 * Math.sin(i * 1.7 + j * 2.3 + k);
        // (two flat washes, as a storybook painter lays them: the shadow side, cool, and a little more in its core)
        const half = 0.36 * ss((0.4 - lam + wob) / 0.14);
        const core = 0.14 * ss((0.02 - lam + wob) / 0.12);
        const al = Math.min(0.6, half + core);
        if (al < 0.01) continue;
        c.fillStyle = `rgba(128,86,92,${al})`;
        c.beginPath();
        c.moveTo(a.p[0], a.p[1]);
        c.lineTo(b.p[0], b.p[1]);
        c.lineTo(e.p[0], e.p[1]);
        c.lineTo(d.p[0], d.p[1]);
        c.closePath();
        c.fill();
      }
    }
    dilate(cvA);
    lay(cvA, 0.5, 'source-atop', 0.85);
    const c2 = begin(cvB);
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NH - 1; j++) {
        const a = G[i]![j]!;
        const e = G[i + 1]![j + 1]!;
        const vis = (a.vis + e.vis) / 2;
        const lam = (a.lam + e.lam) / 2;
        const al = 0.28 * ss((lam - 0.66) / 0.12) * ss(vis / 0.3);
        if (al < 0.01) continue;
        c2.fillStyle = `rgba(255,240,222,${al})`;
        c2.beginPath();
        c2.moveTo(a.p[0], a.p[1]);
        c2.lineTo(G[i + 1]![j]!.p[0], G[i + 1]![j]!.p[1]);
        c2.lineTo(e.p[0], e.p[1]);
        c2.lineTo(G[i]![j + 1]!.p[0], G[i]![j + 1]!.p[1]);
        c2.closePath();
        c2.fill();
      }
    }
    lay(cvB, 0.7, 'source-atop', 1);
  }

  /* ---- 4. warm and cool through the skin: rose on the cheeks and the nose, cool on the shaved jaw ---- */
  const frontVis = visOf(V0, [1, 0, 0]);
  if (frontVis > -0.4) {
    const c = begin(cvA);
    for (const sg of [-1, 1]) softPatch(c, sg * 4.0, 9.3, 2.0, 1.6, '#D8705C', 0.3 * faceVis(sg * 4.0, 9.3));
    softPatch(c, 0, 9.3, 1.3, 1.0, '#D8644E', 0.13, 1.5);
    const jaw: Pt[] = [];
    for (const [s, h] of [[-5.4, 7.2], [0, 7.6], [5.4, 7.2], [5.0, 5.0], [3.6, 3.7], [0, 3.1], [-3.6, 3.7], [-5.0, 5.0]] as Array<[number, number]>) {
      if (faceVis(s, h) > 0.01) jaw.push(P(face(s, h)));
    }
    if (jaw.length > 2) {
      c.fillStyle = 'rgba(110,118,132,0.16)';
      tracePoly(c, smoothPoly(hull(jaw), 2, true));
      c.fill();
    }
    lay(cvA, 1.0, 'source-atop', 1);
  }

  /* ---- 5. the features, simply stated as the house figures' are, nearest last ---- */
  const feats: Array<{ z: number; f: () => void }> = [];
  const zOf = (s: number, h: number, df = 0): number => proj(V0, face(s, h, df)).z;
  for (const sg of [-1, 1]) {
    const es = sg * 2.75;
    const eh = 12.3;
    if (faceVis(es, eh) > 0.02) {
      feats.push({
        z: zOf(es, eh),
        f: () => {
          const a = faceVis(es, eh);
          // a soft shade under the brow where the eye sits, then the eye itself: a small dark dab, a little crescent
          const c = begin(cvA);
          softPatch(c, sg * 2.7, 12.55, 1.7, 1.0, '#7A4E58', 0.34 * a, -0.1);
          lay(cvA, 0.6, 'source-atop', 1);
          ctx.save();
          ctx.globalAlpha = a;
          const pts: Pt[] = [];
          for (let i = 0; i <= 6; i++) {
            const u = i / 6;
            pts.push(P(face(es + sg * (u - 0.5) * 1.15, eh + 0.16 * Math.sin(Math.PI * u) - 0.05 * u, -0.4)));
          }
          brush(ctx, pts, 0.5, '#2E2220', 0.85, 0.75);
          const d = P(face(es + sg * 0.05, eh - 0.1, -0.35));
          ctx.fillStyle = 'rgba(40,28,26,0.75)';
          ctx.beginPath();
          ctx.ellipse(d[0], d[1], 0.36 * (0.55 + 0.45 * a), 0.36, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        },
      });
    }
    // the brow: a soft grey stroke, a few hairs at its inner end
    if (faceVis(sg * 3, 14.0) > 0.02) {
      feats.push({
        z: zOf(sg * 3, 14.1, 0.2),
        f: () => {
          const a = faceVis(sg * 3, 14.0);
          const path: Array<[number, number]> = [[sg * 1.25, 13.7], [sg * 2.4, 14.15], [sg * 3.6, 14.2], [sg * 4.6, 13.85]];
          fStroke(path, 0.15, 0.7, '#5E564E', 0.6, 0.65);
          fStroke(path.slice(1).map(([s, h]) => [s, h + 0.14]), 0.2, 0.25, '#B8B0A6', 0.3, 0.8);
          ctx.save();
          ctx.globalAlpha = a;
          for (let i = 0; i < 4; i++) {
            const s = sg * (1.3 + 0.35 * i);
            brush(ctx, [P(face(s, 13.6 + 0.12 * i, 0.2)), P(face(s + sg * 0.4, 14.15 + 0.08 * i, 0.25))], 0.14, '#4E463E', 0.5, 0.9);
          }
          ctx.restore();
        },
      });
    }
  }

  // the nose: a small rounded shape, a warm shade on the side away from the light and under it
  const sgLit = V0.cp >= 0 ? -1 : 1; // the side of the nose toward the window's light: his left when he faces right
  if (frontVis > -0.6) {
    feats.push({
      z: proj(V0, [9, 0, 9.5]).z,
      f: () => {
        const a = ss((frontVis + 0.6) / 0.5);
        const pts: V[] = [[7.3, 0, 12.6], [8.1, 0, 11.0], [9.1, 0, 9.5], [9.25, 0, 8.85], [8.7, 0, 8.4], [7.9, 0, 8.3]];
        for (const sg of [-1, 1]) pts.push([7.0, sg * 0.85, 12.4], [8.4, sg * 1.05, 9.2], [7.8, sg * 1.6, 8.7], [7.7, sg * 1.2, 8.35]);
        const nose = smoothPoly(hull(pts.map(P)), 4, true);
        ctx.save();
        ctx.globalAlpha = a;
        // (the skin and the light the face has where it stands, so it reads as part of the face)
        // (filled as the face is lit where it stands, its edge softened: it only shows as a shape in profile)
        const nl = lamOf(V0, [0.94, 0, 0.34]);
        const sh = 0.36 * ss((0.4 - nl) / 0.14);
        const c0 = begin(cvB);
        c0.fillStyle = HEAD_SKIN.base;
        tracePoly(c0, nose);
        c0.fill();
        c0.fillStyle = `rgba(128,86,92,${sh})`;
        tracePoly(c0, nose);
        c0.fill();
        lay(cvB, 0.2, 'source-over', 1);
        const c = begin(cvA);
        softPatch(c, 0, 9.1, 0.9, 0.7, '#D4604C', 0.12, 1.3);
        // its shaded side, and the shade under it on the lip
        const side = -sgLit;
        const n: V = [0.45, side * 0.86, 0.15];
        const ls = lamOf(V0, n);
        if (visOf(V0, n) > -0.2) {
          c.fillStyle = `rgba(160,80,62,${0.62 * ss((0.6 - ls) / 0.6)})`;
          tracePoly(c, smoothPoly([P([7.2, side * 0.3, 12.4]), P([9.0, side * 0.35, 9.3]), P([8.6, side * 0.9, 8.6]), P([7.8, side * 1.55, 8.65]), P([7.1, side * 1.1, 11.2])], 3, true));
          c.fill();
        }
        lay(cvA, 0.45, 'source-atop', 1);
        const c2 = begin(cvA);
        const under = P([8.2, side * 0.3, 8.0]);
        c2.fillStyle = 'rgba(120,64,56,0.32)';
        c2.beginPath();
        c2.ellipse(under[0], under[1] + 0.15, 1.3, 0.4, 0, 0, TAU);
        c2.fill();
        for (const sg of [-1, 1]) {
          const wv = ss((visOf(V0, [0.3, sg * 0.9, -0.2]) + 0.4) / 0.5);
          if (wv < 0.02) continue;
          const nn = P([8.3, sg * 0.8, 8.35]);
          c2.fillStyle = `rgba(110,52,44,${0.45 * wv})`;
          c2.beginPath();
          c2.ellipse(nn[0], nn[1], 0.38, 0.22, 0, 0, TAU);
          c2.fill();
        }
        lay(cvA, 0.25, 'source-over', 1);
        // in a turned view, its outline on the far side, lightly, so it stands off the cheek
        const turn = ss((Math.abs(V0.cp) - 0.2) / 0.4);
        if (turn > 0.02) {
          const far = V0.cp >= 0 ? 1 : -1;
          brush(ctx, [P([7.6, far * 0.2, 11.6]), P([8.7, far * 0.25, 9.9]), P([9.25, far * 0.2, 9.0]), P([8.8, far * 0.5, 8.45]), P([8.0, far * 1.0, 8.4])], 0.24, '#6A3A30', 0.5 * turn, 0.85);
        }
        ctx.restore();
      },
    });
  }
  // the mouth: only the lower lip's warm edge under the moustache, and the little shade below it
  if (faceVis(0, 5.2) > 0.02) {
    feats.push({
      z: zOf(0, 5.2) - 0.2,
      f: () => {
        const a = faceVis(0, 5.2);
        const c = begin(cvA);
        softPatch(c, 0, 5.3, 1.35, 0.32, '#B4645A', 0.55 * a, 0.15);
        softPatch(c, 0, 4.6, 1.3, 0.3, '#7A4A44', 0.3 * a, 0.1);
        lay(cvA, 0.3, 'source-atop', 1);
      },
    });
  }
  // the moustache: a full greying shape over the upper lip, the ends turned down, a few strokes in it
  if (faceVis(0, 6.8) > 0.02 || frontVis > -0.2) {
    feats.push({
      z: zOf(0, 6.9, 0.6) + 0.3,
      f: () => {
        const top: Array<[number, number]> = [[-1.8, 7.95], [-0.9, 8.05], [0, 7.95], [0.9, 8.05], [1.8, 7.95], [2.7, 7.45], [3.2, 6.7], [3.45, 5.9], [3.45, 5.25]];
        const bot: Array<[number, number]> = [[3.05, 5.45], [2.5, 5.85], [1.6, 6.0], [0.8, 5.85], [0, 5.9], [-0.8, 5.85], [-1.6, 6.0], [-2.5, 5.85], [-3.05, 5.45], [-3.45, 5.25], [-3.45, 5.9], [-3.2, 6.7], [-2.7, 7.45]];
        const df = (s: number): number => 0.55 - 0.06 * Math.abs(s);
        const ring = [...top, ...bot].filter(([s, h]) => faceVis(s, h) > 0.0);
        if (ring.length < 5) return;
        let mv = 0;
        for (const [s0, h0] of top) mv = Math.max(mv, faceVis(s0, h0));
        const a = ss((mv + 0.05) / 0.3);
        ctx.save();
        ctx.globalAlpha = a;
        const shape = smoothPoly(ring.map(([s, h]) => P(face(s, h, df(s)))), 4, true);
        paintForm(ctx, shape, '#A49C92', rnd, { flip: false, light: '#E8E2D8', shade: '#5A5048', alpha: 0.95, layers: 3, lightA: 0.32, shadeA: 0.3, inkW: 0, ink0: true, speck: 4, pool: 0.8 });
        // a few strokes out and down from under the nose, light over the top, a darker edge over the lip
        for (let i = 0; i < 9; i++) {
          const u = -1 + (2 * (i + 0.5)) / 9;
          const s0 = u * 1.4;
          const s1 = u * 3.0;
          const h1 = lin([0, 1.8, 3.0], [5.95, 5.95, 5.45], Math.abs(s1));
          if (faceVis((s0 + s1) / 2, 6.8) < 0.1) continue;
          brush(ctx, [P(face(s0, 7.7, df(s0) + 0.05)), P(face((s0 + s1) / 2 + u * 0.3, 6.9, df(s1) + 0.1)), P(face(s1, h1 + 0.2, df(s1)))], 0.2, i % 3 === 1 ? '#5E554C' : '#E2DCD2', 0.4, 0.9);
        }
        brush(ctx, bot.slice(1, 8).map(([s, h]) => P(face(s, h - 0.05, df(s)))), 0.35, '#4A3E36', 0.4, 0.7);
        inkDashes(ctx, shape, rnd, { color: '#3A2E26', alpha: 0.3, w: 0.2, dash: [1.5, 4], gap: [0.6, 1.6], center: P(face(0, 6.8, 0.6)) });
        ctx.restore();
      },
    });
  }
  feats.sort((p, q2) => p.z - q2.z);
  for (const f of feats) f.f();

  /* ---- 6. the hair: a greying mass, shaded as a form, then its direction strokes ---- */
  {
    const c = begin(cvA);
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NH - 1; j++) {
        const a = G[i]![j]!;
        const b = G[i + 1]![j]!;
        const d = G[i]![j + 1]!;
        const e = G[i + 1]![j + 1]!;
        const hair = Math.min(a.hair, b.hair, d.hair, e.hair);
        const hairMax = Math.max(a.hair, b.hair, d.hair, e.hair);
        if (hairMax < 0.05) continue;
        const vis = (a.vis + b.vis + d.vis + e.vis) / 4;
        if (vis < -0.12) continue;
        const lam = (a.lam + b.lam + d.lam + e.lam) / 4;
        const lit = ss((lam + 0.25) / 1.0);
        const t = Math.abs(ts[i]!);
        // greyer at the temples and over the ears, darker on top and at the crown
        const grey = ss((t - 0.6) / 0.5) * (1 - ss((t - 2.5) / 0.5));
        const [r0, g0, b0] = rgb(mix(mix('#5E554C', '#9A9288', grey), mix('#2E2824', '#5E564E', grey), 1 - lit));
        const [r1, g1, b1] = rgb('#D2CCC2');
        const hl = 0.35 * ss((lam - 0.55) / 0.3);
        c.fillStyle = `rgba(${Math.round(r0 + (r1 - r0) * hl)},${Math.round(g0 + (g1 - g0) * hl)},${Math.round(b0 + (b1 - b0) * hl)},${0.35 + 0.6 * (hair + hairMax) / 2})`;
        c.beginPath();
        c.moveTo(a.ph[0], a.ph[1]);
        c.lineTo(b.ph[0], b.ph[1]);
        c.lineTo(e.ph[0], e.ph[1]);
        c.lineTo(d.ph[0], d.ph[1]);
        c.closePath();
        c.fill();
      }
    }
    // the crown's cap (the grid closes at the top)
    const cap: Pt[] = [];
    for (let i = 0; i < NT; i++) cap.push(G[i]![NH - 1]!.ph);
    {
      const lt = ss((lamOf(V0, [0, 0, 1]) + 0.25) / 1.0);
      c.fillStyle = mix('#3A322C', '#8E867C', lt);
    }
    tracePoly(c, hull(cap).flat());
    c.fill();
    lay(cvA, 0.22, 'source-over', 1);
    // the hair's strokes: combed back from a parting on his left, over the top and down the back to the nape, the
    // sides short and combed back over the ears
    const comb = (p: V, t: number): V => {
      const back = ss((Math.abs(t) - 2.0) / 0.7);
      const part = -2.9;
      const lat = p[1] > part ? 0.42 : -0.75;
      let d: V = [-1, lat * (1 - back), -0.25 - 0.7 * ss((Math.abs(t) - 0.9) / 1.0)];
      d = [d[0] * (1 - back), d[1] * (1 - back) - 0.12 * Math.sign(p[1]) * back, d[2] * (1 - back) - back];
      const n = normal(t, Math.min(H_TOP - 0.1, Math.max(HT[0]!, p[2])));
      const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
      d = [d[0] - dn * n[0], d[1] - dn * n[1], d[2] - dn * n[2]];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      return [d[0] / l, d[1] / l, d[2] / l];
    };
    for (let i = 0; i < 300; i++) {
      let t = rnd.range(-Math.PI, Math.PI);
      const top = H_TOP - 0.25;
      let h = rnd.range(hairline(t) + 0.15, top);
      if (h > top) continue;
      const len = rnd.range(1.6, 3.4);
      const grey = ss((Math.abs(t) - 0.6) / 0.5) * (1 - ss((Math.abs(t) - 2.5) / 0.5));
      const pts: Pt[] = [];
      for (let st = 0; st < 4; st++) {
        const p = surf(t, h, hairOff(h, t) + 0.06);
        if (visOf(V0, normal(t, h)) < 0.03) break;
        pts.push(P(p));
        const d = comb(p, t);
        const q3: V = [p[0] + d[0] * len * 0.33, p[1] + d[1] * len * 0.33, p[2] + d[2] * len * 0.33];
        h = Math.min(top, q3[2]);
        if (h < hairline(t) - 0.2) break;
        t = angleOf(q3[0], q3[1], h);
      }
      if (pts.length < 2) continue;
      const r = rnd.next();
      const col = r < 0.24 + 0.32 * grey ? '#E4DED4' : r < 0.55 + 0.15 * grey ? '#9A9288' : r < 0.82 ? '#3E3630' : '#26201C';
      brush(ctx, pts, rnd.range(0.1, 0.19), col, rnd.range(0.4, 0.75), 0.9);
    }
    // the hairline, softly stated where we see it, and the short hairs at the nape
    const edge: Pt[] = [];
    const flush = (): void => {
      if (edge.length > 2) brush(ctx, edge.slice(), 0.3, '#5E544C', 0.16, 0.8);
      edge.length = 0;
    };
    for (let t = -Math.PI; t <= Math.PI + 0.01; t += 0.07) {
      const h = hairline(t) + 0.15;
      const n = normal(t, h);
      if (visOf(V0, n) > 0.12) edge.push(P(surf(t, h, 0.1)));
      else flush();
    }
    flush();
    for (let i = 0; i < 40; i++) {
      const t = rnd.range(1.9, 4.4) * (rnd.chance(0.5) ? 1 : -1);
      const tt = Math.atan2(Math.sin(t), Math.cos(t));
      const h = hairline(tt);
      const n = normal(tt, h);
      if (visOf(V0, n) < 0.1) continue;
      brush(ctx, [P(surf(tt, h + 0.6, 0.2)), P(surf(tt, h - 0.25, 0.05))], 0.13, rnd.chance(0.5) ? '#5A5048' : '#B8B0A6', 0.5, 0.9);
    }
  }

  /* ---- 7. the near ears, over the hair at the sides ---- */
  for (const sg of [-1, 1]) if (!farEar(sg)) paintEar(sg);

  /* ---- 8. the pencil behind his right ear: yellow, sharpened, lying in the crease over the ear, its point forward ---- */
  {
    const w = lin(HT, RW, 14.2);
    const p0: V = [2.0, w + 0.55, 14.35];
    const p1: V = [-3.0, w + 1.05, 14.05];
    const vis = visOf(V0, [0.1, 1, 0.1]);
    if (vis > -0.25) {
      const a = ss((vis + 0.25) / 0.3);
      const A = P(p0);
      const B = P(p1);
      ctx.save();
      ctx.globalAlpha = a;
      brush(ctx, [A, B], 0.95, '#D4A42E', 0.95, 0.12);
      brush(ctx, [[A[0], A[1] - 0.22], [B[0], B[1] - 0.22]], 0.28, '#F6E2A0', 0.6, 0.2);
      brush(ctx, [[A[0], A[1] + 0.35], [B[0], B[1] + 0.35]], 0.18, '#6A4A18', 0.5, 0.2);
      const dx = A[0] - B[0];
      const dy = A[1] - B[1];
      const l = Math.hypot(dx, dy) || 1;
      if (l > 0.6) {
        brush(ctx, [A, [A[0] + (dx / l) * 1.4, A[1] + (dy / l) * 1.4]], 0.6, '#E6C49A', 0.95, 0.95);
        brush(ctx, [[A[0] + (dx / l) * 1.1, A[1] + (dy / l) * 1.1], [A[0] + (dx / l) * 1.8, A[1] + (dy / l) * 1.8]], 0.26, '#2A2420', 0.9, 0.9);
      }
      ctx.restore();
    }
  }

  /* ---- 9. the ink: a broken contour round the head, heavier on the side away from the light and under the jaw ---- */
  inkDashes(ctx, outer, rnd, { color: '#33241C', alpha: 0.55, w: 0.32, dash: [2.5, 7], gap: [0.5, 1.8], center: P([0, 0, 14]), bias: 0.7 });
  void skull;
  ctx.setTransform(base);
}
