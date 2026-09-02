/**
 * engine/onboarding.ts — first-run control hints (Sprint 8.5)
 *
 * Shows a full control-hints bar in the HUD until the player acknowledges
 * it. Dismissal is persisted to localStorage so it only appears once.
 * While unacknowledged the HUD also keeps its compact hint line, so the
 * bar is an ADDITION, not a replacement.
 *
 * Pure module (no renderer state): main.ts wires the providers, hud.ts
 * calls `drawOnboardingBar`, and the canvas click handler hit-tests
 * `getOnboardingBarRect` to dismiss.
 */

const STORAGE_KEY = 'turbo.onboarded.v1';

/** Control hints shown on first run (key, action). */
export const ONBOARDING_HINTS: Array<[string, string]> = [
  ['WASD / Arrows', 'move'],
  ['E / Space', 'interact & threats'],
  ['Hold Space', 'comfort minigames'],
  ['J', 'story journal'],
  ['I', 'inventory'],
  ['C', 'friends'],
  ['M', 'map'],
];

/**
 * Returns the onboarding bar rectangle for the given canvas size.
 * Bottom-center, above the compact hint line.
 */
export function getOnboardingBarRect(W: number, H: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(W - 32, 720);
  const h = 58;
  const x = Math.max(16, (W - w) / 2);
  const y = H - h - 44; // above the two bottom-left hint lines
  return { x, y, w, h };
}

/** True once the player has acknowledged the control hints (persisted). */
export function isOnboarded(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the acknowledgment so the bar never shows again. */
export function markOnboarded(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // private-mode / blocked storage — the bar will re-appear next run, which is fine
  }
}

/**
 * Draw the first-run control-hints bar. Pure canvas, no allocations of
 * note beyond the fixed hint list (built once at module level).
 */
export function drawOnboardingBar(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const r = getOnboardingBarRect(W, H);
  ctx.save();

  ctx.fillStyle = 'rgba(10,12,28,0.88)';
  ctx.strokeStyle = 'rgba(120,160,255,0.55)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('🐾 First run — here are the controls', r.x + r.w / 2, r.y + 20);

  // Hints in two rows (4 + 3) to keep the bar short.
  ctx.font = '12px sans-serif';
  const rowY1 = r.y + 38;
  const rowY2 = r.y + 52;
  drawHintRow(ctx, ONBOARDING_HINTS.slice(0, 4), r.x, r.w, rowY1);
  drawHintRow(ctx, ONBOARDING_HINTS.slice(4), r.x, r.w, rowY2);

  ctx.restore();
}

function drawHintRow(
  ctx: CanvasRenderingContext2D,
  hints: Array<[string, string]>,
  x: number,
  w: number,
  y: number,
): void {
  const parts = hints.map(([k, a]) => `${k} — ${a}`);
  const gap = 18;
  const widths = parts.map(p => ctx.measureText(p).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  let cx = x + (w - total) / 2;
  for (let i = 0; i < parts.length; i++) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cfe0ff';
    ctx.fillText(parts[i], cx, y);
    cx += widths[i] + gap;
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
