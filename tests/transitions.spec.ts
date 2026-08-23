import { test, expect } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Transition variety (Sprint 4 remaining #3).
 *
 * Verifies:
 *  - fade, wipe, zoom, slide transitions all activate correctly
 *  - zones are assigned varied transition kinds (not all the same)
 *  - the transition midpoint callback fires (zone actually swaps)
 *  - cancel() clears an in-progress transition
 */

test.describe('Transition Variety', () => {

  test('zones use a variety of transition kinds', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const kinds = await page.evaluate(() => {
      const zones: Record<string, any> = (window as any).__turbo.ZONES;
      const result: Record<string, string> = {};
      for (const [id, z] of Object.entries(zones)) {
        result[id] = z.transition ?? 'fade';
      }
      return result;
    });

    const uniqueKinds = new Set(Object.values(kinds));
    // At least 3 different kinds should be in use
    expect(uniqueKinds.size).toBeGreaterThanOrEqual(3);
    // All assigned kinds should be valid
    const validKinds = new Set(['fade', 'wipe', 'zoom', 'slide']);
    for (const k of uniqueKinds) {
      expect(validKinds.has(k)).toBe(true);
    }
  });

  test('each transition kind activates and completes', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    for (const kind of ['fade', 'wipe', 'zoom', 'slide'] as const) {
      const result = await page.evaluate((k) => {
        return new Promise<string>((resolve) => {
          const t = (window as any).__turbo.transitions;
          let midpointFired = false;
          t.play(k as any, () => { midpointFired = true; }, 200);
          // Wait for the transition to complete (2 phases × 200ms + buffer)
          setTimeout(() => {
            resolve(midpointFired ? 'ok' : 'midpoint-missing');
          }, 600);
        });
      }, kind);

      expect(result, `transition '${kind}' should fire midpoint callback`).toBe('ok');

      // After completion, transition should be inactive
      const active = await page.evaluate(() => (window as any).__turbo.transitions.active);
      expect(active, `transition '${kind}' should be inactive after completion`).toBe(false);
    }
  });

  test('cancel clears an in-progress transition', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const result = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const t = (window as any).__turbo.transitions;
        t.play('wipe', null, 5000); // long duration so we can cancel mid-way
        setTimeout(() => {
          const wasActive = t.active;
          t.cancel();
          const afterCancel = t.active;
          resolve(wasActive && !afterCancel ? 'ok' : 'fail');
        }, 100);
      });
    });

    expect(result).toBe('ok');
  });

  test('zone navigation triggers the zone-specific transition', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    // Navigate to dog_park (slide transition) and verify it was the active kind
    const result = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const t = (window as any).__turbo;
        const trans = t.transitions;

        // Start navigating to dog_park
        t.navigateToZone('dog_park');

        // Check the transition kind shortly after starting
        setTimeout(() => {
          const kind = trans.currentKind;
          resolve(kind ?? 'none');
        }, 50);
      });
    });

    // dog_park is assigned 'slide'
    expect(result).toBe('slide');
  });

  test('home zone uses zoom transition', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const result = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const t = (window as any).__turbo;
        const trans = t.transitions;

        t.navigateToZone('home');

        setTimeout(() => {
          const kind = trans.currentKind;
          resolve(kind ?? 'none');
        }, 50);
      });
    });

    expect(result).toBe('zoom');
  });

  test('apartment zone uses wipe transition', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const result = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const t = (window as any).__turbo;
        const trans = t.transitions;

        t.navigateToZone('apartment');

        setTimeout(() => {
          const kind = trans.currentKind;
          resolve(kind ?? 'none');
        }, 50);
      });
    });

    expect(result).toBe('wipe');
  });

});
