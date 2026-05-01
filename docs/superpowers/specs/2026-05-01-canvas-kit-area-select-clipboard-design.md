# canvas-kit Area-Select + Clipboard Design (Phase 3)

**Status:** Phase 3 implemented.
**Date:** 2026-05-01
**Authors:** Mike
**Predecessors:**
- `docs/superpowers/specs/2026-04-30-canvas-kit-interactions-design.md` (Phase 1)
- `docs/superpowers/specs/2026-04-30-canvas-kit-resize-insert-design.md` (Phase 2, implemented)

## Goal

Port `useAreaSelectInteraction` and `useClipboard` from `src/canvas/hooks/` into canvas-kit as siblings to the move/resize/insert hooks, and unify clipboard paste with insert under one adapter. Bundle a vocabulary cleanup: rename the `Create*` op factory and type to `Insert*` so the kit reads consistently top-to-bottom.

## Non-goals

- Drag-lab adoption (Phase 4 — first real `createHistory` consumer).
- Cursor-relative or last-paste-cascade paste offsets (slot for future hook).
- Cross-document / OS clipboard (still in-memory only).
- Selection rendering changes; the marquee preview keeps its current dashed-blue style.
- Multi-select drag / group transforms.

## Architecture summary

Two new kit hooks (`useAreaSelectInteraction`, `useClipboard`) plus a small generalization to support gestures that don't write to history:

- **Transient gestures.** A new optional `transient` flag on the gesture descriptor (and a `defaultTransient` on `GestureBehavior`) marks a gesture whose ops apply through the adapter but don't push a history entry. Area-select uses this; move/resize/insert default to historied.
- **Insert/paste unification.** `InsertAdapter` gains a second commit path, `commitPaste(clipboard, offset)`, and an optional `getPasteOffset` hook. Paste emits a single batched `applyBatch` with N `createInsertOp`s plus a `createSetSelectionOp`.
- **Op rename.** `createCreateOp` → `createInsertOp`; `CreateOp` → `InsertOp`. One verb across gesture, adapter, and op.

The kit stays render-agnostic. The marquee preview moves from direct selection-canvas paint (current code) to overlay-driven paint, matching how Phase 2 handled insert preview.

## Generalizing for transient gestures

`GestureBehavior` gains an optional default:

```ts
interface GestureBehavior<TPose, TProposed, TMoveResult> {
  // ...existing fields...
  defaultTransient?: boolean;
}
```

Each hook's options gain a `transient?: boolean`. Resolution at gesture-start:

```ts
transient = options.transient ?? behaviors.some(b => b.defaultTransient) ?? false;
```

When `transient` is true, the hook calls `adapter.applyOps(ops)` (or equivalent) **without** a history checkpoint. Concretely, adapters expose two entry points:

```ts
interface AreaSelectAdapter {
  applyOps(ops: Op[]): void;             // no checkpoint, no history
}
```

Historied adapters keep their existing `applyBatch(ops, label)` (which checkpoints + records). Transient adapters only need `applyOps`. The `Op` apply path itself is unchanged — only the wrapping changes.

> **Why a flag, not a separate hook tree:** the gesture pipeline (onStart/onMove/onEnd, modifiers, cancel, overlay) is identical to historied gestures; the only difference is the wrapper at commit. A flag keeps one code path.

## `useAreaSelectInteraction`

```ts
interface AreaSelectPose { worldX: number; worldY: number; shiftHeld: boolean }

interface AreaSelectAdapter {
  /** Returns ids of objects intersecting the world-space rect. */
  hitTestArea(rect: { x: number; y: number; width: number; height: number }): string[];
  /** Current selection — read so behaviors can compute additive merges. */
  getSelection(): string[];
  applyOps(ops: Op[]): void;
}

interface AreaSelectOverlay {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}

interface UseAreaSelectInteractionOptions {
  behaviors?: AreaSelectBehavior[];
  transient?: boolean;                     // default true via behavior defaults
  onGestureStart?: () => void;
  onGestureEnd?: (committed: boolean) => void;
}

useAreaSelectInteraction(adapter, options): {
  start(worldX: number, worldY: number, modifiers: ModifierState): void;
  move(worldX: number, worldY: number, modifiers: ModifierState): boolean;
  end(): void;
  cancel(): void;
  overlay: AreaSelectOverlay | null;
  isAreaSelecting: boolean;
}
```

The kit ships one behavior:

| Hook | Behavior | Purpose |
|---|---|---|
| areaSelect | `selectFromMarquee()` | `defaultTransient: true`. On `onEnd`, computes hit ids via `adapter.hitTestArea(...)`, merges with existing selection if `shiftHeld`, returns `[createSetSelectionOp(ids)]`. Empty rect + no shift returns `[createSetSelectionOp([])]`. |

Behaviors can layer further (e.g., a future `lockedLayerFilter`) by mutating the proposed selection list before the final op emits.

