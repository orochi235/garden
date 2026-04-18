import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboard } from './useClipboard';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

describe('useClipboard', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.isEmpty()).toBe(true);
  });

  it('copies selected structures to clipboard', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy());

    expect(result.current.isEmpty()).toBe(false);
  });

  it('does nothing when copying with no selection', () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy());
    expect(result.current.isEmpty()).toBe(true);
  });

  it('pastes copied structures with offset', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 2, y: 3, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy());
    act(() => result.current.paste());

    const structures = useGardenStore.getState().garden.structures;
    expect(structures).toHaveLength(2);
    const cellSize = useGardenStore.getState().garden.gridCellSizeFt;
    expect(structures[1].x).toBe(2 + cellSize);
    expect(structures[1].y).toBe(3 + cellSize);
  });

  it('selects pasted objects', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy());
    act(() => result.current.paste());

    const selectedIds = useUiStore.getState().selectedIds;
    const structures = useGardenStore.getState().garden.structures;
    expect(selectedIds).toEqual([structures[1].id]);
  });

  it('cascades repeated pastes', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy());
    act(() => result.current.paste());
    act(() => result.current.paste());

    const structures = useGardenStore.getState().garden.structures;
    expect(structures).toHaveLength(3);
    const cellSize = useGardenStore.getState().garden.gridCellSizeFt;
    // Each paste offsets from the previous paste's position
    expect(structures[2].x).toBe(structures[1].x + cellSize);
    expect(structures[2].y).toBe(structures[1].y + cellSize);
  });

  it('copies and pastes zones', () => {
    useGardenStore.getState().addZone({ x: 1, y: 1, width: 5, height: 5 });
    const id = useGardenStore.getState().garden.zones[0].id;
    useUiStore.getState().select(id);

    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy());
    act(() => result.current.paste());

    const zones = useGardenStore.getState().garden.zones;
    expect(zones).toHaveLength(2);
  });

  it('does not paste when clipboard is empty', () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.paste());

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
  });
});
