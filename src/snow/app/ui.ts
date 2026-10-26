/**
 * DOM layer. The static markup lives in on-a-roll.html; this module wires it to the store,
 * updates it only when displayed values change, and owns the single polite live region.
 */
import {
  DEBTS,
  DEBT_SHORT,
  STRATEGIES,
  STRATEGY_LABEL,
  ballTag,
  formatCents,
  formatCurrency,
  formatDuration,
  joinList,
  largestStart,
  statementMonth,
  strategySchedule,
  yearMonthLabel,
} from '../engine';
import type { DebtId, SnowField, StrategyId, StrategySnapshot } from '../engine';
import { ballRadius, depthScale, fitCamera, lanePoint } from '../scene/geom';
import { FIELDS, SPEED_MAX, SPEED_MIN } from './store';
import type { Reason, Store } from './store';
import { BEATS, captionForBeat, interestLiveLine, storyBeat, storyCaption } from './story';
import type { StoryBeat, StoryCaption } from './story';
import { budgetNote, interestText, owedText, resultsSentence, sceneSummary, scrubSentence, timelineTicks } from './text';

const COMMIT_DEBOUNCE_MS = 250;
const SCRUB_ANNOUNCE_MS = 600;
const INPUT_ANNOUNCE_MS = 700;
const HIGHLIGHT_MS = 1500;
/** Room under the hills, CSS px (phones keep the year readout clear of the snowbank). */
const BOTTOM_BAND_WIDE = 10;
const BOTTOM_BAND_NARROW = 40;
/** The widest a hill label may be, and the least. */
const LABEL_MAX_W = 300;
const LABEL_MIN_W = 118;

export interface Point {
  x: number;
  y: number;
}

export interface UIHooks {
  /** Above a hill's crest, camera applied. */
  labelAnchor(id: StrategyId): Point;
  /** Just above a ball, camera applied. */
  ballAnchor(id: StrategyId, debt: DebtId): Point;
  setInsets(insets: { top: number; bottom: number; side: number }): void;
  /** The last frame's camera move as screen' = a * screen + (bx, by). */
  cameraTransform(): { a: number; bx: number; by: number };
}

