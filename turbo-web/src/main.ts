/**
 * Main Entry Point — Bootstrap, Dog Select, Zone Routing, Game Loop
 *
 * Architecture (v2):
 * - ONE requestAnimationFrame loop owned here. No renderer starts its own RAF.
 * - Zone routing by zone.type: 'fp' -> FpRoomRenderer, 'tp' -> TpEngineRenderer
 * - ThreatManager owns the keyboard while a threat is active; all renderers defer.
 * - InventoryRenderer toggled with [I]; HUD always rendered.
 * - State is the single source of truth; renderers read via providers.
 */

import { State } from './engine/state';
import { Audio } from './engine/audio';
import { DOGS, ZONES, ITEMS, COMPANIONS, THREATS } from './data';
import { HAPPINESS } from './config';
import { FpRoomRenderer } from './engine/render/fp-room-renderer';
import { TpEngineRenderer } from './engine/render/tp-engine';
import { ThreatManager } from './engine/threats';
import { MangaCombatOverlay } from './engine/render/manga-combat';
import { InventoryRenderer } from './engine/inventory';
import { HUDRenderer } from './engine/render/hud';
import { CompanionPanel } from './engine/companion-panel';
import { DialogueOverlay } from './engine/dialogue-overlay';
import { MapStore } from './engine/map-store';
import { MapPanel } from './engine/map-panel';
import { HintPanel } from './engine/hint-panel';
import { Transitions } from './engine/transitions';
import { perf } from './engine/perf';
import { Endgame } from './engine/endgame';
import type { DogId, Zone, Room, Feature, RoomFeature } from './types';

// ===== DOM References =====
const loadingScreen = document.getElementById('loading-screen');
const dogSelectScreen = document.getElementById('dog-select');
const gameViewContainer = document.getElementById('game-view');
const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement;
const dogGrid = document.getElementById('dog-grid');
const startBtn = document.getElementById('start-adventure-btn');

// ===== Renderer instances (single canvas shared by all) =====
let fpRenderer: FpRoomRenderer | null = null;
let tpRenderer: TpEngineRenderer | null = null;
const threatManager = new ThreatManager();
const mangaOverlay = new MangaCombatOverlay();
const inventoryRenderer = new InventoryRenderer();
const hudRenderer = new HUDRenderer();
const companionPanel = new CompanionPanel();
const dialogueOverlay = new DialogueOverlay();
const mapStore = new MapStore();
const mapPanel = new MapPanel();
const hintPanel = new HintPanel();
const transitions = new Transitions();
const endgame = new Endgame();

let activeRenderer: { update: (d: number, t: number) => void; dispose: () => void } | null = null;

// Expose for debugging / E2E inspection
(window as any).__activeRenderer = () => activeRenderer;

// ===== Game Flow State =====
type Screen = 'loading' | 'select_dog' | 'playing' | 'game_over' | 'victory';
let currentScreen: Screen = 'loading';
let currentZoneId: string | null = null;
let currentRoomId: string | null = null;

// ===== Panel Snapshot Helpers =====
function companionSnapshot() {
  const s = State.getState();
  return {
    companionsMet: s.companionsMet,
    activeCompanion: s.activeCompanion,
  };
}

function hintSnapshot() {
  const s = State.getState();
  return {
    hintsUnlockedCount: s.hintsUnlocked.length,
    routeRevealed: s.routeRevealed,
  };
}

// Input keys owned by main (forwarded to active renderer)
const keysDown = new Set<string>();
const onKeyDown = (e: KeyboardEvent) => {
  keysDown.add(e.key.toLowerCase());
  if (e.key === ' ') e.preventDefault();

  // Threat active -> ThreatManager owns input, skip game input
  if (threatManager.isBusy) return;

  // Global toggles
  const k = e.key.toLowerCase();
  if (k === 'i') {
    inventoryRenderer.toggle();
    companionPanel.hide();
    hintPanel.hide();
  }
  if (k === 'c') {
    companionPanel.toggle(companionSnapshot());
    inventoryRenderer.hide();
    hintPanel.hide();
  }
  if (k === 'h') {
    const zone = ZONES[currentZoneId ?? ''];
    if (zone) {
      hintPanel.toggle(zone, hintSnapshot());
      inventoryRenderer.hide();
      companionPanel.hide();
    }
  }
  if (k === 'm') {
    mapPanel.setVisible(!mapPanel.isVisible);
  }
  if (e.key === 'Escape') {
    // Close any open panel
    if (inventoryRenderer.visible) inventoryRenderer.hide();
    if (companionPanel.isVisible) companionPanel.hide();
    if (hintPanel.isVisible) hintPanel.hide();
  }
};
// ===== Canvas Click Routing (endgame button, companion panel) =====
const onCanvasClick = (e: MouseEvent) => {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = canvasEl.width / rect.width;
  const scaleY = canvasEl.height / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  // Endgame overlay takes priority
  if (endgame.active) {
    if (endgame.handleClick(cx, cy)) e.stopPropagation();
    return;
  }

  // Companion panel: clicking a met companion activates them
  if (companionPanel.isVisible) {
    const id = companionPanel.handleClick(cx, cy);
    if (id) {
      State.activateCompanion(id);
      Audio.playSfx('select');
      companionPanel.refresh(companionSnapshot());
      e.stopPropagation();
    }
  }
};
canvasEl?.addEventListener('click', onCanvasClick);

