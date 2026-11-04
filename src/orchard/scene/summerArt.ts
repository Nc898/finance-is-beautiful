/**
 * Late-summer dress for the clump sprites Time to Grow's crowns are painted from (the vine's makeTreeClump, as
 * Brick's springArt.ts uses them): the leaf of August, deep and a little tired, going olive. The lit side a warm
 * straw-green catching the low sun, the middle a deep summer green, the shade an olive and a cool blue-green, the
 * back nearly black-green, with gold accents where the sun comes straight through and a few leaves already turning.
 * Used by the farmer's old tree, the oaks and the copses in the distance.
 */
import { makeCanvas, rgba, SPRITE_KINDS, type SpriteKind } from '../../scene/watercolor';
import type { Spr, Sprites } from '../../scene/sprites';
import type { FoliagePal } from '../../vine/scene/art';
import { makeTreeClump } from '../../vine/scene/treesArt';
import { mix } from '../../river/scene/boatInk';

export { drawClump } from '../../brick/scene/springArt';

/** a palette from its five main tones; the leaf dabs are drawn from them (light, middle and deep dabs) */
const pal = (base: string, light: string, mid: string, deep: string, edge: string, baseA = 0.2): FoliagePal => ({
  base,
  baseA,
  mid,
  deep,
  light,
  dabs: [
    [light, mix(light, mid, 0.25), mix(light, '#FFFBEA', 0.3)],
    [mix(mid, base, 0.4), mid, mix(mid, light, 0.25)],
    [mix(deep, mid, 0.3), deep, mix(deep, mid, 0.5)],
  ],
  edge,
});

export type LeafKit = Record<SpriteKind, FoliagePal[]>;

/** the late-summer leaf, one list of palettes per clump kind */
export const LATE: LeafKit = {
  lit: [
    pal('#A6AE5A', '#DCDA98', '#8C9A4A', '#5A6E34', '#4A5E2E'),
    pal('#B2B260', '#E6DCA2', '#96A050', '#62743A', '#506230'),
  ],
  mid: [
    pal('#7C984A', '#B6C276', '#60803E', '#3C5830', '#324C2A'),
    pal('#869E50', '#C0C880', '#6A8842', '#425E2E', '#36502A'),
    pal('#8C9448', '#C4C27C', '#707A3C', '#4A582E', '#3C4A28'),
  ],
  shade: [
    pal('#58724A', '#8A9E72', '#405E3E', '#283E34', '#20362C'),
    pal('#52684C', '#82947C', '#3A5442', '#243A36', '#1C302E'),
  ],
  back: [
    pal('#3C5438', '#667C5A', '#2C4432', '#1A2E28', '#142620'),
    pal('#485838', '#72805C', '#344430', '#202E24', '#18261E'),
  ],
  gold: [pal('#C8BC66', '#F2E8B4', '#ACA452', '#7A7838', '#626430')],
  coral: [pal('#D0B05E', '#F4DE9E', '#B89848', '#846E2E', '#685826')],
};

const POOL: Record<SpriteKind, number> = { lit: 5, mid: 5, shade: 4, back: 3, gold: 2, coral: 2 };
const whole = (c: HTMLCanvasElement): Spr => ({ src: c, sx: 0, sy: 0, sw: c.width, sh: c.height });

const cache = new Map<string, Promise<Sprites>>();

/** the late-summer sprite set at a sprite density sd (sprite width = 100 sd px) */
export function summerSprites(sd: number, tick: () => Promise<void>, check: () => boolean): Promise<Sprites> {
  const key = `late|${sd}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const W = Math.round(100 * sd);
      const H = Math.round(W * 0.53);
      const kinds = {} as Record<SpriteKind, Spr[]>;
      let ki = 0;
      for (const k of SPRITE_KINDS) {
        kinds[k] = [];
        const pals = LATE[k];
        for (let v = 0; v < POOL[k]; v++) {
          kinds[k].push(whole(makeTreeClump(18100 + ki * 101 + v * 7919, W, H, pals[v % pals.length]!, k)));
          if (v % 2 === 1) await tick();
        }
        ki++;
      }
      // the soft wash under a crown (the shade the painter lays first)
      const uw = Math.round(130 * sd);
      const uh = Math.round(80 * sd);
      const under = makeCanvas(uw, uh);
      const u = under.getContext('2d')!;
      const g = u.createRadialGradient(uw * 0.5, uh * 0.52, 0, uw * 0.5, uh * 0.52, uw * 0.5);
      g.addColorStop(0, rgba('#2E3E2A', 0.3));
      g.addColorStop(0.7, rgba('#2E3E2A', 0.12));
      g.addColorStop(1, rgba('#2E3E2A', 0));
      u.fillStyle = g;
      u.beginPath();
      u.ellipse(uw * 0.5, uh * 0.52, uw * 0.46, uh * 0.42, 0, 0, Math.PI * 2);
      u.fill();
      const empty = makeCanvas(2, 2);
      if (!check()) cache.delete(key);
      return { sd, kinds, under: whole(under), mound: whole(empty), shadow: whole(empty) } as Sprites;
    })();
    cache.set(key, p);
  }
  return p;
}

/** a sprite of a kind, chosen by the generator */
export function pickClump(sp: Sprites, pick: (n: number) => number, kind: SpriteKind): Spr {
  const list = sp.kinds[kind]!;
  return list[pick(list.length)]!;
}
