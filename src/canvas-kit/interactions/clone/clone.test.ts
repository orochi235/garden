import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloneInteraction } from './clone';
import { cloneByAltDrag } from './behaviors/cloneByAltDrag';
import type { InsertAdapter, Op } from '../../index';

interface Obj { id: string }

function makeAdapter() {
  const overlays: Array<{ layer: string; objects: unknown[] }> = [];
  const cleared: number[] = [];
  const applied: Array<{ ops: Op[]; label: string }> = [];
  const adapter: InsertAdapter<Obj> = {
    commitInsert: () => null,
    commitPaste: () => [{ id: 'new1' } as Obj],
    snapshotSelection: (ids) => ({ items: ids.map((id) => ({ id })) }),
    insertObject: () => {},
    setSelection: () => {},
    applyBatch: (ops, label) => { applied.push({ ops, label }); },
    getSelection: () => [],
  };
  const setOverlay = (layer: string, objects: unknown[]) => {
    overlays.push({ layer, objects });
  };
  const clearOverlay = () => { cleared.push(cleared.length + 1); };
  return { adapter, overlays, cleared, applied, setOverlay, clearOverlay };
}

const mods = (alt = true) => ({ alt, shift: false, meta: false, ctrl: false });

describe('useCloneInteraction', () => {
  it('start with non-activating modifiers does nothing', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(false)); });
    expect(result.current.isCloning).toBe(false);
    expect(h.overlays).toEqual([]);
  });

  it('alt-start activates and publishes initial overlay frame', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    expect(result.current.isCloning).toBe(true);
    expect(h.overlays).toHaveLength(1);
    expect(h.overlays[0].layer).toBe('structures');
  });

  it('move updates overlay with translated objects', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    act(() => { result.current.move(3, 4, mods(true)); });
    expect(h.overlays.length).toBeGreaterThan(1);
  });

  it('end commits a single applyBatch with label "Clone"', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    act(() => { result.current.move(3, 4, mods(true)); });
    act(() => { result.current.end(); });
    expect(h.applied).toHaveLength(1);
    expect(h.applied[0].label).toBe('Clone');
    expect(h.applied[0].ops.length).toBeGreaterThan(0);
    expect(h.cleared).toHaveLength(1);
    expect(result.current.isCloning).toBe(false);
  });

  it('expandIds expands a group id into leaves; overlay + commit reflect leaves', () => {
    const overlays: Array<{ layer: string; objects: unknown[] }> = [];
    const applied: Array<{ ops: Op[]; label: string }> = [];
    const snapshotCalls: string[][] = [];
    const adapter: InsertAdapter<Obj> = {
      commitInsert: () => null,
      commitPaste: (snap: { items: { id: string }[] }) =>
        snap.items.map((it, i) => ({ id: `new-${it.id}-${i}` } as Obj)),
      snapshotSelection: (ids) => {
        snapshotCalls.push(ids);
        return { items: ids.map((id) => ({ id })) };
      },
      insertObject: () => {},
      setSelection: () => {},
      applyBatch: (ops, label) => { applied.push({ ops, label }); },
      getSelection: () => [],
    };
    const setOverlay = (layer: string, objects: unknown[]) => { overlays.push({ layer, objects }); };
    const clearOverlay = () => {};
    const expandIds = (ids: string[]) => (ids.includes('G') ? ['a', 'b', 'c'] : ids);
    const { result } = renderHook(() =>
      useCloneInteraction(adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay,
        clearOverlay,
        expandIds,
      }),
    );
    act(() => { result.current.start(0, 0, ['G'], 'structures', mods(true)); });
    expect(overlays[0].objects).toHaveLength(3);
    act(() => { result.current.move(3, 4, mods(true)); });
    act(() => { result.current.end(); });
    expect(applied).toHaveLength(1);
    // 3 inserts + 1 setSelection = 4 ops
    expect(applied[0].ops.length).toBe(4);
  });

  it('expandIds returning [] aborts start cleanly', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
        expandIds: () => [],
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    expect(result.current.isCloning).toBe(false);
    expect(h.overlays).toEqual([]);
  });

  it('cancel clears overlay without committing', () => {
    const h = makeAdapter();
    const { result } = renderHook(() =>
      useCloneInteraction(h.adapter, {
        behaviors: [cloneByAltDrag()],
        setOverlay: h.setOverlay,
        clearOverlay: h.clearOverlay,
      }),
    );
    act(() => { result.current.start(0, 0, ['a'], 'structures', mods(true)); });
    act(() => { result.current.cancel(); });
    expect(h.applied).toEqual([]);
    expect(h.cleared).toHaveLength(1);
    expect(result.current.isCloning).toBe(false);
  });
});
