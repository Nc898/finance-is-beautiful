/**
 * Scene entry point. createScene(canvas, opts) implements the SceneAPI contract (types.ts):
 *  - the visible canvas is TRANSPARENT and only ever receives trees, roots, planting spots, pulse and loupe;
 *  - paper + meadow + soil cut-away are a static backdrop painted once per size and installed as the canvas CSS
 *    background (and kept as an offscreen canvas for the loupe);
 *  - two trees at WORLD.treeX on a shared ground line; the camera fits the WORLD view band into the canvas minus insets.
 */
import type { TreeId } from '../engine/types';
import { WORLD } from './types';
import type { SceneAPI, SceneFrame, SceneOptions, ScreenPoint, TreeAnchors } from './types';
import { TreePainter } from './treePainter';
import { ensureSprites, type Sprites } from './sprites';
import { applyBackdrop, fitCamera, type Camera, type Insets } from './backdrop';
import { getModel } from './treeView';
import { H, YB0 } from './treeModel';
import { clamp, smoothstep } from './prng';

export { TreeView, getModel } from './treeView';
export { WORLD } from './types';

const DEFAULT_SEEDS: Record<TreeId, number> = { A: 1337, B: 4242 };

type Loupe = NonNullable<SceneFrame['loupe']>;

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions = {}): SceneAPI {
  const ctx = canvas.getContext('2d')!;
  const seeds: Record<TreeId, number> = { ...DEFAULT_SEEDS, ...(opts.seeds ?? {}) } as Record<TreeId, number>;
  const painters: Record<TreeId, TreePainter> = { A: new TreePainter(getModel(seeds.A)), B: new TreePainter(getModel(seeds.B)) };
  let sprites: Sprites | null = null;
  let bg: HTMLCanvasElement | null = null;
  let cam: Camera | null = null;
  let size = { w: 0, h: 0, ratio: 1 };
  let insets: Insets = { top: 0, bottom: 0 };
  let destroyed = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let gen = 0;
  const lastPlanted: Partial<Record<TreeId, boolean>> = {};
  const flipAt: Partial<Record<TreeId, number>> = {};

  const layout = () => {
    if (size.w <= 0 || size.h <= 0) return;
    const c = fitCamera(size.w, size.h, size.ratio, WORLD.width, insets);
    cam = c;
    canvas.width = Math.round(size.w * c.dpr);
    canvas.height = Math.round(size.h * c.dpr);
    const my = ++gen;
    void Promise.all([ensureSprites(c.s * c.dpr), applyBackdrop(canvas, c)]).then(([sp, b]) => {
      if (destroyed || my !== gen) return;
      sprites = sp;
      bg = b;
      resolveReady();
    });
  };
  const resize = (w: number, h: number, ratio: number) => {
    size = { w, h, ratio };
    layout();
  };
  const setInsets = (i: Insets) => {
    insets = { top: Math.max(0, i.top), bottom: Math.max(0, i.bottom) };
    layout();
  };

  const camNow = (): Camera => cam ?? fitCamera(WORLD.width, WORLD.viewTop - WORLD.viewBottom, 1, WORLD.width, insets);
  const worldToScreen = (x: number, y: number): ScreenPoint => {
    const c = camNow();
    return { x: c.ox0 + x * c.s, y: c.oyGround - y * c.s };
  };

  /** the loupe's centre/diameter: outer upper side of the tree, never over a crown at the current maturities */
  const placeLoupe = (c: Camera, id: TreeId, trees: SceneFrame['trees']): { cx: number; cy: number; d: number } => {
    const d0 = Math.min(220, 0.3 * size.w);
    const boxes = trees
      .filter((t) => t.planted)
      .map((t) => {
        const m = Math.max(t.maturity, 0.02);
        const wc = Math.max(40, m * H * (0.5 + 0.214 * smoothstep((m - 0.1) / 0.9)) + 40);
        const x = c.ox0 + WORLD.treeX[t.id] * c.s;
        return { l: x - (wc / 2) * c.s, r: x + (wc / 2) * c.s, t: c.oyGround - (m * H + 12) * c.s, b: c.oyGround + 16 * c.s };
      });
    const hit = (cx: number, cy: number, d: number) =>
      boxes.some((b) => cx + d / 2 > b.l && cx - d / 2 < b.r && cy + d / 2 > b.t && cy - d / 2 < b.b);
    const pad = 10;
    const top = Math.max(insets.top, 0) + pad;
    const tx = c.ox0 + WORLD.treeX[id] * c.s;
    const outerX = (d: number) => (id === 'A' ? pad + d / 2 : size.w - pad - d / 2);
    for (const f of [1, 0.86, 0.72, 0.6, 0.5]) {
      const d = d0 * f;
      const cands: Array<[number, number]> = [
        [outerX(d), top + d / 2],
        [clamp(tx + (id === 'A' ? -1 : 1) * (d * 0.8), d / 2 + pad, size.w - d / 2 - pad), top + d / 2],
        [clamp(tx, d / 2 + pad, size.w - d / 2 - pad), top + d / 2],
        [outerX(d), top + d * 1.1],
      ];
      for (const [cx, cy] of cands) if (!hit(cx, cy, d)) return { cx, cy, d };
    }
    const d = d0 * 0.5;
    return { cx: outerX(d), cy: top + d / 2, d };
  };

  const drawLoupe = (l: Loupe, frame: SceneFrame, c: Camera, sp: Sprites) => {
    if (l.strength <= 0.01 || !bg) return;
    const t = frame.trees.find((q) => q.id === l.tree)!;
    if (!t.planted) return;
    const painter = painters[l.tree];
    const m = Math.max(t.maturity, 0.001);
    const mEff = Math.max(m, t.monthsSincePlanting > 0 ? 0.04 * smoothstep(t.monthsSincePlanting / 3.5) : 0);
    const { cx, cy, d } = placeLoupe(c, l.tree, frame.trees);
    const k = clamp(l.strength, 0, 1);
    const r = (d / 2) * (0.92 + 0.08 * k);
    const apex = painter.apexWorld(mEff);
    let lx = 0;
    let ly = 0;
    let S = 2.6 * c.s;
    if (l.target === 'roots') {
      // frame seedling + soil + root tips; zoom adapts up to ~5x when the tree is tiny
      // tight framing: seedling + cotyledons + the visible root threads fill ~60 % of the circle
      const ext = painter.rootExtent(mEff);
      const hUp = Math.max(mEff * H * 1.15 + 3, 12);
      const hDown = Math.max(ext.depth + 3, 7);
      const wSpan = Math.max(ext.spread * 2 + 6, 22);
      const box = Math.max(hUp + hDown, wSpan);
      S = clamp((d * 0.6) / box, 2.6 * c.s, 9 * c.s);
      ly = (hUp - hDown) / 2;
      lx = 0;
    } else if (l.target === 'branches') {
      // the Y-fork and scaffold limbs just under the crown
      lx = apex.x * 0.1;
      ly = (YB0 - 24) * mEff;
      S = clamp(2.6 * c.s * (mEff < 0.4 ? 1.3 : 1), 2.6 * c.s, 3.6 * c.s);
    } else {
      lx = apex.x - (0.22 + 0.5 * (1 - smoothstep(mEff / 0.3))) * mEff * 0.5 * 400;
      ly = apex.y * 0.8;
    }
    const z = S / c.s;
    const tgtX = c.ox0 + (WORLD.treeX[l.tree] + lx) * c.s;
    const tgtY = c.oyGround - ly * c.s;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#FBF6EA';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // magnified paper + meadow + soil
    {
      const dprb = bg.width / size.w;
      const sw = (2 * r) / z;
      ctx.drawImage(bg, (tgtX - sw / 2) * dprb, (tgtY - sw / 2) * dprb, sw * dprb, sw * dprb, cx - r, cy - r, 2 * r, 2 * r);
    }
    // the same tree, re-rendered at the loupe scale (roots, soil, canopy edge...)
    painter.paint(
      ctx,
      { ox: cx - lx * S, oy: cy + ly * S, s: S, dpr: c.dpr },
      { maturity: t.maturity, months: t.monthsSincePlanting, timeMs: frame.timeMs, wind: !frame.reducedMotion, plantK: 1, cull: { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r } },
      sp,
    );
    ctx.restore();
    // ring + dashed leader to the target
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = 'rgba(47,42,34,0.95)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const dx = tgtX - cx;
    const dy = tgtY - cy;
    const dl = Math.hypot(dx, dy) || 1;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(47,42,34,0.7)';
    ctx.beginPath();
    ctx.moveTo(cx + (dx / dl) * r, cy + (dy / dl) * r);
    ctx.lineTo(tgtX - (dx / dl) * 4, tgtY - (dy / dl) * 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tgtX, tgtY, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  return {
    ready,
    resize,
    setInsets,
    render(frame: SceneFrame) {
      if (destroyed || !sprites || !cam) return;
      const c = cam;
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, c.cssW, c.cssH);
      for (const t of frame.trees) {
        if (lastPlanted[t.id] === false && t.planted) flipAt[t.id] = frame.timeMs;
        lastPlanted[t.id] = t.planted;
        const ox = c.ox0 + WORLD.treeX[t.id] * c.s;
        const view = { ox, oy: c.oyGround, s: c.s, dpr: c.dpr };
        if (!t.planted) {
          painters[t.id].paint(ctx, view, { maturity: 0, months: 0, timeMs: frame.timeMs, wind: false, unplanted: true }, sprites);
          continue;
        }
        const f0 = flipAt[t.id];
        const plantK = f0 === undefined || frame.reducedMotion ? 1 : clamp((frame.timeMs - f0) / 1400, 0, 1);
        painters[t.id].paint(
          ctx,
          view,
          { maturity: t.maturity, months: t.monthsSincePlanting, timeMs: frame.timeMs, wind: !frame.reducedMotion, pulse: t.pulse, plantK },
          sprites,
        );
      }
      if (frame.loupe) drawLoupe(frame.loupe, frame, c, sprites);
    },
    worldToScreen,
    anchorsFor(id: TreeId, maturity: number): TreeAnchors {
      const c = camNow();
      const m = clamp(maturity, 0, 1);
      const ap = painters[id].apexWorld(m);
      return {
        base: { x: c.ox0 + WORLD.treeX[id] * c.s, y: c.oyGround },
        top: { x: c.ox0 + (WORLD.treeX[id] + ap.x) * c.s, y: c.oyGround - ap.y * c.s },
      };
    },
    destroy() {
      destroyed = true;
    },
  };
}

