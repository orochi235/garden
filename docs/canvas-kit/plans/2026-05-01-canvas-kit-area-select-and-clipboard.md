# canvas-kit Area-Select + Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `useAreaSelectInteraction` and `useClipboard` from `src/canvas/hooks/` into canvas-kit as siblings to move/resize/insert. Generalize the gesture pipeline with a `transient` flag (gesture commits ops via `applyOps` without a history checkpoint) and unify clipboard paste with insert under a single `InsertAdapter`. Bundle a vocabulary cleanup that renames `createCreateOp` → `createInsertOp` and `CreateOp` → `InsertOp`.

**Architecture:** Two new kit hooks (`useAreaSelectInteraction`, `useClipboard`) live under `src/canvas-kit/interactions/area-select/` and `.../clipboard/`. `GestureBehavior` gains an optional `defaultTransient`; per-hook options gain `transient?: boolean`. Area-select resolves transient → true and routes ops through `adapter.applyOps(ops)`; insert/move/resize keep their existing `applyBatch(ops, label)` path. Paste is a single `applyBatch` containing N `InsertOp`s plus one `SetSelectionOp`. `InsertAdapter` gains `commitPaste`, `snapshotSelection`, and an optional `getPasteOffset`.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, `@testing-library/react`.

**Reference spec:** `docs/superpowers/specs/2026-05-01-canvas-kit-area-select-clipboard-design.md` (committed `825e7b9`).
**Predecessor plan:** `docs/superpowers/plans/2026-04-30-canvas-kit-resize-and-insert.md` (Phase 2: resize + insert).

**Out of scope:** Drag-lab adoption, cursor-relative paste offsets, OS clipboard, lasso area-select, locked-layer exclusion in marquee hits, gardenStore migration to `createHistory`.

---

## File Structure

### New files (kit)

```
src/canvas-kit/interactions/area-select/
  areaSelect.ts                                # useAreaSelectInteraction
  areaSelect.test.ts
  behaviors/
    selectFromMarquee.ts
    selectFromMarquee.test.ts
    index.ts
  index.ts
src/canvas-kit/interactions/clipboard/
  clipboard.ts                                 # useClipboard
  clipboard.test.ts
  index.ts
src/canvas-kit/area-select.ts                  # subpath proxy: export * from './interactions/area-select'
src/canvas-kit/clipboard.ts                    # subpath proxy: export * from './interactions/clipboard'
```

### New files (Garden adapters)

```
src/canvas/adapters/areaSelect.ts              # createAreaSelectAdapter
src/canvas/adapters/areaSelect.test.ts
```

### Modified files

```
src/canvas-kit/ops/create.ts                   # rename internals → InsertOp/createInsertOp; file stays at create.ts but exports renamed
src/canvas-kit/ops/index.ts                    # rename export
src/canvas-kit/ops/createDelete.test.ts        # rename references
src/canvas-kit/interactions/types.ts           # + defaultTransient on GestureBehavior; AreaSelect* and ClipboardSnapshot
src/canvas-kit/adapters/types.ts               # + AreaSelectAdapter; extend InsertAdapter (commitPaste, snapshotSelection, getPasteOffset)
src/canvas-kit/interactions/insert/insert.ts   # call createInsertOp; accept transient option no-op
src/canvas-kit/interactions/insert/insert.test.ts
src/canvas-kit/interactions/move/move.ts       # accept transient option (no-op for non-transient)
src/canvas-kit/interactions/resize/resize.ts   # accept transient option (no-op for non-transient)
src/canvas-kit/index.ts                        # add hook + type exports
src/canvas/adapters/insert.ts                  # add commitPaste, snapshotSelection, optional getPasteOffset
src/canvas/adapters/insert.test.ts             # + tests for new methods
src/canvas/CanvasStack.tsx                     # wire kit area-select + clipboard; drop legacy hook imports; mirror areaSelectOverlay; route marquee paint to overlay
src/store/uiStore.ts                           # + areaSelectOverlay state and setter
docs/superpowers/specs/2026-05-01-canvas-kit-area-select-clipboard-design.md  # status flip
docs/behavior.md                               # behavior changes (paste batch, plantings paste, marquee no-history)
```

### Deleted files (Task 10)

```
src/canvas/hooks/useAreaSelectInteraction.ts
src/canvas/hooks/useClipboard.ts
src/canvas/hooks/useClipboard.test.ts          # assertions fold into kit clipboard.test.ts + insert.test.ts
```

---

## Conventions for tasks

- All commits use Conventional Commits (`feat`, `refactor`, `test`, `docs`). NO `Co-Authored-By` trailers.
- TDD: failing test → run failing → implementation → run passing → commit. Multiple commits per task are encouraged.
- Targeted runs: `npm test -- --run path/to/test.test.ts`. Full suite: `npm test -- --run`. Build: `npm run build`.
- **Every task ends with `npm run build` AND `npm test -- --run` clean** before the final commit. The repo enables `noUnusedLocals`; do not leave stale imports.
- Phase 1/2 tests at `src/canvas-kit/interactions/{move,resize,insert}/**` must keep passing throughout.

---

### Task 0: Op rename — `createCreateOp` → `createInsertOp`, `CreateOp` → `InsertOp`

Repo-wide mechanical rename. Op semantics are unchanged.

**Files:**
- Modify: `src/canvas-kit/ops/create.ts`
- Modify: `src/canvas-kit/ops/index.ts`
- Modify: `src/canvas-kit/ops/createDelete.test.ts`
- Modify: `src/canvas-kit/interactions/insert/insert.ts`
- Modify: `src/canvas-kit/interactions/insert/insert.test.ts`
- Modify: `src/canvas/adapters/insert.test.ts`

Existing kit `CreateOp` type isn't actually exported as a named symbol today (only `createCreateOp` is). The spec calls out renaming both for consistency; we add an exported `InsertOp` type alias as part of the rename.

- [ ] **Step 0.1: Locate all references**

```
grep -rn "createCreateOp\|CreateOp" src/ docs/superpowers/specs/ docs/superpowers/plans/
```

Expected matches (source code, ignoring docs/specs which are historical):
- `src/canvas-kit/ops/create.ts` (definition)
- `src/canvas-kit/ops/index.ts` (re-export)
- `src/canvas-kit/ops/createDelete.test.ts` (test references)
- `src/canvas-kit/interactions/insert/insert.ts` (`import { createCreateOp } from '../../ops/create'` + call site)
- `src/canvas-kit/interactions/insert/insert.test.ts` (no current direct reference, but verify)
- `src/canvas/adapters/insert.test.ts` (`import { createCreateOp } from '@/canvas-kit'` + call site)

- [ ] **Step 0.2: Rename in `src/canvas-kit/ops/create.ts`**

Replace the entire file:

```ts
import type { Op } from './types';
import { createDeleteOp } from './delete';

interface InsertAdapter<TObject> {
  insertObject(object: TObject): void;
}

/** Type alias for ops produced by `createInsertOp`. Carries no extra type info today;
 *  exists so consumers can name the op type when needed. */
export type InsertOp = Op;

export function createInsertOp<TObject extends { id: string }>(args: {
  object: TObject;
  label?: string;
}): InsertOp {
  const { object, label } = args;
  return {
    label,
    apply(adapter) {
      (adapter as InsertAdapter<TObject>).insertObject(object);
    },
    invert() {
      return createDeleteOp({ object, label });
    },
  };
}
```

- [ ] **Step 0.3: Update `src/canvas-kit/ops/index.ts`**

Replace the `create` line:

```ts
export type { Op } from './types';
export { createTransformOp } from './transform';
export { createReparentOp } from './reparent';
export { createInsertOp, type InsertOp } from './create';
export { createDeleteOp } from './delete';
export { createSetSelectionOp } from './selection';
```

- [ ] **Step 0.4: Update `src/canvas-kit/ops/createDelete.test.ts`**

Replace every `createCreateOp` token in the file with `createInsertOp`. Use Grep first to confirm count, then Edit with `replace_all: true`:

```
grep -n "createCreateOp" src/canvas-kit/ops/createDelete.test.ts
```

For each occurrence replace `createCreateOp` → `createInsertOp`. The import line at the top should read:

```ts
import { createInsertOp } from './create';
```

- [ ] **Step 0.5: Update `src/canvas-kit/interactions/insert/insert.ts`**

Change the import + call site:

```ts
import { createInsertOp } from '../../ops/create';
```

And in the `end` callback, the `ops` line becomes:

```ts
const ops: Op[] = [createInsertOp({ object: created, label: insertLabel })];
```

- [ ] **Step 0.6: Update `src/canvas-kit/interactions/insert/insert.test.ts`**

```
grep -n "createCreateOp\|CreateOp" src/canvas-kit/interactions/insert/insert.test.ts
```

Replace any matches with the renamed identifiers. (If there are none, skip.)

- [ ] **Step 0.7: Update `src/canvas/adapters/insert.test.ts`**

Replace the import:

```ts
import { createInsertAdapter } from './insert';
import { createInsertOp } from '@/canvas-kit';
```

And replace the one `createCreateOp(...)` call site with `createInsertOp(...)`.

- [ ] **Step 0.8: Run full suite**

```
npm test -- --run
```
Expected: PASS — pure rename.

- [ ] **Step 0.9: Run build**

```
npm run build
```
Expected: clean.

- [ ] **Step 0.10: Commit**

```
git add src/canvas-kit/ops/ src/canvas-kit/interactions/insert/ src/canvas/adapters/insert.test.ts
git commit -m "refactor(canvas-kit): rename CreateOp/createCreateOp to InsertOp/createInsertOp"
```

