/**
 * The grocer and the basket he handles (the Grocer contract in partsApi.ts). He is the only reason anything on the
 * board or the counter changes.
 *
 * His work, each step finished before the next begins:
 *   board   when a line of the board differs from what it should say, he walks out past the counter's end to the
 *           board, takes the chalk from his apron pocket and the towel off his shoulder, and goes down the lines in
 *           PASS_ORDER: for each that differs he reads what it should say now, wipes the old figure with the
 *           towel in his left hand (the cloth exactly on the board's wipeTip), then chalks the new one with his right
 *           (the chalk's tip exactly on writeTip), stepping along the board between the year and the prices, up on
 *           his toes for the year, stooping a little for the total. While the timeline plays the months keep coming,
 *           so he keeps going; when it is paused he finishes the line he is on.
 *   basket  when the counter differs from the basket, he goes along behind the counter and adds or takes away one
 *           piece at a time (basket.ts): a stoop to the shelf under the counter, the piece lifted up and over and
 *           set in its place (or the reverse, the piece taken back down under the counter).
 *   idle    at the counter: his hands on its edge, now and then the towel off his shoulder to wipe it down, a
 *           glance out at the rain.
 * Between them the walks are walked (the orchard pickers' CMU-fitted walk, real time at 1x), every hand moves along
 * an eased path from where it is, and the chalk, the towel and the pieces move only in his hands.
 *
 * Pace: at 1x his work runs a little brisker than the wall clock (a line wiped and written in about three quarters of
 * a second), faster with the playback speed up to a brisk cap; his walks stay a person's walks. Paused, he finishes
 * the line (or the piece) in hand and goes back to the counter, except that a change the reader makes to the basket
 * while paused is still seen to: the piece fetched or put away and the total re-chalked.
 */
import type { BasketInputs, BoardContent, ItemKey } from '../types';
import { ITEM_KEYS } from '../types';
import { Mover, clamp, lerp, sstep } from '../../vine/scene/gardenerMath';
import { BOARD_LINES, COUNTER, GROCER_FLOOR_Y, GROCER_SPOTS } from './geom';
import { type Board, type BoardLine, type CreateGrocer, type Grocer, type GrocerIntent } from './partsApi';
import { GrocerFigure, UNIT, type W3 } from './grocerFigure';
import { buildGrocerSet, fillHeadViews } from './grocerArt';
import { BasketArt, layoutBasket, sortPieces, type PieceSpec } from './basket';

const PI = Math.PI;
/** the order he goes down the board: the prices and the total, then the year last, so the board never shows a new
 *  year over last year's prices */
const PASS_ORDER: readonly BoardLine[] = ['bread', 'eggs', 'coffee', 'bananas', 'chicken', 'flour', 'total', 'year'];
const STEP = 1 / 60;
const FLOOR = GROCER_FLOOR_Y;
/** the counter's back edge is this deep (world y) and its top this high above his floor: on the screen the top's back
 *  edge is at COUNTER.topBack */
const BACK_D = FLOOR + 10;
const COUNTER_H = BACK_D - COUNTER.topBack;
/** the board's face, a short reach in front of him (world y) */
const BOARD_D = FLOOR - 12;
/** the shelf under the counter, where the pieces wait (world y and height): hidden by the counter */
const UNDER: { y: number; h: number } = { y: FLOOR + 8, h: 80 };
/** facing us at the counter; facing the board in three-quarter view, a little to its right */
const FACE_FRONT = PI / 2;
const FACE_BOARD = -PI / 2 + 0.42;
/** where he stands (pelvis x) for the year, and for the prices and the total: the board's columns are well past
 *  GROCER_SPOTS.board, which is only where the counter ends */
const STAND_YEAR_WIPE = 866;
const STAND_YEAR_WRITE = 826;
/** (the year is reached from the same floor line: a step in toward the wall left the walk landing short of it, and
 * re-walking to make it up) */
const YEAR_Y = FLOOR;
const STAND_PRICE = 904;
/** his own clock against the wall clock: work at 1x, and the caps on work and walks at high speeds */
const WORK_TIME = 2.1;
const WORK_CAP = 2.7;
const WALK_CAP = 1.3;
const WALK_EASE = 0.35;
/** how long a wipe takes, and a write per character (his own seconds) */
const WIPE_S = 0.34;
const WRITE_CHAR_S = 0.085;
const WRITE_MIN_S = 0.32;
/** the chalk's tip from his fingers, and the towel's middle from his palm against the board (world: x, depth, h) */
const CHALK: W3 = { x: 1, y: -3, h: 10.5 };
/** for the year, high over his head, he holds the chalk by its end and points it up (a longer reach) */
const CHALK_UP: W3 = { x: -1, y: -2, h: 15 };
const WAD_BOARD: W3 = { x: 0, y: -4, h: 1 };
const WAD_COUNTER: W3 = { x: 0, y: 1, h: -3 };

