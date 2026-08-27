/**
 * Threat Scenes — themed zone backdrops + stage actors for threat minigames
 * (Sprint 8.2).
 *
 * Every threat minigame previously rendered on the same flat dark backdrop
 * with generic shapes. This module paints:
 *   1. a zone-specific backdrop (sky + silhouette + animated accent) per
 *      `ThreatSceneId` (16 scenes), and
 *   2. a themed actor in the stage area above the minigame mechanic,
 *      per `ThreatActorId` (data-driven; falls back to a per-type generic).
 *
 * Constraints honored:
 * - Canvas 2D only, no image assets, no dependencies.
 * - No per-frame allocation: all geometry is issued as ctx calls over
 *   module-level constants; animation is pure trig on the `t` clock.
 * - No RAF loop: this module is draw-only, called from ThreatManager.render.
 */

import type { Threat, ThreatSceneId, ThreatType, ThreatActorId } from '../../types';

type Ctx = CanvasRenderingContext2D;
type BackdropDraw = (ctx: Ctx, W: number, H: number, t: number) => void;
type ActorDraw = (ctx: Ctx, x: number, y: number, s: number, t: number) => void;

export interface Backdrop {
  skyTop: string;
  skyBottom: string;
  draw: BackdropDraw;
}

// ===== shared drawing helpers (no allocation) =====

const TAU = Math.PI * 2;

/** Path an ellipse centered at (x, y). Caller fills/strokes. */
function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
}

/** Fill a circle. */
function disc(ctx: Ctx, x: number, y: number, r: number): void {
  ell(ctx, x, y, r, r);
  ctx.fill();
}

/** Fill a rect centered at (x, y). */
function box(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
}

/** Deterministic 0..1 pseudo-random from an integer seed (no allocation). */
function frac(n: number): number {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
}

// ===== palette =====

const C = {
  ink: '#10142c',
  white: '#f8f9fa',
  cream: '#f1e6cf',
  yellow: '#ffd166',
  orange: '#f4a261',
  red: '#c94f6d',
  green: '#6a994e',
  teal: '#4cc9f0',
  blue: '#3a86ff',
  gray: '#8d99ae',
  brown: '#8d6e63',
  fur: '#c98f4e',
  furDark: '#a56f36',
};

// ===== shared actor primitives (no allocation) =====

/** A simple four-legged animal: body, head, legs, tail. Callers can layer
 *  ears/stripes/etc. on top. `x,y` is the body center, `s` the body radius. */
function quadBody(ctx: Ctx, x: number, y: number, s: number, color: string, t: number): void {
  const bob = Math.sin(t * 3) * s * 0.05;
  const by = y + bob;
  ctx.fillStyle = color;
  // legs
  for (const lx of [-0.55, -0.2, 0.2, 0.55]) {
    ctx.fillRect(x + lx * s - s * 0.08, by + s * 0.35, s * 0.16, s * 0.5);
  }
  // body
  ell(ctx, x, by, s, s * 0.62);
  ctx.fill();
  // tail (wagging)
  const wag = Math.sin(t * 6) * 0.5;
  ctx.save();
  ctx.translate(x - s * 0.95, by - s * 0.1);
  ctx.rotate(wag);
  ell(ctx, 0, 0, s * 0.28, s * 0.16);
  ctx.fill();
  ctx.restore();
  // head
  disc(ctx, x + s * 0.85, by - s * 0.35, s * 0.55);
  // ears
  ctx.beginPath();
  ctx.moveTo(x + s * 0.6, by - s * 0.75);
  ctx.lineTo(x + s * 0.5, by - s * 1.15);
  ctx.lineTo(x + s * 0.95, by - s * 0.8);
  ctx.closePath();
  ctx.fill();
  // eye
  ctx.fillStyle = C.ink;
  disc(ctx, x + s * 1.0, by - s * 0.42, s * 0.09);
  // nose
  disc(ctx, x + s * 1.32, by - s * 0.3, s * 0.1);
}

/** A standing person (head, torso, legs, arms). `x,y` is the hip center. */
function person(ctx: Ctx, x: number, y: number, s: number, color: string, t: number): void {
  const bob = Math.sin(t * 2) * s * 0.03;
  ctx.fillStyle = color;
  // legs
  ctx.fillRect(x - s * 0.3, y, s * 0.24, s * 0.9);
  ctx.fillRect(x + s * 0.06, y, s * 0.24, s * 0.9);
  // torso
  ell(ctx, x, y - s * 0.5, s * 0.42, s * 0.62);
  ctx.fill();
  // arms
  ctx.fillRect(x - s * 0.55, y - s * 0.8, s * 0.18, s * 0.7);
  ctx.fillRect(x + s * 0.37, y - s * 0.8, s * 0.18, s * 0.7);
  // head
  ctx.fillStyle = '#e8c39e';
  disc(ctx, x, y - s * 1.35 + bob, s * 0.36);
}

/** A rolling wheel with a hub. */
function wheel(ctx: Ctx, x: number, y: number, r: number, t: number): void {
  ctx.fillStyle = '#2a2a3e';
  disc(ctx, x, y, r);
  ctx.fillStyle = '#8d99ae';
  disc(ctx, x, y, r * 0.45);
  // spokes
  ctx.strokeStyle = '#2a2a3e';
  ctx.lineWidth = Math.max(1, r * 0.16);
  for (let i = 0; i < 3; i++) {
    const a = t * 6 + (i * TAU) / 3;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * r * 0.4, y - Math.sin(a) * r * 0.4);
    ctx.lineTo(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4);
    ctx.stroke();
  }
}

// ===== registry (populated incrementally) =====

/** Zone backdrops keyed by scene id. Partial on purpose: unlisted scenes
 *  fall back to the flat dark backdrop so the module is always drawable. */
