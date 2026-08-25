/**
 * Base Renderer — Abstract base class for all renderers
 * 
 * Enforces the init/update/dispose contract. No renderer may start its own RAF loop.
 */

export abstract class BaseRenderer {
  protected canvas: HTMLCanvasElement | null = null;
  protected ctx: CanvasRenderingContext2D | null = null;
  private initialized = false;

  // CSS-pixel display size (backing store is cssW * dpr on HiDPI screens).
  // Drawing code should use these for layout math so it works in CSS pixels
  // regardless of the device pixel ratio. `width`/`height` (the raw backing
  // store) are kept for anything that genuinely needs device pixels.
  private cssW = 0;
  private cssH = 0;

  get width(): number { return this.canvas?.width ?? 0; }
  get height(): number { return this.canvas?.height ?? 0; }
  /** Live CSS-pixel display width, derived from the canvas's actual geometry.
   *  Reading live (not a stale cache) keeps every renderer — zone, threat,
   *  inventory, panels — agreeing on the visible size regardless of init
   *  order or devicePixelRatio, so overlays always center on the real canvas. */
  get cssWidth(): number {
    if (this.canvas) {
      const w = this.canvas.clientWidth || this.canvas.getBoundingClientRect().width;
      if (w > 0) return Math.round(w);
    }
    return this.cssW;
  }
  get cssHeight(): number {
    if (this.canvas) {
      const h = this.canvas.clientHeight || this.canvas.getBoundingClientRect().height;
      if (h > 0) return Math.round(h);
    }
    return this.cssH;
  }

  /**
   * Size the canvas backing store to its CSS display size * devicePixelRatio
   * (capped at 2x for perf) and set the ctx transform so all drawing code
   * continues to use CSS pixels unchanged. Call on init and on resize.
   */
  resizeToDisplay(): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 1));
    const cssH = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 1));
    this.cssW = cssW;
    this.cssH = cssH;

    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  
  /**
   * Initialize with a canvas element and optional zone/room data.
   * Must be called before any update/render calls.
   */
  init(canvas: HTMLCanvasElement, data?: unknown): void {
    if (this.initialized) {
      console.warn(`[${this.constructor.name}] Already initialized, disposing first`);
      this.dispose();
    }
    
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`[${this.constructor.name}] Failed to get 2D context from canvas`);
    this.ctx = ctx;

    // Match the backing store to the display size (HiDPI-aware) and set the
    // CSS-pixel transform before the subclass lays anything out.
    this.resizeToDisplay();

    if (canvas.width === 0 || canvas.height === 0) {
      console.error(`[${this.constructor.name}] Canvas has zero dimensions: ${canvas.width}x${canvas.height}`);
    }
    
    this.onInit(data);
    this.initialized = true;
  }
  
  /**
   * Called once per frame by the unified game loop.
   * @param delta Seconds since last frame (capped at 1/30 to prevent spiral of death)
   * @param time Current timestamp in milliseconds
   */
  update(delta: number, time: number): void {
    if (!this.initialized || !this.ctx) return;
    
    // Cap delta to prevent huge jumps after tab-switching
    const cappedDelta = Math.min(delta, 1 / 30);
    
    this.onUpdate(cappedDelta, time);
    if (this.initialized && this.ctx) {
      this.onRender();
    }
  }
  
  /**
   * Render the current state to the canvas.
   * Called internally by update(). Subclasses override render() directly if needed.
   */
  protected abstract onRender(): void;
  
  /** Called during init(data) for subclasses to set up their state. */
  protected onInit(_data?: unknown): void {}
  
  /** Called every frame before rendering. Override in subclasses. */
  protected onUpdate(_delta: number, _time: number): void {}
  
  /** Clean up resources. Called by dispose() and re-init(). */
  protected onDestroy(): void {}
  
  /**
   * Dispose of all resources. Safe to call multiple times.
   * After this, the renderer must be re-initialized with init().
   */
  dispose(): void {
    if (!this.initialized) return;
    
    this.onDestroy();
    this.canvas = null;
    this.ctx = null;
    this.cssW = 0;
    this.cssH = 0;
    this.initialized = false;
  }
  
  /** Check if the renderer is ready for update/render calls. */
  get isReady(): boolean {
    return this.initialized && !!this.ctx;
  }
}
