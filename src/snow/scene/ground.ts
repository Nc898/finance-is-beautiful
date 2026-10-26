/**
 * The snow: the plain behind the hills, the two rolling hillsides (a soft heightfield lit from the upper left becomes
 * the paint: pale blue-violet shadow washes where a drift turns from the light, paper white where it faces it),
 * pencil lines along the shadow edges, wind ripples, faint lane tracks, the snowbank at the foot, rocks and dry
 * grass poking through. Everything is painted once into the world layer (world units).
 */
import { Rand, makeNoise2D, clamp } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, applyTooth, bloom, grassTuft, paperTooth } from '../../river/scene/paint';
import { backrun, dryBrush } from '../../vine/scene/cottageWash';
import { mix, ribbon } from '../../river/scene/boatInk';
import { DEBTS, STRATEGIES } from '../types';
import { HILL, LANES, depthScale } from './geom';
import { CREEK_Y0, bankTop, creekW, creekX, crestLine, laneDistance, ridgeBack } from './layout';
import type { View } from './mountains';

const VIOLET = '#6e70b6';
const NOISE_A = makeNoise2D(1701);
const NOISE_B = makeNoise2D(1709);

/** the painted height of the ground (arbitrary units): two broad hills, drifts, the creek's trench, the foot bank */
export function hf(x: number, y: number): number {
  let h = 0;
  for (const id of STRATEGIES) {
    const cx = HILL[id].crest.x;
    h += 64 * Math.exp(-(((x - cx) / 150) ** 2)) * Math.exp(-(((y - 420) / 190) ** 2));
  }
  // the plain behind: a low swell
  h += 6 * Math.exp(-(((y - 300) / 40) ** 2));
  h += (NOISE_A(x / 120, y / 34) - 0.5) * 6 + (NOISE_B(x / 45, y / 13) - 0.5) * 1.6;
  // the creek's trench and the banks at its sides
  const dx = x - creekX(y);
  const hw = creekW(y) / 2 + 8;
  if (y > CREEK_Y0) h -= 9 * Math.exp(-((dx / hw) ** 2));
  // the valley the creek runs down: both hills fall away toward it
  h -= 14 * Math.exp(-((dx / 70) ** 2));
  // the snowbank at the foot
  const bt = bankTop(x);
  h += 13 * Math.exp(-(((y - bt - 5) / 7.5) ** 2));
  return h;
}

/** how much the ground at (x, y) faces the light: -1 turned from it .. +1 facing it (light from the upper left) */
export function shadeAt(x: number, y: number): number {
  const e = 2;
  const hx = (hf(x + e, y) - hf(x - e, y)) / (2 * e);
  const hy = (hf(x, y + e) - hf(x, y - e)) / (2 * e);
  return (0.58 * hx + 0.81 * hy) * 3.2;
}

