import type { LayoutStrategy, MoveAdapter, Op, SnapTarget } from '@orochi235/weasel';
import { getCultivar } from '../../model/cultivars';
import type { Planting, Structure, Zone } from '../../model/types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  getPlantingParent,
  plantingWorldPose,
  worldToLocalForParent,
} from '../../utils/plantingPose';
import { findSnapContainer } from '../findSnapContainer';
import { type HitResult, hitTestArea, hitTestStack, type WorldRect } from '../hitTest';
import { plantingLayoutFor } from './plantingLayout';

export interface ScenePose {
  x: number;
  y: number;
}

export interface StructureNode {
  kind: 'structure';
  id: string;
  data: Structure;
}
export interface ZoneNode {
  kind: 'zone';
  id: string;
  data: Zone;
}
export interface PlantingNode {
  kind: 'planting';
  id: string;
  data: Planting;
}
export type SceneNode = StructureNode | ZoneNode | PlantingNode;

export interface SceneBounds {
  x: number;
  y: number;
  width: number;
  length: number;
}

export type GardenSceneAdapter = MoveAdapter<SceneNode, ScenePose> & {
  /** Layout strategy for a container id, or null for non-containers. */
  getLayout(id: string): LayoutStrategy<ScenePose> | null;
  /** Top-most hit at world point, or null. */
  hitTest(worldX: number, worldY: number): SceneNode | null;
  /** All overlapping hits at world point, top-most first. Powers alt-cycle. */
  hitAll(worldX: number, worldY: number): SceneNode[];
  /** World-space AABB. Plantings use cultivar footprint as the box. */
  getBounds(id: string): SceneBounds | null;
  /** Area-select hit: world-space rect → ids. */
  hitTestArea(rect: WorldRect): string[];
  /** Selection accessors mirror useUiStore. */
  getSelection(): string[];
  setSelection(ids: string[]): void;
  /**
   * Apply ops. Checkpoints iff a `label` is supplied (move/op commits);
   * transient (no checkpoint) when called without a label (area-select).
   * Optional to satisfy both MoveAdapter and AreaSelectAdapter contracts.
   */
  applyOps?(ops: Op[], label?: string): void;
};

function findNode(id: string): SceneNode | undefined {
  const g = useGardenStore.getState().garden;
  const s = g.structures.find((x) => x.id === id);
  if (s) return { kind: 'structure', id: s.id, data: s };
  const z = g.zones.find((x) => x.id === id);
  if (z) return { kind: 'zone', id: z.id, data: z };
  const p = g.plantings.find((x) => x.id === id);
  if (p) return { kind: 'planting', id: p.id, data: p };
  return undefined;
}

function allNodes(): SceneNode[] {
  const g = useGardenStore.getState().garden;
  const nodes: SceneNode[] = [];
  for (const s of g.structures) nodes.push({ kind: 'structure', id: s.id, data: s });
  for (const z of g.zones) nodes.push({ kind: 'zone', id: z.id, data: z });
  for (const p of g.plantings) nodes.push({ kind: 'planting', id: p.id, data: p });
  return nodes;
}

