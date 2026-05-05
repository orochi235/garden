import type { ActionDescriptor } from '@/actions/types';
import { computeFitView } from '@orochi235/weasel';
import { useGardenStore } from '@/store/gardenStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Fit-to-content reset for whichever canvas the current `appMode` shows.
 * Garden mode writes `zoom`/`panX`/`panY`; seed-starting mode writes
 * `seedStartingZoom` and zeroes its pan (seed-starting view auto-centers
 * around the tray and treats pan as an offset *from* center).
 */
export function resetCurrentCanvasView(): void {
  const el = document.querySelector('[data-canvas-container]');
  if (!el) return;
  const ui = useUiStore.getState();
  const garden = useGardenStore.getState().garden;
  if (ui.appMode === 'seed-starting') {
    const tray = garden.seedStarting.trays.find((t) => t.id === ui.currentTrayId);
    if (!tray) return;
    const fit = computeFitView(el.clientWidth, el.clientHeight, tray.widthIn, tray.heightIn);
    ui.setSeedStartingZoom(fit.zoom);
    ui.setSeedStartingPan(0, 0);
    return;
  }
  const fit = computeFitView(el.clientWidth, el.clientHeight, garden.widthFt, garden.heightFt);
  ui.setZoom(fit.zoom);
  ui.setPan(fit.panX, fit.panY);
}

export const resetViewAction: ActionDescriptor = {
  id: 'view.resetView',
  label: 'Reset View',
  shortcut: { key: '0', meta: true },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  allowDefault: true,
  execute: resetCurrentCanvasView,
};
