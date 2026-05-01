# canvas-kit Clone Design (Phase 4)

**Status:** Phase 4 implemented.
**Date:** 2026-05-01
**Authors:** Mike

## Goal

Port the alt-drag clone gesture from `src/canvas/hooks/useCloneInteraction.ts`
to canvas-kit. Reuse the existing `InsertAdapter` (already has
`snapshotSelection` and `commitPaste`). Fix a current wart along the way:
structure/zone clones currently produce two undo entries (eager add + move);
the kit version produces one batch like paste.

## Non-goals

- Snap-dwell for plantings (the 500 ms hover-into-container UX). Deferred to a
  later phase as an optional `snapToContainer` behavior.
- Drag-from-sidebar palette. The current code path is dead (no sidebar
  drag-and-drop is wired); will design separately if/when added.
- Cloning the entire selection. Legacy clones just the alt-clicked object
  (after first reselecting it). Kit version preserves that — the caller
  decides which ids to pass.

## Architecture

The clone hook is a near-twin of `useMoveInteraction`: same drag-with-pose-delta
gesture pipeline, same per-layer overlay channel in `uiStore.dragOverlay`. Two
differences:

1. **Source visibility.** Move sets `hideIds: [sourceId]`. Clone sets
   `hideIds: []` so the original stays visible alongside the ghost.
2. **Commit op type.** Move emits update ops on existing ids. Clone emits
   `InsertOp`s for new objects + a `SetSelectionOp` retargeting selection
   to the new ids — exactly the shape the clipboard `paste` produces.

Because the commit shape matches paste, the clone hook reuses `InsertAdapter`
end-to-end: `snapshotSelection(ids)` at gesture start, `commitPaste(snapshot,
offset, ctx)` at end. No new adapter methods.

The one signature change: `commitPaste` gains an optional third arg
`ctx?: { dropPoint?: { worldX, worldY } }`. Clipboard paste leaves it
undefined (current behavior). Clone passes the cursor world coords. The Garden
adapter uses `dropPoint` to reassign planting parents to whatever container
the cursor lands over (without a container, the planting falls back to its
original parent — silent drop matches legacy).

## File layout

```
src/canvas-kit/
├── adapters/
│   └── types.ts                                (modify: extend commitPaste sig)
├── interactions/
│   └── clone/
│       ├── clone.ts                            (new: useCloneInteraction)
│       ├── clone.test.ts                       (new)
│       ├── index.ts                            (new: barrel)
│       └── behaviors/
│           ├── cloneByAltDrag.ts               (new: default behavior)
│           ├── cloneByAltDrag.test.ts          (new)
│           └── index.ts                        (new: barrel)
├── clone.ts                                    (new: subpath proxy)
└── index.ts                                    (modify: add exports)

src/canvas/
├── adapters/
│   ├── insert.ts                               (modify: dropPoint in commitPaste)
│   └── insert.test.ts                          (modify: tests for dropPoint)
├── CanvasStack.tsx                             (modify: wire kit clone)
└── hooks/
    ├── useCloneInteraction.ts                  (delete)
    └── useCloneInteraction.test.ts             (delete)
```

## Hook contract

```ts
interface ClonePose {
  /** ids being cloned (snapshot taken at start) */
  ids: string[];
  /** drag offset in world units relative to gesture-start cursor */
  offset: { dx: number; dy: number };
  /** current cursor world coords */
  worldX: number;
  worldY: number;
}

interface CloneBehavior extends GestureBehavior<ClonePose, ClonePose, void> {
  /** Default true: clone gestures DO produce history entries. */
  defaultTransient?: false;
  /** When this behavior is active, the matching layer overlay should not hide source ids. */
  readonly hidesSource?: false;
}

function useCloneInteraction(
  adapter: InsertAdapter<unknown>,
  options: {
    behaviors: CloneBehavior[];
    /** Per-layer overlay setter (caller writes overlay state into uiStore.dragOverlay). */
    setOverlay: (layer: 'structures' | 'zones' | 'plantings', objects: unknown[]) => void;
    clearOverlay: () => void;
  },
): {
  start(worldX: number, worldY: number, ids: string[], layer: 'structures' | 'zones' | 'plantings', mods: Modifiers): void;
  move(worldX: number, worldY: number, mods: Modifiers): boolean;
  end(): void;
  cancel(): void;
  isCloning: boolean;
};
```

