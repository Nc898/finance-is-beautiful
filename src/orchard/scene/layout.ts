/**
 * The scene's own camera and the places of the things it paints that geom.ts does not fix (world units).
 * The camera fits the whole farm (both orchards, the crates at their outer corners, the farmer's tree from its crown
 * to its roots, the track) between the header band and the label band; wider screens see more of the world on each
 * side, so everything static is painted past 0 … 1000. It never zooms.
 */
import { SLOTS, WORLD } from './geom';
import type { PickerId } from '../types';

export interface Insets {
  top: number;
  bottom: number;
  side?: number;
}

export interface Camera {
  cssW: number;
  cssH: number;
  dpr: number;
  /** css px per world unit */
  s: number;
  /** screen position of world (0,0) */
  ox: number;
  oy: number;
}

/** the part of the world the camera must always show (x: both orchards and the crates at their outer corners; only
 * on a narrow screen does the outer edge of the oldest trees' crowns go out of the picture), and the depth band it
 * frames (y: a little sky over the old tree's crown down to the long grass under the track). On a phone the width
 * decides the scale and the extra height goes to the sky (as Brick's), where a few more clouds are painted. */
export const VIEW = { x0: 40, x1: 960, y0: 92, y1: 632 } as const;

export function fitCamera(cssW: number, cssH: number, dpr: number, insets: Insets): Camera {
  const availH = Math.max(80, cssH - insets.top - insets.bottom);
  const availW = Math.max(120, cssW - (insets.side ?? 0));
  const vw = VIEW.x1 - VIEW.x0;
  const vh = VIEW.y1 - VIEW.y0;
  const s = Math.min(availW / vw, availH / vh);
  // centred on the whole stage: with the panel open on wide screens the canvas slides left by half the panel, so
  // the farm then sits in the middle of what is left
  const ox = (cssW - WORLD.width * s) / 2;
  // the long grass sits on the label band; extra height goes to the sky
  const oy = insets.top + availH - VIEW.y1 * s;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, ox, oy };
}

/** the world x range the camera sees (with a margin) */
export function viewX(c: Camera, margin = 40): { x0: number; x1: number } {
  return { x0: -c.ox / c.s - margin, x1: (c.cssW - c.ox) / c.s + margin };
}
/** the world y range the camera sees */
export function viewY(c: Camera, margin = 20): { y0: number; y1: number } {
  return { y0: -c.oy / c.s - margin, y1: (c.cssH - c.oy) / c.s + margin };
}

/** the middle of a picker's orchard (x): its label sits under it */
export const plotX = (id: PickerId): number => {
  const xs = SLOTS[id].map((p) => p.x);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
};
