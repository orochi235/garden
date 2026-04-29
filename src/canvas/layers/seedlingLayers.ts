import type { Seedling, Tray } from '../../model/seedStarting';
import { getCultivar } from '../../model/cultivars';

export interface SownCellEntry {
  row: number;
  col: number;
  seedling: Seedling;
}

export function collectSownCells(tray: Tray, seedlings: Seedling[]): SownCellEntry[] {
  const byId = new Map(seedlings.map((s) => [s.id, s]));
  const out: SownCellEntry[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      const slot = tray.slots[r * tray.cols + c];
      if (slot.state !== 'sown' || !slot.seedlingId) continue;
      const seedling = byId.get(slot.seedlingId);
      if (seedling) out.push({ row: r, col: c, seedling });
    }
  }
  return out;
}

export function renderSeedlings(
  ctx: CanvasRenderingContext2D,
  tray: Tray,
  seedlings: Seedling[],
  pxPerInch: number,
  originX: number,
  originY: number,
  options: { showLabel: boolean },
) {
  const p = tray.cellPitchIn * pxPerInch;
  for (const { row, col, seedling } of collectSownCells(tray, seedlings)) {
    const cultivar = getCultivar(seedling.cultivarId);
    if (!cultivar) continue;
    const cx = originX + col * p + p / 2;
    const cy = originY + row * p + p / 2;
    const radius = (p * 0.7) / 2;

    // Background swatch
    ctx.fillStyle = cultivar.color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Optional label
    if (options.showLabel) {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, p * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = seedling.labelOverride ?? cultivar.name.slice(0, 4);
      ctx.fillText(label, cx, cy);
    }
  }
}
