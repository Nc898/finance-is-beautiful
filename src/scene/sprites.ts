/**
 * Sprite pool management: procedural generation (async, yields between sprites) with an optional baked atlas
 * loaded from /assets/foliage-atlas.{png,json} (written by scripts/bake-assets.mjs).
 */
import {
  SPRITE_KINDS, SPRITE_POOL, makeClumpSprite, makeMoundSprite, makePaperTile, makeShadowSprite, makeCanvas,
  type SpriteKind,
} from './watercolor';

export interface Spr {
  src: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}
export interface Sprites {
  sd: number;
  kinds: Record<SpriteKind, Spr[]>;
  mound: Spr;
  shadow: Spr;
}

/** sprite pixel width = SPRITE_BASE_W * sd; visible body is ~0.72 of it, aspect H/W = SPRITE_ASPECT */
export const SPRITE_BASE_W = 100;
export const SPRITE_ASPECT = 0.53;
export const BUCKETS = [0.7, 1, 1.4, 2];

export function bucketFor(pxPerUnit: number): number {
  for (const b of BUCKETS) if (b >= pxPerUnit * 0.88) return b;
  return BUCKETS[BUCKETS.length - 1]!;
}

const whole = (c: HTMLCanvasElement): Spr => ({ src: c, sx: 0, sy: 0, sw: c.width, sh: c.height });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const cache = new Map<number, Promise<Sprites>>();
let bakedPromise: Promise<Sprites | null> | null = null;
let paperPromise: Promise<HTMLCanvasElement | HTMLImageElement> | null = null;

function baseUrl(): string {
  try {
    return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image load failed'));
    im.src = url;
  });
}

interface AtlasJson {
  sd: number;
  frames: Record<string, Array<{ x: number; y: number; w: number; h: number }>>;
  mound: { x: number; y: number; w: number; h: number };
  shadow: { x: number; y: number; w: number; h: number };
}

async function loadBaked(): Promise<Sprites | null> {
  try {
    const res = await fetch(`${baseUrl()}assets/foliage-atlas.json`);
    if (!res.ok) return null;
    const j = (await res.json()) as AtlasJson;
    if (!j || !j.frames) return null;
    const img = await loadImage(`${baseUrl()}assets/foliage-atlas.png`);
    const mk = (f: { x: number; y: number; w: number; h: number }): Spr => ({ src: img, sx: f.x, sy: f.y, sw: f.w, sh: f.h });
    const kinds = {} as Record<SpriteKind, Spr[]>;
    for (const k of SPRITE_KINDS) kinds[k] = (j.frames[k] ?? []).map(mk);
    if (SPRITE_KINDS.some((k) => kinds[k].length === 0)) return null;
    return { sd: j.sd, kinds, mound: mk(j.mound), shadow: mk(j.shadow) };
  } catch {
    return null;
  }
}

export async function generateSprites(sd: number): Promise<Sprites> {
  const W = Math.round(SPRITE_BASE_W * sd);
  const Hh = Math.round(W * SPRITE_ASPECT);
  const kinds = {} as Record<SpriteKind, Spr[]>;
  let ki = 0;
  for (const k of SPRITE_KINDS) {
    kinds[k] = [];
    for (let v = 0; v < SPRITE_POOL[k]; v++) {
      kinds[k].push(whole(makeClumpSprite(1000 + ki * 100 + v * 7919, W, Hh, k)));
      await tick();
    }
    ki++;
  }
  return {
    sd, kinds,
    mound: whole(makeMoundSprite(77, Math.round(120 * sd), Math.round(48 * sd))),
    shadow: whole(makeShadowSprite(91, Math.round(300 * sd), Math.round(46 * sd))),
  };
}

/** Resolves to the sprite set for the given render density (baked atlas when available). */
export function ensureSprites(pxPerUnit: number): Promise<Sprites> {
  if (!bakedPromise) bakedPromise = loadBaked();
  const sd = bucketFor(pxPerUnit);
  let p = cache.get(sd);
  if (!p) {
    p = bakedPromise.then((baked) => baked ?? generateSprites(sd));
    cache.set(sd, p);
  }
  return p;
}

export function ensurePaperTile(): Promise<HTMLCanvasElement | HTMLImageElement> {
  if (!paperPromise) {
    paperPromise = (async () => {
      try {
        const im = await loadImage(`${baseUrl()}assets/paper-tile.png`);
        if (im.naturalWidth >= 64) return im;
      } catch {
        /* fall through */
      }
      await tick();
      return makePaperTile();
    })();
  }
  return paperPromise;
}

/** Used by scripts/bake-assets.mjs: render the sprite atlas at density `sd` and return canvas + frame map. */
export async function buildAtlas(sd: number): Promise<{ canvas: HTMLCanvasElement; json: AtlasJson }> {
  const s = await generateSprites(sd);
  const COLS = 6;
  const cellW = s.kinds.lit[0]!.sw;
  const cellH = s.kinds.lit[0]!.sh;
  const all: Array<{ key: string; spr: Spr }> = [];
  for (const k of SPRITE_KINDS) s.kinds[k].forEach((sp, i) => all.push({ key: `${k}:${i}`, spr: sp }));
  const extraRows = 1 + Math.ceil(s.mound.sh / cellH) + Math.ceil(s.shadow.sh / cellH);
  const rows = Math.ceil(all.length / COLS) + extraRows;
  const canvas = makeCanvas(cellW * COLS, cellH * rows);
  const ctx = canvas.getContext('2d')!;
  const frames: AtlasJson['frames'] = {};
  all.forEach((a, i) => {
    const x = (i % COLS) * cellW;
    const y = Math.floor(i / COLS) * cellH;
    ctx.drawImage(a.spr.src, a.spr.sx, a.spr.sy, a.spr.sw, a.spr.sh, x, y, cellW, cellH);
    const k = a.key.split(':')[0]!;
    (frames[k] ??= []).push({ x, y, w: cellW, h: cellH });
  });
  let y = Math.ceil(all.length / COLS) * cellH;
  ctx.drawImage(s.mound.src, 0, 0, s.mound.sw, s.mound.sh, 0, y, s.mound.sw, s.mound.sh);
  const mound = { x: 0, y, w: s.mound.sw, h: s.mound.sh };
  y += Math.ceil(s.mound.sh / cellH) * cellH;
  ctx.drawImage(s.shadow.src, 0, 0, s.shadow.sw, s.shadow.sh, 0, y, s.shadow.sw, s.shadow.sh);
  const shadow = { x: 0, y, w: s.shadow.sw, h: s.shadow.sh };
  return { canvas, json: { sd, frames, mound, shadow } };
}
