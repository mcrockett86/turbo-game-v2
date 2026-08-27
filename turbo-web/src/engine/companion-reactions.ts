/**
 * Companion Reactions — deterministic pool pick for post-threat lines (8.3)
 *
 * After a threat resolves, the active companion voices the moment with a
 * short line drawn from their `reactions.success` / `reactions.fail` pool.
 * The pick is seeded (threat id + outcome) and fully deterministic so E2E
 * and unit tests can assert the exact line without flakiness.
 *
 * Pure module — no canvas, no state, no Math.random.
 */

import type { Companion } from '../types';

/** djb2 string hash — deterministic across runs, no allocation. */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick the companion's reaction line for a given outcome.
 * Returns null when the companion is missing or has no pool for the side —
 * callers treat null as "no reaction" (never a crash).
 */
export function pickReactionLine(
  companion: Pick<Companion, 'reactions'> | null | undefined,
  success: boolean,
  seed: string,
): string | null {
  const pool = companion?.reactions?.[success ? 'success' : 'fail'];
  if (!pool || pool.length === 0) return null;
  return pool[hashSeed(seed) % pool.length];
}
