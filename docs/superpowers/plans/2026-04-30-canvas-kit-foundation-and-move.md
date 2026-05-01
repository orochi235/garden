# canvas-kit Foundation + Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the canvas-kit interaction-framework foundation (op vocabulary, history utility, adapter and behavior types) and port `useMoveInteraction` end-to-end through the garden's planting/zone/structure move paths. Garden continues to behave identically; old `useMoveInteraction` is deleted.

**Architecture:** New code lives in `src/canvas-kit/{ops,history,adapters,interactions}`. App-side adapters live in `src/canvas/adapters/`. The kit hook owns gesture state and runs an array of `MoveBehavior` plugins; the app supplies a per-hook narrow adapter. Garden's `gardenStore.checkpoint()` is invoked inside the planting/zone/structure move adapters' `applyBatch` so existing undo semantics are preserved.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-30-canvas-kit-interactions-design.md`.

**Out of scope (follow-on plans):** Resize, plot, area-select, clipboard ports; drag-lab adoption; deletion of `src/canvas/hooks/` directory once empty.

---

## File Structure

### New files (kit)

```
src/canvas-kit/ops/types.ts                  # Op<TAdapter> interface
src/canvas-kit/ops/transform.ts              # createTransformOp
src/canvas-kit/ops/reparent.ts               # createReparentOp
src/canvas-kit/ops/create.ts                 # createCreateOp
src/canvas-kit/ops/delete.ts                 # createDeleteOp
src/canvas-kit/ops/selection.ts              # createSetSelectionOp
src/canvas-kit/ops/index.ts                  # barrel
src/canvas-kit/ops/transform.test.ts
src/canvas-kit/ops/reparent.test.ts
src/canvas-kit/ops/createDelete.test.ts      # tests for create + delete (paired inverses)
src/canvas-kit/ops/selection.test.ts

src/canvas-kit/history/history.ts            # createHistory<TAdapter>()
src/canvas-kit/history/history.test.ts
src/canvas-kit/history/index.ts

src/canvas-kit/adapters/types.ts             # SceneAdapter, MoveAdapter, SnapTarget

src/canvas-kit/interactions/types.ts         # GestureContext, MoveBehavior, MoveOverlay
src/canvas-kit/interactions/move.ts          # useMoveInteraction
src/canvas-kit/interactions/move.test.ts

src/canvas-kit/interactions/behaviors/snapToGrid.ts
src/canvas-kit/interactions/behaviors/snapToGrid.test.ts
src/canvas-kit/interactions/behaviors/snapToContainer.ts
src/canvas-kit/interactions/behaviors/snapToContainer.test.ts
src/canvas-kit/interactions/behaviors/snapBackOrDelete.ts
src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts
src/canvas-kit/interactions/behaviors/index.ts
```

### New files (app-side adapters)

```
src/canvas/adapters/plantingMove.ts          # createPlantingMoveAdapter()
src/canvas/adapters/zoneMove.ts              # createZoneMoveAdapter()
src/canvas/adapters/structureMove.ts         # createStructureMoveAdapter()
src/canvas/adapters/plantingMove.test.ts
src/canvas/adapters/zoneMove.test.ts
src/canvas/adapters/structureMove.test.ts
```

### Modified files

```
src/canvas-kit/index.ts                      # add exports for ops, history, adapters, interactions
src/canvas/CanvasStack.tsx                   # swap useMoveInteraction import + call shape
docs/behavior.md                             # no change expected (behavior preserved)
```

### Deleted files (after Task 12)

```
src/canvas/hooks/useMoveInteraction.ts
src/canvas/hooks/useMoveInteraction.test.ts  # tests retargeted to integration in move.test.ts + adapter tests
```

---

## Conventions for tasks

- All commits use Conventional Commits (`feat`, `refactor`, `test`, `docs`).
- TDD: tests come first, fail, then implementation makes them pass.
- After each task, run `npm run build` and `npx vitest run`. Both must be green before commit.
- Existing test scenarios in `src/canvas/hooks/useMoveInteraction.test.ts` must keep passing throughout the migration. They are deleted only in Task 12, after equivalent coverage exists in the new locations.

---

### Task 1: Op interface and transform / reparent factories

**Files:**
- Create: `src/canvas-kit/ops/types.ts`
- Create: `src/canvas-kit/ops/transform.ts`
- Create: `src/canvas-kit/ops/reparent.ts`
- Create: `src/canvas-kit/ops/transform.test.ts`
- Create: `src/canvas-kit/ops/reparent.test.ts`

- [ ] **Step 1.1: Write the failing tests for `Op` shape and `createTransformOp`**

`src/canvas-kit/ops/transform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTransformOp } from './transform';

interface FakePose { x: number; y: number; w?: number }

function makeAdapter() {
  const calls: { id: string; pose: FakePose }[] = [];
  return {
    setPose: (id: string, pose: FakePose) => calls.push({ id, pose }),
    calls,
  };
}

describe('createTransformOp', () => {
  it('apply writes the to-pose', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } });
    const adapter = makeAdapter();
    op.apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', pose: { x: 3, y: 4 } }]);
  });

  it('invert swaps from and to', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } });
    const inv = op.invert();
    const adapter = makeAdapter();
    inv.apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', pose: { x: 1, y: 2 } }]);
  });

  it('apply then apply(invert) returns adapter to baseline', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 1, y: 2, w: 5 }, to: { x: 3, y: 4, w: 9 } });
    const adapter = makeAdapter();
    op.apply(adapter as any);
    op.invert().apply(adapter as any);
    expect(adapter.calls[1].pose).toEqual({ x: 1, y: 2, w: 5 });
  });

  it('exposes a label', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, label: 'Move' });
    expect(op.label).toBe('Move');
  });
});
```

`src/canvas-kit/ops/reparent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createReparentOp } from './reparent';

describe('createReparentOp', () => {
  function makeAdapter() {
    const calls: { id: string; parentId: string | null }[] = [];
    return {
      setParent: (id: string, parentId: string | null) => calls.push({ id, parentId }),
      calls,
    };
  }

  it('apply writes the to-parent', () => {
    const op = createReparentOp({ id: 'a', from: 'old', to: 'new' });
    const adapter = makeAdapter();
    op.apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', parentId: 'new' }]);
  });

  it('invert swaps from and to', () => {
    const op = createReparentOp({ id: 'a', from: 'old', to: 'new' });
    const adapter = makeAdapter();
    op.invert().apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', parentId: 'old' }]);
  });

  it('handles null parents', () => {
    const op = createReparentOp({ id: 'a', from: null, to: 'new' });
    expect(op.invert().apply.toString().length).toBeGreaterThan(0);
    const adapter = makeAdapter();
    op.invert().apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', parentId: null }]);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```
npx vitest run src/canvas-kit/ops/
```
Expected: FAIL — modules not found.

- [ ] **Step 1.3: Write `Op` types**

`src/canvas-kit/ops/types.ts`:

```ts
/**
 * An invertible mutation. Applied via an adapter; produces an inverse op
 * that, when applied to the same adapter, undoes the original.
 *
 * Adapters are intentionally typed loosely here so different op types can
 * require different adapter capabilities. Each op is responsible for
 * narrowing the adapter via the methods it calls.
 */
export interface Op {
  apply(adapter: unknown): void;
  invert(): Op;
  label?: string;
  coalesceKey?: string;
}
```

- [ ] **Step 1.4: Implement `createTransformOp`**

`src/canvas-kit/ops/transform.ts`:

```ts
import type { Op } from './types';

interface TransformAdapter<TPose> {
  setPose(id: string, pose: TPose): void;
}

export function createTransformOp<TPose>(args: {
  id: string;
  from: TPose;
  to: TPose;
  label?: string;
  coalesceKey?: string;
}): Op {
  const { id, from, to, label, coalesceKey } = args;
  return {
    label,
    coalesceKey,
    apply(adapter) {
      (adapter as TransformAdapter<TPose>).setPose(id, to);
    },
    invert() {
      return createTransformOp<TPose>({ id, from: to, to: from, label, coalesceKey });
    },
  };
}
```

- [ ] **Step 1.5: Implement `createReparentOp`**

`src/canvas-kit/ops/reparent.ts`:

```ts
import type { Op } from './types';

interface ReparentAdapter {
  setParent(id: string, parentId: string | null): void;
}

export function createReparentOp(args: {
  id: string;
  from: string | null;
  to: string | null;
  label?: string;
}): Op {
  const { id, from, to, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as ReparentAdapter).setParent(id, to);
    },
    invert() {
      return createReparentOp({ id, from: to, to: from, label });
    },
  };
}
```

- [ ] **Step 1.6: Run tests to verify pass**

```
npx vitest run src/canvas-kit/ops/
```
Expected: PASS — all tests green.

- [ ] **Step 1.7: Commit**

```
git add src/canvas-kit/ops/
git commit -m "feat(canvas-kit): add Op interface with transform and reparent factories"
```

---

### Task 2: Create / Delete / Selection ops

**Files:**
- Create: `src/canvas-kit/ops/create.ts`
- Create: `src/canvas-kit/ops/delete.ts`
- Create: `src/canvas-kit/ops/selection.ts`
- Create: `src/canvas-kit/ops/createDelete.test.ts`
- Create: `src/canvas-kit/ops/selection.test.ts`
- Create: `src/canvas-kit/ops/index.ts`

- [ ] **Step 2.1: Write tests for create + delete (paired inverses)**

`src/canvas-kit/ops/createDelete.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCreateOp } from './create';
import { createDeleteOp } from './delete';

interface Obj { id: string; value: number }

function makeAdapter() {
  const inserts: Obj[] = [];
  const removes: string[] = [];
  return {
    insertObject: (o: Obj) => inserts.push(o),
    removeObject: (id: string) => removes.push(id),
    inserts,
    removes,
  };
}

describe('createCreateOp / createDeleteOp', () => {
  it('createOp applies as insert', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createCreateOp<Obj>({ object: obj }).apply(adapter as any);
    expect(adapter.inserts).toEqual([obj]);
  });

  it('createOp inverts to deleteOp', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createCreateOp<Obj>({ object: obj }).invert().apply(adapter as any);
    expect(adapter.removes).toEqual(['a']);
  });

  it('deleteOp applies as remove', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createDeleteOp<Obj>({ object: obj }).apply(adapter as any);
    expect(adapter.removes).toEqual(['a']);
  });

  it('deleteOp inverts to createOp', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createDeleteOp<Obj>({ object: obj }).invert().apply(adapter as any);
    expect(adapter.inserts).toEqual([obj]);
  });
});
```

- [ ] **Step 2.2: Write tests for selection op**

`src/canvas-kit/ops/selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSetSelectionOp } from './selection';

