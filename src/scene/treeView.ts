/**
 * Single-tree view helper (used by the Phase-1 slice page).
 */
import { generateTree, type TreeModel } from './treeModel';
import { TreePainter } from './treePainter';
import { ensureSprites, type Sprites } from './sprites';
import { applyBackdrop, fitCamera, type Camera } from './backdrop';

export interface RenderParams {
  maturity: number;
  months: number;
  timeMs: number;
  wind: boolean;
}

const modelCache = new Map<number, TreeModel>();
export function getModel(seed: number): TreeModel {
  let m = modelCache.get(seed);
  if (!m) {
    m = generateTree(seed);
    modelCache.set(seed, m);
  }
  return m;
}

export class TreeView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  painter: TreePainter;
  sprites: Sprites | null = null;
  cam: Camera | null = null;
  seed: number;
  viewWidth: number;
  lastMs = 0;

  constructor(canvas: HTMLCanvasElement, seed: number, viewWidth = 470) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.seed = seed;
    this.viewWidth = viewWidth;
    this.painter = new TreePainter(getModel(seed));
  }

  get model(): TreeModel {
    return this.painter.model;
  }
  get mEff(): number {
    return this.painter.mEff;
  }

  setSeed(seed: number): void {
    this.seed = seed;
    this.painter = new TreePainter(getModel(seed));
  }

  /** Sizes the canvas, loads sprites (async) and paints the static backdrop. */
  async init(cssW: number, cssH: number, dpr: number): Promise<void> {
    const cam = fitCamera(cssW, cssH, dpr, this.viewWidth);
    cam.ox0 = 0;
    this.cam = cam;
    this.canvas.width = Math.round(cssW * cam.dpr);
    this.canvas.height = Math.round(cssH * cam.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const [sprites] = await Promise.all([ensureSprites(cam.s * cam.dpr), applyBackdrop(this.canvas, cam)]);
    this.sprites = sprites;
  }

  render(p: RenderParams): void {
    const cam = this.cam;
    if (!cam || !this.sprites) return;
    const t0 = performance.now();
    const ctx = this.ctx;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cam.cssW, cam.cssH);
    this.painter.paint(ctx, { ox: cam.cssW / 2, oy: cam.oyGround, s: cam.s, dpr: cam.dpr }, p, this.sprites);
    this.lastMs = performance.now() - t0;
  }
}
