/**
 * The frozen creek winding down the valley toward us (blue-grey ice laid in glazes, long dry-brush streaks that
 * follow the flow, hairline cracks, snow lying along its banks) and the small plank footbridge near the front.
 * Painted once into the world layer (world units).
 */
import { Rand, makeNoise2D } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { bloom } from '../../river/scene/paint';
import { dryBrush } from '../../vine/scene/cottageWash';
import { mix, ribbon } from '../../river/scene/boatInk';
import { BRIDGE_Y, CREEK_Y0, creekW, creekX } from './layout';
import type { View } from './mountains';

const WOB = makeNoise2D(2203);
const edgeL = (y: number) => creekX(y) - creekW(y) / 2 + (WOB(y / 13, 0.5) - 0.5) * Math.min(3, creekW(y) * 0.18);
const edgeR = (y: number) => creekX(y) + creekW(y) / 2 + (WOB(y / 11, 7.5) - 0.5) * Math.min(3, creekW(y) * 0.18);

export function paintCreek(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = CREEK_Y0;
  const y1 = v.ymax + 14;
  const ys: number[] = [];
  for (let y = y0; y <= y1; y += 4) ys.push(y);
  const left: number[] = [];
  const right: number[] = [];
  for (const y of ys) {
    left.push(edgeL(y), y);
    right.push(edgeR(y), y);
  }
  const outline: number[] = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) outline.push(right[i]!, right[i + 1]!);

  // ---- the snow lip along each bank, and the shadowed wall inside the left bank (the light is from the left)
  const lipL = left.map((p, i) => (i % 2 ? p : p - 1.3 - (i % 4) * 0.2));
  const lipR = right.map((p, i) => (i % 2 ? p : p + 1.3));
  ctx.fillStyle = rgba('#7f86c8', 0.28);
  ribbon(ctx, lipL.map((p, i) => (i % 2 ? p + 1.2 : p - 0.6)), 6, 0.3);
  ribbon(ctx, lipR.map((p, i) => (i % 2 ? p + 1.2 : p + 0.6)), 6, 0.3);

  // ---- the ice: a glaze graded from pale (sky in it, far) to deeper blue-grey (near)
  ctx.save();
  tracePoly(ctx, deform(outline, rnd, 1, 0.004));
  ctx.clip();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(226,234,246,0.95)');
  g.addColorStop(0.35, 'rgba(196,214,234,0.95)');
  g.addColorStop(1, 'rgba(158,188,220,0.96)');
  ctx.fillStyle = g;
  ctx.fillRect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
  // wet-in-wet blooms: deeper blue and violet-grey in the shade of the left bank, paler lifts toward the right
  for (let i = 0; i < 46; i++) {
    const y = rnd.range(y0 + 20, y1);
    const w = creekW(y);
    const u = rnd.range(-0.5, 0.5);
    const x = creekX(y) + u * w;
    const dark = u < 0 ? 0.28 : 0.16;
    bloom(ctx, x, y, rnd.range(0.2, 0.5) * w, rnd.range(2.5, 9), rnd.pick(['#6f93c0', '#7d8cc4', '#5d84b4', '#8aa4cc']), dark, rnd, 4);
  }
  for (let i = 0; i < 26; i++) {
    const y = rnd.range(y0 + 20, y1);
    const w = creekW(y);
    bloom(ctx, creekX(y) + rnd.range(-0.1, 0.5) * w, y, rnd.range(0.15, 0.4) * w, rnd.range(2, 6), rnd.pick(['#e9f0f8', '#f4f6fb', '#dce8f4']), 0.4, rnd, 3);
  }
  // long dry-brush streaks that follow the flow (offsets from the centre line)
  for (let i = 0; i < 90; i++) {
    const ya = rnd.range(y0 + 10, y1 - 10);
    const len = rnd.range(20, 90);
    const u = rnd.range(-0.46, 0.46);
    const pts: number[] = [];
    for (let k = 0; k <= 10; k++) {
      const y = ya + (k / 10) * len;
      pts.push(creekX(y) + u * creekW(y) + Math.sin(k * 0.8 + i) * 0.5, y);
    }
    const light = rnd.chance(0.55);
    dryBrush(ctx, pts, rnd.range(0.5, 1.6) * (0.5 + creekW(ya) / 40), light ? '#f4f8fd' : '#5d7fae', light ? 0.5 : 0.28, rnd, 0.4);
  }
  // hairline cracks, and frozen bubbles
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 20; i++) {
    const y = rnd.range(y0 + 80, y1 - 6);
    const w = creekW(y);
    let x = creekX(y) + rnd.range(-0.4, 0.4) * w;
    let yy = y;
    ctx.strokeStyle = rgba('#3f5380', rnd.range(0.25, 0.42));
    ctx.lineWidth = rnd.range(0.25, 0.45);
    ctx.beginPath();
    ctx.moveTo(x, yy);
    const n = rnd.int(3, 6);
    for (let k = 0; k < n; k++) {
      x += rnd.range(-0.35, 0.35) * w;
      yy += rnd.range(1.2, 3.8);
      ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x - 0.5, y);
    ctx.lineTo(x - 0.5 + 0.1, yy);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const y = rnd.range(y0 + 100, y1 - 4);
    const w = creekW(y);
    const x = creekX(y) + rnd.range(-0.42, 0.42) * w;
    ctx.strokeStyle = 'rgba(244,248,253,0.7)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, rnd.range(0.6, 1.6), rnd.range(0.35, 0.8), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // snow drifted on the ice: soft white lumps along the banks, a violet shade under each
  for (let i = 0; i < 38; i++) {
    const y = rnd.range(y0 + 60, y1 - 4);
    const w = creekW(y);
    const side = rnd.chance(0.5) ? -1 : 1;
    const x = creekX(y) + side * (w / 2 - rnd.range(0.5, 3));
    const r = rnd.range(1.5, 4.5) * (0.6 + w / 50);
    ctx.fillStyle = rgba('#8a90cc', 0.3);
    ctx.beginPath();
    ctx.ellipse(x + r * 0.12, y + r * 0.18, r * 1.1, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(253,253,255,0.93)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the shadowed wall inside the left bank and the lit one inside the right
  ctx.fillStyle = rgba('#5a64a8', 0.34);
  ribbon(ctx, left.map((p, i) => (i % 2 ? p : p + 1.3)), 2.6, 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ribbon(ctx, right.map((p, i) => (i % 2 ? p : p - 0.9)), 1.4, 0.2);
  ctx.restore();

  // ---- the banks: the lip of snow in paper white, the broken pencil lines along the edges
  ctx.fillStyle = 'rgba(253,253,255,0.95)';
  ribbon(ctx, lipL, 3.2, 0.3);
  ribbon(ctx, lipR, 3.2, 0.3);
  dryBrush(ctx, left.map((p, i) => (i % 2 ? p : p + 0.2)), 0.7, '#4d5694', 0.38, rnd, 0.3);
  dryBrush(ctx, right, 0.55, '#5a62a6', 0.26, rnd, 0.45);
  // a few reeds and dry stalks at the water's edge
  ctx.strokeStyle = rgba('#7d6a3c', 0.5);
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 40; i++) {
    const y = rnd.range(y0 + 90, y1 - 12);
    const side = rnd.chance(0.5) ? -1 : 1;
    const x = creekX(y) + side * (creekW(y) / 2 + rnd.range(1.5, 4));
    const hh = rnd.range(3, 7);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 0.8, y);
      ctx.quadraticCurveTo(x + k * 0.8 + rnd.range(-1, 1), y - hh * 0.6, x + k * 0.8 + rnd.range(-2, 2), y - hh * rnd.range(0.8, 1.1));
      ctx.stroke();
    }
  }
}

