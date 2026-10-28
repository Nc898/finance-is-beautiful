/**
 * Spring dress for Time to Grow's trees: the same skeleton, crown model and painter (src/scene/treePainter.ts) and
 * the same clump sprites as the vine's autumn trees (makeTreeClump), in two spring palettes:
 * - leaf: fresh young leaf, the lit side a pale lemon-green, the middle a clear spring green, the shade a cool
 *   blue-green, with a few creamy accents;
 * - blossom: a cherry in full flower, white and pale pink in the light, a deeper rose in the shade, a mauve-grey
 *   underside, with fresh green leaf just coming.
 * A crown is drawn from six clump kinds (lit, mid, shade, back, gold, coral) by where each sits against the light.
 */
import { H as TREE_H } from '../../scene/treeModel';
import { TreePainter } from '../../scene/treePainter';
import { getModel } from '../../scene/treeView';
import { makeCanvas, rgba, SPRITE_KINDS, type SpriteKind } from '../../scene/watercolor';
import type { Spr, Sprites } from '../../scene/sprites';
import type { FoliagePal } from '../../vine/scene/art';
import { makeTreeClump } from '../../vine/scene/treesArt';
import { PAPER } from './housePaint';

const pal = (base: string, light: string, mid: string, deep: string, edge: string, dl: [string, string, string], dm: [string, string, string], dd: [string, string, string], baseA = 0.2): FoliagePal => ({
  base,
  baseA,
  mid,
  deep,
  light,
  dabs: [dl, dm, dd],
  edge,
});

type Kit = Record<SpriteKind, FoliagePal[]>;

const LEAF: Kit = {
  lit: [
    pal('#C8DC72', '#EEF5B4', '#A6C658', '#6E9A40', '#55782E', ['#EEF5B4', '#E0EE98', '#F5FAC8'], ['#B6D264', '#AACA5A', '#C2DA72'], ['#7EA848', '#709C40', '#8AB252']),
    pal('#D2E07A', '#F3F7BE', '#B2CC60', '#7AA244', '#5C7E30', ['#F3F7BE', '#E6F0A0', '#F8FBD0'], ['#C0D66A', '#B2CE60', '#CADE78'], ['#86AC4A', '#78A042', '#92B656']),
  ],
  mid: [
    pal('#9CC25A', '#CFE48E', '#7CA84A', '#4A7A38', '#3C6630', ['#CFE48E', '#BEDA78', '#DAEA9E'], ['#94BC54', '#88B24C', '#A2C862'], ['#5A8A3E', '#4E7E38', '#669646']),
    pal('#8EBA56', '#C4DE88', '#6E9E46', '#427234', '#365E2C', ['#C4DE88', '#B2D272', '#D0E69A'], ['#86B250', '#7AA848', '#94BE5C'], ['#50823A', '#467634', '#5C8E42']),
    pal('#A8C860', '#D8EA98', '#88AE4E', '#557E3A', '#446A30', ['#D8EA98', '#C8E080', '#E2F0AA'], ['#A0C25A', '#94B852', '#ACCC66'], ['#648C40', '#58823A', '#709848']),
  ],
  shade: [
    pal('#6E9C4E', '#A2C47C', '#4E7E44', '#2C5438', '#244630', ['#A2C47C', '#90B66A', '#B0CE8C'], ['#66944A', '#5A8842', '#74A054'], ['#38663C', '#305A36', '#447242']),
    pal('#5E9050', '#94BA7C', '#447444', '#264E38', '#1E4030', ['#94BA7C', '#82AC6A', '#A4C68C'], ['#58884C', '#4C7C44', '#669656'], ['#325E3C', '#2A5236', '#3C6A42']),
  ],
  back: [
    pal('#4A7646', '#76A068', '#365E3C', '#1E3E30', '#183428', ['#76A068', '#68925A', '#84AC76'], ['#467044', '#3C643E', '#527C4C'], ['#284A36', '#224030', '#30563C']),
    pal('#557A4A', '#80A46E', '#3E6240', '#224234', '#1C382C', ['#80A46E', '#72965E', '#8EB07C'], ['#4E7446', '#446840', '#5A8050'], ['#2C4E38', '#264432', '#345A3E']),
  ],
  gold: [pal('#DCE47A', '#F8FAC4', '#BED05E', '#86A440', '#68862E', ['#F8FAC4', '#EEF4A8', '#FCFDD6'], ['#D2DE6E', '#C6D664', '#DCE67E'], ['#98B44A', '#8AA842', '#A6BE54'])],
  coral: [pal('#EFE6CC', '#FFFBEF', '#DCD0AE', '#A8A07A', '#86805E', ['#FFFBEF', '#F8F2DC', '#FFFFF6'], ['#E8DEC0', '#E0D4B4', '#EEE6CC'], ['#B4AC86', '#A49C78', '#C0B894'])],
};

