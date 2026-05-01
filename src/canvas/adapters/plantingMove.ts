import { findSnapContainer } from '../findSnapContainer';
import { useGardenStore } from '../../store/gardenStore';
import type { Planting } from '../../model/types';
import type { MoveAdapter, Op, SnapTarget } from '@/canvas-kit';

export interface PlantingPose { x: number; y: number }

function getPlanting(id: string): Planting | undefined {
  return useGardenStore.getState().garden.plantings.find((p) => p.id === id);
}

function getParent(id: string): { id: string; x: number; y: number } | undefined {
  const garden = useGardenStore.getState().garden;
  return garden.structures.find((s) => s.id === id) ?? garden.zones.find((z) => z.id === id);
}

export function createPlantingMoveAdapter(): MoveAdapter<Planting, PlantingPose> & {
  insertObject(p: Planting): void;
  removeObject(id: string): void;
  getObject(id: string): Planting | undefined;
} {
  return {
    getPose(id) {
      const p = getPlanting(id);
      if (!p) throw new Error(`planting not found: ${id}`);
      const parent = p.parentId ? getParent(p.parentId) : undefined;
      return { x: (parent?.x ?? 0) + p.x, y: (parent?.y ?? 0) + p.y };
    },
    getParent(id) {
      return getPlanting(id)?.parentId ?? null;
    },
    getObject(id) {
      return getPlanting(id);
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
    applyBatch(ops: Op[], label: string) {
      const checkpoint = useGardenStore.getState().checkpoint;
      checkpoint();
      for (const op of ops) op.apply({
        setPose: (id: string, pose: PlantingPose) => {
          const p = getPlanting(id);
          if (!p) return;
          const parent = p.parentId ? getParent(p.parentId) : undefined;
          useGardenStore.getState().updatePlanting(id, {
            x: pose.x - (parent?.x ?? 0),
            y: pose.y - (parent?.y ?? 0),
          });
        },
        setParent: (id: string, p: string | null) => {
          useGardenStore.getState().updatePlanting(id, { parentId: p ?? '' });
        },
        insertObject: (planting: Planting) => {
          useGardenStore.setState((s) => ({
            garden: { ...s.garden, plantings: [...s.garden.plantings, planting] },
          }));
        },
        removeObject: (id: string) => {
          useGardenStore.getState().removePlanting(id);
        },
      });
      void label;
    },
  };
}
