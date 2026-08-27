/**
 * Unit tests — engine/threats.ts
 *
 * ThreatManager owns the minigame state machine. It extends BaseRenderer, so
 * it needs a canvas to construct. We test:
 *  - initial phase is idle
 *  - start() → intro, isBusy true, listeners attached
 *  - intro → active transition (timer expiry + SPACE fast-forward)
 *  - tuneDifficulty adjustments (combat needed=3, timing gapWidth=24)
 *  - resolveThreat success/failure routing (onResolve called with name)
 *  - cancel() counts as failure
 *
 * We use fake timers for the 600ms finish→onResolve delay and the intro timer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThreatManager, defaultDifficulty, resolveDifficulty, type ThreatPhase } from '@/engine/threats';
import type { Threat } from '@/types';

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctxStub = {
    clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), setTransform: vi.fn(),
    arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    ellipse: vi.fn(), quadraticCurveTo: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    set fillStyle(v: unknown) {}, set strokeStyle(v: unknown) {},
    set lineWidth(v: unknown) {}, set globalAlpha(v: unknown) {},
    set font(v: unknown) {}, set textAlign(v: unknown) {},
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctxStub);
  return canvas;
}

const sampleThreats: Record<string, Threat> = {
  timing: { name: 'Traffic', icon: '🚗', type: 'timing', description: '', solve: '', mangaText: '', mangaType: 'near-miss', scene: 'street', successLine: '', failLine: '' },
  combat: { name: 'Mean Cat', icon: '🐱', type: 'combat', description: '', solve: '', mangaText: '', mangaType: 'fight', scene: 'street', successLine: '', failLine: '' },
  comfort: { name: 'Storm', icon: '⛈️', type: 'comfort', description: '', solve: '', mangaText: '', mangaType: 'scare', scene: 'apartment', successLine: '', failLine: '' },
};

describe('ThreatManager', () => {
  let tm: ThreatManager;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = makeCanvas();
    tm = new ThreatManager();
    tm.init(canvas);
  });

  afterEach(() => {
    tm.dispose();
    vi.useRealTimers();
  });

  it('starts idle and not busy', () => {
    expect(tm.phase).toBe('idle');
    expect(tm.isBusy).toBe(false);
    expect(tm.currentThreat).toBeNull();
  });

  it('start() enters intro and becomes busy', () => {
    tm.start(sampleThreats.timing);
    expect(tm.phase).toBe('intro');
    expect(tm.isBusy).toBe(true);
    expect(tm.currentThreat).toBe(sampleThreats.timing);
    expect(tm.currentType).toBe('timing');
  });

  it('intro → active when the intro timer expires (via update)', () => {
    let stateChanges: ThreatPhase[] = [];
    tm.onStateChange = (phase) => stateChanges.push(phase);
    tm.start(sampleThreats.timing);
    // introTimer = 1.5s; BaseRenderer caps each delta at 1/30s, so step many frames
    for (let i = 0; i < 60; i++) tm.update(1 / 30, i * 33);
    expect(tm.phase).toBe('active');
    expect(stateChanges).toEqual(['intro', 'active']);
  });

  it('SPACE during intro fast-forwards to active', () => {
    tm.start(sampleThreats.combat);
    expect(tm.phase).toBe('intro');
    // Simulate a keydown for SPACE
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(tm.phase).toBe('active');
  });

  it('tuneDifficulty sets combat.needed=3 and pulseSpeed=0.7', () => {
    tm.start(sampleThreats.combat);
    // Access private state via bracket notation (TS private is compile-time only)
    const combat = (tm as any).combat;
    expect(combat.needed).toBe(3);
    expect(combat.pulseSpeed).toBe(0.7);
  });

  it('tuneDifficulty sets timing.gapWidth=24 and speed=45', () => {
    tm.start(sampleThreats.timing);
    const timing = (tm as any).timing;
    expect(timing.gapWidth).toBe(24);
    expect(timing.speed).toBe(45);
  });

  it('comfort threats keep default difficulty (no tuning)', () => {
    tm.start(sampleThreats.comfort);
    const comfort = (tm as any).comfort;
    expect(comfort.rate).toBe(25);
    expect(comfort.timeLimit).toBe(6);
  });

  it('cancel() during intro counts as failure and resolves idle', async () => {
    vi.useFakeTimers();
    const onResolve = vi.fn();
    tm.onResolve = onResolve;
    tm.start(sampleThreats.timing);
    expect(tm.phase).toBe('intro');

    tm.cancel();
    expect(tm.phase).toBe('resolved');
    // The onResolve fires after a 600ms delay
    vi.advanceTimersByTime(700);
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('Traffic', false);
    // After the delay, back to idle
    expect(tm.phase).toBe('idle');
    expect(tm.currentThreat).toBeNull();
  });

  it('cancel() is a no-op when idle', () => {
    const onResolve = vi.fn();
    tm.onResolve = onResolve;
    tm.cancel();
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);
    expect(onResolve).not.toHaveBeenCalled();
    expect(tm.phase).toBe('idle');
  });

  it('onDestroy removes key listeners (dispose is safe)', () => {
    tm.start(sampleThreats.timing);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    tm.dispose();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
  });

  it('isBusy is true for intro/active/resolved, false for idle', () => {
    expect(tm.isBusy).toBe(false); // idle
    tm.start(sampleThreats.timing);
    expect(tm.isBusy).toBe(true); // intro
    tm.update(2, 0);
    expect(tm.isBusy).toBe(true); // active
  });
});

describe('data-driven difficulty (Sprint 8.1)', () => {
  it('defaultDifficulty provides per-type baselines', () => {
    expect(defaultDifficulty('timing')).toEqual({ gapWidth: 24, speed: 45 });
    expect(defaultDifficulty('combat')).toEqual({ beats: 3, pulseSpeed: 0.7, targetWindow: 0.2 });
    expect(defaultDifficulty('sneak')).toEqual({ riseRate: 30, fallRate: 20, safeHold: 3.0 });
    expect(defaultDifficulty('comfort')).toEqual({ holdRate: 25, timeLimit: 6 });
  });

  it('resolveDifficulty merges overrides over defaults', () => {
    const d = resolveDifficulty('timing', { gapWidth: 16, speed: 60 });
    expect(d).toEqual({ gapWidth: 16, speed: 60 });
    // Partial override: unspecified knobs keep their defaults
    const d2 = resolveDifficulty('combat', { beats: 4 });
    expect(d2).toEqual({ beats: 4, pulseSpeed: 0.7, targetWindow: 0.2 });
  });

  it('resolveDifficulty ignores undefined override values and does not mutate input', () => {
    const overrides = { gapWidth: undefined, speed: 50 };
    const d = resolveDifficulty('timing', overrides);
    expect(d).toEqual({ gapWidth: 24, speed: 50 });
    expect(overrides).toEqual({ gapWidth: undefined, speed: 50 }); // untouched
  });

  it('start() applies threat.difficulty overrides to live state', () => {
    const tm = new ThreatManager();
    tm.init(makeCanvas());
    const hard: Threat = { ...sampleThreats.combat, difficulty: { beats: 4, targetWindow: 0.16 } };
    tm.start(hard);
    const combat = (tm as any).combat;
    expect(combat.needed).toBe(4);
    expect(combat.targetStart).toBeCloseTo(0.5 - 0.16 / 2);
    expect(combat.targetEnd).toBeCloseTo(0.5 + 0.16 / 2);
    tm.dispose();
  });

  it('start() without difficulty keeps per-type defaults', () => {
    const tm = new ThreatManager();
    tm.init(makeCanvas());
    const sneakThreat: Threat = { name: 'Vacuum', icon: '🤖', type: 'sneak', description: '', solve: '', mangaText: '', mangaType: 'scare', scene: 'shelter', successLine: '', failLine: '' };
    tm.start(sneakThreat);
    const sneak = (tm as any).sneak;
    expect(sneak.riseRate).toBe(30);
    expect(sneak.fallRate).toBe(20);
    expect((tm as any).sneakSafeHold).toBe(3.0);
    tm.dispose();
  });
});
