# Sprint 8 — Context Layer & Playability

**Goal:** Stop adding features and start making the game *feel like one world*. The mechanics and visuals are solid (Sprints 5–7 done); what's missing is **relatability** — the sense that every zone, threat, item, and NPC belongs to the same story about being a dog on the run trying to get home.

Two pillars:

1. **Threat minigames earn their zone.** Today 40+ named threats all play as the same 4 generic bars (red dot / green gap, DETECTION, SHELTER PROGRESS). A "Lake Monster" should feel like water; a "Dog Show Judge" should feel like a stage; a "Pet Shop Cat" should feel like a shop.
2. **FP zones and the story connect.** First-person rooms are click-to-grab today. Items, hints, and interactions should *tell the story* — examining a diary page should say something about the journey, and the companion should react to what just happened.

Per Mike (2026-08-26): *not* a feature-addition sprint. Improve the context layer and playability, making meaningful connections between items, threat minigames, and the player story.

**Deferred from Sprint 7 (recorded here so it isn't lost):**
- **Image-tool / vision-model fix** — primary model is text-only; all configured image-capable models fail at the local endpoint; working model `google/gemma-4-31b-qat` found but not registered. Fix: register it as `agents.defaults.imageModel` (Qwen-vision as fallbacks) + `lms load` / free VRAM server-side. *(Mike: "take care of that change later.")*
- **Sprint 7 DoD close-out** — README before/after screenshots (TP, FP, dog-select), then mark the Sprint 7 section complete. Blocked on the item above.

**Guardrails (still in force from Sprints 6/7):**
- Single RAF loop in `main.ts`; renderers never start their own loops.
- Frame budgets: p50 < 20 ms, p95 < 50 ms, ≤ 10 dropped / 10 s. Re-baseline `perf/baseline-post.json` after milestones that touch rendering; `tests/unit/perf-budget.test.ts` must stay green.
- Unit + E2E suites stay 100% green after every commit.
- Canvas-2D only, no image assets, no new dependencies — bundle stays ~42 kB gz.
- Data-driven first: new content goes in `data.ts` / `types.ts` so zones stay editable without touching engine code.

---

## Current-state audit (what we have today)

### Threat minigames (`engine/threats.ts`, 563 lines)
| Element | Current | Gap |
|---|---|---|
| Threat data | ~40 entries in `THREATS` with name/icon/description/solve/manga text | All *play* identically — only the words differ |
| Mechanics | 4 archetypes: timing (gap bar), combat (pulse ring), sneak (detection bar), comfort (hold bar) | Fine as archetypes — but zero zone flavor in the *play surface* |
| Visuals | Generic bars + a 🚗 dot + "DETECTION"/"SHELTER PROGRESS" labels | Lake Monster = same bar as Market Fire; Pet Shop = same ring as Forest Wolf |
| Difficulty | Hardcoded in `tuneDifficulty()` by type (combat 3 beats @ 0.7, timing gap 24) | Not per-threat; no data-driven knobs |
| Outcome | SUCCESS/FAIL pill + shake/flash (Sprint 7 M5) | No flavor line, no companion reaction, no zone context |
| Input | SPACE + canvas click (timing/combat); sneak/comfort are keyboard-hold only | Mouse players can't hold for sneak/comfort |

### FP zones (`fp-room-renderer.ts` + `data.ts` rooms)
| Element | Current | Gap |
|---|---|---|
| Features | Labeled sprites (Sprint 7 M4) — food plate, TV, chest, etc. | No *examine* text; objects are clickable but say nothing |
| Pickups | `✨ item` rectangles → inventory | No item story note, no pickup flavor, no lift animation |
| Hints | `hint` features → hint panel | Hint text is generic; not tied to route/story beats |
| Interact | Click or E/Space; doors + doorThreats | Door threats lack zone-specific context lines |
| Zone entry | Transition overlay (Sprint 6) | No first-visit flavor; zones open silently |
| Readable objects | None | No "read the diary page / scroll / mailbox letter" interaction |

### Story & usability
| Element | Current | Gap |
|---|---|---|
| Companions | 4–5 dogs, 4 generic dialogue lines each | Never react to threat outcomes; lines don't reference the zone's story state |
| Items | `ITEMS` dict (bone, map_fragment, compass_fragment, collar pieces, diary_page, lake_stone, pinecone…) | Collected, but not *connected* — no story note on what each means for the journey home |
| Story log | None | Nowhere to see "what I've done" — zones visited, threats overcome, friends met |
| Endgame | Score breakdown (time/items/threats/companions/happiness) | Numbers only — no narrative recap |
| Onboarding | None | No first-run control hints; solve text in minigames is the only guidance |
| Mouse parity | timing/combat clickable; sneak/comfort keyboard-hold | Inconsistent input model |

---

## Sprint 8 items (ordered by dependency)

### 8.1 — Threat context data model *(foundation; no visuals yet)*

**Problem:** Flavor lives in ad-hoc string fields; there's no structured place for scene, beats, outcome lines, or per-threat difficulty. Every later item needs this.

**Plan:**
- Extend `Threat` (`types.ts`):
  - `scene: string` — backdrop id (one of the zone scene backdrops, see 8.2)
  - `beats?: string[]` — themed onomatopoeia per successful combat beat (e.g. wolf: `SNARL! / HOWL! / YIELD!`)
  - `successLine: string` / `failLine: string` — short flavor for the outcome banner
  - `difficulty?: Partial<ThreatDifficulty>` — per-threat overrides (gap width, speed, beats, pulse speed, detection rates, hold rate/time)
- New `ThreatDifficulty` interface; `tuneDifficulty()` becomes "defaults per type + data-driven overrides" — delete the name-based special cases.
- Fill the new fields for **all** threats in `data.ts` (mechanical work, no engine changes).
- **Test:** unit — every threat has `scene` + `successLine` + `failLine`; difficulty merge (defaults ⊕ override) is pure and unit-tested; no threat references an unknown scene id.

**DoD:** `Threat` typed, all data filled, difficulty fully data-driven, tests green. Build unchanged in size (types only).

---

### 8.2 — Themed minigame scenes *(highest visible impact)*

**Problem:** Every minigame is the same dark backdrop + generic bar. This is the single biggest "it doesn't feel like a game world" gap left.

**Plan:**
- New `engine/render/threat-scenes.ts`:
  - `renderSceneBackdrop(ctx, W, H, scene, zone)` — a lightweight painted backdrop *behind* the minigame bar (gradients + silhouettes + 2–4 zone props), derived from zone palette (`skyColor`/`groundColor`/`accentColor` in `ZONES`) so data still drives color.
  - Scenes: `street` (buildings + streetlamps), `lake` (water bands + ripple lines + faint monster arc), `pet_shop` (shelves + hanging bell), `dog_show` (stage + spotlight cone + crowd dots), `forest` (canopy + light shafts), `beach` (sand + palm fronds), `mountain` (rock ledges), `waterfall` (mist bands), `secret_park` (moon + fireflies), `garden` (flower silhouettes), `market` (stall awnings), `library` (bookshelves), `apartment` (furniture silhouettes), `shelter` (kennel rows), `park` (fence + trees).
  - Keep it cheap: precompute per-scene `Path2D` where sensible (same pattern as the M2 TP background work), no per-frame allocation.
- Themed **actors** in the same file (or `threat-actors.ts`) — small vector drawings replacing the generic 🚗 dot / plain ring center:
  - timing hazards: wave (lake), crane arm (construction), goat (mountain), lightning bolt, judge pointer, swinging bell, falling rock, crowd wave
  - combat actors: wolf head, mean cat, squirrel cluster, raccoon, goat, guardian figure
  - sneak meters: crab claws / snake eyes / vacuum head / owl eyes as the "detector" graphic + zone-colored meter
  - comfort shelters: awning, oak tree, rock overhang, blanket pile, kennel — progress bar reframed as "calm/shelter" fill
- `threats.ts`: `renderThreatContent` composes `backdrop → actor → meter/ring → labels`; header/description/solve lines unchanged (they're already per-threat).
- **Perf gate:** minigame frames are off the main game loop, but still measured — backdrop must not allocate per frame; p95 budget holds in the navigate-all baseline (re-record `perf/baseline-m2.json`-style pre/post).
- **Test:** E2E — open a representative threat per scene (lake monster, pet shop bell, dog show judge, forest wolf, market fire, library boo, apartment vacuum, street traffic), assert canvas non-empty in the backdrop region + no page errors. Unit — scene/actor id coverage: every `scene` value in data has a registered renderer.

**DoD:** No two adjacent-zone threats look identical; every minigame has a zone-specific backdrop + actor; perf flat; tests green.

**Status (2026-08-26): COMPLETE.**
- `engine/render/threat-scenes.ts` (1760 lines): 16 backdrops + 36 themed actors + per-type generic fallbacks, plain canvas calls each frame (no Path2D — jsdom-safe), no per-frame allocation (deterministic `frac()` pseudo-random instead of `Math.random`).
- `data.ts`: all 40 threats carry an `actor` id (36 unique actor ids, some shared: wave×2, cat×2, squirrel×2, crowd×2).
- `threats.ts`: `drawThreatScene` replaces the flat dark backdrop; new `sceneTime` animation clock (reset on start, advanced in update); scene-aware layout (header 0.10H/0.165H, actor stage 0.33H, mechanics 0.68H, solve hint 0.95H hidden while resolved, outcome pill 0.85H).
- Tests: `tests/unit/threat-scenes.test.ts` (6 tests: all 40 threats × 3 sizes × 3 times, every actor, every scene, 3 fallback paths) + data.test.ts actor-validity + every-actor-used checks. Unit 101/101, E2E 69/69, tsc clean.
- **Bundle note (honest):** build is 57.89 kB gz (baseline 46.53 at `3b50f1c`, 49.45 after 8.1) — the scene module costs +8.44 kB gz. The ≤ ~45 kB DoD line was already aspirational before this milestone; flag for Mike: acceptable, or trim actor detail later.

---

### 8.3 — Beat theming + outcome flavor + companion reactions

**Problem:** Success/fail is a generic pill. The moment of *consequence* is the best storytelling beat we have and it's the least flavored.

**Plan:**
- Combat: pop themed `beats[]` words per successful hit (big manga-style text, same style as `manga-combat.ts` cutaway), final beat = `mangaText`.
- Outcome banner: SUCCESS/FAIL pill + `successLine`/`failLine` underneath (e.g. wolf success: "It backs off, ears flattened." fail: "You scatter — it chases you to the tree line.").
- **Companion reaction:** after `onResolve`, if a companion is active, show a short zone-aware line. New data field on `Companion`: `reactions?: { success?: string[]; fail?: string[] }` (pools, not per-zone keys — keeps data small; the zone context comes from the threat's `successLine`/`failLine` already). Rendered in the existing companion panel/dialogue overlay.
- **Test:** unit — reaction line selection is deterministic with a seeded pool pick (testable); E2E — resolve a threat with an active companion, assert a companion line appears; resolve with none, assert no crash.

**DoD:** Every resolution is a *story beat* (themed words + flavor line + companion voice). Tests green.

---

### 8.4 — FP zone interaction & story-thread pass

**Problem:** FP rooms are grab-and-go. The "read hints / examine objects / feel the place" layer Mike called out is missing.

**Plan:**
- **Examine:** `RoomFeature.examine?: string` (data). E/Space or click on a non-item feature → typewriter examine text in the dialogue overlay style (e.g. TV: "The show is paused mid-walk. It's still warm."). Reuse the existing overlay, no new component.
- **Readable objects:** features flagged `readable: true` (diary page, book, scroll, mailbox letter, market poster) → open the hint panel with route-tied story text. Rewire existing generic `hint` features to story beats (e.g. "The last walk ended at the lake. He always stopped for a drink.").
- **Pickups with story:** `Item.storyNote?: string` (data). On collect: item description + storyNote in a brief toast (existing pickup burst from Sprint 7 M3 as the visual hook). Map fragments / compass fragments / collar pieces / lake stone / pinecone each get one line connecting to the journey home.
- **Zone intros:** `Zone.flavor?: string` (data). First entry to a zone → one-line flavor banner (transition overlay already exists — extend it, don't build a new one) + an active-companion line if present.
- **Door threat context:** `doorThreat` intro uses the threat's own description (already there) — verify it renders with the themed scene from 8.2 (door threats run through the same ThreatManager).
- **Story journal (new `engine/story-panel.ts`, ~150 lines):** J key → panel listing zones visited, threats overcome (icon + name + success line), companions met, items found. Data from existing `GameStateData` + a new `storyLog: StoryEntry[]` array appended on events (threat resolve, companion met, zone first-enter). This is the "meaningful connections" surface — the player can *see* the thread.
- **Endgame recap:** victory screen gains a one-line narrative summary ("You crossed 12 places, out-witted 9 dangers, and made 4 friends on the way home.") above the existing score block.
- **Test:** unit — storyLog append is idempotent per event id (no dupes on re-resolve); E2E — FP room: examine a feature, read a readable, collect an item with storyNote, assert each surface renders; J opens journal with expected entries.

**DoD:** FP zones have examine/read/pickup context; story journal + endgame recap exist; all new content is data-driven. Tests green.

---

### 8.5 — Usability polish + deferred close-out

**Problem:** First-run players have no guidance; input model is inconsistent.

**Plan:**
- **Onboarding:** first run → dismissible control hints (WASD move · E interact · SPACE in minigames · J journal · I inventory). Store "seen" in `localStorage`; show a compact hint line in the HUD until dismissed.
- **Mouse parity:** sneak/comfort minigames accept mouse-hold (mousedown/mouseup on canvas) exactly like keyboard-hold, so all 4 archetypes are fully mouse-playable.
- **HUD:** threat-warning chip already exists — add the threat's `icon` + name when a zone threat is pending, so players aren't surprised at the door.
- **Deferred Sprint 7 close-out:**
  1. Vision model fix: register `google/gemma-4-31b-qat` as `agents.defaults.imageModel` (fallbacks: qwen3.8-27b, qwen3.6-35b-a3b); server-side `lms load`/VRAM if the crash persists. *(This is OpenClaw config + GPU box — separate from the repo.)*
  2. Capture before/after screenshots (TP zone, FP room, dog-select, one threat minigame) via Playwright `page.screenshot()`.
  3. Verify crops with the `image` tool; write the README Sprint 7 section with before/after pairs + mark the sprint complete.
- **Perf:** final re-baseline (`perf/baseline-post.json`), perf-budget test green.

**DoD:** Controls discoverable, all minigames mouse-playable, README Sprint 7 close-out complete with screenshots, full test suite green, `tsc` clean, build ≤ ~45 kB gz.

---

## Out of scope (deliberately)

- New zones, new dogs, new threat *archetypes* (a 5th minigame type) — that's feature-adding; Sprint 8 deepens what exists.
- Three.js / WebGL / image assets / new dependencies.
- Audio redesign (audio system exists; 8.3 could *reuse* existing sfx if trivial, but no new audio work).
- Multiplayer / persistence beyond `localStorage` hints.

## Execution order & commit plan

| Milestone | Commits (est.) | Depends on |
|---|---|---|
| 8.1 data model | 1 | — |
| 8.2 themed scenes | 2–3 (scenes, actors, wire-up) | 8.1 |
| 8.3 beats + reactions | 1–2 | 8.1, 8.2 |
| 8.4 FP + story thread | 2–3 (examine/read/pickup, journal, endgame) | 8.1 |
| 8.5 usability + close-out | 2 (usability, README/screenshots) | all |

Each milestone: unit + E2E green → `tsc --noEmit` → `npm run build` → perf check if rendering touched → push to `origin/main`.

## Acceptance (Sprint 8 DoD)

- [ ] All threats: themed scene + actor + success/fail lines + data-driven difficulty
- [ ] Combat beats themed; companion reacts to outcomes
- [ ] FP zones: examine, readable hints, story-note pickups, zone flavor intros
- [ ] Story journal (J) + endgame narrative recap
- [ ] Onboarding hints + full mouse parity in minigames
- [ ] Deferred: vision model registered + README Sprint 7 before/after screenshots + section marked complete
- [ ] Unit + E2E 100% green, `tsc` clean, build ≤ ~45 kB gz, perf budget green
