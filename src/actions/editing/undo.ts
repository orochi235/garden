import { useGardenStore } from '../../store/gardenStore';
import type { ActionDescriptor } from '../types';

export const undoAction: ActionDescriptor = {
  id: 'editing.undo',
  label: 'Undo',
  shortcut: { key: 'z', meta: true },
  scope: 'global',
  targets: ['none'],
  transient: true,
  canExecute: () => useGardenStore.getState().canUndo(),
  execute: () => {
    useGardenStore.getState().undo();
  },
};