const onKeyUp = (e: KeyboardEvent) => {
  keysDown.delete(e.key.toLowerCase());
};
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// Dev/test hooks (stable names; E2E + perf scripts rely on these).
(window as any).__turboPerf = perf;
(window as any).__turboThreat = threatManager;
(window as any).__turboZoneIds = Object.keys(ZONES);
(window as any).__turboNav = (zoneId: string): boolean => {
  // Skip if the zone isn't in data or a threat/transition is in flight.
  if (!ZONES[zoneId]) { console.warn(`[dev-nav] unknown zone: ${zoneId}`); return false; }
  if (threatManager.isBusy || transitions.active) { console.warn(`[dev-nav] busy (threat/transition)`); return false; }
  enterZone(zoneId);
  return true;
};

// ===== Initialization =====
function init(): void {
  console.log('[Turbo] Initializing...');

  // Initialize overlay renderers once
  if (canvasEl) {
    threatManager.init(canvasEl);
    mangaOverlay.init(canvasEl);
    inventoryRenderer.init(canvasEl);
    hudRenderer.init(canvasEl);
    companionPanel.init(canvasEl);
    dialogueOverlay.init(canvasEl);
    dialogueOverlay.setVisibilityCheck(() => companionPanel.isVisible || hintPanel.isVisible || inventoryRenderer.visible);
    mapPanel.init(canvasEl, mapStore);
    hintPanel.init(canvasEl);
    transitions.init(canvasEl);
    endgame.init(canvasEl);
  }

  // Wire inventory to State
  inventoryRenderer.getSlots = () => State.getState().inventory as any;
  inventoryRenderer.getItem = (id) => ITEMS[id];
  inventoryRenderer.onUseItem = (itemId) => {
    if (!State.getState().inventory.find(s => s.item === itemId)) return;
    State.useItem(itemId); // applies category effects internally (comfort/food → +15)
    Audio.playSfx('pickup');
  };

  // Wire HUD to State
  hudRenderer.getDogName = () => DOGS[State.currentDog ?? '']?.name ?? '';
  hudRenderer.getHappiness = () => State.happiness;
  hudRenderer.getZoneName = () => ZONES[currentZoneId ?? '']?.name ?? '';
  hudRenderer.getItemCount = () =>
    (State.getState().inventory as Array<{ item: string | null; count: number }>).reduce((n, s) => n + (s.item ? s.count : 0), 0);
  hudRenderer.getCompanionName = () => {
    const id = State.activeCompanion;
    return id ? COMPANIONS[id]?.name ?? null : null;
  };
  hudRenderer.isThreatActive = () => threatManager.isBusy;

  // Lower-left status panel: live metrics + clues found
  hudRenderer.getMetrics = () => {
    const s = State.getState();
    const cluesFound = (s.inventory as Array<{ item: string | null }>).filter(
      (slot) => slot.item && (ITEMS[slot.item]?.category === 'clue' || ITEMS[slot.item]?.category === 'key')
    ).length;
    return {
      happiness: s.happiness,
      itemsCollected: s.itemsCollected,
      companionsMet: s.companionsMet.size,
      threatsResolved: s.threatsResolved,
      cluesFound,
      routeRevealed: s.routeRevealed,
    };
  };
  hudRenderer.getClues = () => {
    const s = State.getState();
    const seen = new Set<string>();
    const clues: string[] = [];
    for (const slot of s.inventory as Array<{ item: string | null; count: number }>) {
      if (!slot.item || slot.count <= 0) continue;
      const item = ITEMS[slot.item];
      if (!item) continue;
      if (item.category !== 'clue' && item.category !== 'key') continue;
      if (seen.has(slot.item)) continue;
      seen.add(slot.item);
      clues.push(item.name);
    }
    return clues;
  };

  // Wire threat manager to State + manga
  let activeThreatType: string | null = null;
  const setActiveThreatType = (t: string | null) => { activeThreatType = t; };
  threatManager.onStart = (threat: { type: string }) => { setActiveThreatType(threat.type); };
  threatManager.onStateChange = (phase, threat) => {
    if (!threat) setActiveThreatType(null);
    // Duck the music bed while a threat minigame is in play (intro + active).
    if (phase === 'intro' || phase === 'active') Audio.beginDuck();
    else if (phase === 'resolved') Audio.endDuck();
  };
  threatManager.onResolve = (threatId, success) => {
    const threat = THREATS[threatId];
    State.resolveThreat(threatId, success);
    Audio.playSfx(success ? 'threat_success' : 'threat_fail');
    setActiveThreatType(null);

    // Manga cutaway for combat threats
    if (threat?.type === 'combat' && canvasEl) {
      mangaOverlay.start(threat, success);
      mangaOverlay.onDone = () => { /* manga finished, nothing else to do */ };
    }
  };
  // HUD: live threat mini-game type for the warning border
  hudRenderer.setActiveThreatType = setActiveThreatType;

  // Endgame restart -> full reset back to dog select
  endgame.onRestart = () => {
    endgame.hide();
    transitions.cancel();
    State.reset();
    inventoryRenderer.hide();
    companionPanel.hide();
    hintPanel.hide();
    showScreen('select_dog');
    // Reset dog select UI
    document.querySelectorAll('.dog-card').forEach(c => c.classList.remove('selected'));
    if (startBtn) startBtn.classList.add('hidden');
  };

  // Audio context needs user gesture
  window.addEventListener('click', () => Audio.init(), { once: true });

  // Simulate asset loading
  setTimeout(() => {
    setupDogSelection();
    showScreen('select_dog');
  }, 800);
}

