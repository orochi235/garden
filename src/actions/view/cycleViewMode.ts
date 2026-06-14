import { useUiStore, type ViewMode } from '../../store/uiStore';
import type { ActionDescriptor } from '../types';

const MODES: ViewMode[] = ['select', 'select-area', 'draw', 'pan', 'zoom'];

export const cycleViewModeAction: ActionDescriptor = {
  id: 'view.cycleViewMode',
  label: 'Cycle View Mode',
  shortcut: { key: '`' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => {
    const current = useUiStore.getState().viewMode;
    const idx = MODES.indexOf(current);
    useUiStore.getState().setViewMode(MODES[(idx + 1) % MODES.length]);
  },
};
