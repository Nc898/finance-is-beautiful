import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import '../styles/landing.css';

import { startHero } from './hero';
import { DEMOS, type Demo } from './demos';

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hero = document.getElementById('hero') as HTMLElement;
const grove = document.getElementById('grove') as HTMLCanvasElement;
const heroApi = startHero(hero, grove, () => motion.matches);

/* Reveal the page as one scene once the watercolor is painted (with a safety net if painting fails). */
const reveal = () => {
  if (document.documentElement.dataset.ready) return;
  document.documentElement.dataset.ready = '1';
  heroApi.begin();
};
window.setTimeout(reveal, 6000);

/* ---------- demonstrations list (data driven) ---------- */

const ARROW =
  '<svg class="demo-arrow" viewBox="0 0 22 12" aria-hidden="true"><path d="M1 6.2c4.6-.5 12.2-.4 18.4-.1M14.6 1.3c1.6 2.1 3.2 3.6 5.4 4.9-2.2 1.6-3.9 3.2-5.2 4.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The river's arrow: the shaft is a ripple of the current. */
const WAVE_ARROW =
  '<svg class="demo-arrow" viewBox="0 0 22 12" aria-hidden="true"><path d="M1 6.4c2.2-2.2 4.2-2.2 6.2 0s4 2.2 6.1 0c1.5-1.4 3.4-1.6 6.1-.3M14.6 1.3c1.6 2.1 3.2 3.6 5.4 4.9-2.2 1.6-3.9 3.2-5.2 4.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The vine's arrow: the shaft is a tendril, with a curl and a leaf on it. */
const TENDRIL_ARROW =
  '<svg class="demo-arrow" viewBox="0 0 22 12" aria-hidden="true"><path d="M1 7.2c2.6-.2 4.4-1.6 5.6-3.2.9-1.2 2.4-1.1 2.6.2.2 1.1-1 1.7-1.6.9M7.8 6.4c3.6.4 7.4-.1 11.6-.4M14.6 1.3c1.6 2.1 3.2 3.6 5.4 4.9-2.2 1.6-3.9 3.2-5.2 4.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.2 6.2c-.2 1.9.9 3.2 2.6 3.4.2-1.8-.8-3-2.6-3.4z" fill="currentColor" opacity=".55"/></svg>';

/** A few painted autumn leaves drifting around the vine's entry (decoration only). */
const LEAF_PATH = 'M12 1.5c.9 2.3 2.4 3.3 4.6 3.1-.6 1.8-.2 3.3 1.3 4.5-1.9.6-2.8 1.9-2.7 4 -1.7-.9-3.3-.8-4.7.3l-.5 6.1-.5-6.1c-1.4-1.1-3-1.2-4.7-.3.1-2.1-.8-3.4-2.7-4 1.5-1.2 1.9-2.7 1.3-4.5 2.2.2 3.7-.8 4.6-3.1z';
const LEAVES = [
  { cls: 'l1', col: '#c4502e' },
  { cls: 'l2', col: '#d98c32' },
  { cls: 'l3', col: '#a63a2a' },
  { cls: 'l4', col: '#e0a83c' },
  { cls: 'l5', col: '#b9532c' },
]
  .map(
    (l) =>
      `<svg class="vine-leaf ${l.cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${LEAF_PATH}" fill="${l.col}" fill-opacity=".78"/><path d="M12 4.5v15M12 9.5 8.6 7.4M12 9.5l3.4-2.1M12 13l-4.4-1.3M12 13l4.4-1.3" stroke="#6e2c18" stroke-opacity=".4" stroke-width=".7" fill="none" stroke-linecap="round"/></svg>`,
  )
  .join('');

function entry(d: Demo): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'demo-item';
  li.dataset.theme = d.theme;
  const a = document.createElement('a');
  a.className = 'demo';
  a.href = d.href;
  a.dataset.slug = d.slug;
  a.dataset.theme = d.theme;
  a.innerHTML = `
    <canvas class="demo-art" aria-hidden="true"></canvas>
    <div class="demo-copy">
      <h3 class="demo-title"></h3>
      <p class="demo-summary"></p>
      <span class="demo-cta"><span>Open the demonstration</span>${d.theme === 'river' ? WAVE_ARROW : d.theme === 'vine' ? TENDRIL_ARROW : ARROW}</span>
    </div>`;
  if (d.theme === 'vine') li.insertAdjacentHTML('afterbegin', `<div class="vine-leaves" aria-hidden="true">${LEAVES}</div>`);
  a.querySelector('.demo-title')!.textContent = d.title;
  a.querySelector('.demo-summary')!.textContent = d.summary;
  li.append(a);
  return li;
}

const list = document.getElementById('demo-list')!;
for (const d of DEMOS) list.append(entry(d));

/**
 * Paint each live still behind the curtain (before the reveal), so nothing heavy runs once the page is
 * showing; repaint later only if its box changes size.
 */
const previews = Array.from(list.querySelectorAll<HTMLCanvasElement>('.demo-art')).map((canvas, i) => {
  const demo = DEMOS[i]!;
  let lastW = 0;
  let timer = 0;
  const paint = async (): Promise<void> => {
    const w = canvas.clientWidth;
    if (w < 40 || Math.abs(w - lastW) < 2) return;
    lastW = w;
    await demo.paintPreview(canvas);
    canvas.classList.add('painted');
  };
  const ro = new ResizeObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void paint(), 160);
  });
  return paint().then(() => ro.observe(canvas));
});

/**
 * Reveal only once frames are flowing smoothly: newly inserted canvases get their compositor layers on the
 * next frames, and any settling stall should happen while only the paper is showing (capped at 700 ms).
 */
const whenSmooth = (): Promise<void> =>
  new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    let calm = 0;
    const step = (now: number) => {
      calm = now - last < 26 ? calm + 1 : 0;
      last = now;
      if (calm >= 3 || now - start > 700) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
void Promise.all([heroApi.ready, ...previews]).then(whenSmooth).then(reveal);

void heroApi.grown.then(() => {
  document.documentElement.dataset.grown = '1';
});
