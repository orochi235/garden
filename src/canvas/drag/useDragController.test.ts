import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUiStore } from '../../store/uiStore';
import { useDragController } from './useDragController';
import type { Drag, DragViewport } from './putativeDrag';

interface FakePutative { x: number; shift: boolean; }

type FakeDrag = Drag<unknown, FakePutative> & {
  reads: number; computes: number; commits: FakePutative[];
};

function makeFakeDrag(overrides: Partial<Drag<unknown, FakePutative>> = {}): FakeDrag {
  const drag: FakeDrag = {
    kind: 'fake',
    reads: 0,
    computes: 0,
    commits: [],
    read(sample) {
      drag.reads++;
      return { clientX: sample.clientX, shift: sample.modifiers.shift };
    },
    compute(input) {
      drag.computes++;
      return {
        x: (input as { clientX: number }).clientX,
        shift: (input as { shift: boolean }).shift,
      };
    },
    renderPreview() { return []; },
    commit(p) { drag.commits.push(p); },
    ...overrides,
  };
  return drag;
}

function dispatch(type: string, init: PointerEventInit & { type?: string } = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(ev, {
    clientX: 0, clientY: 0, pointerId: 1, button: 0,
    shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
    ...init,
  });
  document.dispatchEvent(ev);
  return ev;
}

function dispatchKey(type: 'keydown' | 'keyup', key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...modifiers });
  document.dispatchEvent(ev);
  return ev;
}

function fakeViewport(): DragViewport {
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return { container, view: { x: 0, y: 0, scale: 1 } };
}

describe('useDragController', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('writes a putative on activation, then commits on pointerup', () => {
    const drag = makeFakeDrag();
    const { result } = renderHook(() => useDragController({ fake: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 0, clientY: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => {
      result.current.start('fake', seed, () => fakeViewport());
    });
    // threshold defaults to 0 ⇒ activated immediately, initial compute fired.
    expect(useUiStore.getState().dragPreview?.kind).toBe('fake');
    expect((useUiStore.getState().dragPreview?.putative as FakePutative).x).toBe(0);

    act(() => { dispatch('pointermove', { clientX: 50 }); });
    expect((useUiStore.getState().dragPreview?.putative as FakePutative).x).toBe(50);

    act(() => { dispatch('pointerup', { clientX: 50 }); });
    expect(drag.commits).toHaveLength(1);
    expect(drag.commits[0].x).toBe(50);
    expect(useUiStore.getState().dragPreview).toBeNull();
  });

  it('orders read → compute → slot-write before commit', () => {
    const order: string[] = [];
    const drag: Drag<{ tag: string }, { tag: string }> = {
      kind: 'order',
      read() { order.push('read'); return { tag: 'r' }; },
      compute(input) { order.push('compute'); return { tag: input.tag }; },
      renderPreview() { return []; },
      commit() { order.push('commit'); },
      onPutativeChange(p) { order.push(p ? 'slot-set' : 'slot-clear'); },
    };
    const { result } = renderHook(() => useDragController({ order: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 0, clientY: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => { result.current.start('order', seed, () => fakeViewport()); });
    order.length = 0; // ignore initial activation; focus on a single move + up cycle
    act(() => { dispatch('pointermove', { clientX: 5 }); });
    act(() => { dispatch('pointerup', { clientX: 5 }); });
    // For the move: read, compute, slot-set.
    // For the up: read, compute, slot-set, commit, slot-clear.
    expect(order).toEqual([
      'read', 'compute', 'slot-set',
      'read', 'compute', 'slot-set',
      'commit', 'slot-clear',
    ]);
  });

  it('escape cancels without committing', () => {
    const drag = makeFakeDrag();
    const { result } = renderHook(() => useDragController({ fake: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 0, clientY: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => { result.current.start('fake', seed, () => fakeViewport()); });
    expect(useUiStore.getState().dragPreview).not.toBeNull();
    act(() => { dispatchKey('keydown', 'Escape'); });
    expect(useUiStore.getState().dragPreview).toBeNull();
    expect(drag.commits).toHaveLength(0);
    // Subsequent pointer events should be ignored (gesture is torn down).
    act(() => { dispatch('pointermove', { clientX: 999 }); });
    expect(useUiStore.getState().dragPreview).toBeNull();
  });

  it('pointercancel clears without committing', () => {
    const drag = makeFakeDrag();
    const { result } = renderHook(() => useDragController({ fake: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 0, clientY: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => { result.current.start('fake', seed, () => fakeViewport()); });
    act(() => { dispatch('pointercancel'); });
    expect(useUiStore.getState().dragPreview).toBeNull();
    expect(drag.commits).toHaveLength(0);
  });

  it('modifier-only keydown re-fires compute even without pointer movement', () => {
    const drag = makeFakeDrag();
    const { result } = renderHook(() => useDragController({ fake: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 10, clientY: 10, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => { result.current.start('fake', seed, () => fakeViewport()); });
    const beforeReads = drag.reads;
    const beforeComputes = drag.computes;
    act(() => { dispatchKey('keydown', 'Shift', { shiftKey: true }); });
    expect(drag.reads).toBeGreaterThan(beforeReads);
    expect(drag.computes).toBeGreaterThan(beforeComputes);
    expect((useUiStore.getState().dragPreview?.putative as FakePutative).shift).toBe(true);
    act(() => { dispatchKey('keyup', 'Shift', { shiftKey: false }); });
    expect((useUiStore.getState().dragPreview?.putative as FakePutative).shift).toBe(false);
    act(() => { dispatch('pointercancel'); });
  });

  it('respects threshold: sub-threshold pointerup never activates and never commits', () => {
    const drag = makeFakeDrag();
    const onSubThreshold = vi.fn();
    const { result } = renderHook(() => useDragController({ fake: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 0, clientY: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => {
      result.current.start('fake', seed, () => fakeViewport(), {
        threshold: 10,
        onSubThresholdRelease: onSubThreshold,
      });
    });
    // No initial compute (threshold=10, started at 0,0 → not activated).
    expect(useUiStore.getState().dragPreview).toBeNull();
    act(() => { dispatch('pointermove', { clientX: 2 }); });
    expect(useUiStore.getState().dragPreview).toBeNull();
    act(() => { dispatch('pointerup', { clientX: 2 }); });
    expect(onSubThreshold).toHaveBeenCalledOnce();
    expect(drag.commits).toHaveLength(0);
  });

  it('null compute clears the slot', () => {
    const drag: Drag<unknown, FakePutative> = {
      kind: 'fake',
      read() { return {}; },
      compute() { return null; },
      renderPreview() { return []; },
      commit() {},
    };
    const { result } = renderHook(() => useDragController({ fake: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 0, clientY: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => { result.current.start('fake', seed, () => fakeViewport()); });
    expect(useUiStore.getState().dragPreview).toBeNull();
    act(() => { dispatch('pointercancel'); });
  });

  it('starting a new gesture cancels any in-flight one', () => {
    const drag = makeFakeDrag();
    const { result } = renderHook(() => useDragController({ fake: drag as never }));
    const seed = new Event('pointerdown') as PointerEvent;
    Object.assign(seed, { clientX: 0, clientY: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    act(() => { result.current.start('fake', seed, () => fakeViewport()); });
    expect(result.current.isActive()).toBe(true);
    act(() => { result.current.start('fake', seed, () => fakeViewport()); });
    // Still active, but the prior gesture's listeners are detached. No commits yet.
    expect(drag.commits).toHaveLength(0);
    act(() => { dispatch('pointercancel'); });
  });
});
