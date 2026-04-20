import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

export const deleteAction: ActionDescriptor = {
  id: 'editing.delete',
  label: 'Delete',
  shortcut: [{ key: 'Delete' }, { key: 'Backspace' }],
  scope: 'canvas',
  targets: ['selection', 'objects'],
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => {
    const ids = useUiStore.getState().selectedIds;
    const { garden, removeStructure, removeZone, removePlanting } = useGardenStore.getState();
    for (const id of ids) {
      if (garden.structures.find((s) => s.id === id)) removeStructure(id);
      else if (garden.zones.find((z) => z.id === id)) removeZone(id);
      else if (garden.plantings.find((p) => p.id === id)) removePlanting(id);
    }
    useUiStore.getState().clearSelection();
  },
};
