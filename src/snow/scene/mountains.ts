/**
 * The far mountains: two ranges of blue-violet peaks with snowfields lifted out of the wash, a violet shadow on
 * each right-hand flank (the light is at the upper left), broken pencil ridge lines, and atmospheric perspective
 * (the farther range is paler and cooler). The washes are laid wet (painted at a coarse grid and scaled up soft, so
 * their edges bleed), the pencil on top is crisp. Painted into the world layer (world units).
 */
import { Rand, makeNoise2D } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, applyTooth, bloom, paperTooth } from '../../river/scene/paint';
import { dryBrush } from '../../vine/scene/cottageWash';
import { mix } from '../../river/scene/boatInk';

export interface View {
  xmin: number;
  xmax: number;
  ymax: number;
}

interface Peak {
  x: number;
  y: number;
  sl: number;
  sr: number;
}

const ROCK = makeNoise2D(3301);

/** a ridge of peaks across [x0, x1]: each peak is a pair of slopes; the ridge is the lowest of them */
function makeRange(rnd: Rand, x0: number, x1: number, base: number, h0: number, h1: number, spacing: [number, number]): { peaks: Peak[]; at: (x: number) => number } {
  const peaks: Peak[] = [];
  for (let x = x0 - 120; x < x1 + 120; x += rnd.range(spacing[0], spacing[1])) {
    peaks.push({ x, y: base - rnd.range(h0, h1), sl: rnd.range(0.55, 1.05), sr: rnd.range(0.55, 1.05) });
  }
  const at = (x: number): number => {
    let y = base + 30;
    for (const p of peaks) {
      const d = x - p.x;
      // a rounded summit (a hyperbola: shoulders, not a wedge's point), flanks steepening a little as they fall
      const r = 9;
      const yy = p.y + (Math.sqrt(d * d + r * r) - r) * (d < 0 ? p.sl : p.sr) * 0.95 * (1 + Math.min(0.25, Math.abs(d) / 400));
      if (yy < y) y = yy;
    }
    // rocky roughness over long undulations, so no flank runs straight
    return y + (ROCK(x / 64, 7.5) - 0.5) * 18 + (ROCK(x / 26, 0.5) - 0.5) * 10 + (ROCK(x / 9, 4.5) - 0.5) * 5 + (ROCK(x / 3.3, 2.5) - 0.5) * 2.2;
  };
  return { peaks, at };
}

