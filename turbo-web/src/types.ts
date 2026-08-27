/**
 * Core TypeScript interfaces for Turbo: Lost & Found v2.0
 * 
 * All game systems reference these types. Strict mode enforced.
 */

// ===== Game State Types =====

export type ZoneType = 'fp' | 'tp';
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

import type { TransitionKind } from './engine/transitions';

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
  threat?: string; // zone-specific threat ID (from THREATS) triggered when entering the zone
  threatKind?: ThreatKind; // threat-category for HUD warning display
  legacyThreat?: string; // threat ID for legacy core-type features (traffic/cat/bully/storm/vacuum) in this zone
  doorThreat?: string; // threat ID triggered at the zone's exit door (FP zones)
  transition?: TransitionKind; // zone transition style on entry (default 'fade')
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
  companion?: string; // optional companion id met on interact (overrides zone fallback)
}

// ===== Obstacle & NPC Types =====

export interface Obstacle {
  type: 'fence' | 'tree' | 'bench' | 'bush' | 'flower' | 'rock' | 'lamp_post' | 'crystal';
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
  threat?: string; // optional threat ID (from THREATS) triggered on interact
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

/** Which threat-type mini-games can occur in a zone (for HUD warning display). */
export type ThreatKind = ThreatType | 'hazard';

/**
 * Themed minigame backdrop scenes (Sprint 8).
 * One scene per zone family; the Sprint 8.2 renderer registers a painter per id.
 * Data picks a scene per threat so the minigame reads as *that place*, not a generic bar.
 */
export type ThreatSceneId =
  | 'street' | 'park' | 'garden' | 'apartment' | 'shelter'
  | 'lake' | 'forest' | 'beach' | 'mountain' | 'waterfall' | 'secret_park'
  | 'pet_shop' | 'dog_show' | 'market' | 'library' | 'cave';

/** Single source of truth for valid scene ids (used by data-integrity tests). */
export const THREAT_SCENE_IDS: readonly ThreatSceneId[] = [
  'street', 'park', 'garden', 'apartment', 'shelter',
  'lake', 'forest', 'beach', 'mountain', 'waterfall', 'secret_park',
  'pet_shop', 'dog_show', 'market', 'library', 'cave',
];

/**
 * Themed actor drawn in the minigame stage (Sprint 8.2). Each id maps to a
 * vector-drawn character in `engine/render/threat-scenes.ts`. Optional on
 * Threat so data can omit it and fall back to a per-type generic actor.
 */
export type ThreatActorId =
  // street / urban
  | 'car' | 'crane' | 'truck' | 'mailman' | 'bully' | 'judge' | 'quake'
  // animals
  | 'cat' | 'dog' | 'wolf' | 'raccoon' | 'deer' | 'goat' | 'squirrel' | 'crab'
  | 'snake' | 'insect' | 'owl'
  // creatures / fantasy
  | 'guardian' | 'monster' | 'spirit'
  // weather / nature forces
  | 'storm' | 'fog' | 'lightning' | 'flood' | 'tornado' | 'fire'
  // machines / objects
  | 'vacuum' | 'sprinkler' | 'drain' | 'wave' | 'bell' | 'thorn' | 'rockfall'
  // environments
  | 'shelf' | 'crowd';

/** Single source of truth for valid actor ids (used by data-integrity tests). */
export const THREAT_ACTOR_IDS: readonly ThreatActorId[] = [
  'car', 'crane', 'truck', 'mailman', 'bully', 'judge', 'quake',
  'cat', 'dog', 'wolf', 'raccoon', 'deer', 'goat', 'squirrel', 'crab',
  'snake', 'insect', 'owl',
  'guardian', 'monster', 'spirit',
  'storm', 'fog', 'lightning', 'flood', 'tornado', 'fire',
  'vacuum', 'sprinkler', 'drain', 'wave', 'bell', 'thorn', 'rockfall',
  'shelf', 'crowd',
];

/**
 * Per-threat difficulty knobs (Sprint 8.1).
 * All fields are optional; `resolveDifficulty(type, overrides)` merges them
 * over per-type defaults, so data only states what differs.
 */
export interface ThreatDifficulty {
  /** timing: width of the safe gap (% of the bar, 0–100) */
  gapWidth?: number;
  /** timing: gap sweep speed (track units/sec; the track spans 0–100) */
  speed?: number;
  /** combat: beats required to resolve */
  beats?: number;
  /** combat: pulse-ring speed (revolutions/sec) */
  pulseSpeed?: number;
  /** combat: width of the green target arc (0–1 of the full circle) */
  targetWindow?: number;
  /** sneak: detection gained per second while moving */
  riseRate?: number;
  /** sneak: detection lost per second while staying still */
  fallRate?: number;
  /** sneak: seconds at zero detection required to succeed */
  safeHold?: number;
  /** comfort: progress gained per second while holding */
  holdRate?: number;
  /** comfort: seconds before auto-fail */
  timeLimit?: number;
}

export interface Threat {
  name: string;
  icon: string;
  type: ThreatType;
  description: string;
  solve: string;
  mangaText: string;
  mangaType: 'fight' | 'scare' | 'near-miss';
  // ===== Sprint 8 — context layer =====
  /** Themed backdrop scene (Sprint 8.2 paints one per id). */
  scene: ThreatSceneId;
  /** Themed onomatopoeia, one per successful combat beat (Sprint 8.3). */
  beats?: string[];
  /** Flavor line shown with the SUCCESS banner (Sprint 8.3). */
  successLine: string;
  /** Flavor line shown with the FAIL banner (Sprint 8.3). */
  failLine: string;
  /** Per-threat difficulty overrides on top of per-type defaults (Sprint 8.1). */
  difficulty?: Partial<ThreatDifficulty>;
  /** Themed stage actor (Sprint 8.2). Falls back to a per-type generic when omitted. */
  actor?: ThreatActorId;
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

export type RendererType = 'fp' | 'tp';
