import { test, expect } from '@playwright/test';
import { startGame, zone, goToZone, holdKey, tapCenter } from './helpers';

declare global {
  interface Window {
    __turbo: {
      playerPos: { x: number; y: number; z: number | null; kind: string } | null;
    };
  }
}

/**
 * Regression: "after I transition to a new zone I can no longer move the
 * character" (reported 2026-08-25, post Sprint-7-M1 DPR changes).
 *
 * Root cause found: canvas clicks did NOT resolve combat/timing threats
 * (only SPACE did). A mouse-driven player would click the minigame, the
 * threat would never finish, `threatManager.isBusy` would stay true, and
 * the game loop would skip `activeRenderer.update()` — so the player froze.
 *
 * Fix: ThreatManager now handles canvas clicks for timing/combat as a
 * fallback (onCanvasClick), so mouse players can resolve minigames.
 *
 * The existing navigation tests only assert the zone *name* — none of them
 * assert that the player's position actually changes while a movement key
 * is held. This test does exactly that, for both TP and FP zones, after
 * resolving any zone threat.
 */

/** Resolve the active threat (if any) using the type-appropriate input. */
async function resolveThreat(page: any): Promise<void> {
  // Fast-forward intro
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);

  const type = await page.evaluate(() => (window as any).__turbo.threatManager.currentType);
  if (type === 'comfort' || type === 'sneak') {
    // Hold SPACE to build progress
    await page.keyboard.down('Space');
    await page.waitForTimeout(5500);
    await page.keyboard.up('Space');
  } else if (type === 'combat' || type === 'timing') {
    // Tap (canvas click or Space) until resolved
    for (let i = 0; i < 40 && (await page.evaluate(() => (window as any).__turbo.threatBusy)); i++) {
      const pulse = await page.evaluate(() => (window as any).__turbo.threatManager.combat?.pulse ?? 0);
      const inWindow = pulse >= 0.4 && pulse <= 0.6;
      if (inWindow || type === 'timing') {
        await tapCenter(page); // canvas click (now works as fallback)
      } else {
        await page.keyboard.press('Space');
      }
      await page.waitForTimeout(300);
    }
  }
  await page.waitForTimeout(800);
}

async function assertMoves(page: any, zoneId: string): Promise<void> {
  await goToZone(page, zoneId);
  // Wait for zone threat to trigger (if any) and resolve it
  const hasThreat = await page.evaluate((zid: string) => !!(window as any).__turbo?.ZONES?.[zid]?.threat, zoneId);
  if (hasThreat) {
    await page.waitForFunction(() => (window as any).__turbo.threatBusy === true, null, { timeout: 5000 });
    await resolveThreat(page);
    // Verify threat resolved
    expect(await page.evaluate(() => (window as any).__turbo.threatPhase), `threat should be resolved in ${zoneId}`).toBe('idle');
  }

  const before = await page.evaluate(() => window.__turbo.playerPos);
  expect(before, `no player position in ${zoneId}`).not.toBeNull();
  let moved = 0;
  let prev = { x: before.x, y: before.y };
  for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
    await holdKey(page, k, 300);
    const after = await page.evaluate(() => window.__turbo.playerPos);
    const dist = Math.hypot(after.x - prev.x, after.y - prev.y);
    if (dist > 0.05) {
      moved++;
      prev = { x: after.x, y: after.y };
    }
  }
  expect(moved, `player never moved in zone ${zoneId} (kind=${before.kind})`).toBeGreaterThan(0);
}

test.describe('Regression: movement after zone transition', () => {
  test('player moves in the first zone (suburban_streets)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    expect(await zone(page)).toBe('suburban_streets');
    await assertMoves(page, 'suburban_streets');
  });

  test('player moves in TP zone after transition + threat (dog_park)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await assertMoves(page, 'dog_park');
  });

  test('player moves in TP zone after transition + threat (lake)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await assertMoves(page, 'lake');
  });

  test('player moves in FP zone after transition (apartment)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await assertMoves(page, 'apartment');
  });

  test('player moves across many zone transitions', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    const route = ['forest', 'suburban_streets', 'beach', 'suburban_streets', 'dog_park', 'suburban_streets'];
    for (const z of route) {
      await assertMoves(page, z);
    }
  });
});
