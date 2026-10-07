/**
 * The grove: five trees from the real watercolor engine on one shared scale and ground line.
 * They grow in on load, then rest with subtle wind. Per frame only the trees are painted; paper, sky, meadow
 * and soil are the canvas CSS background (see backdrop.ts).
 */
import { getModel } from '../scene';
import { TreePainter } from '../scene/treePainter';
import { ensureSprites, type Sprites } from '../scene/sprites';
import { HORIZON_UP, applyHeroBackdrop, heroGeometry, type HeroGeometry } from './backdrop';

interface GroveTree {
  seed: number;
  /** trunk x as a fraction of the hero width */
  x: number;
  /** final maturity */
  m: number;
  bills: number;
  /** stagger before this tree starts growing, seconds */
  delay: number;
  /** stands on the far horizon, paler and behind the main row */
  bg?: boolean;
}

const GROVE: GroveTree[] = [
  // main row: irregular gaps, one pair standing close
  { seed: 9031, x: 0.09, m: 0.42, bills: 0, delay: 0.14 },
  { seed: 4242, x: 0.268, m: 0.7, bills: 4, delay: 0.0 },
  { seed: 1337, x: 0.432, m: 1.0, bills: 12, delay: 0.24 },
  { seed: 2468, x: 0.66, m: 0.82, bills: 6, delay: 0.08 },
  { seed: 777, x: 0.878, m: 0.55, bills: 0, delay: 0.4 },
  // far horizon
  { seed: 5510, x: 0.185, m: 0.4, bills: 0, delay: 0.3, bg: true },
  { seed: 3307, x: 0.56, m: 0.5, bills: 0, delay: 0.1, bg: true },
  { seed: 6120, x: 0.775, m: 0.33, bills: 0, delay: 0.45, bg: true },
];
const GROW_S = 1.8;
const START_M = 0.02;
const smoother = (t: number) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export interface Hero {
  /** resolves when the grove is drawn at its first size */
  ready: Promise<void>;
  /** resolves when the grow-in has finished */
  grown: Promise<void>;
  /** start the grow-in (called when the page is revealed) */
  begin(): void;
  destroy(): void;
}

