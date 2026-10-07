/**
 * The collection. Adding a demonstration is one new object in DEMOS: the landing page renders the list from it.
 */
import { createScene } from '../scene';

export interface Demo {
  slug: string;
  title: string;
  /** One sentence. */
  summary: string;
  href: string;
  /** Paints a small live still into the given canvas (sized by its CSS box). Called again on resize. */
  paintPreview(canvas: HTMLCanvasElement): Promise<void>;
}

const previewScenes = new WeakMap<HTMLCanvasElement, { destroy(): void }>();

/** End state of Time to Grow: Tree A started at 25, Tree B at 35, both standing with their bills in the canopy. */
async function paintTimeToGrow(canvas: HTMLCanvasElement): Promise<void> {
  const w = Math.max(1, Math.round(canvas.clientWidth));
  const h = Math.max(1, Math.round(canvas.clientHeight));
  previewScenes.get(canvas)?.destroy();
  const scene = createScene(canvas);
  previewScenes.set(canvas, scene);
  scene.setInsets({ top: 0, bottom: 0 });
  scene.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  await scene.ready;
  scene.render({
    timeMs: 0,
    reducedMotion: true,
    trees: [
      { id: 'A', planted: true, maturity: 1, monthsSincePlanting: 480, pulse: -1, bills: 40, startAge: 25 },
      { id: 'B', planted: true, maturity: 0.715, monthsSincePlanting: 360, pulse: -1, bills: 30, startAge: 35 },
    ],
  });
}

export const DEMOS: Demo[] = [
  {
    slug: 'time-to-grow',
    title: 'Time to Grow',
    summary: 'Two trees, the same monthly contribution, different starting ages.',
    href: './time-to-grow.html',
    paintPreview: paintTimeToGrow,
  },
];
