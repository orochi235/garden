import type { InvocationCtx, OngoingHandle, SelectionApi } from '@orochi235/weasel';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStructure } from '../../model/types';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createInsertAdapter } from '../adapters/insert';
import { createGardenCloneAction } from './gardenCloneAction';

/** Minimal SelectionApi whose only consumed method is `get()`. */
function fakeSelection(ids: string[]): SelectionApi {
  return { get: () => ids } as unknown as SelectionApi;
}

/** Open the action's ongoing handle, narrowing the `Invoker` union. */
function startHandle(
  action: ReturnType<typeof createGardenCloneAction>,
  c: InvocationCtx,
): OngoingHandle {
  const inv = action.invoker as { start(ctx: InvocationCtx): OngoingHandle };
  return inv.start(c);
}

/** Build an InvocationCtx with the fields the clone handle reads. */
function ctx(
  selectedIds: string[],
  drag?: { start: [number, number]; current: [number, number] },
): InvocationCtx {
  const base = {
    world: { x: drag?.current[0] ?? 0, y: drag?.current[1] ?? 0 },
    screen: { x: 0, y: 0 },
    modifiers: { alt: true, shift: false, meta: false, ctrl: false, space: false },
    deps: { selection: fakeSelection(selectedIds) },
  } as unknown as InvocationCtx;
  if (drag) {
    (base as { drag?: unknown }).drag = {
      start: { x: drag.start[0], y: drag.start[1] },
      current: { x: drag.current[0], y: drag.current[1] },
      delta: { x: drag.current[0] - drag.start[0], y: drag.current[1] - drag.start[1] },
    };
  }
  return base;
}

describe('createGardenCloneAction — alt-drag clone (restored)', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  function makeAction() {
    const insertAdapter = createInsertAdapter();
    const scene = useGardenStore.getState().getScene();
    return createGardenCloneAction(insertAdapter, scene);
  }

  /** Seed structures through `loadGarden` so the scene-of-record (and history
   *  baseline) actually contains them — `setState` alone bypasses the scene. */
  function loadStructures(...structures: ReturnType<typeof createStructure>[]) {
    useGardenStore.getState().loadGarden({ ...blankGarden(), structures });
  }

  it('clones the selected structure at the drag offset; original is unchanged', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    loadStructures(a);

    const action = makeAction();
    const handle = startHandle(action, ctx([a.id]));
    handle.onMove!(ctx([a.id], { start: [2, 2], current: [12, 12] }));
    handle.onEnd!(ctx([a.id], { start: [2, 2], current: [12, 12] }), 'commit');

    const structures = useGardenStore.getState().garden.structures;
    expect(structures).toHaveLength(2);
    // Original untouched.
    const original = structures.find((s) => s.id === a.id)!;
    expect(original.x).toBe(0);
    expect(original.y).toBe(0);
    // Clone offset by the drag delta (10, 10).
    const clone = structures.find((s) => s.id !== a.id)!;
    expect(clone.x).toBe(10);
    expect(clone.y).toBe(10);
  });

  it('is undoable as a single step', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    loadStructures(a);

    const action = makeAction();
    const handle = startHandle(action, ctx([a.id]));
    handle.onEnd!(ctx([a.id], { start: [2, 2], current: [12, 12] }), 'commit');
    expect(useGardenStore.getState().garden.structures).toHaveLength(2);

    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('cancel commits nothing', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    loadStructures(a);

    const action = makeAction();
    const handle = startHandle(action, ctx([a.id]));
    handle.onMove!(ctx([a.id], { start: [2, 2], current: [12, 12] }));
    handle.onEnd!(ctx([a.id], { start: [2, 2], current: [12, 12] }), 'cancel');

    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('zero-delta drag clones nothing', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    loadStructures(a);

    const action = makeAction();
    const handle = startHandle(action, ctx([a.id]));
    handle.onEnd!(ctx([a.id], { start: [2, 2], current: [2, 2] }), 'commit');

    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('auto-expands to group siblings: cloning one member of a group of 3 clones all 3', () => {
    const a = createStructure({
      type: 'raised-bed',
      x: 0,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    const b = createStructure({
      type: 'raised-bed',
      x: 10,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    const c = createStructure({
      type: 'raised-bed',
      x: 20,
      y: 0,
      width: 4,
      length: 4,
      groupId: 'g1',
    });
    loadStructures(a, b, c);

    const action = makeAction();
    // Only `a` is selected.
    const handle = startHandle(action, ctx([a.id]));
    handle.onEnd!(ctx([a.id], { start: [2, 2], current: [52, 52] }), 'commit');

    // 3 originals + 3 clones.
    expect(useGardenStore.getState().garden.structures).toHaveLength(6);
  });

  it('clones a planting into the container under the drop point', () => {
    // A bed at (0,0) 8×8 with one planting, and a second bed to clone into.
    const bedA = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 8, length: 8 });
    const bedB = createStructure({ type: 'raised-bed', x: 20, y: 0, width: 8, length: 8 });
    loadStructures(bedA, bedB);
    // Add a planting inside bedA (through the proper commit path).
    useGardenStore.getState().addPlanting({ parentId: bedA.id, x: 2, y: 2, cultivarId: 'tomato' });
    const planting = useGardenStore.getState().garden.plantings[0];

    const action = makeAction();
    const handle = startHandle(action, ctx([planting.id]));
    // Drop over bedB (world point inside bedB's bounds).
    handle.onEnd!(ctx([planting.id], { start: [2, 2], current: [24, 4] }), 'commit');

    const plantings = useGardenStore.getState().garden.plantings;
    expect(plantings).toHaveLength(2);
    const clone = plantings.find((p) => p.id !== planting.id)!;
    // New planting re-parented to bedB, local coords relative to bedB origin.
    expect(clone.parentId).toBe(bedB.id);
    expect(clone.x).toBeCloseTo(4); // 24 - 20
    expect(clone.y).toBeCloseTo(4);
  });
});