---

### Task 1: Add `defaultTransient` flag to `GestureBehavior` and `transient?` to existing hook options

This task is wiring-only: the flag is plumbed into move/resize/insert as a no-op (these hooks are never transient), so we can verify the type/option surface without behavior change. The actual transient code path lands in Task 4 (areaSelect hook).

**Files:**
- Modify: `src/canvas-kit/interactions/types.ts`
- Modify: `src/canvas-kit/interactions/move/move.ts`
- Modify: `src/canvas-kit/interactions/resize/resize.ts`
- Modify: `src/canvas-kit/interactions/insert/insert.ts`

- [ ] **Step 1.1: Extend `GestureBehavior` with optional `defaultTransient`**

In `src/canvas-kit/interactions/types.ts`, replace the `GestureBehavior` interface:

```ts
/**
 * Generalized base behavior. Each hook defines an alias that pins the
 * proposed-pose shape (TProposed) and the onMove return shape (TMoveResult).
 * onEnd is uniform: first non-undefined return wins (Op[] = commit those,
 * null = abort, undefined = defer).
 *
 * `defaultTransient`: when at least one behavior in a gesture sets this true
 * AND the hook's `options.transient` is not explicitly set, the gesture
 * commits its ops via `adapter.applyOps(ops)` (no history entry). When
 * `options.transient` is set explicitly, that value wins.
 */
export interface GestureBehavior<TPose, TProposed, TMoveResult> {
  defaultTransient?: boolean;
  onStart?(ctx: GestureContext<TPose>): void;
  onMove?(ctx: GestureContext<TPose>, proposed: TProposed): TMoveResult | void;
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | void;
}
```

- [ ] **Step 1.2: Add `transient?: boolean` to `UseMoveInteractionOptions`**

In `src/canvas-kit/interactions/move/move.ts`, extend the options interface:

```ts
export interface UseMoveInteractionOptions<TPose> {
  translatePose: (pose: TPose, dx: number, dy: number) => TPose;
  behaviors?: MoveBehavior<TPose>[];
  dragThresholdPx?: number;
  moveLabel?: string;
  /** Reserved for transient gestures (no history entry). Move is never transient
   *  in practice; accepted for API consistency but ignored. */
  transient?: boolean;
  onGestureStart?(ids: string[]): void;
  onGestureEnd?(committed: boolean): void;
}
```

In the destructuring inside the hook body, add `transient` and `void` it to satisfy `noUnusedLocals` if it's destructured:

```ts
const {
  translatePose,
  behaviors = [],
  dragThresholdPx = 4,
  moveLabel = 'Move',
  transient: _transient = false,
  onGestureStart,
  onGestureEnd,
} = options;
```

(The `_` prefix tells TS to ignore the unused local. Verify `noUnusedLocals` setup respects underscore-prefixed names by running `npm run build` after this step. If the prefix is not honored, leave `transient` out of destructuring and read it as `options.transient` only when needed; for now, just drop the destructure line — no usage required for move.)

Simplest portable form: do not destructure `transient` at all. Move never reads it.

- [ ] **Step 1.3: Add `transient?: boolean` to `UseResizeInteractionOptions`**

In `src/canvas-kit/interactions/resize/resize.ts`:

```ts
export interface UseResizeInteractionOptions<TPose extends ResizePose> {
  behaviors?: ResizeBehavior<TPose>[];
  resizeLabel?: string;
  /** Reserved; resize is never transient in practice. Ignored. */
  transient?: boolean;
  onGestureStart?: (id: string) => void;
  onGestureEnd?: (committed: boolean) => void;
}
```

Do not destructure `transient` in the hook body.

- [ ] **Step 1.4: Add `transient?: boolean` to `UseInsertInteractionOptions`**

In `src/canvas-kit/interactions/insert/insert.ts`:

```ts
export interface UseInsertInteractionOptions<TPose extends { x: number; y: number }> {
  behaviors?: InsertBehavior<TPose>[];
  insertLabel?: string;
  minBounds?: { width: number; height: number };
  /** Reserved; insert is never transient in practice. Ignored. */
  transient?: boolean;
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}
```

Do not destructure `transient`.

- [ ] **Step 1.5: Run full suite**

```
npm test -- --run
```
Expected: PASS — pure type addition.

- [ ] **Step 1.6: Run build**

```
npm run build
```
Expected: clean (`noUnusedLocals` respected because `transient` is not destructured anywhere).

- [ ] **Step 1.7: Commit**

```
git add src/canvas-kit/interactions/types.ts src/canvas-kit/interactions/move/move.ts src/canvas-kit/interactions/resize/resize.ts src/canvas-kit/interactions/insert/insert.ts
git commit -m "feat(canvas-kit): add defaultTransient flag and transient option (no-op for non-transient hooks)"
```

---

### Task 2: Add `AreaSelectAdapter`, `AreaSelectBehavior`, `AreaSelectOverlay`, `ClipboardSnapshot` types; extend `InsertAdapter`

Type-only changes. Behavior tasks (3+) consume them.

**Files:**
- Modify: `src/canvas-kit/interactions/types.ts`
- Modify: `src/canvas-kit/adapters/types.ts`

- [ ] **Step 2.1: Append area-select and clipboard types to `src/canvas-kit/interactions/types.ts`**

After the existing `// ----- insert -----` block, append:

```ts
// ----- area-select -----

/** Pose carried through area-select gestures: the world point under the
 *  cursor at gesture start, plus the shift-key state at start. */
export interface AreaSelectPose {
  worldX: number;
  worldY: number;
  shiftHeld: boolean;
}

export interface AreaSelectProposed {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}

/** onMove for area-select doesn't shape ops; behaviors only need to react in
 *  onEnd. We return void from onMove. */
export type AreaSelectMoveResult = void;

export type AreaSelectBehavior = GestureBehavior<
  AreaSelectPose,
  AreaSelectProposed,
  AreaSelectMoveResult
>;

export interface AreaSelectOverlay {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}

// ----- clipboard -----

/**
 * Opaque clipboard payload. `items` is `unknown[]` so each app's clipboard
 * adapter stores whatever shape it wants; the kit never inspects entries.
 *
 * The adapter is responsible for both producing snapshots
 * (`snapshotSelection`) and consuming them (`commitPaste`). Type safety lives
 * at that boundary, not in the kit.
 */
export interface ClipboardSnapshot {
  items: unknown[];
}
```

- [ ] **Step 2.2: Add `AreaSelectAdapter` and extend `InsertAdapter` in `src/canvas-kit/adapters/types.ts`**

Append to the file:

```ts
import type { AreaSelectPose, ClipboardSnapshot } from '../interactions/types';

/**
 * Narrow adapter for `useAreaSelectInteraction`. Transient: no checkpoint, no
 * history. The hook calls `applyOps(ops)` instead of `applyBatch(ops, label)`.
 */
export interface AreaSelectAdapter {
  /** Returns ids of objects intersecting the world-space rect. */
  hitTestArea(rect: { x: number; y: number; width: number; height: number }): string[];
  /** Current selection — read by behaviors to compute additive merges. */
  getSelection(): string[];
  /** Mutator wired by `setSelection` op. */
  setSelection(ids: string[]): void;
  /** Apply ops without checkpointing or pushing a history entry. */
  applyOps(ops: Op[]): void;
}
```

Then extend the existing `InsertAdapter`. Replace the current `InsertAdapter` block with:

```ts
/**
 * Narrow adapter for `useInsertInteraction` and `useClipboard`. The kit knows
 * nothing about what tool is active or what shape to construct; it asks the
 * adapter to produce object(s) given gesture or paste inputs.
 *
 * Drag-rectangle path: `commitInsert(bounds)` returns one new object or null.
 * Clipboard paste path: `commitPaste(clipboard, offset)` returns the array of
 *   newly-materialized objects (in order). Both empty array and array of
 *   length N are valid; the kit wraps each entry in an `InsertOp`.
 *
 * `snapshotSelection(ids)` builds the payload that paste later consumes.
 * `getPasteOffset` is optional; the kit defaults to a fixed grid-cell offset
 * supplied by the consumer (passed to `useClipboard` options if needed; see
 * the hook for resolution order).
 */
export interface InsertAdapter<TObject extends { id: string }> {
  commitInsert(bounds: { x: number; y: number; width: number; height: number }): TObject | null;
  commitPaste(clipboard: ClipboardSnapshot, offset: { dx: number; dy: number }): TObject[];
  snapshotSelection(ids: string[]): ClipboardSnapshot;
  getPasteOffset?(clipboard: ClipboardSnapshot): { dx: number; dy: number };
  /** Mutator wired by `insertObject`-using ops (kit-side InsertOp). */
  insertObject(object: TObject): void;
  /** Mutator wired by `setSelection` ops batched alongside paste. */
  setSelection(ids: string[]): void;
  applyBatch(ops: Op[], label: string): void;
}
```

Note: `insertObject` and `setSelection` were previously implicit on the InsertAdapter (the op called them on the adapter at apply-time). We now make them explicit on the interface so paste can rely on them.

