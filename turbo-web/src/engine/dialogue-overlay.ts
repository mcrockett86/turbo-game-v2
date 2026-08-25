/**
 * Dialogue Overlay — shows a companion's line in a speech bubble when you
 * meet (or re-greet) them. Triggered by a bark + a line from the companion's
 * dialogue list. Auto-dismisses after a few seconds or on keypress.
 */

interface DialogueState {
  name: string;
  line: string;
  color: string;
  accentColor: string;
  startedAt: number;
  duration: number;
}

export class DialogueOverlay {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // CSS-pixel display size of the shared canvas (backing store is dpr-scaled
  // by BaseRenderer.resizeToDisplay, so divide by the effective dpr).
  private cssDims(): { w: number; h: number } {
    if (!this.canvas) return { w: 0, h: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr };
  }

  private state: DialogueState | null = null;
  private boundKey = this.onKey.bind(this);
  private boundClick = this.onClick.bind(this);
  private boundVisible: (() => boolean) | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** If another overlay (companion/hint/inventory panel) is open, skip this one. */
  setVisibilityCheck(fn: () => boolean): void {
    this.boundVisible = fn;
  }

  /** Show a companion's line. Resets the timer. */
  show(name: string, line: string, color: string, accentColor: string, duration = 6000): void {
    if (this.boundVisible && this.boundVisible()) return; // don't draw over a panel
    this.state = { name, line, color, accentColor, startedAt: performance.now(), duration };
    window.addEventListener('keydown', this.boundKey);
    window.addEventListener('mousedown', this.boundClick);
  }

  hide(): void {
    this.state = null;
    window.removeEventListener('keydown', this.boundKey);
    window.removeEventListener('mousedown', this.boundClick);
  }

  get active(): boolean {
    return !!this.state;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'e') {
      this.hide();
      e.preventDefault();
    }
  }

  private onClick(): void {
    this.hide();
  }

  /** Call every frame; draws the bubble if active and within duration. */
  render(): void {
    if (!this.state || !this.ctx || !this.canvas) return;
    const now = performance.now();
    const elapsed = now - this.state.startedAt;
    if (elapsed > this.state.duration) {
      this.hide();
      return;
    }
    const ctx = this.ctx;
    const { w: W, h: H } = this.cssDims();

    // Fade in for the first 200ms, fade out over the last 400ms
    let alpha = 1;
    if (elapsed < 200) alpha = elapsed / 200;
    else if (elapsed > this.state.duration - 400) alpha = (this.state.duration - elapsed) / 400;
    ctx.save();
    ctx.globalAlpha = alpha;

    const { name, line, color, accentColor } = this.state;
    const bubbleW = Math.min(680, W * 0.8);
    const bubbleH = 132;
    const bx = (W - bubbleW) / 2;
    const by = H - bubbleH - 90; // sit above the bottom hint row

    // Backdrop dim
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);

    // Bubble
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by, bubbleW, bubbleH, 18);
    ctx.fill();
    ctx.stroke();

    // Tail
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 16, by + bubbleH);
    ctx.lineTo(W / 2 + 16, by + bubbleH);
    ctx.lineTo(W / 2, by + bubbleH + 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Name tag
    ctx.fillStyle = color;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🐕 ${name}`, bx + 20, by + 26);

    // "said"
    ctx.fillStyle = '#888';
    ctx.font = 'italic 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('— says —', bx + bubbleW - 20, by + 26);

    // Dialogue line (wrap to max 2 lines)
    ctx.fillStyle = '#222';
    ctx.font = '16px Georgia, serif';
    ctx.textAlign = 'center';
    const wrapped = wrapText(ctx, `“${line}”`, bubbleW - 60);
    wrapped.slice(0, 2).forEach((l, i) => {
      ctx.fillText(l, W / 2, by + 68 + i * 24);
    });

    // Dismiss hint
    ctx.fillStyle = '#999';
    ctx.font = '11px sans-serif';
    ctx.fillText('[click / E / Esc to dismiss]', W / 2, by + bubbleH - 12);

    ctx.restore();
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
