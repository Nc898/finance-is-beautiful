/**
 * Hand-painted watercolor sprites for the gardeners, made once per quality. Same house style and the same
 * brushwork helpers as the rowers (boatInk.ts): glazes, pooled edges, dry-brush grain, broken tapering ink.
 *
 * Every part is painted facing +x with its joint at the sprite origin. Two sets are made: `R` for a figure
 * facing right (lit from the upper left, drawn as is) and `L` for one facing left (painted for the mirrored
 * rig, drawn under scale(-1, 1)), so the light is always on the upper left of the screen. Far-side limbs are the
 * same sprites cooled with a wash. Dressed for autumn: tweed flat cap (or a wide felt hat), a knitted scarf in
 * the plan's colour, a canvas apron with a patch pocket, rolled sleeves, denim trousers, leather boots, gloves.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import type { PlanId } from '../types';
import { BOAT_COLORS } from '../../river/scene/boatArt';
import { SEPIA, brush, feather, flat, granulate, inkDashes, mix, paintForm, smoothPoly, speckle, spriteCtx, streaks, type FormOpts, type Pt } from '../../river/scene/boatInk';
import { RAKE } from './gardenerDims';

export interface Part {
  cv: HTMLCanvasElement;
  /** pivot position inside the canvas, in units; size in units */
  px: number;
  py: number;
  w: number;
  h: number;
}

export interface Sprites {
  torso: Part;
  torsoFront: Part;
  head: Part;
  headFront: Part;
  tails: Part;
  upper: Part;
  fore: Part;
  upperFar: Part;
  foreFar: Part;
  thigh: Part;
  shin: Part;
  boot: Part;
  thighFar: Part;
  shinFar: Part;
  bootFar: Part;
  bootFront: Part;
  /** the secateurs: the half held still (A) and the half that opens (B), both with their pivot at the origin */
  shearsA: Part;
  shearsB: Part;
  rake: Part;
}

export interface GardenerSet {
  q: number;
  /** facing right, lit from the upper left as is */
  R: Sprites;
  /** facing left, painted for the mirrored rig */
  L: Sprites;
}

const part = (w: number, h: number, px: number, py: number, q: number, paint: (ctx: CanvasRenderingContext2D) => void, grain = 0.6, seed = 5): Part => {
  const { cv, ctx } = spriteCtx(w, h, q, px, py);
  paint(ctx);
  if (grain > 0) granulate(cv, seed, q, grain);
  return { cv, px, py, w, h };
};

/** a copy of a part with a wash laid over its own pixels only */
const tinted = (src: Part, rgb: string, a: number): Part => {
  const cv = makeCanvas(src.cv.width, src.cv.height);
  const c = cv.getContext('2d')!;
  c.drawImage(src.cv, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = `rgba(${rgb},${a})`;
  c.fillRect(0, 0, cv.width, cv.height);
  return { ...src, cv };
};

/** capsule outline along +x from (0,0) to (len,0), tapered from w0 to w1, slightly bowed */
function limbPoly(len: number, w0: number, w1: number, bow = 0): number[] {
  const pts: Pt[] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = (w0 + (w1 - w0) * t) * (0.94 + 0.1 * Math.sin(Math.PI * t));
    pts.push([len * t, -w / 2 + bow * Math.sin(Math.PI * t)]);
  }
  pts.push([len + w1 * 0.42, 0]);
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const w = (w0 + (w1 - w0) * t) * (0.94 + 0.1 * Math.sin(Math.PI * t));
    pts.push([len * t, w / 2 + bow * Math.sin(Math.PI * t)]);
  }
  pts.push([-w0 * 0.42, 0]);
  return smoothPoly(pts, 3, true);
}

/** a polygon around a centre line with widths w0 → w1 */
function bandPoly(c: Pt[], w0: number, w1: number, seg = 3): number[] {
  const n = c.length;
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)]!;
    const b = c[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const hw = (w0 + (w1 - w0) * (i / Math.max(1, n - 1))) / 2;
    L.push([c[i]![0] - dy * hw, c[i]![1] + dx * hw]);
    R.push([c[i]![0] + dy * hw, c[i]![1] - dx * hw]);
  }
  return smoothPoly([...L, ...R.reverse()], seg, true);
}

/* ------------------------------------------------------------------ pigments */

const SKIN = { base: '#EBBA94', light: '#FFE6CB', shade: '#9A5C3E' };
const LINEN = { base: '#EFE3C6', light: '#FFF8E8', shade: '#8E7E62' };
const VEST = { base: '#946440', light: '#D8AC82', shade: '#43291A' };
const APRON = { base: '#D9C48F', light: '#F8ECC6', shade: '#85703F' };
const DENIM = { base: '#62788E', light: '#B6C8D8', shade: '#27384F' };
const LEATHER = { base: '#70492F', light: '#C99E76', shade: '#27170D' };
const GLOVE = { base: '#C89A50', light: '#F1D28E', shade: '#6C481C' };
const STEEL = { base: '#A9B3BF', light: '#F6F9FC', shade: '#3A4350' };
const ENAMEL = { base: '#C8432E', light: '#F2917A', shade: '#6A1C14' };
const WOOD = { base: '#C9A06A', light: '#F6E2B2', shade: '#5E4028' };
const CAP: Record<PlanId, { base: string; light: string; shade: string }> = {
  minimum: { base: '#8A7B66', light: '#CFC0A2', shade: '#3C3225' },
  fixed: { base: '#B8A066', light: '#EAD9A0', shade: '#5E4A22' },
};
const HAIR = { base: '#7A6048', light: '#C0A07A', shade: '#2E2016' };
const scarfCol = (id: PlanId) => (id === 'minimum' ? BOAT_COLORS.cash : BOAT_COLORS.invest);

