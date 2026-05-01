# canvas-kit Clone Implementation Plan (Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Port alt-drag clone from `src/canvas/hooks/useCloneInteraction.ts` to canvas-kit. Reuse `InsertAdapter`. Fix the 2-undo-step structure/zone wart along the way.

**Architecture:** Twin of `useMoveInteraction` — same gesture pipeline, same `uiStore.dragOverlay` channel, but `hideIds: []` and commits `InsertOp`s + `SetSelectionOp` (paste shape) rather than position updates.

**Spec:** `docs/superpowers/specs/2026-05-01-canvas-kit-clone-design.md` (committed `4784979`).

---

### Task 0: Extend `commitPaste` signature with optional `ctx`

Widen the `InsertAdapter.commitPaste` signature to accept an optional third arg `ctx?: { dropPoint?: { worldX: number; worldY: number } }`. No behavior change anywhere yet — clipboard paste keeps working because `ctx` is undefined; clone hook (later tasks) will pass it.

**Files:**
- Modify: `src/canvas-kit/adapters/types.ts`
- Modify: `src/canvas/adapters/insert.ts` (signature only — body unchanged)
- Modify: `src/canvas-kit/interactions/insert/insert.test.ts` (fixture — same signature widening)

- [ ] **Step 0.1: Update the kit type**

In `src/canvas-kit/adapters/types.ts`, change:

```ts
commitPaste(
  clipboard: ClipboardSnapshot,
  offset: { dx: number; dy: number },
): TObject[];
```

to:

```ts
commitPaste(
  clipboard: ClipboardSnapshot,
  offset: { dx: number; dy: number },
  ctx?: { dropPoint?: { worldX: number; worldY: number } },
): TObject[];
```

- [ ] **Step 0.2: Match the Garden adapter signature**

In `src/canvas/adapters/insert.ts`, update the implementation signature (body unchanged for now):

```ts
commitPaste(
  clipboard: ClipboardSnapshot,
  offset,
  _ctx?: { dropPoint?: { worldX: number; worldY: number } },
) {
  // existing body
}
```

- [ ] **Step 0.3: Match the test fixture**

In `src/canvas-kit/interactions/insert/insert.test.ts`, the fixture's `commitPaste` should accept the optional ctx (just add the param so it satisfies the type).

- [ ] **Step 0.4: Run full suite + build**

```
npm test -- --run
npm run build
```

Expected: PASS / clean.

- [ ] **Step 0.5: Commit**

```
git add src/canvas-kit/adapters/types.ts src/canvas/adapters/insert.ts src/canvas-kit/interactions/insert/insert.test.ts
git commit -m "refactor(canvas-kit): widen commitPaste signature with optional dropPoint ctx"
```

---

### Task 1: Garden insertAdapter handles `dropPoint` for plantings

Implement the planting branch of `commitPaste` to honor `ctx.dropPoint` when present: resolve the container at `dropPoint`; if found, the new planting takes that container's id as parent and gets local coords `(dropPoint.worldX - container.x, dropPoint.worldY - container.y)`; if no container, the planting is silently dropped (filter it out of the returned array).

**Files:**
- Modify: `src/canvas/adapters/insert.ts`
- Modify: `src/canvas/adapters/insert.test.ts`

- [ ] **Step 1.1: Append failing tests**

