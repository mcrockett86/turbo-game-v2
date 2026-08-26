# Sprint 7 — Visual Enhancement Plan

**Goal:** Make the game *look* finished. The mechanics are solid (Sprint 6 done); now the visuals need to match. This is a Canvas-2D-only sprint — no Three.js, no image assets, no new dependencies. Everything is drawn code, so it stays in the ~40 kB bundle.

**Guardrails (from Sprint 6, still in force):**
- Single RAF loop in `main.ts`; renderers never start their own loops.
- Frame budgets: p50 < 20 ms, p95 < 50 ms, ≤ 10 dropped / 10 s window.
- **New gate:** `perf/baseline-post.json` (pre-Sprint 7) must not regress > +50 ms p95 or +5 dropped after all Sprint 7 rendering lands. `tests/unit/perf-budget.test.ts` enforces this — re-baseline after each milestone.
- Unit + E2E suites stay 100% green after every commit.

---

## Current-state audit (what we have today)

### TP renderer (`tp-engine.ts`, 583 lines)
| Element | Current | Gap |
|---|---|---|
| Background | Flat `skyColor` fill + flat `groundColor` rect with 40 px margin | No horizon, no depth, no variation between zones (4 zones share `#87CEEB` sky) |
| Ground | Single solid-color rectangle | No texture, no path, no zone-specific detail (lake = same green as forest) |
| Player dog | Ellipse body + circle head + 2 ear dots + shadow | Reads as "ball with a bump"; no legs, no tail, no fur texture, no walk cycle |
| NPC dogs | Same `renderDog()` call | Indistinguishable from player except color; no idle animation |
| Trees | 6×16 px trunk rect + 1 circle canopy | Looks like a lollipop; no depth layering, no shadow, no per-zone variation |
| Bushes | 10 px circle | A dot |
| Fences | 6 px tall rect + post ticks | Fine but flat |
| Benches | 8 px rect | A line |
| Features | 14 px colored circles + label text | All look identical except hue; gates are the only special case |
| Scent trail | Orange dots fading out | Good, keep |
| Camera | Player pinned to center, world scrolls | No parallax, no zoom, no smoothing |
| Lighting | None | No day/night, no ambient variation |

### FP renderer (`fp-room-renderer.ts`, 596 lines)
| Element | Current | Gap |
|---|---|---|
| Floor | Single `room.color` rectangle | 90 % of the screen is a flat color block |
| Walls | 8 px `#2a2a3e` stroke | Identical across all rooms; no thickness, no baseboards, no windows/doors on walls |
| Features | Flat colored rectangles (`fillRect`) | The single biggest visual weakness — a "fountain" looks like a "food stall" looks like a "tv" |
| Exits | Gold circle + arrow + name | Functional but plain |
| Player | White circle + blue triangle | Abstract, not a dog |
| Fog | `renderFog()` is a no-op stub | Was removed; could re-introduce as a tasteful radial vignette |
| Room name | White text top-center | Fine |
| Lighting | None | Rooms feel like top-down spreadsheets |
| Camera | Static, room centered | No pan, no zoom, no entrance animation |

### Shared
| Element | Current | Gap |
|---|---|---|
| Canvas | Fixed 1280×720 backing store, CSS-stretched to container | Blurry on HiDPI / large displays; no DPR scaling |
| Transitions | wipe / fade / zoom / slide overlays | Good — could add a subtle motion-blur or particle wipe |
| HUD | DOM overlay, CSS-styled | Decent; happiness bar could animate smoothly |
| Dog-select screen | CSS cards with gradient background | Already the best-looking screen; in-game visuals should match this energy |
| Colors | Per-zone `skyColor`/`groundColor`/`dogColor` exist in data | Under-used — most renderers ignore `dogColor` for the player |
| Threat minigame | `manga-combat.ts` (179 lines) | Separate visual system; could adopt the same polish |

---

## Sprint 7 items (ordered by impact / effort)

### 7.1 — TP: Layered zone backgrounds *(high impact, medium effort)*
**Problem:** Every outdoor zone is "blue sky + green rectangle." Lake, forest, beach, mountain, and waterfall all look the same until you read the label.