/* ------------------------------------------------------------------ the parts */

function paintTorso(F: boolean, id: PlanId, q: number): Part {
  const rnd = new Rand(1701);
  const pf = (ctx: CanvasRenderingContext2D, poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: F, ...o });
  const sc = scarfCol(id);
  void sc;
  return part(30, 58, 15, 45, q, (ctx) => {
    // waistcoat: a soft rounded body from the hips up to the shoulders, the belly a little round
    const body = smoothPoly([[-6.9, 4], [7.4, 4], [8.8, -6], [8.6, -18], [7.6, -28], [4.6, -36.5], [1.2, -40.5], [-2.6, -41], [-6.2, -37.5], [-8.6, -28], [-9.1, -16], [-8.2, -4]], 4, true);
    pf(ctx, body, VEST.base, { light: VEST.light, shade: VEST.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 160, grain: 4, grainColor: '#3A2214' });
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    // soft folds across the back and under the arm
    brush(ctx, [[-4.6, -33], [-5.4, -24], [-4.6, -12]], 0.8, VEST.shade, 0.18, 0.9);
    brush(ctx, [[-1.8, -30], [-2.4, -20]], 0.5, VEST.shade, 0.12, 0.9);
    brush(ctx, [[-3.4, -38.6], [0.6, -39.4], [3.6, -37.4]], 1.2, '#2C2038', 0.16, 0.9);
    ctx.restore();
    // canvas apron: a bib down the front and a skirt that hangs over the thighs
    const apron = smoothPoly([[1.6, -36], [6.8, -31.5], [8.6, -20], [9.8, -4], [10.2, 9], [0.4, 10], [-1.2, -2], [-0.6, -17], [0.2, -29]], 3, true);
    pf(ctx, apron, APRON.base, { light: APRON.light, shade: APRON.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.26, inkW: 0.5, speck: 120, grain: 5, grainColor: '#7A6438' });
    // stitching along the apron's front edge and the skirt hem
    ctx.strokeStyle = 'rgba(110,84,42,0.5)';
    ctx.lineWidth = 0.26;
    ctx.setLineDash([1.1, 0.9]);
    ctx.beginPath();
    ctx.moveTo(8.0, -29);
    ctx.lineTo(8.6, -4);
    ctx.lineTo(9.2, 7.4);
    ctx.moveTo(0.8, 7.6);
    ctx.lineTo(9.0, 7.4);
    ctx.stroke();
    ctx.setLineDash([]);
    // patch pocket (its mouth is where the shears go)
    pf(ctx, flat([[2.4, -19], [9.2, -19], [9.4, -7], [2.6, -6.6]]), mix(APRON.base, '#B89A5E', 0.35), { light: APRON.light, shade: APRON.shade, alpha: 0.96, layers: 3, inkW: 0.42, speck: 30, ink: '#4A3A1E' });
    ctx.strokeStyle = 'rgba(90,66,30,0.55)';
    ctx.lineWidth = 0.28;
    ctx.beginPath();
    ctx.moveTo(2.8, -17.4);
    ctx.lineTo(9.0, -17.4);
    ctx.stroke();
    // waist tie and the neck strap, brown cord
    brush(ctx, [[9.4, -15], [2, -15.4], [-8.4, -14.6]], 0.7, '#5A3A22', 0.75, 0.6);
    brush(ctx, [[2.6, -35.4], [0.2, -39.6], [-3.4, -41.2]], 0.8, '#5A3A22', 0.78, 0.7);
    brush(ctx, [[1.6, -34.4], [-0.4, -38.6]], 0.3, '#C8A070', 0.5, 0.9);
  }, 0.45, 31);
}