const BACKDROPS: Partial<Record<ThreatSceneId, Backdrop>> = {
  street: {
    skyTop: '#3b4a8f',
    skyBottom: '#141a33',
    draw(ctx, W, H, t) {
      // Low dusk sun
      ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
      disc(ctx, W * 0.78, H * 0.3, H * 0.05);
      ctx.fillStyle = 'rgba(255, 209, 102, 0.12)';
      disc(ctx, W * 0.78, H * 0.3, H * 0.09);
      // Building skyline (deterministic heights)
      const heights = [0.2, 0.32, 0.26, 0.4, 0.3, 0.36, 0.24, 0.3];
      const baseY = H * 0.82;
      ctx.fillStyle = '#0c1024';
      for (let i = 0; i < heights.length; i++) {
        const bw = W / heights.length;
        const bh = H * heights[i];
        ctx.fillRect(i * bw, baseY - bh, bw * 0.72, bh);
      }
      // Lit windows (twinkle subtly)
      for (let i = 0; i < 14; i++) {
        const wx = (i * 0.071 + 0.03) * W;
        const wy = baseY - H * (0.08 + frac(i) * 0.2);
        ctx.fillStyle = frac(i * 3 + Math.floor(t * 0.5)) > 0.4 ? 'rgba(255,209,102,0.7)' : 'rgba(255,209,102,0.25)';
        ctx.fillRect(wx, wy, W * 0.012, H * 0.02);
      }
      // Road with dashed centerline
      ctx.fillStyle = '#10142c';
      ctx.fillRect(0, baseY, W, H - baseY);
      ctx.fillStyle = 'rgba(248, 249, 250, 0.35)';
      const dashW = W * 0.03;
      const offset = (t * 40) % (dashW * 2);
      for (let x = -dashW * 2 + offset; x < W; x += dashW * 2) {
        ctx.fillRect(x, baseY + (H - baseY) * 0.5 - H * 0.008, dashW, H * 0.016);
      }
    },
  },
  park: {
    skyTop: '#6fa8dc',
    skyBottom: '#2c4f7c',
    draw(ctx, W, H) {
      ctx.fillStyle = 'rgba(255, 236, 170, 0.9)';
      disc(ctx, W * 0.2, H * 0.22, H * 0.045);
      // Grass band
      ctx.fillStyle = '#2f6b3a';
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      ctx.fillStyle = '#275c31';
      ctx.fillRect(0, H * 0.78, W, H * 0.02);
      // Two trees
      for (const tx of [W * 0.14, W * 0.86]) {
        ctx.fillStyle = '#5a4632';
        ctx.fillRect(tx - W * 0.012, H * 0.6, W * 0.024, H * 0.2);
        ctx.fillStyle = '#1e4d2a';
        disc(ctx, tx, H * 0.56, H * 0.13);
        disc(ctx, tx - H * 0.09, H * 0.63, H * 0.09);
        disc(ctx, tx + H * 0.09, H * 0.63, H * 0.09);
      }
    },
  },
  garden: {
    skyTop: '#79b8e8',
    skyBottom: '#33628f',
    draw(ctx, W, H) {
      ctx.fillStyle = 'rgba(255, 236, 170, 0.9)';
      disc(ctx, W * 0.8, H * 0.2, H * 0.05);
      // Lawn
      ctx.fillStyle = '#3a7d4a';
      ctx.fillRect(0, H * 0.72, W, H * 0.28);
      // Rose hedge (row of bumps)
      ctx.fillStyle = '#2e5d34';
      const n = 7;
      for (let i = 0; i < n; i++) {
        disc(ctx, W * (i + 0.5) / n, H * 0.72, H * 0.09);
      }
      // Roses
      ctx.fillStyle = C.red;
      for (let i = 0; i < 6; i++) {
        disc(ctx, W * (i + 0.5) / n + W * 0.03, H * 0.69, H * 0.016);
      }
    },
  },
  apartment: {
    skyTop: '#4a3a30',
    skyBottom: '#221a14',
    draw(ctx, W, H) {
      // Window with night city view
      const wx = W * 0.5, wy = H * 0.42, ww = W * 0.62, wh = H * 0.5;
      ctx.fillStyle = '#141a33';
      ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
      // City lights in the distance
      for (let i = 0; i < 18; i++) {
        const lx = wx - ww / 2 + frac(i * 7) * ww;
        const ly = wy - wh / 2 + frac(i * 13) * wh * 0.8;
        ctx.fillStyle = frac(i + 2) > 0.5 ? 'rgba(255,209,102,0.8)' : 'rgba(76,201,240,0.6)';
        ctx.fillRect(lx, ly, W * 0.01, H * 0.018);
      }
      // Window frame + sill
      ctx.strokeStyle = '#5a4632';
      ctx.lineWidth = Math.max(3, W * 0.012);
      ctx.strokeRect(wx - ww / 2, wy - wh / 2, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx, wy - wh / 2);
      ctx.lineTo(wx, wy + wh / 2);
      ctx.stroke();
      ctx.fillStyle = '#6b5844';
      ctx.fillRect(wx - ww / 2 - W * 0.015, wy + wh / 2, ww + W * 0.03, H * 0.03);
      // Rain streaks on the glass
      ctx.strokeStyle = 'rgba(200, 220, 255, 0.14)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const rx = wx - ww / 2 + (i + 0.5) * ww / 8;
        const phase = ((H * 0.5 * (i / 8)) + H * 0.1) % (wh + H * 0.1);
        ctx.beginPath();
        ctx.moveTo(rx + H * 0.01, wy - wh / 2 + phase);
        ctx.lineTo(rx, wy - wh / 2 + phase + H * 0.05);
        ctx.stroke();
      }
    },
  },
  shelter: {
    skyTop: '#4d4238',
    skyBottom: '#241d18',
    draw(ctx, W, H) {
      // Shelving with crates
      for (const sy of [H * 0.6, H * 0.8]) {
        ctx.fillStyle = '#6b5844';
        ctx.fillRect(W * 0.06, sy, W * 0.88, H * 0.025);
      }
      ctx.fillStyle = '#5a4632';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(W * (0.12 + i * 0.17), H * 0.6 - H * 0.11, W * 0.1, H * 0.11);
      }
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(W * (0.16 + i * 0.2), H * 0.8 - H * 0.12, W * 0.12, H * 0.12);
      }
      // Warm lamp glow (flat circles)
      ctx.fillStyle = 'rgba(255, 209, 102, 0.10)';
      disc(ctx, W * 0.5, H * 0.3, H * 0.22);
      ctx.fillStyle = 'rgba(255, 209, 102, 0.5)';
      disc(ctx, W * 0.5, H * 0.3, H * 0.045);
    },
  },
  lake: {
    skyTop: '#5b7fb8',
    skyBottom: '#22334f',
    draw(ctx, W, H, t) {
      // Moon
      ctx.fillStyle = 'rgba(248, 249, 250, 0.9)';
      disc(ctx, W * 0.75, H * 0.2, H * 0.04);
      // Far shoreline
      ctx.fillStyle = '#16263a';
      ctx.fillRect(0, H * 0.56, W, H * 0.05);
      for (let i = 0; i < 9; i++) {
        disc(ctx, W * (i + 0.5) / 9, H * 0.56, H * 0.035);
      }
      // Water
      ctx.fillStyle = '#274b6d';
      ctx.fillRect(0, H * 0.6, W, H * 0.4);
      // Animated shimmer lines
      ctx.strokeStyle = 'rgba(159, 216, 232, 0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const ly = H * (0.66 + i * 0.07);
        const off = Math.sin(t * 1.2 + i) * W * 0.02;
        ctx.beginPath();
        ctx.moveTo(W * 0.08 + off, ly);
        ctx.lineTo(W * (0.25 + 0.06 * frac(i)) + off, ly);
        ctx.moveTo(W * 0.5 + off, ly);
        ctx.lineTo(W * 0.68 + off, ly);
        ctx.stroke();
      }
    },
  },
  forest: {
    skyTop: '#4a7a5e',
    skyBottom: '#1c3527',
    draw(ctx, W, H) {
      // Mist band
      ctx.fillStyle = 'rgba(220, 235, 225, 0.10)';
      ctx.fillRect(0, H * 0.4, W, H * 0.08);
      // Pine silhouettes (two depth layers)
      const pine = (cx: number, baseY: number, h: number, w: number) => {
        ctx.beginPath();
        ctx.moveTo(cx, baseY - h);
        ctx.lineTo(cx - w, baseY);
        ctx.lineTo(cx + w, baseY);
        ctx.closePath();
        ctx.fill();
      };
      ctx.fillStyle = '#0e1f15';
      for (let i = 0; i < 6; i++) pine(W * (i + 0.5) / 6, H * 0.86, H * (0.3 + frac(i) * 0.14), W * 0.07);
      ctx.fillStyle = '#14281c';
      for (let i = 0; i < 8; i++) pine(W * (i + 0.2) / 8, H * 0.94, H * (0.2 + frac(i * 3) * 0.1), W * 0.05);
      // Forest floor
      ctx.fillStyle = '#0d1a12';
      ctx.fillRect(0, H * 0.88, W, H * 0.12);
    },
  },
  beach: {
    skyTop: '#8ecae6',
    skyBottom: '#3d7ea6',
    draw(ctx, W, H, t) {
      ctx.fillStyle = 'rgba(255, 240, 200, 0.95)';
      disc(ctx, W * 0.24, H * 0.2, H * 0.05);
      // Sea band
      ctx.fillStyle = '#2a6f97';
      ctx.fillRect(0, H * 0.55, W, H * 0.2);
      // Foam lines
      ctx.strokeStyle = 'rgba(248, 249, 250, 0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const ly = H * (0.6 + i * 0.05);
        const off = Math.sin(t * 1.5 + i) * W * 0.02;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.quadraticCurveTo(W * 0.5, ly - H * 0.015 + off, W, ly);
        ctx.stroke();
      }
      // Sand dune
      ctx.fillStyle = '#d9b26a';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.82);
      ctx.quadraticCurveTo(W * 0.5, H * 0.72, W, H * 0.84);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
    },
  },
  mountain: {
    skyTop: '#7d8ca3',
    skyBottom: '#2e3a4d',
    draw(ctx, W, H) {
      // Distant range
      ctx.fillStyle = '#3a4a63';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.7);
      ctx.lineTo(W * 0.2, H * 0.4);
      ctx.lineTo(W * 0.4, H * 0.66);
      ctx.lineTo(W * 0.6, H * 0.34);
      ctx.lineTo(W * 0.8, H * 0.64);
      ctx.lineTo(W, H * 0.44);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
      // Snow caps
      ctx.fillStyle = 'rgba(248, 249, 250, 0.75)';
      for (const [sx, sy, sw] of [[W * 0.2, H * 0.4, W * 0.05], [W * 0.6, H * 0.34, W * 0.055], [W, H * 0.44, W * 0.045]] as const) {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - sw, sy + sw * 1.3);
        ctx.lineTo(sx + sw, sy + sw * 1.3);
        ctx.closePath();
        ctx.fill();
      }
      // Near scree
      ctx.fillStyle = '#232f42';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.9);
      ctx.lineTo(W * 0.35, H * 0.74);
      ctx.lineTo(W * 0.7, H * 0.88);
      ctx.lineTo(W, H * 0.78);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
    },
  },
  waterfall: {
    skyTop: '#6f9fb8',
    skyBottom: '#2a4a5e',
    draw(ctx, W, H, t) {
      // Cliff walls
      ctx.fillStyle = '#3a4238';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.3);
      ctx.lineTo(W * 0.3, H * 0.36);
      ctx.lineTo(W * 0.3, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W, H * 0.28);
      ctx.lineTo(W * 0.7, H * 0.34);
      ctx.lineTo(W * 0.7, H);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      // Falling sheet
      ctx.fillStyle = 'rgba(159, 216, 232, 0.55)';
      ctx.fillRect(W * 0.34, H * 0.34, W * 0.32, H * 0.5);
      // Streaks
      ctx.strokeStyle = 'rgba(248, 249, 250, 0.4)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const lx = W * (0.38 + i * 0.05);
        const off = (t * 120 + i * 30) % (H * 0.5);
        ctx.beginPath();
        ctx.moveTo(lx, H * 0.34 + off);
        ctx.lineTo(lx, H * 0.34 + off + H * 0.05);
        ctx.stroke();
      }
      // Pool
      ctx.fillStyle = '#2a6f97';
      ctx.fillRect(0, H * 0.84, W, H * 0.16);
      ctx.fillStyle = 'rgba(248, 249, 250, 0.3)';
      disc(ctx, W * 0.5, H * 0.84, H * 0.03);
    },
  },
  secret_park: {
    skyTop: '#2c3e50',
    skyBottom: '#0e1626',
    draw(ctx, W, H, t) {
      // Stars
      for (let i = 0; i < 16; i++) {
        const a = 0.3 + 0.5 * frac(Math.floor(t) + i);
        ctx.fillStyle = `rgba(248, 249, 250, ${a.toFixed(2)})`;
        disc(ctx, frac(i * 7) * W, frac(i * 13) * H * 0.5, Math.max(1, H * 0.006));
      }
      // Glowing ground glow
      ctx.fillStyle = 'rgba(124, 252, 138, 0.10)';
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
      ctx.fillStyle = '#1e3a2a';
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      // Fireflies
      for (let i = 0; i < 7; i++) {
        const fx = W * (0.2 + 0.6 * frac(i * 5));
        const fy = H * (0.55 + 0.2 * frac(i * 11)) + Math.sin(t * 2 + i) * H * 0.03;
        const a = 0.4 + 0.5 * Math.abs(Math.sin(t * 3 + i));
        ctx.fillStyle = `rgba(212, 255, 138, ${a.toFixed(2)})`;
        disc(ctx, fx, fy, Math.max(1.5, H * 0.008));
      }
    },
  },
  pet_shop: {
    skyTop: '#5c4a6e',
    skyBottom: '#2a2138',
    draw(ctx, W, H) {
      // Cage shelving
      for (const sy of [H * 0.52, H * 0.74]) {
        ctx.fillStyle = '#3a2f4a';
        ctx.fillRect(W * 0.08, sy, W * 0.84, H * 0.02);
        ctx.strokeStyle = 'rgba(141, 153, 174, 0.5)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const cx = W * (0.14 + i * 0.14);
          ctx.strokeRect(cx, sy - H * 0.16, W * 0.1, H * 0.16);
          ctx.beginPath();
          ctx.moveTo(cx + W * 0.05, sy - H * 0.16);
          ctx.lineTo(cx + W * 0.05, sy);
          ctx.stroke();
        }
      }
      // Toys on the floor
      ctx.fillStyle = C.red;
      disc(ctx, W * 0.25, H * 0.88, H * 0.03);
      ctx.fillStyle = C.yellow;
      disc(ctx, W * 0.72, H * 0.9, H * 0.026);
      ctx.fillStyle = C.teal;
      disc(ctx, W * 0.5, H * 0.92, H * 0.02);
    },
  },
  dog_show: {
    skyTop: '#6e5c4a',
    skyBottom: '#2a211a',
    draw(ctx, W, H) {
      // Audience rows (heads)
      for (let row = 0; row < 3; row++) {
        const ry = H * (0.4 + row * 0.14);
        ctx.fillStyle = row === 2 ? '#3a2f26' : '#4a3c30';
        const n = 8 + row * 2;
        for (let i = 0; i < n; i++) {
          disc(ctx, W * (i + 0.5) / n + W * 0.01 * (row % 2), ry, H * (0.03 + row * 0.008));
        }
      }
      // Stage floor
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(0, H * 0.8, W, H * 0.2);
      // Ribbon on a pole
      ctx.strokeStyle = '#8d7a5c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.85, H * 0.8);
      ctx.lineTo(W * 0.85, H * 0.3);
      ctx.stroke();
      ctx.fillStyle = C.yellow;
      ctx.beginPath();
      ctx.moveTo(W * 0.85, H * 0.3);
      ctx.lineTo(W * 0.85 + W * 0.06, H * 0.33);
      ctx.lineTo(W * 0.85, H * 0.36);
      ctx.closePath();
      ctx.fill();
    },
  },
  market: {
    skyTop: '#b8764a',
    skyBottom: '#4a2c3a',
    draw(ctx, W, H) {
      // Striped awning
      const awnY = H * 0.3, awnH = H * 0.1;
      const stripes = 8;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? C.red : C.cream;
        const sw = W / stripes;
        ctx.fillRect(i * sw, awnY, sw, awnH);
        disc(ctx, i * sw + sw / 2, awnY + awnH, sw / 2);
      }
      // Stall counter
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(0, H * 0.68, W, H * 0.32);
      ctx.fillStyle = '#6b5844';
      ctx.fillRect(W * 0.08, H * 0.62, W * 0.84, H * 0.05);
      // Produce piles
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 === 0 ? C.green : C.orange;
        disc(ctx, W * (0.18 + i * 0.15), H * 0.6, H * 0.035);
      }
    },
  },
  library: {
    skyTop: '#4a3a2e',
    skyBottom: '#1d150f',
    draw(ctx, W, H) {
      // Tall bookshelves
      for (const [sx, sw] of [[W * 0.06, W * 0.26], [W * 0.38, W * 0.26], [W * 0.7, W * 0.26]] as const) {
        ctx.fillStyle = '#3a2c1e';
        ctx.fillRect(sx, H * 0.16, sw, H * 0.68);
        // Shelves + book spines
        for (let row = 0; row < 4; row++) {
          const sy = H * (0.26 + row * 0.15);
          ctx.fillStyle = '#5a4632';
          ctx.fillRect(sx, sy, sw, H * 0.015);
          const n = 6;
          for (let i = 0; i < n; i++) {
            ctx.fillStyle = ['#6a994e', '#c94f6d', '#3a86ff', '#f4a261', '#8d99ae', '#7b6cf6'][(i + row) % 6];
            const bw = sw / n;
            ctx.fillRect(sx + i * bw + bw * 0.15, sy - H * (0.08 + frac(i + row) * 0.03), bw * 0.6, H * (0.08 + frac(i + row) * 0.03));
          }
        }
      }
      // Floor
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(0, H * 0.84, W, H * 0.16);
    },
  },
  cave: {
    skyTop: '#3a322a',
    skyBottom: '#0d0a08',
    draw(ctx, W, H, t) {
      // Stalactites
      ctx.fillStyle = '#1d1812';
      for (let i = 0; i < 9; i++) {
        const cx = W * (i + 0.5) / 9;
        const h = H * (0.08 + frac(i * 3) * 0.12);
        ctx.beginPath();
        ctx.moveTo(cx - W * 0.04, 0);
        ctx.lineTo(cx, h);
        ctx.lineTo(cx + W * 0.04, 0);
        ctx.closePath();
        ctx.fill();
      }
      // Stalagmites
      for (let i = 0; i < 6; i++) {
        const cx = W * (i + 0.3) / 6;
        const h = H * (0.06 + frac(i * 7) * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx - W * 0.05, H);
        ctx.lineTo(cx, H - h);
        ctx.lineTo(cx + W * 0.05, H);
        ctx.closePath();
        ctx.fill();
      }
      // Treasure glint
      ctx.fillStyle = `rgba(255, 209, 102, ${(0.3 + 0.3 * Math.abs(Math.sin(t * 2))).toFixed(2)})`;
      disc(ctx, W * 0.5, H * 0.78, H * 0.02);
      disc(ctx, W * 0.44, H * 0.82, H * 0.014);
      disc(ctx, W * 0.56, H * 0.83, H * 0.014);
    },
  },
};

