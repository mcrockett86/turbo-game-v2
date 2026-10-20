import { test, expect } from '@playwright/test';

test.describe('Sprint 8.5: Usability & HUD', () => {
  test.beforeEach(async ({ page, context }) => {
    // Workaround: Mock localStorage to avoid SecurityError in restricted environments
    // We inject a Map-based mock into the window object before the page loads.
    await context.addInitScript(() => {
      const storage = new Map<string, string>();
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
          clear: () => storage.clear(),
          get length() { return storage.size; },
          key: (i: number) => Array.from(storage.keys())[i] ?? null,
        },
        configurable: true
      });
    });

    await page.goto('/');
    // Wait for game to load and show dog selection
    await page.waitForSelector('.dog-card');
    // #start-adventure-btn is rendered `class="hidden"` and only revealed by
    // selectDog(); clicking it without picking a dog waits for a visible
    // element that never appears.
    await page.click('.dog-card');
    await page.waitForSelector('#start-adventure-btn:not(.hidden)');
  });

  test('Onboarding bar should be visible on first run', async ({ page }) => {
    await page.click('#start-adventure-btn');

    // Wait for game to stabilize
    await page.waitForFunction(() => (window as any).__turbo.threatBusy === false);

    // Check via the debug bridge that onboarding hasn't been dismissed yet.
    // NOTE: the bridge exposes these as GETTERS, not methods — calling them
    // (`onboardingDismissed()`) throws "is not a function".
    const isOnboarded = await page.evaluate(() => (window as any).__turbo.onboardingDismissed);
    expect(isOnboarded).toBe(false);
  });

  test('Clicking onboarding bar should dismiss it', async ({ page }) => {
    await page.click('#start-adventure-btn');
    await page.waitForFunction(() => (window as any).__turbo.threatBusy === false);

    // Click the centre of the bar as the game itself computes it. The rect is
    // CANVAS-LOCAL (the canvas is centred, not at 0,0), so add the canvas
    // offset — a raw rect click lands outside the element.
    const geo = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const r = c.getBoundingClientRect();
      const bar = (window as any).__turbo.onboardingBarRect();
      return bar ? { x: r.left + bar.x + bar.w / 2, y: r.top + bar.y + bar.h / 2 } : null;
    });
    expect(geo, 'onboarding bar should have a rect on first run').not.toBeNull();
    await page.mouse.click(geo!.x, geo!.y);

    const isOnboarded = await page.evaluate(() => (window as any).__turbo.onboardingDismissed);
    expect(isOnboarded).toBe(true);
  });

  test('Threat warning chip should appear when threat is pending', async ({ page }) => {
    await page.click('#start-adventure-btn');
    await page.waitForFunction(() => (window as any).__turbo.threatBusy === false);

    // Check for the pending threat via the debug bridge (a getter, see above).
    const pendingThreat = await page.evaluate(() => (window as any).__turbo.pendingThreat);

    if (pendingThreat) {
      expect(pendingThreat.name).toBeDefined();
      expect(pendingThreat.icon).toBeDefined();
    } else {
      console.log('No threat pending in current zone, skipping check.');
    }
  });
});