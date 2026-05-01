# Project TODO

Backlog of work that's been considered but not scheduled. Add new items at the bottom of the relevant section.

## Refactors

### Repeatable putative-drag framework

Right now the only drag operation that shows a putative ghost preview is seed-mode shift-fill. That preview is hardcoded:
- Transient `seedFillPreview` on `uiStore` is shape-specific to "{trayId, cultivarId}"
- `renderSeedlings` has a special branch that draws ghost seedlings in empty cells
- `App.handleSeedDragBegin` does its own shift / pointer-move tracking

All other drag operations (palette → garden, structure / zone resize, move, plot, area-select, sow-single-cell) commit on pointerup with no ghost preview, and each lives in its own ad-hoc hook under `src/canvas/hooks/`.

Goal: every drag is computed putatively on each pointer / key change, and renders a ghost of its would-be result while in flight.

Sketch:

1. Define a `Drag<TInput, TPutative>` interface:
   - `read(pointerEvent, modifiers, viewport): TInput`
   - `compute(input): TPutative`  (pure)
   - `renderPreview(ctx, putative, viewport)`
   - `commit(putative)`
2. One transient `dragPreview: { kind, putative } | null` slot on `uiStore`. Replaces ad-hoc `seedFillPreview`, `dragOverlay`, etc.
3. Central drag controller dispatches pointer / key events to the active `Drag` and writes `compute()` result into the slot.
4. Render layers consult the slot and call the matching `renderPreview` for the active kind.
5. Migrate existing drags one at a time. Order of attack:
   - sow-cell + fill-tray (already half-implemented)
   - palette → garden plant-drop
   - move (single + multi)
   - resize
   - plot (rectangle drag)
   - area-select (already shows a marquee, but it's separate)

Watch out for:
- Modifier keys (shift, alt, cmd) need to update the preview without further pointer movement — the existing seed handler already has `keydown`/`keyup` listeners; that pattern generalizes.
- Some drags (move, resize) already mutate the store mid-flight via `commitPatch`-style undo wrapping. Putative compute should NOT mutate; only `commit` should.
- Render performance: most layers redraw on store changes; preview updates fire many times per second. The seedling layer's invalidation already handles this fine, but scaled up to all drags it may need throttling or a dedicated preview canvas.

## canvas-kit / weasel

Backlog for the kit lives at [`docs/canvas-kit/TODO.md`](canvas-kit/TODO.md) so it travels with the kit when it splits out into the `@orochi235/weasel` repo. Add kit-specific items there, not here.