// ===== Dog Selection =====
function setupDogSelection(): void {
  if (!dogGrid) return;
  Object.values(DOGS).forEach((dog) => {
    const card = document.createElement('div');
    card.className = 'dog-card';
    card.dataset.dogId = dog.id;
    card.innerHTML = `
      <h2>${dog.name}</h2>
      <p class="breed">${dog.breed}</p>
      <p class="trait">Trait: ${dog.trait}</p>
      <p class="trait-desc">${dog.traitDesc}</p>
    `;
    card.addEventListener('click', () => selectDog(dog.id, card));
    dogGrid.appendChild(card);
  });
  startBtn?.addEventListener('click', startAdventure);
}

function selectDog(dogId: DogId, selectedCard: HTMLElement): void {
  Audio.playSfx('select');
  State.selectDog(dogId);
  document.querySelectorAll('.dog-card').forEach(c => c.classList.remove('selected'));
  selectedCard.classList.add('selected');
  startBtn?.classList.remove('hidden');
}

// ===== Game Start =====
function startAdventure(): void {
  State.reset(); // fresh run: happiness 100, empty inventory, no companions (save/load removed)
  Audio.playSfx('bark');
  showScreen('playing');
  enterZone('suburban_streets');
  if (!activeRenderer) {
    console.error('[Turbo] startAdventure: no active renderer after enterZone — game loop will be idle');
  }
  startGameLoop();
}

// Trigger a zone-specific threat (from zone data or a door threat)
function triggerZoneThreat(threatId: string): void {
  const threat = THREATS[threatId];
  if (!threat) { console.warn(`[Turbo] Unknown threat id: ${threatId}`); return; }
  if (threatManager.isBusy || mangaOverlay.isPlaying) return; // one threat at a time
  Audio.playSfx('threat_start');
  threatManager.start(threat);
}

// ===== Zone / Room Routing =====

/** Start a zone transition overlay. Swaps the zone at the midpoint. */
function playZoneTransition(zoneId: string, onSwap: () => void): void {
  const zone = ZONES[zoneId];
  const kind = zone?.transition ?? 'fade';
  // First zone of a run: no prior scene to hide, just swap immediately.
  if (!activeRenderer) { onSwap(); return; }
  transitions.play(kind, onSwap, 500, { direction: 'right', color: '#0a0a0a' });
}