/** the plain behind the hills and the hillsides themselves, washed with the heightfield's light and shade */
export function paintSnowfield(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const X: number[] = [];
  for (let x = v.xmin - 20; x <= v.xmax + 20; x += 5) X.push(x);
  // ---- the plain behind: pale, hazy, a little bluer (distance)
  {
    const poly: number[] = [];
    for (const x of X) poly.push(x, ridgeBack(x) + 1);
    poly.push(v.xmax + 20, 330, v.xmin - 20, 330);
    const g = ctx.createLinearGradient(0, 262, 0, 330);
    g.addColorStop(0, 'rgba(226,230,246,0.96)');
    g.addColorStop(1, 'rgba(244,245,252,0.98)');
    ctx.fillStyle = g;
    tracePoly(ctx, deform(poly, rnd, 2, 0.004));
    ctx.fill();
    // shadow sweeps on the plain
    const soft = new SoftLayer(v.xmin, 262, v.xmax - v.xmin, 70, 0.5);
    for (let i = 0; i < 26; i++) {
      const x = rnd.range(v.xmin, v.xmax);
      bloom(soft.ctx, x, rnd.range(282, 318), rnd.range(30, 100), rnd.range(2.5, 6), rnd.pick(['#9fa4d4', '#b3b6de', '#8f9ccc']), 0.2, rnd, 4);
    }
    soft.draw(ctx, 1, 'multiply');
  }
  // ---- the hills: white ground, the heightfield's light and shadow, blooms, pencil
  const top = Math.min(...X.map(crestLine)) - 6;
  const poly: number[] = [];
  for (const x of X) poly.push(x, crestLine(x));
  poly.push(v.xmax + 20, v.ymax + 10, v.xmin - 20, v.ymax + 10);
  const g = ctx.createLinearGradient(0, top, 0, v.ymax);
  g.addColorStop(0, 'rgba(250,251,255,0.84)');
  g.addColorStop(1, 'rgba(252,252,255,0.78)');
  ctx.fillStyle = g;
  tracePoly(ctx, deform(poly, rnd, 2, 0.003));
  ctx.fill();
  // the shading, at a coarse grid, scaled up soft
  const cell = 3;
  const gx0 = Math.floor(v.xmin / cell) * cell;
  const gx1 = Math.ceil(v.xmax / cell) * cell;
  const gy0 = Math.floor((top - 4) / cell) * cell;
  const gy1 = Math.ceil((v.ymax + 6) / cell) * cell;
  const gw = (gx1 - gx0) / cell + 1;
  const gh = (gy1 - gy0) / cell + 1;
  const sh = new Float32Array(gw * gh);
  const cv = makeCanvas(gw, gh);
  const c2 = cv.getContext('2d')!;
  const img = c2.createImageData(gw, gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = gx0 + i * cell;
      const y = gy0 + j * cell;
      const inside = y >= crestLine(x) - 1;
      const s = inside ? shadeAt(x, y) : 0;
      sh[j * gw + i] = inside ? s : 9;
      // far ground is hazier (less contrast); the foreground is clearer
      const far = 0.62 + 0.38 * clamp((y - 296) / 190, 0, 1);
      const k = (j * gw + i) * 4;
      if (!inside) {
        img.data[k + 3] = 0;
      } else if (s < 0) {
        const a = clamp(-s * 0.8, 0, 0.34) * far;
        img.data[k] = 112;
        img.data[k + 1] = 120;
        img.data[k + 2] = 190;
        img.data[k + 3] = a * 255;
      } else {
        img.data[k] = 255;
        img.data[k + 1] = 255;
        img.data[k + 2] = 255;
        img.data[k + 3] = clamp(s * 0.7, 0, 0.4) * 255;
      }
    }
  }
  c2.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, gx0 - cell / 2, gy0 - cell / 2, gw * cell, gh * cell);
  ctx.restore();
  // a cool glaze over the lit snow so it is not the colour of the paper (a hint of blue, warmer toward the sun)
  const cool = ctx.createLinearGradient(v.xmin, 0, v.xmax, v.ymax);
  cool.addColorStop(0, 'rgba(236,236,246,0.0)');
  cool.addColorStop(1, 'rgba(214,220,244,0.16)');
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = cool;
  ctx.fillRect(v.xmin, top, v.xmax - v.xmin, v.ymax - top);
  ctx.restore();
  // ---- blooms: wet-in-wet variegation, concentrated in the shade, a few warm lifts where the sun glances
  const soft = new SoftLayer(v.xmin, top, v.xmax - v.xmin, v.ymax - top, 0.45);
  const sampleShade = (x: number, y: number) => sh[Math.round((y - gy0) / cell) * gw + Math.round((x - gx0) / cell)] ?? 0;
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 46; tries++) {
    const x = rnd.range(v.xmin, v.xmax);
    const y = rnd.range(top + 10, v.ymax - 8);
    if (y < crestLine(x) + 4) continue;
    const s = sampleShade(x, y);
    if (s > -0.1 && !rnd.chance(0.12)) continue;
    placed++;
    const dpt = depthScale(y);
    bloom(soft.ctx, x, y, rnd.range(18, 56) * dpt, rnd.range(3, 9) * dpt, rnd.pick(['#8b94d2', '#7f9ad0', '#9a95cc', '#7c8cc6', '#a6aadc']), 0.15, rnd, 4);
  }
  for (let i = 0; i < 22; i++) {
    const x = rnd.range(v.xmin, v.xmax);
    const y = rnd.range(top + 14, v.ymax - 20);
    if (y < crestLine(x) + 6 || sampleShade(x, y) < 0.05) continue;
    bloom(soft.ctx, x, y, rnd.range(20, 60), rnd.range(3, 8), rnd.pick(['#f6e3bd', '#f2dcc0', '#f8ecd2']), 0.2, rnd, 3);
  }
  soft.draw(ctx, 1, 'multiply');
  // backruns where a wash dried (a darker rim and a pale heart)
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  placed = 0;
  for (let tries = 0; tries < 700 && placed < 26; tries++) {
    const x = rnd.range(v.xmin, v.xmax);
    const y = rnd.range(top + 20, v.ymax - 10);
    if (y < crestLine(x) + 8 || sampleShade(x, y) > -0.28) continue;
    placed++;
    backrun(ctx, x, y, rnd.range(7, 22), rnd.range(2.2, 6), rnd.pick(['#7f86c8', '#8c8cc6', '#7a98cc']), 0.2, rnd);
  }
  ctx.restore();
  paintDrifts(ctx, rnd, v, top, sampleShade);
  // the crest line itself: a lit rim of paper white and a soft shadow wash just under it, a broken pencil line
  ctx.save();
  const pts: number[] = [];
  for (const x of X) pts.push(x, crestLine(x) + 0.4);
  ctx.fillStyle = rgba(VIOLET, 0.16);
  ribbon(ctx, pts.map((p, i) => (i % 2 ? p + 2.4 : p)), 3.4, 0.2);
  dryBrush(ctx, pts, 0.6, '#4d4f86', 0.28, rnd, 0.4);
  ctx.restore();
  // ---- granulation: pigment settled in the shadows, a few specks of paper in the light
  ctx.save();
  for (let i = 0; i < 6500; i++) {
    const x = rnd.range(v.xmin, v.xmax);
    const y = rnd.range(top + 2, v.ymax);
    if (y < crestLine(x) + 1) continue;
    const s = sampleShade(x, y);
    if (s < -0.12) {
      ctx.fillStyle = rgba('#5f63a6', rnd.range(0.1, 0.3) * clamp(-s * 2, 0.25, 1));
      ctx.fillRect(x, y, rnd.range(0.3, 0.8), rnd.range(0.25, 0.5));
    } else if (rnd.chance(0.3)) {
      ctx.fillStyle = rgba('#d6dcf4', rnd.range(0.12, 0.3));
      ctx.fillRect(x, y, rnd.range(0.3, 0.7), rnd.range(0.25, 0.5));
    }
  }
  ctx.restore();
  // paper tooth: the paper's peaks show through the wash, and pigment settles in its valleys
  paperGrain(ctx, v, top);
  // ---- wind ripples: little crests of snow (lit above, a violet line below)
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const x = rnd.range(v.xmin, v.xmax);
    const y = rnd.range(top + 14, v.ymax - 16);
    if (y < crestLine(x) + 10) continue;
    const dp = depthScale(y);
    const len = rnd.range(6, 17) * dp;
    const ang = rnd.range(-0.18, 0.16);
    const bow = rnd.range(0.8, 2.4) * dp;
    const n = 6;
    const lineP: number[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      lineP.push(x + Math.cos(ang) * len * t, y + Math.sin(ang) * len * t - Math.sin(Math.PI * t) * bow);
    }
    ctx.fillStyle = rgba('#6c70b6', rnd.range(0.12, 0.22));
    ribbon(ctx, lineP.map((p, q) => (q % 2 ? p + 0.7 * dp : p)), 1.0 * dp, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ribbon(ctx, lineP.map((p, q) => (q % 2 ? p - 0.35 * dp : p)), 0.8 * dp, 0.9);
  }
  ctx.restore();
}

