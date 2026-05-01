# canvas-kit `useZoomInteraction` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add `useZoomInteraction`, a stateless coordinator hook that owns
clamp policy + focal-point dispatch across wheel / keyboard / double-click /
trackpad-pinch. Mirrors `usePanInteraction` in shape.

**Spec:** `docs/superpowers/specs/2026-05-01-canvas-kit-zoom-interaction-design.md`

**Architecture summary:**
- File: `src/canvas-kit/hooks/useZoomInteraction.ts` (+ tests next to it).
- Stateless. Caller owns `useState` for `zoom` and `pan`.
- Default range: `[0.1, 10]` (multiplier convention).
- All paths funnel through one internal `applyZoom(nextZoom, focal)` helper
  that clamps, computes the new pan via the focal formula, and calls both
  setters.
- Existing `wheelHandler.ts` is left untouched (it uses a different,
  percentage-based convention; see spec §"Relationship to computeWheelAction").

---

### Task 1: Hook scaffold + clamp tests + `zoomTo`/`zoomBy`

Create the hook file with the option/return types, an internal `applyZoom`
helper that clamps + applies the focal-point formula, and the imperative
`zoomTo` / `zoomBy` methods. Write tests covering clamp behavior and
focal-point invariance for the imperative path. No event handlers yet —
those are stubbed out and tested in later tasks.

**Files:**
- New: `src/canvas-kit/hooks/useZoomInteraction.ts`
- New: `src/canvas-kit/hooks/useZoomInteraction.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `src/canvas-kit/hooks/useZoomInteraction.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useZoomInteraction } from './useZoomInteraction';

function setup(overrides: Partial<Parameters<typeof useZoomInteraction>[0]> = {}) {
  const setZoom = vi.fn();
  const setPan = vi.fn();
  const opts = {
    zoom: 1,
    setZoom,
    pan: { x: 0, y: 0 },
    setPan,
    viewport: { width: 400, height: 300 },
    ...overrides,
  };
  const { result } = renderHook(() => useZoomInteraction(opts));
  return { result, setZoom, setPan, opts };
}

describe('useZoomInteraction — clamp policy', () => {
  it('clamps zoomTo above max', () => {
    const { result, setZoom } = setup({ zoom: 1, max: 10 });
    act(() => result.current.zoomTo(50));
    expect(setZoom).toHaveBeenCalledWith(10);
  });

  it('clamps zoomTo below min', () => {
    const { result, setZoom } = setup({ zoom: 1, min: 0.1 });
    act(() => result.current.zoomTo(0.001));
    expect(setZoom).toHaveBeenCalledWith(0.1);
  });

  it('zoomBy multiplies current zoom and clamps', () => {
    const { result, setZoom } = setup({ zoom: 2, max: 10 });
    act(() => result.current.zoomBy(100));
    expect(setZoom).toHaveBeenCalledWith(10);
  });

  it('locks zoom when min === max', () => {
    const { result, setZoom, setPan } = setup({ zoom: 1, min: 1, max: 1 });
    act(() => result.current.zoomTo(5));
    expect(setZoom).toHaveBeenCalledWith(1);
    // pan also stays put (k = 1)
    expect(setPan).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it('uses default range [0.1, 10] when min/max omitted', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.zoomTo(1000));
    expect(setZoom).toHaveBeenCalledWith(10);
    setZoom.mockClear();
    act(() => result.current.zoomTo(0.0001));
    expect(setZoom).toHaveBeenCalledWith(0.1);
  });
});

