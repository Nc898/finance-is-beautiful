/**
 * DOM layer. The static markup lives in bread-and-butter.html; this module wires it to the store, updates it only
 * when displayed values change, and owns the single polite live region.
 */
import {
  DATA_FETCHED,
  INDEX_SERIES,
  ITEMS,
  ITEM_KEYS,
  PAY_SERIES,
  PRICE_SERIES,
  formatCents,
  formatMinutesTenth,
  formatMultiple,
  formatPay,
  formatRate,
  landmarks,
  monthLabel,
  monthShortLabel,
  yearTable,
} from '../engine';
import type { BreadLabel, BreadSnapshot } from '../types';
import { FIELDS, LAST_MONTH, SPEED_MAX, SPEED_MIN, type Reason, type Store } from './store';
import { NOTE_KINDS, noteFor, noteKindAt } from './notes';
import type { Note, NoteKind } from './notes';
import {
  basketFormula,
  estimatedLines,
  fetchedText,
  labelText,
  minutesFormula,
  resultsSentence,
  sceneSummary,
  scrubSentence,
  timelineTicks,
} from './text';

const COMMIT_DEBOUNCE_MS = 250;
const SCRUB_ANNOUNCE_MS = 600;
const INPUT_ANNOUNCE_MS = 700;
const HIGHLIGHT_MS = 1500;
/** Room kept under the labels, CSS px. */
const BOTTOM_PAD = 12;

export interface Point {
  x: number;
  y: number;
}

export interface UIHooks {
  /** Top centre of a label's place in the bottom band. */
  labelAnchor(label: BreadLabel): Point;
  setInsets(insets: { top: number; bottom: number; side: number }): void;
}