/** Themed actors keyed by actor id. Partial on purpose: unlisted actors
 *  fall back to the per-type generic below. */
const ACTORS: Partial<Record<ThreatActorId, ActorDraw>> = {
  // vehicle / urban
  car: actorCar,
  crane: actorCrane,
  truck: actorTruck,
  mailman: actorMailman,
  bully: actorBully,
  judge: actorJudge,
  quake: actorQuake,
  // animals
  cat: actorCat,
  dog: actorDog,
  wolf: actorWolf,
  raccoon: actorRaccoon,
  deer: actorDeer,
  goat: actorGoat,
  squirrel: actorSquirrel,
  crab: actorCrab,
  snake: actorSnake,
  insect: actorInsect,
  owl: actorOwl,
  // creatures / fantasy
  guardian: actorGuardian,
  monster: actorMonster,
  spirit: actorSpirit,
  // weather / nature forces
  storm: actorStorm,
  fog: actorFog,
  lightning: actorLightning,
  flood: actorFlood,
  tornado: actorTornado,
  fire: actorFire,
  // machines / objects
  vacuum: actorVacuum,
  sprinkler: actorSprinkler,
  drain: actorDrain,
  wave: actorWave,
  bell: actorBell,
  thorn: actorThorn,
  rockfall: actorRockfall,
  // environments
  shelf: actorShelf,
  crowd: actorCrowd,
};

