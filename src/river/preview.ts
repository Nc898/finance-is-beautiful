/**
 * The river's still for the landing page: Against the Current mid-story (year 18 at the defaults), the boats
 * spread out on the river with savings and investing caught mid-stroke. Painted live by the real scene; the
 * landing page shows a baked copy of it (scripts/bake-river-preview.mjs) so the river never weighs on its load.
 */
import { createRiverScene } from './scene';
import { allBoats, effortOf, riverScale } from './engine';
import { DEFAULT_RIVER_INPUTS, type RiverFrame, type RiverSceneAPI } from './types';

/** the year shown, how far toward the dock the boats are drawn, and a gentle zoom so the boats fill the card */
const YEAR = 18;
const FIT = 0.86;
const ZOOM = 1.32;

export async function paintRiverStill(canvas: HTMLCanvasElement, w: number, h: number, dpr: number): Promise<RiverSceneAPI> {
  const scene = createRiverScene(canvas);
  // no lettering on a still, so no signposts; the dock and start line still mark "today"
  scene.setPosts([]);
  scene.setInsets({ top: 0, bottom: 0 });
  scene.resize(w, h, dpr);
  await scene.ready;
  const inputs = DEFAULT_RIVER_INPUTS;
  const scale = riverScale(inputs);
  const boats = allBoats(inputs, YEAR).map((b) => ({
    id: b.id,
    u: (b.logReal / scale) * FIT,
    effort: effortOf(inputs, b.id),
    waterSpeed: 0,
  })) as RiverFrame['boats'];
  // a couple of seconds of rowing, so the rowers settle into the stroke before the still is taken
  for (let t = 0; t <= 2600; t += 1000 / 30) {
    scene.render({ timeMs: t, current: inputs.inflation, flowing: true, boats, reducedMotion: false, camera: { zoom: ZOOM, focusU: 0 } });
  }
  return scene;
}
