import { test, expect } from '@playwright/test';
import { startGame, goToZone } from './helpers';

declare global {
  interface Window { __turboLiveParticles: () => number; }
}

/**
 * M3 (7.7) particle layer: ambient zone particles must actually spawn and be
 * live over time in a particle zone (forest = leaf petals). Guards against the
 * particle system silently spawning nothing.
 */
test('ambient particles spawn and live in a TP zone', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await goToZone(page, 'forest'); // forest => leaf petals

  // Give the particle system a couple seconds to spawn + stay alive.
  await page.waitForTimeout(2500);
  const live = await page.evaluate(() => window.__turboLiveParticles());
  expect(live, 'expected some ambient particles to be live in forest').toBeGreaterThan(0);
});

test('particle pool stays bounded (no runaway growth)', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await goToZone(page, 'forest');
  await page.waitForTimeout(3000);
  const live = await page.evaluate(() => window.__turboLiveParticles());
  // Pool max is 40; ambient spawn should stay well under it.
  expect(live).toBeLessThanOrEqual(40);
});
