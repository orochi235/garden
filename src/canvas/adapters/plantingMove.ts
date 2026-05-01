import { findSnapContainer } from '../findSnapContainer';
import { useGardenStore } from '../../store/gardenStore';
import type { Planting } from '../../model/types';
import type { MoveAdapter, SnapTarget } from '@orochi235/weasel';

export interface PlantingPose { x: number; y: number }

export type PlantingMoveAdapter = MoveAdapter<Planting, PlantingPose> & {
  insertObject(p: Planting): void;
  removeObject(id: string): void;
};

function getPlanting(id: string): Planting | undefined {
  return useGardenStore.getState().garden.plantings.find((p) => p.id === id);
}

function getParent(id: string): { id: string; x: number; y: number } | undefined {
  const garden = useGardenStore.getState().garden;
  return garden.structures.find((s) => s.id === id) ?? garden.zones.find((z) => z.id === id);
}

export function createPlantingMoveAdapter(): PlantingMoveAdapter {
  const adapter: PlantingMoveAdapter = {
    getObject(id) {
      return getPlanting(id);
    },
    getPose(id) {
      const p = getPlanting(id);
      if (!p) throw new Error(`planting not found: ${id}`);
      const parent = p.parentId ? getParent(p.parentId) : undefined;
      return { x: (parent?.x ?? 0) + p.x, y: (parent?.y ?? 0) + p.y };
    },
    getParent(id) {
      return getPlanting(id)?.parentId ?? null;
    },
    setPose(id, pose) {
      const p = getPlanting(id);
      if (!p) return;
      const parent = p.parentId ? getParent(p.parentId) : undefined;
      const localX = pose.x - (parent?.x ?? 0);
      const localY = pose.y - (parent?.y ?? 0);
      useGardenStore.getState().updatePlanting(id, { x: localX, y: localY });
    },
    setParent(id, parentId) {
      useGardenStore.getState().updatePlanting(id, { parentId: parentId ?? '' });
    },
    insertObject(planting) {
      // Insert preserving the original id so undo/redo is stable.
      useGardenStore.setState((s) => ({
        garden: {
          ...s.garden,
          plantings: [...s.garden.plantings, planting],
        },
      }));
    },
    removeObject(id) {
      useGardenStore.getState().removePlanting(id);
    },
    findSnapTarget(draggedId, worldX, worldY): SnapTarget<PlantingPose> | null {
      const planting = getPlanting(draggedId);
      if (!planting) return null;
      const garden = useGardenStore.getState().garden;
      const snap = findSnapContainer(worldX, worldY, planting, garden);
      if (!snap) return null;
      const parent = getParent(snap.id);
      if (!parent) return null;
      return {
        parentId: snap.id,
        slotPose: { x: parent.x + snap.slotX, y: parent.y + snap.slotY },
        metadata: { instant: snap.cursorInside && snap.empty, kind: snap.kind, slotX: snap.slotX, slotY: snap.slotY },
      };
    },
    applyBatch(ops, label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
      void label;
    },
  };
  return adapter;
}
