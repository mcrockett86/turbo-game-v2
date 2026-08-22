// Shared helpers for Turbo v2 E2E tests (uses the __turbo debug bridge).
import type { Page, Browser } from '@playwright/test';

declare global {
  interface Window {
    __turbo: {
      currentZoneId: string | null;
      happiness: number;
      threatPhase: string;
      threatBusy: boolean;
      endgameVisible: boolean;
      companionPanelVisible: boolean;
      hintPanelVisible: boolean;
      inventoryVisible: boolean;
      companionsMet: string[];
      itemsCollected: number;
      threatsResolved: number;
      navigateToZone(zoneId: string): void;
      navigateToRoom(roomId: string): void;
      forceEndgame(result: 'victory' | 'defeat'): void;
      map: Array<{ id: string; explored: boolean; current: boolean; elements: number; rooms: string[] }>;
    };
  }
}

/** Start the game: wait for load, select first dog, click Start. */
async function startGame(page: Page): Promise<void> {
  // Wait for dog grid to populate
  await page.locator('.dog-card').first().waitFor({ state: 'visible', timeout: 15_000 });
  // Select first dog
  await page.locator('.dog-card').first().click();
  // Click Start
  const startBtn = page.locator('#start-adventure-btn');
  await startBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await startBtn.click();
  // Wait for canvas to be active
  await page.waitForTimeout(1000);
}

/** Read current zone ID from the debug bridge. */
async function zone(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__turbo.currentZoneId);
}

/** Navigate to a zone via the debug bridge (test-only shortcut). */
async function goToZone(page: Page, zoneId: string): Promise<void> {
  await page.evaluate((z) => window.__turbo.navigateToZone(z), zoneId);
  await page.waitForTimeout(600);
}

/** Read happiness. */
async function happiness(page: Page): Promise<number> {
  return page.evaluate(() => window.__turbo.happiness);
}

/** Hold a movement key for a duration. */
async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Click canvas center (for timing-bar tap). */
async function tapCenter(page: Page): Promise<void> {
  const box = await page.locator('#game-canvas').boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
}

/** Click a specific fraction of the canvas. */
async function clickFrac(page: Page, fx: number, fy: number): Promise<void> {
  const box = await page.locator('#game-canvas').boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
}

/** Wait for endgame to become visible. */
async function waitForEndgame(page: Page, timeoutMs = 15_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => window.__turbo.endgameVisible,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

/** Collect console errors from the page. */
async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

export {
  startGame,
  zone,
  goToZone,
  happiness,
  holdKey,
  tapCenter,
  clickFrac,
  waitForEndgame,
  collectConsoleErrors,
};
