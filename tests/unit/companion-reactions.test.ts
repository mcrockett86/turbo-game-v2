/**
 * Unit tests — engine/companion-reactions.ts (Sprint 8.3)
 *
 * The reaction pick is deterministic (seeded) so tests can assert the exact
 * line. We also assert data coverage: every companion ships both pools.
 */

import { describe, it, expect } from 'vitest';
import { pickReactionLine } from '@/engine/companion-reactions';
import { COMPANIONS } from '@/data';
import type { Companion } from '@/types';

const buddy = {
  reactions: {
    success: ['line-s-1', 'line-s-2', 'line-s-3'],
    fail: ['line-f-1', 'line-f-2'],
  },
};

describe('pickReactionLine', () => {
  it('is deterministic for the same companion + outcome + seed', () => {
    const a = pickReactionLine(buddy, true, 'traffic');
    const b = pickReactionLine(buddy, true, 'traffic');
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it('always picks a line from the correct pool', () => {
    for (const seed of ['traffic', 'cat', 'flood', 'forest_wolf', 'market_fire']) {
      const s = pickReactionLine(buddy, true, seed);
      const f = pickReactionLine(buddy, false, seed);
      expect(buddy.reactions!.success).toContain(s as string);
      expect(buddy.reactions!.fail).toContain(f as string);
      expect(buddy.reactions!.success).not.toContain(f as string);
      expect(buddy.reactions!.fail).not.toContain(s as string);
    }
  });

  it('returns null for missing companion or missing/empty pool', () => {
    expect(pickReactionLine(null, true, 'traffic')).toBeNull();
    expect(pickReactionLine(undefined, true, 'traffic')).toBeNull();
    expect(pickReactionLine({}, true, 'traffic')).toBeNull();
    expect(pickReactionLine({ reactions: {} }, true, 'traffic')).toBeNull();
    expect(pickReactionLine({ reactions: { success: [] } }, true, 'traffic')).toBeNull();
    // success pool present, but fail side has none
    expect(pickReactionLine({ reactions: { success: ['x'] } }, false, 'traffic')).toBeNull();
  });

  it('works with a single-line pool', () => {
    const solo: Companion = { reactions: { success: ['only'], fail: ['oof'] } };
    expect(pickReactionLine(solo, true, 'anything')).toBe('only');
    expect(pickReactionLine(solo, false, 'anything')).toBe('oof');
  });
});

describe('companion reaction data coverage (Sprint 8.3)', () => {
  it('every companion has non-empty success and fail pools', () => {
    const ids = Object.keys(COMPANIONS);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    for (const id of ids) {
      const c = COMPANIONS[id];
      expect(c.reactions, `${id} missing reactions`).toBeTruthy();
      expect(c.reactions!.success!.length, `${id} success pool`).toBeGreaterThan(0);
      expect(c.reactions!.fail!.length, `${id} fail pool`).toBeGreaterThan(0);
      for (const line of [...c.reactions!.success!, ...c.reactions!.fail!]) {
        expect(typeof line, `${id} line type`).toBe('string');
        expect(line.trim().length, `${id} non-empty line`).toBeGreaterThan(0);
      }
    }
  });

  it('picks are stable per companion + threat seed (spot check)', () => {
    const c = COMPANIONS['stray_buddy'];
    const first = pickReactionLine(c, true, 'ice_cream_truck');
    expect(first).toBe(pickReactionLine(c, true, 'ice_cream_truck'));
    expect(c.reactions!.success).toContain(first as string);
  });
});