/** Per-type fallback actor ids (used when a threat omits `actor`). */
const GENERIC_ACTOR: Record<ThreatType, ThreatActorId> = {
  timing: 'car',
  combat: 'cat',
  sneak: 'vacuum',
  comfort: 'owl',
};

// ===== vehicle / urban actors =====

function actorCar(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const bob = Math.sin(t * 8) * s * 0.03;
  ctx.fillStyle = C.red;
  // body
  ctx.beginPath();
  ctx.moveTo(x - s, y + bob);
  ctx.lineTo(x - s, y - s * 0.5 + bob);
  ctx.lineTo(x - s * 0.5, y - s * 0.5 + bob);
  ctx.lineTo(x - s * 0.3, y - s * 0.95 + bob);
  ctx.lineTo(x + s * 0.4, y - s * 0.95 + bob);
  ctx.lineTo(x + s * 0.6, y - s * 0.5 + bob);
  ctx.lineTo(x + s, y - s * 0.5 + bob);
  ctx.lineTo(x + s, y + bob);
  ctx.closePath();
  ctx.fill();
  // window
  ctx.fillStyle = '#cfe8ff';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.25, y - s * 0.55 + bob);
  ctx.lineTo(x - s * 0.1, y - s * 0.85 + bob);
  ctx.lineTo(x + s * 0.35, y - s * 0.85 + bob);
  ctx.lineTo(x + s * 0.5, y - s * 0.55 + bob);
  ctx.closePath();
  ctx.fill();
  wheel(ctx, x - s * 0.6, y + s * 0.15, s * 0.32, t);
  wheel(ctx, x + s * 0.6, y + s * 0.15, s * 0.32, t);
  // headlight
  ctx.fillStyle = C.yellow;
  disc(ctx, x + s, y - s * 0.2 + bob, s * 0.1);
}

function actorTruck(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const bob = Math.sin(t * 5) * s * 0.04;
  ctx.fillStyle = C.cream;
  // box
  ctx.fillRect(x - s * 1.2, y - s * 1.1 + bob, s * 1.7, s * 1.2);
  // cab
  ctx.fillStyle = C.blue;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.5, y + bob);
  ctx.lineTo(x + s * 0.5, y - s * 0.9 + bob);
  ctx.lineTo(x + s * 1.2, y - s * 0.6 + bob);
  ctx.lineTo(x + s * 1.2, y + bob);
  ctx.closePath();
  ctx.fill();
  // scoop on the roof
  ctx.fillStyle = C.yellow;
  ell(ctx, x - s * 0.35, y - s * 1.2 + bob, s * 0.28, s * 0.2);
  ctx.fill();
  ctx.fillStyle = C.white;
  ell(ctx, x - s * 0.42, y - s * 1.25 + bob, s * 0.12, s * 0.09);
  ctx.fill();
  wheel(ctx, x - s * 0.8, y + s * 0.2, s * 0.3, t);
  wheel(ctx, x + s * 0.9, y + s * 0.2, s * 0.3, t);
}

function actorCrane(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  ctx.fillStyle = C.orange;
  // tower
  ctx.fillRect(x - s * 0.15, y - s * 1.2, s * 0.3, s * 2.2);
  // lattice
  ctx.strokeStyle = '#8d5a2a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const ly = y - s * 1.2 + i * s * 0.44;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.15, ly);
    ctx.lineTo(x + s * 0.15, ly + s * 0.22);
    ctx.stroke();
  }
  // jib (swings)
  const swing = Math.sin(t * 1.5) * 0.35;
  ctx.save();
  ctx.translate(x, y - s * 1.2);
  ctx.rotate(swing);
  ctx.fillStyle = C.orange;
  ctx.fillRect(-s * 0.3, -s * 0.12, s * 1.9, s * 0.24);
  // cable + hook
  ctx.strokeStyle = '#4a4a5e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 1.5, 0);
  ctx.lineTo(s * 1.5, s * 0.6);
  ctx.stroke();
  ctx.fillStyle = '#4a4a5e';
  ctx.beginPath();
  ctx.arc(s * 1.5, s * 0.7, s * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
  // base
  ctx.fillStyle = '#8d5a2a';
  ctx.fillRect(x - s * 0.5, y + s, s, s * 0.2);
}

// ===== human actors =====

function actorMailman(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  person(ctx, x, y, s, '#3a5a8c', t);
  // cap
  ctx.fillStyle = '#2a4a7c';
  ctx.beginPath();
  ctx.arc(x, y - s * 1.45, s * 0.36, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - s * 0.42, y - s * 1.48, s * 0.84, s * 0.08);
  // package held in front
  ctx.fillStyle = '#b08954';
  ctx.fillRect(x + s * 0.35, y - s * 0.55, s * 0.55, s * 0.5);
  ctx.strokeStyle = '#8a6a3c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.62, y - s * 0.55);
  ctx.lineTo(x + s * 0.62, y - s * 0.05);
  ctx.stroke();
}

function actorBully(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const lunge = Math.sin(t * 4) * s * 0.08;
  person(ctx, x + lunge, y, s * 1.15, '#7a2a3a', t);
  // angry brows
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + lunge - s * 0.28, y - s * 1.5);
  ctx.lineTo(x + lunge - s * 0.1, y - s * 1.42);
  ctx.moveTo(x + lunge + s * 0.28, y - s * 1.5);
  ctx.lineTo(x + lunge + s * 0.1, y - s * 1.42);
  ctx.stroke();
  // fist
  ctx.fillStyle = '#e8c39e';
  disc(ctx, x + lunge + s * 0.85, y - s * 0.3, s * 0.2);
}

function actorJudge(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  person(ctx, x, y, s, '#4a4a6a', t);
  // clipboard
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(x - s * 0.75, y - s * 0.7, s * 0.5, s * 0.65);
  ctx.strokeStyle = '#8a7a5c';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.68, y - s * (0.55 - i * 0.12));
    ctx.lineTo(x - s * 0.35, y - s * (0.55 - i * 0.12));
    ctx.stroke();
  }
  // gavel (raised, taps)
  const tap = Math.abs(Math.sin(t * 3)) * 0.4;
  ctx.save();
  ctx.translate(x + s * 0.6, y - s * 0.8);
  ctx.rotate(-0.6 - tap);
  ctx.fillStyle = '#8a6a3c';
  ctx.fillRect(-s * 0.05, -s * 0.5, s * 0.1, s * 0.5);
  ctx.fillStyle = '#b08954';
  ctx.fillRect(-s * 0.22, -s * 0.62, s * 0.44, s * 0.2);
  ctx.restore();
}

function actorCrowd(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // Three spectators, center one cheering
  for (let i = -1; i <= 1; i++) {
    const px = x + i * s * 0.9;
    const py = y + s * 0.25;
    const ps = s * (i === 0 ? 0.8 : 0.65);
    const color = i === -1 ? '#5a6a8c' : i === 0 ? '#8c5a6a' : '#6a8c5a';
    person(ctx, px, py, ps, color, t + i);
  }
  // Cheer sparkles above the middle figure
  for (let i = 0; i < 3; i++) {
    const a = 0.3 + 0.6 * Math.abs(Math.sin(t * 4 + i * 2));
    ctx.fillStyle = `rgba(255, 209, 102, ${a.toFixed(2)})`;
    disc(ctx, x + (i - 1) * s * 0.3, y - s * 1.1 + Math.sin(t * 3 + i) * s * 0.1, Math.max(1.5, s * 0.06));
  }
}

// ===== quadruped actors (built on quadBody) =====

function actorCat(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  quadBody(ctx, x, y, s, C.gray, t);
  // stripes
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x - s * (0.3 + i * 0.28), y + s * 0.1, s * 0.18, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  // whiskers
  ctx.lineWidth = 1;
  for (const dy of [-0.05, 0.05]) {
    ctx.beginPath();
    ctx.moveTo(x + s * 1.15, y + s * dy);
    ctx.lineTo(x + s * 1.55, y + s * (dy - 0.08));
    ctx.moveTo(x + s * 1.15, y + s * dy);
    ctx.lineTo(x + s * 1.55, y + s * (dy + 0.08));
    ctx.stroke();
  }
}

function actorDog(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  quadBody(ctx, x, y, s, C.fur, t);
  // floppy ears
  ctx.fillStyle = C.furDark;
  ell(ctx, x + s * 0.62, y - s * 0.72, s * 0.16, s * 0.3);
  ctx.fill();
  // tongue (wags)
  ctx.fillStyle = C.red;
  ell(ctx, x + s * 1.28, y - s * 0.12 + Math.sin(t * 8) * s * 0.04, s * 0.09, s * 0.16);
  ctx.fill();
}