const BLOSSOM: Kit = {
  lit: [
    pal('#F8E2E6', '#FFF9F8', '#F1C9D2', '#D696A8', '#B87488', ['#FFF9F8', '#FDEEF0', '#FFFFFF'], ['#F5D2DA', '#F0C2CC', '#F8DCE2'], ['#DC9CAE', '#D08EA2', '#E4AABA']),
    pal('#FAEAEC', '#FFFCFB', '#F4D2DA', '#DCA2B2', '#BC7C90', ['#FFFCFB', '#FEF3F4', '#FFFFFF'], ['#F7DAE0', '#F2CAD3', '#FAE2E7'], ['#E0A8B8', '#D498AA', '#E8B4C2']),
  ],
  mid: [
    pal('#F2C6D0', '#FBE6EA', '#E8A8B8', '#C47890', '#A45E76', ['#FBE6EA', '#F8D8DE', '#FDF0F2'], ['#EDB8C4', '#E6AABA', '#F2C4CE'], ['#CC849A', '#C0788E', '#D692A6']),
    pal('#F4D0D8', '#FCEDF0', '#EBB4C2', '#C88498', '#A8687E', ['#FCEDF0', '#F9DFE4', '#FEF5F6'], ['#F0C2CC', '#EAB4C0', '#F4CCD4'], ['#D090A4', '#C48498', '#DA9CAE']),
    pal('#EEDCDA', '#FBF2EF', '#DEC2C2', '#B2908E', '#90706E', ['#FBF2EF', '#F6E6E2', '#FDF8F6'], ['#E8D2D0', '#E0C6C4', '#EEDAD8'], ['#BE9C9A', '#B2908E', '#C8A8A6']),
  ],
  shade: [
    pal('#DCA0B4', '#F0CAD4', '#C67C96', '#8E4E6A', '#743E58', ['#F0CAD4', '#E8B8C6', '#F4D6DE'], ['#D6949C', '#CC8AA2', '#DEA4B6'], ['#A0607A', '#94546E', '#AC6C86']),
    pal('#CFA0B6', '#E8C8D6', '#B47A98', '#7E4E6C', '#663E58', ['#E8C8D6', '#DEB8C8', '#EED4DE'], ['#C894AE', '#BE88A4', '#D2A0B8'], ['#90607E', '#845472', '#9C6C8A']),
  ],
  back: [
    pal('#A88496', '#C8A8B8', '#8A6478', '#5A3E50', '#483240', ['#C8A8B8', '#BC9AAC', '#D2B6C4'], ['#A07C8E', '#947082', '#AC8A9A'], ['#6A4C5E', '#5E4254', '#765868']),
    pal('#8C8A70', '#B0AE90', '#6E6C56', '#46463A', '#383A30', ['#B0AE90', '#A2A082', '#BEBCA0'], ['#868468', '#7A785E', '#929074'], ['#545444', '#4A4A3C', '#5E5E4C']),
  ],
  gold: [pal('#FFFDF8', '#FFFFFF', '#F6EEEA', '#E0CCCC', '#C4ACAE', ['#FFFFFF', '#FFFBF8', '#FFFFFF'], ['#FAF2F0', '#F4EAE8', '#FDF6F4'], ['#E6D4D4', '#DCC8C8', '#ECDCDC'])],
  coral: [pal('#B6CE6C', '#E0EEA4', '#94B456', '#5E8238', '#4A6C2C', ['#E0EEA4', '#D2E68E', '#E8F2B6'], ['#AECA64', '#A2C05A', '#BAD270'], ['#6C9240', '#608638', '#78A048'])],
};

const KITS = { leaf: LEAF, blossom: BLOSSOM } as const;
export type SpringKit = keyof typeof KITS;

const POOL: Record<SpriteKind, number> = { lit: 5, mid: 5, shade: 4, back: 3, gold: 2, coral: 2 };
const whole = (c: HTMLCanvasElement): Spr => ({ src: c, sx: 0, sy: 0, sw: c.width, sh: c.height });

