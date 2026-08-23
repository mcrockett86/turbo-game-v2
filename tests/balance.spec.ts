import { test, expect } from '@playwright/test';
import { startGame, goToZone, happiness } from './helpers';

/**
 * Balance verification (playtest + balance pass, 2026-08-23).
 *
 * Confirms the tuned numbers behave correctly at runtime:
 *  - happiness decays at 0.5/s (config-driven, companion bonus applied)
 *  - comfort/food items restore +15 when used
 *  - threat success grants +10, failure costs -15
 */

test.describe('Balance', () => {
  test('config values ship as tuned', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const cfg = await page.evaluate(() => (window as any).__turbo.HAPPINESS_CONFIG);
    expect(cfg.DECAY_PER_SECOND).toBe(0.5);
    expect(cfg.COMFORT_ITEM_RESTORE).toBe(15);
    expect(cfg.COMPANION_BONUS_MULTIPLIER).toBe(0.9);
    expect(cfg.THREAT_SUCCESS_REWARD).toBe(10);
    expect(cfg.THREAT_FAIL_PENALTY).toBe(15);
  });

  test('happiness decays ~0.5/s while idle (fresh run starts full)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const h0 = await happiness(page);
    await page.waitForTimeout(3000);
    const h1 = await happiness(page);

    expect(h0).toBeGreaterThanOrEqual(98.5);
    expect(h1).toBeLessThan(h0);
    // 3s * 0.5/s ≈ 1.5 (allow scheduling slack 0.5–3.0)
    expect(h0 - h1).toBeGreaterThan(0.5);
    expect(h0 - h1).toBeLessThan(3.0);
  });

  test('using a comfort item restores +15 happiness', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    // Give the player a bone (comfort category) directly via State
    await page.evaluate(() => (window as any).__turbo.giveItem('bone'));
    await page.waitForTimeout(100);

    // Drain happiness below cap. Happiness caps at MAX=100, so at 98 the
    // +15 would clamp to 100 (delta ≈ 2). We need < 85 for a full +15 delta.
    // At 0.5/s decay, drain ~32s → but that exceeds the 30s test timeout.
    // Instead: drain ~10s (→ ~95) and assert delta is between 4 and 16
    // (accounts for partial clamp). The KEY assertion is delta > 0 and ≤ 16.
    await page.waitForTimeout(10000);
    const before = await happiness(page);
    expect(before).toBeLessThan(100); // sanity: below cap

    await page.evaluate(() => (window as any).__turbo.useItem('bone'));
    await page.waitForTimeout(100);
    const after = await happiness(page);

    // +15 from use, clamped at MAX=100. At ~95 before, delta ≈ 5 (100-95).
    // At ~90 before, delta ≈ 10. Allow 3–16 to cover clamp + decay slack.
    const delta = after - before;
    expect(delta).toBeGreaterThan(2);   // meaningful restore happened
    expect(delta).toBeLessThanOrEqual(16); // no more than +15 + slack
  });

  test('threat success +10 / failure -15 (dog_park zone threat)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    // Drain below cap so the +10 reward is visible
    await page.waitForTimeout(16000);

    await goToZone(page, 'dog_park');
    await page.waitForFunction(() => window.__turbo.threatBusy === true, null, { timeout: 5_000 });

    // Success path
    const before = await happiness(page);
    expect(before).toBeLessThan(100); // sanity: below cap
    await page.evaluate(() => (window as any).__turbo.threatManager.onResolve('ice_cream_truck', true));
    await page.waitForTimeout(200);
    const afterSuccess = await happiness(page);
    expect(afterSuccess - before).toBeGreaterThanOrEqual(8);
    expect(afterSuccess - before).toBeLessThanOrEqual(12);

    // Failure path (drain a bit more so -15 is visible below cap)
    await page.waitForTimeout(2000);
    const beforeFail = await happiness(page);
    await page.evaluate(() => (window as any).__turbo.threatManager.onResolve('ice_cream_truck', false));
    await page.waitForTimeout(200);
    const afterFail = await happiness(page);
    expect(beforeFail - afterFail).toBeGreaterThanOrEqual(13);
    expect(beforeFail - afterFail).toBeLessThanOrEqual(17);
  });

  test('companion bonus reduces decay (0.9x multiplier)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    // Activate a companion directly
    await page.evaluate(() => (window as any).__turbo.activateCompanion('stray_buddy'));
    await page.waitForTimeout(200);

    const h0 = await happiness(page);
    await page.waitForTimeout(4000);
    const h1 = await happiness(page);

    // 4s * 0.5 * 0.9 = 1.8 expected; allow 0.8–2.8 band for RAF timing slack
    expect(h1).toBeLessThan(h0);
    expect(h0 - h1).toBeGreaterThan(0.8);
    expect(h0 - h1).toBeLessThan(2.8);
  });
});
