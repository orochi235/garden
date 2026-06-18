import type { GestureContext, GroupTransform, SnapTarget } from '@orochi235/weasel';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createGardenSceneAdapter, type SceneNode, type ScenePose } from '../adapters/gardenScene';
import { plantingLayoutFor } from '../adapters/plantingLayout';
import { requirePlantingDrop, snapStructureZoneToGrid } from './snapMoveBehaviors';

/** A translate `GroupTransform` from a primary origin to a target pose. */
function translateTo(
  origin: Map<string, ScenePose>,
  primaryId: string,
  target: { x: number; y: number },
): GroupTransform {
  const o = origin.get(primaryId)!;
  return { kind: 'translate', dx: target.x - o.x, dy: target.y - o.y };
}

function makeCtx(
  draggedIds: string[],
  origin: Map<string, ScenePose>,
  opts?: {
    current?: Map<string, ScenePose>;
    snap?: SnapTarget<ScenePose> | null;
    alt?: boolean;
    adapter?: ReturnType<typeof createGardenSceneAdapter>;
  },
): GestureContext<ScenePose, SceneNode> {
  return {
    draggedIds,
    origin,
    current: opts?.current ?? new Map(origin),
    snap: opts?.snap ?? null,
    modifiers: { alt: opts?.alt ?? false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: (opts?.adapter ?? {}) as never,
    scratch: {},
  };
}

describe('snapStructureZoneToGrid', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('quantizes a structure drag to the garden grid spacing', () => {
    // blankGarden() default gridCellSizeFt is 1.
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = snapStructureZoneToGrid(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([s.id], origin);
    // Propose a fractional pose; with spacing=1 it should snap to nearest int.
    const result = behavior.onMove!(ctx, translateTo(origin, s.id, { x: 3.4, y: 5.7 }));
    expect(result).toBeTruthy();
    // origin (0,0) → snapped (3,6) becomes a uniform translate delta.
    const transform = (result as { transform: GroupTransform }).transform;
    expect(transform).toEqual({ kind: 'translate', dx: 3, dy: 6 });
  });

  it('does not snap when structure.snapToGrid is false', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s0 = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().updateStructure(s0.id, { snapToGrid: false });
    const adapter = createGardenSceneAdapter();
    const behavior = snapStructureZoneToGrid(adapter);

    const origin = new Map<string, ScenePose>([[s0.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([s0.id], origin);
    const result = behavior.onMove!(ctx, translateTo(origin, s0.id, { x: 3.4, y: 5.7 }));
    // No snap → behavior returns undefined.
    expect(result).toBeUndefined();
  });

  it('does not snap when alt is held (bypass key)', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = snapStructureZoneToGrid(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([s.id], origin, { alt: true });
    const result = behavior.onMove!(ctx, translateTo(origin, s.id, { x: 3.4, y: 5.7 }));
    // weasel's snapToGrid returns no transform when bypass key is held.
    expect(
      result === undefined || (result as { transform?: GroupTransform }).transform === undefined,
    ).toBe(true);
  });
});

describe('requirePlantingDrop (snap-back)', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('aborts (returns null) when a planting is released in free space (no container under cursor)', () => {
    // Add a bed and a planting to drag.
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bed.id, x: 1, y: 1 });
    const p = useGardenStore.getState().garden.plantings[0];
    const adapter = createGardenSceneAdapter();
    const behavior = requirePlantingDrop(adapter);

    const origin = new Map<string, ScenePose>([[p.id, { x: 1, y: 1 }]]);
    const ctx = makeCtx([p.id], origin, { adapter });
    // Cursor released well outside any container.
    ctx.pointer = { worldX: 100, worldY: 100, clientX: 0, clientY: 0 };
    expect(behavior.onEnd!(ctx)).toBeNull();
  });

  it('defers (returns undefined) when released over an accepting container', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bed.id, x: 1, y: 1 });
    const p = useGardenStore.getState().garden.plantings[0];
    const adapter = createGardenSceneAdapter();
    const behavior = requirePlantingDrop(adapter);

    const origin = new Map<string, ScenePose>([[p.id, { x: 1, y: 1 }]]);
    const ctx = makeCtx([p.id], origin, { adapter });
    // Cursor inside the bed (0,0)–(4,4) → defer to the kit layout's commitDrop.
    ctx.pointer = { worldX: 2, worldY: 2, clientX: 0, clientY: 0 };
    expect(behavior.onEnd!(ctx)).toBeUndefined();
  });

  it('does nothing for non-planting drags (structures move freely)', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = requirePlantingDrop(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([s.id], origin);
    const result = behavior.onEnd!(ctx);
    expect(result).toBeUndefined();
  });

  it('snaps back when released OUTSIDE a container, agreeing with the kit layout pass', () => {
    // A planting is slot-bound: it may only land in a cell of a container the
    // kit layout pass would accept. The guard uses the SAME `contains` test, so
    // a release outside all container bounds snaps back (rather than free-
    // committing the planting at the raw cursor — "an odd place").
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const src = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addStructure({ type: 'pot', x: 10, y: 10, width: 1, length: 1 });
    const pot = useGardenStore.getState().garden.structures[1];
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: src.id, x: 2, y: 2 });
    const p = useGardenStore.getState().garden.plantings[0];
    const adapter = createGardenSceneAdapter();
    const behavior = requirePlantingDrop(adapter);

    // Release just OUTSIDE the pot's [10,11]×[10,11] bounds and away from the bed.
    const release = { x: 11.3, y: 10.5 };
    // The kit layout pass would NOT accept this release (outside all bounds)…
    const layout = plantingLayoutFor(() => useGardenStore.getState().garden, pot.id)!;
    expect(layout.contains!({ x: 0, y: 0 }, release)).toBe(false);

    const origin = new Map<string, ScenePose>([[p.id, { x: 2, y: 2 }]]);
    const ctx = makeCtx([p.id], origin, { adapter });
    ctx.pointer = { worldX: release.x, worldY: release.y, clientX: 0, clientY: 0 };
    // …so the guard snaps it back.
    expect(behavior.onEnd!(ctx)).toBeNull();
  });
});

