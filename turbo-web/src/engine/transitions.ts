/**
 * Transitions — animated canvas overlay for zone changes.
 *
 * Supported kinds:
 *   fade   — classic fade to black and back (default)
 *   wipe   — a band sweeps across the screen, swapping the zone mid-sweep
 *   zoom   — circular iris closes to a point then opens on the new zone
 *   slide  — two bands close from opposite edges, swap, then open
 *
 * Usage:
 *   const t = new Transitions();
 *   t.init(canvas);
 *   t.play('wipe', () => { /* swap zone *\/ }, 500);
 *
 * The transition is self-driven via requestAnimationFrame. The midpoint
 * callback (`onMidpoint`) runs exactly once, at the halfway point — this
 * is where the caller swaps the zone/renderer. The second half animates
 * over the new scene.
 *
 * All transitions are pure overlays drawn on top of the current canvas
 * contents; they do not modify the scene graph.
 */

export type TransitionKind = 'fade' | 'wipe' | 'zoom' | 'slide';

export interface TransitionOptions {
  /** Direction for wipe/slide. Defaults to 'right'. */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** Zoom pivot point (0–1 normalized). Defaults to center. */
  zoomPoint?: { x: number; y: number };
  /** Color of the overlay. Defaults to black. */
  color?: string;
  /**
   * Sprint 8.4: optional caption drawn centered while the overlay mostly
   * covers the screen (first-visit zone flavor banner). Pure text — no assets.
   */
  caption?: string;
}

interface TransitionState {
  kind: TransitionKind;
  phase: 'out' | 'in';
  progress: number; // 0 → 1 within the current phase
  duration: number; // ms per phase
  onComplete: (() => void) | null;
  options: TransitionOptions;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class Transitions {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // CSS-pixel display size of the shared canvas (backing store is dpr-scaled
  // by BaseRenderer.resizeToDisplay, so divide by the effective dpr).
  private cssDims(): { w: number; h: number } {
    if (!this.canvas) return { w: 0, h: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr };
  }

  private state: TransitionState | null = null;
  private rafId: number | null = null;
  private lastTs: number = 0;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  get active(): boolean {
    return this.state !== null;
  }

  get currentKind(): TransitionKind | null {
    return this.state?.kind ?? null;
  }

  /** Start a transition. Ignored if one is already active. */
  play(kind: TransitionKind, onMidpoint?: (() => void) | null, durationMs = 500, options: TransitionOptions = {}): void {
    if (this.state) return;
    this.state = {
      kind,
      phase: 'out',
      progress: 0,
      duration: durationMs,
      onComplete: onMidpoint ?? null,
      options,
    };
    this.lastTs = 0;
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.tick);
  }

  /** Backwards-compatible fade shortcut. */
  fade(onMidpoint?: (() => void) | null, durationMs = 350): void {
    this.play('fade', onMidpoint, durationMs);
  }

  /** Legacy no-op — animation is self-driven via RAF. */
  update(_deltaMs: number): void {}

  /** Force-clear any in-progress transition (e.g. on game over). */
  cancel(): void {
    this.state = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
    this.lastTs = 0;
  }

  private tick = (ts: number): void => {
    if (!this.state) {
      this.rafId = null;
      return;
    }
    const deltaMs = this.lastTs ? ts - this.lastTs : 16;
    this.lastTs = ts;

    this.state.progress += deltaMs / this.state.duration;
    if (this.state.progress >= 1) {
      if (this.state.phase === 'out') {
        this.state.onComplete?.();
        this.state = { ...this.state, phase: 'in', progress: 0 };
      } else {
        this.state = null;
      }
    }

    this.render();
    if (this.state) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.rafId = null;
      this.lastTs = 0;
    }
  };

  private render(): void {
    if (!this.ctx || !this.canvas || !this.state) return;
    const ctx = this.ctx;
    const { w: W, h: H } = this.cssDims();
    const p = ease(Math.min(1, this.state.progress));
    const cover = this.state.phase === 'out' ? p : 1 - p;
    const color = this.state.options.color ?? '#000000';

    ctx.clearRect(0, 0, W, H);
    switch (this.state.kind) {
      case 'fade': this.renderFade(cover, color); break;
      case 'wipe': this.renderWipe(cover, color); break;
      case 'zoom': this.renderZoom(cover); break;
      case 'slide': this.renderSlide(cover, color); break;
    }

    // Sprint 8.4: zone-flavor caption banner (visible while mostly covered)
    const caption = this.state.options.caption;
    if (caption && cover > 0.4) {
      const alpha = Math.min(1, (cover - 0.4) / 0.3);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(caption, W / 2, H / 2);
      ctx.fillStyle = '#ffd700';
      ctx.fillText(caption, W / 2, H / 2);
      ctx.globalAlpha = 1;
    }
  }

  private renderFade(cover: number, color: string): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.fillStyle = this.rgba(color, cover);
    this.ctx.fillRect(0, 0, this.cssDims().w, this.cssDims().h);
  }

  private renderWipe(cover: number, color: string): void {
    if (!this.ctx || !this.canvas) return;
    const { w: W, h: H } = this.cssDims();
    const ctx = this.ctx;
    const dir = this.state?.options.direction ?? 'right';
    const half = Math.ceil(W * cover / 2);
    ctx.fillStyle = this.rgba(color, 1);
    if (dir === 'left' || dir === 'right') {
      ctx.fillRect(dir === 'right' ? 0 : W - half, 0, half, H);
    } else {
      ctx.fillRect(0, dir === 'down' ? 0 : H - half, W, half);
    }
  }

  private renderZoom(cover: number): void {
    if (!this.ctx || !this.canvas) return;
    const { w: W, h: H } = this.cssDims();
    const ctx = this.ctx;
    const pt = this.state?.options.zoomPoint ?? { x: 0.5, y: 0.5 };
    const cx = pt.x * W, cy = pt.y * H;
    const r = Math.hypot(W, H) * 0.75 * cover;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill('evenodd');
    ctx.restore();
  }

  private renderSlide(cover: number, color: string): void {
    if (!this.ctx || !this.canvas) return;
    const { w: W, h: H } = this.cssDims();
    const ctx = this.ctx;
    const dir = this.state?.options.direction ?? 'right';
    const band = Math.ceil(W * cover / 2);
    ctx.fillStyle = this.rgba(color, 1);
    if (dir === 'left' || dir === 'right') {
      ctx.fillRect(0, 0, band, H);
      ctx.fillRect(W - band, 0, band, H);
    } else {
      ctx.fillRect(0, 0, W, band);
      ctx.fillRect(0, H - band, W, band);
    }
  }

  private rgba(hex: string, alpha: number): string {
    let r = 0, g = 0, b = 0;
    if (hex.startsWith('#')) {
      const h = hex.slice(1);
      if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
      } else if (h.length >= 6) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
      }
    }
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }
}
