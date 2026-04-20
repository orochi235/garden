import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useKeyboardActionDispatch } from './useKeyboardActionDispatch';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useKeyboardActionDispatch', () => {
  const mockClipboard = { copy: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) };

  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    vi.clearAllMocks();
  });

  function setup() {
    return renderHook(() => useKeyboardActionDispatch({ clipboard: mockClipboard }));
  }

  it('dispatches undo on Cmd+Z', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);

    setup();
    fireKey('z', { metaKey: true });

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('dispatches selectAll on Cmd+A', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');

    setup();
    fireKey('a', { metaKey: true });

    expect(useUiStore.getState().selectedIds).toHaveLength(2);
  });

  it('dispatches delete on Backspace when objects selected', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    setup();
    fireKey('Backspace');

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('does not dispatch canvas-scoped actions when input is focused', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    setup();
    fireKey('Backspace');

    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    document.body.removeChild(input);
  });

  it('auto-checkpoints non-transient actions', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    setup();
    fireKey('Backspace');

    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });
});
