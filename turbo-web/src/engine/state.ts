/**
 * State Manager — Central game state with pub/sub events
 * 
 * All game systems read/write through this single source of truth.
 * No direct mutations from outside modules.
 */

import type { GameState, GameStateData, DogId, CompanionId, StoryEntry, StoryEntryKind } from '@/types';
import { HAPPINESS } from '@/config';
import { ITEMS } from '@/data';

type StateListener = (state: GameStateData) => void;

export class StateManager {
  private state: GameStateData;
  private listeners: Set<StateListener> = new Set();
  
  constructor() {
    this.state = this.getInitialState();
  }
  
  // ===== Initialization =====
  
  private getInitialState(): GameStateData {
    return {
      currentDog: null,
      happiness: HAPPINESS.MAX,
      inventory: Array(16).fill({ item: null as any, count: 0 }),
      activeCompanion: null,
      companionsMet: new Set(),
      hintsUnlocked: [],
      routeRevealed: false,
      itemsCollected: 0,
      threatsResolved: 0,
      maxHappiness: HAPPINESS.MAX,
      startTime: Date.now(),
      gameOverTime: null,
      storyLog: [],
      zonesVisited: [],
    };
  }
  
  // ===== Selectors (Read-only access) =====
  
  getState(): GameStateData {
    return this.state;
  }
  
  get happiness(): number {
    return this.state.happiness;
  }
  
  get currentDog(): DogId | null {
    return this.state.currentDog;
  }
  
  get activeCompanion(): CompanionId | null {
    return this.state.activeCompanion;
  }
  
  get inventory(): ReadonlyArray<{ item: string | null; count: number }> {
    return this.state.inventory;
  }
  
  // ===== Mutations (State Transitions) =====
  
  selectDog(dogId: DogId): void {
    if (!this.isValidDogId(dogId)) {
      console.error(`[State] Invalid dog ID: ${dogId}`);
      return;
    }
    
    this.state.currentDog = dogId;
    this.emit();
  }
  
  enterZone(zoneId: string): void {
    if (!zoneId) {
      console.warn('[State] Cannot enter empty zone');
      return;
    }
    
    // Happy transition — no state change needed, just emit event
    this.emit('enterZone', { zoneId });
  }
  
  enterRoom(roomId: string): void {
    if (!roomId) {
      console.warn('[State] Cannot enter empty room');
      return;
    }
    
    // Room transitions don't mutate state, just emit events
    this.emit('enterRoom', { roomId });
  }
  
  collectItem(itemId: string): boolean {
    if (!itemId) {
      console.warn('[State] Cannot collect empty item');
      return false;
    }
    
    // Find first empty slot or add to existing stack
    const emptyIndex = this.state.inventory.findIndex(slot => !slot.item);
    if (emptyIndex === -1) {
      console.warn('[State] Inventory full!');
      return false;
    }
    
    // Check if item already exists in inventory for stacking
    const existingSlot = this.state.inventory.find(slot => slot.item === itemId);
    if (existingSlot && existingSlot.count < 99) {
      existingSlot.count++;
    } else {
      this.state.inventory[emptyIndex] = { item: itemId, count: 1 };
    }
    
    this.state.itemsCollected++;
    this.emit('collectItem', { itemId });
    return true;
  }
  
  useItem(itemId: string): boolean {
    if (!itemId) return false;

    const slotIndex = this.state.inventory.findIndex(slot => slot.item === itemId && slot.count > 0);
    if (slotIndex === -1) return false;

    // Decrease count or remove entirely
    this.state.inventory[slotIndex]!.count--;
    if (this.state.inventory[slotIndex]!.count <= 0) {
      this.state.inventory[slotIndex] = { item: null, count: 0 };
    }

    // Item effects by category: comfort/food restore happiness
    const item = ITEMS[itemId];
    if (item && (item.category === 'comfort' || item.category === 'food')) {
      this.modifyHappiness(HAPPINESS.COMFORT_ITEM_RESTORE);
    }

    this.emit('useItem', { itemId });
    return true;
  }

  meetCompanion(companionId: string): void {
    if (!this.state.companionsMet.has(companionId)) {
      this.state.companionsMet.add(companionId as CompanionId);
      
      // Auto-activate first companion met (unless player chooses otherwise)
      if (!this.state.activeCompanion) {
        this.activateCompanion(companionId as CompanionId);
      }
    }
    
    this.emit('meetCompanion', { companionId });
  }
  
  activateCompanion(companionId: CompanionId): void {
    // Deactivate current if different
    if (this.state.activeCompanion && this.state.activeCompanion !== companionId) {
      this.state.activeCompanion = null;
    }
    
    this.state.activeCompanion = companionId;
    this.emit('activateCompanion', { companionId });
  }
  
