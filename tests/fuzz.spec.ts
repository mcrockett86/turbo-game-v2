import { test, expect } from '@playwright/test';
import { startGame, zone } from './helpers';

/**
 * Fuzz / random-walk tests: simulate varied player behavior.
 * These catch crashes, infinite loops, and state corruption that
 * targeted tests might miss.
 */

test.describe('Fuzz: Random Input Sequences', () => {
  test('100 random inputs don\'t crash the game', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await startGame(page);

    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const special = ['KeyC', 'KeyH', 'KeyI', 'Escape', 'Space', 'Enter'];

    for (let i = 0; i < 100; i++) {
      const roll = Math.random();
      if (roll < 0.4) {
        // Movement
        const key = keys[Math.floor(Math.random() * keys.length)];
        await page.keyboard.down(key);
        await page.waitForTimeout(50 + Math.random() * 150);
        await page.keyboard.up(key);
      } else if (roll < 0.6) {
        // Panel toggle
        const key = special[Math.floor(Math.random() * special.length)];
        await page.keyboard.press(key);
      } else if (roll < 0.8) {
        // Click random canvas position
        const box = await page.locator('#game-canvas').boundingBox();
        if (box) {
          await page.mouse.click(
            box.x + Math.random() * box.width,
            box.y + Math.random() * box.height
          );
        }
      }
      // Small delay to let the game process
      await page.waitForTimeout(20);
    }

    // Game should still be responsive (zone is readable)
    const z = await zone(page);
    expect(z).toBeTruthy();

    // Filter out expected noise (audio errors are known)
    const realErrors = errors.filter(e => !e.includes('AudioContext') && !e.includes('audio'));
    expect(realErrors.length).toBe(0);
  });

  test('rapid zone switching doesn\'t corrupt state', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const zones = ['suburban_streets', 'city_park', 'shelter_lobby', 'beach_boardwalk'];
    for (let i = 0; i < 20; i++) {
      const z = zones[Math.floor(Math.random() * zones.length)];
      await page.evaluate((zoneId) => window.__turbo.navigateToZone(zoneId), z);
      await page.waitForTimeout(100);
    }

    // State should be consistent
    const h = await page.evaluate(() => window.__turbo.happiness);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(100);
  });

  test('random gameplay session (2 minutes equivalent) completes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await startGame(page);

    const startZone = await zone(page);
    expect(startZone).toBeTruthy();

    // Simulate ~30s of varied gameplay (compressed)
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    for (let cycle = 0; cycle < 30; cycle++) {
      // Move
      const key = keys[Math.floor(Math.random() * keys.length)];
      await page.keyboard.down(key);
      await page.waitForTimeout(80);
      await page.keyboard.up(key);

      // Occasionally interact
      if (cycle % 5 === 0) {
        const box = await page.locator('#game-canvas').boundingBox();
        if (box) {
          await page.mouse.click(
            box.x + Math.random() * box.width,
            box.y + Math.random() * box.height
          );
        }
      }

      // Occasionally toggle panels
      if (cycle % 10 === 0) {
        await page.keyboard.press('KeyC');
        await page.waitForTimeout(100);
        await page.keyboard.press('KeyC');
      }

      // Occasionally change zone
      if (cycle % 15 === 0) {
        const zones = ['city_park', 'shelter_lobby', 'suburban_streets'];
        const z = zones[Math.floor(Math.random() * zones.length)];
        await page.evaluate((zoneId) => window.__turbo.navigateToZone(zoneId), z);
      }

      await page.waitForTimeout(30);
    }

    // No unhandled exceptions
    const realErrors = errors.filter(e => !e.includes('AudioContext') && !e.includes('audio'));
    expect(realErrors).toHaveLength(0);

    // Game still responsive
    const finalZone = await zone(page);
    expect(finalZone).toBeTruthy();
  });
});
