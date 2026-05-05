import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { animateRotation } from './animateRotation';

function rotate(ccw: boolean): void {
  const ids = useUiStore.getState().selectedIds;
  if (ids.length === 0) return;
  const { garden } = useGardenStore.getState();

  useGardenStore.getState().checkpoint();

  for (const id of ids) {
    const structure = garden.structures.find((s) => s.id === id);
    if (structure && structure.shape !== 'circle') {
      const newRotation = ccw
        ? (structure.rotation - 90 + 360) % 360
        : (structure.rotation + 90) % 360;
      animateRotation(
        id, 'structures',
        structure.width, structure.length,
        structure.length, structure.width,
        newRotation,
      );
      continue;
    }
    const zone = garden.zones.find((z) => z.id === id);
    if (zone) {
      animateRotation(id, 'zones', zone.width, zone.length, zone.length, zone.width, 0);
    }
  }
}

export const rotateCwAction: ActionDescriptor = {
  id: 'objects.rotateCw',
  label: 'Rotate Clockwise',
  shortcut: { key: 'r' },
  scope: 'canvas',
  targets: ['selection'],
  transient: true,
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => rotate(false),
};

export const rotateCcwAction: ActionDescriptor = {
  id: 'objects.rotateCcw',
  label: 'Rotate Counter-Clockwise',
  shortcut: { key: 'R', shift: true },
  scope: 'canvas',
  targets: ['selection'],
  transient: true,
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => rotate(true),
};
