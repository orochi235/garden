import type { Tray } from '../../model/seedStarting';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

export interface TrayViewport {
  tray: Tray;
  pxPerInch: number;
  originX: number;
  originY: number;
}

/**
 * Compute the seed-starting tray viewport (origin + scale) given a container rect.
 * Returns null when not in seed-starting mode or no current tray exists.
 *
 * Pure helper — read store state at call time. Use in event handlers / drag
 * begin callbacks where a hook can't be called.
 */
export function getTrayViewport(rect: { width: number; height: number }): TrayViewport | null {
  const ui = useUiStore.getState();
  if (ui.appMode !== 'seed-starting') return null;
  const garden = useGardenStore.getState().garden;
  const tray = garden.seedStarting.trays.find((t) => t.id === ui.currentTrayId);
  if (!tray) return null;
  const pxPerInch = ui.seedStartingZoom;
  const trayPxW = tray.widthIn * pxPerInch;
  const trayPxH = tray.heightIn * pxPerInch;
  return {
    tray,
    pxPerInch,
    originX: (rect.width - trayPxW) / 2 + ui.seedStartingPanX,
    originY: (rect.height - trayPxH) / 2 + ui.seedStartingPanY,
  };
}

/**
 * Same as `getTrayViewport` but takes explicit width/height (for canvas-render
 * paths that already have these in scope and want to avoid a rect lookup).
 */
export function getTrayViewportForSize(
  width: number,
  height: number,
  tray: Tray | null,
): TrayViewport | null {
  if (!tray) return null;
  const ui = useUiStore.getState();
  const pxPerInch = ui.seedStartingZoom;
  const trayPxW = tray.widthIn * pxPerInch;
  const trayPxH = tray.heightIn * pxPerInch;
  return {
    tray,
    pxPerInch,
    originX: (width - trayPxW) / 2 + ui.seedStartingPanX,
    originY: (height - trayPxH) / 2 + ui.seedStartingPanY,
  };
}
