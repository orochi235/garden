import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInsertInteraction } from './insert';
import { snapToGrid } from './behaviors/snapToGrid';
import type { Op } from '../../ops/types';
import type { InsertAdapter } from '../../adapters/types';

interface Obj { id: string; x: number; y: number; width: number; height: number }

function makeAdapter(opts?: { commitReturnsNull?: boolean }) {
  const inserts: Obj[] = [];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: InsertAdapter<Obj> = {
    commitInsert(b) {
      if (opts?.commitReturnsNull) return null;
      const obj: Obj = { id: `obj-${inserts.length}`, x: b.x, y: b.y, width: b.width, height: b.height };
      return obj;
    },
    commitPaste(_clipboard, _offset) {
      return [];
    },
    snapshotSelection(_ids) {
      return { items: [] };
    },
    insertObject(o) {
      inserts.push(o);
    },
    setSelection(_ids) {},
    applyBatch(ops, label) {
      batches.push({ ops, label });
      // Simulate insertObject side-effect by recording.
      for (const op of ops) {
        op.apply({
          insertObject: (o: Obj) => inserts.push(o),
          removeObject: () => {},
        });
      }
    },
  };
  return { adapter, inserts, batches };
}

describe('useInsertInteraction — start/cancel', () => {
  it('start sets isInserting and overlay', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(1, 2, { alt: false, shift: false, meta: false, ctrl: false });
    });
    expect(result.current.isInserting).toBe(true);
    expect(result.current.overlay).toEqual({ start: { x: 1, y: 2 }, current: { x: 1, y: 2 } });
  });

  it('cancel clears overlay; no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(1, 2, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.overlay).toBeNull();
    expect(batches).toEqual([]);
  });
});

describe('useInsertInteraction — move + end', () => {
  it('move updates overlay.current; behaviors compose', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() =>
      useInsertInteraction<Obj, { x: number; y: number }>(adapter, {
        behaviors: [snapToGrid<{ x: number; y: number }>({ cell: 1 })],
      }),
    );
    act(() => {
      result.current.start(0.7, 0.3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    // start was snapped to (1, 0).
    expect(result.current.overlay).toEqual({ start: { x: 1, y: 0 }, current: { x: 1, y: 0 } });
    act(() => {
      result.current.move(4.6, 2.3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    expect(result.current.overlay).toEqual({ start: { x: 1, y: 0 }, current: { x: 5, y: 2 } });
  });

  it('end emits one InsertOp on happy path', () => {
    const { adapter, batches, inserts } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(4, 3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].label).toBe('Insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ x: 0, y: 0, width: 4, height: 3 });
  });

  it('inverted drag bounds use min(start, current) and abs(delta)', () => {
    const { adapter, inserts } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(5, 5, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(2, 3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(inserts[0]).toMatchObject({ x: 2, y: 3, width: 3, height: 2 });
  });

  it('degenerate bounds (zero width or height) abort with no batch', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(0, 4, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });

  it('commitInsert returning null aborts', () => {
    const { adapter, batches } = makeAdapter({ commitReturnsNull: true });
    const { result } = renderHook(() => useInsertInteraction<Obj, { x: number; y: number }>(adapter, {}));
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(4, 3, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });

  it('minBounds: bounds with width <= minBounds.width abort', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() =>
      useInsertInteraction<Obj, { x: number; y: number }>(adapter, {
        minBounds: { width: 0.1, height: 0.1 },
      }),
    );
    act(() => {
      result.current.start(0, 0, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.move(0.05, 5, { alt: false, shift: false, meta: false, ctrl: false });
    });
    act(() => {
      result.current.end();
    });
    expect(batches).toEqual([]);
  });
});
