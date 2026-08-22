/**
 * MapStore — tracks explored zones/rooms and the elements (items, gates,
 * home) discovered in each, so the minimap can render the player's growing
 * understanding of the world. Pure state; no rendering.
 */

export interface MappedElement {
  label: string;
  x: number;
  y: number;
  kind: 'item' | 'gate' | 'home' | 'npc';
}

export interface MappedZone {
  id: string;
  name: string;
  emoji: string;
  explored: boolean;
  current: boolean;
  rooms: string[]; // explored room ids (FP zones)
  elements: MappedElement[];
}

const HOME_ZONE = 'home';

export class MapStore {
  private zoneMap = new Map<string, MappedZone>();
  private currentZone: string | null = null;
  private currentRoom: string | null = null;

  /** Ensure a zone node exists (unexplored). */
  addZone(id: string, name: string, emoji: string): void {
    if (!this.zoneMap.has(id)) {
      this.zoneMap.set(id, { id, name, emoji, explored: false, current: false, rooms: [], elements: [] });
    }
  }

  /** Mark a zone as explored (first visit) and set it current. */
  explore(zoneId: string): void {
    const z = this.zoneMap.get(zoneId);
    if (!z) return;
    z.explored = true;
    this.setZone(zoneId);
  }

  setZone(zoneId: string): void {
    this.currentZone = zoneId;
    this.currentRoom = null;
    for (const z of this.zoneMap.values()) z.current = z.id === zoneId;
  }

  setRoom(roomId: string): void {
    this.currentRoom = roomId;
    const z = this.zoneMap.get(this.currentZone ?? '');
    if (z && !z.rooms.includes(roomId)) z.rooms.push(roomId);
  }

  addElement(zoneId: string, el: MappedElement): void {
    const z = this.zoneMap.get(zoneId);
    if (!z) return;
    if (z.elements.some((e) => e.label === el.label && e.x === el.x && e.y === el.y)) return;
    z.elements.push(el);
  }

  markHome(name: string, emoji: string): void {
    this.addZone(HOME_ZONE, name, emoji);
  }

  /** A hub zone is one with 3+ outgoing gate connections. */
  hubZone(): string | null {
    let best: string | null = null;
    let bestCount = 2;
    for (const z of this.zoneMap.values()) {
      const gates = z.elements.filter((e) => e.kind === 'gate').length;
      if (gates > bestCount) {
        bestCount = gates;
        best = z.id;
      }
    }
    return best;
  }

  current(): { zone: string | null; room: string | null } {
    return { zone: this.currentZone, room: this.currentRoom };
  }

  zones(): MappedZone[] {
    return Array.from(this.zoneMap.values());
  }

  zone(id: string): MappedZone | undefined {
    return this.zoneMap.get(id);
  }

  clear(): void {
    this.zoneMap.clear();
    this.currentZone = null;
    this.currentRoom = null;
  }
}

export { HOME_ZONE };
