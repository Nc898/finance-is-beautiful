/**
 * DOM layer. The static markup lives in against-the-current.html; this module wires it to the store,
 * updates it only when displayed values change, and owns the single polite live region.
 */
import {
  BOATS,
  BOAT_NAMES,
  boatLabel,
  buyingPowerChange,
  buysToday,
  formatChange,
  formatCurrency,
  formatPercent,
  mileposts,
  milepostLabel,
  yearLabel,
  yearSpoken,
} from '../engine';
import type { BoatId, BoatSnapshot, RiverInputs } from '../engine';
import type { RiverField } from '../engine';
import { FIELDS } from './store';
import type { Reason, Speed, Store } from './store';
import { BEATS, captionForBeat, storyBeat, storyCaption } from './story';
import type { StoryBeat, StoryCaption } from './story';
import { resultsSentence, sceneSummary } from './text';

const COMMIT_DEBOUNCE_MS = 250;
const SCRUB_ANNOUNCE_MS = 600;
const INPUT_ANNOUNCE_MS = 700;
const HIGHLIGHT_MS = 1500;
/** Room under the river for the milepost labels, CSS px. */
const BOTTOM_BAND = 40;
/** Fraction of the river's width kept clear of milepost labels at the very edges (in u). */
const POST_EDGE_MARGIN = 0.1;
/** How far below a post's top its label hangs, in lane spacings (post height 50 / lane spacing 70, plus air). */
/** Lane spacing (CSS px) below which the boat labels use their two-line form (the three-line form is about 62px tall). */
const COMPACT_BELOW_LANE = 68;
/** Minimum screen gap between two milepost labels, CSS px. */
const POST_MIN_GAP = 96;

export interface Point {
  x: number;
  y: number;
}

export interface UIHooks {
  boatAnchor(id: BoatId): Point;
  postAnchor(u: number): Point;
  visibleU(): { min: number; max: number };
  setInsets(insets: { top: number; bottom: number; side: number }): void;
  /** Optional scene extra: stand the painted mileposts at these u values, so posts and labels agree. */
  setPosts?(us: number[]): void;
  /** Optional scene extra: the plaque size in CSS px, so the value is lettered inside it. */
  postPlaque?(): { w: number; h: number };
  /** Optional scene extra: the opening camera move, so the lettering stays on the zooming posts. */
  cameraTransform?(): { a: number; bx: number; by: number };
}

