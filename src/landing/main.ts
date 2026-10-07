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

/* ---------- demonstrations list (data driven) ---------- */

const ARROW =
  '<svg class="demo-arrow" viewBox="0 0 22 12" aria-hidden="true"><path d="M1 6.2c4.6-.5 12.2-.4 18.4-.1M14.6 1.3c1.6 2.1 3.2 3.6 5.4 4.9-2.2 1.6-3.9 3.2-5.2 4.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function entry(d: Demo): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'demo-item';
  const a = document.createElement('a');
  a.className = 'demo';
  a.href = d.href;
  a.dataset.slug = d.slug;
  a.innerHTML = `
    <canvas class="demo-art" aria-hidden="true"></canvas>
    <div class="demo-copy">
      <h3 class="demo-title"></h3>
      <p class="demo-summary"></p>
      <span class="demo-cta"><span>Open the demonstration</span>${ARROW}</span>
    </div>`;
  a.querySelector('.demo-title')!.textContent = d.title;
  a.querySelector('.demo-summary')!.textContent = d.summary;
  li.append(a);
  return li;
}

const list = document.getElementById('demo-list')!;
for (const d of DEMOS) list.append(entry(d));

/** Paint each live still once it is near the viewport, and again if its box changes size. */
list.querySelectorAll<HTMLCanvasElement>('.demo-art').forEach((canvas, i) => {
  const demo = DEMOS[i]!;
  let lastW = 0;
  let timer = 0;
  const paint = () => {
    const w = canvas.clientWidth;
    if (w < 40 || Math.abs(w - lastW) < 2) return;
    lastW = w;
    void demo.paintPreview(canvas);
  };
  const ro = new ResizeObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(paint, 160);
  });
  const io = new IntersectionObserver(
    (es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        // let the hero finish its first paint before spending time on the vignettes
        void heroApi.ready.then(() => {
          paint();
          ro.observe(canvas);
        });
      }
    },
    { rootMargin: '600px 0px' },
  );
  io.observe(canvas);
});

void heroApi.grown.then(() => {
  document.documentElement.dataset.grown = '1';
});
