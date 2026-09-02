# Sprint 9: Playability & Visual-Logic Sync

**Goal:** Implement an automated "Chaos Engine" using Playwright that executes erratic player input permutations to detect "Visual-Logic Divergence"—scenarios where the game state says one thing, but the canvas renders another.

## Two Pillars

1. **The Chaos Injector (Input Fuzzing):** Instead of testing a single "correct" path, we feed the game sequences of "stressed" inputs: rapid-fire key taps, simultaneous conflicting inputs (e.g., Up + Down + Space), and high-frequency movement while transitioning zones.
2. **The Mismatch Oracle (Visual-Logic Sync):** The core of the sprint. We create a testing layer that compares the **Logical Truth** (the data in `State.ts`) against the **Visual Truth** (the properties of the canvas and rendered elements) and flags discrepancies.

---

## Sprint 9 Milestones

### 9.1 — The "Observability" Bridge (Foundation)
*Implement a debug bridge to expose real-time engine state to the test runner.*

* **`getCanvasChecksum()`**: Returns a simplified hash of the current canvas pixel data to detect "frozen" canvases.
* **`getRenderState()`**: Returns the current active renderer's bounding boxes, active sprites, and visibility status.
* **Timestamped Event Logging**: Implement a "Flight Recorder" in the engine to log every significant state change (e.g., `playerPos`, `isBusy`, `currentZone`) alongside a high-resolution timestamp.

### 9.2 — Scenario-Based Chaos Testing (Input Fuzzing)
*Execute "stressed" input profiles to find edge cases in movement and interaction.*

* **The "Panic" Profile:** Rapid, non-stop WASD + Space + E.
* ** The "Ghost" Profile:** High-frequency movement + rapid zone transitions.
* **The "Laggy" Profile:** Simulates high-latency input by delaying key-up events.
* **Boundary & Hand-off Verification:** 
    * **FP Room Exit Stressor:** Triggering an exit (E/Space) while moving in the opposite direction to test transition priority.
    * **Rapid Room Hopping:** Triggering multiple exits in quick succession to test state machine robustness.
    * **Collision/Boundary Test:** Moving into walls while simultaneously triggering interactions to check collision/input priority.

### 9.3 — The Mismatch Oracle (Visual Verification)
*Detect instances where the visual output does not match the logical state.*

* **Property Check:** If `State.playerPos.x` changes, but the canvas shows no change in the player sprite's location, trigger a **Visual Stagnation Error**.
* **Interaction Check:** If a `RoomFeature` is logically `clickable` but no click-event is registered by the engine, trigger an **Input Dead-Zone Error**.
* **Z-Index/Layer Check:** Verify that the `DialogueOverlay` or `MangaCombatOverlay` is actually in the foreground when `isBusy` is true.

### 9.4 — Automated Bug Filing
*Ensure found bugs are reproducible and actionable.*

* **Seed-Based Reproducibility:** All chaos sequences are driven by a PRNG with a fixed seed.
* **Automated Bug Reports:** On failure, Playwright generates a package containing:
    * A snapshot of the Canvas.
    * The full JSON dump of `GameState`.
    * The last 50 lines of the event log.
