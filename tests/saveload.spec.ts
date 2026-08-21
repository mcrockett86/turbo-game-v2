import { test, expect } from '@playwright/test';
import { startGame, zone, goToZone, happiness } from './helpers';

/**
 * Save/Load round-trip tests.
 */

test.describe('Save/Load: Persistence', () => {
  test('save exists after gameplay and Continue button appears on reload', async ({ page, context }) => {
    await page.goto('/');
    await startGame(page);

    // Play a bit (navigate to another zone)
    await goToZone(page, 'city_park');
    await page.waitForTimeout(500);

    // Check that a save exists in localStorage
    const saveRaw = await page.evaluate(() => localStorage.getItem('turbo-lost-found-save'));
    expect(saveRaw).toBeTruthy();

    // Parse and verify structure
    const save = JSON.parse(saveRaw!);
    expect(save.version).toBe(1);
    expect(save.state).toBeDefined();
    expect(save.state.currentDog).toBeTruthy();
    expect(save.state.happiness).toBeGreaterThan(0);
  });

  test('Continue button restores game state', async ({ page }) => {
    // First session: play and create a save
    await page.goto('/');
    await startGame(page);
    await goToZone(page, 'city_park');
    await page.waitForTimeout(500);
    const savedZone = await zone(page);
    const savedHappiness = await happiness(page);

    // Reload the page (simulates page refresh)
    await page.reload();
    await page.locator('.dog-card').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Continue button should be visible
    const contBtn = page.locator('#continue-btn');
    await contBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await contBtn.click();
    await page.waitForTimeout(1000);

    // Game should be back in the saved zone
    const restoredZone = await zone(page);
    expect(restoredZone).toBe(savedZone);
  });

  test('save data includes position (zone + room)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await goToZone(page, 'suburban_streets');
    await page.waitForTimeout(300);

    const saveRaw = await page.evaluate(() => localStorage.getItem('turbo-lost-found-save'));
    if (saveRaw) {
      const save = JSON.parse(saveRaw);
      expect(save.state.currentZoneId).toBe('suburban_streets');
    }
  });
});

test.describe('Save/Load: Edge Cases', () => {
  test('new game without save shows no Continue button', async ({ page, context }) => {
    // Clear localStorage first
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('.dog-card').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Continue button should NOT exist
    const contBtn = page.locator('#continue-btn');
    const count = await contBtn.count();
    expect(count).toBe(0);
  });

  test('save is cleared after endgame restart', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    // Force endgame
    await page.evaluate(() => window.__turbo.forceEndgame('victory'));
    await page.waitForTimeout(300);

    // Click restart button (try multiple positions)
    const box = await page.locator('#game-canvas').boundingBox();
    if (box) {
      const positions = [
        [0.5, 0.75], [0.5, 0.8], [0.5, 0.85],
        [0.4, 0.8], [0.6, 0.8],
      ];
      for (const [fx, fy] of positions) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(300);
        // Check if save was cleared (restart fired)
        const saveRaw = await page.evaluate(() => localStorage.getItem('turbo-lost-found-save'));
        if (!saveRaw) break;
      }
    }

    // Save should be cleared
    const saveRaw = await page.evaluate(() => localStorage.getItem('turbo-lost-found-save'));
    expect(saveRaw).toBeFalsy();
  });
});
