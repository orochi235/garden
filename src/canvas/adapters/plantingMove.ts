import { findSnapContainer } from '../findSnapContainer';
import { useGardenStore } from '../../store/gardenStore';
import type { Planting } from '../../model/types';
import { getPlantingParent, plantingWorldPose, worldToLocalForParent } from '../../utils/plantingPose';
import type { MoveAdapter, SnapTarget, LayoutStrategy } from '@orochi235/weasel';
import { plantingLayoutFor } from './plantingLayout';

export interface PlantingPose { x: number; y: number }

export type PlantingMoveAdapter = MoveAdapter<Planting, PlantingPose> & {
  insertObject(p: Planting): void;
  removeObject(id: string): void;
};

function getPlanting(id: string): Planting | undefined {
  return useGardenStore.getState().garden.plantings.find((p) => p.id === id);
}

function getParent(id: string): { id: string; x: number; y: number } | undefined {
  return getPlantingParent(useGardenStore.getState().garden, id);
}

export function createPlantingMoveAdapter(): PlantingMoveAdapter {
  const adapter: PlantingMoveAdapter = {
    getObject(id) {
      return getPlanting(id);
    },
    getObjects() {
      return useGardenStore.getState().garden.plantings;
    },
    getPose(id) {
      const p = getPlanting(id);
      if (!p) throw new Error(`planting not found: ${id}`);
      return plantingWorldPose(useGardenStore.getState().garden, p);
    },
    getParent(id) {
      return getPlanting(id)?.parentId ?? null;
    },
    getChildren(parentId) {
      return useGardenStore.getState().garden.plantings.filter((p) => p.parentId === parentId).map((p) => p.id);
    },
    setPose(id, pose) {
      const p = getPlanting(id);
      if (!p) return;
      const parent = p.parentId ? getParent(p.parentId) : undefined;
      const local = worldToLocalForParent(parent ?? { x: 0, y: 0 }, pose.x, pose.y);
      useGardenStore.getState().updatePlanting(id, { x: local.x, y: local.y });
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
    getLayout(containerId): LayoutStrategy<PlantingPose> | null {
      return plantingLayoutFor(() => useGardenStore.getState().garden, containerId);
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
