/**
 * TP Engine Renderer — Third-Person open-zone adventure in Canvas 2D (top-down)
 *
 * Renders TP zones (dog_park, lake, forest, beach, mountain, waterfall, dog_show, park_secret)
 * with:
 * - Ground + sky color from zone data
 * - Obstacles (fence, tree, bench, bush) with collision
 * - NPCs (companion dogs) with wander AI
 * - Features (scent_post, water_bowl, treasure, lure, return_gate, etc.)
 * - Player dog with directional indicator
 * - Scent trail particles behind the player
 * - WASD / arrow-key movement
 *
 * Extends BaseRenderer — no own RAF loop.
 */

import { BaseRenderer } from './base-renderer';
import type { Zone, Obstacle, NPC, Feature, FeatureType } from '../../types';

// ===== Internal types =====

interface ScentParticle {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}

interface NpcState extends NPC {
  targetX: number;
  targetY: number;
  wanderTimer: number;
  facing: number; // radians
}

interface FeatureState {
  feature: Feature;
  state: 'active' | 'completed';
}

// ===== Constants =====

const PLAYER_RADIUS = 12;
const SCENT_EMIT_INTERVAL = 0.12; // seconds
const SCENT_PARTICLE_LIFE = 3.0; // seconds
const NPC_WANDER_INTERVAL = 4.0; // seconds
const INTERACT_RADIUS = 28; // px — proximity for feature/NPC interaction
const WORLD_SCALE = 12; // world units -> px

export class TpEngineRenderer extends BaseRenderer {
  private zone: Zone | null = null;

  // Player
  private playerX = 0;
  private playerY = 0;
  private playerFacing = 0; // radians
  private playerColor = '#ffffff';
  private playerAccent = '#4a9eff';

  // World
  private obstacles: Obstacle[] = [];
  private npcs: NpcState[] = [];
  private features: FeatureState[] = [];
  private scentTrail: ScentParticle[] = [];
  private lastScentEmit = 0;

  // Input
  private keysPressed: Set<string> = new Set();
  private boundKeyDown = this.onKeyDown.bind(this);
  private boundKeyUp = this.onKeyUp.bind(this);

  // E/Space-confirm state for threats & gates (items still auto-pickup on touch)
  private pendingInteract: Feature | null = null;
  private pendingNpc: NPC | null = null;
  private interactQueued = false; // E/Space tapped while at a gate/threat/npc
  private readonly CONFIRM_RADIUS = 3.0; // world units to be "at" a confirmable feature

  // Callbacks
  onFeatureInteract?: (feature: Feature) => void;
  onNpcInteract?: (npc: NPC) => void;
  onReturnGate?: (zoneId: string) => void;

  // ===== BaseRenderer contract =====

  protected onInit(data?: unknown): void {
    if (!data || !this.canvas || !this.ctx) return;
    this.zone = data as Zone;

    // Player starts near center — nudge away from any obstacle so we don't spawn trapped
    this.playerX = 0;
    this.playerY = 0;
    this.nudgeAwayFromObstacles();

    // Dog colors from the selected dog (if available via a custom prop on zone)
    this.playerColor = (this.zone as any).playerColor ?? '#ffffff';
    this.playerAccent = (this.zone as any).playerAccent ?? '#4a9eff';

    // Obstacles
    this.obstacles = (this.zone.obstacles ?? []).map(o => ({ ...o }));

    // NPCs
    this.npcs = (this.zone.npcs ?? []).map(npc => ({
      ...npc,
      targetX: npc.x,
      targetY: npc.z,
      wanderTimer: Math.random() * NPC_WANDER_INTERVAL,
      facing: Math.random() * Math.PI * 2,
    }));

    // Features
    this.features = (this.zone.features ?? []).map(f => ({ feature: f, state: 'active' as const }));

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
  }

  protected onUpdate(delta: number, time: number): void {
    if (!this.zone) return;

    this.updatePlayer(delta);
    this.updateNpcs(delta);
    this.updateScent(delta, time);
    this.checkInteractions();
  }

