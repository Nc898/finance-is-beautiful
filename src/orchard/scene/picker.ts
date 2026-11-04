/**
 * A picker, its round wicker basket, and the fruit its side of the farmer's tree bears.
 *
 * The round ('work'), each step finished before the next begins:
 *   fill    at the crates, squatting by the open crate with the basket held low, golden apples go in a handful at a
 *           time (the basket's own share of a full basket); the farmer's fruit starts to swell on the low bough
 *   bough   along the path to the bough's tip; red apples are picked one at a time (a reach up, a twist, down into
 *           the basket), stepping along the bough, until the share picked of what ripened is taken
 *   leave   turning away: what is left hanging drops into the grass, apple by apple
 *   plant   round the bough's tip and up between the rows to the newest tree's slot, a squat, and the basket is
 *           tipped out at its foot (the apples roll a little and sink into the grass as the seedling comes up)
 *   back    down to the path and back to the crates
 * The fruit nobody picks also keeps dropping with the months (so the heap under the bough keeps pace with the
 * money, whatever the picker's pace): a windfall lies about a year, browning, then sinks and fades.
 * 'rest' (the whole time has run): an apple from the crate, the basket set down, a seat on the upturned crate, a
 * look up at the orchard and a bite now and then. 'idle': stand easy by the crates, the empty basket on the arm.
 *
 * Every hand target moves along an eased path (HandPath), the basket follows the hand that holds it (with a little
 * swing), and when it is put down or taken up its place carries on from where it was drawn, so nothing jumps.
 */
import { Mover, Spring1, clamp, lerp, sstep, wrapPi } from '../../vine/scene/gardenerMath';
import { KAPPA } from '../../vine/scene/gardenerDims';
import type { CreatePicker, Item, Picker, PickerIntent } from './partsApi';
import { CRATES, FILL, SEAT, SLOTS, depthScale, type Pt } from './geom';
import { Figure } from './pickerFigure';
import { APPLE_R, BASKET, RIPE, appleSprites, basketSprites, buildPickerSet, type AppleSprites, type BasketSprites } from './pickerArt';
import { LowFruit, NPOS, Tipped, Windfalls, drawApple, type W3 } from './pickerFruit';
import type { PickerId } from '../types';

const STEP = 1 / 60;
/** the stage's pace at 1x (rounds per second, times the playback speed) and the crew's own briskness: at 1x the
 *  picker's clock runs CREW_TIME times the wall clock, at other speeds in proportion (as Brick by Brick's crew) */
const PACE_1X = 0.12;
const CREW_TIME = 1.9;
/** ...but a walk is walked in real time (at 1x): the clock eases down to WALK_TIME while the picker walks, over
 *  WALK_EASE seconds, so the steps come at a person's cadence (a sped-up walk reads as a scurry, however good the
 *  poses), while the work at either end keeps the crew's briskness */
const WALK_TIME = 1;
const WALK_EASE = 0.35;
/** apples in a full basket (the larger picker's month of own + match) */
const FULL = 20;
/** a long walk is a brisk one: the pace it settles into (true units a second at the reference depth), its ease in and
 *  out, and the distance below which a walk is just walked. 55 units is 1.84 leg lengths a second, a little brisker
 *  than the captured walk the gait is measured from (CMU 07_01, 1.70): 0.94 of a leg a step, 118 a minute (any brisker
 *  and the legs no longer reach from the measured hip height, and the hips start to sink at each step again) */
const BRISK_V = 55;
const BRISK_A = 36;
/** the radius a long walk's corners are rounded to (true units: about a stride and a half) */
const CORNER_R = 45;
/** a walker turns at most about 100 degrees a second while walking on (radians a second); the lead measures each bend
 *  over TURN_WINDOW of its way and looks TURN_LOOK ahead to slow for it in time, never below TURN_VMIN (a slow walk,
 *  about the captured slow walk's pace: slower, the steps grow long in time and the hips sink through each) */
const TURN_RATE = 1.8;
const TURN_WINDOW = 20;
const TURN_LOOK = 60;
const TURN_VMIN = 32;
/** how far along its way the body looks for the way to face (true units: about a stride) */
const FACE_AHEAD = 30;
const FACE_LEAD = 0.45;
const BRISK_MIN = 70;
const HANDOVER = 50;
/** the most a basket shows (heaped) */
const BASKET_MAX = 24;
/** a windfall's life in months, and never shorter than this many seconds (so it can be seen at high speeds) */
const LIFE_MONTHS = 12;
const LIFE_MIN_S = 9;
/** windfalls lying at steady state per basket of free fruit left each month, and the most there can be */
const HEAP_K = 3;
const HEAP_MAX = 24;
/** a round's free fruit swells on the bough over this long (crew seconds), and fruit taken is replaced over this
 *  long (wall seconds): whenever nobody is picking, the offer hangs there ripe */
const RIPEN_ROUND = 2.6;
const REGROW_S = 2.4;
/** how long tipped apples lie before they are gone (wall seconds) */
const TIPPED_LIFE = 3.6;
/** the upturned crate's seat height (props.ts paints it 11 × 0.95 at its depth) */
const SEAT_H = 11 * 0.95 * depthScale(SEAT.a.y);

type Phase =
  | 'stand'
  | 'toFill'
  | 'fill'
  | 'toBough'
  | 'pick'
  | 'toSlot'
  | 'tip'
  | 'restTake'
  | 'restDown'
  | 'toSeat'
  | 'sit'
  | 'rise'
  | 'takeUp';

const ease = (t: number): number => sstep(clamp(t, 0, 1));
const lerpW = (a: W3, b: W3, t: number): W3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerp(a.h, b.h, t) });

/** a hand target moving along an eased path from where it was to a (possibly moving) goal, with an optional lift */
class HandPath {
  cur: W3 = { x: 0, y: 0, h: 0 };
  private from: W3 = { x: 0, y: 0, h: 0 };
  private to: () => W3 = () => this.cur;
  private t = 1;
  private dur = 1;
  private arc = 0;
  key = '';

  /** glide to `to` over `dur` seconds (a new goal only when `key` changes) */
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

  snap(p: W3, key = ''): void {
    this.cur = { ...p };
    this.from = { ...p };
    this.to = () => p;
    this.t = 1;
    this.key = key;
  }

  get done(): boolean {
    return this.t >= this.dur;
  }

  step(h: number): W3 {
    this.t = Math.min(this.dur, this.t + h);
    const u = ease(this.t / this.dur);
    const p = lerpW(this.from, this.to(), u);
    p.h += this.arc * Math.sin(Math.PI * u);
    this.cur = p;
    return p;
  }
}

/* ------------------------------------------------------------------ the basket */

/** the places of the apples in a basket, filled in this order: (u across, v toward the viewer, both true units; z the
 *  centre's height above the floor) */
const SLOT: Array<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [];
  const layer = (z: number, n: number, r: number, centre: boolean, rot: number) => {
    if (centre) out.push([0, 0, z]);
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      out.push([Math.cos(a) * r, Math.sin(a) * r, z]);
    }
  };
  layer(1.4, 6, 2.7, true, 0.3);
  layer(3.9, 6, 3.1, true, 0.8);
  layer(6.3, 6, 3.5, false, 0.1);
  layer(6.5, 0, 0, true, 0);
  layer(8.4, 4, 2.0, true, 0.5);
  return out;
})();
/** the slots in drawing order: up the layers, back to front in each */
const SLOT_DRAW = SLOT.map((_, i) => i).sort((a, b) => SLOT[a]![2] - SLOT[b]![2] || SLOT[a]![1] - SLOT[b]![1]);

interface Moving {
  gold: boolean;
  from: W3;
  t: number;
  slot: number;
}

