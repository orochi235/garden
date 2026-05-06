import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampStructureZoneToGardenBounds,
  detectStructureClash,
} from './structureMoveBehaviors';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createStructure } from '../../model/types';
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
    useGardenStore.getState().addStructure({ type: 'patio', x: 10, y: 10, width: 4, length: 4 });
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
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 3, length: 3 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = clampStructureZoneToGardenBounds(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 5, y: 5 }]]);
    const ctx = makeCtx([s.id], origin);
    const result = behavior.onMove!(ctx, { x: -3, y: -2 });
    expect((result as { pose: ScenePose }).pose).toEqual({ x: 0, y: 0 });
  });

  it('passes through poses that stay in bounds', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 1, y: 1, width: 2, length: 2 });
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
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 3, length: 3 });
    useGardenStore.getState().addStructure({ type: 'patio', x: 10, y: 10, width: 3, length: 3 });
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
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    useGardenStore.getState().addStructure({ type: 'patio', x: 15, y: 15, width: 2, length: 2 });
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

  it('multi-select group-drag: clamp shifts primary so secondary stays in bounds', () => {
    // Two grouped structures: primary at (5, 5) and secondary at (15, 10).
    // Garden is 20×20. Drag primary to the right; the secondary's right edge
    // would otherwise leave bounds first. Clamp uses the union AABB and
    // shifts the primary so the secondary lands at the right edge.
    const a = createStructure({ type: 'patio', x: 5, y: 5, width: 3, length: 3, groupId: 'g1' });
    const b = createStructure({ type: 'patio', x: 15, y: 10, width: 3, length: 3, groupId: 'g1' });
    useGardenStore.setState((s) => ({ garden: { ...s.garden, structures: [a, b] } }));
    const adapter = createGardenSceneAdapter();
    const behavior = clampStructureZoneToGardenBounds(adapter);

    // Drag dx = +5: primary would go to (10,5) and secondary's right edge
    // (15+5+3=23) would exceed widthFt=20 by 3.
    const origin = new Map<string, ScenePose>([
      [a.id, { x: 5, y: 5 }],
      [b.id, { x: 15, y: 10 }],
    ]);
    const ctx = makeCtx([a.id, b.id], origin);
    const result = behavior.onMove!(ctx, { x: 10, y: 5 });
    expect(result).toBeTruthy();
    // Union AABB right edge would be at 23; clamp shifts primary back by -3.
    // Primary lands at (10 - 3, 5) = (7, 5).
    expect((result as { pose: ScenePose }).pose).toEqual({ x: 7, y: 5 });
  });

  it('multi-select group-drag: clash detector flags non-dragged structure overlap on a secondary', () => {
    // Three structures. Drag a + b together (grouped); c is a non-dragged
    // bystander. Drag delta lands b on top of c — clash should report c.
    const a = createStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2, groupId: 'g1' });
    const b = createStructure({ type: 'patio', x: 5, y: 0, width: 2, length: 2, groupId: 'g1' });
    const c = createStructure({ type: 'patio', x: 12, y: 0, width: 2, length: 2 });
    useGardenStore.setState((s) => ({ garden: { ...s.garden, structures: [a, b, c] } }));
    const adapter = createGardenSceneAdapter();
    const behavior = detectStructureClash(adapter);

    const origin = new Map<string, ScenePose>([
      [a.id, { x: 0, y: 0 }],
      [b.id, { x: 5, y: 0 }],
    ]);
    const ctx = makeCtx([a.id, b.id], origin);
    // Drag dx = +7: a goes to (7,0); b goes to (12,0) — overlaps c at (12,0).
    behavior.onMove!(ctx, { x: 7, y: 0 });
    expect(useUiStore.getState().dragClashIds).toEqual([c.id]);
  });

  it('clears on end', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 3, length: 3 });
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 3, length: 3 });
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
