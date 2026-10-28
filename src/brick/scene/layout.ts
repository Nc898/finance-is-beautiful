/**
 * The scene's own camera and the places of the things it paints that geom.ts does not fix (world units).
 * The camera fits the whole street (both plots, the lane) between the header band and the label band; wider screens
 * see more of the world on each side, so everything static is painted past 0 … 1000.
 */
import { HOUSE, WORLD } from './geom';
import type { LoanId } from '../types';

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

/** the part of the world the camera must always show (x), and the depth band it frames (y) */
export const VIEW = { x0: 52, x1: 948, y0: 96, y1: 628 } as const;

export function fitCamera(cssW: number, cssH: number, dpr: number, insets: Insets): Camera {
  const availH = Math.max(80, cssH - insets.top - insets.bottom);
  const availW = Math.max(120, cssW - (insets.side ?? 0));
  const vw = VIEW.x1 - VIEW.x0;
  const vh = VIEW.y1 - VIEW.y0;
  // fit the street (scaffold to scaffold, sky over the chimneys down to the lane's front edge)
  const s = Math.min(availW / vw, availH / vh);
  // centred on the whole stage: with the panel open on wide screens the canvas slides left by half the panel, so
  // the street then sits in the middle of what is left
  const ox = (cssW - WORLD.width * s) / 2;
  // the lane's front edge sits on the label band; extra height goes to the sky
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

/** the centre of a plot (x) */
export const plotX = (id: LoanId): number => (HOUSE[id].wall.x0 + HOUSE[id].wall.x1) / 2;
