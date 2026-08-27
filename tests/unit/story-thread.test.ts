/**
 * Unit tests — Sprint 8.4 story thread (state, recap, data coverage).
 *
 * Covers:
 *  - State.logStory idempotency (re-resolve / re-collect never dupes)
 *  - State.markZoneVisited first-visit semantics
 *  - StateManager.recapLine format
 *  - data coverage: every zone has a flavor, journey items carry storyNote,
 *    examine/readable features exist in FP rooms.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '@/engine/state';
import { ZONES, ITEMS } from '@/data';
import type { Zone } from '@/types';

describe('State.logStory (Sprint 8.4)', () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager();
  });

  it('appends an entry with a stable id and order', () => {
    expect(state.logStory({ kind: 'zone', refId: 'lake', title: '🌊 The Lake', icon: '🌊' })).toBe(true);
    expect(state.logStory({ kind: 'threat', refId: 'traffic', title: 'Traffic', icon: '🚗' })).toBe(true);
    const log = state.storyLog;
    expect(log).toHaveLength(2);
    expect(log[0].id).toBe('zone:lake');
    expect(log[0].order).toBe(0);
    expect(log[1].id).toBe('threat:traffic');
    expect(log[1].order).toBe(1);
  });

  it('is idempotent per kind:refId (no dupes on re-resolve / re-collect)', () => {
    const entry = { kind: 'threat' as const, refId: 'forest_wolf', title: 'Forest Wolf', icon: '🐺' };
    expect(state.logStory({ ...entry, detail: 'It backs off.' })).toBe(true);
    expect(state.logStory({ ...entry, detail: 'It backs off.' })).toBe(false);
    expect(state.logStory({ ...entry })).toBe(false);
    expect(state.storyLog).toHaveLength(1);
    // first detail wins — the thread records the moment, not the retry
    expect(state.storyLog[0].detail).toBe('It backs off.');
  });

  it('keeps distinct refIds separate', () => {
    state.logStory({ kind: 'item', refId: 'map_fragment', title: 'Map', icon: '📋' });
    state.logStory({ kind: 'item', refId: 'compass_fragment', title: 'Compass', icon: '🧭' });
    state.logStory({ kind: 'zone', refId: 'map_fragment', title: 'Odd zone', icon: '🌍' });
    expect(state.storyLog).toHaveLength(3);
  });

  it('rejects empty refIds', () => {
    expect(state.logStory({ kind: 'item', refId: '', title: 'x', icon: '🎒' })).toBe(false);
    expect(state.storyLog).toHaveLength(0);
  });
});

describe('State.markZoneVisited (Sprint 8.4)', () => {
  it('returns true exactly once per zone', () => {
    const state = new StateManager();
    expect(state.markZoneVisited('lake')).toBe(true);
    expect(state.markZoneVisited('lake')).toBe(false);
    expect(state.markZoneVisited('forest')).toBe(true);
    expect(state.getState().zonesVisited).toEqual(['lake', 'forest']);
  });

  it('rejects empty ids', () => {
    const state = new StateManager();
    expect(state.markZoneVisited('')).toBe(false);
    expect(state.getState().zonesVisited).toEqual([]);
  });
});

describe('StateManager.recapLine (Sprint 8.4)', () => {
  it('summarizes zones, dangers, and friends with pluralization', () => {
    const state = new StateManager();
    state.markZoneVisited('lake');
    state.markZoneVisited('forest');
    state.getState().companionsMet.add('stray_buddy' as any);
    state.getState().threatsResolved = 3;
    const line = StateManager.recapLine(state.getState());
    expect(line).toBe(
      'You crossed 2 places, out-witted 3 dangers, and made 1 friend on the way home.',
    );
  });

  it('handles the zero state without crashing', () => {
    const state = new StateManager();
    expect(StateManager.recapLine(state.getState())).toContain('0 places');
  });
});

describe('Sprint 8.4 data coverage', () => {
  it('every zone ships a first-visit flavor line', () => {
    const zoneIds = Object.keys(ZONES);
    expect(zoneIds.length).toBeGreaterThanOrEqual(18);
    for (const id of zoneIds) {
      const flavor = (ZONES[id] as Zone).flavor;
      expect(typeof flavor, `${id} flavor`).toBe('string');
      expect((flavor as string).trim().length, `${id} flavor non-empty`).toBeGreaterThan(0);
    }
  });

  it('journey items carry story notes (the 5 required + story-category items)', () => {
    const required = ['map_fragment', 'compass_fragment', 'collar_piece', 'lake_stone', 'pinecone'];
    for (const id of required) {
      expect(ITEMS[id].storyNote, `${id} storyNote`).toBeTruthy();
      expect((ITEMS[id].storyNote as string).trim().length).toBeGreaterThan(0);
    }
    // every story-category item should have a note too
    for (const [id, item] of Object.entries(ITEMS)) {
      if (item.category === 'story') {
        expect(item.storyNote, `${id} (story) storyNote`).toBeTruthy();
      }
    }
  });

  it('zones contain examine features and readable objects (FP + TP)', () => {
    const allFeatures = Object.values(ZONES)
      .flatMap(z => [...(z.features ?? []), ...(z.rooms ?? []).flatMap(r => r.features ?? [])]);
    const examine = allFeatures.filter(f => (f as { examine?: string }).examine);
    const readable = allFeatures.filter(f => (f as { readable?: boolean }).readable);
    expect(examine.length, 'examine features').toBeGreaterThanOrEqual(5);
    expect(readable.length, 'readable features').toBeGreaterThanOrEqual(4);
    // FP rooms specifically: the plan's core surface (TV, bowls, the flyer person)
    const fpExamine = Object.values(ZONES)
      .flatMap(z => (z.rooms ?? []).flatMap(r => r.features ?? []))
      .filter(f => (f as { examine?: string }).examine);
    expect(fpExamine.length, 'FP examine features').toBeGreaterThanOrEqual(2);
    for (const f of examine) {
      expect(((f as { examine: string }).examine).trim().length).toBeGreaterThan(0);
    }
  });
});
