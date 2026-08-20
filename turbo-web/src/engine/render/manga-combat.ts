/**
 * Manga Cutaway Combat — Full-screen manga-style combat overlay
 *
 * Renders a 3-panel manga cutaway when a combat threat resolves:
 * - Panel 1: The opponent (threat icon) with speed lines
 * - Panel 2: The strike (big SFX text, e.g. "SCRATCH!")
 * - Panel 3: The outcome (success: confident pose / failure: dazed)
 *
 * Pure presentational — main.ts drives it:
 *   manga.start(threat, success)  -> plays 1.2s animation -> manga.onDone?.()
 *
 * Extends BaseRenderer (no own RAF loop).
 */

import { BaseRenderer } from './base-renderer';
import type { Threat } from '../../types';

export class MangaCombatOverlay extends BaseRenderer {
  playing = false;
  private threat: Threat | null = null;
  private success = false;
  private timer = 0;
  private readonly DURATION = 1.4; // seconds

  start(threat: Threat, success: boolean): void {
    this.threat = threat;
    this.success = success;
    this.timer = 0;
    this.playing = true;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  protected onUpdate(delta: number): void {
    if (!this.playing) return;
    this.timer += delta;
    if (this.timer >= this.DURATION) {
      this.playing = false;
      this.onDone?.();
    }
  }

  onDone?: () => void;

  protected onRender(): void {
    if (!this.playing || !this.ctx || !this.canvas || !this.threat) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const t = Math.min(1, this.timer / this.DURATION);

    // Flash on entry
    if (t < 0.15) {
      ctx.fillStyle = `rgba(255,255,255,${(0.15 - t) * 5})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Background
    ctx.fillStyle = this.success ? '#1a2a1a' : '#2a1a1a';
    ctx.fillRect(0, 0, W, H);

    // Halftone dot pattern (manga texture)
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < W; x += 18) {
      for (let y = 0; y < H; y += 18) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ===== Panel 1 (left): Opponent with speed lines =====
    const p1x = 40;
    const p1y = H * 0.15;
    const pw = W * 0.42;
    const ph = H * 0.7;

    this.drawPanel(ctx, p1x, p1y, pw, ph, 1 - t * 0.5);

    // Speed lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(p1x, p1y, pw, ph);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = p1y + (i / 14) * ph;
      ctx.beginPath();
      ctx.moveTo(p1x, y);
      ctx.lineTo(p1x + pw * (0.3 + 0.7 * Math.abs(Math.sin(i * 1.7))), y + (i % 2 ? 8 : -8));
      ctx.stroke();
    }
    // Opponent icon
    ctx.font = `${Math.min(pw, ph) * 0.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this.threat.icon, p1x + pw / 2, p1y + ph * 0.6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(this.threat.name, p1x + pw / 2, p1y + ph - 16);
    ctx.restore();

    // ===== Panel 2 (center): The strike =====
    const p2x = p1x + pw + 20;
    const p2w = W * 0.34;
    this.drawPanel(ctx, p2x, p1y, p2w, ph, 1 - t * 0.5);

    ctx.save();
    ctx.beginPath();
    ctx.rect(p2x, p1y, p2w, ph);
    ctx.clip();

    // Big radial burst
    const cx = p2x + p2w / 2;
    const cy = p1y + ph / 2;
    ctx.strokeStyle = this.success ? '#ffd700' : '#ff5252';
    ctx.lineWidth = 6;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
      ctx.lineTo(cx + Math.cos(a) * (60 + t * 60), cy + Math.sin(a) * (60 + t * 60));
      ctx.stroke();
    }

    // SFX text (rotated, comic style)
    ctx.translate(cx, cy);
    ctx.rotate(-0.15);
    ctx.font = `bold ${28 + t * 14}px sans-serif`;
    ctx.fillStyle = this.success ? '#ffd700' : '#ff5252';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(this.threat.mangaText, 0, 0);
    ctx.fillText(this.threat.mangaText, 0, 0);
    ctx.restore();

    // ===== Panel 3 (right): Outcome =====
    const p3x = p2x + p2w + 20;
    const p3w = W - p3x - 40;
    this.drawPanel(ctx, p3x, p1y, p3w, ph, 1 - t * 0.5);

    ctx.save();
    ctx.beginPath();
    ctx.rect(p3x, p1y, p3w, ph);
    ctx.clip();
    ctx.font = `${Math.min(p3w, ph) * 0.3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this.success ? '😤' : '💫', p3x + p3w / 2, p1y + ph * 0.5);
    ctx.fillStyle = this.success ? '#7CFC00' : '#ff8a80';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(this.success ? 'VICTORY!' : 'DEFEATED...', p3x + p3w / 2, p1y + ph * 0.75);
    ctx.restore();

    // Bottom caption bar
    ctx.fillStyle = '#000';
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.success
        ? `${this.threat.name} backed down. You press on.`
        : `${this.threat.name} got the better of you...`,
      W / 2, H - 16
    );
  }

  private drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha: number): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#111';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
}
