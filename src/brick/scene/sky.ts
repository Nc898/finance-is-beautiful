/**
 * Paper and the soft spring sky (screen space; the camera never zooms here): a graded wash, clear pale blue high
 * up warming to cream at the horizon, variegated with a few broad blooms; thin high cirrus (mares' tails) lifted out
 * of the wash with a damp brush; a few small fair-weather clouds low over the hills, paper-white on top with a
 * grey-violet underside; a warm glow toward the sun at the upper left, off the picture; granulation. The two houses
 * are reserved: inside their outlines the paper is left white for the pencil drawing.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, paintPaperBackdrop, tracePoly } from '../../scene/watercolor';
import { blobPoly } from '../../river/scene/paint';
import { WORLD } from './geom';
import { silhouette } from './housePaint';
import type { Camera } from './layout';
import { LOANS } from '../types';

export function paintPaperAndSky(cam: Camera, tile: CanvasImageSource): HTMLCanvasElement {
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const d = cam.dpr;
  const paper = makeCanvas(Wd, Hd);
  const pctx = paper.getContext('2d')!;
  paintPaperBackdrop(pctx, Wd, Hd, tile, d);
  // the sky is laid on its own sheet, the houses lifted out of it, then laid over the paper
  const sky = makeCanvas(Wd, Hd);
  const ctx = sky.getContext('2d')!;
  const rnd = new Rand(30117);
  const X = (x: number) => (cam.ox + x * cam.s) * d;
  const Y = (y: number) => (cam.oy + y * cam.s) * d;
  const S = cam.s * d;
  const hy = Math.min(Hd, Y(WORLD.horizon + 30));

  // 1. the graded wash
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, 'rgba(92,150,212,0.62)');
  g.addColorStop(0.32, 'rgba(122,172,222,0.5)');
  g.addColorStop(0.66, 'rgba(176,204,226,0.36)');
  g.addColorStop(0.88, 'rgba(226,226,212,0.3)');
  g.addColorStop(1, 'rgba(244,232,206,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, Wd, hy);
  // 2. variegation: broad blooms of slightly different blues and a little lavender (low res, scaled up)
  {
    const q = 4;
    const w = Math.ceil(Wd / q);
    const h = Math.ceil(hy / q);
    if (w > 0 && h > 0) {
      const v = makeCanvas(w, h);
      const vc = v.getContext('2d')!;
      const tints = ['rgba(70,130,204,0.15)', 'rgba(120,170,220,0.12)', 'rgba(150,150,210,0.08)', 'rgba(160,200,226,0.12)'];
      for (let i = 0; i < 12; i++) {
        const x = rnd.range(0, w);
        const y = rnd.range(0, h * 0.75);
        const r = rnd.range(0.12, 0.3) * w;
        const b = vc.createRadialGradient(x, y, 0, x, y, r);
        b.addColorStop(0, tints[i % 4]!);
        b.addColorStop(1, 'rgba(255,255,255,0)');
        vc.fillStyle = b;
        vc.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(v, 0, 0, Wd, hy);
    }
  }
  // 3. the warm glow toward the sun (upper left, just off the picture)
  {
    const sx = X(-40);
    const sy = Y(40);
    const r = 520 * S;
    const warm = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    warm.addColorStop(0, 'rgba(255,240,206,0.5)');
    warm.addColorStop(0.4, 'rgba(255,242,214,0.2)');
    warm.addColorStop(1, 'rgba(255,248,232,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, Wd, hy);
  }
  // 4. mares' tails: long thin strokes lifted out of the wash, each ending in a hook, all leaning the same way
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x0 = X(rnd.range(-60, 1060));
    const y0 = Y(rnd.range(26, 150));
    const len = rnd.range(70, 170) * S;
    const tilt = rnd.range(-0.18, -0.05);
    const hook = rnd.range(8, 18) * S * (rnd.chance(0.5) ? 1 : -1);
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(0,0,0,${rnd.range(0.12, 0.22)})`;
      ctx.lineWidth = rnd.range(1.2, 3.4) * S;
      const oy = (k - 1) * rnd.range(2, 4) * S;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + oy);
      ctx.bezierCurveTo(x0 + len * 0.35, y0 + oy + len * tilt * 0.4, x0 + len * 0.75, y0 + oy + len * tilt, x0 + len, y0 + oy + len * tilt - hook);
      ctx.stroke();
    }
    // a few finer filaments trailing off it
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(0,0,0,${rnd.range(0.08, 0.16)})`;
      ctx.lineWidth = rnd.range(0.6, 1.3) * S;
      const a = rnd.range(0.1, 0.7);
      const fx = x0 + len * a;
      const fy = y0 + len * tilt * a + rnd.range(-3, 6) * S;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx + rnd.range(10, 26) * S, fy + rnd.range(2, 8) * S, fx + rnd.range(24, 50) * S, fy + rnd.range(-6, 10) * S);
      ctx.stroke();
    }
  }
  ctx.restore();
  // 5. fair-weather clouds: small ones low over the hills, a few bigger spring cumulus drifting higher up (clear of
  // the title); lifted white tops, a grey-violet underside
  const clouds = [
    { x: 150, y: 250, w: 74 },
    { x: 330, y: 236, w: 52 },
    { x: 640, y: 228, w: 88 },
    { x: 880, y: 246, w: 60 },
    { x: 1040, y: 232, w: 70 },
    { x: -40, y: 238, w: 58 },
    { x: 420, y: 96, w: 150 },
    { x: 760, y: 40, w: 200 },
    { x: 1010, y: 150, w: 120 },
    { x: 80, y: 170, w: 110 },
    { x: 600, y: 176, w: 84 },
    { x: 250, y: -20, w: 130 },
  ];
  // the lift is laid soft (on a low-resolution sheet, scaled up), so a cloud's base is a lost edge; only the sunlit
  // tops of its billows are lifted again crisply
  const q = 3;
  const soft = makeCanvas(Math.ceil(Wd / q), Math.ceil(hy / q));
  const sc = soft.getContext('2d')!;
  sc.scale(1 / q, 1 / q);
  const under: Array<{ lumps: number[][]; cx: number; cy: number; w: number }> = [];
  for (const c of clouds) {
    const cx = X(c.x);
    const cy = Y(c.y);
    const w = c.w * S;
    const lumps: number[][] = [];
    const tops: number[][] = [];
    // billows along an arc, highest a little left of the middle (toward the sun), smaller at the ends
    const n = 5 + Math.round(c.w / 22);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1) - 0.5;
      const lift = 1 - Math.abs(t + 0.08) * 1.7;
      const r = w * (0.11 + 0.15 * Math.max(0, lift)) * rnd.range(0.75, 1.25);
      const l = blobPoly(cx + t * w * 0.95 + rnd.range(-0.03, 0.03) * w, cy - r * 0.5 - w * 0.1 * Math.max(0, lift) + rnd.range(-0.04, 0.04) * w, r, r * 0.82, rnd, 16, 0.14);
      lumps.push(l);
      if (rnd.chance(0.7)) tops.push(l);
    }
    if (c.w > 100) {
      for (let k = 0; k < 3; k++) {
        const r = w * rnd.range(0.12, 0.18);
        const l = blobPoly(cx + rnd.range(-0.28, 0.15) * w, cy - w * rnd.range(0.26, 0.36), r, r * 0.8, rnd, 16, 0.14);
        lumps.push(l);
        tops.push(l);
      }
    }
    // the base: a soft flat smear, narrower than the billows
    const base = blobPoly(cx, cy + w * 0.02, w * 0.46, w * 0.09, rnd, 16, 0.12);
    sc.fillStyle = 'rgba(0,0,0,0.34)';
    for (const l of [...lumps, base]) {
      tracePoly(sc, deform(l, rnd, 2, 0.08));
      sc.fill();
    }
    sc.fillStyle = 'rgba(0,0,0,0.22)';
    for (const l of lumps) {
      tracePoly(sc, deform(l.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * 0.8 : cy + (v - cy) * 0.8 - w * 0.03)), rnd, 2, 0.08));
      sc.fill();
    }
    // the crisp sunlit tops
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (const l of tops) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - w, cy - w, w * 2, w * 0.86);
      ctx.clip();
      tracePoly(ctx, deform(l, rnd, 2, 0.05));
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    under.push({ lumps: [...lumps, base], cx, cy, w });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, soft.width * q, soft.height * q);
  ctx.restore();
  // the undersides: a cool grey-violet wash along each base, fading up into the cloud
  for (const u of under) {
    ctx.save();
    ctx.beginPath();
    for (const l of u.lumps) tracePoly(ctx, l);
    ctx.clip();
    const ug = ctx.createLinearGradient(0, u.cy - u.w * 0.3, 0, u.cy + u.w * 0.12);
    ug.addColorStop(0, 'rgba(150,150,190,0)');
    ug.addColorStop(0.6, 'rgba(150,150,190,0.12)');
    ug.addColorStop(1, 'rgba(130,128,170,0.24)');
    ctx.fillStyle = ug;
    ctx.fillRect(u.cx - u.w, u.cy - u.w * 0.6, u.w * 2, u.w);
    ctx.restore();
  }
  // 6. granulation, denser up high where the wash is richer
  for (let i = 0; i < 1600; i++) {
    const y = Math.pow(rnd.next(), 1.7) * hy * 0.9;
    ctx.fillStyle = `rgba(70,120,176,${rnd.range(0.04, 0.1)})`;
    ctx.fillRect(rnd.range(0, Wd), y, d, d);
  }
  // 7. the houses are reserved: the paper stays white inside their outlines
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const id of LOANS) {
    for (const poly of silhouette(id)) {
      tracePoly(ctx, poly.map((v, i) => (i % 2 === 0 ? X(v) : Y(v))));
      ctx.fill();
    }
  }
  ctx.restore();
  pctx.drawImage(sky, 0, 0);
  return paper;
}