describe('gardenScene findSnapTarget (cross-bed snap contract)', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('returns a snap target when a planting drag pointer enters a different bed', () => {
    // Source bed (1,1)-(5,5) hosts the planting; destination bed (10,10)-(14,14) is the snap target.
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 1, y: 1, width: 4, length: 4 });
    useGardenStore
      .getState()
      .addStructure({ type: 'raised-bed', x: 10, y: 10, width: 4, length: 4 });
    const [src, dst] = useGardenStore.getState().garden.structures;
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: src.id, x: 1, y: 1 });
    const p = useGardenStore.getState().garden.plantings[0];
    const adapter = createGardenSceneAdapter();

    // Pointer over the destination bed's interior.
    const target = adapter.findSnapTarget?.(p.id, 12, 12);
    expect(target).toBeTruthy();
    expect(target!.parentId).toBe(dst.id);
    // slotPose should be inside the destination bed bounds [10,14] × [10,14].
    expect(target!.slotPose.x).toBeGreaterThanOrEqual(10);
    expect(target!.slotPose.x).toBeLessThanOrEqual(14);
    expect(target!.slotPose.y).toBeGreaterThanOrEqual(10);
    expect(target!.slotPose.y).toBeLessThanOrEqual(14);
  });

  it('returns null when the pointer is in empty space (no container under)', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bed.id, x: 1, y: 1 });
    const p = useGardenStore.getState().garden.plantings[0];
    const adapter = createGardenSceneAdapter();

    // Pointer way outside any container.
    const target = adapter.findSnapTarget?.(p.id, 18, 18);
    expect(target).toBeNull();
  });
});
