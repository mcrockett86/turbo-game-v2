/**
 * scripts/perf-check.ts — perf budget tool
 *
 * Drives the built app in headless Chromium: selects a dog, then either
 * (a) idles in the first zone, or (b) navigates every zone once via the
 * dev-only `__turboNav` hook. Frame metrics come from the in-app ring
 * buffer (window.__turboPerf.report()).
 *
 * Modes:
 *   --mode=baseline  Record metrics into perf/baseline-<label>.json
 *   --mode=verify    Compare current run against perf/baseline-pre.json
 *                    and the hard budgets (p50 < 20ms, p95 < 50ms,
 *                    dropped ≤ 10 per 10s window). Fails on regression.
 *
 * Labels: "pre" (before audio) and "post" (after audio) are the canonical
 * pair the verify mode uses. The unit test tests/unit/perf-budget.test.ts
 * asserts the pre baseline exists AND that post (once recorded) is within
 * drift limits of pre — so audio regressions fail the unit suite too.
 *
 * Dev tool only. Starts `vite preview` on port 3095 unless a server is
 * already listening there.
 */

import { chromium, type ChildProcess } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

interface PerfReport {
  samples: number;
  totalFrames: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  droppedFrames: number;
}

interface Baseline {
  label: string;
  recordedAt: string;
  gitCommit: string | null;
  scenario: 'idle' | 'navigate-all';
  frames: PerfReport;
  zoneSwaps: number;
  notes: string;
}

const BUDGET = { p50: 20, p95: 50, dropped: 10 } as const;
const DRIFT_LIMITS = { p95: 50, dropped: 5 } as const; // post-audio vs pre-audio

function parseArgs(argv: string[]): { mode: string; label: string; scenario: string; port: number } {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    mode: args.mode ?? 'baseline',
    label: args.label ?? 'pre',
    scenario: args.scenario ?? 'navigate-all',
    port: Number(args.port ?? 3095),
  };
}

