import { test, expect, Page } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Sprint 8.3 — companion reactions to threat outcomes (E2E).
 *
 * Plan DoD: "resolve a threat with an active companion, assert a companion
 * line appears; resolve with none, assert no crash."
 *
 * We drive the threat directly through the ThreatManager bridge
 * (start + finish) so the outcome is deterministic, then assert the dialogue
 * overlay carries the companion's line. The line itself is seeded by
 * threat id (unit-tested in tests/unit/companion-reactions.test.ts), so here
 * we assert presence, speaker identity, and non-crash.
 */

function resolveThreat(page: Page, companionId: string | null, success: boolean): Promise<void> {
  return page.evaluate(
    ({ companionId, success }) => {
      const w = window as any;
      if (companionId) w.__turbo.activateCompanion(companionId);
      const threat = w.__turboThreats.traffic;
      w.__turbo.threatManager.start(threat);
      w.__turbo.threatManager.finish(success);
    },
    { companionId, success },
  );
}

test.describe('Sprint 8.3 — companion reactions', () => {
  test('active companion voices the outcome', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await startGame(page);

    await resolveThreat(page, 'stray_buddy', true);
    // finish() delays the resolve callback ~600ms so the outcome pill shows
    await page.waitForTimeout(1000);

    const overlay = await page.evaluate(() => (window as any).__turbo.dialogueOverlayState);
    expect(overlay, 'dialogue overlay should be active').toBeTruthy();
    expect(overlay!.name).toBe('Buddy');
    expect(typeof overlay!.line).toBe('string');
    expect(overlay!.line.length).toBeGreaterThan(0);

    expect(pageErrors).toEqual([]);
  });

  test('no active companion — threat still resolves, no crash, no companion line', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await startGame(page);

    // Sprint 8.4: the first zone visit speaks a zone-intro line — capture it
    // so we can assert the threat did NOT add a companion reaction on top.
    const before = await page.evaluate(() => (window as any).__turbo.dialogueOverlayState);

    await resolveThreat(page, null, false);
    await page.waitForTimeout(1000);

    const after = await page.evaluate(() => (window as any).__turbo.dialogueOverlayState);
    if (before && after) {
      // same line/speaker as the pre-threat overlay → no companion spoke
      expect(after.line).toBe(before.line);
      expect(after.name).toBe(before.name);
    } else {
      expect(after).toBeFalsy();
    }
    const phase = await page.evaluate(() => (window as any).__turbo.threatPhase);
    expect(phase).toBe('idle');
    expect(pageErrors).toEqual([]);
  });

  test('companion reacts to a failed outcome too', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await resolveThreat(page, 'stray_buddy', false);
    await page.waitForTimeout(1000);

    const overlay = await page.evaluate(() => (window as any).__turbo.dialogueOverlayState);
    expect(overlay, 'dialogue overlay should be active').toBeTruthy();
    expect(overlay!.name).toBe('Buddy');
    expect(overlay!.line.length).toBeGreaterThan(0);
  });
});
