import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAreaSelectInteraction } from './areaSelect';
import { selectFromMarquee } from './behaviors/selectFromMarquee';
import type { AreaSelectAdapter, Op } from '@/canvas-kit';

function makeAdapter(initial: string[] = []) {
  let selection = [...initial];
  const ops: { kind: 'applyOps'; ops: Op[] }[] = [];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: AreaSelectAdapter = {
    hitTestArea: () => [],
    getSelection: () => selection,
    setSelection: (ids) => { selection = [...ids]; },
    applyOps: (oo) => {
      ops.push({ kind: 'applyOps', ops: oo });
      for (const op of oo) op.apply(adapter as never);
    },
  };
  (adapter as { applyBatch?: (ops: Op[], label: string) => void }).applyBatch =
    (oo: Op[], label: string) => {
      batches.push({ ops: oo, label });
      for (const op of oo) op.apply(adapter as never);
    };
  return { adapter, ops, batches, getSelection: () => selection };
}

const NO_MOD = { alt: false, shift: false, meta: false, ctrl: false };

describe('useAreaSelectInteraction — start / cancel', () => {
  it('start sets isAreaSelecting + overlay; cancel clears them with no ops', () => {
    const { adapter, ops } = makeAdapter();
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    expect(result.current.isAreaSelecting).toBe(false);

    act(() => { result.current.start(1, 2, NO_MOD); });
    expect(result.current.isAreaSelecting).toBe(true);
    expect(result.current.overlay).toEqual({
      start: { worldX: 1, worldY: 2 },
      current: { worldX: 1, worldY: 2 },
      shiftHeld: false,
    });

    act(() => { result.current.cancel(); });
    expect(result.current.isAreaSelecting).toBe(false);
    expect(result.current.overlay).toBeNull();
    expect(ops).toEqual([]);
  });
});

describe('useAreaSelectInteraction — move', () => {
  it('move updates overlay.current; preserves shiftHeld from start', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    act(() => { result.current.start(1, 2, { ...NO_MOD, shift: true }); });
    act(() => { result.current.move(5, 7, NO_MOD); });
    expect(result.current.overlay).toEqual({
      start: { worldX: 1, worldY: 2 },
      current: { worldX: 5, worldY: 7 },
      shiftHeld: true,
    });
  });

  it('move while inactive returns false and does not set overlay', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] }),
    );
    let returned = true;
    act(() => { returned = result.current.move(1, 1, NO_MOD); });
    expect(returned).toBe(false);
    expect(result.current.overlay).toBeNull();
  });
});
