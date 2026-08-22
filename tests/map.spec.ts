import { test, expect } from '@playwright/test';
import { startGame, zone, goToZone } from './helpers';

/**
 * Map / Exploration tests.
 *
 * Validates that the top-right minimap (MapStore) fills in correctly as the
 * player explores:
 *   - starting zone is explored + current, with its elements recorded
 *   - discovering a zone marks it explored + current
 *   - unexplored zones and the HOME goal appear on the map
 *   - the hub zone is detected (3+ gate connections)
 *   - FP rooms visited are tracked
 *   - the map is a live snapshot (current zone updates as you travel)
 *
 * These use the __turbo.map debug bridge, which reflects the MapStore that
 * the on-screen MapPanel renders from.
 */

interface MapNode {
  id: string;
  explored: boolean;
  current: boolean;
  elements: number;
  rooms: string[];
}

async function getMap(page: import('@playwright/test').Page): Promise<MapNode[]> {
  return page.evaluate(() => window.__turbo.map);
}

function findNode(nodes: MapNode[], id: string): MapNode | undefined {
  return nodes.find((n) => n.id === id);
}

test.describe('Map: Exploration Fill-in', () => {
  test('starting zone is explored and current with elements recorded', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const nodes = await getMap(page);
    const start = findNode(nodes, 'suburban_streets');

    expect(start, 'starting zone should be on the map').toBeDefined();
    expect(start!.explored).toBe(true);
    expect(start!.current).toBe(true);
    // The hub has many discoverable elements (items, gates, etc.)
    expect(start!.elements).toBeGreaterThanOrEqual(5);
  });

  test('discovered + home zones are present before being explored', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const nodes = await getMap(page);
    // Home is always on the map as the goal (unexplored until reached)
    const home = findNode(nodes, 'home');
    expect(home, 'home should be on the map').toBeDefined();
    expect(home!.explored).toBe(false);

    // At least one adjacent zone should be discovered (unexplored) from the hub
    const unexplored = nodes.filter((n) => !n.explored);
    expect(unexplored.length).toBeGreaterThanOrEqual(1);
  });

  test('hub zone is detected as the one with the most gate connections', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const nodes = await getMap(page);
    const byElements = [...nodes].sort((a, b) => b.elements - a.elements);
    // The most-connected zone should be the hub (suburban_streets)
    expect(byElements[0].id).toBe('suburban_streets');
    expect(byElements[0].elements).toBeGreaterThanOrEqual(5);
  });

  test('traveling to a new zone marks it explored + current', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    expect(await zone(page)).toBe('suburban_streets');

    await goToZone(page, 'lake');
    expect(await zone(page)).toBe('lake');

    const nodes = await getMap(page);
    const lake = findNode(nodes, 'lake');
    const streets = findNode(nodes, 'suburban_streets');

    expect(lake, 'lake should be on the map').toBeDefined();
    expect(lake!.explored).toBe(true);
    expect(lake!.current).toBe(true);
    expect(streets!.current).toBe(false); // no longer current
    expect(streets!.explored).toBe(true); // still explored
  });

  test('FP zone rooms visited are tracked on the map', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await goToZone(page, 'shelter');
    await page.evaluate(() => window.__turbo.navigateToRoom('shelter_kennels'));
    await page.waitForTimeout(400);

    const nodes = await getMap(page);
    const shelter = findNode(nodes, 'shelter');
    expect(shelter, 'shelter should be on the map').toBeDefined();
    expect(shelter!.explored).toBe(true);
    expect(shelter!.rooms, 'visited rooms should be recorded').toContain('shelter_kennels');
  });

  test('map is a live snapshot that grows as you explore', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const before = await getMap(page);
    const exploredBefore = before.filter((n) => n.explored).length;

    await goToZone(page, 'forest');
    await goToZone(page, 'beach');
    const after = await getMap(page);
    const exploredAfter = after.filter((n) => n.explored).length;

    expect(exploredAfter).toBeGreaterThan(exploredBefore);

    // The most recent zone is current
    const beach = findNode(after, 'beach');
    expect(beach!.current).toBe(true);
    expect(beach!.explored).toBe(true);
  });

  test('elements are only recorded for zones actually entered', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    // A zone we have NOT entered should have no recorded elements
    const nodes = await getMap(page);
    const mountain = findNode(nodes, 'mountain');
    expect(mountain, 'mountain should be discovered on the map').toBeDefined();
    expect(mountain!.explored).toBe(false);
    expect(mountain!.elements, 'unexplored zone should have no elements').toBe(0);

    // Enter it -> now it has elements
    await goToZone(page, 'mountain');
    const after = await getMap(page);
    const mountainAfter = findNode(after, 'mountain');
    expect(mountainAfter!.explored).toBe(true);
    expect(mountainAfter!.elements, 'entered zone should have elements').toBeGreaterThanOrEqual(1);
  });

  test('revisiting a zone keeps it explored without losing its elements', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await goToZone(page, 'lake');
    const lake1 = findNode(await getMap(page), 'lake')!;
    const elements1 = lake1.elements;

    await goToZone(page, 'suburban_streets');
    await goToZone(page, 'lake'); // revisit
    const lake2 = findNode(await getMap(page), 'lake')!;

    expect(lake2.explored).toBe(true);
    expect(lake2.current).toBe(true);
    expect(lake2.elements, 'elements should persist on revisit').toBe(elements1);
  });
});

test.describe('Map: Rendering / Toggle', () => {
  test('map panel renders without throwing and toggles with [M]', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Toggle off
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(200);
    // Toggle on
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(200);

    // No page errors should have been thrown by the map rendering/toggle
    expect(errors, 'no page errors from map rendering/toggle').toEqual([]);
  });
});
