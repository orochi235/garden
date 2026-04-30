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