/** a faint track down each lane, which the balls' own pressed tracks will fill in as they roll */
export function paintLanes(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const widths = { medical: 11, car: 15, card: 19 } as const;
  for (const id of STRATEGIES) {
    for (const d of DEBTS) {
      const l = LANES[id][d];
      const n = 26;
      const left: number[] = [];
      const right: number[] = [];
      const mid: number[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = l.start.x + (l.end.x - l.start.x) * t + Math.sin(i * 0.8 + l.start.x) * 0.5;
        const y = l.start.y + (l.end.y - l.start.y) * t;
        const w = widths[d] * depthScale(y) * (1 - 0.35 * t);
        left.push(x - w, y);
        right.push(x + w, y);
        mid.push(x, y);
      }
      // a faint cool glaze along the track and a broken pencil line each side (the left edge, in the shade, stronger)
      const poly = [...left];
      for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i]!, right[i + 1]!);
      ctx.fillStyle = rgba('#8a96cc', 0.012);
      for (let k = 0; k < 2; k++) {
        tracePoly(ctx, deform(poly, rnd, 2, 0.012));
        ctx.fill();
      }
      dryBrush(ctx, left, 0.55, '#5a62a6', 0.17, rnd, 0.55);
      dryBrush(ctx, right, 0.4, '#6a72b4', 0.09, rnd, 0.66);
    }
  }
}

