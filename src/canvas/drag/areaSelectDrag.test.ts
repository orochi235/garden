import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  createAreaSelectDrag,
  AREA_SELECT_DRAG_KIND,
  type AreaSelectPutative,
} from './areaSelectDrag';

interface CtxCall { fn: string; args: unknown[] }

function fakeCtx() {
  const calls: CtxCall[] = [];
  const ctx = {
    save: () => calls.push({ fn: 'save', args: [] }),
    restore: () => calls.push({ fn: 'restore', args: [] }),
    fillRect: (...args: unknown[]) => calls.push({ fn: 'fillRect', args }),
    strokeRect: (...args: unknown[]) => calls.push({ fn: 'strokeRect', args }),
    setLineDash: (...args: unknown[]) => calls.push({ fn: 'setLineDash', args }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('areaSelectDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('exposes the expected kind constant', () => {
    const drag = createAreaSelectDrag();
    expect(drag.kind).toBe(AREA_SELECT_DRAG_KIND);
    expect(AREA_SELECT_DRAG_KIND).toBe('eric-area-select');
  });

  it('compute returns null for a zero-extent (start === current) input', () => {
    const drag = createAreaSelectDrag();
    expect(
      drag.compute({
        start: { x: 5, y: 5 },
        current: { x: 5, y: 5 },
        shiftHeld: false,
      }),
    ).toBeNull();
  });

  it('compute echoes a populated input into a putative', () => {
    const drag = createAreaSelectDrag();
    const out = drag.compute({
      start: { x: 1, y: 2 },
      current: { x: 7, y: 9 },
      shiftHeld: true,
    });
    expect(out).toEqual({
      start: { x: 1, y: 2 },
      current: { x: 7, y: 9 },
      shiftHeld: true,
    });
  });

  it('renderPreview draws fill + stroke at the rect bounds', () => {
    const drag = createAreaSelectDrag();
    const { ctx, calls } = fakeCtx();
    const putative: AreaSelectPutative = {
      start: { x: 2, y: 3 },
      current: { x: 12, y: 8 },
      shiftHeld: false,
    };
    drag.renderPreview(ctx, putative, { x: 0, y: 0, scale: 50 });
    const filled = calls.find((c) => c.fn === 'fillRect');
    const stroked = calls.find((c) => c.fn === 'strokeRect');
    expect(filled?.args).toEqual([2, 3, 10, 5]);
    expect(stroked?.args).toEqual([2, 3, 10, 5]);
  });

  it('renderPreview handles inverted rects (current above-and-left of start)', () => {
    const drag = createAreaSelectDrag();
    const { ctx, calls } = fakeCtx();
    const putative: AreaSelectPutative = {
      start: { x: 10, y: 10 },
      current: { x: 4, y: 2 },
      shiftHeld: false,
    };
    drag.renderPreview(ctx, putative, { x: 0, y: 0, scale: 50 });
    const filled = calls.find((c) => c.fn === 'fillRect');
    const stroked = calls.find((c) => c.fn === 'strokeRect');
    // Math.min for origin, Math.abs for size.
    expect(filled?.args).toEqual([4, 2, 6, 8]);
    expect(stroked?.args).toEqual([4, 2, 6, 8]);
  });

  it('renderPreview is a no-op for a zero-area rect (degenerate width or height)', () => {
    const drag = createAreaSelectDrag();
    const { ctx, calls } = fakeCtx();
    drag.renderPreview(
      ctx,
      { start: { x: 5, y: 5 }, current: { x: 5, y: 12 }, shiftHeld: false },
      { x: 0, y: 0, scale: 50 },
    );
    expect(calls.find((c) => c.fn === 'fillRect')).toBeUndefined();
    expect(calls.find((c) => c.fn === 'strokeRect')).toBeUndefined();
  });

  it('renderPreview scales stroke width inversely with view.scale', () => {
    const drag = createAreaSelectDrag();
    const { ctx } = fakeCtx();
    const putative: AreaSelectPutative = {
      start: { x: 0, y: 0 },
      current: { x: 5, y: 5 },
      shiftHeld: false,
    };
    drag.renderPreview(ctx, putative, { x: 0, y: 0, scale: 50 });
    // 1 / 50 = 0.02
    expect((ctx as unknown as { lineWidth: number }).lineWidth).toBeCloseTo(0.02);
  });

  it('commit is a no-op (selection commit lives in useAreaSelect.end)', () => {
    const drag = createAreaSelectDrag();
    const beforeGarden = useGardenStore.getState().garden;
    const beforeSel = useUiStore.getState().selectedIds;
    drag.commit({
      start: { x: 0, y: 0 },
      current: { x: 5, y: 5 },
      shiftHeld: false,
    });
    expect(useGardenStore.getState().garden).toBe(beforeGarden);
    expect(useUiStore.getState().selectedIds).toBe(beforeSel);
  });

  it('read returns a default-shaped input (controller-unused)', () => {
    const drag = createAreaSelectDrag();
    const out = drag.read(
      { clientX: 0, clientY: 0, modifiers: { shift: false, alt: false, ctrl: false, meta: false } },
      { container: document.createElement('div'), view: { x: 0, y: 0, scale: 1 } },
    );
    expect(out).toEqual({
      start: { x: 0, y: 0 },
      current: { x: 0, y: 0 },
      shiftHeld: false,
    });
  });
});
