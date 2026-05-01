# canvas-kit Sibling Z-Order Design

**Status:** Draft.
**Date:** 2026-05-01
**Authors:** Mike

## Goal

Give canvas-kit a first-class notion of **sibling z-order** so consumers can
express "bring to front", "send to back", and friends without bolting a
per-object `zIndex` field onto every domain model. Today, render order is
implicit in whatever array the consumer happens to pass to a render layer, and
hit-testing has no top-down convention — so layered editing UX (foreground vs
background, raise/lower) falls back on each consumer to invent.

The kit picks the same approach DOM, SVG, and most scene graphs already use:
**array order is z-order**. The adapter exposes the ordered child list; reorder
ops splice the array; convention pins down which end of the array is "on top".

## Why array order, not `zIndex`

- **Matches the substrate.** DOM/SVG render in document order; canvas-kit
  already assumes consumers iterate an array per layer.
- **Composable with groups.** A virtual group already owns `members: string[]`.
  Group member ordering and root-level sibling ordering are the same problem
  with the same answer — one adapter contract serves both.
- **No reflow on reorder.** Splicing one array beats updating N `zIndex`
  fields and re-sorting on render.
- **Cheap to skip.** Consumers who don't care about z-order leave the new
  optional adapter methods undefined and the reorder ops are a no-op.

## Approach

Two new **optional** methods on the adapter:

```ts
interface OrderedAdapter {
  /** Ordered children of `parentId` (or root siblings if null), in z-order:
   *  index 0 is the bottom, last index is the top. */
  getChildren(parentId: string | null): string[];

  /** Rewrite the order of `parentId`'s children. Length and contents must
   *  match the existing children — reorder only, no add/remove. */
  setChildOrder(parentId: string | null, ids: string[]): void;
}
```

