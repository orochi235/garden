import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

export const duplicateAction: ActionDescriptor = {
  id: 'objects.duplicate',
  label: 'Duplicate',
  shortcut: { key: 'd', meta: true },
  scope: 'canvas',
  targets: ['selection'],
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => {
    const ids = useUiStore.getState().selectedIds;
    const { garden, addStructure, addZone } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;

    const pastedIds: string[] = [];
    for (const id of ids) {
      const s = garden.structures.find((st) => st.id === id);
      if (s) {
        const offsetX = Math.max(cellSize, s.width);
        const offsetY = Math.max(cellSize, s.length);
        addStructure({ type: s.type, x: s.x + offsetX, y: s.y + offsetY, width: s.width, length: s.length });
        const newStructures = useGardenStore.getState().garden.structures;
        pastedIds.push(newStructures[newStructures.length - 1].id);
        continue;
      }
      const z = garden.zones.find((zn) => zn.id === id);
      if (z) {
        addZone({ x: z.x + cellSize, y: z.y + cellSize, width: z.width, length: z.length });
        const newZones = useGardenStore.getState().garden.zones;
        pastedIds.push(newZones[newZones.length - 1].id);
      }
    }

    if (pastedIds.length > 0) {
      useUiStore.getState().select(pastedIds[0]);
      for (let i = 1; i < pastedIds.length; i++) {
        useUiStore.getState().addToSelection(pastedIds[i]);
      }
    }
  },
};
