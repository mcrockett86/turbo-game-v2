/**
 * Perf metrics — frame-time instrumentation, renderer-independent.
 *
 * Renderers call `recordFrame(dtMs)` once per frame inside their update()
 * (or the RAF loop calls it once per frame). `getPerfReport()` returns a
 * snapshot for E2E assertions, soak tests, and regression reports.
 *
 * Design rules:
 * - Zero allocations in the hot path beyond a number push (ring buffer).
 * - No audio, no network, no DOM access — safe to unit-test under jsdom.
 * - reset() re-arms the ring buffer; call it at the start of a scenario.
 */

const RING_SIZE = 600; // ~10s at 60fps

class PerfMetrics {
  private frames: number[] = [];
  private frameCount = 0;

  /** Call once per rendered frame with the delta in milliseconds. */
  recordFrame(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    this.frames.push(dtMs);
    if (this.frames.length > RING_SIZE) this.frames.shift();
    this.frameCount += 1;
  }

  /** Clear history (keeps the counter so totals survive a reset). */
  reset(): void {
    this.frames = [];
    this.frameCount = 0;
  }

  report(): PerfReport {
    const n = this.frames.length;
    if (n === 0) {
      return { samples: 0, totalFrames: this.frameCount, avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, droppedFrames: 0 };
    }
    const sorted = [...this.frames].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    return {
      samples: n,
      totalFrames: this.frameCount,
      avgMs: sum / n,
      p50Ms: sorted[Math.floor(n * 0.50)],
      p95Ms: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
      maxMs: sorted[n - 1],
      droppedFrames: this.frames.filter((v) => v > 50).length, // > 3 missed frames of budget
    };
  }
}

export interface PerfReport {
  samples: number;
  totalFrames: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  droppedFrames: number;
}

/** Budgets for a 60fps target on a mid-range dev machine. */
export const PERF_BUDGETS = {
  /** Target frame time (ms). One dropped frame of budget = 2x this. */
  TARGET_FRAME_MS: 16.67,
  /** p50 must stay under this. */
  P50_MS: 20,
  /** p95 must stay under this (allows jitter, not sustained slowness). */
  P95_MS: 50,
  /** A "dropped frame" is anything over 50ms (3 missed budgets). */
  DROPPED_FRAME_MS: 50,
  /** Max dropped frames allowed in any 10s window (RING_SIZE). */
  MAX_DROPPED_IN_WINDOW: 10,
} as const;

export const perf = new PerfMetrics();
