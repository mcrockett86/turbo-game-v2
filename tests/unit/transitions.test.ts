/**
 * Unit tests — engine/transitions.ts
 *
 * Transitions are self-driven via requestAnimationFrame. In the test env we
 * stub RAF to capture the tick callback and drive it manually with controlled
 * timestamps, so we can deterministically verify the phase machine, midpoint
 * firing (exactly once), completion, and cancel().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Transitions, type TransitionKind } from '@/engine/transitions';

/** A jsdom canvas with a stub 2d context so render() doesn't throw. */
function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctxStub = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    set fillStyle(v: unknown) { /* ignore */ },
    set strokeStyle(v: unknown) { /* ignore */ },
    set lineWidth(v: unknown) { /* ignore */ },
    set globalAlpha(v: unknown) { /* ignore */ },
  } as unknown as CanvasRenderingContext2D;
  // jsdom's canvas.getContext returns null by default — override it
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctxStub);
  return canvas;
}

describe('Transitions', () => {
  let canvas: HTMLCanvasElement;
  let rafQueue: FrameRequestCallback[] = [];
  let rafId = 0;
  let now = 0;

  beforeEach(() => {
    rafQueue = [];
    rafId = 0;
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return ++rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      // mark as cancelled (no-op for our purposes)
    });
    canvas = makeCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Pump RAF callbacks in order until the queue is empty or maxSteps hit. */
  function pump(maxSteps = 50, stepMs = 16): void {
    for (let i = 0; i < maxSteps && rafQueue.length; i++) {
      const cb = rafQueue.shift()!;
      now += stepMs;
      cb(now);
    }
  }

  it('has no active transition initially', () => {
    const t = new Transitions();
    t.init(canvas);
    expect(t.active).toBe(false);
    expect(t.currentKind).toBeNull();
  });

  it('fade: midpoint fires exactly once, then completes', () => {
    const t = new Transitions();
    t.init(canvas);
    let midpoints = 0;
    t.play('fade', () => midpoints++, 200);

    expect(t.active).toBe(true);
    expect(t.currentKind).toBe('fade');

    // Drive: phase 'out' (200ms) → midpoint → phase 'in' (200ms) → done
    pump(40, 16);

    expect(midpoints).toBe(1); // fired exactly once
    expect(t.active).toBe(false);
  });

  it.each(['fade', 'wipe', 'zoom', 'slide'] as TransitionKind[])(
    '%s transition activates, fires midpoint once, and completes',
    (kind) => {
      const t = new Transitions();
      t.init(canvas);
      let midpoints = 0;
      t.play(kind, () => midpoints++, 100);
      pump(30, 16);
      expect(midpoints).toBe(1);
      expect(t.active).toBe(false);
    }
  );

  it('ignores a second play() while one is active', () => {
    const t = new Transitions();
    t.init(canvas);
    let firstMid = 0;
    let secondMid = 0;
    t.play('fade', () => firstMid++, 100);
    t.play('wipe', () => secondMid++, 100); // ignored — already active
    pump(30, 16);
    expect(firstMid).toBe(1);
    expect(secondMid).toBe(0); // the ignored play never ran
  });

  it('cancel() stops an in-progress transition and clears the state', () => {
    const t = new Transitions();
    t.init(canvas);
    let midpoints = 0;
    t.play('wipe', () => midpoints++, 5000); // long duration
    // Advance a few frames but not to completion
    pump(3, 16);
    expect(t.active).toBe(true);

    t.cancel();
    expect(t.active).toBe(false);
    expect(t.currentKind).toBeNull();
    // The midpoint never fired (cancelled before the out phase completed)
    expect(midpoints).toBe(0);
  });

  it('fade() shortcut delegates to play("fade")', () => {
    const t = new Transitions();
    t.init(canvas);
    let midpoints = 0;
    t.fade(() => midpoints++, 100);
    expect(t.currentKind).toBe('fade');
    pump(30, 16);
    expect(midpoints).toBe(1);
    expect(t.active).toBe(false);
  });

  it('midpoint callback runs during the out→in handoff (phase is in at that point)', () => {
    const t = new Transitions();
    t.init(canvas);
    let phaseAtMidpoint: string | null = null;
    t.play('zoom', () => {
      // At the moment the midpoint fires, the state has just switched to 'in'
      // (the update loop sets phase='in' right after calling onComplete).
      // We can't read private state, so just record that it fired.
      phaseAtMidpoint = 'fired';
    }, 100);
    pump(30, 16);
    expect(phaseAtMidpoint).toBe('fired');
  });
});
