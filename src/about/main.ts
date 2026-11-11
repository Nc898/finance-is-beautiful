/**
 * The About page: Nick's note, then the page ends where the landing page begins, on a strip of its painted
 * meadow and soil with a few of the same trees (the landing grove's painter, no birds).
 */
import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import '../styles/grove.css';
import '../styles/about.css';

import { startHero, type GroveTree } from '../landing/hero';

/** the landing grove's own trees (same seeds) in a new order: a row of different ages, the oldest off-centre */
const GROVE: GroveTree[] = [
  { seed: 777, x: 0.08, m: 0.48, bills: 0 },
  { seed: 2468, x: 0.25, m: 0.78, bills: 5 },
  { seed: 9031, x: 0.43, m: 0.4, bills: 0 },
  { seed: 1337, x: 0.62, m: 1.0, bills: 10 },
  { seed: 4242, x: 0.86, m: 0.66, bills: 3 },
  // far horizon
  { seed: 5510, x: 0.35, m: 0.42, bills: 0, bg: true },
  { seed: 6120, x: 0.76, m: 0.38, bills: 0, bg: true },
];

const band = document.getElementById('about-grove') as HTMLElement;
const canvas = document.getElementById('about-grove-canvas') as HTMLCanvasElement;
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const grove = startHero(band, canvas, () => motion.matches, { grove: GROVE, birds: false, crownTop: 0.16 });

// fade the painted strip in once it is ready (it is below the text, so nothing waits for it)
void grove.ready.then(() => {
  document.documentElement.dataset.ready = '1';
  grove.begin();
});
