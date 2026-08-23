# Turbo: Lost & Found — Phase 2 Rebuild (v2.0)

A web-based adventure game where you play as a lost dog finding your way home through atmospheric zones inspired by Resident Evil's survival-horror tension, but with heartwarming companionship and hope.

**Tech Stack:** Vite + TypeScript + Canvas 2D (no Three.js dependencies)

---

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or pnpm

### Installation

```bash
cd turbo-game-v2
npm install
```

### Development Server

```bash
npm run dev
# Runs on http://localhost:3094
```

### Production Build

```bash
npm run build
# Output in dist/ directory
```

### Preview Production Build

```bash
npm run preview
```

---

## Project Structure

```
turbo-game-v2/
├── turbo-web/
│   ├── index.html              # Entry point
│   └── src/
│       ├── main.ts             # Bootstrap, dog select, game loop
│       ├── types.ts            # TypeScript interfaces (Dog, Zone, Room, etc.)
│       ├── data.ts             # Game content: DOGS, ZONES, ITEMS, THREATS
│       ├── config.ts           # Tunable constants only
│       └── engine/
│           ├── state.ts        # Central state manager with pub/sub
│           ├── audio.ts        # Web Audio API (procedural SFX)
│           └── render/         # Phase 2: FP/TP/Search renderers
├── dist/                       # Production build output
├── package.json
├── tsconfig.json               # Strict TypeScript config
└── vite.config.ts              # Vite with @ path alias
```

---

## Architecture Decisions (v2 vs v1)

### What Went Wrong in Phase 1

| Issue | Root Cause | v2 Solution |
|-------|-----------|-------------|
| Double animation loops | FP renderer had internal RAF + main.ts called update() again | Single `requestAnimationFrame` loop in main.ts, all renderers use external `update(delta)` |
| CONFIG.zones crash | Zones array deleted but state.ts still called `.indexOf()` | Defensive reads with fallback defaults; no direct config mutation |
| Canvas sizing mismatches | Inconsistent canvas sizes across renderers | Unified size manager: 1280x720 fixed, all renderers report dimensions consistently |
| Renderer init timing | RAF started before room data ready | Explicit `init(canvas, data)` contract — no implicit state |

### Core Principles

1. **Single Animation Loop** — main.ts owns ONE RAF loop. All renderers receive `update(delta, time)`. No renderer starts its own RAF.
2. **Explicit Init Contracts** — Every renderer: `(canvas) → init(data) → update() → dispose()`
3. **State as Source of Truth** — Centralized state manager. Renderers read via getters only.
4. **No External Dependencies** — Canvas 2D for all rendering (no Three.js), Web Audio API for audio (no Howler).
5. **TypeScript Strict Mode** — Catch type errors at compile time, prevent runtime crashes.

---

## Game Design Overview

### Playable Dogs (5 Total)

| Dog | Breed | Trait | Effect |
|-----|-------|-------|--------|
| Turbo | Alaskan Husky | Speed | +20% movement speed |
| Watson | German Shepherd | Brave | Easier combat QTEs |
| Nova | Golden Retriever | Happiness | Slower morale decay, companion bonuses amplified |
| Walter | English Bulldog | Sniff | Finds items/hints 30% faster |
| Beaux | Chihuahua | Compact | +1 inventory slot in bandana |

### Zones (6 Chapters + Side Areas)

**Main Story Arc:**
1. **Suburban Streets** (FP) — Tutorial, traffic threats, first encounters
2. **Dog Park** (TP) — First companion meeting, open exploration
3. **Apartment Building** (FP) — Claustrophobic isolation, storm threat
4. **Animal Shelter** (FP) — Dark midpoint, discovery of lost dog poster
5. **The Neighborhood** (FP) — Almost home, final stretch
6. **Home** (FP) — Victory condition, celebration

### Core Mechanics

- **Happiness System** — Decays over time. Comfort items restore it. Game over at 0.
- **Scent Trail** — Orange particle trail marks your path (fades over time).
- **Threats** — Mini-games: Timing (traffic), Combat QTE (cats/bullies), Sneak (vacuums/snakes), Comfort (storms/fog).
- **Companions** — Meet dogs who join you with unique bonuses.

---

## Current Status

### ✅ Sprint 1 Complete (Foundation)
- [x] TypeScript project setup (strict mode)
- [x] Core types defined (Dog, Zone, Room, Item, Threat, Companion)
- [x] Game content: 5 dogs, 6 zones, items, threats
- [x] State manager with pub/sub events
- [x] Audio manager (Web Audio API, procedural SFX)
- [x] Main.ts bootstrap (loading → dog select → playing flow)
- [x] Single animation loop architecture

### ✅ Sprint 2 Complete (FP Renderer)
- [x] Base renderer class (`base-renderer.ts`) — abstract `init/update/dispose` contract enforced
- [x] FP room renderer (`fp-room-renderer.ts`) — top-down Canvas 2D with WASD movement
- [x] Room geometry from data — walls, floor, features as labeled shapes
- [x] Fog/atmosphere overlay per zone color
- [x] Exit navigation between rooms (gold circles + directional arrows)
- [x] Feature click detection (radius-based hit zones)
- [x] Player position tracking with directional indicator

