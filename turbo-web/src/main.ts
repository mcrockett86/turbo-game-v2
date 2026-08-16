/**
 * Main Entry Point — Bootstrap, Dog Select, Game Loop
 */

import { State } from './engine/state';
import { Audio } from './engine/audio';
import { ZONES, ITEMS } from './data';
import { FpRoomRenderer } from './engine/render/fp-room-renderer';
import type { DogId } from './types';

// ===== DOM References =====
const loadingScreen = document.getElementById('loading-screen');
const dogSelectScreen = document.getElementById('dog-select');
const gameViewContainer = document.getElementById('game-view');
const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement;
const dogGrid = document.getElementById('dog-grid');
const startBtn = document.getElementById('start-adventure-btn');

// ===== Active Renderer (single source of truth) =====
let activeRenderer: FpRoomRenderer | null = null;

// ===== Game State Machine =====
type Screen = 'loading' | 'select_dog' | 'playing';
let currentScreen: Screen = 'loading';

// ===== Initialization =====
function init(): void {
  console.log('[Turbo] Initializing...');
  
  // Show loading screen
  showScreen('loading');
  
  // Initialize audio context (requires user gesture in browsers)
  Audio.init();
  
  // Simulate asset loading delay
  setTimeout(() => {
    console.log('[Turbo] Assets loaded, switching to dog select');
    setupDogSelection();
    showScreen('select_dog');
  }, 1000);
}

// ===== Dog Selection Screen =====
function setupDogSelection(): void {
  if (!dogGrid) return;
  
  // Render dog cards
  Object.values(DOGS).forEach((dog, index) => {
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
  
  // Start button handler
  if (startBtn) {
    startBtn.addEventListener('click', startAdventure);
  }
}

function selectDog(dogId: DogId, selectedCard: HTMLElement): void {
  console.log(`[Turbo] Selected dog: ${dogId}`);
  
  Audio.playSfx('select');
  
  // Highlight selected card
  document.querySelectorAll('.dog-card').forEach(card => {
    card.classList.remove('selected');
  });
  selectedCard.classList.add('selected');
  
  // Show start button
  if (startBtn) {
    startBtn.classList.remove('hidden');
  }
}

function startAdventure(): void {
  console.log('[Turbo] Starting adventure...');
  
  Audio.playSfx('bark');
  
  // Get selected dog from State
  const currentDog = State.currentDog;
  if (!currentDog) {
    console.error('[Turbo] No dog selected!');
    return;
  }
  
  // Initialize FP renderer for first room
  if (canvasEl) {
    activeRenderer = new FpRoomRenderer();
    const zoneId = 'suburban_streets';
    const roomId = 'start';
    
    const zone = ZONES[zoneId];
    const roomIndex = zone?.rooms?.findIndex(r => r.id === roomId) ?? 0;
    const roomData = zone?.rooms?.[roomIndex];
    
    if (roomData) {
      try {
        activeRenderer.init(canvasEl, roomData);
        console.log(`[Turbo] Initialized FP renderer for room: ${roomData.name}`);
      } catch (e) {
        console.error('[Turbo] Failed to initialize renderer:', e);
        return;
      }
    } else {
      console.error('[Turbo] No valid room data found');
      return;
    }
  }
  
  // Transition to game view
  showScreen('playing');
  
  // Start the game loop
  startGameLoop();
}

// ===== Screen Management =====
function showScreen(screen: Screen): void {
  currentScreen = screen;
  
  // Hide all screens
  loadingScreen?.classList.add('hidden');
  dogSelectScreen?.classList.add('hidden');
  gameViewContainer?.classList.add('hidden');
  
  // Show target screen
  switch (screen) {
    case 'loading':
      loadingScreen?.classList.remove('hidden');
      break;
    case 'select_dog':
      dogSelectScreen?.classList.remove('hidden');
      break;
    case 'playing':
      gameViewContainer?.classList.remove('hidden');
      break;
  }
}

// ===== Game Loop =====
let lastTime = performance.now();

function startGameLoop(): void {
  console.log('[Turbo] Starting game loop...');
  
  function loop(currentTime: number): void {
    const deltaTime = (currentTime - lastTime) / 1000; // seconds
    lastTime = currentTime;
    
    // Update game state and renderer
    update(deltaTime);
    
    // Request next frame
    requestAnimationFrame(loop);
  }
  
  requestAnimationFrame(loop);
}

// ===== Game Logic =====
function update(delta: number): void {
  // Update happiness decay
  if (State.happiness > 0) {
    const decay = 0.5 * delta;
    State.modifyHappiness(-decay);
  }
  
  // Delegate update to active renderer (it handles its own rendering internally)
  if (activeRenderer?.isReady) {
    activeRenderer.update(delta, performance.now());
  }
}

// ===== Boot =====
window.addEventListener('load', init);
