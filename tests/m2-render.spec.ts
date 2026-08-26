import { test, expect } from '@playwright/test';
import { startGame } from './helpers';

/**
 * M2 (7.1 backgrounds + 7.6 obstacle detail) render sanity:
 * every TP zone must render a frame without throwing, and the canvas must
 * actually contain non-empty content (background + obstacles + dog).
 */
test('all TP zones render without error after M2', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await startGame(page);

  const tpZones = await page.evaluate(() => {
    const Z = (window as any).__turbo.ZONES;
    return Object.values(Z).filter((z: any) => z.type === 'tp').map((z: any) => z.id);
  });
  expect(tpZones.length).toBeGreaterThan(3);

  for (const id of tpZones) {
    await page.evaluate((z) => window.__turbo.navigateToZone(z), id);
    await page.waitForTimeout(250);
    // Confirm the canvas has real content (not blank).
    const nonEmpty = await page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const img = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < img.length; i += 16) if (img[i] > 0 || img[i+1] > 0 || img[i+2] > 0) n++;
      return n > 50;
    });
    expect(nonEmpty, `zone ${id} should render content`).toBe(true);
  }

  expect(errors.filter((e) => !/favicon|404/i.test(e)), 'no page errors while rendering TP zones').toEqual([]);
});