export interface UI {
  /** Called every frame; touches the DOM only where displayed values changed. */
  update(snaps: readonly BoatSnapshot[]): void;
  /** Called every frame after the scene rendered: positions the labels from the scene's anchors. */
  place(): void;
  /** The fraction of the shared scale the visible river can show (1 on wide screens). */
  setFit(fit: number): void;
  /** Force the next place() to recompute everything (after a resize or layout change). */
  invalidate(): void;
  /** Stage size in CSS px. */
  setStageSize(w: number, h: number): void;
  announce(text: string): void;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

/**
 * Identity emblems, the same three shapes the boats carry: a coin jar (cash), a strongbox (savings) and a
 * sapling in a pot (investing). Identity never rests on colour alone.
 */
export function emblemSVG(id: BoatId): string {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  let body: string;
  if (id === 'cash') {
    body =
      `<path class="tint" d="M7 8.5h10v10.2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/>` +
      `<path ${s} d="M7 8.5h10v10.2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM6 5h12v3.5H6z"/>` +
      `<circle ${s} cx="12" cy="14.6" r="2.3"/>`;
  } else if (id === 'savings') {
    body =
      `<rect class="tint" x="3.5" y="9" width="17" height="11" rx="1.6"/>` +
      `<path ${s} d="M3.5 10.6c0-.9.7-1.6 1.6-1.6h13.8c.9 0 1.6.7 1.6 1.6v7.8c0 .9-.7 1.6-1.6 1.6H5.1c-.9 0-1.6-.7-1.6-1.6zM3.5 13.5h17M9 9V7.2c0-.7.6-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V9"/>` +
      `<rect x="10.6" y="12.3" width="2.8" height="3.3" rx=".6" fill="currentColor"/>`;
  } else {
    body =
      `<path class="tint" d="M7.5 15.5h9l-1.2 5.5H8.7z"/>` +
      `<path class="tint" d="M12 11.5C12 8.4 9.6 6.6 6.6 7c0 3 2.1 4.6 5.4 4.5zM12 9.2c0-3 2.4-4.7 5.4-4.3 0 3-2.1 4.6-5.4 4.5z"/>` +
      `<path ${s} d="M7.5 15.5h9l-1.2 5.5H8.7zM12 15.5V9.5M12 11.5C12 8.4 9.6 6.6 6.6 7c0 3 2.1 4.6 5.4 4.5zM12 9.2c0-3 2.4-4.7 5.4-4.3 0 3-2.1 4.6-5.4 4.5z"/>`;
  }
  return `<svg class="em em-${id}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

function hydrateEmblems(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-emblem]').forEach((el) => {
    el.innerHTML = emblemSVG(el.dataset.emblem as BoatId);
    el.style.display = 'inline-flex';
  });
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function createUI(store: Store, hooks: UIHooks): UI {
  const { state, actions } = store;
  hydrateEmblems(document);

  const canvas = $<HTMLCanvasElement>('scene');
  const dock = $('dock');
  const how = $<HTMLDetailsElement>('how');
  const announcer = $('announcer');
  const summaryEl = $('summary');
  const playBtn = $<HTMLButtonElement>('btn-play');
  const playLabel = $('play-label');
  const icoPlay = playBtn.querySelector<SVGElement>('.ico-play')!;
  const icoPause = playBtn.querySelector<SVGElement>('.ico-pause')!;
  const replayBtn = $<HTMLButtonElement>('btn-replay');
  const skipBtn = $<HTMLButtonElement>('btn-skip');
  const timeline = $<HTMLInputElement>('timeline');
  const ageReadout = $('age-readout');
  const yearReadout = $('year-readout');
  const ticksEl = $('scale-ticks');
  const reduceBox = $<HTMLInputElement>('reduce-motion');
  const speedInputs = Array.from(document.querySelectorAll<HTMLInputElement>('#speeds input'));
  const postsEl = $('posts');

  interface BoatLabelEls {
    root: HTMLElement;
    name: HTMLElement;
    amount: HTMLElement;
    buys: HTMLElement;
    w: number;
    h: number;
    side: 'left' | 'right';
    /** Preferred side with hysteresis (before the room check). */
    pref: 'left' | 'right';
  }
  const labels = {} as Record<BoatId, BoatLabelEls>;
  for (const id of BOATS) {
    const root = $(`lab-${id}`);
    labels[id] = {
      root,
      name: root.querySelector<HTMLElement>('.bl-name')!,
      amount: root.querySelector<HTMLElement>('.bl-amount')!,
      buys: root.querySelector<HTMLElement>('.bl-buys')!,
      w: 0,
      h: 0,
      side: 'left',
      pref: 'left',
    };
  }

  const fieldEls = {} as Record<RiverField, { input: HTMLInputElement; error: HTMLElement }>;
  for (const f of FIELDS) fieldEls[f] = { input: $<HTMLInputElement>(`f-${f}`), error: $(`err-${f}`) };

  let stageW = 0;
  let stageH = 0;
  let fit = 1;

  /* ---------------- live region ---------------- */

  let sayTimer = 0;
  let lastSaid = '';
  /** Single polite live region. The latest message replaces any pending one. */
  function announce(text: string, delay = 0): void {
    window.clearTimeout(sayTimer);
    const fire = () => {
      announcer.textContent = text === lastSaid ? text + ' ' : text;
      lastSaid = announcer.textContent;
    };
    if (delay > 0) sayTimer = window.setTimeout(fire, delay);
    else fire();
  }

  /* ---------------- summary + canvas label (discrete changes only) ---------------- */

  let summaryTimer = 0;
  function refreshSummary(): void {
    const text = sceneSummary(state.inputs, state.years);
    canvas.setAttribute('aria-label', text);
    setText(summaryEl, text);
  }
  function scheduleSummary(delay: number): void {
    window.clearTimeout(summaryTimer);
    summaryTimer = window.setTimeout(refreshSummary, delay);
  }

  /* ---------------- timeline scale bar ---------------- */

  function buildScale(): void {
    const total = state.inputs.years;
    timeline.min = '0';
    timeline.max = String(total * 12);
    const frac = (year: number) => (total === 0 ? 0 : year / total);

    // Labels every 5 years, plus both ends; a label close to an end gives way to it.
    const labelYears: Array<{ year: number; end: boolean }> = [{ year: 0, end: true }];
    for (let y = 5; y < total; y += 5) labelYears.push({ year: y, end: false });
    labelYears.push({ year: total, end: true });
    const kept = labelYears.filter((l) => l.end || !labelYears.some((o) => o.end && Math.abs(frac(o.year) - frac(l.year)) < 0.07));

    ticksEl.textContent = '';
    const frag = document.createDocumentFragment();
    for (let y = 1; y < total; y++) {
      if (y % 5 === 0) continue;
      const t = document.createElement('span');
      t.className = 'tick';
      t.style.left = `${frac(y) * 100}%`;
      frag.appendChild(t);
    }
    for (const l of kept) {
      const t = document.createElement('span');
      t.className = 'tick major';
      t.style.left = `${frac(l.year) * 100}%`;
      frag.appendChild(t);
      const lab = document.createElement('span');
      lab.className = 'tick-label';
      lab.style.left = `${frac(l.year) * 100}%`;
      lab.textContent = String(l.year);
      frag.appendChild(lab);
    }
    ticksEl.appendChild(frag);
  }

  /* ---------------- stable insets for the scene camera ---------------- */

  const ghostCap = $('cap-ghost');
  let lastInsets = { top: -1, bottom: -1, side: -1 };

  /** Wide screens reserve the side panel's width whether it is open or not, so toggling it only slides the scene. */
  function sideReserve(): number {
    if (stageW < 900) return 0;
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 0;
  }

  /** Tallest caption this scenario can produce, at the current width (measured in a hidden twin). */
  function tallestCaption(): number {
    let tallest = 0;
    for (const beat of BEATS) {
      const c = captionForBeat(beat, state.inputs);
      setText(ghostCap.querySelector<HTMLElement>('.cap-1')!, c.primary);
      setText(ghostCap.querySelector<HTMLElement>('.cap-2')!, c.secondary ?? '');
      tallest = Math.max(tallest, ghostCap.offsetHeight);
    }
    return tallest;
  }

  function applyInsets(): void {
    if (!stageW) return;
    const capTop = $('caption').offsetTop;
    const masthead = (document.querySelector('.masthead') as HTMLElement).offsetHeight;
    const top = Math.ceil(Math.max(masthead + 4, capTop + tallestCaption() + 4));
    const bottom = BOTTOM_BAND;
    const side = sideReserve();
    if (top !== lastInsets.top || bottom !== lastInsets.bottom || side !== lastInsets.side) {
      lastInsets = { top, bottom, side };
      hooks.setInsets({ top, bottom, side });
      invalidate();
    }
  }

  /** Horizontal range (overlay coordinates) in which labels may sit: with the panel open on wide screens the overlay is slid left by half the panel. */
  function labelRange(): { lo: number; hi: number } {
    const shift = panelOpen() && stageW >= 900 ? sideReserve() / 2 : 0;
    return { lo: 8 + shift, hi: stageW - 8 - shift };
  }

  /* ---------------- boat labels ---------------- */

  const labelKey: Record<BoatId, string> = { cash: '', savings: '', invest: '' };

  function updateLabel(snap: BoatSnapshot): void {
    const L = labels[snap.id];
    const name = boatLabel(snap.id, state.inputs);
    const amount = formatCurrency(snap.nominal);
    const buys = buysToday(snap.real);
    const key = `${name}|${amount}|${buys}`;
    if (key === labelKey[snap.id]) return;
    labelKey[snap.id] = key;
    setText(L.name, name);
    setText(L.amount, amount);
    setText(L.buys, buys);
    measureLabel(snap.id);
  }

  function measureLabel(id: BoatId): void {
    const L = labels[id];
    L.w = L.root.offsetWidth;
    L.h = L.root.offsetHeight;
  }


  /* ---------------- milepost labels ---------------- */

  const postEls = new Map<string, HTMLElement>();
  let postsOn: string[] = [];
  let postKey = '';

  function postEl(key: string): HTMLElement {
    let el = postEls.get(key);
    if (!el) {
      el = document.createElement('span');
      el.className = 'post-label';
      postsEl.appendChild(el);
      postEls.set(key, el);
    }
    return el;
  }

  function placePosts(): void {
    const vis = hooks.visibleU();
    const range = labelRange();
    // The value is lettered inside each post's plaque.
    const plaque = hooks.postPlaque?.() ?? { w: 90, h: 34 };
    const pw = plaque.w * fit;
    const ph = plaque.h * fit;
    // which posts carry a value is decided on the unzoomed view; their lettering then rides the camera move
    const Z = hooks.cameraTransform?.() ?? { a: 1, bx: 0, by: 0 };
    const key = `${Z.a.toFixed(4)}|${Z.bx.toFixed(1)}|${Z.by.toFixed(1)}|${fit.toFixed(3)}|${Math.round(pw)}|${range.lo}|${state.displayScale.toFixed(5)}|${state.inputs.start}|${vis.min.toFixed(3)}|${vis.max.toFixed(3)}|${stageW}x${stageH}|${lastInsets.top}|${lastInsets.bottom}`;
    if (key === postKey) return;
    postKey = key;
    const candidates = mileposts(state.inputs.start, state.displayScale / fit, vis, POST_EDGE_MARGIN * (vis.max - vis.min) / 2);
    // Priority: the dock, then the other doublings nearest the dock, then the half-steps.
    const ranked = [...candidates].sort((a, b) => Number(b.u === 0) - Number(a.u === 0) || Number(b.major) - Number(a.major) || Math.abs(a.u) - Math.abs(b.u));
    const accepted: Array<{ key: string; u: number; x: number; y: number; value: number; dock: boolean }> = [];
    for (const p of ranked) {
      const a = hooks.postAnchor(p.u);
      if (a.x < range.lo + 16 || a.x > range.hi - 16) continue;
      if (accepted.some((o) => Math.abs(o.x - a.x) < Math.max(POST_MIN_GAP, pw + 14))) continue;
      accepted.push({ key: p.key, u: p.u, x: a.x, y: a.y, value: p.value, dock: p.u === 0 });
    }
    const next = new Set(accepted.map((p) => p.key));
    for (const k of postsOn) if (!next.has(k)) postEls.get(k)?.classList.remove('on');
    for (const p of accepted) {
      const el = postEl(p.key);
      const text = milepostLabel(p.value);
      if (el.dataset.text !== text) {
        el.dataset.text = text;
        el.setAttribute('aria-label', text);
        el.innerHTML = '';
        const amt = document.createElement('span');
        amt.className = 'post-amount';
        amt.textContent = text.replace(/ today$/, '');
        const sub = document.createElement('span');
        sub.className = 'post-today';
        sub.textContent = 'today';
        el.append(amt, sub);
      }
      el.classList.toggle('dock-post', p.dock);
      // sized to the plaque: the amount shrinks if a long number would overflow the board
      el.style.width = `${Math.round(pw)}px`;
      el.style.height = `${Math.round(ph)}px`;
      const fs = Math.max(8, Math.min(13, ph * 0.42, (pw * 0.86) / Math.max(4, text.replace(/ today$/, '').length * 0.6)));
      el.style.setProperty('--post-fs', `${fs.toFixed(1)}px`);
      // centred on the plaque, which hangs from the post anchor; scaled with the opening zoom
      const zx = Z.a * (p.x - pw / 2) + Z.bx;
      const zy = Z.a * p.y + Z.by;
      el.style.transform = `translate(${zx.toFixed(1)}px, ${zy.toFixed(1)}px) scale(${Z.a.toFixed(4)})`;
      el.classList.add('on');
    }
    postsOn = accepted.map((p) => p.key);
    hooks.setPosts?.(accepted.map((p) => p.u));
  }

  /* ---------------- overlay layout (per frame, from the scene's anchors) ---------------- */

  let labelsCompact = false;
  const snapOf = (id: BoatId): BoatSnapshot | undefined => lastSnaps.find((s) => s.id === id);
  /** Gap between a boat and its label, CSS px. */
  const SIDE_GAP = 10;
  /**
   * The anchor sits above the rower; the boat's visual centre is about 0.8 lane spacings below it
   * (measured against the scene: lanes are ~70 world units apart, boat body and rower ~55 below the bow anchor). Tune with the scene.
   */
  const BOAT_CENTER_BELOW_ANCHOR = 0.8;
  /** Smoothing for the labels' vertical position, so a label does not bob with its boat (per 30 fps frame). */
  const Y_SMOOTH = 0.12;
  const ySmooth: Partial<Record<BoatId, number>> = {};
  let laneSmooth = 0;
  const lastTransform: Record<BoatId, string> = { cash: '', savings: '', invest: '' };

  function placeBoatLabels(): void {
    const anchors = {} as Record<BoatId, Point>;
    for (const id of BOATS) anchors[id] = hooks.boatAnchor(id);
    // Lane spacing on screen sets the scale of everything here (lanes are evenly spaced in the scene).
    const laneRaw = Math.max(40, anchors.savings.y - anchors.invest.y);
    laneSmooth = laneSmooth === 0 || state.reducedMotion || Math.abs(laneRaw - laneSmooth) > 8 ? laneRaw : laneSmooth + (laneRaw - laneSmooth) * Y_SMOOTH;
    const lane = laneSmooth;
    const range = labelRange();
    // Short or narrow screens bring the lanes close together: switch to the two-line label before they would touch.
    const compact = lane < COMPACT_BELOW_LANE;
    if (compact !== labelsCompact) {
      labelsCompact = compact;
      for (const id of BOATS) {
        labels[id].root.classList.toggle('compact', compact);
        labels[id].w = labels[id].root.offsetWidth;
        labels[id].h = labels[id].root.offsetHeight;
      }
    }
    const half = lane * 1.1; // about half a boat's length
    for (const id of BOATS) {
      const L = labels[id];
      const a = anchors[id];
      // A label sits upstream of its boat (clear of the wake), but a boat past the pier keeps its label on the
      // downstream side so the text never lies across the planks. Hysteresis stops it flipping back and forth.
      const u = ((snapOf(id)?.logReal ?? 0) / state.displayScale) * fit;
      if (L.pref === 'left' && u < -0.12) L.pref = 'right';
      else if (L.pref === 'right' && u > -0.02) L.pref = 'left';
      let side = L.pref;
      const room = (s: 'left' | 'right') => (s === 'right' ? range.hi - (a.x + half + SIDE_GAP) : a.x - half - SIDE_GAP - range.lo);
      if (room(side) < L.w && room(side === 'left' ? 'right' : 'left') > room(side)) side = side === 'left' ? 'right' : 'left';
      if (L.side !== side) {
        // a soft hand-over: the label fades out, jumps to its new side, and fades back in
        L.root.classList.add('flipping');
        window.setTimeout(() => L.root.classList.remove('flipping'), 140);
      }
      L.side = side;
      if (L.root.dataset.side !== side) L.root.dataset.side = side;
      const x = side === 'right' ? a.x + half + SIDE_GAP : a.x - half - SIDE_GAP - L.w;
      const yRaw = a.y + lane * BOAT_CENTER_BELOW_ANCHOR - L.h / 2;
      const prev = ySmooth[id];
      const y = prev === undefined || state.reducedMotion || Math.abs(yRaw - prev) > 24 ? yRaw : prev + (yRaw - prev) * Y_SMOOTH;
      ySmooth[id] = y;
      const cx = Math.max(range.lo, Math.min(range.hi - L.w, x));
      const tf = `translate(${Math.round(cx)}px, ${Math.round(y)}px)`;
      if (tf !== lastTransform[id]) {
        lastTransform[id] = tf;
        L.root.style.transform = tf;
      }
    }
  }

  function invalidate(): void {
    postKey = '';
  }

  /* ---------------- dock height -> stage height ---------------- */

  let lastDockH = -1;
  function syncDockHeight(): void {
    if (how.open) return; // keep the scene steady while the explanation is open
    const h = dock.offsetHeight;
    if (Math.abs(h - lastDockH) < 0.5) return;
    lastDockH = h;
    document.documentElement.style.setProperty('--dock-h', `${h}px`);
  }
  let passQueued = false;
  new ResizeObserver(() => {
    if (passQueued) return;
    passQueued = true;
    requestAnimationFrame(() => {
      passQueued = false;
      syncDockHeight();
      for (const id of BOATS) measureLabel(id);
      invalidate();
    });
  }).observe(dock);
  const labelObs = new ResizeObserver(() => {
    if (passQueued) return;
    passQueued = true;
    requestAnimationFrame(() => {
      passQueued = false;
      for (const id of BOATS) measureLabel(id);
      invalidate();
    });
  });
  for (const id of BOATS) labelObs.observe(labels[id].root);
  how.addEventListener('toggle', () => {
    syncDockHeight();
    if (how.open) updateTable(true);
  });

  /* ---------------- captions ---------------- */

  const layers = Array.from(document.querySelectorAll<HTMLElement>('#caption .cap[data-layer]'));
  let activeLayer = 0;
  let captionKey = '';
  function setCaption(c: StoryCaption | null): void {
    const key = c ? `${c.primary}|${c.secondary ?? ''}` : '';
    if (key === captionKey) return;
    captionKey = key;
    const cur = layers[activeLayer];
    if (!c) {
      cur.classList.remove('on');
      cur.setAttribute('aria-hidden', 'true');
      return;
    }
    const next = layers[1 - activeLayer];
    setText(next.querySelector<HTMLElement>('.cap-1')!, c.primary);
    setText(next.querySelector<HTMLElement>('.cap-2')!, c.secondary ?? '');
    next.classList.add('on');
    next.removeAttribute('aria-hidden');
    cur.classList.remove('on');
    cur.setAttribute('aria-hidden', 'true');
    activeLayer = 1 - activeLayer;
  }

  /* ---------------- per-frame update ---------------- */

  let lastSnaps: readonly BoatSnapshot[] = [];
  let lastBeat: StoryBeat | null = null;
  let timelineKey = '';
  let tableKey = '';
  const cells = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-cell]').forEach((c) => cells.set(c.dataset.cell!, c));

  function updateTable(force = false, snaps: readonly BoatSnapshot[] = lastSnaps): void {
    if (!how.open || snaps.length === 0) return;
    const key = `${Math.floor(state.years * 12 + 1e-9)}|${state.inputs.start}|${state.inputs.inflation}|${state.inputs.savingsRate}|${state.inputs.investRate}`;
    if (!force && key === tableKey) return;
    tableKey = key;
    const set = (k: string, v: string) => {
      const el = cells.get(k);
      if (el) setText(el, v);
    };
    for (const s of snaps) {
      set(`${s.id}.rate`, formatPercent(s.rate));
      set(`${s.id}.nominal`, formatCurrency(s.nominal));
      set(`${s.id}.real`, formatCurrency(s.real));
      set(`${s.id}.change`, formatChange(buyingPowerChange(s, state.inputs.start)));
    }
    setText($('how-age'), yearSpoken(state.years).toLowerCase());
  }

  function chapterOf(beat: StoryBeat | null): string {
    if (beat === null) return 'explore';
    if (beat === 'intro') return 'intro';
    if (beat === 'current') return 'current';
    if (beat === 'results') return 'results';
    if (beat === 'handoff') return 'handoff';
    return 'rowing';
  }

  function update(snaps: readonly BoatSnapshot[]): void {
    lastSnaps = snaps;

    // Story beat handling (captions + live announcements).
    let beat: StoryBeat | null = null;
    if (state.mode === 'story') beat = storyBeat(state.storyTime, state.inputs, state.reducedMotion);
    if (beat !== lastBeat) {
      const chapterChanged = chapterOf(beat) !== chapterOf(lastBeat);
      lastBeat = beat;
      if (beat !== null) {
        const cap = storyCaption(state.storyTime, state.inputs, state.reducedMotion);
        setCaption(cap);
        if (chapterChanged && state.playing) announce([cap.primary, cap.secondary].filter(Boolean).join(' '));
      }
    }
    if (beat === null) {
      setCaption(state.exploreHint ? { beat: 'handoff', primary: 'Explore your own river' } : null);
    }

    for (const s of snaps) updateLabel(s);

    // Timeline + readouts.
    const months = Math.floor(state.years * 12 + 1e-9);
    const tKey = `${months}|${timeline.max}`;
    if (tKey !== timelineKey) {
      timelineKey = tKey;
      if (document.activeElement !== timeline || String(months) !== timeline.value) timeline.value = String(months);
      const span = Math.max(1, state.inputs.years * 12);
      timeline.style.setProperty('--frac', String(months / span));
      timeline.setAttribute('aria-valuetext', yearSpoken(state.years));
      setText(ageReadout, yearLabel(state.years));
      setText(yearReadout, yearLabel(state.years));
    }

    updateTable(false, snaps);
  }

  function place(): void {
    placeBoatLabels();
    placePosts();
  }

  /* ---------------- controls ---------------- */

  function syncPlay(): void {
    const story = state.mode === 'story';
    const label = state.playing ? (story ? 'Pause story' : 'Pause') : story ? (state.storyTime > 0 ? 'Resume story' : 'Play story') : 'Play';
    setText(playLabel, label);
    icoPlay.toggleAttribute('hidden', state.playing);
    icoPause.toggleAttribute('hidden', !state.playing);
    skipBtn.hidden = !story;
  }

  function syncSpeed(): void {
    for (const r of speedInputs) r.checked = Number(r.value) === state.speed;
  }

  function syncDrafts(): void {
    for (const f of FIELDS) {
      const el = fieldEls[f].input;
      if (el.value !== state.draft[f]) el.value = state.draft[f];
    }
  }

  function syncErrors(): void {
    for (const f of FIELDS) {
      const { input, error } = fieldEls[f];
      const msg = state.errors[f];
      if (msg) {
        input.setAttribute('aria-invalid', 'true');
        setText(error, msg);
        error.hidden = false;
      } else {
        input.removeAttribute('aria-invalid');
        setText(error, '');
        error.hidden = true;
      }
    }
  }

  function applyReduced(): void {
    document.documentElement.classList.toggle('reduce-motion', state.reducedMotion);
    reduceBox.checked = state.reducedMotion;
  }

  function highlight(): void {
    // Draw the eye to the controls, or to the toggle that reveals them when the panel is closed.
    const el = panelOpen() ? dock : panelToggle;
    el.classList.remove('hl');
    void el.offsetWidth;
    el.classList.add('hl');
    window.setTimeout(() => el.classList.remove('hl'), HIGHLIGHT_MS * 2);
  }

  /* ---------------- side panel ---------------- */

  const appEl = $('app');
  const panelToggle = $<HTMLButtonElement>('panel-toggle');
  const panelToggleLabel = $('panel-toggle-label');
  const wide = window.matchMedia('(min-width: 900px)');
  const panelOpen = () => appEl.classList.contains('panel-open');
  function setPanel(open: boolean): void {
    appEl.classList.toggle('panel-open', open);
    panelToggle.setAttribute('aria-expanded', String(open));
    panelToggleLabel.textContent = open ? 'Hide controls' : 'Show controls';
    panelToggle.title = open ? 'Hide controls' : 'Show controls';
    dock.inert = !open;
    invalidate();
  }
  // Open beside the scene on wide screens; on phones it overlays the scene, so start closed.
  setPanel(wide.matches);
  panelToggle.addEventListener('click', () => setPanel(!panelOpen()));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelOpen() && !wide.matches) {
      setPanel(false);
      panelToggle.focus();
    }
  });

  playBtn.addEventListener('click', () => actions.togglePlay());
  replayBtn.addEventListener('click', () => actions.replayStory());
  skipBtn.addEventListener('click', () => actions.skipToExplore());
  for (const r of speedInputs) {
    r.addEventListener('change', () => {
      if (r.checked) actions.setSpeed(Number(r.value) as Speed);
    });
  }
  reduceBox.addEventListener('change', () => actions.setReducedMotion(reduceBox.checked));

  timeline.addEventListener('input', () => actions.scrubTo(Number(timeline.value) / 12));
  timeline.addEventListener('keydown', (e) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      actions.scrubTo(Math.round(state.years * 12) / 12 + (e.key === 'PageUp' ? 1 : -1));
      timeline.value = String(Math.round(state.years * 12));
    }
  });

  // Inputs: debounce while typing; commit on blur / Enter; arrows step.
  let commitTimer = 0;
  for (const f of FIELDS) {
    const { input } = fieldEls[f];
    input.addEventListener('input', () => {
      actions.setDraftField(f, input.value);
      window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(() => actions.commitInputs(), COMMIT_DEBOUNCE_MS);
    });
    input.addEventListener('blur', () => {
      window.clearTimeout(commitTimer);
      actions.commitInputs();
      actions.tidyField(f);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.clearTimeout(commitTimer);
        actions.commitInputs();
        actions.tidyField(f);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        window.clearTimeout(commitTimer);
        actions.stepField(f, e.key === 'ArrowUp' ? 1 : -1);
      }
    });
  }
  document.querySelectorAll<HTMLButtonElement>('.field .step').forEach((btn) => {
    const f = btn.closest<HTMLElement>('.field')!.dataset.field as RiverField;
    btn.addEventListener('click', () => {
      window.clearTimeout(commitTimer);
      actions.stepField(f, Number(btn.dataset.dir) > 0 ? 1 : -1);
    });
  });
  $('inputs').addEventListener('submit', (e) => e.preventDefault());

  // Space toggles play only when focus is not in an interactive control.
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.code !== 'Space') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('input, textarea, select, button, summary, a, [contenteditable]')) return;
    e.preventDefault();
    actions.togglePlay();
  });

  /* ---------------- store events (discrete) ---------------- */

  function resetKeys(): void {
    timelineKey = '';
    tableKey = '';
    lastBeat = null;
    for (const id of BOATS) labelKey[id] = '';
    invalidate();
  }

  function scrubSentence(inputs: RiverInputs): string {
    const parts = lastSnaps.map((s) => `${BOAT_NAMES[s.id]} ${formatCurrency(s.nominal)}, ${buysToday(s.real)}.`);
    return `${yearSpoken(state.years)} of ${inputs.years}. ${parts.join(' ')}`;
  }

  store.subscribe((reason: Reason) => {
    switch (reason) {
      case 'draft':
        syncDrafts();
        break;
      case 'errors': {
        syncErrors();
        const first = FIELDS.map((f) => state.errors[f]).find(Boolean);
        if (first) announce(first, INPUT_ANNOUNCE_MS);
        break;
      }
      case 'inputs':
        syncErrors();
        syncDrafts();
        syncPlay();
        buildScale();
        applyInsets();
        resetKeys();
        refreshSummary();
        announce(`Updated. ${resultsSentence(state.inputs)}`, INPUT_ANNOUNCE_MS);
        break;
      case 'play':
        syncPlay();
        announce(state.mode === 'story' ? 'Story playing.' : 'Playing.');
        break;
      case 'pause':
        syncPlay();
        refreshSummary();
        announce(`Paused. ${yearSpoken(state.years)}.`);
        break;
      case 'play-end':
        syncPlay();
        refreshSummary();
        announce(`Reached the end. ${yearSpoken(state.years)}.`);
        break;
      case 'speed':
        syncSpeed();
        break;
      case 'scrub':
        syncPlay();
        window.clearTimeout(summaryTimer);
        scheduleSummary(SCRUB_ANNOUNCE_MS);
        announce(scrubSentence(state.inputs), SCRUB_ANNOUNCE_MS);
        break;
      case 'replay':
        syncPlay();
        lastBeat = null;
        refreshSummary();
        announce('Story restarted.');
        break;
      case 'skip':
        syncPlay();
        refreshSummary();
        highlight();
        announce('Explore your own river. Controls are ready.');
        break;
      case 'story-end':
        syncPlay();
        refreshSummary();
        highlight();
        break;
      case 'reduced':
        applyReduced();
        syncPlay();
        lastBeat = null;
        refreshSummary();
        announce(state.reducedMotion ? 'Reduced motion on. The story will not autoplay.' : 'Reduced motion off.');
        break;
      case 'seek':
        syncPlay();
        lastBeat = null;
        break;
    }
  });

  // Text metrics change once the web fonts arrive, so measure the reserved bands and labels again (once, not per frame).
  void document.fonts?.ready.then(() => {
    applyInsets();
    for (const id of BOATS) measureLabel(id);
    invalidate();
  });

  // Initial paint of static state.
  syncDrafts();
  syncErrors();
  syncSpeed();
  syncPlay();
  applyReduced();
  buildScale();
  refreshSummary();
  syncDockHeight();

  return {
    update,
    place,
    invalidate,
    setFit(k) {
      if (Math.abs(k - fit) > 1e-4) {
        fit = k;
        postKey = '';
      }
    },
    announce: (t) => announce(t),
    setStageSize(w, h) {
      stageW = w;
      stageH = h;
      applyInsets();
      invalidate();
    },
  };
}
