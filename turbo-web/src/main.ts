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
import { FpRoomRenderer } from './engine/render/fp-room-renderer';
import { TpEngineRenderer } from './engine/render/tp-engine';
import { ThreatManager } from './engine/threats';
import { MangaCombatOverlay } from './engine/render/manga-combat';
import { InventoryRenderer } from './engine/inventory';
import { HUDRenderer } from './engine/render/hud';
import type { DogId, Zone, Room, Feature } from './types';

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

let activeRenderer: { update: (d: number, t: number) => void; dispose: () => void } | null = null;

// ===== Game Flow State =====
type Screen = 'loading' | 'select_dog' | 'playing' | 'game_over' | 'victory';
let currentScreen: Screen = 'loading';
let currentZoneId: string | null = null;
let currentRoomId: string | null = null;

// Input keys owned by main (forwarded to active renderer)
const keysDown = new Set<string>();
const onKeyDown = (e: KeyboardEvent) => {
  keysDown.add(e.key.toLowerCase());
  if (e.key === ' ') e.preventDefault();

  // Threat active -> ThreatManager owns input, skip game input
  if (threatManager.isBusy) return;

  // Global toggles
  const k = e.key.toLowerCase();
  if (k === 'i') inventoryRenderer.toggle();
  if (k === ' ' && currentScreen === 'playing') {
    // SPACE handled by threat manager when active; otherwise ignored
  }
};
const onKeyUp = (e: KeyboardEvent) => {
  keysDown.delete(e.key.toLowerCase());
};
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// ===== Initialization =====
function init(): void {
  console.log('[Turbo] Initializing...');

  // Initialize overlay renderers once
  if (canvasEl) {
    threatManager.init(canvasEl);
    mangaOverlay.init(canvasEl);
    inventoryRenderer.init(canvasEl);
    hudRenderer.init(canvasEl);
  }

  // Wire inventory to State
  inventoryRenderer.getSlots = () => State.getState().inventory as any;
  inventoryRenderer.getItem = (id) => ITEMS[id];
  inventoryRenderer.onUseItem = (itemId) => {
    if (State.getState().inventory.find(s => s.item === itemId)) {
      State.useItem(itemId);
      Audio.playSfx('pickup');
    }
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

  // Wire threat manager to State + manga
  threatManager.onResolve = (threatName, success) => {
    const threat = Object.values(THREATS).find(t => t.name === threatName);
    State.resolveThreat(threatName, success);
    Audio.playSfx(success ? 'bark' : 'select');

    // Manga cutaway for combat threats
    if (threat?.type === 'combat' && canvasEl) {
      mangaOverlay.start(threat, success);
      mangaOverlay.onDone = () => { /* manga finished, nothing else to do */ };
    }
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
  Audio.playSfx('bark');
  showScreen('playing');
  enterZone('suburban_streets');
  startGameLoop();
}

// ===== Zone / Room Routing =====
function enterZone(zoneId: string): void {
  const zone = ZONES[zoneId];
  if (!zone) {
    console.error(`[Turbo] Unknown zone: ${zoneId}`);
    return;
  }

  disposeActiveRenderer();
  currentZoneId = zoneId;

  // Stop music, start new track
  Audio.stopMusic();
  Audio.playMusic(zone.music);

  // Enter the entrance room (or first room)
  const entranceRoom = zone.rooms?.find(r => r.isEntrance) ?? zone.rooms?.[0];

  if (zone.type === 'fp') {
    const firstRoomId = entranceRoom?.id ?? zone.rooms?.[0]?.id;
    if (!firstRoomId) { console.error('[Turbo] FP zone has no rooms:', zone.id); return; }
    currentRoomId = firstRoomId;
    const room = zone.rooms?.find(r => r.id === currentRoomId);
    if (room && canvasEl) {
      fpRenderer = new FpRoomRenderer();
      fpRenderer.init(canvasEl, room);
      wireFpRenderer(fpRenderer, zone);
      activeRenderer = fpRenderer;
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
  } else {
    // 'search' type — not implemented in v2 yet; fall back to fp if rooms exist
    if (zone.rooms && canvasEl) {
      currentRoomId = zone.rooms[0].id;
      fpRenderer = new FpRoomRenderer();
      const room = zone.rooms[0];
      fpRenderer.init(canvasEl, room);
      wireFpRenderer(fpRenderer, zone);
      activeRenderer = fpRenderer;
    }
  }

  State.enterZone(zoneId);
  console.log(`[Turbo] Entered zone: ${zone.name} (type=${zone.type})`);
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
    fpRenderer.init(canvasEl, room);
    wireFpRenderer(fpRenderer, zone);
    activeRenderer = fpRenderer;
  }
  State.enterRoom(roomId);
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

  // Exit navigation
  renderer.onExitClick = (exitRoomId: string) => {
    const exitRoom = zone.rooms?.find(r => r.id === exitRoomId);
    if (!exitRoom) return;

    if (exitRoom.entranceZone) {
      // Portal to another zone
      enterZone(exitRoom.entranceZone);
    } else {
      enterRoom(exitRoomId);
    }
  };
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
      Audio.playSfx('bark');
    }
  };

  renderer.onReturnGate = (zoneId: string) => {
    if (zoneId) enterZone(zoneId);
  };
}

// ===== Feature Handling (shared FP + TP) =====
function handleFeature(feature: { type: string; item?: string }, zone: Zone): void {
  const ftype = feature.type;

  // Threat triggers
  const threatMap: Record<string, string> = {
    traffic: 'Traffic',
    cat: 'Mean Cat',
    bully: 'Bully Dog',
    storm: 'Thunderstorm',
    vacuum: 'Vacuum Monster',
  };
  const threatName = threatMap[ftype];
  if (threatName) {
    const threat = Object.values(THREATS).find(t => t.name === threatName);
    if (threat) {
      Audio.playSfx('bark');
      threatManager.start(threat);
    }
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
    showScreen('victory');
    return;
  }

  // Companion
  if (ftype === 'dog_friend') {
    // Find a companion associated with this zone
    const companionId = zone.companions?.[0] ?? Object.keys(COMPANIONS)[0];
    State.meetCompanion(companionId);
    Audio.playSfx('bark');
    return;
  }

  // Hint / clue -> unlock hint
  if (ftype === 'hint' || ftype === 'tree_clue') {
    State.unlockHint(zone.id);
    Audio.playSfx('select');
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
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (currentScreen === 'playing' || currentScreen === 'game_over' || currentScreen === 'victory') {
      update(delta, currentTime);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function update(delta: number, time: number): void {
  if (currentScreen !== 'playing') return;

  // Happiness decay (only when not in a threat)
  if (!threatManager.isBusy && State.happiness > 0) {
    State.modifyHappiness(-0.5 * delta);
  }

  // Check game over
  if (State.happiness <= 0 && currentScreen === 'playing') {
    State.gameOver();
    showScreen('game_over');
    return;
  }

  // Update threat manager first (it owns input when active)
  threatManager.update(delta, time);

  // Update manga overlay
  mangaOverlay.update(delta, time);

  // Update inventory (hover tracking)
  inventoryRenderer.update(delta, time);

  // Update active zone renderer only when no threat/manga is playing
  if (!threatManager.isBusy && !mangaOverlay.isPlaying) {
    activeRenderer?.update(delta, time);
  }

  // HUD always renders
  hudRenderer.update(delta, time);

  // Inventory renders on top when visible
  if (inventoryRenderer.visible) {
    inventoryRenderer.update(0, time); // just render
  }
}

// ===== Boot =====
window.addEventListener('load', init);
