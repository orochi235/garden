# Extending canvas-kit

## Writing a new behavior

A behavior is a `GestureBehavior<TPose, TProposed, TMoveResult>` plugged into
a hook's `options.behaviors` array. Each hook pins the proposed/move-result
shape; pick the matching alias (`MoveBehavior<TPose>`,
`ResizeBehavior<TPose>`, `InsertBehavior<TPose>`, `AreaSelectBehavior`,
`CloneBehavior`).

The shape:

```ts
interface GestureBehavior<TPose, TProposed, TMoveResult> {
  defaultTransient?: boolean;
  onStart?(ctx: GestureContext<TPose>): void;
  onMove?(ctx: GestureContext<TPose>, proposed: TProposed): TMoveResult | void;
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | void;
}
```

**Rules of thumb:**

- `onMove` is the primary lever. Return a partial `TMoveResult` (e.g.
  `{ pose: snapped }`) to refine the proposed pose; return `void` to leave it
  alone. Behaviors run in array order — later behaviors see your refinement.
- `onEnd` decides commit ops. First non-`undefined` return wins. Return `Op[]`
  to commit your ops, `null` to abort the gesture, or `undefined` to fall
  through to the next behavior (or the hook's default ops).
- Use **`ctx.scratch`** for state that must persist across move events but die
  at gesture end (timers, latched targets). Namespace by behavior id so two
  behaviors don't clobber each other:
  `ctx.scratch['snapToContainer']`. The map is wiped on every `start`.
- Set `defaultTransient: true` if your behavior produces selection-only ops
  (no domain mutation worth undoing). The hook commits via `applyOps` when
  `options.transient` isn't explicitly set.

**Reference implementations:**

- `src/canvas-kit/interactions/move/behaviors/snapToGrid.ts` — pure pose refinement.
- `src/canvas-kit/interactions/move/behaviors/snapToContainer.ts` — scratch state, dwell timer, custom `onEnd` ops.
- `src/canvas-kit/interactions/area-select/behaviors/selectFromMarquee.ts` — `defaultTransient`, `onEnd`-only.
- `src/canvas-kit/interactions/resize/behaviors/clampMinSize.ts` — width/height clamp.
- `src/canvas-kit/interactions/clone/behaviors/cloneByAltDrag.ts` — modifier activation + paste flow.

## Writing a new interaction hook

Most needs are met by adding a behavior to an existing hook. Write a new hook
when the gesture shape doesn't fit (different proposed-pose pipeline,
different overlay, different commit timing).

The shared structure across `move`/`resize`/`insert`/`area-select`:

1. **State machine.** Hold a `useRef` with `phase: 'idle' | 'pending' | 'active'`
   (or just `active: boolean` for hooks without a threshold). Snapshot
   `origin` poses on `start`. Move flips to `active` once past
   `dragThresholdPx` (move-style) or immediately on `start` (others).
2. **GestureContext.** Build it on `start`: `draggedIds`, `origin`, `current`,
   `snap`, `modifiers`, `pointer`, `adapter`, empty `scratch`. Update
   `modifiers` and `pointer` on every `move`.
3. **Behavior chaining.** On `start`, call each `behavior.onStart?.(ctx)`. On
   `move`, compute the proposed pose from raw delta, then fold each
   `behavior.onMove?.(ctx, proposed)` result into the running `proposed`.
4. **Overlay state.** `useState` an overlay object; `setOverlay` after each
   `move`. Keep its shape minimal — the renderer reads it every frame.
5. **Commit at end.** Walk behaviors looking for `onEnd` returns:
   - `null` → cancel.
   - `Op[]` → commit those.
   - all `undefined` → fall back to the hook's default ops (e.g. one
     `createTransformOp` per dragged id).
6. **Transient resolution.** `transient = options.transient ?? behaviors.some(b => b.defaultTransient)`.
   If transient, call `adapter.applyOps(ops)`; otherwise
   `adapter.applyBatch(ops, label)`.
7. **Cleanup.** Reset state, clear overlay, fire `onGestureEnd(committed)`.

`useMoveInteraction` (in `src/canvas-kit/interactions/move/move.ts`) is the
fullest reference — pending/active threshold, multi-id drag, behavior chain,
default ops fallback. `useAreaSelectInteraction` is the simplest example of
the transient path. `useCloneInteraction` shows a hook that opts out of the
behavior-chain shape entirely (a single behavior runs at end) when the
gesture doesn't fit the proposed-pose model.

Once your hook works, expose it from `src/canvas-kit/index.ts` and add a
short entry to [hooks.md](./hooks.md).