```ts
import { createPlanting, createStructure } from '../../model/types';

describe('createInsertAdapter — commitPaste with dropPoint', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('with dropPoint over a container, planting reparents and uses local coords', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 5, y: 6, width: 4, height: 4 });
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const sId = useGardenStore.getState().garden.structures[0].id;
    // Source planting under a different (nonexistent) parent — proves reparenting
    const planting = createPlanting({ parentId: 'orig', x: 0, y: 0, cultivarId: 'tomato' });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'planting', data: planting }] };
    const out = a.commitPaste(snap, { dx: 0, dy: 0 }, {
      dropPoint: { worldX: 7, worldY: 8 },
    }) as Array<{ parentId: string; x: number; y: number }>;
    expect(out).toHaveLength(1);
    expect(out[0].parentId).toBe(sId);
    expect(out[0].x).toBe(2); // 7 - 5
    expect(out[0].y).toBe(2); // 8 - 6
  });

  it('with dropPoint outside any container, planting is silently dropped', () => {
    const planting = createPlanting({ parentId: 'orig', x: 0, y: 0, cultivarId: 'tomato' });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'planting', data: planting }] };
    const out = a.commitPaste(snap, { dx: 0, dy: 0 }, {
      dropPoint: { worldX: 999, worldY: 999 },
    });
    expect(out).toHaveLength(0);
  });

  it('without dropPoint, planting keeps original parent (paste behavior preserved)', () => {
    const planting = createPlanting({ parentId: 'orig', x: 1, y: 1, cultivarId: 'tomato' });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'planting', data: planting }] };
    const out = a.commitPaste(snap, { dx: 0.5, dy: 0.5 }) as Array<{ parentId: string; x: number; y: number }>;
    expect(out).toHaveLength(1);
    expect(out[0].parentId).toBe('orig');
    expect(out[0].x).toBe(1.5);
    expect(out[0].y).toBe(1.5);
  });

  it('with dropPoint, structure offset path unaffected', () => {
    const structure = createStructure({ type: 'pot', x: 5, y: 6, width: 1, height: 1 });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'structure', data: structure }] };
    const out = a.commitPaste(snap, { dx: 1, dy: 2 }, {
      dropPoint: { worldX: 999, worldY: 999 },
    }) as Array<{ x: number; y: number }>;
    expect(out[0].x).toBe(6);
    expect(out[0].y).toBe(8);
  });
});
```

- [ ] **Step 1.2: Run — fail**

```
npm test -- --run src/canvas/adapters/insert.test.ts
```

Expected: 3 of 4 new tests fail (planting dropPoint + silent-drop fail; structure passes since dropPoint is currently ignored).

- [ ] **Step 1.3: Implement**

Update the planting branch in `commitPaste`:

```ts
} else {
  const p = item.data as Planting;
  if (ctx?.dropPoint) {
    const { worldX, worldY } = ctx.dropPoint;
    const { garden } = useGardenStore.getState();
    const container =
      garden.structures.find(
        (s) => worldX >= s.x && worldX <= s.x + s.width && worldY >= s.y && worldY <= s.y + s.height,
      ) ??
      garden.zones.find(
        (z) => worldX >= z.x && worldX <= z.x + z.width && worldY >= z.y && worldY <= z.y + z.height,
      );
    if (!container) continue; // silent drop
    out.push(
      createPlanting({
        parentId: container.id,
        x: worldX - container.x,
        y: worldY - container.y,
        cultivarId: p.cultivarId,
      }),
    );
  } else {
    out.push(
      createPlanting({
        parentId: p.parentId,
        x: p.x + offset.dx,
        y: p.y + offset.dy,
        cultivarId: p.cultivarId,
      }),
    );
  }
}
```

Also remove the `_ctx` underscore prefix in the signature now that it's used.

- [ ] **Step 1.4: Run — pass**

```
npm test -- --run src/canvas/adapters/insert.test.ts
```

- [ ] **Step 1.5: Run full suite + build**

```
npm test -- --run
npm run build
```

- [ ] **Step 1.6: Commit**

```
git add src/canvas/adapters/insert.ts src/canvas/adapters/insert.test.ts
git commit -m "feat(garden): commitPaste resolves planting parent from dropPoint when present"
```

---

### Task 2: Add Clone types to canvas-kit

**Files:**
- Modify: `src/canvas-kit/interactions/types.ts`

- [ ] **Step 2.1: Append types**

```ts
export interface ClonePose {
  ids: string[];
  offset: { dx: number; dy: number };
  worldX: number;
  worldY: number;
}

export type CloneLayer = 'structures' | 'zones' | 'plantings';

export interface CloneBehavior {
  id: string;
  /** Default true. */
  defaultTransient?: boolean;
  /** Decides whether this gesture should activate at start. */
  activates: (modifiers: Modifiers) => boolean;
  /** On end, returns ops to commit (or [] for no-op). */
  onEnd: (
    pose: ClonePose,
    ctx: { adapter: InsertAdapter<unknown> },
  ) => Op[];
}
```

(`InsertAdapter`, `Modifiers`, and `Op` are already exported from this file or its imports — just reference them.)

- [ ] **Step 2.2: Run full suite + build**

```
npm test -- --run
npm run build
```

- [ ] **Step 2.3: Commit**

