import type { Cultivar } from '../cultivars';
import type { HexConfig, ParentBounds, Slot } from '../arrangement';
import { defaultPitchFor } from '../cultivarSpacing';

export function computeHex(
  config: HexConfig,
  bounds: ParentBounds,
  cultivars?: Cultivar[],
): Slot[] {
  const pitch = resolvePitch(config.pitchFt, cultivars);
  if (pitch <= 0) return [];

  const m = config.marginFt;
  const rowStep = pitch * Math.sqrt(3) / 2;
  const slots: Slot[] = [];

  let row = 0;
  for (let y = bounds.y + m + pitch / 2; y <= bounds.y + bounds.height - m; y += rowStep) {
    const offset = row % 2 === 0 ? 0 : pitch / 2;
    for (let x = bounds.x + m + pitch / 2 + offset; x <= bounds.x + bounds.width - m; x += pitch) {
      if (inside(x, y, bounds, m)) slots.push({ x, y });
    }
    row++;
  }
  return slots;
}

function resolvePitch(p: number | 'auto', cultivars?: Cultivar[]): number {
  if (p === 'auto') {
    if (!cultivars || cultivars.length === 0) return 0.5;
    const max = Math.max(...cultivars.map((c) => defaultPitchFor(c)));
    return max;
  }
  return p;
}

function inside(px: number, py: number, b: ParentBounds, margin: number): boolean {
  if (b.shape === 'circle') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rx = b.width / 2 - margin;
    const ry = b.height / 2 - margin;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return px >= b.x + margin && px <= b.x + b.width - margin && py >= b.y + margin && py <= b.y + b.height - margin;
}
