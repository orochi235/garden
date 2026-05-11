import type { ActionDescriptor } from '@/actions/types';
import { useGardenStore } from '@/store/gardenStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Fit-to-content reset for whichever canvas the current `appMode` shows.
 * Both modes own their view in local React state. Garden mode posts a
 * `gardenViewRequest({kind:'reset'})`; seed-starting bumps
 * `seedStartingViewResetTick`. The canvases listen and refit themselves.
 */
export function resetCurrentCanvasView(): void {
  const ui = useUiStore.getState();
  if (ui.appMode === 'seed-starting') {
    ui.bumpSeedStartingViewResetTick();
    return;
  }
  ui.setGardenViewRequest({ kind: 'reset' });
}

/**
 * Switch to a tray and signal the seed-starting canvas to refit. The canvas
 * owns its view locally and listens to `seedStartingViewResetTick` + the
 * current tray id; bumping the tick after switching trays is enough to fit
 * the chosen tray.
 */
export function zoomToTray(trayId: string): void {
  const ui = useUiStore.getState();
  const ss = useGardenStore.getState().garden.nursery;
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