/** the same body seen from the front for the middle of a turn: symmetrical, so mirroring it is invisible */
function paintTorsoFront(id: PlanId, q: number): Part {
  const rnd = new Rand(1702);
  const pf = (ctx: CanvasRenderingContext2D, poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
  void id;
  return part(30, 58, 15, 45, q, (ctx) => {
    const body = smoothPoly([[-8.4, 4], [8.4, 4], [9.6, -8], [9.8, -22], [9, -32], [5.2, -38.4], [1.6, -40.6], [-1.6, -40.6], [-5.2, -38.4], [-9, -32], [-9.8, -22], [-9.6, -8]], 4, true);
    pf(ctx, body, VEST.base, { light: VEST.light, shade: VEST.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 160, grain: 4, grainColor: '#3A2214' });
    // shirt at the collar
    pf(ctx, flat([[-4.6, -41.4], [4.6, -41.4], [0, -31]]), LINEN.base, { light: LINEN.light, shade: LINEN.shade, alpha: 0.96, layers: 2, inkW: 0.36, speck: 14 });
    // the apron bib and skirt
    const apron = smoothPoly([[-4.8, -33], [4.8, -33], [6.2, -20], [7.6, -4], [8.4, 9.5], [-8.4, 9.5], [-7.6, -4], [-6.2, -20]], 3, true);
    pf(ctx, apron, APRON.base, { light: APRON.light, shade: APRON.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.26, inkW: 0.5, speck: 120, grain: 5, grainColor: '#7A6438' });
    pf(ctx, flat([[-3.6, -19], [3.6, -19], [3.8, -7], [-3.8, -7]]), mix(APRON.base, '#B89A5E', 0.35), { light: APRON.light, shade: APRON.shade, alpha: 0.96, layers: 3, inkW: 0.42, speck: 30, ink: '#4A3A1E' });
    brush(ctx, [[-8.6, -15], [0, -15.6], [8.6, -15]], 0.7, '#5A3A22', 0.75, 0.6);
    // neck straps over each shoulder
    brush(ctx, [[-4.4, -33], [-5.6, -38], [-6.4, -41]], 0.8, '#5A3A22', 0.78, 0.7);
    brush(ctx, [[4.4, -33], [5.6, -38], [6.4, -41]], 0.8, '#5A3A22', 0.78, 0.7);
    // two buttons on the waistcoat edge
    ctx.fillStyle = 'rgba(40,24,14,0.8)';
    for (const [bx, by] of [[-8, -26], [8, -26], [-8.4, -14], [8.4, -14]] as Pt[]) {
      ctx.beginPath();
      ctx.arc(bx, by, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 0.45, 32);
}

function paintScarfRoll(ctx: CanvasRenderingContext2D, rnd: Rand, F: boolean, id: PlanId, front: boolean): void {
  const sc = scarfCol(id);
  const roll = front
    ? smoothPoly([[-8.4, -4.6], [8.4, -4.6], [9.6, -0.6], [7.2, 3.4], [-7.2, 3.4], [-9.6, -0.6]], 3, true)
    : smoothPoly([[-7, -4.9], [5.8, -4.6], [7.8, -1], [5.8, 3.4], [-5.8, 3.8], [-8, -1]], 3, true);
  paintForm(ctx, roll, sc.hull, rnd, { flip: F, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 40 });
  ctx.save();
  tracePoly(ctx, roll);
  ctx.clip();
  // knit: little V stitches in rows, and two cream stripes
  for (let row = 0; row < 3; row++) {
    for (let x = -9; x < 9.4; x += 1.7) {
      const y = -3.2 + row * 2.4;
      brush(ctx, [[x, y], [x + 0.8, y + 1.1], [x + 1.6, y]], 0.26, sc.dark, 0.3, 0.9);
    }
  }
  brush(ctx, [[-9, -2.4], [0, -2.1], [9, -2.4]], 0.9, '#F4E8CC', 0.62, 0.7);
  brush(ctx, [[-9, 1.3], [0, 1.6], [9, 1.3]], 0.9, '#F4E8CC', 0.62, 0.7);
  ctx.restore();
}

function paintHead(F: boolean, id: PlanId, q: number): Part {
  const rnd = new Rand(1810 + id.length);
  const pf = (ctx: CanvasRenderingContext2D, poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: F, ...o });
  const cap = CAP[id];
  return part(46, 46, 23, 34, q, (ctx) => {
    // neck
    pf(ctx, flat([[-2.6, 2], [3, 2], [2.8, -5.4], [-2.4, -5.2]]), SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, inkW: 0.32, speck: 10 });
    // hair at the back, under the cap
    pf(ctx, smoothPoly([[-9.4, -15], [-10.2, -9.4], [-8.4, -5.2], [-5.6, -6.4], [-6.6, -11.6]], 3, true), HAIR.base, { light: HAIR.light, shade: HAIR.shade, alpha: 0.96, layers: 3, inkW: 0.36, speck: 24 });
    // the face, in profile
    const face = smoothPoly([[-7.6, -12.5], [-6.2, -17.8], [-1.5, -20.6], [4.2, -19.8], [7.8, -16.2], [9, -13.6], [11.8, -11.4], [10.4, -9.6], [9.6, -9], [9.8, -7.4], [8.4, -5.2], [4.6, -3.6], [-1.5, -3.4], [-5.8, -5.6], [-7.9, -9]], 4, true);
    pf(ctx, face, SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.46, speck: 50 });
    ctx.save();
    tracePoly(ctx, face);
    ctx.clip();
    // the shade the cap's peak casts across the brow and a rosy cheek, blushed wet-in-wet
    ctx.fillStyle = 'rgba(122,66,44,0.26)';
    for (let i = 0; i < 3; i++) {
      tracePoly(ctx, deform(flat([[-6, -16.5], [12, -15.8], [12, -13.4], [6.4, -13], [1, -14.6], [-6, -14]]), rnd, 2, 0.05));
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(226,116,98,0.24)';
    for (let i = 0; i < 3; i++) {
      tracePoly(ctx, deform(flat([[3.2, -9.9], [6.6, -10.1], [7.2, -7.7], [4.6, -6.8], [2.8, -8]]), rnd, 3, 0.15));
      ctx.fill();
    }
    ctx.restore();
    // ear, eye, brow, nose shadow, mouth: a few quick marks
    ctx.fillStyle = 'rgba(190,112,90,0.72)';
    ctx.beginPath();
    ctx.ellipse(-1.2, -11, 1.3, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    brush(ctx, [[-1.7, -12], [-0.8, -10.6], [-1.3, -9.6]], 0.3, '#7A3E2C', 0.45, 0.9);
    ctx.fillStyle = 'rgba(40,28,22,0.92)';
    ctx.beginPath();
    ctx.ellipse(6.2, -13.1, 0.52, 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    brush(ctx, [[4.6, -15], [6.4, -15.5], [8.2, -14.6]], 0.4, '#4A2E20', 0.7, 0.9);
    brush(ctx, [[9.6, -9.6], [10.8, -10.4]], 0.24, '#9A5C3E', 0.4, 0.9);
    brush(ctx, [[8.6, -7.2], [9.7, -7.5]], 0.32, '#7A3A2C', 0.55, 0.9);
    if (id === 'minimum') {
      // a flat tweed cap: a puffed crown sloping to the front, a short peak
      const crown = smoothPoly([[-10, -14.4], [-9.4, -19.8], [-4.6, -23.2], [3, -24], [9.6, -21], [11.2, -17.4], [9.8, -15.4], [3, -16.6], [-4, -16.2]], 4, true);
      pf(ctx, crown, cap.base, { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 140 });
      ctx.save();
      tracePoly(ctx, crown);
      ctx.clip();
      // tweed flecks and a seam across the crown
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = i % 3 ? rgba(cap.shade, 0.38) : rgba(cap.light, 0.55);
        ctx.fillRect(rnd.range(-10, 11), rnd.range(-24, -15), rnd.range(0.3, 0.9), rnd.range(0.2, 0.5));
      }
      brush(ctx, [[-4.6, -22], [0.6, -20], [7, -16.4]], 0.34, cap.shade, 0.4, 0.9);
      ctx.restore();
      pf(ctx, smoothPoly([[8.6, -17.8], [14.6, -16.2], [14.4, -14.4], [8.2, -15.2]], 3, true), mix(cap.base, '#2E2418', 0.25), { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 20 });
    } else {
      // a wide felt hat with a band in the scarf colour
      const brim = smoothPoly([[-14.4, -16.4], [-6, -18.4], [6.4, -18.6], [15.6, -16.2], [6.8, -14.2], [-6, -14.2]], 4, true);
      pf(ctx, brim, cap.base, { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 110 });
      const hcrown = smoothPoly([[-6.4, -17.6], [-5.8, -24.4], [-2, -26.4], [3.6, -26.4], [6, -24.2], [6.6, -17.6]], 4, true);
      pf(ctx, hcrown, mix(cap.base, cap.light, 0.2), { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 90 });
      const sc = scarfCol(id);
      ctx.save();
      tracePoly(ctx, hcrown);
      ctx.clip();
      pf(ctx, smoothPoly([[-7, -17.8], [-6.8, -21], [0, -21.6], [7, -21], [7.2, -17.8], [0, -18.4]], 3, true), sc.hull, { light: sc.light, shade: sc.dark, alpha: 0.95, layers: 3, inkW: 0.34, speck: 14, ink: '#1F3A2A' });
      brush(ctx, [[-3.2, -25.2], [-1.6, -26.2]], 0.6, '#FFF8D4', 0.5, 0.9);
      ctx.restore();
    }
    // the scarf roll round the neck, over the chin's lower edge
    paintScarfRoll(ctx, rnd, F, id, false);
  }, 0.4, 51 + id.length);
}

function paintHeadFront(id: PlanId, q: number): Part {
  const rnd = new Rand(1820 + id.length);
  const pf = (ctx: CanvasRenderingContext2D, poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
  const cap = CAP[id];
  return part(46, 46, 23, 34, q, (ctx) => {
    pf(ctx, flat([[-2.8, 2], [2.8, 2], [2.6, -5.4], [-2.6, -5.4]]), SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, inkW: 0.32, speck: 10 });
    // ears
    for (const sx of [-1, 1]) {
      ctx.fillStyle = 'rgba(214,150,120,0.9)';
      ctx.beginPath();
      ctx.ellipse(sx * 9.2, -11, 1.5, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const face = smoothPoly([[-8.6, -13], [-7.6, -18], [-3.4, -20.8], [3.4, -20.8], [7.6, -18], [8.6, -13], [7.6, -8.2], [4.2, -4.2], [0, -3.4], [-4.2, -4.2], [-7.6, -8.2]], 4, true);
    pf(ctx, face, SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.46, speck: 50 });
    ctx.save();
    tracePoly(ctx, face);
    ctx.clip();
    ctx.fillStyle = 'rgba(122,66,44,0.24)';
    for (let i = 0; i < 3; i++) {
      tracePoly(ctx, deform(flat([[-9, -16.5], [9, -16.5], [9, -13.6], [0, -13.2], [-9, -13.6]]), rnd, 2, 0.04));
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(226,116,98,0.26)';
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        tracePoly(ctx, deform(flat([[sx * 3.4, -9.6], [sx * 7.4, -9.8], [sx * 7.6, -7], [sx * 4.2, -6.2]]), rnd, 3, 0.15));
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(40,28,22,0.92)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 3.5, -12.6, 0.55, 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      brush(ctx, [[sx * 1.8, -14.7], [sx * 3.6, -15.2], [sx * 5.4, -14.5]], 0.38, '#4A2E20', 0.7, 0.9);
    }
    brush(ctx, [[-0.2, -11.6], [0.5, -9.6], [-0.4, -9.2]], 0.28, '#9A5C3E', 0.4, 0.9);
    brush(ctx, [[-1.6, -6.7], [0, -6.2], [1.6, -6.7]], 0.32, '#7A3A2C', 0.55, 0.9);
    if (id === 'minimum') {
      const crown = smoothPoly([[-10, -15], [-9.6, -20], [-5, -23.4], [0, -24.4], [5, -23.4], [9.6, -20], [10, -15], [5, -17], [0, -17.4], [-5, -17]], 4, true);
      pf(ctx, crown, cap.base, { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 140 });
      ctx.save();
      tracePoly(ctx, crown);
      ctx.clip();
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = i % 3 ? rgba(cap.shade, 0.38) : rgba(cap.light, 0.55);
        ctx.fillRect(rnd.range(-10, 10), rnd.range(-24, -15), rnd.range(0.3, 0.9), rnd.range(0.2, 0.5));
      }
      ctx.restore();
      pf(ctx, smoothPoly([[-5, -17.2], [5, -17.2], [4, -14.6], [0, -14], [-4, -14.6]], 3, true), mix(cap.base, '#2E2418', 0.25), { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 20 });
    } else {
      const brim = smoothPoly([[-15, -16.4], [-6, -18.4], [6, -18.4], [15, -16.4], [6, -14.2], [-6, -14.2]], 4, true);
      pf(ctx, brim, cap.base, { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 110 });
      const hcrown = smoothPoly([[-6.6, -17.6], [-6, -24.4], [-2, -26.4], [2, -26.4], [6, -24.4], [6.6, -17.6]], 4, true);
      pf(ctx, hcrown, mix(cap.base, cap.light, 0.2), { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 90 });
      const sc = scarfCol(id);
      pf(ctx, smoothPoly([[-7, -17.8], [-6.8, -21], [0, -21.6], [7, -21], [7.2, -17.8], [0, -18.4]], 3, true), sc.hull, { light: sc.light, shade: sc.dark, alpha: 0.95, layers: 3, inkW: 0.34, speck: 14, ink: '#1F3A2A' });
    }
    paintScarfRoll(ctx, rnd, false, id, true);
  }, 0.4, 61 + id.length);
}

function paintTails(F: boolean, id: PlanId, q: number): Part {
  const rnd = new Rand(1830 + id.length);
  const sc = scarfCol(id);
  return part(16, 36, 8, 4, q, (ctx) => {
    const tail = (poly: number[], len: number, w: number) => {
      paintForm(ctx, poly, sc.hull, rnd, { flip: F, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 3, lightA: 0.3, shadeA: 0.3, inkW: 0.4, speck: 40 });
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      for (let y = 3; y < len; y += 1.9) brush(ctx, [[w * 0.1, y], [w * 0.5, y + 0.9], [w * 0.9, y]], 0.24, sc.dark, 0.28, 0.9);
      brush(ctx, [[-4, len * 0.34], [4, len * 0.34 + 0.4], [9, len * 0.34]], 0.9, '#F4E8CC', 0.6, 0.7);
      brush(ctx, [[-4, len * 0.7], [4, len * 0.7 + 0.4], [9, len * 0.7]], 0.9, '#F4E8CC', 0.6, 0.7);
      ctx.restore();
      // fringe
      for (let k = 0; k < 5; k++) brush(ctx, [[-1.2 + k * 1.0, len - 0.4], [-1.3 + k * 1.0, len + 2.2]], 0.26, sc.dark, 0.6, 0.9);
    };
    tail(smoothPoly([[-2.2, 0], [2.8, 0], [3.8, 12], [3.2, 24], [-1.8, 23.4], [-2.8, 11]], 3, true), 23.6, 6);
    ctx.save();
    ctx.translate(1.4, 0);
    ctx.rotate(-0.32);
    tail(smoothPoly([[-2, 0], [2.4, 0], [3.2, 9], [2.6, 17], [-1.6, 16.6], [-2.4, 8]], 3, true), 16.8, 5);
    ctx.restore();
  }, 0.5, 71 + id.length);
}

function paintArm(F: boolean, q: number): { upper: Part; fore: Part } {
  const rnd = new Rand(1840);
  const upper = part(36, 14, 6, 7, q, (ctx) => {
    // the skin below the rolled cuff, then the linen sleeve over it, then the roll itself
    paintForm(ctx, limbPoly(25, 4.8, 4.6, 0), SKIN.base, rnd, { flip: F, light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, inkW: 0.38, speck: 20 });
    paintForm(ctx, limbPoly(18.4, 7.6, 6.6, 0.2), LINEN.base, rnd, { flip: F, light: LINEN.light, shade: LINEN.shade, alpha: 0.97, layers: 3, lightA: 0.3, inkW: 0.45, speck: 60 });
    brush(ctx, [[2, 1.5], [9, 1.7], [17, 1.1]], 1, LINEN.shade, 0.22, 0.9);
    brush(ctx, [[2, -1.8], [9, -2.1], [16, -1.4]], 0.55, '#FFFFFF', 0.4, 0.9);
    paintForm(ctx, flat([[16.4, -4.2], [21.4, -4], [21.6, 4.1], [16.6, 4.3]]), mix(LINEN.base, '#CDBE9C', 0.4), rnd, { flip: F, light: LINEN.light, shade: LINEN.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 16, ink: '#4A3C28' });
    brush(ctx, [[17.6, -3.8], [17.8, 3.9]], 0.3, LINEN.shade, 0.4, 0.9);
    brush(ctx, [[19.6, -3.8], [19.8, 3.9]], 0.3, LINEN.shade, 0.4, 0.9);
  }, 0.5, 81);
  const fore = part(40, 14, 6, 7, q, (ctx) => {
    paintForm(ctx, limbPoly(22, 5.6, 4.7, 0.15), SKIN.base, rnd, { flip: F, light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 3, inkW: 0.4, speck: 40 });
    brush(ctx, [[2, 1.2], [9, 1.3], [17, 0.9]], 0.9, '#B0705A', 0.3, 0.9);
    brush(ctx, [[2.5, -1.2], [9, -1.3], [17, -0.9]], 0.5, '#FFF0DC', 0.4, 0.9);
    // glove: a cuff and a fist in tan canvas, the fingers curled
    paintForm(ctx, flat([[18.4, -3.9], [23.4, -3.7], [23.6, 3.9], [18.6, 4.1]]), mix(GLOVE.base, '#8A5E2A', 0.3), rnd, { flip: F, light: GLOVE.light, shade: GLOVE.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 16 });
    const fist = smoothPoly([[22.6, -3.8], [26, -4.6], [30, -4], [32.2, -1.6], [32.4, 1.4], [30.2, 3.8], [26, 4.4], [22.6, 3.7]], 3, true);
    paintForm(ctx, fist, GLOVE.base, rnd, { flip: F, light: GLOVE.light, shade: GLOVE.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 28 });
    for (let k = 0; k < 3; k++) brush(ctx, [[28.4 + k * 0.1, -2.6 + k * 2.1], [30.6, -2.1 + k * 2.1], [31.6, -1.3 + k * 2.1]], 0.24, GLOVE.shade, 0.5, 0.9);
    brush(ctx, [[24, -3.6], [27.6, -4.2], [30.4, -3.4]], 0.36, GLOVE.light, 0.6, 0.9);
  }, 0.5, 82);
  return { upper, fore };
}

function paintLeg(F: boolean, q: number): { thigh: Part; shin: Part; boot: Part; bootFront: Part } {
  const rnd = new Rand(1850);
  const thigh = part(38, 18, 8, 9, q, (ctx) => {
    paintForm(ctx, limbPoly(28.5, 11.8, 9.4, -0.3), DENIM.base, rnd, { flip: F, light: DENIM.light, shade: DENIM.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 100, grain: 4, grainColor: '#2E4058' });
    brush(ctx, [[3, 2.2], [11, 2.6], [20, 2], [27, 1.4]], 1.5, DENIM.shade, 0.22, 0.9);
    brush(ctx, [[3, -2.8], [11, -3.2], [20, -2.7]], 0.7, '#E6EEF6', 0.3, 0.9);
  }, 0.6, 91);
  const shin = part(38, 16, 7, 8, q, (ctx) => {
    paintForm(ctx, limbPoly(28.5, 9.4, 8.2, 0.25), DENIM.base, rnd, { flip: F, light: DENIM.light, shade: DENIM.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 90, grain: 4, grainColor: '#2E4058' });
    brush(ctx, [[2, 1.8], [12, 2.1], [22, 1.6]], 1.2, DENIM.shade, 0.22, 0.9);
    // turn-up cuff at the ankle
    paintForm(ctx, flat([[23.6, -4.8], [29.4, -4.6], [29.8, 4.8], [24, 5]]), mix(DENIM.base, DENIM.light, 0.32), rnd, { flip: F, light: DENIM.light, shade: DENIM.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 24 });
    brush(ctx, [[23.9, -4.4], [24.2, 4.5]], 0.3, DENIM.shade, 0.4, 0.9);
  }, 0.6, 92);
  // the boot, with the ankle joint at the origin and the sole 5 below it
  const boot = part(28, 22, 10, 16, q, (ctx) => {
    const poly = smoothPoly([[-4.8, -12], [3.9, -12], [4.2, -3.4], [8.2, -2], [12.6, 1.4], [13.4, 4], [12.4, 5.1], [-5.8, 5.1], [-6.2, 1.6], [-5.4, -4]], 3, true);
    paintForm(ctx, poly, LEATHER.base, rnd, { flip: F, light: LEATHER.light, shade: LEATHER.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.5, speck: 50, grain: 2, grainColor: '#3A2212' });
    // dark sole and heel block, a toe cap, laces
    brush(ctx, [[-5.8, 4.5], [4, 4.7], [12.6, 4.4]], 1.0, '#1E120A', 0.72, 0.8);
    paintForm(ctx, flat([[-6.1, 2.2], [-2.2, 2.4], [-2.2, 5.2], [-5.9, 5.2]]), '#3A2416', rnd, { flip: F, light: '#6A4A32', shade: '#14090A', alpha: 0.96, layers: 2, inkW: 0.3, speck: 8 });
    brush(ctx, [[8.6, -1.6], [10.4, 0.2], [11.2, 3.2]], 0.34, LEATHER.shade, 0.5, 0.9);
    brush(ctx, [[-3.2, -8.4], [3, -8]], 0.3, '#E6D2B0', 0.7, 0.9);
    brush(ctx, [[-3.2, -5.6], [3.4, -5.2]], 0.3, '#E6D2B0', 0.7, 0.9);
    brush(ctx, [[-1, -11.4], [3, -3.6]], 0.3, '#F2DCC0', 0.4, 0.9);
    brush(ctx, [[-3, -10.8], [-3.6, -4]], 0.4, '#E0B890', 0.35, 0.9);
  }, 0.6, 93);
  // front view of a boot (symmetrical), for the middle of a turn
  const bootFront = part(24, 22, 12, 16, q, (ctx) => {
    const poly = smoothPoly([[-4.6, -12], [4.6, -12], [5, -3], [5.8, 1.4], [5.2, 5.1], [-5.2, 5.1], [-5.8, 1.4], [-5, -3]], 3, true);
    paintForm(ctx, poly, LEATHER.base, rnd, { flip: false, light: LEATHER.light, shade: LEATHER.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.5, speck: 40 });
    brush(ctx, [[-5.4, 4.6], [0, 4.8], [5.4, 4.6]], 1.0, '#1E120A', 0.72, 0.8);
    brush(ctx, [[-4.2, 0.4], [0, -1.2], [4.2, 0.4]], 0.34, LEATHER.shade, 0.5, 0.9);
    for (const y of [-8.4, -5.6]) brush(ctx, [[-2.4, y], [2.4, y]], 0.3, '#E6D2B0', 0.7, 0.9);
  }, 0.6, 94);
  return { thigh, shin, boot, bootFront };
}

/**
 * The secateurs in two halves, pivot at the origin, blades toward +x. A is the half the hand holds still (handle
 * up at the back, anvil blade below); B is the half that opens (handle below, hooked blade above), rotated about
 * the pivot by -angle to open. Crossed at the pivot, like real shears.
 */
function paintShears(F: boolean, q: number): { a: Part; b: Part } {
  const rnd = new Rand(1860);
  const handle = (ctx: CanvasRenderingContext2D, c: Pt[]) => paintForm(ctx, bandPoly(c, 3.2, 2.6), ENAMEL.base, rnd, { flip: F, light: ENAMEL.light, shade: ENAMEL.shade, alpha: 0.97, layers: 3, lightA: 0.34, inkW: 0.34, speck: 10, ink: '#3A0E0A', pool: 1.2 });
  const blade = (ctx: CanvasRenderingContext2D, c: Pt[], hook: boolean) => {
    paintForm(ctx, bandPoly(c, 2.7, 1.1), STEEL.base, rnd, { flip: F, light: STEEL.light, shade: STEEL.shade, alpha: 0.97, layers: 3, lightA: 0.4, inkW: 0.3, speck: 8, ink: '#232A34' });
    if (hook) brush(ctx, [c[c.length - 2]!, c[c.length - 1]!, [c[c.length - 1]![0] + 0.2, c[c.length - 1]![1] + 1.4]], 0.7, STEEL.base, 0.95, 0.5);
  };
  const dot = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'rgba(176,132,44,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.8)';
    ctx.beginPath();
    ctx.arc(-0.3, -0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
  };
  const a = part(36, 20, 18, 10, q, (ctx) => {
    blade(ctx, [[0, 0.5], [5.5, 1.1], [11, 1.2], [14, 0.6]], false);
    handle(ctx, [[0.4, -0.2], [-4.6, -1.2], [-9.6, -2.2], [-13.4, -3.2]]);
    dot(ctx);
  }, 0.4, 101);
  const b = part(36, 20, 18, 10, q, (ctx) => {
    handle(ctx, [[0.4, 0.2], [-4.6, 1.3], [-9.6, 2.4], [-13.4, 3.5]]);
    blade(ctx, [[0, -0.5], [5.5, -1.2], [11, -1.3], [14, -0.4]], true);
    dot(ctx);
  }, 0.4, 102);
  return { a, b };
}

/** The leaf rake: pole along +x from the head joint at the origin, a fan of tines folded back on it. */
function paintRake(F: boolean, q: number): Part {
  const rnd = new Rand(1870);
  const W = 138;
  const H = 36;
  return part(W, H, 26, 8, q, (ctx) => {
    const L = RAKE.POLE;
    // the pole: a long slim ash handle with a little grain, a rounded top
    const pole = bandPoly([[0, 0], [L * 0.33, 0.1], [L * 0.66, -0.05], [L, 0]], 2.9, 2.5, 4);
    paintForm(ctx, pole, WOOD.base, rnd, { flip: F, light: WOOD.light, shade: WOOD.shade, alpha: 0.97, layers: 3, lightA: 0.32, inkW: 0.38, speck: 90, grain: 6, grainColor: '#5A3C26', dash: [10, 26] });
    brush(ctx, [[L * 0.88, -0.6], [L * 0.99, -0.55]], 0.4, '#FFF4D0', 0.5, 0.9);
    // the head: a fan of springy steel tines, the ends curled
    const tines = 9;
    const base = (132 * Math.PI) / 180;
    for (let i = 0; i < tines; i++) {
      const a = base + ((i - (tines - 1) / 2) * 5.2 * Math.PI) / 180;
      const len = 23 + 4.5 * Math.cos(((i - (tines - 1) / 2) / 4) * 1.2) + (i % 2) * 0.8;
      const pts: Pt[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const bend = a + 0.12 * t * t * (i - (tines - 1) / 2 > 0 ? 1 : -1) - 0.28 * t * t * t;
        pts.push([Math.cos(bend) * len * t, Math.sin(bend) * len * t]);
      }
      const col = i % 2 ? '#8A95A3' : '#6E7B8A';
      brush(ctx, pts, 0.95 - 0.35 * (i % 2) * 0.3, col, 0.94, 0.55);
      brush(ctx, [pts[1]!, pts[3]!], 0.26, '#E8EEF4', 0.5, 0.9);
    }
    // the binding across the fan and the ferrule where the pole joins
    const bind: Pt[] = [];
    for (let i = 0; i < tines; i++) {
      const a = base + ((i - (tines - 1) / 2) * 5.2 * Math.PI) / 180;
      bind.push([Math.cos(a) * 9.4, Math.sin(a) * 9.4]);
    }
    brush(ctx, bind, 1.3, '#4A5460', 0.9, 0.5);
    paintForm(ctx, flat([[-1.4, -1.8], [4.4, -1.6], [4.6, 1.8], [-1.6, 1.9]]), '#B89A4E', rnd, { flip: F, light: '#F4E09A', shade: '#6A4E18', alpha: 0.97, layers: 2, inkW: 0.3, speck: 8 });
    inkDashes(ctx, bandPoly([[0, 0], [L, 0]], 2.9, 2.5, 1), rnd, { color: SEPIA, alpha: 0.35, w: 0.3, dash: [12, 30], gap: [2, 6], flip: F });
    feather(ctx, flat([[3, -1.4], [L * 0.3, -1.2], [L * 0.3, 0.2], [3, 0.4]]), '#FFF2D0', 0.3, rnd, 3, 1, 0.5, 0.05);
    void streaks;
    void speckle;
  }, 0.5, 111);
}

function paintSet(F: boolean, id: PlanId, q: number): Sprites {
  const arm = paintArm(F, q);
  const leg = paintLeg(F, q);
  const sh = paintShears(F, q);
  const cool = '40,34,70';
  return {
    torso: paintTorso(F, id, q),
    torsoFront: paintTorsoFront(id, q),
    head: paintHead(F, id, q),
    headFront: paintHeadFront(id, q),
    tails: paintTails(F, id, q),
    upper: arm.upper,
    fore: arm.fore,
    upperFar: tinted(arm.upper, cool, 0.3),
    foreFar: tinted(arm.fore, cool, 0.3),
    thigh: leg.thigh,
    shin: leg.shin,
    boot: leg.boot,
    thighFar: tinted(leg.thigh, cool, 0.3),
    shinFar: tinted(leg.shin, cool, 0.3),
    bootFar: tinted(leg.boot, cool, 0.3),
    bootFront: leg.bootFront,
    shearsA: sh.a,
    shearsB: sh.b,
    rake: paintRake(F, q),
  };
}

const cache = new Map<string, GardenerSet>();

/** The painted parts for one plan at one quality; built once and shared. */
export function buildGardenerSet(id: PlanId, q: number): GardenerSet {
  const key = `${id}@${q}`;
  let s = cache.get(key);
  if (!s) {
    s = { q, R: paintSet(false, id, q), L: paintSet(true, id, q) };
    cache.set(key, s);
  }
  return s;
}
