import { useGardenStore } from '../../store/gardenStore';
import type { ActionDescriptor } from '../types';

export const redoAction: ActionDescriptor = {
  id: 'editing.redo',
  label: 'Redo',
  shortcut: { key: 'z', meta: true, shift: true },
  scope: 'global',
  targets: ['none'],
  transient: true,
  canExecute: () => useGardenStore.getState().canRedo(),
  execute: () => {
    useGardenStore.getState().redo();
  },
};
