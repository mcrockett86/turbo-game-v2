import { test, expect } from '@playwright/test';
import { startGame, zone, waitForEndgame } from './helpers';

/**
 * Endgame tests: victory and defeat screens.
 */

test.describe('Endgame: Victory', () => {
  test('victory screen shows with score', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    expect(await zone(page)).toBe('suburban_streets');

    // Force victory
    await page.evaluate(() => window.__turbo.forceEndgame('victory'));
    await page.waitForTimeout(500);

    const visible = await page.evaluate(() => window.__turbo.endgameVisible);
    expect(visible).toBe(true);

    // Canvas should show the victory overlay (check via pixels)
    const hasContent = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonEmpty = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i+1] > 0 || data[i+2] > 0) nonEmpty++;
      }
      return nonEmpty > 100;
    });
    expect(hasContent).toBe(true);
  });

  test('restart button on victory resets game to dog select', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await page.evaluate(() => window.__turbo.forceEndgame('victory'));
    await page.waitForTimeout(300);

    // The restart button is drawn on canvas. Click the lower-center area
    // where the endgame renders its buttons.
    const box = await page.locator('#game-canvas').boundingBox();
    if (box) {
      // Try multiple click positions to hit the restart button
      const positions = [
        [0.5, 0.75], [0.5, 0.8], [0.5, 0.85],
        [0.4, 0.8], [0.6, 0.8],
      ];
      for (const [fx, fy] of positions) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(300);
        // Check if we're back at dog select
        const dogs = await page.locator('.dog-card').count();
        if (dogs > 0) break;
      }
    }

    // After restart, should be back at dog select
    const dogCards = await page.locator('.dog-card').count();
    expect(dogCards).toBeGreaterThan(0);
  });
});

test.describe('Endgame: Defeat', () => {
  test('defeat screen shows', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await page.evaluate(() => window.__turbo.forceEndgame('defeat'));
    await page.waitForTimeout(500);

    const visible = await page.evaluate(() => window.__turbo.endgameVisible);
    expect(visible).toBe(true);
  });

  test('defeat screen also has restart', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await page.evaluate(() => window.__turbo.forceEndgame('defeat'));
    await page.waitForTimeout(300);

    const box = await page.locator('#game-canvas').boundingBox();
    if (box) {
      const positions = [
        [0.5, 0.75], [0.5, 0.8], [0.5, 0.85],
        [0.4, 0.8], [0.6, 0.8],
      ];
      for (const [fx, fy] of positions) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(300);
        const dogs = await page.locator('.dog-card').count();
        if (dogs > 0) break;
      }
    }

    const dogCards = await page.locator('.dog-card').count();
    expect(dogCards).toBeGreaterThan(0);
  });
});

test.describe('Endgame: State Integrity', () => {
  test('endgame blocks further gameplay input', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    const zoneBefore = await zone(page);

    await page.evaluate(() => window.__turbo.forceEndgame('victory'));
    await page.waitForTimeout(300);

    // Try to move — zone should not change
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(200);
    const zoneAfter = await zone(page);
    expect(zoneAfter).toBe(zoneBefore);
  });
});
