import { beforeEach, describe, expect, it } from 'vitest';
import {
  snapStructureZoneToGrid,
  requirePlantingDrop,
} from './snapMoveBehaviors';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import {
  createGardenSceneAdapter,
  type ScenePose,
  type SceneNode,
} from '../adapters/gardenScene';
import type { GestureContext, SnapTarget } from '@orochi235/weasel';

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
    const result = behavior.onMove!(ctx, { x: 3.4, y: 5.7 });
    expect(result).toBeTruthy();
    const pose = (result as { pose: ScenePose }).pose;
    expect(pose.x).toBe(3);
    expect(pose.y).toBe(6);
  });

  it('does not snap when structure.snapToGrid is false', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s0 = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().updateStructure(s0.id, { snapToGrid: false });
    const adapter = createGardenSceneAdapter();
    const behavior = snapStructureZoneToGrid(adapter);

    const origin = new Map<string, ScenePose>([[s0.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([s0.id], origin);
    const result = behavior.onMove!(ctx, { x: 3.4, y: 5.7 });
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
    const result = behavior.onMove!(ctx, { x: 3.4, y: 5.7 });
    // weasel's snapToGrid returns no pose when bypass key is held.
    expect(result === undefined || (result as { pose?: ScenePose }).pose === undefined).toBe(true);
  });
});

describe('requirePlantingDrop (snap-back)', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('aborts (returns null) when a planting is released over no snap target', () => {
    // Add a bed and a planting to drag.
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bed.id, x: 1, y: 1 });
    const p = useGardenStore.getState().garden.plantings[0];
    const adapter = createGardenSceneAdapter();
    const behavior = requirePlantingDrop(adapter);

    const origin = new Map<string, ScenePose>([[p.id, { x: 1, y: 1 }]]);
    // current well outside any container, snap is null.
    const current = new Map<string, ScenePose>([[p.id, { x: 100, y: 100 }]]);
    const ctx = makeCtx([p.id], origin, { current, adapter });
    behavior.onStart?.(ctx);
    const result = behavior.onEnd!(ctx);
    expect(result).toBeNull();
  });

  it('defers (returns undefined) when a snap target is active on release', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bed.id, x: 1, y: 1 });
    const p = useGardenStore.getState().garden.plantings[0];
    const adapter = createGardenSceneAdapter();
    const behavior = requirePlantingDrop(adapter);

    const origin = new Map<string, ScenePose>([[p.id, { x: 1, y: 1 }]]);
    const ctx = makeCtx([p.id], origin, {
      snap: { parentId: bed.id, slotPose: { x: 2, y: 2 } },
      adapter,
    });
    behavior.onStart?.(ctx);
    const result = behavior.onEnd!(ctx);
    expect(result).toBeUndefined();
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
});

describe('snapToContainer (via gardenScene findSnapTarget)', () => {
  // The eric equivalent of weasel's snapToContainer is the
  // `trackPlantingSnap` behavior in useEricSelectTool.ts, which mirrors
  // `adapter.findSnapTarget` into ctx.snap. Verifying the underlying
  // adapter contract here doubles as coverage for the snap-to-bed case
  // requested in the deferral.
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('returns a snap target when a planting drag pointer enters a different bed', () => {
    // Source bed (1,1)-(5,5) hosts the planting; destination bed (10,10)-(14,14) is the snap target.
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 1, y: 1, width: 4, length: 4 });
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 10, y: 10, width: 4, length: 4 });
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