export interface UI {
  /** Called every frame; touches the DOM only where displayed values changed. */
  update(snaps: readonly StrategySnapshot[]): void;
  /** Called every frame after the scene rendered: positions the labels from the scene's anchors. */
  place(): void;
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

/** The element id for a field ('card.apr' -> 'card-apr'). */
const fieldId = (field: SnowField): string => field.replace('.', '-');

/**
 * Identity emblems (never colour alone): a snowball for the snowball method, a mountain with a slide of snow for the
 * avalanche. Ink outlines over a light tint, as the collection's other emblems.
 */
export function emblemSVG(id: StrategyId): string {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  let body: string;
  if (id === 'snowball') {
    const ball = 'M12.2 4.6C16.9 4.4 20.7 8.3 20.3 13.1 19.9 17.8 16.2 21 11.7 20.8 7.1 20.6 3.7 17 3.9 12.5 4.1 8.2 7.7 4.8 12.2 4.6z';
    body =
      `<path class="tint" d="${ball}"/><path ${s} d="${ball}"/>` +
      `<path ${s} d="M7.6 10C8.8 8.4 10.5 7.6 12.4 7.7"/>` +
      `<path ${s} stroke-width="2" d="M15.4 15.5h.01M10.2 16.8h.01M16.6 11.4h.01"/>`;
  } else {
    const hill = 'M2.8 20.4 10 5.2 13.6 11.6 16.4 8.4 21.2 20.4z';
    body =
      `<path class="tint" d="${hill}"/><path ${s} d="${hill}"/>` +
      `<path ${s} d="M10 5.2 8.2 9.2 9.8 8.6 11 10.2 12.2 8.8 13.6 11.6"/>` +
      `<path ${s} d="M14.6 12.4C15.6 14.6 17 16.4 19.4 17.6"/>` +
      `<path ${s} stroke-width="2" d="M16.2 17.6h.01M13.4 18.6h.01M18.4 19.6h.01"/>`;
  }
  return `<svg class="em em-${id}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

function hydrateEmblems(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-emblem]').forEach((el) => {
    el.innerHTML = emblemSVG(el.dataset.emblem as StrategyId);
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
  const speedSlider = $('speed') as HTMLInputElement;
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
  const overlay = $('overlay');

  interface HillLabelEls {
    root: HTMLElement;
    name: HTMLElement;
    owed: HTMLElement;
    w: number;
    h: number;
  }
  interface TagEls {
    root: HTMLElement;
    amount: HTMLElement;
    w: number;
    h: number;
  }
  interface BallTagEls {
    root: HTMLElement;
    name: HTMLElement;
    owed: HTMLElement;
    w: number;
    h: number;
  }
  const labels = {} as Record<StrategyId, HillLabelEls>;
  const tags = {} as Record<StrategyId, TagEls>;
  const ballTags = {} as Record<StrategyId, Record<DebtId, BallTagEls>>;
  for (const id of STRATEGIES) {
    const root = $(`lab-${id}`);
    labels[id] = { root, name: root.querySelector<HTMLElement>('.hl-name')!, owed: root.querySelector<HTMLElement>('.hl-owed')!, w: 0, h: 0 };
    const tag = $(`tag-${id}`);
    tags[id] = { root: tag, amount: tag.querySelector<HTMLElement>('.it-amount')!, w: 0, h: 0 };
    ballTags[id] = {} as Record<DebtId, BallTagEls>;
    for (const d of DEBTS) {
      const el = $(`bt-${id}-${d}`);
      el.setAttribute('aria-hidden', 'true');
      // two lines: the debt and its rate, and what is owed on it now
      const name = document.createElement('span');
      name.className = 'bt-name';
      const owed = document.createElement('span');
      owed.className = 'bt-owed';
      el.replaceChildren(name, owed);
      ballTags[id][d] = { root: el, name, owed, w: 0, h: 0 };
    }
  }

  const fieldEls = {} as Record<SnowField, { input: HTMLInputElement; error: HTMLElement }>;
  for (const f of FIELDS) fieldEls[f] = { input: $<HTMLInputElement>(`f-${fieldId(f)}`), error: $(`err-${fieldId(f)}`) };
  const budgetNoteEl = $('note-budget');

  let stageW = 0;
  let stageH = 0;

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
    const text = sceneSummary(state.inputs, state.months);
    canvas.setAttribute('aria-label', text);
    setText(summaryEl, text);
  }
  function scheduleSummary(delay: number): void {
    window.clearTimeout(summaryTimer);
    summaryTimer = window.setTimeout(refreshSummary, delay);
  }

  /* ---------------- timeline scale bar ---------------- */

  function buildScale(): void {
    const total = store.horizon();
    timeline.min = '0';
    timeline.max = String(total);
    ticksEl.textContent = '';
    const frag = document.createDocumentFragment();
    for (const tick of timelineTicks(total)) {
      const left = `${(total === 0 ? 0 : tick.month / total) * 100}%`;
      const t = document.createElement('span');
      t.className = tick.major ? 'tick major' : 'tick';
      t.style.left = left;
      frag.appendChild(t);
      if (tick.label) {
        const lab = document.createElement('span');
        lab.className = 'tick-label';
        lab.style.left = left;
        lab.textContent = tick.label;
        frag.appendChild(lab);
      }
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
    const bottom = stageW < 700 ? BOTTOM_BAND_NARROW : BOTTOM_BAND_WIDE;
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

  /* ---------------- hill labels, interest lines and ball tags ---------------- */

  const labelKey: Record<StrategyId, string> = { snowball: '', avalanche: '' };
  const tagKey: Record<StrategyId, string> = { snowball: '', avalanche: '' };
  const ballOff: Record<string, boolean> = {};
  const ballOwed: Record<string, string> = {};

  function measureAll(): void {
    for (const id of STRATEGIES) {
      labels[id].w = labels[id].root.offsetWidth;
      labels[id].h = labels[id].root.offsetHeight;
      tags[id].w = tags[id].root.offsetWidth;
      tags[id].h = tags[id].root.offsetHeight;
      for (const d of DEBTS) {
        ballTags[id][d].w = ballTags[id][d].root.offsetWidth;
        ballTags[id][d].h = ballTags[id][d].root.offsetHeight;
      }
    }
  }

  /** "Card 26%" and the like: the tags follow the rates in the inputs. */
  function writeBallTags(): void {
    for (const id of STRATEGIES) {
      for (const d of DEBTS) setText(ballTags[id][d].name, ballTag(d, state.inputs.debts[d].apr));
    }
    measureAll();
  }

  function updateLabel(snap: StrategySnapshot): void {
    const L = labels[snap.id];
    const name = STRATEGY_LABEL[snap.id];
    const owed = owedText(snap);
    const key = `${name}|${owed}`;
    if (key !== labelKey[snap.id]) {
      labelKey[snap.id] = key;
      setText(L.name, name);
      setText(L.owed, owed);
      L.root.classList.toggle('paid', snap.paidOff);
      L.w = L.root.offsetWidth;
      L.h = L.root.offsetHeight;
    }
    const T = tags[snap.id];
    const amount = interestText(snap);
    if (amount !== tagKey[snap.id]) {
      tagKey[snap.id] = amount;
      setText(T.amount, amount);
      T.w = T.root.offsetWidth;
      T.h = T.root.offsetHeight;
      // the interest line sits in the label, under what is owed: the label's size follows it
      L.w = L.root.offsetWidth;
      L.h = L.root.offsetHeight;
    }
    // a debt that is cleared has no ball any more: its small tag goes with it
    for (const d of DEBTS) {
      // (gone with its ball, and from the moment what is owed rounds to nothing)
      const off = snap.debts[d].paidOff || snap.debts[d].owed < 0.5;
      const k = `${snap.id}-${d}`;
      // what is owed on it now, as a statement shows it (up with the month's interest, down with the payment)
      const owedNow = off ? '' : formatCurrency(snap.debts[d].owed);
      const bt = ballTags[snap.id][d];
      if (ballOwed[k] !== owedNow) {
        ballOwed[k] = owedNow;
        setText(bt.owed, owedNow);
        bt.w = bt.root.offsetWidth;
        bt.h = bt.root.offsetHeight;
      }
      if (ballOff[k] !== off) {
        ballOff[k] = off;
        ballTags[snap.id][d].root.classList.toggle('off', off);
      }
    }
  }

  const lastTransform: Record<string, string> = {};
  let lastMaxW = -1;

  /** Sit a box so its bottom-centre is at the anchor, clamped inside the stage. */
  function put(el: HTMLElement, key: string, a: Point, w: number, h: number, range: { lo: number; hi: number }): Box {
    const x = Math.max(range.lo, Math.min(range.hi - w, a.x - w / 2));
    const y = a.y - h;
    move(el, key, x, y);
    return { x, y, w, h };
  }

  function move(el: HTMLElement, key: string, x: number, y: number): void {
    const tf = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (tf !== lastTransform[key]) {
      lastTransform[key] = tf;
      el.style.transform = tf;
    }
  }

  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const hits = (a: Box, b: Box, m = 3): boolean => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

  /** The panel toggle's box in overlay coordinates (it sits over the scene's edge), so name tags keep clear of it. */
  function toggleBox(): Box | null {
    const open = panelOpen();
    if (stageW < 700) return open ? null : { x: stageW - 44, y: stageH - 80, w: 44, h: 60 };
    const panelW = Math.min(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 372, stageW * 0.92);
    const shift = open && stageW >= 900 ? panelW / 2 : 0;
    return { x: stageW - (open ? panelW : 0) - 30 + shift, y: stageH / 2 - 32, w: 30, h: 64 };
  }

  /**
   * A ball's name tag sits just BELOW the ball, in the snow it is rolling toward (the climber stands behind the ball,
   * above it on screen, so the tag never covers a face). Returns the tag's top-centre, or null before the camera is known.
   */
  function ballTagPoint(id: StrategyId, d: DebtId): Point | null {
    const snap = lastSnaps.find((x) => x.id === id)?.debts[d];
    if (!snap || lastInsets.top < 0 || !stageH) return null;
    const a = hooks.ballAnchor(id, d);
    const start = state.inputs.debts[d].balance;
    const size = Math.max(0, snap.balance / largestStart(state.inputs));
    const contact = lanePoint(id, d, Math.max(0, Math.min(1, 1 - snap.balance / start)));
    const r = Math.max(2 * depthScale(contact.y), ballRadius(size, contact.y));
    const k = hooks.cameraTransform().a * fitCamera(stageW, stageH, 1, lastInsets).s;
    // the scene's anchor is 2r + 6 world units above the contact point; the tag goes a little under it
    return { x: a.x, y: a.y + (2 * r + 6 + 3 + 0.08 * r) * k };
  }

  function placeLabels(): void {
    const range = labelRange();
    const a = { snowball: hooks.labelAnchor('snowball'), avalanche: hooks.labelAnchor('avalanche') };
    // The two labels must never touch: they may be no wider than the space between the two crests, nor than half
    // the stage (on a phone both are pushed in from the edges, toward each other).
    const room = Math.min(Math.abs(a.avalanche.x - a.snowball.x), (range.hi - range.lo) / 2) - 14;
    const maxW = Math.round(Math.max(LABEL_MIN_W, Math.min(LABEL_MAX_W, room)));
    if (maxW !== lastMaxW) {
      lastMaxW = maxW;
      overlay.style.setProperty('--label-max', `${maxW}px`);
      measureAll();
    }
    const fixed: Box[] = [];
    const tog = toggleBox();
    if (tog) fixed.push(tog);
    for (const id of STRATEGIES) {
      // (the interest line sits inside the label, under what is owed, so it moves with it)
      fixed.push(put(labels[id].root, `l${id}`, a[id], labels[id].w, labels[id].h, range));
    }
    // the ball tags: under their balls, nudged apart from each other, the labels and the panel toggle
    const todo: Array<{ id: StrategyId; d: DebtId; p: Point }> = [];
    for (const id of STRATEGIES) {
      for (const d of DEBTS) {
        const p = ballTagPoint(id, d) ?? hooks.ballAnchor(id, d);
        if (!ballOff[`${id}-${d}`]) todo.push({ id, d, p });
        else put(ballTags[id][d].root, `b${id}${d}`, p, ballTags[id][d].w, 0, range);
      }
    }
    todo.sort((u, v) => u.p.y - v.p.y || u.p.x - v.p.x);
    const placed: Box[] = [];
    for (const t of todo) {
      const b = ballTags[t.id][t.d];
      const box: Box = { x: Math.max(range.lo, Math.min(range.hi - b.w, t.p.x - b.w / 2)), y: t.p.y, w: b.w, h: b.h };
      for (let pass = 0; pass < 8; pass++) {
        const hit = fixed.find((f) => hits(box, f)) ?? placed.find((f) => hits(box, f));
        if (!hit) break;
        if (hit === tog) box.x = Math.max(range.lo, hit.x - box.w - 4);
        else box.y = hit.y + hit.h + 2;
      }
      box.y = Math.min(box.y, stageH - box.h - 4);
      placed.push(box);
      move(b.root, `b${t.id}${t.d}`, box.x, box.y);
    }
  }

  function invalidate(): void {
    for (const k of Object.keys(lastTransform)) delete lastTransform[k];
    lastMaxW = -1;
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
      measureAll();
      invalidate();
    });
  }).observe(dock);
  const labelObs = new ResizeObserver(() => {
    if (passQueued) return;
    passQueued = true;
    requestAnimationFrame(() => {
      passQueued = false;
      measureAll();
      invalidate();
    });
  });
  for (const id of STRATEGIES) {
    labelObs.observe(labels[id].root);
    labelObs.observe(tags[id].root);
    for (const d of DEBTS) labelObs.observe(ballTags[id][d].root);
  }
  how.addEventListener('toggle', () => {
    syncDockHeight();
    if (how.open) updateTables(true);
  });

  /* ---------------- captions ---------------- */

  const layers = Array.from(document.querySelectorAll<HTMLElement>('#caption .cap[data-layer]'));
  let activeLayer = 0;
  let captionKey = '';
  function setCaption(c: StoryCaption | null): void {
    // a live secondary line is rewritten in place, so it is not part of the identity of the caption
    const key = c ? `${c.beat}|${c.primary}|${c.live ? '' : (c.secondary ?? '')}` : '';
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

  /* ---------------- tables in "How this is calculated" ---------------- */

  const cells = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-cell]').forEach((c) => cells.set(c.dataset.cell!, c));
  const setCell = (k: string, v: string) => {
    const el = cells.get(k);
    if (el) setText(el, v);
  };

  function fillExcerpt(id: StrategyId): void {
    const table = $(`excerpt-${id}`);
    const body = table.querySelector('tbody')!;
    const rows = strategySchedule(state.inputs, id).rows;
    body.textContent = '';
    for (const r of rows.slice(0, 4)) {
      const tr = document.createElement('tr');
      const head = document.createElement('th');
      head.scope = 'row';
      head.textContent = String(r.month);
      tr.appendChild(head);
      const sum = (pick: (d: DebtId) => number) => DEBTS.reduce((s, d) => s + pick(d), 0);
      const values = [
        formatCents(sum((d) => r.debts[d].interest)),
        formatCents(sum((d) => r.debts[d].payment)),
        formatCents(sum((d) => r.debts[d].balance)),
        r.target ? DEBT_SHORT[r.target] : 'None',
      ];
      for (const v of values) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  let planTableKey = '';
  function fillPlanTable(): void {
    const i = state.inputs;
    const key = `${i.budget}|${DEBTS.map((d) => `${i.debts[d].balance},${i.debts[d].apr},${i.debts[d].minPayment}`).join('|')}`;
    if (key === planTableKey) return;
    planTableKey = key;
    for (const id of STRATEGIES) {
      const s = strategySchedule(i, id);
      setCell(`${id}.order`, joinList(s.order.map((d) => DEBT_SHORT[d])));
      setCell(`${id}.payoff`, s.cleared ? formatDuration(s.payoffMonth) : `Over ${formatDuration(s.payoffMonth)}`);
      setCell(`${id}.months`, String(s.payoffMonth));
      setCell(`${id}.paid`, formatCurrency(s.totalPaid));
      setCell(`${id}.interest`, formatCurrency(s.totalInterest));
      for (const d of DEBTS) setCell(`${id}.clear.${d}`, s.clearedAt[d] === null ? 'Not in 60 years' : `Month ${s.clearedAt[d]}`);
      fillExcerpt(id);
    }
  }

  let lastSnaps: readonly StrategySnapshot[] = [];
  let lastBeat: StoryBeat | null = null;
  let timelineKey = '';
  let tableKey = '';

  function updateTables(force = false, snaps: readonly StrategySnapshot[] = lastSnaps): void {
    if (!how.open || snaps.length === 0) return;
    fillPlanTable();
    const key = `${statementMonth(state.months)}|${planTableKey}`;
    if (!force && key === tableKey) return;
    tableKey = key;
    for (const s of snaps) {
      setCell(`${s.id}.owed`, s.paidOff ? 'Debt-free' : formatCurrency(s.owed));
      setCell(`${s.id}.sofar`, formatCurrency(s.interestCharged));
      setCell(`${s.id}.count`, `${s.clearedCount} of 3`);
    }
    setText($('how-age'), yearMonthLabel(statementMonth(state.months)).toLowerCase());
  }

  /* ---------------- per-frame update ---------------- */

  function update(snaps: readonly StrategySnapshot[]): void {
    lastSnaps = snaps;

    // Story beat handling (captions + live announcements).
    let beat: StoryBeat | null = null;
    if (state.mode === 'story') beat = storyBeat(state.storyTime, state.inputs, state.reducedMotion);
    if (beat !== lastBeat) {
      lastBeat = beat;
      if (beat !== null) {
        const cap = storyCaption(state.storyTime, state.inputs, state.reducedMotion);
        setCaption(cap);
        if (state.playing) announce([cap.primary, cap.secondary].filter(Boolean).join(' '));
      }
    }
    if (beat === null) {
      setCaption(state.exploreHint ? { beat: 'handoff', primary: 'Explore your own debts' } : null);
    } else if (beat === 'push') {
      // the "Interest so far: snowball $3,311, avalanche $2,937" line follows the clock, in place
      setText(layers[activeLayer].querySelector<HTMLElement>('.cap-2')!, interestLiveLine(state.inputs, state.months));
    }

    for (const s of snaps) updateLabel(s);

    // Timeline + readouts (on the statement month, so the clock turns over as each month's interest is charged).
    const months = statementMonth(state.months);
    const tKey = `${months}|${timeline.max}`;
    if (tKey !== timelineKey) {
      timelineKey = tKey;
      if (document.activeElement !== timeline || String(months) !== timeline.value) timeline.value = String(months);
      const span = Math.max(1, store.horizon());
      timeline.style.setProperty('--frac', String(months / span));
      timeline.setAttribute('aria-valuetext', yearMonthLabel(months));
      setText(ageReadout, yearMonthLabel(months));
      setText(yearReadout, yearMonthLabel(months));
    }

    updateTables(false, snaps);
  }

  function place(): void {
    placeLabels();
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
    const s = state.speed;
    setText(speedReadout, `${speedText(s)}×`);
    speedSlider.setAttribute('aria-valuetext', `${speedText(s)} times speed`);
    // leave the thumb where the hand put it unless the speed came from elsewhere
    if (Math.abs(sliderToSpeed(Number(speedSlider.value)) - s) > 0.051) speedSlider.value = String(speedToSlider(s));
    speedSlider.style.setProperty('--frac', String(Number(speedSlider.value) / 1000));
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

  function syncBudgetNote(): void {
    const note = budgetNote(state.inputs);
    setText(budgetNoteEl, note);
    budgetNoteEl.hidden = note === '';
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
  speedSlider.addEventListener('input', () => {
    actions.setSpeed(sliderToSpeed(Number(speedSlider.value)));
    speedSlider.style.setProperty('--frac', String(Number(speedSlider.value) / 1000));
  });
  reduceBox.addEventListener('change', () => actions.setReducedMotion(reduceBox.checked));

  timeline.addEventListener('input', () => actions.scrubTo(Number(timeline.value)));
  timeline.addEventListener('keydown', (e) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      actions.scrubTo(Math.round(state.months) + (e.key === 'PageUp' ? 12 : -12));
      timeline.value = String(Math.round(state.months));
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
    const f = btn.closest<HTMLElement>('.field')!.dataset.field as SnowField;
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
    for (const id of STRATEGIES) {
      labelKey[id] = '';
      tagKey[id] = '';
    }
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
        syncBudgetNote();
        writeBallTags();
        buildScale();
        applyInsets();
        resetKeys();
        refreshSummary();
        updateTables(true);
        announce(`Updated. ${resultsSentence(state.inputs)}`, INPUT_ANNOUNCE_MS);
        break;
      case 'play':
        syncPlay();
        announce(state.mode === 'story' ? 'Story playing.' : 'Playing.');
        break;
      case 'pause':
        syncPlay();
        refreshSummary();
        announce(`Paused. ${yearMonthLabel(statementMonth(state.months))}.`);
        break;
      case 'play-end':
        syncPlay();
        refreshSummary();
        announce(`Reached the end. ${yearMonthLabel(statementMonth(state.months))}.`);
        break;
      case 'speed':
        syncSpeed();
        break;
      case 'scrub':
        syncPlay();
        window.clearTimeout(summaryTimer);
        scheduleSummary(SCRUB_ANNOUNCE_MS);
        announce(scrubSentence(state.inputs, state.months), SCRUB_ANNOUNCE_MS);
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
        announce('Explore your own debts. Controls are ready.');
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
    measureAll();
    invalidate();
  });

  // Initial paint of static state.
  syncDrafts();
  syncErrors();
  syncSpeed();
  syncPlay();
  syncBudgetNote();
  writeBallTags();
  applyReduced();
  buildScale();
  refreshSummary();
  syncDockHeight();

  return {
    update,
    place,
    invalidate,
    announce: (t) => announce(t),
    setStageSize(w, h) {
      stageW = w;
      stageH = h;
      applyInsets();
      invalidate();
    },
  };
}
