import { useGardenStore } from '../../store/gardenStore';
import type { Structure } from '../../model/types';
import type { MoveAdapter } from '@orochi235/weasel';

export interface StructurePose { x: number; y: number; widthFt: number; lengthFt: number }

export type StructureMoveAdapter = MoveAdapter<Structure, StructurePose> & {
  insertNode(s: Structure): void;
  removeNode(id: string): void;
};

export function createStructureMoveAdapter(): StructureMoveAdapter {
  function getStructure(id: string): Structure | undefined {
    return useGardenStore.getState().garden.structures.find((s) => s.id === id);
  }
  const adapter: StructureMoveAdapter = {
    getNode(id) {
      return getStructure(id);
    },
    getNodes() {
      return useGardenStore.getState().garden.structures;
    },
    getPose(id) {
      const s = getStructure(id);
      if (!s) throw new Error(`structure not found: ${id}`);
      return { x: s.x, y: s.y, widthFt: s.width, lengthFt: s.length };
    },
    getParent: (id) => getStructure(id)?.parentId ?? null,
    setPose(id, pose) {
      useGardenStore.getState().updateStructure(id, { x: pose.x, y: pose.y });
    },
    setParent(id, parentId) {
      useGardenStore.getState().updateStructure(id, { parentId: parentId ?? '' });
    },
    insertNode(s) {
      useGardenStore.setState((st) => ({ garden: { ...st.garden, structures: [...st.garden.structures, s] } }));
    },
    removeNode(id) {
      useGardenStore.setState((st) => ({ garden: { ...st.garden, structures: st.garden.structures.filter((s) => s.id !== id) } }));
    },
    applyBatch(ops, label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
      void label;
    },
  };
  return adapter;
}
