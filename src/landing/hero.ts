/**
 * The grove: five trees from the real watercolor engine on one shared scale and ground line.
 * They grow in on load, then rest with subtle wind. Per frame only the trees are painted; paper, sky, meadow
 * and soil are the canvas CSS background (see backdrop.ts).
 */
import { getModel } from '../scene';
import { TreePainter } from '../scene/treePainter';
import { ensureSprites, type Sprites } from '../scene/sprites';
import { HORIZON_UP, applyHeroBackdrop, heroGeometry, type HeroGeometry } from './backdrop';
import { Aviary } from './birds';

/**
 * The trees grow in a wave from left to right, each starting a little after its neighbour to the left. When they
 * all grew at once, every tree was large and still growing in the same moment, and repainting them all each
 * frame was more than a laptop GPU could keep up with; in a wave only two or three are growing at a time.
 */
const WAVE_S = 2.0; // seconds for the wave to cross the whole grove
const WAVE = (x: number) => Math.round((x - 0.09) * WAVE_S * 100) / 100;

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
  { seed: 9031, x: 0.09, m: 0.42, bills: 0, delay: WAVE(0.09) },
  { seed: 4242, x: 0.268, m: 0.7, bills: 4, delay: WAVE(0.268) },
  { seed: 1337, x: 0.432, m: 1.0, bills: 12, delay: WAVE(0.432) },
  { seed: 2468, x: 0.66, m: 0.82, bills: 6, delay: WAVE(0.66) },
  { seed: 777, x: 0.878, m: 0.55, bills: 0, delay: WAVE(0.878) },
  // far horizon
  { seed: 5510, x: 0.185, m: 0.4, bills: 0, delay: WAVE(0.185), bg: true },
  { seed: 3307, x: 0.56, m: 0.5, bills: 0, delay: WAVE(0.56), bg: true },
  { seed: 6120, x: 0.775, m: 0.33, bills: 0, delay: WAVE(0.775), bg: true },
];
const GROW_S = 1.8;
/** the grove settles once the last tree of the wave has grown (and its final, cached paint is done) */
const GROW_END = Math.max(...GROVE.map((t) => t.delay)) + GROW_S + 0.2;
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
  /** bills the birds have delivered to each tree (on top of its starting count) */
  const extra = GROVE.map(() => 0);
  /** a tree that just received a bill repaints every frame until this time, so the bill fades in smoothly */
  const hotUntil = GROVE.map(() => 0);
  let grownDone = false;
  let overlayDirty = false;
  let tick = 0;
  let finalPainted = false;
  const settled = GROVE.map(() => false);
  /**
   * Wind as a gentle bend of each tree's cached image: a horizontal shear about its ground line, a slow
   * gust under a quicker flutter, phase-shifted per tree; bigger trees bend a little less.
   */
  const SWAY_MS = 8000;
  const swayAt = (i: number, t: number): number => {
    const ph = i * 1.7;
    const w = (Math.PI * 2 * t) / (SWAY_MS / 1000);
    const amp = 0.011 * (1.15 - 0.35 * GROVE[i]!.m);
    return amp * (0.7 * Math.sin(w + ph) + 0.3 * Math.sin(3 * w + ph * 1.9));
  };
  /** current bend of tree i, read from its running compositor animation */
  const sway = (i: number): number => {
    const a = swayAnims[i];
    const ct = a ? Number(a.currentTime ?? 0) : 0;
    return a ? swayAt(i, (ct % SWAY_MS) / 1000) : 0;
  };
  const swayAnims: Array<Animation | undefined> = GROVE.map(() => undefined);
  const billCount = (i: number) => GROVE[i]!.bills + extra[i]!;
  const layerView = (i: number) => {
    const g = geo!;
    const L = layers[i]!;
    return { ox: L.cssW / 2, oy: LAYER_UP * g.s, s: g.s, dpr: g.dpr };
  };
  const subline = hero.querySelector('.hero-sub') as HTMLElement | null;
  const aviary = new Aviary({
    sky() {
      const g = geo!;
      const hr = hero.getBoundingClientRect();
      const sub = subline ? subline.getBoundingClientRect().bottom - hr.top : g.h * 0.32;
      let crown = Infinity;
      for (const i of order) crown = Math.min(crown, g.groundY - painters[i]!.apexWorld(GROVE[i]!.m).y * g.s);
      const yTop = sub + 34;
      return { w: g.w, yTop, yBottom: Math.max(yTop + 40, crown - 34), scale: Math.min(1.3, Math.max(0.85, g.w / 1440)) };
    },
    targets() {
      return order
        .filter((i) => !aviary.reserved.has(i) && billCount(i) < Math.min(painters[i]!.billSlots, GROVE[i]!.bills + 24))
        .map((i) => ({ tree: i, x: layers[i]!.x + layers[i]!.cssW / 2, variant: billCount(i) % 3 }));
    },
    restPose(i) {
      if (!geo || !layers[i]) return null;
      const p = painters[i]!.restingBillPose(billCount(i), layerView(i));
      const L = layers[i]!;
      const y = p.y + L.y;
      const yb = L.y + LAYER_UP * geo.s;
      const k = reduced() ? 0 : sway(i);
      return { ...p, x: p.x + L.x + k * (yb - y), y };
    },
    landed(i) {
      extra[i]!++;
      hotUntil[i] = performance.now() + 700;
    },
  });

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
  const LAYER_UP = 612; // world units above the ground line
  const LAYER_DOWN = 100; // below it (roots)
  const LAYER_W = 620;

  /** canvases this hero has put in the page (removed and rebuilt on resize) */
  let domLayers: HTMLCanvasElement[] = [];
  const buildLayers = (g: HeroGeometry) => {
    for (const a of swayAnims) a?.cancel();
    for (const c of domLayers) c.remove();
    domLayers = [];
    layers = GROVE.map((t) => {
      const cssW = Math.ceil(LAYER_W * g.s);
      const cssH = Math.ceil((LAYER_UP + LAYER_DOWN) * g.s);
      const cv = document.createElement('canvas');
      cv.width = Math.round(cssW * g.dpr);
      cv.height = Math.round(cssH * g.dpr);
      const up = t.bg ? HORIZON_UP : 0;
      return { cv, cssW, cssH, x: t.x * g.w - cssW / 2, y: g.groundY - (LAYER_UP + up) * g.s, at: -1 };
    });
    // Far trees: a page layer each behind the main row, hazed in their own small canvas when painted and paled
    // by the layer's CSS opacity (the compositor does that for free). They were once hazed together through
    // two full-screen canvases, which cost about 60 ms a frame on a 2x screen while they grew.
    for (const i of bgOrder) {
      const L = layers[i]!;
      const st = L.cv.style;
      L.cv.className = 'grove grove-tree grove-far';
      L.cv.setAttribute('aria-hidden', 'true');
      st.left = `${L.x}px`;
      st.top = `${L.y}px`;
      st.width = `${L.cssW}px`;
      st.height = `${L.cssH}px`;
      canvas.before(L.cv);
      domLayers.push(L.cv);
    }
    // main trees: one page layer each, smaller trees first so larger crowns overlap them
    for (const i of order) {
      const L = layers[i]!;
      const st = L.cv.style;
      L.cv.className = 'grove grove-tree';
      L.cv.setAttribute('aria-hidden', 'true');
      st.left = `${L.x}px`;
      st.top = `${L.y}px`;
      st.width = `${L.cssW}px`;
      st.height = `${L.cssH}px`;
      st.transformOrigin = `${L.cssW / 2}px ${LAYER_UP * g.s}px`;
      canvas.before(L.cv);
      domLayers.push(L.cv);
      if (!reduced()) {
        // wind on the compositor: a gentle shear about the ground line, sampled from swayAt over one loop
        const N = 48;
        const frames: Keyframe[] = [];
        for (let f = 0; f <= N; f++) {
          const k = swayAt(i, ((f / N) * SWAY_MS) / 1000);
          frames.push({ transform: `skewX(${(Math.atan(-k) * 180) / Math.PI}deg)` });
        }
        swayAnims[i] = L.cv.animate(frames, { duration: SWAY_MS, iterations: Infinity, easing: 'linear' });
      }
    }
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
        wind: false,
        fadeBills: !still,
        pulse: -1,
        bills: Math.floor(t.bills * e + 0.001) + extra[i]!,
      },
      sprites!,
    );
    lc.restore();
    if (t.bg) {
      // paler and slightly cooler: a paper haze plus a breath of sky over the tree only
      lc.globalCompositeOperation = 'source-atop';
      lc.fillStyle = 'rgba(251,246,234,0.34)';
      lc.fillRect(0, 0, L.cssW, L.cssH);
      lc.fillStyle = 'rgba(120,165,205,0.12)';
      lc.fillRect(0, 0, L.cssW, L.cssH);
      lc.globalCompositeOperation = 'source-over';
    }
    L.at = now;
  };

  const draw = (now: number) => {
    if (!geo || !sprites || layers.length === 0) return;
    const still = reduced();
    // the grow clock starts when the page is revealed (begin()); until then the grove holds as seedlings
    const secs = still ? 99 : t0 < 0 ? 0 : Math.max(0, (now - t0) / 1000);
    const growing = secs < GROW_END;
    // Trees are repainted only when they change: every frame while growing (far trees every other frame),
    // and once when a bill lands. Wind never repaints a tree: the cached image is bent when drawn (sway()).
    const first = layers.some((L) => L.at < 0);
    const hot = (i: number) => hotUntil[i]! > now;
    tick++;
    for (const i of allIdx) {
      const t = GROVE[i]!;
      // a tree still waiting for the wave holds as a seedling: nothing to repaint until its turn
      const due = first || hot(i) || (growing && !settled[i] && secs >= t.delay && (!t.bg || tick % 2 === 0));
      if (!due) continue;
      paintLayer(i, now, secs, still);
      // one last paint after its growth window closes, then it is cached for good
      if (growing && secs > t.delay + GROW_S + 0.1) settled[i] = true;
    }
    if (!growing && !finalPainted) {
      // make sure every tree's cached image is its exact final state
      finalPainted = true;
      for (const i of allIdx) if (!settled[i]) paintLayer(i, now, secs, still);
    }
    // the overlay canvas only carries birds and falling bills: redraw it only while something is flying
    if (grownDone && !still && (aviary.busy(now) || overlayDirty)) {
      ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
      ctx.clearRect(0, 0, geo.w, geo.h);
      aviary.frame(ctx, now);
      overlayDirty = aviary.busy(now);
    }
    if (secs > GROW_END) {
      grownDone = true;
      resolveGrown();
    }
  };

  /** motion is capped at 30 fps (with slack so 60/120 Hz displays land on every 2nd/4th refresh) */
  const FRAME_MS = 1000 / 30 - 4;
  let lastFrame = -Infinity;
  const frame = (now: number) => {
    raf = 0;
    if (destroyed || !visible || reduced()) return;
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;
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
      for (const c of [b, canvas, ...layers.map((L) => L.cv)]) c.getContext('2d')?.getImageData(0, 0, 1, 1);
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
