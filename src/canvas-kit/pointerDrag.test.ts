import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDragHandle, useDropZone } from './pointerDrag';

beforeAll(() => {
  // jsdom doesn't implement elementFromPoint; default to null so findZone returns null
  if (!('elementFromPoint' in document)) {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      writable: true,
      value: () => null,
    });
  }
});

function firePointer(type: string, init: Partial<PointerEvent> = {}) {
  const ev = new Event(type) as PointerEvent;
  Object.assign(ev, {
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    ...init,
  });
  document.dispatchEvent(ev);
  return ev;
}

describe('useDropZone', () => {
  it('returns a stable ref callback', () => {
    const { result, rerender } = renderHook(() =>
      useDropZone({
        accepts: () => true,
        onDrop: () => {},
      }),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('attaches and detaches from element via ref callback', () => {
    const onOver = vi.fn();
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDropZone<HTMLDivElement>({
        accepts: () => true,
        onDrop,
        onOver,
      }),
    );
    const el = document.createElement('div');
    document.body.appendChild(el);
    result.current(el);
    // Attaching alone shouldn't fire callbacks.
    expect(onOver).not.toHaveBeenCalled();
    // Detach
    result.current(null);
    document.body.removeChild(el);
  });
});

describe('useDragHandle', () => {
  it('returns onPointerDown and touchAction style', () => {
    const { result } = renderHook(() => useDragHandle(() => null));
    expect(typeof result.current.onPointerDown).toBe('function');
    expect(result.current.style.touchAction).toBe('none');
  });

  it('ignores non-primary mouse buttons', () => {
    const { result } = renderHook(() =>
      useDragHandle(() => ({ kind: 'item', ids: ['a'] })),
    );
    const target = document.createElement('div');
    document.body.appendChild(target);
    const fakeReact = {
      pointerType: 'mouse',
      button: 2,
      clientX: 0,
      clientY: 0,
      currentTarget: target,
      target,
    } as unknown as React.PointerEvent<HTMLElement>;
    result.current.onPointerDown(fakeReact);
    // No pointermove listener installed -> firing the event is a no-op.
    firePointer('pointermove', { clientX: 100, clientY: 100 });
    document.body.removeChild(target);
  });

  it('ignores pointer downs that target form controls', () => {
    const getPayload = vi.fn(() => ({ kind: 'item', ids: ['a'] }));
    const { result } = renderHook(() => useDragHandle(getPayload));
    const target = document.createElement('div');
    const button = document.createElement('button');
    target.appendChild(button);
    document.body.appendChild(target);
    const fakeReact = {
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
      currentTarget: target,
      target: button,
    } as unknown as React.PointerEvent<HTMLElement>;
    result.current.onPointerDown(fakeReact);
    firePointer('pointermove', { clientX: 100, clientY: 100 });
    expect(getPayload).not.toHaveBeenCalled();
    document.body.removeChild(target);
  });

  it('fetches payload only after movement exceeds threshold', () => {
    const getPayload = vi.fn(() => ({ kind: 'item', ids: ['a'] }));
    const { result } = renderHook(() => useDragHandle(getPayload));
    const target = document.createElement('div');
    document.body.appendChild(target);
    const fakeReact = {
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
      currentTarget: target,
      target,
    } as unknown as React.PointerEvent<HTMLElement>;
    result.current.onPointerDown(fakeReact);

    // Below threshold (5*5+0 = 25, not > 25)
    firePointer('pointermove', { clientX: 5, clientY: 0 });
    expect(getPayload).not.toHaveBeenCalled();

    // Past threshold
    firePointer('pointermove', { clientX: 6, clientY: 0 });
    expect(getPayload).toHaveBeenCalledTimes(1);

    // Subsequent moves don't re-trigger getPayload (already started)
    firePointer('pointermove', { clientX: 100, clientY: 100 });
    firePointer('pointerup', { clientX: 100, clientY: 100 });
    expect(getPayload).toHaveBeenCalledTimes(1);
    document.body.removeChild(target);
  });

  it('aborts cleanly if getPayload returns null (no drag started)', () => {
    const getPayload = vi.fn(() => null);
    const { result } = renderHook(() => useDragHandle(getPayload));
    const target = document.createElement('div');
    document.body.appendChild(target);
    const fakeReact = {
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
      currentTarget: target,
      target,
    } as unknown as React.PointerEvent<HTMLElement>;
    const elsBefore = document.body.querySelectorAll('div').length;
    result.current.onPointerDown(fakeReact);
    firePointer('pointermove', { clientX: 50, clientY: 0 });
    expect(getPayload).toHaveBeenCalledTimes(1);
    // No new ghost element appended (would be a cloned div if a drag had started)
    expect(document.body.querySelectorAll('div').length).toBe(elsBefore);
    firePointer('pointerup', { clientX: 50, clientY: 0 });
    document.body.removeChild(target);
  });

  it('drag + drop: invokes drop zone onDrop with payload', () => {
    const onDrop = vi.fn();
    const onOver = vi.fn();
    const { result: zoneRef } = renderHook(() =>
      useDropZone<HTMLDivElement>({
        accepts: (k) => k === 'item',
        onDrop,
        onOver,
      }),
    );
    const zoneEl = document.createElement('div');
    document.body.appendChild(zoneEl);
    zoneRef.current(zoneEl);

    // Stub elementFromPoint to return zone element
    const fromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(zoneEl);
    // Stub contains so any descendant test passes
    zoneEl.contains = ((other: Node | null) => other === zoneEl) as Node['contains'];

    const { result: handle } = renderHook(() =>
      useDragHandle(() => ({ kind: 'item', ids: ['x', 'y'] })),
    );
    const source = document.createElement('div');
    Object.defineProperty(source, 'getBoundingClientRect', {
      value: () => ({ width: 20, height: 20, x: 0, y: 0, left: 0, top: 0, right: 20, bottom: 20, toJSON() {} }),
    });
    document.body.appendChild(source);

    handle.current.onPointerDown({
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
      currentTarget: source,
      target: source,
    } as unknown as React.PointerEvent<HTMLElement>);

    // Past threshold -> drag begins
    firePointer('pointermove', { clientX: 30, clientY: 0 });
    // Hover into zone
    firePointer('pointermove', { clientX: 50, clientY: 50 });
    expect(onOver).toHaveBeenCalledWith(true);
    // Drop
    firePointer('pointerup', { clientX: 60, clientY: 60 });
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0][0]).toMatchObject({ kind: 'item', ids: ['x', 'y'] });
    expect(onOver).toHaveBeenLastCalledWith(false);

    fromPoint.mockRestore();
    document.body.removeChild(source);
    document.body.removeChild(zoneEl);
  });

  it('ignores drag when zone.accepts returns false', () => {
    const onDrop = vi.fn();
    const { result: zoneRef } = renderHook(() =>
      useDropZone<HTMLDivElement>({
        accepts: () => false,
        onDrop,
      }),
    );
    const zoneEl = document.createElement('div');
    document.body.appendChild(zoneEl);
    zoneRef.current(zoneEl);
    const fromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(zoneEl);
    zoneEl.contains = (() => true) as Node['contains'];

    const { result: handle } = renderHook(() =>
      useDragHandle(() => ({ kind: 'item', ids: ['x'] })),
    );
    const source = document.createElement('div');
    Object.defineProperty(source, 'getBoundingClientRect', {
      value: () => ({ width: 20, height: 20, x: 0, y: 0, left: 0, top: 0, right: 20, bottom: 20, toJSON() {} }),
    });
    document.body.appendChild(source);

    handle.current.onPointerDown({
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
      currentTarget: source,
      target: source,
    } as unknown as React.PointerEvent<HTMLElement>);
    firePointer('pointermove', { clientX: 30, clientY: 0 });
    firePointer('pointerup', { clientX: 30, clientY: 0 });
    expect(onDrop).not.toHaveBeenCalled();

    fromPoint.mockRestore();
    document.body.removeChild(source);
    document.body.removeChild(zoneEl);
  });
});