/** the snowbank along the foot of each hill: a drift with a lit top, a violet shadowed face and a broken pencil edge */
export function paintBank(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const x0 = v.xmin - 10;
  const x1 = v.xmax + 10;
  const cut = (x: number) => {
    const y = 604;
    return Math.abs(x - creekX(y)) < creekW(y) / 2 + 3;
  };
  const segs: Array<[number, number]> = [];
  let sx = x0;
  for (let x = x0; x <= x1; x += 4) {
    if (cut(x)) {
      if (x - 4 > sx) segs.push([sx, x - 4]);
      sx = x + 4;
    }
  }
  segs.push([sx, x1]);
  for (const [a, b] of segs) {
    const top: number[] = [];
    const bot: number[] = [];
    for (let x = a; x <= b; x += 3) {
      const t = bankTop(x) - 1.5;
      const taper = Math.min(1, (x - a) / 14, (b - x) / 14);
      top.push(x, t + (1 - taper) * 8);
      bot.unshift(x, bankTop(x) + (11 + 3.5 * Math.sin(x / 7 + 1.2) + 2 * Math.sin(x / 2.9)) * taper + 1);
    }
    const poly = [...top, ...bot];
    // the shadowed face (under the lip): violet, pooled
    const face = [...top.map((p, i) => (i % 2 ? p + 3 : p)), ...bot];
    ctx.fillStyle = rgba('#8588c8', 0.34);
    for (let k = 0; k < 2; k++) {
      tracePoly(ctx, deform(face, rnd, 2, 0.02));
      ctx.fill();
    }
    ctx.fillStyle = rgba('#6e78c0', 0.18);
    tracePoly(ctx, deform(face.map((p, i) => (i % 2 ? p + 1.6 : p)), rnd, 2, 0.03));
    ctx.fill();
    // the lit lip on top: paper white
    const lip: number[] = [];
    const lipB: number[] = [];
    for (let x = a; x <= b; x += 3) {
      const t = bankTop(x) - 1.8;
      const taper = Math.min(1, (x - a) / 12, (b - x) / 12);
      lip.push(x, t + (1 - taper) * 6);
      lipB.unshift(x, bankTop(x) + (3.6 + 1.6 * Math.sin(x / 5.3)) * taper);
    }
    ctx.fillStyle = 'rgba(253,253,255,0.96)';
    tracePoly(ctx, deform([...lip, ...lipB], rnd, 2, 0.02));
    ctx.fill();
    void poly;
    // the pencil edge along the top, and the shadow's own broken line
    const e: number[] = [];
    for (let x = a; x <= b; x += 3) e.push(x, bankTop(x) - 1.6);
    dryBrush(ctx, e, 0.65, '#4d4f86', 0.3, rnd, 0.35);
    const f: number[] = [];
    for (let x = a; x <= b; x += 3) f.push(x, bankTop(x) + 4 + 1.5 * Math.sin(x / 5.3));
    dryBrush(ctx, f, 0.55, '#5a62a6', 0.2, rnd, 0.5);
    // a soft violet cast shadow at the base, in front
    const sh: number[] = [];
    for (let x = a; x <= b; x += 4) sh.push(x, bankTop(x) + 12 + 2 * Math.sin(x / 6));
    ctx.fillStyle = rgba('#8a90cc', 0.16);
    ribbon(ctx, sh, 5, 0.6);
  }
}

