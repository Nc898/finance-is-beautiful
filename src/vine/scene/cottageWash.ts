/**
 * Watercolor helpers for the cottages, in the way a painter handles a building: big wet washes first, then detail
 * only where the eye goes (the corners, round the door and windows, the foot of the wall, the shaded side), lost
 * in the sunlit middle where a stone is at most a pale glaze or a single pooled stroke under its edge.
 *
 * - detailAt: how much detail a spot of the wall or roof gets (0 lost in the light .. 1 fully stated)
 * - wcStone: a stone as one transparent glaze with its pigment pooled along the lower and shaded edges, the
 *   light lifting off its top, and the dark joint under it; no outline, ink only now and then where detailed
 * - backrun: a wet bloom with the darker rim pigment leaves where a wash dries (the "cauliflower" edge)
 * - dryBrush: a broken stroke dragged over the paper's tooth (bristle streaks that skip)
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { GROUND_Y } from './geom';
import { lump, rrPoly, type Paint } from './cottagePaint';

export const SHADE = '#4A3A52';
export const LIGHT = '#FFF6E0';

const fields = new Map<string, (x: number, y: number) => number>();

/**
 * How much detail a spot gets: high at the wall's corners and ends of the roof, round the door and windows, along
 * the foot of the wall and under the eave, and on the shaded right; low in the sunlit upper middle. Broken up by
 * noise so the edge between stated and lost wanders.
 */
export function detailAt(P: Paint, roof = false): (x: number, y: number) => number {
  const key = P.id + (roof ? 'r' : 'w');
  const hit = fields.get(key);
  if (hit) return hit;
  const c = P.c;
  const nz = makeNoise2D(P.id === 'minimum' ? 4401 : 4409);
  const near = (x: number, y: number, r: { x0: number; x1: number; y0: number; y1: number }, pad: number): number => {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dy = Math.max(r.y0 - y, 0, y - r.y1);
    return clamp(1 - Math.hypot(dx, dy) / pad, 0, 1);
  };
  const W = c.wall.x1 - c.wall.x0;
  const f = (x: number, y: number): number => {
    const u = (x - c.wall.x0) / W;
    let d: number;
    if (roof) {
      // the roof: stated at its lower edge, along the hips and toward the shaded right; lost in the sun up high
      const low = clamp((y - 250) / 80, 0, 1);
      const ends = clamp(1 - Math.min(u + 0.05, 1.05 - u) / 0.22, 0, 1);
      d = 0.18 + 0.5 * low + 0.35 * ends + 0.25 * clamp((u - 0.45) / 0.55, 0, 1);
    } else {
      const corner = clamp(1 - Math.min(x - c.wall.x0, c.wall.x1 - x) / 46, 0, 1);
      let open = near(x, y, c.door, 30);
      for (const w of c.windows) open = Math.max(open, near(x, y, w, 26));
      const foot = clamp((y - (GROUND_Y - 40)) / 40, 0, 1);
      const eave = clamp(1 - (y - 336) / 26, 0, 1);
      const shade = clamp((u - 0.55) / 0.45, 0, 1);
      d = 0.32 + 0.7 * corner + 0.6 * open + 0.5 * foot + 0.35 * eave + 0.3 * shade;
    }
    d += (nz(x * 0.021, y * 0.03) - 0.5) * 0.7;
    return clamp(d, 0, 1);
  };
  fields.set(key, f);
  return f;
}

/** a wet bloom with a darker dried rim (a backrun): paler inside, the pigment pushed out to its edge */
export function backrun(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, col: string, a: number, rnd: Rand): void {
  const base = lump(cx, cy, rx, ry, rnd, 16, 0.32);
  const p = deform(base, rnd, 3, 0.09);
  ctx.fillStyle = rgba(col, a * 0.45);
  tracePoly(ctx, p);
  ctx.fill();
  // the rim: a thin ragged line of denser pigment just inside the edge
  ctx.strokeStyle = rgba(mix(col, SHADE, 0.35), a * 0.3);
  ctx.lineWidth = rnd.range(0.5, 0.9);
  tracePoly(ctx, deform(p.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * 0.97 : cy + (v - cy) * 0.97)), rnd, 2, 0.04));
  ctx.stroke();
}

/** a dry-brush stroke along a path: a thin body that breaks up, with bristle streaks that skip over the tooth */
export function dryBrush(ctx: CanvasRenderingContext2D, pts: number[], w: number, col: string, a: number, rnd: Rand, skip = 0.35): void {
  const n = pts.length / 2;
  let i = 0;
  while (i < n - 1) {
    const run = Math.max(3, Math.round(rnd.range(4, 12)));
    const j = Math.min(n - 1, i + run);
    if (!rnd.chance(skip)) {
      const seg: number[] = [];
      for (let k = i; k <= j; k++) seg.push(pts[2 * k]! + rnd.range(-0.15, 0.15), pts[2 * k + 1]! + rnd.range(-0.2, 0.2));
      ctx.fillStyle = rgba(col, a * rnd.range(0.55, 1.05));
      ribbon(ctx, seg, w * rnd.range(0.6, 1.2), 0.9);
      // a second bristle just off the stroke, shorter
      if (rnd.chance(0.5)) {
        const off = rnd.range(-1, 1) * w;
        ctx.fillStyle = rgba(col, a * rnd.range(0.3, 0.6));
        ribbon(ctx, seg.map((v, q) => (q % 2 === 1 ? v + off : v)), w * 0.45, 0.95);
      }
    }
    i = j + (rnd.chance(0.3) ? 1 : 0);
  }
}

