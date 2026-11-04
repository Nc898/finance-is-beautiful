/**
 * Paper and the late-summer afternoon sky (screen space; the camera never zooms here): a graded wash, a warm hazy
 * blue high up going through a dusty lilac to a pale apricot-cream at the horizon, variegated with a few broad
 * blooms; a golden glow toward the low sun at the upper left, off the picture; the warm band low down broken up with
 * peach and lilac blooms; soft sunlit cumulus, their billows lifted crisply where the sun catches them
 * and tinted warm, a lilac-grey underside fading up into each; granulation, denser up high where the wash is richer.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, paintPaperBackdrop, tracePoly } from '../../scene/watercolor';
import { blobPoly } from '../../river/scene/paint';
import { WORLD } from './geom';
import type { Camera } from './layout';

export function paintPaperAndSky(cam: Camera, tile: CanvasImageSource): HTMLCanvasElement {
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const d = cam.dpr;
  const paper = makeCanvas(Wd, Hd);
  const pctx = paper.getContext('2d')!;
  paintPaperBackdrop(pctx, Wd, Hd, tile, d);
  // the sky is laid on its own sheet (so the clouds can be lifted out of it), then laid over the paper
  const sky = makeCanvas(Wd, Hd);
  const ctx = sky.getContext('2d')!;
  const rnd = new Rand(30223);
  const X = (x: number) => (cam.ox + x * cam.s) * d;
  const Y = (y: number) => (cam.oy + y * cam.s) * d;
  const S = cam.s * d;
  const hy = Math.min(Hd, Y(WORLD.horizon + 40));

  // 1. the graded wash: hazy blue, a breath of lilac, then the warm apricot-cream of the late afternoon low down
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, 'rgba(104,146,198,0.6)');
  g.addColorStop(0.3, 'rgba(132,166,206,0.48)');
  g.addColorStop(0.56, 'rgba(178,184,206,0.36)');
  g.addColorStop(0.76, 'rgba(230,198,180,0.38)');
  g.addColorStop(0.9, 'rgba(244,202,156,0.42)');
  g.addColorStop(1, 'rgba(248,222,180,0.26)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, Wd, hy);
  // 2. variegation: broad blooms of slightly different blues, a dusty lilac and a warm peach (low res, scaled up)
  {
    const q = 4;
    const w = Math.ceil(Wd / q);
    const h = Math.ceil(hy / q);
    if (w > 0 && h > 0) {
      const v = makeCanvas(w, h);
      const vc = v.getContext('2d')!;
      const tints = ['rgba(84,128,196,0.14)', 'rgba(128,160,210,0.12)', 'rgba(170,150,196,0.1)', 'rgba(240,190,150,0.1)', 'rgba(150,182,214,0.12)'];
      for (let i = 0; i < 14; i++) {
        const x = rnd.range(0, w);
        const t = i % 5;
        const y = t === 3 ? rnd.range(h * 0.55, h) : rnd.range(0, h * 0.7);
        const r = rnd.range(0.12, 0.3) * w;
        const b = vc.createRadialGradient(x, y, 0, x, y, r);
        b.addColorStop(0, tints[t]!);
        b.addColorStop(1, 'rgba(255,255,255,0)');
        vc.fillStyle = b;
        vc.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(v, 0, 0, Wd, hy);
    }
  }
  // 3. the golden glow toward the low sun (upper left, just off the picture), reaching well into the sky
  {
    const sx = X(-90);
    const sy = Y(150);
    const r = 700 * S;
    const warm = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    warm.addColorStop(0, 'rgba(255,222,164,0.48)');
    warm.addColorStop(0.3, 'rgba(255,230,184,0.3)');
    warm.addColorStop(0.65, 'rgba(255,238,206,0.1)');
    warm.addColorStop(1, 'rgba(255,244,226,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, Wd, hy);
  }
  // 4. the warm band low in the sky, broken up so it never reads as a flat stripe: blooms of peach, a dusty lilac
  // and a little blue left in, wet into the wash (low res, scaled up)
  {
    const q = 4;
    const w = Math.ceil(Wd / q);
    const h = Math.ceil(hy / q);
    const y0 = Y(170) / q;
    const v = makeCanvas(w, h);
    const vc = v.getContext('2d')!;
    const tints = ['rgba(236,176,140,0.14)', 'rgba(176,160,200,0.12)', 'rgba(150,176,210,0.12)', 'rgba(244,206,150,0.14)'];
    for (let i = 0; i < 16; i++) {
      const x = rnd.range(-0.1, 1.1) * w;
      const y = rnd.range(Math.max(0, y0), h);
      const rx = rnd.range(0.1, 0.24) * w;
      const ry = rx * rnd.range(0.18, 0.35);
      vc.save();
      vc.translate(x, y);
      vc.scale(1, ry / rx);
      const b = vc.createRadialGradient(0, 0, 0, 0, 0, rx);
      b.addColorStop(0, tints[i % 4]!);
      b.addColorStop(1, 'rgba(255,255,255,0)');
      vc.fillStyle = b;
      vc.fillRect(-rx, -rx, rx * 2, rx * 2);
      vc.restore();
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v, 0, 0, Wd, hy);
  }
  // 5. sunlit cumulus: one big heap off to the right over the farm, smaller ones drifting, a low bank of fair-weather
  // cloud along the horizon (clear of the title at the upper left); on a tall screen, a few more high up
  const clouds = [
    { x: 820, y: 168, w: 230 },
    { x: 620, y: 92, w: 150 },
    { x: 1050, y: 110, w: 170 },
    { x: 330, y: 150, w: 120 },
    { x: 140, y: 214, w: 96 },
    { x: 470, y: 232, w: 70 },
    { x: 700, y: 246, w: 84 },
    { x: 960, y: 250, w: 74 },
    { x: 250, y: 252, w: 58 },
  ];
  const top = -cam.oy / cam.s;
  for (let y = 40, k = 0; y > top + 60; y -= 170, k++) clouds.push({ x: [260, 760, 420, 900][k % 4]!, y, w: 150 + (k % 3) * 40 }, { x: [880, 120, 700, 300][k % 4]!, y: y - 80, w: 120 });
  // the lift is laid soft: each cloud's billows are lifted together as one shape (so they never step where they
  // overlap) on a very low-resolution sheet, scaled up, so its base is a lost edge; its body again a little firmer;
  // and only the sunlit tops of its upper billows a third time, nearly crisp
  const sheet = (q: number) => {
    const cv = makeCanvas(Math.ceil(Wd / q), Math.ceil(hy / q));
    const c = cv.getContext('2d')!;
    c.scale(1 / q, 1 / q);
    return { cv, c, q };
  };
  const loose = sheet(7);
  const body = sheet(3);
  const crisp = sheet(1.5);
  const union = (c: CanvasRenderingContext2D, polys: number[][], a: number) => {
    c.fillStyle = `rgba(0,0,0,${a})`;
    c.beginPath();
    for (const l of polys) {
      for (let i = 0; i < l.length; i += 2) (i ? c.lineTo(l[i]!, l[i + 1]!) : c.moveTo(l[i]!, l[i + 1]!));
      c.closePath();
    }
    c.fill('nonzero');
  };
  const shrink = (l: number[], cx: number, cy: number, k: number, dx: number, dy: number) => l.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * k + dx : cy + (v - cy) * k + dy));
  const under: Array<{ lumps: number[][]; tops: number[][]; cx: number; cy: number; w: number }> = [];
  for (const c of clouds) {
    const cx = X(c.x);
    const cy = Y(c.y);
    const w = c.w * S;
    const lumps: number[][] = [];
    const tops: number[][] = [];
    // billows along an arc, highest a little left of the middle (toward the sun), smaller at the ends; the big ones
    // tower in a second and third tier
    const n = 5 + Math.round(c.w / 24);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1) - 0.5;
      const lift = 1 - Math.abs(t + 0.08) * 1.7;
      const r = w * (0.1 + 0.14 * Math.max(0, lift)) * rnd.range(0.75, 1.25);
      const l = blobPoly(cx + t * w * 0.95 + rnd.range(-0.03, 0.03) * w, cy - r * 0.5 - w * 0.08 * Math.max(0, lift) + rnd.range(-0.04, 0.04) * w, r, r * 0.84, rnd, 16, 0.14);
      lumps.push(deform(l, rnd, 2, 0.06));
      if (lift > 0.2 && rnd.chance(0.6)) tops.push(l);
    }
    const tiers = c.w > 200 ? 2 : c.w > 110 ? 1 : 0;
    for (let tier = 1; tier <= tiers; tier++) {
      for (let k = 0; k < 4 - tier; k++) {
        const r = w * rnd.range(0.1, 0.16) * (1 - tier * 0.12);
        const l = blobPoly(cx + rnd.range(-0.26, 0.12) * w, cy - w * (0.12 + tier * 0.15) - rnd.range(0, 0.06) * w, r, r * 0.86, rnd, 16, 0.14);
        lumps.push(deform(l, rnd, 2, 0.06));
        tops.push(l);
      }
    }
    // the base: a soft flat smear, narrower than the billows
    const base = blobPoly(cx, cy + w * 0.02, w * 0.46, w * 0.08, rnd, 16, 0.12);
    union(loose.c, [...lumps, base], 0.34);
    union(body.c, lumps.map((l) => shrink(l, cx, cy, 0.84, 0, -w * 0.03)), 0.22);
    // the sunlit tops: each upper billow drawn in a little toward the sun, so only its lit crown is lifted crisply
    union(crisp.c, tops.map((l) => deform(shrink(l, cx, cy, 0.9, -w * 0.012, -w * 0.02), rnd, 2, 0.04)), 0.2);
    under.push({ lumps, tops, cx, cy, w });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.imageSmoothingQuality = 'high';
  for (const sh of [loose, body, crisp]) ctx.drawImage(sh.cv, 0, 0, sh.cv.width * sh.q, sh.cv.height * sh.q);
  ctx.restore();
  // the light on the clouds: a warm cream glaze on the billows facing the sun; the undersides: a lilac-grey wash
  // along each base, fading up into the cloud. Laid on a low-resolution sheet too, so no edge of it is hard.
  const tq = 3;
  const tint = makeCanvas(Math.ceil(Wd / tq), Math.ceil(hy / tq));
  const tc = tint.getContext('2d')!;
  tc.scale(1 / tq, 1 / tq);
  for (const u of under) {
    tc.save();
    tc.beginPath();
    for (const l of u.lumps) tracePoly(tc, l);
    tc.clip();
    const lg = tc.createLinearGradient(u.cx - u.w * 0.6, u.cy - u.w * 0.5, u.cx + u.w * 0.4, u.cy + u.w * 0.1);
    lg.addColorStop(0, 'rgba(255,226,176,0.26)');
    lg.addColorStop(0.5, 'rgba(255,232,196,0.1)');
    lg.addColorStop(1, 'rgba(255,240,220,0)');
    tc.fillStyle = lg;
    tc.fillRect(u.cx - u.w, u.cy - u.w, u.w * 2, u.w * 1.3);
    const ug = tc.createLinearGradient(0, u.cy - u.w * 0.24, 0, u.cy + u.w * 0.04);
    ug.addColorStop(0, 'rgba(160,146,184,0)');
    ug.addColorStop(0.65, 'rgba(156,140,180,0.13)');
    ug.addColorStop(1, 'rgba(138,122,164,0.22)');
    tc.fillStyle = ug;
    tc.fillRect(u.cx - u.w, u.cy - u.w * 0.6, u.w * 2, u.w);
    tc.restore();
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tint, 0, 0, tint.width * tq, tint.height * tq);
  // 6. granulation, denser up high where the wash is richer
  for (let i = 0; i < 1700; i++) {
    const y = Math.pow(rnd.next(), 1.7) * hy * 0.9;
    ctx.fillStyle = `rgba(80,116,170,${rnd.range(0.04, 0.1)})`;
    ctx.fillRect(rnd.range(0, Wd), y, d, d);
  }
  pctx.drawImage(sky, 0, 0);
  return paper;
}
