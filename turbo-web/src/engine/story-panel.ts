/**
 * Story Journal Panel — the "meaningful connections" surface (Sprint 8.4).
 *
 * Toggle with [J]. Lists the thread of the journey so far:
 *   places crossed · dangers out-witted · friends made · tokens found · clues read
 *
 * Data comes from `GameStateData.storyLog` (appended idempotently by State),
 * so this panel is a pure renderer — no game logic lives here.
 */

import type { StoryEntry, StoryEntryKind } from '@/types';

const KIND_ORDER: StoryEntryKind[] = ['zone', 'threat', 'companion', 'item', 'hint'];

const KIND_LABELS: Record<StoryEntryKind, string> = {
  zone: '🌍 Places crossed',
  threat: '⚔️ Dangers out-witted',
  companion: '🐾 Friends made',
  item: '🎒 Tokens found',
  hint: '📜 Clues read',
};

/** Max entries drawn per group before collapsing into "+N earlier". */
const MAX_PER_GROUP = 4;

export class StoryPanel {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private visible = false;
  private entries: StoryEntry[] = [];

  private cssDims(): { w: number; h: number } {
    if (!this.canvas) return { w: 0, h: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr };
  }

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  toggle(entries: StoryEntry[]): void {
    this.entries = entries;
    this.visible = !this.visible;
    if (this.visible) this.render();
    else this.clear();
  }

  hide(): void {
    this.visible = false;
    this.clear();
  }

  /** Re-render with fresh entries while visible (main loop keeps it current). */
  refresh(entries: StoryEntry[]): void {
    this.entries = entries;
    if (this.visible) this.render();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Test hook: the currently displayed entry count. */
  get entryCount(): number {
    return this.entries.length;
  }

  private clear(): void {
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
  }

  private render(): void {
    if (!this.ctx || !this.canvas) return;
    const { w: W, h: H } = this.cssDims();
    const ctx = this.ctx;

    // Dim the world behind the journal
    ctx.fillStyle = 'rgba(8, 10, 16, 0.88)';
    ctx.fillRect(0, 0, W, H);

    const pw = Math.min(W * 0.72, 560);
    const ph = Math.min(H * 0.8, 520);
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;

    // Panel body
    ctx.fillStyle = 'rgba(24, 28, 40, 0.97)';
    ctx.strokeStyle = 'rgba(212, 175, 32, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    (ctx as any).roundRect
      ? (ctx as any).roundRect(px, py, pw, ph, 14)
      : ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📖 Journey Journal', W / 2, py + 26);
    ctx.strokeStyle = 'rgba(212, 175, 32, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 44);
    ctx.lineTo(px + pw - 16, py + 44);
    ctx.stroke();

    const total = this.entries.length;
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#9aa4b8';
    ctx.fillText(
      total === 0
        ? 'The story begins when you start walking home.'
        : `${total} moment${total === 1 ? '' : 's'} so far — press J to close, Esc to close.`,
      W / 2,
      py + 60,
    );

    // Grouped entries
    let y = py + 84;
    const left = px + 18;
    const right = px + pw - 18;
    let budget = ph - (y - py) - 14;

    for (const kind of KIND_ORDER) {
      const group = this.entries
        .filter(e => e.kind === kind)
        .sort((a, b) => a.order - b.order);
      if (group.length === 0) continue;

      const headerH = 22;
      const visibleCount = Math.min(group.length, MAX_PER_GROUP);
      const blockH = headerH + visibleCount * 20 + (group.length > MAX_PER_GROUP ? 16 : 0);
      if (blockH > budget) break; // no room — later groups collapse entirely
      budget -= blockH + 6;

      ctx.textAlign = 'left';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#d4af2e';
      ctx.fillText(KIND_LABELS[kind], left, y);
      y += headerH;

      ctx.font = '12px sans-serif';
      for (const e of group.slice(0, visibleCount)) {
        if (y > py + ph - 14) break;
        ctx.fillStyle = '#e8ecf5';
        const title = `${e.icon} ${e.title}`;
        const detail = e.detail
          ? `  — ${truncate(e.detail, Math.floor((right - left) / 6))}`
          : '';
        ctx.fillText(truncate(title + detail, Math.floor((right - left) / 6.2)), left + 10, y);
        y += 20;
      }

      if (group.length > MAX_PER_GROUP) {
        ctx.fillStyle = '#8a93a8';
        ctx.font = 'italic 11px sans-serif';
        ctx.fillText(`+ ${group.length - MAX_PER_GROUP} earlier…`, left + 10, y);
        y += 16;
      }
      y += 6;
    }
  }
}

/** Truncate to n chars with an ellipsis marker (no per-frame cost beyond the call). */
function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…';
}
