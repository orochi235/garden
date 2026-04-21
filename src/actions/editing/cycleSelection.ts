import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

function getLayerObjects(): { id: string }[] {
  const { activeLayer } = useUiStore.getState();
  const { garden } = useGardenStore.getState();
  if (activeLayer === 'structures') return garden.structures;
  if (activeLayer === 'zones') return garden.zones;
  if (activeLayer === 'plantings') return garden.plantings;
  return [];
}

function cycleSelection(dir: 1 | -1): void {
  const objects = getLayerObjects();
  if (objects.length === 0) return;

  const { selectedIds } = useUiStore.getState();
  const lastSelected = selectedIds[selectedIds.length - 1];
  const currentIdx = objects.findIndex((o) => o.id === lastSelected);

  let nextIdx: number;
  if (currentIdx === -1) {
    nextIdx = dir === 1 ? 0 : objects.length - 1;
  } else {
    nextIdx = (currentIdx + dir + objects.length) % objects.length;
  }

  useUiStore.getState().select(objects[nextIdx].id);
}

export const cycleSelectionNextAction: ActionDescriptor = {
  id: 'editing.cycleSelectionNext',
  label: 'Select Next Object',
  shortcut: { key: 'Tab' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => cycleSelection(1),
};

export const cycleSelectionPrevAction: ActionDescriptor = {
  id: 'editing.cycleSelectionPrev',
  label: 'Select Previous Object',
  shortcut: { key: 'Tab', shift: true },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => cycleSelection(-1),
};
