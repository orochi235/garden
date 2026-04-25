import { getCultivar } from '../model/cultivars';
import type { LayerId, Planting, Structure, Zone } from '../model/types';
import { useUiStore } from '../store/uiStore';
import type { ViewTransform } from '../utils/grid';

interface HitResult {
  id: string;
  layer: LayerId;
}

/** Which handle was hit. Corners: nw/ne/sw/se. Edges: n/e/s/w. */
export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface HandleHitResult {
  id: string;
  layer: LayerId;
  handle: HandlePosition;
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function pointInEllipse(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx === 0 || ry === 0) return false;
  return (px - cx) ** 2 / rx ** 2 + (py - cy) ** 2 / ry ** 2 <= 1;
}

function getHandleScreenPositions(
  obj: { x: number; y: number; width: number; height: number },
  view: ViewTransform,
) {
  const sx = view.panX + obj.x * view.zoom;
  const sy = view.panY + obj.y * view.zoom;
  const sw = obj.width * view.zoom;
  const sh = obj.height * view.zoom;
  return [
    { pos: 'nw' as const, cx: sx, cy: sy },
    { pos: 'n' as const, cx: sx + sw / 2, cy: sy },
    { pos: 'ne' as const, cx: sx + sw, cy: sy },
    { pos: 'e' as const, cx: sx + sw, cy: sy + sh / 2 },
    { pos: 'se' as const, cx: sx + sw, cy: sy + sh },
    { pos: 's' as const, cx: sx + sw / 2, cy: sy + sh },
    { pos: 'sw' as const, cx: sx, cy: sy + sh },
    { pos: 'w' as const, cx: sx, cy: sy + sh / 2 },
  ];
}

/**
 * Hit-test resize handles of selected objects. Uses screen coords because
 * handles are a fixed pixel size regardless of zoom.
 */
export function hitTestHandles(
  screenX: number,
  screenY: number,
  selectedIds: string[],
  structures: Structure[],
  zones: Zone[],
  view: ViewTransform,
): HandleHitResult | null {
  if (selectedIds.length === 0) return null;
  const hitRadius = 6; // px from handle center

  const allObjects = [
    ...structures.map((s) => ({ ...s, layer: 'structures' as LayerId })),
    ...zones.map((z) => ({ ...z, layer: 'zones' as LayerId })),
  ];

  for (const obj of allObjects) {
    if (!selectedIds.includes(obj.id)) continue;
    const handles = getHandleScreenPositions(obj, view);
    for (const h of handles) {
      if (Math.abs(screenX - h.cx) <= hitRadius && Math.abs(screenY - h.cy) <= hitRadius) {
        return { id: obj.id, layer: obj.layer, handle: h.pos };
      }
    }
  }
  return null;
}

/**
 * Hit-test plantings by checking distance to each planting's world-space center
 * against its footprint radius.
 */
export function hitTestPlantings(
  worldX: number,
  worldY: number,
  plantings: Planting[],
  structures: Structure[],
  zones: Zone[],
): HitResult | null {
  if (useUiStore.getState().layerLocked.plantings) return null;

  const parentMap = new Map<string, Structure | Zone>();
  for (const z of zones) parentMap.set(z.id, z);
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s);
  }

  // Count children per parent
  const childCount = new Map<string, number>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

  for (const p of plantings) {
    const parent = parentMap.get(p.parentId);
    if (!parent) continue;
    const cultivar = getCultivar(p.cultivarId);

    // Single-arrangement container with one plant fills the container
    const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;
    const half = isSingleFill
      ? Math.min(parent.width, parent.height) / 2
      : (cultivar?.footprintFt ?? 0.5) / 2;
    const isCircle = isSingleFill && 'shape' in parent && parent.shape === 'circle';

    const cx = parent.x + p.x;
    const cy = parent.y + p.y;
    const dx = worldX - cx;
    const dy = worldY - cy;
    const hit = isCircle
      ? dx * dx + dy * dy <= half * half
      : Math.abs(dx) <= half && Math.abs(dy) <= half;
    if (hit) {
      return { id: p.id, layer: 'plantings' };
    }
  }
  return null;
}