describe('useZoomInteraction — focal-point invariant', () => {
  it('zoomTo with focal keeps the world point under the focal stationary', () => {
    const zoom = 2;
    const pan = { x: 50, y: 30 };
    const focal = { x: 200, y: 150 };
    // World point under focal before:
    const wxBefore = (focal.x - pan.x) / zoom;
    const wyBefore = (focal.y - pan.y) / zoom;

    const setZoom = vi.fn();
    const setPan = vi.fn();
    const { result } = renderHook(() =>
      useZoomInteraction({
        zoom,
        setZoom,
        pan,
        setPan,
        viewport: { width: 400, height: 300 },
      }),
    );
    act(() => result.current.zoomTo(4, focal));

    const newZoom = setZoom.mock.calls[0][0] as number;
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    const wxAfter = (focal.x - newPan.x) / newZoom;
    const wyAfter = (focal.y - newPan.y) / newZoom;
    expect(wxAfter).toBeCloseTo(wxBefore, 5);
    expect(wyAfter).toBeCloseTo(wyBefore, 5);
  });

  it('zoomTo without focal uses viewport center', () => {
    const setZoom = vi.fn();
    const setPan = vi.fn();
    const viewport = { width: 400, height: 300 };
    const zoom = 1;
    const pan = { x: 0, y: 0 };
    const { result } = renderHook(() =>
      useZoomInteraction({ zoom, setZoom, pan, setPan, viewport }),
    );
    act(() => result.current.zoomTo(2));
    const newZoom = setZoom.mock.calls[0][0] as number;
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    const focal = { x: viewport.width / 2, y: viewport.height / 2 };
    expect((focal.x - newPan.x) / newZoom).toBeCloseTo((focal.x - pan.x) / zoom, 5);
    expect((focal.y - newPan.y) / newZoom).toBeCloseTo((focal.y - pan.y) / zoom, 5);
  });
});
```

- [ ] **Step 1.2: Implement the hook**

Create `src/canvas-kit/hooks/useZoomInteraction.ts`:

```ts
import { useCallback, useMemo } from 'react';

export interface UseZoomInteractionOptions {
  zoom: number;
  setZoom: (next: number) => void;
  pan: { x: number; y: number };
  setPan: (next: { x: number; y: number }) => void;
  min?: number;
  max?: number;
  wheelStep?: number;
  keyStep?: number;
  viewport?: { width: number; height: number };
  sources?: {
    wheel?: boolean;
    keys?: boolean;
    doubleClick?: boolean;
    pinch?: boolean;
  };
  wheelRequiresModifier?: boolean;
}

export interface UseZoomInteractionReturn {
  onWheel(e: WheelEvent | React.WheelEvent): void;
  onKeyDown(e: KeyboardEvent | React.KeyboardEvent): void;
  onDoubleClick(e: MouseEvent | React.MouseEvent): void;
  zoomTo(level: number, focal?: { x: number; y: number }): void;
  zoomBy(factor: number, focal?: { x: number; y: number }): void;
  reset(): void;
}

const clamp = (z: number, min: number, max: number) =>
  Math.min(max, Math.max(min, z));

