/**
 * HUD Renderer — Top-of-screen game state overlay
 *
 * Shows:
 * - Current zone name (top-center)
 * - Item count + active companion (top-right)
 * - Status panel (lower-left): happiness, items, companions, threats, route, clues
 * - Panel hints (bottom-left)
 *
 * Pure presentational — reads from providers wired by main.ts.
 * Extends BaseRenderer (no own RAF loop).
 */

import { BaseRenderer } from './base-renderer';

export class HUDRenderer extends BaseRenderer {
  getDogName?: () => string;
  getHappiness?: () => number; // 0-100
  getZoneName?: () => string;
  getItemCount?: () => number;
  getCompanionName?: () => string | null;
  isThreatActive?: () => boolean;
  // Status panel data (lower-left)
  getMetrics?: () => {
    happiness: number;
    itemsCollected: number;
    companionsMet: number;
    threatsResolved: number;
    cluesFound: number;
    routeRevealed: boolean;
  };
  getClues?: () => string[]; // short labels of clue items found

  /** Lower-left panel: live metrics and the clues/items found so far. */
  private renderStatusPanel(ctx: CanvasRenderingContext2D, H: number): void {
    const metrics = this.getMetrics?.();
    const clues = this.getClues?.() ?? [];
    if (!metrics) return;

    const x = 16;
    const w = 210;
    const pad = 12;
    const lineH = 22;
    const clueLineH = 18;
    const maxClues = 6;
    const headerH = 26;
    const bodyH = headerH + 5 * lineH + 6 + Math.min(clues.length, maxClues) * clueLineH + 8;
    const y = 82; // just below the top pills

    ctx.fillStyle = 'rgba(10,10,25,0.72)';
    ctx.strokeStyle = 'rgba(120,160,255,0.35)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, bodyH, 10);
    ctx.fill();
    ctx.stroke();

    let cy = y + 8;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('📊 Status', x + pad, cy + 14);
    cy += headerH;

    const row = (label: string, value: string, valueColor: string) => {
      ctx.fillStyle = '#c8c8e0';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + pad, cy + 13);
      ctx.fillStyle = valueColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(value, x + w - pad, cy + 13);
      ctx.textAlign = 'left';
      cy += lineH;
    };

    const hp = Math.max(0, Math.min(100, metrics.happiness));
    const hpColor = hp > 50 ? '#4caf50' : hp > 25 ? '#ff9800' : '#f44336';
    row('🐕 Happiness', `${Math.round(hp)}%`, hpColor);
    row('🎒 Items', String(metrics.itemsCollected), '#fff');
    row('🐾 Companions', String(metrics.companionsMet), '#8bc34a');
    row('⚔️ Threats', String(metrics.threatsResolved), '#ff9800');
    row('🗺️ Route', metrics.routeRevealed ? 'REVEALED' : `${metrics.cluesFound} clues`, metrics.routeRevealed ? '#4caf50' : '#c8c8e0');

    if (clues.length > 0) {
      cy += 4;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + pad, cy, w - pad * 2, 1);
      cy += 6;
      ctx.fillStyle = '#9fd0ff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('Clues found', x + pad, cy + 10);
      cy += 14;
      for (const clue of clues.slice(0, maxClues)) {
        ctx.fillStyle = '#e8e8f8';
        ctx.font = '11px sans-serif';
        ctx.fillText('• ' + clue, x + pad, cy + 10);
        cy += clueLineH;
      }
      if (clues.length > maxClues) {
        ctx.fillStyle = '#888';
        ctx.font = 'italic 10px sans-serif';
        ctx.fillText(`+${clues.length - maxClues} more…`, x + pad, cy + 10);
        cy += clueLineH;
      }
    }
    cy += 4;
  }

  protected onRender(): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    const dogName = this.getDogName?.() ?? '';
    const happiness = this.getHappiness?.() ?? 100;
    const zoneName = this.getZoneName?.() ?? '';
    const itemCount = this.getItemCount?.() ?? 0;
    const companion = this.getCompanionName?.() ?? null;
    const threatActive = this.isThreatActive?.() ?? false;

    // Threat warning border
    if (threatActive) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 150);
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.globalAlpha = 1;
    }

    // ===== Top HUD: measure first, then place with guaranteed gaps =====
    const PAD = 12; // inner padding for each pill
    const GAP = 14; // gap between pills
    const MARGIN = 16;
    const boxY = 14;
    const boxH = 54;
    const fontName = 'bold 16px sans-serif';
    const fontRight = '14px sans-serif';

    // --- Center pill: zone name ---
    ctx.font = fontName;
    const zoneW = zoneName ? ctx.measureText(zoneName).width + PAD * 2 : 0;

    // --- Right pill: items + companion ---
    ctx.font = fontRight;
    const rightLine1 = `🎒 ${itemCount}`;
    const rightLine2 = companion ? `🐾 ${companion}` : '';
    const rightContentW = Math.max(
      ctx.measureText(rightLine1).width,
      rightLine2 ? ctx.measureText(rightLine2).width : 0
    ) + PAD * 2;
    const rightX = W - MARGIN - rightContentW;

    // Center the zone pill in the full width (left happiness pill removed)
    const zoneX = W / 2 - zoneW / 2;

    // --- Draw center pill (zone) ---
    if (zoneName && zoneW > 0) {
      ctx.fillStyle = 'rgba(10,10,25,0.7)';
      ctx.fillRect(zoneX, boxY, zoneW, boxH);
      ctx.fillStyle = '#ffd700';
      ctx.font = fontName;
      ctx.textAlign = 'center';
      ctx.fillText(zoneName, zoneX + zoneW / 2, boxY + 22);
    }

    // --- Draw right pill (items + companion) ---
    ctx.fillStyle = 'rgba(10,10,25,0.7)';
    ctx.fillRect(rightX, boxY, rightContentW, boxH);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = fontRight;
    ctx.fillText(rightLine1, rightX + rightContentW - PAD, boxY + 22);
    if (rightLine2) {
      ctx.fillStyle = '#8bc34a';
      ctx.fillText(rightLine2, rightX + rightContentW - PAD, boxY + 42);
    }

    // ===== Lower-left status panel: metrics + clues found =====
    this.renderStatusPanel(ctx, H);

    // ===== Bottom-left: Panel hints + interact hint =====
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px sans-serif';
    ctx.fillText('[I]nventory  [C]ompanion  [H]int', 16, H - 34);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('[E] / [Space] — interact (threats & gates)   ·   items auto-pickup on touch', 16, H - 14);
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
