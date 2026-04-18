import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCanvasKeyboard } from './useCanvasKeyboard';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useCanvasKeyboard', () => {
  const mockClipboard = { copy: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) };
  const mockCancelPlotting = vi.fn();

  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    vi.clearAllMocks();
  });

  function setup() {
    return renderHook(() => useCanvasKeyboard({ clipboard: mockClipboard, cancelPlotting: mockCancelPlotting }));
  }

  it('calls undo on Cmd+Z', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);

    setup();
    fireKey('z', { metaKey: true });

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('calls redo on Cmd+Shift+Z', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);

    setup();
    fireKey('z', { metaKey: true, shiftKey: true });

    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('calls clipboard.copy on Cmd+C', () => {
    setup();
    fireKey('c', { metaKey: true });
    expect(mockClipboard.copy).toHaveBeenCalledOnce();
  });

  it('calls clipboard.paste on Cmd+V', () => {
    setup();
    fireKey('v', { metaKey: true });
    expect(mockClipboard.paste).toHaveBeenCalledOnce();
  });

  it('does not paste when clipboard is empty', () => {
    mockClipboard.isEmpty.mockReturnValue(true);
    setup();
    fireKey('v', { metaKey: true });
    expect(mockClipboard.paste).not.toHaveBeenCalled();
  });

  it('calls cancelPlotting on Escape', () => {
    setup();
    fireKey('Escape');
    expect(mockCancelPlotting).toHaveBeenCalledOnce();
  });

  it('deletes selected objects on Delete', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    setup();
    fireKey('Delete');

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('deletes selected objects on Backspace', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
    const id = useGardenStore.getState().garden.zones[0].id;
    useUiStore.getState().select(id);

    setup();
    fireKey('Backspace');

    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('cleans up listener on unmount', () => {
    const { unmount } = setup();
    unmount();

    // After unmount, keys should not trigger actions
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const count = useGardenStore.getState().garden.structures.length;
    fireKey('z', { metaKey: true });
    expect(useGardenStore.getState().garden.structures).toHaveLength(count);
  });
});
