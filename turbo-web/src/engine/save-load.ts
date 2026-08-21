/**
 * Save / Load — persist game state to localStorage with schema versioning.
 *
 * - Save after meaningful actions (item collect, companion meet, hint unlock,
 *   threat resolve, zone/room change).
 * - Load at startup; offer to continue if a save exists.
 * - Versioned so future schema changes don't break old saves.
 */

import type { GameStateData, DogId, CompanionId } from '@/types';

const SAVE_KEY = 'turbo-lost-found-save';
const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  savedAt: number;
  state: PersistedState;
}

/**
 * A serializable snapshot of GameStateData. Set → array conversion happens
 * here so JSON.stringify works and load is deterministic.
 */
export interface PersistedState {
  currentDog: DogId | null;
  happiness: number;
  inventory: Array<{ item: string | null; count: number }>;
  activeCompanion: CompanionId | null;
  companionsMet: CompanionId[];
  hintsUnlocked: string[];
  routeRevealed: boolean;
  itemsCollected: number;
  threatsResolved: number;
  maxHappiness: number;
  startTime: number;
  gameOverTime: number | null;
  // Position (not in GameStateData yet — added for save completeness)
  currentZoneId: string | null;
  currentRoomId: string | null;
}

export interface SavePosition {
  currentZoneId: string | null;
  currentRoomId: string | null;
}

function toPersisted(state: GameStateData, pos?: SavePosition): PersistedState {
  return {
    currentDog: state.currentDog,
    happiness: state.happiness,
    inventory: state.inventory.map(s => ({ item: s.item, count: s.count })),
    activeCompanion: state.activeCompanion,
    companionsMet: Array.from(state.companionsMet),
    hintsUnlocked: [...state.hintsUnlocked],
    routeRevealed: state.routeRevealed,
    itemsCollected: state.itemsCollected,
    threatsResolved: state.threatsResolved,
    maxHappiness: state.maxHappiness,
    startTime: state.startTime,
    gameOverTime: state.gameOverTime,
    currentZoneId: pos?.currentZoneId ?? null,
    currentRoomId: pos?.currentRoomId ?? null,
  };
}

export function saveGame(state: GameStateData, pos?: SavePosition): boolean {
  try {
    const file: SaveFile = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      state: toPersisted(state, pos),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch (e) {
    console.warn('[Save] Failed to save:', (e as Error).message);
    return false;
  }
}

export function loadGame(): { state: GameStateData; position: SavePosition } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;

    if (file.version !== SAVE_VERSION) {
      console.warn(`[Save] Version mismatch (got ${file.version}, want ${SAVE_VERSION}) — discarding save.`);
      localStorage.removeItem(SAVE_KEY);
      return null;
    }

    const p = file.state;
    const state: GameStateData = {
      currentDog: p.currentDog,
      happiness: p.happiness,
      inventory: p.inventory.map(s => ({ item: s.item, count: s.count })),
      activeCompanion: p.activeCompanion,
      companionsMet: new Set(p.companionsMet),
      hintsUnlocked: [...p.hintsUnlocked],
      routeRevealed: p.routeRevealed,
      itemsCollected: p.itemsCollected,
      threatsResolved: p.threatsResolved,
      maxHappiness: p.maxHappiness,
      startTime: p.startTime,
      gameOverTime: p.gameOverTime,
    };

    const position: SavePosition = {
      currentZoneId: p.currentZoneId,
      currentRoomId: p.currentRoomId,
    };

    return { state, position };
  } catch (e) {
    console.warn('[Save] Failed to load:', (e as Error).message);
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Apply a loaded PersistedState onto a live GameStateData (in place). */
export function applyLoadedState(target: GameStateData, source: PersistedState): void {
  target.currentDog = source.currentDog;
  target.happiness = source.happiness;
  target.inventory = source.inventory.map(s => ({ item: s.item, count: s.count }));
  target.activeCompanion = source.activeCompanion;
  target.companionsMet = new Set(source.companionsMet);
  target.hintsUnlocked = [...source.hintsUnlocked];
  target.routeRevealed = source.routeRevealed;
  target.itemsCollected = source.itemsCollected;
  target.threatsResolved = source.threatsResolved;
  target.maxHappiness = source.maxHappiness;
  target.startTime = source.startTime;
  target.gameOverTime = source.gameOverTime;
}
