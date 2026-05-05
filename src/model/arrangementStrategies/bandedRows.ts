import type { Cultivar } from '../cultivars';
import type { BandedRowsConfig, ParentBounds, Slot } from '../arrangement';

export function computeBandedRows(
  config: BandedRowsConfig,
  bounds: ParentBounds,
  _cultivars?: Cultivar[],
): Slot[] {
  const slots: Slot[] = [];
  const m = config.marginFt;
  const usableHeight = bounds.length - 2 * m;
  if (usableHeight <= 0 || config.bands.length === 0) return slots;

  const totalFrac = config.bands.reduce((s, b) => s + b.depthFraction, 0) || 1;
  let cursorY = bounds.y + m;

  for (const band of config.bands) {
    const bandH = (band.depthFraction / totalFrac) * usableHeight;
    if (band.pitchFt <= 0) {
      cursorY += bandH;
      continue;
    }
    const yCenter = cursorY + bandH / 2;
    if (yCenter > bounds.y + bounds.length - m) break;
    for (let x = bounds.x + m + band.pitchFt / 2; x <= bounds.x + bounds.width - m; x += band.pitchFt) {
      slots.push({ x, y: yCenter });
    }
    cursorY += bandH;
  }
  return slots;
}
