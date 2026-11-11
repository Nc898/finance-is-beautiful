/**
 * A plain stand-in for the shop (BreadSceneAPI): paper, the board's text as plain text, the basket's counts. It lets
 * the page run, be tested and be laid out before the real scene (src/bread/scene) exists, and is what the page falls
 * back to if that scene is missing. It paints nothing of the watercolor.
 */
import { ITEMS, ITEM_KEYS } from '../engine';
import type { BreadFrame, BreadLabel, BreadSceneAPI, BreadScreenPoint } from '../types';

export function createStandInScene(canvas: HTMLCanvasElement): BreadSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let w = 1;
  let h = 1;
  let dpr = 1;
  let insets = { top: 0, bottom: 0, side: 0 };
  let last: BreadFrame | null = null;

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f1e6cc';
    ctx.fillRect(0, 0, w, h);
    if (!last) return;
    const { board, basket } = last;
    ctx.fillStyle = '#2f2a22';
    ctx.font = '16px Figtree Variable, system-ui, sans-serif';
    ctx.textAlign = 'left';
    const x = insets.side / 2 + 120;
    let y = insets.top + 40;
    ctx.fillText(`Board: ${board.year}`, x, y);
    for (const k of ITEM_KEYS) {
      y += 24;
      ctx.fillText(`${ITEMS[k].label}  ${board.prices[k]}   (basket: ${basket.qty[k]})`, x, y);
    }
    ctx.fillText(`Total  ${board.total}`, x, y + 28);
  };

  return {
    ready: Promise.resolve(),
    resize(cssWidth, cssHeight, devicePixelRatio) {
      w = cssWidth;
      h = cssHeight;
      dpr = devicePixelRatio;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw();
    },
    setInsets(i) {
      insets = { top: i.top, bottom: i.bottom, side: i.side ?? 0 };
    },
    render(frame) {
      last = frame;
      draw();
    },
    labelAnchor(label: BreadLabel): BreadScreenPoint {
      // the composition sits in the width the panel leaves, centred; the bottom band starts at its top
      const lo = insets.side / 2;
      const hi = w - insets.side / 2;
      const at = label === 'basket' ? 0.2 : label === 'pay' ? 0.8 : 0.5;
      return { x: lo + (hi - lo) * at, y: h - insets.bottom };
    },
    destroy() {
      ctx.clearRect(0, 0, w, h);
    },
  };
}
