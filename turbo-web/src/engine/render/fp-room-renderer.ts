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

  // Callbacks
  onFeatureClick?: (featureId: string) => void;
  onFeatureInteract?: (feature: RoomFeature) => void;
  onExitClick?: (roomId: string) => void;
  onExitInteract?: (roomId: string) => void;

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
      this.interactQueued = false;
      this.doorTouchTime = 0;
      const exitId = nearest.roomId;
      // Reset so we don't double-fire on the next frame before the room swaps
      this.doorTouchExit = null;
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
    this.renderFog();
  }
  
  private renderRoom(): void {
    if (!this.ctx || !this.room || !this.canvas) return;
    const ctx = this.ctx;
    const room = this.room;
    const canvas = this.canvas;

    // Scale room to fill ~80% of canvas (maintain aspect ratio)
    const scale = this.roomScale();
    const offsetX = (canvas.width - room.w * scale) / 2;
    const offsetY = (canvas.height - room.d * scale) / 2;

    // Draw floor
    ctx.fillStyle = room.color;
    ctx.fillRect(offsetX, offsetY, room.w * scale, room.d * scale);

    // Draw walls (thicker border around room)
    const wallThickness = 8;
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = wallThickness;
    ctx.strokeRect(offsetX - wallThickness / 2, offsetY - wallThickness / 2,
                    room.w * scale + wallThickness, room.d * scale + wallThickness);

    // Draw room name at top
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.name, canvas.width / 2, offsetY - 15);
  }

  /** Compute the uniform scale factor that fits the room into ~80% of the canvas. */
  private roomScale(): number {
    if (!this.canvas || !this.room) return 1;
    const maxW = this.canvas.width * 0.8;
    const maxH = this.canvas.height * 0.8;
    return Math.min(maxW / this.room.w, maxH / this.room.d);
  }

  /** Convert a world (room) coordinate to canvas pixel coordinate. */
  private toCanvasX(wx: number): number {
    if (!this.canvas || !this.room) return wx;
    const scale = this.roomScale();
    const offsetX = (this.canvas.width - this.room.w * scale) / 2;
    return offsetX + wx * scale;
  }

  private toCanvasY(wy: number): number {
    if (!this.canvas || !this.room) return wy;
    const scale = this.roomScale();
    const offsetY = (this.canvas.height - this.room.d * scale) / 2;
    return offsetY + wy * scale;
  }

  /** Convert a canvas pixel coordinate to world (room) coordinate. */
  private toWorldX(cx: number): number {
    if (!this.canvas || !this.room) return cx;
    const scale = this.roomScale();
    const offsetX = (this.canvas.width - this.room.w * scale) / 2;
    return (cx - offsetX) / scale;
  }

  private toWorldY(cy: number): number {
    if (!this.canvas || !this.room) return cy;
    const scale = this.roomScale();
    const offsetY = (this.canvas.height - this.room.d * scale) / 2;
    return (cy - offsetY) / scale;
  }
  
  private renderFeatures(): void {
    if (!this.ctx || !this.room) return;
    const ctx = this.ctx;

    this.features.forEach((data, featureId) => {
      const { feature } = data;

      // Calculate screen position using world->canvas transform
      const x = this.toCanvasX(feature.x);
      const y = this.toCanvasY(feature.y);
      const scale = this.roomScale();

      // Draw feature shape (simplified as rectangle for now)
      const width = (feature.w || 30) * scale;
      const height = (feature.h || 30) * scale;

      ctx.fillStyle = this.getFeatureColor(feature.type);
      ctx.fillRect(x - width / 2, y - height / 2, width, height);

      // Draw label above feature
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(feature.label, x, y - height / 2 - 5);
    });
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
  
  private renderFog(): void {
    // No full-screen fog overlay — was covering all rendered content
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
    // Simple hex color darkening
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    const newR = Math.floor(r * (1 - factor));
    const newG = Math.floor(g * (1 - factor));
    const newB = Math.floor(b * (1 - factor));
    
    return `rgb(${newR}, ${newG}, ${newB})`;
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

    // Convert screen coordinates to canvas coordinates
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

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