(`AreaSelectPose` is imported but not actually referenced in this snippet — it's exported through the types module so consumers can import it. Drop the import to satisfy `noUnusedLocals`:)

```ts
import type { ClipboardSnapshot } from '../interactions/types';
```

- [ ] **Step 2.3: Run full suite**

```
npm test -- --run
```
Expected: PASS at the kit level. The widened `InsertAdapter` interface may break existing implementations — specifically `src/canvas/adapters/insert.ts` — which we extend in Task 6. To avoid a red build between Tasks 2 and 6, this task only adds the type; we do NOT yet update `src/canvas/adapters/insert.ts`. Run build to confirm where the gap surfaces:

```
npm run build
```

If `npm run build` reports `src/canvas/adapters/insert.ts` is missing `commitPaste` / `snapshotSelection` / `setSelection`, add temporary stub implementations to that file in this same task so the build stays green:

```ts
// In src/canvas/adapters/insert.ts, inside the createInsertAdapter() return object,
// add these stubs (real impls land in Task 6):
commitPaste(_clipboard, _offset) {
  return [];
},
snapshotSelection(_ids) {
  return { items: [] };
},
setSelection(ids) {
  useUiStore.getState().setSelection(ids);
},
```

Also import `ClipboardSnapshot` if needed:

```ts
import type { InsertAdapter, Op, ClipboardSnapshot } from '@/canvas-kit';
```

- [ ] **Step 2.4: Run build clean**

```
npm run build
```
Expected: clean.

- [ ] **Step 2.5: Run full suite**

```
npm test -- --run
```
Expected: PASS.

- [ ] **Step 2.6: Commit**

```
git add src/canvas-kit/interactions/types.ts src/canvas-kit/adapters/types.ts src/canvas/adapters/insert.ts
git commit -m "feat(canvas-kit): add AreaSelectAdapter, AreaSelectBehavior, ClipboardSnapshot; extend InsertAdapter"
```

---

### Task 3: `selectFromMarquee` behavior + tests

The lone area-select behavior. `defaultTransient: true`. Consumes `ctx.adapter.hitTestArea(rect)`, merges with `ctx.adapter.getSelection()` if `shiftHeld`, emits `[createSetSelectionOp({ from, to })]`. Empty rect + no shift emits `[createSetSelectionOp({ from, to: [] })]` (clears selection).

**Files:**
- Create: `src/canvas-kit/interactions/area-select/behaviors/selectFromMarquee.test.ts`
- Create: `src/canvas-kit/interactions/area-select/behaviors/selectFromMarquee.ts`
- Create: `src/canvas-kit/interactions/area-select/behaviors/index.ts`

- [ ] **Step 3.1: Write failing tests**

`src/canvas-kit/interactions/area-select/behaviors/selectFromMarquee.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectFromMarquee } from './selectFromMarquee';
import type {
  AreaSelectAdapter,
  GestureContext,
  AreaSelectPose,
} from '@/canvas-kit';

function makeAdapter(opts: { selection?: string[]; hits?: string[] } = {}): AreaSelectAdapter {
  return {
    hitTestArea: () => opts.hits ?? [],
    getSelection: () => opts.selection ?? [],
    setSelection: () => {},
    applyOps: () => {},
  };
}

function ctx(
  adapter: AreaSelectAdapter,
  pose: { startX: number; startY: number; curX: number; curY: number; shiftHeld: boolean },
): GestureContext<AreaSelectPose> {
  const start: AreaSelectPose = { worldX: pose.startX, worldY: pose.startY, shiftHeld: pose.shiftHeld };
  const current: AreaSelectPose = { worldX: pose.curX, worldY: pose.curY, shiftHeld: pose.shiftHeld };
  return {
    draggedIds: ['gesture'],
    origin: new Map([['gesture', start]]),
    current: new Map([['gesture', current]]),
    snap: null,
    modifiers: { alt: false, shift: pose.shiftHeld, meta: false, ctrl: false },
    pointer: { worldX: pose.curX, worldY: pose.curY, clientX: 0, clientY: 0 },
    adapter: adapter as never,
    scratch: {},
  };
}

describe('selectFromMarquee', () => {
  it('declares defaultTransient: true', () => {
    const b = selectFromMarquee();
    expect(b.defaultTransient).toBe(true);
  });

  it('non-empty rect with no shift: emits SetSelectionOp(to = hitIds)', () => {
    const adapter = makeAdapter({ hits: ['a', 'b'] });
    const c = ctx(adapter, { startX: 0, startY: 0, curX: 4, curY: 4, shiftHeld: false });
    const ops = b => b.onEnd!(c);
    const result = ops(selectFromMarquee());
    expect(result).toHaveLength(1);
    // Apply against a recording adapter to inspect the to value.
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([['a', 'b']]);
  });

  it('empty rect with no shift: emits SetSelectionOp(to = [])', () => {
    const adapter = makeAdapter({ hits: [], selection: ['existing'] });
    const c = ctx(adapter, { startX: 5, startY: 5, curX: 5, curY: 5, shiftHeld: false });
    const result = selectFromMarquee().onEnd!(c);
    expect(result).toHaveLength(1);
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([[]]);
  });

  it('shift + non-empty rect: merges hits with existing selection (no duplicates, preserves existing order)', () => {
    const adapter = makeAdapter({ hits: ['b', 'c'], selection: ['a', 'b'] });
    const c = ctx(adapter, { startX: 0, startY: 0, curX: 4, curY: 4, shiftHeld: true });
    const result = selectFromMarquee().onEnd!(c);
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([['a', 'b', 'c']]);
  });

  it('shift + empty rect: leaves selection unchanged', () => {
    const adapter = makeAdapter({ hits: [], selection: ['a', 'b'] });
    const c = ctx(adapter, { startX: 5, startY: 5, curX: 5, curY: 5, shiftHeld: true });
    const result = selectFromMarquee().onEnd!(c);
    expect(result).toHaveLength(1);
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([['a', 'b']]);
  });
});
```

- [ ] **Step 3.2: Run — fail (module not found)**

```
npm test -- --run src/canvas-kit/interactions/area-select/behaviors/selectFromMarquee.test.ts
```
Expected: FAIL.

- [ ] **Step 3.3: Implement `selectFromMarquee`**

`src/canvas-kit/interactions/area-select/behaviors/selectFromMarquee.ts`:

```ts
import { createSetSelectionOp } from '../../../ops/selection';
import type { Op } from '../../../ops/types';
import type { AreaSelectAdapter } from '../../../adapters/types';
import type { AreaSelectBehavior, AreaSelectPose, GestureContext } from '../../types';

export function selectFromMarquee(): AreaSelectBehavior {
  return {
    defaultTransient: true,
    onEnd(ctx) {
      const adapter = ctx.adapter as unknown as AreaSelectAdapter;
      const start = ctx.origin.get('gesture')!;
      const current = ctx.current.get('gesture') ?? start;
      const x = Math.min(start.worldX, current.worldX);
      const y = Math.min(start.worldY, current.worldY);
      const width = Math.abs(current.worldX - start.worldX);
      const height = Math.abs(current.worldY - start.worldY);

      const from = adapter.getSelection();
      const isEmpty = width === 0 || height === 0;
      const shiftHeld = start.shiftHeld;

      let to: string[];
      if (isEmpty) {
        to = shiftHeld ? from : [];
      } else {
        const hits = adapter.hitTestArea({ x, y, width, height });
        if (shiftHeld) {
          const merged = [...from];
          for (const id of hits) if (!merged.includes(id)) merged.push(id);
          to = merged;
        } else {
          to = hits;
        }
      }
      const ops: Op[] = [createSetSelectionOp({ from, to })];
      return ops;
    },
  };
}

// satisfy unused-import lint when AreaSelectPose / GestureContext aren't structurally referenced;
// the kit re-exports them through ../../types for consumers.
type _Touch = AreaSelectPose | GestureContext<AreaSelectPose>;
void (0 as unknown as _Touch);
```

If the `_Touch` shim feels awkward, simply drop the unused imports — they aren't required by the implementation:

```ts
import { createSetSelectionOp } from '../../../ops/selection';
import type { Op } from '../../../ops/types';
import type { AreaSelectAdapter } from '../../../adapters/types';
import type { AreaSelectBehavior } from '../../types';
```

(Use this trimmed import set; remove the `_Touch` shim.)

- [ ] **Step 3.4: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/area-select/behaviors/selectFromMarquee.test.ts
```
Expected: PASS.

- [ ] **Step 3.5: Add behaviors barrel**

`src/canvas-kit/interactions/area-select/behaviors/index.ts`:

```ts
export { selectFromMarquee } from './selectFromMarquee';
```

- [ ] **Step 3.6: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 3.7: Commit**

```
git add src/canvas-kit/interactions/area-select/behaviors/
git commit -m "feat(canvas-kit): add area-select/selectFromMarquee behavior (defaultTransient)"
```

---

### Task 4: `useAreaSelectInteraction` hook + integration tests

Mirror Phase 2's `useInsertInteraction` shape. The transient resolution rule lives here; on commit, the hook calls `adapter.applyOps(ops)` (no checkpoint) when transient, otherwise `adapter.applyBatch(ops, label)`.

**Files:**
- Create: `src/canvas-kit/interactions/area-select/areaSelect.test.ts`
- Create: `src/canvas-kit/interactions/area-select/areaSelect.ts`
- Create: `src/canvas-kit/interactions/area-select/index.ts`
- Create: `src/canvas-kit/area-select.ts` (subpath proxy)

#### Commit 4a: scaffold start / cancel

- [ ] **Step 4.1: Write failing tests for start/cancel**

`src/canvas-kit/interactions/area-select/areaSelect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAreaSelectInteraction } from './areaSelect';
import { selectFromMarquee } from './behaviors/selectFromMarquee';
import type { AreaSelectAdapter, Op } from '@/canvas-kit';

