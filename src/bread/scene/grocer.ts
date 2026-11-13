/**
 * The grocer and the basket he handles (the Grocer contract in partsApi.ts). His work is the week's basket on the
 * counter, between the till at its left end and the brass scale at its right. He never goes to the board.
 *
 * serve   round after round, each step finished before the next begins (written as one story, a generator that is
 *         stepped by the clock, so what he does reads top to bottom):
 *           along the counter from the bread to the flour he takes up one piece of each item; the weighed ones
 *           (bananas, chicken, flour) he carries to the scale and sets on its pan (the pan dips, the needle swings and
 *           settles), then lifts off again; each piece goes back in exactly its place. Then, at the till, he keys
 *           the items in (a finger on a key, the key going down, the price flags popping up), turns the crank (his
 *           hand on the knob through the turn), the cash drawer runs out, and he pushes it shut. A breath (the towel
 *           over the counter, or a look out at the rain, once), and round again.
 *         Whenever the counter differs from the basket he first adds or takes away pieces one at a time (from the
 *         shelf under the counter, where taken pieces go back).
 * idle    paused: he finishes what is in his hands (a piece set down, the crank let go, the drawer shut), goes to the
 *         counter's middle, rests his hands on its edge, wipes it with the towel now and then, looks out at the rain.
 *         A change to the basket while paused is still seen to.
 * Between them the walks are walked (the orchard pickers' CMU-fitted walk, real steps), every hand moves along an
 * eased path from where it is, and the pieces, the pan, the keys, the crank and the drawer move only in or under his
 * hands (fixtures.ts: the mechanisms; their springs run on the wall clock).
 *
 * Pace: his own clock runs a little brisker than the wall clock at 1x (WORK_TIME), faster with the playback speed up
 * to a brisk cap; his walks stay a person's walks. The idle life runs at the same rate as ever (its timings were tuned
 * by the owner).
 */
import type { BasketInputs, ItemKey } from '../types';
import { ITEM_KEYS } from '../types';
import { Mover, clamp, lerp, sstep } from '../../vine/scene/gardenerMath';
import { COUNTER, GROCER_FLOOR_Y, GROCER_SPOTS, SCALE, TILL } from './geom';
import type { CreateGrocer, Grocer, GrocerIntent } from './partsApi';
import { GrocerFigure, UNIT, type W3 } from './grocerFigure';
import { buildGrocerSet, fillHeadViews } from './grocerArt';
import { BasketArt, layoutBasket, sortPieces, type PieceSpec } from './basket';
import { CounterFixtures, DRAWER, PAN, TILL_BASE, keyPos, KEY_COLS } from './fixtures';

const PI = Math.PI;
const STEP = 1 / 60;
const FLOOR = GROCER_FLOOR_Y;
/** the counter's back edge is this deep (world y) and its top this high above his floor: on the screen the top's back
 *  edge is at COUNTER.topBack */
const BACK_D = FLOOR + 10;
const COUNTER_H = BACK_D - COUNTER.topBack;
/** the shelf under the counter, where the pieces wait (world y and height): hidden by the counter */
const UNDER: { y: number; h: number } = { y: FLOOR + 8, h: 80 };
const FACE_FRONT = PI / 2;
/** where he stands (pelvis x) at the till and at the scale; and how far along the counter a hand reaches from where he
 *  stands (lateral, from his right shoulder) before he steps along */
const TILL_STAND = 207;
const SCALE_STAND = 585;
/** a piece on the counter is within his right hand's reach when it lies this far to his left … or right (world units
 *  from his pelvis: his low reach is long toward his own right, which is the screen's left, and short across his body) */
const REACH_L = 62;
const REACH_R = 16;
/** where he stands to take each item up (and the scale's) */
const STAND: Record<ItemKey, number> = { bread: TILL_STAND, eggs: 333, coffee: 333, bananas: 431, chicken: 502, flour: 583 };
/** the counter's surface at the scale's foot (screen y) */
const SC_PLANE = SCALE.y + 6;
/** his own clock against the wall clock: work at 1x, and the caps on work and walks at high speeds */
const WORK_TIME = 2.1;
const SERVE_TIME = WORK_TIME;
const WORK_CAP = 2.7;
const WALK_BASE = 1;
const WALK_CAP = 1.3;
const WALK_EASE = 0.35;
/** the weighed items, and the dial reads full at this many pounds */
const WEIGHED: Record<ItemKey, boolean> = { bread: false, eggs: false, coffee: false, bananas: true, chicken: true, flour: true };
/** the keys he strikes for each item (row, column): a press or two, each item its own */
const RING: Record<ItemKey, [number, number][]> = {
  bread: [[1, 1]],
  eggs: [[2, 2]],
  coffee: [[0, 0]],
  bananas: [[3, 3]],
  chicken: [[2, 4]],
  flour: [[1, 5]],
};
/** where the point of his finger is against the hand's grip point (world units, screen) */
const FINGER = { x: 0, y: 3 };

const ease = (t: number): number => sstep(clamp(t, 0, 1));
const lerpW = (a: W3, b: W3, t: number): W3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerp(a.h, b.h, t) });
const addW = (a: W3, b: W3, k = 1): W3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, h: a.h + b.h * k });

/** the world point for a spot above the counter-top plane at `planeY` (screen y of the surface there), `hc` up from it:
 *  its screen position is (x, planeY - hc) */
const at = (x: number, planeY: number, hc: number): W3 => ({ x, y: planeY + COUNTER_H, h: COUNTER_H + hc });

