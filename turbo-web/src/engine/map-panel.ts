/**
 * MapPanel — top-right minimap of the world. Shows explored zones as nodes
 * (labeled), the home node, and discovered elements (items, gates, home)
 * positioned relatively within each zone. Fills in as the player explores.
 */

import { MapStore, MappedZone, MappedElement } from './map-store';

const PANEL_W = 270;
const PANEL_H = 250;
const NODE_R = 13;
const MARGIN = 10;

interface PlacedZone {
  zone: MappedZone;
  x: number; // panel-local center x
  y: number; // panel-local center y
  scale: number; // world->panel scale for this zone
}

export class MapPanel {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private store: MapStore | null = null;
  private visible = true;
  private placed: PlacedZone[] = [];

  init(canvas: HTMLCanvasElement, store: MapStore): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  render(): void {
    if (!this.visible || !this.ctx || !this.canvas || !this.store) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const px = W - PANEL_W - MARGIN;
    const py = MARGIN;

    // Compute zone node positions (panel-local)
    this.computeLayout();

    // Backdrop + panel
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,22,0.82)';
    ctx.strokeStyle = 'rgba(120,160,255,0.45)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, py, PANEL_W, PANEL_H, 10);
    ctx.fill();
    ctx.stroke();

    // Header
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('🗺️ Map', px + 12, py + 20);
    // progress: explored / total zones
    const zones = this.store.zones();
    const explored = zones.filter((z) => z.explored).length;
    ctx.fillStyle = '#8888aa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${explored}/${zones.length}`, px + PANEL_W - 12, py + 20);

    // Legend (bottom)
    const ly = py + PANEL_H - 12;
    ctx.textAlign = 'left';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#9fd0ff';
    ctx.fillText('● item', px + 12, ly);
    ctx.fillStyle = '#ffd700';
    ctx.fillText('◆ gate', px + 52, ly);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('🏠 home', px + 96, ly);
    ctx.fillStyle = '#8fd0ff';
    ctx.fillText('● you', px + 150, ly);

    // Map area
    const mapX = px + 8;
    const mapY = py + 30;
    const mapW = PANEL_W - 16;
    const mapH = PANEL_H - 52;

    // Draw connections (gates) between explored zones as faint lines
    ctx.strokeStyle = 'rgba(120,160,255,0.18)';
    ctx.lineWidth = 1;
    const byId = new Map(this.placed.map((p) => [p.zone.id, p]));
    const hub = this.store.hubZone();
    for (const p of this.placed) {
      if (!p.zone.explored) continue;
      if (hub && hub !== p.zone.id) {
        const h = byId.get(hub);
        if (h) {
          ctx.beginPath();
          ctx.moveTo(mapX + p.x, mapY + p.y);
          ctx.lineTo(mapX + h.x, mapY + h.y);
          ctx.stroke();
        }
      }
    }

    // Draw each zone node
    for (const p of this.placed) {
      this.drawZone(ctx, mapX + p.x, mapY + p.y, p, px, py);
    }

    ctx.restore();
  }

  /** Place explored zones in a ring around the hub; unexplored as faint dots. */
  private computeLayout(): void {
    this.placed = [];
    if (!this.store) return;
    const zones = this.store.zones();
    const cx = PANEL_W / 2;
    const cy = (PANEL_H - 22) / 2 + 6; // center of the map area (panel-local)
    const R = Math.min(PANEL_W, PANEL_H) * 0.34;

    const hub = this.store.hubZone();
    const home = this.store.zone('home');
    const others = zones.filter((z) => z.id !== hub && z.id !== 'home');

    const ring: string[] = [];
    if (hub) ring.push(hub);
    for (const z of others) ring.push(z.id);
    if (home) ring.push('home');

    const n = ring.length;
    ring.forEach((id, i) => {
      const z = this.store!.zone(id);
      if (!z) return;
      // angle: start at top, go clockwise
      const angle = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
      let x = cx;
      let y = cy;
      if (n > 1) {
        x = cx + Math.cos(angle) * R;
        y = cy + Math.sin(angle) * R;
      }
      this.placed.push({ zone: z, x, y, scale: 1 });
    });
  }

  private drawZone(ctx: CanvasRenderingContext2D, x: number, y: number, p: PlacedZone, panelX: number, panelY: number): void {
    const z = p.zone;
    const isCurrent = z.current;
    const isHome = z.id === 'home';

    // Node circle
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = z.explored
      ? isHome ? '#3a2a2a' : 'rgba(70,90,150,0.55)'
      : 'rgba(60,60,80,0.4)';
    ctx.fill();
    ctx.lineWidth = isCurrent ? 3 : 1.5;
    ctx.strokeStyle = isCurrent ? '#8fd0ff' : isHome ? '#ff6b6b' : 'rgba(140,160,220,0.6)';
    ctx.stroke();

    // Emoji / home icon
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = z.explored ? '#fff' : 'rgba(255,255,255,0.5)';
    ctx.fillText(isHome ? '🏠' : z.emoji, x, y + 1);

    // Label (always shown)
    ctx.font = isCurrent ? 'bold 10px sans-serif' : '10px sans-serif';
    ctx.fillStyle = isCurrent ? '#fff' : z.explored ? '#c8c8e0' : 'rgba(200,200,220,0.55)';
    const label = isHome ? 'HOME' : shortName(z.name);
    ctx.fillText(label, x, y + NODE_R + 9);

    // Elements (items + gates + home) for explored zones, scaled around the node
    if (!z.explored || z.elements.length === 0) return;
    const elScale = 0.55;
    for (const el of z.elements.slice(0, 12)) {
      const ex = x + el.x * elScale;
      const ey = y + el.y * elScale;
      // keep within panel bounds
      if (ex < panelX + 6 || ex > panelX + PANEL_W - 6 || ey < panelY + 26 || ey > panelY + PANEL_H - 20) continue;
      drawElement(ctx, ex, ey, el.kind);
    }
  }
}

function drawElement(ctx: CanvasRenderingContext2D, x: number, y: number, kind: MappedElement['kind']): void {
  if (kind === 'gate') {
    ctx.fillStyle = '#ffd700';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  } else if (kind === 'home') {
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏠', x, y);
  } else {
    // item / npc = small dot
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = kind === 'npc' ? '#8bc34a' : '#9fd0ff';
    ctx.fill();
  }
}

function shortName(name: string): string {
  // Strip leading emoji + spaces, shorten
  const clean = name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return clean.length > 12 ? clean.slice(0, 11) + '…' : clean || name;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
