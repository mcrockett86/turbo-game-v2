/**
 * tests/unit/perf-budget.test.ts
 *
 * Two jobs:
 *  1. Lock in the hard frame budgets (p50/p95/dropped) so they can't be
 *     silently raised.
 *  2. Assert the pre-audio baseline exists, is internally consistent, and —
 *     once the post-audio baseline is recorded — stays within drift limits
 *     of pre. This is the "audio must not regress perf" gate: it fails the
 *     unit suite if Sprint 6 item 1 ships a heavier frame without someone
 *     consciously re-baselining.
 *
 * The perf-check.ts script records the baselines; these tests just assert
 * on the committed artifacts so the gate works in CI without a browser.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERF_BUDGETS, perf } from '@/engine/perf';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const PRE_FILE = resolve(ROOT, 'perf/baseline-pre.json');
const POST_FILE = resolve(ROOT, 'perf/baseline-post.json');

// Same limits as scripts/perf-check.ts — keep in sync (single source in the
// future; for now this test mirrors them so the gate is visible in unit CI).
const DRIFT_LIMITS = { p95: 50, dropped: 5 };

interface Baseline {
  label: string;
  recordedAt: string;
  gitCommit: string | null;
  scenario: string;
  frames: { samples: number; p50Ms: number; p95Ms: number; maxMs: number; droppedFrames: number };
  zoneSwaps: number;
  notes: string;
}

function loadBaseline(file: string): Baseline | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('perf budgets', () => {

  it('hard budgets are locked in expected values', () => {
    expect(PERF_BUDGETS.TARGET_FRAME_MS).toBeCloseTo(16.67, 0);
    expect(PERF_BUDGETS.P50_MS).toBe(20);
    expect(PERF_BUDGETS.P95_MS).toBe(50);
    expect(PERF_BUDGETS.DROPPED_FRAME_MS).toBe(50);
    expect(PERF_BUDGETS.MAX_DROPPED_IN_WINDOW).toBe(10);
  });

  it('ring buffer reports a sane shape (smoke)', () => {
    perf.reset();
    for (let i = 0; i < 120; i++) perf.recordFrame(16.7);
    const r = perf.report();
    expect(r.samples).toBe(120);
    expect(r.avgMs).toBeCloseTo(16.7, 0);
    expect(r.p50Ms).toBeCloseTo(16.7, 0);
    expect(r.p95Ms).toBeCloseTo(16.7, 0);
    expect(r.maxMs).toBeCloseTo(16.7, 0);
    expect(r.droppedFrames).toBe(0);
    perf.reset();
  });

  it('rejects non-finite / negative frame times', () => {
    perf.reset();
    perf.recordFrame(NaN);
    perf.recordFrame(-1);
    perf.recordFrame(Infinity);
    expect(perf.report().samples).toBe(0);
    perf.reset();
  });

  describe('pre-audio baseline artifact', () => {

    it('perf/baseline-pre.json exists (recorded via `npm run perf:baseline`)', () => {
      expect(existsSync(PRE_FILE), 'run `npm run perf:baseline` and commit perf/baseline-pre.json').toBe(true);
    });

    it('baseline is well-formed and within its own budgets', () => {
      const pre = loadBaseline(PRE_FILE);
      expect(pre, 'baseline file unreadable').toBeTruthy();
      expect(pre!.label).toBe('pre');
      expect(pre!.frames.samples).toBeGreaterThan(300); // > 5s of frames
      expect(pre!.frames.p50Ms, `p50 ${pre!.frames.p50Ms}ms over budget`).toBeLessThan(PERF_BUDGETS.P50_MS);
      expect(pre!.frames.p95Ms, `p95 ${pre!.frames.p95Ms}ms over budget`).toBeLessThan(PERF_BUDGETS.P95_MS);
      expect(pre!.frames.droppedFrames).toBeLessThanOrEqual(PERF_BUDGETS.MAX_DROPPED_IN_WINDOW);
    });

    it('post-audio baseline (when present) stays within drift of pre', () => {
      const pre = loadBaseline(PRE_FILE);
      const post = loadBaseline(POST_FILE);
      if (!post) return; // post not recorded yet — nothing to gate
      expect(post, 'post baseline unreadable').toBeTruthy();
      expect(post!.label).toBe('post');
      expect(post!.frames.samples).toBeGreaterThan(300);

      const p95Drift = post!.frames.p95Ms - pre!.frames.p95Ms;
      const droppedDrift = post!.frames.droppedFrames - pre!.frames.droppedFrames;
      expect(p95Drift, `p95 regressed by ${p95Drift.toFixed(1)}ms (limit +${DRIFT_LIMITS.p95}ms)`).toBeLessThan(DRIFT_LIMITS.p95);
      expect(droppedDrift, `dropped frames regressed by ${droppedDrift} (limit +${DRIFT_LIMITS.dropped})`).toBeLessThanOrEqual(DRIFT_LIMITS.dropped);

      // Absolute budgets still apply to post.
      expect(post!.frames.p50Ms).toBeLessThan(PERF_BUDGETS.P50_MS);
      expect(post!.frames.p95Ms).toBeLessThan(PERF_BUDGETS.P95_MS);
    });
  });
});