/** a hand target moving along an eased path from where it was to a (possibly moving) goal, with an optional lift */
class HandPath {
  cur: W3 = { x: 0, y: 0, h: 0 };
  private from: W3 = { x: 0, y: 0, h: 0 };
  private to: () => W3 = () => this.cur;
  private t = 1;
  private dur = 1;
  private arc = 0;
  key = '';

  go(key: string, to: () => W3, dur: number, arc = 0): void {
    if (key === this.key) {
      this.to = to;
      return;
    }
    this.key = key;
    this.from = { ...this.cur };
    this.to = to;
    this.t = 0;
    this.dur = Math.max(0.05, dur);
    this.arc = arc;
  }

  /** follow a point exactly from now on (the path must already be there) */
  track(key: string, p: W3): void {
    this.key = key;
    this.cur = { ...p };
    this.from = { ...p };
    this.to = () => p;
    this.t = this.dur;
  }

  snap(p: W3, key = ''): void {
    this.cur = { ...p };
    this.from = { ...p };
    this.to = () => p;
    this.t = 1;
    this.dur = 1;
    this.key = key;
  }

  get done(): boolean {
    return this.t >= this.dur;
  }

  step(h: number): W3 {
    this.t = Math.min(this.dur, this.t + h);
    const u = ease(this.t / this.dur);
    const p = lerpW(this.from, this.to(), u);
    p.h += this.arc * Math.sin(PI * u);
    this.cur = p;
    return p;
  }
}

type Gen = Generator<void, void, void>;

const basketKey = (b: BasketInputs): string => ITEM_KEYS.map((k) => b.qty[k]).join(',');

class GrocerImpl implements Grocer {
  private readonly fig: GrocerFigure;
  private readonly art = new BasketArt();
  private readonly fx = new CounterFixtures();
  private readonly hands: [HandPath, HandPath] = [new HandPath(), new HandPath()];
  /** each hand is on a path (true) or hanging free */
  private readonly on: [boolean, boolean] = [false, false];
  private it: GrocerIntent = { activity: 'idle', basket: { qty: { bread: 0, eggs: 0, coffee: 0, bananas: 0, chicken: 0, flour: 0 } }, pace: 0 };
  private script: Gen | null = null;
  /** this step's length (his own seconds), and the time spent in the current wait */
  private h = STEP;
  /** the pieces on the counter, the piece in his hand (drawn behind the counter or over it) and the one on the pan */
  private onCounter = new Map<string, PieceSpec>();
  private drawOrder: PieceSpec[] = [];
  private held: { p: PieceSpec; over: boolean } | null = null;
  private pan: PieceSpec | null = null;
  /** the posture asked for this step (each action sets its own) */
  private crouch = 0;
  private lean = 0.02;
  private look: { pitch: number; yaw: number } | null = null;
  /** the towel: 0 over the shoulder … 1 in the hand (a crossfade while the hand is at the shoulder) */
  private readonly towel = new Mover(0);
  private idleN = 0;
  private breathN = 0;
  private walkClock = 0;
  private workK = WORK_TIME;
  private inWalk = false;
  /** a change the reader made to the basket while paused, still to be seen to */
  private tend = false;
  private lastBasket = '';
  private ready = false;
  private q = 0;
  /** for the harness: what he is doing and how well the hand meets what it touches (world units) */
  readonly debug = { phase: '' as string, reach: [0, 0] as [number, number], repaints: 0, contact: 0, contactKind: '' as string, needle: 0, pan: 0, drawer: 0, pressErr: 0, rounds: 0, roundSec: 0 };
  private roundT = 0;
  private contact: { kind: string; err: number } | null = null;

  constructor() {
    this.fig = new GrocerFigure(GROCER_SPOTS.counter, FLOOR, FACE_FRONT);
    // dev harness: the contact and reach measures
    if (import.meta.env.DEV) (window as unknown as { __grocer: unknown }).__grocer = this;
  }

  /* ---------------------------------------------------------------- the contract */

