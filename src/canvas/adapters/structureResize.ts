import { useGardenStore } from '../../store/gardenStore';
import type { Structure } from '../../model/types';
import type { ResizeAdapter } from '@orochi235/weasel';

export interface StructureResizePose { x: number; y: number; width: number; length: number }

export function createStructureResizeAdapter(): ResizeAdapter<Structure, StructureResizePose> {
  function getStructure(id: string): Structure | undefined {
    return useGardenStore.getState().garden.structures.find((s) => s.id === id);
  }
  const adapter: ResizeAdapter<Structure, StructureResizePose> = {
    getNode(id) {
      return getStructure(id);
    },
    getPose(id) {
      const s = getStructure(id);
      if (!s) throw new Error(`structure not found: ${id}`);
      return { x: s.x, y: s.y, width: s.width, length: s.length };
    },
    setPose(id, pose) {
      useGardenStore.getState().updateStructure(id, {
        x: pose.x,
        y: pose.y,
        width: pose.width,
        length: pose.length,
      });
    },
    applyBatch(ops, _label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
    },
  };
  return adapter;
}
