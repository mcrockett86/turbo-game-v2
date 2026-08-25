/**
 * Threat Manager — Mini-game system for all 4 threat types
 *
 * Types:
 * - timing:  Moving gap/car — press SPACE in the target window
 * - combat:  Rhythm QTE — press SPACE on the beat (3 hits)
 * - sneak:   Detection meter rises/falls — stay still (no keys) while it's high
 * - comfort: Hold SPACE to build shelter progress before the timer runs out
 *
 * The manager owns the mini-game state machine and its canvas overlay rendering.
 * It does NOT start its own RAF loop — the unified game loop calls update().
 *
 * Resolution: calls onResolve(threatId, success) so main.ts can route to
 * State.resolveThreat() and (for combat) the manga cutaway overlay.
 */

import { BaseRenderer } from './render/base-renderer';
import type { Threat, ThreatType } from '../types';

export type ThreatPhase = 'idle' | 'intro' | 'active' | 'resolved';

interface TimingState {
  gapX: number;        // 0..100 position of the safe gap
  gapWidth: number;    // width of the safe zone (easier threats = wider)
  speed: number;       // px/sec sweep
  direction: 1 | -1;
  windowMs: number;    // timing window
}

interface CombatState {
  beats: number;       // beats landed
  needed: number;      // beats required
  pulse: number;       // 0..1 pulsing ring position
  pulseSpeed: number;  // pulses per second
  targetStart: number; // target zone start (0..1)
  targetEnd: number;   // target zone end
}

interface SneakState {
  detection: number;   // 0..100
  riseRate: number;    // per second when moving
  fallRate: number;    // per second when still
  failThreshold: number;
}

interface ComfortState {
  progress: number;    // 0..100
  rate: number;        // per second while holding
  timeLimit: number;   // seconds
  elapsed: number;
}

export class ThreatManager extends BaseRenderer {
  phase: ThreatPhase = 'idle';
  currentThreat: Threat | null = null;
  currentType: ThreatType | null = null;

  // Per-type state
  private timing: TimingState = { gapX: 0, gapWidth: 20, speed: 40, direction: 1, windowMs: 500 };
  private combat: CombatState = { beats: 0, needed: 3, pulse: 0, pulseSpeed: 0.8, targetStart: 0.4, targetEnd: 0.6 };
  private sneak: SneakState = { detection: 0, riseRate: 30, fallRate: 20, failThreshold: 100 };
  private comfort: ComfortState = { progress: 0, rate: 25, timeLimit: 6, elapsed: 0 };

  // Intro timer (shows threat name + "Press SPACE")
  private introTimer = 0;
  private readonly INTRO_DURATION = 1.5;

  // Input — ThreatManager fully owns the keyboard while a threat is active
  private keysHeld: Set<string> = new Set();
  private boundKeyDown = this.onKeyDown.bind(this);
  private boundKeyUp = this.onKeyUp.bind(this);

  /**
   * Returns true while a threat is active — the game loop and other renderers
   * should IGNORE all keyboard input in that case so the mini-game fully owns it.
   */
  get isBusy(): boolean {
    return this.phase === 'intro' || this.phase === 'active' || this.phase === 'resolved';
  }

  // Callbacks
  onResolve?: (threatId: string, success: boolean) => void;
  onStateChange?: (phase: ThreatPhase, threat: Threat | null) => void;
  onStart?: (threat: Threat) => void;

  // ===== API =====

  /** Start a threat mini-game. Threat must come from the THREATS data. */
  start(threat: Threat): void {
    // Guard against double-start (e.g. a stale entry-threat timer firing after
    // we already started a different threat). Re-arming the key listeners on
    // every start would otherwise leak a duplicate pair per threat cycle.
    if (this.phase !== 'idle') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
    }

    this.onStart?.(threat);
    this.currentThreat = threat;
    this.currentType = threat.type;
    this.phase = 'intro';
    this.introTimer = this.INTRO_DURATION;
    this.keysHeld.clear();
    this.sneakSafeTime = 0;

    // Reset per-type state
    this.timing = { gapX: 0, gapWidth: 20, speed: 40, direction: 1, windowMs: 500 };
    this.combat = { beats: 0, needed: 3, pulse: 0, pulseSpeed: 0.8, targetStart: 0.4, targetEnd: 0.6 };
    this.sneak = { detection: 0, riseRate: 30, fallRate: 20, failThreshold: 100 };
    this.comfort = { progress: 0, rate: 25, timeLimit: 6, elapsed: 0 };

