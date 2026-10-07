/**
 * DOM layer. The static markup lives in index.html; this module wires it to the store,
 * updates it only when displayed values change, and owns the single polite live region.
 */
import { formatCurrency } from '../engine';
import type { InputField, TreeId } from '../engine';
import { WORLD } from '../scene/types';
import type { Reason, Speed, Store } from './store';
import { captionForBeat, storyBeat, storyCaption } from './story';
import type { StoryBeat, StoryCaption } from './story';
import { ageShort, ageSpoken, contributionCount, exactPair, gapOf, sceneSummary } from './text';
import type { TreePair } from './text';

const FIELDS: InputField[] = ['startAgeA', 'startAgeB', 'endAge', 'monthlyContribution', 'annualReturn'];
const COMMIT_DEBOUNCE_MS = 250;
const SCRUB_ANNOUNCE_MS = 600;
const INPUT_ANNOUNCE_MS = 700;
const HIGHLIGHT_MS = 1500;

export interface Point {
  x: number;
  y: number;
}

export interface UIHooks {
  /** Screen-space base points of both trees, from scene.anchorsFor(id, 0).base. */
  getBases(): Record<TreeId, Point>;
  /** Reserve stable bands at the top (header + caption) and bottom (plates + difference). Optional until the scene supports it. */
  setInsets?(insets: { top: number; bottom: number }): void;
}

