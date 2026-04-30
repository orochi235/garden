import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { snapshotCultivar } from '../model/collection';
import type { Collection } from '../model/collection';
import { getAllCultivars } from '../model/cultivars';
import type { Cultivar } from '../model/cultivars';
import { getSpecies } from '../model/species';
import { useCollectionEditorState } from './useCollectionEditorState';

describe('useCollectionEditorState — initial state', () => {
  it('mirrors the committed collection in pending state', () => {
    const [a] = getAllCultivars();
    const committed = [snapshotCultivar(a)];
    const { result } = renderHook(() => useCollectionEditorState(committed, getAllCultivars()));
    expect(result.current.pending.map((c) => c.id)).toEqual([a.id]);
    expect(result.current.dirty).toBe(false);
    expect(result.current.checked).toEqual(new Set());
  });

  it('expands all database species by default', () => {
    const db = getAllCultivars().slice(0, 4);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    for (const c of db) {
      expect(result.current.expandedSpecies.has(c.speciesId)).toBe(true);
    }
  });
});

describe('useCollectionEditorState — selection', () => {
  it('toggles individual cultivar checkboxes', () => {
    const cultivars = getAllCultivars().slice(0, 2);
    const { result } = renderHook(() => useCollectionEditorState([], cultivars));
    act(() => result.current.toggleChecked(cultivars[1].id));
    expect(result.current.checked.has(cultivars[1].id)).toBe(true);
    act(() => result.current.toggleChecked(cultivars[1].id));
    expect(result.current.checked.has(cultivars[1].id)).toBe(false);
  });
});

describe('useCollectionEditorState — transfer', () => {
  it('transferRight adds checked items to pending and clears the checks', () => {
    const db = getAllCultivars().slice(0, 3);
    const committed: Collection = [];
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => {
      result.current.toggleChecked(db[0].id);
      result.current.toggleChecked(db[1].id);
    });
    act(() => result.current.transferRight());
    expect(result.current.pending.map((c) => c.id).sort()).toEqual([db[0].id, db[1].id].sort());
    expect(result.current.checked.size).toBe(0);
    expect(result.current.dirty).toBe(true);
  });

  it('removeOne removes from pending', () => {
    const db = getAllCultivars().slice(0, 2);
    const committed = db.map((c) => ({ ...c }));
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => result.current.removeOne(db[0].id));
    expect(result.current.pending.map((c) => c.id)).toEqual([db[1].id]);
    expect(result.current.dirty).toBe(true);
  });

  it('addOne adds a single cultivar and unchecks it if present', () => {
    const db = getAllCultivars().slice(0, 2);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.toggleChecked(db[0].id));
    act(() => result.current.addOne(db[0].id));
    expect(result.current.pending.map((c) => c.id)).toEqual([db[0].id]);
    expect(result.current.checked.has(db[0].id)).toBe(false);
  });

  it('dirty returns to false when add-then-remove restores the committed set', () => {
    const db = getAllCultivars().slice(0, 1);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.addOne(db[0].id));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.removeOne(db[0].id));
    expect(result.current.dirty).toBe(false);
  });
});

describe('useCollectionEditorState — search and categories', () => {
  it('search narrows by cultivar name (case-insensitive)', () => {
    const db = getAllCultivars();
    const { result } = renderHook(() => useCollectionEditorState([], db));
    const target = db[0];
    act(() => result.current.setSearch(target.name.slice(0, 3).toLowerCase()));
    expect(result.current.visibleCultivars(db).some((c) => c.id === target.id)).toBe(true);
  });

  it('search matches species name (substring haystack)', () => {
    const db = getAllCultivars();
    const target = db[0];
    const speciesName = getSpecies(target.speciesId)!.name;
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.setSearch(speciesName));
    const visible = result.current.visibleCultivars(db);
    expect(visible.some((c) => c.id === target.id)).toBe(true);
    const needle = speciesName.toLowerCase();
    expect(visible.every((c) => {
      const sp = getSpecies(c.speciesId);
      const haystack = [c.name, sp?.name ?? '', sp?.taxonomicName ?? ''].join(' ').toLowerCase();
      return haystack.includes(needle);
    })).toBe(true);
  });

  it('category filter restricts to selected categories; empty = no restriction', () => {
    const db = getAllCultivars();
    const { result } = renderHook(() => useCollectionEditorState([], db));
    expect(result.current.visibleCultivars(db).length).toBe(db.length);
    act(() => result.current.setCategories(new Set(['herbs'])));
    expect(result.current.visibleCultivars(db).every((c) => c.category === 'herbs')).toBe(true);
  });
});