```
git add src/canvas-kit/interactions/types.ts
git commit -m "feat(canvas-kit): add ClonePose, CloneLayer, CloneBehavior types"
```

---

### Task 3: `cloneByAltDrag` behavior + tests

**Files:**
- Create: `src/canvas-kit/interactions/clone/behaviors/cloneByAltDrag.ts`
- Create: `src/canvas-kit/interactions/clone/behaviors/cloneByAltDrag.test.ts`
- Create: `src/canvas-kit/interactions/clone/behaviors/index.ts`

- [ ] **Step 3.1: Write failing tests**

`src/canvas-kit/interactions/clone/behaviors/cloneByAltDrag.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { cloneByAltDrag } from './cloneByAltDrag';
import type { InsertAdapter, Op } from '../../../index';

interface Obj { id: string }

function makeAdapter(seedSelection: string[] = []): InsertAdapter<Obj> & {
  selection: string[];
  applied: Op[];
  pasteCalls: Array<{ dropPoint?: { worldX: number; worldY: number } }>;
} {
  const a = {
    selection: [...seedSelection],
    applied: [] as Op[],
    pasteCalls: [] as Array<{ dropPoint?: { worldX: number; worldY: number } }>,
    commitInsert: () => null,
    commitPaste: vi.fn((_snap, _off, ctx) => {
      a.pasteCalls.push({ dropPoint: ctx?.dropPoint });
      return [{ id: 'new1' }] as Obj[];
    }),
    snapshotSelection: (ids: string[]) => ({ items: ids.map((id) => ({ id })) }),
    insertObject: (_o: Obj) => {},
    setSelection: (ids: string[]) => { a.selection = [...ids]; },
    applyBatch: (ops: Op[], _label: string) => { a.applied.push(...ops); },
    getSelection: () => a.selection,
  };
  return a as never;
}

describe('cloneByAltDrag', () => {
  it('activates only when alt is held', () => {
    const b = cloneByAltDrag();
    expect(b.activates({ alt: true, shift: false, meta: false, ctrl: false })).toBe(true);
    expect(b.activates({ alt: false, shift: true, meta: true, ctrl: true })).toBe(false);
  });

  it('is non-transient (clone produces a history entry)', () => {
    const b = cloneByAltDrag();
    expect(b.defaultTransient).toBeFalsy();
  });

  it('onEnd returns InsertOps + SetSelectionOp from commitPaste output', () => {
    const adapter = makeAdapter(['orig']);
    const b = cloneByAltDrag();
    const pose = { ids: ['orig'], offset: { dx: 1, dy: 2 }, worldX: 7, worldY: 8 };
    const ops = b.onEnd(pose, { adapter });
    expect(ops).toHaveLength(2); // 1 InsertOp + 1 SetSelectionOp
    expect(adapter.pasteCalls).toHaveLength(1);
    expect(adapter.pasteCalls[0].dropPoint).toEqual({ worldX: 7, worldY: 8 });
  });

  it('returns [] when commitPaste produces nothing', () => {
    const adapter = makeAdapter(['orig']);
    adapter.commitPaste = vi.fn(() => []) as never;
    const b = cloneByAltDrag();
    const ops = b.onEnd(
      { ids: ['orig'], offset: { dx: 0, dy: 0 }, worldX: 0, worldY: 0 },
      { adapter },
    );
    expect(ops).toEqual([]);
  });
});
```

- [ ] **Step 3.2: Run — fail (module not found)**

```
npm test -- --run src/canvas-kit/interactions/clone/behaviors/cloneByAltDrag.test.ts
```

- [ ] **Step 3.3: Implement**

`src/canvas-kit/interactions/clone/behaviors/cloneByAltDrag.ts`:

```ts
import { createInsertOp } from '../../../ops/create';
import { createSetSelectionOp } from '../../../ops/selection';
import type { CloneBehavior } from '../../types';

export function cloneByAltDrag(): CloneBehavior {
  return {
    id: 'cloneByAltDrag',
    activates: (mods) => mods.alt === true,
    onEnd(pose, ctx) {
      const snap = ctx.adapter.snapshotSelection(pose.ids);
      const created = ctx.adapter.commitPaste(snap, pose.offset, {
        dropPoint: { worldX: pose.worldX, worldY: pose.worldY },
      });
      if (created.length === 0) return [];
      const newIds = created.map((o: { id: string }) => o.id);
      const from = ctx.adapter.getSelection?.() ?? [];
      return [
        ...created.map((o) => createInsertOp({ object: o })),
        createSetSelectionOp({ from, to: newIds }),
      ];
    },
  };
}
```

