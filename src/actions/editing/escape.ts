import { useUiStore } from '../../store/uiStore';
import type { ActionDescriptor } from '../types';

/** Escape drops the armed plotting tool, or else the selection. */
export const escapeAction: ActionDescriptor = {
  id: 'editing.escape',
  label: 'Deselect',
  shortcut: { key: 'Escape' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  canExecute: () => {
    const ui = useUiStore.getState();
    return ui.appMode === 'garden' && (ui.plottingTool != null || ui.selectedIds.length > 0);
  },
  execute: () => {
    const ui = useUiStore.getState();
    if (ui.plottingTool) ui.setPlottingTool(null);
    else ui.clearSelection();
  },
};
