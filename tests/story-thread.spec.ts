import { test, expect, Page } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Sprint 8.4 — FP interaction & story thread (E2E).
 *
 * Plan DoD: "FP room: examine a feature, read a readable, collect an item
 * with storyNote, assert each surface renders; J opens journal with expected
 * entries." Plus zone-intro flavor + endgame recap.
 *
 * Features are driven through `__turbo.interactFeature(zoneId, feature)` —
 * the same handleFeature() the FP/TP renderers call — so this exercises the
 * real wiring deterministically, without pixel-hunting.
 */

declare global {
  interface Window {
    __turbo: Window['__turbo'] & {
      lastZoneIntro: { zoneId: string; flavor: string; speaker: string } | null;
      zonesVisited: string[];
      storyLog: Array<{ id: string; kind: string; refId: string; title: string; icon: string; detail?: string; order: number }>;
      storyPanelVisible: boolean;
      endgameRecap: string | null;
      interactFeature(zoneId: string, feature: unknown): void;
    };
  }
}

/** Find a feature in a zone (top-level or any room) via the bridge lookup. */
async function featureIn(page: Page, zoneId: string, field: string, value: unknown): Promise<any | null> {
  return page.evaluate(([zoneId, field, value]) => (window as any).__turbo.findFeature(zoneId, field, value), [zoneId, field, value]);
}

async function resolvePendingThreat(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tm = (window as any).__turbo.threatManager;
    if (tm.phase !== 'idle') tm.finish(false);
  });
  await page.waitForTimeout(800);
}