export function startHero(hero: HTMLElement, canvas: HTMLCanvasElement, reduced: () => boolean): Hero {
  const ctx = canvas.getContext('2d')!;
  const painters = GROVE.map((t) => new TreePainter(getModel(t.seed)));
  // large trees last so crowns overlap the smaller ones behind
  const order = GROVE.map((_, i) => i)
    .filter((i) => !GROVE[i]!.bg)
    .sort((a, b) => GROVE[a]!.m - GROVE[b]!.m);
  const bgOrder = GROVE.map((_, i) => i).filter((i) => GROVE[i]!.bg);
  const allIdx = GROVE.map((_, i) => i);

  let geo: HeroGeometry | null = null;
  let sprites: Sprites | null = null;
  /** paper, sky, meadow and soil, painted once per size and copied in as the first layer of each frame */
  let heroBg: HTMLCanvasElement | null = null;
  let t0 = -1;
  let visible = true;
  let raf = 0;
  let destroyed = false;
  let gen = 0;
  let resolveReady: () => void = () => {};
  let resolveGrown: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  const grown = new Promise<void>((r) => (resolveGrown = r));

  /** one transparent layer per tree, so wind can repaint a few trees per frame and the rest are re-used */
  interface Layer {
    cv: HTMLCanvasElement;
    cssW: number;
    cssH: number;
    /** screen position of the layer's top-left (css px) */
    x: number;
    y: number;
    /** timeMs of the last paint; -1 = never */
    at: number;
  }
  let layers: Layer[] = [];
  /** the far horizon trees are composed here, hazed, then laid under the main row at partial alpha */
  let bgComp: HTMLCanvasElement | null = null;
  const LAYER_UP = 612; // world units above the ground line
  const LAYER_DOWN = 100; // below it (roots)
  const LAYER_W = 620;

  const buildLayers = (g: HeroGeometry) => {
    layers = GROVE.map((t) => {
      const cssW = Math.ceil(LAYER_W * g.s);
      const cssH = Math.ceil((LAYER_UP + LAYER_DOWN) * g.s);
      const cv = document.createElement('canvas');
      cv.width = Math.round(cssW * g.dpr);
      cv.height = Math.round(cssH * g.dpr);
      const up = t.bg ? HORIZON_UP : 0;
      return { cv, cssW, cssH, x: t.x * g.w - cssW / 2, y: g.groundY - (LAYER_UP + up) * g.s, at: -1 };
    });
    bgComp = document.createElement('canvas');
    bgComp.width = Math.round(g.w * g.dpr);
    bgComp.height = Math.round(g.h * g.dpr);
  };

  const paintLayer = (i: number, now: number, secs: number, still: boolean) => {
    const g = geo!;
    const t = GROVE[i]!;
    const L = layers[i]!;
    const lc = L.cv.getContext('2d')!;
    lc.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    lc.clearRect(0, 0, L.cssW, L.cssH);
    const e = smoother((secs - t.delay) / GROW_S);
    lc.save();
    if (t.bg) {
      // the horizon is a soft wash: keep the roots out of the meadow in front of it
      lc.beginPath();
      lc.rect(0, 0, L.cssW, LAYER_UP * g.s + 4 * g.s);
      lc.clip();
    }
    painters[i]!.paint(
      lc,
      { ox: L.cssW / 2, oy: LAYER_UP * g.s, s: g.s, dpr: g.dpr },
      {
        maturity: START_M + (t.m - START_M) * e,
        months: 24,
        timeMs: now,
        wind: !still,
        pulse: -1,
        bills: Math.floor(t.bills * e + 0.001),
      },
      sprites!,
    );
    lc.restore();
    L.at = now;
  };

  const draw = (now: number) => {
    if (!geo || !sprites || layers.length === 0) return;
    const still = reduced();
    // the grow clock starts when the page is revealed (begin()); until then the grove holds as seedlings
    const secs = still ? 99 : t0 < 0 ? 0 : Math.max(0, (now - t0) / 1000);
    const growing = secs < GROW_S + 0.5;
    const t1 = performance.now();
    // Stalest trees first within a per-frame budget (every tree when still or on the first frame), so the
    // screen keeps a steady 60 fps while growth is spread over a couple of frames per tree.
    const budget = growing ? 9 : 7;
    const first = layers.some((L) => L.at < 0);
    const byAge = allIdx.slice().sort((a, b) => layers[a]!.at - layers[b]!.at);
    let n = 0;
    let bgDirty = first;
    for (const i of byAge) {
      if (!still && !first && n > 0 && performance.now() - t1 > budget) break;
      paintLayer(i, now, secs, still);
      if (GROVE[i]!.bg) bgDirty = true;
      n++;
    }
    ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
    ctx.clearRect(0, 0, geo.w, geo.h);
    if (bgComp && bgDirty) {
      const bc = bgComp.getContext('2d')!;
      bc.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
      bc.globalCompositeOperation = 'source-over';
      bc.clearRect(0, 0, geo.w, geo.h);
      for (const i of bgOrder) {
        const L = layers[i]!;
        bc.drawImage(L.cv, L.x, L.y, L.cssW, L.cssH);
      }
      // paler and slightly cooler: a paper haze plus a breath of sky over the trees only
      bc.globalCompositeOperation = 'source-atop';
      bc.fillStyle = 'rgba(251,246,234,0.34)';
      bc.fillRect(0, 0, geo.w, geo.h);
      bc.fillStyle = 'rgba(120,165,205,0.12)';
      bc.fillRect(0, 0, geo.w, geo.h);
    }
    if (bgComp) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bgComp, 0, 0, geo.w, geo.h);
      ctx.globalAlpha = 1;
    }
    for (const i of order) {
      const L = layers[i]!;
      ctx.drawImage(L.cv, L.x, L.y, L.cssW, L.cssH);
    }
    if (secs > GROW_S + 0.5) resolveGrown();
  };

  const frame = (now: number) => {
    raf = 0;
    if (destroyed || !visible || reduced()) return;
    raf = requestAnimationFrame(frame);
    draw(now);
  };
  const kick = () => {
    if (reduced()) {
      draw(performance.now());
      resolveGrown();
    } else if (!raf && visible) raf = requestAnimationFrame(frame);
  };

  const layout = () => {
    const w = Math.round(hero.clientWidth);
    const h = Math.round(hero.clientHeight);
    if (w < 50 || h < 50) return;
    const g = heroGeometry(w, h, window.devicePixelRatio || 1);
    if (geo && geo.w === g.w && geo.h === g.h && geo.dpr === g.dpr) return;
    const my = ++gen;
    void Promise.all([ensureSprites(g.s * g.dpr), applyHeroBackdrop(canvas, g)]).then(([sp, b]) => {
      if (destroyed || my !== gen) return;
      sprites = sp;
      // the painted backdrop is its own static layer behind the grove: the compositor shows it with no
      // per-frame copy and no GPU readback
      b.className = 'grove grove-bg';
      b.setAttribute('aria-hidden', 'true');
      b.style.width = `${g.w}px`;
      b.style.height = `${g.h}px`;
      heroBg?.remove();
      canvas.before(b);
      heroBg = b;
      geo = g;
      buildLayers(g);
      canvas.width = Math.round(g.w * g.dpr);
      canvas.height = Math.round(g.h * g.dpr);
      canvas.style.width = `${g.w}px`;
      canvas.style.height = `${g.h}px`;
      // Warm-up behind the curtain: paint every tree once fully grown (builds bill, bark and clump sprites
      // and first-use paths), then the seedling state, so nothing is created for the first time mid-animation.
      if (!reduced()) {
        const warm = performance.now();
        for (let i = 0; i < layers.length; i++) paintLayer(i, warm, 99, true);
        for (const L of layers) L.at = -1;
      }
      draw(performance.now());
      // Make the GPU finish all queued painting now, while only the bare paper is showing: a 1-pixel read
      // from each canvas forces it. Otherwise that work runs when the scene first becomes visible and the
      // reveal stutters.
      for (const c of [b, canvas, bgComp, ...layers.map((L) => L.cv)]) c?.getContext('2d')?.getImageData(0, 0, 1, 1);
      resolveReady();
      kick();
    });
  };

  let pending = 0;
  const ro = new ResizeObserver(() => {
    if (pending) return;
    pending = window.setTimeout(() => {
      pending = 0;
      layout();
    }, 120);
  });
  ro.observe(hero);

  const io = new IntersectionObserver((es) => {
    visible = es[es.length - 1]!.isIntersecting;
    if (visible) kick();
    else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  io.observe(hero);

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => kick();
  mq.addEventListener('change', onMotion);

  layout();

  return {
    ready,
    grown,
    begin() {
      if (t0 < 0) t0 = performance.now() + 250;
      kick();
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener('change', onMotion);
    },
  };
}