  async prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void> {
    // the figure's parts at about the density they are drawn at (px per rig unit)
    const q = Math.round(pxPerUnit * UNIT * 1.1 * 8) / 8;
    this.art.setQuality(pxPerUnit);
    this.fx.prepare(pxPerUnit);
    if (this.ready && Math.abs(q - this.q) < 0.2) return;
    await tick();
    const set = await buildGrocerSet(q, tick, check);
    if (!set || !check()) return;
    this.q = q;
    this.fig.sprites(set);
    // the pieces the counter can show, painted ahead of time a few at a time
    for (const k of ITEM_KEYS) {
      for (const p of layoutBasket({ bread: 0, eggs: 0, coffee: 0, bananas: 0, chicken: 0, flour: 0, [k]: k === 'flour' ? 10 : 6 } as Record<ItemKey, number>)) this.art.sprite(p);
      await tick();
      if (!check()) return;
    }
    this.ready = true;
    // then the head's in-between views, in the background (a smoother turn of the head; see HEAD_VIEWS), once the page
    // is showing: started at once, they made the first frames uneven, and the page waits for smooth frames to appear
    const fill = () =>
      void fillHeadViews(q, tick, () => check() && this.q === q).then((full) => {
        if (full && this.q === q) this.fig.sprites(full);
      });
    const idle = (globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    setTimeout(() => (idle ? idle(fill, { timeout: 2000 }) : fill()), 1500);
  }

  place(intent: GrocerIntent): void {
    this.it = intent;
    this.script = null;
    this.onCounter.clear();
    for (const p of layoutBasket(intent.basket.qty)) this.onCounter.set(p.id, p);
    this.drawOrder = sortPieces([...this.onCounter.values()]);
    this.held = null;
    this.pan = null;
    this.tend = false;
    this.lastBasket = basketKey(intent.basket);
    this.walkClock = 0;
    this.idleN = 0;
    this.breathN = 0;
    this.towel.snap(0);
    this.fx.reset();
    this.fig.chalk = null;
    this.fig.wad = null;
    this.fig.wadA = 0;
    this.fig.drapeA = 1;
    const rest = this.restPoints(GROCER_SPOTS.counter);
    this.fig.placeAt(GROCER_SPOTS.counter, FLOOR, FACE_FRONT, rest);
    this.fig.leanT = 0.05;
    for (const i of [0, 1] as const) {
      this.hands[i].snap(rest[i], 'rest');
      this.on[i] = true;
    }
    this.fig.finish();
    this.contact = null;
    this.roundT = 0;
  }

  update(dtSec: number, intent: GrocerIntent, tSec: number, reduced: boolean): void {
    void tSec;
    this.it = intent;
    if (reduced) {
      this.place(intent);
      return;
    }
    const wall = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    // a change to the basket while paused is the reader's own: he sees to it
    const bk = basketKey(intent.basket);
    if (bk !== this.lastBasket) {
      this.lastBasket = bk;
      if (intent.pace <= 0) this.tend = true;
    }
    if (intent.pace > 0) this.tend = false;
    // the mechanisms (the pan, the needle, the keys, the flags, the drawer) keep their own pace
    this.fx.update(wall);
    const walking = this.fig.walking || this.inWalk;
    this.walkClock += ((walking ? 1 : 0) - this.walkClock) * (1 - Math.exp(-wall / WALK_EASE));
    const pace = intent.pace > 0 ? intent.pace : 1;
    // (his idle life keeps the rate its timings were tuned at; the work is a little brisker)
    const idle = this.phaseTag.startsWith('idle');
    this.workK += ((idle ? WORK_TIME : SERVE_TIME) - this.workK) * (1 - Math.exp(-wall / 0.4));
    const work = Math.min(this.workK * pace, WORK_CAP);
    const walk = Math.min(WALK_BASE * pace, WALK_CAP);
    const rate = work + (walk - work) * this.walkClock;
    const dt = Math.min(wall * rate, 0.4);
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    for (let i = 0; i < n; i++) this.step(dt / n);
    this.roundT += wall;
    this.fig.finish();
    this.fig.armLayers = [this.overCounter(0) || this.held !== null, this.overCounter(1)];
    this.fig.atEase = this.atEase();
    this.measure();
  }

  drawFigure(ctx: CanvasRenderingContext2D): void {
    if (!this.fig.painted) return;
    this.fig.drawLit(ctx);
    if (this.held && !this.held.over) {
      this.drawHeld(ctx);
      // his fingers over what they hold
      this.fig.drawArm(ctx, 0);
    }
  }

  drawCounterTop(ctx: CanvasRenderingContext2D): void {
    if (!this.fig.painted) return;
    // the moving parts of the scale and the till first; a hand on the counter behind the pieces (resting on its edge,
    // wiping it) goes over them but under the pieces; a hand among them (setting one down, keying, turning the crank)
    // goes over everything
    const over: (0 | 1)[] = [];
    for (const i of [0, 1] as const) {
      if (!this.overCounter(i)) continue;
      const hw = this.fig.hand(i);
      if (hw.y < BACK_D + 10) this.blitArm(ctx, i);
      else over.push(i);
    }
    this.fx.drawScale(ctx);
    if (this.pan) this.art.draw(ctx, this.pan, PAN.x, this.fx.panBase);
    this.fx.drawTill(ctx);
    this.fx.drawCrank(ctx);
    for (const p of this.drawOrder) this.art.draw(ctx, p);
    if (this.held && this.held.over) this.drawHeld(ctx);
    for (const i of over) this.blitArm(ctx, i);
  }

  /* ---------------------------------------------------------------- drawing helpers */

  /** his forearm and hand laid again over the counter (never over its front face) */
  private blitArm(ctx: CanvasRenderingContext2D, i: 0 | 1): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(COUNTER.x0 - 40, 0, COUNTER.x1 - COUNTER.x0 + 80, COUNTER.topFront - 0.5);
    ctx.clip();
    this.fig.drawArm(ctx, i);
    ctx.restore();
  }

  /** a hand over the counter top (resting on it, wiping it, setting a piece down) */
  private overCounter(i: 0 | 1): boolean {
    if (!this.on[i]) return false;
    const hw = this.fig.hand(i);
    const hs = this.fig.handScreen(i);
    return !(hw.y < BACK_D - 1 || hs.y < COUNTER.topBack - 26 || hs.x < COUNTER.x0 || hs.x > COUNTER.x1 + 10);
  }

  /** the piece in his right hand: its grip under his fingers */
  private drawHeld(ctx: CanvasRenderingContext2D): void {
    const h = this.held!;
    const g = this.fig.handScreen(0);
    this.art.draw(ctx, h.p, g.x, g.y + h.p.gripH + 2);
  }

  /* ---------------------------------------------------------------- places */

  /** his hands resting on the counter's edge, either side of where he stands (right hand on the screen's left) */
  private restPoints(x: number): [W3, W3] {
    return [
      { x: x - 24, y: BACK_D + 2, h: COUNTER_H + 1 },
      { x: x + 26, y: BACK_D + 2, h: COUNTER_H + 1 },
    ];
  }

