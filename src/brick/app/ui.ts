/**
 * DOM layer. The static markup lives in brick-by-brick.html; this module wires it to the store, updates it only when
 * displayed values change, and owns the single polite live region.
 */
import {
  LOANS,
  formatCents,
  formatCurrency,
  formatDuration,
  loanSchedule,
  loanTitle,
  statementMonth,
  yearMonthLabel,
  yearlyBalances,
} from '../engine';
import type { BrickField, LoanId, LoanSnapshot } from '../engine';
import { FIELDS, SPEED_MAX, SPEED_MIN, type Reason, type Store } from './store';
import { NOTE_KINDS, noteFor, noteKindAt } from './notes';
import type { Note, NoteKind } from './notes';
import {
  crossoverText,
  diffText,
  formulaText,
  interestText,
  owedText,
  resultsSentence,
  sceneSummary,
  scrubSentence,
  termsLine,
  timelineTicks,
} from './text';

const COMMIT_DEBOUNCE_MS = 250;
const SCRUB_ANNOUNCE_MS = 600;
const INPUT_ANNOUNCE_MS = 700;
const HIGHLIGHT_MS = 1500;
/** The widest a house label may be, and the least. */
const PLATE_MAX_W = 260;
const PLATE_MIN_W = 128;
/** Room kept under the labels, CSS px. */
const BOTTOM_PAD = 12;

export interface Point {
  x: number;
  y: number;
}

export interface UIHooks {
  /** Top centre of a house's label, in the bottom band under its plot. */
  labelAnchor(id: LoanId): Point;
  setInsets(insets: { top: number; bottom: number; side: number }): void;
}

export interface UI {
  /** Called every frame; touches the DOM only where displayed values changed. */
  update(snaps: readonly LoanSnapshot[]): void;
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

/** 'a.years' → 'a-years' (element ids) */
const fieldId = (f: BrickField): string => f.replace('.', '-');

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
  const overlay = $('overlay');

  interface PlateEls {
    root: HTMLElement;
    name: HTMLElement;
    terms: HTMLElement;
    owed: HTMLElement;
    interest: HTMLElement;
    w: number;
    h: number;
  }
  const plates = {} as Record<LoanId, PlateEls>;
  for (const id of LOANS) {
    const root = $(`plate-${id}`);
    const q = (c: string) => root.querySelector<HTMLElement>(c)!;
    plates[id] = { root, name: q('.plate-name'), terms: q('.plate-terms'), owed: q('.plate-owed'), interest: q('.plate-interest'), w: 0, h: 0 };
  }
  const ghostPlate = $('plate-ghost');
  const diffEl = $('diff');
  const diffLabel = $('diff-label');
  const diffValue = $('diff-value');
  const diffSub = $('diff-sub');
  let diffW = 0;
  let diffH = 0;

  const fieldEls = {} as Record<BrickField, { input: HTMLInputElement; error: HTMLElement }>;
  for (const f of FIELDS) fieldEls[f] = { input: $<HTMLInputElement>(`f-${fieldId(f)}`), error: $(`err-${fieldId(f)}`) };

  let stageW = 0;
  const narrow = () => stageW < 700;

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

  /* ---------------- stable insets for the scene ---------------- */

  const ghostCap = $('cap-ghost');
  let lastInsets = { top: -1, bottom: -1, side: -1 };

  /** Wide screens reserve the side panel's width whether it is open or not, so toggling it only slides the scene. */
  /** (read from the stylesheet once per size, never per frame) */
  let panelW = -1;
  function sideReserve(): number {
    if (stageW < 900) return 0;
    if (panelW < 0) panelW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w')) || 0;
    return panelW;
  }

  /** Tallest note this scenario can produce, at the current width (measured in a hidden twin). */
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

