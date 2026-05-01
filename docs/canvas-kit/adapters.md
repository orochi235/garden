# Adapters

An adapter is the bridge between canvas-kit and your domain. The kit reads
poses, hit-tests, and commits ops through this interface; the adapter
translates those calls into your scene-graph mutations.

All adapter types are defined in `src/canvas-kit/adapters/types.ts`. The full
`SceneAdapter` is the union; per-hook narrow interfaces (`MoveAdapter`,
`ResizeAdapter`, `InsertAdapter`, `AreaSelectAdapter`) are subsets. A single
broad adapter satisfies all narrow interfaces structurally.

## `SnapTarget<TPose>`

```ts
interface SnapTarget<TPose> {
  parentId: string;
  slotPose: TPose;     // world-space pose to snap to
  metadata?: unknown;  // app-specific (slot index, hint, …)
}
```

Returned by `MoveAdapter.findSnapTarget` (optional) and by snap-aware
behaviors. The kit treats `metadata` as opaque; renderers consume it.

## `SceneAdapter<TObject, TPose>`

The maximal adapter. Implement what you need; types ensure unused pieces
don't get called.

| Method | Purpose |
|---|---|
| `getObjects()` | All objects in iteration order. |
| `getObject(id)` | Lookup by id. |
| `getSelection()` | Current selected ids. |
| `hitTest(wx, wy)` | Top-most object id at world point, or null. |
| `getPose(id)` | World pose of object. |
| `getParent(id)` | Parent id or null. |
| `setPose(id, pose)` | Mutate pose; called by `createTransformOp.apply`. |
| `setParent(id, parentId)` | Reparent; called by `createReparentOp.apply`. |
| `insertObject(object)` | Insert; called by `createInsertOp.apply`. |
| `removeObject(id)` | Delete; called by `createDeleteOp.apply`. |
| `setSelection(ids)` | Set selection; called by `createSetSelectionOp.apply`. |
| `applyBatch(ops, label)` | Gesture commit — apply each op against `this` adapter and push a history entry. |

## `MoveAdapter<TObject, TPose>`

Subset for `useMoveInteraction`: `getObject`, `getPose`, `getParent`,
`setPose`, `setParent`, `applyBatch`, plus optional
`findSnapTarget(draggedId, worldX, worldY): SnapTarget<TPose> | null`.

## `ResizeAdapter<TObject, TPose extends { x, y, width, height }>`

`getObject`, `getPose`, `setPose`, `applyBatch`. No reparenting, no snap
lookup. The pose constraint is inlined to avoid a circular import with
interactions/types.

## `InsertAdapter<TObject>`

Used by `useInsertInteraction`, `useClipboard`, and `useCloneInteraction`.

| Method | Purpose |
|---|---|
| `commitInsert(bounds)` | Drag-rect insert: returns one new object or null. |
| `commitPaste(clipboard, offset, ctx?)` | Paste/clone: returns array of new objects (possibly empty). `ctx.dropPoint` carries the world drop position for clone. |
| `snapshotSelection(ids)` | Build a `ClipboardSnapshot` for paste/clone. |
| `getPasteOffset?(clipboard)` | Optional: per-paste offset. Default `{0,0}`. |
| `insertObject(object)` | Mutator wired by `createInsertOp`. |
| `setSelection(ids)` | Mutator wired by `createSetSelectionOp`. |
| `applyBatch(ops, label)` | Gesture commit. |
| `getSelection?()` | Optional; needed by clone behaviors. |

`ClipboardSnapshot.items` is `unknown[]` — the adapter owns the shape on both
sides (snapshot and paste). The kit never inspects entries.

## `AreaSelectAdapter`

`hitTestArea(rect)`, `getSelection()`, `setSelection(ids)`, `applyOps(ops)`.
Note `applyOps` (no label, no history) — area-select is transient by default.
If the same adapter object also implements `applyBatch`, the hook can switch
to non-transient via `options.transient = false`.

## Minimal in-memory adapter

```ts
interface Rect { id: string; x: number; y: number; width: number; height: number }
interface Pose { x: number; y: number; width: number; height: number }

function makeAdapter(rectsRef: React.MutableRefObject<Rect[]>, setRects: SetState<Rect[]>) {
  const adapter: MoveAdapter<Rect, Pose> & ResizeAdapter<Rect, Pose> = {
    getObject: (id) => rectsRef.current.find((r) => r.id === id),
    getPose: (id) => {
      const r = rectsRef.current.find((x) => x.id === id)!;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    getParent: () => null,
    setPose: (id, pose) =>
      setRects((rs) => rs.map((r) => (r.id === id ? { ...r, ...pose } : r))),
    setParent: () => {},
    applyBatch: (ops) => { for (const op of ops) op.apply(adapter); },
  };
  return adapter;
}
```

Adapted from `src/canvas-kit-demo/demos/MoveDemo.tsx`. A non-trivial adapter
adds a real history entry inside `applyBatch` (e.g. `pushHistory(garden,
selection)` before mutating). For an op-based history, use
`createHistory(adapter)` and route `applyBatch` through it; for snapshot
history (this repo's pattern), capture state, apply ops in place, and push.