  /** a point on his body, from his pelvis: forward, to his right, and up from the floor (rig units) */
  private bodyPt(fwd: number, right: number, up: number): W3 {
    const y = this.fig.yaw.v;
    const f = { x: Math.cos(y), d: Math.sin(y) };
    const r = { x: -Math.sin(y), d: Math.cos(y) };
    const dx = (f.x * fwd + r.x * right) * UNIT;
    const dd = (f.d * fwd + r.d * right) * UNIT;
    return { x: this.fig.px + dx, y: this.fig.footY + dd * 0.4, h: up * UNIT };
  }

  /** the towel where it hangs down his chest from the left shoulder */
  private towelPt(): W3 {
    const s = this.fig.shoulderW(1);
    const f = this.bodyPt(7, 0, 0);
    return { x: s.x + (f.x - this.fig.px) * 0.9, y: s.y + (f.y - this.fig.footY) * 0.9, h: s.h - 10 * UNIT };
  }

  private atEase(): boolean {
    return this.phaseTag.startsWith('idle:rest') && this.hands[0].done && this.hands[1].done && !this.fig.walking;
  }

  /* ---------------------------------------------------------------- what needs doing */

  /** the next piece to add or take away (one item's top piece to remove before any of its additions), nearest first */
  private nextOp(): { p: PieceSpec; add: boolean } | null {
    const target = new Map(layoutBasket(this.it.basket.qty).map((p) => [p.id, p]));
    const cands: { p: PieceSpec; add: boolean }[] = [];
    for (const k of ITEM_KEYS) {
      const rem = [...this.onCounter.values()].filter((p) => p.key === k && !target.has(p.id)).sort((a, b) => b.idx - a.idx);
      if (rem.length) {
        cands.push({ p: rem[0]!, add: false });
        continue;
      }
      const add = [...target.values()].filter((p) => p.key === k && !this.onCounter.has(p.id)).sort((a, b) => a.idx - b.idx);
      if (add.length) cands.push({ p: add[0]!, add: true });
    }
    if (!cands.length) return null;
    const x = this.fig.px;
    cands.sort((a, b) => Math.abs(this.pieceStand(a.p) - x) - Math.abs(this.pieceStand(b.p) - x));
    return cands[0]!;
  }

  private pieceStand(p: PieceSpec): number {
    return clamp(p.x + 20, COUNTER.x0 + 50, COUNTER.x1 - 40);
  }

  private firstPiece(k: ItemKey): PieceSpec | null {
    const ps = [...this.onCounter.values()].filter((p) => p.key === k).sort((a, b) => a.idx - b.idx);
    return ps[0] ?? null;
  }

  /** may he work now: the timeline is playing, or he is seeing to the reader's change */
  private working(): boolean {
    return (this.it.activity === 'serve' && this.it.pace > 0) || this.tend;
  }

  /** is there something to do now (a round, or a change to see to) */
  private due(): boolean {
    return this.working() && (this.it.activity === 'serve' || this.nextOp() !== null);
  }

  /* ---------------------------------------------------------------- hands */

  /** put hand i on a path to `to` (starting from wherever the hand is now) */
  private engage(i: 0 | 1, key: string, to: () => W3, dur: number, arc = 0): void {
    if (!this.on[i]) {
      this.hands[i].snap(this.fig.hand(i));
      this.on[i] = true;
    }
    this.hands[i].go(key, to, dur, arc);
  }

  private free(i: 0 | 1): void {
    this.on[i] = false;
    this.hands[i].key = '';
  }

  private phaseTag = '';
  private tag(s: string): void {
    this.phaseTag = s;
  }

  /* ---------------------------------------------------------------- the step */

  private step(h: number): void {
    const f = this.fig;
    f.begin();
    this.h = h;
    this.towel.update(h);
    this.crouch = 0;
    this.lean = 0.02;
    this.look = null;
    this.inWalk = false;
    this.contact = null;
    this.script ??= this.main();
    this.script.next();
    // the hand that is not working rests on the counter's edge when he stands still (it hangs free while he walks)
    if (!this.inWalk && !f.walking && !this.on[1] && this.towel.target === 0 && this.towel.v < 0.01) this.engage(1, 'rest', () => this.restPoints(this.fig.px)[1], 0.7);
    f.crouchT = this.crouch;
    f.leanT = this.lean;
    f.tipT = 0;
    f.lookT = this.look;
    // the towel: in his hand as it comes off the shoulder, over the shoulder as it goes back
    const tw = this.towel.v;
    f.drapeA = 1 - tw;
    f.wadA = tw;
    f.wad = tw > 0.001 ? { x: 0, y: 1, h: -3 } : null;
    for (const i of [0, 1] as const) {
      if (this.on[i]) f.hold(i, this.hands[i].step(h), 1, 0.3);
      else f.hold(i, null, 0, 0.36);
    }
    f.step(h);
  }

  /* ---------------------------------------------------------------- the story */

  private *main(): Gen {
    for (;;) {
      if (this.working()) {
        if (this.nextOp()) {
          yield* this.tendBasket();
          yield;
          continue;
        }
        if (this.it.activity === 'serve' && this.it.pace > 0) {
          yield* this.round();
          yield;
          continue;
        }
      }
      yield* this.idleBeat();
      yield;
    }
  }

  /** wait for a condition that issues its own requests every step */
  private *until(fn: () => boolean): Gen {
    while (!fn()) yield;
  }

