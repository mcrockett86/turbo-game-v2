/**
 * Core TypeScript interfaces for Turbo: Lost & Found v2.0
 * 
 * All game systems reference these types. Strict mode enforced.
 */

// ===== Game State Types =====

export type ZoneType = 'fp' | 'tp' | 'search';
export type GameState = 'select_dog' | 'playing' | 'transitioning' | 'game_over' | 'victory';

export interface GameStateData {
  currentDog: DogId | null;
  happiness: number; // 0-100, decays over time
  inventory: InventorySlot[];
  activeCompanion: CompanionId | null;
  companionsMet: Set<CompanionId>;
  hintsUnlocked: string[];
  routeRevealed: boolean;
  itemsCollected: number;
  threatsResolved: number;
  maxHappiness: number;
  startTime: number;
  gameOverTime: number | null;
}

// ===== Dog Types =====

export type DogId = 'turbo' | 'watson' | 'nova' | 'walter' | 'beaux';

export interface Dog {
  id: DogId;
  name: string;
  breed: string;
  trait: TraitType;
  traitDesc: string;
  colors: DogColors;
  personality: Personality[];
  lines: DialogLines;
}

export type TraitType = 'speed' | 'brave' | 'happiness' | 'sniff' | 'compact';

export interface DogColors {
  fur: string[];
  accent: string;
}

export type Personality = 'adventurous' | 'loyal' | 'curious' | 'brave' | 'protective' 
  | 'disciplined' | 'friendly' | 'optimistic' | 'generous' | 'food-motivated' 
  | 'calm' | 'stubborn' | 'tough' | 'tiny' | 'surprisingly brave';

export interface DialogLines {
  intro: string;
  happy: string;
  scared: string;
  hint: string;
  combat: string;
  foundFriend: string;
}

// ===== Zone & Room Types =====

export interface Zone {
  id: string;
  name: string;
  desc: string;
  type: ZoneType;
  rooms?: Room[]; // FP zones have rooms
  obstacles?: Obstacle[]; // TP zones have obstacles
  npcs?: NPC[]; // TP zones have NPCs
  features?: Feature[]; // Both types
  music: string;
  hint: string;
  companions?: string[]; // Companion IDs available in this zone
  returnZone?: string;
  skyColor?: string;
  groundColor?: string;
  dogColor?: string;
  accentColor?: string;
}

export interface Room {
  id: string;
  name: string;
  w: number;
  h: number; // height (unused in 2D, kept for consistency)
  d: number;
  color: string;
  exits: string[]; // room IDs
  features?: RoomFeature[];
  isEntrance?: boolean;
  entranceZone?: string;
  isHome?: boolean;
}

export interface RoomFeature {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  locked?: boolean;
  item?: string;
}

// ===== Obstacle & NPC Types =====

export interface Obstacle {
  type: 'fence' | 'tree' | 'bench' | 'bush';
  x: number;
  z: number;
  width?: number;
  height?: number;
  color?: string;
  trunkColor?: string;
  leafColor?: string;
  rotation?: number;
}

export interface NPC {
  id: string;
  name: string;
  color: string;
  accentColor: string;
  x: number;
  z: number;
  dialogue: string[];
}

// ===== Feature Types (interactive objects) =====

export type FeatureType = 
  | 'food' | 'hint' | 'door' | 'cat' | 'dog_friend' | 'home'
  | 'water_bowl' | 'fire_hydrant' | 'scent_post' | 'treasure'
  | 'return_gate' | 'tv' | 'person' | 'fountain' | 'bridge'
  | 'cave_entrance' | 'secret_passage'
  | 'traffic' | 'choice' | 'celebration' | 'pet_shop' | 'dog_show'
  | 'bully' | 'vacuum' | 'storm'
  | 'water' | 'lure' | 'treasure_chest' | 'music_box' | 'mailbox'
  | 'trap' | 'companion_trap' | 'locked_door'
  | 'gate' | 'here';

export interface Feature {
  type: FeatureType;
  x: number;
  z: number;
  id?: string;
  label: string;
  item?: string; // optional item to pick up on interact
  gate?: string; // optional target zone id for hub gates
}

// ===== Item Types =====

export interface Item {
  name: string;
  desc: string;
  category: 'comfort' | 'clue' | 'key' | 'collectible' | 'food' | 'utility' | 'story' | 'crafting' | 'quest' | 'rare';
  stackable?: boolean;
  maxStack?: number;
}

export interface InventorySlot {
  item: ItemId | null;
  count: number;
}

export type ItemId = string; // e.g., 'bone', 'treat', 'key'

// ===== Threat Types =====

export type ThreatType = 'timing' | 'combat' | 'sneak' | 'comfort';

export interface Threat {
  name: string;
  icon: string;
  type: ThreatType;
  description: string;
  solve: string;
  mangaText: string;
  mangaType: 'fight' | 'scare' | 'near-miss';
}

// ===== Companion Types =====

export interface Companion {
  id: string;
  name: string;
  breed: string;
  trait: string;
  dialogue: string[];
  color: string;
  accentColor: string;
  met: boolean;
  active: boolean;
}

export type CompanionId = string;

// ===== Audio Types =====

export interface MusicTrack {
  id: string;
  zone: string;
  mood: 'calm' | 'tense' | 'happy' | 'dark';
}

export interface SfxEvent {
  name: string;
  frequency?: number; // Web Audio oscillator fallback
  duration?: number; // seconds
}

// ===== Input Types =====

export type InputAction = 
  | 'move_up' | 'move_down' | 'move_left' | 'move_right'
  | 'interact' | 'use_item' | 'toggle_inventory' | 'toggle_companion'
  | 'toggle_hint' | 'advance_dialogue';

// ===== Renderer Types =====

export interface BaseRenderer {
  init(canvas: HTMLCanvasElement, data?: any): void;
  update(delta: number, time: number): void;
  dispose(): void;
}

export type RendererType = 'fp' | 'tp' | 'search';
