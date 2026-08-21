/**
 * Inventory Renderer — 4x4 grid inventory panel (Canvas 2D overlay)
 *
 * Toggled with [I]. Shows all 16 slots from State.inventory.
 * Hover highlights a slot; clicking a slot selects it; clicking again uses it.
 * Item info (name, description) renders in a sidebar for the hovered/selected slot.
 *
 * Extends BaseRenderer (no own RAF loop).
 */

import { BaseRenderer } from './render/base-renderer';
import type { Item } from '../types';

export class InventoryRenderer extends BaseRenderer {
  visible = false;
  private hoveredSlot = -1;
  private selectedSlot = -1;

  // Data provider — main.ts wires this to State
  getSlots?: () => Array<{ item: string | null; count: number }>;
  getItem?: (id: string) => Item | undefined;
  onUseItem?: (itemId: string) => void;
  onToggle?: (visible: boolean) => void;

  // Mouse
  private mouseX = 0;
  private mouseY = 0;
  private boundMouseMove = this.onMouseMove.bind(this);
  private boundClick = this.onClick.bind(this);

  toggle(): void {
    this.visible = !this.visible;
    this.selectedSlot = -1;
    if (this.visible) {
      window.addEventListener('mousemove', this.boundMouseMove);
      window.addEventListener('click', this.boundClick);
    } else {
      window.removeEventListener('mousemove', this.boundMouseMove);
      window.removeEventListener('click', this.boundClick);
    }
    this.onToggle?.(this.visible);
  }

  show(): void {
    if (this.visible) return;
    this.toggle();
  }

  hide(): void {
    if (!this.visible) return;
    this.toggle();
  }

  // ===== Geometry =====

  private gridArea() {
    const W = this.canvas?.width ?? 1280;
    const H = this.canvas?.height ?? 720;
    const cell = 72;
    const gap = 8;
    const gridW = 4 * cell + 3 * gap;
    const gridH = 4 * cell + 3 * gap;
    const x = W / 2 - gridW / 2;
    const y = H / 2 - gridH / 2 - 20;
    return { cell, gap, gridW, gridH, x, y };
  }

  private slotAt(mx: number, my: number): number {
    const g = this.gridArea();
    const col = Math.floor((mx - g.x) / (g.cell + g.gap));
    const row = Math.floor((my - g.y) / (g.cell + g.gap));
    if (col < 0 || col > 3 || row < 0 || row > 3) return -1;
    // Check the slot actually contains the point (not the gap)
    const sx = g.x + col * (g.cell + g.gap);
    const sy = g.y + row * (g.cell + g.gap);
    if (mx > sx + g.cell || my > sy + g.cell) return -1;
    return row * 4 + col;
  }

  // ===== BaseRenderer contract =====

  protected onUpdate(): void {
    // Hover tracking
    if (!this.visible || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mx = (this.mouseX - rect.left) * scaleX;
    const my = (this.mouseY - rect.top) * scaleY;
    this.hoveredSlot = this.slotAt(mx, my);
  }

  protected onRender(): void {
    if (!this.visible || !this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Backdrop
    ctx.fillStyle = 'rgba(10, 10, 25, 0.92)';
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎒 INVENTORY', W / 2, 80);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('Click an item to use it • Press [I] to close', W / 2, 104);

    // Grid
    const g = this.gridArea();
    const slots = this.getSlots?.() ?? [];

    for (let i = 0; i < 16; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const sx = g.x + col * (g.cell + g.gap);
      const sy = g.y + row * (g.cell + g.gap);

      const isHovered = i === this.hoveredSlot;
      const isSelected = i === this.selectedSlot;

      // Slot background
      ctx.fillStyle = isSelected ? '#3a3a5e' : isHovered ? '#2e2e4e' : '#22223a';
      ctx.fillRect(sx, sy, g.cell, g.cell);
      ctx.strokeStyle = isSelected ? '#ffd700' : isHovered ? '#8888cc' : '#3a3a5e';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.strokeRect(sx, sy, g.cell, g.cell);

      const slot = slots[i];
      if (slot?.item) {
        const item = this.getItem?.(slot.item);
        // Emoji (first token of item name)
        const emoji = item?.name?.split(' ')[0] ?? '❓';
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(emoji, sx + g.cell / 2, sy + g.cell / 2 + 10);

        // Count badge
        if (slot.count > 1) {
          ctx.fillStyle = '#ffd700';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`x${slot.count}`, sx + g.cell - 6, sy + g.cell - 8);
        }
      }
    }

    // Info sidebar for hovered/selected slot
    const infoSlot = this.selectedSlot >= 0 ? this.selectedSlot : this.hoveredSlot;
    const slot = slots[infoSlot];
    if (slot?.item) {
      const item = this.getItem?.(slot.item);
      if (item) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.name, W / 2, g.y + g.gridH + 50);
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#bbb';
        this.wrapText(ctx, item.desc, W / 2, g.y + g.gridH + 74, 500, 18);
      }
    }
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }

  protected onDestroy(): void {
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('click', this.boundClick);
    this.visible = false;
  }

  // ===== Mouse handlers =====

  private onMouseMove(e: MouseEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  private onClick(e: MouseEvent): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const slotIndex = this.slotAt(mx, my);
    if (slotIndex === -1) return;

    const slots = this.getSlots?.() ?? [];
    const slot = slots[slotIndex];
    if (slot?.item) {
      this.selectedSlot = slotIndex;
      this.onUseItem?.(slot.item);
    }
  }
}