export function useZoomInteraction(
  opts: UseZoomInteractionOptions,
): UseZoomInteractionReturn {
  const min = opts.min ?? 0.1;
  const max = opts.max ?? 10;
  const wheelStep = opts.wheelStep ?? 1.1;
  const keyStep = opts.keyStep ?? 1.25;

  const sources = useMemo(
    () => ({
      wheel: opts.sources?.wheel ?? true,
      keys: opts.sources?.keys ?? true,
      doubleClick: opts.sources?.doubleClick ?? false,
      pinch: opts.sources?.pinch ?? true,
    }),
    [opts.sources?.wheel, opts.sources?.keys, opts.sources?.doubleClick, opts.sources?.pinch],
  );

  const applyZoom = useCallback(
    (nextZoom: number, focal: { x: number; y: number }) => {
      const oldZoom = opts.zoom;
      const newZoom = clamp(nextZoom, min, max);
      const k = newZoom / oldZoom;
      const newPan = {
        x: focal.x - (focal.x - opts.pan.x) * k,
        y: focal.y - (focal.y - opts.pan.y) * k,
      };
      opts.setZoom(newZoom);
      opts.setPan(newPan);
    },
    [opts, min, max],
  );

  const viewportCenter = useCallback((): { x: number; y: number } => {
    if (!opts.viewport) {
      throw new Error(
        'useZoomInteraction: viewport option is required for keyboard zoom and zoomTo without focal',
      );
    }
    return { x: opts.viewport.width / 2, y: opts.viewport.height / 2 };
  }, [opts.viewport]);

  const zoomTo = useCallback(
    (level: number, focal?: { x: number; y: number }) => {
      applyZoom(level, focal ?? viewportCenter());
    },
    [applyZoom, viewportCenter],
  );

  const zoomBy = useCallback(
    (factor: number, focal?: { x: number; y: number }) => {
      applyZoom(opts.zoom * factor, focal ?? viewportCenter());
    },
    [applyZoom, opts.zoom, viewportCenter],
  );

  const reset = useCallback(() => {
    opts.setZoom(1);
    opts.setPan({ x: 0, y: 0 });
  }, [opts]);

  // Stubbed in Task 1; Tasks 3-5 implement.
  const onWheel = useCallback((_e: WheelEvent | React.WheelEvent) => {}, []);
  const onKeyDown = useCallback((_e: KeyboardEvent | React.KeyboardEvent) => {}, []);
  const onDoubleClick = useCallback((_e: MouseEvent | React.MouseEvent) => {}, []);

  // suppress "declared but unread" until we wire them
  void sources;
  void wheelStep;
  void keyStep;

  return { onWheel, onKeyDown, onDoubleClick, zoomTo, zoomBy, reset };
}
```

- [ ] **Step 1.3: Run tests + build**

```
npm test -- --run src/canvas-kit/hooks/useZoomInteraction
npm run build
```

Expected: PASS / clean.

- [ ] **Step 1.4: Commit**

```
git add src/canvas-kit/hooks/useZoomInteraction.ts src/canvas-kit/hooks/useZoomInteraction.test.ts
git commit -m "feat(canvas-kit): useZoomInteraction scaffold with clamp + focal math"
```

---

### Task 2: Wheel handler with modifier policy and pinch override

Implement `onWheel`. Tests cover: bare wheel zooms (default mode), bare
wheel no-ops in modifier-required mode, ctrlKey wheel always zooms (pinch),
sources.wheel=false disables wheel, sources.pinch=false disables pinch even
with ctrlKey.

**Files:**
- Modify: `src/canvas-kit/hooks/useZoomInteraction.ts`
- Modify: `src/canvas-kit/hooks/useZoomInteraction.test.ts`

- [ ] **Step 2.1: Append failing tests**

Append to `useZoomInteraction.test.ts`:

```ts
function makeWheelEvent(over: Partial<{
  deltaY: number; clientX: number; clientY: number;
  ctrlKey: boolean; metaKey: boolean; shiftKey: boolean;
  rect: { left: number; top: number };
}> = {}) {
  const rect = over.rect ?? { left: 0, top: 0 };
  const preventDefault = vi.fn();
  return {
    deltaY: over.deltaY ?? -100,
    clientX: over.clientX ?? 100,
    clientY: over.clientY ?? 80,
    ctrlKey: over.ctrlKey ?? false,
    metaKey: over.metaKey ?? false,
    shiftKey: over.shiftKey ?? false,
    preventDefault,
    currentTarget: {
      getBoundingClientRect: () => ({ left: rect.left, top: rect.top, right: 0, bottom: 0, width: 0, height: 0, x: rect.left, y: rect.top, toJSON: () => ({}) }),
    } as unknown as Element,
  } as unknown as WheelEvent;
}

