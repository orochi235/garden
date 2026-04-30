# Collection Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-garden cultivar collection that filters every cultivar-facing palette, edited via a modal Collection Editor.

**Architecture:** A new `collection: Cultivar[]` field on the Garden state holds inline snapshots of cultivars chosen from the static flora database. Cultivar-facing palettes (`ObjectPalette`, `SeedStartingPalette`) read from the active garden's collection instead of `getAllCultivars()`. The modal editor is a self-contained React component tree (`src/components/collection/`) with editing state isolated in a `useCollectionEditorState` hook; pending edits commit to the store as a single `setCollection` call on Save.

**Tech Stack:** React + TypeScript, Zustand store, Vitest for tests, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-04-29-collection-editor-design.md`

---

## File Structure

**Create:**
- `src/model/collection.ts` — pure helpers: `snapshotCultivar`, `addToCollection`, `removeFromCollection`, `hasCultivar`, `getCollectionCultivar`, `findInUseRemovals`, `Collection` type alias.
- `src/model/collection.test.ts`
- `src/hooks/useCollectionEditorState.ts` — staged-edits hook for the modal.
- `src/hooks/useCollectionEditorState.test.ts`
- `src/components/collection/CollectionEditor.tsx` — modal shell.
- `src/components/collection/CollectionPane.tsx` — one pane (used twice).
- `src/components/collection/SpeciesGroup.tsx` — collapsible species row.
- `src/components/collection/CultivarRow.tsx` — single cultivar row.
- `src/components/collection/TransferControls.tsx` — `<` / `>` buttons.
- `src/styles/CollectionEditor.module.css`

**Modify:**
- `src/model/types.ts` — add `collection: Cultivar[]` to `Garden`; default `[]` in `createGarden`.
- `src/store/gardenStore.ts` — add `collection` access, `setCollection` action; backfill empty collection in `loadGarden`.
- `src/store/uiStore.ts` — add `collectionEditorOpen` flag and toggle.
- `src/components/MenuBar.tsx` — add "Collection…" menu item; render `<CollectionEditor>` when flag is on.
- `src/components/palette/ObjectPalette.tsx` — read cultivar set from `garden.collection` instead of `getAllCultivars()`; render empty-state CTA when collection is empty.
- `src/components/palette/SeedStartingPalette.tsx` — same; CTA likewise.
- `src/store/gardenStore.test.ts` — add coverage per Task 3.
- `docs/behavior.md` — add a "Collection" section.

---

## Conventions for Tasks

- **Imports** follow the project's existing relative-path style (see `src/store/gardenStore.ts`).
- **Tests** use `vitest` (see `src/model/cultivars.test.ts` for the canonical pattern: `import { describe, it, expect } from 'vitest';`).
- **Run a single test file:** `npx vitest run src/path/to/file.test.ts`.
- **Run all tests:** `npm test`.
- **Build:** `npm run build` (per user preference, full build before push, not just `tsc --noEmit`).
- **Commit format:** match recent log — `feat(collection): …`, `test(collection): …`, `refactor(collection): …`.

---

## Task 1: `Collection` type and `snapshotCultivar`

**Files:**
- Create: `src/model/collection.ts`
- Test: `src/model/collection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/model/collection.test.ts
import { describe, expect, it } from 'vitest';
import { snapshotCultivar, type Collection } from './collection';
import { getAllCultivars } from './cultivars';