### Marquee preview

The hook publishes `overlay` analogous to insert. The renderer reads the overlay and paints the dashed rect on the selection canvas. The current `useAreaSelectInteraction.move`'s direct `ctx.fillRect`/`strokeRect` paint moves into the renderer-side overlay reader.

## Insert / paste unification

`InsertAdapter` becomes:

```ts
interface InsertAdapter<TObject extends { id: string }> {
  /** Drag-rectangle source. */
  commitInsert(bounds: InsertBounds): TObject | null;

  /** Clipboard source. Returns the materialized objects (in order). */
  commitPaste(
    clipboard: ClipboardSnapshot,
    offset: { dx: number; dy: number },
  ): TObject[];

  /** Optional. Default returns one grid cell down-right. */
  getPasteOffset?(
    clipboard: ClipboardSnapshot,
    state: { /* opaque, app-defined */ },
  ): { dx: number; dy: number };

  applyBatch(ops: Op[], label: string): void;
}

interface ClipboardSnapshot {
  /** Opaque to the kit; the adapter knows what's in it. */
  items: unknown[];
}
```

The kit deliberately keeps `ClipboardSnapshot.items` opaque so each app's clipboard hook stores whatever shape it wants (Garden stores `{ structures, zones, plantings }`; another consumer could store SVG paths). The adapter both produces and consumes its own shape.

## `useClipboard`

```ts
interface UseClipboardOptions {
  pasteLabel?: string;                     // default 'Paste'
  onPaste?: (newIds: string[]) => void;
}

useClipboard(adapter, options): {
  copy(): void;
  paste(): void;
  isEmpty(): boolean;
}
```

Behavior:

- `copy()` reads the current selection, asks the adapter for a fresh `ClipboardSnapshot` (a new method `snapshotSelection(ids: string[]): ClipboardSnapshot`), and stores the snapshot in a hook-internal ref.
- `paste()`:
  1. Returns early if the snapshot is empty.
  2. Computes `offset = adapter.getPasteOffset?.(clipboard, state) ?? { dx: gridCell, dy: gridCell }`.
  3. Calls `adapter.commitPaste(clipboard, offset)`. Returns array of new objects.
  4. Builds ops: `[...newObjects.map(o => createInsertOp({ object: o })), createSetSelectionOp(newObjects.map(o => o.id))]`.
  5. Calls `adapter.applyBatch(ops, pasteLabel)` — single history entry.
  6. Updates internal clipboard snapshot to the pasted objects so repeated pastes cascade (matches today).

Plantings, zones, and structures are all materialized — the current `useClipboard` drops plantings; the kit version doesn't. The Garden `InsertAdapter.commitPaste` reconstructs each by type with new ids and the offset applied.

## Op rename

Repo-wide rename of the existing factory and type:

- `createCreateOp` → `createInsertOp`
- `CreateOp` → `InsertOp`

The op semantics are unchanged — same payload (`{ object: TObject }`), same `apply` (calls `adapter.insertObject(object)`). Touched files: kit op definitions, all kit hook implementations that emit it (insert hook, future paste path), and any tests asserting the op shape. Done as Task 0 to keep subsequent diffs clean.

## File layout

### Kit additions

```
src/canvas-kit/interactions/
  area-select/
    areaSelect.ts                   # useAreaSelectInteraction
    behaviors/
      selectFromMarquee.ts
      index.ts
    index.ts
  clipboard/
    clipboard.ts                    # useClipboard
    index.ts
  types.ts                          # + AreaSelectAdapter, AreaSelectBehavior,
                                    #   AreaSelectOverlay, ClipboardSnapshot,
                                    #   defaultTransient on GestureBehavior
```

Top-level `@/canvas-kit` re-exports `useAreaSelectInteraction` and `useClipboard`. The `selectFromMarquee` behavior is exported only via `@/canvas-kit/area-select` to match the per-hook subpath convention from Phase 2.

### Garden adapters

```
src/canvas/adapters/
  areaSelect.ts                     # AreaSelectAdapter implementation
  insert.ts                         # extended with commitPaste + snapshotSelection
```

`areaSelectAdapter.hitTestArea` delegates to existing `hitTestArea` from `src/canvas/hitTest.ts`. `applyOps` is a thin pass-through that runs each op without `gardenStore.checkpoint()`.

`insert.ts` gains:
- `snapshotSelection(ids)`: filters `garden.{structures,zones,plantings}` for those ids and returns `{ items: [...structures, ...zones, ...plantings] }` tagged with their type.
- `commitPaste(clipboard, offset)`: reconstructs each item with a fresh id and shifted x/y; returns the array. Plantings inherit the parent-relative coord behavior already in the model factories.

## Renderer changes