**Fix:**
- Replace the flat sky fill with a **vertical gradient** (top `skyColor` → horizon `#ffffff` blend → `groundColor`) using `createLinearGradient`.
- Draw a **horizon line** with a subtle parallax silhouette band (rolling hills for forest/mountain, flat water for lake/beach, rocky shelf for cave) — 2–3 layered shapes with 30–50 % opacity, scrolling at 0.2× camera speed.
- Add **zone-specific ground detail** (deterministic, seeded by zone id so it's stable across frames):
  - Park/neighborhood: mowed-grass stripes (alternating light/dark bands)
  - Forest: scattered darker-green tufts + leaf shapes
  - Beach: sandy speckles + a wet-sand gradient near the waterline
  - Lake: water ripples (sinusoidal light lines)
  - Mountain: rocky patches + snow caps on the silhouette
  - Waterfall: vertical streak lines + mist circles
  - Cave: crystal glints (small bright dots)
- Add a **soft radial shadow** under the player (already there) and under obstacles (new — `ellipse` with `rgba(0,0,0,0.15)`).
- **Perf note:** all detail is drawn with < 40 extra canvas calls per frame. Precompute the silhouette path once per zone in `onInit` (Path2D), not per frame.

**Files:** `tp-engine.ts` (new `renderBackground(zone, ctx, W, H, playerX, playerY)` replacing the two `fillRect` calls), `types.ts` (optional `zoneVariant?: string` field — or derive from `zone.id`).

**Acceptance:** Two zones with the same `skyColor` must be visually distinguishable within 1 second of looking. Perf p95 drift < +10 ms.

---

### 7.2 — TP: Better dog model *(high impact, low-medium effort)*
**Problem:** Player and NPCs are "ellipse + circle + 2 dots." The dog is the protagonist and currently reads as an abstraction.

**Fix — a `renderDogV2(sx, sy, color, accent, facing, name, opts)`:**
- **Body:** elongated ellipse (14×9) with a subtle radial gradient (lighter top → darker bottom) for a 3-D feel.
- **Chest/belly:** smaller lighter ellipse overlapping the front.
- **Head:** circle (r=7) offset in facing direction, with a **snout** (small rounded rect extending further in facing direction).
- **Ears:** two rounded triangles (quadratic curves) that droop when idle and perk up when moving (use a `moving` flag + `facing`).
- **Tail:** a curved stroke (`quadraticCurveTo`) behind the body; wag when `moving` (rotate ±15° at 8 Hz).
- **Legs (optional, if perf allows):** 4 small ellipses under the body, alternating offset with a simple 2-frame walk cycle (sin of `time * speed`).
- **Shadow:** keep existing, slightly larger (14×6).
- **Eyes:** two 1.5 px dots on the head for personality.
- **Name label:** keep, but move to a rounded-rect pill background (`roundRect`) with 80 % opacity dark fill.
- **Player vs NPC:** player gets a subtle 2 px glow ring (`shadowBlur` + `shadowColor` = accent) so you always know who's you.
- **Idle animation:** gentle breathing (body scaleY oscillates ±2 % at 0.5 Hz) when not moving.

**Files:** `tp-engine.ts` (`renderDog` → `renderDogV2`; add `private movePhase = 0` updated in `updatePlayer`), `types.ts` (no changes).

**Acceptance:** A viewer should identify "dog" within 0.5 s without reading the name. Walk cycle visible at 60 fps. Perf drift < +5 ms (no extra allocations in the hot path — reuse a single `Path2D` or draw primitives inline).

---

### 7.3 — FP: Feature sprites *(highest single-impact item, medium effort)*
**Problem:** Every interactable is a flat `fillRect` in a different hue. A fountain, a TV, a food stall, and a secret passage all look like colored blocks. This is the #1 thing that makes rooms feel sparse and low-effort.

**Fix — a `renderFeatureSprite(ctx, type, x, y, w, h, state)` switch with per-type drawings:**
| Type | Drawing |
|---|---|
| `food` | Plate (white ellipse) + 3–4 small colored dots (kibble) or a bone shape |
| `hint` | Open book (two trapezoids) or a scroll with a ribbon |
| `tv` | Rounded-rect screen with a glow gradient + 2 small speaker dots + a stand |
| `fountain` | Circular basin (concentric circles) + water color + 2–3 droplet arcs |
| `water_bowl` | Half-circle bowl + water ellipse inside |
| `fire_hydrant` | Rounded body + dome cap + 2 side nozzles (small circles) |
| `scent_post` | Wooden post (rect) + flag (triangle) |
| `treasure` | Chest (rounded rect + lid line) + gold shimmer (pulsing opacity) |
| `person` | Head circle + shoulders trapezoid (simple bust silhouette) |
| `dog_friend` | Small dog silhouette (reuse a simplified `renderDogV2` at 0.5× scale) + a heart |
| `door` / `locked_door` | Rect door + doorknob circle; locked adds a chain (dashed line) |
| `secret_passage` | Dark rect with a glowing crack (jagged line, `#7c4dff` glow) |
| `gate` / `return_gate` | Two posts + arch (reuse the TP gate drawing) |
| `traffic` / `cat` / `bully` etc. | Emoji text glyph (large, 24 px) on a soft rounded-rect chip — cheap and readable |
| default | Rounded rect with the existing color + a small white icon dot |

- **Completed state:** dim to 40 % opacity + a small ✓ badge.
- **Locked state:** gray + a padlock glyph.
- **Hover / proximity:** 1.05× scale + brighten (use the existing `FEATURE_HOVER_RADIUS` logic).
- **Labels:** keep text, but switch to a pill background (rounded rect, dark 70 %) so labels don't fight the floor color.

**Files:** `fp-room-renderer.ts` (replace `renderFeatures()` body), no data changes.

**Acceptance:** A user should be able to identify 8 of 10 feature types by looking at a room screenshot without reading labels. Perf drift < +8 ms.

---

### 7.4 — FP: Room dressing *(high impact, medium effort)*
**Problem:** 90 % of the screen in FP zones is a flat color. Walls are an 8 px stroke. Rooms feel like wireframe floor plans.

**Fix:**
- **Floor:** replace flat fill with a **two-tone checkerboard** (room color + 8 % lighter variant), tile size ≈ `room.w / 8` world units. Or a subtle diagonal stripe pattern. Precompute as a `Path2D` or use `createPattern` with an offscreen canvas (built once in `onInit`).
- **Walls:** draw as **thick filled rects** (not stroke) with a 3-D top face:
  - Wall face: `darkenColor(room.color, 0.7)` — 14 px thick
  - Wall top: `darkenColor(room.color, 0..85)` — 6 px strip on the inside edge (pseudo-extrusion)
  - Baseboard: 2 px light strip at the floor/wall junction
- **Room corners:** small roundings (`roundRect` instead of `rect`) for a softer look.
- **Entrance highlight:** the room you entered through gets a brief 1-s gold glow on its wall (fade out) — ties into the existing transition system.
- **Zone palette:** derive all 3 wall tones from the existing `room.color` so no new data fields are needed; optionally add `wallAccent?: string` to `Room` for zones that want a specific trim color.
- **Ambient vignette:** re-introduce a subtle radial gradient (transparent center → 10 % dark edges) for depth. This replaces the removed `renderFog()` with something tasteful.

**Files:** `fp-room-renderer.ts` (`renderRoom` rewrite), `types.ts` (optional `wallAccent`).

**Acceptance:** Rooms look like *rooms*, not floor plans. Two adjacent rooms with different `color` values are instantly distinguishable. Perf drift < +5 ms (pattern is precomputed).

---

### 7.5 — HiDPI / DPR canvas scaling *(medium impact, low effort)*
**Problem:** Canvas backing store is fixed 1280×720. On a 2× display or a 1920×1080 window, the browser CSS-stretches it → blurry text, soft edges.

**Fix:**
- On `init` (and on `window.resize`), read `getBoundingClientRect()` and `window.devicePixelRatio`.
- Set `canvas.width = rect.width * dpr`, `canvas.height = rect.height * dpr`.
- Call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` once so all drawing code uses CSS pixels unchanged.
- Cap dpr at 2 to protect perf on 3× displays.
- Add a `resize` listener (debounced 150 ms) in `main.ts` that updates the backing store.

**Files:** `base-renderer.ts` (new `resize()` method), `main.ts` (resize wiring), `fp-room-renderer.ts` + `tp-engine.ts` (no changes — they already use `canvas.width/height` which now reflect CSS px via the transform… actually they use `this.canvas.width` for centering, which will now be device px. **Must audit:** replace `canvas.width` → CSS width via a `get cssWidth()` helper on BaseRenderer).

**Acceptance:** Text is sharp on a 2× display. Perf p95 drift < +10 ms (drawing area is ~4× on 2× displays — this is the one item that may need a perf re-baseline; measure early).

---

### 7.6 — TP: Zone-specific obstacle detail *(medium impact, low effort)*
**Problem:** Trees are lollipops, bushes are dots, benches are lines.

**Fix:**
- **Tree:** trunk (tapered polygon, not rect) + 2–3 overlapping canopy circles of varying size + a highlight arc on top + a drop shadow ellipse. Forest trees get a darker palette; park trees get lighter + a few falling-leaf dots.
- **Bush:** 3 overlapping circles (cluster) + a darker base shadow.
- **Fence:** posts (rounded-top rects) + 2 horizontal rails + a slight color gradient per post.
- **Bench:** seat + 2 legs + a backrest (3 rects) + a shadow.
- **Bench/tree/bush** all get a soft ground shadow (ellipse, `rgba(0,0,0,0.12)`).
- **New obstacle types (optional, data-driven):** `flower` (3–4 petal circles on a stem), `rock` (irregular polygon), `lamp_post` (pole + glowing head circle for the park at "night"), `crystal` (for cave — glowing diamond shape). These can be added to `Obstacle.type` union and drawn in the same switch.

**Files:** `tp-engine.ts` (`renderObstacle` expansions), `types.ts` (`Obstacle.type` union additions), `data.ts` (optional new obstacles in 2–3 zones to show off the new types).

**Acceptance:** Obstacles look like *things*, not placeholders. Perf drift < +5 ms.

---

### 7.7 — Particle & polish layer *(low-medium impact, low effort, high "juice")*
- **Leaf petals (park, forest):** 12–20 small rotating shapes drifting down at random x, looping. Cheap (`ctx.save/rotate/draw/restore` × 20).
- **Water ripples (lake, beach, waterfall):** 3–4 expanding circles at a fixed point, alpha fading.
- **Firefly / crystal glints (cave, night zones):** 6–8 pulsing dots.
- **Sand puff (beach):** 5–6 dots behind the player when moving (reuse the scent-trail system with a different color/size).
- **Pickup burst:** on item collection, 8–10 small particles explode from the feature position over 0.4 s (white + item color). Hook into `onFeatureInteract` in `main.ts` via a small `ParticleBurst` helper.
- **Threat success / fail flash:** 0.2 s full-canvas color pulse (green / red, 15 % alpha) — ties into the existing SFX.

**Files:** new `engine/render/particles.ts` (a lightweight particle pool shared by both renderers), `tp-engine.ts` + `fp-room-renderer.ts` (spawn calls), `main.ts` (pickup-burst hook).

**Perf budget:** < 30 live particles at a time, no per-frame allocations (object pool). Drift < +5 ms.

---

### 7.8 — Dog-select & HUD polish *(low effort, nice-to-have)*
- **Dog-select:** add a subtle idle animation to each dog card (CSS `@keyframes` sway) — the cards already use CSS, so this is a few lines.
- **Happiness bar:** smooth width transition (CSS `transition: width 0.4s ease`) instead of instant jumps.
- **Zone indicator:** fade-in on zone change (already has a transition system; just add a CSS opacity animation).
- **Panel slide-ins:** companion / inventory / hint panels get a 150 ms `translateY(10px) → 0` + opacity fade (CSS only).
- **Endgame screen:** stagger the score-line reveal (CSS `animation-delay` per row, 80 ms apart).

**Files:** `style.css`, no TS changes. Zero perf impact (GPU-composited CSS).

---

### 7.9 — Threat minigame visual pass *(medium effort, medium impact)*
**Audit:** `manga-combat.ts` (179 lines) — check what it draws.
**Likely fixes:** consistent color palette, a brief screen-shake on hit (2 px, 100 ms), a hit-flash on the target, a progress bar for the "hold to charge" mechanic, and a clean "SUCCESS / FAIL" banner with the same pill style used everywhere else.
**Acceptance:** minigame feels like part of the same game, not a separate toy.

---

## Out of scope (explicitly)
- **Image / sprite assets** — the no-dependency, code-drawn constraint stays.
- **Three.js / WebGL** — stays Canvas 2D.
- **Physics / collision overhaul** — Sprint 7 is visual only.
- **New zones or companions** — that's content, not visual.
- **Audio changes** — Sprint 6 locked the audio system.

## Execution order & milestones
| Milestone | Items | Est. effort | Re-baseline perf? |
|---|---|---|---|
| **M1** | 7.5 (DPR), 7.8 (CSS polish) | 1 day | Yes (DPR changes draw area) |

> **M1 — DONE (2026-08-25).** HiDPI/DPR canvas scaling landed (`82a7d91`): `BaseRenderer.resizeToDisplay()` sizes the backing store to CSS display size × `devicePixelRatio` (capped at 2×) and applies a CSS-pixel transform so all drawing code is unchanged; every renderer's layout + click-mapping math now uses `cssWidth`/`cssHeight`. Verified sharp at dpr 2 (1800×1440 backing store for a 900px viewport), 79/79 unit + 52/52 E2E green. CSS polish (`da88051`): screen fade-in on show, smoother happiness-bar transition, zone-indicator hook. **Note:** the dog-card idle-sway was cut — it fought Playwright's click-stability check (infinite transforms never "settle"); hover-lift stays since it settles. Keep any future canvas/DOM animation that must be clickable to a *settled* end state, or gate it behind a non-`transform` property.
> **M2 — DONE (2026-08-25).** TP layered backgrounds (7.1) + obstacle detail (7.6) landed in `tp-engine.ts`:
> - **7.1:** gradient sky (sky→near-white at horizon), a parallax horizon silhouette (precomputed `Path2D`, scrolls at 0.15× camera), gradient ground, seeded ground-detail scatter (mulberry32 by zone id, so stable per zone), and a soft radial vignette. New helpers: `seededRandom`, `hashString`, `shade`, `zoneVariant`, `buildBackground`/`renderBackground`.
> - **7.6:** detailed tree (tapered trunk + 3 canopy circles + highlight + shadow), bush cluster, bench (legs/seat/backrest + shadow), fence (rails + gradient posts), plus 4 new data-driven types — `flower`, `rock`, `lamp_post`, `crystal` — added to the `Obstacle` union in `types.ts` (optional; existing zones keep their current obstacles).
> - **Perf:** p50 16.7→16.7ms, p95 16.7→16.8ms (+0.1ms), max 50→33ms, 0 dropped — well inside the +10ms drift gate, **no re-baseline needed**. Baselines: `perf/baseline-m2pre.json` (before) vs `perf/baseline-m2.json` (after).
> - **Tests:** 79 unit + 62 E2E green (added `tests/m2-render.spec.ts` asserting every TP zone renders content without page errors). tsc clean, build 42.30 kB gzip (< 45 kB budget).

| **M2** | 7.1 (TP backgrounds), 7.6 (obstacles) | 1.5 days | Measure, re-baseline if > +10 ms |
| **M3** | 7.2 (dog model), 7.7 (particles) | 1.5 days | Measure |
| **M4** | 7.3 (FP sprites), 7.4 (room dressing) | 2 days | Measure |
| **M5** | 7.9 (threat minigame), final polish | 1 day | Final re-baseline |

**Total: ~7 working days.** Each milestone is a self-contained commit that keeps all tests green.

## Risk register
| Risk | Likelihood | Mitigation |
|---|---|---|
| DPR scaling (7.5) blows the perf budget on 2× displays | Medium | Cap dpr at 2; measure at M1 before any other work; can ship 1× if needed |
| Per-frame drawing cost of particles + background detail exceeds +50 ms p95 | Low | Particle pool is bounded; background silhouettes are precomputed Path2D; perf gate in CI catches it |
| Feature sprites (7.3) become a 500-line switch that's hard to maintain | Medium | One small function per type, ~15 lines each, in a separate `feature-sprites.ts` module |
| Visual changes break E2E tests that assert on pixel colors or element positions | Low-Medium | Audit E2E tests at the start of each milestone; update assertions only where the change is intentional |

## Definition of done for Sprint 7
- [ ] All 9 items landed (or explicitly descoped with a README note)
- [ ] `perf/baseline-post.json` re-baselined; `tests/unit/perf-budget.test.ts` green
- [ ] Unit suite green (target: 85+ tests, including new sprite/particle unit tests)
- [ ] E2E suite green (52/52 or updated for intentional visual changes)
- [ ] `tsc` clean, build < 45 kB gz
- [ ] A side-by-side screenshot (TP zone, FP room, dog-select) in the README showing before/after
- [ ] README Sprint 7 section marked complete