/**
 * The finish line on each hill: a checkered band painted across the snow through the ends of its three lanes, where
 * every ball breaks up and its flag goes in. Two rows of squares in a deep indigo wash (each laid twice, a little
 * deformed, so its edges soak and breathe), a faint shadow along its front edge as if pressed into the snow, a broken
 * pencil edge, and a small striped post with a checkered pennant at each end.
 */
export function paintFinish(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const INK = '#25305e';
  for (const id of STRATEGIES) {
    const L = LANES[id];
    const ends = DEBTS.map((d) => L[d].end).sort((a, b) => a.x - b.x);
    const a = ends[0]!;
    const b = ends[ends.length - 1]!;
    const slope = (b.y - a.y) / (b.x - a.x);
    // from just outside the outer lanes (clear of a ball's crumble), along the line through their ends
    const x0 = a.x - 46;
    const x1 = b.x + 42;
    const yAt = (x: number) => a.y + (x - a.x) * slope;
    const H = 7.6;
    const SQ = 9.5;
    // the pressed groove: a cool shadow along the band's front, a lit lip above it
    const front: number[] = [];
    for (let x = x0; x <= x1; x += 4) front.push(x, yAt(x) + H / 2 + 1.2);
    ctx.fillStyle = rgba('#7c84c4', 0.22);
    ribbon(ctx, front, 2.6, 0.5);
    const lipTop: number[] = [];
    for (let x = x0; x <= x1; x += 4) lipTop.push(x, yAt(x) - H / 2 - 1.1);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ribbon(ctx, lipTop, 1.6, 0.5);
    // the checks: two rows, alternating, nearer squares a hair larger
    const n = Math.round((x1 - x0) / SQ);
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      for (let row = 0; row < 2; row++) {
        if ((i + row) % 2 === 1) continue;
        const xa = x0 + i * w;
        const xb = xa + w;
        const ya = (x: number) => yAt(x) - H / 2 + row * (H / 2);
        const poly = [xa, ya(xa), xb, ya(xb), xb, ya(xb) + H / 2, xa, ya(xa) + H / 2];
        ctx.fillStyle = rgba(INK, 0.42);
        for (let k = 0; k < 2; k++) {
          tracePoly(ctx, deform(poly, rnd, 2, 0.05));
          ctx.fill();
        }
      }
    }
    // the band's edges: broken pencil
    const top: number[] = [];
    const bot: number[] = [];
    for (let x = x0; x <= x1; x += 3) {
      top.push(x, yAt(x) - H / 2);
      bot.push(x, yAt(x) + H / 2);
    }
    dryBrush(ctx, top, 0.6, INK, 0.5, rnd, 0.25);
    dryBrush(ctx, bot, 0.7, INK, 0.55, rnd, 0.2);
    // a post at each end, with a little checkered pennant flying from it
    for (const [px, dir] of [[x0 - 2, -1], [x1 + 2, 1]] as const) {
      const py = yAt(px);
      const s = depthScale(py);
      const ph = 26 * s;
      ctx.fillStyle = rgba('#8a90cc', 0.25);
      ctx.beginPath();
      ctx.ellipse(px + 3 * s, py + 1, 5 * s, 1.4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // the pole: white and indigo bands
      const bands = 6;
      for (let k = 0; k < bands; k++) {
        ctx.fillStyle = k % 2 ? 'rgba(250,250,253,0.98)' : rgba(INK, 0.9);
        ctx.fillRect(px - 0.9 * s, py - ph + (k * ph) / bands, 1.8 * s, ph / bands + 0.2);
      }
      ctx.strokeStyle = rgba(INK, 0.7);
      ctx.lineWidth = 0.35;
      ctx.strokeRect(px - 0.9 * s, py - ph, 1.8 * s, ph);
      // the pennant: a little checkered flag, waving outward from the line
      const fx = px + dir * 0.9 * s;
      const fy = py - ph + 1;
      const fw = 9 * s;
      const fh = 6 * s;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx + dir * fw * 0.5, fy - 1 * s, fx + dir * fw, fy + 0.6 * s);
      ctx.lineTo(fx + dir * fw, fy + fh + 0.6 * s);
      ctx.quadraticCurveTo(fx + dir * fw * 0.5, fy + fh - 1 * s, fx, fy + fh);
      ctx.closePath();
      ctx.fillStyle = 'rgba(252,252,255,0.97)';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = rgba(INK, 0.85);
      const c = fh / 2;
      for (let i = 0; i * c < fw + 1; i++) {
        for (let r = 0; r < 2; r++) {
          if ((i + r) % 2) continue;
          ctx.fillRect(fx + dir * i * c - (dir < 0 ? c : 0), fy - 1.5 * s + r * c + (i * 0.4 * s) / 3, c, c);
        }
      }
      ctx.restore();
      ctx.strokeStyle = rgba(INK, 0.6);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx + dir * fw * 0.5, fy - 1 * s, fx + dir * fw, fy + 0.6 * s);
      ctx.lineTo(fx + dir * fw, fy + fh + 0.6 * s);
      ctx.quadraticCurveTo(fx + dir * fw * 0.5, fy + fh - 1 * s, fx, fy + fh);
      ctx.stroke();
    }
  }
}

