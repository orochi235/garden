import type { Cultivar } from '../cultivars';
import { computeSlots, type MultiConfig, type ParentBounds, type Slot } from '../arrangement';

export function computeMulti(
  config: MultiConfig,
  bounds: ParentBounds,
  cultivars?: Cultivar[],
): Slot[] {
  const out: Slot[] = [];
  for (const region of config.regions) {
    const sub = denormalize(region.bounds, bounds);
    if (!sub) continue;
    const inner = computeSlots(region.arrangement, sub, cultivars);
    for (const slot of inner) out.push({ ...slot, regionId: region.id });
  }
  return out;
}

function denormalize(r: { x: number; y: number; w: number; h: number }, parent: ParentBounds): ParentBounds | null {
  const x0 = parent.x + Math.max(0, r.x) * parent.width;
  const y0 = parent.y + Math.max(0, r.y) * parent.length;
  const x1 = parent.x + Math.min(1, r.x + r.w) * parent.width;
  const y1 = parent.y + Math.min(1, r.y + r.h) * parent.length;
  const width = x1 - x0;
  const length = y1 - y0;
  if (width <= 0 || length <= 0) return null;
  return { x: x0, y: y0, width, length, shape: 'rectangle' };
}