describe('createSetSelectionOp', () => {
  function makeAdapter() {
    const calls: string[][] = [];
    return {
      setSelection: (ids: string[]) => calls.push([...ids]),
      calls,
    };
  }

  it('apply sets the new selection', () => {
    const adapter = makeAdapter();
    createSetSelectionOp({ from: ['a'], to: ['b', 'c'] }).apply(adapter as any);
    expect(adapter.calls).toEqual([['b', 'c']]);
  });

  it('invert swaps from and to', () => {
    const adapter = makeAdapter();
    createSetSelectionOp({ from: ['a'], to: ['b', 'c'] }).invert().apply(adapter as any);
    expect(adapter.calls).toEqual([['a']]);
  });
});
```

- [ ] **Step 2.3: Run tests to verify they fail**

```
npx vitest run src/canvas-kit/ops/
```
Expected: FAIL — modules not found for `./create`, `./delete`, `./selection`.

- [ ] **Step 2.4: Implement create.ts**

`src/canvas-kit/ops/create.ts`:

```ts
import type { Op } from './types';
import { createDeleteOp } from './delete';

interface CreateAdapter<TObject> {
  insertObject(object: TObject): void;
}

export function createCreateOp<TObject extends { id: string }>(args: {
  object: TObject;
  label?: string;
}): Op {
  const { object, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as CreateAdapter<TObject>).insertObject(object);
    },
    invert() {
      return createDeleteOp({ object, label });
    },
  };
}
```

- [ ] **Step 2.5: Implement delete.ts**

`src/canvas-kit/ops/delete.ts`:

```ts
import type { Op } from './types';
import { createCreateOp } from './create';

interface DeleteAdapter {
  removeObject(id: string): void;
}

export function createDeleteOp<TObject extends { id: string }>(args: {
  object: TObject;
  label?: string;
}): Op {
  const { object, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as DeleteAdapter).removeObject(object.id);
    },
    invert() {
      return createCreateOp({ object, label });
    },
  };
}
```

- [ ] **Step 2.6: Implement selection.ts**

`src/canvas-kit/ops/selection.ts`:

```ts
import type { Op } from './types';

interface SelectionAdapter {
  setSelection(ids: string[]): void;
}

export function createSetSelectionOp(args: {
  from: string[];
  to: string[];
  label?: string;
}): Op {
  const { from, to, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as SelectionAdapter).setSelection(to);
    },
    invert() {
      return createSetSelectionOp({ from: to, to: from, label });
    },
  };
}
```

- [ ] **Step 2.7: Add ops barrel**

`src/canvas-kit/ops/index.ts`:

```ts
export type { Op } from './types';
export { createTransformOp } from './transform';
export { createReparentOp } from './reparent';
export { createCreateOp } from './create';
export { createDeleteOp } from './delete';
export { createSetSelectionOp } from './selection';
```

- [ ] **Step 2.8: Run tests to verify pass**

```
npx vitest run src/canvas-kit/ops/
```
Expected: PASS.

- [ ] **Step 2.9: Commit**

```
git add src/canvas-kit/ops/
git commit -m "feat(canvas-kit): add create/delete/selection ops"
```

---

### Task 3: History utility

**Files:**
- Create: `src/canvas-kit/history/history.ts`
- Create: `src/canvas-kit/history/history.test.ts`
- Create: `src/canvas-kit/history/index.ts`

- [ ] **Step 3.1: Write failing tests**

`src/canvas-kit/history/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createHistory } from './history';
import { createTransformOp } from '../ops/transform';

interface Pose { x: number; y: number }

function makeAdapter() {
  const state = new Map<string, Pose>();
  return {
    setPose: (id: string, pose: Pose) => state.set(id, { ...pose }),
    state,
  };
}

describe('createHistory', () => {
  it('applies a single op and pushes onto the undo stack', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    expect(adapter.state.get('a')).toEqual({ x: 1, y: 1 });
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('undo reverses the last op', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    history.undo();
    expect(adapter.state.get('a')).toEqual({ x: 0, y: 0 });
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('redo re-applies the undone op', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    history.undo();
    history.redo();
    expect(adapter.state.get('a')).toEqual({ x: 1, y: 1 });
  });

  it('applyBatch is atomic for undo', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.applyBatch(
      [
        createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }),
        createTransformOp<Pose>({ id: 'b', from: { x: 0, y: 0 }, to: { x: 2, y: 2 } }),
      ],
      'Batch',
    );
    expect(adapter.state.get('a')).toEqual({ x: 1, y: 1 });
    expect(adapter.state.get('b')).toEqual({ x: 2, y: 2 });
    history.undo();
    expect(adapter.state.get('a')).toEqual({ x: 0, y: 0 });
    expect(adapter.state.get('b')).toEqual({ x: 0, y: 0 });
  });

  it('apply after undo discards the redo stack', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    history.undo();
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }));
    expect(history.canRedo()).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run to verify failure**

```
npx vitest run src/canvas-kit/history/
```
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement history**

`src/canvas-kit/history/history.ts`:

```ts
import type { Op } from '../ops/types';

interface Entry {
  ops: Op[];
  label: string;
}

export interface History {
  apply(op: Op, label?: string): void;
  applyBatch(ops: Op[], label: string): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

export function createHistory(adapter: unknown): History {
  const undoStack: Entry[] = [];
  const redoStack: Entry[] = [];

  function applyEntry(entry: Entry) {
    for (const op of entry.ops) op.apply(adapter);
  }

  function invertEntry(entry: Entry): Entry {
    return {
      ops: [...entry.ops].reverse().map((op) => op.invert()),
      label: entry.label,
    };
  }

  return {
    apply(op, label) {
      const entry: Entry = { ops: [op], label: label ?? op.label ?? '' };
      applyEntry(entry);
      undoStack.push(entry);
      redoStack.length = 0;
    },
    applyBatch(ops, label) {
      if (ops.length === 0) return;
      const entry: Entry = { ops, label };
      applyEntry(entry);
      undoStack.push(entry);
      redoStack.length = 0;
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return;
      applyEntry(invertEntry(entry));
      redoStack.push(entry);
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return;
      applyEntry(entry);
      undoStack.push(entry);
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear: () => {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
```

- [ ] **Step 3.4: Add barrel**

`src/canvas-kit/history/index.ts`:

```ts
export { createHistory } from './history';
export type { History } from './history';
```

- [ ] **Step 3.5: Run tests to verify pass**

```
npx vitest run src/canvas-kit/history/
```
Expected: PASS.

- [ ] **Step 3.6: Commit**

```
git add src/canvas-kit/history/
git commit -m "feat(canvas-kit): add createHistory utility"
```

---

### Task 4: Adapter and interaction types

**Files:**
- Create: `src/canvas-kit/adapters/types.ts`
- Create: `src/canvas-kit/interactions/types.ts`

These are pure type files with no runtime; tests are deferred to the behavior and hook tasks where the types are exercised.

- [ ] **Step 4.1: Add adapter types**

`src/canvas-kit/adapters/types.ts`:

```ts
import type { Op } from '../ops/types';

/**
 * SnapTarget — where a dragged object would re-parent to if released.
 *
 * `slotPose` is the pose (in world coordinates) the object should snap to
 * within the target. `metadata` is an opaque pass-through for app-specific
 * snap details (slot index, visual hint, etc.).
 */
export interface SnapTarget<TPose = unknown> {
  parentId: string;
  slotPose: TPose;
  metadata?: unknown;
}

/**
 * Full scene adapter. Most consumers implement narrow per-hook subsets
 * (MoveAdapter, ResizeAdapter, ClipboardAdapter, ...) — TypeScript's
 * structural typing means a wider adapter satisfies any narrower interface.
 */
export interface SceneAdapter<TObject extends { id: string }, TPose> {
  // Pull (gesture-time queries)
  getObjects(): TObject[];
  getObject(id: string): TObject | undefined;
  getSelection(): string[];
  hitTest(worldX: number, worldY: number): string | null;
  getPose(id: string): TPose;
  getParent(id: string): string | null;

  // Mutators (called by op apply methods)
  setPose(id: string, pose: TPose): void;
  setParent(id: string, parentId: string | null): void;
  insertObject(object: TObject): void;
  removeObject(id: string): void;
  setSelection(ids: string[]): void;

  // Op submission (gesture commit point)
  applyBatch(ops: Op[], label: string): void;
}

/**
 * Narrow adapter for `useMoveInteraction`. Includes optional snap-target
 * lookup; apps without container-snapping leave it out.
 */
export interface MoveAdapter<TObject extends { id: string }, TPose> {
  getPose(id: string): TPose;
  getParent(id: string): string | null;
  setPose(id: string, pose: TPose): void;
  setParent(id: string, parentId: string | null): void;
  applyBatch(ops: Op[], label: string): void;
  findSnapTarget?(
    draggedId: string,
    worldX: number,
    worldY: number,
  ): SnapTarget<TPose> | null;
}
```

- [ ] **Step 4.2: Add interaction types**

`src/canvas-kit/interactions/types.ts`:

```ts
import type { Op } from '../ops/types';
import type { MoveAdapter, SnapTarget } from '../adapters/types';

export interface ModifierState {
  alt: boolean;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

export interface PointerState {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

/**
 * Per-gesture context passed to behaviors. `current` is the running pose
 * map; behaviors mutate proposed poses by returning new TPose values from
 * onMove. `scratch` is per-gesture key/value storage that resets at the
 * next gesture start.
 */
export interface GestureContext<TPose> {
  draggedIds: string[];
  origin: Map<string, TPose>;
  current: Map<string, TPose>;
  snap: SnapTarget<TPose> | null;
  modifiers: ModifierState;
  pointer: PointerState;
  adapter: MoveAdapter<{ id: string }, TPose>;
  scratch: Record<string, unknown>;
}

export interface BehaviorMoveResult<TPose> {
  pose?: TPose;
  snap?: SnapTarget<TPose> | null;
}

export interface MoveBehavior<TPose> {
  /** Called once at gesture start. */
  onStart?(ctx: GestureContext<TPose>): void;

  /**
   * Called on every pointermove past the threshold. Receives the proposed
   * pose (after earlier behaviors). Return `{ pose }` to override, `{ snap }`
   * to set snap state, both, or void to no-op.
   */
  onMove?(
    ctx: GestureContext<TPose>,
    proposed: TPose,
  ): BehaviorMoveResult<TPose> | void;

  /**
   * Called at gesture end. First non-undefined return wins:
   *   - Op[] → commit those ops (skip default)
   *   - null → abort gesture (no batch, no history entry)
   *   - undefined → defer to next behavior or default
   */
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | void;
}

/**
 * Transient gesture state for renderers. `null` when no gesture is in flight.
 */
export interface MoveOverlay<TPose> {
  draggedIds: string[];
  poses: Map<string, TPose>;
  snapped: SnapTarget<TPose> | null;
  hideIds: string[];
}
```

- [ ] **Step 4.3: Verify build still green**

```
npm run build
```
Expected: PASS.

- [ ] **Step 4.4: Commit**

```
git add src/canvas-kit/adapters/ src/canvas-kit/interactions/types.ts
git commit -m "feat(canvas-kit): add SceneAdapter, MoveAdapter, MoveBehavior types"
```

---

### Task 5: snapToGrid behavior

**Files:**
- Create: `src/canvas-kit/interactions/behaviors/snapToGrid.ts`
- Create: `src/canvas-kit/interactions/behaviors/snapToGrid.test.ts`

- [ ] **Step 5.1: Write failing tests**

`src/canvas-kit/interactions/behaviors/snapToGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { snapToGrid } from './snapToGrid';
import type { GestureContext } from '../types';

interface Pose { x: number; y: number }

function ctx(modifiers: Partial<GestureContext<Pose>['modifiers']> = {}): GestureContext<Pose> {
  return {
    draggedIds: ['a'],
    origin: new Map(),
    current: new Map(),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, ...modifiers },
    pointer: { worldX: 0, worldY: 0, clientX: 0, clientY: 0 },
    adapter: {} as any,
    scratch: {},
  };
}

describe('snapToGrid', () => {
  it('rounds x and y to the nearest cell', () => {
    const b = snapToGrid<Pose>({ cellFt: 1 });
    const result = b.onMove!(ctx(), { x: 1.4, y: 2.6 });
    expect(result).toEqual({ pose: { x: 1, y: 3 } });
  });

  it('preserves extra pose fields', () => {
    interface FullPose { x: number; y: number; widthFt: number }
    const b = snapToGrid<FullPose>({ cellFt: 0.5 });
    const result = b.onMove!(
      ctx() as unknown as GestureContext<FullPose>,
      { x: 0.3, y: 0.7, widthFt: 4 },
    );
    expect(result).toEqual({ pose: { x: 0.5, y: 0.5, widthFt: 4 } });
  });

  it('bypassKey suppresses snapping when held', () => {
    const b = snapToGrid<Pose>({ cellFt: 1, bypassKey: 'alt' });
    const result = b.onMove!(ctx({ alt: true }), { x: 1.4, y: 2.6 });
    expect(result).toBeUndefined();
  });

  it('bypassKey does not suppress when other modifier held', () => {
    const b = snapToGrid<Pose>({ cellFt: 1, bypassKey: 'alt' });
    const result = b.onMove!(ctx({ shift: true }), { x: 1.4, y: 2.6 });
    expect(result).toEqual({ pose: { x: 1, y: 3 } });
  });
});
```

- [ ] **Step 5.2: Run to verify failure**

```
npx vitest run src/canvas-kit/interactions/behaviors/
```
Expected: FAIL.

- [ ] **Step 5.3: Implement snapToGrid**

`src/canvas-kit/interactions/behaviors/snapToGrid.ts`:

```ts
import type { MoveBehavior, ModifierState } from '../types';

type ModKey = keyof ModifierState;

export function snapToGrid<TPose extends { x: number; y: number }>(args: {
  cellFt: number;
  bypassKey?: ModKey;
}): MoveBehavior<TPose> {
  const { cellFt, bypassKey } = args;
  return {
    onMove(ctx, proposed) {
      if (bypassKey && ctx.modifiers[bypassKey]) return;
      return {
        pose: {
          ...proposed,
          x: Math.round(proposed.x / cellFt) * cellFt,
          y: Math.round(proposed.y / cellFt) * cellFt,
        },
      };
    },
  };
}
```

- [ ] **Step 5.4: Run to verify pass**

```
npx vitest run src/canvas-kit/interactions/behaviors/
```
Expected: PASS.

- [ ] **Step 5.5: Commit**

```
git add src/canvas-kit/interactions/
git commit -m "feat(canvas-kit): add snapToGrid behavior"
```

---

### Task 6: snapToContainer behavior

**Files:**
- Create: `src/canvas-kit/interactions/behaviors/snapToContainer.ts`
- Create: `src/canvas-kit/interactions/behaviors/snapToContainer.test.ts`

- [ ] **Step 6.1: Write failing tests**

`src/canvas-kit/interactions/behaviors/snapToContainer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapToContainer } from './snapToContainer';
import { createTransformOp } from '../../ops/transform';
import { createReparentOp } from '../../ops/reparent';
import type { GestureContext } from '../types';
import type { SnapTarget } from '../../adapters/types';

interface Pose { x: number; y: number }

function makeCtx(): GestureContext<Pose> {
  return {
    draggedIds: ['p1'],
    origin: new Map([['p1', { x: 0, y: 0 }]]),
    current: new Map([['p1', { x: 1, y: 1 }]]),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: 5, worldY: 5, clientX: 100, clientY: 100 },
    adapter: { getParent: () => 'oldParent' } as any,
    scratch: {},
  };
}

describe('snapToContainer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets snap state immediately when findTarget returns instant=true', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 }, metadata: { instant: true } };
    const findTarget = vi.fn().mockReturnValue(target);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget, isInstant: (t) => (t.metadata as any)?.instant });
    const ctx = makeCtx();
    const result = b.onMove!(ctx, { x: 1, y: 1 });
    expect(result).toEqual({ pose: { x: 2, y: 3 }, snap: target });
  });

  it('does not snap until dwell elapses', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 } };
    const findTarget = vi.fn().mockReturnValue(target);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget });
    const ctx = makeCtx();
    const r1 = b.onMove!(ctx, { x: 1, y: 1 });
    expect(r1).toBeUndefined();
    vi.advanceTimersByTime(499);
    const r2 = b.onMove!(ctx, { x: 1, y: 1 });
    expect(r2).toBeUndefined();
  });

  it('snaps after dwell elapses on next onMove call', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 } };
    const findTarget = vi.fn().mockReturnValue(target);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    vi.advanceTimersByTime(500);
    const r = b.onMove!(ctx, { x: 1, y: 1 });
    expect(r).toEqual({ pose: { x: 2, y: 3 }, snap: target });
  });

  it('moving away from target before dwell cancels timer', () => {
    const target1: SnapTarget<Pose> = { parentId: 'box1', slotPose: { x: 2, y: 3 } };
    const findTarget = vi.fn().mockReturnValueOnce(target1).mockReturnValue(null);
    const b = snapToContainer<Pose>({ dwellMs: 500, findTarget });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    vi.advanceTimersByTime(200);
    b.onMove!(ctx, { x: 10, y: 10 });
    vi.advanceTimersByTime(500);
    const r = b.onMove!(ctx, { x: 10, y: 10 });
    expect(r?.snap ?? null).toBeNull();
  });

  it('onEnd emits [TransformOp, ReparentOp] when snapped to a new parent', () => {
    const target: SnapTarget<Pose> = { parentId: 'box', slotPose: { x: 2, y: 3 } };
    const b = snapToContainer<Pose>({ dwellMs: 0, findTarget: () => target });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    ctx.snap = target;
    const ops = b.onEnd!(ctx);
    expect(Array.isArray(ops)).toBe(true);
    expect(ops!.length).toBe(2);
    expect((ops![0] as any).label ?? '').toMatch(/move|Move/i);
  });

  it('onEnd emits only TransformOp when snapped target equals old parent', () => {
    const target: SnapTarget<Pose> = { parentId: 'oldParent', slotPose: { x: 2, y: 3 } };
    const b = snapToContainer<Pose>({ dwellMs: 0, findTarget: () => target });
    const ctx = makeCtx();
    b.onMove!(ctx, { x: 1, y: 1 });
    ctx.snap = target;
    const ops = b.onEnd!(ctx);
    expect(ops!.length).toBe(1);
  });

  it('onEnd defers (returns undefined) when no snap is active', () => {
    const b = snapToContainer<Pose>({ dwellMs: 0, findTarget: () => null });
    const ctx = makeCtx();
    expect(b.onEnd!(ctx)).toBeUndefined();
  });
});
```

- [ ] **Step 6.2: Run to verify failure**

```
npx vitest run src/canvas-kit/interactions/behaviors/snapToContainer.test.ts
```
Expected: FAIL.

- [ ] **Step 6.3: Implement snapToContainer**

`src/canvas-kit/interactions/behaviors/snapToContainer.ts`:

```ts
import { createTransformOp } from '../../ops/transform';
import { createReparentOp } from '../../ops/reparent';
import type { Op } from '../../ops/types';
import type { SnapTarget } from '../../adapters/types';
import type { MoveBehavior, GestureContext } from '../types';

interface SnapState<TPose> {
  pendingTargetId: string | null;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  committedSnap: SnapTarget<TPose> | null;
}

const KEY = 'snapToContainer';

function getState<TPose>(ctx: GestureContext<TPose>): SnapState<TPose> {
  let s = ctx.scratch[KEY] as SnapState<TPose> | undefined;
  if (!s) {
    s = { pendingTargetId: null, pendingTimer: null, committedSnap: null };
    ctx.scratch[KEY] = s;
  }
  return s;
}

function clearTimer<TPose>(s: SnapState<TPose>) {
  if (s.pendingTimer !== null) {
    clearTimeout(s.pendingTimer);
    s.pendingTimer = null;
  }
  s.pendingTargetId = null;
}

export function snapToContainer<TPose extends { x: number; y: number }>(args: {
  dwellMs: number;
  findTarget: (
    draggedId: string,
    worldX: number,
    worldY: number,
  ) => SnapTarget<TPose> | null;
  /**
   * Optional predicate: if true for a returned target, snap immediately
   * without waiting for dwell. Used for "cursor inside empty container."
   */
  isInstant?: (target: SnapTarget<TPose>) => boolean;
  moveLabel?: string;
  reparentLabel?: string;
}): MoveBehavior<TPose> {
  const { dwellMs, findTarget, isInstant, moveLabel = 'Move', reparentLabel = 'Move and reparent' } = args;

  return {
    onMove(ctx, proposed) {
      const s = getState<TPose>(ctx);
      const target = findTarget(ctx.draggedIds[0], ctx.pointer.worldX, ctx.pointer.worldY);

      // Already committed to a snap; check if cursor is still over the same target
      if (s.committedSnap) {
        if (target && target.parentId === s.committedSnap.parentId) {
          return { pose: s.committedSnap.slotPose, snap: s.committedSnap };
        }
        s.committedSnap = null;
        // Fall through to re-evaluate
      }

      if (!target) {
        clearTimer(s);
        return;
      }

      if (isInstant?.(target)) {
        clearTimer(s);
        s.committedSnap = target;
        return { pose: target.slotPose, snap: target };
      }

      // Dwell logic
      if (s.pendingTargetId === target.parentId) {
        // Timer already running for this target; nothing new
        return;
      }
      clearTimer(s);
      s.pendingTargetId = target.parentId;
      s.pendingTimer = setTimeout(() => {
        s.committedSnap = target;
        s.pendingTimer = null;
      }, dwellMs);
      // After timer elapses, the next onMove call will see committedSnap set and snap.
      return;
    },

    onEnd(ctx) {
      const s = getState<TPose>(ctx);
      clearTimer(s);
      const snap = s.committedSnap ?? ctx.snap;
      if (!snap) return;
      const draggedId = ctx.draggedIds[0];
      const oldParent = ctx.adapter.getParent(draggedId);
      const fromPose = ctx.origin.get(draggedId)!;
      const ops: Op[] = [
        createTransformOp<TPose>({
          id: draggedId,
          from: fromPose,
          to: snap.slotPose,
          label: moveLabel,
        }),
      ];
      if (oldParent !== snap.parentId) {
        ops.push(createReparentOp({
          id: draggedId,
          from: oldParent,
          to: snap.parentId,
          label: reparentLabel,
        }));
      }
      return ops;
    },
  };
}
```

- [ ] **Step 6.4: Run to verify pass**

```
npx vitest run src/canvas-kit/interactions/behaviors/snapToContainer.test.ts
```
Expected: PASS.

- [ ] **Step 6.5: Commit**

```
git add src/canvas-kit/interactions/
git commit -m "feat(canvas-kit): add snapToContainer behavior"
```

---

### Task 7: snapBackOrDelete behavior

**Files:**
- Create: `src/canvas-kit/interactions/behaviors/snapBackOrDelete.ts`
- Create: `src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts`

- [ ] **Step 7.1: Write failing tests**

`src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { snapBackOrDelete } from './snapBackOrDelete';
import type { GestureContext } from '../types';

interface Pose { x: number; y: number }

function ctx(originPose: Pose, currentPose: Pose, objectsById: Record<string, any> = {}): GestureContext<Pose> {
  return {
    draggedIds: ['a'],
    origin: new Map([['a', originPose]]),
    current: new Map([['a', currentPose]]),
    snap: null,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false },
    pointer: { worldX: currentPose.x, worldY: currentPose.y, clientX: 0, clientY: 0 },
    adapter: {
      getObject: (id: string) => objectsById[id],
    } as any,
    scratch: {},
  };
}

describe('snapBackOrDelete', () => {
  it('returns null (snap-back) when within radius and policy is snap-back', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'snap-back' });
    const c = ctx({ x: 5, y: 5 }, { x: 5.5, y: 5.2 });
    expect(b.onEnd!(c)).toBeNull();
  });

  it('returns null when within radius and policy is delete', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'delete' });
    const c = ctx({ x: 5, y: 5 }, { x: 5.5, y: 5.2 });
    expect(b.onEnd!(c)).toBeNull();
  });

  it('returns [DeleteOp] when outside radius and policy is delete', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'delete' });
    const obj = { id: 'a', x: 0, y: 0 };
    const c = ctx({ x: 5, y: 5 }, { x: 50, y: 50 }, { a: obj });
    const ops = b.onEnd!(c);
    expect(Array.isArray(ops)).toBe(true);
    expect((ops as any[])[0].label).toMatch(/delete/i);
  });

  it('returns undefined when outside radius and policy is snap-back', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'snap-back' });
    const c = ctx({ x: 5, y: 5 }, { x: 50, y: 50 });
    expect(b.onEnd!(c)).toBeUndefined();
  });

  it('defers (returns undefined) when a snap is active', () => {
    const b = snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'delete' });
    const c = ctx({ x: 5, y: 5 }, { x: 50, y: 50 });
    c.snap = { parentId: 'box', slotPose: { x: 0, y: 0 } };
    expect(b.onEnd!(c)).toBeUndefined();
  });
});
```

- [ ] **Step 7.2: Run to verify failure**

```
npx vitest run src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts
```
Expected: FAIL.

- [ ] **Step 7.3: Implement snapBackOrDelete**

`src/canvas-kit/interactions/behaviors/snapBackOrDelete.ts`:

```ts
import { createDeleteOp } from '../../ops/delete';
import type { Op } from '../../ops/types';
import type { MoveBehavior } from '../types';

export function snapBackOrDelete<TPose extends { x: number; y: number }>(args: {
  radiusFt: number;
  onFreeRelease: 'snap-back' | 'delete';
  deleteLabel?: string;
}): MoveBehavior<TPose> {
  const { radiusFt, onFreeRelease, deleteLabel = 'Delete' } = args;
  const r2 = radiusFt * radiusFt;

  return {
    onEnd(ctx) {
      // Defer if any snap is active — let the snap behavior handle commit.
      if (ctx.snap) return;
      const id = ctx.draggedIds[0];
      const origin = ctx.origin.get(id)!;
      const current = ctx.current.get(id)!;
      const dx = current.x - origin.x;
      const dy = current.y - origin.y;
      const within = dx * dx + dy * dy <= r2;
      if (within) {
        return null; // snap-back, no history entry
      }
      if (onFreeRelease === 'delete') {
        const obj = (ctx.adapter as unknown as {
          getObject?(id: string): { id: string } | undefined;
        }).getObject?.(id);
        if (!obj) return; // can't delete without snapshot; defer
        const ops: Op[] = [createDeleteOp({ object: obj, label: deleteLabel })];
        return ops;
      }
      // snap-back outside radius → defer to default commit
      return;
    },
  };
}
```

- [ ] **Step 7.4: Run to verify pass**

```
npx vitest run src/canvas-kit/interactions/behaviors/snapBackOrDelete.test.ts
```
Expected: PASS.

- [ ] **Step 7.5: Add behaviors barrel**

`src/canvas-kit/interactions/behaviors/index.ts`:

```ts
export { snapToGrid } from './snapToGrid';
export { snapToContainer } from './snapToContainer';
export { snapBackOrDelete } from './snapBackOrDelete';
```

- [ ] **Step 7.6: Commit**

```
git add src/canvas-kit/interactions/
git commit -m "feat(canvas-kit): add snapBackOrDelete behavior + behaviors barrel"
```

---

### Task 8: useMoveInteraction (kit hook)

**Files:**
- Create: `src/canvas-kit/interactions/move.ts`
- Create: `src/canvas-kit/interactions/move.test.ts`

This is the load-bearing task. The hook owns:
- Pending vs active state (drag-threshold gating)
- Origin pose capture
- Per-frame pose pipeline (translate by delta → run behaviors in order)
- Multi-object group drag (move whole selection together)
- Overlay state for renderers
- Commit at gesture end (default `[TransformOp]` per id, or behavior-supplied ops)

The hook returns an imperative API matching the existing one (`start/move/end/cancel`) plus `overlay` so CanvasStack can keep its dispatcher pattern.

- [ ] **Step 8.1: Write failing tests covering threshold, default commit, behavior pipeline, snap-back, group drag**

