import type { Structure, Zone, LayerId } from '../model/types';

interface HitResult {
  id: string;
  layer: LayerId;
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

export function hitTestObjects(
  worldX: number, worldY: number,
  structures: Structure[], zones: Zone[],
  activeLayer: LayerId,
): HitResult | null {
  if (activeLayer === 'structures') {
    const sorted = [...structures].sort((a, b) => b.zIndex - a.zIndex);
    for (const s of sorted) {
      if (pointInRect(worldX, worldY, s.x, s.y, s.width, s.height)) {
        return { id: s.id, layer: 'structures' };
      }
    }
  }
  if (activeLayer === 'zones') {
    const sorted = [...zones].sort((a, b) => b.zIndex - a.zIndex);
    for (const z of sorted) {
      if (pointInRect(worldX, worldY, z.x, z.y, z.width, z.height)) {
        return { id: z.id, layer: 'zones' };
      }
    }
  }
  return null;
}
