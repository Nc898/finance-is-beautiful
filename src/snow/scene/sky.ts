/**
 * Paper and the winter sky (never zoomed with the camera): a soft pale wash, grey-blue at the top warming through
 * pearl to cream at the horizon, with broad variegated blooms, soft brush streaks and granulation, and a few thin
 * veils of cloud lifted out of the wash (no hard clouds). The faint, hazy low sun sits at the upper left behind
 * the thinnest veil; it is the light of the whole picture.
 */
import { Rand } from '../../scene/prng';
import { makeCanvas, paintPaperBackdrop } from '../../scene/watercolor';
import { WORLD, type Camera } from './geom';

/** the sun in world units */
export const SUN = { x: 150, y: 84, r: 21 } as const;

export function paintPaperAndSky(cam: Camera, tile: CanvasImageSource): HTMLCanvasElement {
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const d = cam.dpr;
  const paper = makeCanvas(Wd, Hd);
  const ctx = paper.getContext('2d')!;
  paintPaperBackdrop(ctx, Wd, Hd, tile, d);
  const rnd = new Rand(5501);
  const hy = Math.min(Hd, (cam.oy + (WORLD.horizon + 30) * cam.s) * d);
  const sx = (cam.ox + SUN.x * cam.s) * d;
  const sy = (cam.oy + SUN.y * cam.s) * d;
  const sr = SUN.r * cam.s * d;
  ctx.save();
  // 1. the graded wash: grey-blue up high, pearl, then warm cream at the horizon
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, 'rgba(112,138,186,0.8)');
  g.addColorStop(0.28, 'rgba(138,162,204,0.62)');
  g.addColorStop(0.56, 'rgba(184,198,222,0.46)');
  g.addColorStop(0.8, 'rgba(226,224,222,0.34)');
  g.addColorStop(1, 'rgba(248,230,200,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, Wd, hy);
  // 2. variegation: broad blooms of slightly different greys and blue-violets
  const q = 4;
  const w = Math.ceil(Wd / q);
  const h = Math.ceil(hy / q);
  if (w > 0 && h > 0) {
    const v = makeCanvas(w, h);
    const vc = v.getContext('2d')!;
    const tints = ['rgba(86,118,178,0.17)', 'rgba(132,142,198,0.14)', 'rgba(164,180,212,0.12)', 'rgba(176,160,198,0.12)', 'rgba(120,150,190,0.13)'];
    for (let i = 0; i < 12; i++) {
      const x = rnd.range(0, w);
      const y = rnd.range(0, h * 0.85);
      const r = rnd.range(0.12, 0.34) * w;
      const b = vc.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, tints[i % tints.length]!);
      b.addColorStop(1, 'rgba(255,255,255,0)');
      vc.fillStyle = b;
      vc.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v, 0, 0, Wd, hy);
  }
  // 3. broad horizontal brush streaks, as a wash laid in strokes (ends feathered)
  for (let i = 0; i < 16; i++) {
    const y = rnd.range(0.02, 0.84) * hy;
    const sh = rnd.range(14, 46) * d;
    const x0 = rnd.range(-0.2, 0.5) * Wd;
    const sw = rnd.range(0.35, 0.9) * Wd;
    const st = makeCanvas(Math.max(2, Math.round(sw / 8)), Math.max(2, Math.round((sh * 2) / 8)));
    const sc = st.getContext('2d')!;
    const sg = sc.createLinearGradient(0, 0, 0, st.height);
    const a = rnd.range(0.05, 0.1);
    sg.addColorStop(0, 'rgba(96,126,184,0)');
    sg.addColorStop(0.5, `rgba(96,126,184,${a})`);
    sg.addColorStop(1, 'rgba(96,126,184,0)');
    sc.fillStyle = sg;
    sc.fillRect(0, 0, st.width, st.height);
    sc.globalCompositeOperation = 'destination-in';
    const ends = sc.createLinearGradient(0, 0, st.width, 0);
    ends.addColorStop(0, 'rgba(0,0,0,0)');
    ends.addColorStop(0.2, 'rgba(0,0,0,1)');
    ends.addColorStop(0.8, 'rgba(0,0,0,1)');
    ends.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = ends;
    sc.fillRect(0, 0, st.width, st.height);
    ctx.drawImage(st, x0, y - sh, sw, sh * 2);
  }
  // 4. the sky nearest the light is paler and yellower
  const warm = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 10);
  warm.addColorStop(0, 'rgba(255,240,200,0.6)');
  warm.addColorStop(0.5, 'rgba(255,242,214,0.28)');
  warm.addColorStop(1, 'rgba(255,248,232,0)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, Wd, hy);
  // 5. granulation, denser where the wash is richer
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 1800; i++) {
    const y = Math.pow(rnd.next(), 1.5) * hy * 0.92;
    ctx.fillStyle = `rgba(70,96,152,${rnd.range(0.04, 0.1)})`;
    ctx.fillRect(rnd.range(0, Wd), y, d, d);
  }
  ctx.globalCompositeOperation = 'source-over';
  // 6. the sun, lifted out of the wash: a hazy pale disk and a soft glow, no hard ring
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.7, sx, sy, sr * 5.5);
  glow.addColorStop(0, 'rgba(255,246,214,0.7)');
  glow.addColorStop(0.35, 'rgba(255,243,208,0.34)');
  glow.addColorStop(1, 'rgba(255,242,214,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - sr * 6, sy - sr * 6, sr * 12, sr * 12);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(255,247,222,${0.34 + i * 0.1})`;
    ctx.beginPath();
    const pts = 20;
    for (let k = 0; k <= pts; k++) {
      const a = (k / pts) * Math.PI * 2;
      const rr = sr * (1 - i * 0.05) * (1 + 0.03 * Math.sin(a * 3 + i) + rnd.range(-0.012, 0.012));
      const px = sx + Math.cos(a) * rr;
      const py = sy + Math.sin(a) * rr;
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  // 7. thin veils of cloud, lifted out of the wash (paper showing through), laid across and about the sun
  const veil = (cx: number, cy: number, len: number, hgt: number, a: number, tilt: number) => {
    const wv = Math.max(12, Math.round(len / 5));
    const hv = Math.max(6, Math.round(hgt / 5));
    const cv = makeCanvas(wv, hv);
    const c = cv.getContext('2d')!;
    // a long soft body made of overlapping blooms, so its edge is uneven and never a bar
    const nb = Math.max(6, Math.round(len / (hgt * 0.9)));
    for (let b = 0; b < nb; b++) {
      const bx = wv * (0.2 + 0.6 * ((b + rnd.range(0.2, 0.8)) / nb));
      const by = hv * rnd.range(0.35, 0.65);
      const rx = (wv / nb) * rnd.range(1.4, 2.6);
      const ry = hv * rnd.range(0.28, 0.5);
      c.save();
      c.translate(bx, by);
      c.scale(rx / ry, 1);
      const gg = c.createRadialGradient(0, 0, 0, 0, 0, ry);
      gg.addColorStop(0, `rgba(255,252,246,${a * rnd.range(0.5, 1)})`);
      gg.addColorStop(0.6, `rgba(255,252,246,${a * 0.35})`);
      gg.addColorStop(1, 'rgba(255,252,246,0)');
      c.fillStyle = gg;
      c.fillRect(-ry, -ry, ry * 2, ry * 2);
      c.restore();
    }
    // a lens-shaped mask, so the veil fades out all round
    c.save();
    c.globalCompositeOperation = 'destination-in';
    c.translate(wv / 2, hv / 2);
    c.scale(wv / hv, 1);
    const mk = c.createRadialGradient(0, 0, 0, 0, 0, hv / 2);
    mk.addColorStop(0, 'rgba(0,0,0,1)');
    mk.addColorStop(0.55, 'rgba(0,0,0,0.9)');
    mk.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mk;
    c.fillRect(-hv / 2, -hv / 2, hv, hv);
    c.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cv, -len / 2, -hgt / 2, len, hgt);
    ctx.restore();
  };
  veil(sx + sr * 1.8, sy + sr * 0.5, sr * 16, sr * 3.4, 0.42, -0.03);
  veil(sx - sr * 0.4, sy + sr * 2.4, sr * 12, sr * 2.8, 0.32, 0.02);
  veil(sx + sr * 8, sy + sr * 4.4, sr * 18, sr * 3.6, 0.26, -0.02);
  veil(Wd * 0.7, hy * 0.2, Wd * 0.3, sr * 3.8, 0.24, 0.03);
  veil(Wd * 0.46, hy * 0.5, Wd * 0.36, sr * 4, 0.22, -0.015);
  veil(Wd * 0.88, hy * 0.62, Wd * 0.26, sr * 3.4, 0.22, 0.02);
  ctx.restore();
  return paper;
}
