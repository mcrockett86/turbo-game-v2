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

// Clear any in-flight threat and wait out the 600ms resolve settle delay so
// the next action starts from a clean 'idle' state.
//
// Resolve it as a SUCCESS rather than a cancel: cancel() is a failure (-15
// happiness), and the nav phase re-triggers each zone's entry threat on every
// re-entry, so cancelling drains happiness to the floor mid-test. The soak
// phase below asserts idle decay, which needs happiness to still be moving —
// and a player at the floor has already lost. finish(true) is the same path a
// won minigame takes (+10, threat marked resolved).
async function drainThreat(page: import('@playwright/test').Page): Promise<void> {
  // Retry: a zone entry schedules its threat on a 600ms timer, so right after
  // a navigation isBusy can still be false with a start already pending. One
  // pass would drain nothing and leave the minigame grabbing input mid-soak.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.evaluate(() => {
      const t = (window as any).__turboThreat;
      if (!t?.isBusy) return;
      if (typeof t.finish === 'function') t.finish(true);
      else t.cancel();
    });
    await page.waitForTimeout(750); // 600ms resolve settle + slack
    // Re-read AFTER the wait: a pending entry-threat timer may have fired
    // during it, and only a settled idle manager means input is really free.
    const settled = await page.evaluate(() => !(window as any).__turboThreat?.isBusy);
    if (settled) return;
  }
}

// Navigate to a zone, retrying until the manager isn't busy. A navigation is
// skipped while a threat is active, so we cancel + wait + retry to guarantee
// the swap actually applies (and no threat is left lingering).
async function nav(page: import('@playwright/test').Page, zoneId: string): Promise<boolean> {
  for (let a = 0; a < 6; a++) {
    await drainThreat(page);
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

  // Instrument listener accounting BEFORE the app loads.
  //
  // This tracks LIVE REGISTRATIONS (by target+type+handler identity), not
  // add/remove call counts. The distinction matters: the browser keeps a
  // single registration per (target, type, fn, capture) tuple, so a component
  // that re-arms the same bound handler (e.g. the threat manager reusing
  // this.boundKeyDown across cycles) produces two add() calls and one
  // registration. Counting calls therefore "leaks" on perfectly correct code
  // and hides real leaks elsewhere. Identity tracking measures the thing the
  // assertion is actually about: memory that never goes away.
  await page.addInitScript(() => {
    const w = window as any;
    let ids = 0;
    const idFor = new WeakMap<Function, number>();
    const fnId = (f: any) => {
      if (typeof f !== 'function') return 'obj';
      let n = idFor.get(f);
      if (n === undefined) { n = ++ids; idFor.set(f, n); }
      return String(n);
    };
    const live = new Map<string, boolean>();
    const count = () => {
      let n = 0;
      for (const on of live.values()) if (on) n++;
      return n;
    };
    w.__listenerCount = { get current() { return count(); } };
    const proto = EventTarget.prototype;
    const origAdd = proto.addEventListener;
    const origRem = proto.removeEventListener;
    const key = (t: any, type: string, f: any) =>
      `${t === w ? 'W' : t === document ? 'D' : (t?.constructor?.name ?? 'O')}:${type}:${fnId(f)}`;
    proto.addEventListener = function (this: any, type: string, fn: any, opts?: any) {
      live.set(key(this, type, fn), true);
      return origAdd.call(this, type, fn, opts);
    };
    proto.removeEventListener = function (this: any, type: string, fn: any, opts?: any) {
      live.set(key(this, type, fn), false);
      return origRem.call(this, type, fn, opts);
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
  //
  // Sample the live count at several points through the churn and assert it
  // stays inside a fixed band. Comparing only first-vs-last is not a leak
  // test: the live set legitimately differs by zone TYPE (a TP zone's engine
  // and an FP room's renderer register different handler identities), so an
  // end-of-run delta mostly reports "we ended somewhere with a different
  // renderer", not growth. A leak shows up as monotonic growth across the
  // samples, which the band catches regardless of where the run ends.
  const samples: number[] = [];
  for (let i = 0; i < NAV_COUNT; i++) {
    await drainThreat(page);
    const id = zoneIds[i % zoneIds.length];
    await nav(page, id);
    await page.waitForTimeout(800); // let the 600ms entry-threat window resolve
    if (i % 2 === 1) samples.push(await page.evaluate(() => (window as any).__listenerCount.current));
  }
  await drainThreat(page);

  const afterNav = await page.evaluate(() => (window as any).__listenerCount.current);
  samples.push(afterNav);
  const spread = Math.max(...samples) - Math.min(...samples);
  console.log('[stability] live listener samples:', JSON.stringify(samples));
  expect(
    spread,
    `live listener count swung by ${spread} across ${NAV_COUNT} swaps (samples=${samples.join(',')}) — a leak grows monotonically, a band does not`,
  ).toBeLessThan(20);

  // --- Phase 2: idle soak → smooth happiness decay (before threats floor it) ---
  // Decay is deliberately paused while a minigame owns input, so the soak must
  // start from a settled idle manager or it measures the wrong thing.
  await drainThreat(page);
  const readState = () => page.evaluate(() => ({
    h: (window as any).__turboStateHappiness?.() ?? -1,
    frames: (window as any).__turboPerf?.report?.().totalFrames ?? -1,
    busy: (window as any).__turboThreat?.isBusy ?? null,
  }));
  const s1 = await readState();
  expect(s1.busy, 'soak needs an idle threat manager (decay is paused during minigames)').toBe(false);
  expect(s1.h, 'soak needs happiness above the floor (decay clamps at MIN)').toBeGreaterThan(0);
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
