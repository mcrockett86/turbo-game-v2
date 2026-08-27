/**
 * Unit tests — engine/render/threat-scenes.ts (Sprint 8.2)
 *
 * Smoke-covers the whole themed-scene surface with a permissive ctx stub:
 * every registered backdrop, every registered actor (via a threat carrying
 * that actor), and all three fallback paths. Catches typos, bad ids, and
 * accidental per-actor references at load time.
 */

import { describe, it, expect } from 'vitest';
import { THREATS } from '@/data';
import { THREAT_SCENE_IDS, THREAT_ACTOR_IDS } from '@/types';
import type { Threat, ThreatActorId } from '@/types';
import { drawThreatScene } from '@/engine/render/threat-scenes';

/**
 * Permissive canvas ctx stub: accepts any property set and any method call,
 * returns safe values for the two getters the scene module uses.
 * (jsdom's 2D context lacks several features; this keeps the test
 * environment-agnostic and focused on "does the draw code run without
 * throwing and only use stable API".)
 */
function makeCtxStub(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => gradient;
        }
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'canvas') return null;
        return () => {};
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

/** Minimal valid threat shape for fallback-path tests. */
function fakeThreat(overrides: Partial<Threat>): Threat {
  return {
    name: 'Fake',
    icon: '❓',
    type: 'timing',
    description: '',
    solve: '',
    mangaText: '',
    mangaType: 'near-miss',
    scene: 'street',
    successLine: '',
    failLine: '',
    ...overrides,
  };
}

// A few deterministic sample times: t=0 (initial pose), t=1.25, t=3.7 (mid-anim).
const SAMPLE_TIMES = [0, 1.25, 3.7];
const SIZES: Array<[number, number]> = [[640, 360], [960, 480], [320, 240]];

describe('drawThreatScene', () => {
  it('renders every one of the 40 data threats without throwing', () => {
    const ctx = makeCtxStub();
    for (const [id, threat] of Object.entries(THREATS)) {
      for (const [W, H] of SIZES) {
        for (const t of SAMPLE_TIMES) {
          expect(
            () => drawThreatScene(ctx, threat, t, W, H),
            `threat '${id}' threw at W=${W} H=${H} t=${t}`,
          ).not.toThrow();
        }
      }
    }
  });

  it('renders every registered actor id when a threat carries it', () => {
    const ctx = makeCtxStub();
    for (const actor of THREAT_ACTOR_IDS) {
      const threat = fakeThreat({ actor });
      expect(
        () => drawThreatScene(ctx, threat, 1.0, 640, 360),
        `actor '${actor}' threw`,
      ).not.toThrow();
    }
  });

  it('renders every registered scene id as a backdrop', () => {
    const ctx = makeCtxStub();
    for (const scene of THREAT_SCENE_IDS) {
      const threat = fakeThreat({ scene });
      expect(
        () => drawThreatScene(ctx, threat, 0.5, 640, 360),
        `scene '${scene}' threw`,
      ).not.toThrow();
    }
  });

  it('falls back to the per-type generic actor when actor is missing', () => {
    const ctx = makeCtxStub();
    for (const type of ['timing', 'combat', 'sneak', 'comfort'] as const) {
      const threat = fakeThreat({ type });
      // ensure no explicit actor overrides the fallback
      delete (threat as { actor?: ThreatActorId }).actor;
      expect(() => drawThreatScene(ctx, threat, 1.0, 640, 360)).not.toThrow();
    }
  });

  it('falls back to the generic blob actor for an unknown actor id', () => {
    const ctx = makeCtxStub();
    const threat = fakeThreat({ actor: 'totally_unknown' as ThreatActorId });
    expect(() => drawThreatScene(ctx, threat, 1.0, 640, 360)).not.toThrow();
  });

  it('falls back to a flat backdrop for an unknown scene id', () => {
    const ctx = makeCtxStub();
    const threat = fakeThreat({ scene: 'nowhere' as Threat['scene'] });
    expect(() => drawThreatScene(ctx, threat, 1.0, 640, 360)).not.toThrow();
  });
});