/** Public entry point: records the zone immediately (map/state), then plays a
 *  transition that swaps the renderer at the midpoint. This keeps the map and
 *  game state consistent with the player's intent, even while the animation
 *  is still covering the old scene. */
function enterZone(zoneId: string): void {
  const zone = ZONES[zoneId];
  if (!zone) {
    console.error(`[Turbo] Unknown zone: ${zoneId}`);
    return;
  }

  // Record immediately so the map, state, and HUD reflect the new zone at once
  currentZoneId = zoneId;
  State.enterZone(zoneId);
  recordZoneInMap(zone);

  // Animate the visual swap (renderer + audio) at the midpoint
  playZoneTransition(zoneId, () => performZoneEntry(zoneId));
}

/** Core zone-entry logic: swap renderer + start audio (called at transition midpoint). */
function performZoneEntry(zoneId: string): void {
  const zone = ZONES[zoneId];
  if (!zone) {
    console.error(`[Turbo] Unknown zone: ${zoneId}`);
    return;
  }

  disposeActiveRenderer();

  // Audio is best-effort — never let it break game flow
  try {
    Audio.stopMusic();
    Audio.playMusic(zone.music);
  } catch (e) {
    console.warn('[Turbo] Zone audio failed:', (e as Error).message);
  }

  // Enter the entrance room (or first room)
  const entranceRoom = zone.rooms?.find(r => r.isEntrance) ?? zone.rooms?.[0];

  // Zone-specific threat: auto-triggers on zone entry (Sprint 4 zone threat mapping)
  if (zone.threat) {
    // Slight delay so the transition/first frame settles before the minigame grabs input
    setTimeout(() => {
      if (currentZoneId === zone.id && currentScreen === 'playing') triggerZoneThreat(zone.threat as string);
    }, 600);
  }

  if (zone.type === 'fp') {
    const firstRoomId = entranceRoom?.id ?? zone.rooms?.[0]?.id;
    if (!firstRoomId) { console.error('[Turbo] FP zone has no rooms:', zone.id); return; }
    currentRoomId = firstRoomId;
    const room = zone.rooms?.find(r => r.id === firstRoomId);
    if (!room) { console.error('[Turbo] Room not found:', firstRoomId); return; }
    if (canvasEl) {
      fpRenderer = new FpRoomRenderer();
      fpRenderer.setZoneRooms(zone.rooms ?? null);
      fpRenderer.init(canvasEl, room);
      wireFpRenderer(fpRenderer, zone);
      activeRenderer = fpRenderer;
      console.log(`[Turbo] FP renderer ready for room: ${room.name}`);
    } else {
      console.error('[Turbo] No canvas element for FP renderer');
    }
  } else if (zone.type === 'tp') {
    currentRoomId = null;
    if (canvasEl) {
      // Pass player color from selected dog
      const dog = DOGS[State.currentDog ?? ''];
      const zoneWithColors = { ...zone, playerColor: dog?.colors?.fur?.[0] ?? '#ffffff', playerAccent: dog?.colors?.accent ?? '#4a9eff' };
      tpRenderer = new TpEngineRenderer();
      tpRenderer.init(canvasEl, zoneWithColors);
      wireTpRenderer(tpRenderer, zone);
      activeRenderer = tpRenderer;
    }
  }

  console.log(`[Turbo] Entered zone: ${zone.name} (type=${zone.type})`);
}

/** Register a zone (and its elements) in the map as explored. */
function recordZoneInMap(zone: Zone): void {
  const emoji = (zone.name.match(/^\p{Emoji}/u)?.[0]) ?? '📍';
  mapStore.addZone(zone.id, zone.name, emoji);
  mapStore.explore(zone.id);
  // Discoverable elements: gates, items, home, NPCs
  for (const f of zone.features ?? []) {
    if (f.type === 'gate') mapStore.addElement(zone.id, { label: f.label, x: f.x, y: f.z, kind: 'gate' });
    else if (f.type === 'home') mapStore.addElement(zone.id, { label: '🏠 Home', x: f.x, y: f.z, kind: 'home' });
    else if (f.item && (f.type === 'treasure' || f.type === 'hint' || f.type === 'food')) {
      mapStore.addElement(zone.id, { label: f.label, x: f.x, y: f.z, kind: 'item' });
    }
  }
  for (const npc of zone.npcs ?? []) {
    mapStore.addElement(zone.id, { label: npc.name, x: npc.x, y: npc.z, kind: 'npc' });
  }
  // Discover adjacent zones (from gates) + home, so the map shows where to go
  for (const f of zone.features ?? []) {
    if (f.gate && ZONES[f.gate]) {
      const tz = ZONES[f.gate];
      const tzEmoji = (tz.name.match(/^\p{Emoji}/u)?.[0]) ?? '📍';
      mapStore.addZone(f.gate, tz.name, tzEmoji);
    }
  }
  // Home is always discoverable (the goal)
  if (ZONES.home) {
    const tz = ZONES.home;
    const tzEmoji = (tz.name.match(/^\p{Emoji}/u)?.[0]) ?? '🏠';
    mapStore.addZone('home', tz.name, tzEmoji);
  }
}

