import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useEricCycleTool, type CycleScratch } from './useEricCycleTool';
import { createGardenSceneAdapter } from '../adapters/gardenScene';
import { createInsertAdapter } from '../adapters/insert';
import { useGardenStore, blankGarden } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createStructure } from '../../model/types';

function makeCtx(
  worldX: number,
  worldY: number,
  scratch: CycleScratch,
  opts: Partial<ToolCtx<CycleScratch>> = {},
): ToolCtx<CycleScratch> {
  return {
    worldX,
    worldY,
    modifiers: { alt: true, shift: false, meta: false, ctrl: false, space: false },
    selection: {} as never,
    adapter: null,
    applyBatch: () => {},
    view: { x: 0, y: 0, scale: 50 },
    setView: () => {},
    canvasRect: new DOMRect(0, 0, 800, 600),
    scratch,
    ...opts,
  };
}

function pointer(init: Partial<PointerEventInit> & { altKey?: boolean } = {}): PointerEvent {
  const e = new Event('pointerdown') as PointerEvent;
  Object.assign(e, {
    button: 0, buttons: 1, clientX: 0, clientY: 0,
    altKey: true, shiftKey: false, metaKey: false, ctrlKey: false,
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
    preventDefault: vi.fn(),
    ...init,
  });
  return e;
}

describe('useEricCycleTool — alt+click cycling (regression)', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('passes when no objects hit at the cursor', () => {
    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricCycleTool(adapter));
    const scratch: CycleScratch = { cycled: false };
    const ctx = makeCtx(999, 999, scratch);
    const decision = result.current.pointer!.onDown!(pointer(), ctx);
    expect(decision).toBe('pass');
    expect(scratch.cycled).toBe(false);
  });

  it('claims and cycles through objects at the cursor on repeated alt+clicks', () => {
    // Place two structures overlapping at (1, 1).
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const b = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a, b] },
    }));

    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricCycleTool(adapter));

    // First click → selects the top-most (index 0).
    const scratch1: CycleScratch = { cycled: false };
    const ctx1 = makeCtx(2, 2, scratch1);
    const d1 = result.current.pointer!.onDown!(pointer(), ctx1);
    expect(d1).toBe('claim');
    expect(scratch1.cycled).toBe(true);
    const sel1 = useUiStore.getState().selectedIds;
    expect(sel1).toHaveLength(1);

    // Second click at same spot → advances index.
    const scratch2: CycleScratch = { cycled: false };
    const ctx2 = makeCtx(2, 2, scratch2);
    result.current.pointer!.onDown!(pointer(), ctx2);
    const sel2 = useUiStore.getState().selectedIds;
    expect(sel2).toHaveLength(1);
    // Must differ from first selection (cycled to the other object).
    expect(sel2[0]).not.toBe(sel1[0]);
  });

  it('passes when alt is not held', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a] },
    }));

    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricCycleTool(adapter));

    const scratch: CycleScratch = { cycled: false };
    const ctx = makeCtx(2, 2, scratch, {
      modifiers: { alt: false, shift: false, meta: false, ctrl: false, space: false },
    });
    const decision = result.current.pointer!.onDown!(pointer({ altKey: false }), ctx);
    expect(decision).toBe('pass');
    expect(scratch.cycled).toBe(false);
  });
});

describe('useEricCycleTool — alt+drag clone', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('drag.onStart passes when no cycle happened (no alt+click prior)', () => {
    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricCycleTool(adapter));

    const scratch: CycleScratch = { cycled: false };
    const ctx = makeCtx(2, 2, scratch);
    const decision = result.current.drag!.onStart!(pointer(), ctx);
    expect(decision).toBe('pass');
  });

  it('drag.onStart claims after a cycle-click even without insertAdapter', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a] },
    }));

    const adapter = createGardenSceneAdapter();
    // No insertAdapter passed — clone is stubbed but drag still claims.
    const { result } = renderHook(() => useEricCycleTool(adapter));

    const scratch: CycleScratch = { cycled: false };
    const ctx = makeCtx(2, 2, scratch);
    result.current.pointer!.onDown!(pointer(), ctx);
    expect(scratch.cycled).toBe(true);

    const dragDecision = result.current.drag!.onStart!(pointer(), ctx);
    expect(dragDecision).toBe('claim');
  });

  it('alt+drag commits a clone: original is not moved, duplicate appears', async () => {
    // Set up a structure at (0,0) so we can alt+drag it.
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a] },
    }));

    const adapter = createGardenSceneAdapter();
    const insertAdapter = createInsertAdapter();
    const { result } = renderHook(() => useEricCycleTool(adapter, insertAdapter));

    // Step 1: alt+click (cycle) on the structure at (2, 2).
    const scratch: CycleScratch = { cycled: false };
    const downCtx = makeCtx(2, 2, scratch);
    act(() => {
      result.current.pointer!.onDown!(pointer(), downCtx);
    });
    expect(scratch.cycled).toBe(true);
    expect(useUiStore.getState().selectedIds).toContain(a.id);

    // Step 2: drag starts.
    act(() => {
      result.current.drag!.onStart!(pointer(), downCtx);
    });

    // Step 3: drag moves to (10, 10).
    const moveCtx = makeCtx(10, 10, scratch);
    act(() => {
      result.current.drag!.onMove!(pointer(), moveCtx);
    });

    // Step 4: drag ends at (10, 10).
    act(() => {
      result.current.drag!.onEnd!(pointer(), moveCtx);
    });

    // The original structure is unchanged at (0, 0).
    const finalStructures = useGardenStore.getState().garden.structures;
    const original = finalStructures.find((s) => s.id === a.id);
    expect(original).toBeDefined();
    expect(original!.x).toBe(0);
    expect(original!.y).toBe(0);

    // A duplicate appeared (two structures now exist with the same type).
    expect(finalStructures.length).toBe(2);
    const clone = finalStructures.find((s) => s.id !== a.id);
    expect(clone).toBeDefined();
  });

  it('plain drag (no alt cycle) still calls through to pass — no clone', () => {
    const a = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a] },
    }));

    const adapter = createGardenSceneAdapter();
    const insertAdapter = createInsertAdapter();
    const { result } = renderHook(() => useEricCycleTool(adapter, insertAdapter));

    // No prior click → cycled=false → drag passes.
    const scratch: CycleScratch = { cycled: false };
    const ctx = makeCtx(2, 2, scratch);
    const decision = result.current.drag!.onStart!(pointer(), ctx);
    expect(decision).toBe('pass');
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });
});
