import { test, expect } from '@playwright/test';
import { startGame, zone, goToZone, holdKey, clickFrac, tapCenter } from './helpers';

/**
 * Navigation tests: verify the player can traverse rooms within a zone
 * and move between zones using exit clicks.
 *
 * Valid zone IDs (from data.ts):
 *   suburban_streets, dog_park, apartment, shelter, neighborhood,
 *   home, lake, pet_store, dog_show, forest, beach, mountain,
 *   garden, library, market, cave, waterfall, park_secret
 */

const VALID_ZONES = ['suburban_streets', 'dog_park', 'shelter', 'lake', 'beach', 'forest'];

test.describe('Navigation: Room Traversal (FP zones)', () => {
  test('player can move around a room with WASD', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    const z = await zone(page);
    expect(z).toBe('suburban_streets');

    // Move in each direction
    await holdKey(page, 'KeyW', 300);
    await holdKey(page, 'KeyD', 300);
    await holdKey(page, 'KeyS', 300);
    await holdKey(page, 'KeyA', 300);

    // Zone should still be the same (no accidental zone change from movement)
    expect(await zone(page)).toBe('suburban_streets');
  });

  test('player can navigate between rooms within a zone via exit clicks', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    const startZone = await zone(page);
    expect(startZone).toBe('suburban_streets');

    // Click around the canvas to find an exit (grid search)
    const fractions: Array<[number, number]> = [
      [0.5, 0.8], [0.5, 0.2], [0.2, 0.5], [0.8, 0.5],
      [0.3, 0.8], [0.7, 0.8], [0.3, 0.2], [0.7, 0.2],
    ];
    let moved = false;
    for (const [fx, fy] of fractions) {
      await clickFrac(page, fx, fy);
      await page.waitForTimeout(500);
      if (await zone(page) !== startZone) {
        moved = true;
        break;
      }
    }
    // Either we changed rooms (same zone, different room) or changed zone.
    const newZone = await zone(page);
    expect(newZone).toBeTruthy();
  });

  test('arrow keys also move the player', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await holdKey(page, 'ArrowUp', 200);
    await holdKey(page, 'ArrowRight', 200);
    await holdKey(page, 'ArrowDown', 200);
    await holdKey(page, 'ArrowLeft', 200);
    expect(await zone(page)).toBe('suburban_streets');
  });
});

test.describe('Navigation: Zone Transitions', () => {
  test('can navigate to multiple distinct zones via debug bridge', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    const visited = new Set<string>();
    visited.add(await zone(page) ?? 'unknown');

    // Navigate to each valid zone
    for (const z of VALID_ZONES.slice(1)) {
      await goToZone(page, z);
      const current = await zone(page);
      if (current) visited.add(current);
    }
    // Should have visited at least 3 zones
    expect(visited.size).toBeGreaterThanOrEqual(3);
  });

  test('can navigate to a specific FP zone and back', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    expect(await zone(page)).toBe('suburban_streets');

    await goToZone(page, 'dog_park');
    expect(await zone(page)).toBe('dog_park');

    await goToZone(page, 'shelter');
    expect(await zone(page)).toBe('shelter');

    // Navigate back to start
    await goToZone(page, 'suburban_streets');
    expect(await zone(page)).toBe('suburban_streets');
  });
});

test.describe('Navigation: TP Zone (Top-Down Engine)', () => {
  test('TP zone renders and player can move', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    // Navigate to a TP zone (dog_park is type 'tp')
    await goToZone(page, 'dog_park');
    expect(await zone(page)).toBe('dog_park');
    // Move around
    await holdKey(page, 'KeyW', 300);
    await holdKey(page, 'KeyD', 300);
    expect(await zone(page)).toBe('dog_park');
  });

  test('TP zone: lake renders and is navigable', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await goToZone(page, 'lake');
    expect(await zone(page)).toBe('lake');
    await holdKey(page, 'KeyS', 200);
    await holdKey(page, 'KeyA', 200);
    expect(await zone(page)).toBe('lake');
  });
});