### ✅ Sprint 3 Complete: TP Engine, Threats, Manga Combat, Inventory
- [x] TP engine renderer (`tp-engine.ts`) — top-down Canvas 2D, dog model, NPC wander AI, obstacle collision, scent trail particles, feature/NPC interaction, return gates
- [x] Threat manager (`threats.ts`) — 4 mini-game types: timing (gap crossing), combat (rhythm QTE), sneak (detection meter), comfort (hold-to-shelter); fully owns keyboard while active
- [x] Manga cutaway combat overlay (`manga-combat.ts`) — 3-panel comic with speed lines, SFX burst, outcome panel
- [x] Inventory renderer (`inventory.ts`) — 4×4 grid, hover/select, click-to-use, item info sidebar, [I] toggle
- [x] HUD renderer (`hud.ts`) — happiness bar, zone name, item count, companion, threat warning border
- [x] Full main.ts rewrite — zone routing by type (fp/tp/search), threat triggers from features, manga integration, win/lose flow
- [x] All 40 threats in data are playable (5 core + 35 zone-specific)
- [x] Build compiles cleanly, data integrity checks pass

### ✅ Sprint 4 Complete: Polish & Content Wiring
- [x] Companion panel ([C] toggle) + companion follow rendering in TP view
- [x] Hint/route panel ([H] toggle) + progressive unlock wiring
- [x] Zone transition effects (fade-in/out) between zones
- [x] Game over / victory screens with score (time, items, companions, threats)
- [x] Full E2E suite (Playwright: navigation, threats, interactions, endgame, fuzz)

> Note: save/load persistence was implemented in Sprint 4, then intentionally removed on 2026-08-22 (no more Continue button or autosave).

#### ⚠️ Sprint 4 — Remaining
- [x] **Zone-specific threat mapping** — ✅ COMPLETED 2026-08-22: all 40 threats now triggerable via zone `threat` (auto on entry), `doorThreat` (E/Space at FP exit door), `legacyThreat` (zone-aware core features), and feature `threat` (confirm-gated objects). See `tests/zone-threats.spec.ts` (6 tests).
- [ ] **Playtest + balance pass** — no formal balance review of happiness decay, threat difficulty, or item values
- [ ] **Transition variety** — only fade-in/out exists; wipe/zoom/slide effects from the original list are not implemented

### ✅ Sprint 5: Interactions, Minimap & Polish (2026-08-21)
- [x] E/Space confirm for FP doors, TP threats/gates/NPCs (with "Press E" prompts)
- [x] Walk-into-wall auto-enter + clockwise exit mapping + moveSpeed fix (FP rooms)
- [x] Suburban Streets ported fp → tp (open world with gates to all 14 zones)
- [x] Minimap (MapStore + MapPanel) — explored zones, rooms, elements, [M] toggle + 9 map tests
- [x] Companion dialogue overlay (speech bubble on meet)
- [x] HUD polish — measured pill layout, lower-left Status panel (metrics + clues)
- [x] Spawn-trap safety net (`nudgeAwayFromObstacles()` in tp-engine)
- [x] 39/39 Playwright tests passing, tsc + vite build clean

### ✅ Sprint 2.5: Full World Port (v2.1)
- [x] Ported all 13 v1 side zones (lake, pet_store, dog_show, forest, beach, mountain, garden, library, market, cave, waterfall, park_secret)
- [x] Ported 15 companions (4 core + 11 zone-specific)
- [x] Ported 69 items (categorized: comfort/clue/key/collectible/food/utility/story/crafting/quest/rare)
- [x] Ported 40 threats (5 core + 35 zone-specific)
- [x] World connectivity restored — suburban streets has entrance gates to all TP side zones
- [x] Data integrity checks pass (scripts/check-data-integrity.ts)
- [x] Build compiles cleanly (vite build)

---

## Development Notes

### Path Alias (`@/`)
The `@` alias resolves to `turbo-web/src/`. Use it in imports:

```typescript
import { State } from '@/engine/state';
import type { DogId } from '@/types';
```

### Canvas Sizing
All canvases are 1280x720. Renderer classes report their dimensions via getters so the unified size manager can handle responsive scaling if needed later.

### Audio System
Web Audio API used directly — no external libraries. Procedural SFX generated via oscillators for prototype phase. Real audio files can be added in Sprint 5+.

---

## Testing

Unit tests will be added in Sprint 3+ covering:
- State manager transitions (selectDog, collectItem, modifyHappiness)
- Data integrity (all zones have valid rooms, all items referenced exist)
- Renderer contracts (init/update/dispose lifecycle)
- Input routing (keyboard events dispatch to active renderer)

---

## Credits

**Concept & Design:** Mike  
**Development:** OpenClaw Agent (Tom)  

---

*Phase 2 rebuild avoids all V1 architecture bugs by starting fresh with proven patterns.*