class Basket {
  mode: 'hand' | 'ground' | 'tip' = 'hand';
  /** the bottom centre while on the ground or tipping (world) */
  at: W3 = { x: 0, y: 0, h: 0 };
  /** a leftover offset carried from the last change of mode, dying away */
  private ofs: W3 = { x: 0, y: 0, h: 0 };
  private readonly sx = new Spring1(0);
  private readonly sy = new Spring1(0);
  private swung = false;
  readonly tilt = new Mover(0);
  /** the tipping direction on screen (−1 left, 1 right) and the bail's direction on the ground (a yaw) */
  tiltDir = 1;
  bailYaw = 0;
  gold = 0;
  red = 0;
  incoming: Moving[] = [];
  /** the bottom centre drawn last (world) */
  pos: W3 = { x: 0, y: 0, h: 0 };

  get count(): number {
    return this.gold + this.red;
  }

  /** where the next apple goes (counting those on their way in) */
  nextSlot(): number {
    return Math.min(BASKET_MAX - 1, this.count + this.incoming.length);
  }

  /** an apple's centre in slot i, for the bottom centre p (world, before any tilt) */
  slotAt(i: number, p: W3): W3 {
    const s = SLOT[Math.min(i, SLOT.length - 1)]!;
    const k = depthScale(p.y);
    return { x: p.x + s[0] * k, y: p.y + s[1] * KAPPA * k, h: p.h + s[2] * k };
  }

  /** the mouth (where a hand lets go of an apple), for the bottom centre p */
  mouth(p: W3): W3 {
    const k = depthScale(p.y);
    return { x: p.x, y: p.y, h: p.h + (BASKET.H + 3.2) * k };
  }

  /** switch how it is held, carrying on from where it was last drawn */
  setMode(m: 'hand' | 'ground' | 'tip', nominal: W3): void {
    this.ofs = { x: this.pos.x - nominal.x, y: this.pos.y - nominal.y, h: this.pos.h - nominal.h };
    this.mode = m;
    if (m !== 'hand') this.at = { ...nominal };
    this.swung = false;
  }

  /** the bottom centre now: from the hand that holds it (a little swing), or where it stands */
  update(h: number, hand: W3 | null): void {
    let p: W3;
    if (this.mode === 'hand' && hand) {
      const k = depthScale(hand.y);
      if (!this.swung) {
        this.sx.snap(hand.x);
        this.sy.snap(hand.y);
        this.swung = true;
      }
      const x = clamp(this.sx.update(h, hand.x, 9), hand.x - 2.4 * k, hand.x + 2.4 * k);
      const y = clamp(this.sy.update(h, hand.y, 9), hand.y - 1.2 * k, hand.y + 1.2 * k);
      p = { x, y, h: hand.h - (BASKET.H + BASKET.BAIL - 0.6) * k };
    } else p = { ...this.at };
    const f = Math.exp(-h / 0.12);
    this.ofs = { x: this.ofs.x * f, y: this.ofs.y * f, h: this.ofs.h * f };
    this.pos = { x: p.x + this.ofs.x, y: p.y + this.ofs.y, h: Math.max(0, p.h + this.ofs.h) };
    this.tilt.update(h);
    for (const m of this.incoming) m.t += h / 0.16;
    while (this.incoming.length && this.incoming[0]!.t >= 1) {
      const m = this.incoming.shift()!;
      if (m.gold) this.gold++;
      else this.red++;
    }
  }

  settle(): void {
    for (const m of this.incoming) {
      if (m.gold) this.gold++;
      else this.red++;
    }
    this.incoming = [];
  }

  /** the screen rotation for a tilt, and its pivot (the lip on the tipping side) */
  private rot(): { a: number; px: number; py: number } {
    const k = depthScale(this.pos.y);
    return { a: this.tilt.v * this.tiltDir, px: this.pos.x + this.tiltDir * BASKET.R * k, py: this.pos.y - this.pos.h - BASKET.H * 0.4 * k };
  }

  /** a world point carried round by the tilt (on screen; its depth kept) */
  tilted(p: W3): W3 {
    const r = this.rot();
    if (Math.abs(r.a) < 1e-4) return p;
    const sx = p.x - r.px;
    const sy = p.y - p.h - r.py;
    const c = Math.cos(r.a);
    const s = Math.sin(r.a);
    const x = r.px + sx * c - sy * s;
    const y = r.py + sx * s + sy * c;
    return { x, y: p.y, h: p.y - y };
  }

  /** the bail's top, where a hand holds it */
  bailTop(): W3 {
    const k = depthScale(this.pos.y);
    return this.tilted({ x: this.pos.x, y: this.pos.y, h: this.pos.h + (BASKET.H + BASKET.BAIL - 0.6) * k });
  }

  /** the near bottom edge (on the side away from the tip), where the other hand lifts it */
  heel(): W3 {
    const k = depthScale(this.pos.y);
    return this.tilted({ x: this.pos.x - this.tiltDir * BASKET.R0 * k, y: this.pos.y + 0.6, h: this.pos.h + 1.2 * k });
  }

  draw(ctx: CanvasRenderingContext2D, bs: BasketSprites | null, as: AppleSprites | null, hand: W3 | null): void {
    if (!bs) return;
    const p = this.pos;
    const k = depthScale(p.y);
    const sy = p.y - p.h;
    // its shadow on the grass, softer the higher it hangs
    const ha = clamp(1 - p.h / 30, 0, 1);
    if (ha > 0) {
      ctx.fillStyle = `rgba(56,52,40,${0.18 * ha})`;
      ctx.beginPath();
      ctx.ellipse(p.x + 1.5 * k, p.y + 0.3, BASKET.R * k * 1.05, BASKET.R * k * KAPPA, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const r = this.rot();
    ctx.save();
    if (Math.abs(r.a) > 1e-4) {
      ctx.translate(r.px, r.py);
      ctx.rotate(r.a);
      ctx.translate(-r.px, -r.py);
    }
    ctx.drawImage(bs.back, p.x - bs.ox * k, sy - bs.oy * k, bs.w * k, bs.h * k);
    if (as) {
      const n = Math.min(BASKET_MAX, this.count);
      const ar = APPLE_R * k;
      for (const i of SLOT_DRAW) {
        if (i >= n) continue;
        const a = this.slotAt(i, p);
        drawApple(ctx, i < this.gold ? as.gold : as.ripe[RIPE - 1]!, a.x, a.y - a.h, ar);
      }
    }
    ctx.drawImage(bs.front, p.x - bs.ox * k, sy - bs.oy * k, bs.w * k, bs.h * k);
    ctx.restore();
    // the bail: a willow hoop from either side of the rim, up to the hand (or lying back on the rim)
    const bx = Math.cos(this.bailYaw);
    const bd = Math.sin(this.bailYaw);
    const ends = [1, -1].map((s) => this.tilted({ x: p.x + s * bx * BASKET.R * k, y: p.y + s * bd * BASKET.R * KAPPA * k, h: p.h + (BASKET.H - 0.4) * k }));
    const top = hand && this.mode !== 'ground' ? this.bailTop() : { x: p.x - bd * 3 * k, y: p.y - 1.5 * k, h: p.h + (BASKET.H + 2.2) * k };
    const a = ends[0]!;
    const b = ends[1]!;
    const cx = 2 * top.x - (a.x + b.x) / 2;
    const cyS = 2 * (top.y - top.h) - (a.y - a.h + b.y - b.h) / 2;
    ctx.strokeStyle = 'rgba(122,88,50,0.95)';
    ctx.lineWidth = 0.75 * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - a.h);
    ctx.quadraticCurveTo(cx, cyS, b.x, b.y - b.h);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232,200,140,0.6)';
    ctx.lineWidth = 0.25 * k;
    ctx.stroke();
    // apples dropping in
    if (as) {
      for (const m of this.incoming) {
        const to = this.slotAt(m.slot, p);
        const u = clamp(m.t, 0, 1);
        const q = lerpW(m.from, to, u * u);
        drawApple(ctx, m.gold ? as.gold : as.ripe[RIPE - 1]!, q.x, q.y - q.h, APPLE_R * k);
      }
    }
  }
}

/* ------------------------------------------------------------------ the picker */

interface Held {
  gold: boolean;
  /** offset from the hand, dying away (it came from where it lay or hung) */
  ofs: W3;
}

