/**
 * Companion Panel — toggleable overlay showing the active companion and the
 * list of companions met so far. Toggle with [C].
 *
 * Clicking a met companion in the panel activates them (main.ts handles the
 * click via `handleClick` returning the companion id).
 */

import type { CompanionId } from '@/types';
import { COMPANIONS } from '@/data';

interface CompanionSnapshot {
  companionsMet: Set<CompanionId>;
  activeCompanion: CompanionId | null;
}

interface CompanionRow {
  id: CompanionId;
  name: string;
  breed: string;
  trait: string;
  active: boolean;
  rect: { x: number; y: number; w: number; h: number };
}

export class CompanionPanel {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rows: CompanionRow[] = [];
  private visible = false;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  toggle(snapshot?: CompanionSnapshot): void {
    this.visible = !this.visible;
    if (this.visible) this.render(snapshot);
    else this.clear();
  }

  show(snapshot?: CompanionSnapshot): void {
    this.visible = true;
    this.render(snapshot);
  }

  hide(): void {
    this.visible = false;
    this.clear();
  }

  /** Re-render the panel (call after state changes while visible). */
  refresh(snapshot?: CompanionSnapshot): void {
    if (this.visible) this.render(snapshot);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Hit-test a canvas-space click. Returns the companion id if a row was hit. */
  handleClick(canvasX: number, canvasY: number): CompanionId | null {
    if (!this.visible) return null;
    for (const row of this.rows) {
      const { x, y, w, h } = row.rect;
      if (canvasX >= x && canvasX <= x + w && canvasY >= y && canvasY <= y + h) {
        return row.id;
      }
    }
    return null;
  }

  private clear(): void {
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
    this.rows = [];
  }

  private render(snapshot?: CompanionSnapshot): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    const companionsMet = snapshot?.companionsMet ?? new Set();
    const active = snapshot?.activeCompanion ?? null;

    const panelW = Math.min(520, W * 0.6);
    const headerH = 52;
    const rowH = 54;
    const list = Array.from(companionsMet);
    const listH = list.length === 0 ? 70 : list.length * rowH;
    const panelH = headerH + listH + 40;
    const px = (W - panelW) / 2;
    const py = (H - panelH) / 2;

    // Backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    // Panel
    ctx.fillStyle = '#1a1f2e';
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    roundRect(ctx, px, py, panelW, panelH, 14);
    ctx.fill();
    ctx.stroke();

    // Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐕 Companions', px + 24, py + headerH / 2);

    // Close hint
    ctx.fillStyle = '#8888aa';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('[C] close', px + panelW - 20, py + headerH / 2);

    let ry = py + headerH + 8;
    if (list.length === 0) {
      ctx.fillStyle = '#9999bb';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No companions met yet.\nExplore the dog park and shelter!', W / 2, ry + 35);
      this.rows = [];
      return;
    }

    this.rows = [];
    for (const id of list) {
      const companion = COMPANIONS[id];
      if (!companion) { ry += rowH; continue; }
      const isActive = active === id;

      const row = {
        id,
        name: companion.name,
        breed: companion.breed,
        trait: companion.trait,
        active: isActive,
        rect: { x: px + 12, y: ry, w: panelW - 24, h: rowH - 8 },
      };

      // Row background
      ctx.fillStyle = isActive ? 'rgba(74,158,255,0.22)' : 'rgba(255,255,255,0.04)';
      roundRect(ctx, row.rect.x, row.rect.y, row.rect.w, row.rect.h, 8);
      ctx.fill();
      if (isActive) {
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Name + label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${row.name} — ${companion.breed}`, row.rect.x + 14, row.rect.y + row.rect.h / 2 - 8);

      // Trait
      ctx.fillStyle = isActive ? '#8fd0ff' : '#9999bb';
      ctx.font = '13px sans-serif';
      ctx.fillText(row.trait, row.rect.x + 14, row.rect.y + row.rect.h / 2 + 12);

      // Active badge
      if (isActive) {
        ctx.fillStyle = '#4a9eff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('● ACTIVE', row.rect.x + row.rect.w - 14, row.rect.y + row.rect.h / 2);
      }

      this.rows.push(row);
      ry += rowH;
    }
  }
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
