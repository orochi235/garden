import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import { AREA_SELECT_DRAG_KIND, type AreaSelectPutative } from '../drag/areaSelectDrag';
import { hitTestTrayLabel } from '../layers/trayLayersWorld';
import { toKitView, type View } from '../layers/worldLayerData';
import { findSeedlingsInRect, hitTestCellInches } from '../nurseryHitTest';
import type {
  GesturePoint,
  NurseryClickGesture,
  NurseryDragGesture,
  NurseryDragHandle,
} from './nurseryGestures';

/** Live marquee rect, world inches. */
interface Marquee {
  startX: number;
  startY: number;
  x: number;
  y: number;
  shift: boolean;
}

function publishMarquee(m: Marquee | null): void {
  const ui = useUiStore.getState();
  if (!m) {
    if (ui.dragPreview && ui.dragPreview.kind === AREA_SELECT_DRAG_KIND) {
      ui.setDragPreview(null);
    }
    return;
  }
  const putative: AreaSelectPutative = {
    start: { x: m.startX, y: m.startY },
    current: { x: m.x, y: m.y },
    shiftHeld: m.shift,
  };
  ui.setDragPreview({ kind: AREA_SELECT_DRAG_KIND, putative });
}

/** True when (worldX, worldY) lies on a seedling-occupied cell. */
export function pointHitsSeedling(worldX: number, worldY: number): boolean {
  const ss = useGardenStore.getState().garden.nursery;
  for (const tray of ss.trays) {
    const o = trayWorldOrigin(tray, ss);
    const cell = hitTestCellInches(tray, worldX - o.x, worldY - o.y);
    if (!cell) continue;
    const slot = tray.slots[cell.row * tray.cols + cell.col];
    if (slot.state === 'sown' && slot.seedlingId) return true;
  }
  return false;
}

/**
 * Marquee area-select for the nursery.
 *
 * Last in the router's drag order, so it takes every press the seedling-move
 * and fill gestures declined — i.e. a press on empty tray background. It also
 * declines outright while a palette drag-to-sow is in flight.
 *
 * The live marquee renders through the framework's `dragPreviewLayer` /
 * `areaSelectDrag.renderPreview`: each `move` writes the current rect into
 * `useUiStore.dragPreview` (kind `AREA_SELECT_DRAG_KIND`) and `end` clears it.
 * Commit reads `findSeedlingsInRect` over all trays (via `trayWorldOrigin`, so
 * cell centers land in world space) and replaces — or, with shift, extends —
 * `useUiStore.selectedIds`.
 */
export const seedMarqueeGesture: NurseryDragGesture = {
  id: 'seed-marquee',
  start(p: GesturePoint): NurseryDragHandle | null {
    // A palette drag-to-sow is active; defer to the sow gesture.
    if (useUiStore.getState().seedDragCultivarId) return null;
    if (pointHitsSeedling(p.worldX, p.worldY)) return null;

    const marquee: Marquee = {
      startX: p.worldX,
      startY: p.worldY,
      x: p.worldX,
      y: p.worldY,
      shift: p.shift,
    };
    publishMarquee(marquee);

    return {
      move(m) {
        marquee.x = m.worldX;
        marquee.y = m.worldY;
        publishMarquee(marquee);
      },
      end() {
        const ss = useGardenStore.getState().garden.nursery;
        const rect = {
          x: marquee.startX,
          y: marquee.startY,
          width: marquee.x - marquee.startX,
          height: marquee.y - marquee.startY,
        };
        const ids = findSeedlingsInRect(ss.trays, ss.seedlings, rect, (t) =>
          trayWorldOrigin(t, ss),
        );
        const ui = useUiStore.getState();
        if (marquee.shift) {
          ui.setSelection(Array.from(new Set([...ui.selectedIds, ...ids])));
        } else {
          ui.setSelection(ids);
        }
        publishMarquee(null);
      },
      cancel() {
        publishMarquee(null);
      },
    };
  },
};

export interface SeedSelectOptions {
  /** Called when the user clicks a tray label. The canvas shows an inline rename input. */
  onLabelClick?: (trayId: string) => void;
  /** Reads the current view — the label hit area is sized in screen px. */
  getView?: () => View;
}

/**
 * Click semantics for the nursery: tray-label rename, and clear-on-empty.
 *
 * Declines a click that landed on a seedling — selection for those is settled
 * on the press by the seedling-move gesture.
 */
export function createSeedClickGesture(options: SeedSelectOptions = {}): NurseryClickGesture {
  const { onLabelClick, getView } = options;
  return {
    id: 'seed-select',
    click(p: GesturePoint): boolean {
      if (pointHitsSeedling(p.worldX, p.worldY)) return false;

      const view = getView?.();
      if (onLabelClick && view) {
        const ss = useGardenStore.getState().garden.nursery;
        const hit = hitTestTrayLabel(ss.trays, ss, toKitView(view), p.worldX, p.worldY);
        if (hit) {
          onLabelClick(hit.id);
          return true;
        }
      }

      // No-drag click on empty: clear selection unless shift-extending (garden
      // mode parity).
      if (!p.shift) useUiStore.getState().clearSelection();
      return true;
    },
  };
}
