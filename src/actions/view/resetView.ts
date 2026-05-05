import type { ActionDescriptor } from '@/actions/types';
import { computeFitView } from '@orochi235/weasel';
import { useGardenStore } from '@/store/gardenStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Fit-to-content reset for whichever canvas the current `appMode` shows.
 * Garden mode writes `zoom`/`panX`/`panY` directly (its view still lives in
 * the ui store). Seed-starting mode bumps `seedStartingViewResetTick`; the
 * canvas owns its view in local React state and refits when the tick
 * increments.
 */
export function resetCurrentCanvasView(): void {
  const el = document.querySelector('[data-canvas-container]');
  if (!el) return;
  const ui = useUiStore.getState();
  const garden = useGardenStore.getState().garden;
  if (ui.appMode === 'seed-starting') {
    ui.bumpSeedStartingViewResetTick();
    return;
  }
  const fit = computeFitView(el.clientWidth, el.clientHeight, garden.widthFt, garden.heightFt);
  ui.setZoom(fit.zoom);
  ui.setPan(fit.panX, fit.panY);
}

/**
 * Switch to a tray and signal the seed-starting canvas to refit. The canvas
 * owns its view locally and listens to `seedStartingViewResetTick` + the
 * current tray id; bumping the tick after switching trays is enough to fit
 * the chosen tray.
 */
export function zoomToTray(trayId: string): void {
  const ui = useUiStore.getState();
  const ss = useGardenStore.getState().garden.seedStarting;
  if (!ss.trays.find((t) => t.id === trayId)) return;
  ui.setCurrentTrayId(trayId);
  ui.bumpSeedStartingViewResetTick();
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
