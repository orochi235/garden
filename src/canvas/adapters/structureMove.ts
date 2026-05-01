import { useGardenStore } from '../../store/gardenStore';
import type { Structure } from '../../model/types';
import type { MoveAdapter, Op } from '@/canvas-kit';

export interface StructurePose { x: number; y: number; widthFt: number; heightFt: number }

export function createStructureMoveAdapter(): MoveAdapter<Structure, StructurePose> {
  function getStructure(id: string): Structure | undefined {
    return useGardenStore.getState().garden.structures.find((s) => s.id === id);
  }
  return {
    getPose(id) {
      const s = getStructure(id);
      if (!s) throw new Error(`structure not found: ${id}`);
      return { x: s.x, y: s.y, widthFt: s.width, heightFt: s.height };
    },
    getParent: (id) => getStructure(id)?.parentId ?? null,
    setPose(id, pose) {
      useGardenStore.getState().updateStructure(id, { x: pose.x, y: pose.y });
    },
    setParent(id, parentId) {
      useGardenStore.getState().updateStructure(id, { parentId: parentId ?? '' });
    },
    applyBatch(ops: Op[], label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply({
        setPose: (id: string, pose: StructurePose) => {
          useGardenStore.getState().updateStructure(id, { x: pose.x, y: pose.y });
        },
        setParent: (id: string, p: string | null) => {
          useGardenStore.getState().updateStructure(id, { parentId: p ?? '' });
        },
        insertObject: (s: Structure) => {
          useGardenStore.setState((st) => ({ garden: { ...st.garden, structures: [...st.garden.structures, s] } }));
        },
        removeObject: (id: string) => {
          useGardenStore.setState((st) => ({ garden: { ...st.garden, structures: st.garden.structures.filter((s) => s.id !== id) } }));
        },
      });
      void label;
    },
  };
}
