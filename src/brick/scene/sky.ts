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
  // 5. a few small fair-weather clouds low over the hills: lifted white tops, a grey-violet underside
  const clouds = [
    { x: 150, y: 250, w: 74 },
    { x: 330, y: 236, w: 52 },
    { x: 640, y: 228, w: 88 },
    { x: 880, y: 246, w: 60 },
    { x: 1040, y: 232, w: 70 },
    { x: -40, y: 238, w: 58 },
  ];
  for (const c of clouds) {
    const cx = X(c.x);
    const cy = Y(c.y);
    const w = c.w * S;
    const lumps: number[][] = [];
    const n = 4 + Math.round(c.w / 26);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1) - 0.5;
      const r = w * (0.2 + 0.16 * (1 - Math.abs(t) * 1.6)) * rnd.range(0.85, 1.15);
      lumps.push(blobPoly(cx + t * w * 0.9, cy - r * 0.45 + rnd.range(-0.06, 0.06) * w, r, r * 0.8, rnd, 14, 0.12));
    }
    lumps.push(blobPoly(cx, cy, w * 0.56, w * 0.13, rnd, 14, 0.1));
    // lift the wash out where the cloud is (the paper shows)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (const l of lumps) {
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      tracePoly(ctx, deform(l, rnd, 2, 0.06));
      ctx.fill();
    }
    ctx.restore();
    // the underside: a cool grey-violet wash along the flat base, fading up
    ctx.save();
    ctx.beginPath();
    for (const l of lumps) tracePoly(ctx, l);
    ctx.clip();
    const ug = ctx.createLinearGradient(0, cy - w * 0.3, 0, cy + w * 0.14);
    ug.addColorStop(0, 'rgba(150,150,190,0)');
    ug.addColorStop(0.65, 'rgba(150,150,190,0.16)');
    ug.addColorStop(1, 'rgba(130,128,170,0.3)');
    ctx.fillStyle = ug;
    ctx.fillRect(cx - w, cy - w * 0.6, w * 2, w);
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
