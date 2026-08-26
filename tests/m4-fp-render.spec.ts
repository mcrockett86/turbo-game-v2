import { test, expect } from '@playwright/test';
import { startGame, goToZone } from './helpers';

/**
 * M4 (7.3 sprites + 7.4 room dressing) render sanity: every FP room renders
 * content (checkerboard floor + sprite features) without page errors.
 */
test('all FP rooms render without error after M4', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await startGame(page);

  // FP zones are rooms; navigate through a representative set.
  const fpZones = ['apartment', 'neighborhood', 'garden', 'cave', 'library'];
  const known = await page.evaluate(() => (window as any).__turboZoneIds);
  const targets = fpZones.filter((z) => known.includes(z));
  expect(targets.length).toBeGreaterThan(0);

  for (const id of targets) {
    await goToZone(page, id);
    const nonEmpty = await page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const img = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < img.length; i += 16) if (img[i] > 0 || img[i + 1] > 0 || img[i + 2] > 0) n++;
      return n > 50;
    });
    expect(nonEmpty, `FP room ${id} should render content`).toBe(true);
  }

  expect(errors.filter((e) => !/favicon|404/i.test(e)), 'no page errors while rendering FP rooms').toEqual([]);
});