/** a rock poking through the snow: a grey-violet wash, a snow cap, a cast shadow to the lower right */
function paintRock(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, r: number): void {
  const n = 9;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const rr = r * rnd.range(0.82, 1.12);
    const s = Math.sin(t);
    pts.push(x + Math.cos(t) * rr * 1.25, y + (s < 0 ? s * rr * 0.9 : s * rr * 0.28));
  }
  // cast shadow
  ctx.fillStyle = rgba('#6a6eb4', 0.3);
  ctx.beginPath();
  ctx.ellipse(x + r * 0.9, y + r * 0.15, r * 1.5, r * 0.34, 0.08, 0, Math.PI * 2);
  ctx.fill();
  const base = rnd.pick(['#837e96', '#8a8497', '#7a7890', '#8f8795']);
  ctx.fillStyle = rgba(base, 0.82);
  tracePoly(ctx, deform(pts, rnd, 2, 0.05));
  ctx.fill();
  ctx.fillStyle = rgba(mix(base, '#2e2a48', 0.5), 0.5);
  ctx.beginPath();
  ctx.ellipse(x + r * 0.55, y - r * 0.2, r * 0.7, r * 0.55, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#d9d2d6', 0.4);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.5, y - r * 0.5, r * 0.5, r * 0.3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // the snow cap on top, with a violet underside
  const capPts: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = Math.PI + (i / 8) * Math.PI;
    capPts.push(x + Math.cos(t) * r * 1.3, y - r * 0.12 + Math.sin(t) * r * rnd.range(1.0, 1.3));
  }
  for (let i = 8; i >= 0; i--) capPts.push(x + Math.cos(Math.PI + (i / 8) * Math.PI) * r * 1.2, y - r * 0.5 + Math.sin((i / 8) * 9) * r * 0.22 + r * 0.14);
  ctx.fillStyle = rgba('#8a8ccc', 0.4);
  tracePoly(ctx, deform(capPts.map((p, i) => (i % 2 ? p + 0.9 : p)), rnd, 2, 0.05));
  ctx.fill();
  ctx.fillStyle = 'rgba(253,253,255,0.96)';
  tracePoly(ctx, deform(capPts, rnd, 2, 0.045));
  ctx.fill();
  ctx.strokeStyle = rgba('#3c3a58', 0.5);
  ctx.lineWidth = Math.max(0.3, r * 0.07);
  ctx.setLineDash([r * 1.1, r * 0.35, r * 0.6, r * 0.3]);
  tracePoly(ctx, pts);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** a clump of dry stalks standing out of the snow, a little mound at its base */
