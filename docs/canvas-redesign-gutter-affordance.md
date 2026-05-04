# ADR: Gutter affordances under the weasel `<Canvas>` migration

**Status:** Accepted, 2026-05-03
**Context doc:** `docs/canvas-redesign.md` (phase plan); supersedes the open question in
`~/.claude/projects/-Users-mike-src-eric/memory/project_gutter_affordance_refactor.md`.

## What gutters are

Seed-starting trays render a strip of "gutter" markers along the top and left
edges of the cell grid (and one corner marker for "all"). During a single-seedling
drag, dropping the ghost on a row gutter fans the dragged cultivar across that
row; the column gutter does the same for a column; the corner fills the whole
tray. They exist so users can promote a one-off sowing into a row/column/full
spread without leaving the drag — a faster path than re-grabbing a palette and
re-sowing each cell. They are pure UI affordances: no model entity, no
selection, no z-order.

## Evaluating the candidates

**(a) Gutters as scene nodes.** Add a `'gutter'` `SceneNode` kind, hit-tested
through the adapter cascade. Conceptually wrong: gutters aren't draggable,
selectable, or persisted; they don't have world-pose-stable identity (they
follow the tray). It would force every adapter consumer to filter them out of
selection, ordering, persistence, and serialization for no gain.

**(b) Gutters via `findSnapTarget`.** Surface gutters from
`MoveAdapter.findSnapTarget` so the kit treats a row/col/all as a snap slot.
The `slotPose` semantics don't model "fan into N cells"; the commit at gesture
end would still need a custom op shape. `findSnapTarget` is also tied to
`useMove` — it can't surface gutters for a future palette-drag-out gesture
where there's no in-scene object being moved. Wrong scope.

**(c) Gutters as a tool-owned screen-space overlay.** The seed-starting
move-tool (and a future "sow tool" for palette drags) owns gutter rendering
via its `Tool.overlay`, owns hit-testing via its `drag.onMove`, and emits the
fan-out ops directly from `drag.onEnd`. The kit stays ignorant; gutters are
just one branch of a tool's gesture state.

## Decision: **(c)**

Gutters are a property of *the seed-starting drag intent*, not the scene.
Modeling them as scene nodes or snap slots forces a generic abstraction
through a single, narrow consumer. A tool already has the right shape: a
`drag.onStart`/`onMove`/`onEnd` lifecycle, gesture-scoped `scratch`, and an
`overlay` `RenderLayer` that re-evaluates each render. Today's bespoke
`hitTestDragSpreadAffordance` + `seedDragCultivarId` UI flag map cleanly onto
that surface. The "duplicates hit-test logic" downside listed in the prompt is
moot: there is no other consumer of gutter hit-testing, and the function is
~25 lines of pure math we already have factored out.

**Caveats.**
- A future palette-to-tray drag (drag a cultivar chip from the sidebar onto a
  gutter) needs the same hit-test. Keep `hitTestDragSpreadAffordance` as a
  free function; let the second tool import it. Do *not* prematurely lift it
  into kit.
- If a third consumer appears, revisit option (a) as "drop-target nodes" —
  but only then.

## Implementation sketch

- **Tool: `useSeedlingMoveTool`** (new, replaces `beginSeedlingDrag` in
  `CanvasStack.tsx`).
  - `initScratch`: anchor seedling, group ids, ghost handle, current preview
    kind (`null | { type: 'cell', ... } | { type: 'spread', scope, index }`).
  - `drag.onStart`: hit-test cell under pointer, decide single vs group, build
    ghost, set hidden seedlings.
  - `drag.onMove`: for single-item drags, call `hitTestDragSpreadAffordance`
    first; on hit, write `seedFillPreview` (scope row/col/all). Else fall
    through to `hitTestCell` and set cell-fill or group move-preview.
  - `drag.onEnd`: branch on scratch preview kind → `fillRow` / `fillColumn` /
    `fillTray` / `moveSeedling` / `moveSeedlingGroup`.
  - `overlay`: `RenderLayer` that, when scratch is active and not a group
    drag, draws the row/col/all markers (today's `drawDragSpreadAffordances`)
    with hover state read from scratch.
- **Renderer changes.** `TrayLayerRenderer` drops `showDragSpreadAffordances`
  / `dragSpreadAffordanceHover` props; that pixel work moves into the tool's
  overlay layer. `seedDragCultivarId` UI-store flag is deleted (now lives in
  scratch).
- **Pure helper kept:** `hitTestDragSpreadAffordance` and
  `DRAG_SPREAD_GUTTER_RATIO` stay in `src/canvas/seedStartingHitTest.ts` — no
  kit dependency, importable by future palette-drop tool.
- **No adapter changes.** `seedStartingSceneAdapter` does not learn about
  gutters; `findSnapTarget` is not used.