class PickerImpl implements Picker {
  readonly id: PickerId;
  private readonly fig: Figure;
  private readonly basket = new Basket();
  private readonly bough: LowFruit;
  private readonly windfalls: Windfalls;
  private readonly tipped = new Tipped();
  private readonly hands: [HandPath, HandPath] = [new HandPath(), new HandPath()];
  /** the hand the basket hangs from (A's left, B's right: the side nearer us on the way to the bough) */
  private readonly carry: 0 | 1;
  private readonly pickH: 0 | 1;
  /** toward the farmer's tree (+1 for A) and the carry hand's side (+1: the figure's left) */
  private readonly dirIn: number;
  private readonly cs: number;
  private phase: Phase = 'stand';
  private t = 0;
  private sub = 0;
  private reps = 0;
  private route: Array<{ x: number; y: number }> = [];
  /** this round: golden apples to put in, free apples ripened, and how many of them are picked */
  private ownN = 0;
  private offerN = 0;
  private pickN = 0;
  private pickI = 0;
  private stance: { x: number; y: number } | null = null;
  private slot = 0;
  private held: Held[] = [];
  /** the apple taken at rest, in the free hand */
  private restApple = false;
  private bite = 0;
  /** windfalls owed by the months, and the next drop's earliest time (wall) */
  private owed = 0;
  private dropWait = 0;
  private leftover: number[] = [];
  private picking = false;
  private clock = 0;
  private sprites: { basket: BasketSprites; apples: AppleSprites } | null = null;
  private settledKey = '';
  /** a brisk walk's lead along the route (true units), and the step length in use */
  private lead: { pts: Array<{ x: number; d: number }>; L: number; s: number; v: number } | null = null;
  private stepH = STEP;
  /** how far the clock has eased toward walking time (0 working … 1 walking) */
  private walkClock = 0;
  private leadDone = false;

  constructor(id: PickerId) {
    this.id = id;
    this.dirIn = id === 'a' ? 1 : -1;
    this.carry = id === 'a' ? 0 : 1;
    this.pickH = id === 'a' ? 1 : 0;
    this.cs = this.carry === 0 ? 1 : -1;
    this.bough = new LowFruit(id);
    this.windfalls = new Windfalls(id);
    const s = this.fillAt();
    this.fig = new Figure(id, s.x, s.y, this.idleYaw(), id === 'a' ? 211 : 223);
    this.place({ activity: 'idle', basket: { own: 0, match: 0 }, offer: 0, picked: 1, planting: -1, pace: 0, monthsPerSecond: 0 });
  }

  /* ---------------------------------------------------------------- stations */

  private yawM(yaw: number): number {
    return this.id === 'a' ? yaw : Math.PI - yaw;
  }
  private fillAt(): Pt {
    return { x: FILL[this.id].x - this.dirIn * 3, y: FILL[this.id].y };
  }
  private fillYaw(): number {
    return this.yawM(Math.PI - 0.2);
  }
  private idleYaw(): number {
    return this.yawM(0.95);
  }
  /** the open crate's heap, where the apples are taken from (props.ts: the inner front crate) */
  private take(): W3 {
    return { x: this.id === 'a' ? 86 : 917, y: CRATES[this.id].y - 3, h: 13 };
  }
  /** the basket's place on the grass at rest, between the stack and the seat */
  private restSpot(): W3 {
    return { x: FILL[this.id].x + this.dirIn * 4, y: FILL[this.id].y + 8, h: 0 };
  }
  private sitYaw(): number {
    return this.yawM(0.5);
  }
  /** where the feet stand to sit on the upturned crate (the hips go back onto it) */
  private seatStand(): Pt {
    const s = SEAT[this.id];
    const yaw = this.sitYaw();
    const k = depthScale(s.y);
    const back = 24 * (64 / 122) * k;
    return { x: s.x + Math.cos(yaw) * back, y: s.y + Math.sin(yaw) * back * KAPPA };
  }
  private seatHip(): number {
    return (SEAT_H + 2) / this.fig.frame().S;
  }
  /** where to stand to pick the apple at place i, and the facing */
  private stanceFor(i: number): { x: number; y: number; yaw: number } {
    const a = this.bough.places[i]!.at;
    const x = a.x - this.dirIn * 10;
    const y = 500;
    return { x, y, yaw: Math.atan2((a.y - y) / KAPPA, a.x - x) };
  }
  /** round the bough's tip, just outside its twigs */
  private tipWay(): Pt {
    return { x: this.bough.places[0]!.at.x - this.dirIn * 12, y: 503 };
  }
  private slotPt(): Pt {
    const s = SLOTS[this.id];
    return s[clamp(this.slot, 0, s.length - 1)]!;
  }
  private slotStand(): { x: number; y: number; yaw: number } {
    const s = this.slotPt();
    // beside it on the outer side, a little in front, facing in: the basket tips out to the side at its foot, and
    // the picker stays clear of the farmer's crown even at the innermost slots (the outer neighbour, planted
    // earlier, stands a whole gap away)
    const x = s.x - this.dirIn * 12;
    const y = s.y + 5;
    return { x, y, yaw: Math.atan2((s.y + 1 - y) / KAPPA, s.x - x) };
  }

  /** a point near the figure: `a` forward, `b` to its left (true units), `h` up (world units at its depth) */
  private rel(a: number, b: number, h: number): W3 {
    const fr = this.fig.frame();
    const k = depthScale(fr.y);
    return { x: fr.x + (fr.fwd.x * a + fr.side.x * b) * k, y: fr.y + (fr.fwd.y * a + fr.side.y * b) * k, h: h * k };
  }
  private carryWalk = (): W3 => this.rel(2, this.cs * 9.5, 27);
  private carryPick = (): W3 => this.rel(4, this.cs * 8.5, 31);
  private carryFill = (): W3 => this.rel(11, this.cs * 1.5, 19);

  /* ---------------------------------------------------------------- the round */

  private next(p: Phase): void {
    this.phase = p;
    this.t = 0;
    this.sub = 0;
    this.reps = 0;
  }

  /** read the round from the intent: the basket's own share, what ripens on the bough, and what is picked */
  private startRound(it: PickerIntent): void {
    this.ownN = clamp(Math.round(it.basket.own * FULL), 0, BASKET_MAX);
    this.offerN = clamp(Math.round(it.offer * FULL), 0, NPOS);
    this.pickN = clamp(Math.round(clamp(it.picked, 0, 1) * this.offerN), 0, Math.min(this.offerN, BASKET_MAX - this.ownN));
    for (let i = 0; i < this.offerN; i++) this.bough.ripen(i, RIPEN_ROUND, true);
  }

  private setRoute(pts: Array<{ x: number; y: number }>): void {
    this.route = pts;
    this.lead = null;
    this.leadDone = false;
  }

