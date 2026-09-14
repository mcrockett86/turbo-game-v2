
import { chromium, Page, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const DEV_URL = 'http://localhost:3094';
const REPORT_DIR = './chaos-reports';

function createPRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class ChaosEngine {
  private page!: Page;
  private browser!: Browser;
  private prng!: () => number;
  private seed: number = 0;
  private errors: any[] = [];
  private lastChecksum: string | null = null;
  private lastStateHash: string | null = null;
  private stagnationFrames = 0;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 1000000);
    this.prng = createPRNG(this.seed);
  }

  async setup() {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage({ viewport: { width: 1280, height: 720 } });
    await this.page.goto(DEV_URL, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(1000);
    await this.page.locator('.dog-card').first().click();
    await this.page.locator('#start-adventure-btn').click();
    await this.page.locator('#game-canvas').waitFor({ state: 'visible' });
    console.log(`→ Chaos Engine ready. Seed: ${this.seed}`);
  }

  async injectPanicProfile(durationMs: number) {
    console.log('Injecting PANIC profile...');
    const keys = ['w', 'a', 's', 'd', ' ', 'e'];
    const start = Date.now();
    while (Date.now() - start < durationMs) {
      const key = keys[Math.floor(this.prng() * keys.length)];
      await this.page.keyboard.press(key);
      await this.page.waitForTimeout(50);
      await this.verifySync();
    }
  }

  async injectGhostProfile(durationMs: number) {
    console.log('Injecting GHOST profile...');
    const start = Date.now();
    while (Date.now() - start < durationMs) {
      const dir = Math.random() > 0.5 ? 'd' : 'a';
      await this.page.keyboard.down(dir);
      await this.page.waitForTimeout(100);
      await this.page.keyboard.up(dir);
      await this.verifySync();
    }
  }

  private async verifySync() {
    const data = await this.page.evaluate(() => {
      const turbo = (window as any).__turbo;
      const renderer = turbo.__activeRenderer?.();
      if (!renderer) return null;
      return {
        checksum: renderer.getCanvasChecksum(),
        state: JSON.stringify(turbo.state()),
        pos: turbo.playerPos,
        log: turbo.flightLog
      };
    });

    if (!data) return;

    const currentChecksum = data.checksum;
    const currentStateHash = data.state;

    if (this.lastStateHash && this.lastStateHash !== currentStateHash) {
      // Logic changed. Did visuals change?
      if (this.lastChecksum && this.lastChecksum === currentChecksum) {
        this.stagnationFrames++;
        if (this.stagnationFrames > 5) {
          console.error('!!! Visual Stagnation Error: State changed but canvas remained static.');
          this.errors.push({
            type: 'VISUAL_STAGNATION',
            seed: this.seed,
            state: data.state,
            log: data.log,
            timestamp: Date.now()
          });
          this.stagnationFrames = 0;
        }
      } else {
        this.stagnationFrames = 0;
      }
    }

    this.lastChecksum = currentChecksum;
    this.lastStateHash = currentStateHash;
  }

  async reportAndShutdown() {
    if (this.errors.length > 0) {
      if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR);
      const reportPath = path.join(REPORT_DIR, `report-seed-${this.seed}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(this.errors, null, 2));
      console.log(`✘ Chaos detected failures. Report: ${reportPath}`);
    } else {
      console.log('✓ No visual-logic divergences detected.');
    }
    await this.browser.close();
  }
}

async function run() {
  const engine = new ChaosEngine();
  try {
    await engine.setup();
    await engine.injectPanicProfile(5000);
    await engine.injectGhostProfile(5000);
    await engine.reportAndShutdown();
  } catch (e) {
    console.error('Chaos Engine crashed:', e);
    process.exit(1);
  }
}

run();