Note: `InsertAdapter` doesn't currently expose `getSelection`. If the test fixture defines it but the adapter type doesn't, add an optional `getSelection?: () => string[]` to `InsertAdapter` in `src/canvas-kit/adapters/types.ts` (then update the Garden insertAdapter to expose it, returning `useUiStore.getState().selectedIds`).

- [ ] **Step 3.4: Wire barrel**

`src/canvas-kit/interactions/clone/behaviors/index.ts`:

```ts
export { cloneByAltDrag } from './cloneByAltDrag';
```

- [ ] **Step 3.5: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/clone/behaviors/cloneByAltDrag.test.ts
```

- [ ] **Step 3.6: Run full suite + build**

```
npm test -- --run
npm run build
```

- [ ] **Step 3.7: Commit**

```
git add src/canvas-kit/interactions/clone/ src/canvas-kit/adapters/types.ts src/canvas/adapters/insert.ts
git commit -m "feat(canvas-kit): add cloneByAltDrag behavior + InsertAdapter.getSelection"
```

---

### Task 4: `useCloneInteraction` hook + tests

State machine: idle → cloning. On start, snapshot ids and store gesture-start cursor. On move, compute offset (current - start), publish overlay frame. On end, build pose, call `behavior.onEnd`, route ops through `applyBatch(ops, 'Clone')`. On cancel, clear overlay only.

**Files:**
- Create: `src/canvas-kit/interactions/clone/clone.ts`
- Create: `src/canvas-kit/interactions/clone/clone.test.ts`
- Create: `src/canvas-kit/interactions/clone/index.ts`
- Create: `src/canvas-kit/clone.ts` (subpath proxy)
- Modify: `src/canvas-kit/index.ts`

- [ ] **Step 4.1: Write failing tests**

`src/canvas-kit/interactions/clone/clone.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloneInteraction } from './clone';
import { cloneByAltDrag } from './behaviors/cloneByAltDrag';
import type { InsertAdapter, Op } from '../../index';

interface Obj { id: string }

function makeAdapter() {
  const overlays: Array<{ layer: string; objects: unknown[] }> = [];
  const cleared: number[] = [];
  const applied: Array<{ ops: Op[]; label: string }> = [];
  const adapter: InsertAdapter<Obj> = {
    commitInsert: () => null,
    commitPaste: () => [{ id: 'new1' } as Obj],
    snapshotSelection: (ids) => ({ items: ids.map((id) => ({ id })) }),
    insertObject: () => {},
    setSelection: () => {},
    applyBatch: (ops, label) => { applied.push({ ops, label }); },
    getSelection: () => [],
  };
  const setOverlay = (layer: string, objects: unknown[]) => {
    overlays.push({ layer, objects });
  };
  const clearOverlay = () => { cleared.push(cleared.length + 1); };
  return { adapter, overlays, cleared, applied, setOverlay, clearOverlay };
}

const mods = (alt = true) => ({ alt, shift: false, meta: false, ctrl: false });

