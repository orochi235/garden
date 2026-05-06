import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useSeedSelectTool, type SeedSelectScratch } from './useSeedSelectTool';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray, trayInteriorOffsetIn } from '../../model/seedStarting';
import { createSeedStartingSceneAdapter } from '../adapters/seedStartingScene';
import { AREA_SELECT_DRAG_KIND } from '../drag/areaSelectDrag';

function makeCtx(
  worldX: number,
  worldY: number,
  scratch: SeedSelectScratch,
  overrides: Partial<ToolCtx<SeedSelectScratch>> = {},
): ToolCtx<SeedSelectScratch> {
  return {
    worldX,
    worldY,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, space: false },
    selection: {} as never,
    adapter: null,
    applyBatch: () => {},
    view: { x: 0, y: 0, scale: 50 },
    setView: () => {},
    canvasRect: new DOMRect(0, 0, 800, 600),
    scratch,
    ...overrides,
  };
}

function pointer(): PointerEvent {
  const e = new Event('pointerdown') as PointerEvent;
  Object.assign(e, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
  return e;
}

function renderTool() {
  const adapter = createSeedStartingSceneAdapter();
  return renderHook(() => useSeedSelectTool(adapter));
}

describe('useSeedSelectTool', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('claims pointer-down on empty tray background', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);

    const { result } = renderTool();
    const tool = result.current;

    // Down outside any seedling — far in the corner, but still over the tray.
    const scratch = tool.initScratch!() as SeedSelectScratch;
    const ctx = makeCtx(-100, -100, scratch); // off-tray empty space
    const decision = tool.pointer!.onDown!(pointer(), ctx);
    expect(decision).toBe('claim');
  });

  it('passes pointer-down on a seedling so the move tool handles it', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');

    const { result } = renderTool();
    const tool = result.current;
    const off = trayInteriorOffsetIn(tray);
    const cellCx = off.x + 0.5 * tray.cellPitchIn;
    const cellCy = off.y + 0.5 * tray.cellPitchIn;
    const scratch = tool.initScratch!() as SeedSelectScratch;
    const ctx = makeCtx(cellCx, cellCy, scratch);
    const decision = tool.pointer!.onDown!(pointer(), ctx);
    expect(decision).toBe('pass');
  });

  it('drag from empty draws marquee then selects intersected seedlings on release', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    useGardenStore.getState().sowCell(tray.id, 0, 1, 'tomato');
    useGardenStore.getState().sowCell(tray.id, 1, 2, 'tomato');
    const ss = useGardenStore.getState().garden.seedStarting;
    const sIds = ss.seedlings.map((s) => s.id);

    const { result } = renderTool();
    const tool = result.current;

    const scratch = tool.initScratch!() as SeedSelectScratch;
    // Start outside the tray, sweep across just the first row.
    const off = trayInteriorOffsetIn(tray);
    const start = makeCtx(-1, -1, scratch);
    tool.pointer!.onDown!(pointer(), start);
    tool.drag!.onStart!(pointer(), start);

    // dragPreview slot should mirror the marquee while in flight (after onMove).
    const moveCtx = makeCtx(off.x + 1.5 * tray.cellPitchIn, off.y + 0.5 * tray.cellPitchIn, scratch);
    tool.drag!.onMove!(pointer(), moveCtx);
    expect(useUiStore.getState().dragPreview?.kind).toBe(AREA_SELECT_DRAG_KIND);

    // Release: should select the two row-0 seedlings whose centers are inside.
    tool.drag!.onEnd!(pointer(), moveCtx);
    const selected = useUiStore.getState().selectedIds;
    const row0 = ss.seedlings.filter((s) => s.row === 0).map((s) => s.id);
    expect(selected.sort()).toEqual(row0.sort());
    // dragPreview cleared on release.
    expect(useUiStore.getState().dragPreview).toBeNull();
    void sIds;
  });

  it('shift-drag adds to existing selection rather than replacing', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    useGardenStore.getState().sowCell(tray.id, 1, 2, 'tomato');
    const ss = useGardenStore.getState().garden.seedStarting;
    const [s0, s1] = ss.seedlings;
    useUiStore.getState().setSelection([s1.id]);

    const { result } = renderTool();
    const tool = result.current;
    const off = trayInteriorOffsetIn(tray);
    const scratch = tool.initScratch!() as SeedSelectScratch;
    const start = makeCtx(-1, -1, scratch, {
      modifiers: { alt: false, shift: true, meta: false, ctrl: false, space: false },
    });
    tool.pointer!.onDown!(pointer(), start);
    tool.drag!.onStart!(pointer(), start);
    const move = makeCtx(off.x + 0.5 * tray.cellPitchIn, off.y + 0.5 * tray.cellPitchIn, scratch, {
      modifiers: { alt: false, shift: true, meta: false, ctrl: false, space: false },
    });
    tool.drag!.onMove!(pointer(), move);
    tool.drag!.onEnd!(pointer(), move);
    expect(useUiStore.getState().selectedIds.sort()).toEqual([s0.id, s1.id].sort());
  });

  it('click-on-empty (no drag) clears selection', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;
    useUiStore.getState().setSelection([sId]);

    const { result } = renderTool();
    const tool = result.current;
    const scratch = tool.initScratch!() as SeedSelectScratch;
    const ctx = makeCtx(-100, -100, scratch);
    const decision = tool.pointer!.onClick!(pointer(), ctx);
    expect(decision).toBe('claim');
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('click-on-seedling passes through (move tool will handle selection)', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');

    const { result } = renderTool();
    const tool = result.current;
    const off = trayInteriorOffsetIn(tray);
    const scratch = tool.initScratch!() as SeedSelectScratch;
    const ctx = makeCtx(off.x + 0.5 * tray.cellPitchIn, off.y + 0.5 * tray.cellPitchIn, scratch);
    const decision = tool.pointer!.onClick!(pointer(), ctx);
    expect(decision).toBe('pass');
  });
});
