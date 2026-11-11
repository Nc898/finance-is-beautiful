/**
 * The About page's margins: a few soft watercolor washes and pigment flecks in the landing page's sky colours,
 * beside the text (never under it), alternating left and right down the page. Painted once per page size with
 * the landing's own wash painter; where the margins are too narrow (tablets, phones) the page stays plain.
 */
import { bloom, speck } from '../landing/backdrop';
import { Rand } from '../scene/prng';
import { PAL } from '../scene/watercolor';

/** room needed beside the text before a margin gets a wash (css px) */
const MIN_MARGIN = 140;
/** clear paper kept between a wash and the text */
const GAP = 48;

interface Cluster {
  side: -1 | 1;
  /** the element the wash sits beside */
  anchor: Element | null;
  colours: [string, string, string];
  seed: number;
}

export function paintMarginDecor(canvas: HTMLCanvasElement, column: HTMLElement): void {
  const body = column.querySelector('.about-body');
  const paras = body ? Array.from(body.querySelectorAll(':scope > p')) : [];
  const clusters: Cluster[] = [
    { side: -1, anchor: column.querySelector('.about-title'), colours: [PAL.gold, PAL.coral, PAL.sky], seed: 41 },
    { side: 1, anchor: paras[1] ?? null, colours: [PAL.coral, PAL.gold, PAL.sky], seed: 42 },
    { side: -1, anchor: paras[3] ?? null, colours: [PAL.sky, PAL.gold, PAL.coral], seed: 43 },
    { side: 1, anchor: column.querySelector('.about-social'), colours: [PAL.gold, PAL.sky, PAL.coral], seed: 44 },
  ];

  let lastW = 0;
  let lastH = 0;
  const paint = () => {
    const W = document.documentElement.clientWidth;
    const H = document.body.scrollHeight;
    if (W === lastW && H === lastH) return;
    lastW = W;
    lastH = H;
    const d = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * d);
    canvas.height = Math.round(H * d);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const col = column.getBoundingClientRect();
    const scrollY = window.scrollY;
    const margin = col.left - GAP;
    if (margin < MIN_MARGIN) {
      canvas.classList.remove('painted');
      return;
    }
    // a wash fills about a third of its margin, and its widest edge stays GAP clear of the text
    const rx = Math.min(150, Math.max(46, margin * 0.32));
    for (const c of clusters) {
      if (!c.anchor) continue;
      const a = c.anchor.getBoundingClientRect();
      const cy = a.top + scrollY + a.height / 2;
      const cx = c.side < 0 ? col.left - GAP - rx * 1.15 : col.right + GAP + rx * 1.15;
      const rnd = new Rand(c.seed);
      const [c1, c2, c3] = c.colours;
      const out = -c.side; // away from the text
      bloom(ctx, d, cx * d, cy * d, rx * d, rx * 0.46 * d, c1, 0.2, c.seed);
      bloom(ctx, d, (cx + out * rx * 0.35) * d, (cy + rx * 0.42) * d, rx * 0.68 * d, rx * 0.3 * d, c2, 0.16, c.seed + 100);
      bloom(ctx, d, (cx - out * rx * 0.1) * d, (cy - rx * 0.4) * d, rx * 0.42 * d, rx * 0.2 * d, c3, 0.12, c.seed + 200);
      // a few flecks of pigment around the wash
      for (let i = 0; i < 6; i++) {
        const ang = rnd.range(0, Math.PI * 2);
        const dist = rnd.range(0.9, 1.5) * rx;
        const x = cx + Math.cos(ang) * dist * (Math.cos(ang) * out > 0 ? 1 : 0.6);
        const y = cy + Math.sin(ang) * dist * 0.6;
        speck(ctx, x * d, y * d, rnd.range(1.4, 3.2) * d, rnd.pick([c1, c2, c3]), rnd.range(0.3, 0.55), rnd);
      }
    }
    canvas.classList.add('painted');
  };

  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(paint, 120);
  };
  new ResizeObserver(schedule).observe(document.body);
  // the web fonts move the text a little when they arrive: paint once they are in
  void document.fonts.ready.then(paint);
}