  /**
   * Walk to a spot on the floor and face the counter (a short shuffle when it is only a step or two). Hands: free, or
   * the right hand carrying what it holds.
   */
  private *walkTo(x: number): Gen {
    const f = this.fig;
    const spot = { x, y: FLOOR };
    for (;;) {
      this.inWalk = true;
      // a walk that has come to rest near the spot counts as there (he turns to face the way; the last few units are a
      // side-step): asking the walk for the exact spot made it overshoot by a stride's rounding and turn round again
      const stopped = !f.walking && !f.gait.turning;
      const near = Math.abs(x - f.px) < 70 && f.facing(FACE_FRONT, 0.3);
      let done: boolean;
      if (stopped && Math.abs(f.px - x) < 18) done = f.face(FACE_FRONT);
      else if (near && stopped) done = f.goTo(spot, FACE_FRONT, 3, true);
      else done = f.goTo(spot, FACE_FRONT, 4);
      if (this.held) this.engage(0, 'carry', () => this.carryPt(this.held!.p), 0.5);
      else this.free(0);
      this.free(1);
      if (this.held) this.lean = 0.06;
      if (done) return;
      yield;
    }
  }

  /** the right hand with a piece, carried before him over the counter (the hand goes where he goes) */
  private carryPt(p: PieceSpec): W3 {
    return at(this.fig.px - 18, 440, p.gripH + 14);
  }

  /**
   * Move the right hand along a path to a (moving) goal and wait until it is there: the path run out, the arm's reach
   * settled on it. `hold` keeps posture; `tol` is how near the hand must be (world units).
   */
  private *reach0(key: string, to: () => W3, dur: number, arc = 0, o: { crouch?: number; lean?: number; look?: { pitch: number; yaw: number } | null; tol?: number; minT?: number } = {}): Gen {
    let t = 0;
    for (;;) {
      this.engage(0, key, to, dur, arc);
      this.crouch = o.crouch ?? 0;
      this.lean = o.lean ?? 0.1;
      this.look = o.look === undefined ? null : o.look;
      t += this.h;
      const settled = this.fig.reachErr[0] < (o.tol ?? 0.35) && this.fig.wHold[0].v > 0.97;
      if (this.hands[0].done && t >= (o.minT ?? 0) && (settled || t > dur + 1.2)) return;
      yield;
    }
  }

  /** where a hand takes a piece (on the counter) */
  private gripPt(p: PieceSpec): W3 {
    return at(p.x, p.base, p.gripH);
  }

  private lookAt(p: PieceSpec): { pitch: number; yaw: number } {
    return { pitch: 0.4, yaw: clamp((this.fig.px - p.x) / 220, -0.3, 0.3) };
  }

  /* ---------------------------------------------------------------- a round */

  private *round(): Gen {
    this.roundT = 0;
    const rung: ItemKey[] = [];
    // along the counter from the bread to the flour: one piece of each
    for (const k of ITEM_KEYS) {
      if (!this.working()) return;
      if (this.nextOp()) {
        yield* this.tendBasket();
        if (!this.working()) return;
      }
      const p = this.firstPiece(k);
      if (!p) continue;
      yield* this.handle(p);
      rung.push(k);
    }
    // at the till: key each in, then the crank and the drawer
    if (rung.length) {
      yield* this.walkTo(TILL_STAND);
      yield* this.settle(0.25);
      let first = true;
      for (const k of rung) {
        if (!first && !this.working()) break;
        first = false;
        yield* this.ring(k);
      }
      yield* this.crankAndDrawer();
    }
    this.debug.rounds++;
    this.debug.roundSec = this.roundT;
    // a breath
    if (this.working()) yield* this.breath();
  }

  /** stand a moment (own seconds), hands free */
  private *settle(sec: number): Gen {
    let t = 0;
    while (t < sec) {
      this.free(0);
      this.free(1);
      t += this.h;
      yield;
    }
  }

  /** one item: to its place, a piece taken up, weighed if it is a weighed one, and set back in its place */
  private *handle(p: PieceSpec): Gen {
    this.tag(`${p.key}:to`);
    yield* this.standFor(p.x, STAND[p.key]);
    this.tag(`${p.key}:take`);
    yield* this.takeUp(p);
    if (WEIGHED[p.key]) {
      yield* this.standFor(PAN.x, SCALE_STAND, true);
      this.tag(`${p.key}:weigh`);
      yield* this.weigh(p);
      yield* this.standFor(p.x, STAND[p.key]);
    } else {
      // a look at it in his hand
      this.tag(`${p.key}:look`);
      let t = 0;
      while (t < 0.15) {
        this.engage(0, 'lift', () => this.liftPt(p), 0.5);
        this.lean = 0.1;
        this.look = { pitch: 0.2, yaw: 0 };
        t += this.h;
        yield;
      }
    }
    this.tag(`${p.key}:set`);
    yield* this.setDown(p);
  }

  /** walk along only if the target is out of a hand's reach from where he stands */
  private *standFor(x: number, stand: number, high = false): Gen {
    const dx = x - this.fig.px;
    // (reaching up to the pan he reaches further across himself)
    const inReach = high ? dx > -110 && dx < 75 : dx > -REACH_L && dx < REACH_R;
    if (inReach && this.fig.facing(FACE_FRONT, 0.4) && !this.fig.walking) return;
    yield* this.walkTo(clamp(stand, COUNTER.x0 + 50, COUNTER.x1 - 40));
  }

  private liftPt(p: PieceSpec): W3 {
    return at(p.x, p.base, p.gripH + 16);
  }