  /** The bottom band holds the house labels (their tallest form, measured in the ghost), and on phones the
   *  difference under them. */
  function bottomBand(): number {
    let h = ghostPlate.offsetHeight + BOTTOM_PAD;
    if (narrow()) h += Math.max(diffH, 48) + 6;
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

  /* ---------------- house labels and the difference ---------------- */

  const plateKey: Record<LoanId, string> = { a: '', b: '' };
  let diffKey = '';
  let diffWasHidden = true;

  function measureAll(): void {
    for (const id of LOANS) {
      plates[id].w = plates[id].root.offsetWidth;
      plates[id].h = plates[id].root.offsetHeight;
    }
    diffW = diffEl.hidden ? 0 : diffEl.offsetWidth;
    diffH = diffEl.hidden ? 0 : diffEl.offsetHeight;
  }

  function updatePlate(snap: LoanSnapshot): void {
    const P = plates[snap.id];
    const name = loanTitle(snap.id, state.inputs);
    const terms = termsLine(snap.id, state.inputs);
    const owed = owedText(snap);
    const interest = interestText(snap);
    const key = `${name}|${terms}|${owed}|${interest}`;
    if (key === plateKey[snap.id]) return;
    plateKey[snap.id] = key;
    setText(P.name, name);
    setText(P.terms, terms);
    setText(P.owed, owed);
    setText(P.interest, interest);
    P.root.classList.toggle('paid', snap.paidOff);
    // (its new size is measured by the resize observer, not here: reading it now would force a layout every month)
  }

  function updateDiff(): void {
    const d = diffText(state.inputs, state.months);
    const key = d.show ? `${d.label}|${d.value}|${d.sub}|${d.final}` : '';
    if (key === diffKey) return;
    diffKey = key;
    diffEl.hidden = !d.show;
    if (d.show) {
      setText(diffLabel, d.label);
      setText(diffValue, d.value);
      setText(diffSub, d.sub);
      diffEl.classList.toggle('final', d.final);
    }
    // (shown or hidden changes its size: measured once then, never per month)
    if (diffEl.hidden !== diffWasHidden) {
      diffWasHidden = diffEl.hidden;
      diffW = diffEl.hidden ? 0 : diffEl.offsetWidth;
      diffH = diffEl.hidden ? 0 : diffEl.offsetHeight;
    }
  }

  const lastTransform: Record<string, string> = {};
  let lastPlateW = -1;

  /** Sit a box with its top-centre at (cx, top), clamped inside the range. */
  function put(el: HTMLElement, key: string, cx: number, top: number, w: number, range: { lo: number; hi: number }): void {
    const x = Math.max(range.lo, Math.min(range.hi - w, cx - w / 2));
    const tf = `translate(${Math.round(x)}px, ${Math.round(top)}px)`;
    if (tf !== lastTransform[key]) {
      lastTransform[key] = tf;
      el.style.transform = tf;
    }
  }

  function placeLabels(): void {
    const range = labelRange();
    const a = hooks.labelAnchor('a');
    const b = hooks.labelAnchor('b');
    const gap = Math.abs(b.x - a.x);
    // The labels never touch each other or the difference: on wide screens the difference sits between them, so they
    // may be no wider than what is left of the gap; on phones it sits under them, and they share the width.
    const between = narrow() ? 12 : Math.max(diffW, 150) + 28;
    const room = Math.min(gap - between, (range.hi - range.lo) / 2 - 6);
    const plateW = Math.round(Math.max(PLATE_MIN_W, Math.min(PLATE_MAX_W, room)));
    if (plateW !== lastPlateW) {
      lastPlateW = plateW;
      overlay.style.setProperty('--plate-w', `${plateW}px`);
      measureAll();
    }
    put(plates.a.root, 'a', a.x, a.y, plates.a.w, range);
    put(plates.b.root, 'b', b.x, b.y, plates.b.w, range);
    if (!diffEl.hidden) {
      const mid = (a.x + b.x) / 2;
      const top = narrow() ? Math.max(plates.a.h, plates.b.h) + Math.max(a.y, b.y) + 6 : Math.min(a.y, b.y) + 4;
      put(diffEl, 'diff', mid, top, diffW, range);
    }
  }

  function invalidate(): void {
    for (const k of Object.keys(lastTransform)) delete lastTransform[k];
    lastPlateW = -1;
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
      invalidate();
    });
  };
  new ResizeObserver(repass).observe(dock);
  const labelObs = new ResizeObserver(repass);
  for (const id of LOANS) labelObs.observe(plates[id].root);
  labelObs.observe(diffEl);
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
  const yearlyBody = $('yearly').querySelector('tbody')!;

  let loanTableKey = '';
  function fillLoanTables(): void {
    const { a, b } = state.inputs.loans;
    const key = `${state.inputs.amount}|${a.years}|${a.apr}|${b.years}|${b.apr}`;
    if (key === loanTableKey) return;
    loanTableKey = key;
    for (const id of LOANS) {
      const s = loanSchedule(state.inputs, id);
      const title = loanTitle(id, state.inputs);
      for (const n of ['name', 'name2', 'name3']) setCell(`${id}.${n}`, title);
      setCell(`${id}.formula`, formulaText(id, state.inputs));
      setCell(`${id}.payment`, formatCents(s.payment));
      setCell(`${id}.months`, `${s.months} (${formatDuration(s.months)})`);
      setCell(`${id}.paid`, formatCurrency(s.totalPaid));
      setCell(`${id}.interest`, formatCurrency(s.totalInterest));
      setCell(`${id}.cross`, crossoverText(id, state.inputs));
      setCell(`${id}.half`, `Month ${s.halfOwnedMonth}`);
    }
    yearlyBody.textContent = '';
    const frag = document.createDocumentFragment();
    for (const row of yearlyBalances(state.inputs)) {
      const tr = document.createElement('tr');
      tr.dataset.year = String(row.year);
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = String(row.year);
      tr.appendChild(th);
      for (const v of [row.a, row.b]) {
        const td = document.createElement('td');
        td.textContent = v <= 0 ? 'Paid off' : formatCurrency(v);
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    yearlyBody.appendChild(frag);
    nowYear = -1;
  }

  let lastSnaps: readonly LoanSnapshot[] = [];
  let lastNote: NoteKind | null = null;
  let labelsKey = '';
  let labelsInputs: unknown = null;
  let liveNote = false;
  let timelineKey = '';
  let tableKey = '';
  let nowYear = -1;

  function updateTables(force = false, snaps: readonly LoanSnapshot[] = lastSnaps): void {
    if (!how.open || snaps.length === 0) return;
    fillLoanTables();
    const month = statementMonth(state.months);
    const key = `${month}|${loanTableKey}`;
    if (!force && key === tableKey) return;
    tableKey = key;
    for (const s of snaps) {
      setCell(`${s.id}.owed`, s.paidOff ? 'Paid off' : formatCurrency(s.owed));
      setCell(`${s.id}.sofar`, formatCurrency(s.interestCharged));
      setCell(`${s.id}.monthInterest`, s.paidOff ? '$0' : formatCurrency(s.interest));
      setCell(`${s.id}.monthPrincipal`, s.paidOff ? '$0' : formatCurrency(s.principal));
    }
    setText($('how-age'), yearMonthLabel(month).toLowerCase());
    // the row of the year on the clock is marked in the yearly table
    const year = Math.floor(month / 12);
    if (year !== nowYear) {
      yearlyBody.querySelector('tr.now')?.classList.remove('now');
      yearlyBody.querySelector(`tr[data-year="${year}"]`)?.classList.add('now');
      nowYear = year;
    }
  }

  /* ---------------- per-frame update ---------------- */

  function update(snaps: readonly LoanSnapshot[]): void {
    lastSnaps = snaps;

    // The milestone note for the month on the clock (announced as it changes while playing; a drag announces the
    // moment it lands on instead).
    const kind = noteKindAt(state.months, state.inputs);
    if (kind !== lastNote) {
      lastNote = kind;
      const note = noteFor(kind, state.inputs, state.months);
      liveNote = !!note.live;
      setCaption(note);
      if (state.playing) announce([note.primary, note.secondary].filter(Boolean).join(' '));
    } else if (liveNote) {
      // the live line (interest so far, still owed) follows the clock, in place
      setText(layers[activeLayer].querySelector<HTMLElement>('.cap-2')!, noteFor(kind, state.inputs, state.months).secondary ?? '');
    }

    // the labels' numbers change only when the statement month turns over (or the inputs change)
    const lk = `${statementMonth(state.months)}|${snaps.map((sn) => (sn.paidOff ? 1 : 0)).join('')}`;
    if (lk !== labelsKey || state.inputs !== labelsInputs) {
      labelsKey = lk;
      labelsInputs = state.inputs;
      for (const s of snaps) updatePlate(s);
      updateDiff();
    }

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
    const f = btn.closest<HTMLElement>('.field')!.dataset.field as BrickField;
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
    diffKey = '';
    for (const id of LOANS) plateKey[id] = '';
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
      panelW = -1;
      applyInsets();
      invalidate();
    },
  };
}
