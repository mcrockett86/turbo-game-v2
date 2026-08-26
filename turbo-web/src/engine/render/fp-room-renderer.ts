/**
 * FP Room Renderer — First-Person room navigation in top-down Canvas 2D
 * 
 * Renders rooms as flat maps with:
 * - Floor/walls as rectangles
 * - Features (interactive objects) as labeled shapes
 * - Exits as door markers with arrows
 * - Player position tracking
 * - WASD movement within room bounds
 */

import { BaseRenderer } from './base-renderer';
import type { Room, RoomFeature } from '@/types';

interface ExitMarker {
  roomId: string;
  roomName: string;
  wallSide: 'north' | 'south' | 'east' | 'west';
  x: number;
  y: number;
  // true when this exit is an entrance/portal into another zone
  isZoneGate: boolean;
}

export class FpRoomRenderer extends BaseRenderer {
  private room: Room | null = null;
  private zoneRooms: Room[] | null = null; // all rooms in the zone (for name lookup + geometry)
  private playerX = 0;
  private playerY = 0;
  private features: Map<string, { feature: RoomFeature; state: 'active' | 'locked' | 'completed' }> = new Map();
  private exits: ExitMarker[] = [];

  // Movement
  private keysPressed: Set<string> = new Set();
  private moveSpeed = 90; // world-units per second (tuned to cross a ~150u room in ~1.5s)

  // Door interaction (walk-into-wall + E/Space) state
  private doorTouchExit: ExitMarker | null = null;
  private doorTouchTime = 0; // seconds of continuous contact with the same door
  private interactQueued = false; // E/Space pressed while at a door
  private readonly DOOR_HOVER_RADIUS = 40; // world units
  private readonly DOOR_TOUCH_HOLD_S = 0.4; // hold-to-enter time at a wall

  // Zone-specific threat that fires when confirming (E/Space) at the zone's exit door
  private doorThreatId: string | null = null;
  setDoorThreat(threatId: string | null): void {
    this.doorThreatId = threatId;
  }

  // Callbacks
  onFeatureClick?: (featureId: string) => void;
  onFeatureInteract?: (feature: RoomFeature) => void;
  onExitClick?: (roomId: string) => void;
  onExitInteract?: (roomId: string) => void;
  onDoorThreat?: (threatId: string) => void;

  private readonly FEATURE_HOVER_RADIUS = 24; // world units to be "at" a feature
  private featureInteractQueued = false; // E/Space tapped while at a feature
  
  // Setup listeners for keyboard input + mouse clicks
  private boundKeyDown = this.onKeyDown.bind(this);
  private boundKeyUp = this.onKeyUp.bind(this);
  private boundMouseDown = this.onMouseDown.bind(this);

  /** Expose the zone's rooms so exits can be named + geometry-mapped. */
  setZoneRooms(rooms: Room[] | null): void {
    this.zoneRooms = rooms;
  }

  protected onInit(data?: unknown): void {
    if (!data || !this.canvas || !this.ctx) return;

    const roomData = data as Room;
    this.room = roomData;

    // Initialize player position to center of room
    this.playerX = roomData.w / 2;
    this.playerY = roomData.d / 2;

    // Parse features from room data
    if (roomData.features) {
      roomData.features.forEach((feature, index) => {
        const featureId = `${roomData.id}_${index}`;
        this.features.set(featureId, { feature, state: 'active' });
      });
    }

    // Parse exits from room data
    if (roomData.exits) {
      this.parseExits(roomData);
    }

    // Reset door-interaction state for this room
    this.doorTouchExit = null;
    this.doorTouchTime = 0;
    this.interactQueued = false;

    // Setup keyboard + mouse listeners
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
  }
  
