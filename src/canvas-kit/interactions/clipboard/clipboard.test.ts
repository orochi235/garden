import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboard } from './clipboard';
import type { InsertAdapter, Op } from '@/canvas-kit';

interface Obj { id: string; x: number; y: number }

function makeAdapter(initial: { selection?: string[]; offsetOverride?: { dx: number; dy: number } } = {}) {
  let selection = [...(initial.selection ?? [])];
  let nextId = 0;
  const inserts: Obj[] = [];
  const batches: { ops: Op[]; label: string }[] = [];
  const adapter: InsertAdapter<Obj> = {
    commitInsert: () => null,
    commitPaste(clipboard, offset) {
      const out: Obj[] = [];
      for (const raw of clipboard.items) {
        const src = raw as Obj;
        out.push({ id: `n${nextId++}`, x: src.x + offset.dx, y: src.y + offset.dy });
      }
      return out;
    },
    snapshotSelection(ids) {
      // For tests, build snapshots from a virtual pool that mirrors `inserts` plus seeded items.
      const pool = inserts;
      const items = pool.filter((p) => ids.includes(p.id));
      return { items };
    },
    getPasteOffset: initial.offsetOverride
      ? () => initial.offsetOverride!
      : () => ({ dx: 1, dy: 1 }),
    insertObject: (o) => { inserts.push(o); },
    setSelection: (ids) => { selection = [...ids]; },
    applyBatch: (ops, label) => {
      batches.push({ ops, label });
      for (const op of ops) op.apply(adapter as never);
    },
  };
  return {
    adapter,
    inserts,
    batches,
    getSelection: () => selection,
    seed(o: Obj) { inserts.push(o); selection = [o.id]; },
  };
}

describe('useClipboard', () => {
  it('isEmpty starts true', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useClipboard(adapter, { getSelection: () => [] }));
    expect(result.current.isEmpty()).toBe(true);
  });

  it('copy with empty selection no-ops; isEmpty stays true', () => {
    const { adapter } = makeAdapter();
    const { result } = renderHook(() => useClipboard(adapter, { getSelection: () => [] }));
    act(() => { result.current.copy(); });
    expect(result.current.isEmpty()).toBe(true);
  });

  it('paste with empty clipboard no-ops; no batch emitted', () => {
    const { adapter, batches } = makeAdapter();
    const { result } = renderHook(() => useClipboard(adapter, { getSelection: () => [] }));
    act(() => { result.current.paste(); });
    expect(batches).toEqual([]);
  });

  it('copy then paste emits one applyBatch with N InsertOps + one SetSelectionOp', () => {
    const helpers = makeAdapter();
    helpers.seed({ id: 'a', x: 0, y: 0 });
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, { getSelection: () => ['a'] }),
    );
    act(() => { result.current.copy(); });
    act(() => { result.current.paste(); });
    expect(helpers.batches).toHaveLength(1);
    expect(helpers.batches[0].label).toBe('Paste');
    // 1 InsertOp + 1 SetSelectionOp
    expect(helpers.batches[0].ops).toHaveLength(2);
    // Second op is a SetSelection op pointing at the new id 'n0'.
    expect(helpers.getSelection()).toEqual(['n0']);
  });

  it('cascading paste shifts each call by the offset', () => {
    const helpers = makeAdapter({ offsetOverride: { dx: 1, dy: 1 } });
    helpers.seed({ id: 'a', x: 0, y: 0 });
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, { getSelection: () => ['a'] }),
    );
    act(() => { result.current.copy(); });
    act(() => { result.current.paste(); });
    act(() => { result.current.paste(); });
    // First paste: n0 at (1,1). Second paste should snapshot the just-pasted
    // n0 and offset by (1,1) again → n1 at (2,2).
    const made = helpers.inserts.filter((o) => o.id.startsWith('n'));
    expect(made.map((o) => ({ x: o.x, y: o.y }))).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it('honors options.getSelection over adapter.getSelection (which doesn\'t exist on InsertAdapter)', () => {
    const helpers = makeAdapter();
    helpers.seed({ id: 'a', x: 0, y: 0 });
    let calls = 0;
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, {
        getSelection: () => { calls += 1; return ['a']; },
      }),
    );
    act(() => { result.current.copy(); });
    expect(calls).toBeGreaterThan(0);
    expect(result.current.isEmpty()).toBe(false);
  });

  it('onPaste callback receives the new ids', () => {
    const helpers = makeAdapter();
    helpers.seed({ id: 'a', x: 0, y: 0 });
    const seen: string[][] = [];
    const { result } = renderHook(() =>
      useClipboard(helpers.adapter, {
        getSelection: () => ['a'],
        onPaste: (ids) => seen.push(ids),
      }),
    );
    act(() => { result.current.copy(); });
    act(() => { result.current.paste(); });
    expect(seen).toEqual([['n0']]);
  });
});
