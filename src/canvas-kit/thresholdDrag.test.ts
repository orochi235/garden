import { afterEach, describe, expect, it, vi } from 'vitest';
import { startThresholdDrag } from './thresholdDrag';

interface FakeReactPointer {
  clientX: number;
  clientY: number;
  pointerId: number;
  currentTarget: HTMLElement;
}

function makeStart(x = 100, y = 100): FakeReactPointer & { _capturedId?: number; _releasedId?: number } {
  const target = document.createElement('div');
  let capturedId: number | undefined;
  let releasedId: number | undefined;
  (target as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = (id: number) => { capturedId = id; };
  (target as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = (id: number) => { releasedId = id; };
  return {
    clientX: x,
    clientY: y,
    pointerId: 1,
    currentTarget: target,
    get _capturedId() { return capturedId; },
    get _releasedId() { return releasedId; },
  };
}

function fireMove(x: number, y: number) {
  const ev = new Event('pointermove') as PointerEvent;
  Object.assign(ev, { clientX: x, clientY: y, pointerId: 1 });
  document.dispatchEvent(ev);
}

function fireUp(x: number, y: number) {
  const ev = new Event('pointerup') as PointerEvent;
  Object.assign(ev, { clientX: x, clientY: y, pointerId: 1 });
  document.dispatchEvent(ev);
}

function fireCancel() {
  document.dispatchEvent(new Event('pointercancel'));
}

afterEach(() => {
  // Clean up any leftover listeners by triggering cancels
  vi.restoreAllMocks();
});

describe('startThresholdDrag', () => {
  it('captures the pointer on the originating element', () => {
    const start = makeStart();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      onMove: () => {},
      onCommit: () => {},
    });
    expect(start._capturedId).toBe(1);
    fireUp(100, 100);
  });

  it('does not invoke onActivate or onMove until threshold exceeded', () => {
    const start = makeStart(0, 0);
    const onActivate = vi.fn();
    const onMove = vi.fn();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      threshold: 4,
      onActivate,
      onMove,
      onCommit: () => {},
    });
    // movement squared < threshold squared (16): 2,2 -> 8
    fireMove(2, 2);
    expect(onActivate).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    fireUp(2, 2);
  });

  it('invokes onActivate exactly once when threshold first exceeded', () => {
    const start = makeStart(0, 0);
    const onActivate = vi.fn();
    const onMove = vi.fn();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      threshold: 4,
      onActivate,
      onMove,
      onCommit: () => {},
    });
    fireMove(10, 10);
    fireMove(20, 20);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledTimes(2);
    fireUp(20, 20);
  });

  it('isDragging() reflects activated state', () => {
    const start = makeStart(0, 0);
    const handle = startThresholdDrag(start as unknown as React.PointerEvent, {
      onMove: () => {},
      onCommit: () => {},
    });
    expect(handle.isDragging()).toBe(false);
    fireMove(50, 50);
    expect(handle.isDragging()).toBe(true);
    fireUp(50, 50);
  });

  it('calls onCommit on pointerup when activated; releases pointer capture', () => {
    const start = makeStart(0, 0);
    const onCommit = vi.fn();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      onMove: () => {},
      onCommit,
    });
    fireMove(50, 50);
    fireUp(60, 60);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(start._releasedId).toBe(1);
  });

  it('calls onCancel on pointerup when never activated', () => {
    const start = makeStart(0, 0);
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      onMove: () => {},
      onCommit,
      onCancel,
    });
    fireUp(0, 0);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('calls onCancel on pointercancel', () => {
    const start = makeStart(0, 0);
    const onCancel = vi.fn();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      onMove: () => {},
      onCommit: () => {},
      onCancel,
    });
    fireMove(50, 50);
    fireCancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('removes listeners after commit so a stray pointermove does nothing', () => {
    const start = makeStart(0, 0);
    const onMove = vi.fn();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      onMove,
      onCommit: () => {},
    });
    fireMove(50, 50);
    fireUp(50, 50);
    onMove.mockClear();
    fireMove(100, 100);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('default threshold is 4px', () => {
    const start = makeStart(0, 0);
    const onActivate = vi.fn();
    startThresholdDrag(start as unknown as React.PointerEvent, {
      onActivate,
      onMove: () => {},
      onCommit: () => {},
    });
    // 3,0 -> 9 < 16; should not activate
    fireMove(3, 0);
    expect(onActivate).not.toHaveBeenCalled();
    // 5,0 -> 25 > 16; should activate
    fireMove(5, 0);
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireUp(5, 0);
  });
});
