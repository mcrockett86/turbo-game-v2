/**
 * tests/unit/coverage.test.ts
 *
 * Content & companion coverage (Sprint 6 item 5). Guards against the class of
 * bug where a companion or item is *defined* in data.ts but no zone can ever
 * reach it — i.e. content that exists in the file but never appears in a run.
 *
 * This is the "make it provably correct" half of the sprint: the companion
 * meet-mechanic and item pickup are only as good as the data that wires them.
 *
 * Companion reachability:
 *  - A companion is reachable iff a zone lists it in `companions: [...]`
 *    (met via a `dog_friend` feature) OR an NPC in some zone has a matching
 *    `name` (met via NPC interaction).
 *  - Every companion must have ≥ 1 non-empty dialogue line (the meet bubble).
 *
 * Item reachability:
 *  - An item is reachable iff some zone feature references it via `item: ...`.
 *  - Every item category declared in the game must have ≥ 1 reachable item,
 *    so no category is dead content.
 *
 * These tests are intentionally strict: when we fix the data, they turn green.
 * They are the acceptance criteria for the content-coverage sprint.
 */

import { describe, it, expect } from 'vitest';
import { ZONES, ITEMS, COMPANIONS } from '@/data';
import type { Zone } from '@/types';

/** All companion ids. */
function companionIds(): string[] {
  return Object.keys(COMPANIONS);
}

/** Set of companion ids a player can actually meet, and how. */
function reachableCompanions(): { id: string; via: string[] }[] {
  const viaDogFriend = new Set<string>();
  const npcNames = new Set<string>();

  for (const zone of Object.values(ZONES)) {
    for (const c of zone.companions ?? []) viaDogFriend.add(c);
    for (const npc of zone.npcs ?? []) npcNames.add(npc.name);
  }

  return companionIds().map((id) => {
    const via: string[] = [];
    if (viaDogFriend.has(id)) via.push('dog_friend');
    if (npcNames.has(COMPANIONS[id].name)) via.push('npc');
    return { id, via };
  });
}

/** Set of item ids a player can actually pick up. */
function reachableItemIds(): Set<string> {
  const refs = new Set<string>();
  for (const zone of Object.values(ZONES)) {
    for (const f of zone.features ?? []) {
      if (f.item) refs.add(f.item);
    }
  }
  return refs;
}

/** Distinct item categories actually reachable in a run. */
function reachableCategories(): Set<string> {
  const refs = reachableItemIds();
  const cats = new Set<string>();
  for (const [id, item] of Object.entries(ITEMS)) {
    if (refs.has(id)) cats.add(item.category);
  }
  return cats;
}

describe('companion coverage', () => {
  it('defines exactly 15 companions', () => {
    expect(companionIds()).toHaveLength(15);
  });

  it('every companion is reachable via dog_friend or an NPC', () => {
    const unreachable = reachableCompanions().filter((c) => c.via.length === 0);
    expect(
      unreachable.map((c) => c.id),
      `orphaned companions (defined but no zone can reach them): ${unreachable.map((c) => c.id).join(', ')}\n` +
        'Wire each to a zone via companions: [...] + a dog_friend feature, or an NPC with a matching name.'
    ).toHaveLength(0);
  });

  it('every reachable companion has at least one dialogue line', () => {
    for (const id of companionIds()) {
      const d = COMPANIONS[id].dialogue ?? [];
      expect(d.length, `${id} has no dialogue lines for the meet bubble`).toBeGreaterThan(0);
    }
  });
});

describe('item coverage', () => {
  it('defines 69 items', () => {
    expect(Object.keys(ITEMS)).toHaveLength(69);
  });

  it('every item is reachable via a zone feature', () => {
    const refs = reachableItemIds();
    const orphans = Object.keys(ITEMS).filter((id) => !refs.has(id));
    expect(
      orphans,
      `${orphans.length} orphaned items (defined but never attachable to a feature): ${orphans.join(', ')}\n` +
        'Attach each to a thematically-fitting zone feature (treasure/hint/food/etc.).'
    ).toHaveLength(0);
  });

  it('every item category has at least one reachable item', () => {
    const allCats = new Set(Object.values(ITEMS).map((i) => i.category));
    const reachable = reachableCategories();
    const dead = [...allCats].filter((c) => !reachable.has(c));
    expect(
      dead,
      `categories with no reachable items (dead content): ${dead.join(', ')}\n` +
        'Attach at least one item of each category to a zone feature.'
    ).toHaveLength(0);
  });
});
