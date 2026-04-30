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
    expect(result.current.leftChecked).toEqual(new Set());
    expect(result.current.rightChecked).toEqual(new Set());
  });
});

describe('useCollectionEditorState — selection', () => {
  it('toggles individual cultivar checkboxes per side', () => {
    const cultivars = getAllCultivars().slice(0, 2);
    const committed = [snapshotCultivar(cultivars[0])];
    const { result } = renderHook(() => useCollectionEditorState(committed, getAllCultivars()));
    act(() => result.current.toggleSelection('left', cultivars[1].id));
    expect(result.current.leftChecked.has(cultivars[1].id)).toBe(true);
    act(() => result.current.toggleSelection('left', cultivars[1].id));
    expect(result.current.leftChecked.has(cultivars[1].id)).toBe(false);
  });
});

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

describe('useCollectionEditorState — drag transfer', () => {
  it('drag of an unchecked row from left transfers just that row, keeping selections intact', () => {
    const db = getAllCultivars().slice(0, 2);
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.toggleSelection('left', db[1].id));
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

describe('useCollectionEditorState — search and categories', () => {
  it('search narrows by cultivar name (case-insensitive)', () => {
    const db = getAllCultivars();
    const { result } = renderHook(() => useCollectionEditorState([], db));
    const target = db[0];
    act(() => result.current.setSearch('left', target.name.slice(0, 3).toLowerCase()));
    expect(result.current.visibleCultivars('left', db).some((c) => c.id === target.id)).toBe(true);
  });

  it('search matches species name (substring haystack)', () => {
    const db = getAllCultivars();
    const target = db[0];
    const speciesName = getSpecies(target.speciesId)!.name;
    const { result } = renderHook(() => useCollectionEditorState([], db));
    act(() => result.current.setSearch('left', speciesName));
    const visible = result.current.visibleCultivars('left', db);
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
    expect(result.current.visibleCultivars('left', db).length).toBe(db.length);
    act(() => result.current.setCategories('left', new Set(['herbs'])));
    expect(result.current.visibleCultivars('left', db).every((c) => c.category === 'herbs')).toBe(true);
  });
});

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

describe('useCollectionEditorState — species selection', () => {
  it('tri-state reflects none/some/all of visible children', () => {
    const db = getAllCultivars();
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
    expect(result.current.speciesSelectionState('left', speciesId, children)).toBe(children.length === 2 ? 'all' : 'some');
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

  it('toggleSpeciesSelection from "all" deselects all visible children', () => {
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
    act(() => result.current.toggleSpeciesSelection('left', speciesId, children));
    for (const c of children) {
      expect(result.current.leftChecked.has(c.id)).toBe(false);
    }
  });
});