  private parseExits(room: Room): void {
    const roomWidth = room.w;
    const roomDepth = room.d;

    // Place exits around the perimeter in order (clockwise from north) so each
    // exit lands on a distinct, predictable wall. Rooms have no stored positions,
    // so this is the most reliable way to spread multiple exits apart.
    const sideForIndex = (i: number): 'north' | 'east' | 'south' | 'west' => {
      const mod = ((i % 4) + 4) % 4;
      if (mod === 0) return 'north';
      if (mod === 1) return 'east';
      if (mod === 2) return 'south';
      return 'west';
    };

    room.exits.forEach((exitId, index) => {
      const wallSide = sideForIndex(index);
      const x = wallSide === 'east' ? roomWidth : wallSide === 'west' ? 0 : roomWidth / 2;
      const y = wallSide === 'south' ? roomDepth : wallSide === 'north' ? 0 : roomDepth / 2;

      // If a real adjacent room exists in the zone, this is a normal room exit.
      const adjacent = this.zoneRooms?.find(r => r.id === exitId);
      const isZoneGate = !adjacent;

      this.exits.push({
        roomId: exitId,
        roomName: this.roomName(exitId),
        wallSide,
        x,
        y,
        isZoneGate,
      });
    });
  }
  
  private roomName(roomId: string): string {
    const match = this.zoneRooms?.find(r => r.id === roomId);
    return match?.name ?? roomId;
  }
  
  protected onUpdate(delta: number, _time: number): void {
    if (!this.room || !this.canvas) return;

    this.updateMovement(delta);
    this.updateDoorInteraction(delta);
    this.checkFeatureClicks();
  }

  /**
   * Door interaction: if the player is standing at (or touching) a wall that
   * has an exit, they can enter it two ways:
   *  - Hold position at the wall for DOOR_TOUCH_HOLD_S (walk-into-wall), or
   *  - Press E / Space while within the door's hover radius.
   * Fires onExitInteract with the exit's room id.
   */
  private updateDoorInteraction(delta: number): void {
    if (!this.room || this.exits.length === 0) {
      this.doorTouchExit = null;
      this.doorTouchTime = 0;
      return;
    }

    // Find the nearest exit within hover range
    let nearest: ExitMarker | null = null;
    let nearestDist = Infinity;
    for (const exit of this.exits) {
      const dx = this.playerX - exit.x;
      const dy = this.playerY - exit.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.DOOR_HOVER_RADIUS && dist < nearestDist) {
        nearest = exit;
        nearestDist = dist;
      }
    }

    // Also count "touching the wall" (player clamped against a boundary that
    // has an exit) as being at that door. The movement clamp keeps the player
    // ~15 units off the boundary, so treat anything within that pad as touching.
    if (!nearest) {
      const pad = 18; // just inside the clamped boundary
      for (const exit of this.exits) {
        let touching = false;
        if (exit.wallSide === 'north' && this.playerY <= pad) touching = true;
        if (exit.wallSide === 'south' && this.playerY >= this.room.d - pad) touching = true;
        if (exit.wallSide === 'west' && this.playerX <= pad) touching = true;
        if (exit.wallSide === 'east' && this.playerX >= this.room.w - pad) touching = true;
        if (touching) {
          nearest = exit;
          break;
        }
      }
    }

    if (!nearest) {
      this.doorTouchExit = null;
      this.doorTouchTime = 0;
      return;
    }

    // Accumulate hold time only for the same door
    if (this.doorTouchExit === nearest) {
      this.doorTouchTime += delta;
    } else {
      this.doorTouchExit = nearest;
      this.doorTouchTime = 0;
    }

