import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { snapshotCultivar } from '../model/collection';
import type { Collection } from '../model/collection';
import { getAllCultivars } from '../model/cultivars';
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