function enterRoom(roomId: string): void {
  const zone = ZONES[currentZoneId ?? ''];
  if (!zone || zone.type !== 'fp') return;
  const room = zone.rooms?.find(r => r.id === roomId);
  if (!room) return;

  // Dispose old FP renderer
  if (fpRenderer) { fpRenderer.dispose(); fpRenderer = null; }

  currentRoomId = roomId;
  if (canvasEl) {
    fpRenderer = new FpRoomRenderer();
    fpRenderer.setZoneRooms(zone.rooms ?? null);
    fpRenderer.init(canvasEl, room);
    wireFpRenderer(fpRenderer, zone);
    activeRenderer = fpRenderer;
  }
  State.enterRoom(roomId);
  mapStore.setRoom(roomId);
  // Refresh door threat for the new room (one-shot per zone entry)
  const zone2 = ZONES[currentZoneId ?? ''];
  if (fpRenderer) fpRenderer.setDoorThreat(zone2?.doorThreat ?? null);
}

function disposeActiveRenderer(): void {
  if (fpRenderer) { fpRenderer.dispose(); fpRenderer = null; }
  if (tpRenderer) { tpRenderer.dispose(); tpRenderer = null; }
  activeRenderer = null;
}

// ===== FP Renderer Wiring =====
function wireFpRenderer(renderer: FpRoomRenderer, zone: Zone): void {
  // Feature interaction: click a feature in the room
  renderer.onFeatureClick = (featureId: string) => {
    // featureId format: `${roomId}_${index}`
    const parts = featureId.split('_');
    const index = parseInt(parts[parts.length - 1], 10);
    const room = zone.rooms?.find(r => r.id === currentRoomId);
    const feature = room?.features?.[index];
    if (!feature) return;
    handleFeature(feature, zone);
  };

  // Proximity E/Space interaction (e.g. "New Friend" in the kennels, locked doors)
  renderer.onFeatureInteract = (feature: RoomFeature) => {
    handleFeature(feature, zone);
  };

  // Exit navigation
  renderer.onExitClick = (exitRoomId: string) => {
    navigateToExit(exitRoomId, zone);
  };

  // Proximity / key interaction at a door (walk into the wall or press E/Space)
  renderer.onExitInteract = (exitRoomId: string) => {
    navigateToExit(exitRoomId, zone);
  };

  // Zone-specific door threat: E/Space at the entrance-room exit wall fires it
  if (zone.doorThreat) renderer.setDoorThreat(zone.doorThreat);
  renderer.onDoorThreat = (threatId: string) => triggerZoneThreat(threatId);
}

/**
 * Resolve an exit room id into the correct navigation call.
 * If the exit is an entrance to another zone, portal there; otherwise move
 * to the adjacent room within the current zone. Shared by click and
 * proximity/key interaction paths.
 */
function navigateToExit(exitRoomId: string, zone: Zone): void {
  const exitRoom = zone.rooms?.find(r => r.id === exitRoomId);
  if (!exitRoom) return;

  if (exitRoom.entranceZone) {
    enterZone(exitRoom.entranceZone);
  } else {
    enterRoom(exitRoomId);
  }
}

// ===== TP Renderer Wiring =====
function wireTpRenderer(renderer: TpEngineRenderer, zone: Zone): void {
  renderer.onFeatureInteract = (feature: Feature) => {
    handleFeature(feature, zone);
  };

  renderer.onNpcInteract = (npc) => {
    // Find matching companion and meet them
    const companionId = Object.keys(COMPANIONS).find(id => COMPANIONS[id].name === npc.name);
    if (companionId) {
      State.meetCompanion(companionId);
      showCompanionDialogue(companionId);
      companionPanel.refresh(companionSnapshot());
    }
  };

  renderer.onReturnGate = (zoneId: string) => {
    if (zoneId) enterZone(zoneId);
  };
}

