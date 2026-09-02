/**
 * tests/unit/onboarding.test.ts
 *
 * Sprint 8.5: first-run control hints + resolved-threat tracking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isOnboarded,
  markOnboarded,
  getOnboardingBarRect,
  ONBOARDING_HINTS,
} from '@/engine/onboarding';
import { State } from '@/engine/state';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // jsdom without storage — tests below will see the fallback path
  }
});

describe('onboarding (Sprint 8.5)', () => {
  it('starts unacknowledged', () => {
    expect(isOnboarded()).toBe(false);
  });

  it('markOnboarded persists the acknowledgment', () => {
    markOnboarded();
    expect(isOnboarded()).toBe(true);
  });

  it('bar rect stays inside the canvas', () => {
    const r = getOnboardingBarRect(1280, 720);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThan(720);
    expect(r.x + r.w).toBeLessThanOrEqual(1280);
  });

  it('hints cover the core controls (move/interact/journal/inventory/friends/map)', () => {
    const text = ONBOARDING_HINTS.map(([k, a]) => `${k} ${a}`).join(' ');
    expect(text).toMatch(/move/i);
    expect(text).toMatch(/interact/i);
    expect(text).toMatch(/journal/i);
    expect(text).toMatch(/inventory/i);
    expect(text).toMatch(/friend/i);
    expect(text).toMatch(/map/i);
  });
});

describe('resolved threat tracking (Sprint 8.5 HUD chip)', () => {
  it('resolveThreat records the threat id exactly once', () => {
    const s = State.getState();
    const before = s.resolvedThreatIds.length;
    State.resolveThreat('storm', true);
    State.resolveThreat('storm', true);
    expect(s.resolvedThreatIds.filter(id => id === 'storm')).toHaveLength(1);
    expect(s.resolvedThreatIds.length).toBe(before + 1);
  });

  it('failed resolutions are recorded too (the threat is no longer pending)', () => {
    const s = State.getState();
    State.resolveThreat('vacuum', false);
    expect(s.resolvedThreatIds).toContain('vacuum');
  });
});
