/**
 * Unit tests — engine/state.ts
 *
 * StateManager is the single source of truth for game state. These tests
 * cover the core transitions without a browser: selectDog, collectItem,
 * modifyHappiness (clamp + max tracking + game over), useItem (category
 * effects), resolveThreat (reward/penalty), and the companion bonus.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '@/engine/state';
import { HAPPINESS } from '@/config';
import { ITEMS } from '@/data';

describe('StateManager', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = new StateManager();
  });

  describe('initial state', () => {
    it('starts at max happiness', () => {
      expect(sm.happiness).toBe(HAPPINESS.MAX);
    });

    it('has an empty 16-slot inventory', () => {
      expect(sm.inventory).toHaveLength(16);
      for (const slot of sm.inventory) {
        expect(slot.item).toBeNull();
        expect(slot.count).toBe(0);
      }
    });

    it('has no dog, companion, or threats resolved', () => {
      expect(sm.currentDog).toBeNull();
      expect(sm.activeCompanion).toBeNull();
      expect(sm.getState().threatsResolved).toBe(0);
    });
  });

  describe('selectDog', () => {
    it('accepts a valid dog id', () => {
      sm.selectDog('turbo');
      expect(sm.currentDog).toBe('turbo');
    });

    it('rejects an invalid dog id (logs error, no state change)', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      sm.selectDog('not_a_dog' as any);
      expect(sm.currentDog).toBeNull();
      expect(spy).toHaveBeenCalled();
    });

    it('emits on selection', () => {
      let fired = 0;
      sm.on('all', () => fired++);
      sm.selectDog('watson');
      expect(fired).toBe(1);
    });
  });

  describe('collectItem', () => {
    it('adds an item to the first empty slot', () => {
      expect(sm.collectItem('bone')).toBe(true);
      const filled = sm.inventory.filter(s => s.item);
      expect(filled).toHaveLength(1);
      expect(filled[0]).toEqual({ item: 'bone', count: 1 });
      expect(sm.getState().itemsCollected).toBe(1);
    });

    it('stacks duplicate items in the same slot (up to 99)', () => {
      sm.collectItem('bone');
      sm.collectItem('bone');
      const boneSlots = sm.inventory.filter(s => s.item === 'bone');
      expect(boneSlots).toHaveLength(1);
      expect(boneSlots[0].count).toBe(2);
      // itemsCollected counts each pickup
      expect(sm.getState().itemsCollected).toBe(2);
    });

    it('returns false when inventory is full', () => {
      // Fill all 16 slots with distinct items
      const items = Object.keys(ITEMS).slice(0, 16);
      for (const id of items) sm.collectItem(id);
      // 17th distinct item has no empty slot and no existing stack
      const extra = Object.keys(ITEMS).find(id => !sm.inventory.some(s => s.item === id));
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      if (extra) {
        expect(sm.collectItem(extra)).toBe(false);
      }
      expect(spy).toHaveBeenCalled();
    });

    it('returns false for an empty id', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(sm.collectItem('')).toBe(false);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('modifyHappiness', () => {
    it('clamps at MAX (100)', () => {
      sm.modifyHappiness(50); // 100 + 50 → clamp to 100
      expect(sm.happiness).toBe(100);
    });

    it('clamps at MIN (0) and triggers game over', () => {
      const overSpy = vi.fn();
      sm.on('gameOver', overSpy);
      sm.modifyHappiness(-200); // 100 - 200 → clamp to 0
      expect(sm.happiness).toBe(0);
      expect(overSpy).toHaveBeenCalled();
      expect(sm.getState().gameOverTime).not.toBeNull();
    });

    it('tracks maxHappiness when exceeding the previous max', () => {
      sm.modifyHappiness(-30); // 70
      sm.modifyHappiness(50); // back to 100
      expect(sm.getState().maxHappiness).toBe(100);
    });

    it('does not emit happinessChange when value is unchanged (at cap)', () => {
      const spy = vi.fn();
      sm.on('happinessChange', spy);
      sm.modifyHappiness(10); // already at 100, no change
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('useItem', () => {
    it('returns false when the item is not in inventory', () => {
      expect(sm.useItem('bone')).toBe(false);
    });

    it('consumes a comfort item and restores +COMFORT_ITEM_RESTORE happiness', () => {
      sm.modifyHappiness(-40); // drop to 60 so the restore is visible
      const before = sm.happiness;
      sm.collectItem('bone');
      expect(sm.useItem('bone')).toBe(true);
      // bone is category 'comfort' → +15
      expect(sm.happiness).toBeCloseTo(before + HAPPINESS.COMFORT_ITEM_RESTORE, 5);
    });

    it('decrements stacked item count and restores once per use', () => {
      sm.modifyHappiness(-40);
      sm.collectItem('treat');
      sm.collectItem('treat'); // stack of 2
      const before = sm.happiness;
      sm.useItem('treat');
      const treatSlot = sm.inventory.find(s => s.item === 'treat')!;
      expect(treatSlot.count).toBe(1);
      expect(sm.happiness).toBeCloseTo(before + HAPPINESS.COMFORT_ITEM_RESTORE, 5);
    });

    it('does not restore happiness for non-comfort/food items', () => {
      // 'key' is category 'key' — no happiness effect
      sm.collectItem('key');
      const before = sm.happiness;
      expect(sm.useItem('key')).toBe(true);
      expect(sm.happiness).toBe(before);
    });
  });

  describe('resolveThreat', () => {
    it('success: +THREAT_SUCCESS_REWARD and increments threatsResolved', () => {
      sm.modifyHappiness(-30); // 70
      const before = sm.happiness;
      sm.resolveThreat('traffic', true);
      expect(sm.happiness).toBeCloseTo(before + HAPPINESS.THREAT_SUCCESS_REWARD, 5);
      expect(sm.getState().threatsResolved).toBe(1);
    });

    it('failure: -THREAT_FAIL_PENALTY and does not increment threatsResolved', () => {
      const before = sm.happiness;
      sm.resolveThreat('traffic', false);
      expect(sm.happiness).toBeCloseTo(before - HAPPINESS.THREAT_FAIL_PENALTY, 5);
      expect(sm.getState().threatsResolved).toBe(0);
    });

    it('failure at low happiness can trigger game over', () => {
      sm.modifyHappiness(-90); // 10
      const overSpy = vi.fn();
      sm.on('gameOver', overSpy);
      sm.resolveThreat('cat', false); // -15 → clamp to 0 → game over
      expect(sm.happiness).toBe(0);
      expect(overSpy).toHaveBeenCalled();
    });
  });

  describe('companion bonus (decay multiplier)', () => {
    it('exposes the COMPANION_BONUS_MULTIPLIER from config', () => {
      // The multiplier is applied in main.ts's decay calc; here we verify
      // the config value is the 0.9x that the balance tests rely on.
      expect(HAPPINESS.COMPANION_BONUS_MULTIPLIER).toBeCloseTo(0.9, 5);
    });

    it('meetCompanion auto-activates the first companion met', () => {
      sm.meetCompanion('stray_buddy');
      expect(sm.activeCompanion).toBe('stray_buddy');
      expect(sm.getState().companionsMet.has('stray_buddy')).toBe(true);
    });

    it('activateCompanion switches the active companion', () => {
      sm.meetCompanion('stray_buddy');
      sm.activateCompanion('shelter_dog');
      expect(sm.activeCompanion).toBe('shelter_dog');
    });
  });

  describe('reset', () => {
    it('restores initial state', () => {
      sm.selectDog('turbo');
      sm.collectItem('bone');
      sm.resolveThreat('traffic', true);
      sm.reset();

      expect(sm.currentDog).toBeNull();
      expect(sm.happiness).toBe(HAPPINESS.MAX);
      expect(sm.getState().itemsCollected).toBe(0);
      expect(sm.getState().threatsResolved).toBe(0);
      expect(sm.activeCompanion).toBeNull();
    });
  });

  describe('pub/sub', () => {
    it('on() returns an unsubscribe function', () => {
      let fired = 0;
      const off = sm.on('all', () => fired++);
      sm.selectDog('nova');
      expect(fired).toBe(1);
      off();
      sm.selectDog('walter');
      expect(fired).toBe(1); // no longer called after unsubscribe
    });

    it('event-filtered listeners only fire for their event', () => {
      let collectFired = 0;
      let otherFired = 0;
      sm.on('collectItem', () => collectFired++);
      sm.on('all', () => otherFired++);
      sm.selectDog('turbo'); // not collectItem
      expect(collectFired).toBe(0);
      sm.collectItem('bone');
      expect(collectFired).toBe(1);
      expect(otherFired).toBe(2); // 'all' fires for both
    });
  });
});
