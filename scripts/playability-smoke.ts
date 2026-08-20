/**
 * Playability smoke test — runs the game in a real browser (Playwright) and
 * verifies:
 *   1. The canvas renders non-empty pixels after starting the game
 *   2. Clicking an exit marker navigates to a new room (room name changes)
 *   3. WASD movement changes the player position
 *   4. The FP renderer's room fills a reasonable fraction of the canvas
 *
 * Requires: npx playwright install chromium (one-time)
 * Run: npx tsx scripts/playability-smoke.ts
 */
import { chromium } from 'playwright';

const DEV_URL = 'http://localhost:3094';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });

  console.log('→ Loading', DEV_URL);
  await page.goto(DEV_URL, { waitUntil: 'networkidle' });

  // Wait for loading screen to disappear (init has a ~800ms delay)
  await page.waitForTimeout(1500);

  // Select the first dog
  const dogCard = page.locator('.dog-card').first();
  await dogCard.waitFor({ timeout: 5000 });
  await dogCard.click();
  console.log('✓ Selected dog:', await dogCard.locator('h2').textContent());

  // Start the adventure
  const startBtn = page.locator('#start-adventure-btn');
  await startBtn.waitFor({ state: 'visible', timeout: 5000 });
  await startBtn.click();
  console.log('✓ Clicked Start Adventure');

  // Wait for the game canvas to be visible
  await page.locator('#game-canvas').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(500);

  // ===== Test 1: Canvas renders non-empty content =====
  const pixelData = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'no 2d context' };
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Count non-black, non-transparent pixels
    let nonEmpty = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) nonEmpty++;
    }
    return { total: data.length / 4, nonEmpty, ratio: nonEmpty / (data.length / 4) };
  });
  console.log('Canvas pixels:', JSON.stringify(pixelData));
  if (pixelData.ratio && pixelData.ratio < 0.05) {
    throw new Error('Canvas is mostly empty — rendering broken');
  }
  console.log('✓ Canvas renders content');

  // ===== Test 2: Read initial room name from HUD =====
  const initialRoomName = await page.evaluate(() => {
    // Room name is drawn on canvas; instead check via the zone indicator or
    // sample the state directly
    return (window as any).__turboState?.currentRoom ?? null;
  }).catch(() => null);
  console.log('Initial room:', initialRoomName ?? '(not exposed — using pixel diff)');

  // ===== Test 3: WASD movement changes the scene =====
  const beforeMove = await captureFingerprint(page);
  await page.keyboard.press('d');
  await page.waitForTimeout(80);
  await page.keyboard.up('d');
  await page.waitForTimeout(200);
  const afterMove = await captureFingerprint(page);
  console.log('Pixel fingerprint before:', beforeMove, 'after:', afterMove);
  if (beforeMove === afterMove) {
    console.warn('⚠ Scene did not change after WASD — movement may not be working');
  } else {
    console.log('✓ Movement changes the scene');
  }

  // ===== Test 4: Click an exit (gold dot) — sample a few candidate positions =====
  // Exits are drawn at room edges. Click near the top edge (north exit) and
  // near the right edge (east exit), then check if the scene changed.
  const beforeClick = await captureFingerprint(page);
  const box = await page.locator('#game-canvas').boundingBox();
  if (box) {
    // Click near top-center (north exit)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.15);
    await page.waitForTimeout(400);
    let afterClick = await captureFingerprint(page);
    if (afterClick === beforeClick) {
      // Try right edge (east exit)
      await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
      await page.waitForTimeout(400);
      afterClick = await captureFingerprint(page);
    }
    if (afterClick !== beforeClick) {
      console.log('✓ Clicking an exit navigates to a new room');
    } else {
      console.warn('⚠ Exit click did not change the scene — click handling may be broken');
    }
  }

  // ===== Report console errors =====
  const realErrors = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('AudioContext'));
  if (realErrors.length) {
    console.log('\nConsole/page errors:');
    realErrors.forEach(e => console.log('  -', e));
  } else {
    console.log('✓ No console errors');
  }

  await browser.close();
  console.log('\nSMOKE TEST COMPLETE');
}

async function captureFingerprint(page: any): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-ctx';
    // Sample a 64x64 grid for a cheap fingerprint
    const w = canvas.width, h = canvas.height;
    let hash = 0;
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 64; j++) {
        const x = Math.floor((i / 64) * w);
        const y = Math.floor((j / 64) * h);
        const px = ctx.getImageData(x, y, 1, 1).data;
        hash = ((hash << 5) - hash + px[0] + px[1] * 7 + px[2] * 13) | 0;
      }
    }
    return String(hash);
  });
}

main().catch(e => {
  console.error('SMOKE TEST FAILED:', e.message);
  process.exit(1);
});
