/**
 * The autumn dress of Time to Grow's trees. The tree skeleton, crown model and painter are the ones the other
 * demos use (src/scene/treePainter.ts); only the foliage sprites are swapped for autumn ones. Time to Grow
 * draws its crowns from six sprite kinds (lit, mid, shade, back, gold, coral) chosen by where a clump sits
 * against the light, so a palette here is simply "what colour each of those six kinds is in autumn": pale
 * lit gold at the upper left, amber and orange in the middle, rust and crimson in the shade, dark umber
 * behind, with a few bright gold and scarlet accents and a little green left in.
 */
import { Rand, clamp } from '../../scene/prng';
import { almond, deform, makeCanvas, rgba, tracePoly, xform } from '../../scene/watercolor';
import { SPRITE_KINDS, type SpriteKind } from '../../scene/watercolor';
import type { Sprites, Spr } from '../../scene/sprites';
import { grain, type FoliagePal } from './art';

/** the foliage palettes (one clump kind each) */
const pal = (base: string, light: string, mid: string, deep: string, edge: string, dl: [string, string, string], dm: [string, string, string], dd: [string, string, string], baseA = 0.2): FoliagePal => ({
  base,
  baseA,
  mid,
  deep,
  light,
  dabs: [dl, dm, dd],
  edge,
});

/** a crown's six kinds, each a list of palettes the pool cycles through */
export type TreeKit = Record<SpriteKind, FoliagePal[]>;

const MAPLE: TreeKit = {
  lit: [
    pal('#F2AE46', '#FCE08C', '#E4802C', '#A8472A', '#8A4424', ['#FCE08C', '#F8CC66', '#FDEBAA'], ['#F0A03A', '#E88E30', '#F4B456'], ['#C4602C', '#B24E28', '#D06C34']),
    pal('#F4BC4A', '#FDEBA0', '#E88E30', '#B2562A', '#8A4424', ['#FDEBA0', '#FADA72', '#FEF1B8'], ['#F2A83C', '#EA9632', '#F6BA58'], ['#C8662E', '#B65430', '#D27438']),
  ],
  mid: [
    pal('#E4782E', '#F6B274', '#C95C28', '#8A3022', '#6E3020', ['#F6B274', '#F0A05C', '#F9C48C'], ['#E27A30', '#D86C28', '#EC8C40'], ['#A84A28', '#943E24', '#B85A30']),
    pal('#E8883A', '#F8BE80', '#CE6428', '#923424', '#74381E', ['#F8BE80', '#F2AC66', '#FBCE98'], ['#E88636', '#DC762C', '#F09A48'], ['#AE5028', '#9A4224', '#BE6030']),
    pal('#D9622E', '#EE9A64', '#B84A28', '#7C2A26', '#64281E', ['#EE9A64', '#E68850', '#F2AC78'], ['#D86430', '#C85A2A', '#E27440'], ['#9A3C28', '#863022', '#AA4A2E']),
  ],
  shade: [
    pal('#C85A34', '#EA946C', '#A63E2C', '#6A2428', '#58201E', ['#EA946C', '#DE8058', '#F0A482'], ['#C85634', '#B84C30', '#D46A42'], ['#8A3230', '#782C2A', '#9A3E36']),
    pal('#CE6238', '#EE9C70', '#AC442C', '#702A28', '#5C241E', ['#EE9C70', '#E48A5E', '#F2AC88'], ['#CE6038', '#BE5232', '#D87246'], ['#8E342C', '#7C2E28', '#9E4034']),
  ],
  back: [
    pal('#9E4630', '#C87850', '#7A302A', '#481E26', '#3A1A20', ['#C87850', '#B66848', '#D68A62'], ['#9E4630', '#8E3C2C', '#AC5238'], ['#582228', '#4C1E24', '#66302E']),
    pal('#7A3A2E', '#A86448', '#5E2A2A', '#361A22', '#2E141C', ['#A86448', '#98583E', '#B8745A'], ['#7C382C', '#6C3028', '#8A4434'], ['#44202A', '#3A1C24', '#502830']),
  ],
  gold: [pal('#F6C843', '#FFF0A2', '#EAA02E', '#B6602A', '#8C4A22', ['#FFF0A2', '#FCE070', '#FFF6BC'], ['#F4BA3E', '#EEAA34', '#F8CA5A'], ['#C87A2E', '#B66A2A', '#D68A36'])],
  coral: [pal('#D83A30', '#F4907A', '#B02A30', '#6C1C2E', '#561A28', ['#F4907A', '#EC7862', '#F8A890'], ['#D63E34', '#C63430', '#E05444'], ['#8A2630', '#781E2E', '#982E36'])],
};