const ease = (t: number): number => sstep(clamp(t, 0, 1));
const lerpW = (a: W3, b: W3, t: number): W3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerp(a.h, b.h, t) });
const addW = (a: W3, b: W3, k = 1): W3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, h: a.h + b.h * k });
/** a point on the board's face from its screen point */
const onBoard = (p: { x: number; y: number }): W3 => ({ x: p.x, y: BOARD_D, h: BOARD_D - p.y });

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

type Phase =
  | 'counter'
  | 'leave'
  | 'toBoard'
  | 'arm'
  | 'reach'
  | 'wipe'
  | 'shift'
  | 'write'
  | 'side'
  | 'wait'
  | 'disarm'
  | 'toCounter'
  | 'toPiece'
  | 'piece';

type IdleSub = 'rest' | 'take' | 'wipe' | 'put' | 'look';

const lineText = (c: BoardContent, l: BoardLine): string => (l === 'year' ? c.year : l === 'total' ? c.total : c.prices[l]);
const basketKey = (b: BasketInputs): string => ITEM_KEYS.map((k) => b.qty[k]).join(',');

class GrocerImpl implements Grocer {
  private readonly fig: GrocerFigure;
  private readonly art = new BasketArt();
  private readonly hands: [HandPath, HandPath] = [new HandPath(), new HandPath()];
  /** each hand is on a path (true) or hanging free */
  private readonly on: [boolean, boolean] = [false, false];
  private phase: Phase = 'counter';
  private t = 0;
  private sub = 0;
  /** the pieces on the counter, and the piece in his hand (drawn behind the counter or over it) */
  private onCounter = new Map<string, PieceSpec>();
  private drawOrder: PieceSpec[] = [];
  private held: { p: PieceSpec; over: boolean } | null = null;
  private op: { p: PieceSpec; add: boolean } | null = null;
  /** the board pass: the line in hand, its new text and the progress of its wipe or write */
  private lineI = 0;
  /** how he holds the chalk now (it turns in his fingers only while his hand travels, never mid-stroke) */
  private chalk: W3 = { ...CHALK };
  /** the stroke the line is at (where he stands for it) and the phase a step along the board leads to */
  private stroke: 'wipe' | 'write' = 'wipe';
  private sideNext: 'line' | 'shift' = 'line';
  private line: BoardLine | null = null;
  private text = '';
  private prog = 0;
  private armed = false;
  /** the towel: 0 over the shoulder … 1 in the hand (a crossfade while the hand is at the shoulder) */
  private readonly towel = new Mover(0);
  private idleSub: IdleSub = 'rest';
  private idleT = 0;
  private idleN = 0;
  private walkClock = 0;
  /** a change the reader made to the basket while paused, still to be seen to */
  private tend = false;
  private lastBasket = '';
  private board: Board | null = null;
  private ready = false;
  private q = 0;
  /** for the harness: how far the chalk and the towel are from the board's tips (world units) */
  readonly debug = { chalkErr: 0, clothErr: 0, reach: [0, 0] as [number, number], phase: '' as string, line: '' as string, prog: 0, repaints: 0 };

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
    if (this.ready && Math.abs(q - this.q) < 0.2) return;
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
    // then the head's in-between views, in the background (a smoother turn of the head; see HEAD_VIEWS)
    void fillHeadViews(q, tick, () => check() && this.q === q).then((full) => {
      if (full && this.q === q) this.fig.sprites(full);
    });
  }

  place(intent: GrocerIntent, board: Board): void {
    this.board = board;
    board.set(intent.board);
    this.onCounter.clear();
    for (const p of layoutBasket(intent.basket.qty)) this.onCounter.set(p.id, p);
    this.drawOrder = sortPieces([...this.onCounter.values()]);
    this.held = null;
    this.op = null;
    this.line = null;
    this.armed = false;
    this.tend = false;
    this.lastBasket = basketKey(intent.basket);
    this.walkClock = 0;
    this.phase = 'counter';
    this.idleSub = 'rest';
    this.idleT = 0;
    this.idleN = 0;
    this.towel.snap(0);
    this.chalk = { ...CHALK };
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
  }

  update(dtSec: number, intent: GrocerIntent, board: Board, tSec: number, reduced: boolean): void {
    void tSec;
    this.board = board;
    if (reduced) {
      this.place(intent, board);
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
    // (a side-step along the board is part of the work, at the work's pace; the walks are a person's walks)
    const walking = (this.fig.walking && this.phase !== 'side') || this.phase === 'toBoard' || this.phase === 'toCounter' || this.phase === 'toPiece';
    this.walkClock += ((walking ? 1 : 0) - this.walkClock) * (1 - Math.exp(-wall / WALK_EASE));
    const pace = intent.pace > 0 ? intent.pace : 1;
    const work = Math.min(WORK_TIME * pace, WORK_CAP);
    const walk = Math.min(pace, WALK_CAP);
    const rate = work + (walk - work) * this.walkClock;
    const dt = Math.min(wall * rate, 0.4);
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    for (let i = 0; i < n; i++) this.step(dt / n, intent);
    this.fig.finish();
    this.fig.armLayers = [this.overCounter(0) || this.held !== null, this.overCounter(1)];
    this.fig.atEase = this.phase === 'counter' && (this.idleSub === 'rest' || this.idleSub === 'look') && this.hands[0].done && this.hands[1].done && !this.fig.walking;
    this.measure();
  }

  drawFigure(ctx: CanvasRenderingContext2D): void {
    if (!this.fig.painted) return;
    // a shadow on the boards where his feet show past the counter's end
    if (this.fig.px > COUNTER.x1 - 30) {
      ctx.save();
      ctx.globalAlpha = clamp((this.fig.px - COUNTER.x1 + 30) / 40, 0, 1);
      this.fig.drawShadow(ctx);
      ctx.restore();
    }
    this.fig.drawLit(ctx);
    if (this.held && !this.held.over) {
      this.drawHeld(ctx);
      // his fingers over what they hold
      this.fig.drawArm(ctx, 0);
    }
  }

  drawCounterTop(ctx: CanvasRenderingContext2D): void {
    if (!this.fig.painted) return;
    // a hand on the counter behind the pieces (resting on its edge, wiping it) goes under them; a hand among them
    // (setting one down, taking one up) over them
    const over: (0 | 1)[] = [];
    for (const i of [0, 1] as const) {
      if (!this.overCounter(i)) continue;
      const hw = this.fig.hand(i);
      if (hw.y < BACK_D + 10) this.blitArm(ctx, i);
      else over.push(i);
    }
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

  /** the apron pocket's mouth (on his right, at the top of the thigh) */
  private pocket(): W3 {
    return this.bodyPt(11, 6, 56);
  }

  /** between strokes at the board: the chalk held up before his chest on the right, the towel on the left */
  private chalkRest(): W3 {
    return this.bodyPt(11, 7, 74);
  }

  private clothRest(): W3 {
    return this.bodyPt(9, -9, 68);
  }

  /** the chalk held ready a little short of where the new figure starts, while the towel wipes */
  private chalkHover(l: BoardLine): W3 {
    const w = this.writeHand(l, this.text, 0);
    const r = this.chalkRest();
    return { x: lerp(w.x, r.x, 0.45), y: lerp(w.y, r.y, 0.45), h: lerp(w.h, r.h, 0.45) - 8 };
  }

  /** the towel where it hangs down his chest from the left shoulder */
  private towelPt(): W3 {
    const s = this.fig.shoulderW(1);
    const f = this.bodyPt(7, 0, 0);
    return { x: s.x + (f.x - this.fig.px) * 0.9, y: s.y + (f.y - this.fig.footY) * 0.9, h: s.h - 10 * UNIT };
  }

  private standFor(l: BoardLine): { x: number; y: number } {
    // (the year is wider than either hand reaches across him from one place: he wipes it from its right, then steps
    // along to write it)
    if (l === 'year') return { x: this.stroke === 'wipe' ? STAND_YEAR_WIPE : STAND_YEAR_WRITE, y: YEAR_Y };
    return { x: STAND_PRICE, y: FLOOR };
  }

  private atStand(l: BoardLine): boolean {
    const s = this.standFor(l);
    return Math.abs(s.x - this.fig.px) <= 8 && Math.abs(s.y - this.fig.footY) <= 2.5;
  }

  /* ---------------------------------------------------------------- what needs doing */

  /** the next line from index i that differs from what it should say, or -1 */
  private nextLine(i: number, it: GrocerIntent): number {
    const b = this.board!.shown();
    for (let j = i; j < PASS_ORDER.length; j++) {
      const l = PASS_ORDER[j]!;
      if (lineText(b, l) !== lineText(it.board, l)) return j;
    }
    return -1;
  }

  /** the next piece to add or take away (one item's top piece to remove before any of its additions), nearest first */
  private nextOp(it: GrocerIntent): { p: PieceSpec; add: boolean } | null {
    const target = new Map(layoutBasket(it.basket.qty).map((p) => [p.id, p]));
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
    return clamp(p.x + 16, COUNTER.x0 + 50, COUNTER.x1 - 40);
  }

  /**
   * Walk to a spot and face a way. A walk that has come to rest near the spot counts as there (he turns to face the
   * way, and any last few units are a side-step at the work itself): asking the walk for the exact spot made it
   * overshoot by a stride's rounding, turn round, and overshoot again.
   */
  private arrive(spot: { x: number; y: number }, yaw: number): boolean {
    const f = this.fig;
    if (!f.walking && !f.gait.turning && Math.abs(f.px - spot.x) < 22) return f.face(yaw);
    return f.goTo(spot, yaw, 4);
  }

  /** may he work now: playing, or seeing to the reader's change */
  private allowed(it: GrocerIntent): boolean {
    return (it.activity === 'work' && it.pace > 0) || this.tend;
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

  private next(p: Phase): void {
    this.phase = p;
    this.t = 0;
    this.sub = 0;
  }

  /* ---------------------------------------------------------------- the step */

  private step(h: number, it: GrocerIntent): void {
    const f = this.fig;
    const board = this.board!;
    f.begin();
    this.t += h;
    this.towel.update(h);
    const ok = this.allowed(it);
    // posture defaults (each phase sets its own)
    let crouch = 0;
    let lean = 0.02;
    let tip = 0;
    let look: { pitch: number; yaw: number } | null = null;

    switch (this.phase) {
      case 'counter': {
        f.goTo({ x: GROCER_SPOTS.counter, y: FLOOR }, FACE_FRONT, 3);
        const atCounter = Math.abs(f.px - GROCER_SPOTS.counter) < 6 && !f.walking;
        const basketDue = ok && this.nextOp(it) !== null;
        const boardDue = ok && this.nextLine(0, it) >= 0;
        if (basketDue || boardDue) {
          // off to work: the towel back over his shoulder if it is out, then let go of the counter
          if (this.towel.target > 0 || this.towel.v > 0.01) {
            if (this.idleSub !== 'put') {
              this.idleSub = 'put';
              this.idleT = 0;
            }
          } else {
            this.next('leave');
            break;
          }
        }
        if (!atCounter) {
          this.free(0);
          this.free(1);
          break;
        }
        const r = this.idle(h);
        lean = r.lean;
        look = r.look;
        break;
      }
      case 'leave': {
        // finish with the towel if it is in hand, then let go
        if (this.towel.target > 0 || this.towel.v > 0.01) {
          this.putTowelBack();
          break;
        }
        this.free(0);
        this.free(1);
        if (this.t < 0.25) break;
        const basketDue = ok && this.nextOp(it) !== null;
        if (basketDue) this.startPiece(it);
        else if (ok && this.nextLine(0, it) >= 0) {
          this.lineI = this.nextLine(0, it);
          this.next('toBoard');
        } else this.next('counter');
        break;
      }
      case 'toBoard': {
        this.free(0);
        this.free(1);
        if (!ok && !this.armed) {
          // the timeline stopped before he got there: back to the counter
          this.next('toCounter');
          break;
        }
        // (the first line that differs now: a year may have turned on the way)
        if (this.nextLine(0, it) >= 0) this.lineI = this.nextLine(0, it);
        const l = PASS_ORDER[Math.max(0, this.lineI)]!;
        this.stroke = lineText(board.shown(), l) === '' ? 'write' : 'wipe';
        if (this.arrive(this.standFor(l), FACE_BOARD)) this.next('arm');
        break;
      }
      case 'arm': {
        // the chalk out of the apron pocket (right hand), the towel off the shoulder (left)
        look = { pitch: -0.1, yaw: 0.1 };
        if (this.sub === 0) {
          this.engage(0, 'pocket', () => this.pocket(), 0.38);
          this.engage(1, 'towel', () => this.towelPt(), 0.42);
          if (this.hands[0].done && !f.chalk) f.chalk = { ...this.chalk };
          if (this.hands[1].done) this.towel.go(1, 0.28);
          if (this.hands[0].done && this.hands[1].done && this.towel.v > 0.99) {
            this.sub = 1;
            this.t = 0;
          }
        } else {
          this.engage(0, 'ready', () => this.chalkRest(), 0.35);
          this.engage(1, 'ready', () => this.clothRest(), 0.35);
          this.armed = true;
          if (this.t > 0.12) this.startLine(it);
        }
        break;
      }
      case 'reach': {
        // the towel to the start of the line's old figure (or straight to the chalk if the line is clear)
        const l = this.line!;
        ({ crouch, lean, tip, look } = this.posture(l));
        if (lineText(board.shown(), l) === '') {
          this.next('shift');
          break;
        }
        this.engage(0, 'hover', () => this.chalkHover(l), 0.32);
        this.engage(1, 'wipe0', () => this.wipeHand(l, 0), 0.3, 6);
        // (and only once his reach has settled on it: up on his toes for the year, the shoulder lifted)
        if (this.hands[1].done && this.fig.wHold[1].v > 0.999 && (this.fig.reachErr[1] < 0.2 || this.t > 1.2)) {
          this.prog = 0;
          this.next('wipe');
        }
        break;
      }
      case 'wipe': {
        const l = this.line!;
        ({ crouch, lean, tip, look } = this.posture(l));
        // the cloth moves on only while his hand is on it (never ahead of his reach)
        if (this.fig.reachErr[1] < 0.2 || this.t > 1.5) this.prog = Math.min(1, this.prog + h / WIPE_S);
        board.wipe(l, this.prog);
        this.engage(0, 'hover', () => this.chalkHover(l), 0.32);
        this.hands[1].track('wipe', this.wipeHand(l, this.prog));
        if (this.prog >= 1) {
          this.stroke = 'write';
          if (this.atStand(l)) this.next('shift');
          else {
            this.sideNext = 'shift';
            this.next('side');
          }
        }
        break;
      }
      case 'shift': {
        // the towel comes away, the chalk to the start of the new figure
        const l = this.line!;
        ({ crouch, lean, tip, look } = this.posture(l));
        this.engage(1, 'ready', () => this.clothRest(), 0.3);
        this.engage(0, 'write0', () => this.writeHand(l, this.text, 0), 0.26, 4);
        if (this.hands[0].done && this.fig.wHold[0].v > 0.999 && (this.fig.reachErr[0] < 0.2 || this.t > 1.2)) {
          this.prog = 0;
          this.next('write');
        }
        break;
      }
      case 'write': {
        const l = this.line!;
        ({ crouch, lean, tip, look } = this.posture(l));
        const dur = Math.max(WRITE_MIN_S, WRITE_CHAR_S * this.text.length + 0.1);
        if (this.fig.reachErr[0] < 0.2 || this.t > 2.5) this.prog = Math.min(1, this.prog + h / dur);
        board.write(l, this.text, this.prog);
        this.engage(1, 'ready', () => this.clothRest(), 0.3);
        this.hands[0].track('write', this.writeHand(l, this.text, this.prog));
        if (this.prog >= 1) {
          this.engage(0, 'ready', () => this.chalkRest(), 0.3);
          this.line = null;
          this.lineI++;
          this.afterLine(it);
        }
        break;
      }
      case 'side': {
        // a step or two along the board, still facing it
        const l = this.sideNext === 'shift' ? this.line! : PASS_ORDER[this.lineI]!;
        this.engage(0, 'ready', () => this.chalkRest(), 0.3);
        this.engage(1, 'ready', () => this.clothRest(), 0.3);
        ({ look } = this.posture(l));
        if (f.goTo(this.standFor(l), FACE_BOARD, 4, true)) {
          if (this.sideNext === 'shift') this.next('shift');
          else this.startLine(it);
        }
        break;
      }
      case 'wait': {
        // by the board between years: the chalk and the towel lowered to his sides, an eye on the board
        this.engage(0, 'low', () => this.bodyPt(7, 10, 52), 0.5);
        this.engage(1, 'low', () => this.bodyPt(5, -10, 52), 0.5);
        look = { pitch: -0.15, yaw: 0.05 };
        if (this.t < 0.3) break;
        if (!ok || this.nextOp(it)) this.next('disarm');
        else if (this.nextLine(0, it) >= 0) {
          this.lineI = this.nextLine(0, it);
          this.startLine(it);
        }
        break;
      }
      case 'disarm': {
        // the chalk back in the pocket, the towel back over the shoulder
        if (this.sub === 0) {
          this.engage(0, 'pocket', () => this.pocket(), 0.36);
          this.engage(1, 'towel', () => this.towelPt(), 0.4);
          if (this.hands[0].done && f.chalk) f.chalk = null;
          if (this.hands[1].done) this.towel.go(0, 0.28);
          if (this.hands[0].done && this.hands[1].done && this.towel.v < 0.01) {
            this.sub = 1;
            this.t = 0;
          }
        } else {
          this.free(0);
          this.free(1);
          this.armed = false;
          if (this.t > 0.1) {
            if (ok && this.nextOp(it)) this.startPiece(it);
            else this.next('toCounter');
          }
        }
        break;
      }
      case 'toCounter': {
        this.free(0);
        this.free(1);
        if (ok && this.nextOp(it) && !this.armed) {
          this.startPiece(it);
          break;
        }
        if (ok && !this.armed && f.px > COUNTER.x1 && this.nextLine(0, it) >= 0 && !this.fig.walking) {
          // the board needs him again before he has gone
          this.lineI = this.nextLine(0, it);
          this.next('toBoard');
          break;
        }
        if (this.arrive({ x: GROCER_SPOTS.counter, y: FLOOR }, FACE_FRONT)) {
          this.idleSub = 'rest';
          this.idleT = 0;
          this.next('counter');
        }
        break;
      }
      case 'toPiece': {
        this.free(0);
        this.free(1);
        const p = this.op!.p;
        const x = this.pieceStand(p);
        const near = Math.abs(x - f.px) < 70 && f.facing(FACE_FRONT, 0.3);
        if (near ? f.goTo({ x, y: FLOOR }, FACE_FRONT, 3, true) : this.arrive({ x, y: FLOOR }, FACE_FRONT)) this.next('piece');
        break;
      }
      case 'piece': {
        const r = this.pieceWork(h, it);
        crouch = r.crouch;
        lean = r.lean;
        look = r.look;
        break;
      }
    }
    f.crouchT = crouch;
    f.leanT = lean;
    f.tipT = tip;
    f.lookT = look;
    // the towel: in his hand as it comes off the shoulder, over the shoulder as it goes back
    const tw = this.towel.v;
    f.drapeA = 1 - tw;
    f.wadA = tw;
    f.wad = tw > 0.001 ? (this.phase === 'counter' || this.phase === 'leave' ? WAD_COUNTER : this.armed || this.phase === 'arm' || this.phase === 'disarm' ? WAD_BOARD : WAD_COUNTER) : null;
    if (this.phase !== 'write') {
      const want = this.line === 'year' ? CHALK_UP : CHALK;
      const k = 1 - Math.exp(-h / 0.08);
      this.chalk = { x: lerp(this.chalk.x, want.x, k), y: lerp(this.chalk.y, want.y, k), h: lerp(this.chalk.h, want.h, k) };
    }
    if (f.chalk) f.chalk = this.chalk;
    for (const i of [0, 1] as const) {
      if (this.on[i]) f.hold(i, this.hands[i].step(h), 1, 0.22);
      else f.hold(i, null, 0, 0.36);
    }
    f.step(h);
  }

  /** after a line: the next that differs, a new pass from the top while the months keep coming, or put the tools
   *  away (to the basket, or back to the counter) */
  private afterLine(it: GrocerIntent): void {
    const ok = this.allowed(it);
    if (!ok) {
      this.next('disarm');
      return;
    }
    let j = this.nextLine(this.lineI, it);
    if (j < 0) {
      // the pass is done: the basket first if it is not true, else round again while the board still differs
      if (this.nextOp(it)) {
        this.next('disarm');
        return;
      }
      j = this.nextLine(0, it);
      if (j < 0) {
        // the board is true for this year: while the timeline plays he waits by it for the next, tools in hand
        // (the board changes once a year; walking back to the counter and out again each time would leave it behind)
        this.next(it.activity === 'work' && it.pace > 0 ? 'wait' : 'disarm');
        return;
      }
    }
    this.lineI = j;
    const l = PASS_ORDER[j]!;
    this.stroke = lineText(this.board!.shown(), l) === '' ? 'write' : 'wipe';
    this.sideNext = 'line';
    if (!this.atStand(l)) this.next('side');
    else this.startLine(it);
  }

  /** begin the line at lineI: read what it should say now */
  private startLine(it: GrocerIntent): void {
    let j = this.nextLine(this.lineI, it);
    if (j < 0) j = this.nextLine(0, it);
    if (j < 0) {
      this.next('disarm');
      return;
    }
    this.lineI = j;
    const l = PASS_ORDER[j]!;
    this.stroke = lineText(this.board!.shown(), l) === '' ? 'write' : 'wipe';
    this.sideNext = 'line';
    if (!this.atStand(l)) {
      this.next('side');
      return;
    }
    this.line = l;
    this.text = lineText(it.board, l);
    this.next('reach');
  }

  /** how he stands to a line: up on his toes for the year, stooping a little for the total; looking at the line */
  private posture(l: BoardLine): { crouch: number; lean: number; tip: number; look: { pitch: number; yaw: number } } {
    const y = BOARD_LINES[l];
    const pitch = clamp((y - 250) / 260, -0.5, 0.35);
    if (l === 'year') return { crouch: 0, lean: 0.2, tip: 0.55, look: { pitch: -0.5, yaw: 0.05 } };
    if (l === 'total') return { crouch: 0.16, lean: 0.1, tip: 0, look: { pitch, yaw: 0.15 } };
    return { crouch: 0, lean: 0.06, tip: 0, look: { pitch, yaw: 0.15 } };
  }

  /** his left hand while the towel is at progress t along a line */
  private wipeHand(l: BoardLine, t: number): W3 {
    return addW(onBoard(this.board!.wipeTip(l, t)), WAD_BOARD, -1);
  }

  /** his right hand while the chalk's tip is at progress t along a text */
  private writeHand(l: BoardLine, text: string, t: number): W3 {
    return addW(onBoard(this.board!.writeTip(l, text, t)), this.chalk, -1);
  }

  /** put the towel back over his shoulder (from the counter) */
  private putTowelBack(): void {
    this.engage(1, 'towelBack', () => this.towelPt(), 0.45, 8);
    if (this.hands[1].done) this.towel.go(0, 0.28);
    if (this.towel.v < 0.01 && this.towel.target === 0) this.free(1);
  }

  /* ---------------------------------------------------------------- the counter */

  /**
   * At the counter with nothing to do: hands on its edge, a breath; now and then the towel off his shoulder to wipe
   * the counter down in slow rounds; once in a while a long look out at the rain. One thing at a time, never a
   * glance to and fro.
   */
  private idle(h: number): { lean: number; look: { pitch: number; yaw: number } | null } {
    const f = this.fig;
    this.idleT += h;
    const rest = this.restPoints(f.px);
    let look: { pitch: number; yaw: number } | null = null;
    let lean = 0.05;
    switch (this.idleSub) {
      case 'rest': {
        this.engage(0, 'rest', () => rest[0], 0.6);
        this.engage(1, 'rest', () => rest[1], 0.6);
        // what comes after a rest: the towel twice for every look out of the window
        if (this.idleT > 3.6) {
          this.idleN++;
          this.idleSub = this.idleN % 3 === 2 ? 'look' : 'take';
          this.idleT = 0;
        }
        break;
      }
      case 'take': {
        this.engage(0, 'rest', () => rest[0], 0.6);
        this.engage(1, 'towel', () => this.towelPt(), 0.5, 4);
        if (this.hands[1].done) this.towel.go(1, 0.3);
        if (this.towel.v > 0.99) {
          this.idleSub = 'wipe';
          this.idleT = 0;
        }
        look = { pitch: 0.2, yaw: -0.25 };
        break;
      }
      case 'wipe': {
        // slow rounds on the counter just in front of him, behind the basket
        this.engage(0, 'rest', () => rest[0], 0.6);
        const cx = f.px + 18;
        const at = (s: number): W3 => ({ x: cx + 16 * Math.sin(s * 2.6), y: BACK_D + 3 + 1.5 * Math.cos(s * 2.6), h: COUNTER_H + 1 });
        this.engage(1, 'wipeC', () => at(this.idleT), 0.5, 5);
        if (this.hands[1].done) this.hands[1].track('wipeC', at(this.idleT));
        lean = 0.12;
        look = { pitch: 0.42, yaw: -0.2 };
        if (this.idleT > 3.4) {
          this.idleSub = 'put';
          this.idleT = 0;
        }
        break;
      }
      case 'put': {
        this.engage(0, 'rest', () => rest[0], 0.6);
        this.putTowelBack();
        if (this.towel.v < 0.01 && this.towel.target === 0 && this.idleT > 0.4) {
          this.idleSub = 'rest';
          this.idleT = 0;
        }
        break;
      }
      case 'look': {
        // out of the window at the rain, the hands still on the counter
        this.engage(0, 'rest', () => rest[0], 0.6);
        this.engage(1, 'rest', () => rest[1], 0.6);
        const k = sstep(clamp(this.idleT / 0.6, 0, 1)) * sstep(clamp((3.2 - this.idleT) / 0.6, 0, 1));
        look = { pitch: -0.06 * k, yaw: 0.95 * k };
        if (this.idleT > 3.2) {
          this.idleSub = 'rest';
          this.idleT = 0;
        }
        break;
      }
    }
    return { lean, look };
  }

  private startPiece(it: GrocerIntent): void {
    this.op = this.nextOp(it);
    if (!this.op) {
      this.next('toCounter');
      return;
    }
    this.next('toPiece');
  }

  /**
   * One piece: to add, a stoop to the shelf under the counter, the piece taken up, lifted over the counter's edge and
   * set in its place; to take away, the reverse. The piece is drawn behind the counter while it is below the top's
   * edge and over it once it is lifted clear.
   */
  private pieceWork(h: number, it: GrocerIntent): { crouch: number; lean: number; look: { pitch: number; yaw: number } | null } {
    void h;
    const op = this.op!;
    const p = op.p;
    const grip: W3 = { x: p.x, y: p.base + COUNTER_H, h: COUNTER_H + p.gripH };
    const apex: W3 = { x: p.x + 4, y: UNDER.y - 1, h: COUNTER_H + p.gripH + 20 };
    const under: W3 = { x: p.x + 8, y: UNDER.y, h: UNDER.h };
    const lookDown = { pitch: 0.45, yaw: clamp((p.x - this.fig.px) / 200, -0.3, 0.3) };
    let crouch = 0;
    let lean = 0.1;
    const done = () => {
      this.free(0);
      this.op = null;
      if (this.allowed(it) && this.nextOp(it)) this.startPiece(it);
      else if (this.allowed(it) && this.nextLine(0, it) >= 0) {
        this.lineI = this.nextLine(0, it);
        this.next('toBoard');
      } else this.next('toCounter');
    };
    if (op.add) {
      switch (this.sub) {
        case 0: // down to the shelf under the counter
          crouch = 0.8;
          lean = 0.34;
          this.engage(0, 'under', () => under, 0.55);
          if (this.hands[0].done && this.t > 0.55) {
            this.held = { p, over: false };
            this.sub = 1;
            this.t = 0;
          }
          break;
        case 1: // up with it, clear of the counter's edge
          crouch = 0.1;
          lean = 0.14;
          this.engage(0, 'apex', () => apex, 0.55);
          if (this.hands[0].done) {
            this.held!.over = true;
            this.sub = 2;
            this.t = 0;
          }
          break;
        case 2: // over and down into its place
          lean = 0.16;
          this.engage(0, 'set', () => grip, 0.45, 3);
          if (this.hands[0].done) {
            this.held = null;
            this.onCounter.set(p.id, p);
            this.drawOrder = sortPieces([...this.onCounter.values()]);
            this.sub = 3;
            this.t = 0;
          }
          break;
        case 3: // the hand comes away
          lean = 0.1;
          this.engage(0, 'off', () => addW(grip, { x: 2, y: -4, h: 14 }), 0.25);
          if (this.hands[0].done) done();
          break;
      }
    } else {
      switch (this.sub) {
        case 0: // a reach to the piece
          lean = 0.16;
          this.engage(0, 'take', () => grip, 0.5, 6);
          if (this.hands[0].done) {
            this.onCounter.delete(p.id);
            this.drawOrder = sortPieces([...this.onCounter.values()]);
            this.held = { p, over: true };
            this.sub = 1;
            this.t = 0;
          }
          break;
        case 1: // up and back over the counter's edge
          lean = 0.12;
          this.engage(0, 'apex', () => apex, 0.5, 2);
          if (this.hands[0].done) {
            this.held!.over = false;
            this.sub = 2;
            this.t = 0;
          }
          break;
        case 2: // down onto the shelf under the counter
          crouch = 0.8;
          lean = 0.34;
          this.engage(0, 'under', () => under, 0.55);
          if (this.hands[0].done) {
            this.held = null;
            this.sub = 3;
            this.t = 0;
          }
          break;
        case 3: // and up again
          crouch = 0;
          this.free(0);
          if (this.t > 0.3) done();
          break;
      }
    }
    return { crouch, lean, look: lookDown };
  }

  /* ---------------------------------------------------------------- for the harness */

  private measure(): void {
    const d = this.debug;
    d.phase = this.phase + (this.phase === 'counter' ? ':' + this.idleSub : '');
    d.line = this.line ?? '';
    d.prog = this.prog;
    d.reach = [this.fig.reachErr[0], this.fig.reachErr[1]];
    d.repaints = this.fig.repaints;
    d.chalkErr = 0;
    d.clothErr = 0;
    if (this.line && this.phase === 'write') {
      const tip = this.board!.writeTip(this.line, this.text, this.prog);
      const g = this.fig.handScreen(0);
      const c = this.chalk;
      d.chalkErr = Math.hypot(g.x + c.x - tip.x, g.y + c.y - c.h - tip.y);
    }
    if (this.line && this.phase === 'wipe') {
      const tip = this.board!.wipeTip(this.line, this.prog);
      const g = this.fig.handScreen(1);
      d.clothErr = Math.hypot(g.x + WAD_BOARD.x - tip.x, g.y + WAD_BOARD.y - WAD_BOARD.h - tip.y);
    }
  }
}

export const createGrocer: CreateGrocer = () => new GrocerImpl();