export function paintMountains(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = 120;
  const y1 = 300;
  const W = v.xmax - v.xmin;
  const mk = (res = 0.7) => new SoftLayer(v.xmin, y0, W, y1 - y0, res);
  const bodyL = mk();
  const shadeL = mk(0.6);
  const snowL = mk(0.7);
  const snowShadeL = mk(0.55);
  const step = 4;
  const X: number[] = [];
  for (let x = v.xmin - 10; x <= v.xmax + 10; x += step) X.push(x);

  const paintRange = (r: { peaks: Peak[]; at: (x: number) => number }, base: number, o: { body: string; shade: string; snowA: number; a: number; haze: number; crease: number }) => {
    const line = X.map((x) => r.at(x));
    const top = Math.min(...line);
    for (const l of [bodyL, shadeL, snowL, snowShadeL]) l.ctx.clearRect(v.xmin, y0, W, y1 - y0);
    // the body: a wash laid wet, graded toward the foot
    const poly: number[] = [];
    X.forEach((x, i) => poly.push(x, line[i]!));
    for (let i = X.length - 1; i >= 0; i--) poly.push(X[i]!, base + 14);
    const g = bodyL.ctx.createLinearGradient(0, top, 0, base + 14);
    g.addColorStop(0, rgba(o.body, o.a));
    g.addColorStop(0.55, rgba(o.body, o.a * 0.8));
    g.addColorStop(1, rgba(o.body, o.a * 0.35));
    bodyL.ctx.fillStyle = g;
    for (let i = 0; i < 2; i++) {
      tracePoly(bodyL.ctx, deform(poly, rnd, 2, 0.006));
      bodyL.ctx.fill();
    }
    // each peak's shaded right-hand flank, its snowfield (lit on the left) and the shadow on that snow
    for (const p of r.peaks) {
      if (p.x < v.xmin - 60 || p.x > v.xmax + 60) continue;
      const py = r.at(p.x);
      const hgt = base - py;
      if (hgt < 10) continue;
      const w = (hgt / p.sr) * 1.05;
      const wl = (hgt / p.sl) * 1.05;
      // the shaded flank: from the summit down the right, a crease running down and a little to the right
      const flank: number[] = [p.x, py];
      for (let k = 1; k <= 8; k++) flank.push(p.x + (w * k) / 8, r.at(p.x + (w * k) / 8) + 0.5);
      flank.push(p.x + w * 0.95, base + 10, p.x + w * 0.3, base + 10);
      for (let k = 5; k >= 1; k--) flank.push(p.x + w * (0.02 + 0.05 * (6 - k)) + (ROCK(k * 1.7 + p.x, 3.5) - 0.5) * 0.35 * w, py + (base - py) * (k / 6) * 0.95);
      shadeL.ctx.fillStyle = rgba(o.shade, 0.4);
      for (let i = 0; i < 2; i++) {
        tracePoly(shadeL.ctx, deform(flank, rnd, 3, 0.035));
        shadeL.ctx.fill();
      }
      // the snowfield: a cap below the summit over both flanks, its lower edge ragged and following the slope
      const depth = hgt * rnd.range(0.4, 0.62);
      const xa = p.x - wl * 0.6;
      const xb = p.x + w * 0.55;
      const cap: number[] = [];
      const lower: number[] = [];
      const NK = 36;
      for (let k = 0; k <= NK; k++) {
        const xx = xa + ((xb - xa) * k) / NK;
        cap.push(xx, r.at(xx) + 0.2);
        const fromPeak = Math.abs(xx - p.x) / (xx < p.x ? wl : w);
        const rag = (ROCK(xx / 4 + p.x, 9.5) - 0.5) * hgt * 0.32 + (ROCK(xx / 1.6 + p.x, 2.5) - 0.5) * hgt * 0.12;
        // gullies: every so often the snow runs on down a couloir in a tongue
        const gully = Math.pow(Math.max(0, ROCK(xx / 3.4 + p.x * 0.3, 6.5) - 0.6) / 0.4, 1.5) * hgt * 0.26;
        lower.push(xx, r.at(xx) + Math.max(2, depth * (1 - fromPeak * 0.8) + rag + gully));
      }
      const capPoly = [...cap];
      for (let i = lower.length - 2; i >= 0; i -= 2) capPoly.push(lower[i]!, lower[i + 1]!);
      snowL.ctx.fillStyle = rgba('#fcfcff', o.snowA);
      for (let i = 0; i < 2; i++) {
        tracePoly(snowL.ctx, deform(capPoly, rnd, 3, 0.03));
        snowL.ctx.fill();
      }
      // the shadow on the snow, to the right of the summit (the snow's own shaded flank)
      const sh: number[] = [];
      const shLow: number[] = [];
      for (let k = 0; k <= 7; k++) {
        const xx = p.x + 1 + (k / 7) * w * 0.55;
        sh.push(xx, r.at(xx) + 0.5);
        const i2 = Math.min(lower.length / 2 - 1, Math.round(((xx - xa) / (xb - xa)) * NK));
        shLow.push(xx, lower[2 * i2 + 1]! + 1);
      }
      const shPoly = [...sh];
      for (let i = shLow.length - 2; i >= 0; i -= 2) shPoly.push(shLow[i]!, shLow[i + 1]!);
      snowShadeL.ctx.fillStyle = rgba(mix(o.shade, '#9a9cdc', 0.4), 0.55);
      tracePoly(snowShadeL.ctx, deform(shPoly, rnd, 3, 0.04));
      snowShadeL.ctx.fill();
    }
    // lay the washes: body, then the shaded flanks (multiply), then the snow, then the snow's shadow
    bodyL.draw(ctx, 1, 'source-over');
    ctx.fillStyle = rgba(o.body, o.a * 0.35);
    tracePoly(ctx, deform(poly, rnd, 3, 0.008));
    ctx.fill();
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    for (let i = 0; i < Math.round(W / 40); i++) {
      bloom(ctx, rnd.range(v.xmin, v.xmax), rnd.range(top + 10, base + 6), rnd.range(18, 60), rnd.range(8, 22), rnd.pick(['#9fb4dc', '#b9a6d2', '#8e9ccc', '#c4bedc']), 0.16, rnd, 4);
    }
    const m = ctx.getTransform();
    applyTooth(ctx, paperTooth(o.shade, 192, 4101), v.xmin, top - 4, W, base + 18 - top, m.a * 0.6, 0.18, 0.2);
    ctx.restore();
    shadeL.draw(ctx, 1, 'multiply');
    snowL.draw(ctx, 1, 'source-over');
    snowShadeL.draw(ctx, 1, 'multiply');
    // snow streaks running down in the couloirs
    for (const p of r.peaks) {
      if (p.x < v.xmin - 60 || p.x > v.xmax + 60) continue;
      const py = r.at(p.x);
      const hgt = base - py;
      if (hgt < 14) continue;
      for (let c = 0; c < 4; c++) {
        const sx = p.x + rnd.range(-0.5, 0.5) * (hgt / p.sl);
        const sy = r.at(sx) + 3;
        const len = hgt * rnd.range(0.35, 0.8);
        const pts: number[] = [];
        for (let k = 0; k <= 7; k++) pts.push(sx + (k / 7) * len * rnd.range(-0.1, 0.1) + Math.sin(k + c) * 1.2, sy + (k / 7) * len);
        // (soft cool streaks of shade, few and broad: white ones read as cracks)
        if (c < 2) dryBrush(ctx, pts, rnd.range(2.5, 4.5), mix(o.shade, '#c8c8ec', 0.5), 0.12, rnd, 0.5);
      }
    }
    // creases and couloirs: a few broken pencil lines running down from the summits
    for (const p of r.peaks) {
      if (p.x < v.xmin - 60 || p.x > v.xmax + 60) continue;
      const py = r.at(p.x);
      const hgt = base - py;
      if (hgt < 14) continue;
      const w = (hgt / p.sr) * 1.05;
      for (let c = 0; c < 3; c++) {
        const pts: number[] = [];
        const sx = p.x + rnd.range(-0.15, 0.55) * w;
        const sy = r.at(sx) + 2;
        const len = hgt * rnd.range(0.3, 0.65);
        for (let k = 0; k <= 8; k++) pts.push(sx + k * len * 0.06 * (c % 2 ? 1 : -0.4) + Math.sin(k + c) * 0.9, sy + (k / 8) * len);
        dryBrush(ctx, pts, 0.5, o.shade, o.crease, rnd, 0.5);
      }
    }
    // the ridge: a broken pencil line
    const ridgePts: number[] = [];
    X.forEach((x, i) => ridgePts.push(x, line[i]! + 0.3));
    dryBrush(ctx, ridgePts, 0.7, mix(o.shade, '#3a3a66', 0.35), o.crease * 1.5, rnd, 0.32);
    // atmospheric perspective: the foot of the range lifts toward the paper
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const hg = ctx.createLinearGradient(0, top + (base - top) * 0.35, 0, base + 14);
    hg.addColorStop(0, rgba('#FBF6EA', 0));
    hg.addColorStop(1, rgba('#FBF6EA', o.haze));
    ctx.fillStyle = hg;
    ctx.fillRect(v.xmin, top, W, base + 14 - top);
    ctx.restore();
  };

  // the far range: tall, pale, cool
  const far = makeRange(rnd, v.xmin, v.xmax, 252, 52, 112, [105, 190]);
  paintRange(far, 252, { body: '#a9aed8', shade: '#8f8fc8', snowA: 0.62, a: 0.36, haze: 0.55, crease: 0.12 });
  // blooms of other tints at the foot, where the wash pooled
  bodyL.ctx.clearRect(v.xmin, y0, W, y1 - y0);
  for (let i = 0; i < 12; i++) {
    const x = rnd.range(v.xmin, v.xmax);
    bloom(bodyL.ctx, x, rnd.range(215, 250), rnd.range(40, 120), rnd.range(6, 14), rnd.pick(['#b8a8d6', '#9db0dc', '#c9b0c8', '#a6bde0']), 0.13, rnd, 4);
  }
  bodyL.draw(ctx, 1, 'multiply');
  // the nearer range: lower, deeper blue-violet
  const near = makeRange(rnd, v.xmin, v.xmax, 270, 24, 62, [70, 140]);
  paintRange(near, 270, { body: '#9296c8', shade: '#7275b4', snowA: 0.5, a: 0.44, haze: 0.4, crease: 0.15 });
}