describe('snapshotCultivar', () => {
  it('produces a deep copy that equals the source', () => {
    const source = getAllCultivars()[0];
    const snap = snapshotCultivar(source);
    expect(snap).toEqual(source);
  });

  it('does not share references with the source', () => {
    const source = getAllCultivars()[0];
    const snap = snapshotCultivar(source);
    expect(snap).not.toBe(source);
    // Mutating the snapshot must not affect the source.
    (snap as { name: string }).name = 'mutated';
    expect(source.name).not.toBe('mutated');
  });

  it('Collection type is Cultivar[]', () => {
    const empty: Collection = [];
    expect(empty).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/model/collection.test.ts`
Expected: fails with "Cannot find module './collection'".

- [ ] **Step 3: Implement `src/model/collection.ts`**

```ts
import type { Cultivar } from './cultivars';

/** A garden's collection: an inline list of Cultivar snapshots. Type-identical to the flora database. */
export type Collection = Cultivar[];

/** Produce a self-contained deep copy of a database cultivar suitable for inclusion in a collection. */
export function snapshotCultivar(cultivar: Cultivar): Cultivar {
  return structuredClone(cultivar);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/model/collection.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/model/collection.ts src/model/collection.test.ts
git commit -m "feat(collection): add Collection type and snapshotCultivar"
```

---

## Task 2: `addToCollection` / `removeFromCollection` / lookup helpers

**Files:**
- Modify: `src/model/collection.ts`
- Modify: `src/model/collection.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/model/collection.test.ts`:

```ts
import { addToCollection, getCollectionCultivar, hasCultivar, removeFromCollection } from './collection';

describe('addToCollection', () => {
  it('adds new cultivars', () => {
    const [a, b] = getAllCultivars();
    const next = addToCollection([], [snapshotCultivar(a), snapshotCultivar(b)]);
    expect(next.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it('is idempotent on duplicate ids (keeps existing entry)', () => {
    const [a] = getAllCultivars();
    const original = snapshotCultivar(a);
    const duplicate = { ...snapshotCultivar(a), name: 'changed' };
    const next = addToCollection([original], [duplicate]);
    expect(next).toHaveLength(1);
    expect(next[0]).toBe(original);
  });

  it('preserves existing entries unrelated to the additions', () => {
    const [a, b] = getAllCultivars();
    const before = [snapshotCultivar(a)];
    const next = addToCollection(before, [snapshotCultivar(b)]);
    expect(next.map((c) => c.id)).toEqual([a.id, b.id]);
  });
});

describe('removeFromCollection', () => {
  it('removes the named ids', () => {
    const [a, b] = getAllCultivars();
    const next = removeFromCollection([snapshotCultivar(a), snapshotCultivar(b)], [a.id]);
    expect(next.map((c) => c.id)).toEqual([b.id]);
  });

  it('is idempotent on missing ids', () => {
    const [a] = getAllCultivars();
    const collection = [snapshotCultivar(a)];
    const next = removeFromCollection(collection, ['no-such-id']);
    expect(next).toEqual(collection);
  });

  it('returns empty when removing every id', () => {
    const [a] = getAllCultivars();
    const next = removeFromCollection([snapshotCultivar(a)], [a.id]);
    expect(next).toEqual([]);
  });
});

describe('hasCultivar / getCollectionCultivar', () => {
  it('finds present cultivars and reports absent ones', () => {
    const [a, b] = getAllCultivars();
    const collection = [snapshotCultivar(a)];
    expect(hasCultivar(collection, a.id)).toBe(true);
    expect(hasCultivar(collection, b.id)).toBe(false);
    expect(getCollectionCultivar(collection, a.id)?.id).toBe(a.id);
    expect(getCollectionCultivar(collection, b.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/model/collection.test.ts`
Expected: failures referencing `addToCollection` etc. not exported.

- [ ] **Step 3: Implement helpers**

Append to `src/model/collection.ts`:

```ts
/** Append cultivars whose ids are not already present. Idempotent. Stable order: existing first, then new in insertion order. */
export function addToCollection(collection: Collection, additions: Cultivar[]): Collection {
  if (additions.length === 0) return collection;
  const existing = new Set(collection.map((c) => c.id));
  const fresh = additions.filter((c) => !existing.has(c.id));
  if (fresh.length === 0) return collection;
  return [...collection, ...fresh];
}

/** Remove cultivars by id. Idempotent on missing ids. */
export function removeFromCollection(collection: Collection, ids: string[]): Collection {
  if (ids.length === 0) return collection;
  const toRemove = new Set(ids);
  const next = collection.filter((c) => !toRemove.has(c.id));
  return next.length === collection.length ? collection : next;
}

export function hasCultivar(collection: Collection, id: string): boolean {
  return collection.some((c) => c.id === id);
}

export function getCollectionCultivar(collection: Collection, id: string): Cultivar | undefined {
  return collection.find((c) => c.id === id);
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run src/model/collection.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/model/collection.ts src/model/collection.test.ts
git commit -m "feat(collection): add/remove/has/get helpers"
```

---

## Task 3: `findInUseRemovals` (save-warning helper)

**Files:**
- Modify: `src/model/collection.ts`
- Modify: `src/model/collection.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/model/collection.test.ts`:

```ts
import { findInUseRemovals } from './collection';
import type { Planting } from './types';
import type { Seedling } from './seedStarting';

function planting(cultivarId: string): Planting {
  return {
    id: `p-${cultivarId}`,
    parentId: 'parent',
    cultivarId,
    x: 0,
    y: 0,
    label: '',
    icon: null,
  };
}

function seedling(cultivarId: string): Seedling {
  return {
    id: `s-${cultivarId}`,
    cultivarId,
    trayId: 't1',
    row: 0,
    col: 0,
  };
}

describe('findInUseRemovals', () => {
  it('returns ids of removed cultivars referenced by plantings or seedlings', () => {
    const removed = ['cult-a', 'cult-b', 'cult-c'];
    const plantings = [planting('cult-a')];
    const seedlings = [seedling('cult-c')];
    expect(findInUseRemovals(removed, plantings, seedlings).sort()).toEqual(['cult-a', 'cult-c']);
  });

  it('returns empty when no removed ids are in use', () => {
    expect(findInUseRemovals(['x'], [planting('y')], [seedling('z')])).toEqual([]);
  });

  it('deduplicates: an id used by both a planting and a seedling appears once', () => {
    expect(findInUseRemovals(['cult-a'], [planting('cult-a')], [seedling('cult-a')])).toEqual(['cult-a']);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run src/model/collection.test.ts`

- [ ] **Step 3: Implement**

Append to `src/model/collection.ts`:

```ts
import type { Planting } from './types';
import type { Seedling } from './seedStarting';

/** Of the cultivar ids being removed, return those still referenced by any planting or seedling. */
export function findInUseRemovals(
  removedIds: string[],
  plantings: Planting[],
  seedlings: Seedling[],
): string[] {
  if (removedIds.length === 0) return [];
  const removed = new Set(removedIds);
  const found = new Set<string>();
  for (const p of plantings) {
    if (removed.has(p.cultivarId)) found.add(p.cultivarId);
  }
  for (const s of seedlings) {
    if (removed.has(s.cultivarId)) found.add(s.cultivarId);
  }
  return [...found];
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/model/collection.ts src/model/collection.test.ts
git commit -m "feat(collection): findInUseRemovals helper for save warning"
```

---

## Task 4: Add `collection` to Garden type and createGarden

**Files:**
- Modify: `src/model/types.ts`
- Modify: `src/store/gardenStore.ts`

- [ ] **Step 1: Read current Garden interface**

Read `src/model/types.ts` lines 79–116.

- [ ] **Step 2: Add `collection` field and default**

In `src/model/types.ts`:

- Add an import at the top: `import type { Collection } from './collection';`
- In the `Garden` interface, add a new field after `seedStarting`: `collection: Collection;`
- In `createGarden`, add `collection: [],` after `seedStarting: emptySeedStartingState(),`.

**Note on import cycle:** `collection.ts` imports `Cultivar` (from `cultivars.ts`) and `Planting` (from `types.ts`). `types.ts` will now import `Collection` from `collection.ts`. This is a `type`-only cycle and is fine for TypeScript, but if the build complains, replace the import with: `import type { Cultivar } from './cultivars';` and inline `collection: Cultivar[]` in the `Garden` interface; keep `Collection` defined in `collection.ts` for use elsewhere.

- [ ] **Step 3: Backfill in `loadGarden`**

In `src/store/gardenStore.ts`, inside `loadGarden`, after the existing `if (!garden.seedStarting) garden.seedStarting = emptySeedStartingState();` line, add:

```ts
if (!garden.collection) garden.collection = [];
```

- [ ] **Step 4: Run all tests + typecheck**

Run: `npm test` and `npx tsc --noEmit`.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/types.ts src/store/gardenStore.ts
git commit -m "feat(collection): add empty collection field to Garden state"
```

---

## Task 5: `setCollection` store action

**Files:**
- Modify: `src/store/gardenStore.ts`
- Modify: `src/store/gardenStore.test.ts`

- [ ] **Step 1: Add failing test**

Append a `describe` block to `src/store/gardenStore.test.ts` (use the same import / setup pattern as the existing tests there):

```ts
import { snapshotCultivar } from '../model/collection';
import { getAllCultivars } from '../model/cultivars';

describe('setCollection', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
  });

  it('replaces the collection with the provided value', () => {
    const [a, b] = getAllCultivars();
    const next = [snapshotCultivar(a), snapshotCultivar(b)];
    useGardenStore.getState().setCollection(next);
    expect(useGardenStore.getState().garden.collection.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it('is undoable', () => {
    const [a] = getAllCultivars();
    useGardenStore.getState().setCollection([snapshotCultivar(a)]);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.collection).toEqual([]);
  });

  it('survives load of a garden missing a collection key', () => {
    // Simulate an old save: clone the default garden and delete the collection key.
    const garden = JSON.parse(JSON.stringify(useGardenStore.getState().garden));
    delete garden.collection;
    useGardenStore.getState().loadGarden(garden);
    expect(useGardenStore.getState().garden.collection).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run src/store/gardenStore.test.ts`

- [ ] **Step 3: Add `setCollection` to the store**

In `src/store/gardenStore.ts`:

- Add to the `GardenStore` interface (next to `loadGarden`): `setCollection: (collection: Collection) => void;`
- Add the corresponding import at the top: `import type { Collection } from '../model/collection';`
- In the store body (anywhere alongside the other actions, e.g., after `setBlueprint`), add:

```ts
setCollection: (collection) => {
  commitPatch({ collection });
},
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenStore.test.ts
git commit -m "feat(collection): setCollection store action with undo support"
```

---

## Task 6: `useCollectionEditorState` — initial state & selection

**Files:**
- Create: `src/hooks/useCollectionEditorState.ts`
- Test: `src/hooks/useCollectionEditorState.test.ts`

The hook holds all editor-local state: pending collection, per-pane multiselect, per-pane search/category filters, expansion state. It returns derived values (visible items per pane, dirty flag) and operations (`toggleSelection`, `selectSpecies`, `transferRight`, `transferLeft`, `dragTransfer`, `setSearch`, `setCategories`, `toggleSpeciesExpand`, `cancel`, `commitTo(setCollection)`).

This task implements only the constructor + selection state. Subsequent tasks layer on transfer, search, expansion, and dirty/save behavior.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useCollectionEditorState.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { snapshotCultivar } from '../model/collection';
import { getAllCultivars } from '../model/cultivars';
import { useCollectionEditorState } from './useCollectionEditorState';

describe('useCollectionEditorState — initial state', () => {
  it('mirrors the committed collection in pending state', () => {
    const [a] = getAllCultivars();
    const committed = [snapshotCultivar(a)];
    const { result } = renderHook(() => useCollectionEditorState(committed));
    expect(result.current.pending.map((c) => c.id)).toEqual([a.id]);
    expect(result.current.dirty).toBe(false);
    expect(result.current.leftChecked).toEqual(new Set());
    expect(result.current.rightChecked).toEqual(new Set());
  });
});

describe('useCollectionEditorState — selection', () => {
  it('toggles individual cultivar checkboxes per side', () => {
    const cultivars = getAllCultivars().slice(0, 2);
    const committed = [snapshotCultivar(cultivars[0])];
    const { result } = renderHook(() => useCollectionEditorState(committed));
    act(() => result.current.toggleSelection('left', cultivars[1].id));
    expect(result.current.leftChecked.has(cultivars[1].id)).toBe(true);
    act(() => result.current.toggleSelection('left', cultivars[1].id));
    expect(result.current.leftChecked.has(cultivars[1].id)).toBe(false);
  });
});
```

(`@testing-library/react` is already a project dependency — see `usePlantingTree.test.ts` if a precedent is needed, or add the dep if missing.)

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run src/hooks/useCollectionEditorState.test.ts`

- [ ] **Step 3: Implement the hook (initial-state portion)**

```ts
// src/hooks/useCollectionEditorState.ts
import { useCallback, useMemo, useState } from 'react';
import type { Collection } from '../model/collection';
import type { Cultivar, CultivarCategory } from '../model/cultivars';

export type Side = 'left' | 'right';

export interface CollectionEditorState {
  pending: Collection;
  dirty: boolean;
  leftChecked: Set<string>;
  rightChecked: Set<string>;
  toggleSelection: (side: Side, cultivarId: string) => void;
  // Other operations added in later tasks.
}

export function useCollectionEditorState(committed: Collection): CollectionEditorState {
  const [pending, setPending] = useState<Collection>(committed);
  const [leftChecked, setLeftChecked] = useState<Set<string>>(() => new Set());
  const [rightChecked, setRightChecked] = useState<Set<string>>(() => new Set());

  const toggleSelection = useCallback((side: Side, cultivarId: string) => {
    const setter = side === 'left' ? setLeftChecked : setRightChecked;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(cultivarId)) next.delete(cultivarId);
      else next.add(cultivarId);
      return next;
    });
  }, []);

  const dirty = useMemo(() => !sameIds(committed, pending), [committed, pending]);

  return { pending, dirty, leftChecked, rightChecked, toggleSelection };
}

function sameIds(a: Collection, b: Collection): boolean {
  if (a.length !== b.length) return false;
  const aIds = new Set(a.map((c) => c.id));
  for (const c of b) if (!aIds.has(c.id)) return false;
  return true;
}
```

(`Cultivar` and `CultivarCategory` imports are unused right now but will be in later tasks; add them only when used to satisfy the linter. Re-export `Side` for component use.)

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCollectionEditorState.ts src/hooks/useCollectionEditorState.test.ts
git commit -m "feat(collection): editor state hook — initial state and selection"
```

---

## Task 7: Hook — transfer right/left

**Files:**
- Modify: `src/hooks/useCollectionEditorState.ts`
- Modify: `src/hooks/useCollectionEditorState.test.ts`

`transferRight()` adds every cultivar in `leftChecked` (looked up in the *available* list, which is the database minus pending) to `pending` and clears `leftChecked`. `transferLeft()` removes every id in `rightChecked` from `pending` and clears `rightChecked`. Both set `dirty = true` (which falls out of pending change automatically).

The hook needs the database to resolve ids when transferring right. Pass it as the second argument to keep the hook pure-ish (no global imports); the modal component will pass `getAllCultivars()`.

- [ ] **Step 1: Update the hook signature**

Change the hook to `useCollectionEditorState(committed: Collection, database: Cultivar[])`.

Update the existing Task 6 tests to pass a database arg — they currently call `useCollectionEditorState(committed)`. Change every call in `src/hooks/useCollectionEditorState.test.ts` to `useCollectionEditorState(committed, getAllCultivars())` (or `useCollectionEditorState([], getAllCultivars())` where appropriate).

- [ ] **Step 2: Add failing tests**

Append:

```ts
import { addToCollection, removeFromCollection } from '../model/collection';

describe('useCollectionEditorState — transfer', () => {
  it('transferRight adds left-checked items to pending and clears the checks', () => {
    const db = getAllCultivars().slice(0, 3);
    const committed: Collection = [];
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => {
      result.current.toggleSelection('left', db[0].id);
      result.current.toggleSelection('left', db[1].id);
    });
    act(() => result.current.transferRight());
    expect(result.current.pending.map((c) => c.id).sort()).toEqual([db[0].id, db[1].id].sort());
    expect(result.current.leftChecked.size).toBe(0);
    expect(result.current.dirty).toBe(true);
  });

  it('transferLeft removes right-checked items from pending and clears the checks', () => {
    const db = getAllCultivars().slice(0, 2);
    const committed = db.map((c) => ({ ...c }));
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => result.current.toggleSelection('right', db[0].id));
    act(() => result.current.transferLeft());
    expect(result.current.pending.map((c) => c.id)).toEqual([db[1].id]);
    expect(result.current.rightChecked.size).toBe(0);
    expect(result.current.dirty).toBe(true);
  });

  it('dirty returns to false when add-then-remove restores the committed set', () => {
    const db = getAllCultivars().slice(0, 1);
    const committed: Collection = [];
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => result.current.toggleSelection('left', db[0].id));
    act(() => result.current.transferRight());
    expect(result.current.dirty).toBe(true);
    act(() => result.current.toggleSelection('right', db[0].id));
    act(() => result.current.transferLeft());
    expect(result.current.dirty).toBe(false);
  });
});
```

- [ ] **Step 3: Run, verify failure**

- [ ] **Step 4: Implement transfers**

In `useCollectionEditorState.ts`:

```ts
import { addToCollection, removeFromCollection, snapshotCultivar } from '../model/collection';

// Inside the hook, after toggleSelection:
const transferRight = useCallback(() => {
  if (leftChecked.size === 0) return;
  const additions: Cultivar[] = [];
  for (const id of leftChecked) {
    const source = database.find((c) => c.id === id);
    if (source) additions.push(snapshotCultivar(source));
  }
  setPending((prev) => addToCollection(prev, additions));
  setLeftChecked(new Set());
}, [leftChecked, database]);

const transferLeft = useCallback(() => {
  if (rightChecked.size === 0) return;
  const ids = [...rightChecked];
  setPending((prev) => removeFromCollection(prev, ids));
  setRightChecked(new Set());
}, [rightChecked]);
```

Add `transferRight` and `transferLeft` to the returned object and to `CollectionEditorState`.

- [ ] **Step 5: Run, verify pass**

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCollectionEditorState.ts src/hooks/useCollectionEditorState.test.ts
git commit -m "feat(collection): editor hook — transfer left/right and dirty tracking"
```

---

## Task 8: Hook — drag transfer

**Files:**
- Modify: `src/hooks/useCollectionEditorState.ts`
- Modify: `src/hooks/useCollectionEditorState.test.ts`

`dragTransfer(fromSide, draggedId)`:
- If the dragged row's id is in that side's checked set, transfer the whole checked set (same logic as the buttons).
- Otherwise, transfer just the dragged id, leaving checkboxes unchanged on either side.

- [ ] **Step 1: Add failing tests**

```ts
describe('useCollectionEditorState — drag transfer', () => {
  it('drag of an unchecked row from left transfers just that row, keeping selections intact', () => {
    const db = getAllCultivars().slice(0, 2);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.toggleSelection('left', db[1].id)); // unrelated checked
    act(() => result.current.dragTransfer('left', db[0].id));
    expect(result.current.pending.map((c) => c.id)).toEqual([db[0].id]);
    expect(result.current.leftChecked.has(db[1].id)).toBe(true);
  });

  it('drag of a checked row from left transfers the whole checked set and clears it', () => {
    const db = getAllCultivars().slice(0, 3);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => {
      result.current.toggleSelection('left', db[0].id);
      result.current.toggleSelection('left', db[1].id);
    });
    act(() => result.current.dragTransfer('left', db[0].id));
    expect(result.current.pending.map((c) => c.id).sort()).toEqual([db[0].id, db[1].id].sort());
    expect(result.current.leftChecked.size).toBe(0);
  });

  it('drag from right works symmetrically (removal)', () => {
    const db = getAllCultivars().slice(0, 1);
    const committed = db.map((c) => ({ ...c }));
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => result.current.dragTransfer('right', db[0].id));
    expect(result.current.pending).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```ts
const dragTransfer = useCallback((from: Side, draggedId: string) => {
  const checked = from === 'left' ? leftChecked : rightChecked;
  const setChecked = from === 'left' ? setLeftChecked : setRightChecked;
  const useGroup = checked.has(draggedId);
  const ids = useGroup ? [...checked] : [draggedId];

  if (from === 'left') {
    const additions: Cultivar[] = [];
    for (const id of ids) {
      const source = database.find((c) => c.id === id);
      if (source) additions.push(snapshotCultivar(source));
    }
    setPending((prev) => addToCollection(prev, additions));
  } else {
    setPending((prev) => removeFromCollection(prev, ids));
  }

  if (useGroup) setChecked(new Set());
}, [leftChecked, rightChecked, database]);
```

Add to returned object and `CollectionEditorState`.

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCollectionEditorState.ts src/hooks/useCollectionEditorState.test.ts
git commit -m "feat(collection): editor hook — drag transfer"
```

---

## Task 9: Hook — per-pane search, category filter, species expand

**Files:**
- Modify: `src/hooks/useCollectionEditorState.ts`
- Modify: `src/hooks/useCollectionEditorState.test.ts`

Add per-side search string, category multiselect, and a per-side `expandedSpecies: Set<string>`.

Add a derived helper on the returned object: `visibleCultivars(side, sourceList) → Cultivar[]` that filters `sourceList` by that side's search and category state. Search matches cultivar `name`, species `name`, and species `taxonomicName` (case-insensitive). Empty category set = no category restriction. The test verifies the filter; the rendering layer in later tasks will compose `visibleCultivars` with the appropriate source.

- [ ] **Step 1: Add failing tests**

```ts
import { getSpecies } from '../model/species';

describe('useCollectionEditorState — search and categories', () => {
  it('search narrows by cultivar name (case-insensitive)', () => {
    const db = getAllCultivars();
    const { result } = renderHook(() => useCollectionEditorState([], db));
    const target = db[0];
    act(() => result.current.setSearch('left', target.name.slice(0, 3).toLowerCase()));
    expect(result.current.visibleCultivars('left', db).some((c) => c.id === target.id)).toBe(true);
  });

  it('search matches species name', () => {
    const db = getAllCultivars();
    const target = db[0];
    const speciesName = getSpecies(target.speciesId)!.name;
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.setSearch('left', speciesName));
    expect(result.current.visibleCultivars('left', db).every(
      (c) => getSpecies(c.speciesId)?.name === speciesName,
    )).toBe(true);
  });

  it('category filter restricts to selected categories; empty = no restriction', () => {
    const db = getAllCultivars();
    const { result } = renderHook(() => useCollectionEditorState([], db));
    expect(result.current.visibleCultivars('left', db).length).toBe(db.length);
    act(() => result.current.setCategories('left', new Set(['herbs'])));
    expect(result.current.visibleCultivars('left', db).every((c) => c.category === 'herbs')).toBe(true);
  });
});

describe('useCollectionEditorState — expansion', () => {
  it('toggleSpeciesExpand toggles per-side expansion of a species id', () => {
    const db = getAllCultivars().slice(0, 1);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    expect(result.current.expandedSpecies('left').has(db[0].speciesId)).toBe(false);
    act(() => result.current.toggleSpeciesExpand('left', db[0].speciesId));
    expect(result.current.expandedSpecies('left').has(db[0].speciesId)).toBe(true);
    act(() => result.current.toggleSpeciesExpand('left', db[0].speciesId));
    expect(result.current.expandedSpecies('left').has(db[0].speciesId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

Add state inside the hook:

```ts
import type { CultivarCategory } from '../model/cultivars';
import { getSpecies } from '../model/species';

const [searchLeft, setSearchLeftState] = useState('');
const [searchRight, setSearchRightState] = useState('');
const [catsLeft, setCatsLeftState] = useState<Set<CultivarCategory>>(() => new Set());
const [catsRight, setCatsRightState] = useState<Set<CultivarCategory>>(() => new Set());
const [expandedLeft, setExpandedLeft] = useState<Set<string>>(() => new Set());
const [expandedRight, setExpandedRight] = useState<Set<string>>(() => new Set());

const setSearch = useCallback((side: Side, value: string) => {
  (side === 'left' ? setSearchLeftState : setSearchRightState)(value);
}, []);

const setCategories = useCallback((side: Side, value: Set<CultivarCategory>) => {
  (side === 'left' ? setCatsLeftState : setCatsRightState)(value);
}, []);

const toggleSpeciesExpand = useCallback((side: Side, speciesId: string) => {
  const setter = side === 'left' ? setExpandedLeft : setExpandedRight;
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(speciesId)) next.delete(speciesId);
    else next.add(speciesId);
    return next;
  });
}, []);

const expandedSpecies = useCallback(
  (side: Side) => (side === 'left' ? expandedLeft : expandedRight),
  [expandedLeft, expandedRight],
);

const visibleCultivars = useCallback(
  (side: Side, source: Cultivar[]): Cultivar[] => {
    const search = (side === 'left' ? searchLeft : searchRight).trim().toLowerCase();
    const cats = side === 'left' ? catsLeft : catsRight;
    return source.filter((c) => {
      if (cats.size > 0 && !cats.has(c.category)) return false;
      if (search) {
        const species = getSpecies(c.speciesId);
        const haystack = [
          c.name,
          species?.name ?? '',
          species?.taxonomicName ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  },
  [searchLeft, searchRight, catsLeft, catsRight],
);
```

Expose `setSearch`, `setCategories`, `toggleSpeciesExpand`, `expandedSpecies`, `visibleCultivars` on the returned state and on `CollectionEditorState`. Also expose the search/category state for read access: `searchOf(side)`, `categoriesOf(side)`.

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCollectionEditorState.ts src/hooks/useCollectionEditorState.test.ts
git commit -m "feat(collection): editor hook — per-pane search, categories, expansion"
```

---

## Task 10: Hook — species checkbox tri-state and species toggle

**Files:**
- Modify: `src/hooks/useCollectionEditorState.ts`
- Modify: `src/hooks/useCollectionEditorState.test.ts`

Tri-state value `'none' | 'some' | 'all'` over the *currently visible* (filter-respecting) cultivars under a species. `toggleSpeciesSelection(side, speciesId, sourceList)` adds the visible-children's ids to the side's checked set if state is `'none'`; otherwise removes them all.

- [ ] **Step 1: Add failing tests**

```ts
describe('useCollectionEditorState — species selection', () => {
  it('tri-state reflects none/some/all of visible children', () => {
    const db = getAllCultivars();
    // Pick a species with at least 2 cultivars in the database.
    const speciesCounts = new Map<string, Cultivar[]>();
    for (const c of db) {
      const list = speciesCounts.get(c.speciesId) ?? [];
      list.push(c);
      speciesCounts.set(c.speciesId, list);
    }
    const speciesId = [...speciesCounts.entries()].find(([, list]) => list.length >= 2)![0];
    const children = speciesCounts.get(speciesId)!;

    const { result } = renderHook(() => useCollectionEditorState([], db));
    expect(result.current.speciesSelectionState('left', speciesId, children)).toBe('none');
    act(() => result.current.toggleSelection('left', children[0].id));
    expect(result.current.speciesSelectionState('left', speciesId, children)).toBe('some');
    act(() => result.current.toggleSelection('left', children[1].id));
    expect(result.current.speciesSelectionState('left', speciesId, children)).toBe('all');
  });

  it('toggleSpeciesSelection from "none" selects all visible children', () => {
    const db = getAllCultivars();
    const speciesGroups = new Map<string, Cultivar[]>();
    for (const c of db) {
      const list = speciesGroups.get(c.speciesId) ?? [];
      list.push(c);
      speciesGroups.set(c.speciesId, list);
    }
    const [speciesId, children] = [...speciesGroups.entries()].find(([, l]) => l.length >= 2)!;
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.toggleSpeciesSelection('left', speciesId, children));
    for (const c of children) {
      expect(result.current.leftChecked.has(c.id)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```ts
export type TriState = 'none' | 'some' | 'all';

const speciesSelectionState = useCallback(
  (side: Side, _speciesId: string, visibleChildren: Cultivar[]): TriState => {
    const checked = side === 'left' ? leftChecked : rightChecked;
    if (visibleChildren.length === 0) return 'none';
    let count = 0;
    for (const c of visibleChildren) if (checked.has(c.id)) count++;
    if (count === 0) return 'none';
    if (count === visibleChildren.length) return 'all';
    return 'some';
  },
  [leftChecked, rightChecked],
);

const toggleSpeciesSelection = useCallback(
  (side: Side, _speciesId: string, visibleChildren: Cultivar[]) => {
    const setter = side === 'left' ? setLeftChecked : setRightChecked;
    const current = side === 'left' ? leftChecked : rightChecked;
    const allSelected = visibleChildren.every((c) => current.has(c.id));
    setter((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const c of visibleChildren) next.delete(c.id);
      } else {
        for (const c of visibleChildren) next.add(c.id);
      }
      return next;
    });
  },
  [leftChecked, rightChecked],
);
```

Expose both. Update the `CollectionEditorState` interface accordingly.

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCollectionEditorState.ts src/hooks/useCollectionEditorState.test.ts
git commit -m "feat(collection): editor hook — species tri-state and bulk toggle"
```

---

## Task 11: Hook — cancel and commit

**Files:**
- Modify: `src/hooks/useCollectionEditorState.ts`
- Modify: `src/hooks/useCollectionEditorState.test.ts`

`cancel()` — resets `pending` back to `committed`, clears both checked sets, returns to `dirty=false`. (Searches/categories/expansion can stay or reset; reset them too for cleanliness.)

`computeRemovedIds()` — returns the cultivar ids present in `committed` but not in `pending`. Used by the modal to call `findInUseRemovals`.

- [ ] **Step 1: Add failing tests**

```ts
describe('useCollectionEditorState — cancel and removed-ids', () => {
  it('cancel restores pending to committed and clears selections', () => {
    const db = getAllCultivars().slice(0, 1);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.toggleSelection('left', db[0].id));
    act(() => result.current.transferRight());
    expect(result.current.dirty).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.pending).toEqual([]);
    expect(result.current.dirty).toBe(false);
    expect(result.current.leftChecked.size).toBe(0);
  });

  it('computeRemovedIds returns ids in committed but not pending', () => {
    const db = getAllCultivars().slice(0, 2);
    const committed = db.map((c) => ({ ...c }));
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => result.current.toggleSelection('right', db[0].id));
    act(() => result.current.transferLeft());
    expect(result.current.computeRemovedIds()).toEqual([db[0].id]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

```ts
const cancel = useCallback(() => {
  setPending(committed);
  setLeftChecked(new Set());
  setRightChecked(new Set());
  setSearchLeftState('');
  setSearchRightState('');
  setCatsLeftState(new Set());
  setCatsRightState(new Set());
  setExpandedLeft(new Set());
  setExpandedRight(new Set());
}, [committed]);

const computeRemovedIds = useCallback((): string[] => {
  const pendingIds = new Set(pending.map((c) => c.id));
  return committed.filter((c) => !pendingIds.has(c.id)).map((c) => c.id);
}, [committed, pending]);
```

Expose both.

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCollectionEditorState.ts src/hooks/useCollectionEditorState.test.ts
git commit -m "feat(collection): editor hook — cancel and computeRemovedIds"
```

---

## Task 12: `uiStore` — `collectionEditorOpen` flag

**Files:**
- Modify: `src/store/uiStore.ts`
- Modify: `src/store/uiStore.test.ts`

- [ ] **Step 1: Add failing test**

In `src/store/uiStore.test.ts`:

```ts
describe('collectionEditorOpen', () => {
  it('defaults to false and toggles', () => {
    expect(useUiStore.getState().collectionEditorOpen).toBe(false);
    useUiStore.getState().setCollectionEditorOpen(true);
    expect(useUiStore.getState().collectionEditorOpen).toBe(true);
    useUiStore.getState().setCollectionEditorOpen(false);
    expect(useUiStore.getState().collectionEditorOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement**

In `src/store/uiStore.ts`, add to the interface and store body:

```ts
collectionEditorOpen: boolean;
setCollectionEditorOpen: (open: boolean) => void;
```

Initial value `false`; setter is the trivial setter.

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/store/uiStore.ts src/store/uiStore.test.ts
git commit -m "feat(collection): uiStore flag for editor visibility"
```

---

## Task 13: CSS module skeleton

**Files:**
- Create: `src/styles/CollectionEditor.module.css`

- [ ] **Step 1: Create the file with class skeleton**

```css
/* src/styles/CollectionEditor.module.css */
.backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}

.modal {
  width: 80vw; max-width: 1100px;
  height: 80vh; max-height: 800px;
  background: var(--theme-panel-bg, #1f2123);
  color: var(--theme-text, #eee);
  border-radius: 6px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.header { padding: 12px 16px; border-bottom: 1px solid var(--theme-divider, #333); font-weight: 600; }
.body { flex: 1; display: flex; min-height: 0; }

.pane {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--theme-divider, #333);
}
.pane:last-child { border-right: none; }
.paneTitle { padding: 8px 12px; font-size: 0.85em; text-transform: uppercase; opacity: 0.7; }
.search { padding: 0 12px 8px; }
.searchInput { width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--theme-divider, #333); background: var(--theme-input-bg, #15161a); color: inherit; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px 8px; }
.chip { padding: 2px 8px; border-radius: 12px; border: 1px solid var(--theme-divider, #333); cursor: pointer; user-select: none; font-size: 0.85em; }
.chipActive { background: var(--theme-accent, #4a7c59); border-color: transparent; color: #fff; }

.list { flex: 1; overflow-y: auto; padding: 4px 0 12px; }
.speciesGroup { padding: 4px 12px; }
.speciesRow { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 0; }
.speciesChevron { width: 12px; text-align: center; opacity: 0.7; }
.cultivarRow { display: flex; align-items: center; gap: 6px; padding: 3px 0 3px 22px; cursor: grab; }
.cultivarRow.dragging { opacity: 0.4; }
.dropTarget { outline: 2px dashed var(--theme-accent, #4a7c59); outline-offset: -4px; }

.transfer { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 8px; gap: 8px; border-right: 1px solid var(--theme-divider, #333); }
.transferButton { width: 32px; height: 32px; border-radius: 4px; border: 1px solid var(--theme-divider, #333); background: var(--theme-input-bg, #15161a); color: inherit; cursor: pointer; }
.transferButton:disabled { opacity: 0.4; cursor: default; }

.footer { padding: 12px 16px; border-top: 1px solid var(--theme-divider, #333); display: flex; justify-content: space-between; align-items: center; }
.button { padding: 6px 14px; border-radius: 4px; border: 1px solid var(--theme-divider, #333); background: var(--theme-input-bg, #15161a); color: inherit; cursor: pointer; }
.buttonPrimary { background: var(--theme-accent, #4a7c59); border-color: transparent; color: #fff; }
.buttonPrimary:disabled { opacity: 0.5; cursor: default; }

.emptyMessage { padding: 16px; opacity: 0.6; text-align: center; }
.confirmDialog { background: var(--theme-panel-bg, #1f2123); padding: 16px 20px; border-radius: 6px; max-width: 480px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/CollectionEditor.module.css
git commit -m "style(collection): skeleton CSS module for editor"
```

---

## Task 14: `CultivarRow` component

**Files:**
- Create: `src/components/collection/CultivarRow.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Cultivar } from '../../model/cultivars';
import styles from '../../styles/CollectionEditor.module.css';

interface Props {
  cultivar: Cultivar;
  checked: boolean;
  onToggle: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function CultivarRow({ cultivar, checked, onToggle, onDragStart, onDragEnd }: Props) {
  return (
    <div
      className={styles.cultivarRow}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
      />
      <span style={{ width: 14, height: 14, borderRadius: 3, background: cultivar.color, flexShrink: 0 }} />
      <span>{cultivar.variety ?? cultivar.name}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/collection/CultivarRow.tsx
git commit -m "feat(collection): CultivarRow"
```

---

## Task 15: `SpeciesGroup` component

**Files:**
- Create: `src/components/collection/SpeciesGroup.tsx`

The species row renders a tri-state checkbox; clicking it calls `onSpeciesToggle`. The chevron expands/collapses.

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useRef } from 'react';
import type { Cultivar } from '../../model/cultivars';
import { getSpecies } from '../../model/species';
import styles from '../../styles/CollectionEditor.module.css';
import type { TriState } from '../../hooks/useCollectionEditorState';
import { CultivarRow } from './CultivarRow';

interface Props {
  speciesId: string;
  visibleChildren: Cultivar[];
  expanded: boolean;
  triState: TriState;
  isChecked: (id: string) => boolean;
  onSpeciesToggle: () => void;
  onSpeciesExpandToggle: () => void;
  onCultivarToggle: (id: string) => void;
  onCultivarDragStart: (id: string, e: React.DragEvent) => void;
  onCultivarDragEnd: () => void;
}

export function SpeciesGroup(props: Props) {
  const species = getSpecies(props.speciesId);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = props.triState === 'some';
  }, [props.triState]);

  const childrenCount = props.visibleChildren.length;
  const checkedCount = props.visibleChildren.filter((c) => props.isChecked(c.id)).length;
  const countLabel = checkedCount === childrenCount ? `${childrenCount}` : `${checkedCount}/${childrenCount}`;

  return (
    <div className={styles.speciesGroup}>
      <div className={styles.speciesRow}>
        <span className={styles.speciesChevron} onClick={props.onSpeciesExpandToggle}>
          {props.expanded ? '▾' : '▸'}
        </span>
        <input
          ref={ref}
          type="checkbox"
          checked={props.triState === 'all'}
          onChange={props.onSpeciesToggle}
        />
        <span style={{ flex: 1 }} onClick={props.onSpeciesExpandToggle}>{species?.name ?? props.speciesId}</span>
        <span style={{ opacity: 0.6 }}>{countLabel}</span>
      </div>
      {props.expanded &&
        props.visibleChildren.map((c) => (
          <CultivarRow
            key={c.id}
            cultivar={c}
            checked={props.isChecked(c.id)}
            onToggle={() => props.onCultivarToggle(c.id)}
            onDragStart={(e) => props.onCultivarDragStart(c.id, e)}
            onDragEnd={props.onCultivarDragEnd}
          />
        ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/collection/SpeciesGroup.tsx
git commit -m "feat(collection): SpeciesGroup with tri-state checkbox"
```

---

## Task 16: `CollectionPane` component

**Files:**
- Create: `src/components/collection/CollectionPane.tsx`

Renders pane title, search input, category chips, and the list of species groups built from a `Cultivar[]`. Drop zone fires `onDropFromOther(draggedId)`.

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useState } from 'react';
import type { Cultivar, CultivarCategory } from '../../model/cultivars';
import styles from '../../styles/CollectionEditor.module.css';
import type { Side, TriState } from '../../hooks/useCollectionEditorState';
import { SpeciesGroup } from './SpeciesGroup';

const CATEGORY_LABELS: Record<CultivarCategory, string> = {
  vegetables: 'Vegetables',
  greens: 'Greens',
  fruits: 'Fruits',
  squash: 'Squash',
  'root-vegetables': 'Roots',
  legumes: 'Legumes',
  herbs: 'Herbs',
  flowers: 'Flowers',
};
const CATEGORY_ORDER: CultivarCategory[] = [
  'vegetables', 'greens', 'fruits', 'squash', 'root-vegetables', 'legumes', 'herbs', 'flowers',
];

interface Props {
  side: Side;
  title: string;
  source: Cultivar[];                 // candidate set: database (left) or pending (right).
  visibleCultivars: Cultivar[];       // already-filtered by hook.
  search: string;
  onSearchChange: (v: string) => void;
  categories: Set<CultivarCategory>;
  onCategoriesChange: (next: Set<CultivarCategory>) => void;
  expandedSpecies: Set<string>;
  onSpeciesExpandToggle: (speciesId: string) => void;
  isChecked: (id: string) => boolean;
  onCultivarToggle: (id: string) => void;
  speciesTriState: (speciesId: string, visibleChildren: Cultivar[]) => TriState;
  onSpeciesToggle: (speciesId: string, visibleChildren: Cultivar[]) => void;
  onCultivarDragStart: (id: string, e: React.DragEvent) => void;
  onCultivarDragEnd: () => void;
  onDropFromOther: (draggedId: string) => void;
}

export function CollectionPane(props: Props) {
  const [dropActive, setDropActive] = useState(false);

  const groups = useMemo(() => {
    const bySpecies = new Map<string, Cultivar[]>();
    for (const c of props.visibleCultivars) {
      const list = bySpecies.get(c.speciesId) ?? [];
      list.push(c);
      bySpecies.set(c.speciesId, list);
    }
    return [...bySpecies.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [props.visibleCultivars]);

  function toggleCategory(cat: CultivarCategory) {
    const next = new Set(props.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    props.onCategoriesChange(next);
  }

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/x-cultivar-id-from-other')) {
      e.preventDefault();
      setDropActive(true);
    }
  }
  function handleDragLeave() {
    setDropActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    setDropActive(false);
    const id = e.dataTransfer.getData('application/x-cultivar-id-from-other');
    if (id) props.onDropFromOther(id);
  }

  return (
    <div
      className={`${styles.pane} ${dropActive ? styles.dropTarget : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.paneTitle}>{props.title}</div>
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search…"
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
        />
      </div>
      <div className={styles.chips}>
        {CATEGORY_ORDER.map((cat) => (
          <span
            key={cat}
            className={`${styles.chip} ${props.categories.has(cat) ? styles.chipActive : ''}`}
            onClick={() => toggleCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </span>
        ))}
      </div>
      <div className={styles.list}>
        {groups.length === 0 && (
          <div className={styles.emptyMessage}>
            {props.source.length === 0 ? 'Empty' : 'No cultivars match'}
            {(props.search || props.categories.size > 0) && props.source.length > 0 && (
              <>
                {' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    props.onSearchChange('');
                    props.onCategoriesChange(new Set());
                  }}
                >clear filters</a>
              </>
            )}
          </div>
        )}
        {groups.map(([speciesId, children]) => (
          <SpeciesGroup
            key={speciesId}
            speciesId={speciesId}
            visibleChildren={children}
            expanded={props.expandedSpecies.has(speciesId)}
            triState={props.speciesTriState(speciesId, children)}
            isChecked={props.isChecked}
            onSpeciesToggle={() => props.onSpeciesToggle(speciesId, children)}
            onSpeciesExpandToggle={() => props.onSpeciesExpandToggle(speciesId)}
            onCultivarToggle={props.onCultivarToggle}
            onCultivarDragStart={props.onCultivarDragStart}
            onCultivarDragEnd={props.onCultivarDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/collection/CollectionPane.tsx
git commit -m "feat(collection): CollectionPane (search, chips, species groups, drop target)"
```

---

## Task 17: `TransferControls` component

**Files:**
- Create: `src/components/collection/TransferControls.tsx`

- [ ] **Step 1: Implement**

```tsx
import styles from '../../styles/CollectionEditor.module.css';

interface Props {
  canTransferRight: boolean;
  canTransferLeft: boolean;
  onTransferRight: () => void;
  onTransferLeft: () => void;
}

export function TransferControls({ canTransferRight, canTransferLeft, onTransferRight, onTransferLeft }: Props) {
  return (
    <div className={styles.transfer}>
      <button
        type="button"
        className={styles.transferButton}
        onClick={onTransferRight}
        disabled={!canTransferRight}
        title="Add selected to collection"
      >›</button>
      <button
        type="button"
        className={styles.transferButton}
        onClick={onTransferLeft}
        disabled={!canTransferLeft}
        title="Remove selected from collection"
      >‹</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/collection/TransferControls.tsx
git commit -m "feat(collection): TransferControls"
```

---

## Task 18: `CollectionEditor` modal shell — basic open/close + Cancel/Save

**Files:**
- Create: `src/components/collection/CollectionEditor.tsx`

Composes the panes, transfer controls, footer. Esc handling, click-outside disabled, save warning dialog.

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { findInUseRemovals } from '../../model/collection';
import { getAllCultivars } from '../../model/cultivars';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/CollectionEditor.module.css';
import { useCollectionEditorState } from '../../hooks/useCollectionEditorState';
import { CollectionPane } from './CollectionPane';
import { TransferControls } from './TransferControls';

export function CollectionEditor() {
  const garden = useGardenStore((s) => s.garden);
  const setCollection = useGardenStore((s) => s.setCollection);
  const setOpen = useUiStore((s) => s.setCollectionEditorOpen);
  const database = useMemo(() => getAllCultivars(), []);
  const state = useCollectionEditorState(garden.collection, database);

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [warnRemovals, setWarnRemovals] = useState<string[] | null>(null);

  const pendingIds = useMemo(() => new Set(state.pending.map((c) => c.id)), [state.pending]);
  const leftSource = useMemo(
    () => database.filter((c) => !pendingIds.has(c.id)),
    [database, pendingIds],
  );
  const rightSource = state.pending;

  function close() {
    setOpen(false);
  }

  function attemptCancel() {
    if (state.dirty) setConfirmDiscard(true);
    else close();
  }

  function performCancel() {
    state.cancel();
    setConfirmDiscard(false);
    close();
  }

  function attemptSave() {
    const removed = state.computeRemovedIds();
    const inUse = findInUseRemovals(removed, garden.plantings, garden.seedStarting.seedlings);
    if (inUse.length > 0) {
      setWarnRemovals(inUse);
      return;
    }
    performSave();
  }

  function performSave() {
    setCollection(state.pending);
    setWarnRemovals(null);
    close();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (warnRemovals) setWarnRemovals(null);
        else if (confirmDiscard) setConfirmDiscard(false);
        else attemptCancel();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warnRemovals, confirmDiscard, state.dirty]);

  function dragStart(side: 'left' | 'right', id: string, e: React.DragEvent) {
    e.dataTransfer.setData('application/x-cultivar-id-from-other', id);
    e.dataTransfer.setData('application/x-cultivar-source-side', side);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className={styles.backdrop} /* click-outside disabled — no onClick here */>
      <div className={styles.modal}>
        <div className={styles.header}>Collection</div>
        <div className={styles.body}>
          <CollectionPane
            side="left"
            title="Available"
            source={leftSource}
            visibleCultivars={state.visibleCultivars('left', leftSource)}
            search={state.searchOf('left')}
            onSearchChange={(v) => state.setSearch('left', v)}
            categories={state.categoriesOf('left')}
            onCategoriesChange={(next) => state.setCategories('left', next)}
            expandedSpecies={state.expandedSpecies('left')}
            onSpeciesExpandToggle={(id) => state.toggleSpeciesExpand('left', id)}
            isChecked={(id) => state.leftChecked.has(id)}
            onCultivarToggle={(id) => state.toggleSelection('left', id)}
            speciesTriState={(sid, kids) => state.speciesSelectionState('left', sid, kids)}
            onSpeciesToggle={(sid, kids) => state.toggleSpeciesSelection('left', sid, kids)}
            onCultivarDragStart={(id, e) => dragStart('left', id, e)}
            onCultivarDragEnd={() => {}}
            onDropFromOther={(id) => state.dragTransfer('right', id)}
          />
          <TransferControls
            canTransferRight={state.leftChecked.size > 0}
            canTransferLeft={state.rightChecked.size > 0}
            onTransferRight={() => state.transferRight()}
            onTransferLeft={() => state.transferLeft()}
          />
          <CollectionPane
            side="right"
            title="In Collection"
            source={rightSource}
            visibleCultivars={state.visibleCultivars('right', rightSource)}
            search={state.searchOf('right')}
            onSearchChange={(v) => state.setSearch('right', v)}
            categories={state.categoriesOf('right')}
            onCategoriesChange={(next) => state.setCategories('right', next)}
            expandedSpecies={state.expandedSpecies('right')}
            onSpeciesExpandToggle={(id) => state.toggleSpeciesExpand('right', id)}
            isChecked={(id) => state.rightChecked.has(id)}
            onCultivarToggle={(id) => state.toggleSelection('right', id)}
            speciesTriState={(sid, kids) => state.speciesSelectionState('right', sid, kids)}
            onSpeciesToggle={(sid, kids) => state.toggleSpeciesSelection('right', sid, kids)}
            onCultivarDragStart={(id, e) => dragStart('right', id, e)}
            onCultivarDragEnd={() => {}}
            onDropFromOther={(id) => state.dragTransfer('left', id)}
          />
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.button} onClick={attemptCancel}>Cancel</button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={attemptSave}
            disabled={!state.dirty}
          >Save</button>
        </div>
      </div>

      {confirmDiscard && (
        <div className={styles.backdrop} style={{ zIndex: 1100 }}>
          <div className={styles.confirmDialog}>
            <p>Discard changes?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className={styles.button} onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={performCancel}>Discard</button>
            </div>
          </div>
        </div>
      )}

      {warnRemovals && (
        <div className={styles.backdrop} style={{ zIndex: 1100 }}>
          <div className={styles.confirmDialog}>
            <p>{warnRemovals.length} cultivar{warnRemovals.length === 1 ? '' : 's'} in your garden will no longer appear in palettes:</p>
            <ul>
              {warnRemovals.map((id) => {
                const c = garden.collection.find((cc) => cc.id === id) ?? database.find((cc) => cc.id === id);
                return <li key={id}>{c?.name ?? id}</li>;
              })}
            </ul>
            <p>Existing plantings will remain.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className={styles.button} onClick={() => setWarnRemovals(null)}>Cancel</button>
              <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={performSave}>Save anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

(Note: the hook needs read accessors for search/categories. If `searchOf` and `categoriesOf` weren't exposed in Task 9, add them now: trivial selectors that return the appropriate state piece.)

- [ ] **Step 2: Verify the hook exposes `searchOf` and `categoriesOf`**

If missing, add them to the hook:

```ts
const searchOf = useCallback((side: Side) => (side === 'left' ? searchLeft : searchRight), [searchLeft, searchRight]);
const categoriesOf = useCallback((side: Side) => (side === 'left' ? catsLeft : catsRight), [catsLeft, catsRight]);
```

Expose both, update `CollectionEditorState`. If you do this, also add quick assertions in the existing test file that they read the current values (one assertion each is enough).

- [ ] **Step 3: Build to confirm the component compiles**

Run: `npm run build`.
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/collection/CollectionEditor.tsx src/hooks/useCollectionEditorState.ts src/hooks/useCollectionEditorState.test.ts
git commit -m "feat(collection): CollectionEditor modal (Cancel/Save, Esc, save warning)"
```

---

## Task 19: Wire menu entry

**Files:**
- Modify: `src/components/MenuBar.tsx`

- [ ] **Step 1: Add menu item and modal mount**

In `MenuBar.tsx`:

- Add: `import { useUiStore } from '../store/uiStore';`
- Add: `import { CollectionEditor } from './collection/CollectionEditor';`
- In the component body, add:
  ```ts
  const collectionEditorOpen = useUiStore((s) => s.collectionEditorOpen);
  const setCollectionEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);
  ```
- In the menus row (alongside `New`/`Open`/`Save`), add:
  ```tsx
  <span onClick={() => setCollectionEditorOpen(true)}>Collection…</span>
  ```
- After the existing `{builderOpen && …}` line, add:
  ```tsx
  {collectionEditorOpen && <CollectionEditor />}
  ```

- [ ] **Step 2: Build, smoke-test**

Run: `npm run build`.

Then run the dev server (`npm run dev`) and:
- Click "Collection…" — modal opens.
- Press Esc — modal closes.
- Click Cancel — modal closes (no dirty edits yet).
- Open again, drag a cultivar from left to right, click Save — confirm it persists by reopening.

(Per `docs/behavior.md` and the user's UI workflow, manual browser verification is expected here.)

- [ ] **Step 3: Commit**

```bash
git add src/components/MenuBar.tsx
git commit -m "feat(collection): menu entry to open editor"
```

---

## Task 20: Switch `ObjectPalette` to read from collection

**Files:**
- Modify: `src/components/palette/ObjectPalette.tsx`
- Modify: `src/components/palette/paletteData.ts` (only if it builds the planting `paletteItems` from `getAllCultivars()`)

- [ ] **Step 1: Inspect `paletteData.ts` to find the cultivar source**

Read it. Identify how planting palette entries are constructed (likely via `getAllCultivars()`).

- [ ] **Step 2: Refactor to a runtime function**

If `paletteItems` currently derives planting entries from `getAllCultivars()` at module top-level, extract a function `buildPaletteItems(cultivars: Cultivar[]): PaletteEntry[]` and have the module's exported `paletteItems` continue to call it with the database for backward compatibility (but `ObjectPalette` will switch to the runtime form).

- [ ] **Step 3: Use the garden collection in `ObjectPalette`**

Add at the top:

```tsx
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
```

In the component body:

```tsx
const collection = useGardenStore((s) => s.garden.collection);
const setEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);
```

Build planting entries from `collection` instead of from the static module-level value (replace whatever line currently sources from the database). The non-planting palette items (structures, zones) are unaffected.

- [ ] **Step 4: Empty-state CTA**

Inside the rendered JSX, after the existing planting category render, when `collection.length === 0` AND the planting category would otherwise render empty, add:

```tsx
{collection.length === 0 && (
  <div className={styles.category}>
    <div className={styles.categoryLabel}>Plantings</div>
    <div className={styles.emptyMessage}>
      Your collection is empty.{' '}
      <a href="#" onClick={(e) => { e.preventDefault(); setEditorOpen(true); }}>Edit Collection</a>
    </div>
  </div>
)}
```

(If `styles.emptyMessage` is not present in `ObjectPalette.module.css`, reuse `SeedStartingPalette`'s `.emptyMessage`. The two palette components share `ObjectPalette.module.css` — see `SeedStartingPalette.tsx:9`.)

- [ ] **Step 5: Build, manual smoke**

Run: `npm run build` and load the app. Default garden collection is empty → planting category shows the CTA. Open the editor, add some cultivars, save → planting category populates.

- [ ] **Step 6: Commit**

```bash
git add src/components/palette/ObjectPalette.tsx src/components/palette/paletteData.ts
git commit -m "feat(collection): ObjectPalette reads from collection with empty CTA"
```

---

## Task 21: Switch `SeedStartingPalette` to read from collection

**Files:**
- Modify: `src/components/palette/SeedStartingPalette.tsx`

- [ ] **Step 1: Replace `getAllCultivars()` with the collection**

In `buildSeedablePaletteEntries` (currently `for (const c of getAllCultivars())`), accept a cultivar list parameter:

```ts
function buildSeedablePaletteEntries(cultivars: Cultivar[], filters: AlmanacFilters): PaletteEntry[] {
  // ... existing body, replacing getAllCultivars() with cultivars ...
}
```

In the component body:

```ts
const collection = useGardenStore((s) => s.garden.collection);
const setEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);
const seedables = useMemo(() => buildSeedablePaletteEntries(collection, almanacFilters), [collection, almanacFilters]);
```

- [ ] **Step 2: Empty-state CTA**

Replace the existing "No seedable cultivars" block (`tree.length === 0`) with collection-aware messaging:

```tsx
{tree.length === 0 && (
  <div className={styles.category}>
    <div className={styles.emptyMessage}>
      {collection.length === 0 ? (
        <>
          Your collection is empty.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setEditorOpen(true); }}>Edit Collection</a>
        </>
      ) : (
        'No seedable cultivars in your collection'
      )}
    </div>
  </div>
)}
```

- [ ] **Step 3: Build, manual smoke**

Run: `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/components/palette/SeedStartingPalette.tsx
git commit -m "feat(collection): SeedStartingPalette reads from collection with empty CTA"
```

---

## Task 22: Verify orphan tolerance

**Files:**
- Modify: `src/store/gardenStore.test.ts`

- [ ] **Step 1: Add test**

```ts
describe('collection orphan tolerance', () => {
  it('plantings whose cultivar is not in the collection still resolve via the database', () => {
    const [a] = getAllCultivars();
    useGardenStore.getState().reset();
    // Manually inject a planting referencing a cultivar not in the collection.
    useGardenStore.setState((s) => ({
      garden: {
        ...s.garden,
        plantings: [{ id: 'p1', parentId: 'parent', cultivarId: a.id, x: 0, y: 0, label: '', icon: null }],
        collection: [],
      },
    }));
    // Resolution path is database lookup; simply asserting the planting exists with its id is enough at this layer.
    expect(useGardenStore.getState().garden.plantings[0].cultivarId).toBe(a.id);
    expect(useGardenStore.getState().garden.collection).toEqual([]);
  });
});
```

(The deeper rendering-time resolution stays untouched in this plan; this test documents the data-layer invariant.)

- [ ] **Step 2: Run, verify pass**

Run: `npx vitest run src/store/gardenStore.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/store/gardenStore.test.ts
git commit -m "test(collection): orphan-tolerance invariant"
```

---

## Task 23: Documentation

**Files:**
- Modify: `docs/behavior.md`

- [ ] **Step 1: Append a Collection section**

Add a new `## Collection` section between the existing sections, e.g., after `## Cultivars`:

```markdown
## Collection

- Each garden has a per-garden **collection** of cultivars; only cultivars in the collection appear in the garden palette and the seed-starting palette
- New gardens start with an empty collection — palettes are empty until the user adds cultivars
- The collection is composed via the modal **Collection Editor**, opened from the menu bar ("Collection…") or the empty-state CTA in any cultivar palette
- The editor has two symmetric panes (left = available cultivars, right = in-collection); cultivars transfer between sides via drag-and-drop, checkbox multiselect with `<` / `>` buttons, or a combination
- Each pane has its own search box (matches cultivar name, species name, taxonomic name) and category chips; species rows are collapsible and have a tri-state checkbox over their visible children
- Edits in the editor are staged; Save commits, Cancel discards. Cancel + Esc both close (with a "Discard changes?" confirm if dirty); click-outside is disabled
- On Save, if any cultivars being removed are still referenced by plantings or seedlings in the garden, a warning lists them — existing plantings/seedlings remain (the underlying flora database still resolves them) but the cultivar is unavailable for new placements until re-added
- The collection is stored as a self-contained snapshot (`Cultivar[]`) on the garden; loaded saves missing the field default to empty
```

- [ ] **Step 2: Commit**

```bash
git add docs/behavior.md
git commit -m "docs(collection): describe Collection editor behavior"
```

---

## Task 24: Final verification

- [ ] **Step 1: Run all tests**

Run: `npm test`.
Expected: all pass.

- [ ] **Step 2: Build**

Run: `npm run build`.
Expected: success.

- [ ] **Step 3: Manual smoke run**

Run: `npm run dev`. Visit the local URL and verify:

1. Default state — Plantings palette shows the empty-state CTA; Seed Starting palette likewise.
2. Click CTA → editor opens. Add a few cultivars (drag, then checkbox transfer). Save.
3. Plantings palette now lists the added cultivars; seed-starting palette lists the startable subset.
4. Reopen editor. Search filters work on both sides. Category chips work. Tri-state checkbox toggles correctly.
5. Try to remove a cultivar that's currently used by a planting → save warning appears with the cultivar name; cancel keeps it; "Save anyway" removes from collection but the existing planting still renders on the canvas.
6. Esc with dirty edits → confirm dialog. Click outside the modal → nothing happens.
7. Reload (using Save to file + Open) → collection persists.

- [ ] **Step 4: Update `MEMORY.md` if relevant**

Per the user's preference, log behavior statements to `docs/behavior.md` (already done in Task 23). No memory update required.
