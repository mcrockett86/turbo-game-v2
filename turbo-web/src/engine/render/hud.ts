/**
 * HUD Renderer — Top-of-screen game state overlay
 *
 * Shows:
 * - Dog name + happiness bar (top-left)
 * - Current zone name (top-center)
 * - Item count + active companion (top-right)
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

  protected onRender(): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const W = this.canvas.width;

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
      ctx.strokeRect(3, 3, W - 6, this.canvas.height - 6);
      ctx.globalAlpha = 1;
    }

    // ===== Top-left: Dog + happiness =====
    const boxX = 16;
    const boxY = 14;
    ctx.fillStyle = 'rgba(10,10,25,0.7)';
    ctx.fillRect(boxX, boxY, 240, 54);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🐕 ${dogName}`, boxX + 10, boxY + 22);

    // Happiness bar
    const barX = boxX + 10;
    const barY = boxY + 32;
    const barW = 220;
    const barH = 12;
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(barX, barY, barW, barH);
    const pct = Math.max(0, Math.min(100, happiness)) / 100;
    const color = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${Math.round(happiness)}%`, barX + barW + 6, barY + 10);

    // ===== Top-center: Zone name =====
    if (zoneName) {
      ctx.textAlign = 'center';
      const tw = ctx.measureText(zoneName).width;
      ctx.fillStyle = 'rgba(10,10,25,0.7)';
      ctx.fillRect(W / 2 - tw / 2 - 16, boxY, tw + 32, 30);
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(zoneName, W / 2, boxY + 21);
    }

    // ===== Top-right: Items + companion =====
    ctx.textAlign = 'right';
    const rightX = W - 16;
    ctx.fillStyle = 'rgba(10,10,25,0.7)';
    ctx.fillRect(rightX - 180, boxY, 196, 54);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(`🎒 ${itemCount}`, rightX - 10, boxY + 22);
    if (companion) {
      ctx.fillStyle = '#8bc34a';
      ctx.fillText(`🐾 ${companion}`, rightX - 10, boxY + 42);
    }

    // ===== Bottom-left: Panel hints =====
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px sans-serif';
    ctx.fillText('[I]nventory  [C]ompanion  [H]int', 16, this.canvas.height - 14);
  }
}
