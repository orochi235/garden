import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampStructureZoneToGardenBounds,
  detectStructureClash,
} from './structureMoveBehaviors';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createGardenSceneAdapter, type ScenePose } from '../adapters/gardenScene';
import type { GestureContext } from '@orochi235/weasel';
import type { SceneNode } from '../adapters/gardenScene';

function makeCtx(
  draggedIds: string[],
  origin: Map<string, ScenePose>,
): GestureContext<ScenePose, SceneNode> {
  return {
    draggedIds,
    origin,
    current: new Map(origin),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    // Adapter is referenced via `useGardenStore` inside the behaviors —
    // this stub satisfies the type without participating in the test.
    adapter: {} as never,
    scratch: {},
  };
}

describe('clampStructureZoneToGardenBounds', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('clamps a structure dragged past the right edge to the right edge', () => {
    // 20×20 garden by default. Add a 4×4 structure at (10, 10).
    useGardenStore.getState().addStructure({ type: 'patio', x: 10, y: 10, width: 4, height: 4 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = clampStructureZoneToGardenBounds(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 10, y: 10 }]]);
    const ctx = makeCtx([s.id], origin);
    // Propose dragging far past the right edge: pose (25, 10) → AABB right
    // edge would be at 29 > 20.
    const result = behavior.onMove!(ctx, { x: 25, y: 10 });
    expect(result).toBeTruthy();
    // Right edge should land at widthFt=20: x = 16.
    expect((result as { pose: ScenePose }).pose).toEqual({ x: 16, y: 10 });
  });

  it('clamps past the top-left corner to (0,0)', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 3, height: 3 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = clampStructureZoneToGardenBounds(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 5, y: 5 }]]);
    const ctx = makeCtx([s.id], origin);
    const result = behavior.onMove!(ctx, { x: -3, y: -2 });
    expect((result as { pose: ScenePose }).pose).toEqual({ x: 0, y: 0 });
  });

  it('passes through poses that stay in bounds', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 1, y: 1, width: 2, height: 2 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = clampStructureZoneToGardenBounds(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 1, y: 1 }]]);
    const ctx = makeCtx([s.id], origin);
    expect(behavior.onMove!(ctx, { x: 5, y: 7 })).toBeUndefined();
  });
});

describe('detectStructureClash', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().setDragClashIds([]);
  });

  it('populates clash ids when the dragged structure overlaps another', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 3, height: 3 });
    useGardenStore.getState().addStructure({ type: 'patio', x: 10, y: 10, width: 3, height: 3 });
    const [a, b] = useGardenStore.getState().garden.structures;
    const adapter = createGardenSceneAdapter();
    const behavior = detectStructureClash(adapter);

    const origin = new Map<string, ScenePose>([[a.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([a.id], origin);
    // Drag a so its AABB overlaps b at (10,10,3,3).
    behavior.onMove!(ctx, { x: 11, y: 11 });
    expect(useUiStore.getState().dragClashIds).toEqual([b.id]);
  });

  it('clears clash ids when the dragged structure is in free space', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, height: 2 });
    useGardenStore.getState().addStructure({ type: 'patio', x: 15, y: 15, width: 2, height: 2 });
    const [a] = useGardenStore.getState().garden.structures;
    const adapter = createGardenSceneAdapter();
    const behavior = detectStructureClash(adapter);

    // Seed a stale clash and confirm the move clears it.
    useUiStore.getState().setDragClashIds(['stale']);
    const origin = new Map<string, ScenePose>([[a.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([a.id], origin);
    behavior.onMove!(ctx, { x: 5, y: 5 });
    expect(useUiStore.getState().dragClashIds).toEqual([]);
  });

  it('clears on end', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 3, height: 3 });
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 3, height: 3 });
    const [a] = useGardenStore.getState().garden.structures;
    const adapter = createGardenSceneAdapter();
    const behavior = detectStructureClash(adapter);

    useUiStore.getState().setDragClashIds(['x', 'y']);
    const origin = new Map<string, ScenePose>([[a.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([a.id], origin);
    behavior.onEnd!(ctx);
    expect(useUiStore.getState().dragClashIds).toEqual([]);
  });
});
