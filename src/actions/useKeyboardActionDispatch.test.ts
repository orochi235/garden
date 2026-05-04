import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankGarden, useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useKeyboardActionDispatch } from './useKeyboardActionDispatch';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useKeyboardActionDispatch', () => {
  const mockClipboard = { copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) };

  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
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

  it('does not intercept OS shortcuts when canvas is focused', () => {
    setup();

    const osShortcuts: KeyboardEventInit[] = [
      { key: 'Tab', metaKey: true },        // Cmd+Tab (app switcher)
      { key: 'Tab', metaKey: true, shiftKey: true }, // Cmd+Shift+Tab
      { key: 'q', metaKey: true },           // Cmd+Q (quit)
      { key: 'w', metaKey: true },           // Cmd+W (close window)
      { key: 'h', metaKey: true },           // Cmd+H (hide)
      { key: 'm', metaKey: true },           // Cmd+M (minimize)
      { key: ' ', metaKey: true },           // Cmd+Space (Spotlight)
      { key: 'Tab', altKey: true },          // Alt+Tab
      { key: 'F4', altKey: true },           // Alt+F4 (close, Windows)
      { key: 'l', metaKey: true },           // Cmd+L (address bar)
      { key: 't', metaKey: true },           // Cmd+T (new tab)
      { key: 'n', metaKey: true },           // Cmd+N (new window)
      { key: 'r', metaKey: true },           // Cmd+R (reload)
      { key: '0', metaKey: true },           // Cmd+0 (reset zoom)
    ];

    for (const opts of osShortcuts) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
      const prevented = !window.dispatchEvent(event);
      const label = [
        opts.metaKey && 'Cmd',
        opts.ctrlKey && 'Ctrl',
        opts.altKey && 'Alt',
        opts.shiftKey && 'Shift',
        opts.key,
      ].filter(Boolean).join('+');
      expect(prevented, `${label} should not be intercepted`).toBe(false);
    }
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