export interface WcStoneOpts {
  /** 0 lost .. 1 fully stated */
  vis: number;
  dressed?: boolean;
  round?: number;
  /** extra light (quoins and lintels catch more) */
  lit?: number;
}

/**
 * One stone as a watercolor glaze. How much of it is stated depends on `vis`: a lost stone is a faint tint with a
 * single pooled stroke under its lower edge (the eye fills in the rest); a stated one has its glaze, the pigment
 * pooled along its lower and right edges, the light lifted off its top and a dark joint under it.
 */
export function wcStone(P: Paint, x: number, y: number, w: number, h: number, base: string, o: WcStoneOpts): void {
  const { ctx, rnd } = P;
  const v = clamp(o.vis, 0, 1);
  if (w < 2.4 || h < 2.4) return;
  const dressed = o.dressed === true;
  const r = o.round ?? Math.min(w, h) * (dressed ? 0.12 : 0.3);
  const poly = deform(rrPoly(x, y, w, h, r, rnd, dressed ? 0.5 : 1.4), rnd, 3, dressed ? 0.022 : 0.06);
  const dk = mix(base, SHADE, 0.62);
  // the joint under the stone and down its shaded side: where the eye reads the stone's edge from
  const jointA = 0.16 + 0.36 * v;
  ctx.fillStyle = rgba('#3E2E30', jointA);
  ribbon(ctx, [x + r * 0.6, y + h + 0.5, x + w * 0.5, y + h + 0.75 + rnd.range(-0.2, 0.2), x + w - r * 0.4, y + h + 0.45], 0.7 + 0.5 * v, 0.85);
  if (v > 0.35) ribbon(ctx, [x + w + 0.45, y + h * 0.25, x + w + 0.6, y + h * 0.6, x + w + 0.4, y + h], 0.55 + 0.3 * v, 0.85);
  if (v < 0.12) return;
  // the glaze: transparent, a little uneven (two deformed passes)
  const ga = 0.3 + 0.55 * v;
  ctx.fillStyle = rgba(base, ga * 0.7);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(mix(base, rnd.pick(['#F2E2C0', '#9A9088', '#C9A276', '#AEB2AE', '#C49A7A', '#B8A06A']), 0.55), ga * 0.4);
  tracePoly(ctx, deform(poly, rnd, 1, 0.07));
  ctx.fill();
  // the wet edge: a thin rim of denser pigment where the glaze dried (stronger where the stone is stated)
  ctx.strokeStyle = rgba(mix(base, SHADE, 0.45), 0.08 + 0.22 * v);
  ctx.lineWidth = dressed ? 0.45 : 0.55;
  tracePoly(ctx, poly);
  ctx.stroke();
  // the pigment pools where the wash dried: along the lower edge and the shaded right
  const g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h * 1.1);
  g.addColorStop(0, rgba(LIGHT, 0.16 * v + (o.lit ?? 0) * 0.25));
  g.addColorStop(0.5, rgba(LIGHT, 0));
  g.addColorStop(1, rgba(dk, 0.32 * v));
  ctx.fillStyle = g;
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(dk, 0.2 + 0.3 * v);
  ribbon(ctx, [x + r, y + h - 0.6, x + w * 0.5, y + h - 0.45, x + w - r * 0.8, y + h - 0.7], 0.55 + 0.35 * v, 0.9);
  // the light lifting off the top edge (paper showing)
  if (v > 0.3 && rnd.chance(0.7)) {
    ctx.fillStyle = rgba(LIGHT, 0.25 + 0.3 * v + (o.lit ?? 0) * 0.2);
    ribbon(ctx, [x + r * 0.8, y + 0.8, x + w * rnd.range(0.35, 0.6), y + 0.6, x + w * rnd.range(0.65, 0.9), y + 0.9], 0.5, 0.9);
  }
  // a few grains of settled pigment where detailed
  if (v > 0.45) {
    const ns = Math.round(w * h * 0.05 * v);
    for (let i = 0; i < ns; i++) {
      ctx.fillStyle = rnd.chance(0.35) ? 'rgba(251,246,234,0.3)' : rgba(dk, 0.26);
      ctx.fillRect(x + r * 0.5 + rnd.next() * (w - r), y + r * 0.5 + rnd.next() * (h - r), rnd.range(0.3, 0.7), rnd.range(0.2, 0.45));
    }
  }
}