function actorWolf(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  quadBody(ctx, x, y, s, '#5c677d', t);
  // spiky mane
  ctx.fillStyle = '#454f61';
  for (let i = 0; i < 4; i++) {
    const mx = x - s * (0.5 + i * 0.3);
    ctx.beginPath();
    ctx.moveTo(mx - s * 0.14, y - s * 0.45);
    ctx.lineTo(mx, y - s * 0.75);
    ctx.lineTo(mx + s * 0.14, y - s * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  // glowing eyes
  ctx.fillStyle = C.yellow;
  disc(ctx, x + s * 1.0, y - s * 0.45, s * 0.07);
}

function actorRaccoon(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  quadBody(ctx, x, y, s, '#8d99ae', t);
  // bandit mask
  ctx.fillStyle = C.ink;
  ell(ctx, x + s * 0.95, y - s * 0.45, s * 0.4, s * 0.14);
  ctx.fill();
  ctx.fillStyle = C.white;
  disc(ctx, x + s * 1.05, y - s * 0.45, s * 0.08);
  // ringed tail
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(2, s * 0.1);
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(x - s * (0.95 + i * 0.2), y - s * 0.1, s * (0.12 + i * 0.08), Math.PI * 0.4, Math.PI * 1.4);
    ctx.stroke();
  }
}

function actorDeer(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  quadBody(ctx, x, y, s, '#a5764a', t);
  // antlers
  ctx.strokeStyle = '#6a4a2a';
  ctx.lineWidth = Math.max(2, s * 0.08);
  for (const side of [-1, 1]) {
    const bx = x + s * 0.85 + side * s * 0.18;
    ctx.beginPath();
    ctx.moveTo(bx, y - s * 0.8);
    ctx.lineTo(bx + side * s * 0.12, y - s * 1.2);
    ctx.moveTo(bx + side * s * 0.06, y - s * 1.05);
    ctx.lineTo(bx + side * s * 0.28, y - s * 1.12);
    ctx.stroke();
  }
  // spots
  ctx.fillStyle = C.cream;
  for (let i = 0; i < 4; i++) disc(ctx, x - s * (0.4 + i * 0.25), y - s * 0.15, s * 0.05);
}

function actorGoat(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  quadBody(ctx, x, y, s, C.cream, t);
  // backward horns
  ctx.strokeStyle = '#8a7a5c';
  ctx.lineWidth = Math.max(2, s * 0.09);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + s * 0.85, y - s * 0.75, s * 0.3, Math.PI * 0.15, Math.PI * 0.85, side === 1);
    ctx.stroke();
  }
  // beard
  ctx.fillStyle = C.cream;
  ctx.beginPath();
  ctx.moveTo(x + s * 1.15, y - s * 0.15);
  ctx.lineTo(x + s * 1.3, y + s * 0.1);
  ctx.lineTo(x + s * 0.95, y - s * 0.1);
  ctx.closePath();
  ctx.fill();
}

function actorSquirrel(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const hop = Math.abs(Math.sin(t * 5)) * s * 0.3;
  quadBody(ctx, x, y - hop, s * 0.8, C.orange, t);
  // big bushy tail curling up
  ctx.fillStyle = C.furDark;
  ctx.beginPath();
  ctx.arc(x - s * 1.1, y - hop - s * 0.6, s * 0.55, Math.PI * 0.2, Math.PI * 1.3);
  ctx.arc(x - s * 1.25, y - hop - s * 0.3, s * 0.28, Math.PI * 1.3, Math.PI * 0.4, true);
  ctx.closePath();
  ctx.fill();
}

// ===== small creatures =====

function actorCrab(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const scuttle = Math.sin(t * 6) * s * 0.15;
  const cx = x + scuttle;
  // legs
  ctx.strokeStyle = '#8c3a3a';
  ctx.lineWidth = Math.max(2, s * 0.1);
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const lift = Math.sin(t * 8 + i + (side === 1 ? Math.PI : 0)) * s * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx + side * s * 0.4, y);
      ctx.lineTo(cx + side * s * (0.7 + i * 0.2), y + s * 0.5 - lift);
      ctx.stroke();
    }
  }
  // body
  ctx.fillStyle = '#c94040';
  ell(ctx, cx, y, s * 0.75, s * 0.5);
  ctx.fill();
  // claws
  for (const side of [-1, 1]) {
    const raise = Math.max(0, Math.sin(t * 4 + side)) * s * 0.25;
    ctx.fillStyle = '#c94040';
    disc(ctx, cx + side * s * 0.85, y - s * 0.55 - raise, s * 0.3);
    ctx.fillStyle = C.cream;
    disc(ctx, cx + side * s * 0.95, y - s * 0.6 - raise, s * 0.1);
  }
  // eyes on stalks
  ctx.strokeStyle = '#8c3a3a';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * s * 0.2, y - s * 0.4);
    ctx.lineTo(cx + side * s * 0.28, y - s * 0.7);
    ctx.stroke();
    ctx.fillStyle = C.ink;
    disc(ctx, cx + side * s * 0.28, y - s * 0.74, s * 0.09);
  }
}

function actorSnake(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // undulating body (single smooth path, no allocation)
  ctx.strokeStyle = '#4a7a3a';
  ctx.lineWidth = s * 0.42;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 1.2, y + s * 0.4);
  for (let i = 1; i <= 6; i++) {
    const px = x - s * 1.2 + (i / 6) * s * 2.4;
    const py = y + Math.sin(t * 4 + i * 1.1) * s * 0.35;
    ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  // head at the end of the path
  const hx = x + s * 1.2;
  const hy = y + Math.sin(t * 4 + 6 * 1.1) * s * 0.35;
  ctx.fillStyle = '#5a8a4a';
  ell(ctx, hx, hy, s * 0.32, s * 0.24);
  ctx.fill();
  ctx.fillStyle = C.ink;
  disc(ctx, hx + s * 0.12, hy - s * 0.08, s * 0.06);
  // tongue flick
  if (Math.sin(t * 6) > 0.4) {
    ctx.strokeStyle = C.red;
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(hx + s * 0.3, hy);
    ctx.lineTo(hx + s * 0.55, hy - s * 0.05);
    ctx.stroke();
  }
}

function actorInsect(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const crawl = Math.sin(t * 3) * s * 0.2;
  const cx = x + crawl;
  // legs
  ctx.strokeStyle = '#3a3a2a';
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const lift = Math.sin(t * 9 + i * 2 + side) * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3 + i * s * 0.3, y);
      ctx.lineTo(cx - s * 0.5 + i * s * 0.4 + side * s * 0.3, y + s * 0.5 - lift);
      ctx.stroke();
    }
  }
  // body segments
  ctx.fillStyle = '#4a4a3a';
  ell(ctx, cx - s * 0.5, y, s * 0.45, s * 0.35);
  ctx.fill();
  ell(ctx, cx, y - s * 0.05, s * 0.32, s * 0.28);
  ctx.fill();
  ctx.fillStyle = '#5a5a4a';
  disc(ctx, cx + s * 0.5, y - s * 0.1, s * 0.28);
  // antennae
  ctx.strokeStyle = '#3a3a2a';
  ctx.lineWidth = Math.max(1, s * 0.05);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.6, y - s * 0.3);
    ctx.quadraticCurveTo(cx + s * (0.8 + side * 0.15), y - s * 0.7, cx + s * (0.75 + side * 0.3), y - s * 0.85);
    ctx.stroke();
  }
  // wing shimmer
  const shimmer = 0.25 + 0.2 * Math.abs(Math.sin(t * 10));
  ctx.fillStyle = `rgba(200, 220, 255, ${shimmer.toFixed(2)})`;
  ell(ctx, cx - s * 0.2, y - s * 0.35, s * 0.4, s * 0.16);
  ctx.fill();
}

// ===== bird =====

function actorOwl(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const bob = Math.sin(t * 1.5) * s * 0.04;
  const oy = y + bob;
  // body
  ctx.fillStyle = '#6a5a4a';
  ell(ctx, x, oy, s * 0.7, s * 0.9);
  ctx.fill();
  // chest
  ctx.fillStyle = C.cream;
  ell(ctx, x, oy + s * 0.3, s * 0.42, s * 0.5);
  ctx.fill();
  // ear tufts
  ctx.fillStyle = '#6a5a4a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.3, oy - s * 0.6);
    ctx.lineTo(x + side * s * 0.55, oy - s * 1.1);
    ctx.lineTo(x + side * s * 0.7, oy - s * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  // big eyes (slow blink)
  const blink = Math.max(0, Math.sin(t * 0.7)) > 0.97 ? 0.2 : 1;
  ctx.fillStyle = C.yellow;
  for (const side of [-1, 1]) {
    ell(ctx, x + side * s * 0.3, oy - s * 0.35, s * 0.28, s * 0.28 * blink);
    ctx.fill();
  }
  ctx.fillStyle = C.ink;
  const look = Math.sin(t * 0.8) * s * 0.06;
  for (const side of [-1, 1]) {
    disc(ctx, x + side * s * 0.3 + look, oy - s * 0.35, s * 0.12 * blink);
  }
  // beak
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.moveTo(x, oy - s * 0.15);
  ctx.lineTo(x - s * 0.14, oy);
  ctx.lineTo(x + s * 0.14, oy);
  ctx.closePath();
  ctx.fill();
  // feet
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.25, oy + s * 0.85);
    ctx.lineTo(x + side * s * 0.25, oy + s * 1.05);
    ctx.stroke();
  }
}

