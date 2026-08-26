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
// World magnification on screen (render spread). Also scales the INTERACT_RADIUS
// trigger in world terms so the world-space trigger distance is constant no
// matter the visual spread (otherwise a bigger SPREAD = trigger fires farther).
const SPREAD = 3.0;
const HORIZON_Y = 0.5; // fraction of canvas height where sky meets ground
const PLAYER_SCREEN_Y = 0.8; // fraction of canvas height the player anchors to,
  // i.e. in the lower ground band so grounded objects read as "on the ground"
  // rather than floating above the horizon. (Perspective fix for the M2 band.)

// ===== Small helpers for background / obstacle drawing =====

/** Deterministic PRNG (mulberry32) so background detail is stable per zone. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function clamp255(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }

/** Mix a hex color toward white (amt>0) or black (amt<0). amt in -1..1. */
function shade(hex: string, amt: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const t = amt < 0 ? 0 : 255;
  const a = Math.abs(amt);
  return `rgb(${clamp255(r + (t - r) * a)}, ${clamp255(g + (t - g) * a)}, ${clamp255(b + (t - b) * a)})`;
}

interface GroundSpot { x: number; y: number; r: number; c: string; }
interface BgDetail { spots: GroundSpot[]; }

type ZoneVariant = 'park' | 'forest' | 'beach' | 'lake' | 'mountain' | 'waterfall' | 'cave' | 'secret' | 'default';
function zoneVariant(zoneId: string): ZoneVariant {
  if (/forest|park_secret|waterfall_exit/.test(zoneId)) return 'forest';
  if (/beach/.test(zoneId)) return 'beach';
  if (/lake/.test(zoneId)) return 'lake';
  if (/mountain/.test(zoneId)) return 'mountain';
  if (/waterfall|wf_/.test(zoneId)) return 'waterfall';
  if (/cave|secret/.test(zoneId)) return 'cave';
  if (/suburban|dog_park/.test(zoneId)) return 'park';
  return 'default';
}

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

  // Background detail (7.1) — precomputed once per zone, stable + cheap.
  private bgDetail: BgDetail | null = null;
  private silhouette: Path2D | null = null;

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

    // Precompute background detail (7.1) once per zone.
    this.buildBackground();

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

    this.renderBackground(ctx, W, H);

    // World-to-screen: anchor the player into the lower ground band so grounded
    // objects (NPCs, gates, treats, items) sit on the ground plane, and spread
    // world content radially (SPREAD) so items are less crowded = more gameplay
    // space. Movement / collision / interact math are unaffected (world units).
    const playerScreenY = H * PLAYER_SCREEN_Y;
    const toScreenX = (wx: number) => W / 2 + (wx - this.playerX) * WORLD_SCALE * SPREAD;
    const toScreenY = (wy: number) => playerScreenY + (wy - this.playerY) * WORLD_SCALE * SPREAD;

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

    // Player (anchored in the lower ground band so it reads as on the ground)
    this.renderDog(W / 2, playerScreenY, this.playerColor, this.playerAccent, this.playerFacing, 'You');

    // "Press E" prompt when standing at a confirmable threat/gate or an NPC
    const promptTarget = this.pendingInteract?.label ?? (this.pendingNpc ? this.pendingNpc.name : null);
    if (promptTarget) {
      ctx.fillStyle = 'rgba(10,10,25,0.85)';
      const label = `Press [E] / [Space] — ${promptTarget}`;
      ctx.font = 'bold 15px sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillRect(W / 2 - tw / 2 - 14, playerScreenY - 52, tw + 28, 30);
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      ctx.fillText(label, W / 2, playerScreenY - 32);
    }
  }

  // ===== 7.1: Layered zone backgrounds =====

  /** Precompute per-zone background detail (ground spots + silhouette Path2D). */
  private buildBackground(): void {
    const zone = this.zone!;
    const variant = zoneVariant(zone.id);
    const rng = seededRandom(hashString(zone.id));
    const ground = zone.groundColor ?? '#4a7c3f';

    // Ground detail spots — a bounded, deterministic scatter. Drawn in screen
    // space per frame (cheap: < 40 arcs), positions fixed for the zone.
    const spots: GroundSpot[] = [];
    const count = variant === 'forest' || variant === 'beach' ? 34 : 22;
    const light = shade(ground, 0.18);
    const dark = shade(ground, -0.22);
    for (let i = 0; i < count; i++) {
      const x = rng();
      const y = 0.52 + rng() * 0.46; // keep spots in the ground band
      const r = 3 + rng() * 9;
      const c = rng() > 0.5 ? light : dark;
      spots.push({ x, y, r, c });
    }
    this.bgDetail = { spots };

    // Horizon silhouette (parallax band) as a Path2D in a 0..1 x, 0..1 y space,
    // scaled at render time so it survives resizes without recomputation.
    this.silhouette = this.buildSilhouette(variant, rng);
  }

  private buildSilhouette(variant: ZoneVariant, rng: () => number): Path2D {
    const p = new Path2D();
    const horizon = HORIZON_Y;
    const bandH = 0.10; // silhouette height as fraction of canvas
    p.moveTo(0, horizon);
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      let h = 0;
      switch (variant) {
        case 'forest':
        case 'mountain':
          h = bandH * (0.4 + 0.6 * Math.abs(Math.sin(x * Math.PI * 3 + rng())));
          break;
        case 'waterfall':
          h = bandH * (0.3 + 0.25 * rng());
          break;
        case 'lake':
        case 'beach':
          h = bandH * 0.22;
          break;
        default:
          h = bandH * (0.35 + 0.4 * rng());
      }
      p.lineTo(x, horizon - h);
    }
    p.lineTo(1, horizon);
    p.closePath();
    return p;
  }

  /** Draw sky gradient + silhouette + ground + seeded detail (7.1). */
  private renderBackground(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const zone = this.zone!;
    const sky = zone.skyColor ?? '#87CEEB';
    const ground = zone.groundColor ?? '#4a7c3f';
    const horizon = H * HORIZON_Y;

    // Sky: vertical gradient (sky -> near-white at horizon) for depth.
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    skyGrad.addColorStop(0, sky);
    skyGrad.addColorStop(1, shade(sky, 0.45));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, horizon + 1);

    // Parallax silhouette band (0.15x camera) — gives a horizon without text.
    if (this.silhouette) {
      const off = ((this.playerX * WORLD_SCALE) * 0.15) % (W * 0.5);
      ctx.save();
      ctx.translate(-off, 0);
      ctx.scale(W, H);
      ctx.fillStyle = shade(ground, -0.45);
      ctx.globalAlpha = 0.55;
      ctx.fill(this.silhouette);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Ground: base fill with a subtle vertical gradient for depth.
    const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
    groundGrad.addColorStop(0, shade(ground, 0.06));
    groundGrad.addColorStop(1, shade(ground, -0.12));
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizon, W, H - horizon);

    // Seeded ground detail (mowed stripes / tufts / speckles / ripples).
    if (this.bgDetail) {
      ctx.globalAlpha = 0.5;
      for (const s of this.bgDetail.spots) {
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Soft radial vignette for depth (replaces the removed fog, tastefully).
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
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
    this.bgDetail = null;
    this.silhouette = null;
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
      if (dx * dx + dy * dy < INTERACT_RADIUS * INTERACT_RADIUS / (WORLD_SCALE * WORLD_SCALE * SPREAD * SPREAD)) {
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

    // Shared soft ground shadow (7.6) — grounds the object.
    const w = (ob.width ?? 2) * WORLD_SCALE;
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 6, Math.max(10, w * 0.4), 6, 0, 0, Math.PI * 2);
    ctx.fill();

    switch (ob.type) {
      case 'tree': {
        const leaf = ob.leafColor ?? '#2d5a1e';
        const trunk = ob.trunkColor ?? '#5a3a1a';
        // Tapered trunk (polygon, not rect)
        ctx.fillStyle = trunk;
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy + 4);
        ctx.lineTo(sx + 4, sy + 4);
        ctx.lineTo(sx + 2, sy - 12);
        ctx.lineTo(sx - 2, sy - 12);
        ctx.closePath();
        ctx.fill();
        // 3 overlapping canopy circles of varying size
        ctx.fillStyle = leaf;
        ctx.beginPath(); ctx.arc(sx - 6, sy - 14, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(leaf, 0.12);
        ctx.beginPath(); ctx.arc(sx + 6, sy - 16, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(leaf, 0.22);
        ctx.beginPath(); ctx.arc(sx, sy - 22, 12, 0, Math.PI * 2); ctx.fill();
        // Highlight arc on top
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy - 22, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        break;
      }
      case 'bush': {
        const c = ob.color ?? '#2d6a1e';
        // 3 overlapping circles (cluster)
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(sx - 7, sy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(c, 0.14);
        ctx.beginPath(); ctx.arc(sx + 7, sy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(c, 0.26);
        ctx.beginPath(); ctx.arc(sx, sy - 5, 10, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'bench': {
        const wood = ob.color ?? '#8B6914';
        // Legs
        ctx.fillStyle = shade(wood, -0.35);
        ctx.fillRect(sx - w * 0.35, sy - 2, 4, 10);
        ctx.fillRect(sx + w * 0.35 - 4, sy - 2, 4, 10);
        // Seat
        ctx.fillStyle = wood;
        ctx.fillRect(sx - w / 2, sy - 6, w, 6);
        // Backrest
        ctx.fillStyle = shade(wood, -0.15);
        ctx.fillRect(sx - w / 2, sy - 16, w, 4);
        ctx.fillRect(sx - w / 2, sy - 16, 3, 12);
        ctx.fillRect(sx + w / 2 - 3, sy - 16, 3, 12);
        break;
      }
      case 'fence': {
        const wood = ob.color ?? '#8B4513';
        // Two horizontal rails
        ctx.fillStyle = shade(wood, -0.15);
        ctx.fillRect(sx - w / 2, sy - 4, w, 3);
        ctx.fillRect(sx - w / 2, sy + 1, w, 3);
        // Posts (rounded tops) with a slight per-post gradient
        for (let i = -w / 2; i <= w / 2; i += 20) {
          const pg = ctx.createLinearGradient(sx + i, 0, sx + i + 4, 0);
          pg.addColorStop(0, wood);
          pg.addColorStop(1, shade(wood, -0.3));
          ctx.fillStyle = pg;
          ctx.fillRect(sx + i - 2, sy - 8, 4, 16);
          ctx.beginPath(); ctx.arc(sx + i, sy - 8, 2, Math.PI, 0); ctx.fill();
        }
        break;
      }
      case 'flower': {
        // Stem
        ctx.strokeStyle = '#2d6a1e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy + 2); ctx.lineTo(sx, sy - 12); ctx.stroke();
        // Petals
        const petal = ob.color ?? '#e91e63';
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 2.5) {
          ctx.fillStyle = petal;
          ctx.beginPath();
          ctx.ellipse(sx + Math.cos(a) * 5, sy - 14 + Math.sin(a) * 5, 4, 2.5, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath(); ctx.arc(sx, sy - 14, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'rock': {
        const c = ob.color ?? '#8a8a8a';
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(sx - 9, sy + 3);
        ctx.lineTo(sx - 5, sy - 6);
        ctx.lineTo(sx + 3, sy - 8);
        ctx.lineTo(sx + 9, sy - 1);
        ctx.lineTo(sx + 6, sy + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(c, 0.2);
        ctx.beginPath(); ctx.arc(sx - 2, sy - 4, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'lamp_post': {
        // Pole
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(sx - 2, sy - 22, 4, 26);
        ctx.fillRect(sx - 6, sy + 2, 12, 4);
        // Glowing head
        ctx.fillStyle = '#fff59d';
        ctx.beginPath(); ctx.arc(sx, sy - 24, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,245,157,0.25)';
        ctx.beginPath(); ctx.arc(sx, sy - 24, 9, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'crystal': {
        const c = ob.color ?? '#7c4dff';
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 16);
        ctx.lineTo(sx + 7, sy - 4);
        ctx.lineTo(sx, sy + 2);
        ctx.lineTo(sx - 7, sy - 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.lineTo(sx - 2, sy - 4); ctx.lineTo(sx, sy + 2); ctx.closePath(); ctx.fill();
        break;
      }
      default:
        break;
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
