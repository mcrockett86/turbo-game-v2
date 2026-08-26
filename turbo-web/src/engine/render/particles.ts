/**
 * engine/render/particles.ts — lightweight, allocation-light particle layer.
 *
 * An object-pooled particle system shared by the TP renderer (ambient zone
 * effects, pickup bursts) and threat feedback (success/fail flash). It is
 * deliberately dependency-free and bounded: at most ~40 live particles, no
 * per-frame allocations in the hot path (dead particles are recycled).
 *
 * Particles are drawn in *screen* coordinates by the renderer each frame.
 */

export interface Particle {
  active: boolean;
  x: number;      // screen px
  y: number;      // screen px
  vx: number;     // px/sec
  vy: number;
  size: number;   // px radius
  color: string;
  age: number;    // seconds
  life: number;   // seconds
  shape: 'circle' | 'petal' | 'ripple' | 'glint';
  gravity: number; // px/sec^2
  spin: number;    // rad/sec (petals)
}

const MAX_PARTICLES = 40;

export class ParticleSystem {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, size: 2,
        color: '#fff', age: 0, life: 1, shape: 'circle', gravity: 0, spin: 0,
      });
    }
  }

  get liveCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  private acquire(): Particle {
    // Ring-buffer reuse: prefer the next slot, falling back to the oldest.
    for (let i = 0; i < this.pool.length; i++) {
      const idx = (this.cursor + i) % this.pool.length;
      if (!this.pool[idx].active) { this.cursor = (idx + 1) % this.pool.length; return this.pool[idx]; }
    }
    // All active — recycle the slot at the cursor (oldest in steady state).
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  spawn(opts: {
    x: number; y: number; vx?: number; vy?: number; size?: number; color: string;
    life?: number; shape?: Particle['shape']; gravity?: number; spin?: number;
  }): void {
    const p = this.acquire();
    p.active = true;
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0;
    p.size = opts.size ?? 2; p.color = opts.color;
    p.age = 0; p.life = opts.life ?? 1;
    p.shape = opts.shape ?? 'circle';
    p.gravity = opts.gravity ?? 0;
    p.spin = opts.spin ?? 0;
  }

  /** Advance all live particles. No allocation. */
  update(delta: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += delta;
      if (p.age >= p.life) { p.active = false; continue; }
      p.vy += p.gravity * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
    }
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  /** Draw all live particles. `time` (ms) is used for ripple expansion + glint pulse. */
  draw(ctx: CanvasRenderingContext2D, time: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      const k = p.age / p.life; // 0..1
      const alpha = 1 - k;
      ctx.globalAlpha = alpha * 0.9;
      switch (p.shape) {
        case 'ripple': {
          const r = p.size + k * p.size * 3;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'glint': {
          const pulse = 0.6 + 0.4 * Math.sin(time / 120 + p.x);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * pulse, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'petal': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.age * p.spin);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        default: {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Explosion of N particles from a point (pickup burst). */
  burst(x: number, y: number, color: string, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 60 + Math.random() * 80;
      this.spawn({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        size: 2 + Math.random() * 2,
        color: i % 2 === 0 ? color : '#ffffff',
        life: 0.4 + Math.random() * 0.2,
        gravity: 140,
      });
    }
  }
}
