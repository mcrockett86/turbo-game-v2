import { test } from '@playwright/test';
import { startGame, holdKey } from './helpers';

test('59: two identical scenarios in one file', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  // scenario 1
  await page.evaluate((z) => (window as any).__turbo.navigateToZone(z), 'suburban_streets');
  await page.waitForTimeout(600);
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  const r1 = await page.evaluate(() => { const x = (window as any).__activeRenderer(); return x ? { px: x.playerX, py: x.playerY } : null; });
  console.log('S1', JSON.stringify(r1));
  // scenario 2
  await page.evaluate((z) => (window as any).__turbo.navigateToZone(z), 'suburban_streets');
  await page.waitForTimeout(600);
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  const r2 = await page.evaluate(() => { const x = (window as any).__activeRenderer(); return x ? { px: x.playerX, py: x.playerY } : null; });
  console.log('S2', JSON.stringify(r2));
});