    const shouldEnter = this.interactKeyHeld() || this.interactQueued || this.doorTouchTime >= this.DOOR_TOUCH_HOLD_S;
    if (shouldEnter) {
      this.doorTouchTime = 0;
      this.doorTouchExit = null;
      // E/Space while a door-threat is active -> trigger the threat (stay in this room)
      if (this.interactKeyHeld() && this.doorThreatId) {
        this.interactQueued = false;
        this.onDoorThreat?.(this.doorThreatId);
        this.doorThreatId = null; // one-shot
        return;
      }
      this.interactQueued = false;
      const exitId = nearest.roomId;
      this.onExitInteract?.(exitId);
    }
  }

  /** True when E or Space is currently held. */
  private interactKeyHeld(): boolean {
    return this.keysPressed.has('e') || this.keysPressed.has(' ');
  }
  
  private updateMovement(delta: number): void {
    if (!this.room || !this.canvas) return;
    
    const moveAmount = this.moveSpeed * delta;
    let newX = this.playerX;
    let newY = this.playerY;
    
    // Apply keyboard input
    if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) {
      newY -= moveAmount;
    }
    if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) {
      newY += moveAmount;
    }
    if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) {
      newX -= moveAmount;
    }
    if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) {
      newX += moveAmount;
    }
    
    // Clamp to room bounds with padding for player size
    const playerRadius = 15; // Visual radius of player
    const padding = playerRadius;
    
    newX = Math.max(padding, Math.min(this.room.w - padding, newX));
    newY = Math.max(padding, Math.min(this.room.d - padding, newY));
    
    this.playerX = newX;
    this.playerY = newY;
  }
  
  private checkFeatureClicks(): void {
    // Proximity E/Space interaction for non-item features (e.g. "New Friend" in
    // the kennels, locked doors). Items are still auto-pickup on touch, and
    // clicking any feature works as before.
    if (this.featureInteractQueued) {
      this.featureInteractQueued = false;
      this.triggerNearestFeature();
    }
  }

  /**
   * If the player is standing within FEATURE_HOVER_RADIUS of a non-item
   * feature and holds E/Space, fire onFeatureInteract and mark it complete.
   */
  private triggerNearestFeature(): void {
    if (!this.interactKeyHeld()) return;
    const px = this.playerX;
    const py = this.playerY;
    let best: { id: string; feature: RoomFeature } | null = null;
    let bestDist = Infinity;
    for (const [id, data] of this.features) {
      if (data.state !== 'active') continue;
      if (data.feature.type === 'item') continue; // items auto-pickup on touch
      const d = Math.hypot(data.feature.x - px, data.feature.y - py);
      if (d < this.FEATURE_HOVER_RADIUS && d < bestDist) {
        best = { id, feature: data.feature };
        bestDist = d;
      }
    }
    if (best) {
      this.onFeatureInteract?.(best.feature);
      this.features.get(best.id)!.state = 'completed';
    }
  }
  
  protected onRender(): void {
    if (!this.ctx || !this.room || !this.canvas) return;

    this.renderRoom();
    this.renderFeatures();
    this.renderExits();
    this.renderPlayer();
    this.renderVignette();
  }

  private renderRoom(): void {
    if (!this.ctx || !this.room || !this.canvas) return;
    const ctx = this.ctx;
    const room = this.room;

    const scale = this.roomScale();
    const offsetX = (this.cssWidth - room.w * scale) / 2;
    const offsetY = (this.cssHeight - room.d * scale) / 2;
    const rw = room.w * scale;
    const rh = room.d * scale;
    const wall = 10; // wall thickness (px)
    const x = offsetX, y = offsetY;

    // Floor: two-tone checkerboard (room color + 8% lighter), ~8 tiles across.
    const tile = Math.max(10, Math.min(rw, rh) / 10);
    const base = room.color;
    const light = this.shadeColor(base, 0.08);
    const cols = Math.ceil(rw / tile);
    const rows = Math.ceil(rh / tile);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? base : light;
        const tx = x + c * tile;
        const ty = y + r * tile;
        const tw = Math.min(tile, x + rw - tx);
        const th = Math.min(tile, y + rh - ty);
        if (tw > 0 && th > 0) ctx.fillRect(tx, ty, tw, th);
      }
    }

    // Walls: thick filled rects with a 3-D top face (pseudo-extrusion).
    const face = this.shadeColor(base, -0.45);   // wall face (dark)
    const top = this.shadeColor(base, -0.25);    // wall top (lighter)
    const topH = 5;                              // top-face strip height (px)
    // North wall
    ctx.fillStyle = face; ctx.fillRect(x - wall, y - wall, rw + wall * 2, wall);
    ctx.fillStyle = top;  ctx.fillRect(x - wall, y - wall, rw + wall * 2, topH);
    // South wall
    ctx.fillStyle = face; ctx.fillRect(x - wall, y + rh, rw + wall * 2, wall);
    ctx.fillStyle = top;  ctx.fillRect(x - wall, y + rh, rw + wall * 2, topH);
    // West wall
    ctx.fillStyle = face; ctx.fillRect(x - wall, y, wall, rh);
    // East wall
    ctx.fillStyle = face; ctx.fillRect(x + rw, y, wall, rh);

    // Baseboards: light strips at the floor/wall junction (inside edges).
    ctx.fillStyle = this.shadeColor(base, 0.22);
    ctx.fillRect(x, y, rw, 2);                  // north
    ctx.fillRect(x, y + rh - 2, rw, 2);         // south
    ctx.fillRect(x, y, 2, rh);                  // west
    ctx.fillRect(x + rw - 2, y, 2, rh);         // east

    // Room name at top
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(room.name, this.cssWidth / 2, y - wall - 8);
  }

  /** Radial vignette for depth (replaces the removed full-screen fog). */
  private renderVignette(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const W = this.cssWidth, H = this.cssHeight;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /** Mix a hex color toward white (amt>0) or black (amt<0). amt in -1..1. */
  private shadeColor(hex: string, amt: number): string {
    const m = (hex || '#888888').replace('#', '');
    const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.padEnd(6, '0');
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    const t = amt < 0 ? 0 : 255;
    const a = Math.abs(amt);
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (t - v) * a)));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }

  /** Compute the uniform scale factor that fits the room into ~80% of the canvas. */
  private roomScale(): number {
    if (!this.canvas || !this.room) return 1;
    const maxW = this.cssWidth * 0.8;
    const maxH = this.cssHeight * 0.8;
    return Math.min(maxW / this.room.w, maxH / this.room.d);
  }

  /** Convert a world (room) coordinate to canvas pixel coordinate. */
  private toCanvasX(wx: number): number {
    if (!this.canvas || !this.room) return wx;
    const scale = this.roomScale();
    const offsetX = (this.cssWidth - this.room.w * scale) / 2;
    return offsetX + wx * scale;
  }

  private toCanvasY(wy: number): number {
    if (!this.canvas || !this.room) return wy;
    const scale = this.roomScale();
    const offsetY = (this.cssHeight - this.room.d * scale) / 2;
    return offsetY + wy * scale;
  }

  /** Convert a canvas CSS-pixel coordinate to world (room) coordinate. */
  private toWorldX(cx: number): number {
    if (!this.canvas || !this.room) return cx;
    const scale = this.roomScale();
    const offsetX = (this.cssWidth - this.room.w * scale) / 2;
    return (cx - offsetX) / scale;
  }

  private toWorldY(cy: number): number {
    if (!this.canvas || !this.room) return cy;
    const scale = this.roomScale();
    const offsetY = (this.cssHeight - this.room.d * scale) / 2;
    return (cy - offsetY) / scale;
  }
  
  private renderFeatures(): void {
    if (!this.ctx || !this.room) return;
    const ctx = this.ctx;
    const scale = this.roomScale();

    this.features.forEach((data, featureId) => {
      const { feature } = data;
      const x = this.toCanvasX(feature.x);
      const y = this.toCanvasY(feature.y);
      const base = Math.max(feature.w || 30, feature.h || 30) * scale; // footprint (px)

      // Soft shadow grounds the object
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, y + base * 0.35, base * 0.5, base * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      this.renderFeatureSprite(ctx, feature, x, y, base, scale);

      // Label pill above the object
      if (feature.label) {
        ctx.font = '11px sans-serif';
        const lw = ctx.measureText(feature.label).width;
        const pw = lw + 10, ph = 15, px = x - pw / 2, py = y - base * 0.5 - ph - 4;
        ctx.fillStyle = 'rgba(10,10,25,0.8)';
        ctx.beginPath();
        (ctx as any).roundRect ? (ctx as any).roundRect(px, py, pw, ph, 5) : ctx.rect(px, py, pw, ph);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(feature.label, x, py + ph / 2);
        ctx.textBaseline = 'alphabetic';
      }
    });
  }

  /**
   * 7.3 per-type feature sprite. `x,y` is the screen center, `base` is the
   * footprint in px, `scale` is the room scale. Drawn to read as a distinct
   * object rather than a flat colored rect.
   */
  private renderFeatureSprite(ctx: CanvasRenderingContext2D, f: RoomFeature, x: number, y: number, base: number, scale: number): void {
    const c = this.getFeatureColor(f.type);
    const u = base / 30; // normalize a 30px reference footprint
    const now = performance.now();

    switch (f.type) {
      case 'food': {
        // Plate (white ellipse) + kibble dots
        ctx.fillStyle = '#f5f5f5';
        ctx.beginPath(); ctx.ellipse(x, y + 2 * u, 14 * u, 9 * u, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, -0.1);
        for (const [dx, dy, r] of [[-4, -1, 3], [3, -3, 2.5], [1, 3, 2.5], [-2, 4, 2]] as const) {
          ctx.beginPath(); ctx.arc(x + dx * u, y + dy * u, r * u, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'hint': {
        // Open book (two trapezoids) with a ribbon
        ctx.fillStyle = '#fff8e1';
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x - 12 * u, y - 8 * u); ctx.lineTo(x - 12 * u, y + 8 * u); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + 12 * u, y - 8 * u); ctx.lineTo(x + 12 * u, y + 8 * u); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = this.shadeColor(c, -0.2); ctx.lineWidth = 1.5 * u;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 8 * u); ctx.stroke();
        ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.moveTo(x, y - 2 * u); ctx.lineTo(x, y + 12 * u); ctx.stroke();
        break;
      }
      case 'tv': {
        // Rounded screen + glow + speakers + stand
        ctx.fillStyle = '#263238';
        const w = 22 * u, h = 15 * u;
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - w / 2, y - h / 2, w, h, 2 * u) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
        const glow = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        glow.addColorStop(0, this.shadeColor(c, 0.4)); glow.addColorStop(1, this.shadeColor(c, -0.1));
        ctx.fillStyle = glow;
        ctx.fillRect(x - w / 2 + 2 * u, y - h / 2 + 2 * u, w - 4 * u, h - 4 * u);
        ctx.fillStyle = '#90a4ae';
        ctx.fillRect(x - 3 * u, y + h / 2, 6 * u, 3 * u); // stand
        break;
      }
      case 'fountain':
      case 'water': {
        // Circular basin (concentric) + water + droplet arcs
        ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.arc(x, y, 15 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, 0.25); ctx.beginPath(); ctx.arc(x, y, 12 * u, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5 * u;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 7 * u, y + Math.sin(a) * 7 * u, 2 * u, a, a + Math.PI); ctx.stroke();
        }
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3 * u, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'water_bowl': {
        // Half-circle bowl + water ellipse inside
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 13 * u, 0, Math.PI); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, 0.3); ctx.beginPath(); ctx.ellipse(x, y, 11 * u, 4 * u, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'fire_hydrant': {
        // Rounded body + dome cap + 2 side nozzles
        ctx.fillStyle = c;
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 6 * u, y - 8 * u, 12 * u, 16 * u, 4 * u) : ctx.rect(x - 6 * u, y - 8 * u, 12 * u, 16 * u); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 8 * u, 6 * u, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 9 * u, y, 3 * u, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 9 * u, y, 3 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, -0.2); ctx.beginPath(); ctx.arc(x, y - 12 * u, 2.5 * u, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'scent_post': {
        // Wooden post + flag
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(x - 2 * u, y - 14 * u, 4 * u, 20 * u);
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x + 2 * u, y - 14 * u); ctx.lineTo(x + 12 * u, y - 10 * u); ctx.lineTo(x + 2 * u, y - 6 * u); ctx.closePath(); ctx.fill();
        break;
      }
      case 'treasure': {
        // Chest (rounded rect + lid) + pulsing gold shimmer
        ctx.fillStyle = this.shadeColor(c, -0.3);
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 12 * u, y - 6 * u, 24 * u, 14 * u, 3 * u) : ctx.rect(x - 12 * u, y - 6 * u, 24 * u, 14 * u); ctx.fill();
        ctx.fillStyle = c;
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 12 * u, y - 12 * u, 24 * u, 8 * u, 3 * u) : ctx.rect(x - 12 * u, y - 12 * u, 24 * u, 8 * u); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, -0.4); ctx.fillRect(x - 2 * u, y - 4 * u, 4 * u, 6 * u); // lock
        const shim = 0.5 + 0.5 * Math.sin(now / 250);
        ctx.globalAlpha = 0.3 + 0.4 * shim;
        ctx.fillStyle = '#fff59d';
        ctx.beginPath(); ctx.arc(x, y - 14 * u, 2.5 * u, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'person': {
        // Head circle + shoulders trapezoid (bust)
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x - 12 * u, y + 10 * u); ctx.lineTo(x - 6 * u, y); ctx.lineTo(x + 6 * u, y); ctx.lineTo(x + 12 * u, y + 10 * u); ctx.closePath(); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, 0.15); ctx.beginPath(); ctx.arc(x, y - 6 * u, 7 * u, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'dog_friend': {
        // Small dog silhouette + a heart
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(x, y, 11 * u, 7 * u, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 8 * u, y - 5 * u, 5 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, -0.15);
        ctx.beginPath(); ctx.arc(x + 5 * u, y - 8 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 11 * u, y - 8 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff5252';
        ctx.beginPath();
        const hx = x, hy = y - 16 * u, hr = 3 * u;
        ctx.moveTo(hx, hy + hr); ctx.bezierCurveTo(hx - hr * 2, hy - hr, hx - hr, hy - hr * 2, hx, hy - hr * 0.5);
        ctx.bezierCurveTo(hx + hr, hy - hr * 2, hx + hr * 2, hy - hr, hx, hy + hr); ctx.fill();
        break;
      }
      case 'door':
      case 'locked_door': {
        // Rect door + doorknob; locked adds a chain
        ctx.fillStyle = this.shadeColor(c, -0.15);
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 9 * u, y - 14 * u, 18 * u, 26 * u, 2 * u) : ctx.rect(x - 9 * u, y - 14 * u, 18 * u, 26 * u); ctx.fill();
        ctx.fillStyle = '#ffe082'; ctx.beginPath(); ctx.arc(x + 5 * u, y + 1 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
        if (f.type === 'locked_door') {
          ctx.strokeStyle = '#78909c'; ctx.lineWidth = 2 * u; ctx.setLineDash([3 * u, 2 * u]);
          ctx.beginPath(); ctx.moveTo(x - 9 * u, y); ctx.lineTo(x + 9 * u, y); ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      }
      case 'secret_passage': {
        // Dark rect with a glowing crack
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 12 * u, y - 14 * u, 24 * u, 26 * u, 3 * u) : ctx.rect(x - 12 * u, y - 14 * u, 24 * u, 26 * u); ctx.fill();
        ctx.strokeStyle = '#7c4dff'; ctx.lineWidth = 2 * u; ctx.shadowColor = '#7c4dff'; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(x - 2 * u, y - 12 * u); ctx.lineTo(x + 2 * u, y - 5 * u); ctx.lineTo(x - 1 * u, y + 1 * u); ctx.lineTo(x + 3 * u, y + 8 * u);
        ctx.stroke(); ctx.shadowBlur = 0;
        break;
      }
      case 'gate':
      case 'return_gate': {
        // Two posts + arch
        ctx.fillStyle = '#6a4a2a';
        ctx.fillRect(x - 12 * u, y - 10 * u, 4 * u, 20 * u);
        ctx.fillRect(x + 8 * u, y - 10 * u, 4 * u, 20 * u);
        ctx.strokeStyle = this.shadeColor(c, 0.2); ctx.lineWidth = 4 * u;
        ctx.beginPath(); ctx.arc(x, y - 8 * u, 10 * u, Math.PI, 0); ctx.stroke();
        break;
      }
      case 'cave_entrance': {
        // Dark archway
        ctx.fillStyle = '#0d0d1a';
        ctx.beginPath(); ctx.arc(x, y, 14 * u, Math.PI, 0); ctx.lineTo(x + 14 * u, y + 10 * u); ctx.lineTo(x - 14 * u, y + 10 * u); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 3 * u;
        ctx.beginPath(); ctx.arc(x, y, 14 * u, Math.PI, 0); ctx.stroke();
        break;
      }
      case 'celebration':
      case 'home': {
        // Warm house / celebration arch
        ctx.fillStyle = this.shadeColor(c, -0.1);
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 12 * u, y - 4 * u, 24 * u, 16 * u, 2 * u) : ctx.rect(x - 12 * u, y - 4 * u, 24 * u, 16 * u); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, -0.3);
        ctx.beginPath(); ctx.moveTo(x - 14 * u, y - 4 * u); ctx.lineTo(x, y - 16 * u); ctx.lineTo(x + 14 * u, y - 4 * u); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe082'; ctx.fillRect(x - 3 * u, y + 2 * u, 6 * u, 8 * u); // door
        break;
      }
      case 'mailbox':
      case 'trap': {
        // Mailbox post + box
        ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - 2 * u, y - 6 * u, 4 * u, 14 * u);
        ctx.fillStyle = this.shadeColor(c, -0.1);
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 10 * u, y - 14 * u, 20 * u, 9 * u, 4 * u) : ctx.rect(x - 10 * u, y - 14 * u, 20 * u, 9 * u); ctx.fill();
        break;
      }
      case 'pet_shop': {
        // Shopfront: awning + window
        ctx.fillStyle = this.shadeColor(c, -0.2);
        ctx.fillRect(x - 12 * u, y - 8 * u, 24 * u, 18 * u);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : c; ctx.fillRect(x - 12 * u + i * 6 * u, y - 12 * u, 6 * u, 5 * u); }
        ctx.fillStyle = this.shadeColor(c, 0.3); ctx.fillRect(x - 7 * u, y - 2 * u, 14 * u, 8 * u);
        break;
      }
      case 'lure': {
        // Fishing lure: hook + shiny ball
        ctx.fillStyle = this.shadeColor(c, 0.3); ctx.beginPath(); ctx.arc(x, y - 2 * u, 6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.arc(x, y + 6 * u, 4 * u, 0, Math.PI * 1.4); ctx.stroke();
        break;
      }
      case 'dog_show': {
        // Podium + star
        ctx.fillStyle = this.shadeColor(c, -0.15);
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 12 * u, y, 24 * u, 10 * u, 2 * u) : ctx.rect(x - 12 * u, y, 24 * u, 10 * u); ctx.fill();
        ctx.fillStyle = '#ffd700';
        this.star(ctx, x, y - 8 * u, 6 * u);
        break;
      }
      case 'here': {
        // "You are here" pin
        ctx.fillStyle = '#ff9f43';
        ctx.beginPath(); ctx.arc(x, y - 4 * u, 8 * u, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 5 * u, y); ctx.lineTo(x + 5 * u, y); ctx.lineTo(x, y + 12 * u); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 4 * u, 3 * u, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'traffic':
      case 'cat':
      case 'bully': {
        // Threat glyph on a soft chip (cheap + readable)
        const glyph = f.type === 'traffic' ? '🚦' : f.type === 'cat' ? '🐱' : '😾';
        ctx.fillStyle = 'rgba(10,10,25,0.85)';
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 13 * u, y - 13 * u, 26 * u, 26 * u, 5 * u) : ctx.rect(x - 13 * u, y - 13 * u, 26 * u, 26 * u); ctx.fill();
        ctx.font = `${16 * u}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(glyph, x, y + 1 * u); ctx.textBaseline = 'alphabetic';
        break;
      }
      default: {
        // Fallback: a clean rounded chip in the feature color
        ctx.fillStyle = c;
        ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x - 10 * u, y - 10 * u, 20 * u, 20 * u, 4 * u) : ctx.rect(x - 10 * u, y - 10 * u, 20 * u, 20 * u); ctx.fill();
        ctx.fillStyle = this.shadeColor(c, 0.3);
        ctx.beginPath(); ctx.arc(x, y, 4 * u, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  private star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  private renderExits(): void {
    if (!this.ctx || !this.room) return;
    const ctx = this.ctx;

    this.exits.forEach(exit => {
      const x = this.toCanvasX(exit.x);
      const y = this.toCanvasY(exit.y);
      const scale = this.roomScale();
      const r = 12 * scale;

      // Draw door marker
      ctx.fillStyle = '#d4a017'; // Gold color for exits
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Draw arrow pointing to exit direction
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();

      switch (exit.wallSide) {
        case 'north':
          ctx.moveTo(x, y + 8 * scale);
          ctx.lineTo(x, y - 8 * scale);
          ctx.lineTo(x - 5 * scale, y - 2 * scale);
          break;
        case 'south':
          ctx.moveTo(x, y - 8 * scale);
          ctx.lineTo(x, y + 8 * scale);
          ctx.lineTo(x + 5 * scale, y + 2 * scale);
          break;
        case 'east':
          ctx.moveTo(x - 8 * scale, y);
          ctx.lineTo(x + 8 * scale, y);
          ctx.lineTo(x + 2 * scale, y - 5 * scale);
          break;
        case 'west':
          ctx.moveTo(x + 8 * scale, y);
          ctx.lineTo(x - 8 * scale, y);
          ctx.lineTo(x - 2 * scale, y + 5 * scale);
          break;
      }

      ctx.stroke();

      // Draw exit room name below arrow
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      const label = exit.isZoneGate ? `${exit.roomName} →` : exit.roomName;
      ctx.fillText(label, x, y + 25 * scale);
    });
  }

  private renderPlayer(): void {
    if (!this.ctx || !this.room) return;
    const ctx = this.ctx;

    const playerScreenX = this.toCanvasX(this.playerX);
    const playerScreenY = this.toCanvasY(this.playerY);
    const scale = this.roomScale();

    // Player body
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, 10 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator (small triangle pointing up)
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.moveTo(playerScreenX, playerScreenY - 15 * scale);
    ctx.lineTo(playerScreenX - 6 * scale, playerScreenY - 5 * scale);
    ctx.lineTo(playerScreenX + 6 * scale, playerScreenY - 5 * scale);
    ctx.closePath();
    ctx.fill();

    // Player name label
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('You', playerScreenX, playerScreenY + 25 * scale);
  }
  
  private getFeatureColor(featureType: string): string {
    // Map feature types to colors for visual distinction
    const colorMap: Record<string, string> = {
      'food': '#ff6b35',
      'hint': '#4a9eff',
      'door': '#d4a017',
      'cat': '#8B4513',
      'dog_friend': '#DAA520',
      'home': '#ff9f43',
      'water_bowl': '#00bcd4',
      'fire_hydrant': '#f44336',
      'scent_post': '#8bc34a',
      'treasure': '#ffd700',
      'return_gate': '#9e9e9e',
      'tv': '#607d8b',
      'person': '#ff9800',
    };
    
    return colorMap[featureType] || '#cccccc'; // Default gray for unknown types
  }
  
  private darkenColor(hex: string, factor: number): string {
    return this.shadeColor(hex, -factor);
  }
  
  // Keyboard handlers
  private onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    this.keysPressed.add(key);

    // Queue an immediate interact when E/Space is pressed at a door or a feature
    if (key === 'e' || key === ' ') {
      this.interactQueued = true;
      this.featureInteractQueued = true;
      event.preventDefault();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keysPressed.delete(event.key.toLowerCase());
  }

  // Mouse click handler — detect clicks on features and exits
  private onMouseDown(event: MouseEvent): void {
    if (!this.canvas || !this.room) return;

    // Convert screen coordinates to canvas CSS-pixel coordinates.
    // (The backing store may be dpr-scaled, but drawing math is in CSS px,
    // so the mapping is 1:1 between the rect and the CSS-pixel space.)
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Convert canvas coordinates to world (room) coordinates
    const roomX = this.toWorldX(canvasX);
    const roomY = this.toWorldY(canvasY);

    // Check feature clicks (radius-based hit detection in world units)
    for (const [featureId, data] of this.features) {
      if (data.state !== 'active') continue;
      const { feature } = data;
      const dx = roomX - feature.x;
      const dy = roomY - feature.y;
      const hitRadius = Math.max(feature.w, feature.h, 20) / 2 + 10;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        this.onFeatureClick?.(featureId);
        data.state = 'completed';
        return;
      }
    }

    // Check exit clicks
    for (const exit of this.exits) {
      const dx = roomX - exit.x;
      const dy = roomY - exit.y;
      const hitRadius = 30;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        this.onExitClick?.(exit.roomId);
        return;
      }
    }
  }

  protected onDestroy(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.canvas?.removeEventListener('mousedown', this.boundMouseDown);

    this.room = null;
    this.features.clear();
    this.exits = [];
    this.keysPressed.clear();
  }
}