const GOLD: TreeKit = {
  lit: [
    pal('#F4D05A', '#FFF2A8', '#E8AE3A', '#B8782E', '#8C5A26', ['#FFF2A8', '#FCE478', '#FFF7C0'], ['#F2C048', '#EAB03E', '#F6CE62'], ['#C88A32', '#B67A2E', '#D69A3C']),
    pal('#F6D862', '#FFF6B4', '#EEB840', '#C08430', '#946028', ['#FFF6B4', '#FDEA82', '#FFFAC8'], ['#F4C84E', '#ECB844', '#F8D668'], ['#CC9236', '#BA8232', '#DAA240']),
  ],
  mid: [
    pal('#EEBC46', '#FADE86', '#DC9A34', '#A8662A', '#80502A', ['#FADE86', '#F6CE62', '#FCE8A0'], ['#EBB03C', '#E3A236', '#F0BE52'], ['#B8742E', '#A66528', '#C8843A']),
    pal('#E8B040', '#F8D27A', '#D48E30', '#9C5C28', '#744626', ['#F8D27A', '#F2C25A', '#FADE94'], ['#E5A436', '#DC9630', '#EBB04A'], ['#B06A2C', '#9C5C26', '#C07A34']),
    pal('#C9BC4E', '#E6E080', '#A89A3C', '#68622E', '#505026', ['#E6E080', '#D8D268', '#EEEA98'], ['#C2B646', '#B4A83E', '#CEC454'], ['#7C7432', '#6C682C', '#8A8238']),
  ],
  shade: [
    pal('#CC8A36', '#EAB66A', '#A86A2E', '#6C3C28', '#583422', ['#EAB66A', '#DEA254', '#F0C484'], ['#C88434', '#B8762E', '#D4943E'], ['#8A5028', '#784422', '#9A5C2E']),
    pal('#D4963C', '#F0C078', '#B07430', '#74442A', '#5E3824', ['#F0C078', '#E4AC5E', '#F4CE90'], ['#CE8E38', '#C0802E', '#DA9E44'], ['#905628', '#7E4A24', '#A0622E']),
    pal('#8E9C42', '#BCC474', '#6C7C38', '#3E5030', '#34452A', ['#BCC474', '#ABB662', '#CAD088'], ['#8A9A40', '#7C8C38', '#98A84A'], ['#4C6232', '#425A2E', '#587238']),
  ],
  back: [
    pal('#8A6A34', '#B8924E', '#6A4C2C', '#3E2C22', '#32241C', ['#B8924E', '#A88244', '#C8A260'], ['#866432', '#765A2C', '#947238'], ['#4C3826', '#42301F', '#58402C']),
    pal('#6E7A3A', '#9AA660', '#506030', '#2E4028', '#26361F', ['#9AA660', '#8A9852', '#AAB474'], ['#6C783A', '#5E6C32', '#7A8644'], ['#3A4E2C', '#324626', '#445A34']),
  ],
  gold: [pal('#F8D84A', '#FFF6AE', '#EEB230', '#BA7A28', '#8E5E24', ['#FFF6AE', '#FCE87A', '#FFFAC6'], ['#F6CC44', '#F0BE3A', '#FAD860'], ['#CE9230', '#BC822C', '#DCA23A'])],
  coral: [pal('#E48638', '#F8BC80', '#C45E2A', '#822E24', '#682A1E', ['#F8BC80', '#F2A664', '#FBCC98'], ['#E2843A', '#D6722E', '#EC9648'], ['#A04228', '#8C3824', '#B04E2E'])],
};