describe('useCollectionEditorState — expansion', () => {
  it('toggleSpeciesExpand toggles expansion of a species id', () => {
    const db = getAllCultivars().slice(0, 1);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    expect(result.current.expandedSpecies.has(db[0].speciesId)).toBe(true);
    act(() => result.current.toggleSpeciesExpand(db[0].speciesId));
    expect(result.current.expandedSpecies.has(db[0].speciesId)).toBe(false);
    act(() => result.current.toggleSpeciesExpand(db[0].speciesId));
    expect(result.current.expandedSpecies.has(db[0].speciesId)).toBe(true);
  });
});

describe('useCollectionEditorState — species selection', () => {
  function pickSpeciesWith(min: number, db: Cultivar[]) {
    const groups = new Map<string, Cultivar[]>();
    for (const c of db) {
      const list = groups.get(c.speciesId) ?? [];
      list.push(c);
      groups.set(c.speciesId, list);
    }
    return [...groups.entries()].find(([, l]) => l.length >= min)!;
  }

  it('tri-state reflects none/some/all of visible children', () => {
    const db = getAllCultivars();
    const [, children] = pickSpeciesWith(2, db);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    expect(result.current.speciesSelectionState(children)).toBe('none');
    act(() => result.current.toggleChecked(children[0].id));
    expect(result.current.speciesSelectionState(children)).toBe(
      children.length === 1 ? 'all' : 'some',
    );
  });

  it('toggleSpeciesSelection bulk-adds then bulk-removes', () => {
    const db = getAllCultivars();
    const [, children] = pickSpeciesWith(2, db);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.toggleSpeciesSelection(children));
    for (const c of children) expect(result.current.checked.has(c.id)).toBe(true);
    act(() => result.current.toggleSpeciesSelection(children));
    for (const c of children) expect(result.current.checked.has(c.id)).toBe(false);
  });
});

describe('useCollectionEditorState — sort', () => {
  it('setSort sets ascending on a new column; toggles direction on the same column', () => {
    const db = getAllCultivars();
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.setSort('name'));
    expect(result.current.sortColumn).toBe('name');
    expect(result.current.sortDir).toBe('asc');
    act(() => result.current.setSort('name'));
    expect(result.current.sortDir).toBe('desc');
    act(() => result.current.setSort('category'));
    expect(result.current.sortColumn).toBe('category');
    expect(result.current.sortDir).toBe('asc');
  });
});

describe('useCollectionEditorState — cancel and removed-ids', () => {
  it('cancel restores pending to committed and clears selections', () => {
    const db = getAllCultivars().slice(0, 1);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.toggleChecked(db[0].id));
    act(() => result.current.transferRight());
    expect(result.current.dirty).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.pending).toEqual([]);
    expect(result.current.dirty).toBe(false);
    expect(result.current.checked.size).toBe(0);
  });

  it('computeRemovedIds returns ids in committed but not pending', () => {
    const db = getAllCultivars().slice(0, 2);
    const committed = db.map((c) => ({ ...c }));
    const { result } = renderHook(() => useCollectionEditorState(committed, db));
    act(() => result.current.removeOne(db[0].id));
    expect(result.current.computeRemovedIds()).toEqual([db[0].id]);
  });
});
