import type { GestureContext, MoveEnd, SnapCollect, SnapSource, SnapTarget } from '@weasel-js/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createGardenSceneAdapter, type SceneNode, type ScenePose } from '../adapters/gardenScene';
import { plantingLayoutFor } from '../adapters/plantingLayout';
import { requirePlantingDrop, structureZoneGridSnap } from './snapMoveBehaviors';

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
    view: null,
    adapter: (opts?.adapter ?? {}) as never,
    scratch: {},
  };
}

/** A move's end, released at (x, y). */
function endAt(x: number, y: number): MoveEnd {
  return { answered: false, translateOps: () => [], pointer: { x, y } };
}

/** How many snap candidates the source offers a move of `ids`. */
function candidates(source: SnapSource, ids: string[]): number {
  const q = {
    gesture: 'move',
    probes: [{ id: 'origin', role: 'origin', at: { x: 3.4, y: 5.7 } }],
    delta0: { x: 0, y: 0 },
    ids,
    exclude: ids,
    reachWorld: (px: number) => px,
    reachPx: 8,
  } as unknown as SnapCollect;
  return [...source.collect(q)].length;
}

describe('structureZoneGridSnap', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('offers the garden grid for a structure move', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s = useGardenStore.getState().garden.structures[0];
    expect(candidates(structureZoneGridSnap(createGardenSceneAdapter()), [s.id])).toBeGreaterThan(
      0,
    );
  });

  it('declines when structure.snapToGrid is false', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s0 = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().updateStructure(s0.id, { snapToGrid: false });
    expect(candidates(structureZoneGridSnap(createGardenSceneAdapter()), [s0.id])).toBe(0);
  });

  it('declines for a planting move', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ cultivarId: 'tomato', parentId: bed.id, x: 1, y: 1 });
    const p = useGardenStore.getState().garden.plantings[0];
    expect(candidates(structureZoneGridSnap(createGardenSceneAdapter()), [p.id])).toBe(0);
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
    expect(behavior.onEnd!(ctx, endAt(100, 100))).toBeNull();
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
    expect(behavior.onEnd!(ctx, endAt(2, 2))).toBeUndefined();
  });

  it('does nothing for non-planting drags (structures move freely)', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 2, length: 2 });
    const s = useGardenStore.getState().garden.structures[0];
    const adapter = createGardenSceneAdapter();
    const behavior = requirePlantingDrop(adapter);

    const origin = new Map<string, ScenePose>([[s.id, { x: 0, y: 0 }]]);
    const ctx = makeCtx([s.id], origin);
    const result = behavior.onEnd!(ctx, endAt(0, 0));
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
    // …so the guard snaps it back.
    expect(behavior.onEnd!(ctx, endAt(release.x, release.y))).toBeNull();
  });
});