function paintStalks(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  ctx.fillStyle = rgba('#8a8ccc', 0.26);
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 0.8, h * 0.5, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  const pal = ['#c2ad6c', '#a38c52', '#d2c08c', '#8d7a48', '#b9a468'];
  grassTuft(ctx, x, y, h, rnd, 1, pal);
  if (h > 6) grassTuft(ctx, x + rnd.range(-2, 2), y + 0.3, h * 0.75, rnd, 1, pal);
  // a few seed heads and an ink thread
  ctx.strokeStyle = rgba('#4a3c28', 0.4);
  ctx.lineWidth = 0.3;
  for (let i = 0; i < 2; i++) {
    const t = rnd.range(-0.5, 0.5);
    ctx.beginPath();
    ctx.moveTo(x + t, y);
    ctx.quadraticCurveTo(x + t * h * 0.4, y - h * 0.6, x + t * h * 0.8, y - h * rnd.range(0.85, 1.1));
    ctx.stroke();
  }
  // the snow heaped about the foot
  ctx.fillStyle = 'rgba(253,253,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(x - 0.4, y + 0.3, h * 0.42, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#8a8ccc', 0.3);
  ctx.beginPath();
  ctx.ellipse(x + h * 0.15, y + h * 0.1, h * 0.3, h * 0.05, 0, 0, Math.PI);
  ctx.fill();
}

/** rocks and dry grass: scattered over the hillsides (clear of the lanes), along the creek and the crest */
export function paintScatter(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const items: Array<{ y: number; draw: () => void }> = [];
  const ok = (x: number, y: number, pad: number) => y > crestLine(x) + 6 && (y < 592 || (y > 620 && y < v.ymax - 6)) && laneDistance(x, y) > pad && Math.abs(x - creekX(y)) > creekW(y) / 2 + 3;
  // rocks
  let placed = 0;
  const rockN = 34 + Math.max(0, Math.round((v.ymax - 640) / 12));
  for (let tries = 0; tries < 1600 && placed < rockN; tries++) {
    const x = rnd.range(v.xmin + 20, v.xmax - 20);
    const y = rnd.chance(0.8) ? rnd.range(318, 590) : rnd.range(622, Math.max(640, v.ymax - 8));
    if (!ok(x, y, 30)) continue;
    // not on the open back plain of the foreground: spread them
    placed++;
    const r = rnd.range(2.6, 6.8) * depthScale(y) * (1 + (y - 300) * 0.002);
    items.push({ y, draw: () => paintRock(ctx, rnd, x, y, r) });
    if (rnd.chance(0.6)) {
      const n2 = rnd.int(1, 3);
      for (let k = 0; k < n2; k++) {
        const x2 = x + rnd.range(-12, 12);
        const y2 = y + rnd.range(-3, 5);
        if (!ok(x2, y2, 26)) continue;
        const r2 = r * rnd.range(0.4, 0.75);
        items.push({ y: y2, draw: () => paintRock(ctx, rnd, x2, y2, r2) });
      }
    }
  }
  // dry grass stalks
  placed = 0;
  const stalkN = 90 + Math.max(0, Math.round((v.ymax - 640) / 6));
  for (let tries = 0; tries < 2600 && placed < stalkN; tries++) {
    const x = rnd.range(v.xmin + 10, v.xmax - 10);
    const y = rnd.range(310, Math.max(640, v.ymax - 4));
    const nearCreek = Math.abs(x - creekX(y)) < creekW(y) / 2 + 22 && Math.abs(x - creekX(y)) > creekW(y) / 2 + 2;
    if (y < crestLine(x) + 5 || (y < 602 && laneDistance(x, y) < 26) || Math.abs(x - creekX(y)) < creekW(y) / 2 + 2) continue;
    if (!nearCreek && !rnd.chance(0.35)) continue;
    placed++;
    const h = rnd.range(4.5, 11) * depthScale(y);
    items.push({ y, draw: () => paintStalks(ctx, rnd, x, y, h) });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

/** the paper's tooth over the snow (device-space pattern): peaks lift the wash, valleys collect pigment */
function paperGrain(ctx: CanvasRenderingContext2D, v: View, top: number): void {
  const m = ctx.getTransform();
  const t = paperTooth('#6a70b8', 192, 411);
  ctx.save();
  ctx.beginPath();
  const X: number[] = [];
  for (let x = v.xmin - 20; x <= v.xmax + 20; x += 10) X.push(x);
  ctx.moveTo(X[0]!, crestLine(X[0]!));
  for (const x of X) ctx.lineTo(x, crestLine(x));
  ctx.lineTo(v.xmax + 20, v.ymax + 10);
  ctx.lineTo(v.xmin - 20, v.ymax + 10);
  ctx.closePath();
  ctx.clip();
  applyTooth(ctx, t, v.xmin - 20, top, v.xmax - v.xmin + 40, v.ymax - top + 20, m.a * 0.55, 0.3, 0.12);
  ctx.restore();
}

/** a drift: a mound with a lit top, a shaded face and a cast shadow, seen from the front and lit from the left */
function paintDrift(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, L: number, t: number, ang: number): void {
  const n = 14;
  const ph = rnd.range(0, 6.28);
  const hAt = (u: number) => t * Math.pow(Math.sin(Math.PI * u), 0.75) * (0.82 + 0.18 * Math.sin(u * 7 + ph)) * (1 - 0.25 * u);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const lx = (u: number) => (u - 0.5) * L;
  // cast shadow on the ground, to the lower right
  const cast: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    cast.push(lx(u) + t * 0.5, 0.4);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    cast.push(lx(u) + t * 1.25 * (0.4 + u), t * 0.55 * Math.pow(Math.sin(Math.PI * u), 0.6) + 0.6);
  }
  ctx.fillStyle = rgba('#7f88c8', 0.1);
  for (let k = 0; k < 3; k++) {
    tracePoly(ctx, deform(cast, rnd, 2, 0.05));
    ctx.fill();
  }
  // the shaded face (below the crest), deeper toward the right
  const face: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    face.push(lx(u), -hAt(u) * 0.55);
  }
  for (let i = n; i >= 0; i--) face.push(lx(i / n) + 0.4, 0.5);
  ctx.fillStyle = rgba('#7c86c6', 0.22);
  for (let k = 0; k < 2; k++) {
    tracePoly(ctx, deform(face, rnd, 2, 0.04));
    ctx.fill();
  }
  const face2: number[] = [];
  for (let i = 5; i <= n; i++) face2.push(lx(i / n), -hAt(i / n) * 0.45);
  for (let i = n; i >= 5; i--) face2.push(lx(i / n) + 0.3, 0.3);
  ctx.fillStyle = rgba('#6a74bc', 0.2);
  tracePoly(ctx, deform(face2, rnd, 2, 0.05));
  ctx.fill();
  // the lit top: paper white
  const lit: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    lit.push(lx(u), -hAt(u) - 0.3);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    lit.push(lx(u), -hAt(u) * (0.5 + 0.1 * Math.sin(u * 9 + ph)));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  tracePoly(ctx, deform(lit, rnd, 2, 0.03));
  ctx.fill();
  // a broken pencil line at the turn from light to shade
  const pen: number[] = [];
  for (let i = 1; i < n; i++) pen.push(lx(i / n), -hAt(i / n) * 0.5);
  dryBrush(ctx, pen, 0.4, '#4d5594', 0.26, rnd, 0.45);
  ctx.restore();
}