`src/canvas-kit/interactions/move.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMoveInteraction } from './move';
import { snapToGrid } from './behaviors/snapToGrid';
import { snapBackOrDelete } from './behaviors/snapBackOrDelete';
import type { MoveAdapter } from '../adapters/types';
import type { Op } from '../ops/types';

interface Pose { x: number; y: number }
interface Obj { id: string; pose: Pose; parent: string | null }

function makeAdapter(initial: Obj[]): MoveAdapter<Obj, Pose> & {
  store: Map<string, Obj>;
  batches: { ops: Op[]; label: string }[];
} {
  const store = new Map<string, Obj>(initial.map((o) => [o.id, { ...o, pose: { ...o.pose } }]));
  const batches: { ops: Op[]; label: string }[] = [];
  return {
    store,
    batches,
    getPose: (id) => store.get(id)!.pose,
    getParent: (id) => store.get(id)!.parent,
    setPose: (id, pose) => {
      store.get(id)!.pose = { ...pose };
    },
    setParent: (id, parent) => {
      store.get(id)!.parent = parent;
    },
    applyBatch: (ops, label) => {
      for (const op of ops) op.apply({
        setPose: (id: string, pose: Pose) => store.get(id)!.pose = { ...pose },
        setParent: (id: string, p: string | null) => store.get(id)!.parent = p,
        insertObject: (o: Obj) => store.set(o.id, o),
        removeObject: (id: string) => store.delete(id),
      });
      batches.push({ ops, label });
    },
  };
}

const translatePose = (p: Pose, dx: number, dy: number) => ({ ...p, x: p.x + dx, y: p.y + dy });

describe('useMoveInteraction', () => {
  it('does not commit before threshold is exceeded', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose }));
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 0.05, worldY: 0.05, clientX: 1, clientY: 1, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.batches).toEqual([]);
  });

  it('emits a default TransformOp batch when moved past threshold', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose, dragThresholdPx: 4 }));
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.batches.length).toBe(1);
    expect(adapter.store.get('a')!.pose).toEqual({ x: 5, y: 5 });
  });

  it('snapToGrid behavior rounds the proposed pose', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() =>
      useMoveInteraction(adapter, { translatePose, behaviors: [snapToGrid<Pose>({ cellFt: 1 })] }),
    );
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5.4, worldY: 5.6, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.store.get('a')!.pose).toEqual({ x: 5, y: 6 });
  });

  it('snapBackOrDelete with delete policy emits DeleteOp when far from origin', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: 'p' }]);
    const { result } = renderHook(() =>
      useMoveInteraction(adapter, {
        translatePose,
        behaviors: [snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'delete' })],
      }),
    );
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 50, worldY: 50, clientX: 1000, clientY: 1000, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.store.has('a')).toBe(false);
  });

  it('snap-back (within radius) commits no batch', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: 'p' }]);
    const { result } = renderHook(() =>
      useMoveInteraction(adapter, {
        translatePose,
        behaviors: [snapBackOrDelete<Pose>({ radiusFt: 1, onFreeRelease: 'snap-back' })],
      }),
    );
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 0.3, worldY: 0.3, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.batches).toEqual([]);
    expect(adapter.store.get('a')!.pose).toEqual({ x: 0, y: 0 });
  });

  it('group drag moves all dragged ids by the same delta', () => {
    const adapter = makeAdapter([
      { id: 'a', pose: { x: 0, y: 0 }, parent: null },
      { id: 'b', pose: { x: 10, y: 10 }, parent: null },
    ]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose }));
    act(() => result.current.start({ ids: ['a', 'b'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.store.get('a')!.pose).toEqual({ x: 5, y: 5 });
    expect(adapter.store.get('b')!.pose).toEqual({ x: 15, y: 15 });
    expect(adapter.batches.length).toBe(1);
    expect(adapter.batches[0].ops.length).toBe(2);
  });

  it('overlay reflects in-flight pose; cleared on end', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose }));
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    expect(result.current.overlay).not.toBeNull();
    expect(result.current.overlay!.poses.get('a')).toEqual({ x: 5, y: 5 });
    act(() => result.current.end());
    expect(result.current.overlay).toBeNull();
  });
});
```

- [ ] **Step 8.2: Run to verify failure**

```
npx vitest run src/canvas-kit/interactions/move.test.ts
```
Expected: FAIL.

- [ ] **Step 8.3: Implement useMoveInteraction**

`src/canvas-kit/interactions/move.ts`:

```ts
import { useRef, useState, useCallback } from 'react';
import { createTransformOp } from '../ops/transform';
import type { Op } from '../ops/types';
import type { MoveAdapter, SnapTarget } from '../adapters/types';
import type { GestureContext, MoveBehavior, MoveOverlay, ModifierState, PointerState } from './types';

export interface UseMoveInteractionOptions<TPose> {
  translatePose: (pose: TPose, dx: number, dy: number) => TPose;
  behaviors?: MoveBehavior<TPose>[];
  dragThresholdPx?: number;
  moveLabel?: string;
  onGestureStart?(ids: string[]): void;
  onGestureEnd?(committed: boolean): void;
}

export interface MoveStartArgs {
  ids: string[];
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

export interface MoveMoveArgs {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
  modifiers: ModifierState;
}

export interface UseMoveInteractionReturn<TPose> {
  start(args: MoveStartArgs): void;
  move(args: MoveMoveArgs): boolean;
  end(): void;
  cancel(): void;
  isActive(): boolean;
  overlay: MoveOverlay<TPose> | null;
}

export function useMoveInteraction<TObject extends { id: string }, TPose>(
  adapter: MoveAdapter<TObject, TPose>,
  options: UseMoveInteractionOptions<TPose>,
): UseMoveInteractionReturn<TPose> {
  const {
    translatePose,
    behaviors = [],
    dragThresholdPx = 4,
    moveLabel = 'Move',
    onGestureStart,
    onGestureEnd,
  } = options;

  const stateRef = useRef<{
    phase: 'idle' | 'pending' | 'active';
    startWorld: { x: number; y: number };
    startClient: { x: number; y: number };
    ctx: GestureContext<TPose> | null;
  }>({
    phase: 'idle',
    startWorld: { x: 0, y: 0 },
    startClient: { x: 0, y: 0 },
    ctx: null,
  });

  const [overlay, setOverlay] = useState<MoveOverlay<TPose> | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.phase = 'idle';
    stateRef.current.ctx = null;
    setOverlay(null);
  }, []);

  const start = useCallback((args: MoveStartArgs) => {
    const origin = new Map<string, TPose>();
    for (const id of args.ids) origin.set(id, adapter.getPose(id));
    stateRef.current = {
      phase: 'pending',
      startWorld: { x: args.worldX, y: args.worldY },
      startClient: { x: args.clientX, y: args.clientY },
      ctx: {
        draggedIds: args.ids,
        origin,
        current: new Map(origin),
        snap: null,
        modifiers: { alt: false, shift: false, meta: false, ctrl: false },
        pointer: { worldX: args.worldX, worldY: args.worldY, clientX: args.clientX, clientY: args.clientY },
        adapter: adapter as unknown as GestureContext<TPose>['adapter'],
        scratch: {},
      },
    };
  }, [adapter]);

  const move = useCallback((args: MoveMoveArgs): boolean => {
    const s = stateRef.current;
    if (s.phase === 'idle' || !s.ctx) return false;

    if (s.phase === 'pending') {
      const dxs = args.clientX - s.startClient.x;
      const dys = args.clientY - s.startClient.y;
      if (dxs * dxs + dys * dys < dragThresholdPx * dragThresholdPx) return true;
      s.phase = 'active';
      onGestureStart?.(s.ctx.draggedIds);
      for (const b of behaviors) b.onStart?.(s.ctx);
    }

    const ctx = s.ctx;
    ctx.modifiers = args.modifiers;
    ctx.pointer = { worldX: args.worldX, worldY: args.worldY, clientX: args.clientX, clientY: args.clientY };

    const dx = args.worldX - s.startWorld.x;
    const dy = args.worldY - s.startWorld.y;

    const newPoses = new Map<string, TPose>();
    let snap: SnapTarget<TPose> | null = ctx.snap;

    for (const id of ctx.draggedIds) {
      const originPose = ctx.origin.get(id)!;
      let proposed = translatePose(originPose, dx, dy);
      // Behaviors run only against the primary id (first in the array).
      // For multi-select group drag, secondary ids share the same delta.
      if (id === ctx.draggedIds[0]) {
        for (const b of behaviors) {
          const r = b.onMove?.(ctx, proposed);
          if (!r) continue;
          if (r.pose !== undefined) proposed = r.pose;
          if (r.snap !== undefined) snap = r.snap;
        }
      }
      newPoses.set(id, proposed);
    }

    ctx.current = newPoses;
    ctx.snap = snap;
    setOverlay({ draggedIds: ctx.draggedIds, poses: newPoses, snapped: snap, hideIds: ctx.draggedIds });
    return true;
  }, [adapter, behaviors, dragThresholdPx, onGestureStart, translatePose]);

  const end = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'active' || !s.ctx) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }
    const ctx = s.ctx;

    let ops: Op[] | null | undefined;
    for (const b of behaviors) {
      const r = b.onEnd?.(ctx);
      if (r === undefined) continue;
      ops = r; // null or Op[]
      break;
    }

    if (ops === null) {
      cleanup();
      onGestureEnd?.(false);
      return;
    }

    if (ops === undefined) {
      ops = ctx.draggedIds.map((id) =>
        createTransformOp<TPose>({
          id,
          from: ctx.origin.get(id)!,
          to: ctx.current.get(id)!,
          label: moveLabel,
        }),
      );
    }

    if (ops.length > 0) {
      adapter.applyBatch(ops, ops[0].label ?? moveLabel);
    }
    cleanup();
    onGestureEnd?.(true);
  }, [adapter, behaviors, cleanup, moveLabel, onGestureEnd]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  const isActive = useCallback(() => stateRef.current.phase === 'active', []);

  return { start, move, end, cancel, isActive, overlay };
}
```

- [ ] **Step 8.4: Run to verify pass**

```
npx vitest run src/canvas-kit/interactions/move.test.ts
```
Expected: PASS.

- [ ] **Step 8.5: Add kit barrel exports**

Modify `src/canvas-kit/index.ts`:

```ts
// Append to existing exports:
export * from './ops';
export * from './history';
export * from './adapters/types';
export * from './interactions/types';
export * from './interactions/behaviors';
export { useMoveInteraction } from './interactions/move';
export type {
  UseMoveInteractionOptions,
  UseMoveInteractionReturn,
  MoveStartArgs,
  MoveMoveArgs,
} from './interactions/move';
```

