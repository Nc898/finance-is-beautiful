import { describe, expect, it } from 'vitest';
import { Rand } from '../../src/scene/prng';
import { paintVerges } from '../../src/orchard/scene/flowers';
import { TRACK } from '../../src/orchard/scene/geom';

/**
 * A 2D context that records nothing and fails as a browser does: arc and ellipse throw (IndexSizeError) on a
 * negative radius. Everything else is a no-op, so the painters run headless.
 */
function strictCtx(): CanvasRenderingContext2D {
  const bad = (r: number): void => {
    if (r < 0) throw new RangeError(`negative radius ${r}`);
  };
  const target: Record<string, unknown> = {
    arc: (_x: number, _y: number, r: number) => bad(r),
    ellipse: (_x: number, _y: number, rx: number, ry: number) => {
      bad(rx);
      bad(ry);
    },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    getLineDash: () => [],
  };
  return new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : () => undefined),
    set: (t, k: string, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('orchard verges', () => {
  it('paint for a normal camera', () => {
    expect(() => paintVerges(strictCtx(), new Rand(61627), -100, 1100, 660)).not.toThrow();
  });

  // The camera's bottom edge sits above the track when the canvas is shorter than the header and label bands (a
  // hidden or tiny viewport). The verge used to scatter flowers up the picture, where their depth size is negative.
  it.each([0, 120, 400, TRACK.y0, TRACK.y1])('paint without throwing when the view ends at y = %d', (yBottom) => {
    expect(() => paintVerges(strictCtx(), new Rand(61627), -100, 1100, yBottom)).not.toThrow();
  });
});