/** drifts across the hillsides, small and pale far away, bigger and clearer near (clear of the lanes) */
function paintDrifts(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, top: number, sampleShade: (x: number, y: number) => number): void {
  const items: Array<{ y: number; draw: () => void }> = [];
  let placed = 0;
  for (let tries = 0; tries < 4000 && placed < 190; tries++) {
    const x = rnd.range(v.xmin, v.xmax);
    const y = 300 + Math.pow(rnd.next(), 0.8) * (v.ymax - 306);
    if (y < crestLine(x) + 8 || y > v.ymax - 4) continue;
    if (y < 604 && laneDistance(x, y) < 18) continue;
    if (Math.abs(x - creekX(y)) < creekW(y) / 2 + 6) continue;
    const dp = depthScale(y);
    const bulky = rnd.chance(0.4);
    const L = (bulky ? rnd.range(10, 34) : rnd.range(18, 80)) * dp;
    const t = L * (bulky ? rnd.range(0.1, 0.17) : rnd.range(0.045, 0.09));
    const s = sampleShade(x, y);
    // drifts gather in the shade and on the lee of the hills
    if (s > 0.15 && !rnd.chance(0.4)) continue;
    placed++;
    items.push({ y, draw: () => paintDrift(ctx, rnd, x, y, L, t, rnd.range(-0.1, 0.16)) });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  void top;
}