export function createGardenSceneAdapter(): Required<GardenSceneAdapter> {
  const adapter: Required<GardenSceneAdapter> = {
    getNode(id) {
      return findNode(id);
    },
    getNodes() {
      return allNodes();
    },
    getPose(id) {
      const node = findNode(id);
      if (!node) throw new Error(`scene node not found: ${id}`);
      switch (node.kind) {
        case 'planting':
          return plantingWorldPose(useGardenStore.getState().garden, node.data);
        case 'structure':
        case 'zone':
          return { x: node.data.x, y: node.data.y };
      }
    },
    getParent(id) {
      const node = findNode(id);
      if (!node) return null;
      switch (node.kind) {
        case 'planting':
          return node.data.parentId || null;
        case 'structure':
        case 'zone':
          return node.data.parentId ?? null;
      }
    },
    getChildren(parentId) {
      const g = useGardenStore.getState().garden;
      const out: string[] = [];
      for (const s of g.structures) if (s.parentId === parentId) out.push(s.id);
      for (const z of g.zones) if (z.parentId === parentId) out.push(z.id);
      for (const p of g.plantings) if (p.parentId === parentId) out.push(p.id);
      return out;
    },
    setPose(id, pose) {
      const node = findNode(id);
      if (!node) return;
      const store = useGardenStore.getState();
      switch (node.kind) {
        case 'planting': {
          const parent = node.data.parentId
            ? getPlantingParent(store.garden, node.data.parentId)
            : undefined;
          const local = worldToLocalForParent(parent ?? { x: 0, y: 0 }, pose.x, pose.y);
          store.updatePlanting(id, { x: local.x, y: local.y });
          return;
        }
        case 'structure':
          store.updateStructure(id, { x: pose.x, y: pose.y });
          return;
        case 'zone':
          store.updateZone(id, { x: pose.x, y: pose.y });
          return;
      }
    },
    setParent(id, parentId) {
      const node = findNode(id);
      if (!node) return;
      const store = useGardenStore.getState();
      switch (node.kind) {
        case 'planting': {
          // Preserve world pose: recompute local x/y against the new parent.
          const world = plantingWorldPose(store.garden, node.data);
          const newParent = parentId ? getPlantingParent(store.garden, parentId) : undefined;
          const local = worldToLocalForParent(newParent ?? { x: 0, y: 0 }, world.x, world.y);
          // skipRearrange: the user dragged to a specific world point; preserve
          // those local coords instead of letting rearrangePlantings overwrite them.
          store.updatePlanting(
            id,
            { parentId: parentId ?? '', x: local.x, y: local.y },
            { skipRearrange: true },
          );
          return;
        }
        case 'structure':
          store.updateStructure(id, { parentId: parentId ?? null });
          return;
        case 'zone':
          store.updateZone(id, { parentId: parentId ?? null });
          return;
      }
    },
    getLayout(id): LayoutStrategy<ScenePose> | null {
      // Only containers (and zones) carry an arrangement; plantingLayoutFor
      // returns null for everything else, in which case useMove falls through
      // to free-space pose commit.
      return plantingLayoutFor(() => useGardenStore.getState().garden, id);
    },
    findSnapTarget(draggedId, worldX, worldY): SnapTarget<ScenePose> | null {
      const node = findNode(draggedId);
      if (!node || node.kind !== 'planting') return null;
      const garden = useGardenStore.getState().garden;
      const snap = findSnapContainer(worldX, worldY, node.data, garden);
      if (!snap) return null;
      const parent = getPlantingParent(garden, snap.id);
      if (!parent) return null;
      return {
        parentId: snap.id,
        slotPose: { x: parent.x + snap.slotX, y: parent.y + snap.slotY },
        metadata: {
          instant: snap.cursorInside && snap.empty,
          // True only when the cursor is genuinely inside the container bounds
          // (vs merely within its snap-attraction radius). The snap-back guard
          // reads this to reject attraction-only releases, which the move's
          // layout pass would not commit. See `requirePlantingDrop`.
          cursorInside: snap.cursorInside,
          kind: snap.kind,
          slotX: snap.slotX,
          slotY: snap.slotY,
        },
      };
    },
    applyOps(ops, label) {
      // Checkpoint only for labeled commits (move/ops). Unlabeled calls are
      // transient (area-select) and must not push a history entry.
      if (label !== undefined) useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
    },
    hitTest(worldX, worldY) {
      const hit = adapter.hitAll(worldX, worldY)[0];
      return hit ?? null;
    },
    hitAll(worldX, worldY) {
      const g = useGardenStore.getState().garden;
      const results: HitResult[] = hitTestStack(worldX, worldY, g.plantings, g.structures, g.zones);
      const out: SceneNode[] = [];
      for (const r of results) {
        const node = findNode(r.id);
        if (node) out.push(node);
      }
      return out;
    },
    getBounds(id) {
      const node = findNode(id);
      if (!node) return null;
      switch (node.kind) {
        case 'structure':
        case 'zone':
          return {
            x: node.data.x,
            y: node.data.y,
            width: node.data.width,
            length: node.data.length,
          };
        case 'planting': {
          const cult = getCultivar(node.data.cultivarId);
          const half = (cult?.footprintFt ?? 0.5) / 2;
          const { x: cx, y: cy } = plantingWorldPose(useGardenStore.getState().garden, node.data);
          return { x: cx - half, y: cy - half, width: half * 2, length: half * 2 };
        }
      }
    },
    hitTestArea(rect) {
      const g = useGardenStore.getState().garden;
      return hitTestArea(rect, g.structures, g.zones, g.plantings).map((r) => r.id);
    },
    getSelection() {
      return useUiStore.getState().selectedIds;
    },
    setSelection(ids) {
      useUiStore.getState().setSelection(ids);
    },
  };
  return adapter;
}