/** the footbridge: stringers over the ice, a deck of snow-capped planks, a rail on the far side, snow at its ends */
export function paintBridge(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const y = BRIDGE_Y;
  const cx = creekX(y);
  const half = creekW(y) / 2 + 12;
  const x0 = cx - half;
  const x1 = cx + half;
  const WOOD = ['#a98863', '#9a7a58', '#b39370', '#8e7050', '#a58560'];
  // its shadow on the ice and the snow
  ctx.fillStyle = rgba('#5a64a8', 0.34);
  ctx.beginPath();
  ctx.ellipse(cx + 3, y + 8.5, half * 0.95, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#4a5496', 0.2);
  ctx.beginPath();
  ctx.ellipse(cx + 3, y + 8.5, half * 0.7, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // the stringers (two logs under the deck, their ends bedded in snow)
  for (const [dy, th] of [[5.2, 3.2], [1.8, 2.6]] as const) {
    const pts: number[] = [];
    for (let i = 0; i <= 10; i++) pts.push(x0 - 4 + ((x1 - x0 + 8) * i) / 10, y + dy + Math.sin((i / 10) * Math.PI) * 0.9);
    ctx.fillStyle = rgba('#5b4636', 0.9);
    ribbon(ctx, pts, th, 0.15);
    ctx.fillStyle = rgba('#2d2220', 0.5);
    ribbon(ctx, pts.map((p, i) => (i % 2 ? p + th * 0.28 : p)), th * 0.5, 0.15);
    ctx.fillStyle = rgba('#a98863', 0.5);
    ribbon(ctx, pts.map((p, i) => (i % 2 ? p - th * 0.28 : p)), th * 0.3, 0.15);
  }
  // the deck: planks seen from above and a little from the front
  const n = 10;
  const pw = (x1 - x0) / n;
  const sag = (x: number) => Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * -0.8;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * pw + 0.3;
    const xb = xa + pw - 0.7;
    const ya = y - 5 + sag(xa);
    const yb = y - 5 + sag(xb);
    const col = WOOD[i % WOOD.length]!;
    const lit = 1 - i / n;
    const poly = [xa, ya, xb, yb, xb + 0.5, yb + 7.4, xa + 0.5, ya + 7.4];
    ctx.fillStyle = rgba(col, 0.9);
    tracePoly(ctx, deform(poly, rnd, 1, 0.03));
    ctx.fill();
    ctx.fillStyle = rgba(mix(col, '#2a2030', 0.5), 0.2 + 0.25 * (1 - lit));
    tracePoly(ctx, [xa + (xb - xa) * 0.55, ya, xb, yb, xb + 0.5, yb + 7.4, xa + (xb - xa) * 0.55 + 0.5, ya + 7.4]);
    ctx.fill();
    ctx.strokeStyle = rgba('#2a1e1a', 0.55);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(xa, ya + 7.4);
    ctx.lineTo(xb + 0.5, yb + 7.4);
    ctx.moveTo(xb, yb);
    ctx.lineTo(xb + 0.5, yb + 7.4);
    ctx.stroke();
    // grain
    ctx.strokeStyle = rgba('#3e2c20', 0.2);
    ctx.lineWidth = 0.25;
    for (let k = 0; k < 2; k++) {
      const gx = xa + (xb - xa) * rnd.range(0.2, 0.8);
      ctx.beginPath();
      ctx.moveTo(gx, ya + 1);
      ctx.lineTo(gx + 0.2, ya + 6.5);
      ctx.stroke();
    }
    // snow lying on the far part of the plank, thicker at the ends
    const thick = (i < 2 || i > n - 3 ? 3.1 : 1.9) * rnd.range(0.7, 1.15);
    ctx.fillStyle = rgba('#8a90cc', 0.34);
    ctx.beginPath();
    ctx.ellipse((xa + xb) / 2 + 0.3, ya + thick * 0.9 + 0.5, pw * 0.5, thick * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(253,253,255,0.96)';
    ctx.beginPath();
    ctx.ellipse((xa + xb) / 2, ya + thick * 0.5, pw * 0.52, thick * 0.6, 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  // the rail along the far side: posts and two rails, snow along the top one
  const posts = [x0 + 2, x0 + (x1 - x0) * 0.34, x0 + (x1 - x0) * 0.67, x1 - 2];
  const topAt = (x: number) => y - 5 + sag(x) - 12;
  for (const px of posts) {
    const base = y - 5 + sag(px);
    ctx.fillStyle = rgba('#6c533f', 0.9);
    tracePoly(ctx, [px - 0.9, base + 1, px + 0.9, base + 1, px + 0.8, topAt(px), px - 0.8, topAt(px)]);
    ctx.fill();
    ctx.fillStyle = rgba('#2d2220', 0.45);
    tracePoly(ctx, [px + 0.1, base + 1, px + 0.9, base + 1, px + 0.8, topAt(px), px + 0.2, topAt(px)]);
    ctx.fill();
    ctx.fillStyle = 'rgba(253,253,255,0.97)';
    ctx.beginPath();
    ctx.ellipse(px, topAt(px) - 0.4, 1.7, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#8a90cc', 0.4);
    ctx.beginPath();
    ctx.ellipse(px + 0.4, topAt(px) + 0.4, 1.3, 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const dy of [0, 4.6]) {
    const pts: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = posts[0]! + ((posts[3]! - posts[0]!) * i) / 12;
      pts.push(x, topAt(x) + 1.2 + dy + Math.sin((i / 12) * Math.PI * 3) * 0.25);
    }
    ctx.fillStyle = rgba('#5e4938', 0.92);
    ribbon(ctx, pts, 1.3, 0.1);
    ctx.fillStyle = rgba('#241a18', 0.4);
    ribbon(ctx, pts.map((p, i) => (i % 2 ? p + 0.4 : p)), 0.5, 0.1);
    if (dy === 0) {
      ctx.fillStyle = rgba('#8a90cc', 0.4);
      ribbon(ctx, pts.map((p, i) => (i % 2 ? p - 0.1 : p)), 2.3, 0.4);
      ctx.fillStyle = 'rgba(253,253,255,0.97)';
      ribbon(ctx, pts.map((p, i) => (i % 2 ? p - 0.9 : p)), 2.5, 0.4);
    }
  }
  // snow heaped at both ends where the planks meet the banks
  for (const ex of [x0 - 3, x1 + 3]) {
    ctx.fillStyle = rgba('#8a90cc', 0.34);
    ctx.beginPath();
    ctx.ellipse(ex + 1, y + 6, 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(253,253,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(ex, y + 4.6, 6.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
