/**
 * Endgame — victory / defeat screens with score breakdown.
 *
 * Win: player reaches the home zone (neighborhood_home room's `home` feature).
 * Lose: happiness reaches 0.
 *
 * Renders a full-canvas overlay (dark background + title + score + restart
 * button) drawn via Canvas2D, so it needs no DOM. The restart button is a
 * clickable region tracked by `buttonRect` for main.ts hit-testing.
 */

import type { GameStateData } from '@/types';
import { StateManager } from './state';

export type EndgameResult = 'victory' | 'defeat';

export interface Score {
  timeSeconds: number;
  itemsCollected: number;
  threatsResolved: number;
  companionsMet: number;
  maxHappiness: number;
  totalScore: number;
}

interface Button {
  id: string;
  label: string;
  rect: { x: number; y: number; w: number; h: number };
}

export class Endgame {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // CSS-pixel display size of the shared canvas (backing store is dpr-scaled
  // by BaseRenderer.resizeToDisplay, so divide by the effective dpr).
  private cssDims(): { w: number; h: number } {
    if (!this.canvas) return { w: 0, h: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr };
  }

  private outcome: EndgameResult | null = null;
  private score: Score | null = null;
  private recap: string | null = null;
  private buttons: Button[] = [];
  private _onRestart: (() => void) | null = null;
  private shown = false;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** Set the callback fired when the player clicks "Play Again". */
  set onRestart(cb: (() => void) | null) {
    this._onRestart = cb;
  }

  get onRestart(): (() => void) | null {
    return this._onRestart;
  }

  /** Show the endgame overlay. Stops all prior interaction. */
  show(result: EndgameResult, state: GameStateData): void {
    this.outcome = result;
    this.score = this.computeScore(state);
    // Sprint 8.4: narrative recap above the score block (victory only).
    this.recap = result === 'victory' ? StateManager.recapLine(state) : null;
    this.shown = true;
    this.layoutButtons();
    this.render();
  }

  /** Hide the overlay (e.g. after restart). */
  hide(): void {
    this.shown = false;
    this.outcome = null;
    this.score = null;
    this.recap = null;
    this.buttons = [];
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
  }

  /** Test hook: the narrative recap line (null on defeat/hidden). */
  get recapText(): string | null {
    return this.recap;
  }

  get active(): boolean {
    return this.shown;
  }

  get result(): EndgameResult | null {
    return this.outcome;
  }

  /** Handle a canvas-space click. Returns true if a button was hit. */
  handleClick(canvasX: number, canvasY: number): boolean {
    if (!this.shown) return false;
    for (const btn of this.buttons) {
      const { x, y, w, h } = btn.rect;
      if (canvasX >= x && canvasX <= x + w && canvasY >= y && canvasY <= y + h) {
        if (btn.id === 'restart') this._onRestart?.();
        return true;
      }
    }
    return false;
  }

  private layoutButtons(): void {
    if (!this.canvas) return;
    const { w: W, h: H } = this.cssDims();
    const bw = 220, bh = 54;
    const y = H - 130;
    this.buttons = [
      { id: 'restart', label: 'Play Again', rect: { x: (W - bw) / 2, y, w: bw, h: bh } },
    ];
  }

  private computeScore(state: GameStateData): Score {
    const start = state.startTime || Date.now();
    const end = state.gameOverTime || Date.now();
    const timeSeconds = Math.max(0, Math.round((end - start) / 1000));
    const itemsCollected = state.itemsCollected;
    const threatsResolved = state.threatsResolved;
    const companionsMet = state.companionsMet.size;
    const maxHappiness = state.maxHappiness;

    // Scoring: faster = better (base 5000, -25/sec, floor 500);
    // +120 per item, +150 per threat, +200 per companion; +maxHappiness bonus.
    const timeScore = Math.max(500, 5000 - timeSeconds * 25);
    const itemScore = itemsCollected * 120;
    const threatScore = threatsResolved * 150;
    const companionScore = companionsMet * 200;
    const happinessBonus = Math.round(maxHappiness);

    return {
      timeSeconds,
      itemsCollected,
      threatsResolved,
      companionsMet,
      maxHappiness: Math.round(maxHappiness),
      totalScore: timeScore + itemScore + threatScore + companionScore + happinessBonus,
    };
  }

  private render(): void {
    if (!this.ctx || !this.canvas || !this.outcome || !this.score) return;
    const ctx = this.ctx;
    const { w: W, h: H } = this.cssDims();

    // Background: solid dark with a subtle radial glow
    ctx.fillStyle = this.outcome === 'victory' ? 'rgba(10, 30, 15, 0.96)' : 'rgba(30, 8, 8, 0.96)';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const glow = this.outcome === 'victory' ? '#ffd700' : '#883333';
    const grad = ctx.createRadialGradient(cx, H * 0.3, 20, cx, H * 0.3, W * 0.5);
    grad.addColorStop(0, glow + '44');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.outcome === 'victory' ? '#ffd700' : '#ff5555';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(this.outcome === 'victory' ? '🏠 YOU FOUND HOME!' : '💔 THE SEARCH ENDS', cx, H * 0.18);

    // Subtitle
    ctx.fillStyle = '#cccccc';
    ctx.font = '18px sans-serif';
    const sub = this.outcome === 'victory'
      ? 'Turbo made it back. What a journey.'
      : "Turbo's hope ran out along the way. Give it another try.";
    ctx.fillText(sub, cx, H * 0.27);

    // Sprint 8.4: one-line narrative recap (victory), above the score block
    if (this.outcome === 'victory' && this.recap) {
      ctx.fillStyle = '#ffe9a0';
      ctx.font = 'italic 15px sans-serif';
      ctx.fillText(this.recap, cx, H * 0.32);
    }

    // Score panel
    const panelW = 460, panelH = 260;
    const px = (W - panelW) / 2, py = H * 0.35;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = this.outcome === 'victory' ? '#ffd700' : '#aa4444';
    ctx.lineWidth = 2;
    roundRect(ctx, px, py, panelW, panelH, 12);
    ctx.fill();
    ctx.stroke();

    const score = this.score;
    const rows: Array<[string, string]> = [
      ['⏱ Time', formatTime(score.timeSeconds)],
      ['🎒 Items collected', String(score.itemsCollected)],
      ['🐾 Threats resolved', String(score.threatsResolved)],
      ['🐕 Companions met', String(score.companionsMet)],
      ['💖 Max happiness', String(score.maxHappiness)],
    ];

    ctx.font = '16px sans-serif';
    let ry = py + 40;
    for (const [label, value] of rows) {
      ctx.fillStyle = '#dddddd';
      ctx.textAlign = 'left';
      ctx.fillText(label, px + 30, ry);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(value, px + panelW - 30, ry);
      ctx.font = '16px sans-serif';
      ry += 38;
    }

    // Total score
    ctx.strokeStyle = this.outcome === 'victory' ? '#ffd700' : '#aa4444';
    ctx.beginPath();
    ctx.moveTo(px + 24, ry - 8);
    ctx.lineTo(px + panelW - 24, ry - 8);
    ctx.stroke();

    ctx.fillStyle = this.outcome === 'victory' ? '#ffd700' : '#ff8888';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`TOTAL  ${score.totalScore.toLocaleString()}`, cx, ry + 24);

    // Restart button
    for (const btn of this.buttons) {
      const { x, y, w, h } = btn.rect;
      ctx.fillStyle = this.outcome === 'victory' ? '#ffd700' : '#cc4444';
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, x + w / 2, y + h / 2);
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
