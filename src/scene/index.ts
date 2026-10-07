/**
 * Scene entry point. createScene(canvas, opts) implements the SceneAPI contract (types.ts):
 *  - the visible canvas is TRANSPARENT and only ever receives trees (per frame);
 *  - paper + ground wash are a static backdrop painted once per size and installed as the canvas CSS background;
 *  - two trees at WORLD.treeX on a shared ground line, camera fit of the WORLD view band.
 */
import type { TreeId } from '../engine/types';
import { WORLD } from './types';
import type { SceneAPI, SceneFrame, SceneOptions, ScreenPoint, TreeAnchors } from './types';
import { TreePainter } from './treePainter';
import { ensureSprites, type Sprites } from './sprites';
import { applyBackdrop, fitCamera, type Camera } from './backdrop';
import { getModel } from './treeView';
import { H } from './treeModel';

export { TreeView, getModel } from './treeView';
export { WORLD } from './types';

const DEFAULT_SEEDS: Record<TreeId, number> = { A: 1337, B: 4242 };

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions = {}): SceneAPI {
  const ctx = canvas.getContext('2d')!;
  const seeds: Record<TreeId, number> = { ...DEFAULT_SEEDS, ...(opts.seeds ?? {}) } as Record<TreeId, number>;
  const painters: Record<TreeId, TreePainter> = { A: new TreePainter(getModel(seeds.A)), B: new TreePainter(getModel(seeds.B)) };
  let sprites: Sprites | null = null;
  let cam: Camera | null = null;
  let ox0 = 0;
  let destroyed = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let gen = 0;

  const resize = (w: number, h: number, ratio: number) => {
    const c = fitCamera(w, h, ratio, WORLD.width);
    cam = c;
    ox0 = (w - WORLD.width * c.s) / 2;
    canvas.width = Math.round(w * c.dpr);
    canvas.height = Math.round(h * c.dpr);
    const my = ++gen;
    void Promise.all([ensureSprites(c.s * c.dpr), applyBackdrop(canvas, c)]).then(([sp]) => {
      if (destroyed || my !== gen) return;
      sprites = sp;
      resolveReady();
    });
  };

  const worldToScreen = (x: number, y: number): ScreenPoint => {
    const c = cam ?? fitCamera(WORLD.width, WORLD.viewTop - WORLD.viewBottom, 1, WORLD.width);
    return { x: ox0 + x * c.s, y: c.oyGround - y * c.s };
  };

  return {
    ready,
    resize,
    render(frame: SceneFrame) {
      if (destroyed || !sprites || !cam) return;
      ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cam.cssW, cam.cssH);
      for (const t of frame.trees) {
        if (!t.planted) continue;
        painters[t.id].paint(
          ctx,
          { ox: ox0 + WORLD.treeX[t.id] * cam.s, oy: cam.oyGround, s: cam.s },
          { maturity: t.maturity, months: t.monthsSincePlanting, timeMs: frame.timeMs, wind: !frame.reducedMotion },
          sprites,
        );
      }
    },
    worldToScreen,
    anchorsFor(id: TreeId, maturity: number): TreeAnchors {
      return { base: worldToScreen(WORLD.treeX[id], 0), top: worldToScreen(WORLD.treeX[id], maturity * H) };
    },
    destroy() {
      destroyed = true;
    },
  };
}