function makeAdapter(initial: string[] = []) {
  let selection = [...initial];
  const ops: { kind: 'applyOps'; ops: Op[] }[] = [];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: AreaSelectAdapter = {
    hitTestArea: () => [],
    getSelection: () => selection,
    setSelection: (ids) => { selection = [...ids]; },
    applyOps: (oo) => {
      ops.push({ kind: 'applyOps', ops: oo });
      for (const op of oo) op.apply(adapter as never);
    },
  };
  // Add applyBatch for transient=false tests below
  (adapter as { applyBatch?: (ops: Op[], label: string) => void }).applyBatch =
    (oo: Op[], label: string) => {
      batches.push({ ops: oo, label });
      for (const op of oo) op.apply(adapter as never);
    };
  return { adapter, ops, batches, getSelection: () => selection };
}

const NO_MOD = { alt: false, shift: false, meta: false, ctrl: false };

describe('useAreaSelectInteraction — start / cancel', () => {
  it('start sets isAreaSelecting + overlay; cancel clears them with no ops', () => {
    const { adapter, ops } = makeAdapter();
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    expect(result.current.isAreaSelecting).toBe(false);

    act(() => { result.current.start(1, 2, NO_MOD); });
    expect(result.current.isAreaSelecting).toBe(true);
    expect(result.current.overlay).toEqual({
      start: { worldX: 1, worldY: 2 },
      current: { worldX: 1, worldY: 2 },
      shiftHeld: false,
    });

    act(() => { result.current.cancel(); });
    expect(result.current.isAreaSelecting).toBe(false);
    expect(result.current.overlay).toBeNull();
    expect(ops).toEqual([]);
  });
});
```

- [ ] **Step 4.2: Run — fail**

```
npm test -- --run src/canvas-kit/interactions/area-select/areaSelect.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement scaffold**

`src/canvas-kit/interactions/area-select/areaSelect.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import type { Op } from '../../ops/types';
import type { AreaSelectAdapter } from '../../adapters/types';
import type {
  AreaSelectBehavior,
  AreaSelectOverlay,
  AreaSelectPose,
  GestureContext,
  ModifierState,
} from '../types';

const GID = 'gesture';

export interface UseAreaSelectInteractionOptions {
  behaviors?: AreaSelectBehavior[];
  /** When set, overrides any behavior's `defaultTransient`. Default: behaviors decide. */
  transient?: boolean;
  /** Label used when transient is false and the hook falls back to applyBatch. Default 'Area select'. */
  label?: string;
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

export interface UseAreaSelectInteractionReturn {
  start(worldX: number, worldY: number, modifiers: ModifierState): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  isAreaSelecting: boolean;
  overlay: AreaSelectOverlay | null;
}

interface State {
  active: boolean;
  ctx: GestureContext<AreaSelectPose> | null;
}

export function useAreaSelectInteraction(
  adapter: AreaSelectAdapter,
  options: UseAreaSelectInteractionOptions,
): UseAreaSelectInteractionReturn {
  const { behaviors = [], transient: transientOpt, label = 'Area select', onGestureStart, onGestureEnd } = options;
  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const stateRef = useRef<State>({ active: false, ctx: null });
  const [overlay, setOverlay] = useState<AreaSelectOverlay | null>(null);

  const cleanup = useCallback(() => {
    stateRef.current.active = false;
    stateRef.current.ctx = null;
    setOverlay(null);
  }, []);

  const start = useCallback((worldX: number, worldY: number, modifiers: ModifierState) => {
    const startPose: AreaSelectPose = { worldX, worldY, shiftHeld: modifiers.shift };
    const ctx: GestureContext<AreaSelectPose> = {
      draggedIds: [GID],
      origin: new Map([[GID, startPose]]),
      current: new Map([[GID, startPose]]),
      snap: null,
      modifiers,
      pointer: { worldX, worldY, clientX: 0, clientY: 0 },
      adapter: adapter as unknown as GestureContext<AreaSelectPose>['adapter'],
      scratch: {},
    };
    for (const b of behaviorsRef.current) b.onStart?.(ctx);
    stateRef.current = { active: true, ctx };
    onGestureStart?.();
    setOverlay({
      start: { worldX, worldY },
      current: { worldX, worldY },
      shiftHeld: modifiers.shift,
    });
  }, [adapter, onGestureStart]);

  const move = useCallback((_wx: number, _wy: number, _mods: ModifierState): boolean => {
    return stateRef.current.active;
  }, []);

  const end = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  const cancel = useCallback(() => {
    cleanup();
    onGestureEnd?.(false);
  }, [cleanup, onGestureEnd]);

  // Resolve transient flag for compile-time consumers; not consumed yet.
  // Real consumption lands in commit 4c.
  void transientOpt; void label;

  return { start, move, end, cancel, isAreaSelecting: overlay !== null, overlay };
}
```

- [ ] **Step 4.4: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/area-select/areaSelect.test.ts
```
Expected: PASS.

- [ ] **Step 4.5: Wire barrel + subpath proxy**

`src/canvas-kit/interactions/area-select/index.ts`:

```ts
export { useAreaSelectInteraction } from './areaSelect';
export type {
  UseAreaSelectInteractionOptions,
  UseAreaSelectInteractionReturn,
} from './areaSelect';
export * from './behaviors';
```

`src/canvas-kit/area-select.ts`:

```ts
export * from './interactions/area-select';
```

Add to `src/canvas-kit/index.ts` (after the insert hook export block):

```ts
export { useAreaSelectInteraction } from './interactions/area-select';
export type {
  UseAreaSelectInteractionOptions,
  UseAreaSelectInteractionReturn,
} from './interactions/area-select';
```

- [ ] **Step 4.6: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 4.7: Commit**

```
git add src/canvas-kit/interactions/area-select/ src/canvas-kit/area-select.ts src/canvas-kit/index.ts
git commit -m "feat(canvas-kit): scaffold useAreaSelectInteraction (start/cancel)"
```

#### Commit 4b: move updates overlay

- [ ] **Step 4.8: Append failing test for move**

Append to `src/canvas-kit/interactions/area-select/areaSelect.test.ts`:

```ts
describe('useAreaSelectInteraction — move', () => {
  it('move updates overlay.current; preserves shiftHeld from start', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    act(() => { result.current.start(1, 2, { ...NO_MOD, shift: true }); });
    act(() => { result.current.move(5, 7, NO_MOD); });
    expect(result.current.overlay).toEqual({
      start: { worldX: 1, worldY: 2 },
      current: { worldX: 5, worldY: 7 },
      shiftHeld: true,
    });
  });

  it('move while inactive returns false and does not set overlay', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    let returned = true;
    act(() => { returned = result.current.move(1, 1, NO_MOD); });
    expect(returned).toBe(false);
    expect(result.current.overlay).toBeNull();
  });
});
```

- [ ] **Step 4.9: Run — fail**

Expected: FAIL — `move` is currently a no-op stub.

- [ ] **Step 4.10: Replace `move`**

In `src/canvas-kit/interactions/area-select/areaSelect.ts`, replace the `move` callback:

```ts
const move = useCallback((worldX: number, worldY: number, modifiers: ModifierState): boolean => {
  const s = stateRef.current;
  if (!s.active || !s.ctx) return false;
  const ctx = s.ctx;
  ctx.modifiers = modifiers;
  ctx.pointer = { worldX, worldY, clientX: 0, clientY: 0 };
  const start = ctx.origin.get(GID)!;
  const current: AreaSelectPose = { worldX, worldY, shiftHeld: start.shiftHeld };
  ctx.current.set(GID, current);
  // onMove return is void; behaviors may still side-effect on ctx.scratch.
  for (const b of behaviorsRef.current) {
    b.onMove?.(ctx, {
      start: { worldX: start.worldX, worldY: start.worldY },
      current: { worldX, worldY },
      shiftHeld: start.shiftHeld,
    });
  }
  setOverlay({
    start: { worldX: start.worldX, worldY: start.worldY },
    current: { worldX, worldY },
    shiftHeld: start.shiftHeld,
  });
  return true;
}, []);
```

- [ ] **Step 4.11: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/area-select/areaSelect.test.ts
```
Expected: PASS.

- [ ] **Step 4.12: Commit**

```
git add src/canvas-kit/interactions/area-select/areaSelect.ts src/canvas-kit/interactions/area-select/areaSelect.test.ts
git commit -m "feat(canvas-kit): useAreaSelectInteraction move updates overlay"
```

#### Commit 4c: end resolves transient + commits ops

- [ ] **Step 4.13: Append failing tests for end + transient routing**

Append to `src/canvas-kit/interactions/area-select/areaSelect.test.ts`:

```ts
describe('useAreaSelectInteraction — end', () => {
  it('default (selectFromMarquee → defaultTransient: true): commits via applyOps, not applyBatch', () => {
    const { adapter, ops, batches, getSelection } = makeAdapter(['existing']);
    // Override hitTestArea so end path produces hits.
    (adapter as { hitTestArea: (r: unknown) => string[] }).hitTestArea = () => ['x', 'y'];
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    act(() => { result.current.start(0, 0, NO_MOD); });
    act(() => { result.current.move(4, 4, NO_MOD); });
    act(() => { result.current.end(); });
    expect(ops).toHaveLength(1);
    expect(batches).toEqual([]);
    expect(getSelection()).toEqual(['x', 'y']);
  });

  it('cancel produces no ops even after move', () => {
    const { adapter, ops } = makeAdapter();
    (adapter as { hitTestArea: (r: unknown) => string[] }).hitTestArea = () => ['x'];
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    act(() => { result.current.start(0, 0, NO_MOD); });
    act(() => { result.current.move(4, 4, NO_MOD); });
    act(() => { result.current.cancel(); });
    expect(ops).toEqual([]);
  });

  it('options.transient = false overrides defaultTransient: routes through applyBatch', () => {
    const { adapter, ops, batches } = makeAdapter();
    (adapter as { hitTestArea: (r: unknown) => string[] }).hitTestArea = () => ['x'];
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, {
        behaviors: [selectFromMarquee()],
        transient: false,
        label: 'Pick',
      }),
    );
    act(() => { result.current.start(0, 0, NO_MOD); });
    act(() => { result.current.move(4, 4, NO_MOD); });
    act(() => { result.current.end(); });
    expect(ops).toEqual([]);
    expect(batches).toHaveLength(1);
    expect(batches[0].label).toBe('Pick');
  });

  it('end with no behaviors emitting ops produces no commit', () => {
    const { adapter, ops, batches } = makeAdapter();
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [] }),
    );
    act(() => { result.current.start(0, 0, NO_MOD); });
    act(() => { result.current.move(4, 4, NO_MOD); });
    act(() => { result.current.end(); });
    expect(ops).toEqual([]);
    expect(batches).toEqual([]);
  });
});
```

