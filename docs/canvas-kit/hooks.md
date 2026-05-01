# Interaction hooks

Reference for every public hook. For full demos, see
`src/canvas-kit-demo/demos/` and the demo page at `/garden/canvas-kit-demo.html`.

All gesture hooks follow the same shape: `start` / `move` / `end` / `cancel`
plus an `overlay` value the consumer renders. Modifier flags must be passed
on every `move` call (the hook does not subscribe to keyboard events itself).

## `useMoveInteraction`

Drag one or more objects. See `src/canvas-kit/interactions/move/move.ts`.

**Adapter:** `MoveAdapter<TObject, TPose>` — `getObject`, `getPose`,
`getParent`, `setPose`, `setParent`, `applyBatch`, optional `findSnapTarget`.

**Options:**
- `translatePose(pose, dx, dy)` — required; applies world-space delta.
- `behaviors?: MoveBehavior<TPose>[]` — e.g. `snap(...)`, `snapToContainer(...)`.
- `dragThresholdPx?` — default 4.
- `moveLabel?` — history label, default `'Move'`.
- `onGestureStart(ids)` / `onGestureEnd(committed)`.

**Returns:** `start({ ids, worldX, worldY, clientX, clientY })`,
`move({ worldX, worldY, clientX, clientY, modifiers })`, `end()`, `cancel()`,
`isActive()`, `overlay: MoveOverlay<TPose> | null`.

```ts
const move = useMoveInteraction<Rect, Pose>(adapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [snap(gridSnapStrategy<Pose>(20))],
});
```

Behaviors run only against the primary id (`ids[0]`); secondary selected ids
share the same delta. Default ops: one `createTransformOp` per dragged id.

## `useResizeInteraction`

Resize a single object from a corner/edge anchor. See
`src/canvas-kit/interactions/resize/resize.ts`.

**Adapter:** `ResizeAdapter<TObject, TPose>` where `TPose extends { x, y, width, height }`.

**Options:** `behaviors?`, `resizeLabel?` (default `'Resize'`),
`onGestureStart(id)` / `onGestureEnd(committed)`.

**Returns:** `start(id, anchor, worldX, worldY)` where `anchor` is
`{ x: 'min' | 'max' | 'free', y: 'min' | 'max' | 'free' }`,
`move(worldX, worldY, modifiers)`, `end()`, `cancel()`, `isResizing`,
`overlay: ResizeOverlay<TPose> | null`.

```ts
const resize = useResizeInteraction<Rect, Pose>(adapter, {
  behaviors: [snapToGrid({ cell: 20 }), clampMinSize({ minWidth: 20, minHeight: 20 })],
});
resize.start(id, { x: 'min', y: 'min' }, wx, wy);
```

The overlay carries both `targetPose` (snapped/clamped destination) and
`currentPose` (lerped position used for smooth render). Render the
`currentPose`; commit ops use the `targetPose`.

## `useInsertInteraction`

Drag-rectangle to create a new object. See
`src/canvas-kit/interactions/insert/insert.ts`.

**Adapter:** `InsertAdapter<TObject>` — `commitInsert(bounds)` produces the
new object (or `null` to abort), plus `insertObject`, `setSelection`,
`applyBatch`, and the clipboard methods used by `useClipboard`.

**Options:** `behaviors?`, `insertLabel?` (default `'Insert'`),
`minBounds?: { width, height }` (default `{ 0, 0 }`; bounds must be strictly
greater).

**Returns:** `start(worldX, worldY, modifiers)`, `move(worldX, worldY, modifiers)`,
`end()`, `cancel()`, `isInserting`, `overlay: InsertOverlay<TPose> | null`.

The hook normalizes `start` and `current` into a positive-width rect at
`end()`, calls `adapter.commitInsert(bounds)`, then commits the resulting
object via `createInsertOp`.

## `useAreaSelectInteraction`