export function hitTestObjects(
  worldX: number,
  worldY: number,
  structures: Structure[],
  zones: Zone[],
  activeLayer: LayerId,
): HitResult | null {
  if (useUiStore.getState().layerLocked[activeLayer]) return null;
  if (activeLayer === 'structures') {
    const sorted = [...structures].sort((a, b) => b.zIndex - a.zIndex);
    for (const s of sorted) {
      const hit =
        s.shape === 'circle'
          ? pointInEllipse(worldX, worldY, s.x, s.y, s.width, s.height)
          : pointInRect(worldX, worldY, s.x, s.y, s.width, s.height);
      if (hit) {
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

/**
 * Hit-test objects across ALL layers (ignores activeLayer filter).
 * Returns the hit result with the layer the object belongs to, or null.
 * Respects layer lock — locked layers are skipped.
 */
export function hitTestAllLayers(
  worldX: number,
  worldY: number,
  structures: Structure[],
  zones: Zone[],
): HitResult | null {
  const locked = useUiStore.getState().layerLocked;

  // Check in reverse render order (topmost layer first):
  // plantings > zones > structures > blueprint > ground
  if (!locked.zones) {
    const sorted = [...zones].sort((a, b) => b.zIndex - a.zIndex);
    for (const z of sorted) {
      if (pointInRect(worldX, worldY, z.x, z.y, z.width, z.height)) {
        return { id: z.id, layer: 'zones' };
      }
    }
  }

  if (!locked.structures) {
    const sorted = [...structures].sort((a, b) => b.zIndex - a.zIndex);
    for (const s of sorted) {
      const hit =
        s.shape === 'circle'
          ? pointInEllipse(worldX, worldY, s.x, s.y, s.width, s.height)
          : pointInRect(worldX, worldY, s.x, s.y, s.width, s.height);
      if (hit) return { id: s.id, layer: 'structures' };
    }
  }

  return null;
}

/** Axis-aligned bounding box in world coordinates. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function ellipseOverlapsRect(
  ex: number, ey: number, ew: number, eh: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  // Quick AABB rejection
  if (!rectsOverlap(ex, ey, ew, eh, rx, ry, rw, rh)) return false;
  // For non-tiny objects, AABB overlap is close enough
  return true;
}

/**
 * Find all objects whose bounds intersect a world-space rectangle.
 * Returns IDs grouped by layer. Respects layer locks.
 */
export function hitTestArea(
  rect: WorldRect,
  structures: Structure[],
  zones: Zone[],
  plantings: Planting[],
): HitResult[] {
  const locked = useUiStore.getState().layerLocked;
  const results: HitResult[] = [];

  if (!locked.structures) {
    for (const s of structures) {
      const hit = s.shape === 'circle'
        ? ellipseOverlapsRect(s.x, s.y, s.width, s.height, rect.x, rect.y, rect.width, rect.height)
        : rectsOverlap(s.x, s.y, s.width, s.height, rect.x, rect.y, rect.width, rect.height);
      if (hit) results.push({ id: s.id, layer: 'structures' });
    }
  }

  if (!locked.zones) {
    for (const z of zones) {
      if (rectsOverlap(z.x, z.y, z.width, z.height, rect.x, rect.y, rect.width, rect.height)) {
        results.push({ id: z.id, layer: 'zones' });
      }
    }
  }

  if (!locked.plantings) {
    const parentMap = new Map<string, Structure | Zone>();
    for (const z of zones) parentMap.set(z.id, z);
    for (const s of structures) {
      if (s.container) parentMap.set(s.id, s);
    }
    for (const p of plantings) {
      const parent = parentMap.get(p.parentId);
      if (!parent) continue;
      const cx = parent.x + p.x;
      const cy = parent.y + p.y;
      if (cx >= rect.x && cx <= rect.x + rect.width &&
          cy >= rect.y && cy <= rect.y + rect.height) {
        results.push({ id: p.id, layer: 'plantings' });
      }
    }
  }

  return results;
}

/** Returns the CSS cursor for a given handle position. */
export function handleCursor(handle: HandlePosition): string {
  const cursors: Record<HandlePosition, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
  };
  return cursors[handle];
}