- [ ] **Step 4.14: Run — fail**

Expected: FAIL — current `end` just cleans up.

- [ ] **Step 4.15: Replace `end`**

In `src/canvas-kit/interactions/area-select/areaSelect.ts`, replace the `end` callback and remove the `void transientOpt; void label;` line:

```ts
const end = useCallback(() => {
  const s = stateRef.current;
  if (!s.active || !s.ctx) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }
  const ctx = s.ctx;
  let collected: Op[] | null | undefined;
  for (const b of behaviorsRef.current) {
    const r = b.onEnd?.(ctx);
    if (r === undefined) continue;
    collected = r;
    break;
  }
  if (collected === null) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }
  if (collected === undefined || collected.length === 0) {
    cleanup();
    onGestureEnd?.(false);
    return;
  }

  // Resolve transient: explicit option wins, then any behavior's defaultTransient,
  // then false.
  const transient =
    transientOpt ??
    behaviorsRef.current.some((b) => b.defaultTransient === true) ??
    false;

  if (transient) {
    (adapter as AreaSelectAdapter).applyOps(collected);
  } else {
    const adapterWithBatch = adapter as AreaSelectAdapter & {
      applyBatch?: (ops: Op[], label: string) => void;
    };
    adapterWithBatch.applyBatch?.(collected, label);
  }
  cleanup();
  onGestureEnd?.(true);
}, [adapter, cleanup, label, onGestureEnd, transientOpt]);
```

(The `?? false` fallback after `.some(...)` is technically redundant — `.some` always returns a boolean — but it documents intent. The TypeScript compiler will warn if it's unreachable; if so, drop the trailing `?? false`.)

- [ ] **Step 4.16: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/area-select/areaSelect.test.ts
```
Expected: PASS.

- [ ] **Step 4.17: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 4.18: Commit**

```
git add src/canvas-kit/interactions/area-select/areaSelect.ts src/canvas-kit/interactions/area-select/areaSelect.test.ts
git commit -m "feat(canvas-kit): useAreaSelectInteraction end resolves transient + commits ops"
```

---

### Task 5: Garden `areaSelectAdapter`

Reads `useGardenStore.getState().garden` for the `hitTestArea` delegation, `useUiStore.getState().selectedIds` for `getSelection`, and writes via `useUiStore.getState().setSelection`. `applyOps` runs ops without `gardenStore.checkpoint()` (selection lives in `uiStore`, which has no history).

**Files:**
- Create: `src/canvas/adapters/areaSelect.test.ts`
- Create: `src/canvas/adapters/areaSelect.ts`

- [ ] **Step 5.1: Write failing tests**

`src/canvas/adapters/areaSelect.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createAreaSelectAdapter } from './areaSelect';
import { createSetSelectionOp } from '@/canvas-kit';

describe('createAreaSelectAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('hitTestArea returns ids of zones intersecting the rect', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addZone({ x: 100, y: 100, width: 4, height: 4 });
    const a = createAreaSelectAdapter();
    const ids = a.hitTestArea({ x: -1, y: -1, width: 6, height: 6 });
    const z0 = useGardenStore.getState().garden.zones[0].id;
    const z1 = useGardenStore.getState().garden.zones[1].id;
    expect(ids).toContain(z0);
    expect(ids).not.toContain(z1);
  });

  it('getSelection returns useUiStore.selectedIds', () => {
    useUiStore.getState().setSelection(['a', 'b']);
    const a = createAreaSelectAdapter();
    expect(a.getSelection()).toEqual(['a', 'b']);
  });

  it('setSelection writes through to useUiStore', () => {
    const a = createAreaSelectAdapter();
    a.setSelection(['x', 'y']);
    expect(useUiStore.getState().selectedIds).toEqual(['x', 'y']);
  });

  it('applyOps runs the SetSelectionOp without producing a garden history entry', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, height: 4 });
    const before = useGardenStore.getState().garden;
    const a = createAreaSelectAdapter();
    a.applyOps([createSetSelectionOp({ from: [], to: ['z'] })]);
    expect(useUiStore.getState().selectedIds).toEqual(['z']);
    // Garden state unchanged → undo is a no-op (garden returns to same shape).
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones.length).toBe(before.zones.length);
  });
});
```

- [ ] **Step 5.2: Run — fail (module not found)**

```
npm test -- --run src/canvas/adapters/areaSelect.test.ts
```

- [ ] **Step 5.3: Implement**

`src/canvas/adapters/areaSelect.ts`:

```ts
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { hitTestArea } from '../hitTest';
import type { AreaSelectAdapter, Op } from '@/canvas-kit';

export function createAreaSelectAdapter(): AreaSelectAdapter {
  const adapter: AreaSelectAdapter = {
    hitTestArea(rect) {
      const { garden } = useGardenStore.getState();
      const hits = hitTestArea(rect, garden.structures, garden.zones, garden.plantings);
      return hits.map((h) => h.id);
    },
    getSelection() {
      return useUiStore.getState().selectedIds;
    },
    setSelection(ids) {
      useUiStore.getState().setSelection(ids);
    },
    applyOps(ops: Op[]) {
      for (const op of ops) op.apply(adapter as never);
    },
  };
  return adapter;
}
```

- [ ] **Step 5.4: Run — pass**

```
npm test -- --run src/canvas/adapters/areaSelect.test.ts
```

- [ ] **Step 5.5: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 5.6: Commit**

```
git add src/canvas/adapters/areaSelect.ts src/canvas/adapters/areaSelect.test.ts
git commit -m "feat(garden): add areaSelectAdapter delegating to hitTestArea"
```

---

### Task 6: Extend Garden `insertAdapter` with `commitPaste`, `snapshotSelection`, `getPasteOffset`

Replace the Task 2 stubs with real implementations. The snapshot keeps full Structure / Zone / Planting records. `commitPaste` clones each by type with a fresh id, applying `offset.dx` / `offset.dy` to the world-space coordinates of structures and zones (plantings are parent-relative — they inherit the offset implicitly when their parent moves, and remain at the same relative coords inside the cloned parent).

The current legacy `useClipboard` drops plantings; this implementation re-materializes them — **call out as a behavior change in the commit message**.

**Files:**
- Modify: `src/canvas/adapters/insert.ts`
- Modify: `src/canvas/adapters/insert.test.ts`

- [ ] **Step 6.1: Append failing tests for snapshotSelection + commitPaste**

Append to `src/canvas/adapters/insert.test.ts`:

```ts
import { createPlanting } from '../../model/types';

describe('createInsertAdapter — snapshotSelection + commitPaste', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('snapshotSelection captures structures, zones, plantings matching ids', () => {
    useGardenStore.getState().addStructure({ type: 'pot', x: 0, y: 0, width: 1, height: 1 });
    useGardenStore.getState().addZone({ x: 2, y: 2, width: 4, height: 4 });
    const sId = useGardenStore.getState().garden.structures[0].id;
    const zId = useGardenStore.getState().garden.zones[0].id;
    const a = createInsertAdapter();
    const snap = a.snapshotSelection([sId, zId]);
    expect(snap.items).toHaveLength(2);
  });

  it('snapshotSelection ignores ids not in garden', () => {
    const a = createInsertAdapter();
    const snap = a.snapshotSelection(['nope']);
    expect(snap.items).toEqual([]);
  });

  it('commitPaste materializes a structure with a new id and offset coords', () => {
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 6, width: 1, height: 1 });
    const sId = useGardenStore.getState().garden.structures[0].id;
    const a = createInsertAdapter();
    const snap = a.snapshotSelection([sId]);
    const out = a.commitPaste(snap, { dx: 1, dy: 2 });
    expect(out).toHaveLength(1);
    const made = out[0] as { id: string; x: number; y: number };
    expect(made.id).not.toBe(sId);
    expect(made.x).toBe(6);
    expect(made.y).toBe(8);
  });

  it('commitPaste materializes a zone with a new id and offset coords', () => {
    useGardenStore.getState().addZone({ x: 5, y: 6, width: 4, height: 4 });
    const zId = useGardenStore.getState().garden.zones[0].id;
    const a = createInsertAdapter();
    const snap = a.snapshotSelection([zId]);
    const out = a.commitPaste(snap, { dx: 2, dy: 3 });
    expect(out).toHaveLength(1);
    const made = out[0] as { id: string; x: number; y: number };
    expect(made.id).not.toBe(zId);
    expect(made.x).toBe(7);
    expect(made.y).toBe(9);
  });

  it('commitPaste materializes plantings (behavior change: legacy useClipboard dropped them)', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const sId = useGardenStore.getState().garden.structures[0].id;
    // Insert a planting via direct setState (no addPlanting helper assumed).
    const planting = createPlanting({ parentId: sId, x: 1, y: 1, cultivarId: 'tomato' });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, plantings: [...s.garden.plantings, planting] },
    }));
    const a = createInsertAdapter();
    // Snapshot the planting only (parent stays in garden; clone keeps same parentId).
    const snap = a.snapshotSelection([planting.id]);
    const out = a.commitPaste(snap, { dx: 0, dy: 0 });
    expect(out).toHaveLength(1);
    const made = out[0] as { id: string; parentId: string; x: number; y: number };
    expect(made.id).not.toBe(planting.id);
    expect(made.parentId).toBe(sId);
    expect(made.x).toBe(1);
    expect(made.y).toBe(1);
  });

  it('getPasteOffset defaults to one grid cell down-right', () => {
    const a = createInsertAdapter();
    const cell = useGardenStore.getState().garden.gridCellSizeFt;
    const off = a.getPasteOffset!({ items: [] });
    expect(off).toEqual({ dx: cell, dy: cell });
  });
});
```

- [ ] **Step 6.2: Run — fail**

```
npm test -- --run src/canvas/adapters/insert.test.ts
```
Expected: FAIL — current stubs return empty arrays.

- [ ] **Step 6.3: Implement**

Replace `src/canvas/adapters/insert.ts` with:

```ts
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  createPlanting,
  createStructure,
  createZone,
} from '../../model/types';
import type { Planting, Structure, Zone } from '../../model/types';
import type { ClipboardSnapshot, InsertAdapter, Op } from '@/canvas-kit';

