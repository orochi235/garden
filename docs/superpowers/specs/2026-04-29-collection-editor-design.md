# Collection Editor — Design

## Overview

A per-garden **collection** narrows the working set of cultivars used by every cultivar-facing palette in the app (garden palette, seed-starting palette, etc.). The collection is composed via a modal **Collection Editor**: left pane is the full flora database, right pane is the garden's collection, with cultivars transferred between sides via drag-and-drop, checkbox multiselect, and `<` / `>` buttons.

A new garden has an **empty** collection — palettes are empty until the user adds cultivars. Existing plantings that reference removed cultivars continue to render (the underlying flora database is the source of truth for resolution); the collection only filters what new things the user can place.

## Goals

- Reduce palette noise by letting the user pick the cultivars relevant to a garden.
- Keep the data model simple and forward-compatible with eventual user-defined cultivars.
- Match the app's existing direct-manipulation feel where it doesn't conflict with the modal's "transactional" framing.

## Non-Goals

- Editing the underlying flora database (no user-defined cultivars or species in this scope).
- Per-cultivar overrides inside the collection (no in-collection color/spacing edits).
- Import/export, presets, or starter collections.
- Search across non-name fields (zones, seasons, days-to-germinate, etc.).
- Live canvas preview while the editor is open.
- Putting collection edits on the canvas undo stack.
- Promoting the editor to a full app mode (modal only, for now).

## Terminology

- **Flora database** — the static `cultivars.json` + `species.json` data shipped with the app. Source of truth for cultivar definitions.
- **Collection** — a per-garden snapshot of cultivars in scope for that garden. Type-identical to the flora database (a `Cultivar[]`).
- **Collection Editor** — the modal UI for composing a collection.

## Data Model

The garden gains a `collection` field, alongside `seedStarting`:

```ts
// Collection is a self-contained list of Cultivar snapshots.
// Type-identical to entries returned by the flora database.
type Collection = Cultivar[];

interface GardenState {
  // ...existing fields...
  seedStarting: SeedStartingState;
  collection: Collection;
}
```

**Snapshotting (inline-everything).** Adding a cultivar to the collection inlines the resolved `Cultivar` (icons and all). Removing deletes the snapshot from the collection but leaves the database untouched. Garden files become larger but the model is dead-simple and survives future user-defined cultivars without rework.

**Defaults & migration.** New gardens start with an empty collection. Loaded gardens with no `collection` key are treated as empty (forward-compatible). Existing plantings that reference cultivars not in the collection still resolve via the flora database — they render, but the cultivar is unavailable to add new ones from any palette.

**Pure helpers (`src/model/collection.ts`).**

- `snapshotCultivar(databaseCultivar): Cultivar` — produces a self-contained snapshot. (For inline-everything, this is effectively a structured clone.)
- `addToCollection(collection, snapshots): Collection` — idempotent on duplicate IDs, stable order.
- `removeFromCollection(collection, ids): Collection` — idempotent on missing IDs.
- `hasCultivar(collection, id): boolean` and `getCollectionCultivar(collection, id): Cultivar | undefined`.
- `findInUseRemovals(committed, pending, plantings, seedlings): string[]` — pure helper used by the save-time warning; given the cultivar IDs being removed and the current garden's plantings/seedlings, returns the IDs that are in-use.

All helpers pure, all unit-tested.

## Module Layout

New:

- `src/model/collection.ts` — pure data and helpers above.
- `src/model/collection.test.ts` — unit tests.
- `src/components/collection/CollectionEditor.tsx` — modal shell (header, two panes, footer, Esc/Cancel/Save, dirty tracking, save-warning dialog).
- `src/components/collection/CollectionPane.tsx` — one pane (used twice). Search + chips + collapsible species tree + checkbox multiselect.
- `src/components/collection/SpeciesGroup.tsx` — collapsible species row with tri-state checkbox and count badge.
- `src/components/collection/CultivarRow.tsx` — checkbox + icon + name + variety subtitle, draggable.
- `src/components/collection/TransferControls.tsx` — `<` and `>` buttons.
- `src/hooks/useCollectionEditorState.ts` — staged edits, multiselect, search/category filter, dirty flag, transfer/drag operations.
- `src/hooks/useCollectionEditorState.test.ts` — unit tests.

Modified:

- `src/store/gardenStore.ts` — add `collection` to garden state; `setCollection(next)` action; load/save serialization.
- `src/components/MenuBar.tsx` — add "Collection…" menu item that opens the editor.
- Cultivar-facing palette components — read from the active garden's collection rather than `getAllCultivars()`. When the rendered list is empty *because the collection is empty*, render an empty-state CTA with an "Edit Collection" button.

`getAllCultivars()` remains the database accessor and is consumed only by the Collection Editor itself.

## Editor UX

**Layout.** Centered modal, fixed size (~80vw × 80vh, capped). Header with title "Collection". Body: two equal-width panes with a thin transfer-controls column between them. Footer: Cancel (left), Save (right, primary). Save disabled when no pending edits.

**Each pane (symmetric).**