// ===== fantasy creatures =====

function actorGuardian(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const float = Math.sin(t * 2) * s * 0.06;
  const gy = y + float;
  // blocky golem body
  ctx.fillStyle = '#5c677d';
  ctx.fillRect(x - s * 0.55, gy - s * 0.4, s * 1.1, s * 1.1);
  // head
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(x - s * 0.4, gy - s * 1.05, s * 0.8, s * 0.55);
  // glowing eye
  const glow = 0.5 + 0.5 * Math.abs(Math.sin(t * 3));
  ctx.fillStyle = `rgba(255, 209, 102, ${glow.toFixed(2)})`;
  ctx.fillRect(x - s * 0.12, gy - s * 0.9, s * 0.24, s * 0.14);
  // arms
  ctx.fillStyle = '#5c677d';
  ctx.fillRect(x - s * 0.95, gy - s * 0.25, s * 0.3, s * 0.9);
  ctx.fillRect(x + s * 0.65, gy - s * 0.25, s * 0.3, s * 0.9);
  // blade in right arm (rings on the beat)
  const ring = Math.abs(Math.sin(t * 4)) * 0.15;
  ctx.save();
  ctx.translate(x + s * 0.8, gy - s * 0.3);
  ctx.rotate(-0.5 - ring);
  ctx.fillStyle = '#8d99ae';
  ctx.fillRect(-s * 0.06, -s * 1.3, s * 0.12, s * 1.3);
  ctx.fillStyle = C.yellow;
  ctx.fillRect(-s * 0.2, -s * 0.15, s * 0.4, s * 0.12);
  ctx.restore();
  // cracks
  ctx.strokeStyle = '#2a2f3a';
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, gy + s * 0.2);
  ctx.lineTo(x - s * 0.1, gy + s * 0.4);
  ctx.lineTo(x - s * 0.3, gy + s * 0.6);
  ctx.stroke();
}

function actorMonster(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const surge = Math.sin(t * 2) * s * 0.12;
  // water band
  ctx.fillStyle = 'rgba(42, 111, 151, 0.8)';
  ctx.fillRect(x - s * 1.5, y + s * 0.3, s * 3, s * 0.6);
  // fin (sways up out of the water)
  const raise = Math.max(0, Math.sin(t * 1.6)) * s * 0.4;
  ctx.fillStyle = '#1d3a52';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.7 + surge, y + s * 0.35);
  ctx.quadraticCurveTo(x - s * 0.3 + surge, y - s * 1.1 - raise, x + s * 0.5 + surge, y - s * 1.3 - raise);
  ctx.quadraticCurveTo(x + s * 0.7 + surge, y - s * 0.4, x + s * 0.9 + surge, y + s * 0.35);
  ctx.closePath();
  ctx.fill();
  // fin ridge
  ctx.strokeStyle = '#4cc9f0';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.2 + surge, y - s * 0.7 - raise * 0.6);
  ctx.lineTo(x + s * 0.35 + surge, y - s * 0.95 - raise * 0.8);
  ctx.stroke();
  // one eye glint
  const eye = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.2));
  ctx.fillStyle = `rgba(255, 209, 102, ${eye.toFixed(2)})`;
  disc(ctx, x + s * 0.35 + surge, y - s * 0.75 - raise * 0.7, s * 0.09);
}

function actorSpirit(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const hover = Math.sin(t * 2) * s * 0.12;
  const sy = y + hover;
  const alpha = 0.55 + 0.15 * Math.sin(t * 1.5);
  ctx.save();
  ctx.globalAlpha = alpha;
  // ghost body (dome + wavy hem)
  ctx.fillStyle = C.white;
  ctx.beginPath();
  ctx.arc(x, sy - s * 0.2, s * 0.75, Math.PI, 0);
  ctx.lineTo(x + s * 0.75, sy + s * 0.6);
  for (let i = 3; i >= 0; i--) {
    const wx = x + s * 0.75 - (i / 3) * s * 1.5;
    const wy = sy + s * 0.6 + (i % 2 === 0 ? 0 : -s * 0.18);
    ctx.lineTo(wx, wy + Math.sin(t * 3 + i) * s * 0.05);
  }
  ctx.closePath();
  ctx.fill();
  // eyes
  ctx.fillStyle = C.ink;
  const look = Math.sin(t * 0.9) * s * 0.08;
  disc(ctx, x - s * 0.25 + look, sy - s * 0.25, s * 0.11);
  disc(ctx, x + s * 0.25 + look, sy - s * 0.25, s * 0.11);
  // gentle mouth
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.arc(x, sy + s * 0.05, s * 0.12, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
  // faint aura
  ctx.fillStyle = 'rgba(141, 153, 174, 0.12)';
  disc(ctx, x, sy, s * 1.1);
}

// ===== weather / nature-force actors =====

function actorStorm(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // cloud
  ctx.fillStyle = '#5c677d';
  disc(ctx, x - s * 0.5, y - s * 0.4, s * 0.5);
  disc(ctx, x + s * 0.1, y - s * 0.6, s * 0.6);
  disc(ctx, x + s * 0.6, y - s * 0.35, s * 0.45);
  ctx.fillRect(x - s * 0.8, y - s * 0.4, s * 1.6, s * 0.4);
  // rain streaks
  ctx.strokeStyle = 'rgba(76, 201, 240, 0.7)';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  for (let i = 0; i < 7; i++) {
    const rx = x - s * 0.9 + i * s * 0.3;
    const off = (t * 200 + i * 25) % (s * 1.4);
    ctx.beginPath();
    ctx.moveTo(rx, y + off);
    ctx.lineTo(rx - s * 0.08, y + off + s * 0.25);
    ctx.stroke();
  }
  // lightning flash
  if (Math.sin(t * 2.2) > 0.92) {
    ctx.strokeStyle = C.yellow;
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.1, y + s * 0.1);
    ctx.lineTo(x - s * 0.15, y + s * 0.6);
    ctx.lineTo(x + s * 0.1, y + s * 0.6);
    ctx.lineTo(x - s * 0.2, y + s * 1.1);
    ctx.stroke();
  }
}

function actorFog(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // layered drifting mist bands
  for (let i = 0; i < 4; i++) {
    const drift = Math.sin(t * 0.8 + i * 1.3) * s * 0.3;
    const a = 0.2 + 0.12 * Math.sin(t + i);
    ctx.fillStyle = `rgba(220, 230, 240, ${a.toFixed(2)})`;
    ell(ctx, x + drift, y - s * 0.5 + i * s * 0.35, s * (1.1 - i * 0.12), s * 0.28);
    ctx.fill();
  }
  // faint silhouette head peeking through
  ctx.fillStyle = 'rgba(16, 20, 44, 0.35)';
  disc(ctx, x + Math.sin(t * 0.6) * s * 0.2, y + s * 0.1, s * 0.3);
}

function actorLightning(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const flash = Math.abs(Math.sin(t * 3));
  const a = 0.3 + 0.7 * flash;
  // glow
  ctx.fillStyle = `rgba(255, 209, 102, ${(0.1 + 0.2 * flash).toFixed(2)})`;
  disc(ctx, x, y, s * 1.3);
  // bolt
  ctx.strokeStyle = `rgba(255, 224, 130, ${a.toFixed(2)})`;
  ctx.lineWidth = Math.max(3, s * 0.18);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.3, y - s);
  ctx.lineTo(x - s * 0.25, y + s * 0.1);
  ctx.lineTo(x + s * 0.15, y + s * 0.05);
  ctx.lineTo(x - s * 0.35, y + s);
  ctx.stroke();
  ctx.lineJoin = 'miter';
  // impact sparks
  if (flash > 0.7) {
    ctx.fillStyle = `rgba(255, 209, 102, ${a.toFixed(2)})`;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * TAU + t;
      disc(ctx, x - s * 0.35 + Math.cos(ang) * s * 0.3, y + s + Math.sin(ang) * s * 0.15, Math.max(1, s * 0.05));
    }
  }
}