- **Area-select marquee:** new `areaSelectOverlay` reader on `useUiStore` (mirrored from hook overlay in CanvasStack). The selection canvas renderer paints the dashed rect from overlay coords. Old `useAreaSelectInteraction.move`'s direct paint is deleted along with the file.
- **Insert preview:** unchanged from Phase 2.

## CanvasStack migration

```tsx
const areaSelect = useAreaSelectInteraction(areaSelectAdapter, {
  behaviors: [selectFromMarquee()],
});

const clipboard = useClipboard(insertAdapter, { pasteLabel: 'Paste' });
```

The `Select Area` tool routes mouse-down to `areaSelect.start(worldX, worldY, modifiers)`. Mouse-move dispatches to whichever gesture is active. Cmd/Ctrl+C and Cmd/Ctrl+V (already wired in CanvasStack) call `clipboard.copy()` / `clipboard.paste()` instead of the old hook. Old `useAreaSelectInteraction` and `useClipboard` imports are dropped from CanvasStack at the migration step.

## Migration order

0. Op rename: `createCreateOp` → `createInsertOp`; `CreateOp` → `InsertOp`.
1. Add `defaultTransient` to `GestureBehavior`; add `transient` to existing hook options as a no-op for non-transient gestures (verifies the wiring without behavior change).
2. Add `AreaSelectAdapter`, `AreaSelectBehavior`, `AreaSelectOverlay`, `ClipboardSnapshot` types.
3. `area-select/selectFromMarquee` behavior + tests.
4. `useAreaSelectInteraction` hook + integration tests.
5. `areaSelectAdapter` (Garden) + tests.
6. Extend `InsertAdapter` with `commitPaste`, `snapshotSelection`, optional `getPasteOffset` + tests.
7. `useClipboard` hook + integration tests (against fake adapter).
8. CanvasStack migration: area-select wired through kit; clipboard wired through kit.
9. Renderer overlay read for area-select marquee; old direct paint deleted.
10. Delete `src/canvas/hooks/useAreaSelectInteraction.ts` and `useClipboard.ts`. Their tests retargeted (clipboard tests move to garden-adapter coverage; area-select tests folded into hook integration tests).
11. Smoke test + flip spec status to "Phase 3 implemented"; update `docs/behavior.md` if user-visible behavior diverged (paste now batches one undo entry; plantings now paste).

## Testing strategy

**Behavior unit tests** (mock `GestureContext`):
- `area-select/selectFromMarquee.test.ts` — empty rect + no shift clears selection; non-empty rect emits `setSelectionOp(hitIds)`; shift merges with existing selection; `defaultTransient: true` is set.

**Hook integration tests** (simulated pointer events, fake adapter records calls):
- `useAreaSelectInteraction.test.ts` — start → move → end calls `applyOps` (not `applyBatch`); cancel produces no ops; overlay updates each move; transient flag bypasses checkpoint.
- `useClipboard.test.ts` — copy with empty selection no-ops; paste with empty clipboard no-ops; paste emits one `applyBatch` with N `InsertOp`s + one `SetSelectionOp`; cascade pastes shift each call by the offset; `getPasteOffset` override is honored.

**Garden integration**:
- `areaSelect.test.ts` — `hitTestArea` round-trips; `applyOps` does not checkpoint (no history entry produced).
- `insert.test.ts` (extended) — `snapshotSelection` filters by id across all three collections; `commitPaste` materializes each kind with new ids; plantings preserve parent-relative coords; no-op when clipboard empty.

**Manual smoke** after CanvasStack migration: marquee select, shift-add to selection, copy/paste a structure, copy/paste a zone, copy/paste a planting (new), repeated paste cascades, undo collapses paste to one step.

**Targets:** ~20-25 new tests. Final count ~580.

## Risks

- **Plantings in paste** — current code drops them. The kit version restores plantings; this is a behavior change worth calling out in `docs/behavior.md`. Verify the existing planting-clipboard tests don't pin the drop behavior.
- **Selection canvas sharing.** Phase 2 left a TODO that area-select would layer on the same selection canvas as insert. Both gestures now publish overlays; confirm they can't both be active simultaneously (CanvasStack's gesture-routing already enforces this).
- **Op rename surface area.** `createCreateOp` is the only doubled-verb in the kit, but it's referenced in tests and the insert hook. Mechanical sed-style rename plus `npm run build` covers it.
- **`ClipboardSnapshot.items: unknown[]`.** The opacity is intentional but loses kit-side type help. Adapter is the bottleneck for type safety; document this in the hook's JSDoc.
- **Repeated paste cascade behavior.** The current useClipboard updates `clipboard.current` to point to the pasted copies after each paste; the kit version does the same so cascades remain user-visible-identical.

## Out of scope

- Cursor-relative paste offsets.
- OS clipboard / serialization across reloads.
- Lasso (non-rectangular) area-select.
- Locked-layer exclusion in marquee hits (slot for future behavior).
- Migrating `gardenStore` history to `createHistory`.
