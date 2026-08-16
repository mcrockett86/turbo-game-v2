/**
 * Game configuration constants
 * 
 * Only tunable values go here. No game content, no data mutations.
 */

// ===== Canvas & Display =====
export const CONFIG = {
  // Canvas sizing
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  
  // Performance
  TARGET_FPS: 60,
  MIN_FRAME_TIME_MS: 1000 / 60, // ~16.67ms
  
  // Animation
  TRANSITION_DURATION_MS: 2500,
  FADE_IN_DURATION_MS: 800,
  
  // Movement speeds
  PLAYER_MOVE_SPEED: 3.0, // units per second
  NPC_WANDER_SPEED: 1.5,
  COMPANION_FOLLOW_DISTANCE: 1.5,
  COMPANION_FOLLOW_EASING: 0.1,
} as const;

// ===== Zone Transitions =====
export const ZONE_TRANSITIONS = {
  FADE: 'fade',
  WIPE: 'wipe',
  ZOOM: 'zoom',
  SLIDE: 'slide',
} as const;

// ===== Happiness System =====
export const HAPPINESS = {
  MAX: 100,
  MIN: 0,
  DECAY_PER_SECOND: 0.5, // base decay rate
  COMFORT_ITEM_RESTORE: 15,
  COMPANION_BONUS_MULTIPLIER: 0.9, // companions reduce decay by 10%
} as const;

// ===== Inventory System =====
export const INVENTORY = {
  GRID_ROWS: 4,
  GRID_COLS: 4,
  MAX_STACK_SIZE: 99,
  SLOT_EMPTY: null,
} as const;

// ===== Threat System =====
export const THREATS = {
  TIMING_WINDOW_MS: 500, // acceptable timing window in ms
  COMBAT_RHYTHM_BPM: 120, // beats per minute for QTE rhythm
  SNEAK_DETECTION_RADIUS: 3.0, // units
  COMFORT_SHELTER_RADIUS: 5.0, // units to find shelter
} as const;

// ===== Rendering Constants =====
export const RENDER = {
  FOV: 60,
  NEAR_CLIP: 0.1,
  FAR_CLIP: 1000,
  FOG_DENSITY: 0.02,
  MAX_PARTICLES: 200,
} as const;

// ===== Input Configuration =====
export const INPUT = {
  KEY_MAP: {
    'w': 'move_up',
    'a': 'move_left',
    's': 'move_down',
    'd': 'move_right',
    'arrowup': 'move_up',
    'arrowleft': 'move_left',
    'arrowdown': 'move_down',
    'arrowright': 'move_right',
    ' ': 'interact',
    'i': 'toggle_inventory',
    'c': 'toggle_companion',
    'h': 'toggle_hint',
    'enter': 'advance_dialogue',
  } as const,
} as const;

// Export default for convenience
export default CONFIG;
