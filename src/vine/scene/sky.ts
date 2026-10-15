/**
 * Paper and the clear autumn sky (never zoomed with the camera): a graded cerulean wash, deeper at the top and
 * warmer and paler toward the horizon, with a few broad blooms, soft brush streaks and granulation. No clouds.
 * The sun sits at the upper left and is the light source of the whole picture: a pale warm disk lifted out of
 * the wash, with a soft painted glow and a faint halo. A rare skein of geese is drawn per frame.
 */
import { Rand } from '../../scene/prng';
import { makeCanvas, paintPaperBackdrop } from '../../scene/watercolor';
import { WORLD, type Camera } from './geom';

/** the sun in world units */
export const SUN = { x: 150, y: 90, r: 24 } as const;

export function paintPaperAndSky(cam: Camera, tile: CanvasImageSource): HTMLCanvasElement {
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const d = cam.dpr;
  const paper = makeCanvas(Wd, Hd);
  const ctx = paper.getContext('2d')!;
  paintPaperBackdrop(ctx, Wd, Hd, tile, d);
  const rnd = new Rand(8801);
  const hy = Math.min(Hd, (cam.oy + (WORLD.horizon + 6) * cam.s) * d);
  const sx = (cam.ox + SUN.x * cam.s) * d;
  const sy = (cam.oy + SUN.y * cam.s) * d;
  const sr = SUN.r * cam.s * d;
  ctx.save();
  // 1. the graded wash: deep cerulean up high, paler and warmer toward the horizon
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, 'rgba(30,118,214,0.82)');
  g.addColorStop(0.3, 'rgba(56,140,220,0.66)');
  g.addColorStop(0.62, 'rgba(120,184,228,0.44)');
  g.addColorStop(0.86, 'rgba(206,214,214,0.3)');
  g.addColorStop(1, 'rgba(244,222,184,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, Wd, hy);
  // 2. variegation: broad blooms of slightly different blues (low resolution, scaled up)
  const q = 4;
  const w = Math.ceil(Wd / q);
  const h = Math.ceil(hy / q);
  if (w > 0 && h > 0) {
    const v = makeCanvas(w, h);
    const vc = v.getContext('2d')!;
    const tints = ['rgba(60,126,200,0.16)', 'rgba(110,165,214,0.13)', 'rgba(124,150,208,0.1)', 'rgba(150,196,226,0.12)'];
    for (let i = 0; i < 11; i++) {
      const x = rnd.range(0, w);
      const y = rnd.range(0, h * 0.8);
      const r = rnd.range(0.12, 0.32) * w;
      const b = vc.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, tints[i % 4]!);
      b.addColorStop(1, 'rgba(255,255,255,0)');
      vc.fillStyle = b;
      vc.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v, 0, 0, Wd, hy);
  }
  // 3. broad horizontal brush streaks, as a wash laid in strokes (ends feathered)
  for (let i = 0; i < 16; i++) {
    const y = rnd.range(0.02, 0.82) * hy;
    const sh = rnd.range(14, 44) * d;
    const x0 = rnd.range(-0.2, 0.5) * Wd;
    const sw = rnd.range(0.35, 0.9) * Wd;
    const st = makeCanvas(Math.max(2, Math.round(sw / 8)), Math.max(2, Math.round((sh * 2) / 8)));
    const sc = st.getContext('2d')!;
    const sg = sc.createLinearGradient(0, 0, 0, st.height);
    const a = rnd.range(0.05, 0.1);
    sg.addColorStop(0, 'rgba(70,140,208,0)');
    sg.addColorStop(0.5, `rgba(70,140,208,${a})`);
    sg.addColorStop(1, 'rgba(70,140,208,0)');
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
  // 4. a warmer wash about the sun (the sky nearest the light is yellower and paler)
  const warm = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 9);
  warm.addColorStop(0, 'rgba(255,238,190,0.55)');
  warm.addColorStop(0.5, 'rgba(255,240,206,0.26)');
  warm.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, Wd, hy);
  // 5. granulation, denser where the wash is richer
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 1800; i++) {
    const y = Math.pow(rnd.next(), 1.6) * hy * 0.92;
    ctx.fillStyle = `rgba(60,112,170,${rnd.range(0.04, 0.11)})`;
    ctx.fillRect(rnd.range(0, Wd), y, d, d);
  }
  ctx.globalCompositeOperation = 'source-over';
  // 6. the sun: a lifted pale disk, a soft glow, a faint halo ring
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.8, sx, sy, sr * 5.2);
  glow.addColorStop(0, 'rgba(255,244,206,0.78)');
  glow.addColorStop(0.35, 'rgba(255,240,200,0.4)');
  glow.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - sr * 6, sy - sr * 6, sr * 12, sr * 12);
  // a faint, very soft halo (no hard ring)
  const halo = ctx.createRadialGradient(sx, sy, sr * 1.8, sx, sy, sr * 4.2);
  halo.addColorStop(0, 'rgba(255,246,214,0)');
  halo.addColorStop(0.45, 'rgba(255,246,214,0.13)');
  halo.addColorStop(1, 'rgba(255,246,214,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sx - sr * 5, sy - sr * 5, sr * 10, sr * 10);
  // the disk: warm cream, slightly uneven like a wash that was lifted with a damp brush
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(255,246,214,${0.5 + i * 0.1})`;
    ctx.beginPath();
    const pts = 18;
    for (let k = 0; k <= pts; k++) {
      const a = (k / pts) * Math.PI * 2;
      const rr = sr * (1 - i * 0.045) * (1 + 0.025 * Math.sin(a * 3 + i) + rnd.range(-0.012, 0.012));
      const px = sx + Math.cos(a) * rr;
      const py = sy + Math.sin(a) * rr;
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,252,236,0.7)';
  ctx.beginPath();
  ctx.arc(sx - sr * 0.12, sy - sr * 0.1, sr * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return paper;
}

/** a rare skein of geese crossing high up, in screen space (the sky does not zoom); a pure function of the clock */
export function drawGeese(ctx: CanvasRenderingContext2D, t: number, cam: Camera): void {
  const period = 67;
  const dur = 19;
  const ph = (t + 23) % period;
  if (ph > dur) return;
  const k = ph / dur;
  const s = cam.s;
  const fade = Math.min(1, k * 8) * Math.min(1, (1 - k) * 8);
  const x0 = -80 + (cam.cssW + 160) * k;
  const y0 = cam.oy + (74 - 22 * k) * s;
  ctx.save();
  ctx.globalAlpha = 0.62 * fade;
  ctx.strokeStyle = '#3F4A66';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const rank = Math.ceil(i / 2);
    const side = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
    const gx = x0 - rank * 17 * s;
    const gy = y0 + side * rank * 9 * s + Math.sin(t * 0.7 + i) * 1.2 * s;
    const flap = Math.sin(t * 5.2 + i * 0.9);
    const wing = (7.4 + 0.5 * flap) * s;
    const lift = flap * 4.2 * s;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(gx - wing, gy - 1.5 * s - lift * 0.8);
    ctx.quadraticCurveTo(gx - wing * 0.45, gy - 3.4 * s - lift, gx, gy);
    ctx.quadraticCurveTo(gx + wing * 0.45, gy - 3.4 * s - lift, gx + wing, gy - 1.5 * s - lift * 0.8);
    ctx.stroke();
    ctx.lineWidth = 2.1 * s;
    ctx.beginPath();
    ctx.moveTo(gx - 2.6 * s, gy + 0.3 * s);
    ctx.lineTo(gx + 3.6 * s, gy - 0.3 * s);
    ctx.stroke();
  }
  ctx.restore();
}