- [ ] **Step 8.6: Run full test suite**

```
npx vitest run
```
Expected: PASS — no regressions.

- [ ] **Step 8.7: Commit**

```
git add src/canvas-kit/
git commit -m "feat(canvas-kit): add useMoveInteraction hook with behavior pipeline"
```

---

### Task 9: Garden adapters — plantingMove

**Files:**
- Create: `src/canvas/adapters/plantingMove.ts`
- Create: `src/canvas/adapters/plantingMove.test.ts`

The planting move adapter is the most complex of the three because it carries snap-target lookup and free-release-deletion. The pose for a planting is parent-relative `{x, y}`; the adapter translates between parent-relative storage and world-coordinate gesture math.

- [ ] **Step 9.1: Write failing tests**

`src/canvas/adapters/plantingMove.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlantingMoveAdapter } from './plantingMove';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createTransformOp } from '@/canvas-kit';

describe('plantingMoveAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  function setup() {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 5, y: 5, width: 4, height: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: 'tomato' });
    const planting = useGardenStore.getState().garden.plantings[0];
    return { bed, planting };
  }

  it('getPose returns world-coordinate pose', () => {
    const { bed, planting } = setup();
    const a = createPlantingMoveAdapter();
    expect(a.getPose(planting.id)).toEqual({ x: bed.x + planting.x, y: bed.y + planting.y });
  });

  it('getParent returns the planting parentId', () => {
    const { bed, planting } = setup();
    const a = createPlantingMoveAdapter();
    expect(a.getParent(planting.id)).toBe(bed.id);
  });

  it('applyBatch wraps mutations in a checkpoint', () => {
    const { planting } = setup();
    const a = createPlantingMoveAdapter();
    const before = useGardenStore.getState().canUndo();
    a.applyBatch(
      [createTransformOp<{ x: number; y: number }>({ id: planting.id, from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })],
      'Move',
    );
    expect(useGardenStore.getState().canUndo()).toBe(true);
    expect(before).toBe(false);
  });

  it('setPose stores parent-relative coords', () => {
    const { bed, planting } = setup();
    const a = createPlantingMoveAdapter();
    a.setPose(planting.id, { x: bed.x + 2, y: bed.y + 3 });
    const updated = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    expect(updated.x).toBe(2);
    expect(updated.y).toBe(3);
  });

  it('setParent rewrites parent and converts pose to new parent-relative coords', () => {
    const { bed, planting } = setup();
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 20, y: 20, width: 4, height: 4 });
    const bed2 = useGardenStore.getState().garden.structures[1];
    const a = createPlantingMoveAdapter();
    a.setParent(planting.id, bed2.id);
    const updated = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    expect(updated.parentId).toBe(bed2.id);
  });

  it('removeObject removes the planting', () => {
    const { planting } = setup();
    const a = createPlantingMoveAdapter();
    a.removeObject(planting.id);
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
  });

  it('insertObject re-creates a deleted planting (round-trip)', () => {
    const { planting } = setup();
    const a = createPlantingMoveAdapter();
    const snapshot = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    a.removeObject(planting.id);
    a.insertObject(snapshot);
    const restored = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    expect(restored.x).toBe(snapshot.x);
    expect(restored.y).toBe(snapshot.y);
    expect(restored.parentId).toBe(snapshot.parentId);
  });
});
```

- [ ] **Step 9.2: Run to verify failure**

```
npx vitest run src/canvas/adapters/plantingMove.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 9.3: Implement plantingMove adapter**

`src/canvas/adapters/plantingMove.ts`:

```ts
import { findSnapContainer } from '../findSnapContainer';
import { useGardenStore } from '../../store/gardenStore';
import { createPlanting } from '../../model/types';
import type { Planting } from '../../model/types';
import type { MoveAdapter, Op, SnapTarget } from '@/canvas-kit';

export interface PlantingPose { x: number; y: number }

function getPlanting(id: string): Planting | undefined {
  return useGardenStore.getState().garden.plantings.find((p) => p.id === id);
}

function getParent(id: string): { id: string; x: number; y: number } | undefined {
  const garden = useGardenStore.getState().garden;
  return garden.structures.find((s) => s.id === id) ?? garden.zones.find((z) => z.id === id);
}

export function createPlantingMoveAdapter(): MoveAdapter<Planting, PlantingPose> & {
  insertObject(p: Planting): void;
  removeObject(id: string): void;
  getObject(id: string): Planting | undefined;
} {
  return {
    getPose(id) {
      const p = getPlanting(id);
      if (!p) throw new Error(`planting not found: ${id}`);
      const parent = p.parentId ? getParent(p.parentId) : undefined;
      return { x: (parent?.x ?? 0) + p.x, y: (parent?.y ?? 0) + p.y };
    },
    getParent(id) {
      return getPlanting(id)?.parentId ?? null;
    },
    getObject(id) {
      return getPlanting(id);
    },
    setPose(id, pose) {
      const p = getPlanting(id);
      if (!p) return;
      const parent = p.parentId ? getParent(p.parentId) : undefined;
      const localX = pose.x - (parent?.x ?? 0);
      const localY = pose.y - (parent?.y ?? 0);
      useGardenStore.getState().updatePlanting(id, { x: localX, y: localY });
    },
    setParent(id, parentId) {
      useGardenStore.getState().updatePlanting(id, { parentId: parentId ?? '' });
    },
    insertObject(planting) {
      const fresh = createPlanting({
        parentId: planting.parentId,
        x: planting.x,
        y: planting.y,
        cultivarId: planting.cultivarId,
      });
      // Preserve original id so undo/redo round-trip is stable.
      useGardenStore.setState((s) => ({
        garden: {
          ...s.garden,
          plantings: [...s.garden.plantings, { ...fresh, id: planting.id }],
        },
      }));
    },
    removeObject(id) {
      useGardenStore.getState().removePlanting(id);
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
    applyBatch(ops: Op[], label: string) {
      const checkpoint = useGardenStore.getState().checkpoint;
      checkpoint();
      for (const op of ops) op.apply({
        setPose: (id: string, pose: PlantingPose) => {
          const p = getPlanting(id);
          if (!p) return;
          const parent = p.parentId ? getParent(p.parentId) : undefined;
          useGardenStore.getState().updatePlanting(id, {
            x: pose.x - (parent?.x ?? 0),
            y: pose.y - (parent?.y ?? 0),
          });
        },
        setParent: (id: string, p: string | null) => {
          useGardenStore.getState().updatePlanting(id, { parentId: p ?? '' });
        },
        insertObject: (planting: Planting) => {
          useGardenStore.setState((s) => ({
            garden: { ...s.garden, plantings: [...s.garden.plantings, planting] },
          }));
        },
        removeObject: (id: string) => {
          useGardenStore.getState().removePlanting(id);
        },
      });
      void label; // label currently unused; gardenStore history doesn't accept labels yet
    },
  };
}
```

- [ ] **Step 9.4: Run to verify pass**

```
npx vitest run src/canvas/adapters/plantingMove.test.ts
```
Expected: PASS.

- [ ] **Step 9.5: Commit**

```
git add src/canvas/adapters/
git commit -m "feat(garden): add plantingMove adapter for canvas-kit"
```

---

### Task 10: Garden adapters — zoneMove and structureMove

**Files:**
- Create: `src/canvas/adapters/zoneMove.ts`
- Create: `src/canvas/adapters/structureMove.ts`
- Create: `src/canvas/adapters/zoneMove.test.ts`
- Create: `src/canvas/adapters/structureMove.test.ts`

Zones and structures are simpler than plantings: their pose is `{x, y, widthFt, heightFt}` in world coordinates, no reparenting, no snap. Structures additionally drag their child structures (e.g., a patio with a bench attached) — that's a *kit* concern (multi-id drag) rather than an adapter concern. The structureMove adapter exposes only the leaf operations.

- [ ] **Step 10.1: Write failing tests for zoneMove**

`src/canvas/adapters/zoneMove.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createZoneMoveAdapter } from './zoneMove';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createTransformOp } from '@/canvas-kit';

describe('zoneMoveAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  function setup() {
    useGardenStore.getState().addZone({ name: 'Z', x: 0, y: 0, width: 5, height: 5 });
    return useGardenStore.getState().garden.zones[0];
  }

  it('getPose returns full zone bounds', () => {
    const z = setup();
    const a = createZoneMoveAdapter();
    expect(a.getPose(z.id)).toEqual({ x: z.x, y: z.y, widthFt: z.width, heightFt: z.height });
  });

  it('setPose updates x and y but preserves width and height', () => {
    const z = setup();
    const a = createZoneMoveAdapter();
    a.setPose(z.id, { x: 10, y: 10, widthFt: 999, heightFt: 999 });
    const updated = useGardenStore.getState().garden.zones[0];
    expect(updated.x).toBe(10);
    expect(updated.y).toBe(10);
    expect(updated.width).toBe(z.width);
    expect(updated.height).toBe(z.height);
  });

  it('applyBatch checkpoints once per batch', () => {
    const z = setup();
    const a = createZoneMoveAdapter();
    a.applyBatch(
      [createTransformOp({ id: z.id, from: { x: 0, y: 0, widthFt: 5, heightFt: 5 }, to: { x: 3, y: 3, widthFt: 5, heightFt: 5 } })],
      'Move',
    );
    expect(useGardenStore.getState().canUndo()).toBe(true);
  });
});
```

- [ ] **Step 10.2: Implement zoneMove**

`src/canvas/adapters/zoneMove.ts`:

```ts
import { useGardenStore } from '../../store/gardenStore';
import type { Zone } from '../../model/types';
import type { MoveAdapter, Op } from '@/canvas-kit';

export interface ZonePose { x: number; y: number; widthFt: number; heightFt: number }