Marquee selection. See `src/canvas-kit/interactions/area-select/areaSelect.ts`.

**Adapter:** `AreaSelectAdapter` — `hitTestArea(rect)`, `getSelection()`,
`setSelection(ids)`, `applyOps(ops)`. (Adapters that also expose `applyBatch`
allow non-transient mode.)

**Options:** `behaviors?` (typically `[selectFromMarquee()]`), `transient?`
(overrides behavior `defaultTransient`), `label?` (default `'Area select'`).

**Returns:** `start(worldX, worldY, modifiers)`, `move`, `end`, `cancel`,
`isAreaSelecting`, `overlay: AreaSelectOverlay | null`.

Default behavior `selectFromMarquee()` honors the shift-state captured at
gesture **start** (so releasing shift mid-drag doesn't change semantics),
producing a `createSetSelectionOp`. Because `defaultTransient: true`, the
result applies via `applyOps` and is excluded from undo.

## `useCloneInteraction`

Modifier-gated clone of a selection (e.g. alt-drag). See
`src/canvas-kit/interactions/clone/clone.ts`.

**Adapter:** `InsertAdapter<TObject>` (same as insert/clipboard).

**Options:**
- `behaviors: CloneBehavior[]` — first behavior whose `activates(mods)` returns
  true wins. The kit ships `cloneByAltDrag()`.
- `setOverlay(layer, objects)` / `clearOverlay()` — the hook's overlay is
  push-based: it calls these so the consumer renders the ghost copy on the
  appropriate layer (`'structures' | 'zones' | 'plantings'`).

**Returns:** `start(worldX, worldY, ids, layer, mods)`, `move`, `end`,
`cancel`, `isCloning`.

The behavior's `onEnd(pose, { adapter })` returns ops; the kit applies them
via `adapter.applyBatch(ops, 'Clone')`.

## `useClipboard`

Selection copy/paste backed by `InsertAdapter.snapshotSelection` /
`commitPaste`. See `src/canvas-kit/interactions/clipboard/clipboard.ts`.

**Options:** `getSelection()`, `onPaste?(newIds)`, `pasteLabel?` (default `'Paste'`).

**Returns:** `copy()`, `paste()`, `isEmpty()`.

Paste flow: read clipboard → ask adapter for offset (`getPasteOffset?`,
default `{0,0}`) → `commitPaste` → wrap each new object in `createInsertOp`,
append `createSetSelectionOp(from → newIds)` → `applyBatch`. After paste, the
hook re-snapshots the new ids so successive pastes cascade.

## `usePanInteraction`

Drag-to-pan a viewport. Lower-level than the gesture hooks above — works on
React mouse events directly. See `src/canvas-kit/hooks/usePanInteraction.ts`.

```ts
const pan = usePanInteraction(() => ({ x: panX, y: panY, setPan }));
// onMouseDown → pan.start(e); onMouseMove → pan.move(e); onMouseUp → pan.end()
```

`getActive` is read at start, so the right viewport is captured even when
multiple panes share the same handlers.

## `useDropZone` / `useDragHandle`

DOM-level pointer drag with a floating ghost element and global drop-zone
registry. See `src/canvas-kit/pointerDrag.ts`. Used for cross-surface drags
(e.g. dragging from a tray panel into the canvas).

```ts
const handle = useDragHandle(() => ({ kind: 'seedling', ids: [id] }));
return <div {...handle} onPointerDown={handle.onPointerDown}>...</div>;
```

```ts
const dropRef = useDropZone<HTMLDivElement>({
  accepts: (kind) => kind === 'seedling',
  onDrop: (payload, x, y) => { /* apply */ },
  onOver: (active) => setHover(active),
});
return <div ref={dropRef}>...</div>;
```

Threshold is fixed at 5px (squared = 25). Drag is canceled if the source
unmounts. Click events are swallowed for one tick after a drag, so click
handlers on the source don't fire spuriously.
