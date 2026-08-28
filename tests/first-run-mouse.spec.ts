/**
 * tests/first-run-mouse.spec.ts
 *
 * Sprint 8.5 — onboarding, mouse parity, threat-ahead chip.
 *
 * - Onboarding bar appears on first run, dismisses on click OR [O],
 *   and the dismissal persists across reloads (localStorage).
 * - Comfort minigame (storm) resolves by HOLDING THE MOUSE, no keyboard.
 * - Sneak minigame (vacuum) succeeds while the mouse stays still.
 * - The HUD "threat ahead" chip shows the shelter's door threat before
 *   resolution and disappears after.
 */
import { test, expect, Page } from '@playwright/test';
import { startGame, goToZone } from './helpers';

async function threatPhase(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__turbo.threatPhase);
}

async function waitActive(page: Page, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await threatPhase(page)) === 'active') return;
    await page.waitForTimeout(100);
  }
  throw new Error(`threat did not reach active phase (last: ${await threatPhase(page)})`);
}

async function startThreat(page: Page, id: string): Promise<void> {
  await page.evaluate((tid) => {
    const tm = (window as any).__turbo.threatManager;
    const t = (window as any).__turboThreats[tid];
    if (!t) throw new Error(`no threat ${tid}`);
    tm.start(t);
  }, id);
}

test.describe('Sprint 8.5 — first run, mouse, threat chip', () => {

  test('onboarding bar shows on first run and dismisses on click', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    expect(await page.evaluate(() => (window as any).__turbo.onboardingDismissed)).toBe(false);

    const bar = await page.evaluate(() => (window as any).__turbo.onboardingBarRect());
    expect(bar).not.toBeNull();

    const box = await page.locator('#game-canvas').boundingBox();
    await page.mouse.click(box!.x + bar!.x + bar!.w / 2, box!.y + bar!.y + bar!.h / 2);
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => (window as any).__turbo.onboardingDismissed)).toBe(true);
  });

  test('dismissal persists across a reload', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await page.evaluate(() => (window as any).__turbo.dismissOnboarding());
    expect(await page.evaluate(() => (window as any).__turbo.onboardingDismissed)).toBe(true);

    await page.reload();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__turbo.onboardingDismissed)).toBe(true);
  });

  test('[O] dismisses the onboarding bar', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    expect(await page.evaluate(() => (window as any).__turbo.onboardingDismissed)).toBe(false);

    await page.keyboard.press('o');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as any).__turbo.onboardingDismissed)).toBe(true);
  });

  test('comfort minigame resolves by holding the mouse (no keyboard)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await startThreat(page, 'storm'); // comfort: hold ~4s at 25%/s
    await waitActive(page);

    const box = await page.locator('#game-canvas').boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(4500);
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(await threatPhase(page)).toBe('idle');
    expect(await page.evaluate(() => (window as any).__turbo.threatsResolved)).toBe(1);
  });

  test('sneak minigame succeeds while the mouse stays still', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await startThreat(page, 'vacuum'); // sneak: 3.0s at zero detection
    await waitActive(page);

    // No mouse movement at all — pure stillness should carry it home.
    await page.waitForTimeout(3600);
    await page.waitForTimeout(400);

    expect(await threatPhase(page)).toBe('idle');
    expect(await page.evaluate(() => (window as any).__turbo.threatsResolved)).toBe(1);
  });

  test('threat-ahead chip shows the shelter threat, then clears', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await goToZone(page, 'shelter');
    const pending = await page.evaluate(() => (window as any).__turbo.pendingThreat);
    expect(pending).not.toBeNull();
    expect(pending.id).toBe('vacuum'); // shelter's zone threat (sneak)

    // The zone's sneak threat auto-triggers on entry — hold still to outlast it
    await waitActive(page, 10000);
    await page.waitForTimeout(3600);
    await page.waitForTimeout(400);

    // Resolutions are recorded by threat name (ThreatManager contract)
    expect(await page.evaluate(() => (window as any).__turbo.resolvedThreatIds)).toContain('Vacuum Monster');
    expect(await page.evaluate(() => (window as any).__turbo.pendingThreat)).toBeNull();
  });
});