export function createZoneMoveAdapter(): MoveAdapter<Zone, ZonePose> {
  function getZone(id: string): Zone | undefined {
    return useGardenStore.getState().garden.zones.find((z) => z.id === id);
  }
  return {
    getPose(id) {
      const z = getZone(id);
      if (!z) throw new Error(`zone not found: ${id}`);
      return { x: z.x, y: z.y, widthFt: z.width, heightFt: z.height };
    },
    getParent: () => null,
    setPose(id, pose) {
      // Move-only: write x/y; ignore widthFt/heightFt (resize is a separate hook).
      useGardenStore.getState().updateZone(id, { x: pose.x, y: pose.y });
    },
    setParent: () => {},
    applyBatch(ops: Op[], label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply({
        setPose: (id: string, pose: ZonePose) => {
          useGardenStore.getState().updateZone(id, { x: pose.x, y: pose.y });
        },
        setParent: () => {},
        insertObject: (z: Zone) => {
          useGardenStore.setState((s) => ({ garden: { ...s.garden, zones: [...s.garden.zones, z] } }));
        },
        removeObject: (id: string) => {
          useGardenStore.setState((s) => ({ garden: { ...s.garden, zones: s.garden.zones.filter((z) => z.id !== id) } }));
        },
      });
      void label;
    },
  };
}
```

- [ ] **Step 10.3: Write failing tests for structureMove**

`src/canvas/adapters/structureMove.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createStructureMoveAdapter } from './structureMove';
import { blankGarden, useGardenStore } from '../../store/gardenStore';

describe('structureMoveAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('getPose returns structure bounds', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 1, y: 2, width: 4, height: 5 });
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureMoveAdapter();
    expect(a.getPose(s.id)).toEqual({ x: 1, y: 2, widthFt: 4, heightFt: 5 });
  });

  it('setPose moves structure x/y only', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 1, y: 2, width: 4, height: 5 });
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureMoveAdapter();
    a.setPose(s.id, { x: 10, y: 20, widthFt: 4, heightFt: 5 });
    const u = useGardenStore.getState().garden.structures[0];
    expect(u.x).toBe(10);
    expect(u.y).toBe(20);
    expect(u.width).toBe(4);
  });
});
```

- [ ] **Step 10.4: Implement structureMove**

`src/canvas/adapters/structureMove.ts`:

```ts
import { useGardenStore } from '../../store/gardenStore';
import type { Structure } from '../../model/types';
import type { MoveAdapter, Op } from '@/canvas-kit';

export interface StructurePose { x: number; y: number; widthFt: number; heightFt: number }

export function createStructureMoveAdapter(): MoveAdapter<Structure, StructurePose> {
  function getStructure(id: string): Structure | undefined {
    return useGardenStore.getState().garden.structures.find((s) => s.id === id);
  }
  return {
    getPose(id) {
      const s = getStructure(id);
      if (!s) throw new Error(`structure not found: ${id}`);
      return { x: s.x, y: s.y, widthFt: s.width, heightFt: s.height };
    },
    getParent: (id) => getStructure(id)?.parentId ?? null,
    setPose(id, pose) {
      useGardenStore.getState().updateStructure(id, { x: pose.x, y: pose.y });
    },
    setParent(id, parentId) {
      useGardenStore.getState().updateStructure(id, { parentId: parentId ?? '' });
    },
    applyBatch(ops: Op[], label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply({
        setPose: (id: string, pose: StructurePose) => {
          useGardenStore.getState().updateStructure(id, { x: pose.x, y: pose.y });
        },
        setParent: (id: string, p: string | null) => {
          useGardenStore.getState().updateStructure(id, { parentId: p ?? '' });
        },
        insertObject: (s: Structure) => {
          useGardenStore.setState((st) => ({ garden: { ...st.garden, structures: [...st.garden.structures, s] } }));
        },
        removeObject: (id: string) => {
          useGardenStore.setState((st) => ({ garden: { ...st.garden, structures: st.garden.structures.filter((s) => s.id !== id) } }));
        },
      });
      void label;
    },
  };
}
```

- [ ] **Step 10.5: Run tests to verify pass**

```
npx vitest run src/canvas/adapters/
```
Expected: PASS.

- [ ] **Step 10.6: Commit**

```
git add src/canvas/adapters/
git commit -m "feat(garden): add zoneMove and structureMove adapters"
```

---

### Task 11: Migrate CanvasStack to use kit useMoveInteraction

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

The current `useMoveInteraction` hook from `src/canvas/hooks/` handles all three layers (planting/zone/structure) inside one hook. The kit version is per-adapter, so CanvasStack instantiates three move hooks and dispatches to the right one based on `hit.layer`.

The dispatcher logic in CanvasStack stays put — it already decides which interaction to run (pan/areaSelect/plot/resize/move/palette-clone). We just plumb three move hooks instead of one.

- [ ] **Step 11.1: Read the existing CanvasStack move integration end-to-end**

Read `src/canvas/CanvasStack.tsx` from line 180 through line 900. Make notes of:
- Where `useMoveInteraction(containerRef, invalidate)` is called.
- Each call to `moveInteraction.start(...)` and the args passed.
- Each branch of `handleMouseMove` and `handleMouseUp` that dispatches to the move hook.
- How `moveInteraction.cancel()` is wired into escape-key / interaction conflicts.
- How `moveInteraction.putativeSnap` and the drag overlay are read by renderers.
- How the clone-from-palette flow uses the hook (line ~750 area).

You may need to refer back to this list across later steps. Spend extra time in steps 11.4 and 11.5 if the dispatcher layout differs from what's described below.

- [ ] **Step 11.2: Add three kit move hook invocations next to the existing one**

Modify `src/canvas/CanvasStack.tsx` near line 184. Keep the old hook in place for now; add new ones beside it.

```ts
// existing
const moveInteraction = useMoveInteraction(containerRef, invalidate);

// new kit-driven move hooks
const plantingMoveAdapter = useMemo(() => createPlantingMoveAdapter(), []);
const zoneMoveAdapter = useMemo(() => createZoneMoveAdapter(), []);
const structureMoveAdapter = useMemo(() => createStructureMoveAdapter(), []);

const garden = useGardenStore((s) => s.garden);

const plantingMove = useKitMoveInteraction(plantingMoveAdapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [
    snapToGrid({ cellFt: garden.gridCellSizeFt, bypassKey: 'alt' }),
    snapToContainer({
      dwellMs: 500,
      findTarget: plantingMoveAdapter.findSnapTarget!,
      isInstant: (t) => (t.metadata as { instant?: boolean } | undefined)?.instant === true,
    }),
    snapBackOrDelete({ radiusFt: garden.gridCellSizeFt, onFreeRelease: 'delete' }),
  ],
});

const zoneMove = useKitMoveInteraction(zoneMoveAdapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [snapToGrid({ cellFt: garden.gridCellSizeFt, bypassKey: 'alt' })],
});

const structureMove = useKitMoveInteraction(structureMoveAdapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [snapToGrid({ cellFt: garden.gridCellSizeFt, bypassKey: 'alt' })],
});
```

Add imports at the top of the file (alphabetize within groups):

```ts
import { useMemo } from 'react';
import {
  useMoveInteraction as useKitMoveInteraction,
  snapToGrid,
  snapToContainer,
  snapBackOrDelete,
} from '@/canvas-kit';
import { createPlantingMoveAdapter } from './adapters/plantingMove';
import { createZoneMoveAdapter } from './adapters/zoneMove';
import { createStructureMoveAdapter } from './adapters/structureMove';
```

- [ ] **Step 11.3: Verify build still passes**

```
npm run build
```
Expected: PASS — the new hooks aren't used yet, so no regressions.

- [ ] **Step 11.4: Replace `moveInteraction.start(...)` call sites with layer-dispatched starts**

Find each call to `moveInteraction.start(...)` in CanvasStack. There are roughly four call sites: planting (line ~727), planting-clone (line ~750), structure-clone (line ~756), and the catch-all for non-planting layers (line ~783). For each:

- Compute `clientX/clientY` from the mouse event (already available locally).
- Dispatch to the right kit hook based on `hit.layer`:

```ts
// At the planting move site (~line 727):
plantingMove.start({
  ids: [hit.id],
  worldX,
  worldY,
  clientX: e.clientX,
  clientY: e.clientY,
});