test.describe('Sprint 8.4 — zone intro + story thread', () => {
  test('first zone visit shows the flavor intro and logs the zone', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const intro = await page.evaluate(() => window.__turbo.lastZoneIntro);
    expect(intro, 'zone intro recorded').toBeTruthy();
    expect(intro!.flavor.length).toBeGreaterThan(0);
    expect(intro!.speaker.length).toBeGreaterThan(0);

    const visited = await page.evaluate(() => window.__turbo.zonesVisited);
    expect(visited).toContain(intro!.zoneId);

    const log = await page.evaluate(() => window.__turbo.storyLog);
    expect(log.some((e) => e.kind === 'zone' && e.refId === intro!.zoneId)).toBe(true);
  });

  test('re-visiting a zone does not re-introduce or duplicate it', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const startZone = (await page.evaluate(() => window.__turbo.lastZoneIntro))!.zoneId;
    await page.evaluate(() => window.__turbo.navigateToZone('dog_park'));
    await page.waitForTimeout(900);
    await resolvePendingThreat(page);

    // dog_park is a first visit — its intro supersedes the starter zone's
    const intro = await page.evaluate(() => window.__turbo.lastZoneIntro);
    expect(intro!.zoneId).toBe('dog_park');

    // Go back: no new intro, and the starter zone stays logged exactly once
    await page.evaluate((z) => window.__turbo.navigateToZone(z), startZone);
    await page.waitForTimeout(900);
    await resolvePendingThreat(page);

    const log = await page.evaluate(() => window.__turbo.storyLog);
    expect(log.filter((e) => e.kind === 'zone' && e.refId === startZone)).toHaveLength(1);
  });

  test('examine text renders for a non-item FP feature (apartment TV)', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await page.evaluate(() => window.__turbo.navigateToZone('apartment'));
    await page.waitForTimeout(900);
    await resolvePendingThreat(page);

    const tv = await featureIn(page, 'apartment', 'type', 'tv');
    expect(tv, 'tv feature exists').toBeTruthy();

    await page.evaluate((f) => window.__turbo.interactFeature('apartment', f), tv);
    await page.waitForTimeout(300);

    const overlay = await page.evaluate(() => (window as any).__turbo.dialogueOverlayState);
    expect(overlay, 'examine dialogue shown').toBeTruthy();
    expect(overlay!.line).toContain('paused mid-walk');
  });

  test('readable object opens the hint panel AND keeps its item pickup', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await page.evaluate(() => window.__turbo.navigateToZone('shelter'));
    await page.waitForTimeout(900);
    await resolvePendingThreat(page);

    const poster = await featureIn(page, 'shelter', 'item', 'map_fragment');
    expect(poster, 'readable poster exists').toBeTruthy();

    await page.evaluate((f) => window.__turbo.interactFeature('shelter', f), poster);
    await page.waitForTimeout(300);

    const hintVisible = await page.evaluate(() => window.__turbo.hintPanelVisible);
    expect(hintVisible, 'hint panel opened').toBe(true);

    const log = await page.evaluate(() => window.__turbo.storyLog);
    expect(log.some((e) => e.kind === 'hint'), 'hint entry logged').toBe(true);
    expect(log.some((e) => e.kind === 'item' && e.refId === 'map_fragment'), 'item still collected').toBe(true);
  });

  test('collecting a storyNote item shows the toast + journal entry', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const startZone = (await page.evaluate(() => window.__turbo.lastZoneIntro))!.zoneId;
    const stone = await featureIn(page, startZone, 'item', 'lake_stone');
    expect(stone, 'lake_stone feature exists').toBeTruthy();

    await page.evaluate(([zone, f]) => (window as any).__turbo.interactFeature(zone, f), [startZone, stone]);
    await page.waitForTimeout(300);

    const overlay = await page.evaluate(() => (window as any).__turbo.dialogueOverlayState);
    expect(overlay, 'story toast shown').toBeTruthy();
    expect(overlay!.line).toContain('taught me to fetch');

    const items = await page.evaluate(() => window.__turbo.itemsCollected);
    expect(items).toBeGreaterThanOrEqual(1);

    const log = await page.evaluate(() => window.__turbo.storyLog);
    expect(log.some((e) => e.kind === 'item' && e.refId === 'lake_stone')).toBe(true);
    expect(log.find((e) => e.kind === 'item' && e.refId === 'lake_stone')!.detail).toContain('fetch');
  });

  test('J opens the story journal with the expected entries; Escape closes', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const startZone = (await page.evaluate(() => window.__turbo.lastZoneIntro))!.zoneId;
    const pinecone = await featureIn(page, startZone, 'item', 'pinecone');
    const stone = await featureIn(page, startZone, 'item', 'lake_stone');
    expect(pinecone).toBeTruthy();
    expect(stone).toBeTruthy();

    await page.evaluate(([zone, f]) => (window as any).__turbo.interactFeature(zone, f), [startZone, pinecone]);
    await page.evaluate(([zone, f]) => (window as any).__turbo.interactFeature(zone, f), [startZone, stone]);
    await page.waitForTimeout(200);

    await page.keyboard.press('j');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__turbo.storyPanelVisible), 'journal visible').toBe(true);

    const log = await page.evaluate(() => window.__turbo.storyLog);
    expect(log.length).toBeGreaterThanOrEqual(3); // zone + 2 items
    expect(log.some((e) => e.kind === 'zone')).toBe(true);
    expect(log.some((e) => e.kind === 'item' && e.refId === 'pinecone')).toBe(true);
    expect(log.some((e) => e.kind === 'item' && e.refId === 'lake_stone')).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__turbo.storyPanelVisible)).toBe(false);
  });

  test('endgame victory shows the narrative recap', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const startZone = (await page.evaluate(() => window.__turbo.lastZoneIntro))!.zoneId;
    const pinecone = await featureIn(page, startZone, 'item', 'pinecone');
    if (pinecone) await page.evaluate(([zone, f]) => (window as any).__turbo.interactFeature(zone, f), [startZone, pinecone]);

    await page.evaluate(() => (window as any).__turbo.forceEndgame('victory'));
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => window.__turbo.endgameVisible), 'endgame visible').toBe(true);
    const recap = await page.evaluate(() => window.__turbo.endgameRecap);
    expect(recap, 'recap line present').toBeTruthy();
    expect(recap).toMatch(/You crossed \d+ place/);
    expect(recap).toContain('on the way home');
  });
});
