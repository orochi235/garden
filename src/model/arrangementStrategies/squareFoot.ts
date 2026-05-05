import type { Cultivar } from '../cultivars';
import type { ParentBounds, Slot, SquareFootConfig } from '../arrangement';

export function computeSquareFoot(
  config: SquareFootConfig,
  bounds: ParentBounds,
  _cultivars?: Cultivar[],
): Slot[] {
  const slots: Slot[] = [];
  const m = config.marginFt;
  const cell = config.cellSizeFt;
  if (cell <= 0) return slots;

  const x0 = bounds.x + m;
  const y0 = bounds.y + m;
  const x1 = bounds.x + bounds.width - m;
  const y1 = bounds.y + bounds.length - m;

  for (let cx = x0 + cell / 2; cx <= x1; cx += cell) {
    for (let cy = y0 + cell / 2; cy <= y1; cy += cell) {
      if (insideBounds(cx, cy, bounds, m)) {
        slots.push({ x: cx, y: cy });
      }
    }
  }
  return slots;
}

function insideBounds(px: number, py: number, b: ParentBounds, margin: number): boolean {
  if (b.shape === 'circle') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.length / 2;
    const rx = b.width / 2 - margin;
    const ry = b.length / 2 - margin;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return (
    px >= b.x + margin &&
    px <= b.x + b.width - margin &&
    py >= b.y + margin &&
    py <= b.y + b.length - margin
  );
}