// ===== Feature Handling (shared FP + TP) =====

/** Show a companion's greeting line in a dialogue bubble (after a bark). */
function showCompanionDialogue(companionId: string): void {
  const companion = COMPANIONS[companionId];
  if (!companion) return;
  Audio.playSfx('bark');
  Audio.beginDuck(); // let the dialogue bark sit above the music bed
  const lines = companion.dialogue;
  const line = lines.length ? lines[Math.floor(Math.random() * lines.length)] : 'Woof!';
  dialogueOverlay.show(companion.name, line, companion.color, companion.accentColor);
  // Release the duck when the bubble auto-dismisses.
  setTimeout(() => Audio.endDuck(), 6000);
}

function handleFeature(feature: { type: string; item?: string; gate?: string; threat?: string }, zone: Zone): void {
  const ftype = feature.type;

  // Zone gate (a feature carrying a `gate` target zone) — hub navigation
  if (feature.gate && ZONES[feature.gate]) {
    Audio.playSfx('select');
    enterZone(feature.gate);
    return;
  }

  // 'You are here' marker — harmless, just acknowledge
  if (ftype === 'here') {
    Audio.playSfx('select');
    return;
  }

  // Threat triggers — by explicit threat id first (zone-specific + feature threat),
  // then fall back to a zone-aware legacy core-type map.
  const threatId = feature.threat;
  if (threatId) {
    triggerZoneThreat(threatId);
    return;
  }
  const coreMap: Record<string, string> = {
    traffic: 'traffic',
    cat: 'cat',
    bully: 'bully',
    storm: 'storm',
    vacuum: 'vacuum',
  };
  const legacyId = coreMap[ftype];
  if (legacyId) {
    triggerZoneThreat(zone.legacyThreat ?? legacyId);
    return;
  }

  // Companion (must come BEFORE item pickup: a dog_friend feature also carries
  // an item, but its primary effect is meeting/activating the companion)
  if (ftype === 'dog_friend') {
    const companionId = zone.companions?.[0] ?? Object.keys(COMPANIONS)[0];
    State.meetCompanion(companionId);
    showCompanionDialogue(companionId);
    companionPanel.refresh(companionSnapshot());
    return;
  }

  // Item pickup
  if (feature.item && ITEMS[feature.item]) {
    if (State.collectItem(feature.item)) {
      Audio.playSfx('pickup');
    }
    return;
  }

  // Home / celebration -> win
  if (ftype === 'home' || ftype === 'celebration') {
    State.gameWin();
    showVictory();
    return;
  }

  // Hint / clue -> unlock hint
  if (ftype === 'hint' || ftype === 'tree_clue') {
    State.unlockHint(zone.id);
    Audio.playSfx('select');
    hintPanel.refresh(zone, hintSnapshot());
    return;
  }

  // Door (locked) -> needs key
  if (ftype === 'door') {
    const hasKey = (State.getState().inventory as Array<{ item: string | null; count: number }>).some(s => s.item === 'key');
    if (hasKey) {
      State.useItem('key');
      Audio.playSfx('select');
    } else {
      Audio.playSfx('select');
    }
    return;
  }

  // Default: play a generic sound
  Audio.playSfx('select');
}

// ===== Endgame Display =====
function showVictory(): void {
  showScreen('victory');
  endgame.show('victory', State.getState());
}

function showDefeat(): void {
  showScreen('game_over');
  endgame.show('defeat', State.getState());
}

// ===== Screen Management =====
function showScreen(screen: Screen): void {
  currentScreen = screen;

  // For game_over / victory, keep the game canvas visible behind a message
  if (screen === 'game_over' || screen === 'victory') {
    gameViewContainer?.classList.remove('hidden');
    return;
  }

  loadingScreen?.classList.add('hidden');
  dogSelectScreen?.classList.add('hidden');
  gameViewContainer?.classList.add('hidden');

  switch (screen) {
    case 'loading': loadingScreen?.classList.remove('hidden'); break;
    case 'select_dog': dogSelectScreen?.classList.remove('hidden'); break;
    case 'playing': gameViewContainer?.classList.remove('hidden'); break;
  }
}

