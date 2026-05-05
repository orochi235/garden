import type { ActionDescriptor } from '@/actions/types';
import { computeFitView } from '@orochi235/weasel';
import { useGardenStore } from '@/store/gardenStore';
import { useUiStore } from '@/store/uiStore';
import {
  seedStartingWorldBounds,
  trayWorldOrigin,
} from '@/canvas/adapters/seedStartingScene';

/**
 * Fit-to-content reset for whichever canvas the current `appMode` shows.
 * Garden mode writes `zoom`/`panX`/`panY`; seed-starting mode writes
 * `seedStartingZoom` and zeroes its pan (seed-starting view auto-centers
 * around the union AABB of all trays and treats pan as an offset *from*
 * that center).
 */
export function resetCurrentCanvasView(): void {
  const el = document.querySelector('[data-canvas-container]');
  if (!el) return;
  const ui = useUiStore.getState();
  const garden = useGardenStore.getState().garden;
  if (ui.appMode === 'seed-starting') {
    const bounds = seedStartingWorldBounds(garden.seedStarting);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const fit = computeFitView(el.clientWidth, el.clientHeight, bounds.width, bounds.height);
    ui.setSeedStartingZoom(fit.zoom);
    ui.setSeedStartingPan(0, 0);
    return;
  }
  const fit = computeFitView(el.clientWidth, el.clientHeight, garden.widthFt, garden.heightFt);
  ui.setZoom(fit.zoom);
  ui.setPan(fit.panX, fit.panY);
}

/**
 * Zoom and pan to fit a single tray, centered in the viewport. Used by the
 * tray switcher so clicking a tray brings it into focus regardless of where
 * it sits in the multi-tray world layout. Pan is set so the tray's center
 * aligns with the viewport center under the seed-starting canvas's
 * "world bounds centered + pan offset" view math.
 */
export function zoomToTray(trayId: string): void {
  const el = document.querySelector('[data-canvas-container]');
  if (!el) return;
  const ui = useUiStore.getState();
  const garden = useGardenStore.getState().garden;
  const ss = garden.seedStarting;
  const tray = ss.trays.find((t) => t.id === trayId);
  if (!tray) return;
  const fit = computeFitView(el.clientWidth, el.clientHeight, tray.widthIn, tray.heightIn);
  ui.setSeedStartingZoom(fit.zoom);
  // The canvas centers the union bounds and adds (panX, panY) on top.
  // We want the tray's center aligned to the viewport center, so the pan
  // offset is the world-space delta from the union center to the tray
  // center, scaled to pixels.
  const bounds = seedStartingWorldBounds(ss);
  const o = trayWorldOrigin(tray, ss);
  const trayCx = o.x + tray.widthIn / 2;
  const trayCy = o.y + tray.heightIn / 2;
  const unionCx = bounds.width / 2;
  const unionCy = bounds.height / 2;
  const panX = (unionCx - trayCx) * fit.zoom;
  const panY = (unionCy - trayCy) * fit.zoom;
  ui.setSeedStartingPan(panX, panY);
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
