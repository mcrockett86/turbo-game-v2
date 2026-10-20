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
  cellW: number; // grid cell this node owns (keeps art inside it)
  cellH: number;
}

export class MapPanel {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // CSS-pixel display size of the shared canvas (backing store is dpr-scaled
  // by BaseRenderer.resizeToDisplay, so divide by the effective dpr).
  private cssDims(): { w: number; h: number } {
    if (!this.canvas) return { w: 0, h: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr };
  }

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
    const { w: W, h: H } = this.cssDims();
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

    // Legend (bottom). Entries are laid out left-to-right by measured width so
    // the labels can never run into each other, and every entry here is a
    // marker the map actually draws — the old legend advertised a "● you" dot
    // that no code ever rendered, and a "🏠 home" entry that just duplicated
    // the home node's own icon.
    const ly = py + PANEL_H - 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '10px sans-serif';
    const legend: Array<[string, string]> = [
      ['#9fd0ff', '● item'],
      ['#8bc34a', '● npc'],
      ['#ffd700', '◆ gate'],
    ];
    let lx = px + 12;
    for (const [color, text] of legend) {
      ctx.fillStyle = color;
      ctx.fillText(text, lx, ly);
      lx += ctx.measureText(text).width + 14;
    }

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

  /**
   * Lay zones out on a grid that always fits the panel.
   *
   * The previous layout put every zone on one ring (R≈85px). With 19 zones
   * that is ~28px of arc per node — less than the 26px node circle, so nodes
   * and their labels overlapped each other by design, and the element dots
   * scattered on top of the neighbours. A grid guarantees a cell per zone at
   * any zone count: hub first, then explored, then unexplored.
   */
  private computeLayout(): void {
    this.placed = [];
    if (!this.store) return;
    const zones = this.store.zones();
    if (zones.length === 0) return;

    const hub = this.store.hubZone();
    const order = (z: MappedZone) =>
      z.id === hub ? 0 : z.explored ? 1 : 2;
    const sorted = [...zones].sort((a, b) => {
      const d = order(a) - order(b);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    const mapW = PANEL_W - 16;
    const mapH = PANEL_H - 52;
    const cols = Math.max(1, Math.min(sorted.length, Math.ceil(Math.sqrt(sorted.length * (mapW / mapH)))));
    const rows = Math.ceil(sorted.length / cols);
    const cellW = mapW / cols;
    const cellH = mapH / rows;

    sorted.forEach((z, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = cellW * (col + 0.5);
      const y = cellH * (row + 0.5) - 4; // small lift so the label has room
      this.placed.push({ zone: z, x, y, scale: 1, cellW, cellH });
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

    // Label — explored zones only, truncated to the node's cell so labels of
    // adjacent zones can never run into each other. The panel's own contract
    // is "labeled nodes for explored zones, faint dots otherwise"; labeling
    // everything printed the names of places the player has never reached.
    if (z.explored || isCurrent) {
      ctx.font = isCurrent ? 'bold 9px sans-serif' : '9px sans-serif';
      ctx.fillStyle = isCurrent ? '#fff' : '#c8c8e0';
      const wanted = isHome ? 'HOME' : shortName(z.name);
      let label = wanted;
      const maxW = p.cellW - 4;
      while (label.length > 1 && ctx.measureText(label).width > maxW) {
        label = label.slice(0, -1);
      }
      if (label !== wanted && label.length > 1) label = label.slice(0, -1) + '…';
      ctx.fillText(label, x, y + Math.min(NODE_R + 8, p.cellH / 2 - 2));
    }

    // Elements (items + gates + home) for explored zones, scaled around the node
    if (!z.explored || z.elements.length === 0) return;
    // World offsets run to ±100, so a raw 0.55 scale scattered dots ~±55px
    // from the node — across the panel onto other zones entirely. Compress
    // into a halo that stays inside this node's own grid cell so dots can
    // never land on a neighbour's node or label.
    const elScale = 0.55;
    const HALO = Math.max(6, Math.min(18, p.cellW / 2 - 8, p.cellH / 2 - 10));
    for (const el of z.elements.slice(0, 12)) {
      let dx = el.x * elScale;
      let dy = el.y * elScale;
      const d = Math.hypot(dx, dy);
      if (d > HALO) {
        dx = (dx / d) * HALO;
        dy = (dy / d) * HALO;
      }
      const ex = x + dx;
      const ey = y + dy;
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
