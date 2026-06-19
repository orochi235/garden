/**
 * Bug C regression: dragging a planting from one container into another must
 * REPARENT it under the destination container (not just translate it and strand
 * it parented to the source). Drives the real weasel `moveAction` end-to-end
 * against eric's live `GardenScene` + `plantingLayoutFor`, mirroring weasel's
 * `move.layout.test.ts` harness but with eric's real scene and layout strategy.
 *
 * Root cause (now fixed in weasel `45b1340a`/`b0fc772d`): `runLayoutPass`
 * formerly handed the dragged center to `LayoutStrategy.contains` in the
 * parent-LOCAL frame while eric's `contains` reads WORLD bounds, so the
 * destination container was never found and the move fell through to a
 * translate-only commit. `runLayoutPass` now composes every strategy input to
 * world, so the dest container is detected and the layout-drop commit reparents.
 */

import {
  composeRectPose,
  decomposeRectPose,
  type LayoutStrategy,
  moveAction,
  type PoseComposition,
} from '@orochi235/weasel';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { plantingLayoutFor } from './plantingLayout';

const LOCAL_PC: PoseComposition<unknown> = {
  compose: composeRectPose as never,
  decompose: decomposeRectPose as never,
};

interface Drag {
  start: { x: number; y: number };
  current: { x: number; y: number };
  delta: { x: number; y: number };
}

function makeCtx(selectionIds: string[], drag?: Drag): unknown {
  const scene = useGardenStore.getState().getScene();
  const getLayout = (id: string): LayoutStrategy<unknown> | null =>
    plantingLayoutFor(() => useGardenStore.getState().garden, id) as never;
  return {
    world: { x: 0, y: 0 },
    screen: { x: 0, y: 0 },
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    deps: {
      selection: { get: () => selectionIds },
      scene,
      layout: { getLayout },
      poseComposition: LOCAL_PC,
    },
    drag,
  };
}

describe('bug C — cross-container planting reparent', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('reparents a planting under the destination bed on a cross-container drag', () => {
    // Source bed A at world (0,0)-(4,4); destination bed B at world (20,0)-(24,4).
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    useGardenStore
      .getState()
      .addStructure({ type: 'raised-bed', x: 20, y: 0, width: 4, length: 4 });
    const [bedA, bedB] = useGardenStore.getState().garden.structures;
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bedA.id, x: 2, y: 2 });
    const p = useGardenStore.getState().garden.plantings[0];

    const scene = useGardenStore.getState().getScene();
    // Precondition: planting starts parented under bed A.
    expect(scene.get(p.id as never)?.parent).toBe(bedA.id);

    const invoker = moveAction.invoker;
    if (!invoker || invoker.timing !== 'ongoing') throw new Error('expected ongoing invoker');

    const handle = invoker.start(makeCtx([p.id]) as never);
    // Drag the planting's world center (2,2) into bed B's interior (22,2).
    const drag: Drag = {
      start: { x: 2, y: 2 },
      current: { x: 22, y: 2 },
      delta: { x: 20, y: 0 },
    };
    handle.onMove?.(makeCtx([p.id], drag) as never);
    handle.onEnd?.(makeCtx([p.id], drag) as never, 'commit');

    // The planting must now be parented under bed B (the reparent), not bed A.
    expect(scene.get(p.id as never)?.parent).toBe(bedB.id);

    // …and its pose must compose to a WORLD position inside bed B's
    // [20,24]×[0,4] bounds — proving the layout-drop repositioned it, so the
    // pass is not vacuous (a stale-coord reparent would leave it near A).
    const local = scene.get(p.id as never)?.pose as { x: number; y: number };
    const bedBPose = scene.get(bedB.id as never)?.pose as { x: number; y: number };
    const world = composeRectPose(bedBPose as never, local as never) as { x: number; y: number };
    expect(world.x).toBeGreaterThanOrEqual(20);
    expect(world.x).toBeLessThanOrEqual(24);
    expect(world.y).toBeGreaterThanOrEqual(0);
    expect(world.y).toBeLessThanOrEqual(4);
  });

  it('does NOT reparent under bed B when dropped in free space between the beds', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    useGardenStore
      .getState()
      .addStructure({ type: 'raised-bed', x: 20, y: 0, width: 4, length: 4 });
    const [bedA, bedB] = useGardenStore.getState().garden.structures;
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bedA.id, x: 2, y: 2 });
    const p = useGardenStore.getState().garden.plantings[0];
    const scene = useGardenStore.getState().getScene();

    const invoker = moveAction.invoker;
    if (!invoker || invoker.timing !== 'ongoing') throw new Error('expected ongoing invoker');
    const handle = invoker.start(makeCtx([p.id]) as never);
    // Drop the center at (12,2): the empty gap between the two beds.
    const drag: Drag = {
      start: { x: 2, y: 2 },
      current: { x: 12, y: 2 },
      delta: { x: 10, y: 0 },
    };
    handle.onMove?.(makeCtx([p.id], drag) as never);
    handle.onEnd?.(makeCtx([p.id], drag) as never, 'commit');

    // No container accepted the drop → no reparent under B.
    expect(scene.get(p.id as never)?.parent).not.toBe(bedB.id);
  });
});