function actorFlood(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // rising water with a wavy crest
  const rise = Math.sin(t * 1.5) * s * 0.1;
  ctx.fillStyle = 'rgba(58, 134, 255, 0.75)';
  ctx.beginPath();
  ctx.moveTo(x - s * 1.4, y + s);
  for (let i = 0; i <= 8; i++) {
    const px = x - s * 1.4 + (i / 8) * s * 2.8;
    const py = y - s * 0.2 + rise + Math.sin(t * 4 + i) * s * 0.12;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x + s * 1.4, y + s);
  ctx.closePath();
  ctx.fill();
  // crest foam
  ctx.strokeStyle = 'rgba(248, 249, 250, 0.7)';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const px = x - s * 1.4 + (i / 8) * s * 2.8;
    const py = y - s * 0.2 + rise + Math.sin(t * 4 + i) * s * 0.12;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // bubbles
  for (let i = 0; i < 4; i++) {
    const by = y - s * 0.4 - ((t * 60 + i * 30) % (s * 1.2));
    ctx.fillStyle = 'rgba(248, 249, 250, 0.5)';
    disc(ctx, x - s * 0.6 + i * s * 0.4, by, Math.max(1, s * 0.05));
  }
}

function actorTornado(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // stacked funnel rings, top narrower, each rotating
  for (let i = 0; i < 6; i++) {
    const ry = y - s * 1.1 + i * s * 0.4;
    const rw = s * (0.25 + i * 0.16);
    const spin = t * 6 + i;
    ctx.strokeStyle = `rgba(180, 195, 210, ${0.35 + i * 0.08})`;
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.beginPath();
    ctx.ellipse(x + Math.sin(spin) * s * 0.1, ry, rw, rw * 0.35, 0, 0, TAU);
    ctx.stroke();
  }
  // debris
  ctx.fillStyle = 'rgba(141, 153, 174, 0.8)';
  for (let i = 0; i < 4; i++) {
    const ang = t * 5 + i * 1.7;
    const rr = s * (0.5 + 0.12 * i);
    disc(ctx, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.5, Math.max(1, s * 0.05));
  }
}

function actorFire(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // layered flickering flames (outer to inner)
  const flick = (i: number) => Math.sin(t * 9 + i * 1.5) * s * 0.1;
  const layer = (w: number, h: number, color: string, i: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w, y + s * 0.7);
    ctx.quadraticCurveTo(x - w * 0.5, y - h * 0.2 + flick(i), x, y - h + flick(i));
    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.2 + flick(i), x + w, y + s * 0.7);
    ctx.closePath();
    ctx.fill();
  };
  layer(s * 0.8, s * 1.4, '#c94040', 0);
  layer(s * 0.55, s * 1.1, C.orange, 1);
  layer(s * 0.32, s * 0.8, C.yellow, 2);
  // embers
  for (let i = 0; i < 5; i++) {
    const ey = y - s * 0.2 - ((t * 80 + i * 28) % (s * 1.5));
    const ex = x + Math.sin(t * 4 + i * 2) * s * 0.3;
    ctx.fillStyle = `rgba(255, 209, 102, ${(0.8 - (y - ey) / (s * 2)).toFixed(2)})`;
    disc(ctx, ex, ey, Math.max(1, s * 0.05));
  }
}

function actorQuake(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // shaking building
  const shake = Math.sin(t * 22) * s * 0.08;
  const bx = x + shake;
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(bx - s * 0.6, y - s * 1.1, s * 1.2, s * 1.9);
  // window grid
  ctx.fillStyle = 'rgba(255, 209, 102, 0.8)';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillRect(bx - s * 0.45 + c * s * 0.35, y - s * 0.95 + r * s * 0.4, s * 0.2, s * 0.22);
    }
  }
  // cracks
  ctx.strokeStyle = '#2a2f3a';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(bx - s * 0.3, y - s * 0.4);
  ctx.lineTo(bx, y - s * 0.1);
  ctx.lineTo(bx - s * 0.2, y + s * 0.3);
  ctx.stroke();
  // ground dust
  for (let i = 0; i < 4; i++) {
    const dy = y + s * 0.8 - ((t * 50 + i * 25) % (s * 0.8));
    ctx.fillStyle = `rgba(180, 170, 150, ${(0.5 - (y + s * 0.8 - dy) / (s * 2)).toFixed(2)})`;
    disc(ctx, x - s * 0.8 + i * s * 0.5, dy, Math.max(1, s * 0.06));
  }
}

// ===== machine / object actors =====

function actorVacuum(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const drive = Math.sin(t * 2) * s * 0.35;
  const vx = x + drive;
  // disc body
  ctx.fillStyle = '#4a4a5e';
  ell(ctx, vx, y, s * 0.85, s * 0.4);
  ctx.fill();
  // bumper
  ctx.strokeStyle = '#8d99ae';
  ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.beginPath();
  ctx.arc(vx, y, s * 0.85, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // spinning sensor light
  const led = Math.sin(t * 8) > 0 ? C.teal : C.red;
  ctx.fillStyle = led;
  disc(ctx, vx, y - s * 0.08, s * 0.1);
  // dust being sucked
  for (let i = 0; i < 3; i++) {
    const p = ((t * 1.5 + i * 0.33) % 1);
    const dx = vx - (1 - p) * s * 1.2;
    const dy = y - (1 - p) * s * 0.3 - s * 0.15;
    ctx.fillStyle = `rgba(141, 153, 174, ${(0.7 * p).toFixed(2)})`;
    disc(ctx, dx, dy, Math.max(1, s * 0.05));
  }
}

function actorSprinkler(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // post + head
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(x - s * 0.08, y, s * 0.16, s * 0.8);
  ctx.fillStyle = '#6a6a7a';
  ell(ctx, x, y - s * 0.1, s * 0.28, s * 0.18);
  ctx.fill();
  // rotating water arc
  const ang = t * 3;
  ctx.strokeStyle = 'rgba(76, 201, 240, 0.75)';
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.1);
  ctx.lineTo(x + Math.cos(ang) * s * 1.1, y - s * 0.1 - Math.abs(Math.sin(ang)) * s * 0.9);
  ctx.stroke();
  // droplets along the arc
  for (let i = 1; i <= 4; i++) {
    const p = i / 5;
    const dx = x + Math.cos(ang) * s * 1.1 * p;
    const dy = y - s * 0.1 - Math.abs(Math.sin(ang)) * s * 0.9 * p + p * s * 0.3;
    ctx.fillStyle = 'rgba(76, 201, 240, 0.6)';
    disc(ctx, dx, dy, Math.max(1, s * 0.05));
  }
  // wet ground patch
  ctx.fillStyle = 'rgba(76, 201, 240, 0.15)';
  ell(ctx, x, y + s * 0.85, s * 1.1, s * 0.2);
  ctx.fill();
}

function actorDrain(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // grate
  ctx.fillStyle = '#3a3a4e';
  ell(ctx, x, y + s * 0.3, s * 0.9, s * 0.4);
  ctx.fill();
  ctx.strokeStyle = '#5a5a6e';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * s * 0.3 - s * 0.12, y + s * 0.3 - s * 0.25);
    ctx.lineTo(x + i * s * 0.3 + s * 0.12, y + s * 0.3 + s * 0.25);
    ctx.stroke();
  }
  // swirl spiraling in (three rotating arcs)
  for (let arm = 0; arm < 3; arm++) {
    const a0 = t * 4 + (arm * TAU) / 3;
    ctx.strokeStyle = `rgba(76, 201, 240, ${0.8 - arm * 0.15})`;
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.beginPath();
    ctx.arc(x, y + s * 0.1, s * (0.7 - arm * 0.18), a0, a0 + Math.PI * 0.8);
    ctx.stroke();
  }
  // water surface above
  ctx.fillStyle = 'rgba(42, 111, 151, 0.5)';
  ell(ctx, x, y - s * 0.5, s * 1.2, s * 0.2);
  ctx.fill();
}

function actorWave(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // two layered swells rolling right
  const layer = (amp: number, speed: number, color: string, yOff: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - s * 1.5, y + s);
    for (let i = 0; i <= 10; i++) {
      const px = x - s * 1.5 + (i / 10) * s * 3;
      const py = y + yOff + Math.sin(t * speed + i * 0.9 + px / (s * 2)) * amp;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(x + s * 1.5, y + s);
    ctx.closePath();
    ctx.fill();
  };
  layer(s * 0.2, 3, 'rgba(58, 134, 255, 0.45)', -s * 0.3);
  layer(s * 0.25, 4, 'rgba(76, 201, 240, 0.65)', 0);
  // foam crest
  for (let i = 0; i < 6; i++) {
    const px = x - s * 1.2 + i * s * 0.45;
    const py = Math.sin(t * 4 + i * 0.9 + px / (s * 2)) * s * 0.25;
    ctx.fillStyle = 'rgba(248, 249, 250, 0.7)';
    disc(ctx, px, py, Math.max(1.5, s * 0.07));
  }
}

