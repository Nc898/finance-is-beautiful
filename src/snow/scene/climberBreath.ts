/**
 * The climber's breath in the cold: now and then a soft cool puff leaves the mouth, swells, drifts up and away on
 * the air and fades. Puffs live in the world (they stay where they were breathed out), fade in from nothing and
 * out to nothing (never popping), and are drawn from one pre-painted soft sprite.
 */
import { clamp, sstep } from '../../vine/scene/gardenerMath';

interface Puff {
  born: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  seed: number;
}

let puffSprite: HTMLCanvasElement | null = null;
function sprite(): HTMLCanvasElement {
  if (puffSprite) return puffSprite;
  const N = 96;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const c = cv.getContext('2d')!;
  // a few overlapping soft blobs, so a puff is a little cloud and not a disc
  const blob = (x: number, y: number, r: number, a: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(226,234,246,${a})`);
    g.addColorStop(0.55, `rgba(214,225,241,${a * 0.5})`);
    g.addColorStop(1, 'rgba(206,218,238,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, N, N);
  };
  blob(48, 48, 30, 0.9);
  blob(34, 52, 20, 0.6);
  blob(60, 42, 21, 0.6);
  blob(50, 62, 17, 0.45);
  puffSprite = cv;
  return cv;
}

export class BreathMist {
  private puffs: Puff[] = [];
  private nextAt = 2.4;
  private n = 0;
  private burst = 0;
  private burstAt = 0;
  private lastClock = 0;

  reset(): void {
    this.puffs.length = 0;
    this.nextAt = this.lastClock + 1.5;
    this.burst = 0;
  }

  /**
   * `mouth` is where the breath leaves (world), `effort` 0..1 quickens it, `seated` slows it. A breath is a
   * short run of two or three small puffs a moment apart, as one exhales.
   */
  update(dt: number, clock: number, mouth: { x: number; y: number }, effort: number, seated: boolean): void {
    this.lastClock = clock;
    if (clock >= this.nextAt && this.burst === 0) {
      this.burst = 3;
      this.burstAt = clock;
      const base = seated ? 5.4 : 4.4;
      this.nextAt = clock + base - 2.6 * clamp(effort, 0, 1) + 1.2 * Math.sin(this.n * 2.31 + 0.7);
    }
    if (this.burst > 0 && clock >= this.burstAt) {
      this.n++;
      const k = 3 - this.burst;
      const jitter = Math.sin(this.n * 12.9898) * 0.5;
      this.puffs.push({
        born: clock,
        x: mouth.x + jitter,
        y: mouth.y,
        vx: 4 + 3 * Math.sin(this.n * 7.1) + 3 * effort,
        vy: -7 - 2 * k - 2 * Math.sin(this.n * 3.7),
        size: 4.2 + 1.3 * k + 1.1 * effort,
        life: 1.7 + 0.5 * k,
        seed: this.n,
      });
      this.burst--;
      this.burstAt = clock + 0.16;
    }
    // drift on the air
    for (const p of this.puffs) {
      const age = clock - p.born;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 0.9);
      p.vy *= Math.exp(-dt * 0.55);
      void age;
    }
    this.puffs = this.puffs.filter((p) => clock - p.born < p.life);
    this.now = clock;
  }

  private now = 0;

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.puffs.length === 0) return;
    const s = sprite();
    ctx.save();
    for (const p of this.puffs) {
      const u = (this.now - p.born) / p.life;
      if (u < 0 || u >= 1) continue;
      // in from nothing, then away to nothing
      const a = 0.42 * sstep(u / 0.16) * (1 - sstep((u - 0.3) / 0.7));
      if (a < 0.004) continue;
      const r = p.size * (0.55 + 1.15 * Math.sqrt(u));
      ctx.globalAlpha = a;
      ctx.drawImage(s, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
