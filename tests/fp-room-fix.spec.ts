/**
 * Verify the FP-room fix in a real browser:
 *  1. entering a first-person room throws no page error
 *  2. the player can actually move inside it (listeners attached)
 *  3. furniture blocks movement instead of being a ghost
 */
import { test, expect } from '@playwright/test';

test('FP room: no crash, movement works, furniture is solid', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/turbo-web/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#dog-grid .dog-card', { timeout: 10_000 });
  await page.click('#dog-grid .dog-card');
  await page.click('#start-adventure-btn');
  await page.waitForTimeout(1200);

  // Find an FP zone (rooms-based) and enter it
  const fpZone: string | null = await page.evaluate(() => {
    const Z = (window as any).__turbo.ZONES;
    for (const [id, z] of Object.entries(Z as Record<string, any>)) {
      if (z.rooms && Object.keys(z.rooms).length > 0) return id;
    }
    return null;
  });
  expect(fpZone, 'game should have at least one FP (rooms) zone').toBeTruthy();

  for (let a = 0; a < 6; a++) {
    await page.evaluate(() => { const t = (window as any).__turboThreat; if (t?.isBusy) t.cancel(); });
    const ok = await page.evaluate((z) => (window as any).__turboNav(z), fpZone);
    if (ok) break;
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(1500);

  // An entry threat legitimately owns input; drain it before measuring movement.
  for (let a = 0; a < 8; a++) {
    const busy = await page.evaluate(() => (window as any).__turbo.threatBusy);
    if (!busy) break;
    await page.evaluate(() => { const t = (window as any).__turboThreat; if (t?.isBusy) t.cancel(); });
    await page.waitForTimeout(800);
  }
  const busyNow = await page.evaluate(() => (window as any).__turbo.threatBusy);
  expect(busyNow, 'a threat should not be holding input during the movement check').toBe(false);

  const zoneNow = await page.evaluate(() => (window as any).__turbo.currentZoneId);
  const rendererKind = await page.evaluate(() => {
    const r = (window as any).__activeRenderer?.();
    return r ? r.constructor.name : null;
  });
  console.log('[fp] zone:', zoneNow, 'renderer:', rendererKind);
  expect(rendererKind, 'FP zone should activate the room renderer').toMatch(/FpRoomRenderer/);

  // 2. movement: hold ArrowRight and see the position change
  const before = await page.evaluate(() => (window as any).__turbo.playerPos);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  const after = await page.evaluate(() => (window as any).__turbo.playerPos);
  console.log('[fp] playerPos', JSON.stringify(before), '->', JSON.stringify(after));
  expect(after, 'player position should be readable').not.toBeNull();
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  expect(moved, `player must be able to move in an FP room (moved ${moved.toFixed(1)})`).toBeGreaterThan(5);

  // 3. furniture is solid: drop a crate right in front and assert blocking
  const blocked = await page.evaluate(() => {
    const st = (window as any).__activeRenderer?.() as any;
    if (!st) return null;
    st.clutter = [{ x: st.playerX + 22, y: st.playerY - 10, w: 60, h: 20, color: '#000', label: 'Crate' }];
    return { px: st.playerX, py: st.playerY };
  });
  if (blocked) {
    const startX = blocked.px;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    const endX = await page.evaluate(() => ((window as any).__activeRenderer?.() as any).playerX);
    console.log('[fp] crate-block test: x', startX, '->', endX);
    expect(endX - startX, 'player should not walk through furniture').toBeLessThan(30);
  }

  // 1. no page errors across the whole run
  const real = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e));
  expect(real, `page errors: ${real.join(' | ')}`).toHaveLength(0);
});
