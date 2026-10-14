/**
 * STUB (coordinator): a placeholder gardener that honours the contract in gardenerApi.ts so the scene and the
 * app can run before the real one exists. The gardener worker replaces this file entirely.
 */
import type { PlanId } from '../types';
import type { CreateGardener, Gardener, GardenerIntent } from './gardenerApi';
import { BENCH, COTTAGE, GARDENER_H, PATH_Y, PILE } from './geom';

export const createGardener: CreateGardener = (id: PlanId): Gardener => {
  let x = COTTAGE[id].root.x + (id === 'minimum' ? -30 : 30);
  let y = PATH_Y;
  let snips = 0;
  let strokes = 0;
  let clock = 0;
  let working = false;
  let tool = { x, y: y - GARDENER_H * 0.6 };
  const api: Gardener = {
    id,
    get snips() {
      return snips;
    },
    get strokes() {
      return strokes;
    },
    get working() {
      return working;
    },
    update(dt: number, intent: GardenerIntent, _t: number, reduced: boolean) {
      let gx = x;
      let gy = PATH_Y;
      if (intent.activity === 'prune' && intent.target) gx = intent.target.x;
      if (intent.activity === 'rake') {
        gx = PILE[id].x + (id === 'minimum' ? 30 : -30);
        gy = PILE[id].y;
      }
      if (intent.activity === 'rest') {
        gx = BENCH[id].x;
        gy = BENCH[id].y;
      }
      const k = reduced ? 1 : 1 - Math.exp(-dt * 2.5);
      x += (gx - x) * k;
      y += (gy - y) * k;
      const near = Math.abs(gx - x) < 6 && Math.abs(gy - y) < 6;
      working = intent.activity === 'prune' && near;
      tool = intent.target && working ? { ...intent.target } : { x, y: y - GARDENER_H * 0.6 };
      if (!reduced && near && intent.pace > 0 && (intent.activity === 'prune' || intent.activity === 'rake')) {
        clock += dt * intent.pace;
        while (clock >= 1) {
          clock -= 1;
          if (intent.activity === 'prune') snips++;
          else strokes++;
        }
      }
    },
    draw(ctx: CanvasRenderingContext2D) {
      ctx.save();
      ctx.fillStyle = 'rgba(60,50,40,0.85)';
      ctx.fillRect(x - 9, y - GARDENER_H, 18, GARDENER_H);
      ctx.strokeStyle = 'rgba(60,50,40,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - GARDENER_H * 0.7);
      ctx.lineTo(tool.x, tool.y);
      ctx.stroke();
      ctx.restore();
    },
    shears: () => ({ ...tool }),
    feet: () => ({ x, y }),
  };
  return api;
};