function actorBell(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // door frame
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(x - s * 1.2, y - s, s * 2.4, s * 2.2);
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(x - s * 1.05, y - s * 0.85, s * 2.1, s * 1.9);
  // swinging bell
  const swing = Math.sin(t * 6) * 0.45;
  ctx.save();
  ctx.translate(x, y - s * 0.55);
  ctx.rotate(swing);
  // cord
  ctx.strokeStyle = '#8a7a5c';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.3);
  ctx.lineTo(0, 0);
  ctx.stroke();
  // bell body
  ctx.fillStyle = C.yellow;
  ctx.beginPath();
  ctx.moveTo(-s * 0.35, s * 0.3);
  ctx.quadraticCurveTo(-s * 0.35, -s * 0.15, 0, -s * 0.18);
  ctx.quadraticCurveTo(s * 0.35, -s * 0.15, s * 0.35, s * 0.3);
  ctx.closePath();
  ctx.fill();
  // clapper
  ctx.fillStyle = C.ink;
  disc(ctx, Math.sin(swing) * s * 0.15, s * 0.32, s * 0.09);
  ctx.restore();
  // ring arcs when swinging fast
  if (Math.abs(Math.cos(t * 6)) > 0.8) {
    ctx.strokeStyle = `rgba(255, 209, 102, 0.6)`;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(x, y - s * 0.3, s * (0.5 + i * 0.25), Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
}

function actorThorn(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // two bramble bushes with a gap
  const bush = (bx: number, flip: number) => {
    ctx.fillStyle = '#2e5d34';
    for (let i = 0; i < 4; i++) {
      disc(ctx, bx + flip * s * (i * 0.28 - 0.3), y + s * 0.2 + Math.sin(i * 2.1) * s * 0.15, s * (0.35 + 0.08 * i));
    }
    // thorn spikes
    ctx.strokeStyle = '#1e4d2a';
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    for (let i = 0; i < 5; i++) {
      const tx = bx + flip * s * (i * 0.3 - 0.45);
      ctx.beginPath();
      ctx.moveTo(tx, y - s * 0.15);
      ctx.lineTo(tx + flip * s * 0.1, y - s * 0.45 - frac(i) * s * 0.15);
      ctx.stroke();
    }
    // berries
    ctx.fillStyle = C.red;
    for (let i = 0; i < 3; i++) {
      disc(ctx, bx + flip * s * (i * 0.35 - 0.2), y + s * 0.1 + frac(i * 3) * s * 0.2, Math.max(1.5, s * 0.05));
    }
  };
  bush(x - s * 0.8, 1);
  bush(x + s * 0.8, -1);
  // leaves drifting through the gap
  for (let i = 0; i < 3; i++) {
    const ly = y - s * 0.3 - ((t * 40 + i * 40) % (s * 1.2));
    ctx.fillStyle = `rgba(106, 153, 78, ${(0.7 - (y - ly) / (s * 2)).toFixed(2)})`;
    disc(ctx, x + Math.sin(t * 3 + i) * s * 0.2, ly, Math.max(1, s * 0.04));
  }
}

function actorRockfall(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // cliff ledge top-right
  ctx.fillStyle = '#3a4252';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.4, y - s * 1.2);
  ctx.lineTo(x + s * 1.5, y - s * 1.35);
  ctx.lineTo(x + s * 1.5, y - s * 0.3);
  ctx.lineTo(x + s * 0.6, y - s * 0.4);
  ctx.closePath();
  ctx.fill();
  // falling rocks (staggered deterministic cycle)
  for (let i = 0; i < 3; i++) {
    const p = ((t * 0.8 + i * 0.33) % 1);
    const rx = x + s * 0.5 + i * s * 0.25 + Math.sin(i * 3) * s * 0.1;
    const ry = y - s * 1.1 + p * s * 2.2;
    const rr = s * (0.14 + 0.06 * frac(i * 7));
    ctx.fillStyle = i % 2 === 0 ? '#5a6272' : '#4a5262';
    ctx.beginPath();
    ctx.moveTo(rx - rr, ry);
    ctx.lineTo(rx - rr * 0.5, ry - rr);
    ctx.lineTo(rx + rr * 0.7, ry - rr * 0.8);
    ctx.lineTo(rx + rr, ry + rr * 0.4);
    ctx.lineTo(rx - rr * 0.3, ry + rr);
    ctx.closePath();
    ctx.fill();
    // dust on impact
    if (p > 0.92) {
      ctx.fillStyle = 'rgba(180, 170, 150, 0.5)';
      disc(ctx, rx, y + s * 1.1, s * 0.2);
    }
  }
}

function actorShelf(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  // reading nook: shelf with books + lamp glow
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(x - s * 1.2, y + s * 0.3, s * 2.4, s * 0.15);
  // book spines
  const spines = ['#6a994e', '#c94f6d', '#3a86ff', '#f4a261', '#8d99ae'];
  for (let i = 0; i < 5; i++) {
    const bh = s * (0.5 + frac(i * 3) * 0.25);
    ctx.fillStyle = spines[i];
    ctx.fillRect(x - s * 1.05 + i * s * 0.42, y + s * 0.3 - bh, s * 0.32, bh);
  }
  // lamp
  ctx.strokeStyle = '#8a7a5c';
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(x + s * 1.05, y + s * 0.3);
  ctx.lineTo(x + s * 1.05, y - s * 0.5);
  ctx.stroke();
  const glow = 0.5 + 0.15 * Math.sin(t * 2);
  ctx.fillStyle = `rgba(255, 209, 102, ${(0.15 * glow).toFixed(2)})`;
  disc(ctx, x + s * 1.05, y - s * 0.6, s * 0.5);
  ctx.fillStyle = `rgba(255, 209, 102, ${glow.toFixed(2)})`;
  disc(ctx, x + s * 1.05, y - s * 0.6, s * 0.14);
  // floating dust motes
  for (let i = 0; i < 4; i++) {
    const mx = x - s * 0.6 + i * s * 0.4;
    const my = y - s * 0.2 + Math.sin(t * 1.5 + i * 1.7) * s * 0.25;
    ctx.fillStyle = `rgba(248, 249, 250, ${0.25.toFixed(2)})`;
    disc(ctx, mx, my, Math.max(1, s * 0.03));
  }
}

/** Last-resort actor: a simple animated blob with eyes. Always defined so
 *  the module renders even if an actor id is missing from the map. */
function genericActor(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const bob = Math.sin(t * 2.5) * s * 0.06;
  ctx.fillStyle = C.gray;
  ell(ctx, x, y + bob, s * 0.5, s * 0.42);
  ctx.fill();
  ctx.fillStyle = C.ink;
  const look = Math.sin(t * 0.8) * s * 0.06;
  disc(ctx, x - s * 0.16 + look, y + bob - s * 0.1, s * 0.07);
  disc(ctx, x + s * 0.16 + look, y + bob - s * 0.1, s * 0.07);
  ctx.fillStyle = C.white;
  disc(ctx, x - s * 0.16 + look, y + bob - s * 0.1, s * 0.028);
  disc(ctx, x + s * 0.16 + look, y + bob - s * 0.1, s * 0.028);
}

/** Flat dark backdrop fallback (pre-8.2 look). */
function fallbackBackdrop(ctx: Ctx, W: number, H: number, _t: number): void {
  ctx.fillStyle = 'rgba(10, 10, 25, 0.88)';
  ctx.fillRect(0, 0, W, H);
}

/**
 * Draw the full themed scene for a threat: zone backdrop, stage actor,
 * and a readability vignette so the minigame UI (drawn afterwards) stays
 * legible. Pure draw call — no state, no allocation, no loop.
 */
export function drawThreatScene(ctx: Ctx, threat: Threat, t: number, W: number, H: number): void {
  const backdrop = BACKDROPS[threat.scene];
  if (backdrop) {
    // Sky gradient (one gradient per frame is standard canvas practice).
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, backdrop.skyTop);
    g.addColorStop(1, backdrop.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    backdrop.draw(ctx, W, H, t);
  } else {
    fallbackBackdrop(ctx, W, H, t);
  }

  // Stage actor (above the mechanic, below the header text which renders last).
  const actorId = threat.actor ?? GENERIC_ACTOR[threat.type];
  const actor = ACTORS[actorId] ?? genericActor;
  const s = Math.max(26, Math.min(64, Math.min(W, H) * 0.16));
  const stageX = W / 2;
  const stageY = H * 0.33;
  // Soft light pool under the actor (two flat circles, no gradient alloc).
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  disc(ctx, stageX, stageY, s * 1.25);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  disc(ctx, stageX, stageY, s * 0.8);
  actor(ctx, stageX, stageY, s, t);

  // Readability vignette: dim the whole scene, then darken the top (header)
  // and bottom (solve hint) bands where text is drawn by the caller.
  ctx.fillStyle = 'rgba(8, 10, 20, 0.30)';
  ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.24);
  top.addColorStop(0, 'rgba(8, 10, 20, 0.55)');
  top.addColorStop(1, 'rgba(8, 10, 20, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.24);
  const bottom = ctx.createLinearGradient(0, H * 0.8, 0, H);
  bottom.addColorStop(0, 'rgba(8, 10, 20, 0)');
  bottom.addColorStop(1, 'rgba(8, 10, 20, 0.5)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.8, W, H * 0.2);
}