/** a mixed tree: golden, with a lot of green not yet turned, a rust accent or two */
const MIXED: TreeKit = {
  lit: [
    pal('#E4D45E', '#F8F0A6', '#C4B848', '#7E7A32', '#5C6030', ['#F8F0A6', '#EEE682', '#FBF6C0'], ['#DCCB52', '#D0BE48', '#E6D864'], ['#9C9238', '#8C8434', '#AA9E40']),
    pal('#F0CC52', '#FCEEA0', '#DCA836', '#A87430', '#7E5428', ['#FCEEA0', '#F8DC72', '#FEF4BA'], ['#EEBE48', '#E4AE3E', '#F4CC60'], ['#BC8434', '#AA742E', '#CA943C']),
  ],
  mid: [
    pal('#A8B048', '#D2D882', '#84923C', '#4C6234', '#3C5030', ['#D2D882', '#C0C86C', '#DDE298'], ['#A2AC46', '#949E3E', '#B0BA54'], ['#5E7436', '#506834', '#6C8240']),
    pal('#D8B848', '#F2DC84', '#BC9A38', '#7E6030', '#645028', ['#F2DC84', '#E8CE66', '#F6E69E'], ['#D2B042', '#C6A23A', '#DCBC52'], ['#8E7032', '#7E642C', '#9C7E38']),
    pal('#DC9A3A', '#F4C27C', '#BC7430', '#843C28', '#6A3220', ['#F4C27C', '#EEB060', '#F8D094'], ['#D8923A', '#CC8230', '#E2A246'], ['#984A28', '#843F24', '#A85A30']),
  ],
  shade: [
    pal('#728E46', '#A4BC74', '#4E7240', '#2C4A34', '#243E2C', ['#A4BC74', '#92AC62', '#B4C888'], ['#6E8C46', '#627E3E', '#7C9A52'], ['#3A5C38', '#305030', '#466A40']),
    pal('#B8863A', '#DEB06A', '#946130', '#5C3828', '#4A2E22', ['#DEB06A', '#D09E56', '#E6C084'], ['#B2803A', '#A4722E', '#C08E44'], ['#74482A', '#663E24', '#84542E']),
  ],
  back: [
    pal('#586E38', '#84A058', '#3E5630', '#243C2A', '#1E3224', ['#84A058', '#749048', '#94AE68'], ['#566C36', '#4A6030', '#627A40'], ['#2E4A2E', '#284228', '#385A36']),
    pal('#7A5A30', '#A88450', '#58402A', '#33241E', '#2A1E18', ['#A88450', '#987440', '#B89460'], ['#745630', '#664A28', '#826238'], ['#40301F', '#382A1C', '#4C3824']),
  ],
  gold: [pal('#F2CC44', '#FFF2A6', '#E0A62E', '#B07028', '#865424', ['#FFF2A6', '#FAE276', '#FFF8C0'], ['#F0C23E', '#E8B434', '#F4D058'], ['#C48630', '#B27628', '#D29636'])],
  coral: [pal('#CC5A34', '#EE9468', '#A83E2C', '#6A2624', '#54201E', ['#EE9468', '#E68258', '#F4A880'], ['#CA5C36', '#BC4E30', '#D6704A'], ['#843028', '#722A24', '#923A30'])],
};

export const KITS = { maple: MAPLE, gold: GOLD, mixed: MIXED } as const;
export type KitName = keyof typeof KITS;

/** pool size of each kind (Time to Grow uses 7/6/5/4/3/2); fewer here keeps the build quick */
const POOL: Record<SpriteKind, number> = { lit: 5, mid: 5, shade: 4, back: 3, gold: 2, coral: 2 };

/**
 * One autumn clump sprite, painted exactly the way Time to Grow's are (a lobed cloud, lit pale at the upper
 * left, deeper to the lower right, wet-in-wet blooms, leaf dabs, a broken dab fringe, feathered paper holes,
 * granulation) in a given palette. Pivot at (0.5 W, 0.82 H).
 */