export interface UI {
  /** Called every frame; touches the DOM only where displayed values changed. */
  update(pair: TreePair): void;
  /** Reposition overlay labels (after resize or layout changes). */
  layout(): void;
  /** Stage size in CSS px (for overlay placement). */
  setStageSize(w: number, h: number): void;
  announce(text: string): void;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

/** Identity markers: A = filled circle, B = open diamond. The letter sits inside the shape. */
export function markerSVG(id: TreeId): string {
  const shape =
    id === 'A'
      ? '<circle cx="12" cy="12" r="11" fill="currentColor"/>'
      : '<path d="M12 1.1 22.9 12 12 22.9 1.1 12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>';
  const fill = id === 'A' ? 'var(--paper)' : 'currentColor';
  return `<svg class="mk mk-${id.toLowerCase()}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shape}<text x="12" y="16.6" text-anchor="middle" font-size="13.5" style="fill:${fill}">${id}</text></svg>`;
}

function hydrateMarks(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-mark]').forEach((el) => {
    el.innerHTML = markerSVG(el.dataset.mark as TreeId);
    el.style.display = 'inline-flex';
  });
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function createUI(store: Store, hooks: UIHooks): UI {
  const { state, actions } = store;
  hydrateMarks(document);

  const stage = $('stage');
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
  const scaleEl = $('scale');
  const ticksEl = $('scale-ticks');
  const markersEl = $('scale-markers');
  const reduceBox = $<HTMLInputElement>('reduce-motion');
  const speedInputs = Array.from(document.querySelectorAll<HTMLInputElement>('#speeds input'));
  const diffEl = $('diff');
  const diffValue = $('diff-value');

  const plates = {
    A: {
      root: $('plate-A'),
      name: $('plate-A').querySelector<HTMLElement>('.plate-name')!,
      balance: $('plate-A').querySelector<HTMLElement>('.plate-balance')!,
      split: $('plate-A').querySelector<HTMLElement>('.plate-split')!,
      splitA: $('plate-A').querySelector<HTMLElement>('.ps-a')!,
      splitDot: $('plate-A').querySelector<HTMLElement>('.ps-dot')!,
      splitB: $('plate-A').querySelector<HTMLElement>('.ps-b')!,
      seed: $('seed-A'),
    },
    B: {
      root: $('plate-B'),
      name: $('plate-B').querySelector<HTMLElement>('.plate-name')!,
      balance: $('plate-B').querySelector<HTMLElement>('.plate-balance')!,
      split: $('plate-B').querySelector<HTMLElement>('.plate-split')!,
      splitA: $('plate-B').querySelector<HTMLElement>('.ps-a')!,
      splitDot: $('plate-B').querySelector<HTMLElement>('.ps-dot')!,
      splitB: $('plate-B').querySelector<HTMLElement>('.ps-b')!,
      seed: $('seed-B'),
    },
  };

  const fieldEls = {} as Record<InputField, { input: HTMLInputElement; error: HTMLElement }>;
  for (const f of FIELDS) fieldEls[f] = { input: $<HTMLInputElement>(`f-${f}`), error: $(`err-${f}`) };

  let stageW = 0;
  let stageH = 0;

  /* ---------------- live region ---------------- */

  let sayTimer = 0;
  let lastSaid = '';
  /** Single polite live region. The latest message replaces any pending one. */
  function announce(text: string, delay = 0): void {
    window.clearTimeout(sayTimer);
    const fire = () => {
      announcer.textContent = text === lastSaid ? text + ' ' : text;
      lastSaid = announcer.textContent;
    };
    if (delay > 0) sayTimer = window.setTimeout(fire, delay);
    else fire();
  }

  /* ---------------- summary + canvas label (discrete changes only) ---------------- */

  let summaryTimer = 0;
  function refreshSummary(): void {
    const text = sceneSummary(state.scenario, state.ageMonths);
    canvas.setAttribute('aria-label', text);
    setText(summaryEl, text);
  }
  function scheduleSummary(delay: number): void {
    window.clearTimeout(summaryTimer);
    summaryTimer = window.setTimeout(refreshSummary, delay);
  }

  /* ---------------- timeline scale bar ---------------- */

  function buildScale(): void {
    const sc = state.scenario;
    const startA = sc.inputs.startAgeA;
    const startB = sc.inputs.startAgeB;
    const lo = sc.timelineStartMonths;
    const hi = sc.timelineEndMonths;
    timeline.min = String(lo);
    timeline.max = String(hi);
    const span = Math.max(1, hi - lo);
    const frac = (months: number) => (hi === lo ? 0 : (months - lo) / span);

    const loAge = lo / 12;
    const hiAge = hi / 12;
    const labels: Array<{ age: number; end: boolean }> = [{ age: loAge, end: true }];
    for (let a = Math.ceil(loAge / 5) * 5; a <= hiAge; a += 5) {
      if (a !== loAge && a !== hiAge) labels.push({ age: a, end: false });
    }
    if (hiAge !== loAge) labels.push({ age: hiAge, end: true });
    const kept = labels.filter((l, i) => {
      if (l.end) return true;
      return !labels.some((o, j) => j !== i && o.end && Math.abs(frac(o.age * 12) - frac(l.age * 12)) < 0.05);
    });

    ticksEl.textContent = '';
    const frag = document.createDocumentFragment();
    if (hiAge - loAge <= 80) {
      for (let a = Math.ceil(loAge); a <= hiAge; a++) {
        if (a % 5 === 0 || a === loAge || a === hiAge) continue;
        const t = document.createElement('span');
        t.className = 'tick';
        t.style.left = `${frac(a * 12) * 100}%`;
        frag.appendChild(t);
      }
    }
    for (const l of kept) {
      const t = document.createElement('span');
      t.className = 'tick major';
      t.style.left = `${frac(l.age * 12) * 100}%`;
      frag.appendChild(t);
      const lab = document.createElement('span');
      lab.className = 'tick-label';
      lab.style.left = `${frac(l.age * 12) * 100}%`;
      lab.textContent = String(l.age);
      frag.appendChild(lab);
    }
    ticksEl.appendChild(frag);

    markersEl.textContent = '';
    const mk = (id: TreeId, age: number): HTMLElement => {
      const m = document.createElement('span');
      m.className = 'scale-marker';
      m.dataset.tree = id;
      m.dataset.f = String(frac(age * 12));
      m.innerHTML = markerSVG(id);
      markersEl.appendChild(m);
      return m;
    };
    mk('A', startA);
    mk('B', startB);
    placeMarkers();
  }

  /** Spread the A and B markers apart when their starts are close, so both stay visible. */
  function placeMarkers(): void {
    const width = markersEl.clientWidth || scaleEl.clientWidth;
    const els = Array.from(markersEl.querySelectorAll<HTMLElement>('.scale-marker'));
    if (els.length !== 2) return;
    const px = els.map((e) => Number(e.dataset.f) * width);
    const minGap = 24;
    const gap = Math.abs(px[0] - px[1]);
    const shift = gap < minGap ? (minGap - gap) / 2 : 0;
    const dir = px[0] <= px[1] ? [-1, 1] : [1, -1];
    els.forEach((e, i) => {
      e.style.left = `${px[i] + dir[i] * shift}px`;
    });
  }

  /** Plates centre under their trees; when the trees are too close for that (short, wide stages), they sit either side of the middle. */
  /** Min width the Difference label needs between the plates (worst case: seven digits). */
  const diffWidth = () => Math.max(diffEl.offsetWidth, 112) + 20;
  /** How far (world units) the plates may rise into the lower part of the soil band. */
  const SOIL_OVERLAP = 10;

  function plateGeometry(spacing: number): { plateW: number; outward: boolean; columns: boolean } {
    // Phones: two equal columns across the stage, so plates never fight over the little room between trees.
    if (stageW < 700) return { plateW: Math.floor((stageW - 32) / 2) - 4, outward: false, columns: true };
    // Wider: Difference sits on the same row, centred between the plates.
    const fit = spacing - diffWidth();
    if (fit < 150) return { plateW: 280, outward: true, columns: false };
    return { plateW: Math.min(280, fit), outward: false, columns: false };
  }

  /* ---------------- stable insets for the scene camera ---------------- */

  const ghostCap = $('cap-ghost');
  const ghostPlate = $('plate-ghost');
  const BEATS: StoryBeat[] = ['planting', 'contribute', 'bBegins', 'reinvest', 'difference', 'handoff'];
  let lastInsets = { top: -1, bottom: -1 };

  /** Tallest caption this scenario can produce, at the current width (measured in a hidden twin). */
  function tallestCaption(): number {
    let tallest = 0;
    for (const beat of BEATS) {
      const c = captionForBeat(beat, state.scenario);
      setText(ghostCap.querySelector<HTMLElement>('.cap-1')!, c.primary);
      setText(ghostCap.querySelector<HTMLElement>('.cap-2')!, c.secondary ?? '');
      tallest = Math.max(tallest, ghostCap.offsetHeight);
    }
    return tallest;
  }

  function applyInsets(): void {
    if (!stageW) return;
    const capTop = ($('caption') as HTMLElement).offsetTop;
    const masthead = (document.querySelector('.masthead') as HTMLElement).offsetHeight;
    const top = Math.ceil(Math.max(masthead + 4, capTop + tallestCaption() + 4));
    const band = WORLD.viewTop - WORLD.viewBottom;
    const dh = diffEl.offsetHeight || 44;
    let bottom = 8;
    for (let i = 0; i < 3; i++) {
      const s = Math.min(stageW / WORLD.width, Math.max(1, stageH - top - bottom) / band);
      const spacing = (WORLD.treeX.B - WORLD.treeX.A) * s;
      const { plateW, columns } = plateGeometry(spacing);
      stage.style.setProperty('--plate-w', plateW + 'px');
      for (const el of [ghostPlate, plates.A.root, plates.B.root]) el.toggleAttribute('data-wide', plateW >= 270);
      const ph = ghostPlate.offsetHeight;
      const sameRow = !columns;
      bottom = Math.ceil(Math.max(8, 6 + ph + (sameRow ? 0 : dh + 6) + 8 - (columns ? 0 : SOIL_OVERLAP * s)));
    }
    if (top !== lastInsets.top || bottom !== lastInsets.bottom) {
      lastInsets = { top, bottom };
      hooks.setInsets?.({ top, bottom });
    }
  }

  /* ---------------- overlay layout ---------------- */

  function layout(): void {
    if (!stageW) return;
    const bases = hooks.getBases();
    const spacing = bases.B.x - bases.A.x;
    const { plateW, outward, columns } = plateGeometry(spacing);
    stage.style.setProperty('--plate-w', `${plateW}px`);
    for (const el of [ghostPlate, plates.A.root, plates.B.root]) el.toggleAttribute('data-wide', plateW >= 270);
    // Plates sit below the roots/soil band, in the bottom inset the camera reserved for them.
    const unit = spacing / (WORLD.treeX.B - WORLD.treeX.A);
    const plateTop = bases.A.y + (-WORLD.viewBottom - (columns ? 0 : SOIL_OVERLAP)) * unit + 6;
    let bottom = 0;
    for (const id of ['A', 'B'] as const) {
      const p = plates[id];
      const b = bases[id];
      const h = p.root.offsetHeight;
      const y = Math.min(plateTop, stageH - h - 4);
      const midX = (bases.A.x + bases.B.x) / 2;
      const x = columns
        ? (id === 'A' ? 16 : stageW - 16 - plateW)
        : outward
          ? (id === 'A' ? midX - diffWidth() / 2 - plateW : midX + diffWidth() / 2)
          : id === 'A'
            ? Math.min(b.x - plateW / 2, midX - diffWidth() / 2 - plateW)
            : Math.max(b.x - plateW / 2, midX + diffWidth() / 2);
      p.root.dataset.align = outward && !columns ? (id === 'A' ? 'right' : 'left') : 'center';
      p.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      p.seed.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y + 1)}px)`;
      bottom = Math.max(bottom, y + h);
    }
    const worstH = ghostPlate.offsetHeight;
    const dw = diffEl.offsetWidth;
    const dh = diffEl.offsetHeight;
    const midX = (bases.A.x + bases.B.x) / 2;
    const sameRow = !columns;
    const dy = sameRow
      ? Math.min(plateTop, stageH - dh - 4)
      : Math.min(Math.max(bottom, plateTop + worstH) + 6, stageH - dh - 4);
    diffEl.style.transform = `translate(${Math.round(midX - dw / 2)}px, ${Math.round(dy)}px)`;
    placeMarkers();
  }

  // Every ResizeObserver callback only schedules ONE shared rAF pass (read, then write), so nothing is resized
  // inside observer delivery and no loop can form.
  let passQueued = false;
  let passDock = false;
  const queuePass = (dock = false) => {
    passDock ||= dock;
    if (passQueued) return;
    passQueued = true;
    requestAnimationFrame(() => {
      passQueued = false;
      const doDock = passDock;
      passDock = false;
      if (doDock) syncDockHeight();
      layout();
    });
  };
  const resizeObs = new ResizeObserver(() => queuePass());
  resizeObs.observe(plates.A.root);
  resizeObs.observe(plates.B.root);
  resizeObs.observe(diffEl);
  resizeObs.observe(scaleEl);

  /* ---------------- dock height -> stage height ---------------- */

  let lastDockH = -1;
  function syncDockHeight(): void {
    if (how.open) return; // keep the scene steady while the explanation is open
    const h = dock.offsetHeight;
    if (Math.abs(h - lastDockH) < 0.5) return;
    lastDockH = h;
    document.documentElement.style.setProperty('--dock-h', `${h}px`);
  }
  new ResizeObserver(() => queuePass(true)).observe(dock);
  how.addEventListener('toggle', () => {
    syncDockHeight();
    if (how.open) updateTable(lastPair ?? exactPair(state.scenario, state.ageMonths), true);
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

  let lastPair: TreePair | null = null;
  let lastBeat: StoryBeat | null = null;
  let timelineKey = '';
  let tableKey = '';
  let plateKey = '';
  let lastLayoutKey = '';
  const cells = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-cell]').forEach((c) => cells.set(c.dataset.cell!, c));

  function treeName(id: TreeId, start: number, planted: boolean): string {
    const s = id === 'A' ? state.inputs.startAgeA : state.inputs.startAgeB;
    return planted ? `Tree ${id} · started at ${start}` : `Tree ${id} · starts at ${s}`;
  }

  function updatePlate(id: TreeId, snap: TreePair['a']): void {
    const p = plates[id];
    const start = id === 'A' ? state.inputs.startAgeA : state.inputs.startAgeB;
    const noTime = start >= state.inputs.endAge;
    setText(p.name, treeName(id, start, snap.planted));
    if (snap.planted) {
      p.root.removeAttribute('data-hold');
      setText(p.balance, formatCurrency(snap.balance));
      setText(p.splitA, `${formatCurrency(snap.contributed)} contributed`);
      setText(p.splitDot, ' · ');
      setText(p.splitB, `${formatCurrency(snap.growth)} modeled growth`);
    } else {
      p.root.setAttribute('data-hold', '');
      setText(p.balance, noTime ? `No growing time before ${state.inputs.endAge}` : `Plants at ${start}`);
      setText(p.splitA, '');
      setText(p.splitDot, '');
      setText(p.splitB, '');
    }
    p.seed.classList.toggle('on', !snap.planted);
  }

  function updateTable(pair: TreePair, force = false): void {
    if (!how.open) return;
    const key = `${pair.a.contributionsMade}|${pair.b.contributionsMade}|${pair.a.planted}|${pair.b.planted}|${state.scenario.inputs.monthlyContribution}|${Math.floor(state.ageMonths + 1e-9)}`;
    if (!force && key === tableKey) return;
    tableKey = key;
    const set = (k: string, v: string) => {
      const el = cells.get(k);
      if (el) setText(el, v);
    };
    const i = state.inputs;
    for (const [id, snap, start] of [['A', pair.a, i.startAgeA], ['B', pair.b, i.startAgeB]] as const) {
      set(`${id}.start`, String(start));
      set(`${id}.count`, snap.planted ? String(snap.contributionsMade) : '0');
      set(`${id}.contributed`, formatCurrency(snap.contributed));
      set(`${id}.growth`, formatCurrency(snap.growth));
      set(`${id}.balance`, formatCurrency(snap.balance));
    }
    const g = gapOf(pair);
    const any = pair.a.planted || pair.b.planted;
    set('gap.label', any && g.balance > 0 ? `Difference (Tree ${g.leader} ahead)` : 'Difference');
    set('gap.balance', formatCurrency(g.balance));
    set('gap.contributions', formatCurrency(g.contributions));
    set('gap.growth', formatCurrency(g.growth));
    setText($('how-age'), ageSpoken(state.ageMonths).toLowerCase());
  }

  function update(pair: TreePair): void {
    lastPair = pair;
    const monthIdx = Math.floor(state.ageMonths + 1e-9);

    // Story beat / chapter handling (captions + live announcements).
    let beat: StoryBeat | null = null;
    if (state.mode === 'story') beat = storyBeat(state.storyTime, state.inputs, state.reducedMotion);
    // The Difference label gets a one-time emphasis (muted to emerald) at the difference chapter and in explore.
    const emph = state.mode === 'explore' || beat === 'difference' || beat === 'handoff';

    if (beat !== lastBeat) {
      const chapterChanged = chapterOf(beat) !== chapterOf(lastBeat);
      lastBeat = beat;
      if (beat !== null) {
        const cap = storyCaption(state.storyTime, state.scenario, state.reducedMotion);
        setCaption(cap);
        if (chapterChanged && state.playing) {
          announce([cap.primary, cap.secondary].filter(Boolean).join(' '));
        }
      }
    }
    if (beat === null) {
      setCaption(state.exploreHint ? { beat: 'handoff', primary: 'Explore your own timeline' } : null);
    }

    // Plates + difference label.
    const key = [
      pair.a.planted,
      pair.b.planted,
      Math.round(pair.a.balance * 100),
      Math.round(pair.b.balance * 100),
      pair.a.contributionsMade,
      pair.b.contributionsMade,
      emph,
      state.scenario.inputs.startAgeA,
      state.scenario.inputs.startAgeB,
      state.scenario.inputs.endAge,
    ].join('|');
    if (key !== plateKey) {
      plateKey = key;
      updatePlate('A', pair.a);
      updatePlate('B', pair.b);
      const both = pair.a.planted && pair.b.planted;
      setText(diffValue, formatCurrency(gapOf(pair).balance));
      diffEl.classList.toggle('on', both);
      diffEl.classList.toggle('emph', emph);
      const lk = `${pair.a.planted}|${pair.b.planted}`;
      if (lk !== lastLayoutKey) {
        lastLayoutKey = lk;
        layout();
      }
    }

    // Timeline + readout.
    const tKey = `${monthIdx}|${timeline.min}|${timeline.max}`;
    if (tKey !== timelineKey) {
      timelineKey = tKey;
      const v = Math.round(state.ageMonths);
      if (document.activeElement !== timeline || String(v) !== timeline.value) timeline.value = String(v);
      const span = Math.max(1, state.scenario.timelineEndMonths - state.scenario.timelineStartMonths);
      timeline.style.setProperty('--frac', String((state.ageMonths - state.scenario.timelineStartMonths) / span));
      timeline.setAttribute('aria-valuetext', ageSpoken(state.ageMonths));
      setText(ageReadout, `Age ${ageShort(state.ageMonths)}`);
    }

    updateTable(pair);
  }

  function chapterOf(beat: StoryBeat | null): string {
    if (beat === null) return 'explore';
    if (beat === 'planting') return 'planting';
    if (beat === 'difference') return 'difference';
    if (beat === 'handoff') return 'handoff';
    return 'growing';
  }

  /* ---------------- controls ---------------- */

  function syncPlay(): void {
    const story = state.mode === 'story';
    const label = state.playing ? (story ? 'Pause story' : 'Pause') : story ? (state.storyTime > 0 ? 'Resume story' : 'Play story') : 'Play';
    setText(playLabel, label);
    icoPlay.toggleAttribute('hidden', state.playing);
    icoPause.toggleAttribute('hidden', !state.playing);
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.removeAttribute('aria-pressed');
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
    dock.classList.remove('hl');
    void dock.offsetWidth;
    dock.classList.add('hl');
    window.setTimeout(() => dock.classList.remove('hl'), HIGHLIGHT_MS);
  }

  playBtn.addEventListener('click', () => actions.togglePlay());
  replayBtn.addEventListener('click', () => actions.replayStory());
  skipBtn.addEventListener('click', () => actions.skipToExplore());
  for (const r of speedInputs) {
    r.addEventListener('change', () => {
      if (r.checked) actions.setSpeed(Number(r.value) as Speed);
    });
  }
  reduceBox.addEventListener('change', () => actions.setReducedMotion(reduceBox.checked));

  timeline.addEventListener('input', () => actions.scrubTo(Number(timeline.value)));
  timeline.addEventListener('keydown', (e) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      actions.scrubTo(Math.round(state.ageMonths) + (e.key === 'PageUp' ? 12 : -12));
      timeline.value = String(Math.round(state.ageMonths));
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
    const f = btn.closest<HTMLElement>('.field')!.dataset.field as InputField;
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
      case 'inputs': {
        syncErrors();
        syncDrafts();
        syncPlay();
        buildScale();
        applyInsets();
        layout();
        timelineKey = '';
        plateKey = '';
        tableKey = '';
        lastBeat = null;
        refreshSummary();
        const sc = state.scenario;
        const fa = sc.a.balance[sc.a.months] ?? 0;
        const fb = sc.b.balance[sc.b.months] ?? 0;
        const textEnd = `By age ${state.inputs.endAge}, Tree A reaches ${formatCurrency(fa)} and Tree B reaches ${formatCurrency(fb)}.`;
        announce(`Updated. ${textEnd}`, INPUT_ANNOUNCE_MS);
        setText($('conv-count'), `Tree A: ${contributionCount(state.inputs.startAgeA, state.inputs.endAge, sc.a.months)}. Tree B: ${contributionCount(state.inputs.startAgeB, state.inputs.endAge, sc.b.months)}.`);
        break;
      }
      case 'play':
        syncPlay();
        announce(state.mode === 'story' ? 'Story playing.' : 'Playing.');
        break;
      case 'pause':
        syncPlay();
        refreshSummary();
        announce(`Paused. ${ageSpoken(state.ageMonths)}.`);
        break;
      case 'play-end':
        syncPlay();
        refreshSummary();
        announce(`Reached the end. ${ageSpoken(state.ageMonths)}.`);
        break;
      case 'speed':
        syncSpeed();
        break;
      case 'scrub': {
        syncPlay();
        window.clearTimeout(summaryTimer);
        const pair = exactPair(state.scenario, state.ageMonths);
        const say = `${ageSpoken(state.ageMonths)}. ${pair.a.planted ? `Tree A ${formatCurrency(pair.a.balance)}.` : 'Tree A not planted.'} ${pair.b.planted ? `Tree B ${formatCurrency(pair.b.balance)}.` : 'Tree B not planted.'}`;
        scheduleSummary(SCRUB_ANNOUNCE_MS);
        announce(say, SCRUB_ANNOUNCE_MS);
        break;
      }
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
        announce('Explore your own timeline. Controls are ready.');
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

  // Text metrics change once the web fonts arrive, so measure the reserved bands again (once, not per frame).
  void document.fonts?.ready.then(() => {
    applyInsets();
    layout();
  });

  // Initial paint of static state.
  syncDrafts();
  syncErrors();
  syncSpeed();
  syncPlay();
  applyReduced();
  buildScale();
  setText($('conv-count'), `Tree A: ${contributionCount(state.inputs.startAgeA, state.inputs.endAge, state.scenario.a.months)}. Tree B: ${contributionCount(state.inputs.startAgeB, state.inputs.endAge, state.scenario.b.months)}.`);
  refreshSummary();
  syncDockHeight();

  return {
    update,
    layout,
    setStageSize(w, h) {
      stageW = w;
      stageH = h;
      applyInsets();
      layout();
    },
    announce: (t) => announce(t),
  };
}