  /** the segment of a lead's route at distance s along it, and how far into it */
  private leadSeg(ld: { pts: Array<{ x: number; d: number }> }, s: number): { a: { x: number; d: number }; b: { x: number; d: number }; u: number } {
    let s0 = s;
    let i = 1;
    for (; i < ld.pts.length - 1; i++) {
      const seg = Math.hypot(ld.pts[i]!.x - ld.pts[i - 1]!.x, ld.pts[i]!.d - ld.pts[i - 1]!.d);
      if (s0 <= seg) break;
      s0 -= seg;
    }
    const a = ld.pts[i - 1]!;
    const b = ld.pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.d - a.d) || 1;
    return { a, b, u: Math.min(1, Math.max(0, s0 / seg)) };
  }

  /** the way a lead's route runs at distance s along it */
  private leadYaw(ld: { pts: Array<{ x: number; d: number }> }, s: number): number {
    const { a, b } = this.leadSeg(ld, s);
    return Math.atan2(b.d - a.d, b.x - a.x);
  }

  /** the point at distance s along a lead's route */
  private leadAt(ld: { pts: Array<{ x: number; d: number }> }, s: number): { x: number; d: number } {
    const { a, b, u } = this.leadSeg(ld, s);
    return { x: a.x + (b.x - a.x) * u, d: a.d + (b.d - a.d) * u };
  }

  /**
   * Walk the route: a long way at a brisk pace (the gait follows a lead moving along the route, easing in and out,
   * so the strides lengthen), the last few strides and short walks as the measured walk, ending facing `finalYaw`.
   */
  private walkRoute(finalYaw: number | null): boolean {
    const f = this.fig;
    if (!this.lead && this.route.length && !f.walking) {
      const fr = f.frame();
      const raw = [{ x: fr.x, d: fr.y / KAPPA }, ...this.route.map((p) => ({ x: p.x, d: p.y / KAPPA }))];
      // round each corner into a smooth bend a stride and a half in radius, so the body turns with the way over two or
      // three steps, as a walker does (a corner turned within one step left the planted foot half a leg out to the
      // side of the new way, and the hips dropped to push off from it)
      const pts = [raw[0]!];
      for (let i = 1; i < raw.length - 1; i++) {
        const a = raw[i - 1]!;
        const p = raw[i]!;
        const c = raw[i + 1]!;
        const la = Math.hypot(p.x - a.x, p.d - a.d) || 1;
        const lc = Math.hypot(c.x - p.x, c.d - p.d) || 1;
        const r = Math.min(CORNER_R, la * 0.45, lc * 0.45);
        const pin = { x: p.x - ((p.x - a.x) / la) * r, d: p.d - ((p.d - a.d) / la) * r };
        const pout = { x: p.x + ((c.x - p.x) / lc) * r, d: p.d + ((c.d - p.d) / lc) * r };
        for (let j = 0; j <= 8; j++) {
          const u = j / 8;
          const w0 = (1 - u) * (1 - u);
          const w1 = 2 * (1 - u) * u;
          const w2 = u * u;
          pts.push({ x: w0 * pin.x + w1 * p.x + w2 * pout.x, d: w0 * pin.d + w1 * p.d + w2 * pout.d });
        }
      }
      pts.push(raw[raw.length - 1]!);
      // and smooth the whole way (corner cutting), so a short leg's bend is spread over its neighbours too
      let sm = pts;
      for (let it = 0; it < 2; it++) {
        const nx = [sm[0]!];
        for (let j = 0; j < sm.length - 1; j++) {
          const p = sm[j]!;
          const q = sm[j + 1]!;
          nx.push({ x: 0.75 * p.x + 0.25 * q.x, d: 0.75 * p.d + 0.25 * q.d }, { x: 0.25 * p.x + 0.75 * q.x, d: 0.25 * p.d + 0.75 * q.d });
        }
        nx.push(sm[sm.length - 1]!);
        sm = nx;
      }
      let L = 0;
      for (let i = 1; i < sm.length; i++) L += Math.hypot(sm[i]!.x - sm[i - 1]!.x, sm[i]!.d - sm[i - 1]!.d);
      if (L > BRISK_MIN && !this.leadDone) this.lead = { pts: sm, L, s: 0, v: 0 };
    }
    const ld = this.lead;
    if (ld) {
      const left = ld.L - ld.s;
      // the lead runs ahead at a brisk pace, slowing for the end; the last strides are handed to the ordinary walk
      // (at a landing, from the real state, as the gait is made to do), which brings the body onto the spot
      if (left > HANDOVER * depthScale(f.frame().y)) {
        // where the lead is now, and which way the route runs there
        let s0 = ld.s;
        let i = 1;
        for (; i < ld.pts.length - 1; i++) {
          const seg = Math.hypot(ld.pts[i]!.x - ld.pts[i - 1]!.x, ld.pts[i]!.d - ld.pts[i - 1]!.d);
          if (s0 <= seg) break;
          s0 -= seg;
        }
        const a = ld.pts[i - 1]!;
        const b = ld.pts[i]!;
        const seg = Math.hypot(b.x - a.x, b.d - a.d) || 1;
        const hx = (b.x - a.x) / seg;
        const hd = (b.d - a.d) / seg;
        const fr = f.frame();
        // the body faces where its next strides go (the chord to a point a little way on), not the way the route runs
        // under it this instant: it sets off already facing past a bend that comes soon after the start, and turns
        // into each bend over the steps before it rather than all in one
        const ahead = this.leadAt(ld, Math.min(ld.L, ld.s + FACE_AHEAD * depthScale(fr.y)));
        const here = this.leadAt(ld, ld.s);
        const way = Math.atan2(hd, hx);
        const chord = Math.hypot(ahead.x - here.x, ahead.d - here.d) > 1 ? Math.atan2(ahead.d - here.d, ahead.x - here.x) : way;
        // (but never more than FACE_LEAD off the way the steps go: further, and it walks crabwise, its legs spread)
        const yaw = way + clamp(wrapPi(chord - way), -FACE_LEAD, FACE_LEAD);
        if (!f.walking && Math.abs(wrapPi(yaw - f.yaw.v)) > 0.5) {
          // face the way first (a turn through the three-quarter view), then set off
          f.face(yaw);
          return false;
        }
        const k = depthScale(fr.y);
        const vMax = BRISK_V * k;
        // (easing toward the measured walk's pace by the hand-over)
        let want = Math.min(vMax, 32 * k + Math.sqrt(2 * BRISK_A * k * Math.max(0, left - HANDOVER * k)));
        // and slowing for the bends ahead, so the way never turns quicker than a walker turns (TURN_RATE), with room
        // to slow down before each: the body turns with its lead, and a lead taken round a bend at full pace swung it
        // round faster than its feet could follow
        const W = TURN_WINDOW * k;
        for (let e = 0; e <= TURN_LOOK * k; e += 6 * k) {
          const sA = Math.min(ld.L, ld.s + e);
          const turn = Math.abs(wrapPi(this.leadYaw(ld, Math.min(ld.L, sA + W / 2)) - this.leadYaw(ld, Math.max(0, sA - W / 2))));
          if (turn < 1e-3) continue;
          const vt = Math.max(TURN_VMIN * k, (TURN_RATE * W) / turn);
          want = Math.min(want, Math.sqrt(vt * vt + 2 * BRISK_A * k * e));
        }
        const h = this.stepH;
        ld.v = ld.v < want ? Math.min(want, ld.v + BRISK_A * k * h) : want;
        ld.s = Math.min(ld.L, ld.s + ld.v * h);
        const x = a.x + hx * Math.min(seg, s0);
        const d = a.d + hd * Math.min(seg, s0);
        f.follow(x, d * KAPPA, hx * ld.v, hd * ld.v * KAPPA, Math.atan2(hd, hx), yaw);
        return false;
      }
      // there: any last adjustment and the facing as an ordinary walk
      this.lead = null;
      this.route = this.route.slice(-1);
      this.leadDone = true;
    }
    while (this.route.length > 1) {
      if (f.goTo(this.route[0]!, null, 8)) this.route.shift();
      else return false;
    }
    const last = this.route[0];
    if (!last) return true;
    return f.goTo(last, finalYaw, 2.5);
  }

  private holdCarry(key: string, to: () => W3, dur = 0.5): void {
    this.hands[this.carry].go(key, to, dur);
  }

  private freeHand(): void {
    this.fig.hold(this.pickH, null, 0, 0.4);
  }

  update(dtSec: number, it: PickerIntent, tSec: number, reduced: boolean): void {
    void tSec;
    if (reduced) {
      this.place(it);
      return;
    }
    const wall = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    if (it.activity === 'work' && it.pace <= 0) {
      // paused: the picker holds where it is (after a scrub, reaching up into the bough); only what is already in the
      // air comes down
      this.fruit(wall, 0, it);
      return;
    }
    this.settledKey = '';
    // the picker's clock: brisk at 1x, in proportion to the playback speed (normal pace to finish a round when paused)
    // (walking: the phases that go somewhere, and any steps the body is taking; eased, so time never jumps)
    const walkingNow = this.fig.walking || this.phase === 'toFill' || this.phase === 'toBough' || this.phase === 'toSlot' || this.phase === 'toSeat';
    this.walkClock += ((walkingNow ? 1 : 0) - this.walkClock) * (1 - Math.exp(-wall / WALK_EASE));
    const own = CREW_TIME + (WALK_TIME - CREW_TIME) * this.walkClock;
    const rate = it.pace > 0 ? own * (it.pace / PACE_1X) : own;
    const dt = Math.min(wall * rate, 0.6);
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    for (let i = 0; i < n; i++) this.step(dt / n, it);
    this.fig.finish();
    this.basket.update(0, this.fig.hand(this.carry));
    this.fruit(wall, dt, it);
  }

  /** the bough, the windfalls and the tipped apples: the months' drops on the wall clock */
  private fruit(wall: number, crew: number, it: PickerIntent): void {
    this.clock += wall;
    this.bough.update(crew, wall);
    const mps = Math.max(0, it.monthsPerSecond);
    const life = mps > 0 ? Math.max(LIFE_MONTHS / mps, LIFE_MIN_S) : Infinity;
    this.windfalls.update(wall, mps > 0 ? 1 / life : 0);
    this.tipped.update(wall, TIPPED_LIFE);
    const target = it.activity === 'work' ? this.heapFor(it) : 0;
    const keep = this.keepN(it);
    // the free fruit on offer hangs on the bough whenever nobody is picking it (the low-hanging fruit)
    if (!this.picking) {
      const off = clamp(Math.round(it.offer * FULL), 0, NPOS);
      for (let i = 0; i < off; i++) if (!this.bough.has(i)) this.bough.ripen(i, REGROW_S, false);
    }
    if (target > 0 && mps > 0) this.owed = Math.min(2, this.owed + (wall * target) / life);
    else if (target === 0) this.owed = Math.min(this.owed, 0);
    this.dropWait -= wall;
    // the leftover of a round drops first, apple by apple, as the picker turns away
    if (this.leftover.length && this.dropWait <= 0) {
      const i = this.leftover.shift()!;
      if (this.bough.has(i) && this.bough.growth(i) > 0.5) {
        this.windfalls.drop(this.bough.apple(i));
        this.bough.take(i);
        this.owed = Math.max(-3, this.owed - 1);
        this.dropWait = 0.32;
      }
      return;
    }
    if (this.picking || this.owed < 0.6 || this.dropWait > 0) return;
    // then the months: a ripe one beyond the picker's share drops; if none hangs, one starts to swell
    let growing = false;
    for (let i = keep; i < NPOS; i++) {
      if (!this.bough.has(i)) continue;
      if (this.bough.growth(i) >= 1) {
        if (this.owed >= 1) {
          this.windfalls.drop(this.bough.apple(i));
          this.bough.take(i);
          this.owed -= 1;
          this.dropWait = 0.25;
        }
        return;
      }
      growing = true;
    }
    if (!growing) {
      const free: number[] = [];
      for (let i = keep; i < NPOS; i++) if (!this.bough.has(i)) free.push(i);
      if (free.length) this.bough.ripen(free[Math.floor((this.clock * 7.3) % free.length)]!, 1.3, false);
    }
  }

  /** the windfalls lying at steady state for an intent */
  private heapFor(it: PickerIntent): number {
    return clamp(Math.round(Math.max(0, it.offer) * (1 - clamp(it.picked, 0, 1)) * FULL * HEAP_K), 0, HEAP_MAX);
  }
  /** the places the picker will pick this round (the months' drops leave them alone) */
  private keepN(it: PickerIntent): number {
    const off = clamp(Math.round(it.offer * FULL), 0, NPOS);
    return clamp(Math.round(clamp(it.picked, 0, 1) * off), 0, NPOS);
  }

  private step(h: number, it: PickerIntent): void {
    const f = this.fig;
    const B = this.basket;
    this.stepH = h;
    f.begin();
    this.t += h;
    const working = it.activity === 'work' && it.pace > 0;
    const rest = it.activity === 'rest';
    const loaded = B.count + B.incoming.length + this.held.length > 0;
    // done with the time: finish what is in the basket, then rest
    if (rest && !loaded && ['stand', 'toFill', 'toBough', 'pick'].includes(this.phase) && !(this.phase === 'pick' && this.held.length)) {
      this.picking = false;
      this.setRoute([this.fillAt()]);
      this.next('toFill');
      this.sub = 1;
    }
    if (!rest && ['restTake', 'restDown', 'toSeat', 'sit'].includes(this.phase)) this.next(this.phase === 'sit' ? 'rise' : 'takeUp');
    switch (this.phase) {
      case 'stand': {
        // stand easy at the crates, the basket on the arm; a new round when there is work
        f.crouchT = 0;
        f.leanT = 0;
        f.tipT = 0;
        this.freeHand();
        this.holdCarry('walk', this.carryWalk);
        const s = this.fillAt();
        f.goTo(s, working ? this.fillYaw() : this.idleYaw(), 2.5);
        if (working) {
          this.startRound(it);
          if (this.ownN > 0) this.next('fill');
          else if (this.pickN > 0) this.goBough();
        }
        break;
      }
      case 'toFill': {
        f.crouchT = 0;
        f.leanT = 0;
        this.freeHand();
        this.holdCarry('walk', this.carryWalk);
        // (sub 1: heading to rest)
        const there = this.walkRoute(this.sub === 1 ? this.fillYaw() : working ? this.fillYaw() : this.idleYaw());
        if (!there) break;
        if (this.sub === 1 || rest) this.next('restTake');
        else this.next('stand');
        break;
      }
      case 'fill': {
        // squat by the open crate, the basket held low; a handful from the crate into the basket, until the share is in
        const s = this.fillAt();
        if (!f.goTo(s, this.fillYaw(), 2.5)) break;
        f.crouchT = 0.72;
        f.leanT = 0.5;
        this.holdCarry('fill', this.carryFill, 0.55);
        const hp = this.hands[this.pickH];
        const left = this.ownN - B.gold - B.incoming.length - this.held.length;
        if (this.sub === 0) {
          // settle into the squat
          if (this.t > 0.4) {
            this.sub = left > 0 ? 1 : 3;
            this.t = 0;
          }
        } else if (this.sub === 1) {
          // reach into the crate
          hp.go(`crate${this.reps}`, () => this.take(), 0.38, 2);
          f.hold(this.pickH, hp.cur, 1, 0.3);
          if (this.t > 0.42) {
            const nh = Math.min(left, this.reps % 2 ? 3 : 4);
            const hd = f.hand(this.pickH);
            const tk = this.take();
            for (let j = 0; j < nh; j++) this.held.push({ gold: true, ofs: { x: tk.x - hd.x + (j - 1) * 1.2, y: tk.y - hd.y, h: tk.h - hd.h } });
            this.sub = 2;
            this.t = 0;
          }
        } else if (this.sub === 2) {
          // into the basket's mouth
          hp.go(`basket${this.reps}`, () => B.mouth(B.pos), 0.36, 3);
          f.hold(this.pickH, hp.cur, 1, 0.3);
          if (this.t > 0.4) {
            this.release();
            this.reps++;
            this.t = 0;
            this.sub = this.ownN - B.gold - B.incoming.length > 0 ? 1 : 3;
          }
        } else {
          // up again, the basket back on the arm
          this.freeHand();
          f.crouchT = 0;
          f.leanT = 0;
          this.holdCarry('walk', this.carryWalk, 0.5);
          if (this.t > 0.4) {
            if (this.pickN > 0) this.goBough();
            else this.goSlot(it);
          }
        }
        break;
      }
      case 'toBough': {
        f.crouchT = 0;
        f.leanT = 0;
        this.freeHand();
        this.holdCarry('walk', this.carryWalk);
        const st = this.stanceFor(0);
        if (this.walkRoute(st.yaw)) {
          this.stance = { x: st.x, y: st.y };
          this.pickN = Math.min(this.pickN, clamp(Math.round(clamp(it.picked, 0, 1) * this.offerN), 0, this.offerN));
          this.pickI = 0;
          this.next('pick');
          this.picking = true;
        }
        break;
      }
      case 'pick': {
        this.pickStep(h, it);
        break;
      }
      case 'toSlot': {
        f.crouchT = 0;
        f.leanT = 0;
        f.tipT = 0;
        this.freeHand();
        this.holdCarry('walk', this.carryWalk);
        // (the slot was read as the walk began: chasing each newer tree on the way would zig-zag)
        const s = this.slotStand();
        if (this.walkRoute(s.yaw)) this.next('tip');
        break;
      }
      case 'tip': {
        this.tipStep();
        break;
      }
      case 'restTake': {
        // an apple from the crate for later, then the basket set down
        const s = this.fillAt();
        if (!f.goTo(s, this.fillYaw(), 2.5)) break;
        f.crouchT = 0.72;
        f.leanT = 0.5;
        this.holdCarry('fill', this.carryFill, 0.55);
        const hp = this.hands[this.pickH];
        if (this.sub === 0) {
          hp.go('restCrate', () => this.take(), 0.5, 2);
          f.hold(this.pickH, hp.cur, 1, 0.3);
          if (this.t > 0.6) {
            const hd = f.hand(this.pickH);
            const tk = this.take();
            this.held = [{ gold: true, ofs: { x: tk.x - hd.x, y: tk.y - hd.y, h: tk.h - hd.h } }];
            this.sub = 1;
            this.t = 0;
          }
        } else {
          hp.go('restHold', () => this.rel(8, -this.cs * 5, 30), 0.5);
          f.hold(this.pickH, hp.cur, 1, 0.3);
          if (this.t > 0.5) {
            this.restApple = true;
            this.next('restDown');
          }
        }
        break;
      }
      case 'restDown': {
        // the basket lowered onto the grass, the bail let go
        const spot = this.restSpot();
        const k = depthScale(spot.y);
        f.crouchT = 0.6;
        f.leanT = 0.4;
        this.hands[this.pickH].go('restHold', () => this.rel(8, -this.cs * 5, 26), 0.4);
        f.hold(this.pickH, this.hands[this.pickH].cur, 1, 0.3);
        if (this.sub === 0) {
          this.holdCarry('down', () => ({ x: spot.x, y: spot.y, h: (BASKET.H + BASKET.BAIL - 0.6) * k }), 0.7);
          if (this.t > 0.75) {
            B.bailYaw = this.fig.yaw.v;
            B.setMode('ground', spot);
            this.sub = 1;
            this.t = 0;
          }
        } else {
          f.hold(this.carry, null, 0, 0.4);
          if (this.t > 0.45) {
            f.crouchT = 0;
            f.leanT = 0;
            const s = this.seatStand();
            const w = SEAT[this.id];
            this.setRoute([{ x: w.x - this.dirIn * 12, y: w.y + 12 }, s]);
            this.next('toSeat');
          }
        }
        break;
      }
      case 'toSeat': {
        f.crouchT = 0;
        f.leanT = 0;
        f.hold(this.carry, null, 0, 0.4);
        this.hands[this.pickH].go('restWalk', () => this.rel(7, -this.cs * 5, 30), 0.5);
        f.hold(this.pickH, this.hands[this.pickH].cur, 1, 0.3);
        if (this.walkRoute(this.sitYaw())) this.next('sit');
        break;
      }
      case 'sit': {
        f.seatHip = this.seatHip();
        f.sit(true, 1.4);
        f.lookT = { pitch: -0.38, yaw: this.yawM(-0.75) - this.sitYaw() };
        // the apple on the knee; now and then a bite
        this.bite += h;
        const cycle = 7.5;
        const ph = this.bite % cycle;
        const up = ph > 5.6 && ph < 6.9;
        const fr = f.frame();
        const k = depthScale(fr.y);
        // (the frame is at the feet; the hips sit back on the crate, the knee between)
        this.hands[this.pickH].go(up ? 'mouth' : 'knee', () => (up ? this.rel(-6, -this.cs * 1.5, SEAT_H / k + 35) : this.rel(-2, -this.cs * 4.5, SEAT_H / k + 12)), 0.55);
        f.hold(this.pickH, this.hands[this.pickH].cur, 1, 0.4);
        if (up) f.lookT = { pitch: 0.15, yaw: 0 };
        break;
      }
      case 'rise': {
        f.lookT = null;
        f.sit(false, 1.2);
        if (f.seat.v < 0.01 && !f.seat.moving) {
          this.setRoute([{ x: this.restSpot().x + this.dirIn * 6, y: this.restSpot().y + 6 }]);
          this.next('takeUp');
        }
        break;
      }
      case 'takeUp': {
        // back to the basket and up with it (the apple goes in)
        if (this.restApple && this.held.length && B.mode === 'ground') {
          this.hands[this.pickH].go('inBasket', () => B.mouth(B.pos), 0.5);
          f.hold(this.pickH, this.hands[this.pickH].cur, 1, 0.3);
        }
        if (B.mode === 'ground') {
          const spot = this.restSpot();
          const st = { x: spot.x + this.dirIn * 9, y: spot.y - 1 };
          if (!f.goTo(st, Math.atan2((spot.y - st.y) / KAPPA, spot.x - st.x), 2.5)) break;
          f.crouchT = 0.6;
          f.leanT = 0.4;
          if (this.held.length && this.t > 0.6) {
            this.release();
            this.restApple = false;
          }
          f.hold(this.carry, this.hands[this.carry].cur, 1, 0.35);
          this.hands[this.carry].go('bail', () => B.bailTop(), 0.6);
          if (this.t > 1.0) {
            B.setMode('hand', B.at);
            B.settle();
            B.gold = 0;
            B.red = 0;
            this.t = 0;
          }
          break;
        }
        this.freeHand();
        f.crouchT = 0;
        f.leanT = 0;
        this.holdCarry('walk', this.carryWalk, 0.6);
        if (this.t > 0.5) {
          this.setRoute([this.fillAt()]);
          this.next('toFill');
        }
        break;
      }
    }
    // the hands follow their paths; the carry hand always has the basket (unless it is on the grass)
    for (const i of [0, 1] as const) this.hands[i].step(h);
    if (B.mode !== 'ground') f.hold(this.carry, this.hands[this.carry].cur, 1, 0.4);
    else if (this.phase !== 'takeUp') this.hands[this.carry].snap(f.hand(this.carry));
    if (this.phase === 'pick' || this.phase === 'fill' || this.phase === 'restTake' || this.phase === 'restDown' || this.phase === 'toSeat' || this.phase === 'sit' || this.phase === 'takeUp') {
      if (f.wHold[this.pickH].target > 0) f.hold(this.pickH, this.hands[this.pickH].cur, 1, 0.3);
    } else if (this.phase !== 'tip') this.hands[this.pickH].snap(f.hand(this.pickH));
    if (B.mode === 'hand') B.bailYaw = f.yaw.v;
    f.step(h);
    // the basket and the apples held carry on with the hands
    B.update(h, f.hand(this.carry));
    const fd = Math.exp(-h / 0.12);
    for (const a of this.held) a.ofs = { x: a.ofs.x * fd, y: a.ofs.y * fd, h: a.ofs.h * fd };
  }

  /** what the free hand holds goes into the basket */
  private release(): void {
    const B = this.basket;
    const hd = this.fig.hand(this.pickH);
    for (const a of this.held) {
      if (B.count + B.incoming.length >= BASKET_MAX) continue;
      B.incoming.push({ gold: a.gold, from: { x: hd.x + a.ofs.x, y: hd.y + a.ofs.y, h: hd.h + a.ofs.h - 1 }, t: 0, slot: B.nextSlot() });
    }
    this.held = [];
  }

  private goBough(): void {
    const st = this.stanceFor(0);
    this.setRoute([{ x: st.x, y: st.y }]);
    this.next('toBough');
  }

  private goSlot(it: PickerIntent): void {
    this.slot = it.planting < 0 ? 0 : it.planting;
    const s = this.slotStand();
    const fr = this.fig.frame();
    this.setRoute([]);
    // round the bough's tip (never under its twigs) when coming from it
    const tw = this.tipWay();
    if ((fr.x - tw.x) * this.dirIn > 2 && fr.y > 490) this.route.push(tw);
    this.route.push({ x: s.x, y: s.y });
    this.next('toSlot');
  }

  /** one apple after another: reach, twist, down into the basket; a step along the bough when the next is out of reach */
  private pickStep(h: number, it: PickerIntent): void {
    void h;
    const f = this.fig;
    const B = this.basket;
    const hp = this.hands[this.pickH];
    this.holdCarry('pick', this.carryPick, 0.5);
    if (this.pickI >= this.pickN && this.held.length === 0) {
      // turning away: what is left on the branch begins to drop
      this.picking = false;
      f.tipT = 0;
      f.leanT = 0;
      this.freeHand();
      if (this.t > 0.2) {
        this.leftover = [];
        for (let i = this.pickN; i < NPOS; i++) if (this.bough.has(i)) this.leftover.push(i);
        this.goSlot(it);
      }
      return;
    }
    const i = this.pickI;
    const st = this.stanceFor(i);
    if (this.sub === 0) {
      // the next apple: step along the bough if it is out of reach from here
      this.freeHand();
      f.tipT = 0;
      if (this.stance && Math.abs(st.x - this.stance.x) > 7) this.stance = { x: st.x, y: st.y };
      const s = this.stance ?? st;
      if (!f.goTo(s, st.yaw, 2)) return;
      if (this.bough.growth(i) < 0.92) return;
      this.sub = 1;
      this.t = 0;
    } else if (this.sub === 1) {
      // reach up to it
      const a = this.bough.apple(i);
      f.tipT = a.h > 58 ? 0.22 : 0.06;
      f.leanT = 0.12;
      hp.go(`apple${i}`, () => this.bough.apple(i), 0.4, 2);
      f.hold(this.pickH, hp.cur, 1, 0.3);
      if (this.t > 0.45) {
        this.sub = 2;
        this.t = 0;
      }
    } else if (this.sub === 2) {
      // a twist and a lift, and it comes away in the hand
      const a = this.bough.apple(i);
      const w = this.t / 0.2;
      hp.go(`twist${i}`, () => ({ x: a.x + 0.7 * Math.sin(w * 6), y: a.y, h: a.h + 0.8 * Math.sin(w * Math.PI) }), 0.08);
      f.hold(this.pickH, hp.cur, 1, 0.3);
      if (this.t > 0.2) {
        const hd = f.hand(this.pickH);
        this.held = [{ gold: false, ofs: { x: a.x - hd.x, y: a.y - hd.y, h: a.h - hd.h } }];
        this.bough.take(i);
        this.sub = 3;
        this.t = 0;
      }
    } else if (this.sub === 3) {
      // down into the basket
      f.tipT = 0;
      f.leanT = 0.05;
      hp.go(`down${i}`, () => B.mouth(B.pos), 0.38, 2.5);
      f.hold(this.pickH, hp.cur, 1, 0.3);
      if (this.t > 0.42) {
        this.release();
        this.pickI++;
        this.sub = this.pickI < this.pickN && Math.abs(this.stanceFor(this.pickI).x - (this.stance?.x ?? 0)) <= 7 && this.bough.growth(this.pickI) >= 0.92 ? 1 : 0;
        this.t = 0;
      }
    }
  }

  /** squat at the slot, both hands to the basket, tip it out toward the tree's foot, and up again */
  private tipStep(): void {
    const f = this.fig;
    const B = this.basket;
    const s = this.slotStand();
    const foot = this.slotPt();
    const k = depthScale(s.y);
    const other = this.hands[this.pickH];
    const spot = (): W3 => {
      const p = this.rel(9, 0, 1.5);
      return { ...p, h: 1.5 * k };
    };
    f.face(s.yaw);
    if (this.sub === 0) {
      // down: the basket lowered in front, the other hand to its heel
      f.crouchT = 0.72;
      f.leanT = 0.5;
      B.tiltDir = Math.cos(f.yaw.v) >= 0 ? 1 : -1;
      this.holdCarry('tipLow', () => {
        const p = spot();
        return { x: p.x, y: p.y, h: p.h + (BASKET.H + BASKET.BAIL - 0.6) * k };
      }, 0.55);
      other.go('heel', () => B.heel(), 0.55, 2);
      f.hold(this.pickH, other.cur, 1, 0.3);
      if (this.t > 0.62) {
        B.setMode('tip', { ...B.pos });
        B.tilt.go(1.25, 0.65);
        this.sub = 1;
        this.t = 0;
        this.reps = 0;
      }
    } else if (this.sub === 1) {
      // tipping: the hands go round with the basket, the apples pour out from the top down
      this.holdCarry('tipBail', () => B.bailTop(), 0.2);
      other.go('tipHeel', () => B.heel(), 0.2);
      f.hold(this.pickH, other.cur, 1, 0.35);
      const n = B.count + B.incoming.length;
      if (B.incoming.length) B.settle();
      const want = Math.floor(clamp((B.tilt.v - 0.4) / 0.75, 0, 1) * (n + this.reps) + 1e-6);
      while (this.reps < want && B.count > 0) {
        const idx = B.count - 1;
        const at = B.tilted(B.slotAt(idx, B.pos));
        const gold = idx < B.gold;
        if (gold) B.gold--;
        else B.red--;
        this.tipped.pour(at, { x: foot.x + this.dirIn * 2, y: foot.y + 2 }, gold, -this.dirIn);
        this.reps++;
      }
      if (!B.tilt.moving && this.t > 0.85) {
        // anything left slides out
        while (B.count > 0) {
          const idx = B.count - 1;
          const at = B.tilted(B.slotAt(idx, B.pos));
          const gold = idx < B.gold;
          if (gold) B.gold--;
          else B.red--;
          this.tipped.pour(at, { x: foot.x + this.dirIn * 2, y: foot.y + 2 }, gold, -this.dirIn);
        }
        B.tilt.go(0, 0.4);
        this.sub = 2;
        this.t = 0;
      }
    } else if (this.sub === 2) {
      this.holdCarry('tipBail2', () => B.bailTop(), 0.2);
      other.go('tipHeel2', () => B.heel(), 0.2);
      f.hold(this.pickH, other.cur, 1, 0.35);
      if (!B.tilt.moving) {
        B.setMode('hand', B.pos);
        this.sub = 3;
        this.t = 0;
      }
    } else {
      // up again, the empty basket on the arm, and back to the crates by the path
      this.freeHand();
      f.crouchT = 0;
      f.leanT = 0;
      this.holdCarry('walk', this.carryWalk, 0.5);
      if (this.t > 0.45) {
        const fr = f.frame();
        const way = { x: this.id === 'a' ? Math.max(fr.x, 150) : Math.min(fr.x, 850), y: 522 };
        this.setRoute([way, this.fillAt()]);
        this.next('toFill');
      }
    }
  }

  /* ---------------------------------------------------------------- the settled state */

  place(it: PickerIntent): void {
    const key = `${it.activity}|${it.basket.own.toFixed(3)}|${it.basket.match.toFixed(3)}|${it.offer.toFixed(3)}|${it.picked.toFixed(3)}|${it.planting}`;
    if (key === this.settledKey) return;
    this.settledKey = key;
    const f = this.fig;
    const B = this.basket;
    this.held = [];
    this.leftover = [];
    this.picking = false;
    this.owed = 0;
    this.tipped.clear();
    B.incoming = [];
    B.tilt.snap(0);
    this.setRoute([]);
    f.lookT = null;
    this.restApple = false;
    this.ownN = clamp(Math.round(it.basket.own * FULL), 0, BASKET_MAX);
    this.offerN = clamp(Math.round(it.offer * FULL), 0, NPOS);
    this.pickN = clamp(Math.round(clamp(it.picked, 0, 1) * this.offerN), 0, Math.min(this.offerN, BASKET_MAX - this.ownN));
    const keep = this.pickN;
    if (it.activity === 'rest') {
      // (what was left on the branch in the last year still lies there: the clock has stopped)
      this.bough.set((i) => i < this.offerN);
      const nr = this.heapFor(it);
      this.windfalls.settle(nr, (j) => this.bough.places[keep + ((j * 5) % Math.max(1, NPOS - keep))]!.at);
      const s = this.seatStand();
      const k = depthScale(s.y);
      f.seatHip = (SEAT_H + 2) / (k * (64 / 122));
      const yaw = this.sitYaw();
      const fx = Math.cos(yaw);
      const fy = Math.sin(yaw) * KAPPA;
      const sx = -Math.sin(yaw);
      const sy = Math.cos(yaw) * KAPPA;
      const knee = { x: s.x + (fx * -2 - sx * this.cs * 4.5) * k, y: s.y + (fy * -2 - sy * this.cs * 4.5) * k, h: SEAT_H + 12 * k };
      const hands: [W3 | null, W3 | null] = [null, null];
      hands[this.pickH] = knee;
      f.placeAt(s.x, s.y, yaw, { seat: true, hands });
      f.lookT = { pitch: -0.38, yaw: this.yawM(-0.75) - yaw };
      this.hands[this.pickH].snap(knee, 'knee');
      this.hands[this.carry].snap(f.hand(this.carry));
      B.gold = 0;
      B.red = 0;
      B.bailYaw = yaw;
      B.mode = 'ground';
      B.at = this.restSpot();
      B.pos = { ...B.at };
      B.setMode('ground', B.at);
      this.held = [{ gold: true, ofs: { x: 0, y: 0, h: 0 } }];
      this.restApple = true;
      this.next('sit');
      return;
    }
    if (it.activity === 'work' && this.ownN + this.pickN > 0) {
      // at the bough, part way through the picking: the basket holds the golden share and the red apples picked so
      // far, the rest of the offer hangs ripe, and the picker is reaching up for the next one
      const done = this.pickN > 0 ? Math.min(this.pickN - 1, Math.floor(this.pickN / 2)) : 0;
      this.bough.set((i) => i >= done && i < this.offerN);
      const n = this.heapFor(it);
      const left = Math.max(1, NPOS - keep);
      this.windfalls.settle(n, (j) => this.bough.places[keep + ((j * 5) % left)]!.at);
      const st = this.stanceFor(done);
      B.gold = this.ownN;
      B.red = done;
      this.placeWith(st.x, st.y, st.yaw, (fr) => this.relAt(fr, 4, this.cs * 8.5, 31));
      this.stance = { x: st.x, y: st.y };
      this.pickI = done;
      this.next('pick');
      this.picking = this.pickN > 0;
      if (this.pickN > 0) {
        const a = this.bough.apple(done);
        const hands: [W3 | null, W3 | null] = [null, null];
        hands[this.carry] = this.hands[this.carry].cur;
        hands[this.pickH] = a;
        f.placeAt(st.x, st.y, st.yaw, { hands, lean: 0.12 });
        this.hands[this.pickH].snap(a, `apple${done}`);
        B.update(0, f.hand(this.carry));
        B.setMode('hand', B.pos);
        this.sub = 1;
        this.t = 0.45;
      } else this.t = 0.21;
      return;
    }
    // idle (or nothing to do): at the crates, the empty basket on the arm; the offer hangs on the bough
    this.bough.set((i) => i < this.offerN);
    this.windfalls.settle(it.activity === 'work' ? this.heapFor(it) : 0, (j) => this.bough.places[keep + ((j * 5) % Math.max(1, NPOS - keep))]!.at);
    B.gold = 0;
    B.red = 0;
    const s = this.fillAt();
    this.placeWith(s.x, s.y, this.idleYaw(), (fr) => this.relAt(fr, 2, this.cs * 9.5, 27));
    this.next('stand');
  }

  private relAt(fr: { x: number; y: number; yaw: number }, a: number, b: number, h: number): W3 {
    const k = depthScale(fr.y);
    const fx = Math.cos(fr.yaw);
    const fy = Math.sin(fr.yaw) * KAPPA;
    const sx = -Math.sin(fr.yaw);
    const sy = Math.cos(fr.yaw) * KAPPA;
    return { x: fr.x + (fx * a + sx * b) * k, y: fr.y + (fy * a + sy * b) * k, h: h * k };
  }

  /** stand at (x, y) facing yaw with the basket held at a point, everything settled */
  private placeWith(x: number, y: number, yaw: number, hold: (fr: { x: number; y: number; yaw: number }) => W3): void {
    const f = this.fig;
    const B = this.basket;
    const p = hold({ x, y, yaw });
    const hands: [W3 | null, W3 | null] = [null, null];
    hands[this.carry] = p;
    f.placeAt(x, y, yaw, { hands });
    this.hands[this.carry].snap(p, '');
    this.hands[this.pickH].snap(f.hand(this.pickH));
    B.mode = 'hand';
    B.bailYaw = yaw;
    B.pos = { x: 0, y: 0, h: 0 };
    B.update(0, f.hand(this.carry));
    B.setMode('hand', B.pos);
  }

  /* ---------------------------------------------------------------- painting */

  async prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void> {
    const q = Math.min(3, Math.max(1, pxPerUnit * 1.7));
    const set = await buildPickerSet(this.id, Math.round(q * 4) / 4, tick, check);
    if (!set || !check()) return;
    this.fig.sprites(set);
    this.sprites = { apples: appleSprites(pxPerUnit * 1.5), basket: basketSprites(this.id, pxPerUnit * 1.5) };
  }

  items(): Item[] {
    const out: Item[] = [];
    const f = this.fig;
    const B = this.basket;
    const spr = () => this.sprites?.apples ?? null;
    const fr = f.frame();
    const hand = f.hand(this.carry);
    const basketItem = (g: CanvasRenderingContext2D) => B.draw(g, this.sprites?.basket ?? null, spr(), B.mode === 'ground' ? null : hand);
    const heldDraw = (g: CanvasRenderingContext2D) => {
      const as = spr();
      if (!as || !this.held.length) return;
      const hd = f.hand(this.pickH);
      const k = depthScale(hd.y);
      this.held.forEach((a, j) => {
        const dx = (j - (this.held.length - 1) / 2) * 1.6 * k;
        drawApple(g, a.gold ? as.gold : as.ripe[RIPE - 1]!, hd.x + a.ofs.x + dx, hd.y - hd.h - a.ofs.h + a.ofs.y - 0.4 * k, APPLE_R * k);
      });
    };
    const heldBehind = this.held.length > 0 && f.hand(this.pickH).y < fr.y - 1.5;
    if (B.mode === 'ground') out.push({ depth: B.pos.y, draw: basketItem });
    out.push({
      depth: fr.y,
      draw: (g) => {
        const behind = B.mode !== 'ground' && B.pos.y < fr.y;
        if (behind) basketItem(g);
        if (heldBehind) heldDraw(g);
        f.drawShadow(g);
        f.drawCached(g);
        if (B.mode !== 'ground' && !behind) basketItem(g);
        if (!heldBehind) heldDraw(g);
      },
    });
    out.push(this.bough.item(spr));
    this.windfalls.items(spr, out);
    this.tipped.items(spr, out);
    return out;
  }

  feet(): Pt {
    const p = this.fig.feet();
    return { x: p.x, y: p.y };
  }

  debug(): object {
    const p = this.fig.feet();
    return {
      phase: this.phase,
      sub: this.sub,
      t: +this.t.toFixed(2),
      x: +p.x.toFixed(1),
      y: +p.y.toFixed(1),
      yaw: +wrapPi(this.fig.yaw.v).toFixed(2),
      basket: { mode: this.basket.mode, gold: this.basket.gold, red: this.basket.red, in: this.basket.incoming.length },
      held: this.held.length,
      own: this.ownN,
      offer: this.offerN,
      pick: this.pickN,
      slot: this.slot,
      windfalls: this.windfalls.list.length,
      falling: this.windfalls.falling,
      tipped: this.tipped.list.length,
      owed: +this.owed.toFixed(2),
      reachErr: +this.fig.reachErr.toFixed(2),
      lead: this.lead ? [+this.lead.s.toFixed(1), +this.lead.L.toFixed(1), +this.lead.v.toFixed(1)] : this.leadDone,
      walking: this.fig.walking,
    };
  }
}

export const createPicker: CreatePicker = (id: PickerId): Picker => new PickerImpl(id);
