import type { ActionDescriptor } from '../types';
import type { LayerId } from '../../model/types';
import { useUiStore } from '../../store/uiStore';

const LAYERS: LayerId[] = ['ground', 'blueprint', 'structures', 'zones', 'plantings'];

function cycleLayer(dir: 1 | -1): void {
  const { activeLayer, layerVisibility } = useUiStore.getState();
  const idx = LAYERS.indexOf(activeLayer);
  for (let step = 1; step < LAYERS.length; step++) {
    const next = (idx + dir * step + LAYERS.length) % LAYERS.length;
    if (layerVisibility[LAYERS[next]]) {
      useUiStore.getState().setActiveLayer(LAYERS[next], true);
      return;
    }
  }
}

export const cycleLayerDownAction: ActionDescriptor = {
  id: 'layers.cycleDown',
  label: 'Next Layer',
  shortcut: { key: 'ArrowDown' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => cycleLayer(-1),
};

export const cycleLayerUpAction: ActionDescriptor = {
  id: 'layers.cycleUp',
  label: 'Previous Layer',
  shortcut: { key: 'ArrowUp' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => cycleLayer(1),
};

export { cycleLayer };