export interface UI {
  /** Called every frame; touches the DOM only where displayed values changed. */
  update(snap: BreadSnapshot): void;
  /** Called every frame after the scene rendered: positions the labels from the scene's anchors. */
  place(): void;
  /** Force the next place() to recompute everything (after a resize or layout change). */
  invalidate(): void;
  /** Stage size in CSS px. */
  setStageSize(w: number, h: number): void;
  announce(text: string): void;
  /** Draw the eye to the controls (as the introduction closes): the panel, or its toggle when it is folded away. */
  highlight(): void;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

const SERIES_LINES: { code: string; name: string }[] = [
  { code: PRICE_SERIES.bread, name: 'Bread, white, pan, per lb' },
  { code: PRICE_SERIES.eggs, name: 'Eggs, grade A, large, per dozen' },
  { code: PRICE_SERIES.coffee, name: 'Coffee, 100% ground roast, per lb' },
  { code: PRICE_SERIES.bananas, name: 'Bananas, per lb' },
  { code: PRICE_SERIES.chicken, name: 'Chicken, fresh, whole, per lb' },
  { code: PRICE_SERIES.flour, name: 'Flour, white, all purpose, per lb' },
  { code: PAY_SERIES, name: "Median usual weekly earnings, full-time wage and salary workers, nominal, quarterly" },
  { code: INDEX_SERIES.cpi, name: 'Consumer price index, all items (prices overall)' },
  { code: INDEX_SERIES.foodAtHome, name: 'Consumer price index, food at home (all groceries)' },
  { code: INDEX_SERIES.core, name: 'Consumer price index, all items less food and energy (core)' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/** "$3.05" with, when the BLS did not publish it, "estimated: not published" under it. */
function figureCell(td: HTMLElement, text: string, estimated: boolean): void {
  td.textContent = text;
  if (estimated) td.appendChild(el('span', 'estimated: not published', 'est'));
}

export function createUI(store: Store, hooks: UIHooks): UI {
  const { state, actions } = store;

  const canvas = $<HTMLCanvasElement>('scene');
  const stage = $('stage');
  const dock = $('dock');
  const how = $<HTMLDetailsElement>('how');
  const announcer = $('announcer');
  const summaryEl = $('summary');
  const playBtn = $<HTMLButtonElement>('btn-play');
  const playLabel = $('play-label');
  const icoPlay = playBtn.querySelector<SVGElement>('.ico-play')!;
  const icoPause = playBtn.querySelector<SVGElement>('.ico-pause')!;
  const timeline = $<HTMLInputElement>('timeline');
  const ageReadout = $('age-readout');
  const yearReadout = $('year-readout');
  const ticksEl = $('scale-ticks');
  const reduceBox = $<HTMLInputElement>('reduce-motion');
  const speedSlider = $<HTMLInputElement>('speed');
  const speedReadout = $('speed-readout');
  // the speed slider runs on a log scale (0..1000), so slow speeds get as much travel as fast ones and 1x sits a
  // little past the middle; near 1x it settles on 1x exactly
  const LOG_SPAN = Math.log(SPEED_MAX / SPEED_MIN);
  const sliderToSpeed = (v: number): number => {
    const s = SPEED_MIN * Math.exp((v / 1000) * LOG_SPAN);
    return Math.abs(s - 1) < 0.06 ? 1 : s;
  };
  const speedToSlider = (s: number): number => Math.round((Math.log(s / SPEED_MIN) / LOG_SPAN) * 1000);
  const speedText = (s: number): string => `${Number.isInteger(s) ? s : s.toFixed(1)}`;

  const labels: Record<BreadLabel, { root: HTMLElement; w: number; h: number }> = {
    basket: { root: $('label-basket'), w: 0, h: 0 },
    minutes: { root: $('label-minutes'), w: 0, h: 0 },
    pay: { root: $('label-pay'), w: 0, h: 0 },
  };
  const receiptTotal = $('receipt-total');
  const receiptDate = $('receipt-date');
  const payAmount = $('pay-amount');
  const paySub = $('pay-sub');
  const headlineNum = $('headline-num');
  const headlineUnit = $('headline-unit');
  const headlineSub = $('headline-sub');

  const fieldEls = {} as Record<(typeof FIELDS)[number], { input: HTMLInputElement; error: HTMLElement }>;
  for (const f of FIELDS) fieldEls[f] = { input: $<HTMLInputElement>(`f-${f}`), error: $(`err-${f}`) };

  let stageW = 0;
  const narrow = () => stageW < 700;
  /** the least room between two labels in a row */
  const LABEL_GAP = 20;
  /** The headline goes under the receipt and the envelope on phones, and wherever the three will not sit side by side
   *  (judged against the room left with the panel open, so opening it never changes the bottom band). */
  const stacked = (): boolean => {
    if (narrow()) return true;
    const room = stageW - 16 - sideReserve();
    // (some slack for a longer number than the one measured: "100 minutes")
    return labels.basket.w + labels.minutes.w + 24 + labels.pay.w + 2 * LABEL_GAP > room;
  };

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
    const text = sceneSummary(state.basket, state.month);
    canvas.setAttribute('aria-label', text);
    setText(summaryEl, text);
  }
  function scheduleSummary(delay: number): void {
    window.clearTimeout(summaryTimer);
    summaryTimer = window.setTimeout(refreshSummary, delay);
  }

  /* ---------------- timeline scale bar ---------------- */

  function buildScale(): void {
    timeline.min = '0';
    timeline.max = String(LAST_MONTH);
    ticksEl.textContent = '';
    const frag = document.createDocumentFragment();
    for (const tick of timelineTicks()) {
      const left = `${(tick.month / LAST_MONTH) * 100}%`;
      const t = el('span', undefined, tick.major ? 'tick major' : 'tick');
      t.style.left = left;
      frag.appendChild(t);
      if (tick.label) {
        const lab = el('span', tick.label, 'tick-label');
        lab.style.left = left;
        frag.appendChild(lab);
      }
    }
    ticksEl.appendChild(frag);
  }

  /* ---------------- stable insets for the scene ---------------- */

  const ghostCap = $('cap-ghost');
  let lastInsets = { top: -1, bottom: -1, side: -1 };

  /** Wide screens reserve the side panel's width whether it is open or not, so toggling it only slides the scene.
   *  (read from the stylesheet once per size, never per frame) */
  let panelW = -1;
  function sideReserve(): number {
    if (stageW < 900) return 0;
    if (panelW < 0) panelW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 0;
    return panelW;
  }

  /** Tallest note the basket can produce, at the current width (measured in a hidden twin). */
  function tallestCaption(): number {
    let tallest = 0;
    for (const kind of NOTE_KINDS) {
      const c = noteFor(kind, state.basket);
      setText(ghostCap.querySelector<HTMLElement>('.cap-1')!, c.primary);
      setText(ghostCap.querySelector<HTMLElement>('.cap-2')!, c.secondary ?? '');
      tallest = Math.max(tallest, ghostCap.offsetHeight);
    }
    return tallest;
  }

  /** The bottom band holds the labels (the receipt and the envelope; on phones the headline too, under them). */
  function bottomBand(): number {
    let h = Math.max(labels.basket.h, labels.pay.h) + BOTTOM_PAD;
    if (stacked()) h += labels.minutes.h + 6;
    return Math.ceil(h);
  }

  function applyInsets(): void {
    if (!stageW) return;
    const capEl = $('caption');
    const capTop = parseFloat(getComputedStyle(capEl).getPropertyValue('--cap-top-closed')) || capEl.offsetTop;
    const masthead = (document.querySelector('.masthead') as HTMLElement).offsetHeight;
    const capBottom = capTop + tallestCaption();
    // on phones the year readout sits just under the note
    stage.style.setProperty('--year-top', `${Math.round(capBottom + 4)}px`);
    const top = Math.ceil(Math.max(masthead + 4, capBottom + 4 + (narrow() ? 22 : 0)));
    const bottom = bottomBand();
    const side = sideReserve();
    if (top !== lastInsets.top || bottom !== lastInsets.bottom || side !== lastInsets.side) {
      lastInsets = { top, bottom, side };
      hooks.setInsets({ top, bottom, side });
      invalidate();
    }
  }

  /** Horizontal range (overlay coordinates) in which labels may sit: with the panel open on wide screens the overlay
   *  is slid left by half the panel. */
  function labelRange(): { lo: number; hi: number } {
    const shift = panelOpen() && stageW >= 900 ? sideReserve() / 2 : 0;
    return { lo: 8 + shift, hi: stageW - 8 - shift };
  }

  /* ---------------- the labels ---------------- */

  let labelsKey = '';

  function measureAll(): void {
    for (const k of Object.keys(labels) as BreadLabel[]) {
      labels[k].w = labels[k].root.offsetWidth;
      labels[k].h = labels[k].root.offsetHeight;
    }
  }

  function updateLabels(snap: BreadSnapshot): void {
    const t = labelText(state.basket, snap.row);
    const key = `${t.receiptTotal}|${t.receiptDate}|${t.payAmount}|${t.paySub}|${t.minutes}|${t.minutesSub}`;
    if (key === labelsKey) return;
    labelsKey = key;
    setText(receiptTotal, t.receiptTotal);
    setText(receiptDate, t.receiptDate);
    setText(payAmount, t.payAmount);
    setText(paySub, t.paySub);
    setText(headlineNum, t.minutes);
    setText(headlineUnit, t.minutesUnit);
    setText(headlineSub, t.minutesSub);
    // (the sizes are fixed by the stylesheet; they are measured when the layout changes, never per month)
  }

  const lastTransform: Record<string, string> = {};

  /** Sit a box with its top-centre at (cx, top), clamped inside the range. */
  function put(label: BreadLabel, cx: number, top: number, range: { lo: number; hi: number }): void {
    const { root, w } = labels[label];
    const x = Math.max(range.lo, Math.min(range.hi - w, cx - w / 2));
    const tf = `translate(${Math.round(x)}px, ${Math.round(top)}px)`;
    if (tf !== lastTransform[label]) {
      lastTransform[label] = tf;
      root.style.transform = tf;
    }
  }

  function placeLabels(): void {
    const range = labelRange();
    const a = hooks.labelAnchor('basket');
    const b = hooks.labelAnchor('pay');
    const m = hooks.labelAnchor('minutes');
    if (stacked()) {
      // the receipt and the envelope at their places (pushed apart if they would touch), the headline under them
      const [xa, xb] = row([a.x, b.x], [labels.basket.w, labels.pay.w], range);
      put('basket', xa, a.y, range);
      put('pay', xb, b.y, range);
      const below = Math.max(labels.basket.h, labels.pay.h) + Math.max(a.y, b.y) + 6;
      put('minutes', (xa + xb) / 2, below, range);
      return;
    }
    // the three in a row at their places in the scene, pushed apart where they would touch
    const [xa, xm, xb] = row([a.x, m.x, b.x], [labels.basket.w, labels.minutes.w, labels.pay.w], range);
    put('basket', xa, a.y, range);
    put('minutes', xm, m.y, range);
    put('pay', xb, b.y, range);
  }

  /**
   * Centres for boxes in a row, left to right: each as near its wanted centre as it can be, never closer to the next
   * than LABEL_GAP, all inside the range. Boxes that would touch are pushed apart from the middle of their group.
   */
  function row(want: number[], w: number[], range: { lo: number; hi: number }): number[] {
    const n = want.length;
    const left = want.map((c, i) => c - w[i]! / 2);
    // forward: each clear of the one before it; then back from the range's end; then from its start again
    for (let i = 1; i < n; i++) left[i] = Math.max(left[i]!, left[i - 1]! + w[i - 1]! + LABEL_GAP);
    left[n - 1] = Math.min(left[n - 1]!, range.hi - w[n - 1]!);
    for (let i = n - 2; i >= 0; i--) left[i] = Math.min(left[i]!, left[i + 1]! - LABEL_GAP - w[i]!);
    left[0] = Math.max(left[0]!, range.lo);
    for (let i = 1; i < n; i++) left[i] = Math.max(left[i]!, left[i - 1]! + w[i - 1]! + LABEL_GAP);
    return left.map((l, i) => l + w[i]! / 2);
  }

  function invalidate(): void {
    for (const k of Object.keys(lastTransform)) delete lastTransform[k];
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
  const repass = () => {
    if (passQueued) return;
    passQueued = true;
    requestAnimationFrame(() => {
      passQueued = false;
      syncDockHeight();
      measureAll();
      applyInsets();
      invalidate();
    });
  };
  new ResizeObserver(repass).observe(dock);
  const labelObs = new ResizeObserver(repass);
  for (const k of Object.keys(labels) as BreadLabel[]) labelObs.observe(labels[k].root);
  how.addEventListener('toggle', () => {
    syncDockHeight();
    if (how.open) updateTables(true);
  });

  /* ---------------- notes ---------------- */

  const layers = Array.from(document.querySelectorAll<HTMLElement>('#caption .cap[data-layer]'));
  let activeLayer = 0;
  let captionKey = '';
  function setCaption(c: Note | null): void {
    // a live secondary line is rewritten in place, so it is not part of the identity of the caption
    const key = c ? `${c.kind}|${c.primary}|${c.live ? '' : (c.secondary ?? '')}` : '';
    if (key === captionKey) {
      if (c?.live) setText(layers[activeLayer].querySelector<HTMLElement>('.cap-2')!, c.secondary ?? '');
      return;
    }
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

  /* ---------------- "How this is calculated" ---------------- */

  const cells = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-cell]').forEach((c) => cells.set(c.dataset.cell!, c));
  const setCell = (k: string, v: string) => {
    const e = cells.get(k);
    if (e) setText(e, v);
  };
  const priceBody = $('prices-table').querySelector('tbody')!;
  const yearlyBody = $('yearly').querySelector('tbody')!;

  /** The parts that depend only on the basket: the year table, the growth since 1980, the notes under it. */
  let basketTableKey = '';
  let nowYear = -1;
  function fillBasketTables(): void {
    const key = ITEM_KEYS.map((k) => state.basket.qty[k]).join(',');
    if (key === basketTableKey) return;
    basketTableKey = key;
    const L = landmarks(state.basket);
    setCell('since.basket', ITEM_KEYS.some((k) => state.basket.qty[k] > 0) ? formatMultiple(L.growth.basket) : 'no basket');
    setCell('since.groceries', formatMultiple(L.growth.groceries));
    setCell('since.overall', formatMultiple(L.growth.overall));
    setCell('since.core', formatMultiple(L.growth.core));
    setCell('since.pay', formatMultiple(L.growth.pay));
    const g = L.growth;
    const parts: string[] = [];
    if (g.pay > Math.max(g.groceries, g.overall, g.core)) parts.push('Pay rose more than every price measure here.');
    if (ITEM_KEYS.some((k) => state.basket.qty[k] > 0) && g.basket < g.groceries) parts.push('This basket of staples rose less than groceries overall.');
    setCell('sinceNote', parts.join(' '));

    yearlyBody.textContent = '';
    const frag = document.createDocumentFragment();
    const star = (td: HTMLElement) => {
      td.appendChild(el('span', '*', 'star'));
      td.appendChild(el('span', ' (includes estimated months)', 'sr-only'));
    };
    for (const row of yearTable(state.basket)) {
      const est = ITEM_KEYS.some((k) => state.basket.qty[k] > 0 && row.prices[k].estimated);
      const tr = el('tr');
      tr.dataset.year = String(row.year);
      const th = el('th', row.label);
      th.scope = 'row';
      if (row.shortLabel !== row.label) th.appendChild(el('span', row.shortLabel, 'part'));
      tr.appendChild(th);
      const cellsOf: [string, boolean][] = [
        [formatCents(row.basket), est],
        [formatPay(row.weeklyPay.value), row.weeklyPay.estimated],
        [formatMinutesTenth(row.minutes), est || row.weeklyPay.estimated],
        [formatRate(row.inflation.overall.value), row.inflation.overall.estimated],
        [formatRate(row.inflation.groceries.value), row.inflation.groceries.estimated],
      ];
      for (const [text, estimated] of cellsOf) {
        const td = el('td', text);
        if (estimated) star(td);
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    yearlyBody.appendChild(frag);
    nowYear = -1;
    tableKey = '';
  }

  /** The static parts: months not published, sources. */
  function fillStatic(): void {
    const gaps = $('gaps');
    gaps.textContent = '';
    for (const line of estimatedLines()) {
      const li = el('li');
      li.appendChild(el('strong', `${line.name}: `));
      li.appendChild(document.createTextNode(line.months));
      gaps.appendChild(li);
    }
    const src = $('sources');
    src.textContent = '';
    const intro = el('li', 'U.S. Bureau of Labor Statistics, through FRED (Federal Reserve Bank of St. Louis). Prices are U.S. city averages, not seasonally adjusted.');
    src.appendChild(intro);
    for (const s of SERIES_LINES) {
      const li = el('li', `${s.name}: `);
      li.appendChild(el('span', s.code, 'code'));
      src.appendChild(li);
    }
    src.appendChild(el('li', `Fetched ${fetchedText(DATA_FETCHED)}.`));
  }

  let lastSnap: BreadSnapshot | null = null;
  let lastNote: NoteKind | null = null;
  let noteMonth = -1;
  let timelineKey = '';
  let tableKey = '';
  let basketRef: unknown = null;

  function updateTables(force = false, snap: BreadSnapshot | null = lastSnap): void {
    if (!how.open || !snap) return;
    fillBasketTables();
    const m = snap.statementMonth;
    const key = `${m}|${basketTableKey}`;
    if (!force && key === tableKey) return;
    tableKey = key;
    const row = snap.row;
    setText($('how-month'), row.shortLabel);
    setCell('basketFormula', basketFormula(state.basket, row));
    setCell('minutesFormula', minutesFormula(row));
    setCell(
      'coreNote',
      `Core inflation leaves out food and energy, so it is not used here. This month it was ${formatRate(row.inflation.core.value)}${row.inflation.core.estimated ? ' (estimated)' : ''}.`,
    );
    priceBody.textContent = '';
    const frag = document.createDocumentFragment();
    for (const k of ITEM_KEYS) {
      const p = row.prices[k];
      const tr = el('tr');
      const th = el('th', ITEMS[k].label);
      th.scope = 'row';
      th.appendChild(el('span', `${state.basket.qty[k]} × ${ITEMS[k].unit}`, 'part'));
      tr.appendChild(th);
      const price = el('td');
      figureCell(price, `${formatCents(p.value)}`, p.estimated);
      tr.appendChild(price);
      tr.appendChild(el('td', formatCents(state.basket.qty[k] * p.value)));
      frag.appendChild(tr);
    }
    const total = el('tr', undefined, 'strong');
    const tth = el('th', 'Basket');
    tth.scope = 'row';
    total.appendChild(tth);
    total.appendChild(el('td', ''));
    total.appendChild(el('td', formatCents(row.basket)));
    frag.appendChild(total);
    const pay = el('tr', undefined, 'strong');
    const pth = el('th', "A week's pay");
    pth.scope = 'row';
    pth.appendChild(el('span', 'the quarter’s median', 'part'));
    pay.appendChild(pth);
    const payCell = el('td');
    figureCell(payCell, formatPay(row.weeklyPay.value), row.weeklyPay.estimated);
    pay.appendChild(payCell);
    pay.appendChild(el('td', ''));
    frag.appendChild(pay);
    priceBody.appendChild(frag);

    // the row of the year on the clock is marked in the yearly table
    if (row.year !== nowYear) {
      yearlyBody.querySelector('tr.now')?.classList.remove('now');
      yearlyBody.querySelector(`tr[data-year="${row.year}"]`)?.classList.add('now');
      nowYear = row.year;
    }
  }

  /* ---------------- per-frame update ---------------- */

  function update(snap: BreadSnapshot): void {
    lastSnap = snap;

    // The note for the month on the clock (announced as it changes while playing; a drag announces the moment it
    // lands on instead).
    const kind = noteKindAt(snap.statementMonth);
    if (snap.statementMonth !== noteMonth || state.basket !== basketRef) {
      noteMonth = snap.statementMonth;
      basketRef = state.basket;
      const note = noteFor(kind, state.basket, snap.statementMonth);
      const kindChanged = kind !== lastNote;
      lastNote = kind;
      setCaption(note);
      if (kindChanged && state.playing) announce([note.primary, note.secondary].filter(Boolean).join(' '));
    }

    // the labels' numbers change only when the statement month turns over (or the basket changes)
    updateLabels(snap);

    // Timeline + readouts (on the statement month: whole months, as a statement moves).
    const m = snap.statementMonth;
    if (String(m) !== timelineKey) {
      timelineKey = String(m);
      if (document.activeElement !== timeline || String(m) !== timeline.value) timeline.value = String(m);
      timeline.style.setProperty('--frac', String(m / LAST_MONTH));
      timeline.setAttribute('aria-valuetext', monthLabel(m));
      setText(ageReadout, monthShortLabel(m));
      setText(yearReadout, monthShortLabel(m));
    }

    updateTables(false, snap);
  }

  function place(): void {
    placeLabels();
  }

  /* ---------------- controls ---------------- */

  function syncPlay(): void {
    setText(playLabel, state.playing ? 'Pause' : 'Play');
    icoPlay.toggleAttribute('hidden', state.playing);
    icoPause.toggleAttribute('hidden', !state.playing);
  }

  function syncSpeed(): void {
    const s = state.speed;
    setText(speedReadout, `${speedText(s)}×`);
    speedSlider.setAttribute('aria-valuetext', `${speedText(s)} times speed`);
    // leave the thumb where the hand put it unless the speed came from elsewhere
    if (Math.abs(sliderToSpeed(Number(speedSlider.value)) - s) > 0.051) speedSlider.value = String(speedToSlider(s));
    speedSlider.style.setProperty('--frac', String(Number(speedSlider.value) / 1000));
  }

  function syncDrafts(): void {
    for (const f of FIELDS) {
      const e = fieldEls[f].input;
      if (e.value !== state.draft[f]) e.value = state.draft[f];
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
    const target = panelOpen() ? dock : panelToggle;
    target.classList.remove('hl');
    void target.offsetWidth;
    target.classList.add('hl');
    window.setTimeout(() => target.classList.remove('hl'), HIGHLIGHT_MS * 2);
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
  speedSlider.addEventListener('input', () => {
    actions.setSpeed(sliderToSpeed(Number(speedSlider.value)));
    speedSlider.style.setProperty('--frac', String(Number(speedSlider.value) / 1000));
  });
  reduceBox.addEventListener('change', () => actions.setReducedMotion(reduceBox.checked));

  timeline.addEventListener('input', () => actions.scrubTo(Number(timeline.value)));
  timeline.addEventListener('keydown', (e) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      actions.scrubTo(Math.round(state.month) + (e.key === 'PageUp' ? 12 : -12));
      timeline.value = String(Math.round(state.month));
    }
  });

  // Quantities: debounce while typing; commit on blur / Enter; arrows step.
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
    const f = btn.closest<HTMLElement>('.field')!.dataset.field as (typeof FIELDS)[number];
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
    if (t && t.closest('input, textarea, select, button, summary, a, [contenteditable], dialog')) return;
    e.preventDefault();
    actions.togglePlay();
  });

  /* ---------------- store events (discrete) ---------------- */

  function resetKeys(): void {
    timelineKey = '';
    labelsKey = '';
    tableKey = '';
    lastNote = null;
    noteMonth = -1;
    invalidate();
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
        applyInsets();
        resetKeys();
        refreshSummary();
        updateTables(true);
        announce(`Updated. ${resultsSentence(state.basket, state.month)}`, INPUT_ANNOUNCE_MS);
        break;
      case 'play':
        syncPlay();
        announce('Playing.');
        break;
      case 'pause':
        syncPlay();
        refreshSummary();
        announce(`Paused. ${monthLabel(Math.floor(state.month))}.`);
        break;
      case 'play-end':
        syncPlay();
        refreshSummary();
        announce(`Reached the end. ${monthLabel(Math.floor(state.month))}.`);
        break;
      case 'speed':
        syncSpeed();
        break;
      case 'scrub':
        syncPlay();
        window.clearTimeout(summaryTimer);
        scheduleSummary(SCRUB_ANNOUNCE_MS);
        announce(scrubSentence(state.basket, state.month), SCRUB_ANNOUNCE_MS);
        break;
      case 'reduced':
        applyReduced();
        syncPlay();
        lastNote = null;
        refreshSummary();
        announce(state.reducedMotion ? 'Reduced motion on.' : 'Reduced motion off.');
        break;
    }
  });

  // Text metrics change once the web fonts arrive, so measure the reserved bands and labels again (once, not per frame).
  void document.fonts?.ready.then(() => {
    measureAll();
    applyInsets();
    invalidate();
  });

  // Initial paint of static state.
  syncDrafts();
  syncErrors();
  syncSpeed();
  syncPlay();
  applyReduced();
  buildScale();
  fillStatic();
  refreshSummary();
  syncDockHeight();

  return {
    update,
    place,
    invalidate,
    announce: (t) => announce(t),
    highlight: () => highlight(),
    setStageSize(w) {
      stageW = w;
      panelW = -1;
      measureAll();
      applyInsets();
      invalidate();
    },
  };
}
