/**
 * Dialogue Overlay — shows a companion's line in a speech bubble when you
 * meet (or re-greet) them. Triggered by a bark + a line from the companion's
 * dialogue list. Auto-dismisses after a few seconds or on keypress.
 */

import { isOnboarded } from './onboarding';

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
    // Compact bubble: sized to the text (capped), sitting low so it never
    // covers the play area. The old version was a fixed 680x132 slab that
    // dimmed the WHOLE canvas, which hid the scene behind every line.
    const bubbleW = Math.min(520, Math.max(260, W * 0.46));
    const textW = bubbleW - 44;
    const wrapped = wrapText(ctx, `“${line}”`, textW);
    const shown = wrapped.slice(0, 3);
    const lineH = 20;
    const headH = 22;
    const footH = 16;
    const bubbleH = headH + shown.length * lineH + footH + 16;
    const bx = (W - bubbleW) / 2;
    // Clear the bottom hint rows (and the first-run onboarding bar when shown).
    const clearance = isOnboarded() ? 46 : 112;
    const by = Math.max(70, H - bubbleH - clearance);

    // Local backdrop: a soft shadow only behind the bubble, NOT a full-screen
    // dim — the player keeps sight of the scene while a companion talks.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx + 3, by + 4, bubbleW, bubbleH, 16);
    ctx.fill();

    // Bubble
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by, bubbleW, bubbleH, 16);
    ctx.fill();
    ctx.stroke();

    // Tail
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 12, by + bubbleH);
    ctx.lineTo(W / 2 + 12, by + bubbleH);
    ctx.lineTo(W / 2, by + bubbleH + 13);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Name tag + dismiss hint on one header row (keeps the box short)
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🐕 ${name}`, bx + 16, by + headH / 2 + 6);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('click / E / Esc', bx + bubbleW - 16, by + headH / 2 + 6);

    // Dialogue line
    ctx.fillStyle = '#222';
    ctx.font = '14px Georgia, serif';
    ctx.textAlign = 'center';
    shown.forEach((l, i) => {
      ctx.fillText(l, W / 2, by + headH + 12 + i * lineH);
    });

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