  /** a piece taken up off the counter by its grip: the hand comes down over it, takes hold, lifts it clear */
  private *takeUp(p: PieceSpec): Gen {
    const look = this.lookAt(p);
    yield* this.reach0('hover', () => at(p.x, p.base, p.gripH + 14), 0.7, 4, { lean: 0.14, look });
    yield* this.reach0('grip', () => this.gripPt(p), 0.5, 0, { lean: 0.16, look, tol: 0.5 });
    this.onCounter.delete(p.id);
    this.drawOrder = sortPieces([...this.onCounter.values()]);
    this.held = { p, over: true };
    yield* this.reach0('lift', () => this.liftPt(p), 0.6, 0, { lean: 0.12, look });
  }

  /** the piece, still in his hand, set down in its place; the hand comes away */
  private *setDown(p: PieceSpec): Gen {
    const look = this.lookAt(p);
    yield* this.reach0('set', () => this.gripPt(p), 0.6, 4, { lean: 0.16, look, tol: 0.5 });
    this.held = null;
    this.onCounter.set(p.id, p);
    this.drawOrder = sortPieces([...this.onCounter.values()]);
    yield* this.reach0('off', () => at(p.x + 3, p.base, p.gripH + 16), 0.5, 0, { lean: 0.1, look });
    this.free(0);
  }

  /** the pan's resting spot for a piece's grip (the pan dips under it) */
  private panGrip(p: PieceSpec): W3 {
    return at(PAN.x, SC_PLANE, SC_PLANE - (this.fx.panBase - p.gripH - 2));
  }

  /** the piece on the pan: it dips, the needle swings round and settles, he reads it and lifts it off */
  private *weigh(p: PieceSpec): Gen {
    const dial = { pitch: -0.18, yaw: -0.3 };
    yield* this.reach0('panSet', () => this.panGrip(p), 0.8, 8, { lean: 0.14, look: dial, tol: 0.5 });
    // let go: it stands on the pan, which dips
    this.held = null;
    this.pan = p;
    this.fx.load(p.size);
    // the hand comes away a little and he watches the needle come round
    let t = 0;
    for (;;) {
      // (his hand comes right away: back to the counter's edge, clear of the pan, so only the piece is weighed)
      this.engage(0, 'panOff', () => this.restPoints(this.fig.px)[0], 0.8, 8);
      this.lean = 0.1;
      this.look = dial;
      t += this.h;
      if (t > 0.55 && this.fx.needleNear && t > 0.8) break;
      if (t > 3) break;
      yield;
    }
    // back to it, hold it, and lift it off: the needle returns to zero
    yield* this.reach0('panBack', () => this.panGrip(p), 0.55, 3, { lean: 0.14, look: dial, tol: 0.5 });
    this.pan = null;
    this.held = { p, over: true };
    this.fx.load(0);
    yield* this.reach0('panUp', () => at(PAN.x - 6, SC_PLANE, SC_PLANE - (PAN.restBase - p.gripH - 2) + 16), 0.55, 0, { lean: 0.12, look: dial });
  }

  /* ---------------------------------------------------------------- the till */

  /** key one item in: a finger on a key, the key down under it, the price flags popping up (a press or two) */
  private *ring(k: ItemKey): Gen {
    this.tag(`${k}:key`);
    const presses = RING[k];
    const look = { pitch: 0.3, yaw: 0.2 };
    for (let n = 0; n < presses.length; n++) {
      const [r, c] = presses[n]!;
      const kp = keyPos(r, c);
      const idx = r * KEY_COLS + c;
      const hover = (): W3 => at(kp.x - FINGER.x, TILL_BASE, TILL_BASE - (kp.y - FINGER.y) + 7);
      const touch = (): W3 => at(kp.x - FINGER.x, TILL_BASE, TILL_BASE - (kp.y - FINGER.y) - 0.4);
      yield* this.reach0('keyHover' + k + n, hover, 0.5, 2, { lean: 0.16, look, tol: 0.6 });
      // down onto the key: it goes down under the finger
      let t = 0;
      for (;;) {
        this.engage(0, 'keyTouch' + k + n, touch, 0.28);
        this.lean = 0.18;
        this.look = look;
        t += this.h;
        const hs = this.fig.handScreen(0);
        const err = Math.hypot(hs.x + FINGER.x - kp.x, hs.y + FINGER.y - kp.y);
        this.contact = { kind: 'key', err };
        if (this.hands[0].done && this.fig.reachErr[0] < 0.6) break;
        if (t > 1.5) break;
        yield;
      }
      this.fx.key(idx, true);
      {
        const hs = this.fig.handScreen(0);
        this.debug.pressErr = Math.max(this.debug.pressErr, Math.hypot(hs.x + FINGER.x - kp.x, hs.y + FINGER.y - kp.y));
      }
      if (n === presses.length - 1) this.fx.showFlags();
      let held = 0;
      while (held < 0.14) {
        this.engage(0, 'keyTouch' + k + n, touch, 0.28);
        this.lean = 0.18;
        this.look = look;
        held += this.h;
        yield;
      }
      this.fx.key(idx, false);
    }
    // the hand rises a little off the keys
    yield* this.reach0('keyAway' + k, () => {
      const [r, c] = presses[presses.length - 1]!;
      const kp = keyPos(r, c);
      return at(kp.x - FINGER.x, TILL_BASE, TILL_BASE - (kp.y - FINGER.y) + 9);
    }, 0.4, 0, { lean: 0.14, look, tol: 1 });
  }