describe('useCloneInteraction', () => {
  it('start with non-activating modifiers does nothing', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(false)); });
    expect(result.current.isCloning).toBe(false);
    expect(h.overlays).toEqual([]);
  });

  it('alt-start activates and publishes initial overlay frame', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    expect(result.current.isCloning).toBe(true);
    expect(h.overlays).toHaveLength(1);
    expect(h.overlays[0].layer).toBe('structures');
  });

  it('move updates overlay with translated objects', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    act(() => { result.current.move(3, 4, mods(true)); });
    expect(h.overlays.length).toBeGreaterThan(1);
  });

  it('end commits a single applyBatch with label "Clone"', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    act(() => { result.current.move(3, 4, mods(true)); });
    act(() => { result.current.end(); });
    expect(h.applied).toHaveLength(1);
    expect(h.applied[0].label).toBe('Clone');
    expect(h.applied[0].ops.length).toBeGreaterThan(0);
    expect(h.cleared).toHaveLength(1);
    expect(result.current.isCloning).toBe(false);
  });

  it('cancel clears overlay without committing', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    act(() => { result.current.cancel(); });
    expect(h.applied).toEqual([]);
    expect(h.cleared).toHaveLength(1);
    expect(result.current.isCloning).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run — fail (module not found)**

- [ ] **Step 4.3: Implement**

`src/canvas-kit/interactions/clone/clone.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import type { InsertAdapter } from '../../adapters/types';
import type { CloneBehavior, CloneLayer, Modifiers, Op } from '../types';

export interface UseCloneInteractionOptions {
  behaviors: CloneBehavior[];
  setOverlay: (layer: CloneLayer, objects: unknown[]) => void;
  clearOverlay: () => void;
}

export interface UseCloneInteractionReturn {
  start(worldX: number, worldY: number, ids: string[], layer: CloneLayer, mods: Modifiers): void;
  move(worldX: number, worldY: number, mods: Modifiers): boolean;
  end(): void;
  cancel(): void;
  readonly isCloning: boolean;
}

interface ActiveState {
  ids: string[];
  layer: CloneLayer;
  startWorldX: number;
  startWorldY: number;
  worldX: number;
  worldY: number;
  behavior: CloneBehavior;
  /** snapshot taken at start so we can re-render the overlay each frame */
  snapshotItems: { id: string; x: number; y: number }[];
}

export function useCloneInteraction(
  adapter: InsertAdapter<unknown>,
  options: UseCloneInteractionOptions,
): UseCloneInteractionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const [isCloning, setIsCloning] = useState(false);
  const stateRef = useRef<ActiveState | null>(null);

  const publishOverlay = (s: ActiveState, dx: number, dy: number) => {
    const objects = s.snapshotItems.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy }));
    optsRef.current.setOverlay(s.layer, objects);
  };

  const start = useCallback(
    (worldX: number, worldY: number, ids: string[], layer: CloneLayer, mods: Modifiers) => {
      const behavior = optsRef.current.behaviors.find((b) => b.activates(mods));
      if (!behavior) return;
      const snap = adapterRef.current.snapshotSelection(ids);
      // Snapshot stores { kind, data } — we need {id, x, y} for overlay translation.
      const snapshotItems = snap.items
        .map((raw) => raw as { data?: { id: string; x: number; y: number } })
        .filter((i) => i.data)
        .map((i) => ({ id: i.data!.id, x: i.data!.x, y: i.data!.y }));
      const s: ActiveState = {
        ids,
        layer,
        startWorldX: worldX,
        startWorldY: worldY,
        worldX,
        worldY,
        behavior,
        snapshotItems,
      };
      stateRef.current = s;
      setIsCloning(true);
      publishOverlay(s, 0, 0);
    },
    [],
  );

  const move = useCallback((worldX: number, worldY: number, _mods: Modifiers): boolean => {
    const s = stateRef.current;
    if (!s) return false;
    s.worldX = worldX;
    s.worldY = worldY;
    publishOverlay(s, worldX - s.startWorldX, worldY - s.startWorldY);
    return true;
  }, []);

  const end = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const pose = {
      ids: s.ids,
      offset: { dx: s.worldX - s.startWorldX, dy: s.worldY - s.startWorldY },
      worldX: s.worldX,
      worldY: s.worldY,
    };
    const ops: Op[] = s.behavior.onEnd(pose, { adapter: adapterRef.current });
    if (ops.length > 0) adapterRef.current.applyBatch(ops, 'Clone');
    optsRef.current.clearOverlay();
    stateRef.current = null;
    setIsCloning(false);
  }, []);

  const cancel = useCallback(() => {
    if (!stateRef.current) return;
    optsRef.current.clearOverlay();
    stateRef.current = null;
    setIsCloning(false);
  }, []);

  return { start, move, end, cancel, get isCloning() { return isCloning; } } as UseCloneInteractionReturn;
}
```

- [ ] **Step 4.4: Wire barrels + subpath + index export**

`src/canvas-kit/interactions/clone/index.ts`:

```ts
export { useCloneInteraction } from './clone';
export type { UseCloneInteractionOptions, UseCloneInteractionReturn } from './clone';
export { cloneByAltDrag } from './behaviors';
```

`src/canvas-kit/clone.ts`:

```ts
export * from './interactions/clone';
```

In `src/canvas-kit/index.ts`, add:

```ts
export { useCloneInteraction, cloneByAltDrag } from './interactions/clone';
export type { UseCloneInteractionOptions, UseCloneInteractionReturn } from './interactions/clone';
export type { ClonePose, CloneLayer, CloneBehavior } from './interactions/types';
```

- [ ] **Step 4.5: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/clone/clone.test.ts
```

- [ ] **Step 4.6: Run full suite + build**

```
npm test -- --run
npm run build
```

- [ ] **Step 4.7: Commit**

```
git add src/canvas-kit/interactions/clone/ src/canvas-kit/clone.ts src/canvas-kit/index.ts
git commit -m "feat(canvas-kit): add useCloneInteraction hook (snapshot + applyBatch on drop)"
```

---

### Task 5: CanvasStack migration — replace alt-drag branch

Drop the legacy `useCloneInteraction` import. Wire kit `useCloneInteraction` with `cloneByAltDrag` and `insertAdapter` (already memoized for paste). The mouse-down alt branch (lines ~944–987) becomes a single `clone.start(...)` call. Remove the eager `addStructure`/`addZone` lines — the kit hook produces objects only on drop, in one batch.

`handleMouseMove` calls `clone.move(worldX, worldY, modifiers)` in the kit-hook block. `handleMouseUp` checks `clone.isCloning` and calls `clone.end()`. Escape calls `clone.cancel()`.

The overlay setter wires through `useUiStore.getState().setDragOverlay({ layer, objects, hideIds: [], snapped: false })` and clearOverlay through `useUiStore.getState().clearDragOverlay()`.

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 5.1: Update imports**

Remove:

```ts
import { useCloneInteraction } from './hooks/useCloneInteraction';
```

Add (in the kit import block):

```ts
import { useCloneInteraction, cloneByAltDrag } from '@/canvas-kit/clone';
```

- [ ] **Step 5.2: Replace the hook call**

Find:

```ts
const moveInteraction = useCloneInteraction(containerRef, invalidate);
```

Replace with (`insertAdapter` is already memoized for `useClipboard`):

```ts
const clone = useCloneInteraction(insertAdapter, {
  behaviors: [cloneByAltDrag()],
  setOverlay: (layer, objects) => {
    useUiStore.getState().setDragOverlay({ layer, objects, hideIds: [], snapped: false });
  },
  clearOverlay: () => useUiStore.getState().clearDragOverlay(),
});
```

(Drop `invalidate` — the kit hook publishes overlay frames synchronously through the store, which already triggers re-renders via Zustand subscriptions.)

- [ ] **Step 5.3: Replace the alt-drag branch**

Find the block at lines ~944–987 starting with `if (e.altKey) {` inside the mouse-down handler. Replace the entire block (all three layer sub-branches) with:

```ts
if (e.altKey) {
  select(hit.id);
  clone.start(worldX, worldY, [hit.id], hit.layer, {
    alt: true, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey,
  });
  setActiveCursor('copy');
  return;
}
```

(The earlier branches handled different layers with different code paths — eager add for structure/zone, deferred for planting. The kit version is uniform.)

- [ ] **Step 5.4: Migrate move**

In the kit-hook block in `handleMouseMove`, alongside the existing `if (areaSelect.isAreaSelecting && areaSelect.move(...))` line, add:

```ts
if (clone.isCloning && clone.move(worldX, worldY, modifiers)) return;
```

Delete the legacy `if (moveInteraction.move(e)) return;` line.

- [ ] **Step 5.5: Migrate end**

In `handleMouseUp`, find the legacy `moveInteraction.end(e)` call and replace with:

```ts
if (clone.isCloning) {
  clone.end();
  setActiveCursor(null);
  return;
}
```

- [ ] **Step 5.6: Migrate cancel (Escape handler)**

The Escape handler currently calls `moveInteraction.cancel()`. Replace with `clone.cancel()`. Update the `useEffect` deps array to swap `moveInteraction` → `clone`.

- [ ] **Step 5.7: Run full suite + build**

```
npm test -- --run
npm run build
```

Expected: PASS / clean. Pay close attention to `noUnusedLocals` — the legacy import has to be fully gone.

- [ ] **Step 5.8: Commit**

```
git add src/canvas/CanvasStack.tsx
git commit -m "feat(canvas): wire kit useCloneInteraction; one-batch alt-drag clone"
```

---

### Task 6: Delete legacy hook files

**Files:**
- Delete: `src/canvas/hooks/useCloneInteraction.ts`
- Delete: `src/canvas/hooks/useCloneInteraction.test.ts`

- [ ] **Step 6.1: Verify no remaining references**

```
grep -rn "hooks/useCloneInteraction" src/ 2>&1 || true
```

Only matches inside the two deletion targets are acceptable.

- [ ] **Step 6.2: Delete the files**

```
git rm src/canvas/hooks/useCloneInteraction.ts src/canvas/hooks/useCloneInteraction.test.ts
```

- [ ] **Step 6.3: Run full suite + build**

```
npm test -- --run
npm run build
```

- [ ] **Step 6.4: Commit**

```
git commit -m "refactor(canvas): delete legacy useCloneInteraction hook"
```

---

### Task 7: Smoke test, behavior docs, spec status flip

**Files:**
- Modify: `docs/behavior.md`
- Modify: `docs/superpowers/specs/2026-05-01-canvas-kit-clone-design.md`

- [ ] **Step 7.1: Manual smoke checklist** (user runs)

```
npm run dev
```

1. Alt-click-drag a structure → ghost follows cursor, original stays visible. Drop → new structure appears at drop position; original unchanged. Cmd+Z → new structure disappears in one undo step (proves single-batch).
2. Alt-click-drag a zone → same as above.
3. Alt-click-drag a planting onto a different container → new planting appears inside the target container at cursor position; original planting unchanged. Cmd+Z → new planting disappears in one undo step.
4. Alt-click-drag a planting and release outside any container → silent drop (no new planting). Original unchanged.
5. After clone, Cmd+Z → garden + selection both restore (selection-in-history is wired).

- [ ] **Step 7.2: Append to `docs/behavior.md`**

```markdown
## Clone (Phase 4 canvas-kit migration, 2026-05-01)

- Alt-click-drag duplicates the clicked object at the drop position.
- Clone is a single undo step: one history entry containing the new object's
  insert plus the selection change (was 2 steps for structures/zones in the
  legacy hook — it eagerly added then moved).
- Plantings: the new planting attaches to whichever container the cursor is
  over at drop time. If the cursor isn't over any container, the drop is
  silent (no new planting created).
- Snap-dwell (the 500 ms hover-into-container UX from legacy) is not yet
  ported. Container resolution is immediate based on cursor position.
```

- [ ] **Step 7.3: Flip spec status**

In `docs/superpowers/specs/2026-05-01-canvas-kit-clone-design.md`, change `**Status:** Draft.` → `**Status:** Phase 4 implemented.`.

- [ ] **Step 7.4: Final test + build**

```
npm test -- --run
npm run build
```

- [ ] **Step 7.5: Commit**

```
git add docs/behavior.md docs/superpowers/specs/2026-05-01-canvas-kit-clone-design.md
git commit -m "docs: record clone behavior changes; flip Phase 4 spec to implemented"
```

---

## Self-review notes

- **Spec coverage:** Op-type asymmetry (insert vs update) → standalone hook (Tasks 3–4). Source visibility → `hideIds: []` in CanvasStack overlay setter (Task 5). Container resolution for plantings → `dropPoint` ctx in `commitPaste` (Tasks 0–1). 2-undo-step wart fix → eager add removed in Task 5; single applyBatch in Task 4.
- **Type consistency:** `CloneBehavior`, `ClonePose`, `CloneLayer`, `useCloneInteraction`, `cloneByAltDrag` — names match across Tasks 2–4. `commitPaste` widened sig is consistent across `InsertAdapter` interface (Task 0), Garden adapter (Tasks 0+1), kit fixture (Task 0), and clone behavior caller (Task 3).
- **InsertAdapter.getSelection:** Added in Task 3 since `cloneByAltDrag.onEnd` needs it for the `from` field of `SetSelectionOp`. Kept optional so existing fixtures (clipboard tests) don't break.
- **Overlay channel:** Reuses `dragOverlay` (move's channel). The clone hook publishes objects with `hideIds: []` — the renderer already respects `hideIds`, so original objects stay visible without renderer changes.

## Open issues

None.
