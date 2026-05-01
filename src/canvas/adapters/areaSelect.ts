import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { hitTestArea } from '../hitTest';
import type { AreaSelectAdapter, Op } from '@/canvas-kit';

export function createAreaSelectAdapter(): AreaSelectAdapter {
  const adapter: AreaSelectAdapter = {
    hitTestArea(rect) {
      const { garden } = useGardenStore.getState();
      const hits = hitTestArea(rect, garden.structures, garden.zones, garden.plantings);
      return hits.map((h) => h.id);
    },
    getSelection() {
      return useUiStore.getState().selectedIds;
    },
    setSelection(ids) {
      useUiStore.getState().setSelection(ids);
    },
    applyOps(ops: Op[]) {
      for (const op of ops) op.apply(adapter as never);
    },
  };
  return adapter;
}
