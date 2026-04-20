import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

export const selectAllAction: ActionDescriptor = {
  id: 'editing.selectAll',
  label: 'Select All',
  shortcut: { key: 'a', meta: true },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => {
    const { activeLayer } = useUiStore.getState();
    const { garden } = useGardenStore.getState();
    let ids: string[] = [];
    if (activeLayer === 'structures') ids = garden.structures.map((s) => s.id);
    else if (activeLayer === 'zones') ids = garden.zones.map((z) => z.id);
    else if (activeLayer === 'plantings') ids = garden.plantings.map((p) => p.id);
    if (ids.length > 0) {
      useUiStore.getState().select(ids[0]);
      for (let i = 1; i < ids.length; i++) {
        useUiStore.getState().addToSelection(ids[i]);
      }
    }
  },
};
