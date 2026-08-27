/**
 * Unit tests — data.ts integrity
 *
 * Catches the class of bug where a zone/threat/item/companion id is referenced
 * but doesn't resolve. These run in milliseconds vs. minutes of E2E, so they
 * give a fast regression net for data drift.
 */

import { describe, it, expect } from 'vitest';
import { ZONES, ITEMS, THREATS, COMPANIONS, DOGS } from '@/data';
import { THREAT_SCENE_IDS } from '@/types';
import { resolveDifficulty } from '@/engine/threats';
import type { ThreatType, ThreatSceneId } from '@/types';

const VALID_THREAT_TYPES = new Set<ThreatType>(['timing', 'combat', 'sneak', 'comfort']);
const VALID_SCENES = new Set<string>(THREAT_SCENE_IDS);

/** Zone family → the scene its minigame backdrop should use (Sprint 8.1 consistency). */
const ZONE_SCENES: Record<string, ThreatSceneId> = {
  suburban_streets: 'street', neighborhood: 'street', home: 'street',
  dog_park: 'park', garden: 'garden', apartment: 'apartment', shelter: 'shelter',
  lake: 'lake', forest: 'forest', beach: 'beach', mountain: 'mountain',
  waterfall: 'waterfall', park_secret: 'secret_park',
  pet_store: 'pet_shop', dog_show: 'dog_show', market: 'market',
  library: 'library', cave: 'cave',
};

/** Legacy core-type features map feature.type → threat id (see main.ts coreMap). */
const LEGACY_CORE_MAP: Record<string, string> = {
  traffic: 'traffic', cat: 'cat', bully: 'bully', storm: 'storm', vacuum: 'vacuum',
};

/** Zones that reference a threat (zone field, feature threat, or legacy core-type). */
function zonesReferencing(threatId: string): string[] {
  const zones: string[] = [];
  for (const z of Object.values(ZONES)) {
    const refs = [z.threat, z.doorThreat, z.legacyThreat];
    const featureRefs = (z.features ?? []).map(f => f.threat ?? LEGACY_CORE_MAP[f.type]).filter(Boolean);
    if (refs.includes(threatId) || featureRefs.includes(threatId)) zones.push(z.id);
  }
  return zones;
}
const VALID_ZONE_TYPES = new Set(['fp', 'tp']); // 'search' was cut 2026-08-24 — keep this in sync with ZoneType in types.ts
const VALID_TRANSITIONS = new Set(['fade', 'wipe', 'zoom', 'slide']);
const VALID_ITEM_CATEGORIES = new Set([
  'comfort', 'food', 'clue', 'key', 'collectible',
  'utility', 'story', 'crafting', 'quest', 'rare',
]);