  /** a hand on the knob through the turn; the drawer runs out; he pushes it shut with his hand */
  private *crankAndDrawer(): Gen {
    this.tag('crank');
    const fx = this.fx;
    const look = { pitch: 0.3, yaw: 0.25 };
    const knobPt = (th: number): W3 => {
      const kn = fx.knobAt(th);
      return at(kn.x, TILL_BASE, TILL_BASE - kn.y);
    };
    const th0 = fx.theta;
    yield* this.reach0('crankIn', () => knobPt(th0), 0.7, 5, { lean: 0.16, look, tol: 0.5 });
    // a turn and a quarter, slow to start, brisk through the middle, easing off
    const turn = 2 * PI * 1.0;
    const dur = 1.1;
    let t = 0;
    let ejected = false;
    fx.hideFlags();
    while (t < dur) {
      t += this.h;
      const u = ease(t / dur);
      fx.theta = th0 + turn * u;
      this.hands[0].track('crank', knobPt(fx.theta));
      this.on[0] = true;
      this.lean = 0.16;
      this.look = look;
      const hs = this.fig.handScreen(0);
      const kn = fx.knobAt();
      this.contact = { kind: 'crank', err: Math.hypot(hs.x - kn.x, hs.y - kn.y) };
      if (!ejected && u > 0.8) {
        fx.ejectDrawer();
        ejected = true;
      }
      yield;
    }
    fx.theta = th0 + turn;
    if (!ejected) fx.ejectDrawer();
    // let go: the hand comes off the knob and down to the drawer's plate
    yield* this.reach0('drawerIn', () => at(TILL.x + 6, TILL_BASE, TILL_BASE - (fx.drawerTop + 9)), 0.65, 5, { lean: 0.18, look, tol: 0.7 });
    // and pushes it shut: the plate goes back with the hand
    t = 0;
    const pushDur = 0.6;
    const y0 = fx.drawerTop + 9;
    for (;;) {
      t += this.h;
      const u = ease(t / pushDur);
      const y = lerp(y0, DRAWER.top + 9, u);
      this.hands[0].track('push', at(TILL.x + 6, TILL_BASE, TILL_BASE - y));
      this.on[0] = true;
      this.lean = 0.18;
      this.look = look;
      const hs = this.fig.handScreen(0);
      fx.pushDrawer(hs.y - 9 - DRAWER.top);
      this.contact = { kind: 'drawer', err: Math.abs(hs.y - (fx.drawerTop + 9)) };
      if (u >= 1) break;
      yield;
    }
    fx.pushDrawer(0);
    fx.releaseDrawer();
    yield* this.reach0('drawerOff', () => at(TILL.x + 6, TILL_BASE, TILL_BASE - (DRAWER.top + 9) + 14), 0.5, 0, { lean: 0.12, look, tol: 1 });
    this.free(0);
  }

  /* ---------------------------------------------------------------- the counter, idle */

  /** go to the counter's middle (hands free on the way, the towel put back if it is out) */
  private *goHome(): Gen {
    yield* this.putTowel();
    if (Math.abs(this.fig.px - GROCER_SPOTS.counter) > 6 || this.fig.walking) yield* this.walkTo(GROCER_SPOTS.counter);
  }

  private *putTowel(): Gen {
    if (!(this.towel.target > 0 || this.towel.v > 0.01)) return;
    this.engage(1, 'towelBack', () => this.towelPt(), 0.45, 8);
    yield* this.until(() => {
      this.engage(1, 'towelBack', () => this.towelPt(), 0.45, 8);
      if (this.hands[1].done) this.towel.go(0, 0.28);
      return this.towel.v < 0.01 && this.towel.target === 0;
    });
    this.free(1);
  }

  /**
   * At the counter with nothing to do: hands on its edge, a breath; now and then the towel off his shoulder to wipe
   * the counter down in slow rounds; once in a while a long look out at the rain. One thing at a time, never a
   * glance to and fro.
   */
  private *idleBeat(): Gen {
    const f = this.fig;
    yield* this.goHome();
    const rest = (): [W3, W3] => this.restPoints(f.px);
    // rest
    this.tag('idle:rest');
    let t = 0;
    while (t < 3.6) {
      this.engage(0, 'rest', () => rest()[0], 0.6);
      this.engage(1, 'rest', () => rest()[1], 0.6);
      this.lean = 0.05;
      t += this.h;
      if (this.due()) return;
      yield;
    }
    this.idleN++;
    if (this.idleN % 3 === 2) {
      // out of the window at the rain, the hands still on the counter
      this.tag('idle:look');
      t = 0;
      while (t < 3.2) {
        this.engage(0, 'rest', () => rest()[0], 0.6);
        this.engage(1, 'rest', () => rest()[1], 0.6);
        const k = sstep(clamp(t / 0.6, 0, 1)) * sstep(clamp((3.2 - t) / 0.6, 0, 1));
        this.look = { pitch: -0.06 * k, yaw: 0.95 * k };
        this.lean = 0.05;
        t += this.h;
        if (this.due()) return;
        yield;
      }
      return;
    }
    yield* this.wipeCounter(3.4, true);
  }

