import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMoveInteraction } from './move';
import { snapToGrid } from './behaviors/snapToGrid';
import { snapBackOrDelete } from './behaviors/snapBackOrDelete';
import type { MoveAdapter } from '../../adapters/types';
import type { Op } from '../../ops/types';

interface Pose { x: number; y: number }
interface Obj { id: string; pose: Pose; parent: string | null }

function makeAdapter(initial: Obj[]): MoveAdapter<Obj, Pose> & {
  store: Map<string, Obj>;
  batches: { ops: Op[]; label: string }[];
} {
  const store = new Map<string, Obj>(initial.map((o) => [o.id, { ...o, pose: { ...o.pose } }]));
  const batches: { ops: Op[]; label: string }[] = [];
  return {
    store,
    batches,
    getObject: (id) => store.get(id),
    getPose: (id) => store.get(id)!.pose,
    getParent: (id) => store.get(id)!.parent,
    setPose: (id, pose) => {
      store.get(id)!.pose = { ...pose };
    },
    setParent: (id, parent) => {
      store.get(id)!.parent = parent;
    },
    applyBatch: (ops, label) => {
      for (const op of ops) op.apply({
        setPose: (id: string, pose: Pose) => { store.get(id)!.pose = { ...pose }; },
        setParent: (id: string, p: string | null) => { store.get(id)!.parent = p; },
        insertObject: (o: Obj) => store.set(o.id, o),
        removeObject: (id: string) => store.delete(id),
      });
      batches.push({ ops, label });
    },
  };
}

const translatePose = (p: Pose, dx: number, dy: number) => ({ ...p, x: p.x + dx, y: p.y + dy });

describe('useMoveInteraction', () => {
  it('does not commit before threshold is exceeded', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose }));
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 0.05, worldY: 0.05, clientX: 1, clientY: 1, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.batches).toEqual([]);
  });

  it('emits a default TransformOp batch when moved past threshold', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose, dragThresholdPx: 4 }));
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.batches.length).toBe(1);
    expect(adapter.store.get('a')!.pose).toEqual({ x: 5, y: 5 });
  });

  it('snapToGrid behavior rounds the proposed pose', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() =>
      useMoveInteraction(adapter, { translatePose, behaviors: [snapToGrid<Pose>({ cell: 1 })] }),
    );
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5.4, worldY: 5.6, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.store.get('a')!.pose).toEqual({ x: 5, y: 6 });
  });

  it('snapBackOrDelete with delete policy emits DeleteOp when far from origin', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: 'p' }]);
    const { result } = renderHook(() =>
      useMoveInteraction(adapter, {
        translatePose,
        behaviors: [snapBackOrDelete<Pose>({ radius: 1, onFreeRelease: 'delete' })],
      }),
    );
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 50, worldY: 50, clientX: 1000, clientY: 1000, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.store.has('a')).toBe(false);
  });

  it('snap-back (within radius) commits no batch', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: 'p' }]);
    const { result } = renderHook(() =>
      useMoveInteraction(adapter, {
        translatePose,
        behaviors: [snapBackOrDelete<Pose>({ radius: 1, onFreeRelease: 'snap-back' })],
      }),
    );
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 0.3, worldY: 0.3, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.batches).toEqual([]);
    expect(adapter.store.get('a')!.pose).toEqual({ x: 0, y: 0 });
  });

  it('group drag moves all dragged ids by the same delta', () => {
    const adapter = makeAdapter([
      { id: 'a', pose: { x: 0, y: 0 }, parent: null },
      { id: 'b', pose: { x: 10, y: 10 }, parent: null },
    ]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose }));
    act(() => result.current.start({ ids: ['a', 'b'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    act(() => result.current.end());
    expect(adapter.store.get('a')!.pose).toEqual({ x: 5, y: 5 });
    expect(adapter.store.get('b')!.pose).toEqual({ x: 15, y: 15 });
    expect(adapter.batches.length).toBe(1);
    expect(adapter.batches[0].ops.length).toBe(2);
  });

  it('expandIds is called once with input ids and its result drives draggedIds + poses', () => {
    const adapter = makeAdapter([
      { id: 'a', pose: { x: 0, y: 0 }, parent: null },
      { id: 'b', pose: { x: 10, y: 10 }, parent: null },
    ]);
    const calls: string[][] = [];
    const expandIds = (ids: string[]) => {
      calls.push(ids);
      return ids.includes('G') ? ['a', 'b'] : ids;
    };
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose, expandIds }));
    act(() => result.current.start({ ids: ['G'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    expect(calls).toEqual([['G']]);
    expect(result.current.overlay!.draggedIds).toEqual(['a', 'b']);
    expect(result.current.overlay!.poses.get('a')).toEqual({ x: 5, y: 5 });
    expect(result.current.overlay!.poses.get('b')).toEqual({ x: 15, y: 15 });
    act(() => result.current.end());
    expect(adapter.store.get('a')!.pose).toEqual({ x: 5, y: 5 });
    expect(adapter.store.get('b')!.pose).toEqual({ x: 15, y: 15 });
    expect(adapter.batches[0].ops.length).toBe(2);
  });

  it('expandIds returning [] aborts the gesture cleanly', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() =>
      useMoveInteraction(adapter, { translatePose, expandIds: () => [] }),
    );
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    expect(
      result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }),
    ).toBe(false);
    act(() => result.current.end());
    expect(adapter.batches).toEqual([]);
    expect(result.current.overlay).toBeNull();
  });

  it('overlay reflects in-flight pose; cleared on end', () => {
    const adapter = makeAdapter([{ id: 'a', pose: { x: 0, y: 0 }, parent: null }]);
    const { result } = renderHook(() => useMoveInteraction(adapter, { translatePose }));
    act(() => result.current.start({ ids: ['a'], worldX: 0, worldY: 0, clientX: 0, clientY: 0 }));
    act(() => result.current.move({ worldX: 5, worldY: 5, clientX: 100, clientY: 100, modifiers: { alt: false, shift: false, meta: false, ctrl: false } }));
    expect(result.current.overlay).not.toBeNull();
    expect(result.current.overlay!.poses.get('a')).toEqual({ x: 5, y: 5 });
    act(() => result.current.end());
    expect(result.current.overlay).toBeNull();
  });
});