/** the soft wash under a crown (the shade the painter lays first) */
function makeUnder(seed: number, W: number, H: number, col: string): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, W * 0.5);
  g.addColorStop(0, rgba(col, 0.3));
  g.addColorStop(0.7, rgba(col, 0.12));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.52, W * 0.46, H * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  void seed;
  return cv;
}

const cache = new Map<string, Promise<Sprites>>();

/** the spring sprite set for a kit at a sprite density sd (sprite width = 100 sd px) */
export function springSprites(kit: SpringKit, sd: number, tick: () => Promise<void>, check: () => boolean): Promise<Sprites> {
  const key = `${kit}|${sd}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const W = Math.round(100 * sd);
      const H = Math.round(W * 0.53);
      const kinds = {} as Record<SpriteKind, Spr[]>;
      let ki = 0;
      const seedBase = kit === 'leaf' ? 12100 : 16100;
      for (const k of SPRITE_KINDS) {
        kinds[k] = [];
        const pals = KITS[kit][k];
        for (let v = 0; v < POOL[k]; v++) {
          kinds[k].push(whole(makeTreeClump(seedBase + ki * 101 + v * 7919, W, H, pals[v % pals.length]!, k)));
          if (v % 2 === 1) await tick();
        }
        ki++;
      }
      const under = whole(makeUnder(seedBase + 5, Math.round(130 * sd), Math.round(80 * sd), kit === 'leaf' ? '#2E4A30' : '#5A3A4E'));
      const empty = makeCanvas(2, 2);
      if (!check()) cache.delete(key);
      return { sd, kinds, under, mound: whole(empty), shadow: whole(empty) } as Sprites;
    })();
    cache.set(key, p);
  }
  return p;
}

export interface SpringTree {
  seed: number;
  /** the trunk foot in world units */
  x: number;
  y: number;
  /** world units per tree unit (a mature tree is TREE_H = 560 tree units tall) */
  k: number;
  /** maturity 0..1 (1 is the full crown) */
  m: number;
  kit: SpringKit;
  /** paper haze over the whole tree, 0..1 (distance) */
  haze: number;
  flip?: boolean;
}

const HALF = 300;
const PAD_TOP = 70;
const PARAMS = { maturity: 1, months: 24, timeMs: 0, wind: false, pulse: -1, bills: 0, noBills: true } as const;

/** paint one tree into its own canvas; returns it with the foot position inside it (canvas px) */
export async function renderSpringTree(plan: SpringTree, A: number, sd: number, tick: () => Promise<void>, check: () => boolean): Promise<{ cv: HTMLCanvasElement; fx: number; fy: number } | null> {
  const s = A * plan.k;
  const sprites = await springSprites(plan.kit, sd, tick, check);
  if (!check()) return null;
  const w = Math.ceil(2 * HALF * s);
  const h = Math.ceil((TREE_H * plan.m + PAD_TOP) * s + 10 * s);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d')!;
  const ox = w / 2;
  const oy = h - 8 * s;
  const painter = new TreePainter(getModel(plan.seed));
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, oy + 1.6 * s);
  ctx.clip();
  painter.paint(ctx, { ox, oy, s, dpr: 1 }, { ...PARAMS, maturity: plan.m }, sprites);
  ctx.restore();
  if (plan.haze > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = rgba(PAPER, plan.haze);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(130,160,210,${0.06 + plan.haze * 0.16})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { cv, fx: ox, fy: oy };
}

/** lay a rendered tree into a layer (ctx maps world units to layer px) */
export function laySpringTree(ctx: CanvasRenderingContext2D, plan: SpringTree, r: { cv: HTMLCanvasElement; fx: number; fy: number }, A: number): void {
  ctx.save();
  ctx.translate(plan.x, plan.y);
  if (plan.flip) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(r.cv, -r.fx / A, -r.fy / A, r.cv.width / A, r.cv.height / A);
  ctx.restore();
}

/** draw a clump sprite with its visible body `bodyW` wide, its pivot at (cx, by) */
export function drawClump(ctx: CanvasRenderingContext2D, s: Spr, cx: number, by: number, bodyW: number, flip = false): void {
  const dw = bodyW / 0.7;
  const dh = (dw * s.sh) / s.sw;
  if (flip) {
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, -dw / 2, by - dh * 0.82, dw, dh);
    ctx.restore();
  } else ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, cx - dw / 2, by - dh * 0.82, dw, dh);
}
