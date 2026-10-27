/**
 * DOM layer. The static markup lives in nip-it-in-the-bud.html; this module wires it to the store,
 * updates it only when displayed values change, and owns the single polite live region.
 */
import {
  PLANS,
  formatCents,
  formatCurrency,
  formatDuration,
  planName,
  planSchedule,
  planShortName,
  statementMonth,
  yearMonthLabel,
} from '../engine';
import type { PlanId, PlanSnapshot, VineField } from '../engine';
import { FIELDS } from './store';
import { SPEED_MAX, SPEED_MIN, type Reason, type Store } from './store';
import { NOTE_KINDS, minimumLiveLine, noteFor, noteKindAt } from './notes';
import type { Note, NoteKind } from './notes';
import { fixedNote, interestText, owedText, resultsSentence, sceneSummary, scrubSentence, timelineTicks } from './text';

const COMMIT_DEBOUNCE_MS = 250;
const SCRUB_ANNOUNCE_MS = 600;
const INPUT_ANNOUNCE_MS = 700;
const HIGHLIGHT_MS = 1500;
/** Room under the garden, CSS px (phones keep the year readout clear of the lawn). */
const BOTTOM_BAND_WIDE = 10;
const BOTTOM_BAND_NARROW = 40;
/** The widest a cottage label may be, and the least. */
const LABEL_MAX_W = 300;
const LABEL_MIN_W = 118;

export interface Point {
  x: number;
  y: number;
}

export interface UIHooks {
  /** Just above a cottage's roof ridge, camera applied. */
  labelAnchor(id: PlanId): Point;
  /** Just above a cottage's clippings pile, camera applied. */
  pileAnchor(id: PlanId): Point;
  setInsets(insets: { top: number; bottom: number; side: number }): void;
}

