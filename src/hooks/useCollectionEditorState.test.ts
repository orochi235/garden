import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { snapshotCultivar } from '../model/collection';
import type { Collection } from '../model/collection';
import { getAllCultivars } from '../model/cultivars';
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