    // Difficulty tweaks by threat name (light hand-tuning)
    this.tuneDifficulty(threat);

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    this.onStateChange?.(this.phase, threat);
  }

  private tuneDifficulty(threat: Threat): void {
    // Combat: brave-themed threats slightly easier
    if (threat.type === 'combat') {
      this.combat.needed = 3;
      this.combat.pulseSpeed = 0.7;
    }
    if (threat.type === 'timing') {
      this.timing.gapWidth = 24;
      this.timing.speed = 45;
    }
  }

  /** Cancel an in-progress threat (e.g. player escaped). Counts as failure. */
  cancel(): void {
    if (this.phase === 'idle') return;
    this.finish(false);
  }

  // ===== BaseRenderer contract =====

  protected onInit(_data?: unknown): void {
    // ThreatManager renders its own overlay; init just ensures canvas/ctx ready.
  }

  protected onUpdate(delta: number, _time: number): void {
    if (this.phase === 'idle') return;

    if (this.phase === 'intro') {
      this.introTimer -= delta;
      if (this.introTimer <= 0) {
        this.phase = 'active';
        this.onStateChange?.(this.phase, this.currentThreat);
      }
      return;
    }

    switch (this.currentType) {
      case 'timing': this.updateTiming(delta); break;
      case 'combat': this.updateCombat(delta); break;
      case 'sneak': this.updateSneak(delta); break;
      case 'comfort': this.updateComfort(delta); break;
    }
  }

  protected onRender(): void {
    if (this.phase === 'idle' || !this.ctx || !this.canvas) return;
    if (!this.currentThreat) return;

    const ctx = this.ctx;
    const W = this.cssWidth;
    const H = this.cssHeight;

    // Dark backdrop
    ctx.fillStyle = 'rgba(10, 10, 25, 0.88)';
    ctx.fillRect(0, 0, W, H);

    // Threat header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.currentThreat.icon} ${this.currentThreat.name}`, W / 2, H / 2 - 140);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#bbb';
    ctx.fillText(this.currentThreat.description, W / 2, H / 2 - 110);

    // Solve hint
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(this.currentThreat.solve, W / 2, H / 2 + 150);

    if (this.phase === 'intro') {
      // Big pulsing "Press SPACE"
      const pulse = 0.7 + 0.3 * Math.sin(this.introTimer * 8);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('PRESS SPACE', W / 2, H / 2 + 20);
      ctx.globalAlpha = 1;
      return;
    }

    switch (this.currentType) {
      case 'timing': this.renderTiming(ctx, W, H); break;
      case 'combat': this.renderCombat(ctx, W, H); break;
      case 'sneak': this.renderSneak(ctx, W, H); break;
      case 'comfort': this.renderComfort(ctx, W, H); break;
    }
  }

  protected onDestroy(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
  }

  // ===== Type updaters =====

  private updateTiming(delta: number): void {
    const t = this.timing;
    t.gapX += t.speed * t.direction * delta;
    if (t.gapX > 100) { t.gapX = 100; t.direction = -1; }
    if (t.gapX < 0) { t.gapX = 0; t.direction = 1; }

    // Player cursor sweeps continuously; success if cursor is in gap when SPACE pressed
    // (SPACE handling in onKeyDown)
  }

  private updateCombat(delta: number): void {
    const c = this.combat;
    c.pulse += c.pulseSpeed * delta;
    if (c.pulse >= 1) c.pulse -= 1;
  }

  private updateSneak(delta: number): void {
    const s = this.sneak;
    const moving = this.keysHeld.has('w') || this.keysHeld.has('a') ||
                   this.keysHeld.has('s') || this.keysHeld.has('d') ||
                   this.keysHeld.has('arrowup') || this.keysHeld.has('arrowdown') ||
                   this.keysHeld.has('arrowleft') || this.keysHeld.has('arrowright');

    if (moving) {
      s.detection += s.riseRate * delta;
      this.sneakSafeTime = 0;
    } else {
      s.detection = Math.max(0, s.detection - s.fallRate * delta);
      if (s.detection === 0) this.sneakSafeTime += delta;
    }

    if (s.detection >= s.failThreshold) {
      this.finish(false);
    } else if (this.sneakSafeTime >= this.SNEAK_SAFE_DURATION) {
      this.finish(true);
    }
  }

  private sneakSafeTime = 0;
  private readonly SNEAK_SAFE_DURATION = 3.0; // seconds detection must stay at 0

  private updateComfort(delta: number): void {
    const c = this.comfort;
    c.elapsed += delta;

    if (this.keysHeld.has(' ')) {
      c.progress += c.rate * delta;
    }

    if (c.progress >= 100) {
      this.finish(true);
    } else if (c.elapsed >= c.timeLimit) {
      this.finish(false);
    }
  }

  // ===== Type renderers =====

  private renderTiming(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const t = this.timing;
    const barY = H / 2 - 20;
    const barW = 500;
    const barH = 40;
    const barX = W / 2 - barW / 2;

    // Track
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(barX, barY - barH / 2, barW, barH);

    // Safe gap
    const gapStart = barX + (t.gapX / 100) * barW;
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(gapStart, barY - barH / 2, (t.gapWidth / 100) * barW, barH);

    // Moving hazard (car) — represents the danger the player must avoid
    const hazardX = barX + ((100 - t.gapX) / 100) * barW;
    ctx.fillStyle = '#f44336';
    ctx.beginPath();
    ctx.arc(hazardX, barY, barH * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚗', hazardX, barY + 5);

    // Instructions
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText('Press SPACE when the red dot is in the green zone!', W / 2, barY - 40);
  }

  private renderCombat(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const c = this.combat;
    const cx = W / 2;
    const cy = H / 2 - 10;
    const R = 90;

    // Outer ring
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Target zone (arc segment)
    const startAngle = c.targetStart * Math.PI * 2 - Math.PI / 2;
    const endAngle = c.targetEnd * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, endAngle);
    ctx.stroke();

    // Pulse indicator
    const pulseAngle = c.pulse * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(pulseAngle) * R;
    const py = cy + Math.sin(pulseAngle) * R;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();

    // Beat counter
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${c.beats} / ${c.needed}`, cx, cy + 8);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Press SPACE when the yellow dot hits the green arc', cx, cy + R + 50);
  }

  private renderSneak(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const s = this.sneak;
    const barW = 400;
    const barX = W / 2 - barW / 2;
    const barY = H / 2 - 10;

    // Detection bar background
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(barX, barY - 15, barW, 30);

    // Detection fill (green -> yellow -> red)
    const pct = s.detection / s.failThreshold;
    let color = '#4caf50';
    if (pct > 0.6) color = '#f44336';
    else if (pct > 0.3) color = '#ff9800';
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY - 15, barW * pct, 30);

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DETECTION', W / 2, barY - 30);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Stay still to let detection drop. Do NOT press movement keys!', W / 2, barY + 40);
  }

  private renderComfort(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const c = this.comfort;
    const barW = 400;
    const barX = W / 2 - barW / 2;
    const barY = H / 2 - 10;

    // Time bar
    const timePct = 1 - c.elapsed / c.timeLimit;
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(barX, barY - 45, barW, 12);
    ctx.fillStyle = timePct > 0.3 ? '#2196f3' : '#f44336';
    ctx.fillRect(barX, barY - 45, barW * timePct, 12);

    // Shelter progress
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(barX, barY - 15, barW, 30);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(barX, barY - 15, barW * (c.progress / 100), 30);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SHELTER PROGRESS', W / 2, barY - 60);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Hold SPACE to take shelter before time runs out!', W / 2, barY + 40);
  }

  // ===== Finish =====

  private finish(success: boolean): void {
    if (!this.currentThreat) return;
    const threatId = this.currentThreat.name; // stable id for state

    this.phase = 'resolved';
    this.onStateChange?.(this.phase, this.currentThreat);

    // Brief pause before callback so the player sees the outcome
    setTimeout(() => {
      this.onResolve?.(threatId, success);
      this.phase = 'idle';
      this.currentThreat = null;
      this.currentType = null;
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      this.onStateChange?.(this.phase, null);
    }, 600);
  }

  // ===== Input =====

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keysHeld.add(key);

    if (key !== ' ') return;
    e.preventDefault();

    if (this.phase === 'intro') {
      // SPACE during intro fast-forwards to active
      this.phase = 'active';
      this.onStateChange?.(this.phase, this.currentThreat);
      return;
    }

    if (this.phase !== 'active') return;

    switch (this.currentType) {
      case 'timing': this.resolveTiming(); break;
      case 'combat': this.resolveCombat(); break;
      // sneak and comfort use hold, not tap
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.key.toLowerCase());
  }

  private resolveTiming(): void {
    const t = this.timing;
    const gapCenter = t.gapX + t.gapWidth / 2;
    // Player cursor = opposite side (simplification: hazard position is the "wrong" spot)
    const cursorPos = 100 - t.gapX;
    const inGap = Math.abs(cursorPos - gapCenter) < t.gapWidth;
    this.finish(inGap);
  }

  private resolveCombat(): void {
    const c = this.combat;
    const inZone = c.pulse >= c.targetStart && c.pulse <= c.targetEnd;
    if (inZone) {
      c.beats++;
      if (c.beats >= c.needed) {
        this.finish(true);
      }
    } else {
      this.finish(false);
    }
  }
}