export function makeTreeClump(seed: number, W: number, H: number, p: FoliagePal, kind: SpriteKind): HTMLCanvasElement {
  // a CPU canvas: it is read back for the paper grain, which is slow on a GPU one
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const rnd = new Rand(seed);
  const u = W / 100;
  const lit = kind === 'lit' || kind === 'gold' || kind === 'coral';
  const back = kind === 'back';
  const cx = W * 0.5;
  const cy = H * 0.6;
  const N = 24;
  const lobes = rnd.int(5, 8);
  const ph = rnd.range(0, 6.28);
  const ph2 = rnd.range(0, 6.28);
  const base: number[] = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const rr = 1 + 0.15 * Math.sin(lobes * th + ph) + 0.08 * Math.sin(lobes * 2 * th + ph2) + 0.09 * Math.sin(2 * th + ph * 0.7) + 0.05 * Math.sin(3 * th + ph2);
    base.push(cx + Math.sign(c) * Math.pow(Math.abs(c), 0.8) * W * 0.33 * rr, cy + Math.sign(s) * Math.pow(Math.abs(s), 0.85) * (s < 0 ? 0.4 * H : 0.28 * H) * rr);
  }
  const body = deform(base, rnd, 3, 0.1);
  const inBody = (x: number, y: number) => {
    let inside = false;
    const n = body.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = body[2 * i]!, yi = body[2 * i + 1]!, xj = body[2 * j]!, yj = body[2 * j + 1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const top = H * 0.12;
  const bot = H * 0.96;
  const zone = (y: number) => {
    const t = clamp((y - top) / (bot - top), 0, 1);
    return t < 0.3 ? 0 : t < 0.62 ? 1 : 2;
  };
  const wash = (poly: number[], color: string, a: number, count: number, amp: number, op: GlobalCompositeOperation = 'source-over') => {
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = rgba(color, a);
    for (let i = 0; i < count; i++) {
      tracePoly(ctx, deform(poly, rnd, 2, amp));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  wash(body, p.base, p.baseA * (back ? 1.15 : 1), 4, 0.045);
  if (lit) {
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    const g = ctx.createLinearGradient(W * 0.2, H * 0.1, W * 0.62, H * 0.62);
    g.addColorStop(0, rgba(p.light, 0.62));
    g.addColorStop(0.5, rgba(p.light, 0.24));
    g.addColorStop(1, rgba(p.light, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  wash(xform(body, cx, cy, 0.9, 0.82, 0.035 * W, 0.07 * H), p.mid, lit ? 0.1 : 0.14, 5, 0.06, 'multiply');
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  wash(xform(body, cx, cy + 0.2 * H, 1.05, back ? 0.78 : 0.6, 0, 0.06 * H), p.deep, lit ? 0.13 : back ? 0.2 : 0.17, back ? 8 : 6, 0.17, 'multiply');
  for (let i = 0; i < 5; i++) {
    const bx = rnd.range(0.22, 0.78) * W;
    const by = rnd.range(0.2, 0.8) * H;
    const br = rnd.range(9, 20) * u;
    const bl: number[] = [];
    for (let k = 0; k < 8; k++) bl.push(bx + Math.cos(k * 0.785) * br * rnd.range(0.7, 1.2), by + Math.sin(k * 0.785) * br * 0.75 * rnd.range(0.7, 1.2));
    const dark = by > H * 0.5 || rnd.chance(0.3);
    ctx.globalCompositeOperation = dark ? 'multiply' : 'source-over';
    ctx.fillStyle = dark ? rgba(p.deep, 0.08) : rgba(p.light, lit ? 0.12 : 0.07);
    for (let q = 0; q < 3; q++) {
      tracePoly(ctx, deform(bl, rnd, 3, 0.18));
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = rgba(p.edge, back ? 0.16 : 0.12);
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = (2.2 + i * 1.5) * u;
    tracePoly(ctx, deform(body, rnd, 1, 0.02));
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  const flow = rnd.range(-0.7, -0.2) * (rnd.chance(0.5) ? 1 : -1) - 0.3;
  const ndab = back ? 36 : 56;
  for (let i = 0; i < ndab; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 10; tries++) {
      x = rnd.range(0.12 * W, 0.88 * W);
      y = rnd.range(top, bot);
      if (inBody(x, y)) break;
    }
    const L = rnd.range(7, 21) * u;
    ctx.fillStyle = rgba(rnd.pick(p.dabs[zone(y)]!), rnd.range(0.1, back ? 0.2 : 0.26));
    almond(ctx, x, y, flow + rnd.gauss() * 0.7, L, L * 0.42, rnd.gauss() * 0.4 * u);
    ctx.fill();
  }
  if (lit) {
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = rgba(p.light, rnd.range(0.24, 0.5));
      const L = rnd.range(6, 14) * u;
      almond(ctx, rnd.range(0.16, 0.55) * W, rnd.range(0.14, 0.4) * H, flow + rnd.gauss() * 0.5, L, L * 0.4);
      ctx.fill();
    }
  }
  ctx.restore();
  for (let i = 0, n = back ? 3 : rnd.int(2, 4); i < n; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = rnd.range(0.2, 0.8) * W;
      y = rnd.range(0.2, 0.66) * H;
      if (inBody(x, y)) break;
    }
    const r = rnd.range(1.4, 4.2) * u;
    const hole = deform([x - r, y - r * 0.6, x + r * 0.2, y - r, x + r, y - r * 0.2, x + r * 0.5, y + r * 0.8, x - r * 0.7, y + r * 0.6], rnd, 3, 0.16);
    ctx.globalCompositeOperation = 'destination-out';
    for (let q = 0; q < 4; q++) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      tracePoly(ctx, xform(hole, x, y, 1 + q * 0.14, 1 + q * 0.14));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const nv = body.length / 2;
  const nfr = back ? 18 : 32;
  for (let i = 0; i < nfr; i++) {
    const k = rnd.int(0, nv - 1);
    const px = body[2 * k]!;
    const py = body[2 * k + 1]!;
    let nx = px - cx;
    let ny = (py - cy) * 1.3;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const off = rnd.range(-1.5, 4.5) * u;
    const L = rnd.range(5, 12) * u;
    ctx.fillStyle = rgba(rnd.pick(p.dabs[zone(py + ny * off)]!), rnd.range(0.4, 0.78));
    almond(ctx, px + nx * off, py + ny * off, Math.atan2(ny, nx) + (rnd.chance(0.5) ? Math.PI / 2 : 0) + rnd.gauss() * 0.8, L, L * 0.4, rnd.gauss() * 0.35 * u);
    ctx.fill();
  }
  // a few fine ink leaf marks near the underside, as in the green sprites
  if (!back && !lit && rnd.chance(0.5)) {
    ctx.strokeStyle = rgba(p.edge, 0.5);
    ctx.lineWidth = 0.65 * u;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      let k = 0;
      for (let tries = 0; tries < 10; tries++) {
        k = rnd.int(0, nv - 1);
        if (body[2 * k + 1]! > cy + 0.1 * H) break;
      }
      const x = body[2 * k]! + rnd.range(-2, 3) * u;
      const y = body[2 * k + 1]! + rnd.range(-2, 3) * u;
      const ang = Math.PI / 2 + rnd.range(-1.1, 1.1);
      const L = rnd.range(5, 8) * u;
      almond(ctx, x, y, ang, L, L * 0.24);
      ctx.stroke();
    }
  }
  grain(cv, seed, 1, 4);
  return cv;
}

const whole = (c: HTMLCanvasElement): Spr => ({ src: c, sx: 0, sy: 0, sw: c.width, sh: c.height });

/** a soft warm under-shadow blob (where a front clump overlaps what is behind it), in the foliage's own umber */
function makeWarmUnder(seed: number, W: number, H: number, col: string): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const poly: number[] = [];
  const N = 16;
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const r = 1 + 0.14 * Math.sin(5 * th + 1.1) + 0.08 * Math.sin(3 * th);
    poly.push(W * 0.5 + Math.cos(th) * W * 0.42 * r, H * 0.5 + Math.sin(th) * H * 0.4 * r);
  }
  for (let i = 0; i < 5; i++) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, W * 0.5);
    g.addColorStop(0, rgba(col, 0.26));
    g.addColorStop(0.7, rgba(col, 0.12));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    tracePoly(ctx, deform(poly, rnd, 2, 0.1));
    ctx.fill();
  }
  return cv;
}

const cache = new Map<string, Promise<Sprites>>();

/** the autumn sprite set for a kit at a sprite density sd (sprite width = 100 sd px) */
export function autumnSprites(kit: KitName, sd: number, tick: () => Promise<void>, check: () => boolean): Promise<Sprites> {
  const key = `${kit}|${sd}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const W = Math.round(100 * sd);
      const H = Math.round(W * 0.53);
      const kinds = {} as Record<SpriteKind, Spr[]>;
      let ki = 0;
      const seedBase = 9100 + (kit === 'maple' ? 0 : kit === 'gold' ? 4000 : 8000);
      for (const k of SPRITE_KINDS) {
        kinds[k] = [];
        const pals = KITS[kit][k];
        for (let v = 0; v < POOL[k]; v++) {
          kinds[k].push(whole(makeTreeClump(seedBase + ki * 101 + v * 7919, W, H, pals[v % pals.length]!, k)));
          if (v % 2 === 1) {
            await tick();
            if (!check()) break;
          }
        }
        ki++;
      }
      const under = whole(makeWarmUnder(seedBase + 5, Math.round(130 * sd), Math.round(80 * sd), kit === 'maple' ? '#5A2028' : kit === 'gold' ? '#5C3A22' : '#3E4A28'));
      const empty = makeCanvas(2, 2);
      if (!check()) cache.delete(key);
      return { sd, kinds, under, mound: whole(empty), shadow: whole(empty) } as Sprites;
    })();
    cache.set(key, p);
  }
  return p;
}