// ===== Game Loop =====
let lastTime = performance.now();

function startGameLoop(): void {
  function loop(currentTime: number): void {
    const deltaMs = currentTime - lastTime;
    const delta = deltaMs / 1000;
    lastTime = currentTime;

    if (currentScreen === 'playing' || currentScreen === 'game_over' || currentScreen === 'victory') {
      update(delta, currentTime);
      perf.recordFrame(deltaMs);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function update(delta: number, time: number): void {
  if (currentScreen !== 'playing') return;

  // Happiness decay (only when not in a threat) — rate from config, companion bonus applied
  if (!threatManager.isBusy && State.happiness > 0) {
    const decay = HAPPINESS.DECAY_PER_SECOND * (State.getState().activeCompanion ? HAPPINESS.COMPANION_BONUS_MULTIPLIER : 1);
    State.modifyHappiness(-decay * delta);
  }

  // Check game over
  if (State.happiness <= 0 && currentScreen === 'playing') {
    State.gameOver();
    showDefeat();
    return;
  }

  // Update transitions (zone fades)
  transitions.update(delta * 1000);

  // Update threat manager first (it owns input when active)
  threatManager.update(delta, time);

  // Update manga overlay
  mangaOverlay.update(delta, time);

  // Update active zone renderer only when no threat/manga is playing
  if (!threatManager.isBusy && !mangaOverlay.isPlaying) {
    activeRenderer?.update(delta, time);
  }

  // HUD always renders
  hudRenderer.update(delta, time);

  // Panels render LAST so they paint on top of the zone + HUD every frame.
  // (A panel opened on keydown would otherwise be overwritten by the next
  // zone/HUD render; re-rendering here keeps it visible.)
  if (companionPanel.isVisible) {
    companionPanel.refresh(companionSnapshot());
  } else if (hintPanel.isVisible) {
    const zone = ZONES[currentZoneId ?? ''];
    if (zone) hintPanel.refresh(zone, hintSnapshot());
  } else if (inventoryRenderer.visible) {
    inventoryRenderer.update(0, time);
  }

  // Dialogue overlay renders last (on top of everything) when active
  if (dialogueOverlay.active) {
    dialogueOverlay.render();
  }

  // Minimap renders on top of the zone + HUD (top-right)
  mapPanel.render();
}

// ===== Debug Bridge (E2E test assertions) =====
// Exposes minimal game state to window for Playwright assertions.
// Not used by the game itself; purely a test hook.
(window as any).__turbo = {
  get currentZoneId() { return currentZoneId ?? null; },
  get happiness() { return State.getState().happiness; },
  get threatPhase() { return threatManager.phase; },
  get threatBusy() { return threatManager.isBusy; },
  get endgameVisible() { return endgame.active; },
  get companionPanelVisible() { return companionPanel.isVisible; },
  get hintPanelVisible() { return hintPanel.isVisible; },
  get inventoryVisible() { return inventoryRenderer.visible; },
  get companionsMet() { return [...State.getState().companionsMet]; },
  get dialogueOverlayActive() { return dialogueOverlay.active; },
  get dialogueOverlayState() { return (dialogueOverlay as any).state ?? null; },
  get map() { return mapStore.zones().map((z) => ({ id: z.id, explored: z.explored, current: z.current, elements: z.elements.length, rooms: z.rooms })); },
  get itemsCollected() { return State.getState().itemsCollected; },
  get threatsResolved() { return State.getState().threatsResolved; },
  threatManager, // direct handle for test-only resolve/inspection
  transitions, // direct handle for test-only transition inspection
  ZONES, // zone data for test inspection
  state: () => State.getState(),
  useItem: (id: string) => State.useItem(id),
  giveItem: (id: string) => {
      State.collectItem(id);
      // Note: giveItem does NOT apply category effects — it's a test/debug
      // bridge for putting items in the inventory. Use useItem to consume
      // and get the effect.
    },
  activateCompanion: (id: string) => State.activateCompanion(id as any),
  HAPPINESS_CONFIG: { ...HAPPINESS },
  // Navigate directly (bypasses click detection for test reliability)
  navigateToZone(zoneId: string) { enterZone(zoneId); },
  navigateToRoom(roomId: string) { enterRoom(roomId); },
  forceEndgame(result: 'victory' | 'defeat') {
    if (result === 'victory') showVictory();
    else showDefeat();
  },
};

// ===== Boot =====
window.addEventListener('load', init);