Both are **optional**. Reorder ops and the `useReorderAction` hook **gracefully
no-op** when `getChildren`/`setChildOrder` are absent (op `apply` checks the
adapter shape and returns; the hook's methods become no-ops). Rationale: the
kit already follows this pattern for `findSnapTarget` and `getSelection?` —
optionality lets a consumer adopt z-order without touching their adapter, and
the no-op default mirrors how move's snap target works without
`findSnapTarget`. (Alternative considered: refuse to construct the hook when
the methods are missing. Rejected — too noisy for consumers who add the hook
to a generic toolbar that may or may not have a z-order-aware scene.)

Group ordering rides on the same contract once groups want it. When `parentId`
is a group id, the group adapter routes `getChildren`/`setChildOrder` to the
group's `members[]` array. No new group methods.

## Reorder ops

Five op factories in `src/canvas-kit/ops/reorder.ts`. Each captures the
**before/after** order for the affected parent(s) so undo is exact.

| Factory | Behavior |
|---|---|
| `createBringForwardOp({ ids })` | Each id moves up one slot among its siblings. |
| `createSendBackwardOp({ ids })` | Each id moves down one slot among its siblings. |
| `createBringToFrontOp({ ids })` | Each id moves to the end (top) of its sibling list. |
| `createSendToBackOp({ ids })` | Each id moves to the start (bottom) of its sibling list. |
| `createMoveToIndexOp({ ids, parentId, index })` | Explicit reposition: ids land contiguously starting at `index` under `parentId`. |

### Multi-id semantics

- Multi-id ops **preserve relative order** of the moved ids. Bringing 3
  selected items forward keeps them in their original relative order, just
  nudged up.
- **Cross-parent selections process per-parent.** The op groups ids by their
  current parent (via `getParentOf`), then runs the reorder algorithm
  independently within each parent's child list. Siblings under different
  parents do not interact.
- **`bringForward` / `sendBackward` collapse no-ops at the boundary.** If
  the topmost moved id is already last, it stays put; the others below it
  still bubble up one slot each. Same logic mirrored at the bottom.
- **`bringToFront` / `sendToBack` are stable.** Moved ids land contiguously at
  the end (front) or start (back), preserving their original relative order.
- **`moveToIndex`** is the only op that takes a target `parentId`. It does
  **not** reparent — if any id's current parent differs from `parentId`, that
  id is skipped silently (use `createReparentOp` first). It only reorders.

### Invert

Each op records, in its closure, a snapshot of `getChildren(parent)` for every
parent it touches **before** applying. Its inverse is a single
`createMoveToIndexOp`-style op (or a small bundle of them, one per parent)
that calls `setChildOrder(parent, snapshot)`. This is the same shape as
`createTransformOp`'s before/after pose — the op holds both ends of the edit.

### Op shape

```ts
interface ReorderAdapter {
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
  /** Where each id currently sits in the tree. Reorder ops need this to
   *  partition multi-parent selections. Already part of SceneAdapter. */
  getParent(id: string): string | null;
}

function createBringForwardOp(args: { ids: string[]; label?: string }): Op
function createSendBackwardOp(args: { ids: string[]; label?: string }): Op
function createBringToFrontOp(args: { ids: string[]; label?: string }): Op
function createSendToBackOp(args: { ids: string[]; label?: string }): Op
function createMoveToIndexOp(args: {
  ids: string[];
  parentId: string | null;
  index: number;
  label?: string;
}): Op
```

`apply(adapter)` casts to `ReorderAdapter`. If `getChildren` is missing,
`apply` returns immediately (no-op) and `invert()` returns an op that also
no-ops — undo of a no-op is a no-op.

## Hit-testing convention

**Top-most wins.** Hit-test should iterate `getChildren(parentId)` in
**reverse** (last → first) so the topmost visible object answers first. Render
layers iterate **forward** (first → last) so the bottom paints first and the
top paints over it.

The kit doesn't enforce these — adapters that don't expose `getChildren` keep
working with whatever order their `hitTest` returns. But every kit utility that
calls `getChildren` (area-select, the future `renderChildrenLayer` factory)
follows the convention. Documented in `concepts.md` and `adapters.md` so
adapter authors get it right the first time.

## `useReorderAction` hook

Mirrors `useDeleteAction`. Imperative methods plus optional keyboard binding.

```ts
interface ReorderAdapter {
  getSelection(): string[];
  getParent(id: string): string | null;
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
  applyBatch(ops: Op[], label: string): void;
}

interface UseReorderActionOptions {
  /** Auto-bind ], [, Shift+], Shift+[ on document. Default true. */
  enableKeyboard?: boolean;
  /** Optional filter — given selected ids, return the subset to actually
   *  reorder. Used by consumers to protect locked layers. */
  filter?: (ids: string[]) => string[];
}

interface UseReorderActionReturn {
  bringForward(): void;
  sendBackward(): void;
  bringToFront(): void;
  sendToBack(): void;
}

function useReorderAction(
  adapter: ReorderAdapter,
  options?: UseReorderActionOptions,
): UseReorderActionReturn;
```

### Keybindings

| Key | Method |
|---|---|
| `]` | `bringForward()` |
| `[` | `sendBackward()` |
| `Shift+]` | `bringToFront()` |
| `Shift+[` | `sendToBack()` |

No Cmd/Ctrl modifiers — keeps browser shortcuts free, and these don't conflict
with text editing because the hook applies the same `isEditableTarget` guard
as `useDeleteAction` (skip when focus is in `<input>`, `<textarea>`, or
contenteditable).

When `getChildren`/`setChildOrder` are absent on the adapter, every method is
a silent no-op so the hook stays safe to instantiate unconditionally.

## Edge cases

- **`getChildren(parent)` returns a list missing some requested ids.** Skip
  them silently. The adapter is the source of truth — if it says an id isn't a
  sibling under that parent, the kit doesn't argue.
- **Single-id selection that is a group with empty `members[]`.** Still
  reorder the group itself among its peer siblings; the group's emptiness is
  irrelevant to its position in its parent's child list.
- **Reorder request when only one id selected and it's already top/bottom.**
  No-op for `bringForward`/`bringToFront` (top) or `sendBackward`/`sendToBack`
  (bottom). The op still emits an entry; its before/after snapshots are equal,
  apply is a no-op, undo is a no-op. (Alternative: skip the op entirely. We
  emit it anyway so the user-visible undo stack always advances when an action
  is invoked — predictable feedback.)
- **Selection spans multiple parents.** Each parent processes independently
  (see Multi-id semantics).
- **Locked / undeletable items.** Out of scope for the kit. Consumers filter
  via `options.filter` like `useDeleteAction`.

## Render layer integration (follow-up)

`getChildren` makes a `renderChildrenLayer({ adapter, parentId, drawObject })`
factory natural — iterate `adapter.getChildren(parentId)` forward, draw each.
Ship as a follow-up after the spec lands; not required for the initial cut.
The current per-layer renderers (structures, zones, plantings) keep working
unchanged because consumers can choose to feed them
`adapter.getChildren(null)` themselves.

## Out of scope

- **Drag-to-reorder UX.** `createMoveToIndexOp` enables it but the kit does
  not ship a built-in gesture or list-style sidebar.
- **Cross-parent reorder via reparent.** Already a separate concept
  (`createReparentOp`). `moveToIndex` does not reparent.
- **Z-axis transforms / 3D / depth fading.** Sibling z-order is array-only.
- **Per-object `zIndex`.** Explicitly rejected; see "Why array order".
- **Locked-layer protection.** Consumer-side filter.

## Migration risks

- **Consumers who already render in a custom order.** None today — render
  layers in this repo iterate the order the adapter passes. The kit does not
  retroactively change render order; consumers opt in by adopting
  `getChildren`.
- **Group adapter migration.** Existing `GroupAdapter` does not declare
  `getChildren`/`setChildOrder`. Adding these is additive (optional
  members of `OrderedAdapter`); existing group consumers keep compiling.
- **Hit-testing convention is documentation-only.** Adapters that already
  return bottom-most-first from `hitTest` will appear "wrong" to a user
  expecting top-down behavior. Call out in `concepts.md` and the consumer
  adapter guide; existing adapters can keep their current behavior until
  they choose to flip.

## Testing strategy

**Op unit tests** (`reorder.test.ts`): each factory's apply against a fake
adapter; multi-id stable-relative-order; cross-parent partitioning;
top/bottom boundary no-ops; invert round-trips; missing-id silently skipped;
no-op when `getChildren` is absent.

**Group integration**: reorder ops applied with a group id as
`getParent(id)` route through the group adapter's `members[]`. A
`bringForward(['memberA'])` inside a group bubbles `memberA` up one slot in
`members`.

**Hook integration** (`useReorderAction.test.ts`): each method dispatches a
single `applyBatch` with the right op + label; multi-id calls preserve
relative order; multi-parent selection produces one batch with multiple ops
(one per parent); keyboard binding fires the right method; `Shift` toggles
between `Forward`/`ToFront`; `isEditableTarget` guard suppresses the
binding; filter option subsets the reorder set.

**Targets:** ~25 new tests.

## Naming consistency

Op factory verbs (`createBringForwardOp`, etc.) match the hook method names
(`bringForward`, etc.) exactly so the spec, op factory, and hook all read the
same way. The adapter contract uses `getChildren` / `setChildOrder` —
"children" because the contract subsumes both leaf siblings (parent is a
real container) and group members (parent is a group id).
