/**
 * Base Renderer — Abstract base class for all renderers
 * 
 * Enforces the init/update/dispose contract. No renderer may start its own RAF loop.
 */

export abstract class BaseRenderer {
  protected canvas: HTMLCanvasElement | null = null;
  protected ctx: CanvasRenderingContext2D | null = null;
  private initialized = false;
  
  // Dimensions (set by subclasses after init)
  get width(): number { return this.canvas?.width ?? 0; }
  get height(): number { return this.canvas?.height ?? 0; }
  
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
    
    // Canvas dimensions should match CSS display size for sharp rendering
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
    this.initialized = false;
  }
  
  /** Check if the renderer is ready for update/render calls. */
  get isReady(): boolean {
    return this.initialized && !!this.ctx;
  }
}
