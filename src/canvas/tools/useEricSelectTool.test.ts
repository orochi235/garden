import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useEricSelectTool, type SelectScratch } from './useEricSelectTool';
import { createGardenSceneAdapter } from '../adapters/gardenScene';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

function makeCtx(
  worldX: number,
  worldY: number,
  scratch: SelectScratch,
  adapter: unknown,
): ToolCtx<SelectScratch> {
  return {
    worldX,
    worldY,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, space: false },
    selection: {} as never,
    adapter,
    applyBatch: () => {},
    view: { x: 0, y: 0, scale: 50 },
    setView: () => {},
    canvasRect: new DOMRect(0, 0, 800, 600),
    scratch,
  };
}

function pointer(init: Partial<PointerEventInit> = {}): PointerEvent {
  // jsdom may not have a PointerEvent ctor that accepts all fields; fake one.
  const e = new Event('pointerdown') as PointerEvent;
  Object.assign(e, {
    button: 0, buttons: 1, clientX: 0, clientY: 0,
    altKey: false, shiftKey: false, metaKey: false, ctrlKey: false,
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
    ...init,
  });
  return e;
}

describe('useEricSelectTool — forceMarquee (select-area)', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('drag started on a structure body produces a marquee, not a move', () => {
    // Place a structure that the cursor will land on.
    useGardenStore.getState().addStructure({
      type: 'raised-bed',
      x: 0, y: 0, width: 4, height: 4,
    });
    const adapter = createGardenSceneAdapter();
    // Sanity: hitTest finds it.
    expect(adapter.hitTest(2, 2)).not.toBeNull();

    const { result } = renderHook(() => useEricSelectTool(adapter, { forceMarquee: true }));

    const scratch: SelectScratch = { kind: 'idle' };
    const ctx = makeCtx(2, 2, scratch, adapter);
    const decision = result.current.pointer!.onDown!(pointer(), ctx);
    expect(decision).toBe('claim');
    // Body hit should have been ignored — scratch is 'area' (marquee), not 'move'.
    expect(ctx.scratch.kind).toBe('area');

    // drag.onStart with 'area' scratch should also claim and not initiate a move.
    const dragDecision = result.current.drag!.onStart!(pointer(), ctx);
    expect(dragDecision).toBe('claim');
  });

  it('regular select tool (no forceMarquee) still initiates move on body drag', () => {
    useGardenStore.getState().addStructure({
      type: 'raised-bed',
      x: 0, y: 0, width: 4, height: 4,
    });
    const adapter = createGardenSceneAdapter();

    const { result } = renderHook(() => useEricSelectTool(adapter));

    const scratch: SelectScratch = { kind: 'idle' };
    const ctx = makeCtx(2, 2, scratch, adapter);
    result.current.pointer!.onDown!(pointer(), ctx);
    expect(ctx.scratch.kind).toBe('move');
  });

  it('forceMarquee tool exposes a distinct id when toolId is given', () => {
    const adapter = createGardenSceneAdapter();
    const { result: a } = renderHook(() => useEricSelectTool(adapter));
    const { result: b } = renderHook(() => useEricSelectTool(adapter, { forceMarquee: true, toolId: 'eric-select-area' }));
    expect(a.current.id).toBe('eric-select');
    expect(b.current.id).toBe('eric-select-area');
  });

  it('forceMarquee: empty-space click still clears selection', () => {
    useUiStore.getState().setSelection(['fake']);
    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricSelectTool(adapter, { forceMarquee: true }));

    const scratch: SelectScratch = { kind: 'idle' };
    // far from any structure — empty space.
    const ctx = makeCtx(999, 999, scratch, adapter);
    result.current.pointer!.onDown!(pointer(), ctx);
    expect(ctx.scratch.kind).toBe('area');
    result.current.pointer!.onClick!(pointer(), ctx);
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });
});

// Suppress unused vi import warning if vi.fn isn't directly used here.
void vi;