function gitCommit(): string | null {
  try {
    return execSync(`git -C "${ROOT}" rev-parse HEAD`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const fmtMs = (v: number) => v.toFixed(1) + 'ms';

function printReport(r: PerfReport): void {
  const ok = (pass: boolean) => (pass ? '✅' : '❌');
  console.log(`  samples   ${r.samples} frames`);
  console.log(`  avg       ${fmtMs(r.avgMs)}`);
  console.log(`  p50       ${fmtMs(r.p50Ms)}   (budget < ${BUDGET.p50}ms)  ${ok(r.p50Ms < BUDGET.p50)}`);
  console.log(`  p95       ${fmtMs(r.p95Ms)}   (budget < ${BUDGET.p95}ms)  ${ok(r.p95Ms < BUDGET.p95)}`);
  console.log(`  max       ${fmtMs(r.maxMs)}`);
  console.log(`  dropped   ${r.droppedFrames}   (budget ≤ ${BUDGET.dropped} per 10s window)  ${ok(r.droppedFrames <= BUDGET.dropped)}`);
}

async function main(): Promise<void> {
  const { mode, label, scenario, port } = parseArgs(process.argv.slice(2));
  const base = `http://localhost:${port}`;

  // Start vite preview if nothing is listening.
  let server: ChildProcess | null = null;
  const existing = await fetch(base + '/turbo-web/index.html').then(r => r.ok).catch(() => false);
  if (!existing) {
    const devNull = openSync(process.platform === 'win32' ? 'nul' : '/dev/null', 'w');
    server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', 'localhost'], {
      cwd: ROOT, stdio: ['ignore', devNull, devNull], detached: true,
    });
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (await fetch(base + '/turbo-web/index.html').then(r => r.ok).catch(() => false)) break;
    }
    console.log(`[perf] started vite preview on ${base}`);
  } else {
    console.log(`[perf] reusing existing server at ${base}`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  try {
    await page.goto(base + '/turbo-web/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#dog-grid .dog-card', { timeout: 10_000 });
    await page.click('#dog-grid .dog-card');
    await page.click('#start-adventure-btn');
    await page.waitForTimeout(1000); // first zone settles immediately (no transition on entry)

    const hasNav = await page.evaluate(() => typeof (window as any).__turboNav === 'function');
    if (scenario === 'navigate-all' && !hasNav) {
      throw new Error('__turboNav hook missing — is the app build stale? Rebuild (npm run build) and retry.');
    }

    let zoneSwaps = 0;
    if (scenario === 'navigate-all') {
      // Warm-up so the first sample window is steady-state.
      console.log('[perf] 2s warm-up in first zone...');
      await page.waitForTimeout(2000);
      await page.evaluate(() => (window as any).__turboPerf.reset());
      const ids: string[] = await page.evaluate(() => (window as any).__turboZoneIds);
      for (const id of ids) {
        // Cancel any entry threat before navigating — the perf window must
        // measure renderer + transition cost, not minigame UI work.
        // Threat resolution has a 600ms settle delay; retry until it's idle.
        let applied = false;
        for (let attempt = 0; attempt < 6 && !applied; attempt++) {
          await page.evaluate(() => { const t = (window as any).__turboThreat; if (t?.isBusy) t.cancel(); });
          applied = await page.evaluate((z) => (window as any).__turboNav(z), id);
          if (!applied) await page.waitForTimeout(300);
        }
        if (applied) zoneSwaps += 1; else console.warn(`[perf] nav skipped (still busy): ${id}`);
        await page.waitForTimeout(1100); // 500ms transition + settle
      }
      console.log(`[perf] navigated ${ids.length} zones (${zoneSwaps} applied)`);
    } else {
      console.log('[perf] 8s idle soak in first zone...');
      await page.evaluate(() => (window as any).__turboPerf.reset());
      await page.waitForTimeout(8000);
    }

    const frames: PerfReport = await page.evaluate(() => (window as any).__turboPerf.report());
    console.log(`\n[perf] scenario=${scenario} label=${label}`);
    printReport(frames);

    if (mode === 'baseline') {
      const dir = resolve(ROOT, 'perf');
      mkdirSync(dir, { recursive: true });
      const file = resolve(dir, `baseline-${label}.json`);
      const record: Baseline = {
        label,
        recordedAt: new Date().toISOString(),
        gitCommit: gitCommit(),
        scenario,
        frames,
        zoneSwaps,
        notes: label === 'pre' ? 'baseline BEFORE audio (Sprint 6 item 5)'
             : label === 'post' ? 'baseline AFTER audio (Sprint 6 item 1)'
             : '',
      };
      writeFileSync(file, JSON.stringify(record, null, 2));
      console.log(`\n[perf] ✅ baseline saved → perf/baseline-${label}.json`);
    } else if (mode === 'verify') {
      const preFile = resolve(ROOT, 'perf/baseline-pre.json');
      if (!existsSync(preFile)) {
        throw new Error('no perf/baseline-pre.json — run `npm run perf:baseline` first');
      }
      const pre: Baseline = JSON.parse(readFileSync(preFile, 'utf8'));
      const budgetOk = frames.p50Ms < BUDGET.p50 && frames.p95Ms < BUDGET.p95 && frames.droppedFrames <= BUDGET.dropped;
      const drift = {
        p50: frames.p50Ms - pre.frames.p50Ms,
        p95: frames.p95Ms - pre.frames.p95Ms,
        dropped: frames.droppedFrames - pre.frames.droppedFrames,
      };
      const driftOk = drift.p95 < DRIFT_LIMITS.p95 && drift.dropped <= DRIFT_LIMITS.dropped;
      const sign = (v: number) => (v >= 0 ? '+' : '') + fmtMs(v);
      console.log(`\n[perf] vs baseline (label=${pre.label}, commit=${pre.gitCommit?.slice(0, 7) ?? 'n/a'}):`);
      console.log(`  p50     Δ ${sign(drift.p50)}`);
      console.log(`  p95     Δ ${sign(drift.p95)}   (limit +${DRIFT_LIMITS.p95}ms)  ${drift.p95 < DRIFT_LIMITS.p95 ? '✅' : '❌'}`);
      console.log(`  dropped Δ ${drift.dropped >= 0 ? '+' : ''}${drift.dropped}   (limit +${DRIFT_LIMITS.dropped})  ${drift.dropped <= DRIFT_LIMITS.dropped ? '✅' : '❌'}`);
      const pass = budgetOk && driftOk;
      console.log(`\n[perf] ${pass ? '✅ PASS — within budgets and baseline drift limits' : '❌ FAIL — see lines above'}`);
      process.exitCode = pass ? 0 : 1;
    }
  } finally {
    await browser.close();
    if (server) {
      try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* already gone */ }
    }
  }
}

main().catch((e) => { console.error('[perf] fatal:', e.message); process.exit(1); });
