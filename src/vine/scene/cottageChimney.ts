/**
 * The chimney stack: rubble stone painted like the walls with a lead apron where it meets the roof, a corbelled
 * cap, and two clay pots, sooty at the mouth. Its shadow falls across the roof to the lower right.
 */
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { edgeInk, fillPoly, lump, paintStone, paperLift, shift, softWash, type Paint } from './cottagePaint';

export const CHIMNEY_TOP = 160;

const SOOT = ['#C4B195', '#B8A68C', '#CDBB9E', '#AD9F88', '#C0AA8A', '#B7B0A2'];

export function paintChimney(P: Paint, chX: number, roofClip: number[], baseY: number): void {
  const { ctx, rnd } = P;
  const w = 30;
  const x0 = chX - w / 2;
  const shaftTop = CHIMNEY_TOP + 12;

  // the shadow on the roof (sun upper left, so it falls to the lower right)
  ctx.save();
  tracePoly(ctx, roofClip);
  ctx.clip();
  softWash(ctx, [x0 + w - 4, baseY - 2, x0 + w + 4, baseY - 2, x0 + w + 40, baseY + 36, x0 + w + 20, baseY + 40, x0 + 6, baseY + 6], '#1C1A34', 0.4, rnd, 4, 0.6, 0.05);
  ctx.restore();

  // ---- the shaft, course by course
  fillPoly(ctx, [x0, shaftTop, x0 + w, shaftTop, x0 + w, baseY, x0, baseY], '#D2C6AC', 1);
  let y = baseY;
  let k = 0;
  while (y > shaftTop - 1) {
    const ch = rnd.range(7.4, 10.4);
    let x = x0 - (k % 2 === 0 ? 0 : rnd.range(3, 7));
    while (x < x0 + w) {
      const sw = rnd.range(9, 17);
      const a = Math.max(x, x0);
      const b = Math.min(x + sw, x0 + w);
      if (b - a > 2.4) {
        const darker = Math.max(0, (shaftTop + 26 - y) / 26);
        const col = mix(rnd.pick(SOOT), '#5A4E48', darker * 0.2 + 0.03);
        paintStone(P, a + 0.5, Math.max(shaftTop, y - ch) + 0.2, b - a - 1, Math.min(ch, y - shaftTop) - 0.2, col, { lichen: 0.08, ink: 0.7, shadow: 0.9 });
      }
      x += sw;
    }
    y -= ch;
    k++;
  }
  // the shaft turns into shade toward the right and takes soot toward the top
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, 'rgba(255,238,196,0.2)');
  g.addColorStop(0.45, 'rgba(255,238,196,0)');
  g.addColorStop(1, 'rgba(56,42,70,0.36)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, shaftTop, w, baseY - shaftTop);
  const sg = ctx.createLinearGradient(0, shaftTop, 0, shaftTop + 24);
  sg.addColorStop(0, 'rgba(46,36,34,0.3)');
  sg.addColorStop(1, 'rgba(46,36,34,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x0, shaftTop, w, 24);
  edgeInk(P, [x0 - 0.2, shaftTop, x0, (shaftTop + baseY) / 2, x0 - 0.1, baseY], 0.4, 0.4, { dash: [6, 14] });
  edgeInk(P, [x0 + w + 0.2, shaftTop, x0 + w, (shaftTop + baseY) / 2, x0 + w + 0.1, baseY], 0.7, 0.62, { dash: [6, 14] });

  // ---- lead apron where the stack meets the roof: stepped and creased
  const ap = [x0 - 3.4, baseY - 5, x0 + w + 3.4, baseY - 5, x0 + w + 5.6, baseY + 4.2, x0 - 5.6, baseY + 4.2];
  fillPoly(ctx, shift(ap, 0.6, 1.4), '#1C1A34', 0.3);
  fillPoly(ctx, deform(ap, rnd, 1, 0.012), '#8C93A0', 0.97);
  ctx.save();
  tracePoly(ctx, ap);
  ctx.clip();
  const lg = ctx.createLinearGradient(0, baseY - 5, 0, baseY + 4.2);
  lg.addColorStop(0, 'rgba(255,255,255,0.12)');
  lg.addColorStop(1, 'rgba(30,30,50,0.36)');
  ctx.fillStyle = lg;
  ctx.fillRect(x0 - 6, baseY - 5, w + 12, 10);
  ctx.fillStyle = rgba('#E8ECF4', 0.45);
  ribbon(ctx, [x0 - 3, baseY - 4.6, x0 + w / 2, baseY - 4.4, x0 + w + 3, baseY - 4.6], 0.7, 0.9);
  ctx.restore();
  edgeInk(P, [x0 - 5.6, baseY + 4.2, x0 + w / 2, baseY + 4.5, x0 + w + 5.6, baseY + 4.2], 0.5, 0.5, { dash: [8, 20] });

  // ---- corbelled cap: a drip course, then the cap slab projecting at the top
  paintStone(P, x0 - 1.8, shaftTop - 5.4, w + 3.6, 5, '#D6CAB0', { dressed: true, lit: 0.5, shadow: 0.8, ink: 0.9 });
  paintStone(P, x0 - 3.8, CHIMNEY_TOP - 0.6, w + 7.6, 6, '#E2D6BC', { dressed: true, lit: 0.8, shadow: 1, ink: 0.95, round: 0.8 });
  paperLift(P, [x0 - 3, CHIMNEY_TOP + 0.2, x0 + w / 2, CHIMNEY_TOP + 0.1, x0 + w + 3, CHIMNEY_TOP + 0.2], 0.45, 0.8);
  paperLift(P, [x0 - 1, shaftTop - 4.8, x0 + w + 1, shaftTop - 4.8], 0.35, 0.6);
  softWash(ctx, [x0 - 1, shaftTop - 0.4, x0 + w + 3, shaftTop - 0.4, x0 + w + 3, shaftTop + 5, x0, shaftTop + 5], '#2E2230', 0.3, rnd, 3, 0.6);

  // ---- two clay pots with banded rims, soot staining the mouths
  for (const [i, px] of [chX - 6.6, chX + 6.4].entries()) {
    const top = CHIMNEY_TOP - 11.6 - i * 0.6;
    const bot = CHIMNEY_TOP;
    const pot = [px - 3.4, bot, px - 3.6, top + 2.6, px - 4.6, top + 2.2, px - 4.6, top, px + 4.6, top, px + 4.6, top + 2.2, px + 3.6, top + 2.6, px + 3.4, bot];
    fillPoly(ctx, shift(pot, 0.9, 0.5), '#2E2230', 0.2);
    fillPoly(ctx, deform(pot, rnd, 1, 0.01), mix('#B8643C', '#C98A52', i * 0.4), 0.97);
    ctx.save();
    tracePoly(ctx, pot);
    ctx.clip();
    const gg = ctx.createLinearGradient(px - 4.6, 0, px + 4.6, 0);
    gg.addColorStop(0, 'rgba(255,232,190,0.5)');
    gg.addColorStop(0.4, 'rgba(255,232,190,0)');
    gg.addColorStop(1, 'rgba(70,28,20,0.5)');
    ctx.fillStyle = gg;
    ctx.fillRect(px - 5, top, 10, bot - top);
    // a dry-brush band of darker clay and the soot at the mouth
    ctx.fillStyle = rgba('#7A3A22', 0.28);
    ctx.fillRect(px - 5, top + 5.4, 10, 0.9);
    const st = ctx.createLinearGradient(0, top, 0, top + 5);
    st.addColorStop(0, 'rgba(34,26,26,0.62)');
    st.addColorStop(1, 'rgba(34,26,26,0)');
    ctx.fillStyle = st;
    ctx.fillRect(px - 5, top, 10, 5);
    ctx.restore();
    // the mouth: a dark ellipse
    fillPoly(ctx, lump(px, top + 0.2, 4.2, 1.1, rnd, 10, 0.06), '#2A2020', 0.9);
    ctx.fillStyle = rgba('#E8B890', 0.45);
    ribbon(ctx, [px - 4.6, top + 1.2, px - 4.4, top + 2.2], 0.5, 0.9);
    edgeInk(P, [px + 4.4, top + 1, px + 3.6, top + 2.8, px + 3.4, bot - 0.5], 0.5, 0.55, { dash: [4, 10] });
    edgeInk(P, [px - 4.6, top + 2.3, px + 4.6, top + 2.4], 0.35, 0.4, { dash: [3, 6] });
  }
}
