import { describe, expect, it, beforeEach } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createInsertAdapter } from './insert';
import { createInsertOp } from '@/canvas-kit';

describe('createInsertAdapter', () => {
  beforeEach(() => {
    useUiStore.setState({ plottingTool: null } as never);
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [], zones: [] },
    }));
  });

  it('commitInsert returns null when no plottingTool active', () => {
    const a = createInsertAdapter();
    expect(a.commitInsert({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it('commitInsert builds a Structure when category=structures', () => {
    useUiStore.setState({
      plottingTool: { category: 'structures', type: 'bed', color: '#abc' } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 1, y: 2, width: 3, height: 4 });
    expect(obj).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
    expect((obj as { type: string }).type).toBe('bed');
    expect(typeof obj!.id).toBe('string');
  });

  it('commitInsert builds a Zone when category=zones', () => {
    useUiStore.setState({
      plottingTool: { category: 'zones', color: '#abc', pattern: null } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 1, y: 2, width: 3, height: 4 });
    expect(obj).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('applyBatch checkpoints + applies InsertOp; undo restores', () => {
    useUiStore.setState({
      plottingTool: { category: 'zones', color: '#abc', pattern: null } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 0, y: 0, width: 2, height: 2 })!;
    a.applyBatch([createInsertOp({ object: obj })], 'Insert');
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
  });
});
