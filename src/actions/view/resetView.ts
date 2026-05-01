import type { ActionDescriptor } from '@/actions/types';
import { computeFitView } from '@/canvas-kit';
import { useGardenStore } from '@/store/gardenStore';
import { useUiStore } from '@/store/uiStore';

export const resetViewAction: ActionDescriptor = {
  id: 'view.resetView',
  label: 'Reset View',
  shortcut: { key: '0', meta: true },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  allowDefault: true,
  execute: () => {
    const el = document.querySelector('[data-canvas-container]');
    if (!el) return;
    const { widthFt, heightFt } = useGardenStore.getState().garden;
    const fit = computeFitView(el.clientWidth, el.clientHeight, widthFt, heightFt);
    useUiStore.getState().setZoom(fit.zoom);
    useUiStore.getState().setPan(fit.panX, fit.panY);
  },
};