  unlockHint(hintId: string): void {
    if (!this.state.hintsUnlocked.includes(hintId)) {
      this.state.hintsUnlocked.push(hintId);
      
      // Check if all hints unlocked (route complete)
      if (this.state.hintsUnlocked.length >= 6) {
        this.state.routeRevealed = true;
      }
    }
    
    this.emit('unlockHint', { hintId });
  }
  
  resolveThreat(threatId: string, success: boolean): void {
    if (success) {
      this.state.threatsResolved++;
      this.modifyHappiness(HAPPINESS.THREAT_SUCCESS_REWARD);
    } else {
      this.modifyHappiness(-HAPPINESS.THREAT_FAIL_PENALTY);
    }

    this.emit('resolveThreat', { threatId, success });
  }
  
  /**
   * Sprint 8.4 — story thread. Record a first visit to a zone.
   * Returns true exactly once per zone (drives the first-visit flavor intro).
   */
  markZoneVisited(zoneId: string): boolean {
    if (!zoneId) return false;
    if (this.state.zonesVisited.includes(zoneId)) return false;
    this.state.zonesVisited.push(zoneId);
    this.emit('zoneVisited', { zoneId });
    return true;
  }

  /**
   * Sprint 8.4 — story thread. Append a story-log entry, idempotently by
   * `${kind}:${refId}`: re-resolving a threat or re-collecting an item never
   * duplicates the thread. Returns true when a new entry was appended.
   */
  logStory(entry: { kind: StoryEntryKind; refId: string; title: string; icon: string; detail?: string }): boolean {
    if (!entry.refId) return false;
    const id = `${entry.kind}:${entry.refId}`;
    if (this.state.storyLog.some(e => e.id === id)) return false;
    this.state.storyLog.push({ ...entry, id, order: this.state.storyLog.length });
    this.emit('storyLog', { id });
    return true;
  }

  get storyLog(): ReadonlyArray<StoryEntry> {
    return this.state.storyLog;
  }

  /**
   * Sprint 8.4 — endgame recap. One narrative line summarizing the journey
   * (pure function of state; unit-tested for format).
   */
  static recapLine(state: GameStateData): string {
    const zones = state.zonesVisited.length;
    const dangers = state.threatsResolved;
    const friends = state.companionsMet.size;
    return `You crossed ${zones} place${zones === 1 ? '' : 's'}, out-witted ${dangers} danger${dangers === 1 ? '' : 's'}, and made ${friends} friend${friends === 1 ? '' : 's'} on the way home.`;
  }

  gameOver(): void {
    this.state.gameOverTime = Date.now();
    this.emit('gameOver');
  }
  
  gameWin(): void {
    // Victory state — no specific mutation needed beyond emitting event
    this.emit('gameWin');
  }
  
  modifyHappiness(delta: number): void {
    const newHappiness = Math.max(HAPPINESS.MIN, Math.min(HAPPINESS.MAX, this.state.happiness + delta));
    
    if (newHappiness !== this.state.happiness) {
      this.state.happiness = newHappiness;
      
      // Track max happiness achieved
      if (newHappiness > this.state.maxHappiness) {
        this.state.maxHappiness = newHappiness;
      }
      
      // Check for game over condition
      if (this.state.happiness <= 0) {
        this.gameOver();
      } else {
        this.emit('happinessChange', { happiness: this.state.happiness });
      }
    }
  }
  
  // ===== Pub/Sub System =====
  
  on(event: string, listener: StateListener): () => void {
    const wrappedListener = (state: GameStateData) => {
      if (!event || event === 'all') {
        listener(state);
      } else if ((state as any)[`__lastEvent`] === event) {
        listener(state);
      }
    };
    
    this.listeners.add(wrappedListener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(wrappedListener);
    };
  }
  
  emit(event?: string, data?: any): void {
    if (event) {
      // Tag state with last event for filtering
      Object.defineProperty(this.state, '__lastEvent', { value: event, writable: true });
      if (data) {
        Object.assign(this.state as any, data);
      }
    }
    
    // Notify all listeners
    this.listeners.forEach(listener => listener(this.state));
  }
  
  // ===== Utility Methods =====
  
  private isValidDogId(dogId: string): boolean {
    const validIds = ['turbo', 'watson', 'nova', 'walter', 'beaux'];
    return validIds.includes(dogId);
  }
  
  reset(): void {
    this.state = this.getInitialState();
    this.emit('reset');
  }
}

// Export singleton instance for use throughout the app
export const State = new StateManager();