type GardenObj = Structure | Zone | Planting;

interface SnapshotItem {
  kind: 'structure' | 'zone' | 'planting';
  data: Structure | Zone | Planting;
}

export interface GardenInsertAdapter extends InsertAdapter<GardenObj> {
  removeObject(id: string): void;
}

export function createInsertAdapter(): GardenInsertAdapter {
  const adapter: GardenInsertAdapter = {
    commitInsert(b) {
      const tool = useUiStore.getState().plottingTool;
      if (!tool) return null;
      if (tool.category === 'structures') {
        return createStructure({
          type: tool.type,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        });
      }
      if (tool.category === 'zones') {
        return createZone({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          color: tool.color,
          pattern: tool.pattern ?? null,
        });
      }
      return null;
    },
    snapshotSelection(ids) {
      const { garden } = useGardenStore.getState();
      const idSet = new Set(ids);
      const items: SnapshotItem[] = [];
      for (const s of garden.structures) {
        if (idSet.has(s.id)) items.push({ kind: 'structure', data: s });
      }
      for (const z of garden.zones) {
        if (idSet.has(z.id)) items.push({ kind: 'zone', data: z });
      }
      for (const p of garden.plantings) {
        if (idSet.has(p.id)) items.push({ kind: 'planting', data: p });
      }
      return { items };
    },
    commitPaste(clipboard: ClipboardSnapshot, offset) {
      const out: GardenObj[] = [];
      for (const raw of clipboard.items) {
        const item = raw as SnapshotItem;
        if (item.kind === 'structure') {
          const s = item.data as Structure;
          out.push(
            createStructure({
              type: s.type,
              x: s.x + offset.dx,
              y: s.y + offset.dy,
              width: s.width,
              height: s.height,
              shape: s.shape,
              groupId: s.groupId ?? undefined,
            }),
          );
        } else if (item.kind === 'zone') {
          const z = item.data as Zone;
          out.push(
            createZone({
              x: z.x + offset.dx,
              y: z.y + offset.dy,
              width: z.width,
              height: z.height,
              color: z.color,
              pattern: z.pattern,
            }),
          );
        } else {
          const p = item.data as Planting;
          // Plantings are parent-relative; the offset doesn't apply to their
          // local x/y. They keep the same parentId — selection-paste-of-planting
          // creates a sibling under the same parent.
          out.push(
            createPlanting({
              parentId: p.parentId,
              x: p.x,
              y: p.y,
              cultivarId: p.cultivarId,
            }),
          );
        }
      }
      return out;
    },
    getPasteOffset(_clipboard) {
      const cell = useGardenStore.getState().garden.gridCellSizeFt;
      return { dx: cell, dy: cell };
    },
    insertObject(obj) {
      if ('cultivarId' in obj) {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, plantings: [...s.garden.plantings, obj as Planting] },
        }));
      } else if ('type' in obj) {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, structures: [...s.garden.structures, obj as Structure] },
        }));
      } else {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, zones: [...s.garden.zones, obj as Zone] },
        }));
      }
    },
    removeObject(id) {
      useGardenStore.setState((s) => ({
        garden: {
          ...s.garden,
          structures: s.garden.structures.filter((x) => x.id !== id),
          zones: s.garden.zones.filter((x) => x.id !== id),
          plantings: s.garden.plantings.filter((x) => x.id !== id),
        },
      }));
    },
    setSelection(ids) {
      useUiStore.getState().setSelection(ids);
    },
    applyBatch(ops: Op[], _label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter as never);
    },
  };
  return adapter;
}
```

- [ ] **Step 6.4: Run — pass**

```
npm test -- --run src/canvas/adapters/insert.test.ts
```

- [ ] **Step 6.5: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 6.6: Commit**

```
git add src/canvas/adapters/insert.ts src/canvas/adapters/insert.test.ts
git commit -m "feat(garden): extend insertAdapter with snapshotSelection, commitPaste, getPasteOffset

Behavior change: paste now materializes plantings (legacy useClipboard dropped them)."
```

---

### Task 7: `useClipboard` hook + integration tests

Single `applyBatch` per paste containing N `InsertOp`s + one `SetSelectionOp`. Cascading: after paste, replace internal snapshot with the just-pasted objects so the next paste cascades.

**Files:**
- Create: `src/canvas-kit/interactions/clipboard/clipboard.test.ts`
- Create: `src/canvas-kit/interactions/clipboard/clipboard.ts`
- Create: `src/canvas-kit/interactions/clipboard/index.ts`
- Create: `src/canvas-kit/clipboard.ts` (subpath proxy)
- Modify: `src/canvas-kit/index.ts`

- [ ] **Step 7.1: Write failing tests**

`src/canvas-kit/interactions/clipboard/clipboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboard } from './clipboard';
import type { ClipboardSnapshot, InsertAdapter, Op } from '@/canvas-kit';

interface Obj { id: string; x: number; y: number }

function makeAdapter(initial: { selection?: string[]; offsetOverride?: { dx: number; dy: number } } = {}) {
  let selection = [...(initial.selection ?? [])];
  let nextId = 0;
  const inserts: Obj[] = [];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: InsertAdapter<Obj> = {
    commitInsert: () => null,
    commitPaste(clipboard, offset) {
      const out: Obj[] = [];
      for (const raw of clipboard.items) {
        const src = raw as Obj;
        out.push({ id: `n${nextId++}`, x: src.x + offset.dx, y: src.y + offset.dy });
      }
      return out;
    },
    snapshotSelection(ids) {
      // For tests, build snapshots from a virtual pool that mirrors `inserts` plus seeded items.
      const pool = inserts;
      const items = pool.filter((p) => ids.includes(p.id));
      return { items };
    },
    getPasteOffset: initial.offsetOverride
      ? () => initial.offsetOverride!
      : () => ({ dx: 1, dy: 1 }),
    insertObject: (o) => { inserts.push(o); },
    setSelection: (ids) => { selection = [...ids]; },
    applyBatch: (ops, label) => {
      batches.push({ ops, label });
      for (const op of ops) op.apply(adapter as never);
    },
  };
  return {
    adapter,
    inserts,
    batches,
    getSelection: () => selection,
    seed(o: Obj) { inserts.push(o); selection = [o.id]; },
  };
}

describe('useClipboard', () => {
  it('isEmpty starts true', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useClipboard(adapter, { getSelection: () => [] }));
    expect(result.current.isEmpty()).toBe(true);
  });

  it('copy with empty selection no-ops; isEmpty stays true', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useClipboard(adapter, { getSelection: () => [] }));
    act(() => { result.current.copy(); });
    expect(result.current.isEmpty()).toBe(true);
  });

  it('paste with empty clipboard no-ops; no batch emitted', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useClipboard(adapter, { getSelection: () => [] }));
    act(() => { result.current.paste(); });
    expect(batches).toEqual([]);
  });

  it('copy then paste emits one applyBatch with N InsertOps + one SetSelectionOp', () => {
    const helpers = makeAdapter();
    helpers.seed({ id: 'a', x: 0, y: 0 });
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, { getSelection: () => ['a'] }),
    );
    act(() => { result.current.copy(); });
    act(() => { result.current.paste(); });
    expect(helpers.batches).toHaveLength(1);
    expect(helpers.batches[0].label).toBe('Paste');
    // 1 InsertOp + 1 SetSelectionOp
    expect(helpers.batches[0].ops).toHaveLength(2);
    // Second op is a SetSelection op pointing at the new id 'n0'.
    expect(helpers.getSelection()).toEqual(['n0']);
  });

  it('cascading paste shifts each call by the offset', () => {
    const helpers = makeAdapter({ offsetOverride: { dx: 1, dy: 1 } });
    helpers.seed({ id: 'a', x: 0, y: 0 });
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, { getSelection: () => ['a'] }),
    );
    act(() => { result.current.copy(); });
    act(() => { result.current.paste(); });
    act(() => { result.current.paste(); });
    // First paste: n0 at (1,1). Second paste should snapshot the just-pasted
    // n0 and offset by (1,1) again → n1 at (2,2).
    const made = helpers.inserts.filter((o) => o.id.startsWith('n'));
    expect(made.map((o) => ({ x: o.x, y: o.y }))).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it('honors options.getSelection over adapter.getSelection (which doesn\'t exist on InsertAdapter)', () => {
    const helpers = makeAdapter();
    helpers.seed({ id: 'a', x: 0, y: 0 });
    let calls = 0;
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, {
        getSelection: () => { calls += 1; return ['a']; },
      }),
    );
    act(() => { result.current.copy(); });
    expect(calls).toBeGreaterThan(0);
    expect(result.current.isEmpty()).toBe(false);
  });

  it('onPaste callback receives the new ids', () => {
    const helpers = makeAdapter();
    helpers.seed({ id: 'a', x: 0, y: 0 });
    const seen: string[][] = [];
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, {
        getSelection: () => ['a'],
        onPaste: (ids) => seen.push(ids),
      }),
    );
    act(() => { result.current.copy(); });
    act(() => { result.current.paste(); });
    expect(seen).toEqual([['n0']]);
  });
});
```

- [ ] **Step 7.2: Run — fail (module not found)**

```
npm test -- --run src/canvas-kit/interactions/clipboard/clipboard.test.ts
```

- [ ] **Step 7.3: Implement `useClipboard`**

`src/canvas-kit/interactions/clipboard/clipboard.ts`:

```ts
import { useCallback, useRef } from 'react';
import { createInsertOp } from '../../ops/create';
import { createSetSelectionOp } from '../../ops/selection';
import type { Op } from '../../ops/types';
import type { InsertAdapter } from '../../adapters/types';
import type { ClipboardSnapshot } from '../types';

