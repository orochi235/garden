import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import { useEricSelectTool, type SelectScratch } from './useEricSelectTool';
import { createGardenSceneAdapter } from '../adapters/gardenScene';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createGarden, createStructure } from '../../model/types';
import { expandToGroups } from '../../utils/groups';

function makeCtx(scratch: SelectScratch, worldX: number, worldY: number): ToolCtx<SelectScratch> {
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

describe('useEricSelectTool group expansion', () => {
  beforeEach(() => {
    useGardenStore.getState().loadGarden(createGarden({ name: 'test', widthFt: 100, heightFt: 100 }));
    useUiStore.getState().clearSelection();
  });

  it('body-hit drag expands a single grouped member to all group siblings', () => {
    // Three structures in the same group, plus one ungrouped.
    const a = createStructure({ type: 'bed', x: 0, y: 0, width: 4, height: 4, groupId: 'g1' });
    const b = createStructure({ type: 'bed', x: 10, y: 0, width: 4, height: 4, groupId: 'g1' });
    const c = createStructure({ type: 'bed', x: 20, y: 0, width: 4, height: 4, groupId: 'g1' });
    const d = createStructure({ type: 'bed', x: 30, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a, b, c, d] },
    }));

    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricSelectTool(adapter));

    const ctx = makeCtx({ kind: 'idle' }, 1, 1); // hits structure a
    const decision = result.current.pointer!.onDown!(makePointerEvt(), ctx);
    expect(decision).toBe('claim');

    // Selection in the UI store stays narrow (just the clicked id).
    expect(useUiStore.getState().selectedIds).toEqual([a.id]);
    // But the drag scratch is broadened to the whole group.
    expect(ctx.scratch.kind).toBe('move');
    if (ctx.scratch.kind === 'move') {
      expect(ctx.scratch.ids.sort()).toEqual([a.id, b.id, c.id].sort());
      expect(ctx.scratch.ids).not.toContain(d.id);
    }
  });

  it('body-hit drag on an ungrouped structure leaves drag set unchanged', () => {
    const a = createStructure({ type: 'bed', x: 0, y: 0, width: 4, height: 4 });
    const b = createStructure({ type: 'bed', x: 10, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a, b] },
    }));

    const adapter = createGardenSceneAdapter();
    const { result } = renderHook(() => useEricSelectTool(adapter));

    const ctx = makeCtx({ kind: 'idle' }, 1, 1);
    result.current.pointer!.onDown!(makePointerEvt(), ctx);
    expect(ctx.scratch.kind).toBe('move');
    if (ctx.scratch.kind === 'move') {
      expect(ctx.scratch.ids).toEqual([a.id]);
    }
  });

  it('expands selection through useUiStore.setSelection when marquee covers a grouped member', () => {
    // Direct integration check on the marquee-end expansion:
    // simulate `areaSelect.end()` having committed selection of one member,
    // then run the same expansion the tool runs, and confirm the store widens.
    const a = createStructure({ type: 'bed', x: 0, y: 0, width: 4, height: 4, groupId: 'g1' });
    const b = createStructure({ type: 'bed', x: 10, y: 0, width: 4, height: 4, groupId: 'g1' });
    const c = createStructure({ type: 'bed', x: 30, y: 0, width: 4, height: 4 });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [a, b, c] },
    }));

    // Pretend the marquee just selected only `a`.
    useUiStore.getState().setSelection([a.id]);

    // Execute the same expansion the tool's marquee-end branch performs.
    const ui = useUiStore.getState();
    const expanded = expandToGroups(ui.selectedIds, useGardenStore.getState().garden.structures);
    if (expanded.length !== ui.selectedIds.length) ui.setSelection(expanded);

    expect(useUiStore.getState().selectedIds.sort()).toEqual([a.id, b.id].sort());
  });
});
