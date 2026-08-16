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
  wallSide: 'north' | 'south' | 'east' | 'west';
  x: number;
  y: number;
}

export class FpRoomRenderer extends BaseRenderer {
  private room: Room | null = null;
  private playerX = 0;
  private playerY = 0;
  private features: Map<string, { feature: RoomFeature; state: 'active' | 'locked' | 'completed' }> = new Map();
  private exits: ExitMarker[] = [];
  
  // Movement
  private keysPressed: Set<string> = new Set();
  private moveSpeed = 3.0; // units per second
  
  // Callbacks
  onFeatureClick?: (featureId: string) => void;
  onExitClick?: (roomId: string) => void;
  
  // Setup listeners for keyboard input
  private boundKeyDown = this.onKeyDown.bind(this);
  private boundKeyUp = this.onKeyUp.bind(this);
  
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
    
    // Setup keyboard listeners
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
  }
  
  private parseExits(room: Room): void {
    const roomWidth = room.w;
    const roomDepth = room.d;
    
    // Map exit directions to wall sides and positions
    const exitMap: Record<string, 'north' | 'south' | 'east' | 'west'> = {
      north: 'north',
      south: 'south',
      east: 'east',
      west: 'west',
    };
    
    room.exits.forEach((exitId, index) => {
      // Assign wall side based on position in exits array (simplified mapping)
      const wallSide = this.determineExitWall(index, room);
      
      let x = 0;
      let y = 0;
      
      switch (wallSide) {
        case 'north':
          x = roomWidth / 2;
          y = 0; // Top of room (depth 0)
          break;
        case 'south':
          x = roomWidth / 2;
          y = roomDepth; // Bottom of room
          break;
        case 'east':
          x = roomWidth; // Right side
          y = roomDepth / 2;
          break;
        case 'west':
          x = 0; // Left side
          y = roomDepth / 2;
          break;
      }
      
      this.exits.push({ roomId: exitId, wallSide, x, y });
    });
  }
  
  private determineExitWall(index: number, room: Room): 'north' | 'south' | 'east' | 'west' {
    // Simplified mapping — in real implementation would use actual room geometry
    if (index === 0) return 'north';
    if (index === 1) return 'east';
    if (index === 2) return 'south';
    if (index === 3) return 'west';
    
    // Default to north for additional exits
    return 'north';
  }
  
  protected onUpdate(delta: number, _time: number): void {
    if (!this.room || !this.canvas) return;
    
    this.updateMovement(delta);
    this.checkFeatureClicks();
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
    if (!this.ctx || !this.canvas) return;
    
    // Convert screen coordinates to room coordinates for click detection
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    // Room is centered on canvas
    const offsetX = (this.canvas.width - this.room!.w) / 2;
    const offsetY = (this.canvas.height - this.room!.d) / 2;
    
    // Check feature click zones (radius-based hit detection)
    this.features.forEach((data, featureId) => {
      const { feature } = data;
      
      // Calculate screen position of feature center
      const featureScreenX = offsetX + feature.x;
      const featureScreenY = offsetY + feature.y;
      
      // Hit radius (larger than visual for easier clicking)
      const hitRadius = 25;
      
      // This would be checked against mouse click coordinates in a real implementation
      // For now, we'll just store the detection logic
    });
    
    // Check exit click zones
    this.exits.forEach(exit => {
      const exitScreenX = offsetX + exit.x;
      const exitScreenY = offsetY + exit.y;
      
      // Exit hit radius (larger for easier clicking)
      const exitHitRadius = 30;
      
      // Same as above — would check against mouse click coordinates
    });
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
    if (!this.ctx || !this.room) return;
    
    const offsetX = (this.canvas!.width - this.room.w) / 2;
    const offsetY = (this.canvas!.height - this.room.d) / 2;
    
    // Draw floor
    this.ctx.fillStyle = this.room.color;
    this.ctx.fillRect(offsetX, offsetY, this.room.w, this.room.d);
    
    // Draw walls (thicker border around room)
    const wallThickness = 8;
    this.ctx.strokeStyle = '#2a2a3e';
    this.ctx.lineWidth = wallThickness;
    this.ctx.strokeRect(offsetX - wallThickness / 2, offsetY - wallThickness / 2, 
                        this.room.w + wallThickness, this.room.d + wallThickness);
    
    // Draw room name at top
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 16px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(this.room.name, this.canvas.width / 2, offsetY - 15);
  }
  
  private renderFeatures(): void {
    if (!this.ctx || !this.room) return;
    
    const offsetX = (this.canvas!.width - this.room.w) / 2;
    const offsetY = (this.canvas!.height - this.room.d) / 2;
    
    this.features.forEach((data, featureId) => {
      const { feature } = data;
      
      // Calculate screen position
      const x = offsetX + feature.x;
      const y = offsetY + feature.y;
      
      // Draw feature shape (simplified as rectangle for now)
      const width = feature.w || 30;
      const height = feature.h || 30;
      
      this.ctx.fillStyle = this.getFeatureColor(feature.type);
      this.ctx.fillRect(x - width / 2, y - height / 2, width, height);
      
      // Draw label above feature
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(feature.label, x, y - height / 2 - 5);
    });
  }
  
  private renderExits(): void {
    if (!this.ctx || !this.room) return;
    
    const offsetX = (this.canvas!.width - this.room.w) / 2;
    const offsetY = (this.canvas!.height - this.room.d) / 2;
    
    this.exits.forEach(exit => {
      const x = offsetX + exit.x;
      const y = offsetY + exit.y;
      
      // Draw door marker
      this.ctx.fillStyle = '#d4a017'; // Gold color for exits
      this.ctx.beginPath();
      this.ctx.arc(x, y, 12, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw arrow pointing to exit direction
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      
      switch (exit.wallSide) {
        case 'north':
          this.ctx.moveTo(x, y + 8);
          this.ctx.lineTo(x, y - 8);
          this.ctx.lineTo(x - 5, y - 2);
          break;
        case 'south':
          this.ctx.moveTo(x, y - 8);
          this.ctx.lineTo(x, y + 8);
          this.ctx.lineTo(x + 5, y + 2);
          break;
        case 'east':
          this.ctx.moveTo(x - 8, y);
          this.ctx.lineTo(x + 8, y);
          this.ctx.lineTo(x + 2, y - 5);
          break;
        case 'west':
          this.ctx.moveTo(x + 8, y);
          this.ctx.lineTo(x - 8, y);
          this.ctx.lineTo(x - 2, y + 5);
          break;
      }
      
      this.ctx.stroke();
      
      // Draw exit room name below arrow
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '10px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(exit.roomId, x, y + 25);
    });
  }
  
  private renderPlayer(): void {
    if (!this.ctx) return;
    
    const offsetX = (this.canvas!.width - this.room!.w) / 2;
    const offsetY = (this.canvas!.height - this.room!.d) / 2;
    
    // Draw player as a circle with directional indicator
    const playerScreenX = offsetX + this.playerX;
    const playerScreenY = offsetY + this.playerY;
    
    // Player body
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(playerScreenX, playerScreenY, 10, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Direction indicator (small triangle pointing up)
    this.ctx.fillStyle = '#4a9eff';
    this.ctx.beginPath();
    this.ctx.moveTo(playerScreenX, playerScreenY - 15);
    this.ctx.lineTo(playerScreenX - 6, playerScreenY - 5);
    this.ctx.lineTo(playerScreenX + 6, playerScreenY - 5);
    this.ctx.closePath();
    this.ctx.fill();
    
    // Player name label
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '10px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('You', playerScreenX, playerScreenY + 25);
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
    this.keysPressed.add(event.key.toLowerCase());
  }
  
  private onKeyUp(event: KeyboardEvent): void {
    this.keysPressed.delete(event.key.toLowerCase());
  }
  
  protected onDestroy(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    
    this.room = null;
    this.features.clear();
    this.exits = [];
    this.keysPressed.clear();
  }
}