describe('data.ts integrity', () => {

  it('has a non-empty set of zones, items, threats, companions, and dogs', () => {
    expect(Object.keys(ZONES).length).toBeGreaterThan(5);
    expect(Object.keys(ITEMS).length).toBeGreaterThan(20);
    expect(Object.keys(THREATS).length).toBe(40); // the full 40-threat set
    expect(Object.keys(COMPANIONS).length).toBe(15);
    expect(Object.keys(DOGS).length).toBe(5);
  });

  describe('zones', () => {
    it('every zone has a unique id matching its key', () => {
      const ids = new Set<string>();
      for (const [key, z] of Object.entries(ZONES)) {
        expect(z.id).toBe(key);
        expect(ids.has(key), `duplicate zone key ${key}`).toBe(false);
        ids.add(key);
      }
    });

    it('every zone has a valid type', () => {
      for (const z of Object.values(ZONES)) {
        expect(VALID_ZONE_TYPES.has(z.type), `${z.id} has invalid type ${z.type}`).toBe(true);
      }
    });

    it('every zone has required fields (name, desc, music, hint)', () => {
      for (const z of Object.values(ZONES)) {
        expect(z.name, `${z.id} missing name`).toBeTruthy();
        expect(z.desc, `${z.id} missing desc`).toBeTruthy();
        expect(z.music, `${z.id} missing music`).toBeTruthy();
        expect(z.hint, `${z.id} missing hint`).toBeTruthy();
      }
    });

    it('every zone threat id resolves to a THREATS entry', () => {
      for (const z of Object.values(ZONES)) {
        if (z.threat) {
          expect(THREATS[z.threat], `${z.id}.threat '${z.threat}' not in THREATS`).toBeDefined();
        }
        if (z.doorThreat) {
          expect(THREATS[z.doorThreat], `${z.id}.doorThreat '${z.doorThreat}' not in THREATS`).toBeDefined();
        }
        if (z.legacyThreat) {
          expect(THREATS[z.legacyThreat], `${z.id}.legacyThreat '${z.legacyThreat}' not in THREATS`).toBeDefined();
        }
      }
    });

    it('every zone threatKind, if set, is a valid threat type or hazard', () => {
      for (const z of Object.values(ZONES)) {
        if (z.threatKind) {
          expect(VALID_THREAT_TYPES.has(z.threatKind) || z.threatKind === 'hazard',
            `${z.id}.threatKind '${z.threatKind}' invalid`).toBe(true);
        }
      }
    });

    it('every zone transition, if set, is a valid kind', () => {
      for (const z of Object.values(ZONES)) {
        if (z.transition) {
          expect(VALID_TRANSITIONS.has(z.transition),
            `${z.id}.transition '${z.transition}' invalid`).toBe(true);
        }
      }
    });

    it('gate features reference existing zones', () => {
      for (const z of Object.values(ZONES)) {
        for (const f of z.features ?? []) {
          if (f.gate) {
            expect(ZONES[f.gate], `${z.id} gate '${f.gate}' not a zone`).toBeDefined();
          }
        }
      }
    });

    it('returnZone references an existing zone', () => {
      for (const z of Object.values(ZONES)) {
        if (z.returnZone) {
          expect(ZONES[z.returnZone], `${z.id}.returnZone '${z.returnZone}' not a zone`).toBeDefined();
        }
      }
    });
  });

  describe('threats', () => {
    it('every threat has a valid type', () => {
      for (const [id, t] of Object.entries(THREATS)) {
        expect(VALID_THREAT_TYPES.has(t.type), `threat '${id}' invalid type ${t.type}`).toBe(true);
      }
    });

    it('every threat has required fields (name, icon, description, solve)', () => {
      for (const [id, t] of Object.entries(THREATS)) {
        expect(t.name, `threat '${id}' missing name`).toBeTruthy();
        expect(t.icon, `threat '${id}' missing icon`).toBeTruthy();
        expect(t.description, `threat '${id}' missing description`).toBeTruthy();
        expect(t.solve, `threat '${id}' missing solve`).toBeTruthy();
      }
    });

    it('all 4 threat types are represented', () => {
      const types = new Set(Object.values(THREATS).map(t => t.type));
      for (const valid of VALID_THREAT_TYPES) {
        expect(types.has(valid), `no threat of type ${valid}`).toBe(true);
      }
    });

    describe('Sprint 8.1 context layer', () => {
      it('every threat has a valid scene id', () => {
        for (const [id, t] of Object.entries(THREATS)) {
          expect(VALID_SCENES.has(t.scene), `threat '${id}' invalid scene '${t.scene}'`).toBe(true);
        }
      });

      it('every threat has success and fail flavor lines', () => {
        for (const [id, t] of Object.entries(THREATS)) {
          expect(t.successLine, `threat '${id}' missing successLine`).toBeTruthy();
          expect(t.failLine, `threat '${id}' missing failLine`).toBeTruthy();
        }
      });

      it('combat beats match the effective beat count', () => {
        for (const [id, t] of Object.entries(THREATS)) {
          if (t.type !== 'combat') continue;
          if (!t.beats) continue; // beats are optional; 8.3 will render them when present
          const needed = resolveDifficulty('combat', t.difficulty).beats ?? 3;
          expect(t.beats.length, `threat '${id}' has ${t.beats.length} beat words but needs ${needed}`).toBe(needed);
          for (const word of t.beats) {
            expect(typeof word, `threat '${id}' beat word not a string`).toBe('string');
            expect(word.trim().length, `threat '${id}' empty beat word`).toBeGreaterThan(0);
          }
        }
      });

      it('scene matches at least one referencing zone family', () => {
        // A threat can trigger in more than one zone (e.g. treasure_guardian at the
        // cave exit AND in the secret park); its scene must fit at least one of them.
        for (const [id, t] of Object.entries(THREATS)) {
          const zones = zonesReferencing(id);
          if (zones.length === 0) continue; // covered by the reachability test below
          const expectedScenes = zones.map(z => ZONE_SCENES[z]).filter(Boolean);
          expect(
            expectedScenes.includes(t.scene),
            `threat '${id}' scene '${t.scene}' fits none of its zones ${zones.join(', ')} (${expectedScenes.join(', ')})`,
          ).toBe(true);
        }
      });
    });
  });

  describe('items', () => {
    it('every item has a valid category', () => {
      for (const [id, item] of Object.entries(ITEMS)) {
        expect(VALID_ITEM_CATEGORIES.has(item.category),
          `item '${id}' invalid category ${item.category}`).toBe(true);
      }
    });

    it('every item has name and desc', () => {
      for (const [id, item] of Object.entries(ITEMS)) {
        expect(item.name, `item '${id}' missing name`).toBeTruthy();
        expect(item.desc, `item '${id}' missing desc`).toBeTruthy();
      }
    });

    it('zone item features reference existing items', () => {
      for (const z of Object.values(ZONES)) {
        for (const f of z.features ?? []) {
          if (f.item) {
            expect(ITEMS[f.item], `${z.id} feature item '${f.item}' not in ITEMS`).toBeDefined();
          }
        }
      }
    });
  });

  describe('companions', () => {
    it('every companion has id, name, breed, and dialogue', () => {
      for (const [key, c] of Object.entries(COMPANIONS)) {
        expect(c.id).toBe(key);
        expect(c.name, `companion '${key}' missing name`).toBeTruthy();
        expect(c.breed, `companion '${key}' missing breed`).toBeTruthy();
        expect(Array.isArray(c.dialogue) && c.dialogue.length > 0,
          `companion '${key}' has no dialogue`).toBe(true);
      }
    });

    it('zone companions reference existing companion ids', () => {
      for (const z of Object.values(ZONES)) {
        for (const cid of z.companions ?? []) {
          expect(COMPANIONS[cid], `${z.id} companion '${cid}' not in COMPANIONS`).toBeDefined();
        }
      }
    });
  });

  describe('dogs', () => {
    it('every dog has id, name, breed, and trait', () => {
      for (const [key, d] of Object.entries(DOGS)) {
        expect(d.id).toBe(key);
        expect(d.name, `dog '${key}' missing name`).toBeTruthy();
        expect(d.breed, `dog '${key}' missing breed`).toBeTruthy();
        expect(d.trait, `dog '${key}' missing trait`).toBeTruthy();
      }
    });
  });

  describe('cross-references (the 40-threat coverage)', () => {
    it('every threat is reachable (zone field, feature threat, or legacy core-type)', () => {
      const referenced = new Set<string>();
      // Legacy core-type features map feature.type → threat id (see main.ts coreMap)
      const legacyCoreMap: Record<string, string> = {
        traffic: 'traffic', cat: 'cat', bully: 'bully', storm: 'storm', vacuum: 'vacuum',
      };
      for (const z of Object.values(ZONES)) {
        if (z.threat) referenced.add(z.threat);
        if (z.doorThreat) referenced.add(z.doorThreat);
        if (z.legacyThreat) referenced.add(z.legacyThreat);
        for (const f of z.features ?? []) {
          if (f.threat) referenced.add(f.threat);
          // Legacy core-type features trigger via feature.type
          if (legacyCoreMap[f.type]) referenced.add(legacyCoreMap[f.type]);
        }
      }
      const unreferenced = Object.keys(THREATS).filter(id => !referenced.has(id));
      expect(unreferenced, `threats never triggerable: ${unreferenced.join(', ')}`).toEqual([]);
    });
  });
});
