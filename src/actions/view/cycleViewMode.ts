import type { ActionDescriptor } from '../types';
import { useUiStore, type ViewMode } from '../../store/uiStore';

const MODES: ViewMode[] = ['select', 'draw', 'pan', 'zoom'];

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