export interface UseClipboardOptions {
  /** How the hook reads "current selection" for copy. The kit doesn't assume
   *  a global selection store; each consumer wires this. */
  getSelection: () => string[];
  /** Called after a successful paste with the ids of the newly inserted objects. */
  onPaste?: (newIds: string[]) => void;
  /** Label for the history entry produced by paste. Default 'Paste'. */
  pasteLabel?: string;
}

export interface UseClipboardReturn {
  copy(): void;
  paste(): void;
  isEmpty(): boolean;
}

const EMPTY: ClipboardSnapshot = { items: [] };

export function useClipboard<TObject extends { id: string }>(
  adapter: InsertAdapter<TObject>,
  options: UseClipboardOptions,
): UseClipboardReturn {
  const { getSelection, onPaste, pasteLabel = 'Paste' } = options;
  const clipboardRef = useRef<ClipboardSnapshot>(EMPTY);
  // Keep callbacks stable across renders.
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef({ getSelection, onPaste, pasteLabel });
  optsRef.current = { getSelection, onPaste, pasteLabel };

  const copy = useCallback(() => {
    const ids = optsRef.current.getSelection();
    if (ids.length === 0) return;
    clipboardRef.current = adapterRef.current.snapshotSelection(ids);
  }, []);

  const paste = useCallback(() => {
    const cb = clipboardRef.current;
    if (cb.items.length === 0) return;
    const a = adapterRef.current;
    const offset = a.getPasteOffset?.(cb) ?? { dx: 0, dy: 0 };
    const created = a.commitPaste(cb, offset);
    if (created.length === 0) return;
    const newIds = created.map((o) => o.id);
    const beforeSel = optsRef.current.getSelection();
    const ops: Op[] = [
      ...created.map((o) => createInsertOp({ object: o })),
      createSetSelectionOp({ from: beforeSel, to: newIds }),
    ];
    a.applyBatch(ops, optsRef.current.pasteLabel);
    // Cascade: next paste shifts again by `offset` from these copies.
    clipboardRef.current = a.snapshotSelection(newIds);
    optsRef.current.onPaste?.(newIds);
  }, []);

  const isEmpty = useCallback(() => clipboardRef.current.items.length === 0, []);

  return { copy, paste, isEmpty };
}
```

- [ ] **Step 7.4: Run — pass**

```
npm test -- --run src/canvas-kit/interactions/clipboard/clipboard.test.ts
```

- [ ] **Step 7.5: Wire barrel + subpath proxy + top-level export**

`src/canvas-kit/interactions/clipboard/index.ts`:

```ts
export { useClipboard } from './clipboard';
export type { UseClipboardOptions, UseClipboardReturn } from './clipboard';
```

`src/canvas-kit/clipboard.ts`:

```ts
export * from './interactions/clipboard';
```

In `src/canvas-kit/index.ts`, add (after the area-select export block):

```ts
export { useClipboard } from './interactions/clipboard';
export type { UseClipboardOptions, UseClipboardReturn } from './interactions/clipboard';
```

- [ ] **Step 7.6: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 7.7: Commit**

```
git add src/canvas-kit/interactions/clipboard/ src/canvas-kit/clipboard.ts src/canvas-kit/index.ts
git commit -m "feat(canvas-kit): add useClipboard hook (single-batch paste, cascading copies)"
```

---

### Task 8: CanvasStack migration — wire kit hooks; drop legacy imports

Wire the kit `useAreaSelectInteraction` and `useClipboard` through CanvasStack. Drop the legacy `useAreaSelectInteraction` and `useClipboard` imports immediately (the repo enables `noUnusedLocals`, so we cannot stage their removal).

The legacy `areaSelect.move(e)` in `handleMouseMove` (line ~1006 in current CanvasStack) takes a `React.MouseEvent`; the kit version takes `(worldX, worldY, modifiers)`. Migrate the call site to compute world coords inside `handleMouseMove` (the same `screenToWorld` block already used for kit resize/insert is reused). Likewise `areaSelect.start(worldX, worldY, e.shiftKey)` becomes `areaSelect.start(worldX, worldY, modifiers)`. The legacy `areaSelect.isDragging.current` check in `handleMouseUp` becomes `areaSelect.isAreaSelecting`.

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`
- Modify: `src/store/uiStore.ts` (add `areaSelectOverlay` state + setter)

- [ ] **Step 8.1: Add `AreaSelectOverlayUi` and state to `src/store/uiStore.ts`**

After the `InsertOverlayUi` interface (around line 36), add:

```ts
export interface AreaSelectOverlayUi {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}
```

Add a field to the `UiStore` interface (near `insertOverlay`):

```ts
areaSelectOverlay: AreaSelectOverlayUi | null;
```

Add a setter to the interface (near `setInsertOverlay`):

```ts
setAreaSelectOverlay: (overlay: AreaSelectOverlayUi | null) => void;
```

In `defaultState()`, alongside `insertOverlay`:

```ts
areaSelectOverlay: null as AreaSelectOverlayUi | null,
```

In the store body, alongside `setInsertOverlay`:

```ts
setAreaSelectOverlay: (overlay) => set({ areaSelectOverlay: overlay }),
```

- [ ] **Step 8.2: Update CanvasStack imports**

Remove:

```ts
import { useClipboard } from './hooks/useClipboard';
import { useAreaSelectInteraction } from './hooks/useAreaSelectInteraction';
```

Add (in the existing `@/canvas-kit` import block area; mirror the import shape used for `useResizeInteraction`):

```ts
import { useAreaSelectInteraction, selectFromMarquee } from '@/canvas-kit/area-select';
import { useClipboard } from '@/canvas-kit/clipboard';
import { createAreaSelectAdapter } from './adapters/areaSelect';
```

