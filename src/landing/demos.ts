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
  /** The entry's accent and ornament on the landing page: the grove's emerald, or the river's teal and waves. */
  theme: 'grove' | 'river';
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

/** Draw an image into the canvas like CSS `object-fit: cover`, at the device pixel ratio. */
function drawCover(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth));
  const h = Math.max(1, Math.round(canvas.clientHeight));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  const k = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const dw = img.naturalWidth * k;
  const dh = img.naturalHeight * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

/**
 * Against the Current mid-story. The still is baked from the real river scene (scripts/bake-river-preview.mjs),
 * so the landing page loads one small image instead of building the whole river; if the image is missing it
 * paints the scene live instead.
 */
async function paintAgainstTheCurrent(canvas: HTMLCanvasElement): Promise<void> {
  const img = new Image();
  img.src = '/assets/preview-river.webp';
  try {
    await img.decode();
    drawCover(canvas, img);
  } catch {
    const { paintRiverStill } = await import('../river/preview');
    previewScenes.get(canvas)?.destroy();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    previewScenes.set(canvas, await paintRiverStill(canvas, Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), dpr));
  }
}

export const DEMOS: Demo[] = [
  {
    slug: 'time-to-grow',
    title: 'Time to Grow',
    summary: 'Two trees, the same monthly contribution, different starting ages.',
    href: './time-to-grow.html',
    theme: 'grove',
    paintPreview: paintTimeToGrow,
  },
  {
    slug: 'against-the-current',
    title: 'Against the Current',
    summary: 'Three rowboats, the same money, and a current of rising prices.',
    href: './against-the-current.html',
    theme: 'river',
    paintPreview: paintAgainstTheCurrent,
  },
];
