/**
 * tests/stability.spec.ts — long-session stability (Sprint 6 item 4)
 *
 * Verifies the game holds up across zone swaps + threat cycles:
 *  - window event-listener count stays bounded (no per-zone/per-threat leak)
 *  - audio live-voice list stays bounded (music scheduler GC works)
 *  - happiness decay is smooth (neither frozen nor spiraling)
 *  - no unhandled exceptions across the whole run
 *
 * Note on the threat economy: a failed threat is −15 happiness, and every
 * zone re-entry re-triggers that zone's entry threat. So the nav phase is
 * deliberately small (a handful of swaps) — it's testing renderer
 * init/dispose, not the threat system. The threat phase drives a fixed number
 * of cycles and measures the audio-voice bound. A full playthrough to
 * game-over is a gameplay outcome, not a stability defect, so it's out of
 * scope here.
 */

import { test, expect } from '@playwright/test';

const NAV_COUNT = 8;      // renderer init/dispose churn
const THREAT_CYCLES = 20; // threat start/resolve churn

// Cancel any in-flight threat and wait out the 600ms resolve settle delay so
// the next action starts from a clean 'idle' state.
async function drainThreat(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => { const t = (window as any).__turboThreat; if (t?.isBusy) t.cancel(); });
  await page.waitForTimeout(750);
}

// Navigate to a zone, retrying until the manager isn't busy. A navigation is
// skipped while a threat is active, so we cancel + wait + retry to guarantee
// the swap actually applies (and no threat is left lingering).
async function nav(page: import('@playwright/test').Page, zoneId: string): Promise<boolean> {
  for (let a = 0; a < 6; a++) {
    await page.evaluate(() => { const t = (window as any).__turboThreat; if (t?.isBusy) t.cancel(); });
    const ok = await page.evaluate((z) => (window as any).__turboNav(z), zoneId);
    if (ok) return true;
    await page.waitForTimeout(350); // resolve settle delay
  }
  return false;
}

test('stability: bounded listeners, bounded audio voices, smooth decay, no exceptions', async ({ page }) => {
  test.setTimeout(180_000); // soak test — longer than the 30s default

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Instrument window listener counting BEFORE the app loads.
  await page.addInitScript(() => {
    const w = window as any;
    const origAdd = w.addEventListener.bind(w);
    const origRemove = w.removeEventListener.bind(w);
    let net = 0;
    w.__listenerCount = { current: 0 };
    w.addEventListener = function (type: string, fn: any, opts?: any) {
      net += 1;
      w.__listenerCount.current = net;
      return origAdd(type, fn, opts);
    };
    w.removeEventListener = function (type: string, fn: any, opts?: any) {
      net -= 1;
      w.__listenerCount.current = Math.max(0, net);
      return origRemove(type, fn, opts);
    };
  });

  await page.goto('/turbo-web/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#dog-grid .dog-card', { timeout: 10_000 });
  await page.click('#dog-grid .dog-card');
  await page.click('#start-adventure-btn');
  await page.waitForTimeout(1200);
  await drainThreat(page);

  const baseline = await page.evaluate(() => (window as any).__listenerCount.current);
  expect(baseline, 'listener counter should be armed').toBeGreaterThan(0);

  const zoneIds: string[] = await page.evaluate(() => (window as any).__turboZoneIds);
  const pairs: { zone: string; threat: string }[] = await page.evaluate(
    () => (window as any).__turboThreatPairs
  );
  expect(pairs.length, 'expected at least one zone with an entry threat').toBeGreaterThan(0);

  // --- Phase 1: zone-swap churn → bounded listeners ---
  const beforeNav = await page.evaluate(() => (window as any).__listenerCount.current);
  for (let i = 0; i < NAV_COUNT; i++) {
    await drainThreat(page);
    const id = zoneIds[i % zoneIds.length];
    await nav(page, id);
    await page.waitForTimeout(800); // let the 600ms entry-threat window resolve
  }
  await drainThreat(page);

  const afterNav = await page.evaluate(() => (window as any).__listenerCount.current);
  const listenerDrift = afterNav - beforeNav;
  expect(listenerDrift, `listener count grew by ${listenerDrift} over ${NAV_COUNT} swaps`).toBeLessThan(8);

  // --- Phase 2: idle soak → smooth happiness decay (before threats floor it) ---
  const readState = () => page.evaluate(() => ({
    h: (window as any).__turboStateHappiness?.() ?? -1,
    frames: (window as any).__turboPerf?.report?.().totalFrames ?? -1,
    busy: (window as any).__turboThreat?.isBusy ?? null,
  }));
  const s1 = await readState();
  await page.waitForTimeout(5000);
  const s2 = await readState();
  console.log('[stability] soak:', JSON.stringify({ s1, s2, framesDelta: s2.frames - s1.frames }));
  if (s1.h > 0 && s2.h > 0) {
    const delta = s1.h - s2.h;
    // DECAY_PER_SECOND = 0.5 → ~2.5 over 5s (± companion bonus). Not 0, not >20.
    expect(delta, `happiness decayed by ${delta} in 5s (before=${s1.h}, frames=${s1.frames}->${s2.frames}, busy=${s1.busy})`).toBeGreaterThan(0);
    expect(delta, `happiness decayed by ${delta} in 5s (too fast)`).toBeLessThan(20);
  }

  // --- Phase 3: threat cycles → bounded audio voices ---
  const voicesBefore = await page.evaluate(() => (window as any).__turboAudio?.liveVoiceCount ?? -1);
  let peakVoices = voicesBefore;
  for (let i = 0; i < THREAT_CYCLES; i++) {
    await drainThreat(page);
    const pair = pairs[i % pairs.length];
    await page.evaluate(({ threat }) => {
      const mgr = (window as any).__turboThreat;
      const obj = (window as any).__turboThreats?.[threat];
      if (mgr && obj && !mgr.isBusy) mgr.start(obj);
    }, pair);
    await page.waitForTimeout(1600); // intro (1.5s) + settle
    // Track the peak voice count across the run (GC keeps it bounded).
    const v = await page.evaluate(() => (window as any).__turboAudio?.liveVoiceCount ?? 0);
    peakVoices = Math.max(peakVoices, v);
  }
  await drainThreat(page);
  const voicesAfter = await page.evaluate(() => (window as any).__turboAudio?.liveVoiceCount ?? -1);

  // Audio GC caps liveVoices at ~400; after 20 cycles + navs we must be well
  // under unbounded. Allow headroom but assert it's not exploding.
  expect(peakVoices, `peak audio live voices hit ${peakVoices} (expected < 600; -1 means audio never initialised)`).toBeLessThan(600);
  expect(voicesAfter, `audio live voices after cycles = ${voicesAfter}`).toBeLessThan(600);
  // The music bed must actually be producing voices (otherwise the bound is
  // vacuous). At minimum the scheduler should have created some during the run.
  if (peakVoices >= 0) {
    expect(peakVoices, 'audio created no voices at all — music scheduler may be dead').toBeGreaterThan(0);
  }

  // --- Phase 4: no unhandled exceptions ---
  const realErrors = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e));
  expect(realErrors, `unhandled errors: ${realErrors.join(' | ')}`).toHaveLength(0);

  // --- Phase 5: final listener count still bounded ---
  const finalListeners = await page.evaluate(() => (window as any).__listenerCount.current);
  expect(finalListeners - baseline, `total listener drift ${finalListeners - baseline}`).toBeLessThan(15);
});