describe('useZoomInteraction — wheel', () => {
  it('bare wheel zooms in on negative deltaY (default mode)', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100 })));
    expect(setZoom).toHaveBeenCalled();
    const next = setZoom.mock.calls[0][0] as number;
    expect(next).toBeGreaterThan(1);
  });

  it('bare wheel zooms out on positive deltaY (default mode)', () => {
    const { result, setZoom } = setup({ zoom: 2 });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: 100 })));
    const next = setZoom.mock.calls[0][0] as number;
    expect(next).toBeLessThan(2);
  });

  it('bare wheel no-ops when wheelRequiresModifier is true', () => {
    const { result, setZoom } = setup({ zoom: 1, wheelRequiresModifier: true });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100 })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('ctrl+wheel zooms even when wheelRequiresModifier is true', () => {
    const { result, setZoom } = setup({ zoom: 1, wheelRequiresModifier: true });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100, ctrlKey: true })));
    expect(setZoom).toHaveBeenCalled();
  });

  it('ctrl+wheel (pinch) zooms even in default mode', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -10, ctrlKey: true })));
    expect(setZoom).toHaveBeenCalled();
  });

  it('sources.wheel=false disables non-pinch wheel', () => {
    const { result, setZoom } = setup({ zoom: 1, sources: { wheel: false } });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -100 })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('sources.pinch=false disables ctrlKey wheel', () => {
    const { result, setZoom } = setup({
      zoom: 1,
      sources: { wheel: true, pinch: false },
    });
    act(() => result.current.onWheel(makeWheelEvent({ deltaY: -10, ctrlKey: true })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('focal is event coords minus canvas bounding rect', () => {
    const { result, setZoom, setPan } = setup({ zoom: 1, pan: { x: 0, y: 0 } });
    act(() => result.current.onWheel(makeWheelEvent({
      deltaY: -100, clientX: 250, clientY: 150,
      rect: { left: 50, top: 50 },
    })));
    // focal = (200, 100); world point under focal at zoom=1, pan=0 is (200, 100).
    // After zoom-in, that world point must still sit at screen (200, 100).
    const newZoom = setZoom.mock.calls[0][0] as number;
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    expect((200 - newPan.x) / newZoom).toBeCloseTo(200, 5);
    expect((100 - newPan.y) / newZoom).toBeCloseTo(100, 5);
  });

  it('calls preventDefault on pinch (ctrlKey wheel)', () => {
    const { result } = setup({ zoom: 1 });
    const e = makeWheelEvent({ deltaY: -10, ctrlKey: true });
    act(() => result.current.onWheel(e));
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.2: Implement `onWheel`**

Replace the stubbed `onWheel` in `useZoomInteraction.ts`:

```ts
const onWheel = useCallback(
  (e: WheelEvent | React.WheelEvent) => {
    const evt = e as WheelEvent;
    const isPinch = evt.ctrlKey === true;

    if (isPinch) {
      if (!sources.pinch) return;
      evt.preventDefault?.();
    } else {
      if (!sources.wheel) return;
      if (opts.wheelRequiresModifier && !evt.metaKey) return;
    }

    const target = evt.currentTarget as Element | null;
    const rect = target?.getBoundingClientRect?.();
    const focal = {
      x: evt.clientX - (rect?.left ?? 0),
      y: evt.clientY - (rect?.top ?? 0),
    };

    const factor = evt.deltaY < 0 ? wheelStep : 1 / wheelStep;
    applyZoom(opts.zoom * factor, focal);
  },
  [applyZoom, opts, sources, wheelStep],
);
```

Drop the `void sources;` and `void wheelStep;` lines for those identifiers
(keep `void keyStep;` for now).

- [ ] **Step 2.3: Run tests + build**

```
npm test -- --run src/canvas-kit/hooks/useZoomInteraction
npm run build
```

Expected: PASS / clean.

- [ ] **Step 2.4: Commit**

```
git add src/canvas-kit/hooks/useZoomInteraction.ts src/canvas-kit/hooks/useZoomInteraction.test.ts
git commit -m "feat(canvas-kit): useZoomInteraction wheel handler with pinch override"
```

---

### Task 3: Keyboard handler

Implement `onKeyDown`: `+`/`=` zooms in, `-`/`_` zooms out, `Cmd/Ctrl-0`
resets, all at viewport-center focal. Skip when target is editable.

**Files:**
- Modify: `src/canvas-kit/hooks/useZoomInteraction.ts`
- Modify: `src/canvas-kit/hooks/useZoomInteraction.test.ts`

- [ ] **Step 3.1: Append failing tests**

```ts
function makeKeyEvent(over: {
  key: string; metaKey?: boolean; ctrlKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}) {
  const preventDefault = vi.fn();
  return {
    key: over.key,
    metaKey: over.metaKey ?? false,
    ctrlKey: over.ctrlKey ?? false,
    target: over.target ?? { tagName: 'CANVAS', isContentEditable: false },
    preventDefault,
  } as unknown as KeyboardEvent;
}

describe('useZoomInteraction — keyboard', () => {
  it('+ key zooms in by keyStep', () => {
    const { result, setZoom } = setup({ zoom: 2, keyStep: 1.25 });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '+' })));
    expect(setZoom).toHaveBeenCalledWith(2.5);
  });

  it('= key zooms in by keyStep (Shift not required)', () => {
    const { result, setZoom } = setup({ zoom: 2, keyStep: 1.25 });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '=' })));
    expect(setZoom).toHaveBeenCalledWith(2.5);
  });

  it('- key zooms out by keyStep', () => {
    const { result, setZoom } = setup({ zoom: 2, keyStep: 1.25 });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '-' })));
    expect(setZoom).toHaveBeenCalledWith(2 / 1.25);
  });

  it('_ key zooms out by keyStep', () => {
    const { result, setZoom } = setup({ zoom: 2, keyStep: 1.25 });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '_' })));
    expect(setZoom).toHaveBeenCalledWith(2 / 1.25);
  });

  it('Cmd-0 resets zoom and pan', () => {
    const { result, setZoom, setPan } = setup({ zoom: 5, pan: { x: 100, y: 100 } });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '0', metaKey: true })));
    expect(setZoom).toHaveBeenCalledWith(1);
    expect(setPan).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it('Ctrl-0 resets zoom and pan', () => {
    const { result, setZoom, setPan } = setup({ zoom: 5, pan: { x: 100, y: 100 } });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '0', ctrlKey: true })));
    expect(setZoom).toHaveBeenCalledWith(1);
    expect(setPan).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it('plain 0 (no modifier) does not reset', () => {
    const { result, setZoom } = setup({ zoom: 5 });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '0' })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('skips when target is INPUT', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onKeyDown(makeKeyEvent({
      key: '+', target: { tagName: 'INPUT', isContentEditable: false },
    })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('skips when target is TEXTAREA', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onKeyDown(makeKeyEvent({
      key: '+', target: { tagName: 'TEXTAREA', isContentEditable: false },
    })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('skips when target is contenteditable', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onKeyDown(makeKeyEvent({
      key: '+', target: { tagName: 'DIV', isContentEditable: true },
    })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('sources.keys=false disables keyboard', () => {
    const { result, setZoom } = setup({ zoom: 1, sources: { keys: false } });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '+' })));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('focal is viewport center', () => {
    const { result, setZoom, setPan } = setup({
      zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 400, height: 300 }, keyStep: 2,
    });
    act(() => result.current.onKeyDown(makeKeyEvent({ key: '+' })));
    const newZoom = setZoom.mock.calls[0][0] as number;
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    // Focal (200, 150). World point under focal before/after must match.
    expect((200 - newPan.x) / newZoom).toBeCloseTo(200, 5);
    expect((150 - newPan.y) / newZoom).toBeCloseTo(150, 5);
  });
});
```

- [ ] **Step 3.2: Implement `onKeyDown`**

Replace the stubbed `onKeyDown`:

```ts
function isEditableTarget(t: EventTarget | null): boolean {
  if (!t) return false;
  const el = t as Partial<{ tagName: string; isContentEditable: boolean }>;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

const onKeyDown = useCallback(
  (e: KeyboardEvent | React.KeyboardEvent) => {
    if (!sources.keys) return;
    const evt = e as KeyboardEvent;
    if (isEditableTarget(evt.target)) return;

    if (evt.key === '0' && (evt.metaKey || evt.ctrlKey)) {
      opts.setZoom(1);
      opts.setPan({ x: 0, y: 0 });
      return;
    }

    let factor = 0;
    if (evt.key === '+' || evt.key === '=') factor = keyStep;
    else if (evt.key === '-' || evt.key === '_') factor = 1 / keyStep;
    if (factor === 0) return;

    applyZoom(opts.zoom * factor, viewportCenter());
  },
  [applyZoom, opts, sources, keyStep, viewportCenter],
);
```

Lift `isEditableTarget` to module scope (above the hook). Drop the
`void keyStep;` placeholder.

- [ ] **Step 3.3: Run tests + build**

```
npm test -- --run src/canvas-kit/hooks/useZoomInteraction
npm run build
```

Expected: PASS / clean.

- [ ] **Step 3.4: Commit**

```
git add src/canvas-kit/hooks/useZoomInteraction.ts src/canvas-kit/hooks/useZoomInteraction.test.ts
git commit -m "feat(canvas-kit): useZoomInteraction keyboard handler"
```

---

### Task 4: Double-click handler

`onDoubleClick`: zoom in by `keyStep` at click point; Shift zooms out; Alt
resets. Off by default — `sources.doubleClick: true` to enable.

**Files:**
- Modify: `src/canvas-kit/hooks/useZoomInteraction.ts`
- Modify: `src/canvas-kit/hooks/useZoomInteraction.test.ts`

- [ ] **Step 4.1: Append failing tests**

```ts
function makeMouseEvent(over: {
  clientX?: number; clientY?: number;
  shiftKey?: boolean; altKey?: boolean;
  rect?: { left: number; top: number };
} = {}) {
  const rect = over.rect ?? { left: 0, top: 0 };
  return {
    clientX: over.clientX ?? 100,
    clientY: over.clientY ?? 80,
    shiftKey: over.shiftKey ?? false,
    altKey: over.altKey ?? false,
    currentTarget: {
      getBoundingClientRect: () => ({ left: rect.left, top: rect.top, right: 0, bottom: 0, width: 0, height: 0, x: rect.left, y: rect.top, toJSON: () => ({}) }),
    } as unknown as Element,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent;
}

describe('useZoomInteraction — double-click', () => {
  it('off by default', () => {
    const { result, setZoom } = setup({ zoom: 1 });
    act(() => result.current.onDoubleClick(makeMouseEvent()));
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('zooms in at click point when enabled', () => {
    const { result, setZoom, setPan } = setup({
      zoom: 1, pan: { x: 0, y: 0 }, keyStep: 2,
      sources: { doubleClick: true },
    });
    act(() => result.current.onDoubleClick(makeMouseEvent({
      clientX: 220, clientY: 130, rect: { left: 20, top: 30 },
    })));
    expect(setZoom).toHaveBeenCalledWith(2);
    // Focal (200, 100). World point under focal preserved.
    const newPan = setPan.mock.calls[0][0] as { x: number; y: number };
    expect((200 - newPan.x) / 2).toBeCloseTo(200, 5);
    expect((100 - newPan.y) / 2).toBeCloseTo(100, 5);
  });

  it('Shift zooms out at click point', () => {
    const { result, setZoom } = setup({
      zoom: 4, keyStep: 2, sources: { doubleClick: true },
    });
    act(() => result.current.onDoubleClick(makeMouseEvent({ shiftKey: true })));
    expect(setZoom).toHaveBeenCalledWith(2);
  });

  it('Alt resets', () => {
    const { result, setZoom, setPan } = setup({
      zoom: 5, pan: { x: 99, y: 99 }, sources: { doubleClick: true },
    });
    act(() => result.current.onDoubleClick(makeMouseEvent({ altKey: true })));
    expect(setZoom).toHaveBeenCalledWith(1);
    expect(setPan).toHaveBeenCalledWith({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 4.2: Implement `onDoubleClick`**

Replace the stubbed `onDoubleClick`:

```ts
const onDoubleClick = useCallback(
  (e: MouseEvent | React.MouseEvent) => {
    if (!sources.doubleClick) return;
    const evt = e as MouseEvent;
    if (evt.altKey) {
      opts.setZoom(1);
      opts.setPan({ x: 0, y: 0 });
      return;
    }
    const target = evt.currentTarget as Element | null;
    const rect = target?.getBoundingClientRect?.();
    const focal = {
      x: evt.clientX - (rect?.left ?? 0),
      y: evt.clientY - (rect?.top ?? 0),
    };
    const factor = evt.shiftKey ? 1 / keyStep : keyStep;
    applyZoom(opts.zoom * factor, focal);
  },
  [applyZoom, opts, sources, keyStep],
);
```

- [ ] **Step 4.3: Run tests + build**

```
npm test -- --run src/canvas-kit/hooks/useZoomInteraction
npm run build
```

Expected: PASS / clean.

- [ ] **Step 4.4: Commit**

```
git add src/canvas-kit/hooks/useZoomInteraction.ts src/canvas-kit/hooks/useZoomInteraction.test.ts
git commit -m "feat(canvas-kit): useZoomInteraction double-click handler"
```

---

### Task 5: `reset()` direct test coverage

`reset()` was already implemented in Task 1. Add explicit unit test
asserting the contract (in case Task 4's refactor of inline reset paths
changed something).

**Files:**
- Modify: `src/canvas-kit/hooks/useZoomInteraction.test.ts`

- [ ] **Step 5.1: Append test**

```ts
describe('useZoomInteraction — reset', () => {
  it('sets zoom to 1 and pan to {0,0}', () => {
    const { result, setZoom, setPan } = setup({
      zoom: 7, pan: { x: 123, y: 456 },
    });
    act(() => result.current.reset());
    expect(setZoom).toHaveBeenCalledWith(1);
    expect(setPan).toHaveBeenCalledWith({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 5.2: Run tests**

```
npm test -- --run src/canvas-kit/hooks/useZoomInteraction
```

Expected: PASS.

- [ ] **Step 5.3: Commit**

```
git add src/canvas-kit/hooks/useZoomInteraction.test.ts
git commit -m "test(canvas-kit): explicit useZoomInteraction reset coverage"
```

---

### Task 6: Barrel export

Add the hook + types to the canvas-kit barrel.

**Files:**
- Modify: `src/canvas-kit/index.ts`

- [ ] **Step 6.1: Add export**

In `src/canvas-kit/index.ts`, after the `usePanInteraction` export
(currently `export * from './hooks/usePanInteraction';`), add:

```ts
export * from './hooks/useZoomInteraction';
```

- [ ] **Step 6.2: Run full suite + build**

```
npm test -- --run
npm run build
```

Expected: PASS / clean.

- [ ] **Step 6.3: Commit**

```
git add src/canvas-kit/index.ts
git commit -m "feat(canvas-kit): export useZoomInteraction from barrel"
```

---

### Task 7: Demo wiring (MoveDemo)

Wire `useZoomInteraction` into `MoveDemo` so users can see wheel + keyboard
+ dbl-click zoom interacting with the existing pan/move. The demo's canvas
gets `onWheel`, `onDoubleClick`; the keyboard handler is attached to the
window via `useEffect`.

**Files:**
- Modify: `src/canvas-kit-demo/demos/MoveDemo.tsx`

- [ ] **Step 7.1: Add zoom + pan state and the hook**

After the `const [rects, setRects] = useState<Rect[]>(INITIAL);` line, add:

```ts
const [zoom, setZoom] = useState(1);
const [pan, setPan] = useState({ x: 0, y: 0 });
```

Below the `const move = useMoveInteraction…` block, add:

```ts
const zoomCtl = useZoomInteraction({
  zoom, setZoom, pan, setPan,
  viewport: { width: W, height: H },
  sources: { wheel: true, keys: true, doubleClick: true, pinch: true },
});

useEffect(() => {
  const handler = (e: KeyboardEvent) => zoomCtl.onKeyDown(e);
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [zoomCtl]);
```

- [ ] **Step 7.2: Apply transform during render**

In the `useEffect` that draws the canvas, wrap the existing `runLayers`
call with a save/transform/restore so zoom and pan apply to all layers.
Replace:

```ts
runLayers(ctx, [gridLayer, baseLayer, ghostLayer], undefined, {});
```

with:

```ts
ctx.save();
ctx.translate(pan.x, pan.y);
ctx.scale(zoom, zoom);
runLayers(ctx, [gridLayer, baseLayer, ghostLayer], undefined, {});
ctx.restore();
```

Add `zoom` and `pan` to the effect's dependency list (after `overlay`).

- [ ] **Step 7.3: Wire wheel + dblclick onto the canvas**

Update the imports at the top:

```ts
import { useMoveInteraction, snap, gridSnapStrategy, createGridLayer, runLayers, useZoomInteraction } from '@/canvas-kit';
```

In the returned JSX, add to the `<canvas>` props:

```tsx
onWheel={(e) => zoomCtl.onWheel(e)}
onDoubleClick={(e) => zoomCtl.onDoubleClick(e)}
```

- [ ] **Step 7.4: Account for zoom in pointer→world conversion**

The existing `clientToCanvas(e.currentTarget, e.clientX, e.clientY)` does
not know about zoom/pan. Update its callers in this file to translate the
canvas-local coords to world coords:

```ts
const [cx, cy] = clientToCanvas(e.currentTarget, e.clientX, e.clientY);
const wx = (cx - pan.x) / zoom;
const wy = (cy - pan.y) / zoom;
```

Apply this in `onPointerDown` and `onPointerMove` (replacing the existing
two calls). Pass `wx`, `wy` where the previous code passed the
`clientToCanvas` result.

- [ ] **Step 7.5: Run tests + build + visual check**

```
npm test -- --run
npm run build
```

Expected: PASS / clean. Then start the demo and verify:

```
npm run dev
```

In the browser, navigate to MoveDemo. Verify: wheel zooms toward cursor,
`+`/`-` zoom toward viewport center, dbl-click zooms toward click point,
Cmd-0 resets, drag-move still works at non-1 zoom.

- [ ] **Step 7.6: Commit**

```
git add src/canvas-kit-demo/demos/MoveDemo.tsx
git commit -m "feat(canvas-kit-demo): wire useZoomInteraction into MoveDemo"
```

---

### Task 8: Docs

Document `useZoomInteraction` alongside the other hooks.

**Files:**
- Modify: `docs/canvas-kit/hooks.md`

- [ ] **Step 8.1: Append a section**

At the end of `docs/canvas-kit/hooks.md`, append:

```markdown
## useZoomInteraction

Stateless coordinator that owns clamp policy + focal-point dispatch across
wheel, keyboard, double-click, and trackpad pinch. Mirrors
`usePanInteraction` in shape: the caller owns `useState` for `zoom` and
`pan`; the hook returns handlers wired onto the canvas.

```ts
const [zoom, setZoom] = useState(1);
const [pan, setPan] = useState({ x: 0, y: 0 });

const zoomCtl = useZoomInteraction({
  zoom, setZoom, pan, setPan,
  viewport: { width: 800, height: 600 },
  min: 0.1, max: 10,            // defaults shown
  sources: {
    wheel: true,                 // default
    keys: true,                  // default ('+', '=', '-', '_', Cmd/Ctrl-0)
    doubleClick: false,          // default — opt in for click-to-zoom
    pinch: true,                 // default — macOS trackpad pinch
  },
  // wheelRequiresModifier: false (default). Set true for Figma-style
  // bare-wheel-pans, modifier-wheel-zooms.
});

return (
  <canvas
    onWheel={(e) => zoomCtl.onWheel(e)}
    onDoubleClick={(e) => zoomCtl.onDoubleClick(e)}
    // attach onKeyDown to window in a useEffect — most apps want canvas-zoom
    // keys to work regardless of canvas focus.
  />
);
```

### Composition

`useAutoCenter` writes initial zoom/pan once. `usePanInteraction` updates
pan only. `useZoomInteraction` updates both (focal-aware zoom moves pan to
keep the world point under the cursor stationary).

### Imperative

```ts
zoomCtl.zoomTo(2);                         // viewport center
zoomCtl.zoomTo(2, { x: 100, y: 50 });      // arbitrary focal
zoomCtl.zoomBy(1.25);
zoomCtl.reset();                           // zoom = 1, pan = {0, 0}
```

### Pinch / modifier policy

macOS trackpad pinch arrives as a `WheelEvent` with `ctrlKey: true`. The
hook treats `wheel + ctrlKey` as zoom unconditionally so trackpad pinch
works without per-app event sniffing. `sources.pinch = false` disables it.

`wheelRequiresModifier = true` switches to Figma-style: bare wheel is
ignored (the consumer pans with it); only modifier+wheel zooms. Pinch
still works.
```

- [ ] **Step 8.2: Run build + lint**

```
npm run build
```

Expected: clean.

- [ ] **Step 8.3: Commit**

```
git add docs/canvas-kit/hooks.md
git commit -m "docs(canvas-kit): document useZoomInteraction"
```

---

## Self-review checklist

- Every step ships a complete code block (no "configure as needed").
- Hook signature in plan matches the spec exactly.
- Focal-point formula identical in spec, Task 1 implementation, and demo
  notes.
- Source defaults consistent: `wheel=true, keys=true, doubleClick=false,
  pinch=true` everywhere.
- Default range `[0.1, 10]` consistent.
- Tests cover: clamp (both ends, and locked min===max), focal invariant
  per source, source gating, pinch override, editable-target sniff, reset.
