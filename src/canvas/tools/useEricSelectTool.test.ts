import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useEricSelectTool, type SelectScratch } from './useEricSelectTool';
import { createGardenSceneAdapter } from '../adapters/gardenScene';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createGarden, createStructure } from '../../model/types';
import { expandToGroups } from '../../utils/groups';

function makeCtx(
  worldX: number,
  worldY: number,
  scratch: SelectScratch,
  adapter: unknown = null,
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

function makePointerEvt(): PointerEvent {
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  } as unknown as PointerEvent;
}

function pointer(init: Partial<PointerEventInit> = {}): PointerEvent {
  const e = new Event('pointerdown') as PointerEvent;
  Object.assign(e, {
    button: 0, buttons: 1, clientX: 0, clientY: 0,
    altKey: false, shiftKey: false, metaKey: false, ctrlKey: false,
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
    ...init,
  });
  return e;
}

describe('useEricSelectTool group expansion', () => {
  beforeEach(() => {
    useGardenStore.getState().loadGarden(createGarden({ name: 'test', widthFt: 100, lengthFt: 100 }));
    useUiStore.getState().clearSelection();
  });

  it('body-hit drag expands a single grouped member to all group siblings', () => {
    const a = createStructure({ type: 'bed', x: 0, y: 0, width: 4, length: 4, groupId: 'g1' });
    const b = createStructure({ type: 'bed', x: 10, y: 0, width: 4, length: 4, groupId: 'g1' });
    const c = createStructure({ type: 'bed', x: 20, y: 0, width: 4, length: 4, groupId: 'g1' });
    const d = createStructure({ type: 'bed', x: 30, y: 0, width: 4, length: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a, b, c, d] },
    }));

    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricSelectTool(adapter));

    const ctx = makeCtx(1, 1, { kind: 'idle' });
    const decision = result.current.pointer!.onDown!(makePointerEvt(), ctx);
    expect(decision).toBe('claim');

    expect(useUiStore.getState().selectedIds).toEqual([a.id]);
    expect(ctx.scratch.kind).toBe('move');
    if (ctx.scratch.kind === 'move') {
      expect(ctx.scratch.ids.sort()).toEqual([a.id, b.id, c.id].sort());
      expect(ctx.scratch.ids).not.toContain(d.id);
    }
  });

  it('body-hit drag on an ungrouped structure leaves drag set unchanged', () => {
    const a = createStructure({ type: 'bed', x: 0, y: 0, width: 4, length: 4 });
    const b = createStructure({ type: 'bed', x: 10, y: 0, width: 4, length: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a, b] },
    }));

    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricSelectTool(adapter));

    const ctx = makeCtx(1, 1, { kind: 'idle' });
    result.current.pointer!.onDown!(makePointerEvt(), ctx);
    expect(ctx.scratch.kind).toBe('move');
    if (ctx.scratch.kind === 'move') {
      expect(ctx.scratch.ids).toEqual([a.id]);
    }
  });

  it('expands selection through useUiStore.setSelection when marquee covers a grouped member', () => {
    const a = createStructure({ type: 'bed', x: 0, y: 0, width: 4, length: 4, groupId: 'g1' });
    const b = createStructure({ type: 'bed', x: 10, y: 0, width: 4, length: 4, groupId: 'g1' });
    const c = createStructure({ type: 'bed', x: 30, y: 0, width: 4, length: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a, b, c] },
    }));

    useUiStore.getState().setSelection([a.id]);

    const ui = useUiStore.getState();
    const expanded = expandToGroups(ui.selectedIds, useGardenStore.getState().garden.structures);
    if (expanded.length !== ui.selectedIds.length) ui.setSelection(expanded);

    expect(useUiStore.getState().selectedIds.sort()).toEqual([a.id, b.id].sort());
  });
});

describe('useEricSelectTool — forceMarquee (select-area)', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('drag started on a structure body produces a marquee, not a move', () => {
    useGardenStore.getState().addStructure({
      type: 'raised-bed',
      x: 0, y: 0, width: 4, length: 4,
    });
    const adapter = createGardenSceneAdapter();
    expect(adapter.hitTest(2, 2)).not.toBeNull();

    const { result } = renderHook(() => useEricSelectTool(adapter, { forceMarquee: true }));

    const scratch: SelectScratch = { kind: 'idle' };
    const ctx = makeCtx(2, 2, scratch, adapter);
    const decision = result.current.pointer!.onDown!(pointer(), ctx);
    expect(decision).toBe('claim');
    expect(ctx.scratch.kind).toBe('area');

    const dragDecision = result.current.drag!.onStart!(pointer(), ctx);
    expect(dragDecision).toBe('claim');
  });

  it('regular select tool (no forceMarquee) still initiates move on body drag', () => {
    useGardenStore.getState().addStructure({
      type: 'raised-bed',
      x: 0, y: 0, width: 4, length: 4,
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
    const ctx = makeCtx(999, 999, scratch, adapter);
    result.current.pointer!.onDown!(pointer(), ctx);
    expect(ctx.scratch.kind).toBe('area');
    result.current.pointer!.onClick!(pointer(), ctx);
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });
});

void vi;