  /** the towel off the shoulder, a few slow rounds on the counter just in front of him, the towel back */
  private *wipeCounter(sec: number, resting: boolean): Gen {
    const f = this.fig;
    const rest = (): [W3, W3] => this.restPoints(f.px);
    this.tag('idle:take');
    // take the towel
    yield* this.until(() => {
      this.engage(0, 'rest', () => rest()[0], 0.6);
      this.engage(1, 'towel', () => this.towelPt(), 0.5, 4);
      if (this.hands[1].done) this.towel.go(1, 0.3);
      this.look = { pitch: 0.2, yaw: -0.25 };
      this.lean = 0.05;
      return this.towel.v > 0.99;
    });
    // wipe
    this.tag('idle:wipe');
    let t = 0;
    const cx = f.px + 18;
    const pt = (s: number): W3 => ({ x: cx + 16 * Math.sin(s * 2.6), y: BACK_D + 3 + 1.5 * Math.cos(s * 2.6), h: COUNTER_H + 1 });
    while (t < sec) {
      this.engage(0, 'rest', () => rest()[0], 0.6);
      this.engage(1, 'wipeC', () => pt(t), 0.5, 5);
      if (this.hands[1].done) this.hands[1].track('wipeC', pt(t));
      this.lean = 0.12;
      this.look = { pitch: 0.42, yaw: -0.2 };
      t += this.h;
      if (resting && this.due() && t > 0.4) break;
      yield;
    }
    // put the towel back
    this.tag('idle:put');
    t = 0;
    yield* this.until(() => {
      this.engage(0, 'rest', () => rest()[0], 0.6);
      this.engage(1, 'towelBack', () => this.towelPt(), 0.45, 8);
      if (this.hands[1].done) this.towel.go(0, 0.28);
      t += this.h;
      return this.towel.v < 0.01 && this.towel.target === 0 && t > 0.4;
    });
    this.free(1);
  }

  /** the breath between rounds: the towel over the counter, or a look out at the rain, once and not back and forth */
  private *breath(): Gen {
    const f = this.fig;
    this.breathN++;
    const rest = (): [W3, W3] => this.restPoints(f.px);
    yield* this.settle(0.15);
    if (this.breathN % 2 === 0) {
      this.tag('breath:look');
      let t = 0;
      while (t < 2.4) {
        this.engage(0, 'rest', () => rest()[0], 0.6);
        this.engage(1, 'rest', () => rest()[1], 0.6);
        const k = sstep(clamp(t / 0.6, 0, 1)) * sstep(clamp((2.4 - t) / 0.6, 0, 1));
        this.look = { pitch: -0.06 * k, yaw: 0.95 * k };
        this.lean = 0.05;
        t += this.h;
        yield;
      }
    } else {
      yield* this.wipeCounter(1.8, false);
    }
  }

  /* ---------------------------------------------------------------- the basket: adding and taking away */

  private *tendBasket(): Gen {
    for (;;) {
      const op = this.nextOp();
      if (!op || !this.working()) break;
      this.tag(`op:${op.p.key}`);
      yield* this.standFor(op.p.x, this.pieceStand(op.p));
      yield* this.pieceWork(op);
    }
    this.free(0);
  }

  /**
   * One piece: to add, a stoop to the shelf under the counter, the piece taken up, lifted over the counter's edge and
   * set in its place; to take away, the reverse. The piece is drawn behind the counter while it is below the top's
   * edge and over it once it is lifted clear.
   */
  private *pieceWork(op: { p: PieceSpec; add: boolean }): Gen {
    const p = op.p;
    const grip: W3 = at(p.x, p.base, p.gripH);
    const apex: W3 = { x: p.x + 4, y: UNDER.y - 1, h: COUNTER_H + p.gripH + 20 };
    const under: W3 = { x: p.x + 8, y: UNDER.y, h: UNDER.h };
    const look = { pitch: 0.45, yaw: clamp((p.x - this.fig.px) / 200, -0.3, 0.3) };
    if (op.add) {
      // down to the shelf under the counter, up with it, over and down into its place, the hand comes away
      yield* this.reach0('under', () => under, 0.7, 0, { crouch: 0.8, lean: 0.34, look, minT: 0.7 });
      this.held = { p, over: false };
      yield* this.reach0('apex', () => apex, 0.65, 0, { crouch: 0.1, lean: 0.14, look });
      this.held.over = true;
      yield* this.reach0('set', () => grip, 0.55, 3, { lean: 0.16, look });
      this.held = null;
      this.onCounter.set(p.id, p);
      this.drawOrder = sortPieces([...this.onCounter.values()]);
      yield* this.reach0('off', () => addW(grip, { x: 2, y: -4, h: 14 }), 0.4, 0, { lean: 0.1, look });
    } else {
      yield* this.reach0('take', () => grip, 0.6, 6, { lean: 0.16, look });
      this.onCounter.delete(p.id);
      this.drawOrder = sortPieces([...this.onCounter.values()]);
      this.held = { p, over: true };
      yield* this.reach0('apex', () => apex, 0.6, 2, { lean: 0.12, look });
      this.held.over = false;
      yield* this.reach0('under', () => under, 0.7, 0, { crouch: 0.8, lean: 0.34, look });
      this.held = null;
      // and up again
      let t = 0;
      while (t < 0.4) {
        this.free(0);
        this.lean = 0.1;
        t += this.h;
        yield;
      }
    }
  }

  /* ---------------------------------------------------------------- for the harness */

  private measure(): void {
    const d = this.debug;
    d.phase = this.phaseTag;
    d.reach = [this.fig.reachErr[0], this.fig.reachErr[1]];
    d.repaints = this.fig.repaints;
    d.contact = this.contact ? this.contact.err : 0;
    d.contactKind = this.contact ? this.contact.kind : '';
    d.needle = this.fx.needleOff;
    d.pan = this.fx.panDip;
    d.drawer = this.fx.drawerOut;
  }
}

export const createGrocer: CreateGrocer = () => new GrocerImpl();
