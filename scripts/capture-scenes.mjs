/**
 * scripts/capture-scenes.mjs — before/after scene capture for README docs
 *
 * Usage: node scripts/capture-scenes.mjs <baseUrl> <outPrefix>
 *
 * Captures four canonical scenes (dog select, TP zone, FP room, threat
 * minigame) at 1280x720. Works against both the pre-Sprint 7 tree
 * (individual __turboX globals) and the current tree (unified __turbo object).
 */
import { chromium } from 'playwright';

const [, , baseUrl, prefix] = process.argv;
if (!baseUrl || !prefix) {
  console.error('usage: capture-scenes.mjs <baseUrl> <outPrefix>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(baseUrl, { waitUntil: 'networkidle' });

// 1 — dog select screen
await page.locator('.dog-card').first().waitFor({ state: 'visible', timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${prefix}-dog-select.png` });

// Select first dog + start
await page.locator('.dog-card').first().click();
await page.locator('#start-adventure-btn').waitFor({ state: 'visible', timeout: 5000 });
await page.locator('#start-adventure-btn').click();
await page.waitForTimeout(2000);

// 2 — TP zone (start zone)
await page.screenshot({ path: `${prefix}-tp-zone.png` });

// 3 — FP room (apartment entrance)
await page.evaluate(() => {
  const w = window;
  if (w.__turbo?.navigateToZone) w.__turbo.navigateToZone('apartment');
  else w.__turboNav('apartment');
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-fp-room.png` });

// 4 — threat minigame (traffic, timing type)
await page.evaluate(() => {
  const w = window;
  const tm = w.__turbo?.threatManager ?? w.__turboThreat;
  tm.start(w.__turboThreats['traffic']);
});
await page.waitForFunction(() => {
  const w = window;
  const tm = w.__turbo?.threatManager ?? w.__turboThreat;
  return tm?.phase === 'active';
}, null, { timeout: 10000 }).catch(() => console.warn('phase never hit active; capturing anyway'));
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}-threat.png` });

await browser.close();
console.log(`captured 4 scenes -> ${prefix}-*.png`);