The hook owns the gesture state machine (start / move / end / cancel) and
the per-frame snapshot-translation math. The behavior gates activation
(`activates(mods)` checks `mods.alt`) and produces the commit ops on `end`.

## cloneByAltDrag behavior

```ts
function cloneByAltDrag(): CloneBehavior {
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
      return [
        ...created.map((o) => createInsertOp({ object: o })),
        createSetSelectionOp({ from: ctx.adapter.getSelection?.() ?? [], to: newIds }),
      ];
    },
  };
}
```

The hook routes the returned ops through `adapter.applyBatch(ops, 'Clone')` —
single history entry. Same shape as paste.

## Garden insert adapter changes

`commitPaste` signature widens:

```ts
commitPaste(
  clipboard: ClipboardSnapshot,
  offset: { dx: number; dy: number },
  ctx?: { dropPoint?: { worldX: number; worldY: number } },
): GardenObj[]
```

Behavior matrix:

| item       | ctx.dropPoint absent              | ctx.dropPoint present                                          |
| ---------- | --------------------------------- | -------------------------------------------------------------- |
| structure  | x + dx, y + dy (current)          | same — dropPoint ignored for structures (offset is the truth)  |
| zone       | x + dx, y + dy (current)          | same                                                           |
| planting   | parentId kept; x + dx, y + dy     | resolve container at dropPoint; if found, parentId = container.id, x = dropPoint.worldX - container.x, y = dropPoint.worldY - container.y; if not found, drop is silent (return empty for that item) |

This preserves clipboard paste's current planting behavior (no dropPoint passed
→ keep original parent, apply offset to local coords). Adds a clone-specific
path (dropPoint passed → container resolution at drop site).

## Overlay channel

Reuses the existing per-layer `uiStore.dragOverlay` (same channel as move). The
clone hook publishes `{ layer, objects: clonedPoses, hideIds: [], snapped: false }`
each frame. Since `hideIds: []`, the renderer leaves the originals visible —
the ghost paints on top of (or next to) them.

## Mouse routing in CanvasStack

Replace the current mouse-down branch (lines 944–987) with:

```ts
if (e.altKey && hit) {
  select(hit.id);
  clone.start(worldX, worldY, [hit.id], hit.layer, modifiers);
  setActiveCursor('copy');
  return;
}
```

Drop the eager `addStructure`/`addZone` calls. The kit clone hook produces the
new objects only on drop, in a single batch — fixing the two-undo-step wart
for free.

`handleMouseMove` calls `clone.move(worldX, worldY, modifiers)` in the same
kit-hook block alongside `move`, `resize`, `insert`, `areaSelect`.
`handleMouseUp` calls `clone.end()` if `clone.isCloning`. Escape calls
`clone.cancel()`.

## History semantics

One clone gesture → one history entry containing N InsertOps + 1 SetSelectionOp.
The selection-in-history mechanism (Phase 3 follow-up) means undo restores both
the previous garden state AND the previous selection — so undoing a clone removes
the new objects and reselects whatever was selected before the clone started.

## Testing

- **`cloneByAltDrag.test.ts`**: activates only on alt; end produces correct
  ops via mock adapter; from/to selection routing.
- **`clone.test.ts`**: full hook lifecycle (start → move → end produces a
  batch with InsertOps + SetSelectionOp, hideIds stays empty); cancel
  clears overlay; mods.alt absent → no activation.
- **`insert.test.ts`** (Garden adapter): commitPaste with dropPoint over a
  container reassigns planting parent; commitPaste without dropPoint keeps
  original parent (current behavior preserved); commitPaste with dropPoint
  outside any container drops the planting silently.
- **CanvasStack integration**: existing tests stay; legacy
  useCloneInteraction.test.ts deletes with the file.

## Migration risks

- The legacy structure/zone alt-drag eagerly adds and produces 2 history
  entries. Anyone relying on that behavior (unlikely — it's a wart) will see
  one undo step now. Behavior-doc note covers it.
- Container resolution at drop time uses a simple bounds check (legacy
  `containers` filter). No dwell, no putative-snap visual. Users who rely on
  the dwell visual will notice — call out in behavior docs and the smoke
  checklist.

## Out of scope (follow-up phases)

- `snapToContainer` behavior (planting dwell + putative-snap visual)
- `selectionClone` variant (alt-drag clones the entire selection rather than
  just the hit object)
- Sidebar palette drag-and-drop integration
