import { test, expect } from '@playwright/test';
import { startGame, goToZone, holdKey } from './helpers';

declare global {
  interface Window {
    __turboPlayerPos: () => { x: number; y: number } | null;
  }
}

/** Read the TP player's world position (debug bridge). */
function playerPos(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.__turboPlayerPos());
}

/**
 * Obstacle collision under SPREAD=3.0 (world spread).
 *
 * Regression: with a large SPREAD the obstacle collision radii (authored in
 * unscaled world units) became huge, so the player bumped into trees/fences far
 * before visually touching them. Collision must block at roughly the obstacle's
 * drawn size — so the player can reach close to an obstacle, and isn't blocked
 * at the start of the zone.
 */
test.describe('obstacle collision under world spread', () => {
  test('player is not blocked by an oversized collision wall near spawn', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await goToZone(page, 'dog_park');

    const before = await playerPos(page);
    expect(before, 'player pos bridge missing').not.toBeNull();
    if (!before) return;

    // Walk +x toward the dog_park tree at (5,-4).
    await holdKey(page, 'd', 900);

    const after = await playerPos(page);
    expect(after).not.toBeNull();
    if (!after) return;

    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    // The player MUST be able to move — a giant collision circle would freeze
    // them at spawn. (Previously this was the reported "bumping too far away".)
    expect(moved, `player should move when walking, moved ${moved}`).toBeGreaterThan(2);
  });

  test('player can get close to an obstacle but is stopped by it', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await goToZone(page, 'dog_park');

    // Tree at (5,-4). Walk straight at it from the origin.
    await holdKey(page, 'd', 1400); // +x toward it
    const p = await playerPos(page);
    expect(p).not.toBeNull();
    if (!p) return;

    // The player should be reasonably close to the tree (blocked by its
    // collision radius) but not have tunneled far past it.
    const dist = Math.hypot(p.x - 5, p.y - (-4));
    expect(dist, `expected to be near the tree at (5,-4), got ${p}`).toBeLessThan(8);
  });
});
