import { findSnapContainer } from '../findSnapContainer';
import { useGardenStore } from '../../store/gardenStore';
import type { Planting } from '../../model/types';
import { getPlantableBounds } from '../../model/types';
import { getPlantingParent, plantingWorldPose, worldToLocalForParent } from '../../utils/plantingPose';
import { validCellsForContainer } from '../../model/cellOccupancy';
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

export function createPlantingMoveAdapter(): Required<PlantingMoveAdapter> {
  const adapter: Required<PlantingMoveAdapter> = {
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
      const garden = useGardenStore.getState().garden;
      const parentObj =
        garden.structures.find((s) => s.id === p.parentId) ??
        garden.zones.find((z) => z.id === p.parentId);
      // Snap the live drag pose to the nearest valid cell when the parent is
      // cell-grid. This makes the move-ghost jump cell-to-cell during drag
      // instead of sliding continuously, matching the post-commit position.
      let snapped = pose;
      if (parentObj && parentObj.layout?.type === 'cell-grid') {
        const cellSize = parentObj.layout.cellSizeFt;
        const bounds = getPlantableBounds(parentObj);
        const validCells = validCellsForContainer(bounds, cellSize);
        if (validCells.length > 0) {
          let best = validCells[0];
          let bestDist = Infinity;
          for (const cell of validCells) {
            const d = (cell.x - pose.x) ** 2 + (cell.y - pose.y) ** 2;
            if (d < bestDist) { bestDist = d; best = cell; }
          }
          snapped = { x: best.x, y: best.y };
        }
      }
      const parent = p.parentId ? getParent(p.parentId) : undefined;
      const local = worldToLocalForParent(parent ?? { x: 0, y: 0 }, snapped.x, snapped.y);
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
      // Apply reparent ops before transform ops on the same element so that
      // setPose computes local coords relative to the new parent, not the old.
      const sorted = [...ops].sort((a, b) => {
        const ar = a.coalesceKey?.startsWith('reparent:') ? 0 : 1;
        const br = b.coalesceKey?.startsWith('reparent:') ? 0 : 1;
        return ar - br;
      });
      for (const op of sorted) op.apply(adapter);
      void label;
    },
  };
  return adapter;
}
