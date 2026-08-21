/**
 * Transitions — animated canvas overlay for zone changes (fade in/out, wipe).
 *
 * Usage:
 *   const t = new Transitions();
 *   t.init(canvas);
 *   t.fade(() => { /* enter new zone *\/, 400);  // fade out → callback → fade in
 *
 * The main loop should call `t.update(delta)` each frame while a transition
 * is active, then keep calling until `t.active` is false.
 */

export type TransitionKind = 'fade' | 'wipe';

interface FadeState {
  kind: TransitionKind;
  phase: 'out' | 'in';
  progress: number; // 0 → 1
  duration: number; // ms
  onComplete: (() => void) | null;
}

export class Transitions {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private state: FadeState | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  get active(): boolean {
    return this.state !== null;
  }

  /**
   * Fade out to black, run `onMidpoint`, then fade back in.
   * If `onMidpoint` is null, just do a quick fade pulse.
   */
  fade(onMidpoint?: (() => void) | null, durationMs = 350): void {
    if (this.state) return; // ignore if already transitioning
    this.state = {
      kind: 'fade',
      phase: 'out',
      progress: 0,
      duration: durationMs,
      onComplete: onMidpoint ?? null,
    };
  }

  /** Update the transition. Call each frame from the main loop. */
  update(deltaMs: number): void {
    if (!this.state) return;
    this.state.progress += deltaMs / this.state.duration;

    if (this.state.progress >= 1) {
      if (this.state.phase === 'out') {
        // Run the midpoint callback (e.g. swap zone)
        this.state.onComplete?.();
        // Switch to fade-in phase
        this.state = { ...this.state, phase: 'in', progress: 0 };
      } else {
        // Fade-in complete
        this.state = null;
      }
    }

    this.render();
  }

  /** Force-clear any in-progress transition (e.g. on game over). */
  cancel(): void {
    this.state = null;
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
  }

  private render(): void {
    if (!this.ctx || !this.canvas || !this.state) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Alpha: fade-out goes 0→1, fade-in goes 1→0
    const alpha = this.state.phase === 'out'
      ? this.state.progress
      : 1 - this.state.progress;

    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}