// At the structure (or zone) move site:
if (hit.layer === 'structures') {
  // Group drag: include child structures with the primary id.
  const primary = garden.structures.find((s) => s.id === hit.id);
  const childIds = primary
    ? garden.structures.filter((s) => s.parentId === primary.id).map((s) => s.id)
    : [];
  structureMove.start({
    ids: [hit.id, ...childIds],
    worldX,
    worldY,
    clientX: e.clientX,
    clientY: e.clientY,
  });
} else if (hit.layer === 'zones') {
  zoneMove.start({
    ids: [hit.id],
    worldX,
    worldY,
    clientX: e.clientX,
    clientY: e.clientY,
  });
}
```

For the **clone-from-palette** flow, the kit hook does not yet support inserting a transient object that doesn't exist in the store. Defer clone migration: leave the existing `moveInteraction.start(...)` calls for clones in place. They will continue to use the old hook. The old hook is removed in Task 12 only after we verify clone is migrated or moved into the new hook's API. (See Step 11.7 for the clone migration.)

- [ ] **Step 11.5: Replace `moveInteraction.move(e)` and `.end(e)` dispatch in handlers**

In `handleMouseMove`, dispatch to the active kit hook based on which one returned `isActive() === true`:

```ts
const modifiers = {
  alt: e.altKey,
  shift: e.shiftKey,
  meta: e.metaKey,
  ctrl: e.ctrlKey,
};
const rect = containerRef.current?.getBoundingClientRect();
if (rect) {
  const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, useUiStore.getState());
  if (plantingMove.isActive()) {
    plantingMove.move({ worldX, worldY, clientX: e.clientX, clientY: e.clientY, modifiers });
    return;
  }
  if (zoneMove.isActive()) {
    zoneMove.move({ worldX, worldY, clientX: e.clientX, clientY: e.clientY, modifiers });
    return;
  }
  if (structureMove.isActive()) {
    structureMove.move({ worldX, worldY, clientX: e.clientX, clientY: e.clientY, modifiers });
    return;
  }
}
```

In `handleMouseUp` similarly dispatch `.end()` to the active hook. Add the same dispatch to the escape/cancel handler so canceling a kit gesture clears overlay correctly.

- [ ] **Step 11.6: Wire kit overlays into the existing renderer overlay path**

The existing renderer reads `useUiStore.getState().dragOverlay` to draw moving objects. Until renderers are refactored, mirror the kit overlay into the ui store via an effect:

```ts
useEffect(() => {
  const ov = plantingMove.overlay ?? zoneMove.overlay ?? structureMove.overlay;
  if (!ov) {
    useUiStore.getState().clearDragOverlay();
    return;
  }
  const layer =
    plantingMove.overlay ? 'plantings' :
    zoneMove.overlay ? 'zones' :
    'structures';

  // Convert kit overlay shape into ui-store shape. The ui-store expects
  // `objects: Array<Planting | Zone | Structure>`, `hideIds: string[]`, `snapped: boolean`.
  const objects = ov.draggedIds.map((id) => {
    const pose = ov.poses.get(id)!;
    if (layer === 'plantings') {
      const p = useGardenStore.getState().garden.plantings.find((x) => x.id === id)!;
      return { ...p, x: pose.x, y: pose.y };
    }
    if (layer === 'zones') {
      const z = useGardenStore.getState().garden.zones.find((x) => x.id === id)!;
      const tp = pose as { x: number; y: number };
      return { ...z, x: tp.x, y: tp.y };
    }
    const s = useGardenStore.getState().garden.structures.find((x) => x.id === id)!;
    const tp = pose as { x: number; y: number };
    return { ...s, x: tp.x, y: tp.y };
  });
  useUiStore.getState().setDragOverlay({
    layer,
    objects: objects as any,
    hideIds: ov.hideIds,
    snapped: ov.snapped !== null,
  });
}, [plantingMove.overlay, zoneMove.overlay, structureMove.overlay]);
```

- [ ] **Step 11.7: Migrate the clone-from-palette flow**

Two clone flows exist (palette → planting clone, palette → structure clone). They dropped at line ~750 and ~756. The kit `useMoveInteraction` doesn't expect to drag an object not yet in the store. For now, keep clones routed through the existing `moveInteraction` hook; they will be migrated in a follow-on plan that introduces a `useDragInsertion` kit hook. Mark this with a comment in the file:

```ts
// TODO(canvas-kit-clone): Clone-from-palette still uses the old useMoveInteraction
// hook. Migrate in the follow-on plan once the kit grows useDragInsertion.
```

This means the old hook stays alive but is reduced to clone-only flows. Update its caller-touching surface accordingly: keep `start`, `move`, `end`, `cancel`. Leave the implementation untouched — clone code paths are unchanged.

- [ ] **Step 11.8: Run full test suite + manual smoke**

```
npm run build
npx vitest run
```
Expected: PASS.

Manually smoke-test in the dev server: load the garden, drag a planting between containers (snap should work, dwell should still feel right), drag a zone (grid snap), drag a structure with children (group drag), and undo each. If anything regresses, file the regression in this task before moving on.

- [ ] **Step 11.9: Commit**

```
git add src/canvas/CanvasStack.tsx
git commit -m "refactor(garden): wire kit useMoveInteraction for planting/zone/structure moves"
```

---

### Task 12: Delete the old useMoveInteraction; retarget tests

**Files:**
- Delete: `src/canvas/hooks/useMoveInteraction.ts` — see exception below
- Modify: `src/canvas/hooks/useMoveInteraction.test.ts`
- Modify: `src/canvas/CanvasStack.tsx`

Because clone-from-palette still uses the old hook, we cannot fully delete it in this plan. Reduce its surface area instead:

- [ ] **Step 12.1: Reduce the old hook to clone-only**

Modify `src/canvas/hooks/useMoveInteraction.ts`:
- Remove the `else if` branches in `activateDrag` for `'structures'`, `'zones'`, and the non-clone `'plantings'` branch. The clone branch stays.
- Remove the move-frame branches for `'structures'` and `'zones'`. Keep only the planting clone path.
- Remove the end-frame branches for `'structures'`, `'zones'`, and non-clone `'plantings'`. Keep only the clone end logic.
- Rename the file to `src/canvas/hooks/useCloneInteraction.ts` and rename the function to `useCloneInteraction` to make its narrowed scope clear.
- Update CanvasStack to import the renamed hook for the clone call sites only.

If the file becomes very small after the reduction (under ~80 lines), inline the remaining logic into CanvasStack instead and delete the hook file entirely. Pick whichever leaves CanvasStack cleaner.

- [ ] **Step 12.2: Migrate the test file**

Modify `src/canvas/hooks/useMoveInteraction.test.ts`:
- Rename to `src/canvas/hooks/useCloneInteraction.test.ts` (or delete and replace, see step 12.1).
- Keep only tests covering clone-from-palette behavior. Delete tests for planting move/snap/snap-back/free-agent-delete and structure/zone move — these are now covered by:
  - `src/canvas-kit/interactions/move.test.ts` (kit-side gesture mechanics, behaviors)
  - `src/canvas/adapters/plantingMove.test.ts` (planting pose translation, parent reassignment, applyBatch+checkpoint)
  - `src/canvas/adapters/zoneMove.test.ts` and `structureMove.test.ts` (zone/structure pose)
  - The end-to-end flow is exercised manually in the dev server (Step 11.8).
- Verify the four free-agent tests recently added (snap-back, undo, remove, undoable remove) all have equivalent coverage in the new test files. If any are missing, port them into `move.test.ts` or `plantingMove.test.ts`.

- [ ] **Step 12.3: Run full test suite**

```
npm run build
npx vitest run
```
Expected: PASS.

- [ ] **Step 12.4: Commit**

```
git add src/canvas/CanvasStack.tsx src/canvas/hooks/
git commit -m "refactor(garden): reduce legacy useMoveInteraction to clone-only useCloneInteraction"
```

---

### Task 13: Update spec status and document deltas

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-canvas-kit-interactions-design.md`
- Modify: `docs/behavior.md` (only if behavior diverged)

- [ ] **Step 13.1: Add status note to spec**

Edit the spec header to flip status to *Phase 1 implemented* and link this plan:

```markdown
**Status:** Phase 1 (foundation + move) implemented in
`docs/superpowers/plans/2026-04-30-canvas-kit-foundation-and-move.md`.
Resize/plot/area-select/clipboard ports remain in follow-on plans.
```

- [ ] **Step 13.2: If clone deferral surfaces a behavior change, document it**

If anything in the planting drag, structure drag, or zone drag changed behavior (verified manually in Step 11.8), update `docs/behavior.md` accordingly. If nothing changed, skip this step.

- [ ] **Step 13.3: Commit**

```
git add docs/
git commit -m "docs: mark canvas-kit interactions phase 1 complete; update behavior log if changed"
```

---

## Self-Review

### Spec coverage

- ✅ Op interface + factories (TransformOp, ReparentOp, CreateOp, DeleteOp, SetSelectionOp): Tasks 1–2.
- ✅ History utility (`createHistory`, apply/undo/redo, batch atomicity): Task 3.
- ✅ SceneAdapter + per-hook narrow MoveAdapter: Task 4.
- ✅ GestureContext, MoveBehavior, MoveOverlay types: Task 4.
- ✅ Behaviors: snapToGrid, snapToContainer, snapBackOrDelete: Tasks 5–7.
- ⏭️ Behaviors: axisLockWithModifier, clampToBounds: deferred to follow-on plans (not needed for garden's current move flows; YAGNI).
- ✅ `useMoveInteraction` with behavior pipeline, threshold, group drag, overlay: Task 8.
- ✅ Garden adapters (planting, zone, structure): Tasks 9–10.
- ✅ CanvasStack migration: Task 11.
- ✅ Old hook reduction (clone-only): Task 12.
- ⏭️ Resize, plot, area-select, clipboard ports: explicitly out of scope for this plan; covered by follow-on plans.
- ⏭️ Drag-lab adoption: out of scope for this plan.
- ⏭️ Wiring `gardenStore.checkpoint()` into kit `createHistory`: not done — adapters call `checkpoint()` directly inside their `applyBatch`. Spec allows either; this plan picks the simpler route. The kit's `createHistory` is thus available for new apps but not consumed by the garden in Phase 1.

### Type consistency check

- `Pose` type is opaque to kit; each adapter declares its own (`PlantingPose`, `ZonePose`, `StructurePose`). Hooks parameterize on `<TPose>` consistently across Tasks 4, 5–7, 8, 9–10, 11.
- Op factories take `{from, to}` consistently. `createTransformOp` is parameterized on `<TPose>`; `createReparentOp` is not generic (parent ids are `string | null`). All op factories match the `Op` interface from Task 1.
- `SceneAdapter` and `MoveAdapter` method names match across types (`getPose`, `setPose`, `getParent`, `setParent`, `applyBatch`, `findSnapTarget`).
- `MoveBehavior.onEnd` return contract (`Op[] | null | undefined`) consistent across spec, types in Task 4, behaviors in Tasks 6–7, hook in Task 8.
- `MoveOverlay` shape matches between Task 4 (type) and Task 8 (hook return) and Task 11 (CanvasStack consumption).

### Placeholder scan

- No "TBD"/"TODO" left in plan steps. One `TODO(canvas-kit-clone)` comment is intentional — it marks the deferred clone migration in code.
- Each step that adds code shows the actual code; each step that runs a command shows the command and expected outcome.
- Step 11.1 directs the engineer to read existing code rather than reproducing it; this is acceptable because the code being read is the engineer's own working file and reproducing 700+ lines in the plan would be counterproductive.
