/**
 * Hint / Route Panel — toggleable overlay showing:
 *  - A simple route map of the current zone (rooms as nodes, exits as edges)
 *  - The current zone's hint text
 *  - Progress: hints unlocked, route revealed status
 * Toggle with [H].
 */

import type { Zone } from '@/types';
import { ZONES } from '@/data';

export interface HintProgress {
  hintsUnlockedCount: number;
  routeRevealed: boolean;
}

export class HintPanel {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private visible = false;
  private zone: Zone | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  toggle(zone: Zone, progress?: HintProgress): void {
    this.zone = zone;
    this.visible = !this.visible;
    if (this.visible) this.render(zone, progress);
    else this.clear();
  }

  show(zone: Zone, progress?: HintProgress): void {
    this.zone = zone;
    this.visible = true;
    this.render(zone, progress);
  }

  hide(): void {
    this.visible = false;
    this.clear();
  }

  refresh(zone: Zone, progress?: HintProgress): void {
    if (this.visible) this.render(zone, progress);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  private clear(): void {
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
  }

  private render(zone: Zone, progress?: HintProgress): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    const panelW = Math.min(720, W * 0.72);
    const panelH = Math.min(560, H * 0.78);
    const px = (W - panelW) / 2;
    const py = (H - panelH) / 2;

    // Backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    // Panel
    ctx.fillStyle = '#141a26';
    ctx.strokeStyle = '#8a6cff';
    ctx.lineWidth = 2;
    roundRect(ctx, px, py, panelW, panelH, 14);
    ctx.fill();
    ctx.stroke();

    // Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🧭 ${zone.name} — Route`, px + 24, py + 30);

    ctx.fillStyle = '#8888aa';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('[H] close', px + panelW - 20, py + 30);

    // Zone hint
    ctx.fillStyle = '#ffd98a';
    ctx.font = 'italic 15px sans-serif';
    ctx.textAlign = 'left';
    wrapText(ctx, `💡 ${zone.hint}`, px + 24, py + 66, panelW - 48, 22, 3);

    // Progress line
    const progY = py + 130;
    ctx.fillStyle = '#9999bb';
    ctx.font = '14px sans-serif';
    const prog = progress
      ? `${progress.hintsUnlockedCount} clue(s) found${progress.routeRevealed ? ' · 🏠 route revealed' : ''}`
      : 'Explore to find clues';
    ctx.fillText(prog, px + 24, progY);

    // Divider
    ctx.strokeStyle = '#334';
    ctx.beginPath();
    ctx.moveTo(px + 20, progY + 22);
    ctx.lineTo(px + panelW - 20, progY + 22);
    ctx.stroke();

    // Route map (rooms as nodes, exits as edges)
    const mapTop = progY + 40;
    const mapH = panelH - (mapTop - py) - 20;
    const rooms = zone.rooms ?? [];
    if (rooms.length > 0) {
      this.drawRouteMap(ctx, zone, rooms, px + 20, mapTop, panelW - 40, mapH);
    } else {
      ctx.fillStyle = '#8888aa';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Open-world zone — no fixed rooms. Wander and explore!', W / 2, mapTop + mapH / 2);
    }
  }

  private drawRouteMap(ctx: CanvasRenderingContext2D, zone: Zone, rooms: NonNullable<Zone['rooms']>, x: number, y: number, w: number, h: number): void {
    // Lay rooms in a grid (3 columns)
    const cols = Math.min(3, rooms.length);
    const rows = Math.ceil(rooms.length / cols);
    const cellW = w / cols;
    const cellH = h / rows;

    // Position map
    const pos = new Map<string, { x: number; y: number }>();
    rooms.forEach((room, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos.set(room.id, {
        x: x + col * cellW + cellW / 2,
        y: y + row * cellH + cellH / 2,
      });
    });

    // Edges (exits)
    ctx.strokeStyle = 'rgba(138,108,255,0.5)';
    ctx.lineWidth = 2;
    const drawn = new Set<string>();
    for (const room of rooms) {
      for (const exitId of room.exits) {
        const edgeKey = [room.id, exitId].sort().join('::');
        if (drawn.has(edgeKey)) continue;
        drawn.add(edgeKey);
        const a = pos.get(room.id);
        const b = pos.get(exitId);
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Nodes
    const nodeR = Math.min(28, cellW / 6, cellH / 6);
    for (const room of rooms) {
      const p = pos.get(room.id)!;
      const isHome = room.isHome;
      const isEntrance = room.isEntrance;

      ctx.fillStyle = isHome ? '#ffd700' : isEntrance ? '#4a9eff' : '#3a4a6a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isHome ? '#fff3b0' : isEntrance ? '#a8d4ff' : '#5a6a8a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isHome ? '🏠' : isEntrance ? '⬇' : '·', p.x, p.y);

      // Label below node
      ctx.fillStyle = '#ccccdd';
      ctx.font = '11px sans-serif';
      ctx.fillText(room.name, p.x, p.y + nodeR + 12);
    }

    // Legend
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4a9eff';
    ctx.fillText('⬇ entrance', x, y + h + 16);
    ctx.fillStyle = '#ffd700';
    const ex = x + 90;
    ctx.fillText('🏠 home', ex, y + h + 16);
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      lineCount++;
      if (lineCount >= maxLines - 1) {
        // Last line: ellipsis
        ctx.fillText(line + '…', x, y + lineHeight);
        return;
      }
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}
