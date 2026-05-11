import type { ActionDescriptor } from '../types';
import type { LayerId } from '../../model/types';
import { useUiStore } from '../../store/uiStore';

const ALL_LAYERS: LayerId[] = ['ground', 'blueprint', 'structures', 'zones', 'plantings'];
const NURSERY_LAYERS: LayerId[] = ['zones', 'plantings'];

function cycleLayer(dir: 1 | -1): void {
  const { activeLayer, layerVisibility, appMode } = useUiStore.getState();
  const layers = appMode === 'nursery' ? NURSERY_LAYERS : ALL_LAYERS;
  const idx = layers.indexOf(activeLayer);
  for (let step = 1; step < layers.length; step++) {
    const next = (idx + dir * step + layers.length) % layers.length;
    if (layerVisibility[layers[next]]) {
      useUiStore.getState().setActiveLayer(layers[next], true);
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
  execute: () => cycleLayer(1),
};

export const cycleLayerUpAction: ActionDescriptor = {
  id: 'layers.cycleUp',
  label: 'Previous Layer',
  shortcut: { key: 'ArrowUp' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => cycleLayer(-1),
};

export { cycleLayer };