export interface UI {
  /** Called every frame; touches the DOM only where displayed values changed. */
  update(snaps: readonly PlanSnapshot[]): void;
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

/**
 * Identity emblems (never colour alone): a vine leaf for the minimum plan, a pair of secateurs for the fixed one.
 */
export function emblemSVG(id: PlanId): string {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  let body: string;
  if (id === 'minimum') {
    const leaf = 'M4.5 19.5C4.5 11 9 5 19.5 4.5 19.5 14 14 19.5 7 19.5z';
    body = `<path class="tint" d="${leaf}"/><path ${s} d="${leaf}M4.5 19.5 14 10"/>`;
  } else {
    body =
      `<circle class="tint" cx="7.8" cy="17.4" r="3.1"/><circle class="tint" cx="16.2" cy="17.4" r="3.1"/>` +
      `<path ${s} d="M8.2 3.4 14.6 13.6M15.8 3.4 9.4 13.6"/><circle ${s} cx="7.8" cy="17.4" r="3.1"/><circle ${s} cx="16.2" cy="17.4" r="3.1"/>`;
  }
  return `<svg class="em em-${id}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

function hydrateEmblems(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-emblem]').forEach((el) => {
    el.innerHTML = emblemSVG(el.dataset.emblem as PlanId);
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

  interface PlanLabelEls {
    root: HTMLElement;
    name: HTMLElement;
    owed: HTMLElement;
    w: number;
    h: number;
  }
  interface PileTagEls {
    root: HTMLElement;
    amount: HTMLElement;
    w: number;
    h: number;
  }
  const labels = {} as Record<PlanId, PlanLabelEls>;
  const tags = {} as Record<PlanId, PileTagEls>;
  for (const id of PLANS) {
    const root = $(`lab-${id}`);
    labels[id] = { root, name: root.querySelector<HTMLElement>('.pl-name')!, owed: root.querySelector<HTMLElement>('.pl-owed')!, w: 0, h: 0 };
    const tag = $(`tag-${id}`);
    tags[id] = { root: tag, amount: tag.querySelector<HTMLElement>('.pt-amount')!, w: 0, h: 0 };
  }

  const fieldEls = {} as Record<VineField, { input: HTMLInputElement; error: HTMLElement }>;
  for (const f of FIELDS) fieldEls[f] = { input: $<HTMLInputElement>(`f-${f}`), error: $(`err-${f}`) };
  const fixedNoteEl = $('note-fixedPayment');

  let stageW = 0;

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
    for (const kind of NOTE_KINDS) {
      const c = noteFor(kind, state.inputs);
      setText(ghostCap.querySelector<HTMLElement>('.cap-1')!, c.primary);
      setText(ghostCap.querySelector<HTMLElement>('.cap-2')!, c.secondary ?? '');
      tallest = Math.max(tallest, ghostCap.offsetHeight);
    }
    return tallest;
  }

  function applyInsets(): void {
    if (!stageW) return;
    const capTop = parseFloat(getComputedStyle($('caption')).getPropertyValue('--cap-top-closed')) || $('caption').offsetTop;
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

  /* ---------------- cottage labels and pile tags ---------------- */

  const labelKey: Record<PlanId, string> = { minimum: '', fixed: '' };
  const tagKey: Record<PlanId, string> = { minimum: '', fixed: '' };

  function measureAll(): void {
    for (const id of PLANS) {
      labels[id].w = labels[id].root.offsetWidth;
      labels[id].h = labels[id].root.offsetHeight;
      tags[id].w = tags[id].root.offsetWidth;
      tags[id].h = tags[id].root.offsetHeight;
    }
  }

  function updateLabel(snap: PlanSnapshot): void {
    const L = labels[snap.id];
    const name = planName(snap.id, state.inputs);
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
  }

  const lastTransform: Record<string, string> = {};
  let lastMaxW = -1;

  /** Sit a box so its bottom-centre is at the anchor, clamped inside the stage. */
  function put(el: HTMLElement, key: string, a: Point, w: number, h: number, range: { lo: number; hi: number }): void {
    const x = Math.max(range.lo, Math.min(range.hi - w, a.x - w / 2));
    const tf = `translate(${Math.round(x)}px, ${Math.round(a.y - h)}px)`;
    if (tf !== lastTransform[key]) {
      lastTransform[key] = tf;
      el.style.transform = tf;
    }
  }

  function placeLabels(): void {
    const range = labelRange();
    const a = { minimum: hooks.labelAnchor('minimum'), fixed: hooks.labelAnchor('fixed') };
    // The two labels must never touch: they may be no wider than the space between the two ridges, nor than half
    // the stage (on a phone both are pushed in from the edges, toward each other).
    const room = Math.min(Math.abs(a.fixed.x - a.minimum.x), (range.hi - range.lo) / 2) - 14;
    const maxW = Math.round(Math.max(LABEL_MIN_W, Math.min(LABEL_MAX_W, room)));
    if (maxW !== lastMaxW) {
      lastMaxW = maxW;
      overlay.style.setProperty('--label-max', `${maxW}px`);
      measureAll();
    }
    for (const id of PLANS) {
      // (the interest line sits inside the label, under what is owed, so it moves with it)
      put(labels[id].root, `l${id}`, a[id], labels[id].w, labels[id].h, range);
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
  for (const id of PLANS) {
    labelObs.observe(labels[id].root);
    labelObs.observe(tags[id].root);
  }
  how.addEventListener('toggle', () => {
    syncDockHeight();
    if (how.open) updateTables(true);
  });

  /* ---------------- captions ---------------- */

  const layers = Array.from(document.querySelectorAll<HTMLElement>('#caption .cap[data-layer]'));
  let activeLayer = 0;
  let captionKey = '';
  function setCaption(c: Note | null): void {
    // a live secondary line is rewritten in place, so it is not part of the identity of the caption
    const key = c ? `${c.kind}|${c.primary}|${c.live ? '' : (c.secondary ?? '')}` : '';
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

  function fillExcerpt(id: PlanId): void {
    const table = $(`excerpt-${id}`);
    const body = table.querySelector('tbody')!;
    const rows = planSchedule(state.inputs, id).rows;
    const picks = rows.length <= 4 ? rows : [rows[0], rows[1], rows[2], rows[rows.length - 1]];
    body.textContent = '';
    for (const r of picks) {
      const tr = document.createElement('tr');
      const head = document.createElement('th');
      head.scope = 'row';
      head.textContent = String(r.month);
      tr.appendChild(head);
      for (const v of [r.interest, r.payment, r.balance]) {
        const td = document.createElement('td');
        td.textContent = formatCents(v);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    setText(table.querySelector<HTMLElement>('.excerpt-cap')!, id === 'minimum' ? 'Minimum payments' : planName('fixed', state.inputs));
  }

  let planTableKey = '';
  function fillPlanTable(): void {
    const key = `${state.inputs.balance}|${state.inputs.apr}|${state.inputs.fixedPayment}|${state.inputs.minPercent}|${state.inputs.minFloor}`;
    if (key === planTableKey) return;
    planTableKey = key;
    for (const id of PLANS) {
      const s = planSchedule(state.inputs, id);
      setCell(`${id}.payoff`, s.cleared ? formatDuration(s.payoffMonth) : `Over ${formatDuration(s.payoffMonth)}`);
      setCell(`${id}.months`, String(s.payoffMonth));
      setCell(`${id}.paid`, formatCurrency(s.totalPaid));
      setCell(`${id}.interest`, formatCurrency(s.totalInterest));
      fillExcerpt(id);
    }
    document.querySelectorAll<HTMLElement>('#compare-plan .th-name, #compare-now .th-name').forEach((el, i) => {
      setText(el, planShortName(PLANS[i % 2], state.inputs));
    });
  }

  let lastSnaps: readonly PlanSnapshot[] = [];
  let lastNote: NoteKind | null = null;
  let timelineKey = '';
  let tableKey = '';

  function updateTables(force = false, snaps: readonly PlanSnapshot[] = lastSnaps): void {
    if (!how.open || snaps.length === 0) return;
    fillPlanTable();
    const key = `${statementMonth(state.months)}|${planTableKey}`;
    if (!force && key === tableKey) return;
    tableKey = key;
    for (const s of snaps) {
      setCell(`${s.id}.owed`, s.paidOff ? 'Paid off' : formatCurrency(s.owed));
      setCell(`${s.id}.sofar`, formatCurrency(s.interestCharged));
      setCell(`${s.id}.pay`, s.paidOff ? '$0' : formatCurrency(s.payment));
    }
    setText($('how-age'), yearMonthLabel(statementMonth(state.months)).toLowerCase());
  }

  /* ---------------- per-frame update ---------------- */

  function update(snaps: readonly PlanSnapshot[]): void {
    lastSnaps = snaps;

    // The milestone note for the moment on the clock (announced as it changes while playing; a drag announces the
    // moment it lands on instead).
    const kind = noteKindAt(state.months, state.inputs);
    if (kind !== lastNote) {
      lastNote = kind;
      const note = noteFor(kind, state.inputs, state.months);
      setCaption(note);
      if (state.playing) announce([note.primary, note.secondary].filter(Boolean).join(' '));
    }
    if (kind === 'minimum') {
      // the "Year 12: $1,176 still owed" line follows the clock, in place
      setText(layers[activeLayer].querySelector<HTMLElement>('.cap-2')!, minimumLiveLine(state.inputs, state.months));
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

  function syncFixedNote(): void {
    const note = fixedNote(state.inputs);
    setText(fixedNoteEl, note);
    fixedNoteEl.hidden = note === '';
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
    const f = btn.closest<HTMLElement>('.field')!.dataset.field as VineField;
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
    lastNote = null;
    for (const id of PLANS) {
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
        syncFixedNote();
        buildScale();
        applyInsets();
        resetKeys();
        refreshSummary();
        updateTables(true);
        announce(`Updated. ${resultsSentence(state.inputs)}`, INPUT_ANNOUNCE_MS);
        break;
      case 'play':
        syncPlay();
        announce('Playing.');
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
    applyInsets();
    measureAll();
    invalidate();
  });

  // Initial paint of static state.
  syncDrafts();
  syncErrors();
  syncSpeed();
  syncPlay();
  syncFixedNote();
  applyReduced();
  buildScale();
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
      applyInsets();
      invalidate();
    },
  };
}