- Pane title — left: "Available", right: "In Collection".
- Search box: filters by cultivar name, species name, and taxonomic name. Case-insensitive.
- Category chips: the 8 `CultivarCategory` values, multi-select. Empty selection = no category restriction.
- Scrollable list grouped by species. Each species row: chevron (collapse/expand), tri-state checkbox (none/some/all of currently visible children), species name, count badge.
- Cultivar rows under expanded species: checkbox, icon, name, variety subtitle.
- Empty filter state: "No cultivars match" with a clear-filters link.

**Selection.**

- Click a cultivar checkbox → toggles selection in this pane.
- Click a species checkbox → toggles all *currently visible* (filter-respecting) cultivars under it.
- Selection is per-pane and feeds bulk transfer.

**Transfer.**

- `>` moves all checked items in the left pane to the right (= add to collection).
- `<` moves all checked items in the right pane to the left (= remove from collection).
- Buttons disabled when their source pane has nothing checked.
- After a transfer, checkboxes on moved items clear.

**Drag and drop.**

- Drag a cultivar row from one pane to the other to transfer it.
- If the dragged row's checkbox is checked, drag transfers the *whole checked set* on that side. Otherwise just the dragged row.
- Receiving pane highlights its drop area; source row(s) ghost out during drag.
- Drop on the same pane is a no-op.

**Dirty tracking.**

- Pending edits live in the editor's local state (the `useCollectionEditorState` hook), not the garden store.
- Save commits via a single `setCollection(pending)` call.
- Dirty = pending state ≠ committed state. Add-then-remove returning to clean is correctly detected.

**Dismissal.**

- Cancel button: if dirty, show a "Discard changes?" confirm; else close.
- Esc key: same as Cancel.
- Click-outside: **disabled**.

**Save warnings.**

- On Save, compute `findInUseRemovals(committed, pending, plantings, seedlings)`.
- If non-empty, show a confirm dialog: "N cultivars in your garden will no longer appear in palettes: [list]. Existing plantings will remain. Save anyway?" — Cancel / Save Anyway.
- If empty, save proceeds without prompt.

**Canvas while modal is open.**

- Backdrop dims the canvas; canvas ignores input. No live preview of pending edits.

## Entry Points

1. **Menu bar item** — "Collection…" in `MenuBar.tsx`, always reachable.
2. **Empty-state CTA** — when a cultivar palette renders empty because the collection is empty, the empty state includes an "Edit Collection" button that opens the modal.

## Testing

All unit tests, using the project's existing test setup.

**Pure model — `src/model/collection.test.ts`**

- `snapshotCultivar`: produces a fully self-contained `Cultivar`; type-identical to a database `Cultivar`; deep-equal stable across calls.
- `addToCollection`: idempotent on duplicate IDs; preserves existing entries; stable order.
- `removeFromCollection`: idempotent on missing IDs; leaves unrelated entries intact.
- `hasCultivar` / `getCollectionCultivar`: lookup correctness.
- Serialization round-trip: `JSON.parse(JSON.stringify(collection))` equals the original.
- `findInUseRemovals`: returns exactly the intersection of removed IDs and in-use IDs across plantings and seedlings.
- Empty-collection invariants: empty in, empty out; no throw.

**Editor state hook — `src/hooks/useCollectionEditorState.test.ts`**

- Initial state mirrors the committed collection; dirty = false.
- Single transfer (`>` and `<`) updates pending state and sets dirty.
- Multi-select transfer moves all checked items and clears their checkboxes.
- Drag of an unchecked row transfers just that row; drag of a checked row transfers the whole checked set on that side.
- Cancel resets pending state to committed; dirty = false.
- Dirty detection is true iff pending ≠ committed (covers add-then-remove returning to clean).
- Save-warning computation: given pending removals and a list of in-use cultivar IDs, returns exactly the intersection.
- Search filter narrows visible rows by name / species name / taxonomic name; case-insensitive.
- Category filter intersects with search; empty category set = no category restriction.
- Species checkbox tri-state: reflects none/some/all of *currently visible* (filter-respecting) children.

**Garden store — extend `src/store/gardenStore.test.ts`**

- New garden default: `collection` is empty.
- `setCollection` replaces the collection; round-trips through save/load.
- File without a `collection` key loads as empty collection.
- Plantings/seedlings whose cultivar is not in the collection still resolve and render (orphan tolerance).

**Consumer wiring — extend existing palette tests**

- Garden palette renders only cultivars in the collection.
- Seed-starting palette renders only collection cultivars whose resolved `seedStarting.startable` is true.
- Empty collection → empty palettes; empty-state CTA renders.

**Modal component — smoke test**

- Renders without crashing given a populated collection and database.
- Cancel with dirty edits triggers the confirm path; Save with removed-in-use cultivars triggers the warning path.

## Open Questions

- **User-defined cultivars (future).** When users can add their own cultivars, removing a user-defined cultivar from the collection must not lose it. Likely answer: user-defined cultivars live in a separate per-garden store and are *always* in the collection (or removal of a user-defined cultivar is a destructive action with its own confirmation). Out of scope here.
- **Naming.** "Collection" is the working name. Cheap to rename later — only the modal title and one menu item.
