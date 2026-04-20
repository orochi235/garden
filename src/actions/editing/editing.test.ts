import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { ActionContext } from '../types';
import { undoAction } from './undo';
import { redoAction } from './redo';
import { deleteAction } from './delete';
import { copyAction } from './copy';
import { pasteAction } from './paste';
import { selectAllAction } from './selectAll';

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    clipboard: { copy: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) },
    ...overrides,
  };
}

describe('editing actions', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('undo reverts last change', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    undoAction.execute(makeCtx());
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('redo restores undone change', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().undo();
    redoAction.execute(makeCtx());
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('delete removes selected objects', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);
    deleteAction.execute(makeCtx({ target: { kind: 'selection' } }));
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().selectedIds).toHaveLength(0);
  });

  it('copy calls clipboard.copy', () => {
    const ctx = makeCtx();
    copyAction.execute(ctx);
    expect(ctx.clipboard.copy).toHaveBeenCalled();
  });

  it('paste calls clipboard.paste', () => {
    const ctx = makeCtx();
    pasteAction.execute(ctx);
    expect(ctx.clipboard.paste).toHaveBeenCalled();
  });

  it('selectAll selects all objects in active layer', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');
    selectAllAction.execute(makeCtx({ target: { kind: 'none' } }));
    expect(useUiStore.getState().selectedIds).toHaveLength(2);
  });
});