  protected onRender(): void {
    if (!this.ctx || !this.canvas || !this.zone) return;
    const ctx = this.ctx;
    const W = this.cssWidth;
    const H = this.cssHeight;

    // Sky background
    ctx.fillStyle = this.zone.skyColor ?? '#87CEEB';
    ctx.fillRect(0, 0, W, H);

    // Ground (large rect covering most of the canvas)
    const groundMargin = 40;
    ctx.fillStyle = this.zone.groundColor ?? '#4a7c3f';
    ctx.fillRect(groundMargin, groundMargin, W - groundMargin * 2, H - groundMargin * 2);

    // World-to-screen: center the player
    const toScreenX = (wx: number) => W / 2 + (wx - this.playerX) * WORLD_SCALE;
    const toScreenY = (wy: number) => H / 2 + (wy - this.playerY) * WORLD_SCALE;

    // Obstacles (sorted by y for simple depth)
    const sortedObstacles = [...this.obstacles].sort((a, b) => a.z - b.z);
    for (const ob of sortedObstacles) {
      this.renderObstacle(ob, toScreenX(ob.x), toScreenY(ob.z));
    }

    // Scent trail
    for (const p of this.scentTrail) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = t * 0.6;
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.arc(toScreenX(p.x), toScreenY(p.y), p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Features
    for (const fs of this.features) {
      if (fs.state === 'completed') continue;
      const sx = toScreenX(fs.feature.x);
      const sy = toScreenY(fs.feature.z);
      this.renderFeature(fs.feature, sx, sy);
    }

    // NPCs
    for (const npc of this.npcs) {
      const sx = toScreenX(npc.x);
      const sy = toScreenY(npc.z);
      this.renderDog(sx, sy, npc.color, npc.accentColor, npc.facing, npc.name);
    }

    // Player
    const psx = W / 2;
    const psy = H / 2;
    this.renderDog(psx, psy, this.playerColor, this.playerAccent, this.playerFacing, 'You');

    // "Press E" prompt when standing at a confirmable threat/gate or an NPC
    const promptTarget = this.pendingInteract?.label ?? (this.pendingNpc ? this.pendingNpc.name : null);
    if (promptTarget) {
      ctx.fillStyle = 'rgba(10,10,25,0.85)';
      const label = `Press [E] / [Space] — ${promptTarget}`;
      ctx.font = 'bold 15px sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillRect(psx - tw / 2 - 14, psy - 52, tw + 28, 30);
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      ctx.fillText(label, psx, psy - 32);
    }
  }

  protected onDestroy(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.zone = null;
    this.obstacles = [];
    this.npcs = [];
    this.features = [];
    this.scentTrail = [];
    this.keysPressed.clear();
    this.pendingInteract = null;
    this.pendingNpc = null;
    this.interactQueued = false;
  }

  // ===== Movement =====

  private updatePlayer(delta: number): void {
    const speed = 6.0; // world units per second
    let dx = 0;
    let dy = 0;

    if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) dy -= 1;
    if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) dy += 1;
    if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) dx -= 1;
    if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      this.playerFacing = Math.atan2(dy, dx);

      const newX = this.playerX + dx * speed * delta;
      const newY = this.playerY + dy * speed * delta;

      // Collision with obstacles
      if (!this.collidesWithObstacle(newX, newY)) {
        this.playerX = newX;
        this.playerY = newY;
      }
    }
  }

  private collidesWithObstacle(x: number, y: number): boolean {
    const r = PLAYER_RADIUS / WORLD_SCALE;
    for (const ob of this.obstacles) {
      const dx = x - ob.x;
      const dy = y - ob.z;
      const radius = (ob.width ?? 2) * 0.5;
      if (dx * dx + dy * dy < (r + radius) * (r + radius)) return true;
    }
    return false;
  }

  /**
   * If the player is currently inside an obstacle's collision circle, walk
   * outward in small steps until we're clear. Prevents the "trapped at spawn"
   * regression when layout data places an obstacle at the origin.
   */
  private nudgeAwayFromObstacles(): void {
    const step = 0.5;
    const maxRadius = 12;
    for (let radius = 0; radius <= maxRadius; radius += step) {
      if (radius === 0 && !this.collidesWithObstacle(this.playerX, this.playerY)) return;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const nx = this.playerX + Math.cos(a) * radius;
        const ny = this.playerY + Math.sin(a) * radius;
        if (!this.collidesWithObstacle(nx, ny)) {
          this.playerX = nx;
          this.playerY = ny;
          return;
        }
      }
    }
    // Last resort: leave the player where they are; the world is still playable.
  }

  // ===== NPC AI =====

  private updateNpcs(delta: number): void {
    const zone = this.zone!;
    const worldHalfW = 15; // half-size of playable area
    const worldHalfH = 12;

    for (const npc of this.npcs) {
      npc.wanderTimer -= delta;

      // Move toward target
      const dx = npc.targetX - npc.x;
      const dy = npc.targetY - npc.z;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.1) {
        const speed = 1.5; // units/sec
        npc.facing = Math.atan2(dy, dx);
        npc.x += (dx / dist) * speed * delta;
        npc.z += (dy / dist) * speed * delta;
      }

      // Pick a new target when idle
      if (npc.wanderTimer <= 0) {
        npc.wanderTimer = NPC_WANDER_INTERVAL + Math.random() * 3;
        npc.targetX = (Math.random() * 2 - 1) * worldHalfW;
        npc.targetY = (Math.random() * 2 - 1) * worldHalfH;
      }
    }
  }

  // ===== Scent Trail =====

  private updateScent(delta: number, _time: number): void {
    const now = _time / 1000;
    if (now - this.lastScentEmit >= SCENT_EMIT_INTERVAL) {
      this.lastScentEmit = now;
      this.scentTrail.push({
        x: this.playerX,
        y: this.playerY,
        age: 0,
        life: SCENT_PARTICLE_LIFE,
        size: 6,
      });
    }

    for (const p of this.scentTrail) p.age += delta;
    this.scentTrail = this.scentTrail.filter(p => p.age < p.life);
  }

  // ===== Interactions =====

  /** Threat + gate feature types that require an E/Space confirm (not auto on touch). */
  private static readonly CONFIRM_TYPES: Set<string> = new Set([
    'traffic', 'cat', 'bully', 'storm', 'vacuum', // core threat types
    'mailbox', 'trap',                            // zone-specific threat features
    'gate', 'return_gate', 'locked_door', 'door', // gates / doors
  ]);

  private isConfirmable(feature: Feature): boolean {
    return TpEngineRenderer.CONFIRM_TYPES.has(feature.type);
  }

  private interactKeyHeld(): boolean {
    return this.keysPressed.has('e') || this.keysPressed.has(' ');
  }

  /** The nearest confirmable (threat/gate) feature within confirm range, else null. */
  private nearestConfirmable(): Feature | null {
    let best: Feature | null = null;
    let bestDist = Infinity;
    for (const fs of this.features) {
      if (fs.state === 'completed') continue;
      if (!this.isConfirmable(fs.feature)) continue;
      const dx = fs.feature.x - this.playerX;
      const dy = fs.feature.z - this.playerY;
      const dist = Math.hypot(dx, dy);
      if (dist < this.CONFIRM_RADIUS && dist < bestDist) {
        best = fs.feature;
        bestDist = dist;
      }
    }
    return best;
  }

  private nearestNpc(): NPC | null {
    let best: NPC | null = null;
    let bestDist = Infinity;
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.x - this.playerX, npc.z - this.playerY);
      if (d < this.CONFIRM_RADIUS && d < bestDist) {
        best = npc;
        bestDist = d;
      }
    }
    return best;
  }

  private checkInteractions(): void {
    if (!this.zone) return;

    // 1) Auto-pickup / auto-complete features that do NOT need confirmation
    for (const fs of this.features) {
      if (fs.state === 'completed') continue;
      if (this.isConfirmable(fs.feature)) continue; // handled by confirm path
      const dx = fs.feature.x - this.playerX;
      const dy = fs.feature.z - this.playerY;
      if (dx * dx + dy * dy < INTERACT_RADIUS * INTERACT_RADIUS / (WORLD_SCALE * WORLD_SCALE)) {
        if (fs.feature.type === 'scent_post' || fs.feature.type === 'fire_hydrant' || fs.feature.type === 'bridge' || fs.feature.type === 'fountain' || fs.feature.type === 'water') {
          fs.state = 'completed';
          continue;
        }
        this.onFeatureInteract?.(fs.feature);
        fs.state = 'completed';
      }
    }

    // 2) E/Space-confirm path: enter/trigger the nearest threat or gate
    const target = this.nearestConfirmable();
    this.pendingInteract = target; // drives the "press E" prompt render

    // NPCs also require E/Space confirmation (no more accidental trigger on walk-by)
    const npcTarget = this.nearestNpc();
    this.pendingNpc = npcTarget;

    if ((target || npcTarget) && (this.interactKeyHeld() || this.interactQueued)) {
      if (target) {
        const fs = this.features.find(f => f.feature === target && f.state === 'active');
        if (target.type === 'return_gate') {
          this.onReturnGate?.(this.zone.returnZone ?? '');
        } else {
          this.onFeatureInteract?.(target);
        }
        if (fs) fs.state = 'completed';
      } else if (npcTarget) {
        this.onNpcInteract?.(npcTarget);
      }
      this.pendingInteract = null;
      this.pendingNpc = null;
      this.interactQueued = false;
    }
  }

  // ===== Render Helpers =====

  private renderObstacle(ob: Obstacle, sx: number, sy: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    switch (ob.type) {
      case 'tree': {
        // Trunk
        ctx.fillStyle = ob.trunkColor ?? '#5a3a1a';
        ctx.fillRect(sx - 3, sy - 8, 6, 16);
        // Canopy
        ctx.fillStyle = ob.leafColor ?? '#2d5a1e';
        ctx.beginPath();
        ctx.arc(sx, sy - 12, 14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bush': {
        ctx.fillStyle = ob.color ?? '#2d6a1e';
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bench': {
        ctx.fillStyle = ob.color ?? '#8B6914';
        ctx.fillRect(sx - (ob.width ?? 2) * WORLD_SCALE * 0.5, sy - 4, (ob.width ?? 2) * WORLD_SCALE, 8);
        break;
      }
      case 'fence': {
        ctx.fillStyle = ob.color ?? '#8B4513';
        const w = (ob.width ?? 6) * WORLD_SCALE;
        ctx.fillRect(sx - w / 2, sy - 3, w, 6);
        // Posts
        ctx.fillStyle = '#6a3a1a';
        for (let i = -w / 2; i <= w / 2; i += 20) {
          ctx.fillRect(sx + i - 2, sy - 6, 4, 12);
        }
        break;
      }
    }
  }

  private renderFeature(feature: Feature, sx: number, sy: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const colors: Record<string, string> = {
      scent_post: '#8bc34a',
      water_bowl: '#00bcd4',
      fire_hydrant: '#f44336',
      treasure: '#ffd700',
      lure: '#ff6b35',
      return_gate: '#9e9e9e',
      fountain: '#4fc3f7',
      bridge: '#8d6e63',
      cave_entrance: '#4a4a4a',
      secret_passage: '#7c4dff',
      water: '#4fc3f7',
      dog_show: '#ffb300',
      gate: '#4a9eff',
      here: '#ff9f43',
    };

    const color = colors[feature.type] ?? '#cccccc';
    const size = 14;

    // Zone gates get a taller, inviting portal-arch look
    if (feature.type === 'gate' || feature.type === 'return_gate') {
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(sx - size - 4, sy - 6, 5, size + 6);
      ctx.fillRect(sx + size - 1, sy - 6, 5, size + 6);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(sx, sy - 6, size + 4, Math.PI, 0);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, size + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, size + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(feature.label, sx, sy - size - 10);
    ctx.fillText(feature.label, sx, sy - size - 10);
  }

  private renderDog(sx: number, sy: number, color: string, accent: string, facing: number, name: string): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head (offset in facing direction)
    const hx = sx + Math.cos(facing) * 10;
    const hy = sy + Math.sin(facing) * 10 - 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(hx - 4, hy - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx + 4, hy - 5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Name label
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeText(name, sx, sy + 24);
    ctx.fillText(name, sx, sy + 24);
  }

  // ===== Input =====

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keysPressed.add(key);
    if (key === 'e' || key === ' ') {
      this.interactQueued = true;
      e.preventDefault();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysPressed.delete(e.key.toLowerCase());
  }
}