(`createInsertAdapter` is already imported; we'll reuse the same instance for both `useInsertInteraction` and `useClipboard`.)

- [ ] **Step 8.3: Replace `clipboard` and `areaSelect` setup**

Find the line:

```ts
const clipboard = useClipboard();
```

Replace with (near the existing kit insert setup; reuse the same `insertAdapter` instance — find where `createInsertAdapter()` is currently called and reuse its memoized adapter; if not memoized, memoize it):

Above the existing `insert = useInsertInteraction(...)` call, ensure the adapter is memoized:

```ts
const insertAdapter = useMemo(() => createInsertAdapter(), []);
// ...existing useInsertInteraction(insertAdapter, ...) call uses this same instance
```

Then add right below it:

```ts
const clipboard = useClipboard(insertAdapter, {
  getSelection: () => useUiStore.getState().selectedIds,
  pasteLabel: 'Paste',
});
```

Find the line:

```ts
const areaSelect = useAreaSelectInteraction({ containerRef, selectionCanvasRef, width, height, dpr });
```

Replace with:

```ts
const areaSelectAdapter = useMemo(() => createAreaSelectAdapter(), []);
const areaSelect = useAreaSelectInteraction(areaSelectAdapter, {
  behaviors: [selectFromMarquee()],
});
```

- [ ] **Step 8.4: Mirror `areaSelect.overlay` into `useUiStore.areaSelectOverlay`**

Below the existing block that mirrors the insert overlay (around line 322), add:

```ts
useEffect(() => {
  const ov = areaSelect.overlay;
  useUiStore.getState().setAreaSelectOverlay(ov);
}, [areaSelect.overlay]);
```

- [ ] **Step 8.5: Migrate `areaSelect.start` call site**

In the mouse-down handler (around line 850), replace:

```ts
if (currentViewMode === 'select-area') {
  areaSelect.start(worldX, worldY, e.shiftKey);
  setActiveCursor('crosshair');
  return;
}
```

with:

```ts
if (currentViewMode === 'select-area') {
  areaSelect.start(worldX, worldY, {
    alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey,
  });
  setActiveCursor('crosshair');
  return;
}
```

- [ ] **Step 8.6: Migrate `areaSelect.move` call site**

In `handleMouseMove` (around line 1006), the legacy line:

```ts
if (areaSelect.move(e)) return;
```

Move it into the same `if (rect) {...}` block that already computes `worldX/worldY` for kit hooks. Replace the standalone call with:

In the existing kit-hook block (around line 1014, after `const modifiers = ...`), add a kit areaSelect dispatch line *before* the resize/insert checks so it gets first crack while active:

```ts
if (areaSelect.isAreaSelecting && areaSelect.move(worldX, worldY, modifiers)) return;
```

And delete the original `if (areaSelect.move(e)) return;` line at the top of `handleMouseMove`.

- [ ] **Step 8.7: Migrate `areaSelect.end` call site**

In `handleMouseUp` (around line 1088), replace:

```ts
if (areaSelect.isDragging.current) {
  areaSelect.end();
  setActiveCursor(null);
  return;
}
```

with:

```ts
if (areaSelect.isAreaSelecting) {
  areaSelect.end();
  setActiveCursor(null);
  return;
}
```

- [ ] **Step 8.8: Update Escape handler**

The existing `areaSelect.cancel()` call (around line 335) keeps the same shape — kit hook exposes `cancel()`. No change needed; verify it still compiles.

- [ ] **Step 8.9: Update `useCallback` dependency arrays**

The `handleMouseMove` and `handleMouseUp` `useCallback` deps reference `areaSelect`. They keep referencing the same identifier; no change. Same for `useKeyboardActionDispatch({ clipboard })` — the `clipboard` shape (`{ copy, paste, isEmpty }`) matches, so this call site stays.

- [ ] **Step 8.10: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean. Pay specific attention to `noUnusedLocals` errors — if anything still references the old hook files, remove the references. The legacy hook files themselves remain on disk until Task 10.

- [ ] **Step 8.11: Commit**

```
git add src/canvas/CanvasStack.tsx src/store/uiStore.ts
git commit -m "feat(canvas): wire kit useAreaSelectInteraction and useClipboard through CanvasStack"
```

---

### Task 9: Renderer paints marquee from `areaSelectOverlay`

Move the dashed-blue marquee paint from the legacy `useAreaSelectInteraction.move` into the same selection-canvas renderer that already paints the insert overlay (`useLayerEffect` block around line 592 in CanvasStack).

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 9.1: Add `areaSelectOverlayUi` reader**

Near the existing `const insertOverlayUi = useUiStore((s) => s.insertOverlay);` line (~106), add:

```ts
const areaSelectOverlayUi = useUiStore((s) => s.areaSelectOverlay);
```

- [ ] **Step 9.2: Extend the selection-canvas `useLayerEffect` body**

In the existing `useLayerEffect(selectionCanvasRef, ...)` callback (~line 596), after the `insertOv` paint block, add:

```ts
const areaOv = useUiStore.getState().areaSelectOverlay;
if (areaOv) {
  const x = Math.min(areaOv.start.worldX, areaOv.current.worldX);
  const y = Math.min(areaOv.start.worldY, areaOv.current.worldY);
  const w = Math.abs(areaOv.current.worldX - areaOv.start.worldX);
  const h = Math.abs(areaOv.current.worldY - areaOv.start.worldY);
  const sx = panX + x * zoom;
  const sy = panY + y * zoom;
  const sw = w * zoom;
  const sh = h * zoom;
  ctx.fillStyle = 'rgba(91, 164, 207, 0.15)';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = '#5BA4CF';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.setLineDash([]);
}
```

Update the `useLayerEffect` deps array to include `areaSelectOverlayUi`:

```ts
[appMode, selectedIds, garden.structures, garden.zones, garden.plantings, zoom, panX, panY, insertOverlayUi, areaSelectOverlayUi],
```

- [ ] **Step 9.3: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 9.4: Commit**

```
git add src/canvas/CanvasStack.tsx
git commit -m "feat(canvas): paint area-select marquee from areaSelectOverlay reader"
```

---

### Task 10: Delete legacy hook files

Now that CanvasStack and the renderer no longer reference them, remove `src/canvas/hooks/useAreaSelectInteraction.ts`, `src/canvas/hooks/useClipboard.ts`, and `src/canvas/hooks/useClipboard.test.ts`. The clipboard test assertions are superseded by `src/canvas-kit/interactions/clipboard/clipboard.test.ts` (kit hook integration) and `src/canvas/adapters/insert.test.ts` (snapshot/paste materialization).

**Files:**
- Delete: `src/canvas/hooks/useAreaSelectInteraction.ts`
- Delete: `src/canvas/hooks/useClipboard.ts`
- Delete: `src/canvas/hooks/useClipboard.test.ts`

- [ ] **Step 10.1: Verify no remaining references**

```
grep -rn "useAreaSelectInteraction\|hooks/useClipboard" src/ 2>&1 || true
```

Only matches inside the three files above are acceptable (they reference themselves).

- [ ] **Step 10.2: Delete the files**

```
git rm src/canvas/hooks/useAreaSelectInteraction.ts src/canvas/hooks/useClipboard.ts src/canvas/hooks/useClipboard.test.ts
```

- [ ] **Step 10.3: Run full suite + build**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 10.4: Commit**

```
git commit -m "refactor(canvas): delete legacy useAreaSelectInteraction and useClipboard hooks"
```

---

### Task 11: Smoke test, behavior docs, spec status flip

Manual smoke checklist, append behavior notes to `docs/behavior.md`, flip the spec's Status line.

**Files:**
- Modify: `docs/superpowers/specs/2026-05-01-canvas-kit-area-select-clipboard-design.md`
- Modify: `docs/behavior.md` (create if missing — but it exists, see global memory note)

- [ ] **Step 11.1: Manual smoke checklist**

Run the dev server (`npm run dev`) and verify in the browser:

1. Switch to **Select Area** tool. Drag a marquee around a structure → it becomes selected. Marquee paints dashed blue and clears on release.
2. Drag an empty marquee → selection clears (no shift).
3. Hold **Shift** and drag a marquee that covers a new object → it's added to the existing selection. Existing items stay selected.
4. Hold **Shift** and drag an empty marquee → selection unchanged.
5. Select a structure, **Cmd/Ctrl+C**, then **Cmd/Ctrl+V** → a copy appears one grid-cell down-right; the copy is selected.
6. Press **Cmd/Ctrl+V** a second time → another copy appears one grid-cell further (cascade).
7. Select a zone, copy, paste → zone copy materializes correctly.
8. Select a planting, copy, paste → a sibling planting appears under the same parent (new behavior; legacy dropped plantings).
9. After pasting two structures, press **Cmd/Ctrl+Z** once → both copies disappear in a single undo (proves single-batch paste).
10. Drag a marquee, then press **Cmd/Ctrl+Z** → garden state unchanged (area-select is transient; no history entry).

Write down any failures and fix before proceeding.

- [ ] **Step 11.2: Append entries to `docs/behavior.md`**

Append the following section (preserve any existing content):

```markdown
## Selection and clipboard (Phase 3 canvas-kit migration, 2026-05-01)

- Area-select (marquee) is transient: completing a marquee selection does NOT
  add a history entry. Undo immediately after marquee select is a no-op (or
  restores whatever the previous garden-mutating action was).
- Paste is a single undo step. Pasting N objects produces one history entry
  containing N inserts plus the selection change.
- Plantings paste. Selecting a planting, copying, and pasting now creates a
  sibling planting under the same parent at the same parent-relative
  coordinates. (Pre-Phase-3, plantings were silently dropped from clipboard
  contents.)
- Repeated pastes cascade by one grid cell down-right per paste.
```

- [ ] **Step 11.3: Flip the spec status line**

In `docs/superpowers/specs/2026-05-01-canvas-kit-area-select-clipboard-design.md`, change the Status line from:

```markdown
**Status:** Draft.
```

to:

```markdown
**Status:** Phase 3 implemented.
```

- [ ] **Step 11.4: Run full suite + build (final gate)**

```
npm test -- --run
npm run build
```
Expected: PASS / clean.

- [ ] **Step 11.5: Commit**

```
git add docs/behavior.md docs/superpowers/specs/2026-05-01-canvas-kit-area-select-clipboard-design.md
git commit -m "docs: record area-select+clipboard behavior changes; flip Phase 3 spec to implemented"
```

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — Op rename → Task 0; transient flag generalization → Task 1; types → Task 2; selectFromMarquee → Task 3; useAreaSelectInteraction → Task 4; areaSelectAdapter → Task 5; InsertAdapter extension → Task 6; useClipboard → Task 7; CanvasStack migration → Task 8; renderer overlay → Task 9; legacy delete → Task 10; smoke + status + behavior docs → Task 11.
- **Type consistency:** `AreaSelectAdapter`, `AreaSelectBehavior`, `AreaSelectOverlay`, `AreaSelectPose`, `AreaSelectProposed`, `ClipboardSnapshot`, `InsertOp`, `createInsertOp`, `useAreaSelectInteraction`, `useClipboard`, `selectFromMarquee` — names used in Tasks 2-7 match the spec's "File layout" section. `setSelection` was made an explicit member of `InsertAdapter` in Task 2 to support the paste batch's `SetSelectionOp.apply` call path.
- **Resolution rule for transient:** matches the spec's `transient = options.transient ?? behaviors.some(b => b.defaultTransient) ?? false` exactly (Task 4, Step 4.15).
- **Paste cascade:** the `clipboardRef.current = a.snapshotSelection(newIds)` line in Task 7's hook implementation matches the legacy behavior the spec calls out.

## Open issues

None. Each spec section has at least one task implementing it.
