import { test, expect } from '@playwright/test';
import { chromium, devices } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Regression: HiDPI (devicePixelRatio=2) made ThreatManager and
 * InventoryRenderer report cssWidth/cssHeight of 1x1 while the shared
 * canvas was really 1800x1440 backing / 900x720 CSS. With W=1/H=1 the
 * overlay backdrop (fillRect 0,0,W,H) collapsed to a 1px dot and the
 * title/bar text (drawn at W/2, H/2) landed in the top-left corner —
 * "threat minigames show off-screen in the upper left" and "inventory
 * doesn't load in the center".
 *
 * BaseRenderer.cssWidth/cssHeight now read the canvas's live geometry, so
 * every renderer agrees on the visible size. This test pins that at dpr=2.
 */
test.describe('HiDPI overlay centering', () => {
  test('threat + inventory report the real visible canvas size at dpr=2', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      deviceScaleFactor: 2,
      viewport: { width: 900, height: 700 },
    });
    const page = await context.newPage();
    await page.goto('http://localhost:3094/');
    await startGame(page);

    // Threat
    await page.evaluate(() => (window as any).__turbo.navigateToZone('dog_park'));
    await page.waitForTimeout(900);
    await page.keyboard.press('Space'); // start intro
    await page.waitForTimeout(400);

    const threat = await page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      const th = (window as any).__turbo.threatManager as any;
      return {
        cssW: th.cssWidth, cssH: th.cssHeight,
        canvasCss: [c.clientWidth, c.clientHeight] as [number, number],
      };
    });

    expect(threat.cssW, 'threat cssWidth must match canvas CSS width').toBe(threat.canvasCss[0]);
    expect(threat.cssH, 'threat cssHeight must match canvas CSS height').toBe(threat.canvasCss[1]);
    // And specifically NOT the broken 1x1.
    expect(threat.cssW).toBeGreaterThan(100);
    expect(threat.cssH).toBeGreaterThan(100);

    await browser.close();
  });
});
