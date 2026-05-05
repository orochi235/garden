import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useSowCellTool, type SowScratch } from './useSowCellTool';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray, trayInteriorOffsetIn } from '../../model/seedStarting';

function makeCtx(worldX: number, worldY: number, scratch: SowScratch): ToolCtx<SowScratch> {
  return {
    worldX,
    worldY,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, space: false },
    selection: {} as never,
    adapter: null,
    applyBatch: () => {},
    view: { x: 0, y: 0, scale: 50 },
    setView: () => {},
    canvasRect: new DOMRect(0, 0, 200, 200),
    scratch,
  };
}

function makeClick(): PointerEvent {
  const e = new Event('click') as PointerEvent;
  Object.assign(e, { button: 0, clientX: 0, clientY: 0 });
  return e;
}

describe('useSowCellTool', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('passes when no cultivar is set (neither drag nor armed)', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    const { result } = renderHook(() => useSowCellTool());
    const off = trayInteriorOffsetIn(tray);
    const ctx = makeCtx(off.x + 0.1, off.y + 0.1, { handled: false });
    expect(result.current.pointer!.onClick!(makeClick(), ctx)).toBe('pass');
  });

  it('claims and sows when armedCultivarId is set', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setArmedCultivarId('tomato');

    const { result } = renderHook(() => useSowCellTool());
    const off = trayInteriorOffsetIn(tray);
    const ctx = makeCtx(off.x + 0.1, off.y + 0.1, { handled: false });
    expect(result.current.pointer!.onClick!(makeClick(), ctx)).toBe('claim');
    const seedlings = useGardenStore.getState().garden.seedStarting.seedlings;
    expect(seedlings).toHaveLength(1);
    expect(seedlings[0].cultivarId).toBe('tomato');
    expect(seedlings[0].row).toBe(0);
    expect(seedlings[0].col).toBe(0);
  });

  it('prefers seedDragCultivarId over armedCultivarId when both set', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setSeedDragCultivarId('basil');
    useUiStore.getState().setArmedCultivarId('tomato');

    const { result } = renderHook(() => useSowCellTool());
    const off = trayInteriorOffsetIn(tray);
    const ctx = makeCtx(off.x + 0.1, off.y + 0.1, { handled: false });
    result.current.pointer!.onClick!(makeClick(), ctx);
    const seedlings = useGardenStore.getState().garden.seedStarting.seedlings;
    expect(seedlings).toHaveLength(1);
    expect(seedlings[0].cultivarId).toBe('basil');
  });

  it('passes on occupied cell without shift', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setArmedCultivarId('tomato');
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'basil');

    const { result } = renderHook(() => useSowCellTool());
    const off = trayInteriorOffsetIn(tray);
    const ctx = makeCtx(off.x + 0.1, off.y + 0.1, { handled: false });
    expect(result.current.pointer!.onClick!(makeClick(), ctx)).toBe('pass');
  });

  it('does not auto-disarm after a sow', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setArmedCultivarId('tomato');

    const { result } = renderHook(() => useSowCellTool());
    const off = trayInteriorOffsetIn(tray);
    const ctx = makeCtx(off.x + 0.1, off.y + 0.1, { handled: false });
    result.current.pointer!.onClick!(makeClick(), ctx);
    expect(useUiStore.getState().armedCultivarId).toBe('tomato');
  });
});
